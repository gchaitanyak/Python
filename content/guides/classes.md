---
title: Python Classes and Objects
description: Model real things with Python classes — __init__ and self, attributes and methods, string representations, properties and a first look at inheritance.
lesson: py-classes-objects
---
So far you can store data in variables, lists and dictionaries, and write functions that work on it. A **class** brings the two together: it describes a kind of thing, the data each one holds, and the actions it can perform. Each thing you create from a class is an **object**, also called an *instance*.

## Your first class

`class` starts the definition. The special method `__init__` runs automatically whenever a new object is created, and it's where you set up the object's starting data. The first parameter, `self`, is the object being set up.

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

alex = BankAccount("Alex")
jo = BankAccount("Jo", 250)
print(alex.owner, alex.balance)
print(jo.owner, jo.balance)
```

`self.owner = owner` creates an *attribute*: a piece of data stored on that particular object. Each account keeps its own owner and balance.

## Methods: what objects can do

Functions defined inside a class are *methods*. They always take `self` first, which gives them access to the object's attributes. You call them with a dot, and Python passes `self` for you.

```python
class BankAccount:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance

    def deposit(self, amount):
        if amount <= 0:
            raise ValueError("deposit must be positive")
        self.balance += amount

    def withdraw(self, amount):
        if amount > self.balance:
            raise ValueError("not enough money")
        self.balance -= amount

acct = BankAccount("Alex", 100)
acct.deposit(50)
acct.withdraw(30)
print(acct.balance)
```

Notice how the rules — no negative deposits, no overdrafts — live with the data they protect. Any code using the account gets those checks for free.

## A friendly printout

Printing an object normally shows something unhelpful like `<__main__.BankAccount object at 0x...>`. Define `__str__` to choose what `print` shows, and `__repr__` for a developer-friendly version used in lists and the console.

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __str__(self):
        return f"({self.x}, {self.y})"

    def __repr__(self):
        return f"Point({self.x}, {self.y})"

    def distance_to(self, other):
        return ((self.x - other.x) ** 2 + (self.y - other.y) ** 2) ** 0.5

a, b = Point(0, 0), Point(3, 4)
print(a, b)
print([a, b])
print(a.distance_to(b))
```

Methods with double underscores are called *magic methods*. Others let objects support `==`, `<`, `len()` and even `+`.

## Class attributes

An attribute assigned in the class body, outside any method, is shared by every instance. It suits values that are the same for all objects, such as a fixed rate or a counter.

```python
class Ticket:
    price = 12.5
    sold = 0

    def __init__(self, seat):
        self.seat = seat
        Ticket.sold += 1

t1, t2 = Ticket("A1"), Ticket("A2")
print(Ticket.sold, t1.price)
```

## Properties: computed attributes

A *property* looks like an attribute but runs a method behind the scenes. Use it for values worked out from other data, so they're never out of date.

```python
class Rectangle:
    def __init__(self, width, height):
        self.width = width
        self.height = height

    @property
    def area(self):
        return self.width * self.height

r = Rectangle(3, 5)
print(r.area)
r.width = 10
print(r.area)
```

## Inheritance in brief

A class can build on another one. The new class *inherits* every attribute and method, and can add more or replace some. `super()` calls the parent's version.

```python
class Employee:
    def __init__(self, name, salary):
        self.name = name
        self.salary = salary

    def yearly_cost(self):
        return self.salary

class Manager(Employee):
    def __init__(self, name, salary, bonus):
        super().__init__(name, salary)
        self.bonus = bonus

    def yearly_cost(self):
        return super().yearly_cost() + self.bonus

staff = [Employee("Ana", 40000), Manager("Ben", 52000, 8000)]
print(sum(person.yearly_cost() for person in staff))
```

The loop doesn't care which kind of employee it's looking at; each object knows how to answer `yearly_cost()` for itself. That idea is called *polymorphism*.

## When to use a class

Reach for a class when several pieces of data belong together and you have actions that work on them — an account and its transactions, a game character and its moves, an order and its items. For a quick bundle of values with no behaviour, a dictionary or a dataclass is often enough.

## Common mistakes

- **Forgetting `self`.** Every method needs it as its first parameter, and attributes are reached through it: `self.balance`, not `balance`.
- **Calling the class without parentheses.** `BankAccount` is the class; `BankAccount("Alex")` creates an object.
- **Sharing a list as a class attribute.** A list defined in the class body is shared by every object. Create per-object lists in `__init__`.

## Quick recap

A class describes a kind of object: `__init__` sets up its attributes, methods define what it can do, and `self` connects the two. Add `__str__` for readable output, properties for computed values, and inheritance to build on existing classes.
