---
title: List and Dictionary Comprehensions
description: Build lists, dictionaries and sets in one readable line with Python comprehensions — mapping, filtering, conditional values and when a loop is clearer.
lesson: py-comprehensions
---
A huge number of loops follow the same shape: start with an empty list, go through some items, maybe skip a few, and append a transformed version of each one. Python has a compact way to write exactly that pattern, called a **comprehension**. Once you can read them, you'll see them everywhere in Python code.

## From loop to comprehension

Here is the long way to square a list of numbers, followed by the comprehension that does the same job.

```python
numbers = [1, 2, 3, 4, 5]

squares = []
for n in numbers:
    squares.append(n * n)
print(squares)

squares = [n * n for n in numbers]
print(squares)
```

Read the comprehension as a sentence: "a list of `n * n`, for each `n` in `numbers`". The expression comes first, then the loop. The square brackets tell you the result is a list.

## Filtering with if

Add an `if` at the end to keep only the items that pass a test. Items that fail are skipped entirely.

```python
temps = [14, 22, 9, 27, 18, 31]
warm = [t for t in temps if t >= 20]
print(warm)

words = ["kiwi", "", "fig", "  ", "mango"]
clean = [w.strip() for w in words if w.strip()]
print(clean)
```

The second example strips each word and leaves out the ones that were empty — a very common clean-up step when reading data.

## Choosing between two values

Sometimes you want to keep every item but transform it one of two ways. Put a conditional expression, `a if condition else b`, in the expression part at the front. Note the position: filtering `if` goes at the end, while an `if ... else` that picks a value goes at the front.

```python
scores = [45, 82, 67, 90, 38]
labels = ["pass" if s >= 50 else "fail" for s in scores]
print(labels)
```

## Dictionary comprehensions

Curly braces with a `key: value` pair build a dictionary instead. This is ideal for turning one collection into a lookup table.

```python
names = ["ana", "ben", "caro"]
lengths = {name: len(name) for name in names}
print(lengths)

prices = {"tea": 2.5, "cake": 4.0, "jam": 3.25}
discounted = {item: round(p * 0.9, 2) for item, p in prices.items() if p > 3}
print(discounted)
```

## Set comprehensions

Curly braces without a colon build a *set*, which keeps only unique values. That's handy for "which different values appear?" questions.

```python
emails = ["sam@shop.example", "jo@mail.example", "ali@shop.example"]
domains = {e.split("@")[1] for e in emails}
print(sorted(domains))
```

## Generator expressions

With round brackets, a comprehension becomes a *generator expression*. It produces values one at a time instead of building a whole list, which saves memory. You'll most often see it passed straight into a function such as `sum`, `max` or `any`.

```python
orders = [{"item": "lamp", "qty": 2, "price": 30}, {"item": "rug", "qty": 1, "price": 80}]
total = sum(o["qty"] * o["price"] for o in orders)
print(total)
print(any(o["price"] > 50 for o in orders))
```

When a generator expression is the only argument, you don't need an extra pair of brackets around it.

## Nested loops in a comprehension

A comprehension can contain more than one `for`. They run in the same order as nested loops written out in full: the first `for` is the outer loop.

```python
sizes = ["S", "M"]
colours = ["red", "blue"]
variants = [f"{c}-{s}" for c in colours for s in sizes]
print(variants)

grid = [[1, 2, 3], [4, 5, 6]]
flat = [n for row in grid for n in row]
print(flat)
```

Two `for` clauses are still readable. Beyond that, a regular loop is usually clearer.

## When not to use a comprehension

Comprehensions are for *building a collection*. If you're looping to print something, update a file or change other variables, use an ordinary `for` loop. And if a comprehension needs several conditions, nested loops and a long expression, split it up — clear code beats clever code. A good test: if you can't read it aloud as one sentence, write it as a loop.

## Common mistakes

- **Using a comprehension only for its side effects.** `[print(x) for x in items]` builds a useless list of `None`s; use a loop.
- **Putting the filter in the wrong place.** Filtering `if` goes at the end; a value-choosing `if ... else` goes at the front.
- **Forgetting it's a new list.** A comprehension never changes the original; assign the result.
- **Over-nesting.** More than two `for` clauses is a sign to write a loop.

## Quick recap

A comprehension builds a collection in one line: square brackets for lists, braces with `key: value` for dictionaries, braces alone for sets, and round brackets for a lazy generator. Add `if` at the end to filter, `if ... else` at the front to choose values, and switch back to a loop as soon as readability suffers.
