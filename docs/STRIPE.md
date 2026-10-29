# Stripe setup and the real test-mode check

The build environment can't reach Stripe, so the automated tests run the payment flow against a local fake (`scripts/fake-stripe.ts`). That fake drives the real webhook handler with properly signed Stripe events. **Before launch, run the same flow against real Stripe test mode with the steps below.**

## 1. Create products and prices (Stripe Dashboard, test mode)

| Plan | Product | Price |
|---|---|---|
| Monthly | Python Exercises Premium | Recurring, monthly |
| Annual | Python Exercises Premium | Recurring, yearly |
| Lifetime | Python Exercises Lifetime | One-time |

Copy the three `price_…` ids.

## 2. Customer Portal

Dashboard → Settings → Billing → Customer portal. Turn on: cancel subscriptions (choose **at end of billing period**, and/or immediately), update payment methods, invoice history. Save.

## 3. Function configuration

Prices and allowed site origins are params (not secrets). Create `functions/.env.<your-project-id>`:

```
STRIPE_PRICE_MONTHLY=price_...
STRIPE_PRICE_ANNUAL=price_...
STRIPE_PRICE_LIFETIME=price_...
APP_ORIGINS=https://your-domain.example,https://your-project.web.app
```

Secrets (stored in Secret Manager, never in the repo):

```bash
firebase functions:secrets:set STRIPE_SECRET_KEY      # sk_test_… (later sk_live_…)
firebase functions:secrets:set STRIPE_WEBHOOK_SECRET  # whsec_… from step 4
```

Display prices on `/pricing/` come from `VITE_PRICE_MONTHLY_LABEL`, `VITE_PRICE_ANNUAL_LABEL` and `VITE_PRICE_LIFETIME_LABEL` (see `.env.example`).

## 4. Webhook endpoint

Dashboard → Developers → Webhooks → Add endpoint:
`https://us-central1-<project-id>.cloudfunctions.net/stripeWebhook`

Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.paid`. Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.

## 5. Local check with the Stripe CLI (SPEC acceptance 4)

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run `stripe login`.
2. Forward events to the emulator, and note the `whsec_…` it prints:
   ```bash
   stripe listen --forward-to http://127.0.0.1:5001/demo-python-exercises/us-central1/stripeWebhook
   ```
3. Point the emulator at real Stripe:
   - `functions/.secret.local`: your `STRIPE_SECRET_KEY=sk_test_…` and the `STRIPE_WEBHOOK_SECRET=whsec_…` from step 2.
   - `functions/.env.local`: delete the `STRIPE_API_BASE` line and add the three `STRIPE_PRICE_…` ids.
4. `npm run dev` (the local fake still starts, but nothing talks to it), then open http://127.0.0.1:5173.
5. Register → **Pricing** → **Choose monthly** → pay with card `4242 4242 4242 4242`, any future date, any CVC.
6. Check:
   - [ ] Back on **Account**, "You're premium now!" appears within 10 s; a premium lesson (e.g. *Comparison and Logical Operators*) opens.
   - [ ] **Manage subscription** → cancel at the end of the period → back on **Account**: "Premium until <date>. Your subscription won't renew." The lesson still opens.
   - [ ] In the Dashboard, cancel the subscription immediately (or advance a [test clock](https://docs.stripe.com/billing/testing/test-clocks) past the period end) → **Account** shows the free plan and the lesson shows "Upgrade to continue".
   - [ ] Lifetime: pay → "Lifetime premium — no renewals, no end date."
   - [ ] A promo code can be entered on the Checkout page (create one under Products → Coupons).
   - [ ] Card `4000 0000 0000 0341` (attaches, then fails on renewal) → after `stripe trigger invoice.payment_failed`, the account page shows the payment warning.

## How entitlement works

- **Monthly/annual:** premium while the subscription is `active`, `trialing` or `past_due`. `premiumUntil` is the period end plus 3 days of grace, extended by each renewal webhook. When set to cancel at period end, `premiumUntil` is exactly the period end, so access stops then even if no further webhook arrives.
- **Lifetime:** `entitlementSource: lifetime`, `premiumUntil: null`. Subscription events never downgrade it.
- **The paywall itself** is in `firestore.rules` (`isPremium()`), so premium lessons in `lessonContent/` are unreadable to anyone else.
- **Webhooks** are verified with the signing secret and processed once (`stripeEvents/{eventId}`). A failed handler removes the marker so Stripe's retry is processed.
