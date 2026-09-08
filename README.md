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

## Basemaps and camera

Three basemaps, because they answer different questions:

| | What it is | Good for |
|---|---|---|
| **Dark** | CARTO dark matter | The city recedes; the agents carry all the colour |
| **Colour** | CARTO Voyager | Street names, parks, land use — sharp at every zoom |
| **Satellite** | Sentinel-2 cloudless (EOX, CC BY 4.0, Copernicus) | Checking a route goes where the ground says it does |

The imagery is Sentinel-2 rather than Esri. Esri's World Imagery is sharper in
cities, but it is display-only under Esri's terms; this repo's own terrain plan
sets the rule of preferring Copernicus so an open, attributable, redistributable
dataset stays open. The honest cost is resolution: the mosaic is 10 m, so it
softens as you zoom into a street. Attribution follows the active basemap.

The camera turns a full 360°. Drag with the right mouse button, press **Q** and
**E**, or use the buttons: rotate, face north, tilt to street level, and a slow
orbit. Any manual input stops the orbit rather than fighting it.

## Reading the map

By default **every household has its own colour**, built from four of its own
variables at once, so a crowd looks like a crowd of individuals rather than four
flat categories:

| Channel | Variable |
|---|---|
| Hue | behaviour, nudged by cohort — an elderly seeker is visibly not an adult seeker |
| Saturation | information quality — washed out means badly informed |
| Lightness | walking speed — dark means slow |
| Size | household headcount |

A big, dark, washed-out dot is a large, slow, badly-informed household, and you
can find it on the map without reading a number. The other four modes colour by
a single axis when you want to answer "where are the elderly?" instead.

## The agents

Every agent is classified on three independent axes. It matters that they are
independent: an elderly person travelling alone and an elderly person inside a
family that is waiting for a son to come home are the same row in a census and
completely different evacuation outcomes.

**One agent is one household**, not one person, and it carries a `weight`: how
many real people it stands for. Everything the model counts is counted in
people, by summing weights. This is what makes the *Agents* slider a resolution
control rather than a population size — the weights always sum to the exposed
population, and the answer does not move when you change it. `npm test` asserts
exactly that.

**1 · Who they are** — adult, child, elderly, disabled. Sets base walking speed.
Weights are post-stratified so the person-weighted cohort shares match the
published split exactly, correcting for the fact that household size is not
independent of who is in the household.

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

## Controlling the population

The shares are the weakest numbers in the model, so they are the ones you can
move. Every share is a slider; editing one rebalances the rest of its axis to
keep the total at 100%, marks the axis **custom**, and lands in the URL — so a
configured population is a link you can send someone.

By default the cohort split is the city's **own per-zone figures**, which no
single set of city-wide sliders can represent without losing that resolution.
Touch a cohort slider and the app says plainly that you have replaced them.

There are also four **variability** controls — how much individuals differ from
their group's mean in speed, information, risk and timing. At zero, everyone in
a cohort is identical: a useful control run and a terrible model of a city.

**Presets** — each one a claim about a population, with the claim written down:
*As sourced*, *Ageing district*, *Family district*, *Visitors & crowd*,
*Drilled population*, *Warning not believed*, *Uniform (control)*.

## Weather and time of day

The same population, on the same roads, evacuates very differently in freezing
rain at three in the morning than on a clear afternoon. Eight weather states and
three times of day compose into multipliers on things the model already has —
walking pace, route capacity, added hazard, how well anyone can judge a route,
how long the warning takes to land, and how long a household takes to gather.
The console prints the resulting effect in plain terms, so a run is never
quietly shaped by numbers nobody looked at.

Conditions apply **live**, without rebuilding the population — you can watch fog
roll in over a run already under way.

Lower Manhattan, same population and seed, 3,000 agents:

| Conditions | 50th | 90th | Elderly | Disabled |
|---|---|---|---|---|
| Clear · evening | 1.3 h | 2.3 h | 1.7 h | 2.0 h |
| Clear · day | 1.5 h | 2.5 h | 1.8 h | 2.1 h |
| Heavy rain · day | 1.8 h | 3.4 h | 2.4 h | 3.2 h |
| Clear · night | 1.8 h | 3.2 h | 2.3 h | 2.8 h |
| Ice · day | 2.1 h | 4.1 h | 3.5 h | 4.7 h |
| **Ice · night** | **2.9 h** | **6.6 h** | **5.6 h** | **7.4 h** |

The headline number roughly doubles. The number for disabled evacuees more than
triples. That gap — not the median — is what the weather actually does.

### What it shows

The console foregrounds **50th and 90th percentile clearance time**, measured on
when an agent actually reached the far end of its route — not when it left the
district, which flatters anyone who turned back. Some results that fall out of
the model rather than being put into it:

- **Districts mobilise at different times, not in lockstep.** Social proof is
  measured per zone — milling is watching your own neighbours, not reading a
  city-wide statistic — and the warning reaches districts unevenly. Zones
  diverge by up to 42 percentage points: one district can be 15% mobilised while
  the one beside it is at 58%.
- **People re-route around jams, if they can see them.** An agent still in its
  own district reconsiders every five minutes and will switch if another route
  is clearly better. In fog, far fewer do — you cannot be re-routed by a queue
  you cannot see.
- **Institutional units clear in ~5.9 h against ~3.3 h for people travelling
  alone** — nearly double, on the same routes.
- **A returner costs itself ~2.6 hours.**
- At low hazard, a persistent minority **refuses to leave**; raise the hazard
  slider and they finally move — and the median clearance time gets *worse*,
  because they are now leaving late and into a crowd.
- **Reaching an exit is not reaching safety.** Mariupol's eastward route led to
  filtration, and the households that take it are counted separately, never as
  evacuated.

## Tests

```sh
npm test
```

No dependencies; the tests are the point. They encode the invariants that a
model like this has to hold — most importantly that **the answer must not depend
on how many households are simulated**, which is the defect that a full review
of this repo turned up first. Others assert that weights sum to the exposed
population in every city, that a filtration exit is never counted as safety,
that capacity actually constrains a route, that no cohort can deadlock, and that
no agent in Lower Manhattan starts in or crosses the Hudson.

## Layers

| Layer | Source | Fidelity |
|---|---|---|
| Basemap | CARTO dark-matter (OSM data) | real |
| Buildings | OSM centroids, extruded columns | real positions; **heights are OSM's own** where recorded — 96% in Lower Manhattan, 88% in Miami, 14% on the Strip, 0% in Mariupol. The rest get a low synthetic massing, tinted blue so you can see which parts of the skyline are evidence |
| Damage | 783 UNOSAT points, CE20220223UKR, 14 Mar 2022 | real, severity 0–3 |
| Zone cohorts | ETC severity model, late Mar–Apr 2022 | real counts; marker lon/lat placed in the city centre, not surveyed centroids |
| Roads | OSM highway network per city, via Overpass | real; the routes are Dijkstra paths over this graph |
| Agent origins | real OSM building centroids inside each zone | real; people start in buildings, so nobody starts in the river |
| Approach legs | road path from each zone to each route, per zone × route | real; every metre an agent walks is on a road |
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

### Enabling CI

The test workflow is not committed: the token used to push this repo lacks the
GitHub `workflow` scope. To turn it on, either run `gh auth refresh -s workflow`
and commit `.github/workflows/ci.yml`, or add it through the web UI — it needs
nothing but `actions/checkout`, `actions/setup-node`, and `npm test`.
