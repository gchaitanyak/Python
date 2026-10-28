# Build Plan

Build in this order. Finish each phase's acceptance checks before starting the next. Stop at the end of every phase and report the checks to the user.

## Phase 0 — Project skeleton
- Vite multi-page TypeScript project, folder layout from ARCHITECTURE §3, design tokens, header/footer components.
- Firebase project wiring with emulators (Auth, Firestore, Functions, Hosting); `.env.example`.
- Vitest, Playwright, rules-test harness; npm scripts from CLAUDE.md.
- Copy `content/` from this pack; port `content/tools/harness.py` to `src/worker/harness.py`.

**Acceptance:** `npm run dev` serves `/` and `/learn/` with header/footer; `npm run test` and `npm run test:rules` run (even if few tests); `npm run validate:content` passes on the three sample lessons.

## Phase 1 — Lesson player (anonymous, free lessons)
- Python worker with Pyodide (lazy load, "Loading Python…" state), Run and Grade messages, 5 s timeout with worker restart.
- CodeMirror 6 editor; question renderers for all six types; keyboard shortcuts; hint; show solution; previous/skip; reset code; progress bar; lesson summary screen.
- Local scoring and progress in localStorage. Static loading of free lesson JSON.

**Acceptance:** sample lessons are fully playable; `while True: pass` times out and the next Run works; a wrong answer shows the public test message only; Lighthouse accessibility ≥ 95 on the player.

## Phase 2 — Content pipeline and curriculum pages
- `validate-content.ts`: JSON schema check + run every `solution` (must pass) and `starterCode` (must fail) for gradable questions, using Pyodide in Node.
- Landing, `/learn/` dashboard (anonymous view), module pages generated from `curriculum.json`; lock states; next-recommended logic.
- Author lessons for **modules 1–3** following CONTENT_GUIDE (≈ 15 lessons).

**Acceptance:** build fails if any lesson is invalid; module pages list every lesson from the curriculum; modules 1–3 playable end to end.

## Phase 3 — Accounts and progress
- Register, login (password + email link), forgot password, account page, username claim.
- Firestore progress, `submitAnswer`, `completeLesson`, `mergeAnonymousProgress`; dashboard status colours (SPEC 5.1); sequential unlock enforced in functions.
- Firestore rules + rules tests for every collection.

**Acceptance:** SPEC acceptance 1 and 2; rules tests prove a user can't edit `entitlement`, points or another user's progress.

## Phase 4 — Gamification
- Daily points, streaks, leaderboards (top 10 + own rank), share bonus.
- Daily challenge: scheduled builder, page, one scored attempt, 7-day trend widget.
- Flashcard mode.
- Author lessons for **modules 4–8**.

**Acceptance:** SPEC acceptance 7; leaderboard updates within 5 s of a completed lesson; streak survives a day boundary in tests (fake clock).

## Phase 5 — Payments and premium
- Pricing page; `createCheckoutSession`, `createPortalSession`, `stripeWebhook`; entitlement handling incl. lifetime and cancel-at-period-end.
- Premium lessons uploaded to `lessonContent/` and protected by rules; lock overlays (SPEC §6).
- Author lessons for **modules 9–12**.

**Acceptance:** SPEC acceptance 3 and 4 using Stripe test mode and the Stripe CLI to forward webhooks.

## Phase 6 — Certificate, AI tutor, projects
- `generateCertificate`, public certificate page, verification search, PDF download, LinkedIn link.
- `getHint` with quotas and 👍/👎 feedback.
- Project pages and the 5 projects from SPEC 5.8 (original datasets).
- Author lessons for **modules 13–14**.

**Acceptance:** SPEC acceptance 6; AI hint never contains the reference solution verbatim (unit test with string similarity < 0.6).

## Phase 7 — Groups, SEO, polish, launch
- Groups: create, invite link, join, admin portal, CSV export, premium seats (manual).
- Guides (one per core topic), sitemap, robots.txt, Open Graph images, consent banner + analytics.
- Performance pass (Lighthouse ≥ 90 mobile on public pages), CSP, App Check, staging → production deploy runbook in `docs/DEPLOY.md`.

**Acceptance:** SPEC acceptance 8; all public routes in sitemap; production deploy from a clean checkout following DEPLOY.md.
