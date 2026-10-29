import { describe, expect, it } from 'vitest';
import { entitlementFromSubscription, isPlan, keepsLifetime, RENEWAL_GRACE_MS, safeOrigin, subscriptionState } from '../../functions/src/lib/entitlement';

const now = Date.parse('2026-11-01T12:00:00Z');
const end = Date.parse('2026-12-01T12:00:00Z');
const sub = (over: Partial<Parameters<typeof entitlementFromSubscription>[0]> = {}) => ({
  status: 'active',
  cancelAtPeriodEnd: false,
  periodEndMs: end,
  cancelAtMs: null,
  ...over,
});

describe('entitlementFromSubscription (SPEC §7)', () => {
  it('gives premium for active subscriptions, with renewal grace', () => {
    expect(entitlementFromSubscription(sub(), now)).toEqual({ entitlement: 'premium', premiumUntilMs: end + RENEWAL_GRACE_MS, subscriptionStatus: 'active', cancelAtPeriodEnd: false });
    expect(entitlementFromSubscription(sub({ status: 'trialing' }), now).entitlement).toBe('premium');
    expect(entitlementFromSubscription(sub({ status: 'past_due' }), now).entitlement).toBe('premium');
  });

  it('keeps access exactly until the period ends when cancelling at period end', () => {
    expect(entitlementFromSubscription(sub({ cancelAtPeriodEnd: true }), now)).toEqual({
      entitlement: 'premium',
      premiumUntilMs: end,
      subscriptionStatus: 'active',
      cancelAtPeriodEnd: true,
    });
    const at = end - 5 * 86_400_000;
    expect(entitlementFromSubscription(sub({ cancelAtMs: at }), now).premiumUntilMs).toBe(at);
  });

  it('ends access for cancelled or unpaid subscriptions', () => {
    for (const status of ['canceled', 'unpaid', 'incomplete_expired', 'incomplete']) {
      expect(entitlementFromSubscription(sub({ status }), now)).toMatchObject({ entitlement: 'free', premiumUntilMs: now });
    }
  });
});

describe('subscriptionState', () => {
  it('reads the period end from subscription items (current API) or the subscription (older)', () => {
    expect(subscriptionState({ status: 'active', items: { data: [{ current_period_end: 1_800_000_000 }] } }).periodEndMs).toBe(1_800_000_000_000);
    expect(subscriptionState({ status: 'active', current_period_end: 1_700_000_000 }).periodEndMs).toBe(1_700_000_000_000);
    expect(subscriptionState({ status: 'active', cancel_at_period_end: true, cancel_at: 1_750_000_000 })).toMatchObject({
      cancelAtPeriodEnd: true,
      cancelAtMs: 1_750_000_000_000,
      periodEndMs: null,
    });
  });
});

describe('helpers', () => {
  it('validates plans, lifetime and origins', () => {
    expect(isPlan('annual')).toBe(true);
    expect(isPlan('weekly')).toBe(false);
    expect(keepsLifetime({ entitlementSource: 'lifetime' })).toBe(true);
    expect(keepsLifetime({ entitlementSource: 'stripe' })).toBe(false);
    const allowed = ['https://pyex.example', 'http://127.0.0.1:5173'];
    expect(safeOrigin('http://127.0.0.1:5173', allowed)).toBe('http://127.0.0.1:5173');
    expect(safeOrigin('https://evil.example', allowed)).toBe('https://pyex.example');
    expect(safeOrigin(undefined, allowed)).toBe('https://pyex.example');
  });
});
