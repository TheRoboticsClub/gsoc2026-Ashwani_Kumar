---
layout: post
title: "Week 6 — Getting the robot to actually move"
date: 2026-06-23
description: The full palletizing stack launched for the first time — four things broke, four things got fixed. Then the real work began: figuring out how to get the arm to pick up a box.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 6 · Coding period*

# Week 6: Getting the robot to actually move

Last week I had a UR10 model that existed on disk and launched in a terminal window. This week I found out how many things between "it launches" and "it moves" were quietly broken — and then started the actual calibration work of getting the arm to pick up a box.

---

## Four things broke on first launch

The first time I ran the full palletizing stack with the real UR10 suction robot, four separate things failed before the arm moved a millimeter.

**The controller never started.** The very first error was `symbol GzPluginHook missing` — a cryptic message that took a while to trace. It turned out the `gz_ros2_control` plugin (the bridge between ROS controllers and Gazebo) had been compiled against an older version of Gazebo. On a ROS Humble system, the apt package for this plugin links to Gazebo Fortress, not Gazebo Harmonic. Gazebo Harmonic loads plugins differently and simply refused to use it. The fix was to rebuild the plugin from source with the right Gazebo version flag, then tell the launcher to prefer that build over the system one.

**The move server crashed immediately.** After the controller was fixed, the action server that handles motion commands exited with a file-not-found error — it was looking for a joint configuration file for the suction gripper that doesn't exist (the suction cup has no joints to configure). A one-line fix: tell it there's no end-effector.

**MoveIt refused to plan anything.** Even with the server up, every motion request failed with "planning failed" in about 2 milliseconds — fast enough to know it wasn't even trying. The cause was a name mismatch: the URDF said the robot was called `ur5`, the SRDF said `ur10`. MoveIt sees two different robots and refuses to proceed. Fixed.

**The suction cup contact sensor was on the wrong link.** This one is a Gazebo quirk: when you have a fixed joint connecting two links, Gazebo merges them into one during conversion. The suction cup's sensor ended up reported as being on the wrist link, not the cup link — so the attachment system that listens for "something is touching the cup" never fired. The fix is a single line in the URDF telling Gazebo not to merge that particular joint.

After all four: clean launch, arm in its home pose, MoveIt ready to plan.

---

## The HAL cleanup

The student-facing API — the HAL — was still a copy of the Pick & Place gripper HAL from week 4. It had three problems specific to the suction robot: it would hang at startup waiting for a gripper controller that doesn't exist, it tried to control finger joints that don't exist, and its list of objects the suction cup is allowed to grab didn't include the boxes (they have dynamically-generated names the old list didn't match).

The replacement is simple: `SuctionSet(True)` publishes a single on/off signal to the vacuum system. That's it. The Gazebo plugin handles the rest — when vacuum is on and something graspable is touching the cup, it attaches. When vacuum is off, it releases.

---

## Why the arm wasn't planning anything

With the stack running cleanly, I tried commanding the arm to a pose above the box. Instant failure, every time. Reading a bit more carefully, I found this warning buried in the output:

> *No kinematics plugins defined. Fill and load kinematics.yaml!*

The `kinematics.yaml` file tells MoveIt how to solve inverse kinematics — given a target position in space, what joint angles get the arm there? The file had entries for the UR5 pick-and-place exercise (it's a shared config file) but nothing for the UR10 palletizing group. Without that, every pose goal fails before planning even starts — the planner doesn't know how to find a solution.

Adding the entry fixed it. I also gave it more attempts and a longer timeout than the defaults, because the UR10's longer arm means more possible configurations for the solver to search through.

---

## Which way does the cup face?

With planning working, I started calibrating the actual pick motion. The first question: what orientation should the arm be in so the suction cup faces the box?

My first guess was wrong. I assumed "cup facing down" meant pointing the tool's Z-axis downward — but the suction cup is mounted sideways relative to the tool, rotated 90°. So "cup facing down" actually means pointing the tool's X-axis downward, which is a completely different set of joint angles.

Once I had the right orientation, I could start testing whether the arm could actually reach the box from there.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w6-angles.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  Planning the arm goal pose in RViz — the orange ghost shows where the arm would be, with the suction cup pointing downward toward the pickup point.
</div>

---

## Straight-line descent kept failing

Once the arm could hover above the box, I tried commanding it to descend straight down onto the box top — a simple vertical motion. The planner for straight-line moves (Pilz LIN, the same planner used in Pick & Place) kept refusing it.

The reason: at the cup-down orientation, one of the wrist joints sits very close to zero degrees. That's a singular configuration for the arm — a spot where small changes in the target position require large swings in joint angle, and the planner gives up rather than guess. This is a known quirk of UR wrists.

The fix was to switch planners for the descent. Instead of Pilz LIN, I used `computeCartesianPath` — a different approach that stitches together tiny joint-space steps along the desired line rather than trying to solve the whole path at once. It handles the near-singular wrist just fine, and all six consecutive −5 cm descent steps went through cleanly.

---

## The arm next to the box

By the end of the week I had the arm reliably reaching a position close to the box, with the cup pointing downward.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w6-bot-on-box.jpg" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  The UR10 in Gazebo Harmonic — arm extended toward the pickup position on the conveyor belt, box waiting to be picked.
</div>

The remaining calibration work is finding the exact joint configuration where the cup lands squarely on top of the box, and confirming the suction attach fires when it should.

---

## What's next

Finish the pick calibration, confirm the suction grab works end-to-end, then write the motion logic for the full palletizing cycle — pick, lift, move to pallet, place, repeat.

Until next week 👋
