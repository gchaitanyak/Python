---
title: Python Lists for Beginners
description: Store ordered collections with Python lists — create them, read and change items, add and remove, sort, loop and avoid the shared-list trap.
lesson: py-lists-basics
---
A **list** keeps several values in order under one name. Shopping items, exam scores, rows read from a file: whenever you have "some number of things", a list is usually the first tool to reach for. Lists are written with square brackets and commas.

## Creating and reading a list

Items keep the order you give them, and each has an index starting at zero. Negative indexes count from the end, and slicing works just as it does for strings.

```python
planets = ["Mercury", "Venus", "Earth", "Mars"]
print(planets[0])       # the first item
print(planets[-1])      # the last item
print(planets[1:3])     # a new list with items 1 and 2
print(len(planets))     # how many items
```

A list can hold any mix of types, including other lists, but in practice lists work best when every item is the same kind of thing.

## Changing items

Unlike strings, lists are *mutable*: you can change them after creating them. Assign to an index to replace one item.

```python
temps = [18, 21, 19, 25]
temps[2] = 20
print(temps)
```

## Adding and removing

These methods change the list itself and return `None`, so call them on their own line rather than assigning the result.

- `append(x)` adds one item to the end.
- `extend(other)` adds every item from another list.
- `insert(i, x)` puts an item at position `i`, shifting the rest along.
- `remove(x)` deletes the first item equal to `x`.
- `pop()` removes and returns the last item, or `pop(i)` the item at position `i`.

```python
queue = ["Ana", "Ben"]
queue.append("Caro")
queue.insert(0, "Dev")
queue.extend(["Eli", "Fay"])
served = queue.pop(0)
queue.remove("Eli")
print(served)
print(queue)
```

`remove` raises a `ValueError` if the item isn't there, and `pop` raises an `IndexError` on an empty list. Check with `in` first when you aren't sure.

## Looking things up

The `in` operator tells you whether a value is present, `index()` returns its position, and `count()` says how many times it appears. For numbers, the built-ins `sum()`, `min()` and `max()` work on the whole list at once.

```python
scores = [72, 88, 95, 61, 88]
print(88 in scores)
print(scores.index(95))
print(scores.count(88))
print(sum(scores) / len(scores), min(scores), max(scores))
```

## Sorting

There are two ways to sort. `sort()` rearranges the list itself, while `sorted()` returns a new sorted list and leaves the original alone. Both accept `reverse=True`, and a `key` function that says what to sort by.

```python
words = ["banana", "apple", "Cherry", "date"]
print(sorted(words))                  # capitals sort before lowercase
print(sorted(words, key=str.lower))   # sort ignoring case
print(sorted(words, key=len, reverse=True))

numbers = [5, 2, 9, 1]
numbers.sort()
print(numbers)
```

Use `sorted()` when you still need the original order, and `sort()` when you don't.

## Looping over a list

A `for` loop visits each item in order. When you also need the position, `enumerate()` hands you both.

```python
tasks = ["write report", "email Sam", "book train"]
for number, task in enumerate(tasks, start=1):
    print(f"{number}. {task}")
```

Building a new list from an old one is so common that Python has a compact syntax for it, the *list comprehension*. `[p * 1.2 for p in prices]` makes a list of every price with tax added. It deserves a guide of its own, but it's good to recognise it early.

## The shared-list trap

A variable is a name pointing at a value, so two names can point at one list. Changes through either name then show up through both. This catches almost everyone once.

```python
original = [1, 2, 3]
alias = original
alias.append(4)
print(original)          # changed too!

copy = original.copy()
copy.append(5)
print(original, copy)    # now they are independent
```

The same thing happens when you pass a list into a function: the function receives the same list, not a copy, so any `append` inside it changes the caller's list. Copy deliberately when you need an independent list.

## Lists or something else?

Lists are ideal for ordered items you'll add to, remove from or loop over. If you need to look values up by a name, a dictionary is a better fit. If the collection should never change, such as a pair of coordinates, a tuple signals that intent. And if you only care whether something is present, with no duplicates, reach for a set.

## Quick recap

Lists hold items in order, can be changed in place, and come with methods to add, remove, find and sort. Index and slice them like strings, loop over them with `for` and `enumerate`, and remember that two names can share one list. With lists under your belt, most everyday data tasks are within reach.
