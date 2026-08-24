---
layout: post
title: "GSoC 2026 Final Report — From Palletizing to Depalletizing"
date: 2026-08-24
description: "From a borrowed Pick and Place scene to two browser-based industrial manipulation exercises: a complete SKU-based Palletizing exercise and an additional three-layer Depalletizing and sorting exercise for RoboticsAcademy."
tags: [gsoc, roboticsacademy, palletizing, depalletizing, gazebo-harmonic, ros2, moveit]
categories: [final-report]
---

> *Google Summer of Code 2026 · JdeRobot · RoboticsAcademy*

# GSoC 2026 Final Report: From Palletizing to Depalletizing

Thirteen weeks ago, Palletizing in RoboticsAcademy was only a new Gazebo scene built on top of Pick and Place: six boxes, a borrowed UR5, and no automated palletizing loop. By the end of the coding period, it had become a complete browser-based exercise in which a UR10 receives mixed-SKU boxes from a moving conveyor, observes their actual pickup positions, and builds different pallet layouts through a student-facing HAL.

The project then went one step further. Using the same manipulation foundation, I built an additional **Depalletizing exercise** where the robot starts with an existing three-layer mixed-SKU stack, removes boxes from the top down, and sorts them onto three output conveyors.

---

## About me

I am **Ashwani Kumar Moudgil**, a Computer Science Engineering graduate from VIT, India, and a Founding Engineer at **Antropi Robotics (YC F26)**. During Google Summer of Code 2026, I contributed to [JdeRobot's RoboticsAcademy](https://github.com/JdeRobot/RoboticsAcademy), an open-source platform for learning robotics, computer vision, and artificial intelligence through interactive exercises.

---

## Project at a glance

| Item | Result |
|---|---|
| **Primary project** | SKU-based Palletizing exercise |
| **Additional exercise** | Three-layer Depalletizing and SKU sorting |
| **Robot** | UR10 with a simulated suction gripper |
| **Simulation** | Gazebo Harmonic |
| **Motion planning** | MoveIt 2 with OMPL and Pilz |
| **Platform** | RoboticsAcademy through RAM/RADI |
| **Student interface** | Python Hardware Abstraction Layer (HAL) |
| **Main repositories** | RoboticsAcademy and RoboticsInfrastructure |
| **Primary contributions** | [RoboticsAcademy #3965](https://github.com/JdeRobot/RoboticsAcademy/pull/3965) and [RoboticsInfrastructure #791](https://github.com/JdeRobot/RoboticsInfrastructure/pull/791) |

---

## What exists now

The completed Palletizing exercise presents `SMALL`, `MEDIUM`, and `LONG` boxes one at a time. The backend creates each model, moves it along the conveyor, observes where it actually stopped, and reports semantic box and pallet information through the HAL. The learner can focus on the palletizing decision itself: **given the current box and the available pallet area, where and in which orientation should it be placed?**

### Final Palletizing demo

The video below shows the final Palletizing workcell and the exercise running through RoboticsAcademy with the editor, Gazebo, RViz, and console tools in the same browser workspace.

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/final-palletizing.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

---

## Phase 1: Understanding the platform and building the workcell

The first challenge was understanding how a click in the RoboticsAcademy frontend travels through the database, backend, Robotics Application Manager, and launchers before becoming a running Gazebo simulation. Tracing that path kept the first version intentionally small: a new SDF scene, launch records, and database mappings that reused as much of the existing Pick and Place stack as possible.

The earliest workcell still used a UR5 with a Robotiq finger gripper and six fixed boxes. It was useful as an integration probe, but it was not yet a palletizing exercise. The conveyor was only a static visual model, the robot did not execute a palletizing sequence, and Palletizing still appeared as a variation of Pick and Place rather than its own learning activity.

{% include figure.liquid loading="eager" path="assets/img/palletizing-ur10-sim.jpeg" class="img-fluid rounded z-depth-1" %}

The workcell then gained its own mechanics and identity. Palletizing became a dedicated exercise; Gazebo Harmonic's `TrackController` turned the conveyor into a moving surface; a feeder began spawning boxes one at a time; and a suction-gripper robot replaced the finger-gripper assumption. The shared `gz_link_attacher` also became configurable instead of hardcoding the Pick and Place robot and fingertip links.

The compatibility requirement mattered throughout this work. Palletizing needed a suction cup and dynamically named boxes, but Pick and Place still needed its existing UR5 and Robotiq behavior. The shared attachment system therefore kept its old defaults while accepting Palletizing-specific robot, contact-link, and object settings when configured.

More detail from this phase is available in [Week 2: One click, one new universe]({% post_url 2026-05-28-week2-palletizing-universe %}), [Week 3: Setting up the Palletizing World]({% post_url 2026-06-07-week3-prs-shipped %}), and [Week 4: A moving belt and a vacuum grip]({% post_url 2026-06-14-week4-conveyor-suction %}).

---

## Phase 2: Making the robot pick, carry, and stack reliably

My mentors suggested replacing the UR5 with a UR10. Its larger reach and payload are a better match for palletizing, but the change exposed how many assumptions in the shared stack were tied to the original robot.

The MoveIt action servers had a hardcoded UR5 planning-group name. The UR10 description, SRDF, kinematics, controller configuration, visual meshes, Gazebo entity name, and attachment settings all had to agree. A mismatch in any one of them could produce a robot that rendered correctly but could not plan, execute, or attach a box.

I added an isolated UR10 suction configuration covering its robot description, controllers, kinematics, OMPL settings, joint limits, launcher, RViz setup, and suction attachment. This kept Palletizing-specific motion tuning from changing another exercise's robot behavior.

### Closing the first full loop

The first complete cycle used a fixed `2 × 2 × 2` target grid. The robot approached the box, descended, enabled suction, lifted to a safe transit height, moved above the target, released the box, and retreated. Making that loop predictable required more than finding collision-free poses.

One of the most visible problems was the robot taking valid but absurd paths. A wrist joint sometimes rotated almost a full revolution because the original limits allowed multiple joint solutions for the same physical pose. Rather than replacing the IK solver, I constrained the redundant solution space through Palletizing-specific joint limits. An asymmetric shoulder range forced a consistent clockwise transfer, an elbow-up range kept the forearm away from the workcell, and a narrower final wrist range removed the visible box swirl.

The workcell layout was also redesigned around one repeatable motion: pick directly in front of the robot, rotate clockwise, and place on the pallet to its right. The pallet was moved inside the UR10's comfortable reach, and the old table was replaced with a more recognizable wooden pallet on a low stand.

### Moving plumbing behind the HAL

The first solution still subscribed to `/box_ready` and published `/box_done` directly. That was useful during development, but it was the wrong educational boundary. Students should learn palletizing logic, not ROS topic bookkeeping.

The synchronization moved into the HAL:

```python
name = HAL.WaitForBox()
HAL.SuctionSet(True)
HAL.BoxDone(name)
```

Behind these calls, the feeder and HAL coordinate box names, repeated announcements, conveyor state, and the transition to the next box. The student sees a simple task-level API.

I also added the conveyor and pallet to MoveIt's static planning scene. Obstacle ownership belongs in the exercise backend, not in every student's solution. Later, the planning-scene node was improved from repeated fire-and-forget publication to an acknowledged `/apply_planning_scene` service call, so startup continues only after MoveIt confirms that the obstacles were applied.

The detailed debugging journey is covered in [Week 5: Swapping in the UR10]({% post_url 2026-06-17-week5-ur10-arm %}), [Week 6: The full loop]({% post_url 2026-06-23-week6-stack-up-calibration %}), [Week 7: Stacking boxes and getting the paths clean]({% post_url 2026-06-30-week7-stacking-and-clean-paths %}), and [Week 8: Polishing on mentors' feedback]({% post_url 2026-07-07-week8-mentor-polish %}).

---

## Phase 3: Turning a fixed demo into an algorithmic exercise

The eight-box grid proved that all the infrastructure worked, but it did not leave much for a learner to decide. Every target was known in advance. The next phase changed the central question from **can the robot stack boxes?** to **how should the available boxes be arranged?**

### SKU-based online palletizing

The task moved into YAML and introduced three named box families. The feeder dynamically generates each Gazebo box from its SKU metadata, including size, mass, inertia, and visual color.

The sequence is online: one box arrives, the learner chooses its destination, and only then does the next box enter the cell. This avoids turning the first version into a full offline three-dimensional bin-packing problem while still making box dimensions matter.

The feeder publishes semantic information, and the HAL exposes it through calls such as:

```python
name = HAL.WaitForBox()
box = HAL.GetBoxInfo(name)
pickup = HAL.GetPickupPose(name)
pallet = HAL.GetPalletInfo()
```

`GetBoxInfo()` provides the SKU, dimensions, and mass. `GetPalletInfo()` provides the usable placement area and layer constraints in the robot's `base_link` frame. `GetPickupPose()` provides the observed top-center pose of the current box.

That last API solved an important physical error. Early versions assumed that the conveyor would always stop a box at one ideal coordinate. Gazebo physics left it several centimeters away from that assumption, and the same offset appeared later in the pallet stack. The feeder now tracks the active box through Gazebo Transport and stops the belt using its observed position. The pickup helper then derives the tool pose from the suction contact geometry rather than from a manually tuned offset for each SKU.

### One workcell, several pallet patterns

Once box and pallet geometry became data, changing the planner could produce visibly different results without changing the robot, feeder, or world.

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w12-row-shelf-sku.png" class="img-fluid rounded z-depth-1" %}
  </div>
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w12-brick-layer-sku.png" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  Row/shelf packing and alternating brick-inspired layers.
</div>

<div class="row mt-3">
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w12-rotated-block-sku.png" class="img-fluid rounded z-depth-1" %}
  </div>
  <div class="col-sm mt-3 mt-md-0">
    {% include figure.liquid loading="eager" path="assets/img/w12-medium-pinwheel-full.png" class="img-fluid rounded z-depth-1" %}
  </div>
</div>
<div class="caption">
  A rotated-block strategy and a full MEDIUM-SKU pinwheel layout.
</div>

The baseline row/shelf planner fills the usable area in an approachable first-fit order. More advanced experiments changed layer direction, box orientation, and perimeter structure to produce alternating brick, rotated-block, and pinwheel-style arrangements.

These patterns are not only visual variations. They show how dimensions, available orientation, robot reach, support, and approach direction influence the placement algorithm. The workcell became a playground for palletizing strategies rather than one hardcoded animation.

This transition is described in [Week 10: Starting SKU-based palletizing]({% post_url 2026-07-21-week10-sku-based-palletizing %}) and [Week 12: One workcell, many palletizing patterns]({% post_url 2026-08-04-week12-sku-palletizing-patterns %}).

---

## Phase 4: Bringing the exercise into RoboticsAcademy

A Gazebo simulation that works from several terminals is not yet a RoboticsAcademy exercise. The database, application container, launchers, RAM lifecycle, browser tools, and HAL all have to agree.

| Layer | Responsibility |
|---|---|
| **Scene launcher** | Gazebo, feeder, conveyor bridge, and simulation clock |
| **Robot launcher** | UR10, controllers, MoveIt, action servers, and planning scene |
| **RAM tools** | Browser Gazebo view, RViz, console, and editor |
| **Student code** | Palletizing HAL and placement strategy |

This separation solved a duplicate-RViz problem discovered only during browser testing. The robot launcher and RAM were both starting RViz, causing the browser instance to crash. The robot launcher is now headless, while RAM exclusively owns the learner-visible RViz tool.

{% include figure.liquid loading="eager" path="assets/img/w13-palletizing-in-roboticsacademy.png" class="img-fluid rounded z-depth-1" %}

The final browser workflow launches the Palletizing exercise, selects the matching Harmonic world, starts the scene and UR10, prepares Gazebo, RViz, and console, and executes the student program through `academy.py`. The configured mixed-SKU sequence contains 18 boxes, and the complete sequence was demonstrated through the RoboticsAcademy browser workflow.

This stage also uncovered generic RADI/frontend packaging issues outside the Palletizing feature itself. I kept those findings separate instead of mixing unrelated platform fixes into the exercise PRs.

The complete integration story is in [Week 13: Palletizing arrives in RoboticsAcademy]({% post_url 2026-08-11-week13-palletizing-in-roboticsacademy %}).

---

## Beyond the original goal: Depalletizing

After completing the Palletizing workflow, I used the remaining time to explore its inverse problem.

Depalletizing shares the UR10, suction tool, MoveIt motion layer, and educational abstraction, but it is not simply the same loop played backward. Palletizing starts with an empty destination and decides where to add a box. Depalletizing starts with an existing stack and must decide which box can be removed safely before routing it to the correct destination.

The additional exercise begins with an **18-box, three-layer mixed-SKU stack**. The backend creates the stack from a task manifest, waits for it to settle, tracks the live pose of every box, and exposes the current task snapshot in the robot's `base_link` frame.

Three output conveyors correspond to the three SKU families. The student selects a top-accessible box, picks it using suction, and moves it to the matching conveyor. The backend then tracks the released box physically into a configured acceptance region. A box entering the wrong SKU lane produces an error; correct delivery of every box completes the task.

The student-facing API remains semantic rather than simulator-specific:

```python
task = HAL.GetTaskInfo()
boxes = HAL.GetAvailableBoxes()

box = boxes[0]
pickup = HAL.GetPickupPose(box["name"])
destination = HAL.GetConveyorInfo(box["sku"])
```

Additional calls report pallet information and task status, register released boxes, and wait for physical sorting. The extension also added run-unique box names, stale-entity cleanup, bounded spawn retries, stricter acknowledgements, and failure-aware motion handling.

### Final Depalletizing demo

The final video shows the three-layer stack, the three output conveyors, the UR10 removal workflow, and the exercise running inside RoboticsAcademy.

<video controls width="100%" style="max-width: 720px;">
  <source src="{{ '/assets/video/final-depalletizing.mp4' | relative_url }}" type="video/mp4">
  Your browser does not support the video tag.
</video>

The two published pull requests below contain the Palletizing contribution; Depalletizing was developed as the additional extension demonstrated here.

---

## From the original plan to the final result

| Original direction | Final outcome |
|---|---|
| Create a Palletizing exercise | Complete SKU-based exercise integrated with RoboticsAcademy |
| Reuse existing manipulation infrastructure | Dedicated UR10 suction setup while preserving shared Pick and Place behavior |
| Stack boxes on a pallet | Mixed-SKU online palletizing with several placement patterns |
| Provide a student programming interface | Semantic HAL hiding ROS, Gazebo, feeder, and MoveIt plumbing |
| Integrate the exercise into the browser | Gazebo, RViz, console, editor, and HAL demonstrated through Academy |
| Stretch work after the primary goal | Additional three-layer Depalletizing and SKU-sorting exercise |

---

## Pull requests

The main Palletizing contribution is split across the two repositories used by RoboticsAcademy exercises:

| Repository | Pull request | Main contribution |
|---|---|---|
| RoboticsAcademy | [#3965 — Add SKU-based Palletizing exercise](https://github.com/JdeRobot/RoboticsAcademy/pull/3965) | Exercise registration, browser template, HAL, and student scaffolding |
| RoboticsInfrastructure | [#791 — Add SKU-based UR10 Palletizing exercise](https://github.com/JdeRobot/RoboticsInfrastructure/pull/791) | Workcell, UR10 suction robot, conveyor feeder, MoveIt setup, and SKU infrastructure |

Both PRs are intentionally focused on the primary Palletizing exercise; the additional Depalletizing extension is presented separately in this report.

---

## Validation

Validation covered component behavior, native ROS 2 operation, regression compatibility, and browser-level integration:

- The Palletizing world, UR10, controllers, MoveIt action servers, feeder, conveyor, and suction lifecycle ran through the native ROS 2 workflow.
- A complete 18-box mixed-SKU Palletizing sequence was demonstrated through RoboticsAcademy.
- MoveIt acknowledged the conveyor and pallet collision objects through the planning-scene service.
- The UR10 description was verified to contain one `ros2_control` system.
- Regression testing preserved the existing Pick and Place UR5/Robotiq attachment-and-lift path.
- Focused tests covered feeder state transitions, task configuration, and bounded spawn retries.

The two final videos document the completed Palletizing workflow and the additional Depalletizing exercise.

---

## What I learned

The biggest lesson from this project is that robot manipulation is rarely only a motion-planning problem.

A visible failure such as “the robot did not pick the box” can originate in conveyor timing, tool geometry, Gazebo link behavior, MoveIt configuration, browser process ownership, or database mappings. Four principles repeatedly helped:

1. **Understand the full launch path.** A native ROS demo is only one layer of a RoboticsAcademy exercise.
2. **Use constraints to remove bad solutions.** Better joint limits solved motion-quality problems that planner replacement did not.
3. **Measure simulation state instead of assuming it.** Observed box poses removed systematic pickup and placement drift.
4. **Keep backend mechanics behind semantic APIs.** Students should solve manipulation problems while shared changes remain backward compatible.

---

## Where this can go next

The two exercises provide a foundation for several extensions:

- vision-based box detection behind the existing `GetPickupPose()` abstraction;
- internal collision modeling for carried and placed boxes;
- arbitrary Depalletizing stack manifests and richer removal constraints;
- and pallet-quality metrics for comparing student strategies.

These additions can deepen the planning problem without changing the core educational boundary already established by the HAL.

---

## Thank you

Google Summer of Code gave me the opportunity to work across simulation, robot modeling, motion planning, containers, browser integration, and educational API design. I am grateful to my mentors, the JdeRobot maintainers, and the wider ROS 2, Gazebo, and MoveIt communities for their guidance and open-source work.

The summer began with a world that could display boxes beside a robot. It ends with two educational manipulation exercises that move those boxes in opposite directions while exposing meaningful planning decisions to learners. That change—from a scene into a learning activity—is the result I am most proud of.
