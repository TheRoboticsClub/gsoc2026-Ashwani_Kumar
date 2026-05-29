---
layout: post
title: "Week 2 — One click, one new universe"
date: 2026-05-28
description: Following a single click from the React UI all the way to `ros2 launch` — and slipping a brand-new Palletizing Harmonic world into that pipeline along the way.
tags: [gsoc, roboticsacademy, gazebo-harmonic, ros2]
categories: [updates]
---

> *GSoC 2026 · Week 2 · Coding period begins*

# Week 2: New Palletizing Universe

Last week I spent staring at code paths. This week I spent builing something.

The brief: stand up a new **Palletizing Harmonic** universe inside RoboticsAcademy, reusing the UR5 + Robotiq 85 gripper from Pick & Place, but with a different scene — six identical boxes on the conveyor, a pallet platform waiting to be stacked. The fun question wasn't "can I do it?" but "*how little do I have to touch?*" RoboticsAcademy spans four repos and four runtime stages, and there's a temptation, when adding a feature, to reach into all of them. The discipline this week was resisting that.

The answer turned out to be reassuringly small. **One SDF world, two launch files, three SQL rows, and one tiny patch** — and the dropdown lights up with a new entry that launches end-to-end.

## The path of one click

Before the diff, the picture. Here's everything that happens between *click* and *Gazebo window*:

```
   SQL seed files
        │
        ▼
   Postgres (universe_db)
        │     SELECT ... JOIN exercises_universes JOIN universes JOIN worlds
        ▼
   Django backend  ──── HTTP :7164 ────►  React UI
        │                                    │
        │   ◄──── WebSocket :7163 ───────────┘   "launch this universe"
        ▼
   Robotics Application Manager (RAM)
        │   FSM: idle → connected → world_ready → tools_ready → running
        ▼
   subprocess.Popen("ros2 launch palletizing_harmonic.launch.py")
        │
        ▼
   gz sim · MoveIt · ros_gz_bridge · controllers · RViz (separately)
```

Adding a universe means stitching a new row through stage 1, and dropping a new launch file at the end of stage 4. Every stage in between just relays. *That's* what makes the change so small — the architecture does the heavy lifting for you, as long as you don't fight it.

## The diff, in pieces

### 1. The world (`palletizing_arm_harmonic.world`)

A 317-line SDF file at `Industrial/robotiq_description/world/`. About 250 lines of it are copied verbatim from `warehouse_arm_harmonic.world` — the ground plane, lighting, conveyor, target table (which doubles as the pallet platform for now), the robot base cylinder, and the obligatory `gz-sim-physics-system` / `SceneBroadcaster` / `LinkAttacher` plugins. The only real authoring was the **pickable section**: six identical brown boxes laid out in a 2×3 grid on the conveyor side, sitting at `z = 1.04` so they hover just above the conveyor surface.

The discipline here is *don't move what isn't broken*. The arm doesn't shift. The conveyor doesn't shift. The robot base stays at the same pose. That keeps every MoveIt frame, every controller config, every TF tree from Pick & Place valid — and means I don't have to retune a single planner parameter.

### 2. The two launchers

RAM expects every Harmonic universe to ship a pair: a **main launcher** that brings up `gz sim`, the arm, controllers, and the gz↔ROS bridge; and a **separate RViz launcher** that RAM kicks off as its own process. They communicate only over ROS topics — neither knows the other exists.

The main launcher (`Launchers/palletizing_harmonic.launch.py`) is *73 lines and almost no logic*. It sets `GZ_SIM_RESOURCE_PATH` so gz can find the meshes, then includes the same `spawn_robot_warehouse.launch.py` that Pick & Place uses — only overriding the world path:

```python
warehouse_launch = IncludeLaunchDescription(
    PythonLaunchDescriptionSource(warehouse_launch_file),
    launch_arguments={
        "launch_rviz": "false",          # Academy launches RViz separately
        "world_file": palletizing_world_file,
    }.items(),
)
```

The RViz companion (`Launchers/rviz/palletizing_harmonic.launch.py`) is a near-verbatim clone of its Pick & Place sibling, with only the docstring header changed. Same arm xacro, same MoveIt config, same RViz layout. Genuinely a one-character-class-of-edit file.

### 3. The patch that makes both launchers possible

The piece I'm proudest of, because it's small but it *unlocks* the rest. The Pick & Place stack inherits a launch file from `ur5_gripper_description` called `spawn_robot_warehouse.launch.py`, which composes the full simulator. Until this week, the world path was hardcoded inside it:

```python
world_file = os.path.join(
    robotiq_pkg_share_dir, "world", "warehouse_arm_harmonic.world"
)
```

That hardcoding is what makes "just add a world" *not* work — every new world had to bring its own full copy of the composition. I lifted the path into a launch argument with a backwards-compatible default:

```python
default_world_file = os.path.join(
    robotiq_pkg_share_dir, "world", "warehouse_arm_harmonic.world"
)

declared_arguments = [
    DeclareLaunchArgument("ur_type", default_value="ur5"),
    DeclareLaunchArgument("launch_rviz", default_value="true"),
    DeclareLaunchArgument(
        "world_file",
        default_value=default_world_file,
        description="Absolute path to the .world file to load in gz sim",
    ),
]
# ...
world_file = LaunchConfiguration("world_file")
```

Pick & Place doesn't notice — its call site passes no `world_file`, so the default kicks in. Palletizing passes its own. Any *future* universe that reuses this arm gets the same shortcut for free.

This is the change I want to land upstream first, because everything else depends on it.

### 4. Three SQL rows

The database is the catalog. Three small rows are enough:

| Where | Row | Meaning |
|---|---|---|
| RoboticsInfrastructure `database` branch — `universes.sql` | `worlds (id=68, type=gz, launch_file_path=/opt/jderobot/Launchers/palletizing_harmonic.launch.py, tools_config={"rviz":".../rviz/palletizing_harmonic.launch.py"})` | "Here's a world." |
| same file | `universes (id=68, name='Palletizing Harmonic World', world_id=68, robot_id=0)` | "It's a launchable universe." |
| RoboticsAcademy — `database/exercises/db.sql` | `exercises_universes (71, 17, 68, False)` | "It belongs inside exercise 17 (Pick & Place), and it isn't the default." |

That third row is the one that makes the new universe show up in the dropdown *without* requiring a new exercise card, new icon, new React route, or any frontend change at all. The UI is rendered straight from the JSON Django assembles by joining these tables. Add a row, restart with `down -v`, refresh — there it is.

## Smoke test

```
Dropdown: "Palletizing Harmonic World"  ─► click ─► play
    │
    ▼
RAM logs:  idle → connected → world_ready → tools_ready → application_running
    │
    ▼
noVNC at :6080 shows gz sim window
    Scene: ground · conveyor · table · UR5 + Robotiq 85 · 6 brown boxes
RViz comes up in a second window. MoveIt planning groups loaded.
```

It works.

## Things that nearly bit me

- **The SQL columns are tab-separated.** Postgres `COPY ... FROM stdin;` is strict. Any editor that helpfully expands tabs into spaces silently breaks the seed and you spend twenty minutes wondering why your row "isn't being inserted."
- **The world's root element must be `<world name="default">`.** Renaming it to `"palletizing"` (which I tried, because it felt cleaner) breaks the bridge naming downstream. Fight that instinct.
- **Colcon installs the world to two places.** The source `world/` directory and the install tree at `install/robotiq_description/share/robotiq_description/world/`. During iteration you either edit both or rebuild the package. I lost half an hour to this before noticing.
- **The Postgres volume is anonymous on purpose.** `docker compose down -v` re-seeds from the SQL files. Forgetting the `-v` flag means your changes are invisible. Don't trust the cached database.

## The bigger lesson

What I keep coming back to is how *much* of this week's work was reading rather than writing. The actual diff is maybe 400 lines, most of it copy-pasted SDF. But the design — the call to *not* add a new exercise, *not* add a new robot, *not* fork the composition launcher, *not* hardcode a second world path — required understanding the four-stage pipeline well enough to know which seams to cut along.

I wrote those mental models down as I learned them — eight numbered chapters now sitting at [`learning-notes/universe-launch/`](https://github.com/JdeRobot/RoboticsAcademy/tree/humble-devel/learning-notes/universe-launch). They were originally for me; if any of them turn out to be useful for the next person doing this, I'll polish them into standalone posts.

## Loose ends

The arm doesn't *do* anything yet once the scene loads — there's no palletizing motion plan written. That's next week. The pallet platform is the target table reused as-is; a proper slatted pallet model would look more convincing, but it's cosmetic.

## What's next

- A real palletizing motion plan — pick a box, place it on the pallet, repeat for the 2×3 grid. The point is to confirm that MoveIt carries over from Pick & Place unmodified.
- Open the upstream PRs: three new files to RoboticsInfrastructure `humble-devel`, two SQL rows to the `database` branch, one to RoboticsAcademy `humble-devel`.
- Record a short demo video for the next post — the conveyor and the boxes are photogenic in a way that screenshots don't quite capture.
- Possibly: a standalone post on *why RAM exists at all* (why Django doesn't just `subprocess.Popen` directly). I drafted it as a learning note this week and I think the argument is worth its own page.

Until next week 👋
