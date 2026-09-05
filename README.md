# Mariupol 3D — agentic evacuation twins

Browser 3-D city twins on a **CARTO** basemap, populated by an **agentic
synthetic population** that has to get out — choosing between real evacuation
routes traced over each city's actual OpenStreetMap road network.

| City | Hazard | Routes | Buildings | Demography |
|---|---|---|---|---|
| **Mariupol** | Siege, March 2022 | 4 | 45,544 | **published** ETC severity-model cohorts |
| **Lower Manhattan** | Coastal storm surge (Zone 1) | 5 | 17,770 | modelled |
| **Las Vegas Strip** | Mass-gathering egress | 4 | 2,607 | modelled |
| **Downtown Miami & Brickell** | Hurricane (Zone A) | 4 | 14,052 | modelled |

Switch cities in the console, or with `?city=mariupol|nyc|vegas|miami`.

**Live:** https://ethical-tech-colab.github.io/mariupol-3d/

> Open-data, **non-operational**. A planning and teaching artifact: one
> retrospective case that ended in 2022, and three illustrative ones built on
> real geography with modelled populations. It is not a tracking tool, it is not
> keyed to any live individual location, no agent corresponds to a real person,
> and none of it should be read as operational guidance or as an evacuation plan
> for any of these cities.

---

## What it is

Two existing pieces of work, joined:

| From | What it contributes |
|---|---|
| [ETC `mariupol-evacuation-model`](https://github.com/Ethical-Tech-CoLab/mariupol-evacuation-model) | The real city and the real demography — 45,544 OSM building centroids, 783 UNITAR/UNOSAT verified damage points, and the five published emergency-zone cohorts (37,663 exposed, 16,102 vulnerable) |
| [Race Condition](https://github.com/GoogleCloudPlatform/race-condition) (via the ETC fork [`race-condition-mod`](https://github.com/Ethical-Tech-CoLab/race-condition-mod)) | The agent model — thousands of autonomous agents on a shared spline, each with its own pace, the field stretching out behind the leaders |

Race Condition puts a marathon field on a route through a 3-D city. An
evacuation is the same shape of problem: many people, imperfect information,
shared routes, bottlenecks, and a clock. This repo keeps that loop and changes
two things.

**What slows an agent down.** A runner is slowed by fatigue; an evacuee is
slowed by congestion where the crowd funnels onto a route, by hazard on the leg
out of the district, and by not knowing whether the way out is open.

**How many courses there are.** A marathon has one. Every city here has four or
more, each a Dijkstra path over its real road graph, and every agent has to
choose. That choice — made on imperfect information, with a pull toward
whatever the crowd is doing — is most of what the model is about. *A route is
only fast until everyone picks it.*

The rendering is a deliberate departure from the fork: instead of a
photogrammetry GLB and a bespoke Three.js scene, this is **deck.gl over a CARTO
vector basemap** — keyless, free, ~40 KB of application code, and every layer is
georeferenced rather than model-space.

## The agents

Every agent is classified on three independent axes. It matters that they are
independent: an elderly person travelling alone and an elderly person inside a
family that is waiting for a son to come home are the same row in a census and
completely different evacuation outcomes.

**1 · Who they are** — adult, child, elderly, disabled. Sets base walking speed.
Sampled to preserve each zone's published child / elderly / disabled split.

**2 · Who they travel with** — the decision unit, which is what actually moves,
at the pace of its slowest member:

| Unit | Share | Size | Why it matters |
|---|---|---|---|
| Alone | 28% | 1 | Nobody to wait for. First out. |
| Family | 44% | 2–5 | Will not leave until it is whole — the largest single source of delay |
| Ad-hoc group | 20% | 3–10 | Forms out of people already moving; the strongest transmitter of crowd route choice |
| Institutional | 8% | 12–40 | A ward, a care home, a coach. Cannot self-evacuate; waits for transport that may not come |

**3 · How they behave** — the axis no census records, and the one that decides
who is still inside when a route closes:

| Behaviour | Share | What it does |
|---|---|---|
| Prompt | 24% | Acts on the first warning it believes |
| Information-seeker | 30% | Will not move until it confirms the warning elsewhere |
| Wait-and-see | 26% | Watches the neighbours; a district sits still, then empties at once |
| Reluctant to leave | 13% | Will not go while staying seems survivable. **Only rising hazard moves them** |
| Returner | 7% | Leaves, then goes back — for a person, a document, an animal |

Each agent then carries an **information quality** (how soon the warning reaches
it, how well it can judge a route), a **risk tolerance**, and an **origin**
jittered inside its zone.

### The lifecycle

`UNAWARE → SEEKING → MILLING → EVACUATING → (RETURNING) → DONE` — the same
vocabulary the CoLab's [Evacuation Behavior Simulator](https://github.com/Ethical-Tech-CoLab/Evac-Sim-Melanie)
uses, deliberately. Milling burns down faster the more of the district is
visibly already moving, so the whole population can stall and then go at once.

### What it shows

The console foregrounds **50th and 90th percentile clearance time**, measured on
when an agent actually reached the far end of its route — not when it left the
district, which flatters anyone who turned back. Some results that fall out of
the model rather than being put into it:

- **Institutional units clear in ~5.9 h against ~3.3 h for people travelling
  alone** — nearly double, on the same routes.
- **A returner costs itself ~2.6 hours.**
- At low hazard, **13% of the city never leaves at all**; raise the hazard slider
  and they finally move — and the median clearance time gets *worse*, because
  they are now leaving late and into a crowd.

## Layers

| Layer | Source | Fidelity |
|---|---|---|
| Basemap | CARTO dark-matter (OSM data) | real |
| Buildings | 45,544 OSM centroids, extruded columns | real footprint positions; **heights are hashed** for skyline, the source carries none |
| Damage | 783 UNOSAT points, CE20220223UKR, 14 Mar 2022 | real, severity 0–3 |
| Zone cohorts | ETC severity model, late Mar–Apr 2022 | real counts; marker lon/lat placed in the city centre, not surveyed centroids |
| Roads | OSM highway network per city, via Overpass | real; the routes are Dijkstra paths over this graph |
| Evacuation routes | 4–5 per city, to real named egress points | real road paths; **which** exits are designated is a judgement, documented per city |
| Agents | generated here | synthetic; cohort mix real for Mariupol, modelled elsewhere; unit and behaviour mixes modelled everywhere |

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
src/population.js   aggregates -> individuals, on three classification axes
src/engine.js       lifecycle, route choice, pace, congestion, hazard
src/cities.js       the city registry
src/map.js          CARTO basemap + deck.gl layer definitions
src/app.js          wiring, clock, statistics
tools/fetch_city.py builds a city pack from OSM: buildings, roads, routes
data/cities/<id>/   one pack per city
docs/METHOD.md      what is real, what is modelled, what is illustrative
```

## Attribution

Basemap © [CARTO](https://carto.com/about-carto/), data ©
[OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL).
Damage points UNITAR/UNOSAT (CE20220223UKR). Zone cohorts from the Ethical Tech
CoLab `mariupol-evacuation-model`. Agent model after Race Condition
(Apache-2.0, Google Cloud Platform).

An [Ethical Tech CoLab](https://github.com/Ethical-Tech-CoLab) project.
