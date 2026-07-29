---
layout: post
title: "Week 10 — Starting SKU-based palletizing"
date: 2026-07-21
description: The exercise started moving from one fixed box size and hardcoded 2×2×2 targets toward SKU-based online palletizing, with task metadata in YAML, dynamic box generation, box and pallet info topics, HAL accessors, and a first row/shelf placement planner.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 10 · Coding period*

# Week 10: Starting SKU-based palletizing

After the upstream sync, the next question was: what should the exercise actually teach beyond a fixed pick-and-place loop?

The first version stacked eight identical boxes in a neat 2×2×2 grid. That was useful because it proved the conveyor, UR10, suction, MoveIt, and HAL all worked together. But palletizing becomes interesting when the placement is not just "next hardcoded coordinate". Real palletizing is about deciding where a box should go based on its size, the available space, the current stack, and the pattern you want to build.

So this week I started shifting the exercise toward **SKU-based palletizing**.

---

## From fixed boxes to SKU families

Instead of jumping straight to arbitrary random dimensions, I started with a constrained setup: a few named box families, or SKUs.

The first planned set is:

| SKU | Size `[length, width, height]` | Mass |
|---|---:|---:|
| `SMALL` | `[0.30, 0.30, 0.20]` m | `1.5` kg |
| `MEDIUM` | `[0.40, 0.30, 0.20]` m | `2.0` kg |
| `LONG` | `[0.60, 0.30, 0.20]` m | `2.5` kg |

The important simplification is that all boxes have the same height and width for now. Only the length changes.

That keeps the first student algorithm approachable. Instead of solving a full 3D packing problem, the student can think in rows: choose a layer, choose a row, and find the first free slot where the current box fits. Rotation, interlocked layers, occupancy grids, and batch optimization can come later. The first version should teach the shape of the problem without turning into an industrial optimizer.

The physical pallet is still `1.60 × 1.30 × 0.10` m, but the first SKU task exposes a smaller `1.20 × 0.90` m usable area inside it. That gives safety margin around the edges and keeps the targets inside a comfortable reach envelope for the UR10.

---

## The task now lives in YAML

The old demo had a lot of geometry baked into the solution: box dimensions, target spacing, layer height, and the assumption that every object was the same.

For SKU-based palletizing, that has to move out of the student solution. The task should describe what is arriving, and the student's code should decide where to place it.

So I added a task configuration file:

```text
CustomRobots/palletizing/config/palletizing_task.yaml
```

It is the single place that describes the first SKU task:

```yaml
pallet:
  physical_size: [1.60, 1.30, 0.10]
  usable_size: [1.20, 0.90]
  max_layers: 2

boxes:
  skus:
    SMALL:
      size: [0.30, 0.30, 0.20]
      mass: 1.5
    MEDIUM:
      size: [0.40, 0.30, 0.20]
      mass: 2.0
    LONG:
      size: [0.60, 0.30, 0.20]
      mass: 2.5

  sequence:
    - LONG
    - MEDIUM
    - LONG
    - SMALL
    - LONG
    - MEDIUM
    - LONG
    - SMALL
```

That sequence is important: this is **online palletizing**. The student does not receive the whole batch and optimize it ahead of time. One box arrives, the student places it, and then the next one arrives.

Changing the exercise is now much easier. If I want to try a different SKU mix or pallet usable area, I can edit the YAML instead of rewriting the feeder logic.

---

## What the feeder publishes

The feeder now exposes simple JSON messages for the current box and the pallet.

When a box reaches the pickup point, the feeder keeps publishing its name on `/box_ready`, same as before. Along with that, it publishes box metadata on `/box_info`.

Example `/box_info` message:

```json
{
  "name": "box_412_0",
  "sku": "LONG",
  "size": [0.60, 0.30, 0.20],
  "mass": 2.5
}
```

The `name` is the actual Gazebo model name for this run. The `sku`, `size`, and `mass` are the semantic task data the student cares about.

The pallet data is published separately on `/pallet_info`:

```json
{
  "frame": "base_link",
  "size": [1.60, 1.30, 0.10],
  "usable_size": [1.20, 0.90],
  "center": [0.0, -0.88, -0.90],
  "top_z": -0.60,
  "max_layers": 2
}
```

The key detail here is `frame: "base_link"`. The student solution and MoveIt commands work in the robot base frame, so the pallet metadata is translated into that same frame. The student should not have to know the Gazebo world offset of the robot base.

In plain English, the messages mean:

| Topic | Meaning |
|---|---|
| `/box_ready` | "This box is stopped at the pickup point." |
| `/box_info` | "Here is the SKU, size, and mass of that box." |
| `/pallet_info` | "Here is the pallet area you are allowed to fill." |
| `/box_done` | "The robot has taken this box, feed the next one." |

That is the data contract for the first SKU version.

---

## How the ROS flow works

The runtime loop is still intentionally simple:

1. `box_spawner` reads `palletizing_task.yaml`.
2. It creates the next box from the SKU sequence.
3. It writes a temporary SDF model with the correct size, mass, inertia, and color.
4. It spawns that model in Gazebo using `ros_gz_sim create`.
5. It starts the conveyor by publishing to `/conveyor/speed`.
6. After the estimated travel time, it stops the conveyor at the pickup point.
7. It publishes `/box_ready` and `/box_info` repeatedly.
8. The Academy HAL receives the ready signal and metadata.
9. The student solution computes a target pose and picks the box.
10. The solution calls `HAL.BoxDone(name)`.
11. The feeder checks that the name matches the expected box, then starts the next one.

The name check matters. If a stale or wrong `/box_done` message arrives, the feeder ignores it instead of advancing the sequence incorrectly.

Here is the same flow as a compact diagram:

```text
YAML task
   ↓
box_spawner ROS node
   ↓ spawn SDF box
Gazebo + conveyor
   ↓ box reaches pickup
/box_ready + /box_info + /pallet_info
   ↓
Academy HAL
   ↓
student solution chooses target
   ↓
/box_done
   ↓
next box
```

This keeps the simulator side and the student side separate. The feeder owns the world mechanics; the student owns the placement decision.

---

## Files and responsibilities

The feeder had become too much of a single large script, so I split the SKU work into smaller files with clearer jobs.

| File | Responsibility |
|---|---|
| `CustomRobots/palletizing/config/palletizing_task.yaml` | Defines the pallet, conveyor settings, SKU sizes/masses/colors, and the box sequence. |
| `CustomRobots/palletizing/launch/box_spawner.launch.py` | Starts the feeder node and passes the installed YAML path as `task_config`. |
| `CustomRobots/palletizing/scripts/box_spawner.py` | The ROS node. Owns publishers, subscribers, timers, conveyor speed commands, Gazebo spawn calls, and `/box_ready`/`/box_done` coordination. |
| `CustomRobots/palletizing/scripts/feeder/task_loader.py` | Loads the YAML and normalizes it into box metadata, pallet metadata, and spawn heights. |
| `CustomRobots/palletizing/scripts/feeder/box_model_generator.py` | Generates temporary Gazebo SDF files for SKU boxes, including size, visual color, mass, and cuboid inertia. |
| `CustomRobots/palletizing/scripts/feeder/state_machine.py` | Tracks the feeder state without ROS dependencies: idle, moving to pickup, settling, ready, done. |
| `RoboticsAcademy/exercises/palletizing/python_template/HAL_Harmonic.py` | Subscribes to `/box_info` and `/pallet_info`, stores the latest metadata, and exposes clean HAL functions. |
| `RoboticsAcademy/exercises/palletizing/python_template/solution.py` | Uses the HAL metadata and a first-fit row/shelf planner to choose target poses. |

This split makes the code easier to explain too. If a student asks "where do box dimensions come from?", the answer is the YAML and `task_loader.py`. If they ask "who moves the belt?", the answer is `box_spawner.py`. If they ask "where is the algorithm?", the answer is the reference `solution.py`.

---

## Extending the HAL

On the RoboticsAcademy side, the HAL now listens for the metadata topics and exposes them through two calls:

```python
box = HAL.GetBoxInfo(name)
pallet = HAL.GetPalletInfo()
```

So the student solution can stay high-level:

```python
name = HAL.WaitForBox()
box = HAL.GetBoxInfo(name)
target = planner.next_pose(box)

pick()
HAL.BoxDone(name)
place(box, target)
```

That is a much better exercise boundary than asking the student to subscribe to ROS topics directly.

The reference planner is intentionally small. It keeps a `used_length` value for each `(layer, row)` pair. For each incoming box, it tries layer 0 row 0, then the next row, then the next layer, and places the box in the first row where its length fits.

Conceptually:

```python
for layer in layers:
    for row in rows:
        if used_length[row] + box.length <= usable_length:
            place box here
```

It is not an advanced packing algorithm, but that is the point. It gives students a clean baseline they can understand and improve.

---

## The hard part: collision and reliability

The SKU metadata path is now in place, but the full runtime is not fully solved yet.

Different box sizes make the stack more dynamic. The planner needs to avoid the conveyor and pallet as before, but eventually it also needs to understand the growing stack and possibly the carried box. I tried an experiment with MoveIt attached collision objects for the carried box, but it made planning less reliable, so I reverted it instead of leaving a half-working mechanism in the HAL.

That is an important design line: students should not have to call low-level collision APIs like "add this box to MoveIt". If dynamic collision objects are needed, they should be managed internally by the exercise backend, probably through a semantic placement registration step later.

Current status is honest but incomplete:

- the SKU task data path exists,
- the feeder can describe incoming SKU boxes,
- the HAL can expose box and pallet metadata,
- the reference solution has a first row/shelf planner,
- syntax checks passed after the helper split and HAL changes,
- but full Academy runtime still needs more work for robust motion and collision behavior with mixed box sizes.

That is still progress. The exercise is no longer conceptually locked to eight identical boxes.

---

## What's next

Next I need to stabilize the SKU runtime path: rebuild and retest the feeder split, check that installed helper imports work in the ROS launch flow, and decide how much collision handling belongs in the first SKU demo.

The target is a clean student-facing task: boxes arrive one at a time, the HAL reports the SKU and pallet data, and the student writes a placement algorithm without touching Gazebo, MoveIt, or ROS topics directly.

Until next week 👋
