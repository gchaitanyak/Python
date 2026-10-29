# Content Guide — writing lessons

The three files in `content/lessons/` are the style reference. Match them.

## Rules

1. **Original only.** Use the `references` in `curriculum.json` to check scope, then close them. Don't copy or closely paraphrase their text, examples, datasets or exercises. Invent your own scenarios.
2. **One idea per question.** If a prompt needs "and then", consider splitting it.
3. **Learn by doing.** At most 2 `explain` questions per lesson; at least half the questions are `write_code` or `fix_code`.
4. **Everyday scenarios.** Shopping lists, step counts, cafés, playlists, budgets, weather, sports scores. Avoid foo/bar. Keep names inclusive and varied.
5. **Plain language.** Sentences under 20 words. Define a term the first time it appears. Use the learner's vocabulary from earlier lessons only.
6. **Only taught concepts.** A question may use only what was taught in this or earlier lessons (check `curriculum.json` order).

## Lesson shape

| Position | Typical type |
|---|---|
| q01 | `explain` with runnable `exampleCode` |
| q02–q03 | Easiest `write_code` + a `predict_output` or `multiple_choice` to confirm the mental model |
| middle | `write_code`, `fix_code` (classic mistake), `fill_blank` |
| last 1–2 | A small realistic task combining the lesson's ideas |

6–14 questions, 8–12 minutes. Skill Summary lessons: 8–10 questions, no `explain`, mix every lesson in the module.

## Writing tests

- Test behaviour, not exact code. Call the learner's function with **at least one input not shown in the prompt** so hard-coding fails.
- Include an edge case where it matters (empty list, zero, negative).
- Put a helpful assertion message on every test: say what was expected, not how to write it.
- For printed output, compare `__output__.strip()` or `__output__.split()`; don't be strict about trailing spaces.
- Don't import modules the lesson hasn't taught unless the test needs them internally.
- `starterCode` must fail at least one test; `solution` must pass all of them (`validate.py` enforces both).

## Hints and explanations

- **Hint:** points to the tool, doesn't give the answer. "`len()` returns how many items…", not "write `len(guests)`".
- **Explanation:** one or two sentences on *why* the answer works or why the common mistake fails.

## Fix-code questions

Base the bug on a real beginner mistake: `print` instead of `return`, off-by-one in `range`, `=` vs `==`, mutating while iterating, missing `int()` on `input()`, wrong indentation.

## Validator limits

`npm run validate:content` runs every starter and solution in one Pyodide process, so it can't stop an endless loop. A `starterCode` with an infinite loop would hang it. Base loop bugs on off-by-one or wrong-condition mistakes that still finish, and make recursive bugs hit Python's *RecursionError*.

## Before committing

```bash
npm run validate:content -- <lessonId>
```

Then set the lesson's `status` to `"written"` in `curriculum.json`.
