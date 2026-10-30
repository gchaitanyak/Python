"""Validate lesson files.

Checks: JSON schema, lesson id exists in curriculum.json, question ids in order,
every gradable solution passes its tests, every starter fails at least one test,
multiple-choice answers exist, predict_output matches real output.

Usage: python content/tools/validate.py [lessonId ...]
"""
import json
import pathlib
import sys

import jsonschema

ROOT = pathlib.Path(__file__).resolve().parents[1]
# Validate with the harness the browser ships; fall back to the reference copy.
sys.path.insert(0, str(ROOT / "tools"))
sys.path.insert(0, str(ROOT.parent / "src" / "worker"))
import harness  # noqa: E402

schema = json.loads((ROOT / "lesson.schema.json").read_text())
curriculum = json.loads((ROOT / "curriculum.json").read_text())
known = {l["id"]: m["id"] for m in curriculum["modules"] for l in m["lessons"]}


def check(path: pathlib.Path) -> list[str]:
    errs = []
    lesson = json.loads(path.read_text())
    for e in jsonschema.Draft202012Validator(schema).iter_errors(lesson):
        errs.append(f"schema: {'/'.join(map(str, e.path))}: {e.message}")
    if errs:
        return errs
    if lesson["id"] not in known:
        errs.append(f"id {lesson['id']} not in curriculum.json")
    elif known[lesson["id"]] != lesson["moduleId"]:
        errs.append(f"moduleId should be {known[lesson['id']]}")
    for i, q in enumerate(lesson["questions"], 1):
        tag = f"{q['id']} ({q['type']})"
        if q["id"] != f"q{i:02d}":
            errs.append(f"{tag}: expected id q{i:02d}")
        t = q["type"]
        if t in ("write_code", "fix_code"):
            setup = q.get("setupCode", "")
            good = harness.grade(q["solution"], q["tests"], setup)
            if not good["passed"]:
                errs.append(f"{tag}: solution fails: {[r['message'] for r in good['results'] if not r['passed']]}")
            bad = harness.grade(q["starterCode"], q["tests"], setup)
            if bad["passed"]:
                errs.append(f"{tag}: starterCode already passes all tests")
        elif t == "fill_blank":
            code = harness.fill_template(q["template"], q["blanks"])
            if q.get("matchMode", "tests") == "tests":
                if not q.get("tests"):
                    errs.append(f"{tag}: needs tests unless matchMode is exact")
                elif not harness.grade(code, q["tests"])["passed"]:
                    errs.append(f"{tag}: filled template fails its tests")
        elif t == "predict_output":
            actual = harness.run(q["code"])
            if actual["error"]:
                errs.append(f"{tag}: code raises {actual['error']}")
            elif not harness.check_predict(actual["stdout"], q["expectedOutput"]):
                errs.append(f"{tag}: expectedOutput {q['expectedOutput']!r} but code prints {actual['stdout']!r}")
        elif t == "multiple_choice":
            if q["answer"] not in {o["id"] for o in q["options"]}:
                errs.append(f"{tag}: answer not among option ids")
        elif t == "explain" and q.get("exampleCode"):
            if harness.run(q["exampleCode"])["error"]:
                errs.append(f"{tag}: exampleCode raises an error")
    return errs


def main() -> int:
    ids = sys.argv[1:]
    files = sorted((ROOT / "lessons").glob("*.json"))
    if ids:
        files = [f for f in files if f.stem in ids]
    failed = 0
    for f in files:
        errs = check(f)
        print(("FAIL " if errs else "ok   ") + f.stem)
        for e in errs:
            print("     - " + e)
        failed += bool(errs)
    print(f"{len(files) - failed}/{len(files)} lessons valid")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
