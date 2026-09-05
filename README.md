# Mariupol 3D — agentic evacuation twin

A browser 3-D twin of Mariupol on a **CARTO** basemap, populated by an **agentic
synthetic population** that walks the March 2022 humanitarian corridor west out
of the city.

**Live:** https://ethical-tech-colab.github.io/mariupol-3d/

> Retrospective, open-data, **non-operational**. This is a planning and teaching
> artifact about a siege that ended in 2022. It is not a tracking tool, it is
> not keyed to any live individual location, and no part of it should be read as
> operational guidance.

---

## What it is

Two existing pieces of work, joined:

| From | What it contributes |
|---|---|
| [ETC `mariupol-evacuation-model`](https://github.com/Ethical-Tech-CoLab/mariupol-evacuation-model) | The real city and the real demography — 45,544 OSM building centroids, 783 UNITAR/UNOSAT verified damage points, and the five published emergency-zone cohorts (37,663 exposed, 16,102 vulnerable) |
| [Race Condition](https://github.com/GoogleCloudPlatform/race-condition) (via the ETC fork [`race-condition-mod`](https://github.com/Ethical-Tech-CoLab/race-condition-mod)) | The agent model — thousands of autonomous agents on a shared spline, each with its own pace, the field stretching out behind the leaders |

Race Condition puts a marathon field on a route through a 3-D city. An
evacuation is the same shape of problem: many people, imperfect information,
one shared route, bottlenecks, and a clock. This repo keeps that loop and
changes what slows an agent down — a runner is slowed by fatigue, an evacuee is
slowed by **congestion at the corridor mouth**, by **hazard on the in-city leg**,
and by **not knowing whether the corridor is open at all**.

The rendering is a deliberate departure from the fork: instead of a
photogrammetry GLB and a bespoke Three.js scene, this is **deck.gl over a CARTO
vector basemap** — keyless, free, ~40 KB of application code, and every layer is
georeferenced rather than model-space.

## The agents

Every agent is expanded from a published aggregate, never invented. Sampling is
proportional to each zone's exposed population, and the child / elderly /
disabled split within a zone is the published one.

Each agent carries:

- **cohort** — adult, child, elderly or disabled, which sets its base walking speed
- **information quality** — how well it knows the corridor's status; poor
  information delays departure and makes an agent turn back at a rumour
- **risk tolerance** — willingness to move while the zone is under fire
- **group size** — a family is one decision unit and moves at the pace of its
  slowest member
- **departure time** — emergent from information, risk, and how badly its own
  block is already damaged
- **origin** — a jittered point inside its zone's published radius

The number the console foregrounds is not "how many got out" — given enough
hours, almost everyone does. It is the **50th and 90th percentile clearance
time**, which is what actually changes when a corridor's capacity or opening
hours are negotiated.

## Layers

| Layer | Source | Fidelity |
|---|---|---|
| Basemap | CARTO dark-matter (OSM data) | real |
| Buildings | 45,544 OSM centroids, extruded columns | real footprint positions; **heights are hashed** for skyline, the source carries none |
| Damage | 783 UNOSAT points, CE20220223UKR, 14 Mar 2022 | real, severity 0–3 |
| Zone cohorts | ETC severity model, late Mar–Apr 2022 | real counts; marker lon/lat placed in the city centre, not surveyed centroids |
| Corridor | EXIT WEST → Zaporizhzhia direction | **schematic** representative line |
| Agents | generated here | synthetic, from real aggregates |

The hashed building heights and the schematic corridor are the two places where
the picture is illustrative rather than surveyed. Both are labelled in the app.

## Running it

No build step, no keys, no backend.

```sh
git clone https://github.com/Ethical-Tech-CoLab/mariupol-3d
cd mariupol-3d
python3 -m http.server 8000
# open http://localhost:8000
```

## Layout

```
index.html          console + scene shell
src/population.js   published aggregates -> individual agents
src/engine.js       the tick loop: pace, congestion, hazard, turn-back
src/map.js          CARTO basemap + deck.gl layer definitions
src/app.js          wiring, clock, statistics
data/               vendored ETC data packs (see data/README.md)
docs/METHOD.md      what is real, what is modelled, what is illustrative
```

## Attribution

Basemap © [CARTO](https://carto.com/about-carto/), data ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Damage points UNITAR/UNOSAT (CE20220223UKR). Zone cohorts from the Ethical Tech
CoLab `mariupol-evacuation-model`. Agent model after Race Condition
(Apache-2.0, Google Cloud Platform).

An [Ethical Tech CoLab](https://github.com/Ethical-Tech-CoLab) project.
