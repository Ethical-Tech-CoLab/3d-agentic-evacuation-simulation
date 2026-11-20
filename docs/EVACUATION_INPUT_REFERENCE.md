# Evacuation input reference: from Mariupol to the four-city model

## Purpose and scope

This is the project's single, source-linked dictionary of the inputs needed to
describe an evacuation **within the model**, and of the important questions the
model cannot yet answer. It is intended as a research handoff to the PhD
researcher whose work on official evacuations under international humanitarian
law (IHL), studying Mariupol, helped initiate this project.

The summer-cohort origin and that research relationship are project context
provided by the project lead. Mariupol was the starting case because available
open intelligence and data made it possible to give assumptions concrete
geographic and population inputs. The later cities were added to challenge
those assumptions in other evacuation settings, not to establish that they
were universally valid.

**Evidence boundary.** This document uses only this repository's committed
code, data, documentation, and Git history. It does not re-research evacuations,
consult upstream repositories, or independently verify the external sources
already attributed here. The available history of this repository begins on
4 September 2026; it does not contain the summer cohort's original deliverables.
Its inherited Mariupol source is identified in the [original README][original-readme].
No more detailed summer chronology or researcher identity is inferred.

**Code/data baseline:** [513d6d5, 10 October 2026][baseline]. File links below
lead to the corresponding repository sources; field and function names identify
what to revisit when those sources change. Historical links are pinned.
Where older prose conflicts with executable code or shipped packs, this
reference describes the code/packs and flags the difference.

This is a retrospective, synthetic, **non-operational** teaching/research
artifact, not a complete account of a real evacuation, an official evacuation
plan, a finding of legal compliance, or a recommendation about an actual route.
See the repository's [scope and limitations][method-limits].

## 1. How the input set developed

| Stage | What became an input or a necessary distinction | Repository evidence |
|---|---|---|
| Summer cohort / Mariupol research origin | Begin with a concrete IHL-related case and the open data available to describe it. This context is supplied by the project lead; the earlier work itself is not archived here. | The [first README][original-readme] credits the inherited ETC Mariupol model and the Race Condition movement model. |
| Mariupol-only twin, 4 Sep 2026 | Five exposed-population zones, four cohorts, information, risk, group size, departure delay, one schematic westbound corridor, its capacity and open/closed state. | [Initial implementation][history-initial]; [original population rules][original-population]; [original engine][original-engine]. |
| Four-city comparison, 4 Sep | Replace one corridor with road-network routes and explicit exits; separate demographic cohort, travel unit, and behaviour. Mariupol, Lower Manhattan, Las Vegas Strip, and Miami become different case packs. | [Four-city change][history-cities]. |
| Conditions and geography, 5 Sep | Editable population mixes and heterogeneity; weather and time of day; building-based origins and zone-to-route approaches. Straight-line access is not a defensible assumption around water. | [Conditions/geography change][history-conditions]. |
| Accounting and interaction, 6 Sep | Represented people must be distinct from simulated units; leaving the city must be distinct from reaching safety; local warning/social response and route reconsideration matter. | [Correctness change][history-accounting]; [local-response change][history-local]; [model tests][tests]. |
| Evidence review, 7 Sep | Numerical assumptions, calibration, uncertainty, route width, spatial hazard, transport mode, and overloaded information variables need explicit treatment. | [Fidelity backlog][backlog]. |
| Population transferability, 10 Sep | Source US cohort proportions separately from modelled district totals; distinguish residents from visitors on the Strip. | [Demography change][history-demography]; [cohort construction][city-cohorts]. |
| Transit, 8 Oct | A station is an exit with a mode-specific boarding rate and a service window; transfers after shutdown are different from closed-road turn-backs. | [Transit change][history-transit]; [transit definitions][transit-definitions]. |
| Decision-rule documentation, 10 Oct | Make fixed traits, decision rules, runtime state, and unsupported behavioural claims inspectable. | [Agent decisions][decisions]; [known documentation disagreements][doc-disagreements]. |

### What the additional cities test

These are comparative model settings, **not four calibrated historical
evacuation reconstructions**. Route counts and exposed totals below come from
the shipped packs, not estimates made for this reference.

| Case / `city` | Hazard setting | Exposed people | Exits | Assumption put under pressure | Pack sources |
|---|---|---:|---|---|---|
| Mariupol / `mariupol` | Siege, March 2022 | 37,663 | 4 road | An exit can lead away from the city without leading to protection; damage and loss of light are not interchangeable with evacuation behaviour. | [Metadata][mariupol-meta], [zones][mariupol-zones], [routes][mariupol-routes] |
| Lower Manhattan / `nyc` | Coastal storm surge, Zone 1 label | 92,000, modelled | 5 road + 7 transit | Water constrains access; queues, service shutdown, and the walk to an alternative exit matter. | [Metadata][nyc-meta], [zones][nyc-zones], [routes][nyc-routes], [stations][nyc-transit] |
| Las Vegas Strip / `vegas` | Mass-gathering egress | 67,000, modelled | 4 road | A real resident census can still describe the wrong exposed population; visitors and ad-hoc groups challenge household assumptions. | [Metadata][vegas-meta], [zones][vegas-zones], [routes][vegas-routes], [visitor preset][presets] |
| Downtown Miami / Brickell / `miami` | Hurricane, Zone A label | 93,900, modelled | 4 road | County proportions are not neighbourhood counts; a pedestrian model is not a vehicle evacuation model. | [Metadata][miami-meta], [zones][miami-zones], [routes][miami-routes] |

The US zone labels and chosen exits do **not** make these official plans.
The [method's geometry discussion][method-geometry] explicitly distinguishes
real road geometry from the judgement of which exits to designate.

## 2. Reading and recording an input

The tables distinguish:

| Status | Meaning |
|---|---|
| **Sourced** | A value attributed to an upstream dataset or aggregate in this repository. Attribution is not independent validation, and geographic/time mismatch must remain visible. |
| **Assumed** | A synthetic population choice, scenario control, behavioural prior, or numerical coefficient. A shipped default is not an observed fact. |
| **Derived** | Calculated or sampled from other inputs. Record its rule; do not treat it as another independent observation. |
| **Context** | Retained for interpretation, attribution, or display, but not a causal input to current evacuation decisions/movement. |
| **Gap** | Not represented, or a proposed distinction not yet implemented. There is no current field to populate as if it were supported. |

For a research handoff, record **value and unit; population/geography; event
date or time window; source file and field; source version/commit; status;
transformation; and uncertainty or missingness** for each input used. This is
a documentation requirement, not a claim that the application already stores
all those metadata fields. Use "unknown" or "not represented", not an invented
measurement. Existing `meta.demography` records illustrate why source,
geography, and caveat need to travel together.

Coordinates in GeoJSON and point arrays are **`[longitude, latitude]` in
degrees**. City `bbox` is the different order **`[south, west, north, east]`**.
Distances are metres unless stated; engine durations are seconds, except the
transit shutdown input in hours. Proportions use 0-1; fields ending `_pct`
use 0-100.

## 3. Case, place, time, and source data

| Input / source key | Definition, units, and role | Status / limits | Source |
|---|---|---|---|
| City id: `cityId`, pack `id` | Selects `mariupol`, `nyc`, `vegas`, or `miami`; scopes zone/route ids, which repeat between cities. | Case selector, not evidence of comparability. | [Registry and loader][city-loader] |
| `name`, `country`, `hazard`, `hazardLabel`, `note` | Case identity, hazard category, and retrospective/illustrative description. | Context. The hazard label does not load a siege, flood, or hurricane process. | City metadata linked in section 1; [builder case definitions][city-definitions] |
| `bbox`, `centre` | Data-extraction extent and reference centre. | Assumed study footprint. A bounding box and five circular origin zones are not an official evacuation-boundary polygon. `centre` is not the population-weighted route origin. | [Case definitions][city-definitions]; [route construction][pack-builder] |
| Scenario date and T0 | Mariupol is labelled March 2022; simulation time is elapsed time from `t = 0`. | No absolute event-calendar/T0 field, timezone, or dated sequence of evacuation orders in the engine. A seed resembling a date does not supply these. | [Simulation construction/tick][simulation]; [metadata][mariupol-meta] |
| `demography.source`, `.geography`, `.note`, `.caveat`, `.real` | Attribution and scope of demographic proportions/aggregates. | Sourced attribution/context. `real: true` does not make district population, household membership, or behaviour measured. | All four metadata files; [metadata generation][pack-metadata] |
| `counts.exposed`, `.zones`, `.routes`, `.buildings`, `.roadWays`, `.buildingsWithRealHeight`, optional `.transitRoutes`, `.transitStations` | Pack inventory and exposed-population total. | Derived summaries. Population generation uses zone records, not `counts.exposed` as a separate population input. | [Pack metadata generation][pack-metadata]; [population sampling][population-sampling] |
| `zones.geojson` | Origin-zone Point features with the population/cohort attributes in section 4. | Active input. Locations and counts can have different evidence status. | City zone links in section 1 |
| `buildings.json`: `[lon, lat, height?]` | OSM building centroids; height in metres where supplied, 0/absent means unknown. | Positions support the construction of `homes.json`; building height is visual context, not a mobility, occupancy, or collapse variable. | [Building extraction/height handling][buildings]; [homes construction][homes-builder] |
| `homes.json`: zone id to point arrays | Candidate starting buildings from which travel units are sampled. | Derived from centroids, not residential occupancy or a household register. Sparse zones use the nearest 200 buildings if fewer than 25 lie inside the radius; lists are capped at 1,200. Thus some candidates can lie outside the nominal zone radius. | [Homes construction][homes-builder]; [origin sampling][origins] |
| `roads.json`: `cls`, `name`, `coords` | Road class, optional name, and polyline coordinates. | Sourced geometry; the builder derives the routing graph. Runtime households follow saved routes/approaches, not a fresh search of this road inventory. | [Road extraction/graph][road-graph]; [city loader][city-loader] |
| `routes.geojson`, `approaches.geojson` | Candidate routes, zone access paths, and station transfer paths. | Derived geometry plus assumed exit choices; definitions in section 7. | [Pack construction][pack-builder]; [approach indexing][route-entries] |
| Mariupol `damage.json`: `[lon, lat, severity]` | 783 attributed UNITAR/UNOSAT points, dated 14 Mar 2022; severity 0 possible through 3 destroyed. | Sourced/context. Displayed, but not read by movement or decision rules. | [Captured-data provenance][data-provenance]; [damage-layer explanation][map-meaning]; [spatial-hazard gap][backlog] |
| NYC `transit.geojson`: `mode`, `name`, `operator`, `lines`, `ada`, `source`, Point coordinates | Full station/landing inventory, separate from the seven chosen transit exits. | Sourced/context; `ada` does not constrain a household's choice or boarding. | [Committed inventory][nyc-transit]; [feed transformation][transit-feeds] |

The original Mariupol context also preserves severity **0.54**, **Phase 3/5**,
pre-siege population **343,598**, approximately **16% damaged**, **22% lights**,
and **227 km to Zaporizhzhia** in the [data provenance note][data-provenance].
These are **context, not current engine parameters**. In particular:

- The exposed population is 37,663, not the entire pre-siege population.
- The 227 km destination distance is not the distance simulated. The shipped
  westbound route's full `length_m` is 9,543 m; each household walks its
  access leg plus the route remaining after its join point. Arrival at the
  modelled endpoint is not arrival in Zaporizhzhia.
- The provenance note's older 7.0 km route description is not the shipped
  westbound route length. Use the [route feature][mariupol-routes].
- References to VIIRS, ACLED, ERA5, or other upstream sources in provenance
  prose do not mean this engine consumes their time series.

## 4. Who is exposed: population and vulnerability

### Zone inputs

| Key | Definition and units | How it is used / evidence caution | Source |
|---|---|---|---|
| `zone_id`, `name`, optional `tag`, `poi_type` | Zone identifier, readable label, provenance tag, and feature role. | `zone_id` joins agents, homes, and approaches. `tag`/labels are context. | [Mariupol provenance features][pois]; [zone generation][zone-generation] |
| Point `coordinates`, `radius` | Zone marker in degrees and sampling radius in metres. | Mariupol markers are placed for the model, not surveyed cohort centroids. Other zones are named neighbourhood approximations. Radius helps build the origin lists and provides a fallback sampler. | [Geometry caveats][method-geometry]; [homes construction][homes-builder]; [origins][origins] |
| `population` | Exposed people in a zone. | Sourced ETC aggregate for Mariupol; assumed for US zones. Drives zone sampling and total represented population. | [Zone generation][zone-generation]; [weighting][weighting] |
| `children`, `elderly`, `disabled` | Counts forming the three non-adult model cohorts. | Active cohort inputs. US counts are rounded products of assumed zone totals and sourced county proportions. Mariupol counts are inherited aggregates, with Z5's breakdown estimated. | [Cohort construction][city-cohorts]; [zone generation][zone-generation]; [data provenance][data-provenance] |
| Derived `adult` | `max(0, population - children - elderly - disabled)`. | Residual, not an additional independent count. Inputs must form a consistent partition; the code's floor is not justification for inconsistent counts. | [`zoneCohorts`][zone-cohorts] |
| `vulnerable` | Published/constructed vulnerable total, in people. | Check against the three non-adult counts; not an additional population to add. It does not independently set speed, risk, or priority. | [Provenance features][pois]; [population tests][tests] |
| `damage_pct`, `dark_pct`, `destroyed` | Attributed zone damage percentage, darkness percentage, and destroyed-building count. | Context in the current model. No present departure or pace rule reads these attributes. Zero in a synthetic zone is not evidence that no damage exists. | [Mariupol zones][mariupol-zones]; [sampling rules][population-sampling]; [documented disagreement][doc-disagreements] |
| `modelled` | Boolean on generated US zones. | Provenance marker; not a behavioural switch. | [Zone generation][zone-generation] |

### Mariupol baseline retained from the starting case

All counts below are **people**, except destroyed buildings; percentages are
0-100. Z5's component split is estimated to preserve its attributed vulnerable
total, because the inherited source row was truncated.

| Zone | Population | Children | Elderly | Disabled | Vulnerable | Damage % | Dark % | Destroyed buildings | Radius m |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Z1 | 6,373 | 1,050 | 1,308 | 291 | 2,649 | 24 | 76 | 15 | 159 |
| Z2 | 8,386 | 1,342 | 1,845 | 419 | 3,606 | 0 | 78 | 0 | 210 |
| Z3 | 7,196 | 1,151 | 1,583 | 361 | 3,095 | 0 | 75 | 0 | 180 |
| Z4 | 8,806 | 1,408 | 1,936 | 440 | 3,784 | 2 | 75 | 3 | 220 |
| Z5 | 6,902 | 1,105 | 1,518 | 345 | 2,968 | 0 | 77 | 0 | 173 |
| **Total** | **37,663** | **6,056** | **8,190** | **1,856** | **16,102** | - | - | **18** | - |

Source: [active Mariupol zones][mariupol-zones], inherited from
[`data/pois.geojson`][pois]; estimation caveat in [data provenance][data-provenance].

### Cohort definitions and transfer to other cities

The current US construction makes cohorts mutually exclusive: `child` under
18; `elderly` 65+; `disabled` ages 18-64 with a disability; `adult` the
remainder. Disabled children/older people belong to their age cohort, so the
`disabled` count is **not all people with disabilities**. Mariupol's inherited
counts are used as supplied; this repository does not establish that its
original collection used the identical age/disability definitions.

| Cohort input proportions | Child | Elderly | Disabled | Adult remainder | Status |
|---|---:|---:|---:|---:|---|
| Mariupol, from counts above | 16.08% | 21.75% | 4.93% | 57.25% | Inherited ETC aggregates, including estimated Z5 split |
| Lower Manhattan proxy | 13.3% | 18.7% | 5.9% | 62.1% | Attributed ACS 2024 New York County proportions, not measured district counts |
| Miami proxy | 19.7% | 17.2% | 3.9% | 59.2% | Attributed ACS 2024 Miami-Dade County proportions |
| Strip resident proxy | 21.5% | 16.5% | 7.4% | 54.6% | Attributed ACS 2024 Clark County proportions; residents are not visitors |
| Strip visitors preset | 6% | 11% | 4% | 79% | Assumed mix; the preset attributes its child-share derivation to visitor-profile data, but elderly/disabled shares are explicitly modelled |

Sources: [county inputs and definitions][city-cohorts], [metadata][vegas-meta],
[visitor preset and caveat][presets]. Sourced proportions do not source the US
zone totals, their geographic allocation, or their household structure.
Percentages are rounded; use the Mariupol counts for its exact partition.

### Unit of account: do not confuse three different quantities

`size` is the number of **simulated travel units**, `group` is a unit's
**sampled membership size**, and `weight` is its **represented-person
expansion weight**. One unit has one representative cohort, not a list of
members with separately modelled ages or disabilities.

The [weighting code][weighting] initially scales `group` to the city exposed
total, adjusts to city-wide cohort margins, and rescales to the exposed total.
Thus `sum(weight)` is the exposed population; `weight` can be fractional and
is not a literal observed household headcount. Cohort correction is city-wide,
not an exact constraint on each zone's represented total. Zone selection is
sampled. With very small/custom samples, absent cohorts cannot be created by
weighting. The [backlog][backlog] explicitly warns about household-size
distortion after post-stratification.

## 5. Who moves together, and how they behave

All shares and coefficients in this section are **assumed priors**, not
surveyed distributions for any of the four cases. The three axes are sampled
separately, then feasibility adjustments are applied.

### Travel-unit inputs: `mix.unit` and `TRAVEL_UNITS`

| `unit` | Default share | Sampled `group`, members | Pace multiplier | `millingScale` | Interpretation and limit |
|---|---:|---:|---:|---:|---|
| `solo` | 0.28 | 1 | 1.00 | 0.7 | Travelling alone |
| `family` | 0.44 | Integer 2-5 | 0.80 | 1.9 | Gathering is a timer; no individually located family members or reunification event |
| `group` | 0.20 | Integer 3-10 | 0.86 | 0.8 | Ad-hoc group; extra crowd-following pull of 1.5 |
| `institutional` | 0.08 | Integer 12-39 | 0.55 | 3.2 | Care/collective unit represented by slower pace and longer waiting, not an actual vehicle allocation |

Source: [`TRAVEL_UNITS`][travel-units]. The institutional generator is
`12 + floor(U * 28)`, hence a maximum of **39**, despite older prose saying 40.
Children drawn as solo/ad-hoc are reassigned to family (institutional children
remain possible); an adult drawn institutional is reassigned to family with
probability 0.6. Consequently requested shares need not equal final sampled
unit shares or represented-person shares. See [sampling][population-sampling].

### Behaviour inputs: `mix.behaviour` and `BEHAVIOURS`

| `behaviour` | Default share | `seek` | `mill` | Base `reluctance` | `returns` probability |
|---|---:|---:|---:|---:|---:|
| `prompt` | 0.24 | 0.3 | 0.4 | 0.00 | 0.02 |
| `seeker` | 0.30 | 2.2 | 0.9 | 0.05 | 0.05 |
| `milling` | 0.26 | 0.8 | 2.6 | 0.10 | 0.06 |
| `reluctant` | 0.13 | 1.0 | 2.0 | 0.72 | 0.04 |
| `returner` | 0.07 | 0.6 | 0.8 | 0.02 | 0.85 |

Source: [`BEHAVIOURS`][behaviours]. `seek`/`mill` are dimensionless duration
coefficients, not minutes or probabilities. Returners are not the only
behaviour with a nonzero return probability.

`mix.cohort = null` means use each zone's supplied cohort counts; a custom
`mix.cohort` replaces those local proportions with one city-wide mix.
`mix.unit` and `mix.behaviour` are probability maps summing to 1.
`mix.spread.speed`, `.info`, `.risk`, `.timing` multiply the corresponding
individual variability; defaults are all 1. UI range is 0-2.5.

The seven named presets (`source`, `ageing`, `families`, `visitors`, `drilled`,
`distrustful`, `uniform`) are bundles of these same inputs, not new evidence.
Their exact vectors and stated claims live in [`PRESETS`][presets]. In
particular, the visitor preset also changes unit and behaviour shares:
comparing it with the resident baseline is not a cohort-only experiment.
Zeroing spread controls does not remove categorical sampling, route tastes,
or the independently sampled zone warning lag.

## 6. Mobility, information, warning, risk, and departure

Here `U` is a seeded uniform draw in [0,1), `N(mean, SD)` is a normal draw,
and `clamp01` restricts a value to [0,1]. All numerical distribution choices
below are **assumed**; sampled values are **derived**, not measured traits.

| Input or generated trait | Definition / current rule | Unit and effect | Source |
|---|---|---|---|
| `COHORTS.*.baseSpeed` | Adult 1.35; child 0.95; elderly 0.75; disabled 0.55 | m/s before unit pace or environmental effects; a cohort proxy, not an individual disability assessment | [Cohorts][cohort-speeds] |
| `speed` | `max(0.25, N(baseSpeed, 0.12 * spread.speed)) * unit.pace` | m/s; the 0.25 floor is **before** the unit multiplier | [Sampling][population-sampling] |
| `infoQuality` -> `info` | Mean defaults to 0.6; `info = clamp01(N(infoQuality, 0.18 * spread.info))` | 0-1. One overloaded trait controls warning arrival, confirmation, queue perception, closure knowledge, and re-route eligibility | [Sampling][population-sampling]; [overloaded-variable gap][backlog] |
| `risk` | `clamp01(N(0.5, 0.2 * spread.risk))` | 0-1. Reduces reluctance and hazard slowdown; there is no separate current risk-mean slider | [Sampling][population-sampling]; [pace rule][pace] |
| `warningSpread` | Default 5,400 s; UI default 90 min, range 15-360 min | Warning-arrival scale, **not** a direct departure-time distribution | [Controls][controls]; [sampling][population-sampling] |
| `zoneLag` | Per-zone `U * warningSpread * 0.7`, seeded separately | s; assumed spatially uneven reach, not a historical warning chronology | [Zone lag][population-sampling] |
| `warnedAt` | `max(0, zoneLag + N(warningSpread * (1-info) * 0.55, warningSpread * 0.15 * spread.timing))` | s after T0, before `env.warn`; actual awareness transition at `t >= warnedAt * env.warn` | [Sampling][population-sampling]; [lifecycle][lifecycle] |
| `seekFor` | `max(0, N(behaviour.seek * 900, behaviour.seek * 260 * spread.timing))` | s; on awareness, `seekUntil = t + seekFor / (0.35 + info)` | [Sampling][population-sampling]; [lifecycle][lifecycle] |
| `millFor` | `max(0, N(behaviour.mill * 900 * unit.millingScale, behaviour.mill * 300 * spread.timing))` | s of base gathering/waiting work; not an observed reunification duration | [Sampling][population-sampling] |
| `reluctance` | `behaviour.reluctance * (1 - 0.4 * risk)` | 0-1 threshold; leave only when effective danger reaches it | [Sampling][population-sampling]; [lifecycle][lifecycle] |
| `returnChance`, `willReturnBase`, `willReturn` | Behaviour's `returns`; one seeded Bernoulli draw fixes whether the unit attempts one return | Probability / boolean; no person, document, animal, or other return target is encoded | [Sampling][population-sampling]; [simulation construction][simulation] |
| `returnAtFrac` | `0.2 + U * 0.45` | Fraction of assigned path length at which returning begins; backtracks until `dist <= 0.4 * entryDist` at 1.15 times current pace, subject to crawl floor | [Simulation][simulation]; [return movement][lifecycle] |
| `origin` | Uniform candidate in `homes[zone]`, plus coordinate jitter of +/-0.0002 longitude and +/-0.00015 latitude | Degrees. Without homes, samples a circle of `radius` (default 180 m) around the zone marker | [Origins][origins] |
| `lane` | `N(0, 8)` | Metres of lateral **rendering** offset only; not road width or usable capacity | [Sampling][population-sampling]; [position calculation][path-measurement] |

### Social response and the departure rule

`zoneProof[z]` is a **derived** blend: 0.75 times the zone's mobilised
represented-person share plus 0.25 times the city-wide share. Mobilised here
includes `evacuating`, `returning`, and `a.done` (including unsafe-route
completions), not just households visibly walking this instant.

Seeking ends when `t >= seekUntil - seekFor * zoneProof[z]`. Milling work
decreases by `dt / env.gather * (1 + 2.5 * zoneProof[z])`. When that work
reaches zero, the unit compares effective danger with `reluctance`; otherwise
it enters `stayed`. A stayed unit rechecks danger each tick. Time, information,
and social proof do not themselves lower its reluctance threshold.

These are aggregate feedback rules, **not** person-to-person communication,
changing beliefs, or an explicit social/family network.
Sources: [social aggregates][social-flow], [lifecycle][lifecycle],
[decision-model limits][decisions].

## 7. Where people can go: network, route access, capacity, and closure

### Static geographic and route inputs

| Key / construction input | Definition and current use | Status / caveat | Source |
|---|---|---|---|
| `ROAD_CLASSES` | Relative path-search weights: motorway 4.0, motorway_link 2.0, trunk 3.5, trunk_link 2.0, primary 3.0, primary_link 1.8, secondary 2.2, secondary_link 1.4, tertiary 1.6, tertiary_link 1.2, residential 1.0, unclassified 1.0, living_street 0.8 | Assumed graph preferences, **not runtime people/min capacities**. Edge search cost is metres / `(0.55 + 0.45 * classWeight)`. | [Class weights][road-classes]; [graph construction][road-graph] |
| Road graph and route origin | Rounded road coordinates form nodes; edges are added in both directions. Each route starts from the nearest node to the population-weighted zone centroid. | Derived. Pedestrian access restrictions, one-way rules, slope, lanes, and verified passage rights are not encoded. | [Graph][road-graph]; [route builder][pack-builder] |
| `EXITS`: name, lon, lat, note, safe | Defines candidate road exits; saved as route `name`, `exit`, `note`, `safe`. | Assumed selection of real named places. Names/notes are not a guarantee of official designation or protection. | [Exit definitions][exit-definitions] |
| `route_id`, LineString `coordinates` | Route identity and saved path over the graph. | Derived Dijkstra path, simplified with an 8 m tolerance; not an observed journey. | [Path search/simplification][path-builder]; [pack builder][pack-builder] |
| `length_m`, `vertices`; runtime `path`, `lengthM` | Original graph-path length in m and simplified vertex count; runtime also measures the simplified polyline. | Derived. Density uses `lengthM`; progress and remaining distance use measured geometry, which can differ after simplification. | [Pack builder][pack-builder]; [route preparation][route-preparation] |
| Approach `zone_id`, `route_id`, `entry_index`, `length_m`, LineString | Precomputed zone-node path to the route vertex nearest that zone. | Derived. `entry_index` is zero-based; agents join there rather than always walking to the route's start. | [Approach builder][approach-builder]; [entry calculation][route-entries] |
| Transfer `from_route`, `route_id`, `entry_index`, `length_m`, LineString | Station-door path to another route; shares the approach file but uses `from_route` instead of `zone_id`. | Derived; used if a transit door is shut. Current NYC pack has 60 zone approaches and 77 station transfer legs. | [Transfer builder][approach-builder]; [transfer rule][transfer] |
| `entries[route].walk`, `.remaining`, `.index`, `.coords` | Per-unit access length, remaining route length, and join geometry. | Derived from origin/zone approach and route; not extra surveyed inputs. | [Entries][route-entries] |
| `entries[route].bias` | `exp((U - 0.5) * 0.9)`, approximately 0.64-1.57 | Assumed fixed preference per unit/route; not measured familiarity, kinship destination, or route trust. | [Route preference][route-choice] |
| `safe` | Only an explicit `false` marks a route as non-safety; missing values default to true in preparation. | Assumed outcome classification. Mariupol R3 is false; other shipped routes are true. This is neither a legal assessment nor verified end-to-end destination safety. | [Preparation][route-preparation]; [Mariupol routes][mariupol-routes]; [outcome test][tests] |

The model is **road-path based, not a guarantee that every metre walked is a
verified walkable road**. Origins connect straight to the zone approach node;
re-routing can connect the current position straight back to that node. The
builder also has straight-segment fallbacks for disconnected access/transfer
paths, and old packs without approaches use nearest-vertex access.
See [entry/assignment code][route-entries], [builder fallbacks][approach-builder],
and [documented re-route geometry][closure-details]. This qualifies older
claims that every metre is on-road.

### Live route and hazard controls

| Input / constant | Value, units, and effect | Status / limit | Source |
|---|---|---|---|
| `routeCapacity` | Default 900 people/min **per road route**; UI 100-3,000, step 100. Effective road capacity = `routeCapacity * env.capacity`. | Assumed. All road routes share this setting; no measured width or independent bottleneck capacity. Transit uses its own rate. | [Defaults][engine-defaults]; [controls][controls]; [capacity application][simulation] |
| `hazard` -> `danger` | Default 0.35, UI 0-1. `danger = min(1, hazard + env.hazard)`. | Assumed global scalar used for departure reluctance and in-district slowdown, not spatial exposure, casualty risk, or a hazard forecast. | [Defaults][engine-defaults]; [lifecycle][lifecycle]; [pace][pace] |
| Route `open` | Initially true, changed by clicking a route. | Scenario input per route. Manual closures are possible during a run, but no opening/closure timetable is stored. | [Route preparation][route-preparation]; [route controls][route-controls] |
| `suspended`, `why`, `live` | Derived transit suspension/reason and `live = open && !suspended`. | State, not three independent inputs. Weather/clock rules in section 9. | [Tick][simulation] |
| `herd` | Default 0.35, UI 0-1 | Assumed strength of attraction to already popular routes; group pull multiplier 1.5. | [Defaults][engine-defaults]; [route cost][route-choice] |
| `reroute` | Engine default true; no corresponding checkbox in current UI | Assumed model option; reconsider only before joining a route, every 300 simulated seconds, with staggered first checks. | [Reconsideration/defaults][rerouting] |
| Re-route visibility threshold, switch margin | Eligible at `info * env.visibility >= 0.35`; switch if current cost exceeds alternative cost times 1.08 | Assumed thresholds, not observed decision frequencies. | [Reconsideration][rerouting] |
| Closure-knowledge thresholds | Avoid any non-live route when `seen > 0.7`; avoid suspended transit when `seen > 0.4`, where `seen = info * env.visibility` | Assumed, distinct thresholds; if all routes are excluded, selection falls back to the first route. | [Route selection][route-choice] |
| Queue band and slowdown | Last 300 m before route entry; speed multiplier `1 - 0.85 * min(1, queued / max(capacity,1))` | Assumed local congestion rule; it does not enforce a hard service quota. | [Queue counting][social-flow]; [pace][pace] |
| `FREE_SPEED`, `JAM_RATIO`, flow floor | 1.2 m/s; 2.0; 0.08 | `density = onRoute / max(lengthM,1)` people/m; `jam = max((capacity/60)/1.2 * 2, 1e-6)`; `flowFactor = max(0.08, 1-density/jam)`. Assumed use of a Greenshields-style relation for walking crowds, not a calibrated pedestrian law. | [Constants][engine-defaults]; [density rule][social-flow]; [review caveat][backlog] |
| In-district hazard and on-route pace coefficients | In district multiply pace by `1 - danger * (1 - 0.4*risk) * 0.6`; on route use `0.92 * flowFactor` | Assumed movement effects; environmental speed/cohort multipliers apply to both. | [Pace][pace] |
| `CRAWL` | 0.03 m/s minimum movement, with below-floor time recorded in `stalled` | Numerical anti-deadlock guard, not an observed minimum viable walking speed or proof of rescue. | [Constants][engine-defaults]; [movement][lifecycle] |

### Route-choice rule and closure semantics

The current believed cost, in seconds, is:

```text
seen     = info * env.visibility
travel   = (entries[route].walk + entries[route].remaining) / speed
expected = max(0, route.taken - route.outPeople) / max(route.capacity/60, 0.1) * seen
follow   = herd * (1-seen) * (unit == group ? 1.5 : 1)
           * (route.taken / (sumTaken || 1)) * travel
cost     = (travel + expected) * entries[route].bias - follow
```

`travel` uses base unit speed, not the full current hazard/weather/density pace.
Route openness enters the selection filters, **not this cost**. A household
can therefore fail the 1.08 switching test even when the alternative is live
and its current road is closed.

Reaching a closed road mouth leads to terminal `back` **regardless of
information quality**. Those units do not try another road or release that
road's `taken` count. Reopening does not revive them. Finding a shut station
instead triggers a transfer to the cheapest live route, using full queue cost
without taste, herding, or an information discount; no live alternative means
`back`. These are current model rules, not claims about real evacuees.
Sources: [route cost/choice][route-choice], [movement][lifecycle],
[transfers][transfer], [closure analysis][closure-details].

## 8. Weather and time of day

`weather` (URL `w`) and `tod` select bundles of **assumed** effects.
There are **nine** current weather keys, despite older prose saying eight.
Each multiplier is a modelling judgement, not a measurement for a case.

| Effect key | Unit / meaning |
|---|---|
| `speed` | Walking-pace multiplier for everyone |
| `capacity` | Road-route capacity multiplier; not the transit boarding multiplier |
| `hazard` | Additive increment to global danger, capped in combination at 1 |
| `visibility` | Multiplier on route/queue/status perception, not merely visual range or walking speed |
| `warn` | Multiplier on warning-arrival time |
| `gather` | Multiplier on time needed for milling/gathering work |
| `perCohort` | Additional named-cohort walking multipliers; unspecified cohorts use 1 |
| `transit.ferry`, `.subway`, `.rail` | Separate boarding-rate multipliers per mode; below 0.05 suspends that mode |

### Exact shipped condition bundles

| Weather key | Speed | Road capacity | Added hazard | Visibility | Warn | Gather | Extra cohort pace | Transit ferry / subway / rail |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `clear` | 1 | 1 | 0 | 1 | 1 | 1 | None | 1 / 1 / 1 |
| `rain` | 0.92 | 0.85 | 0.03 | 0.85 | 1.1 | 1.05 | None | 0.9 / 1 / 1 |
| `downpour` | 0.80 | 0.55 | 0.14 | 0.60 | 1.2 | 1.15 | child 0.85; elderly 0.85; disabled 0.75 | 0.4 / 0.5 / 0.7 |
| `snow` | 0.74 | 0.60 | 0.10 | 0.70 | 1.15 | 1.2 | elderly 0.80; disabled 0.70 | 0.6 / 0.8 / 0.7 |
| `ice` | 0.64 | 0.48 | 0.16 | 0.90 | 1.1 | 1.2 | elderly 0.62; disabled 0.55 | 0.5 / 0.7 / 0.6 |
| `heat` | 0.85 | 0.92 | 0.10 | 1 | 1 | 1.1 | child 0.82; elderly 0.68; disabled 0.78 | 1 / 0.9 / 0.9 |
| `wind` | 0.86 | 0.75 | 0.18 | 0.80 | 1.25 | 1.15 | child 0.86; elderly 0.84; disabled 0.80 | 0 / 0.9 / 0.6 |
| `tornado` | 0.70 | 0.60 | 0.35 | 0.50 | 1.3 | 1.3 | child 0.85; elderly 0.80; disabled 0.75 | 0 / 0.8 / 0 |
| `fog` | 0.94 | 0.85 | 0.05 | 0.30 | 1.15 | 1.05 | None | 0.3 / 1 / 0.9 |

| Time key | Speed | Road capacity | Added hazard | Visibility | Warn | Gather | Extra cohort pace | Transit ferry / subway / rail |
|---|---:|---:|---:|---:|---:|---:|---|---|
| `day` | 1 | 1 | 0 | 1 | 1 | 1.25 | None | 1 / 1 / 1 |
| `evening` | 1 | 1 | 0 | 0.9 | 1 | 0.85 | None | 0.8 / 1 / 0.9 |
| `night` | 0.88 | 0.85 | 0.06 | 0.45 | 2.1 | 0.9 | elderly 0.85; disabled 0.85 | 0.5 / 0.5 / 0.4 |

Source for all values: [`WEATHER` and `TIME_OF_DAY`][conditions].
[`environment()`][environment] multiplies corresponding weather/time factors
and adds hazard increments; per-cohort and transit factors compose in the same
way. Default is clear/day, so the browser's default `gather` is **1.25**, not
the neutral engine default of 1. Conditions can change live, but do not
advance automatically with the clock or model a spatial weather field.

## 9. Transit and assisted transport

Only the NYC pack currently ships transit exits. Other cities having real
transit in the world does not make it an input to their current simulation.
The inventory has 66 locations; only the following seven are chosen exits.
Their positions/service labels are attributed; **all boarding rates are assumed**.

| Route | Station / landing | `mode` | `capacity` -> `baseCapacity`, people/min |
|---|---|---|---:|
| T1 | Fulton St | `subway` | 500 |
| T2 | World Trade Center / PATH | `rail` | 300 |
| T3 | Whitehall / Staten Island Ferry | `ferry` | 150 |
| T4 | Pier 11 / NYC Ferry | `ferry` | 25 |
| T5 | Canal St | `subway` | 400 |
| T6 | Delancey-Essex | `subway` | 300 |
| T7 | Penn Station | `rail` | 600 |

Sources: [transit exit definitions][transit-definitions],
[shipped routes][nyc-routes], [attribution/transformation][transit-feeds].
Route properties `transit`, `mode`, `lines`, `capacity`, and `safe` accompany
the route geometry. Inventory `ada` is not copied into a mobility eligibility
rule; line/operator labels do not implement a service network.

`transitShutdown` is hours after T0; default **8**. The UI supports 0-24 in
0.5-hour steps, but **24 means Infinity / weather only**, not a shutdown at
T+24. The 8-hour default is justified by a rounded Sandy precedent in existing
repository prose; it is not the actual service deadline of all these cases.
At each tick, transit capacity is `baseCapacity * env.transit[mode]`;
shutdown time reached or factor below 0.05 sets `suspended`. A user can also
close the route. Sources: [control conversion][read-options],
[transit tick rules][simulation].

Transit is modelled as walking to a **door**. Reaching a live door completes
the route; the rate affects perceived queues and route-density slowdown, not
an explicit boarding-slot/timetable process. The model does not simulate
onboard travel, seat assignment, vehicle fleets, fuel, headways, accessible
vehicle availability, or reception at the far destination. Likewise,
institutional units have no dispatched transport resource: their waiting
time is a proxy. See [transfer/completion rules][lifecycle] and the
[institutional-resource gap][behaviour-gaps].

## 10. Run definition and reproducibility inputs

An interpretable run needs the pack/version **and** all controls and changes,
not merely a city name or a screenshot.

| Run input | Default / range | Where it is defined and what must be recorded |
|---|---|---|
| `size` (UI Agents, URL `n`) | 6,000; UI 500-20,000, step 500 | Simulation resolution, not exposed people. [UI controls][controls]; [population builder][population-sampling] |
| `seed` | 20220316 | Seeded population, zone lag, route tastes, return draws, and reconsideration staggering. Record with code/pack version; it is not evidence about the event. [Population RNG][population-rng]; [route entries][route-choice]; [simulation][simulation] |
| Population controls | `infoQuality=0.6`, `warningSpread=5400 s`, cohort override or zone counts, unit/behaviour maps, four spread factors | These rebuild the population. Store exact maps, not just the preset label. [Options/rebuild][read-options]; [mix definitions][mix-defaults] |
| Movement/decision controls | `routeCapacity=900`, `hazard=0.35`, `herd=0.35`, `reroute=true`, initial per-route `open`, `transitShutdown=8 h` | Record initial values and any changes with simulated timestamps. [Defaults][engine-defaults]; [controls/wiring][live-controls] |
| Environmental controls | `weather=clear`, `tod=day`; or exact `env` for direct engine runs | Browser defaults differ from neutral `DEFAULTS.env`. Record live changes and when they occur. [Environment][environment]; [live wiring][live-controls] |
| `timeScale` | Browser/engine 120 simulated s / real s; UI 10-600 | Playback setting. Browser `dt` is `min(frameSeconds,0.1) * timeScale`, so numerical step size can vary with playback/frame rate. [Loop][browser-loop] |
| `dt`, number of ticks / end time, stop criterion | Tests commonly use 30 s ticks, 2,600 steps (21 h 40 min), with some longer runs | No single universal clearance horizon. Record whether non-completers remain; a finite run and a run until no movement are different experiments. [Test harness][tests] |
| Presentation settings | Basemap, camera, layer visibility, trails, classification colour, heights | Context only. They do not set evacuation physics, route safety, or demographic weights. Dot size uses `group`, not `weight`. [Map interpretation][map-meaning] |

**The share URL is not a complete experiment record.**
[`syncUrl()`][url-sync] writes `city`, `n`, `seed`, `w`, `map`, `tod`, `shut`
where applicable, and mix parameters `mc`, `mu`, `mb`, `sp`. It does **not**
serialize information mean, warning spread, road capacity, hazard, herding,
per-route closures, reroute option, playback step history, or live changes.
The share label's promise of reproducing an exact run is therefore too broad.

[`mixToParams`/`mixFromParams`][mix-url] encode shares as rounded two-digit
percentages in axis-key order (cohort: adult/child/elderly/disabled; unit:
solo/family/group/institutional; behaviour:
prompt/seeker/milling/reluctant/returner), and spread factors as four numbers
rounded to two decimal places. For research retain exact numeric maps as well
as a convenience URL; URL encoding is not lossless for arbitrary fractional shares.

## 11. State and outcomes: definitions, not independent inputs

These quantities are necessary to understand a run, but must not be presented
as evidence fed into it.

| Derived state/output | Definition and interpretation | Source |
|---|---|---|
| `state` | `unaware` -> `seeking` -> `milling`, then `stayed` or `evacuating`; an evacuating unit can be `returning`, terminal `done`, `filtered`, or `back`. `stayed` can leave if danger rises. | [Lifecycle][lifecycle]; [state labels][engine-defaults] |
| `dist`, `path`, `entryDist`, `route` | Metres progressed, assigned geometry, end of access leg, and selected route. These change on re-routing/transfers. | [Assignment][route-entries]; [transfer][transfer] |
| `leftAt`, `exitTime`, `doneAt` | Door departure; first recorded route-entry/district-clearance time; endpoint completion, all seconds after T0. Entry time can precede a return, and is not final safety. | [Lifecycle/completion][lifecycle] |
| `counts`, `waiting`, `moving`, `evacuated`, `filtered`, `back` | Sums of `weight`. Waiting = unaware + seeking + milling + stayed; moving = evacuating + returning; evacuated = safe-route `done`; filtered = non-safety completion; back = terminal closed-route failure. | [Tick output][lifecycle] |
| `done` boolean versus `state === 'done'` | Boolean is also true for `filtered` units. For safety counts use the state, not the boolean alone; the generic classification `tally().out` uses the boolean. | [Completion][lifecycle]; [`tally`][population-tallies]; [safety readout][stats] |
| Route `taken`, `queued`, `onRoute`, `out`, `outPeople`, `density`, `flowFactor` | Committed represented people, near-mouth people, on-route people, completed unit count, completed represented people, linear density, speed factor. `taken` includes completers and terminal back cases unless reassigned. | [Route structure][route-preparation]; [aggregates][social-flow]; [completion][lifecycle] |
| `socialProof`, `zoneProof` | Mobilised shares, with local/city blending described in section 6. | [Aggregate rules][social-flow] |
| `stalled`, `crawling` | Per-unit seconds below crawl floor and represented people below that floor this tick; movement still continues at the numerical floor. | [Movement][lifecycle] |
| `reroutes`, `turnedAway`, `transitOut` | Per-unit event counters internally; aggregate reroutes/turnedAway sum each affected unit's weight once, not once per event. `transitOut` sums route `outPeople` for transit. | [Tick outputs/transfer][lifecycle] |
| Console p50 / p90 clearance | Sort `doneAt` for units with `state === 'done'`, take the indexed quantile, display hours. | [Actual readout][stats] |

**Clearance interpretation matters:** the current p50/p90 readout is
**unweighted over successfully completed simulated units**, not a
represented-person-weighted quantile and not the time when 50%/90% of all
exposed people reached protection. It excludes those still waiting/moving,
stayed, filtered, or turned back. Always report those shares and the run
horizon alongside clearance; otherwise a scenario that leaves people behind
can appear faster. Tests also use a completed-unit median.

Sample-size invariance is an internal consistency check with tolerances, not
proof that every output is identical at all resolutions. The
[tests][tests] check, among other things, exposed totals/cohort margins,
separation of filtration and safety, queue/capacity response, and transit
shutdown. They do not calibrate the model against observed evacuation curves.

## 12. What still prevents a full evacuation account

These gaps are part of the reference so absence is not mistaken for a
zero-valued input. They are **not newly researched facts or implemented
configuration fields**.

| Needed distinction / missing input | Present proxy and why it is insufficient | Repository basis |
|---|---|---|
| Separate warning reach, source trust, message confirmation, queue legibility, route-status knowledge | All are compressed into `info`; no warning-channel history or person-to-person information flow. | [Backlog P1-8][backlog]; [decision explanation][decisions] |
| Spatial and time-varying hazard, blocked links, local exposure | Global `hazard` plus weather; damage/darkness do not drive current rules. No evolving conflict/flood field, casualties, or medical deterioration. | [Backlog P1-6][backlog]; [pace rule][pace] |
| Route width, specific flow, point bottlenecks/checkpoints, usable pedestrian access | Shared people/min control and whole-route density cannot describe each gate, bridge, checkpoint, or legal/physical access constraint. Motorway/tunnel geometry alone does not establish walkability. | [Backlog P1-5 and P2b][backlog]; [graph][road-graph] |
| Vehicle/private-car mode share and assisted transport supply | Everyone walks to a route/door; institutional waiting is a timer. No buses, ambulances, fleet availability, dispatch, or seats. | [Backlog P1-7][backlog]; [behaviour enhancements][behaviour-gaps] |
| Actual household members, dependencies, separation, reunification, and return purpose/target | A representative cohort, unit multiplier, and sampled return fraction cannot reconstruct these relationships. | [Decision unit][decisions]; [behaviour enhancements][behaviour-gaps] |
| Disability-specific access and support needs | One cohort speed and a contextual station `ada` flag do not implement accessible routing or assistance. Age/disability intersections are lost in the exclusive cohorts. | [Cohorts][cohort-speeds]; [cohort construction][city-cohorts]; [inventory][nyc-transit] |
| Time-specific residents, visitors, daytime workers; neighbourhood-level cohort evidence | County proportions and modelled zone totals; Strip visitor preset is a disclosed alternative prior, not an observed exposed-population census. | [Backlog P2-11b][backlog]; [visitor preset][presets] |
| Evacuation orders/authority, negotiated passage or ceasefire windows, consent/coercion, protection conditions | Labels such as "humanitarian corridor" and `safe` are not records of authorization, voluntariness, guarantees, or compliance. No structured inputs represent these matters. | [Exit definitions][exit-definitions]; [binary outcome classification][route-preparation]; [non-adjudicative scope][method-limits] |
| Reception/shelter capacity, onward destination conditions, and eventual return | Route endpoint = model completion; a legacy shelter/destination POI does not implement accommodation, ongoing protection, supplies, or return after displacement. `returning` means mid-journey backtracking, not eventual return home. | [Legacy POIs][pois]; [completion/return rules][lifecycle]; [legacy provenance][data-provenance] |
| Observed departure/arrival curves, uncertainty distributions, sensitivity, practitioner validation | Assumed constants and one-seed point outputs are not empirical findings; some apparent effects are direct consequences of assigned multipliers. | [Backlog P0 and P2][backlog] |

For the IHL research handoff, preserve the difference between **left the
origin area**, **arrived at a modelled endpoint**, **reached protection**, and
**an officially authorized/lawful evacuation**. Only the first two have
movement/time proxies here, and the third is a supplied binary label rather
than an assessment. The fourth is outside this simulator's implemented data
model. This is a scope warning, not a substitute legal checklist.

Proposed decision models are also **not current inputs**: runtime decisions
are seeded rules, not model calls. The [local-model discussion][local-model]
proposes optional offline behavioural priors; a
[later, history-only recommendation][annotation-recommendation] instead bounds
a proposed experiment to source-to-assumption annotations outside simulation.
Neither establishes new measured variables or implements a replacement in the
current engine.

## 13. Minimum research handoff and maintenance

For each comparison, keep together:

1. **Case and evidence scope:** case id, geography, event period/T0 definition,
   code/data commit, and source/status/uncertainty for every populated field.
2. **Exposed population:** zone counts, cohort definitions, total, origin
   allocation, resident/visitor assumption, exact mix maps, and any overrides.
3. **Decision assumptions:** travel-unit membership/pace/waiting priors,
   information/risk distributions, warning scale, behaviour/return parameters,
   and social/re-route rules.
4. **Access and conditions:** exit classification, routes/approaches/transfers,
   capacities, route closures, transit deadline, weather/time bundle, and a
   simulated-time log of changes.
5. **Experiment and interpretation:** resolution, seed, tick policy, horizon,
   full outcome shares and quantile denominator; explicitly mark unrepresented
   protection, legal, reception, and transport questions.

When a source variable changes, update its entry here and its directly related
assumption/comparison. Keep historical values in the lineage explanation, not
as competing current defaults. Do not copy the original `departureSpread` /
`departure` formula from old METHOD prose into a new scenario: it included
`damage_pct` and risk, whereas current departure follows warning, seeking,
milling, and reluctance. Likewise, original `corridorCapacity` and
`corridorOpen` are historical predecessors of per-route capacity/`open`, not
additional current controls.

This reference consolidates the input vocabulary; it does not resolve the
calibration and fidelity work already recorded in the [backlog][backlog].

<!-- Source links: current paths keep the reference near the implementation;
     pinned history links preserve the lineage and the baseline. -->
[baseline]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/tree/513d6d5ba689ba0fc0494ce8dc4572f0e09e825f
[original-readme]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/af56830/README.md
[original-population]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/af56830/src/population.js
[original-engine]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/af56830/src/engine.js
[history-initial]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/af56830
[history-cities]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/02c8347
[history-conditions]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/245ee07
[history-accounting]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/0e3b01a
[history-local]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/d035d57
[history-demography]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/6161ac2
[history-transit]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/commit/c8ac8a3
[annotation-recommendation]: https://github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation/blob/2ae0ea2/DECISION-MODEL-RECO.md
[method-limits]: METHOD.md#4-what-this-is-not
[method-geometry]: METHOD.md#3-illustrative--geometry-that-looks-right-but-was-not-surveyed
[decisions]: AGENT_DECISIONS.md
[doc-disagreements]: AGENT_DECISIONS.md#8-where-the-docs-and-the-code-disagree
[closure-details]: AGENT_DECISIONS.md#4-route-choice-re-routing-and-corridor-closure--the-full-logic
[map-meaning]: AGENT_DECISIONS.md#6-what-each-thing-on-screen-represents
[behaviour-gaps]: AGENT_DECISIONS.md#92-behaviour-and-household-realism
[local-model]: LOCAL_DECISION_MODEL.md
[backlog]: ../BACKLOG.md
[tests]: ../test/model.test.mjs
[data-provenance]: ../data/README.md#captured-real-data-now-in-the-pack
[pois]: ../data/pois.geojson
[mariupol-meta]: ../data/cities/mariupol/meta.json
[mariupol-zones]: ../data/cities/mariupol/zones.geojson
[mariupol-routes]: ../data/cities/mariupol/routes.geojson
[nyc-meta]: ../data/cities/nyc/meta.json
[nyc-zones]: ../data/cities/nyc/zones.geojson
[nyc-routes]: ../data/cities/nyc/routes.geojson
[nyc-transit]: ../data/cities/nyc/transit.geojson
[vegas-meta]: ../data/cities/vegas/meta.json
[vegas-zones]: ../data/cities/vegas/zones.geojson
[vegas-routes]: ../data/cities/vegas/routes.geojson
[miami-meta]: ../data/cities/miami/meta.json
[miami-zones]: ../data/cities/miami/zones.geojson
[miami-routes]: ../data/cities/miami/routes.geojson
[city-loader]: ../src/cities.js#L7-L67
[cohort-speeds]: ../src/population.js#L26-L31
[travel-units]: ../src/population.js#L39-L79
[behaviours]: ../src/population.js#L89-L129
[population-rng]: ../src/population.js#L134-L150
[zone-cohorts]: ../src/population.js#L159-L165
[weighting]: ../src/population.js#L198-L232
[population-sampling]: ../src/population.js#L234-L327
[origins]: ../src/population.js#L335-L347
[population-tallies]: ../src/population.js#L352-L372
[mix-defaults]: ../src/mix.js#L15-L41
[presets]: ../src/mix.js#L80-L155
[mix-url]: ../src/mix.js#L157-L199
[conditions]: ../src/conditions.js#L28-L116
[environment]: ../src/conditions.js#L120-L143
[path-measurement]: ../src/engine.js#L20-L59
[route-preparation]: ../src/engine.js#L60-L96
[route-entries]: ../src/engine.js#L115-L243
[route-choice]: ../src/engine.js#L169-L217
[rerouting]: ../src/engine.js#L256-L275
[engine-defaults]: ../src/engine.js#L277-L342
[simulation]: ../src/engine.js#L344-L388
[social-flow]: ../src/engine.js#L389-L435
[lifecycle]: ../src/engine.js#L437-L573
[transfer]: ../src/engine.js#L581-L619
[pace]: ../src/engine.js#L624-L641
[controls]: ../index.html#L37-L102
[read-options]: ../src/app.js#L152-L189
[stats]: ../src/app.js#L254-L300
[route-controls]: ../src/app.js#L336-L355
[browser-loop]: ../src/app.js#L374-L383
[live-controls]: ../src/app.js#L386-L457
[url-sync]: ../src/app.js#L652-L664
[road-classes]: ../tools/fetch_city.py#L30-L37
[city-definitions]: ../tools/fetch_city.py#L39-L77
[buildings]: ../tools/fetch_city.py#L109-L165
[road-graph]: ../tools/fetch_city.py#L168-L213
[path-builder]: ../tools/fetch_city.py#L215-L273
[exit-definitions]: ../tools/fetch_city.py#L281-L307
[transit-definitions]: ../tools/fetch_city.py#L349-L367
[transit-feeds]: ../tools/fetch_city.py#L321-L472
[city-cohorts]: ../tools/fetch_city.py#L497-L541
[zone-generation]: ../tools/fetch_city.py#L543-L566
[pack-builder]: ../tools/fetch_city.py#L569-L647
[approach-builder]: ../tools/fetch_city.py#L648-L716
[homes-builder]: ../tools/fetch_city.py#L718-L733
[pack-metadata]: ../tools/fetch_city.py#L735-L760
