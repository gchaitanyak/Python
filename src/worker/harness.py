"""Grading harness shipped to the browser (loaded into Pyodide by python.worker.ts).

Ported from content/tools/harness.py with the same grading behaviour, plus:
- stdout and stderr are captured separately, each capped at 1 MB;
- `run_public()` returns a JSON-safe dict (no namespace) for the worker;
- output printed while tests run is discarded instead of leaking to the console.

content/tools/validate.py imports this file, so lesson validation exercises the
exact code learners are graded by.
"""
import contextlib
import io
import traceback

OUTPUT_LIMIT = 1_000_000  # characters, per stream


class OutputLimitError(Exception):
    """Raised when learner code prints more than OUTPUT_LIMIT characters."""


class _CappedIO(io.StringIO):
    def write(self, s: str) -> int:
        room = OUTPUT_LIMIT - self.tell()
        if len(s) > room:
            super().write(s[:max(room, 0)])
            raise OutputLimitError("Your code printed more than 1 MB of output — check for a loop that never ends.")
        return super().write(s)


def _last_error(exc: BaseException, filename: str) -> dict:
    line = None
    for frame in traceback.extract_tb(exc.__traceback__):
        if frame.filename == filename:
            line = frame.lineno
    if isinstance(exc, SyntaxError):
        line = exc.lineno
    return {"type": type(exc).__name__, "message": str(exc), "line": line}


def run(code: str, setup_code: str = "") -> dict:
    """Run code (no grading). Returns stdout, stderr, any error and the namespace."""
    ns: dict = {"__name__": "__main__"}
    out = _CappedIO()
    err = _CappedIO()
    error = None
    try:
        if setup_code:
            exec(compile(setup_code, "<setup>", "exec"), ns)
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            exec(compile(code, "<learner>", "exec"), ns)
    except BaseException as exc:  # noqa: BLE001 — report everything to the learner
        error = _last_error(exc, "<learner>")
    return {"stdout": out.getvalue(), "stderr": err.getvalue(), "error": error, "namespace": ns}


def run_public(code: str, setup_code: str = "") -> dict:
    """`run()` without the namespace, safe to send back to the main thread."""
    result = run(code, setup_code)
    result.pop("namespace")
    return result


def grade(code: str, tests: list, setup_code: str = "") -> dict:
    """Run learner code then every test. Question passes when all tests pass."""
    result = run(code, setup_code)
    ns = result.pop("namespace")
    if result["error"]:
        err = result["error"]
        where = f" (line {err['line']})" if err["line"] else ""
        return {"passed": False, "stdout": result["stdout"], "stderr": result["stderr"], "error": err,
                "results": [{"name": "runs without errors", "passed": False,
                             "message": f"{err['type']}: {err['message']}{where}"}]}
    ns["__output__"] = result["stdout"]
    results = []
    for t in tests:
        try:
            # Tests may call learner functions that print; keep that out of the console.
            with contextlib.redirect_stdout(_CappedIO()), contextlib.redirect_stderr(_CappedIO()):
                exec(compile(t["code"], "<test>", "exec"), ns)
            results.append({"name": t["name"], "passed": True, "message": ""})
        except AssertionError as exc:
            results.append({"name": t["name"], "passed": False, "message": str(exc) or t["message"]})
        except BaseException:  # noqa: BLE001 — a test crashing means the learner's code doesn't meet it
            results.append({"name": t["name"], "passed": False, "message": t["message"]})
    return {"passed": all(r["passed"] for r in results), "stdout": result["stdout"],
            "stderr": result["stderr"], "error": None, "results": results}


def check_predict(learner_text: str, expected: str) -> bool:
    norm = lambda s: "\n".join(line.rstrip() for line in s.strip("\n").splitlines())
    return norm(learner_text) == norm(expected)


def fill_template(template: str, values: list) -> str:
    parts = template.split("___")
    if len(parts) - 1 != len(values):
        raise ValueError("number of blanks does not match number of values")
    out = parts[0]
    for value, rest in zip(values, parts[1:]):
        out += value + rest
    return out
