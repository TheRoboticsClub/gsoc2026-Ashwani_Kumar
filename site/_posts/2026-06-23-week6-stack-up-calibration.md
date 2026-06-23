---
layout: post
title: "Week 6 — Getting the full stack live and calibrating the pick motion"
date: 2026-06-23
description: Four launch blockers cleared, the suction HAL wired up, and the first real calibration runs of the UR10 arm — finding the cup-down orientation, diagnosing a missing IK solver, and getting MoveL descent working reliably.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit, ur10, suction]
categories: [updates]
---

> *GSoC 2026 · Week 6 · Coding period*

# Week 6: Getting the full stack live and calibrating the pick motion

Last week ended with a UR10 model that existed on disk. This week was about making it actually run — and then figuring out how to make the arm pick a box.

---

## Four blockers on first launch

The first native launch of the palletizing stack hit four hard failures in sequence.

**1. gz_ros2_control plugin won't load**

The most confusing error: `symbol GzPluginHook missing`. The controller_manager would never start, so the joint spawners looped forever printing `Could not contact service /controller_manager`.

The real cause: both the apt package `ros-humble-gz-ros2-control` and my workspace build were compiled against Ignition Fortress (gz-sim6), not Gazebo Harmonic (gz-sim8). The apt package is a Fortress build — it exports `IgnitionPluginHook` and links `libignition-gazebo6.so.6`, and Gazebo Harmonic won't load it. The CMakeLists.txt in gz_ros2_control selects between Fortress and Harmonic based on the env var `GZ_VERSION`; my workspace had it unset, so it fell through to Fortress.

Fix: rebuild `gz_ros2_control` with `GZ_VERSION=harmonic colcon build --packages-select gz_ros2_control`. The launcher now prepends the workspace's `lib/` to `GZ_PLUGIN_PATH` so Gazebo picks the Harmonic build before the apt Fortress one.

**2. move action server crashes on startup**

The server crashed at launch with `YAML::BadFile` pointing at `ls_vgr/config/joint_specifications.yaml`. The launcher was passing `EE_PARAM=ls_vgr` — but the suction robot has no EE joints, so that yaml doesn't exist. Fix: `EE_PARAM=none`, which makes the move server skip the EE configuration block.

**3. URDF/SRDF robot-name mismatch**

MoveIt printed `Semantic description is not specified for the same robot` and refused to plan anything. The URDF had `name="ur5"` while the SRDF had `name="ur10"`. One attribute change, back to planning.

**4. Suction sensor on the wrong link**

The gz_link_attacher subscribes to contact events on `ls_vgr_link`. But Gazebo was publishing them on `wrist_3_link` instead — because fixed joints collapse child links into their parents during URDF→SDF conversion ("link lumping"). The suction cup's fixed joint got lumped, so the contact sensor appeared to live on the parent link and the attacher never saw it.

Fix: `<gazebo reference="ls_vgr_joint"><preserveFixedJoint>true</preserveFixedJoint></gazebo>`. This forces Gazebo to preserve the joint and keep the link separate, so contact events are published on the right link.

After all four: `System Successfully configured!`, all 6 arm joints loaded, both controllers active, MoveIt ready. First clean launch.

---

## Wiring up the suction HAL

The existing HAL was a copy of the Pick & Place gripper HAL. It had three bugs specific to the suction robot:

1. **Startup hang**: waited for the `/gripper_controller` action server, which doesn't exist on the suction robot (arm-only ros2_control, no gripper controller).
2. **Wrong actuator**: `GripperSet()` drove `robotiq_85_left_knuckle_joint` via FollowJointTrajectory — no such joint on the suction arm.
3. **Wrong graspable list**: the allow-list was `blue_ball,green_cylinder,yellow_box,red_box` — none of which match the dynamically-named `box_<id>_<count>` boxes spawned by the conveyor.

The suction design is simpler: publish a Bool to `/gripper_auto_attach`. `true` = vacuum on (attaches whatever graspable object is in contact), `false` = vacuum off (also detaches the held object). No separate attach/detach calls needed.

The new `SuctionSet(on, wait_time)` does exactly that — one publisher, one message. The gripper client and FollowJointTrajectory code is gone. The graspable list is now `"box"` (a substring match, so it catches all `box_*` names).

---

## The missing IK solver — root cause of all PLANNING FAILED

Every RobMove PTP and LIN call was failing instantly with `PLANNING FAILED`. The decisive test: read tool0's current TF pose, then command RobMove to that exact pose. Still PLANNING FAILED in 0.002 seconds. That's not a path planning failure — that's the IK solver rejecting the pose before planning even starts.

The log had a warning hiding in the noise: `No kinematics plugins defined. Fill and load kinematics.yaml!`

The cause: `kinematics.yaml` only had entries for `ur5_manipulator` and `gripper` — leftover from the Pick & Place exercise it was copied from. The palletizing exercise uses a planning group named `ur10_arm` (defined in the SRDF as `<chain base_link="base_link" tip_link="tool0">`). Without a matching key in kinematics.yaml, MoveIt has no IK solver for that group, so every Cartesian/pose goal fails instantly.

Fix: add a `ur10_arm:` block with KDLKinematicsPlugin. I also increased the default `kinematics_solver_attempts` from 3 to 15 and `kinematics_solver_timeout` from 0.005s to 0.05s — KDL is gradient-descent based and needs more attempts for large workspace jumps. The existing `ur5_manipulator` and `gripper` keys were preserved (the file is shared with Pick & Place).

Since the install is symlinked to the source file, the fix is live after relaunching the robot/MoveIt stack — no rebuild required.

---

## Finding the cup-down orientation

With IK working, I started calibrating the pick motion. The first orientation guess was `ypr=[180,0,0]` — which points tool0's **Z-axis** downward. But the suction cup points along tool0's **X-axis** (the `ls_vgr_joint` is a fixed joint with −90° rotation about Y, so the cup face is along tool0 X). To aim the cup at the floor, tool0 X must point down, which means `pitch=+90°`, i.e. `ypr=[0,90,0]` → quaternion `(0, 0.707, 0, 0.707)`.

The `[180,0,0]` guess caused every `RobMove PTP` to fail with instant PLANNING FAILED — not because of a path issue, but because there was genuinely no IK solution at that orientation (the wrist would need to reach a singularity). With the corrected `[0,90,0]`, PTP to hover positions above the box started working.

---

## Pilz LIN vs computeCartesianPath for descent

Once the arm could hover above the box, descent was next. I tried Pilz LIN (`RobMove` with `kind="LIN"`) for the straight-line descent — it failed consistently for all descent steps. The failure mode was wrist singularity: at `pitch=90°` (cup-down), `wrist_2` is near 0°, which is a degenerate wrist configuration that Pilz can't plan through.

The fix was to use `computeCartesianPath` instead — this is the MoveL action exposed by the move server. It doesn't go through Pilz at all; it stitches together small joint-space steps along the Cartesian path. With `eef_step=0.005m`, it handles the wrist singularity gracefully and successfully completes all 6+ consecutive −0.05m descent steps.

In the HAL this is `MoveRelLinear([dx,dy,dz])`, and in the calibration scripts I call `Move_EXECUTE` directly to get the success/failure result dict.

---

## Box/robot handshake

I also wired up a pick-and-place choreography so the exercise has a clean structure: the box spawner stops each box at the pickup position and publishes its name on `/box_ready`. The robot's solution code waits for that message, does the pick, and then publishes on `/box_done` with the same box name to signal the spawner to send the next one. This gives the student a natural reactive loop without having to deal with raw topic subscriptions.

---

## Where things stand

The stack fully launches, IK works, the suction HAL is correct, and MoveL descent is reliable. The remaining calibration work is finding the exact approach joint configuration that puts the arm above the box center with cup pointing down, then measuring the precise pick height where the suction cup contacts the box top. That's what I'm working on now — using probe scripts that move to candidate poses, read TF, and check if the suction attach fires.

The palletizing exercise is close. Next week should have a working pick-and-place loop.

Until then.
