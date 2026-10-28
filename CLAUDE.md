# CLAUDE.md — Python Exercises (working name)

You are building a gamified, browser-based **Python practice website** modelled on the way ExcelExercises.com teaches Excel: short interactive lessons, the learner types real code, gets instant feedback, earns points and streaks, and unlocks more content with an account and a subscription.

Read these files before writing any code, in this order:

1. `docs/SPEC.md` — what the product does (pages, features, user flows, gating, gamification). The source of truth for behaviour.
2. `docs/ARCHITECTURE.md` — stack, folder layout, data model, security rules, Cloud Functions, grading engine.
3. `docs/BUILD_PLAN.md` — the phases to build in, each with acceptance checks. Work one phase at a time.
4. `content/SCHEMA.md` + `content/lesson.schema.json` — the lesson/question format.
5. `content/curriculum.json` — every module and lesson to build, in learning order, with reference links.
6. `content/lessons/*.json` — three fully written sample lessons. Match their style for every new lesson.
7. `docs/CONTENT_GUIDE.md` — rules for writing lesson content.
8. `docs/reference/excelexercises-analysis.md` — background only: the teardown of ExcelExercises.com these mechanics come from. Do not copy its branding or content.

## Ground rules

- **Original content only.** `curriculum.json` lists lessons on W3Schools, Python.org, Programiz, GeeksforGeeks, LearnPython.org, Kaggle and Google as *references for scope*. Never copy their text, examples or exercises. Write new explanations, new datasets and new questions.
- **No ExcelExercises branding, copy, images or layout copying.** Same *mechanics*, our own design and words.
- **Code runs in the browser.** User code executes in Pyodide inside a Web Worker. Never send user code to our servers for execution.
- **The paywall is enforced in Firestore security rules**, not just hidden in the UI. Premium lesson content must be unreadable to non-premium users.
- **Scores are written by Cloud Functions**, never directly by the client.
- Keep secrets out of the repo. Use `.env.local` (git-ignored) and Firebase/Stripe environment config. Commit `.env.example` only.
- Accessibility: keyboard-first (Enter = Check, Shift+Enter = Run), visible focus states, WCAG AA contrast, works at 375px width.

## Tech stack (decided — do not swap without asking)

| Concern | Choice |
|---|---|
| Build tool | Vite (multi-page) |
| Language | TypeScript, strict mode |
| UI | Vanilla TS + small components (no React) — mirrors the static-pages-plus-JS model; switch to React only if the user asks |
| Styling | Plain CSS with custom properties (design tokens in `src/styles/tokens.css`) |
| Code editor | CodeMirror 6 with Python language support |
| Python runtime | Pyodide (latest stable), loaded lazily in a Web Worker |
| Auth | Firebase Auth — email/password + passwordless email link |
| Database | Cloud Firestore |
| Server logic | Firebase Cloud Functions (Node.js, TypeScript) |
| Hosting | Firebase Hosting |
| Payments | Stripe Checkout + Stripe Customer Portal (via Cloud Functions + webhook) |
| AI hints | Cloud Function proxy to an LLM API (key server-side only) |
| Analytics | Google Analytics 4 (consent-gated) |
| Tests | Vitest (unit), Playwright (end-to-end), Firebase Emulator Suite (rules + functions) |

## Commands (create these in phase 0)

```bash
npm install
npm run dev            # Vite dev server + Firebase emulators
npm run build          # type-check, build static site, generate sitemap
npm run test           # Vitest
npm run test:e2e       # Playwright against emulators
npm run test:rules     # Firestore security rules tests
npm run validate:content   # validate content/**/*.json against lesson.schema.json and run every lesson's reference solutions through its tests
npm run deploy         # firebase deploy (hosting, functions, rules)
```

## Conventions

- Folder layout is defined in `docs/ARCHITECTURE.md` §3. Don't invent new top-level folders.
- One route = one HTML entry in `vite.config.ts`. Lesson player is a single page: `/practice/?lesson=<lessonId>`.
- Lesson IDs are stable kebab-case strings from `curriculum.json` (e.g. `py-lists-basics`). Never renumber.
- Every new lesson JSON must pass `npm run validate:content` before commit: schema-valid, and its `solution` passes its own tests while `starterCode` fails them.
- Commit per completed task with a clear message. Don't start the next phase until the current phase's acceptance checks pass.
- When something in the spec is ambiguous, pick the simplest option that satisfies the acceptance checks and note it in `docs/DECISIONS.md`.
