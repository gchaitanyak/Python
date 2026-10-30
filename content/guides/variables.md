---
title: Python Variables Explained
description: What a Python variable really is, how to name one well, how assignment and reassignment work, and the beginner mistakes to avoid.
lesson: py-variables
---
A variable is a name that points at a value. That one sentence explains almost everything about how variables behave in Python, so it is worth reading twice. A variable is not a box that *contains* a value; it is a label you stick onto a value so you can find it again later.

## Creating a variable

You create a variable the first time you assign to it with a single equals sign. There is no separate step to declare it, and you never write its type.

```python
city = "Lisbon"
population = 545_000
is_capital = True

print(city, population, is_capital)
```

Read `=` as "now refers to", not "equals". The line `city = "Lisbon"` means *the name `city` now refers to the text "Lisbon"*. The underscore in `545_000` is only there to make the number easier to read; Python ignores it.

## Reassigning and updating

Because a variable is just a name, you can point it somewhere else at any time. The old value is not changed; the name simply moves.

```python
score = 10
print("start:", score)

score = score + 5   # read the current value, add 5, store the result
print("after bonus:", score)

score += 3          # a shorter way to write score = score + 3
print("after another bonus:", score)
```

The middle line often confuses people who are used to maths, where `score = score + 5` would be impossible. In Python the right-hand side is worked out first, using the value the name had *before* this line ran, and only then is the name pointed at the result.

## Types come from values, not names

Every value has a type: whole numbers are `int`, decimals are `float`, text is `str`, and `True`/`False` are `bool`. A name has no type of its own, which is why the same name can refer to a number now and some text later. The built-in `type()` function tells you what you are holding.

```python
reading = 21
print(type(reading))

reading = 21.5
print(type(reading))

reading = "twenty-one"
print(type(reading))
```

This flexibility is handy, but it is also a common source of bugs. If a name is sometimes a number and sometimes text, code further down can break in surprising ways. A good habit is to keep each variable holding one kind of thing for its whole life.

## Naming variables well

Python has a few hard rules for names: they can contain letters, digits and underscores, they cannot start with a digit, and they cannot be a reserved word such as `for`, `class` or `True`. Names are case-sensitive, so `total` and `Total` are different variables.

Beyond the rules, the Python community follows a style called *snake_case*: lowercase words joined by underscores, like `monthly_budget` or `items_in_basket`. Pick names that say what the value means, not what type it is. `prices` tells a reader far more than `my_list`, and `seconds_left` is clearer than `t`. Short names such as `i` are fine for a loop counter that lives for two lines, but anything that survives longer deserves a proper name.

## Several names at once

You can assign more than one variable in a single line by separating names and values with commas. This is called *unpacking*, and it is especially neat for swapping two values without a temporary helper.

```python
width, height = 1920, 1080
print(width, "x", height)

left, right = "tea", "coffee"
left, right = right, left
print(left, right)
```

## Two names, one value

Because variables are labels, two names can point at the very same value. With numbers and text this never causes trouble, because those values can't be changed in place. With a list, which *can* be changed, it matters a great deal.

```python
basket = ["apples", "bread"]
shared = basket          # no copy is made: both names point at one list
shared.append("milk")

print(basket)            # the change shows up through both names
print(basket is shared)

copy = list(basket)      # make a real, separate copy
copy.append("eggs")
print(basket)
print(copy)
```

If you ever see a list change "by itself", look for a second name pointing at it. Making a copy with `list(...)` or `.copy()` gives you an independent list.

## Common mistakes

- **Using a variable before assigning it.** Python reads top to bottom, so a name must be assigned on an earlier line. Otherwise you get a `NameError`.
- **Spelling a name two ways.** `total` and `totl` are two different variables. If a value seems to be stuck at its starting point, check for a typo.
- **Confusing `=` with `==`.** One equals sign assigns; two compare. `if count = 3:` is a syntax error, while `if count == 3:` asks a question.
- **Overwriting a built-in.** Naming a variable `list`, `str` or `sum` hides Python's own function with that name for the rest of the program. Choose `items`, `text` or `total` instead.

## Quick recap

A variable is a name pointing at a value. You create it by assigning, you can point it somewhere new whenever you like, and its type is whatever its current value is. Choose descriptive snake_case names, and remember that two names can share one changeable value. With those ideas in place, every other part of Python becomes much easier to follow.
