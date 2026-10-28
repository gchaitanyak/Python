# Decisions

Choices made where the spec was open. Newest last.

## Phase 0

1. **Page routing.** Each route lives in `src/pages/<dir>/` (layout from ARCHITECTURE §3) and is listed once in `src/lib/routes.ts`. A small Vite plugin serves `src/pages/home/` at `/` in dev and moves `dist/home/index.html` to `dist/index.html` after build. Every other route's folder name equals its URL (`learn/` → `/learn/`).
2. **Header and footer are rendered at build time.** `src/components/header.ts` / `footer.ts` return HTML strings that the Vite plugin injects at `<!-- @header -->` / `<!-- @footer -->`. Pages are complete static HTML (crawlable, no layout shift, work without JS). The account slot (`data-account-slot`) is swapped for the avatar menu client-side in Phase 3.
3. **Only `/` and `/learn/` exist.** Header/footer link to routes from SPEC §2 that later phases build; those 404 until then.
4. **`validate:content` runs the Python validator for now.** `npm run validate:content` → `python3 content/tools/validate.py` (needs `pip install -r content/tools/requirements.txt`). Phase 2 replaces it with `scripts/validate-content.ts` on Pyodide in Node. The validator now imports `src/worker/harness.py` (the copy the browser ships), so lessons are validated with the exact grading code learners get; `content/tools/harness.py` stays as the reference.
5. **Harness port changes** (`src/worker/harness.py`): separate stdout/stderr capture, each capped at 1 MB (`OutputLimitError` ends runaway print loops, SPEC §4.2); `run_public()` returns a JSON-safe result for the worker; output printed while tests run is discarded instead of leaking to the console. Grading results are otherwise identical.
6. **Firebase project id `demo-python-exercises`.** The `demo-` prefix lets the Emulator Suite run with no Firebase login or real project. Set the real id in `.firebaserc` / `.env.local` before the first deploy.
7. **Firestore rules start from the ARCHITECTURE §5.1 outline,** with two hardening tweaks: `isPremium()` tolerates a missing user doc / missing fields, and progress docs allow `update` (not `create`) so the `diff()` never runs against a missing document. Phase 3 completes rules and tests.
8. **Functions** use Node 22, TypeScript, firebase-functions v2 API, and one placeholder `health` HTTP function so the Functions emulator has something to load. `npm install` at the root also installs `functions/` (postinstall).
9. **Playwright** is pinned to the exact version matching the pre-installed Chromium (1.63.0). e2e currently runs against the Vite dev server only; emulators join the e2e web server once pages talk to Firebase (Phase 3).
10. **Pyodide will be self-hosted** under `/pyodide/` from the `pyodide` npm package (ARCHITECTURE §5.2 prefers this; the jsDelivr CDN is also blocked in the build environment). Phase 1.
11. **Contact email** in the footer is the placeholder `hello@example.com`; social links point to network home pages. Replace before launch.
12. **TypeScript 7** (latest) for both the site and functions; functions compile with `module: NodeNext` to CommonJS.
