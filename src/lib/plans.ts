/**
 * Plans shown on /pricing/ (rendered at build time). Display prices are config
 * (VITE_PRICE_*_LABEL in .env files), not hard-coded; the Stripe price ids live
 * server-side (functions STRIPE_PRICE_*).
 */

export interface PlanInfo {
  id: 'monthly' | 'annual' | 'lifetime';
  name: string;
  price: string;
  period: string;
  note: string;
  highlight?: string;
}

export const plans = (env: Record<string, string | undefined> = {}): PlanInfo[] => [
  { id: 'monthly', name: 'Monthly', price: env.VITE_PRICE_MONTHLY_LABEL ?? '$12', period: 'per month', note: 'Cancel any time.' },
  {
    id: 'annual',
    name: 'Annual',
    price: env.VITE_PRICE_ANNUAL_LABEL ?? '$79',
    period: 'per year',
    note: 'Billed once a year. Cancel any time.',
    highlight: 'Best value',
  },
  { id: 'lifetime', name: 'Lifetime', price: env.VITE_PRICE_LIFETIME_LABEL ?? '$199', period: 'one payment', note: 'Pay once, keep access for good.' },
];

export const PREMIUM_FEATURES = [
  'Every lesson in all 14 modules',
  'Flashcard mode for spaced practice',
  'Guided projects with real datasets',
  'A verifiable certificate',
  '30 AI tutor hints a day',
];
