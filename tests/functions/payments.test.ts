import type { Server } from 'node:http';
import { doc, getDoc } from 'firebase/firestore';
import Stripe from 'stripe';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { FAKE_WEBHOOK_SECRET, startFakeStripe } from '../../scripts/fake-stripe';
import { errorCode, newUser, read } from './helpers';

const WEBHOOK = 'http://127.0.0.1:5001/demo-python-exercises/us-central1/stripeWebhook';
let fake: Server;

beforeAll(async () => {
  fake = await startFakeStripe();
});

afterAll(() => {
  fake.close();
});

/** Presses a button on a fake Stripe page (form POST) without following the redirect. */
const press = (url: string) => fetch(url, { method: 'POST', redirect: 'manual' });

async function until<T>(get: () => Promise<T>, ok: (v: T) => boolean, ms = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await get();
    if (ok(v) || Date.now() - start > ms) return v;
    await new Promise((r) => setTimeout(r, 200));
  }
}

const canReadPremium = async (u: Awaited<ReturnType<typeof newUser>>) =>
  getDoc(doc(u.db, 'lessonContent/py-comparison-logical')).then(
    () => true,
    () => false,
  );

describe('subscriptions (SPEC acceptance 4)', () => {
  it('a test payment flips the user to premium within 10 s via the webhook; cancel at period end keeps access until it ends', async () => {
    const u = await newUser();
    expect(await canReadPremium(u)).toBe(false);

    const { url } = await u.call<{ url: string }>('createCheckoutSession', { plan: 'monthly' });
    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:12111\/checkout\/cs_test_/);
    expect((await read(`users/${u.uid}`))?.stripeCustomerId).toMatch(/^cus_/);

    const paidAt = Date.now();
    const pay = await press(`${url}/pay`);
    expect(pay.status).toBe(303);
    expect(pay.headers.get('location')).toBe('http://127.0.0.1:5173/account/?checkout=success');
    const user = await until(() => read(`users/${u.uid}`), (d) => d?.entitlement === 'premium');
    expect(Date.now() - paidAt).toBeLessThan(10_000);
    expect(user).toMatchObject({ entitlement: 'premium', entitlementSource: 'stripe', subscriptionStatus: 'active', cancelAtPeriodEnd: false, plan: 'monthly' });
    const renewsUntil = (user!.premiumUntil as { toMillis(): number }).toMillis();
    expect(renewsUntil).toBeGreaterThan(Date.now() + 30 * 86_400_000); // period end + renewal grace
    expect(await canReadPremium(u)).toBe(true);

    // Customer Portal: cancel at period end → still premium, until exactly the period end.
    const portal = await u.call<{ url: string }>('createPortalSession');
    const html = await (await fetch(portal.url)).text();
    const subId = /cancel-at-period-end\/(sub_\w+)/.exec(html)![1];
    await press(`${portal.url}/cancel-at-period-end/${subId}`);
    const cancelling = await until(() => read(`users/${u.uid}`), (d) => d?.cancelAtPeriodEnd === true);
    expect(cancelling).toMatchObject({ entitlement: 'premium', cancelAtPeriodEnd: true });
    const until_ = (cancelling!.premiumUntil as { toMillis(): number }).toMillis();
    expect(until_).toBeLessThan(renewsUntil);
    expect(until_).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(await canReadPremium(u)).toBe(true);

    // Period ends (subscription deleted) → back to free, paywall closes.
    await press(`${portal.url}/end-now/${subId}`);
    await until(() => read(`users/${u.uid}`), (d) => d?.entitlement === 'free');
    expect(await read(`users/${u.uid}`)).toMatchObject({ entitlement: 'free', subscriptionStatus: 'canceled' });
    expect(await canReadPremium(u)).toBe(false);
  });

  it('refuses a second subscription and bad plans; portal needs a customer', async () => {
    const u = await newUser();
    expect(await errorCode(u.call('createCheckoutSession', { plan: 'weekly' }))).toBe('functions/invalid-argument');
    expect(await errorCode(u.call('createPortalSession'))).toBe('functions/failed-precondition');
    const { url } = await u.call<{ url: string }>('createCheckoutSession', { plan: 'annual' });
    await press(`${url}/pay`);
    const user = await until(() => read(`users/${u.uid}`), (d) => d?.entitlement === 'premium');
    expect((user!.premiumUntil as { toMillis(): number }).toMillis()).toBeGreaterThan(Date.now() + 364 * 86_400_000);
    expect(await errorCode(u.call('createCheckoutSession', { plan: 'monthly' }))).toBe('functions/failed-precondition');
  });
});

describe('lifetime', () => {
  it('a one-off payment gives premium with no end date, and subscription events never remove it', async () => {
    const u = await newUser();
    const { url } = await u.call<{ url: string }>('createCheckoutSession', { plan: 'lifetime' });
    await press(`${url}/pay`);
    const user = await until(() => read(`users/${u.uid}`), (d) => d?.entitlement === 'premium');
    expect(user).toMatchObject({ entitlement: 'premium', entitlementSource: 'lifetime', premiumUntil: null, plan: 'lifetime' });
    expect(await canReadPremium(u)).toBe(true);
    expect(await errorCode(u.call('createCheckoutSession', { plan: 'lifetime' }))).toBe('functions/failed-precondition');
  });
});

describe('stripeWebhook', () => {
  const stripe = new Stripe('sk_test_unused');
  const event = (id: string) =>
    JSON.stringify({ id, object: 'event', type: 'ping.unhandled', api_version: '2026-09-30.endive', created: 0, livemode: false, data: { object: {} } });

  it('rejects unsigned or wrongly signed requests', async () => {
    const payload = event('evt_bad_sig');
    const wrong = stripe.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
    expect((await fetch(WEBHOOK, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json', 'Stripe-Signature': wrong } })).status).toBe(400);
    expect((await fetch(WEBHOOK, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' } })).status).toBe(400);
  });

  it('accepts a signed event once and ignores repeats', async () => {
    const payload = event(`evt_dup_${Date.now()}`);
    const send = () =>
      fetch(WEBHOOK, {
        method: 'POST',
        body: payload,
        headers: { 'Content-Type': 'application/json', 'Stripe-Signature': stripe.webhooks.generateTestHeaderString({ payload, secret: FAKE_WEBHOOK_SECRET }) },
      }).then((r) => r.json());
    expect(await send()).toEqual({ received: true });
    expect(await send()).toEqual({ received: true, duplicate: true });
  });
});
