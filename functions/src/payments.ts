import type { DocumentData } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v2';
import type Stripe from 'stripe';
import { db, rateLimit, requireUid, Timestamp, userIsPremium, userRef } from './lib/admin';
import { now as clockNow } from './lib/clock';
import { entitlementFromSubscription, isPlan, keepsLifetime, safeOrigin, subscriptionState } from './lib/entitlement';
import { appOrigins, priceFor, stripe, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET } from './lib/stripe';

const secrets = [STRIPE_SECRET_KEY];

/** The Stripe customer for a user, created on first use and remembered on their profile. */
async function ensureCustomer(uid: string, email: string | undefined, user: DocumentData | undefined): Promise<string> {
  if (typeof user?.stripeCustomerId === 'string') return user.stripeCustomerId;
  const customer = await stripe().customers.create({ email, metadata: { uid } });
  await userRef(uid).set({ stripeCustomerId: customer.id }, { merge: true });
  return customer.id;
}

/**
 * Starts Stripe Checkout for a plan (SPEC §7). Monthly and annual are
 * subscriptions; lifetime is a one-off payment. Promotion codes are enabled.
 */
export const createCheckoutSession = onCall({ secrets }, async (request) => {
  const uid = requireUid(request);
  const plan = (request.data as { plan?: unknown } | null)?.plan;
  if (!isPlan(plan)) throw new HttpsError('invalid-argument', 'Choose monthly, annual or lifetime.');
  await rateLimit(uid, 'createCheckoutSession', 10);

  const user = (await userRef(uid).get()).data();
  if (keepsLifetime(user)) throw new HttpsError('failed-precondition', 'You already have lifetime access.');
  if (plan !== 'lifetime' && user?.stripeSubscriptionId && userIsPremium(user, Date.now())) {
    throw new HttpsError('failed-precondition', 'You already have a subscription. Manage it from your account page.');
  }

  const origin = safeOrigin(request.rawRequest.headers.origin, appOrigins());
  const customer = await ensureCustomer(uid, request.auth?.token.email, user);
  const session = await stripe().checkout.sessions.create({
    mode: plan === 'lifetime' ? 'payment' : 'subscription',
    customer,
    client_reference_id: uid,
    line_items: [{ price: priceFor(plan), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/account/?checkout=success`,
    cancel_url: `${origin}/pricing/?checkout=cancelled`,
    metadata: { uid, plan },
    ...(plan === 'lifetime' ? {} : { subscription_data: { metadata: { uid, plan } } }),
  });
  if (!session.url) throw new HttpsError('internal', 'Stripe did not return a checkout page.');
  return { url: session.url };
});

/** Opens the Stripe Customer Portal: cancel, cancel at period end, update card, invoices. */
export const createPortalSession = onCall({ secrets }, async (request) => {
  const uid = requireUid(request);
  await rateLimit(uid, 'createPortalSession', 10);
  const customer = (await userRef(uid).get()).data()?.stripeCustomerId;
  if (typeof customer !== 'string') throw new HttpsError('failed-precondition', 'There is no subscription to manage yet.');
  const origin = safeOrigin(request.rawRequest.headers.origin, appOrigins());
  const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/account/` });
  return { url: session.url };
});

/* ---------- webhook ---------- */

async function uidForCustomer(customerId: string): Promise<string | undefined> {
  const snap = await db.collection('users').where('stripeCustomerId', '==', customerId).limit(1).get();
  return snap.docs[0]?.id;
}

const customerId = (c: string | { id: string } | null | undefined) => (typeof c === 'string' ? c : c?.id);

/** Applies the latest state of a subscription (fetched fresh, so out-of-order events can't regress it). */
async function applySubscription(subscriptionId: string, hintUid?: string): Promise<void> {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  const uid = hintUid ?? sub.metadata?.uid ?? (await uidForCustomer(customerId(sub.customer) ?? ''));
  if (!uid) return logger.warn('No user for subscription', { subscriptionId });
  const nowMs = (await clockNow()).getTime();
  const update = entitlementFromSubscription(subscriptionState(sub), nowMs);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef(uid));
    // Deleted accounts stay deleted; lifetime access is never downgraded.
    if (!snap.exists || keepsLifetime(snap.data())) return;
    const user = snap.data();
    // A group seat (SPEC §5.7) keeps premium once the learner's own subscription ends.
    const seat = update.entitlement === 'free' && typeof user?.groupPremium === 'string';
    tx.set(
      userRef(uid),
      {
        entitlement: seat ? 'premium' : update.entitlement,
        entitlementSource: seat ? 'group' : 'stripe',
        premiumUntil: seat || update.premiumUntilMs == null ? null : Timestamp.fromMillis(update.premiumUntilMs),
        stripeCustomerId: customerId(sub.customer),
        stripeSubscriptionId: sub.id,
        subscriptionStatus: update.subscriptionStatus,
        cancelAtPeriodEnd: update.cancelAtPeriodEnd,
        plan: sub.metadata?.plan ?? user?.plan ?? null,
      },
      { merge: true },
    );
  });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const uid = session.client_reference_id ?? session.metadata?.uid;
      if (!uid) return;
      if (session.mode === 'payment' && session.metadata?.plan === 'lifetime' && session.payment_status === 'paid') {
        await userRef(uid).set(
          {
            entitlement: 'premium',
            entitlementSource: 'lifetime',
            premiumUntil: null,
            plan: 'lifetime',
            stripeCustomerId: customerId(session.customer) ?? null,
          },
          { merge: true },
        );
      } else if (session.mode === 'subscription' && session.subscription) {
        await applySubscription(typeof session.subscription === 'string' ? session.subscription : session.subscription.id, uid);
      }
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      return applySubscription(event.data.object.id);
    case 'invoice.payment_failed':
    case 'invoice.paid': {
      const uid = await uidForCustomer(customerId(event.data.object.customer) ?? '');
      if (uid) await userRef(uid).set({ paymentIssue: event.type === 'invoice.payment_failed' }, { merge: true });
      return;
    }
    default:
      return;
  }
}

/**
 * Stripe webhook (SPEC §7). Verifies the signature, ignores repeats of the same
 * event, and updates the user's entitlement.
 */
export const stripeWebhook = onRequest({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET] }, async (req, res) => {
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'] as string, STRIPE_WEBHOOK_SECRET.value());
  } catch (err) {
    logger.warn('Rejected webhook', { error: (err as Error).message });
    res.status(400).send('Invalid signature');
    return;
  }
  try {
    await db.collection('stripeEvents').doc(event.id).create({ type: event.type, receivedAt: Timestamp.now() });
  } catch (err) {
    if ((err as { code?: number }).code === 6) {
      res.json({ received: true, duplicate: true });
      return;
    }
    throw err;
  }
  try {
    await handleEvent(event);
    res.json({ received: true });
  } catch (err) {
    // Let Stripe retry: forget the event so the retry isn't treated as a duplicate.
    await db.collection('stripeEvents').doc(event.id).delete();
    logger.error('Webhook handling failed', { type: event.type, error: (err as Error).message });
    res.status(500).send('Webhook handling failed');
  }
});
