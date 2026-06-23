---
layout: post
title: "Week 6 — The full loop: belt, box, arm"
date: 2026-06-23
description: The palletizing stack ran end-to-end for the first time — four launch bugs cleared, the conveyor handshake wired up, the suction HAL fixed, and the arm finally reaching the box with the cup pointing down.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 6 · Coding period*

# Week 6: The full loop — belt, box, arm

Last week ended with a UR10 that existed on disk and launched in a terminal window. This week I found out how many things between "it launches" and "it actually works" were quietly broken — and then got the full pick-and-place loop running for the first time: box spawns, belt carries it, conveyor stops, arm reaches in and picks it up.

---

## Four things broke on first launch

The first time I ran the full palletizing stack, four things failed before the arm moved a millimeter.

**The controller never started.** The first error was `symbol GzPluginHook missing` — cryptic, but it traced back to the `gz_ros2_control` plugin (the bridge between ROS controllers and Gazebo) having been compiled against an older Gazebo version. On a ROS Humble system, the apt package for this plugin links to Gazebo Fortress, not Gazebo Harmonic — and Gazebo Harmonic refused to load it. Fix: rebuild the plugin from source with the right flag, tell the launcher to prefer it over the system one.

**The move server crashed immediately.** After that, the action server that handles motion commands exited with a file-not-found error — it was looking for a joint config file for the suction gripper that doesn't exist (suction cups have no joints to configure). A one-line fix: tell it there's no end-effector.

**MoveIt refused to plan anything.** Every motion request failed in about 2 milliseconds — fast enough to know it wasn't even trying. The URDF said the robot was called `ur5`, the SRDF said `ur10`. MoveIt sees two different robots and refuses to proceed.

**The suction cup's contact sensor was on the wrong link.** Gazebo merges fixed joints during world loading — so the suction cup's sensor ended up reported as being on the wrist link, not the cup link. The attachment system that listens for "something is touching the cup" never fired. One line in the URDF tells Gazebo to preserve that joint and keep the links separate.

After all four: clean launch, arm holding its home pose, MoveIt ready to plan.

---

## How the conveyor and arm talk to each other

Week 4 set up the conveyor belt and a `box_spawner` node that controls the box lifecycle. This week I wired up the handshake between the belt and the arm — the protocol that lets the robot know when to move.

The sequence goes like this:

1. The `box_spawner` node spawns a box at the feed end of the belt.
2. The belt carries it forward. The node watches the box position.
3. When the box reaches the pickup point — directly in front of the arm — the belt stops and the node publishes the box's name on a `/box_ready` topic.
4. The robot's solution code is subscribed to `/box_ready`. When the message arrives, the arm moves in, picks the box, and places it on the pallet.
5. The solution code then publishes on `/box_done` with the same box name.
6. The spawner sees `/box_done`, releases the belt, and starts the next box.

This keeps things clean on the student side — the exercise template gives you a simple `wait_for_box()` call that blocks until a box is ready, and a `box_done()` call to signal you're finished. The student writes pick-and-place logic, not conveyor management.

It also means the exercise is self-pacing: the belt doesn't send the next box until the robot says it's done with the current one. No timing hacks, no hardcoded delays.

---

## Fixing the suction HAL

The student-facing HAL was still a copy of the Pick & Place gripper HAL. It had three problems:

- At startup, it waited for a gripper controller that doesn't exist on the suction robot — hanging forever.
- `GripperSet()` tried to move finger joints that also don't exist.
- The list of objects the suction cup is allowed to grab was hardcoded to the Pick & Place props (`blue_ball`, `yellow_box`, etc.) — none of which match the dynamically-named `box_<id>_<count>` boxes the spawner creates.

The replacement is much simpler. `SuctionSet(True)` sends an on/off signal to the vacuum system. When vacuum is on and something graspable is in contact with the cup, the Gazebo plugin attaches it. When vacuum is off, it releases. That's the whole API. One publisher, one message, no joint trajectory nonsense.

The graspable allow-list is now just `"box"` — a substring match that catches any box regardless of its generated name.

---

## Why the arm wasn't planning anything

Even with the stack clean, every arm motion request failed instantly. Buried in the output was this:

> *No kinematics plugins defined. Fill and load kinematics.yaml!*

`kinematics.yaml` tells MoveIt's planner how to solve "given a target position, which joint angles get me there?" The file had entries for the UR5 pick-and-place exercise (it's shared), but nothing for the UR10 palletizing group. Without it, every pose goal fails before planning even starts.

Adding the entry — and giving it more attempts and a longer timeout, because the UR10's longer arm has more configurations to search through — made pose goals start working immediately.

---

## Which way does the cup face?

With planning working, the next question was orientation: which joint angles make the suction cup point straight down at the box?

My first guess was wrong. I assumed "cup down" meant pointing the tool's Z-axis downward — the natural assumption. But the suction cup is mounted sideways on the tool flange, rotated 90°. So "cup down" actually means pointing the tool's X-axis downward, which is a completely different set of joint angles.

Once I had the right orientation, I could start testing whether the arm could actually reach the box from above.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w6-angles.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  Planning in RViz — the orange arm is the goal state with the suction cup pointing down toward the pickup point. The grey arm is where the robot currently is.
</div>

---

## Straight-line descent kept failing

With the arm hovering above the box, I tried commanding it to descend straight down. The planner for straight-line moves (Pilz LIN, same as Pick & Place) kept refusing it.

The reason: at the cup-down orientation, one of the wrist joints sits close to zero degrees — a singular configuration where the planner gives up because small target changes would require wild joint swings. This is a known quirk of UR wrists at certain orientations.

The fix was switching planners for the descent step. Instead of Pilz LIN, I used `computeCartesianPath` — a different approach that stitches together tiny joint-space steps along the desired line. It handles the near-singular wrist just fine. Six consecutive 5 cm descent steps all went through cleanly.

---

## The arm next to the box

By the end of the week the arm was reliably reaching a position close to the box on the belt with the cup pointing down — and the belt had already stopped and published `/box_ready` by the time the arm moved.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w6-bot-on-box.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  The UR10 in Gazebo Harmonic — arm extended toward the pickup position, box waiting on the stopped belt.
</div>

The remaining work is dialling in the exact height where the cup makes contact with the box top, and confirming the suction attach fires reliably. Once that's calibrated, the full pick-place-repeat loop can run on its own.

---

## What's next

Finish the pick height calibration, confirm suction works end-to-end, then write the pallet placement logic so boxes actually stack.

Until next week 👋
