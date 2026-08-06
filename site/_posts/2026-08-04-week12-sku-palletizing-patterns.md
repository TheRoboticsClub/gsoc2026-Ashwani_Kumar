---
layout: post
title: "Week 12 — One workcell, many palletizing patterns"
date: 2026-08-04
description: This week the palletizing exercise progressed from one fixed stack into an SKU-based pattern playground. The same UR10, conveyor, and box metadata pipeline now support row, brick, rotated-block, and pinwheel-style pallet layouts.
tags: [gsoc, roboticsacademy, palletizing, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 12 · Coding period*

# Week 12: One workcell, many palletizing patterns

Earlier in the project, the palletizing setup proved an important first point: the UR10 could pick a box from the conveyor and stack it on a pallet.

This week, the question changed from **can the robot stack boxes?** to **what pallet layout should it build?**

The result is a more interesting exercise direction. The same UR10, suction cup, conveyor, and SKU box pipeline can now produce different palletizing outcomes by changing the placement strategy rather than rebuilding the workcell.

---

## From a fixed stack to a palletizing decision

The first stack was intentionally simple. That was useful for proving the complete manipulation loop, but it did not leave much for a student to decide.

The updated setup works with named box families, each carrying known dimensions. The planner receives the current box information and the usable pallet area, then decides where that box belongs.

In simple terms, the loop is now:

```text
incoming SKU box
      ↓
box dimensions + usable pallet area
      ↓
choose a palletizing pattern and target
      ↓
robot picks and places the box
```

The simulator, conveyor coordination, suction attachment, and robot motion stay behind the exercise helpers. The interesting part for the learner is the placement decision.

---

## One setup, several pallet patterns

The main achievement this week was turning the same physical workcell into a small pattern gallery.

The robot does not need a new arm, a new conveyor, or a new simulator scene for each result. The difference comes from the planner: how it chooses rows, layers, directions, and orientations for the incoming SKU boxes.

{% include figure.liquid loading="eager" path="assets/img/w12-row-shelf-sku.png" class="img-fluid rounded z-depth-1" %}

### Row / shelf packing

The baseline strategy fills the available pallet area row by row. It is the most approachable starting point for SKU palletizing: a longer box consumes more row length, while a smaller one can use the remaining space.

This gives students a clear first algorithm without asking them to solve a full industrial optimization problem.

{% include figure.liquid loading="eager" path="assets/img/w12-brick-layer-sku.png" class="img-fluid rounded z-depth-1" %}

### Brick-inspired alternating layers

The next strategy changes the direction used to fill each layer. Instead of repeating exactly the same seams above one another, the planner starts the next layer from the opposite side.

This is a useful introduction to the idea that pallet patterns are not only about fitting boxes inside a boundary. They also influence how seams, support, and visual structure are distributed through the stack.

{% include figure.liquid loading="eager" path="assets/img/w12-rotated-block-sku.png" class="img-fluid rounded z-depth-1" %}

### Rotated block layout

The rotated-block pattern adds orientation as a planning decision. Some boxes are placed with a rotated footprint, changing the block structure without changing the feeder or robot setup.

This is an important step for the exercise because it connects a simple student decision—choose an orientation—to a visibly different pallet result.

{% include figure.liquid loading="eager" path="assets/img/w12-medium-pinwheel-full.png" class="img-fluid rounded z-depth-1" %}

### Full MEDIUM-SKU pinwheel

The most visual pattern explored this week is a pinwheel-style layout. Rectangular MEDIUM SKU boxes are arranged around a central opening, alternating horizontal and vertical placement directions to create a full spiral/perimeter layer.

The initial small ring was useful for checking the geometry. The fuller MEDIUM layout makes the intended pattern much clearer: a pallet layer can be designed as a deliberate structure, not merely a collection of boxes placed wherever space is available.

---

## Making physical placement match the plan

Pattern generation only matters if the physical placement matches the intended layout.

One of the important improvements this week was making pickup depend on the box's actual stopped position on the conveyor. Earlier, the robot assumed an ideal pickup point. In practice, simulation physics can leave a box slightly away from that assumed location, which is enough to create placement drift later in the stack.

The feeder now observes the active box position before announcing it as ready. The pickup helper then uses that observed pose to bring the suction contact to the top center of the box.

This made the pattern experiments much more meaningful: the planner can reason about box centers, and the robot has a better chance of carrying and placing those centers consistently.

{% include figure.liquid loading="eager" path="assets/img/w12-sku-pallet-full.png" class="img-fluid rounded z-depth-1" %}

---

## Keeping the workcell reusable

The native launch workflow was also cleaned up so the workcell can be restarted more reliably between pattern experiments.

The launcher now brings up the scene, UR10, MoveIt, RViz, conveyor bridge, and SKU feeder together, while cleaning stale processes from earlier native runs. This matters during pattern work: a layout failure should be traceable to the pattern or reach constraints, not to an old bridge or duplicate action server still running in the background.

I also started reducing unnecessary background work in the simulation, especially while tracking the active conveyor box. That will matter more as patterns use longer sequences and larger stacks.

---

## What I learned from the pattern experiments

A pallet pattern is not just a list of coordinates.

The box footprint, approach direction, robot reach, pickup alignment, and available orientation all influence which layouts are practical. Some patterns are visually simple but require more careful geometry than expected. Others, such as row/shelf packing, are easy to describe but become more interesting when box sizes vary.

That is exactly why this is a useful RoboticsAcademy exercise direction. Students can begin with a simple placement rule, then improve it by considering orientation, alternating layers, support, and pattern structure.

---

## What's next

The current work will continue beyond this pattern gallery.

The next focus areas are:

- validating and refining the larger pinwheel layout at all of its outer positions,
- making longer pattern runs more predictable under simulation load,
- improving recovery when a robot movement cannot be completed,
- and extending the exercise from palletizing toward **depalletizing**: planning how a robot can safely remove boxes from an existing stack.

The workcell is now becoming a palletizing exercise rather than one fixed stacking demo. The next step is to keep turning these layouts into reliable, reusable learning activities.

Until next week 👋
