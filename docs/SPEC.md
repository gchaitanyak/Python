# Product Spec — Python Exercises

## 1. Summary

A website where people learn Python by doing. Every lesson is a short sequence of questions; for most of them the learner writes or fixes real Python code in an in-browser editor, presses **Check**, and gets instant pass/fail feedback from hidden tests. Correct answers earn points; daily activity builds a streak; leaderboards reset daily. A handful of lessons are free with no sign-up; an account saves progress; a subscription unlocks everything plus projects and a verifiable certificate.

**Audience:** adults learning Python for work — career switchers, analysts, QA engineers moving into automation or AI, students. Assume zero prior coding for module 1, and steady growth to data/AI basics by module 13.

## 2. Pages and routes

| Route | Page | Access |
|---|---|---|
| `/` | Landing: value proposition, how it works, curriculum overview, testimonials placeholder, pricing teaser, CTA "Start learning free" → first lesson | Public |
| `/learn/` | Learner dashboard: progress, next recommended lesson, module grid with per-lesson status, points/streak widgets, daily-challenge card, projects grid, certificate card | Public (progress shown only when signed in) |
| `/learn/<module-slug>/` | Module page: module intro, its lessons with status and lock state | Public |
| `/practice/?lesson=<lessonId>` | Lesson player (see §4) | Gated per §6 |
| `/practice/?mode=flashcards&module=<slug>` | Flashcard mode: random questions from completed lessons, non-stop | Signed in |
| `/daily/` | Daily challenge (see §5.4) + worldwide leaderboard | Public to view, signed in to submit |
| `/projects/<slug>/` | Guided project page: brief, steps, dataset download, starter notebook, checks | Premium (except one free project) |
| `/pricing/` | Plans, FAQ, promo-code note, educator access note | Public |
| `/certificate/` | Explains the certificate; verification search by credential ID | Public |
| `/certificate/<credentialId>/` | Public certificate page (name, date, credential ID, modules completed) | Public |
| `/login/` | Email + password, "Email me a sign-in link", forgot password | Public |
| `/register/` | First name, username, email, password | Public |
| `/account/` | Profile, change name/username, Manage Subscription (Stripe portal), delete account | Signed in |
| `/admin/` | Group admin portal (see §5.7) | Group admins |
| `/guides/` and `/guides/<slug>/` | SEO articles: one per core topic, each ending with "Practise this →" linking into its lesson | Public |
| `/terms/`, `/privacy/` | Legal | Public |
| `/sitemap.xml`, `/robots.txt` | Generated at build | Public |

Header: logo, Learn, Daily, Guides, Pricing, Log in / Sign up (or avatar menu: Dashboard, Account, Admin if applicable, Log out). Footer: Guides, Certificate, Pricing, Terms, Privacy, Sitemap, contact email, social links.

## 3. Curriculum

Defined in `content/curriculum.json`: 14 modules, 79 lessons (19 free), in learning order. Each lesson has 6–12 questions. Modules 1–12 cover the core language; 13 covers NumPy, Pandas, plotting and a first ML model; 14 contains optional tracks (algorithms, databases, web/APIs). Each module ends with a **Skill Summary** lesson mixing all its topics.

## 4. Lesson player

Layout (desktop): left = prompt panel; right = code editor over an output console; bottom bar = actions. Mobile: stacked — prompt, editor, output, sticky action bar.

### 4.1 Question types

| Type | Learner does | Graded by |
|---|---|---|
| `explain` | Reads a short explanation with a runnable example, presses Continue | Nothing (no points) |
| `write_code` | Writes code in the editor to meet the prompt | Hidden tests run in Pyodide |
| `fix_code` | Starter code has a bug; fix it | Hidden tests |
| `predict_output` | Reads code, types the exact output | String compare after normalising trailing whitespace |
| `multiple_choice` | Picks one option | Option id compare |
| `fill_blank` | Fills one or more `___` gaps in code | Gaps substituted, then hidden tests (or exact match if `matchMode: "exact"`) |

### 4.2 Controls and behaviour

- **Run** (Shift+Enter): executes the editor code, shows stdout/stderr and the Python traceback in the console. No grading, no points.
- **Check** (Enter, or Ctrl/Cmd+Enter while the editor has focus): grades the answer.
  - Pass → green "Correct! +N pts", confetti-free subtle animation, **Continue →** becomes primary.
  - Fail → red "Not quite" plus the first failing test's *public* message (e.g. "Expected `total` to be 15, got 12"). Hidden test inputs are never shown.
- **Hint**: shows the question's authored hint. After 2 failed checks, also offers **Ask the AI tutor** (§5.6).
- **Show solution**: available after 2 failed checks or immediately via a confirm; viewing it sets that question's points to 0.
- **Previous / Skip**: navigate within the lesson. Skipped questions count as not completed.
- **Reset code**: restores starter code.
- Progress bar across the lesson's questions. On the last question, Continue → lesson summary screen: accuracy %, points earned, streak status, next lesson button, share button.
- First load shows "Loading Python…" while Pyodide initialises in the worker (lazy, cached by the browser); the prompt is readable immediately.
- Execution limits: 5 s CPU timeout per run (worker is terminated and recreated on timeout), 1 MB stdout cap, no network access from user code.

### 4.3 Scoring

- Points per question: `basePoints` from the lesson file (default 10). First-try correct = full points; second try = half; third or later = 2; after viewing the solution = 0.
- Lesson accuracy = first-try-correct questions ÷ gradable questions.
- Points are awarded by the `submitAnswer` Cloud Function, which re-checks the answer signature and rate-limits (§ARCHITECTURE 6). The client shows the result optimistically and reconciles.

## 5. Features

### 5.1 Progress and review status
Per user per lesson store: completed (bool), best accuracy, last practised date. Dashboard status:
- **Not started** (grey), **Needs attention** (accuracy < 70 %, red), **Review due** (last practised ≥ 14 days ago, amber), **Strong** (accuracy ≥ 70 % and < 14 days, green).
- "Next recommended lesson" = first incomplete unlocked lesson; if all complete, the oldest "Review due" lesson.

### 5.2 Points, streaks, leaderboards
- **Daily points**: sum of points earned today (user's local date, stored as UTC date of the user's time zone offset at sign-up; keep it simple and consistent).
- **Streak**: consecutive days with at least one completed lesson or daily challenge.
- **Leaderboards**: "Today's top points" and "Today's top streaks", top 10 plus the user's own rank. Only signed-in users appear; show username, never email.
- Bonus: +100 points once for sharing a completed-lesson card (share intent opened — honour system, once per user).

### 5.3 Sequential unlock
Within a module, lesson *n* unlocks when lesson *n−1* is completed. Module 1 lesson 1 is always open. Modules themselves are not locked to each other (learners can jump), but each module's first lesson shows a "Recommended: finish <previous module> first" note if earlier modules are incomplete.

### 5.4 Daily challenge
- One per day (00:00 UTC rollover), 5 questions drawn from lessons tagged `daily: true`, same set for everyone that day (seeded by date).
- Shows accuracy, time taken and global rank; one scored attempt per user per day; practice replays allowed without score.
- Dashboard shows a 7-day trend of the user's daily challenge accuracy.

### 5.5 Certificate
- Available when every lesson in modules 1–12 is complete (modules 13–14 optional, listed on the certificate if done).
- Learner enters their full name twice (must match); name is permanent once generated.
- Creates a credential ID (10 chars, uppercase, unambiguous alphabet), issue date, modules completed. Public page at `/certificate/<id>/`; PDF download; "Add to LinkedIn" link; search on `/certificate/`.

### 5.6 AI tutor hint
- Button after 2 failed checks. Sends lesson id, question id, the learner's code and the failing test message to the `getHint` function. Returns a hint that guides without giving the full solution. 👍/👎 feedback stored.
- Limits: premium 30/day, free 5/day, anonymous 0.

### 5.7 Groups (teachers / teams)
- A group has one or more admins and many members, joined by invite link with a code.
- Admin portal: member list with lessons completed, average accuracy, last active, CSV export. Admin can remove members and regenerate the invite code.
- Premium can be granted to all members of a group (seat count on the group; set manually by site owner in Phase 7, Stripe seats later).

### 5.8 Projects
Guided multi-step projects with a downloadable dataset and in-browser checks per step. Initial set (all original):
1. **Expense Tracker** (free) — files, dicts, functions, CSV.
2. **Text Adventure** — control flow, classes.
3. **Weather Data Report** — CSV, Pandas, Matplotlib.
4. **Movie Ratings Analysis** — Pandas groupby, plotting.
5. **Spam Classifier** — scikit-learn basics, train/test, accuracy.

### 5.9 Guides (SEO)
One static article per core topic (variables, strings, lists, dicts, loops, functions, classes, exceptions, files, comprehensions…), original prose, 600–1,200 words, with runnable examples and a "Practise this →" link to the matching lesson. Generated at build from Markdown in `content/guides/`.

### 5.10 Feedback
Small "Was this lesson clear?" thumbs widget at the end of each lesson, stored per user per lesson, plus a free-text field.

## 6. Access and gating

| Visitor | Can do |
|---|---|
| Anonymous | All lessons with `free: true` (see curriculum); progress kept in localStorage only; prompted to sign up after completing 2 lessons |
| Free account | Same free lessons, progress saved, leaderboards, daily challenge, streaks, 5 AI hints/day |
| Premium | Every lesson, all projects, flashcard mode, certificate, 30 AI hints/day |
| Group member with granted premium | Same as premium |

When a learner opens a locked lesson the player shows one of three overlays (in this priority): **Sign in required** → **Upgrade to continue** → **Finish lesson N first**.

On sign-up, any localStorage progress is merged into the account.

## 7. Payments

- Plans (prices are config, not hard-coded): Monthly, Annual (highlighted "best value"), Lifetime (one-time).
- Upgrade → Cloud Function creates a Stripe Checkout Session (promotion codes enabled) → redirect → success page → webhook sets the user's entitlement.
- Account page → **Manage subscription** → Stripe Customer Portal (cancel, cancel at period end, update card, invoices).
- Webhooks handled: `checkout.session.completed`, `customer.subscription.created|updated|deleted`, `invoice.payment_failed`.
- Pricing FAQ: cancellation, what's included, educator access (by email), refund policy text placeholder, where to enter a promo code.

## 8. Auth

- Email + password; passwordless email link; password reset; email verification nudge (not blocking).
- Username unique (case-insensitive), 3–20 chars `[a-z0-9_]`.
- Session persisted by Firebase Auth (IndexedDB). Sign-out clears local caches.
- Account deletion: deletes profile and progress, anonymises leaderboard rows, keeps certificates verifiable only if the user opts in.

## 9. Non-functional requirements

- **Performance:** Lighthouse mobile ≥ 90 on `/`, `/learn/`, `/guides/*`. Lesson prompt visible < 1.5 s on fast 4G; Pyodide loads only on the player and is cached.
- **SEO:** static HTML for landing, guides, module pages; canonical tags; Open Graph; generated sitemap including every public route.
- **Privacy:** cookie/consent banner gating analytics; privacy page names Firebase, Stripe, the analytics provider and the AI provider.
- **Security:** see ARCHITECTURE §5. No secrets in client code except the public Firebase config. App Check on callable functions.
- **Accessibility:** WCAG 2.1 AA; full keyboard operation of the player; screen-reader labels on all controls; reduced-motion respected.
- **Browsers:** last 2 versions of Chrome, Edge, Firefox, Safari; iOS Safari 16+.

## 10. Acceptance criteria (product level)

1. An anonymous visitor can open `/`, click Start, complete lesson 1 by writing code that passes hidden tests, and see points awarded locally.
2. A new user can register, see their anonymous progress merged, and appear on today's leaderboard after completing a lesson.
3. A free user opening a premium lesson sees the Upgrade overlay and cannot read its questions via the Firestore API.
4. A test-mode Stripe payment flips the user to premium within 10 s via webhook; cancelling in the portal at period end keeps access until the period ends.
5. Infinite loops in user code stop after 5 s with a clear message, and the next Run works.
6. Completing all lessons in modules 1–12 enables certificate generation; the public certificate page is reachable by ID and searchable.
7. The daily challenge shows the same 5 questions to two different users on the same UTC date.
8. A group admin sees each member's progress and can export CSV.
