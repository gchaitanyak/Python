---
title: Handling Errors with try and except
description: Read Python tracebacks, catch the exceptions you expect with try and except, use else and finally, raise your own errors and avoid hiding real bugs.
lesson: py-try-except
---
Things go wrong in every program: a user types letters where you wanted a number, a file is missing, a network request fails. Python reports these problems as **exceptions**. Left alone, an exception stops your program with an error message. With `try` and `except` you can catch it and decide what happens instead.

## Reading an error message

When an exception isn't handled, Python prints a *traceback*. Read it from the bottom up: the last line names the exception and gives a message, and the lines above show where it happened.

```python
prices = {"tea": 2.5}
try:
    print(prices["coffee"])
except KeyError as error:
    print("Missing key:", error)
```

Common exceptions you'll meet early on include `ValueError` (right type, wrong value, such as `int("ten")`), `TypeError` (wrong type, such as `"3" + 4`), `KeyError`, `IndexError`, `ZeroDivisionError` and `FileNotFoundError`. Each name tells you what kind of problem occurred.

## Catching an exception

Put the code that might fail inside `try`. If an exception happens, Python jumps straight to the matching `except` block and carries on from there. If nothing goes wrong, the `except` block is skipped.

```python
def to_number(text):
    try:
        return float(text)
    except ValueError:
        return None

for raw in ["12.5", " 7 ", "twelve", ""]:
    print(repr(raw), "->", to_number(raw))
```

Always name the exception you expect. A bare `except:` catches *everything*, including typing mistakes in your own code, and turns real bugs into silent wrong answers.

## Several kinds of failure

A `try` block can have more than one `except`, each handling a different exception. You can also list several exceptions in one block with a tuple.

```python
def safe_ratio(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return "can't divide by zero"
    except (TypeError, ValueError) as err:
        return f"bad input: {err}"

print(safe_ratio(10, 4))
print(safe_ratio(10, 0))
print(safe_ratio("10", 2))
```

Python checks the `except` blocks in order and uses the first one that matches.

## else and finally

Two optional blocks round out the statement. `else` runs only when the `try` block finished *without* an exception, which keeps the risky part of the code small and obvious. `finally` runs no matter what — success, handled error or unhandled error — so it's the place for clean-up.

```python
def parse_age(text):
    try:
        age = int(text)
    except ValueError:
        print(f"{text!r} isn't a whole number")
    else:
        print("age accepted:", age)
    finally:
        print("checked", repr(text))

parse_age("42")
parse_age("forty")
```

In practice you rarely need `finally` for files, because a `with` block closes the file for you even when something fails.

## Raising your own exceptions

Your own functions should complain clearly when they're given something they can't handle. `raise` creates an exception on purpose. Pick a built-in exception that fits, and write a message that says what was wrong.

```python
def set_volume(level):
    if not 0 <= level <= 10:
        raise ValueError(f"volume must be 0-10, got {level}")
    return level

print(set_volume(7))
try:
    set_volume(11)
except ValueError as err:
    print("Refused:", err)
```

Raising early, at the point where bad data arrives, is much kinder than letting a strange value travel through your program and cause a confusing error far away.

## Custom exception classes

For larger programs you can define your own exception types by inheriting from `Exception`. Callers can then catch exactly your errors and nothing else.

```python
class OutOfStock(Exception):
    pass

def order(item, stock):
    if stock.get(item, 0) == 0:
        raise OutOfStock(item)
    stock[item] -= 1

shelf = {"pens": 1}
for attempt in range(2):
    try:
        order("pens", shelf)
        print("ordered a pen")
    except OutOfStock as err:
        print("sorry, no more", err)
```

## Where to catch errors

Not every function should catch every error. A good rule is to handle an exception at the place that knows what to do about it. A low-level function that reads a file usually shouldn't decide what to tell the user; it can let `FileNotFoundError` travel upward to code that can show a friendly message or try another file.

It is also fine — often better — to check a condition first when the check is simple: `if key in data` reads clearly. Use `try` when failure is genuinely possible and checking first would be awkward or unreliable, such as converting text to a number.

## Common mistakes

- **Bare `except:`.** It hides bugs. Name the exceptions you expect.
- **A huge `try` block.** Keep only the risky line or two inside, so you know what you're catching.
- **Swallowing errors silently.** If you catch an exception, do something useful: return a default, log it, or tell the user.
- **Catching to "fix" a bug.** If code raises `TypeError` because of a mistake, fix the mistake instead.

## Quick recap

Exceptions report problems. Catch the ones you expect with `try` and a named `except`, use `else` for code that should run only on success and `finally` for clean-up, and `raise` clear errors from your own functions. Handled well, errors turn crashes into helpful messages.
