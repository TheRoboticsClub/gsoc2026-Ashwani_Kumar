---
layout: post
title: "Week 4 — A moving belt and a vacuum grip"
date: 2026-06-14
description: Giving Palletizing its own branches and exercise, a real moving conveyor belt with a box-lifecycle node, and a suction-gripper variant of the UR5 — URDF, SRDF, controllers, and a patched link attacher.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 4 · Coding period*

# Week 4: A moving belt and a vacuum grip

Last week the Palletizing scene loaded but nothing in it moved — the conveyor was a static mesh, the boxes sat where I placed them, and the arm shared its gripper with Pick & Place. This week I made all three of those things untrue. Palletizing now has its own branches, its own exercise row, a conveyor that actually carries boxes, and a UR5 that wears a suction cup instead of fingers.

---

## Giving Palletizing a home of its own

Up to now Palletizing had been riding inside Pick & Place's exercise — sharing its card, its robot, its everything. That was the right call for standing the scene up quickly, but the moment the two exercises start to differ (and a suction gripper is exactly that moment), they need to be separable.

So I cut **`palletizing-exercise` branches on both RoboticsAcademy and RoboticsInfrastructure**, wired the exercise into the database as its own entry — **exercise 27, universe 71** — and rebuilt the Gazebo world under that identity. The HAL templates I scaffolded from `pick_place` as a starting point; they're stubs for now, but they give the exercise a place to grow its own student-facing API.

[`RoboticsInfrastructure@7d409c4`](https://github.com/JdeRobot/RoboticsInfrastructure/commit/7d409c4819826ed039f34bf85a62eeed16121b75)

---

## The conveyor belt

A pallet exercise where boxes don't arrive isn't much of an exercise. The Pick & Place conveyor *looks* like a belt but is a static mesh — so I replaced it with a real moving one using **Gazebo Harmonic's built-in `TrackController` system**, the same machinery Gazebo uses to drive tank treads. The contact surface of the belt link gets a commanded velocity, and anything resting on it gets carried along.

On top of the belt I wrote a **`box_spawner.py` node** that owns the full box lifecycle:

1. A box spawns at the feed end of the belt.
2. It rides the belt to the centre.
3. The belt stops.
4. The box is placed on the pallet table.
5. The cycle restarts.

The belt speed is also controllable from ROS — there's a bridge exposing it as a topic, so the speed isn't baked into the world and can be driven from a node (or, eventually, from the exercise logic).

[`RoboticsInfrastructure@af25aff`](https://github.com/JdeRobot/RoboticsInfrastructure/commit/af25affc0d48176ca4512b98c97d7fab1c69d2e0)

---

## The suction gripper

A palletizing robot doesn't pinch boxes between two fingers — it grabs them by the face with a vacuum cup. So the UR5 needed a new end effector, and that ripples out further than you'd expect:

- A new **URDF** for the suction-cup variant of the arm.
- A new **SRDF** — and this one is genuinely different, not a copy. It's *arm-only*: no finger group, because there are no fingers to plan for.
- A matching **controllers** config and a **MoveIt launcher** for the new robot.
- A **`palletizing_harmonic.launch.py`** for RViz.

I registered the suction arm as a **new robot in the database** and pointed the Palletizing universe at it instead of the Robotiq-gripper UR5.

The last piece was the grab itself. RoboticsInfrastructure uses a `gz_link_attacher` plugin to fake the grasp — when the gripper closes, it rigidly attaches the target object to the gripper link. That plugin had the robot model name and gripper link **hardcoded to the Robotiq finger tips**. I patched it to take both as **SDF parameters**, so Palletizing can point it at the suction cup face instead. Pick & Place keeps its old behaviour by passing the old values; Palletizing passes its own.

[`RoboticsInfrastructure@1623d8f`](https://github.com/JdeRobot/RoboticsInfrastructure/commit/1623d8f6e626e616d1555dec9a5b94b18bf1ed67)

---

## Demo

The conveyor carrying boxes, and the suction gripper picking them off:

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/conveyer-gripper.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## What's next

Next up is the HAL — replacing `GripperSet` with a `SuctionSet` that just toggles the vacuum on/off. The motion API carries over from Pick & Place; it's only the end-effector verb that changes, finger pinch → vacuum on.

Until next week 👋
