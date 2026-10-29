---
title: Reading and Writing Files in Python
description: Open, read, write and append text files safely with Python's with statement, handle lines and encodings, and work with paths using pathlib.
lesson: py-read-write-files
---
Programs become far more useful once they can keep data after they finish and read data someone else produced. Python makes working with text files straightforward. This guide covers opening files safely, reading them in different ways, writing and appending, and finding your way around folders.

## Opening a file safely

The built-in `open()` gives you a file object. Always use it in a `with` block: Python closes the file automatically when the block ends, even if an error happens inside it.

```python
with open("notes.txt", "w", encoding="utf-8") as f:
    f.write("Buy oats\n")
    f.write("Call the dentist\n")

with open("notes.txt", encoding="utf-8") as f:
    print(f.read())
```

The second argument is the *mode*. `"r"` (the default) reads, `"w"` writes and **replaces** anything already there, and `"a"` appends to the end. Passing `encoding="utf-8"` makes sure accented letters and symbols are read and written the same way on every computer.

## Three ways to read

`read()` returns the whole file as one string. `readlines()` returns a list of lines. Looping over the file object reads one line at a time, which works even for files too big to fit in memory.

```python
with open("cities.txt", "w", encoding="utf-8") as f:
    f.write("Oslo\nKyoto\n\nNairobi\n")

with open("cities.txt", encoding="utf-8") as f:
    for line in f:
        name = line.strip()
        if name:                 # skip blank lines
            print(name.upper())
```

Every line you read ends with a newline character, `\n`. Calling `strip()` removes it along with any stray spaces, which is almost always what you want before using the text.

## Writing several lines

`write()` doesn't add newlines for you, so include `\n` yourself. To write a list of strings, join them first or loop over them.

```python
scores = {"Ana": 91, "Ben": 78, "Caro": 85}
with open("scores.txt", "w", encoding="utf-8") as f:
    for name, score in scores.items():
        f.write(f"{name},{score}\n")

with open("scores.txt", encoding="utf-8") as f:
    print(f.read().splitlines())
```

## Appending to a log

Mode `"a"` keeps what's already in the file and adds to the end, which suits logs and journals. Running the same code twice adds two entries rather than replacing the first.

```python
from datetime import date

with open("journal.txt", "w", encoding="utf-8") as f:
    f.write("Journal\n")

for entry in ["Learned about files", "Wrote my first log"]:
    with open("journal.txt", "a", encoding="utf-8") as f:
        f.write(f"{date(2025, 6, 1)}: {entry}\n")

with open("journal.txt", encoding="utf-8") as f:
    print(f.read())
```

## Paths and folders with pathlib

Real projects keep files in folders. The `pathlib` module treats paths as objects: you join them with `/`, check whether they exist, and read or write them in one line.

```python
from pathlib import Path

reports = Path("reports")
reports.mkdir(exist_ok=True)

summary = reports / "summary.txt"
summary.write_text("All good\n", encoding="utf-8")

print(summary.exists(), summary.name, summary.suffix)
print(summary.read_text(encoding="utf-8").strip())
print(sorted(p.name for p in reports.iterdir()))
```

`Path` objects work on Windows, macOS and Linux without you worrying about whether the separator is `/` or `\`. Prefer them to building paths by gluing strings together.

## When the file isn't there

Opening a missing file for reading raises `FileNotFoundError`. Either check first with `Path(...).exists()` or catch the exception and decide what to do.

```python
def read_settings(path):
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except FileNotFoundError:
        return "(no settings yet - using defaults)"

print(read_settings("settings.ini"))
```

## Structured files

Plain text works for simple lists, but for tables and records you'll want a structured format. The `csv` module reads and writes spreadsheet-style rows and handles commas inside values correctly, and the `json` module saves dictionaries and lists in a format almost every language understands. Both build on exactly the `open()` and `with` pattern shown here.

## Common mistakes

- **Opening with `"w"` when you meant `"a"`.** Write mode empties the file first.
- **Forgetting newlines.** `write()` puts text exactly as given; add `\n` yourself.
- **Leaving files open.** Use `with` so they're always closed.
- **Not stripping lines.** Compare `line.strip()`, not `line`, or the trailing newline will make matches fail.
- **Relying on the default encoding.** Say `encoding="utf-8"` to avoid surprises on other machines.

## Quick recap

Open files in a `with` block, choose `"r"`, `"w"` or `"a"`, and pass `encoding="utf-8"`. Read all at once with `read()` or line by line with a loop, strip each line, and write with `write()` plus your own newlines. Use `pathlib` for paths and folders, and catch `FileNotFoundError` when a file might be missing.
