# Method — what is real, what is modelled, what is illustrative

## 0. The unit of account

**One agent is one household. It carries `weight`: the number of real people it
represents.** Every count the model reports — evacuated, still inside, queued,
on a route — is a sum of weights, never a count of agents.

Weights are set so that Σweight equals the zone population actually exposed, and
then post-stratified so that the person-weighted share of each cohort matches
its published share. The second step is needed because household size is not
independent of household composition: children are placed in families and
families are large, so a raw sample over-represents children in person terms
even when it is correct in household terms. This is ordinary survey weighting.

This matters more than any other choice in the model. Before it, an agent was
simultaneously "one sampled person" and "a household of five", congestion was
counted in agents, and so the model's headline outputs moved when you changed
the *Agents* slider — a resolution control silently setting the population. The
median clearance time drifted from 4.23 h to 4.68 h and the peak queue from 67
to 2,998 across sample sizes of the same city. `test/model.test.mjs` now asserts
that clearance and peak queueing are stable across sample sizes.

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

## 2d. Where agents start, and how they reach a route

Agents start on **real OSM building centroids** sampled from inside their zone's
radius, not on a jittered circle. This is both more honest — people start in
buildings — and a correctness fix: a jittered circle around a waterfront zone
such as Battery Park City puts a share of the population in the Hudson.

The walk from a front door to a route is a **road path**, precomputed per zone ×
route by `tools/fetch_city.py` and stored in `approaches.geojson`. Before this,
that leg was a straight line to the nearest route vertex — which from Battery
Park City runs across open water. An evacuation model that lets people cross a
river is not modelling an evacuation. Every metre an agent covers is now on a
road.

An agent still joins a route at the point nearest its own zone rather than at
the route's head, which is what keeps route choice a real trade-off: the
shortest route is often not the closest one to you.

## 2e. Weather and time of day

Eight weather states and three times of day compose into multipliers on
quantities the model already had:

| Multiplier | Applies to |
|---|---|
| `speed` | walking pace, everyone |
| `perCohort` | extra pace penalty on named cohorts — ice on the elderly, heat on the very young |
| `capacity` | how many people a route's mouth absorbs per minute |
| `hazard` | added to the hazard slider, clamped to 1 |
| `visibility` | how well an agent can judge routes and queues — *not* how fast it walks |
| `warn` | how long the warning takes to reach someone |
| `gather` | how long a household takes to become ready to move |

**Every one of these numbers is a modelling judgement, not a measurement.** They
are deliberately round. The console prints the resulting effect as a sentence,
and the rule applied throughout is that a condition which cannot be stated as a
sentence should not be in the model.

Two are worth calling out because they are the least obvious:

- **Fog and smoke barely slow anyone down** (`speed` 0.94) and wreck route
  choice (`visibility` 0.30). It is the clearest case in the model of
  *information*, not mobility, being the binding constraint.
- **Daytime makes gathering slower, not faster** (`gather` 1.25). Households are
  dispersed across work and school, so a family takes longer to become whole.
  Evening is the best hour to be told to leave; night is the worst, because the
  warning takes twice as long to land.

## 2f. Editing the mix

Every share on every axis is editable at runtime, rebalances its axis to 100%,
and round-trips through the URL as two-digit percentages. Axes moved off their
source are badged **custom** in the interface, so a screenshot cannot quietly
misrepresent what it was run on. The cohort axis defaults to the city's own
per-zone figures; overriding it replaces them with a single city-wide mix, which
is a deliberate loss of resolution and is labelled as one.

The `spread` multipliers control how much individuals differ from their group's
mean in speed, information, risk and timing. Setting them to zero produces a
population of identical agents — a control run, not a city.

## 2g. How agents affect each other

Three channels, and it is worth being precise about their reach.

**Congestion** is the strongest: households slow each other through queueing at
a route's mouth and through density on the route itself.

**Social proof** is measured **per zone**, blended 75/25 with the city-wide
figure. Milling is watching your own neighbours out of your own window, not
reading a city-wide statistic. This works only because the warning also reaches
districts unevenly — a per-zone lag, drawn from the run's seed and **modelled,
not sourced**, since which district hears first is not knowable in advance. With
neither, every district mobilised in lockstep, because local proof had nothing
to amplify.

**Route choice** couples through crowd-following and through the queue an agent
expects. Agents reconsider their route every five simulated minutes while still
in their own district — never once on the route — and switch only if an
alternative is better by a clear margin. An agent whose information, degraded by
visibility, falls below 0.35 cannot be re-routed at all: you cannot avoid a
queue you cannot see.

**What this is not.** There is no pairwise or network influence: nobody talks to
anybody in particular, and information never propagates person to person. There
is no within-household coordination at runtime — a family of five is one agent
whose pace was set when it was built, with no reunification event. The returner
does not go back *for* anyone; it is a probability, not a link. The honest label
is **mean-field coupling with local neighbourhoods**: agents respond to
aggregates that other agents produce, at zone resolution, rather than to other
agents.

## 3. Illustrative — geometry that looks right but was not surveyed

- **Building heights**, where OSM has none. Heights now come from OSM's own
  `height` and `building:levels` tags: 96% of Lower Manhattan, 88% of Miami, 14%
  of the Las Vegas Strip, and none of Mariupol, whose extract carries no height
  data at all. The remainder get a low synthetic massing and are tinted cooler,
  so a viewer can see which parts of a skyline are evidence.

  The previous fallback was the only source, and it was not merely approximate —
  it was **inverted**. A radial hash around an arbitrary centre put 84 m towers
  on the Lower East Side and 23 m on Wall Street, and capped the whole city at
  about 100 m in a skyline that reaches 541 m. Anything built on that geometry
  was misleading, and it is why the synthetic fallback is now deliberately
  short: an invented building must not be able to pose as a landmark.
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
