# Lesson format

One JSON file per lesson in `content/lessons/<lessonId>.json`, validated by `lesson.schema.json`. The lesson `id` must match an id in `curriculum.json`.

## Top level

| Field | Type | Notes |
|---|---|---|
| `id` | string | `py-<slug>`, from curriculum.json |
| `moduleId` | string | Module id from curriculum.json |
| `title` | string | Shown in the player header |
| `estimatedMinutes` | int | 3–30 |
| `basePoints` | int | Default points per gradable question |
| `intro` | markdown | One or two short paragraphs before question 1 |
| `questions` | array | 6–14 questions, ids `q01`, `q02`… in order |

## Question types

All questions have `id`, `type`, `prompt` (markdown), optional `points` (overrides `basePoints`), `hint`, `explanation`.

| Type | Extra required fields | How it's graded |
|---|---|---|
| `explain` | `exampleCode` (optional, runnable) | Not graded, 0 points |
| `write_code` | `starterCode`, `solution`, `tests`, `hint` | Learner code runs, then every test |
| `fix_code` | same as `write_code`; `starterCode` contains the bug | Same |
| `predict_output` | `code`, `expectedOutput`, `hint` | Learner's text vs `expectedOutput`, trailing whitespace on each line ignored, final newline ignored |
| `multiple_choice` | `options[{id,text}]`, `answer`, `hint` | `answer` id compare |
| `fill_blank` | `template` with `___` per blank, `blanks[]`, `hint`; `tests` unless `matchMode: "exact"` | Blanks substituted into template, then tests run; `exact` compares each blank after trimming |

## Tests

```json
{ "name": "total is correct", "code": "assert total == 15", "message": "Check how you add up the prices — total should be 15." }
```

- Test `code` runs after the learner's code, in the same namespace, so it can read their variables and call their functions.
- `__output__` holds everything the learner's code printed (a string).
- A test passes if it raises nothing. If it raises `AssertionError` with a message, that message is shown; otherwise `message` is shown.
- Messages are public: describe *what* is wrong, never reveal hidden inputs or the full answer.
- Every gradable question needs at least one test that the `starterCode` fails and the `solution` passes (checked by `content/tools/validate.py`).

## Questions that read input

`input()` reads lines from a string. For **Check**, a question's `setupCode` sets `__input__` to the lines the tests type, one per `input()` call:

```json
"setupCode": "__input__ = \"Priya\\n\""
```

Each line is echoed into the output like a terminal, so `__output__` reads `What's your name? Priya\nHello, Priya!`. On **Run**, the learner can type their own lines in the Input box; if it's empty, `__input__` is used. `explain` and `predict_output` code can't read input — keep `input()` out of them.

## Validating

```bash
npm run validate:content                     # all lessons (Pyodide in Node — the same harness as the browser)
npm run validate:content -- py-lists-basics  # one lesson
```

`npm run build` runs this first and stops if any lesson is invalid. `content/tools/validate.py` remains as a Python-only reference (`pip install jsonschema`).
