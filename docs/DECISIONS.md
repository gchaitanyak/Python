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
