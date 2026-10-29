---
title: Working with Strings in Python
description: Create, combine, slice and format text in Python, with the string methods you will use every day and the reason strings never change in place.
lesson: py-strings-basics
---
Almost every program handles text: names, messages, file contents, web pages. In Python, text is a **string**, written between quotes. This guide covers how to build strings, pick pieces out of them, clean them up and format them for display.

## Making strings

Single and double quotes do exactly the same job. Pick one style and use the other only when the text itself contains a quote mark. Triple quotes let a string run over several lines.

```python
greeting = "Hello"
reply = 'She said "hi" and left.'
note = """Shopping:
- oats
- lemons"""

print(greeting)
print(reply)
print(note)
```

Inside a string, a backslash starts an *escape sequence*: `\n` is a new line and `\t` is a tab. If you need a real backslash, as in a Windows path, write `\\` or put an `r` before the quotes to make a raw string.

## Joining and repeating

The `+` operator glues strings together and `*` repeats them. Both create a new string; neither changes the originals.

```python
first = "Ada"
last = "Lovelace"
full = first + " " + last
print(full)
print("-" * len(full))
```

`+` only joins strings to strings. Adding a number to text raises a `TypeError`, so convert the number with `str()` first, or use an f-string as shown below.

## Indexing and slicing

A string is a sequence of characters, and each one has a position starting at zero. Square brackets pick one character out; negative numbers count from the end. A *slice* such as `[2:5]` takes characters from position 2 up to, but not including, position 5.

```python
word = "notebook"
print(word[0], word[-1])   # first and last characters
print(word[:4])            # from the start up to position 4
print(word[4:])            # from position 4 to the end
print(word[::-1])          # the whole string, backwards
```

Slices never raise an error for going too far: `word[3:100]` just stops at the end. Indexing a single position that doesn't exist, however, raises `IndexError`.

## Strings never change

Strings are *immutable*: once made, their characters cannot be altered. Trying `word[0] = "N"` raises an error. Every string method instead returns a brand new string, which you usually assign back to a name.

```python
title = "  the quiet garden  "
clean = title.strip().title()
print(repr(title))
print(repr(clean))
```

Forgetting this is one of the most common beginner bugs: calling `title.strip()` on its own line does the work and then throws the result away.

## Everyday methods

A handful of methods cover most real tasks:

- `lower()` and `upper()` change case, which is handy before comparing text typed by a person.
- `strip()` removes spaces and line breaks from both ends.
- `replace(old, new)` swaps every occurrence of one piece of text for another.
- `split()` breaks a string into a list of words, or on any separator you give it.
- `join()` does the reverse, gluing a list of strings together with a separator.
- `startswith()`, `endswith()` and the `in` operator answer yes-or-no questions.

```python
line = "  Oslo, Bergen,Trondheim , Stavanger "
cities = [c.strip() for c in line.split(",")]
print(cities)
print(" | ".join(cities))
print("Bergen" in cities, line.strip().startswith("Oslo"))
```

Notice the pattern: split the raw text into parts, clean each part, then join or use the results. You will write some version of this whenever you read data.

## Formatting with f-strings

An f-string has an `f` before the opening quote and lets you drop values straight into text inside curly braces. After a colon you can add a *format spec* to control decimals, padding or thousands separators.

```python
item = "lamp"
price = 34.5
qty = 3
print(f"{qty} x {item} = {qty * price:.2f}")
print(f"{'Total':<10}{qty * price:>8.2f}")
print(f"{1234567:,} visitors")
```

`:.2f` means two decimal places, `<10` pads to ten characters aligned left, `>8` aligns right in eight characters, and `,` adds thousands separators. f-strings are the modern, readable choice for building messages, so prefer them to joining pieces with `+`.

## Counting and finding

`len()` gives the number of characters. `count()` tells you how often a piece appears, and `find()` returns the position of the first match, or `-1` if there is none.

```python
sentence = "the cat sat on the mat"
print(len(sentence))
print(sentence.count("at"))
print(sentence.find("sat"), sentence.find("dog"))
```

## Common mistakes

- **Expecting a method to change the string.** Assign the result: `name = name.strip()`.
- **Comparing without normalising.** `"Yes" == "yes"` is `False`. Compare `answer.strip().lower()` instead.
- **Off-by-one slices.** The end position is excluded, so `text[0:3]` gives three characters, not four.
- **Mixing text and numbers with `+`.** Use an f-string, or convert with `str()`.

## Quick recap

Strings hold text, never change in place, and come with methods that return new strings. Index and slice them by position, clean them with `strip`, `lower` and `replace`, take them apart with `split` and put them back with `join`, and present results with f-strings. Those few tools handle the great majority of text work you'll meet.
