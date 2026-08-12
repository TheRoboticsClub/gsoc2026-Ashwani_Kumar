---
layout: post
title: "Week 13 — Palletizing arrives in RoboticsAcademy"
date: 2026-08-11
description: This week the palletizing exercise moved from native simulation into the RoboticsAcademy browser workflow. Matched RADI images launched the Gazebo Harmonic workcell, UR10, MoveIt, RViz, console, and an 18-box palletizing run through the Academy interface.
tags: [gsoc, roboticsacademy, palletizing, radi, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 13 · Coding period*

# Week 13: Palletizing arrives in RoboticsAcademy

For the last few weeks, most palletizing tests ran through the native ROS 2 and Gazebo workflow. That was the fastest way to develop the conveyor, SKU feeder, suction gripper, MoveIt setup, and placement patterns—but the final exercise has to work through RoboticsAcademy, not only from a collection of terminals.

This week, the pieces finally came together in the browser.

The RoboticsAcademy page launched the Palletizing exercise, opened the Gazebo Harmonic simulator, started the UR10 and MoveIt, prepared RViz and the console, and ran the palletizing program from `academy.py`. The completed test processed all 18 boxes in the configured sequence.

---

## Launching the complete exercise through Academy

The first task was to verify that RoboticsAcademy and RoboticsInfrastructure agreed on the complete launch contract.

The chain now looks like this:

```text
RoboticsAcademy Palletizing exercise
        ↓
Palletizing Harmonic world
        ↓
Gazebo scene + conveyor feeder + simulation clock
        ↓
UR10 suction robot + controllers + MoveIt
        ↓
RAM tools: simulator + RViz + console
        ↓
student code through the palletizing HAL
```

I built matched RADI application and database images and checked the database records inside the running PostgreSQL container. This was important because a browser exercise can appear correctly in the menu while still pointing to the wrong scene, robot, or launcher.

With the records aligned, the browser reached the complete RAM sequence: connect, request the world, launch the scene and robot, wait for the world to become ready, and then prepare the three exercise tools.

---

## The browser result

{% include figure.liquid loading="eager" path="assets/img/w13-palletizing-in-roboticsacademy.png" class="img-fluid rounded z-depth-1" %}

The final Academy view brings the whole exercise into one workspace:

- the student program is open in the editor,
- Gazebo shows the conveyor, pallet, UR10, and completed stack,
- RViz shows the robot and planning scene,
- and the console reports that all 18 boxes were placed.

This is a big integration milestone for the project. The same HAL and palletizing logic used during native development can now be exercised from the environment students will actually use.

## Demo

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/palletizing-in-academy.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Fixing duplicate RViz ownership

The browser launch also exposed a problem that was easy to miss in native testing: two different parts of the system were trying to start RViz.

The UR10 robot launcher started one RViz process, while RoboticsAcademy started another as an exercise tool. One was hidden on the application display and the browser instance eventually crashed inside the rendering stack.

The fix was to give each layer one clear responsibility:

```text
scene launcher  → Gazebo, feeder, and clock bridge
robot launcher  → robot, controllers, MoveIt, and action servers
RAM tool system → browser RViz
```

The robot launcher is now headless, and RoboticsAcademy owns the RViz process visible to the learner. After this change, Gazebo and RViz could run together in the browser without competing instances.

---

## Making the planning scene more reliable

I also improved how the static conveyor and pallet obstacles reach MoveIt.

The earlier planning-scene node published the obstacles several times and then exited. That did not prove that `move_group` had actually received and applied them, especially when startup timing changed.

The updated node waits for MoveIt's `/apply_planning_scene` service, submits the scene, checks the response, and exits cleanly only after MoveIt confirms the operation. If MoveIt is unavailable, it now fails with a clear timeout instead of hanging in the background.

This turns the startup behavior from "publish and hope" into an explicit handshake:

```text
wait for MoveIt
      ↓
apply conveyor + pallet collision objects
      ↓
check success
      ↓
continue with a confirmed planning scene
```

While reviewing the robot description, I found another hidden duplication: the UR10 xacro generated two `ros2_control` systems. The generic UR macro already creates the required control block, so the extra explicit block was removed. The expanded robot description now contains one control system, as intended.

I also declared the direct ROS runtime dependencies used by the planning-scene script so a clean installation does not depend on packages being present only by accident.

---

## RADI testing found platform issues too

Running the exercise through freshly built RADI images uncovered two frontend packaging problems outside the palletizing launch itself.

First, the RADI Dockerfile removed the complete `react_frontend` directory and copied back only its compiled static files. However, `react_frontend` is also a Django application, so the container failed while importing `react_frontend.apps`. Preserving the Django package fixes that startup failure and should become a small, focused RoboticsAcademy fix.

After that, the fresh production frontend exposed a separate React/Babel bundle mismatch involving development JSX calls in a production runtime. I kept this separate from the confirmed Dockerfile fix instead of combining two unrelated problems into one patch.

For this week's browser exercise validation, I used the matched application/database images with temporary development frontend assets while investigating that production bundle issue. Therefore, this is a successful Academy browser integration run, but not yet the final mount-free RADI release validation.

---

## What was validated this week

The browser workflow now demonstrates:

- the Palletizing exercise appears in RoboticsAcademy,
- the current world, scene, robot, and tool mappings agree,
- RAM launches the Gazebo Harmonic scene and UR10 suction robot,
- the simulator, RViz, and console become ready in the browser,
- MoveIt receives the conveyor and pallet collision objects,
- the HAL receives pallet, box, and observed pickup information,
- suction pickup and feeder coordination work through Academy,
- and the configured 18-box sequence completes in the browser.

The work also clarified an important integration lesson: a simulation that works natively is only one layer of the result. The database, container build, application manager, frontend bundle, display ownership, and ROS launch lifecycle all have to agree before it becomes a real browser exercise.

---

## What's next

The next focus is making the exercise robust when a run does not follow the ideal path:

- add controlled retries and safe recovery when a robot motion cannot be completed,
- strengthen feeder acknowledgements so stale or failed events cannot advance the sequence incorrectly,
- make reset and repeated exercise runs clean and predictable,
- improve failure reporting so students receive an actionable error instead of a partially completed run,
- and begin extending the workcell into a depalletizing exercise, where the robot must safely choose and remove boxes from an existing stack.

Seeing the final stack inside RoboticsAcademy was the milestone I wanted from this week. The next goal is to make that result repeatable, failure-aware, and robust enough to support both palletizing and depalletizing tasks.

Until next week 👋
