# Deploying Python Exercises

From a clean checkout to staging, then to production. Staging and production are two separate Firebase projects. `npm run deploy:<env>` checks the configuration before it changes anything.

> **Secrets never go in the repo.** Browser config lives in `.env.<env>.local`; function settings live in `functions/.env.<projectId>`; keys live in Secret Manager. All of them are git-ignored except `functions/.env.<projectId>`, which holds no secrets.

## 1. Tools

| Tool | Version | Used for |
|---|---|---|
| Node.js | 22 | build, tests, Cloud Functions runtime |
| Java | 21+ | Firebase emulators (tests only) |
| Firebase CLI | from the repo (`npx firebase`) | deploys |
| Google Cloud CLI | any recent | uploading premium content (`gcloud auth application-default login`) |
| Stripe CLI | optional | forwarding webhooks while testing (see `docs/STRIPE.md`) |

```bash
git clone <repo-url> python-exercises && cd python-exercises
npm ci
npm --prefix functions ci
npm run fetch:pyodide    # optional until module 13 / data projects are written; needs cdn.jsdelivr.net
npm run build            # validates content, type-checks, builds dist/
npm run test             # unit tests
npm run test:rules && npm run test:functions && npm run test:e2e   # emulators; needs Java
```

All of these must pass before you deploy.

## 2. Create the two Firebase projects (once)

Do this twice: once for **staging** (e.g. `pyex-staging`) and once for **production** (e.g. `pyex-prod`).

1. Create the project in the [Firebase console](https://console.firebase.google.com/) and upgrade it to the **Blaze** plan. Cloud Functions, Secret Manager and the scheduler need it.
2. **Authentication → Sign-in method:** enable *Email/Password* and its *Email link (passwordless sign-in)* option.
3. **Authentication → Settings → Authorized domains:** add your site's domain (staging and production each get their own).
4. **Firestore Database:** create it in production mode and choose a region near your learners (it can't change later). The rules and indexes are deployed from the repo.
5. **Project settings → Your apps:** add a **Web app**. Copy its config into `.env.<env>.local` (section 3).
6. **App Check:** in Google Cloud, create a *reCAPTCHA Enterprise* website key for the domain. In Firebase **App Check**, register the web app with that key. Leave Firestore enforcement off; callable functions enforce App Check themselves when `ENFORCE_APP_CHECK=true` (section 4).
7. **Hosting:** add your custom domain to the project's Hosting site and follow the DNS steps.
8. Link the project to this checkout under its alias:

```bash
npx firebase login
npx firebase use --add     # pick the staging project, alias: staging
npx firebase use --add     # pick the production project, alias: production
```

This writes the aliases into `.firebaserc`. Commit it: project ids aren't secret.

## 3. Browser config: `.env.staging.local` and `.env.production.local`

Copy `.env.example` to `.env.staging.local` and `.env.production.local` (both git-ignored) and fill in each:

| Variable | Value |
|---|---|
| `VITE_FIREBASE_*` | the web app config from step 2.5; `VITE_FIREBASE_PROJECT_ID` must match the alias |
| `VITE_FIREBASE_FUNCTIONS_REGION` | `us-central1` (where the functions deploy) |
| `VITE_USE_EMULATORS` | remove it, or set it to `false` |
| `VITE_RECAPTCHA_ENTERPRISE_KEY` | the reCAPTCHA Enterprise site key (required for production) |
| `VITE_GA_MEASUREMENT_ID` | the GA4 measurement id (`G-…`), or empty for no analytics and no consent banner |
| `VITE_PRICE_*_LABEL` | the prices shown on /pricing/; keep them equal to the Stripe prices |
| `SITE_URL` | `https://staging.your-domain` / `https://your-domain`: canonical, Open Graph and sitemap URLs |

## 4. Function config: `functions/.env.<projectId>` and secrets

Create `functions/.env.pyex-staging` and `functions/.env.pyex-prod` (use your project ids). These hold settings, not secrets, so they may be committed.

```bash
STRIPE_PRICE_MONTHLY=price_...      # from Stripe (test mode for staging, live mode for production)
STRIPE_PRICE_ANNUAL=price_...
STRIPE_PRICE_LIFETIME=price_...
APP_ORIGINS=https://your-domain     # comma-separated; the first is used for Stripe return URLs
HINT_MODEL=claude-opus-5-5          # optional; the AI tutor's model
ENFORCE_APP_CHECK=true              # required in production; recommended in staging
```

Never put `STRIPE_API_BASE` or `LLM_API_BASE` here. Those point at the local fakes and belong only in `functions/.env.local`.

Set the secrets once per project:

```bash
npx firebase functions:secrets:set STRIPE_SECRET_KEY --project staging       # sk_test_… (sk_live_… for production)
npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET --project staging   # whsec_… from step 5
npx firebase functions:secrets:set ANTHROPIC_API_KEY --project staging       # from console.anthropic.com
```

## 5. Stripe (once per environment)

Follow `docs/STRIPE.md`: products and prices, Customer Portal settings and the webhook. The webhook endpoint is the `stripeWebhook` URL printed by the first functions deploy (`https://us-central1-<projectId>.cloudfunctions.net/stripeWebhook`). Subscribe it to `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.paid` and `invoice.payment_failed`. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.

On the first deploy the webhook secret doesn't exist yet. Set a placeholder, deploy, create the webhook, set the real secret, then deploy functions again: `npx firebase deploy --only functions --project staging`.

## 6. Deploy to staging, then check it

```bash
gcloud auth application-default login     # lets the deploy upload premium lessons and projects
npm run deploy:staging -- --check         # configuration check only
npm run deploy:staging
```

`deploy:staging` runs, in order:

1. the build (`--mode staging`);
2. Firestore rules and indexes;
3. functions;
4. hosting;
5. the upload of premium lessons and projects to `lessonContent/` and `projectContent/`.

Each step stops the run if it fails.

**Smoke checks on staging** (about 15 minutes):

- [ ] `/` loads; the browser console shows no Content-Security-Policy errors; the cookie banner appears if GA is configured.
- [ ] Signed out, complete lesson 1 from "Start learning free"; points appear.
- [ ] Register; the progress carries over; you appear on today's leaderboard.
- [ ] A premium lesson shows *Upgrade to continue*.
- [ ] Buy the monthly plan with test card `4242 4242 4242 4242`; within a few seconds the account page says premium and the premium lesson opens.
- [ ] *Manage subscription* opens the Stripe portal; cancel at period end; access remains.
- [ ] Fail a check twice and press *Ask the AI tutor*; a short hint appears.
- [ ] `/projects/text-adventure/` downloads `world.json` as a premium user.
- [ ] `/admin/`: create a group, join it from another account with the invite link, see the member's progress and export CSV.
- [ ] `/sitemap.xml` and `/robots.txt` use the staging `SITE_URL`.
- [ ] Lighthouse (mobile) ≥ 90 on `/`, `/learn/` and a guide.

## 7. Promote to production

Use the same commit that passed on staging:

```bash
npm run deploy:production -- --check
npm run deploy:production       # also what plain `npm run deploy` does
```

Production uses **live** Stripe keys and prices (section 4), its own webhook (section 5) and `ENFORCE_APP_CHECK=true`; the check refuses to deploy without it. Repeat the smoke checks; use a real card and refund it from the Stripe dashboard.

## 8. Day-to-day operations

- **Group premium seats** (set by hand for now):
  `GCLOUD_PROJECT=pyex-prod npx tsx scripts/set-group-seats.ts --group=<groupId> --seats=<n> --project=pyex-prod`.
  Group admins see the group ID on their `/admin/` page (they quote it when asking for seats); it's also the document id under `groups/`.
- **New or changed lessons:** commit them (`npm run validate:content` must pass) and deploy again. Free lessons ship with hosting; premium ones are re-uploaded by the deploy.
- **The daily challenge** builds itself at 00:00 UTC (the `buildDailyChallenge` schedule), and on demand if that run is missed.
- **Lesson feedback** is in Firestore under `feedback/`. Only the console (owner) can read it.

## 9. Rolling back

- **Hosting:** Firebase console → Hosting → release history → *Roll back* (instant).
- **Functions and rules:** check out the previous good commit and run `npx firebase deploy --only functions,firestore:rules --project <env>`.
- **Content:** deploying the previous commit re-uploads its premium lessons. Lessons added later stay in Firestore but aren't listed in the curriculum, so learners can't reach them.

## 10. What this runbook was checked against

From a fresh `git clone` in a clean directory, I ran:

- `npm ci`, `npm --prefix functions ci`, `npm run build`, `npm run test` and the readiness check (`--check`), with sample staging and production config in place;
- the rules, functions and end-to-end suites against the emulators.

The deploy itself (sections 2, 5, 6 and 7) needs Firebase and Stripe accounts, which the build environment doesn't have. Run it for the first time on staging.
