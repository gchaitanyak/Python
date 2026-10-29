# Decisions

Choices made where the spec was open. Newest last.

## Phase 1

1. **Page routing.** Each route lives in `src/pages/<dir>/` (layout from ARCHITECTURE §3) and is listed once in `src/lib/routes.ts`. A small Vite plugin serves `src/pages/home/` at `/` in dev and moves `dist/home/index.html` to `dist/index.html` after build. Every other route's folder name equals its URL (`learn/` → `/learn/`).
2. **Header and footer are rendered at build time.** `src/components/header.ts` / `footer.ts` return HTML strings that the Vite plugin injects at `<!-- @header -->` / `<!-- @footer -->`. Pages are complete static HTML (crawlable, no layout shift, work without JS). The account slot (`data-account-slot`) is swapped for the avatar menu client-side in Phase 4.
3. **Only `/` and `/learn/` exist.** Header/footer link to routes from SPEC §2 that later phases build; those 404 until then.
4. **`validate:content` runs the Python validator for now.** `npm run validate:content` → `python3 content/tools/validate.py` (needs `pip install -r content/tools/requirements.txt`). Phase 3 replaces it with `scripts/validate-content.ts` on Pyodide in Node. The validator now imports `src/worker/harness.py` (the copy the browser ships), so lessons are validated with the exact grading code learners get; `content/tools/harness.py` stays as the reference.
5. **Harness port changes** (`src/worker/harness.py`): separate stdout/stderr capture, each capped at 1 MB (`OutputLimitError` ends runaway print loops, SPEC §4.2); `run_public()` returns a JSON-safe result for the worker; output printed while tests run is discarded instead of leaking to the console. Grading results are otherwise identical.
6. **Firebase project id `demo-python-exercises`.** The `demo-` prefix lets the Emulator Suite run with no Firebase login or real project. Set the real id in `.firebaserc` / `.env.local` before the first deploy.
7. **Firestore rules start from the ARCHITECTURE §5.1 outline,** with two hardening tweaks: `isPremium()` tolerates a missing user doc / missing fields, and progress docs allow `update` (not `create`) so the `diff()` never runs against a missing document. Phase 4 completes rules and tests.
8. **Functions** use Node 22, TypeScript, firebase-functions v2 API, and one placeholder `health` HTTP function so the Functions emulator has something to load. `npm install` at the root also installs `functions/` (postinstall).
9. **Playwright** is pinned to the exact version matching the pre-installed Chromium (1.63.0). e2e currently runs against the Vite dev server only; emulators join the e2e web server once pages talk to Firebase (Phase 4).
10. **Pyodide will be self-hosted** under `/pyodide/` from the `pyodide` npm package (ARCHITECTURE §5.2 prefers this; the jsDelivr CDN is also blocked in the build environment). Phase 2.
11. **Contact email** in the footer is the placeholder `hello@example.com`; social links point to network home pages. Replace before launch.
12. **TypeScript 7** (latest) for both the site and functions; functions compile with `module: NodeNext` to CommonJS.

**Renumbering (user request):** phases are numbered from 1. The skeleton above was built as "Phase 0" and is now Phase 1; every later phase moved up by one (lesson player = Phase 2 … launch = Phase 8). Commit messages before this change use the old numbers.

## Phase 2 — Lesson player

1. **Pyodide 314.0.7 (Python 3.14), self-hosted.** The build copies the five runtime files from the `pyodide` npm package to `dist/pyodide/`; the dev server serves them from `node_modules`. The worker imports `/pyodide/pyodide.mjs` at runtime. Extra packages (NumPy, Pandas…) aren't bundled yet; they're added when module 13 needs them.
2. **Worker protocol** follows ARCHITECTURE §7, with `init-error` added so a failed load is shown to the learner. The harness is passed to Python as source and called through JSON strings, so no Python proxies leak into JS.
3. **No network from user code:** once Pyodide has loaded, the worker replaces `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts` with functions that throw. `input()` raises an error (stdin disabled) until the input/output lesson defines how it should behave.
4. **Timeouts:** requests to the worker are queued one at a time, and the 5 s timer starts when a request is sent, not while Pyodide is still loading. On timeout the worker is terminated and a new one is started straight away.
5. **Grading location:** code and `fill_blank` (tests mode) are graded by the harness in Pyodide. `multiple_choice`, `predict_output` and exact `fill_blank` are graded in TypeScript (`src/player/grading.ts`). `checkPredict`/`fillTemplate` mirror the harness and are unit-tested.
6. **What counts as a try:** an empty answer (no option picked, blank text, unfilled blanks) gets a nudge and doesn't use up a try. Every other Check is a try, including code that errors.
7. **Points:** second try = `ceil(points / 2)`; third or later = `min(2, points)`. Viewing the solution makes that question 0. The lesson summary shows this run's points; total points on the device = the sum of each lesson's best run, so replaying can't farm points.
8. **Show solution:** opens a `<dialog>` confirm before the 2nd failed Check, and reveals straight away after that. Revealing fills in the answer (editor, text box, option or blanks). The learner then presses Check to move on, for 0 points.
9. **Keyboard:** Enter = Check/Continue (on the page, in inputs and radios, and in the predict-output box). Shift+Enter = Run (in the predict-output box it adds a new line instead, since there's nothing to run). In the editor, Enter types a newline, Ctrl/⌘+Enter checks and Shift+Enter runs. Tab indents in the editor; Esc then Tab leaves it (CodeMirror's escape hatch, mentioned in the on-screen help).
10. **Lesson completion** = reaching the summary screen. Skipped questions count as not done, and the summary names them. Streaks (consecutive local days with a completed lesson) and best scores live in `localStorage` under `pe:progress:v1`; code drafts are kept per question until the lesson is finished. Every storage call is guarded, so the player still works with storage blocked.
11. **Static content:** `/data/curriculum.json` (with the scope-only `references` removed) and `/data/lessons/<id>.json` for **free lessons that have a file** are written by `scripts/build-content.ts --emit-free` and served the same way in dev. Premium ids return 404. The player shows "Sign in required" for premium lessons (the full overlays arrive with accounts and payments), "not ready yet" for free lessons still to be written, and "not found" for anything else.
12. **Lesson text** is rendered by a small built-in Markdown renderer (`src/player/markdown.ts`) that escapes HTML first, so it adds no dependency and lesson text can't inject markup.
13. **`/learn/`** links the three sample lessons until Phase 3 generates the real dashboard. `/practice/` is `noindex` and left out of the sitemap.
14. **firebase** is pinned to v12 because `@firebase/rules-unit-testing` 5 requires it as a peer dependency.
15. **Favicon** is an inline SVG data URI added to every page by the Vite plugin (no extra request; removes a console 404).

## Phase 3 — Content pipeline and curriculum pages

1. **`scripts/validate-content.ts`** replaces the Python validator in `npm run validate:content` and runs first in `npm run build`. It loads `src/worker/harness.py` into Pyodide in Node, so lessons are checked by the exact grading code the browser uses. It covers the old checks, plus: the file name matches the id, `curriculum.json` says `"written"` exactly when a file exists, option ids are unique, and the blank count matches the template. The CONTENT_GUIDE style rules (≤ 2 explain, ≥ half code questions, summary shape) are **warnings**, because the supplied sample `py-variables` has 4/9 code questions. `CONTENT_DIR` points it at another tree; its own tests use `tests/fixtures/bad-content/`.
2. **Curriculum rules live in one module** (`src/lib/curriculum.ts`), shared by the dashboard, module pages and player. Lock priority: *coming soon* (not written) → *sign in* → *upgrade* → *finish previous lesson*. "Coming soon" comes first because nothing can unlock an unwritten lesson.
3. **Sequential unlock is enforced in the player now,** for anonymous visitors, from local progress. Phase 4 adds the server-side check. Modules aren't locked to each other; a module's first lesson shows "Recommended: finish X first", where X is the first earlier, non-optional module with lessons the visitor could still complete.
4. **Review status (SPEC §5.1) is shown already,** from local progress. "Needs attention" (< 70%) wins over "Review due" (≥ 14 days).
5. **Next recommended** = the first incomplete lesson the visitor can open (free and written, for anonymous visitors). If none is left, it's the review-due lesson practised longest ago; otherwise the card says everything available is done.
6. **Module pages are static HTML,** generated at build from `src/pages/module/index.html` (one template), written to `dist/learn/<moduleId>/`. The dev server renders the same template on request. The dashboard module grid and the landing curriculum overview are also rendered at build time, so the curriculum is crawlable. Client code only adds per-visitor status and lock labels. Module pages are in the sitemap.
7. **Premium preview (dev only):** `/practice/?lesson=<id>&preview=1` opens a premium lesson from `/data/preview/lessons/`. That route exists only on the dev server, and the code path is guarded by `import.meta.env.DEV`, so it's removed from production bundles (checked: not in `dist/assets`). It's how modules 1–3 are tested end to end before payments exist. Premium lesson files are never copied to `dist/`.
8. **`input()` support:** the harness feeds `input()` from text and echoes each line like a terminal. Tests set `__input__` in `setupCode`; on Run, the player's Input box (shown when the question's code uses `input(`) takes priority. Documented in `content/SCHEMA.md`. `explain`/`predict_output` code can't read input.
9. **Lessons written for modules 1–3:** 13 new lessons (16 in total with the samples). They avoid concepts taught later (no f-strings, `if`, loops or lists before their modules) and use `setupCode` values the learner can't see, so answers can't be hard-coded. Four are premium (module 3, lessons 2–5) and can't be played anonymously until Phase 6.
10. **Landing page:** no invented testimonials. A "Who it's for" section stands in, and an HTML comment marks where real testimonials go. Lesson and module counts come from `curriculum.json`.

## Phase 4 — Accounts and progress

1. **Server-side scoring.** `submitAnswer` doesn't trust the client's try count. It keeps `scoring.<questionId> = {day, tries, correct, firstTry, viewedSolution, points}` on the progress doc, a field clients can't write. Tries restart each local day. A question already answered correctly today scores 0 (one award per question per day, ARCHITECTURE §5.3), and that repeat Check isn't recorded as an attempt. `viewedSolution` is taken from the client because it can only lower points. `multiple_choice`, `predict_output` and exact `fill_blank` are re-checked on the server from the submitted answer (sent in plain form — the answers to free lessons are public anyway). Code answers are trusted (§5.3).
2. **Days:** the streak uses the user's **local** day (`users.tz`, saved at sign-up). Leaderboards (`dailyScores/{day}`) use the **UTC** day so everyone shares one board. This matches the daily challenge's 00:00 UTC rollover.
3. **`completeLesson` takes the client's accuracy** (clamped to 0–100). Accuracy only drives status colours, never points. The server enforces access, keeps the best accuracy, updates `lastPractisedAt` and the streak, and makes sure a leaderboard row exists with the current streak.
4. **Sequential unlock and the paywall are enforced in the functions** (`submitAnswer`, `completeLesson`): `failed-precondition` if the previous lesson isn't completed, `permission-denied` for premium lessons without premium. The pure rules live in `functions/src/lib/rules.ts`; `tests/unit/server-rules.test.ts` checks they match the client's for every lesson, and for points and output matching.
5. **Functions read lesson content** from `functions/content/`, copied from `content/` by `functions/copy-content.mjs` on every functions build (git-ignored). This also covers deploys, through the existing predeploy build.
6. **`mergeAnonymousProgress`** runs after any sign-in where the device has anonymous progress, and at most once per account (`mergedAnonymousAt`). Only completed, free, written lessons are merged, with accuracy and dates clamped. **Points aren't transferred** (the server never checked them). After a successful merge the device's local progress is cleared, so it can't merge into a second account.
7. **Account deletion** is a callable (`deleteAccount`) instead of the `onUserDelete` auth trigger in ARCHITECTURE §6. The client can wait for it, and it's testable in the emulator. It deletes the profile, progress and attempts, releases the username, renames leaderboard rows to "former learner" (using `users.scoreDays`), and deletes the login. Keeping certificates on request arrives with certificates (Phase 7).
8. **Usernames** are stored lower-case (SPEC allows only `[a-z0-9_]`), so `username == usernameLower`. Registration checks availability first; if the name is taken in the moment between the check and the claim, the account still exists and the learner is sent to `/account/` to choose another. Email-link users choose a username on the account page. Until then, leaderboard rows show `learner_<uid prefix>`. A few names are reserved (`admin`, `support`…).
9. **Rate limits** are a fixed one-minute window per user per function, stored in `rateLimits/{uid}_{fn}` (never readable by clients): `submitAnswer` 60, `completeLesson` 20, `mergeAnonymousProgress` 5.
10. **Firestore rules** were completed and tested for every collection (17 tests). Users may create their profile with `firstName`, `tz` and `createdAt == request.time` only, and update `firstName`/`tz` only. Progress accepts `questionState` updates only (create and delete are denied). Feedback has an exact shape. hintLogs owners may read and set `helpful` (a boolean) only. Everything else is read-only or denied.
11. **Firebase loads lazily.** `src/lib/session.ts` dynamically imports the SDK, so public pages stay fast (Lighthouse mobile 100). In dev without `.env.local`, the client uses the emulators and the demo project automatically, so no extra env file is committed. A production build with no Firebase config stays anonymous-only.
12. **Leaderboard on /learn/** (needed for SPEC acceptance 2): today's top 10 by points, plus your own row and rank (a count query of rows with more points). Streak boards, the share bonus and live updates come in Phase 5.
13. **Sign-up prompt** (SPEC §6) appears on the lesson summary once an anonymous visitor has finished 2 lessons; before that, the summary shows a one-line link. Locked premium lessons offer Log in / Create account (anonymous) or "Upgrade to continue" (free accounts).
14. **Password reset and email-link messages don't reveal whether an account exists.** Email verification is a non-blocking nudge on the account page.
15. **Test tooling:** `npm run test:functions` runs callable integration tests on the emulators. Playwright starts the Auth, Firestore and Functions emulators itself, waits for the `health` function (not just the hub), and stops them with SIGTERM so no Java emulator is left holding port 8080.

## Phase 5 — Gamification

1. **The daily challenge only uses free lessons.** It draws from lessons that are `daily: true`, **free** and written, so the public challenge never reveals premium content. The picker (`functions/src/lib/challenge.ts`) is a seeded PRNG keyed on the UTC date. It takes one gradable question from each of 5 different lessons where possible, and is unit-tested.
2. **The challenge is stored once per day:** in `dailyChallenges/{date}` (questions included, publicly readable). `ensureChallenge` creates it idempotently (`create()`; a race just reads the winner's copy). The scheduled `buildDailyChallenge` runs at 00:00 UTC; `getDailyChallenge` also builds on demand, because the emulator doesn't run schedules and a missed run shouldn't break the page.
3. **One scored attempt per user per day.** `submitChallenge` re-checks non-code answers (like `submitAnswer`), stores `results/{uid}` once, counts towards the streak, and ranks by accuracy, then time. Later attempts are practice and return the scored result. Time is reported by the client and clamped to 5–3600 s (honour system, ARCHITECTURE §5.3); the challenge awards no points.
4. **Challenge mode in the player:** one Check per question. There's no hint, no solution, no skip and no going back; a timer replaces points.
5. **Leaderboards are live Firestore listeners** (top 10 + your own row and rank). This is how a finished lesson shows up within 5 s; the e2e test checks an open dashboard updates without reloading. The streak board orders `dailyScores` rows by `streak`; the challenge board orders results by accuracy desc, then seconds asc (composite indexes in `firestore.indexes.json`).
6. **Daily points** are the points-board row for today (UTC, same as the board), shown as "You: #N with X pts today".
7. **The share bonus (+100 once)** is claimed when a share intent is opened: the native share sheet, a clipboard copy, or the X/LinkedIn links. It's honour system, checked server-side once per user (`shareBonusClaimed`).
8. **Flashcards are gated on premium.** SPEC §6 lists them under premium; §2 says "signed in". Anonymous visitors see "Sign in required", free accounts see "Upgrade". Cards come from completed lessons (optionally one module), in rounds of 20 with "Keep going" — effectively non-stop. No points. Only lessons served as static JSON (free) are used until premium content is served from Firestore in Phase 6.
9. **Emulator-only test clock:** `functions/src/lib/clock.ts` reads `_test/clock` only when `FUNCTIONS_EMULATOR === 'true'`. That lets tests cross day boundaries (streaks, challenge dates) for real. Rules deny clients (tested), and production never reads it.
10. **Streak activity is shared** (`recordActivity`) by `completeLesson` and `submitChallenge`. `awardPoints` is shared by `submitAnswer` and `claimShareBonus`.
11. **Content:** 31 lessons for modules 4–8 (47 written in total). They follow curriculum order — strings before control flow, data structures before functions, so module 6 works on data in variables. The `collections` lesson introduces `from … import` itself. The pip/venv lesson teaches the commands conceptually (Pyodide can't run pip) and practises parsing requirement lines and comparing versions in code. `tests/e2e/content.spec.ts` plays every module 4–8 lesson in the real player.
12. **The player's markup is a shared component** (`src/components/player-shell.ts`), inserted at build time, so `/practice/` and `/daily/` share one player.

## Phase 6 — Payments and premium

1. **A local fake Stripe stands in for Stripe in dev and tests.** This build environment can't reach `api.stripe.com` or run the Stripe CLI, so `scripts/fake-stripe.ts` serves the few API calls we use (customers, Checkout and portal sessions, retrieving and cancelling subscriptions) plus simple Checkout and portal pages. It sends webhooks signed with the real `Stripe.webhooks` signing scheme, so `stripeWebhook` checks signatures exactly as it will in production. The Functions only talk to it when the `STRIPE_API_BASE` param is set. `scripts/emulator-env.mjs` writes it, with fake keys, into `functions/.env.local` and `functions/.secret.local` (both git-ignored). Checking against real Stripe test mode with the Stripe CLI is still to do — see `docs/STRIPE.md`.
2. **Entitlement rules** (`functions/src/lib/entitlement.ts`, unit-tested):
   - `active`, `trialing` and `past_due` subscriptions are premium.
   - A renewing subscription runs to the end of its period plus 3 days' grace, so a late renewal webhook doesn't lock anyone out.
   - Cancel-at-period-end stays premium until exactly the period end.
   - Any other status is free, from now.
   - The period end is read from the subscription item (where API version 2026-09-30 puts it).
3. **Lifetime is a one-off Checkout payment** (`mode: payment`). It sets `entitlementSource: lifetime` and `premiumUntil: null`, and later subscription events never downgrade it.
4. **The webhook is idempotent and trusts Stripe, not the event body.**
   - Each event id is recorded once in `stripeEvents/{id}`; on failure the marker is removed so Stripe's retry runs again.
   - Subscription events re-fetch the subscription, so events arriving out of order can't apply stale state.
   - Events for deleted users are ignored, so they can't recreate the user's document.
5. **Payment problems are shown, not enforced early.** `invoice.payment_failed` sets `paymentIssue: true` (the account page shows a banner linking to the portal); `invoice.paid` clears it. Access follows the subscription status.
6. **Premium lesson bodies live only in Firestore** (`lessonContent/{id}`, readable only by signed-in users whose `entitlement` is `premium` and whose `premiumUntil` is null (lifetime) or still in the future). The static build emits free lessons only (`build-content.ts --emit-free`). `--upload-premium` writes the rest with the Admin SDK: `npm run deploy` runs it after deploying, and `scripts/dev-services.ts` runs it against the emulator.
7. **Prices shown on /pricing/ are config** (`VITE_PRICE_*_LABEL`, defaults $12 / $79 / $199), filled in at build time. The amount charged comes from the Stripe Price ids in the Functions params, so labels and prices must be kept in step (STRIPE.md checklist).
8. **Deleting an account cancels its subscription first**, so nobody is billed for an account that no longer exists.
9. **Signed-out visitors who pick a plan are sent to register**, with `next=/pricing/`. Pricing buttons work even when clicked before the session has loaded.
10. **`setupCode` is allowed on `explain` and `fill_blank` questions too.** `py-http-requests` needs it: browser code can't reach the internet, so a practice `requests` module (installed into `sys.modules` by `setupCode`) answers for `https://api.example.com`. It records each call so tests can check that a timeout was passed.
11. **Content:** modules 9–12 add 22 lessons, for 69 in total.
    - File lessons clean up their files in `setupCode`, because the in-browser filesystem keeps files between runs.
    - Logging questions check log records with a temporary handler.
    - Unit-test questions run the learner's `TestCase` against the correct function and against broken versions, so tests that would pass anything don't count.
    - `tests/e2e/content.spec.ts` now plays every lesson in modules 4–12.

## Phase 7 — Certificate, AI tutor, projects

1. **Certificate eligibility is completion only.** Every lesson in the modules marked `requiredForCertificate` (1–12) must be complete. There's no separate premium check: those modules include premium lessons, and a certificate already earned shouldn't vanish when a subscription ends. Optional modules 13–14 are listed once all their lessons are written and complete; calling `generateCertificate` again adds them but never changes the name.
2. **Credential IDs** are 10 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no 0/O, 1/I/L), drawn with rejection sampling. Search accepts any case, spaces and dashes.
3. **`/certificate/<id>/` is one client-rendered page.** Hosting rewrites `/certificate/*/` to `/certificate/view/` (the dev server does the same), and the page reads `certificates/{id}`. The page is `noindex`, so learners' names aren't pushed into search engines.
4. **The PDF is built in the browser with no library.** The certificate is drawn on a canvas, so names in any script use the system's fonts, then saved as a JPEG inside a hand-written one-page A4 PDF (unit-tested). "Add to LinkedIn" uses LinkedIn's add-certification URL.
5. **Account deletion and certificates (SPEC §8):** the account page shows a "Keep my certificate verifiable" box. If ticked, the certificate stays public with `uid: null`; otherwise it is deleted. AI hint logs and quota counters are deleted too. (This also fixes the rate-limit cleanup query, which matched nothing.)
6. **AI tutor (`getHint`):**
   - Calls the Claude API through `@anthropic-ai/sdk`. The key is in the `ANTHROPIC_API_KEY` secret; the model is the `HINT_MODEL` param (default `claude-opus-5-5`, effort `low`, server-side refusal fallback on). One short hint per request, with a 30 s timeout.
   - The prompt is built on the server from the lesson's data. It includes the reference solution so the hint is well aimed, and wraps learner text as data, not instructions.
   - Limits: anonymous 0, free 5 a day, premium 30 a day (UTC), stored in `hintQuota/{uid}_{day}`, plus 6 a minute. A failed model call gives the hint back.
   - Premium lessons need premium, as everywhere else.
7. **The leak guard** (`functions/src/lib/hint.ts`) replaces a reply when any of these hold:
   - it contains a multi-line code block;
   - its character-bigram similarity to the reference solution is ≥ 0.6;
   - it contains half or more of the solution's substantial lines (14+ characters), or any single solution line of 30+ characters.

   The replacement is the authored hint, or a generic nudge if the authored hint itself spells out the answer (some do: `py-for-range` q02). A unit test runs five kinds of leaking reply against all 364 code questions and checks the shown hint stays below 0.6 similarity. `hintLogs` store ids and whether the reply was replaced, never the learner's code. Learners can rate a hint 👍/👎 (rules allow only `helpful`).
8. **The AI tutor button** appears in the lesson player after 2 failed checks on a question, once per visit to that question. Anonymous learners get a sign-in prompt instead. It isn't offered in the daily challenge, flashcards or projects.
9. **A local fake Claude API** (`scripts/fake-llm.ts`, port 12112) serves the emulator and the tests, because this environment can't reach the API and tests shouldn't spend money. `functions/.env.local` points `LLM_API_BASE` at it. To use the real API locally, remove that line and put a real key in `functions/.secret.local`; in production set the secret with `firebase functions:secrets:set ANTHROPIC_API_KEY`. `scripts/emulator-env.mjs` now adds missing keys to existing env files instead of only creating them.
10. **Projects reuse the lesson format and player.**
    - Each project is `content/projects/<id>/project.json` (brief, dataset list, steps as lesson questions) plus its dataset files. `projects.json` lists all five, in order, with their status.
    - Before each step, `setupCode` rewrites the dataset files, so steps can be retried in any order. Each step is self-contained: its starter code includes the earlier pieces it needs.
    - The player has a `project` mode: steps, no points, no AI tutor, drafts kept.
    - Free projects are emitted as static JSON plus raw dataset files. Premium ones are uploaded to `projectContent/{id}` (same paywall rule as `lessonContent`), and their downloads are built from that copy.
    - The "starter notebook" in SPEC §2 is a `.py` starter file: every code step's task as comments, with the first step's starter code.
11. **Finished projects award no points**, so the learner's own client records them: on the device, and in `users/{uid}/projects/{id}` for signed-in learners. Rules allow only `{completed: true, completedAt: request.time}`.
12. **Only 2 of the 5 projects are written: Expense Tracker (free) and Text Adventure (premium).** Weather Data Report, Movie Ratings Analysis and Spam Classifier need pandas, Matplotlib and scikit-learn, and so does module 13. Those packages aren't in the pyodide npm package. This environment can't reach the Pyodide CDN (`cdn.jsdelivr.net`), so lessons using them can't be validated here. Following CLAUDE.md (validate before commit), module 13 and those three projects stay "to-write"/"coming soon".

    The plumbing for them is built and tested:
    - `npm run fetch:pyodide` downloads the wheels and checks their checksums;
    - the dev server serves them and the build self-hosts them under `/pyodide/`;
    - the worker and the validator load whatever an exercise imports.
13. **The worker's network block now has one narrow exception.** It allows `fetch` of the site's own `/pyodide/` files, only while the worker itself is loading packages, and messages are handled one at a time, so learner code never runs during that window. A browser test checks that learner code still can't fetch even `/pyodide/` files. Package downloads get their own 2-minute limit; the 5 s limit starts when the learner's code does.
14. **Flask isn't in Pyodide either**, so `py-flask-api` uses a practice `flask` module installed by `setupCode`, like `requests` in module 12. It supports `Flask`, `route` (with `<int:…>` converters and methods), `jsonify`, `request` (`args`, `get_json`, `method`), `abort` and the test client — the same API learners would use with real Flask. `sqlite3` is in Pyodide's standard library and works directly.
15. **Content:** module 14 adds 4 lessons (73 written in total). Checks that need to see a learner's code (e.g. "don't call `sorted`") read the function's code object (`__code__.co_names`), because `inspect.getsource` can't see code run with `exec`.

## Phase 8 — Groups, SEO, polish, launch

1. **Anyone signed in can create a group** (up to 10 each) and becomes its admin. Admins don't have to be members. Other members can be made admins too. Groups hold up to 500 members.
2. **Invite links are `/join/?code=XXXXXXXX`**: 8 characters from the certificate alphabet, mapped in `inviteCodes/{code}` (function-only). `/join/` isn't in SPEC §2's route list; it was added because an invite link needs a page. Regenerating the link retires the old code at once.
3. **The admin report is computed when it's asked for** (`groupReport`, `exportGroupCsv`). The functions read each member's progress with the Admin SDK, so members' progress stays private under the rules and the numbers are never stale.
   - The columns are those SPEC §5.7 names: lessons completed, average best accuracy, last active.
   - The CSV is quoted properly, and cells that would start a spreadsheet formula are neutralised.
4. **Premium seats** (SPEC §5.7, set by hand):
   - The site owner runs `scripts/set-group-seats.ts`, and seats go to the group's earliest members.
   - A seat gives premium (`entitlementSource: group`) only to someone not already premium; paying members keep their own source.
   - When a member's own subscription ends while they hold a seat, the webhook keeps them premium through the group.
   - Leaving or being removed releases the seat to the next member.
   - Lifetime access is never touched.
5. **Users' `groups` map** (`{gid: {name, role}}`) is written only by functions. It drives the account menu's Admin link and the "Groups" section (with Leave) on the account page. Deleting an account leaves its groups; a group left with no admin is closed and its seats freed.
6. **Guides** are Markdown with front matter in `content/guides/`, rendered with their own small renderer (headings with anchors, lists, internal links, fenced code). There are 10, written from scratch for this site, 660–820 words each. ```` ```python ```` blocks get a Run button that loads Pyodide only on the first press. The validator runs every example and checks length and the "Practise this" lesson.
7. **Canonical and Open Graph tags are added to every built page** from its own `<title>` and description (`src/lib/seo.ts`). The build does this once pages are at their final paths; the dev server does it per request.
   - `SITE_URL` (from `.env.<mode>.local`) sets the address.
   - Share images are drawn by `scripts/make-og-images.ts` (Playwright) and committed under `src/assets/og/`, one for the site and one per guide, so builds don't need a browser.
8. **Sitemap and robots.txt:** a unit test checks the sitemap lists every public route, module, project and guide, and that every left-out route is `noindex`. `robots.txt` disallows the private pages.
9. **Analytics need consent.** The banner appears only when `VITE_GA_MEASUREMENT_ID` is set; without it there is nothing to consent to.
   - gtag.js loads only after "Accept"; "Cookie settings" in the footer reopens the banner, and turning analytics off reloads the page to stop them.
   - The choice is stored outside the `pe:*` keys, so signing out keeps it.
   - The privacy page names Firebase, Stripe, Google Analytics and Anthropic.
10. **Content-Security-Policy** (firebase.json, all files):
    - Scripts may come only from the site itself, Google Tag Manager and reCAPTCHA. `'wasm-unsafe-eval'` lets Pyodide compile WebAssembly; no `unsafe-eval` is needed.
    - **Styles allow `'unsafe-inline'`**, because CodeMirror (via `style-mod`) adds a `<style>` element when it runs in a normal page, and a static host can't hand out per-request nonces. Inline styles are much lower risk than inline scripts, which stay blocked. The one inline `style=""` in our own markup (dashboard trend bars) now sets values through the DOM instead.
    - Also sent: `nosniff`, `strict-origin-when-cross-origin`, a Permissions-Policy and COOP `same-origin` (no Firebase popups are used).
    - `vite preview` serves the same headers. The new `production` Playwright project builds the site (with a test GA id) and checks pages, a lesson, guide examples and a project for CSP violations, plus the consent flow.
11. **App Check:**
    - The client registers reCAPTCHA Enterprise when `VITE_RECAPTCHA_ENTERPRISE_KEY` is set.
    - Every callable takes shared `callOptions`, which enforce App Check when the project's `functions/.env.<projectId>` has `ENFORCE_APP_CHECK=true`; a unit test fails if a callable skips them.
    - The emulator and tests run without it. The Stripe webhook is an HTTP endpoint and is protected by its signature instead.
12. **Lesson feedback** (SPEC §5.10, not in any earlier phase): "Was this lesson clear?" 👍/👎 plus an optional comment on the lesson summary, for signed-in learners. It is stored create-only in `feedback/`, readable only from the console.
13. **Deploying** (`docs/DEPLOY.md`):
    - `npm run build` now runs `scripts/build.ts`, which takes `--mode` so staging builds use `.env.staging.local`.
    - `npm run deploy:staging|production` (`scripts/deploy.ts`) first checks that `.firebaserc` aliases, browser config, function config, no local fakes, and App Check enforcement in production are all in place, and stops if any is missing. Then it deploys rules and indexes, functions, hosting and premium content, in that order.
    - Verified from a fresh clone: install, build, unit tests, the readiness check, and a staging build with staging URLs. **The real deploy hasn't been run**: this environment has no Firebase or Stripe accounts.
14. **Lighthouse (mobile), production build with the real headers:** every public page scores 100 for accessibility, best practices and SEO. Performance is 100, except `/daily/` (96) and `/projects/expense-tracker/` (97).
