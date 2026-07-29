---
layout: post
title: "Week 9 — Syncing the palletizing exercise with upstream"
date: 2026-07-14
description: The palletizing branches caught up with JdeRobot upstream — Worlds became Scenes, universe records moved to the new world/scene schema, IDs changed to exercise 30 and world 73, and the UR10 MoveIt group setup converged with upstream's ROB_GROUP parameter.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2, moveit]
categories: [updates]
---

> *GSoC 2026 · Week 9 · Coding period*

# Week 9: Syncing the palletizing exercise with upstream

After Week 8, the palletizing demo was in a good place visually: the UR10 picked boxes from the conveyor, carried them cleanly, and stacked them on the pallet. But there was a less visible problem underneath it — the feature branches had drifted from upstream JdeRobot.

This week was about paying that debt down. Less shiny demo work, more integration work: bringing the branches back onto the current upstream structure, resolving schema changes, and making sure the palletizing exercise still has a clean identity inside the platform.

---

## Why the sync mattered

The palletizing work had been moving quickly on top of an older base. Meanwhile, upstream kept changing around it: new robots, new launchers, database changes, and a terminology cleanup that renamed the old universe/world layout.

Letting that gap grow would make every future test less representative. The exercise might work in my local branch, but not in the current RoboticsAcademy + RoboticsInfrastructure stack that it eventually has to live in. So the goal for the week was simple: catch up now, while the conflict set was still understandable.

The sync was done carefully instead of directly on the active branch. I kept a backup at the pre-merge state, performed the merge in an isolated worktree, reviewed the conflicts there, and only then fast-forwarded the main `palletizing-exercise` branch. That way, the working branch stayed recoverable during the whole process.

---

## Worlds became Scenes

One of the biggest upstream changes was the database and launcher terminology.

Earlier, the project used `universes.sql` and a `Worlds/` directory. Upstream moved to the newer structure:

- `Worlds/` became `Scenes/`.
- `database/universes.sql` became `database/worlds.sql`.
- The old universe/world naming split changed into world/scene records.

So the palletizing launcher and database rows had to move with that structure. The world file now lives under `Scenes/`, and the launcher points there instead of the stale `Worlds/` path.

This was not just a rename. Upstream had also claimed the IDs I had used earlier, so the palletizing entries had to be renumbered.

The current mapping is:

- exercise: `30`
- world: `73`
- scene: `73`
- robot: `31`

That is the set the Academy side now points to as well: the palletizing exercise is exercise `30`, linked to world `73`, which launches the palletizing scene and the UR10 suction robot.

A small note for future-me: some older notes still mention exercise `27` or universe/world `71`. Those are historical now. The post-sync exercise identity is `30 → 73`, with scene `73` and robot `31`.

---

## Converging with upstream's MoveIt group parameter

Another useful outcome of the sync was around the MoveIt planning group.

Earlier in the project, the IFRA execution servers had a hardcoded planning group for the UR5. That broke the UR10 suction setup, because the palletizing robot uses the `ur10_arm` group. I had solved that locally by parameterizing the group name.

During the sync, I found that upstream had solved the same class of problem too, but with a different parameter name. Instead of keeping my local version and creating a long-term divergence, I switched the palletizing launcher to upstream's final shape: `ROB_GROUP`.

So the UR10 suction launch path now follows the same convention as the current upstream robot launchers. The palletizing launcher passes `ur10_arm`, and the shared execution code stays aligned with upstream instead of carrying a forked version of the same idea.

That is the kind of sync result I like: not just "conflicts resolved", but one more custom patch removed.

---

## Rebuilding the Academy side cleanly

The Infrastructure sync was only half the story. RoboticsAcademy also needed to point to the new world and scene IDs, and the exercise needed to sit cleanly on top of current upstream.

So the Academy side was rebuilt as the standalone palletizing exercise on the current base, instead of carrying forward old experimental history. The important part is that the public exercise identity is now clear:

- Palletizing is its own exercise, not a hidden variant of Pick and Place.
- The database entry points to world `73`.
- The exercise remains marked as a prototype while integration work continues.

This also keeps the project easier to review. The palletizing changes are focused around the exercise, its templates, and its database link, instead of being mixed with unrelated churn.

---

## What changed from the student's point of view?

Ideally, not much.

The student still sees the same idea: a UR10 with a suction cup waits for a box, picks it from the conveyor, and stacks it on the pallet through the HAL. The sync was mostly platform plumbing — paths, IDs, launch records, and robot configuration — but that plumbing matters because it decides whether the exercise launches in the real RoboticsAcademy flow.

The student-facing API stays centered around calls like:

- `WaitForBox()`
- `MoveJoint(...)`
- `MoveLinear(...)`
- `SuctionSet(...)`
- `BoxDone(name)`

That separation is the point of the HAL. The branch can survive a database rename or a launcher refactor without forcing students to learn about those internals.

---

## What's next

With the branches synced, the next step is to move the exercise beyond identical boxes and a hardcoded 2×2×2 target grid. The mentors' direction is to make palletizing more algorithmic: different box dimensions, SKU families, and placement patterns.

So next week I will start turning the fixed-box demo into an SKU-based palletizing exercise.

Until next week 👋
