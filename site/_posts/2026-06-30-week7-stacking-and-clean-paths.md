---
layout: post
title: "Week 7 — Stacking boxes and getting the paths clean"
date: 2026-06-30
description: The pick-and-place loop now runs end to end — boxes get stacked on the pallet, the arm stops taking 360° detours after a joint-limit fix, and the conveyor handshake moved into the HAL so the student code is pure API.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 7 · Coding period*

# Week 7: Stacking boxes and getting the paths clean

Week 6 ended with the arm reaching the box but not yet picking and stacking reliably. This week the loop closes: a box rides in on the belt, the arm picks it, places it on the pallet in an ordered grid, and signals for the next one. Most of the week went into two problems that weren't about "does it work" but "does it work *sanely*" — the arm taking absurd paths, and the student-facing code still talking raw ROS.

---

## Demo

The full cycle — pick from the belt, carry across, place on the pallet:

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/ur10-pick-place.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Writing the placement logic

Up to now the box spawner cheated: when a box reached the pickup point it just teleported it onto the pallet to fake the result. This week the robot actually does the work.

The placement is a grid: 2 columns × 2 rows × 2 layers, eight boxes total. The solution walks the grid index by index — fill a layer row by row, then start the next layer on top. Each cell maps to a world coordinate, and the arm goes there. The motion for each box is the same shape:

1. PTP move to a clearance height above the pickup point.
2. Straight-line descent onto the box.
3. Suction on.
4. Lift straight up.
5. Carry across to the target grid cell at transit height.
6. Straight-line descent onto the stack.
7. Suction off.
8. Retreat up.

The pick and place heights are tunable constants, because the offset between the tool flange (what MoveIt positions) and the suction cup face isn't a clean number — the cup is mounted sideways with a compound offset. One calibration pass in sim sets the height where the cup just touches the box top, and everything else is derived from that.

---

## The arm kept taking the long way around

The annoying problem this week: planning would succeed, but the path was ridiculous. From the home pose to the pickup pose, the arm would swing a wrist joint a full turn — 310 degrees the wrong way — sweeping through the table on the way. Valid plan, stupid motion.

I spent a while chasing this in the wrong place. First I tried seeding the planner with a known-good pose before each move, which worked but was a band-aid. Then I tried giving the IK solver more time and more attempts — that helped it *find* solutions from far away, but it didn't change *which* solution it picked, so the spin stayed. I even tried swapping the IK solver out entirely for one that picks the closest solution to the current pose. That one isn't packaged for our ROS version, and an alternative added a heavier dependency, so I reverted both.

The actual fix was much smaller, and it's about the joint limits.

A robot wrist at +52° and at −310° (which is +52° minus a full turn) are the *same physical pose*. The UR10 shipped with position limits of ±360° on every joint, so both solutions are legal — and the planner had no reason to prefer the short one. It just returned whichever it found first.

Narrowing every joint's position limit to ±180° removes the long-way-round twin from the search space entirely. The arm can still reach every pose the task needs — you never need more than ±180° on a single joint here — but the redundant full-turn solutions are now illegal, so the planner is forced onto the short path.

That also explained why RViz always looked fine while my script spun: RViz seeds the solver from the live arm pose, which is near the short solution, so it rarely wandered. The scripted motion request had no such seed and hit the long-way solution every time — until the limits made it impossible for both.

The lesson I'm taking from this: when the planner gives you a valid-but-ugly path, look at the limits before you start swapping out solvers. Tightening the joint range was one line of config; the solver swap was an afternoon I'm not getting back.

The final setup is the stock IK solver with a longer timeout, and ±180° joint limits. No exotic plugins.

---

## Moving the conveyor handshake into the HAL

The other cleanup was about where the line sits between the student and the plumbing.

The whole point of the HAL (Hardware Abstraction Layer) is that a student writing the exercise only calls simple functions — move here, grip, release — and never touches ROS topics directly. The motion and suction calls were already like that. But the conveyor coordination wasn't: the solution code still had a class that subscribed to `/box_ready` and published to `/box_done` by hand. Raw ROS, sitting in the file the student is supposed to fill in.

So I moved it. The HAL now exposes two functions:

- `WaitForBox()` — blocks until a box is stopped at the pickup point, returns its name.
- `BoxDone(name)` — tells the feeder the box is stacked, which releases the next one.

The topic subscription, the publisher, and the bookkeeping that ignores duplicate announcements all live inside the HAL now. The solution file dropped its ROS imports and the whole coordination class — it just calls `HAL.WaitForBox()` and `HAL.BoxDone(name)` in the loop. Pure API, no plumbing.

One thing worth being honest about: `WaitForBox()` is not perception. The signal comes from the spawner node, which already knows where the box is because it put it there. It's the right abstraction for getting the loop working, but it's a stand-in for a real sensor.

That's deliberate. Because the coordination is wrapped behind those two function calls, the synthetic topic can later be replaced with a camera near the conveyor that actually detects the box arriving — and the student's exercise code doesn't change at all. The function signature stays; only what's behind it gets smarter. That's the direction I want to take it: a static camera, real detection, and a reported box pose instead of a hardcoded pickup point, which would also let boxes arrive at varying positions instead of always stopping at the same spot.

---

## What's next

Tune the stack so the boxes sit flush on each other, then start on the vision side — a camera in the world and a detection node to replace the synthetic `box_ready` signal.

Until next week 👋
