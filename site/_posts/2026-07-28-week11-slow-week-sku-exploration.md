---
layout: post
title: "Week 11 — A slower week and more SKU planning"
date: 2026-07-28
description: This was a lighter week because I was ill, so there was no major implementation milestone. I used the time I had to review the SKU-based palletizing direction, think through the student-facing API boundary, and plan the next collision and placement steps.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 11 · Coding period*

# Week 11: A slower week and more SKU planning

This week was not a normal coding week. I was ill, so I could not put in the same amount of implementation time as the previous weeks.

Instead of forcing a half-finished feature and pretending it was a milestone, I mostly used the limited time I had to review the SKU-based palletizing direction from last week and think through what should come next.

---

## Revisiting the scope

The main question was how ambitious the first SKU version should be.

It is tempting to jump straight to a rich palletizing problem: mixed dimensions, rotations, interlocked layers, dynamic collision objects, placed-box tracking, and maybe even batch planning over the full sequence. But that would make the first student version too heavy.

The better first step is still the smaller one:

- boxes arrive online, one at a time,
- each box has a known SKU and dimensions,
- the pallet exposes a safe usable area,
- all first-version boxes keep the same height and width,
- the student writes a simple row/shelf placement algorithm,
- and the backend hides the simulator and planning-scene details.

That keeps the exercise educational rather than overwhelming. A student can understand why `LONG` takes more row space than `SMALL`, and can improve the placement strategy later.

---

## Keeping the HAL boundary clean

I also spent time thinking about the API boundary.

The easy but wrong path would be to expose backend mechanics directly: let the student add collision boxes to MoveIt, detach named Gazebo links, or manipulate planning-scene primitives. That would technically work for a demo, but it would teach the wrong layer of abstraction.

The exercise should expose palletizing concepts, not simulator plumbing.

So the direction remains a simple chain:

```text
/box_ready tells us which box arrived
        ↓
GetBoxInfo(name) gives SKU + dimensions
        ↓
GetPalletInfo() gives usable pallet area
        ↓
student computes the placement target
        ↓
HAL handles motion, suction, and feeder coordination
```

For example, the student should think in terms of data like this:

```json
{
  "name": "box_412_0",
  "sku": "LONG",
  "size": [0.60, 0.30, 0.20],
  "mass": 2.5
}
```

and pallet limits like this:

```json
{
  "frame": "base_link",
  "usable_size": [1.20, 0.90],
  "top_z": -0.60,
  "max_layers": 2
}
```

Then their job is to answer: "where should this box go?"

If placed boxes need to become collision objects later, that should happen behind a semantic call such as registering a completed placement, not through a raw `add_collision_box(...)` API in the student template.

---

## What still needs work

The main unresolved part is runtime reliability with SKU boxes.

The old fixed-box demo was predictable because every placement was known ahead of time. SKU palletizing changes that. The robot still needs clean approach and retreat motions, but the stack is no longer just a fixed grid of identical cartons. The planning side needs a better story for the carried box and the growing stack.

From last week, the attached-collision-object experiment was not stable enough to keep, so the next attempt has to be more careful. I would rather keep the current HAL simple and stable than add a collision feature that causes more planning failures.

The next practical steps are:

1. Rebuild and retest the Infrastructure feeder split in the launch flow.
2. Confirm the `/box_info` and `/pallet_info` metadata arrive correctly in Academy.
3. Run the row/shelf reference solution end to end.
4. Decide whether the first SKU demo should use conservative motion and a simplified usable area, or wait for a stronger internal collision manager.

---

## What's next

Next week I want to get back to implementation and testing: stabilize the SKU-based runtime, make the row/shelf placement path reliable enough for a demo, and keep the student-facing code focused on the actual palletizing algorithm.

Until next week 👋
