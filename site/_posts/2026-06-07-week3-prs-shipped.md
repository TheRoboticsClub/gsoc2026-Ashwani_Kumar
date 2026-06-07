---
layout: post
title: "Week 3 — Setting up the Palletizing World"
date: 2026-06-07
description: Added a Palletizing Harmonic universe by reusing most of the Pick & Place stack — a new SDF world, two launchers, and a SQL row to wire it up.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 3 · Coding period*

# Week 3: Setting up the Palletizing World

This week I set up a Palletizing Harmonic universe inside RoboticsAcademy. Most of the work is reused from Pick & Place — same arm (UR5 + Robotiq 85), same MoveIt config, same controllers. What's new is the scene: six boxes on a conveyor belt and a pallet platform to stack them on.

The changes are on my fork for now.

---

## What changed

Four files in RoboticsInfrastructure, one SQL row in RoboticsAcademy.

### The world file

`Industrial/robotiq_description/world/palletizing_arm_harmonic.world` — 317 lines. Most of it is copied from `warehouse_arm_harmonic.world`. The only new part is the six pickable boxes laid out in a 2×3 grid on the conveyor at `z = 1.04`.

The arm, conveyor, and table positions are unchanged so all the MoveIt frames and controller config from Pick & Place carry over as-is.

### The `world_file` patch

`spawn_robot_warehouse.launch.py` had the world path hardcoded. I turned it into a launch argument with the original world as the default:

```python
DeclareLaunchArgument(
    "world_file",
    default_value=default_world_file,
    description="Absolute path to the .world file to load in gz sim",
)
```

Pick & Place is unaffected. Palletizing passes its own path. 13 lines changed.

### The launchers

`Launchers/palletizing_harmonic.launch.py` — sets `GZ_SIM_RESOURCE_PATH` and includes `spawn_robot_warehouse.launch.py` with `world_file` overridden and `launch_rviz=false` (RAM starts RViz separately).

`Launchers/rviz/palletizing_harmonic.launch.py` — a near copy of the Pick & Place RViz launcher. Same arm xacro, same MoveIt config, same RViz layout.

### The SQL row

One row in `database/exercises/db.sql`:

```
71	17	68	False
```

Exercise 17 (Pick & Place), universe 68 (Palletizing Harmonic), not the default. This makes the new universe show up in the dropdown without any frontend changes.

There's still a row needed in the `database` branch of RoboticsInfrastructure (`universes.sql`) to wire RAM to the launcher path — that's the remaining piece.

---

## Demo

**Palletizing universe** — Gazebo Harmonic with the UR5, gripper, and six boxes:

<video controls width="100%" style="max-width: 720px;">
  <source src="/assets/video/palletizing_universe.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

**Conveyor belt:**

The conveyor in the existing Pick & Place world is a static mesh — it looks like a belt but doesn't move. For palletizing, boxes need to actually travel to the arm's pickup point, so I wired up Gazebo Harmonic's native `TrackController` plugin on the same model. It moves the contact surface velocity of the belt link. Combined with high anisotropic friction (`mu2=800`, `fdir1` along the travel direction), boxes get dragged along rather than sliding. The belt speed is controlled by publishing a `gz.msgs.Double` to the plugin's command topic.

On top of that I wrote a feeder script that spawns boxes one at a time from behind the belt, waits for each one to reach the arm pickup point, then spawns the next.

<video controls width="100%" style="max-width: 720px;">
  <source src="/assets/video/conveyer.mp4" type="video/mp4">
  Your browser does not support the video tag.
</video>

The arm doesn't move yet — there's no motion plan. The scene is just set up at this point.

---

## What's next

- Get push access to the main repos and submit upstream PRs.
- Add the `universes.sql` row to the `database` branch.
- Start working on the palletizing motion plan — pick a box, place it on the pallet, repeat for all six.
