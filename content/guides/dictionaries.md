---
title: Python Dictionaries Made Simple
description: Use Python dictionaries to look values up by key — create, read safely, update, loop over and count with them, and nest them for structured data.
lesson: py-dictionaries
---
A **dictionary** stores pairs: a *key* you look things up by, and the *value* it leads to. Think of a phone book, where a name leads to a number, or a product code that leads to a price. Whenever you find yourself searching a list for "the one that matches", a dictionary is probably the better tool.

## Creating a dictionary

Dictionaries use curly braces, with a colon between each key and its value. Keys are usually strings or numbers and must be unique; values can be anything.

```python
prices = {"tea": 2.5, "coffee": 3.0, "cake": 4.25}
print(prices)
print(prices["coffee"])
print(len(prices))
```

Looking up a key is instant no matter how big the dictionary grows, which is a big part of why dictionaries are so useful.

## Reading safely

Square brackets raise a `KeyError` if the key isn't there. When a key might be missing, use `get()`, which returns `None` or a default you choose. The `in` operator checks for a key without reading it.

```python
stock = {"pens": 12, "pads": 0}
print(stock.get("pens"))
print(stock.get("staplers", 0))
print("pads" in stock, "rulers" in stock)
```

Note that `in` checks keys, not values. To search values, use `value in stock.values()`.

## Adding, changing and removing

Assigning to a key adds it if it's new and replaces its value if it already exists. `pop()` removes a key and gives you its value, and `update()` merges another dictionary in.

```python
profile = {"name": "Sam", "city": "Leeds"}
profile["city"] = "York"          # change
profile["languages"] = ["Python"] # add
age = profile.pop("age", None)    # remove if present, no error if not
profile.update({"team": "data", "city": "Hull"})
print(profile)
print(age)
```

## Looping over a dictionary

Looping over a dictionary gives you its keys. More often you want the keys and values together, which `items()` provides. Dictionaries remember the order keys were added, so loops run in that order.

```python
hours = {"Mon": 7.5, "Tue": 8, "Wed": 6.5}
for day, worked in hours.items():
    print(f"{day}: {worked} hours")
print("total:", sum(hours.values()))
```

## Counting with a dictionary

One of the most common jobs for a dictionary is counting how often things occur. Start each count at zero with `get()` and add one each time.

```python
words = "the cat and the dog and the bird".split()
counts = {}
for word in words:
    counts[word] = counts.get(word, 0) + 1
print(counts)

most = max(counts, key=counts.get)
print("most common:", most, counts[most])
```

The same pattern totals amounts by category, groups names by first letter, and much more. The standard library's `collections.Counter` does counting in one line, but it helps to understand the version above first.

## Nesting for structured data

Values can be lists or other dictionaries, which lets you describe structured records. This is exactly the shape of the JSON data that web APIs return.

```python
library = {
    "B1": {"title": "Night Trains", "year": 2023, "tags": ["travel"]},
    "B2": {"title": "Ten Small Rivers", "year": 2021, "tags": ["nature", "maps"]},
}
for code, book in library.items():
    print(code, book["title"], book["year"], ", ".join(book["tags"]))

library["B2"]["tags"].append("history")
print(library["B2"]["tags"])
```

Read nested lookups from left to right: `library["B2"]["tags"]` means "the B2 entry, then its tags".

## Building dictionaries quickly

`dict(zip(keys, values))` pairs up two lists, and a *dictionary comprehension* builds one from any loop.

```python
names = ["ana", "ben", "caro"]
scores = [91, 78, 85]
results = dict(zip(names, scores))
print(results)

passed = {name: score for name, score in results.items() if score >= 80}
print(passed)
```

## What can be a key?

Keys must be *hashable*, which in practice means values that can't change: strings, numbers, booleans and tuples of those. Lists and dictionaries can't be keys, because changing them later would break the lookup. If you need a pair of values as a key, such as a map coordinate, use a tuple: `grid[(3, 4)] = "tree"`.

## Common mistakes

- **Using square brackets for a key that might be missing.** Use `get()` with a default.
- **Expecting `in` to search values.** It checks keys; use `.values()` for values.
- **Changing a dictionary while looping over it.** Adding or removing keys mid-loop raises an error. Loop over `list(d)` instead, or build a new dictionary.
- **Duplicate keys in a literal.** `{"a": 1, "a": 2}` silently keeps only the last value.

## Quick recap

Dictionaries map keys to values and look them up instantly. Read with `[]` when the key must exist and `get()` when it might not, loop with `items()`, count with `get(key, 0) + 1`, and nest them to describe structured data. Once they click, you'll use them everywhere.
