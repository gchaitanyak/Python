/**
 * Pure rules for turning Stripe state into a user's entitlement (SPEC §7).
 * Unit-tested in tests/unit/entitlement.test.ts.
 */
export type Plan = 'monthly' | 'annual' | 'lifetime';
export const PLANS: Plan[] = ['monthly', 'annual', 'lifetime'];
export const isPlan = (p: unknown): p is Plan => typeof p === 'string' && (PLANS as string[]).includes(p);

/** Grace after a renewing subscription's period end, so a late renewal webhook doesn't cut access. */
export const RENEWAL_GRACE_MS = 3 * 86_400_000;

/** Stripe statuses that keep premium access (past_due: Stripe is still retrying the payment). */
const ACTIVE = new Set(['active', 'trialing', 'past_due']);

export interface SubscriptionState {
  status: string;
  cancelAtPeriodEnd: boolean;
  /** End of the paid period, ms. */
  periodEndMs: number | null;
  /** A scheduled cancellation time, ms (Stripe `cancel_at`). */
  cancelAtMs: number | null;
}

export interface EntitlementUpdate {
  entitlement: 'premium' | 'free';
  premiumUntilMs: number | null;
  subscriptionStatus: string;
  cancelAtPeriodEnd: boolean;
}

/**
 * Premium while the subscription is active. A subscription set to cancel keeps
 * access exactly until its period ends; a renewing one gets a short grace
 * period that the next renewal webhook extends.
 */
export function entitlementFromSubscription(sub: SubscriptionState, nowMs: number): EntitlementUpdate {
  const ending = sub.cancelAtPeriodEnd || sub.cancelAtMs != null;
  if (!ACTIVE.has(sub.status)) {
    return { entitlement: 'free', premiumUntilMs: nowMs, subscriptionStatus: sub.status, cancelAtPeriodEnd: false };
  }
  const end = sub.cancelAtMs ?? sub.periodEndMs;
  const premiumUntilMs = end == null ? null : ending ? end : end + RENEWAL_GRACE_MS;
  return { entitlement: 'premium', premiumUntilMs, subscriptionStatus: sub.status, cancelAtPeriodEnd: ending };
}

/** Reads the fields we need from a Stripe Subscription object (period end lives on items in current API versions). */
export function subscriptionState(sub: {
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
  current_period_end?: number | null;
  items?: { data?: { current_period_end?: number | null }[] };
}): SubscriptionState {
  const itemEnds = (sub.items?.data ?? []).map((i) => i.current_period_end).filter((n): n is number => typeof n === 'number');
  const periodEnd = itemEnds.length ? Math.max(...itemEnds) : (sub.current_period_end ?? null);
  return {
    status: sub.status,
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    periodEndMs: periodEnd == null ? null : periodEnd * 1000,
    cancelAtMs: sub.cancel_at == null ? null : sub.cancel_at * 1000,
  };
}

/** Lifetime access is never taken away by subscription events. */
export const keepsLifetime = (user: { entitlementSource?: string } | undefined): boolean => user?.entitlementSource === 'lifetime';

/** Return URLs only ever point at our own site. */
export function safeOrigin(origin: unknown, allowed: string[]): string {
  return typeof origin === 'string' && allowed.includes(origin) ? origin : allowed[0]!;
}
