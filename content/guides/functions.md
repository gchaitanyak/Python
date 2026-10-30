---
title: Writing Functions in Python
description: Package code into reusable Python functions — parameters, return values, defaults, keyword arguments, scope and docstrings, with the mistakes to avoid.
lesson: py-functions-basics
---
A **function** is a named block of code that does one job. You write it once and call it whenever you need that job done, with different inputs each time. Functions keep programs short, make them easier to test, and let you think about a problem one piece at a time.

## Defining and calling a function

`def` starts a function, followed by its name, parentheses and a colon. The indented lines below are its body. Nothing in the body runs until you *call* the function by writing its name with parentheses.

```python
def greet():
    print("Hello there!")

greet()
greet()
```

## Parameters and arguments

Parameters are names listed in the parentheses; they receive the values passed in when the function is called. Those values are called arguments.

```python
def greet(name, greeting):
    print(f"{greeting}, {name}!")

greet("Priya", "Good morning")
greet("Tom", "Hi")
```

Arguments are matched to parameters by position. You can also pass them by name, which makes calls clearer and lets you give them in any order: `greet(greeting="Hey", name="Lou")`.

## Returning a value

`print` shows something on the screen, but it doesn't hand anything back to the code that called the function. To give back a result, use `return`. The call then *becomes* that value, so you can store it, print it or pass it on.

```python
def area(width, height):
    return width * height

kitchen = area(3.5, 4)
hall = area(1.5, 6)
print(kitchen, hall, kitchen + hall)
```

`return` also ends the function immediately. A function with no `return` gives back `None`, which is why printing the result of a function that only prints shows `None`.

```python
def shout(text):
    print(text.upper())

result = shout("careful")
print(result)
```

This difference — printing versus returning — is the single most common source of confusion with functions. A useful rule: functions that *work something out* should return it, and let the caller decide whether to print.

## Default values

A parameter can have a default, used when the caller leaves it out. Parameters with defaults go after the ones without.

```python
def price_with_tax(price, rate=0.2):
    return round(price * (1 + rate), 2)

print(price_with_tax(50))
print(price_with_tax(50, rate=0.05))
```

One trap: don't use a list or dictionary as a default. The same object is shared between calls, so items pile up. Use `None` and create a fresh list inside the function instead.

```python
def add_tag(tag, tags=None):
    if tags is None:
        tags = []
    tags.append(tag)
    return tags

print(add_tag("new"))
print(add_tag("sale"))   # a fresh list each time
```

## Returning several values

A function can return several values separated by commas. They come back as a tuple, which you can unpack straight into names.

```python
def min_max(numbers):
    return min(numbers), max(numbers)

low, high = min_max([7, 3, 9, 4])
print(low, high)
```

## Scope: where names live

Names created inside a function are *local*: they exist only while the function runs and can't be seen outside it. This is a feature — it means a function can use a name like `total` without accidentally changing a `total` elsewhere in your program.

```python
def average(values):
    total = sum(values)
    return total / len(values)

total = "unchanged"
print(average([2, 4, 9]))
print(total)
```

A function *can* read names defined outside it, but relying on that makes functions harder to understand and test. Prefer passing in what a function needs as parameters and returning what it produces.

## Documenting a function

A string on the first line of the body is a *docstring*. It explains what the function does, and tools such as `help()` and code editors display it.

```python
def bmi(weight_kg, height_m):
    """Body mass index from weight in kilograms and height in metres."""
    return round(weight_kg / height_m ** 2, 1)

print(bmi(70, 1.75))
print(bmi.__doc__)
```

## Small functions, one job each

Good functions are short and do one thing that their name describes: `load_orders`, `total_by_month`, `format_report`. When a function grows long, look for a piece you could name and move into its own function. Programs built this way read almost like a list of steps, and each step can be tested on its own.

## Common mistakes

- **Printing instead of returning.** If you need the value later, `return` it.
- **Forgetting the parentheses.** `greet` refers to the function; `greet()` calls it.
- **Code after `return`.** Lines after a `return` in the same block never run.
- **Mutable defaults.** Use `None` as the default and build lists inside.
- **Too many responsibilities.** Split long functions into smaller, named steps.

## Quick recap

Define a function with `def`, give it parameters for its inputs, and `return` its result. Use defaults and keyword arguments to make calls clear, keep names local, and document each function with a docstring. Mastering functions is the step that turns scripts into programs.
