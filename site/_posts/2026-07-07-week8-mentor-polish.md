---
layout: post
title: "Week 8 — Polishing on mentors' feedback"
date: 2026-07-07
description: A full pass over the mentors' review notes — the world relaid so the robot works one end of the belt, palletizing-only joint limits that force a tidy clockwise swing, the conveyor and pallet fed to MoveIt as collision objects, and a UR10 that finally moves predictably.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 8 · Coding period*

# Week 8: Polishing on mentors' feedback

Last week the pick-and-place loop closed — boxes got stacked. But "it works" and "it works *the way an exercise should*" are different bars. The mentors went through the exercise and sent back a list of pointers, and this week was almost entirely about working through that list: the layout, the motion, the scene, the look. Less new machinery, more turning a rough-but-working demo into something a student would actually want to open.

---

## Demo

The whole thing running after the polish pass — feed, pick, carry, stack, repeat:

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/palletizing-v1.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Relaying the world

The first note was about the geometry of the workcell. Originally the belt ran across the front of the robot and the pallet sat behind it, which made the pick and place fight for the same bit of space and gave the arm awkward reaches.

So I rebuilt the layout around one idea: the robot works **one end** of the belt.

- The conveyor now runs straight out along world +X, with the robot at the near end. Boxes feed from the far end and ride toward the arm, stopping at a fixed pickup point right in front of it.
- The pallet moved to the robot's right (−Y). So every cycle is the same shape: pick in front, swing right, place. A repeatable ~90° clockwise turn instead of a reach-over-the-shoulder contortion.

Getting the pallet distance right took a couple of tries. Too far out and the far row of the stack fell outside the UR10's ~1.3 m reach — MoveIt would just report the plan as infeasible, the arm would stall at the belt, and the *next* move would drag the box across the conveyor. Pulling the pallet centre in to −0.88 m puts the whole grid inside the reach envelope while still keeping the deck clear of the robot base and visibly separate from the belt.

I also replaced the old table mesh with a plain wooden-pallet-on-a-stand built from boxes — cheaper collision geometry for the planner, and it reads more like an actual palletizing station.

---

## Making the box stand out

A small one, but it mattered visually: the boxes and the pallet were both the same brown, so the stack blended into the platform and you couldn't tell what had been placed.

I warmed and lightened the box colour to a kraft-cardboard tone and kept the pallet a darker wood. Now the stack reads clearly against the deck — obvious in the demo above.

---

## The joint limits: "limit 4, 5, 6"

The main technical note was about the wrist joints. The arm was still doing ugly things — spinning a wrist most of a full turn, twisting the box around on its way to the pallet — and the ask was to clamp joints 4, 5, and 6 down.

Two things came out of digging into this.

First, a correction to my own assumption. I went in expecting to clamp all three wrists hard, but watching the motion, only **joint 6** (wrist_3) was the culprit doing the visible box "swirl" — spinning the carton about the cup axis on the way over. Wrists 1 and 2 actually needed their range to reach the far row on the descent. So the fix wasn't a blanket clamp: wrist_3 narrowed to ±120° to kill the swirl, wrists 1 and 2 left wide.

Second — and this is the bit I'm happier about — *where* the limits live. Last week I'd narrowed the shared UR10 limits to fix the 360° spins. But those limits are shared with the Pick & Place exercise's UR5-family config, and clamping the common file to make palletizing tidy is exactly the kind of change that quietly breaks the neighbour. So I reverted the shared file back to stock (±360°) and added a **palletizing-only** joint-limits file that the suction launcher loads instead. Same effect for this exercise, zero blast radius on anything else.

That isolated file is where the "predictable" behaviour is actually encoded:

- **shoulder_pan `[−150°, +30°]`** — deliberately asymmetric. A symmetric range lets the planner pick either the clockwise swing or its counter-clockwise mirror; capping the positive side at +30° makes the counter-clockwise twin illegal, so the arm *always* turns the way the mentors wanted.
- **elbow `[0°, +180°]`** — elbow-up only, so the forearm never droops down toward the cells.
- **wrist_3 `±120°`** — the swirl clamp.

None of these limit what the task needs to reach — they just delete the ugly redundant solutions from the search space so the planner is forced onto the tidy one. Same lesson as last week's ±180° fix, applied with a finer brush.

---

## Feeding the workcell to MoveIt

The other structural improvement: the planner didn't actually know the conveyor or the pallet existed.

Up to now, the arm avoided them only because the *hand-picked waypoints* kept it clear — a single cruise height it lifted to, crossed at, and descended from. That works, but it's fragile and it pushes obstacle-avoidance into the student's solution code, which is backwards.

So I added a small behind-the-scenes node, `palletizing_scene`, that injects the conveyor and the pallet into MoveIt's planning scene as collision objects when the stack starts. Now the planner routes around them natively — it *knows* the belt and pallet are solid. It publishes the objects as a planning-scene diff, in the same `base_link` frame the solution's targets use, and re-publishes a few times so a late-starting `move_group` still picks them up.

The student solution and the HAL never touch the planning scene — it's pure setup that happens for them. One nuance I had to handle: the pallet collision box is trimmed a few centimetres below the real deck top, so a box placed *flush* on the deck doesn't get rejected as a touching-contact collision.

---

## Making the motion predictable

Threaded through all of the above was the theme the mentors kept coming back to: the arm should move *predictably*. A student watching it should see the same clean cycle every time, not a planner improvising a different path on each box.

The joint limits do most of that work. The rest was in the solution's motion shape:

- **One cruise height.** Every carry lifts straight up to a single transit height, crosses at that height, and descends straight down. No diagonal swoops that clip the belt.
- **Dropped the return-to-home between boxes.** It was a wasted sweep; the arm now goes pick → place → straight to waiting for the next box.
- **Bumped the speed up.** With the paths clean and predictable, I could raise the motion speed a good deal without anything flinging — the cautious crawl from earlier weeks wasn't needed anymore.
- **Cup centring.** The suction cup doesn't sit dead-centre under the tool flange, so I aim the flange a few centimetres short and the cup lands on the box centre — applied identically at pick and place.

The solution file itself got noticeably shorter and simpler in the process — a good sign that the complexity moved to where it belongs (the scene, the limits, the HAL) instead of living in the code the student reads.

---

## What's next

The layout, motion, and scene are where the mentors wanted them. Next is the vision side I flagged last week — a camera in the world and a detection node to replace the synthetic "box ready" signal — plus a proper standby pose over the belt so the arm waits in a sensible spot between boxes.

Until next week 👋
