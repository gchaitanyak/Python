# Python Exercises — Build Pack for Claude Code

This folder is a complete brief for Claude Code to build a gamified Python practice website. It works like ExcelExercises.com (bite-sized interactive lessons, instant feedback, points, streaks, leaderboards, free tier + subscription, certificate), but teaches Python and runs code in the browser.

## How to use it

1. Create an empty project folder and copy everything in this pack into it.
2. Open a terminal in that folder and start Claude Code: `claude`
3. Give it this first prompt:

   > Read CLAUDE.md and every file it lists. Then start docs/BUILD_PLAN.md Phase 0. Stop at the end of the phase and show me the acceptance checks.

4. After each phase, review, then say: `Continue with the next phase.`

You'll need, at the points the build plan says:
- A Firebase project (free Spark plan is enough until Phase 5; Functions need the Blaze plan).
- A Stripe account in test mode (Phase 5).
- An LLM API key for AI hints (Phase 6, optional).

## What's inside

| File | Purpose |
|---|---|
| `CLAUDE.md` | Instructions Claude Code reads first: stack, rules, commands, conventions |
| `docs/SPEC.md` | Product spec: pages, features, flows, gating, gamification, acceptance criteria |
| `docs/ARCHITECTURE.md` | Architecture diagram, folder layout, data model, security rules, functions, grading engine |
| `docs/BUILD_PLAN.md` | Seven phases with tasks and acceptance checks |
| `docs/CONTENT_GUIDE.md` | How to write lessons and questions |
| `content/curriculum.json` | 14 modules, 79 lessons, learning order, free/premium flags, objectives, reference links |
| `content/SCHEMA.md`, `content/lesson.schema.json` | Lesson and question format |
| `content/lessons/*.json` | Three fully written sample lessons (variables, lists, functions) |
| `content/tools/harness.py`, `validate.py` | Reference grading harness and lesson validator (`pip install jsonschema`, then `python content/tools/validate.py`) |

## Where it came from

- **Mechanics** are taken from a teardown of ExcelExercises.com: lesson player, points, daily leaderboards, streaks, accuracy-based review, sequential unlock, free-lesson limit, Stripe subscriptions, certificate with public verification, group admins, daily challenge, projects.
- **Scope and order** of the Python curriculum come from the lesson lists of W3Schools, the official Python tutorial, Programiz, GeeksforGeeks, LearnPython.org, Kaggle Learn and Google's Python Class. Only links and topic names are used; all lesson content must be original.
