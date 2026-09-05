# Method — what is real, what is modelled, what is illustrative

This note exists so that nothing in the picture has to be taken on trust.

## 1. Real, vendored unchanged

| Thing | Source | Date |
|---|---|---|
| 45,544 building centroids | OpenStreetMap extract, via ETC `mariupol_lights.json` (ODbL) | 2022 |
| 783 damage points, severity 0–3 | UNITAR/UNOSAT CE20220223UKR | 14 Mar 2022 |
| Five emergency-zone cohorts — population, vulnerable, children, elderly, disabled, damage %, dark %, destroyed, radius | ETC `mariupol-evacuation-model`, "Data-Driven Evacuation Analysis" | late Mar–Apr 2022 |
| Scenario facts — severity 0.54 (Phase 3/5), pre-siege population 343,598, ~16 % damaged, 22 % lights, 227 km to Zaporizhzhia | same | 16 Mar 2022 |
| Basemap geometry and labels | CARTO dark-matter, built from OSM | current |

The five zones sum to the published **37,663 exposed** and **16,102 vulnerable**.
Zone 5's child/elderly/disabled split is estimated to its exact published
vulnerable total, because the source row is truncated.

## 2. Modelled — generated here from the real aggregates

**The population.** Agents are sampled zone-by-zone in proportion to published
exposed population, and cohort-by-cohort in proportion to the published
child / elderly / disabled / adult split. A run of *N* agents is therefore a
*scale model* of the real 37,663 with the real demography, not a different
population.

**Per-agent attributes.** Walking speed is a normal draw around a cohort mean
(adult 1.35, child 0.95, elderly 0.75, disabled 0.55 m/s) — ordinary
pedestrian-flow figures, not measured in Mariupol. Information quality and risk
tolerance are normal draws around console-set means. Group size is drawn so that
~42 % of non-child agents travel in a unit of 2–4, and a unit moves at 0.82× the
speed of its fastest member.

**Departure time** is emergent, not drawn directly:
`spread × (1 − info) × (1 − 0.5·risk) × (1 − 0.4·damage)`. Poor information and
low risk tolerance delay departure; heavy damage in one's own block accelerates
it.

**Movement.** A fixed tick advances each agent along its own polyline
(origin → EXIT WEST → corridor). On the in-city leg, speed is reduced by hazard
`h·(1 − 0.4·risk)·0.6` — taking cover, backtracking around a struck block — and,
within 300 m of the exit, by queue pressure. Congestion is emergent and shared:
the count of agents inside that 300 m band against the console's corridor
capacity. On the open road agents hold a 0.92× column pace. If the corridor is
closed, an agent reaching the mouth with information quality below 0.7 turns
back.

**The reported number.** Given enough hours almost everyone clears, so total
evacuated is a weak metric. The console foregrounds **50th and 90th percentile
clearance time**, which is what moves when capacity or opening hours change.

## 2b. The three classification axes

**Who they are** (cohort) is the published split for Mariupol and a US-urban
profile (17% children, 16% elderly, 11% disabled) for the other three, stated as
modelled everywhere it is shown.

**Who they travel with** (alone 28% / family 44% / ad-hoc group 20% /
institutional 8%) and **how they behave** (prompt 24% / information-seeker 30% /
wait-and-see 26% / reluctant 13% / returner 7%) are modelled in all four cities.
The shares are drawn from the evacuation-behaviour literature's broad findings —
that family reunification dominates delay, that most people seek confirmation
before acting, that a persistent minority does not leave — not from any survey
of these populations. They are round numbers, and should be read as a structure
to reason with rather than a measurement.

Two constraints are applied after sampling, because the independent draws
produce impossible people otherwise: a child is never alone or in an ad-hoc
group, and an adult in institutional care is usually reassigned to a family.

## 2c. Route choice

Each agent estimates, for every open route, the time it would cost: the walk to
its nearest entry point on that route, plus the remaining route length at its
own pace, plus expected queueing. Expected queueing is everyone already
committed to the route and not yet out, divided by the route's capacity, scaled
by the agent's information quality — a badly-informed agent simply cannot see
the queue it is about to join.

Two further terms stop the model collapsing into one route, which is the failure
mode of a naive shortest-path assignment and the thing real evacuations never do:

- **Idiosyncratic preference** — a per-agent multiplicative bias on each route,
  centred on 1. The road you know, the direction your family lives in, the
  bridge you have always used.
- **Crowd-following** — a pull toward whatever route is already popular,
  strongest in badly-informed agents and in ad-hoc groups, which form out of
  people already moving. This is the mechanism by which an overloaded route
  keeps attracting people, and it is exposed as a slider.

## 3. Illustrative — geometry that looks right but was not surveyed

- **Building heights.** The OSM extract carries no per-building height. Heights
  are hashed from the centroid into a plausible Soviet-plan skyline — mostly
  5-storey stock, taller blocks toward the centre. The *positions* are real; the
  *heights* are not.
- **Which exits are designated.** The routes themselves are real paths over the
  real road graph, computed by `tools/fetch_city.py` — nothing about them is
  drawn by hand. But *which* egress points count as evacuation exits is a
  judgement made in that script's `EXITS` table. For Mariupol they are the four
  real directions out of the encirclement, including the eastward
  filtration-bound one, which is an exit from the city and not an exit to
  safety. For the other three they are the obvious real crossings and arterials,
  not the official designations of NYC OEM or Miami-Dade.
- **Where routes start.** All routes for a city are measured from the
  population-weighted centroid of its origin zones, so their lengths are
  comparable. A route measured from whichever zone happens to sit next to an
  exit would flatter that exit.
- **Zone marker placement.** Mariupol's five markers sit in the real city centre
  at positions chosen for the model, not at surveyed cell centroids; their
  *attributes* are the published ones. The other cities' zones are named after
  real neighbourhoods and placed on them, but their populations are modelled.

## 4. What this is not

Not operational. Not predictive. Not keyed to any live individual location. Not
an adjudication of responsibility. It is a retrospective planning and teaching
artifact about a siege that ended in 2022, built only from open, attributed,
retrospective data, under the same guardrails as the upstream ETC work.

## 5. Replacing the schematic parts

Every schematic layer is a file, not code:

- `data/route.geojson` — drop in the georeferenced corridor polyline.
- `data/buildings.json` — supply `[lon, lat, height]` triples and delete the
  `hashedHeight` call in `src/map.js` to use real heights.
- `data/pois.geojson` — surveyed zone centroids.
