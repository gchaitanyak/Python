import { defineSecret, defineString } from 'firebase-functions/params';
import Stripe from 'stripe';
import type { Plan } from './entitlement';

/** Secrets: `firebase functions:secrets:set …` in production; functions/.secret.local in the emulator. */
export const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
export const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');

/** Price ids are config, not code (SPEC §7). Set them in functions/.env.<projectId>. */
const PRICE_IDS: Record<Plan, ReturnType<typeof defineString>> = {
  monthly: defineString('STRIPE_PRICE_MONTHLY', { default: 'price_monthly_unset' }),
  annual: defineString('STRIPE_PRICE_ANNUAL', { default: 'price_annual_unset' }),
  lifetime: defineString('STRIPE_PRICE_LIFETIME', { default: 'price_lifetime_unset' }),
};
export const priceFor = (plan: Plan): string => PRICE_IDS[plan].value();

/** Comma-separated site origins allowed in Checkout/Portal return URLs; the first is the default. */
export const APP_ORIGINS = defineString('APP_ORIGINS', { default: 'http://127.0.0.1:5173,http://localhost:5173' });
export const appOrigins = (): string[] => APP_ORIGINS.value().split(',').map((s) => s.trim()).filter(Boolean);

/** Empty in production. Tests point it at the local fake Stripe (scripts/fake-stripe.ts). */
export const STRIPE_API_BASE = defineString('STRIPE_API_BASE', { default: '' });

let client: Stripe | undefined;

export function stripe(): Stripe {
  if (client) return client;
  const base = STRIPE_API_BASE.value();
  if (base) {
    const url = new URL(base);
    client = new Stripe(STRIPE_SECRET_KEY.value(), {
      host: url.hostname,
      port: url.port,
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      maxNetworkRetries: 0,
    });
  } else {
    client = new Stripe(STRIPE_SECRET_KEY.value(), { maxNetworkRetries: 2 });
  }
  return client;
}
