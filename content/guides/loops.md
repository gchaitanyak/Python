---
title: Python Loops — for and while
description: Repeat work in Python with for and while loops, range, break and continue, plus the patterns for totals, searches and safe loops that end.
lesson: py-for-range
---
Computers are good at doing the same thing many times without getting bored. A **loop** tells Python to repeat a block of code. Python has two kinds: `for`, which goes through a collection or a range of numbers, and `while`, which keeps going as long as a condition is true.

## The for loop

A `for` loop takes each item of a sequence in turn and runs its indented block once per item. The name after `for` refers to the current item.

```python
fruits = ["apple", "pear", "plum"]
for fruit in fruits:
    print("I like", fruit)
print("done")
```

The indentation matters: the indented lines are the loop's body, and the first line back at the left edge runs once, after the loop ends. Strings work too, giving one character at a time, and dictionaries give their keys.

## Counting with range

`range()` produces a sequence of whole numbers, which is how you repeat something a set number of times. It starts at 0 by default and stops *before* the end number. You can also give a start and a step.

```python
for n in range(3):
    print("round", n)

for year in range(2020, 2031, 5):
    print(year)

for countdown in range(5, 0, -1):
    print(countdown)
```

`range(3)` gives 0, 1 and 2 — three numbers, ending before 3. That "stop before the end" rule matches slicing, and once you're used to it, it prevents a lot of off-by-one errors.

## Building up a result

Many loops follow the same shape: set up a result before the loop, update it inside, and use it after. This is the *accumulator* pattern.

```python
prices = [4.20, 12.00, 3.35, 8.90]
total = 0
expensive = []
for price in prices:
    total += price
    if price > 5:
        expensive.append(price)
print(f"total {total:.2f}, expensive items: {expensive}")
```

## The while loop

A `while` loop repeats as long as its condition stays true. Use it when you don't know in advance how many repeats you need — for example, until a target is reached.

```python
balance = 1000
years = 0
while balance < 2000:
    balance *= 1.07
    years += 1
print(f"{years} years to double: {balance:.2f}")
```

Every `while` loop needs something inside it that eventually makes the condition false. Here `balance` grows each time round. Forget that, and you have an infinite loop that never stops.

## break and continue

`break` leaves the loop immediately. `continue` skips the rest of this pass and moves on to the next item. They're useful for searches and for skipping data you don't want.

```python
readings = [12, -1, 15, 0, 22, 999, 18]
for r in readings:
    if r == 999:          # a marker meaning "end of data"
        break
    if r <= 0:            # skip invalid readings
        continue
    print("valid reading:", r)
```

A `for` loop can also have an `else` block, which runs only if the loop finished without hitting `break`. It's a tidy way to say "searched everything and found nothing".

```python
names = ["Ana", "Ben", "Caro"]
for name in names:
    if name.startswith("Z"):
        print("found", name)
        break
else:
    print("no name starts with Z")
```

## Looping with positions and pairs

When you need the position as well as the item, use `enumerate()`. To walk through two lists side by side, use `zip()`.

```python
cities = ["Lima", "Quito", "Bogotá"]
heights = [154, 2850, 2640]
for i, (city, metres) in enumerate(zip(cities, heights), start=1):
    print(f"{i}. {city} sits at {metres} m")
```

These two built-ins replace most cases where beginners reach for `range(len(...))`, and they make loops easier to read.

## Loops inside loops

A loop can contain another loop. The inner loop runs completely for each pass of the outer one, which is how you work through grids and tables.

```python
for row in range(1, 4):
    line = ""
    for col in range(1, 4):
        line += f"{row * col:4}"
    print(line)
```

Nested loops multiply the work: 1,000 outer passes times 1,000 inner ones is a million steps. That's fine for small data, but it's worth noticing as your inputs grow.

## Common mistakes

- **Off-by-one ranges.** `range(1, 10)` stops at 9. Use `range(1, 11)` to include 10.
- **A while loop that never ends.** Make sure the condition can become false.
- **Changing a list while looping over it.** Removing items as you go skips some of them. Build a new list instead.
- **Resetting the accumulator inside the loop.** Put `total = 0` before the loop, not in it.

## Quick recap

Use `for` to go through a collection or a `range` of numbers, and `while` to repeat until a condition changes. Collect results with the accumulator pattern, steer loops with `break` and `continue`, and reach for `enumerate` and `zip` instead of juggling indexes. Those patterns cover nearly every loop you'll write.
