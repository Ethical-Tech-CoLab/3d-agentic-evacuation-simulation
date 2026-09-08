# Backlog

What this model is missing, in priority order. Everything here comes out of the
peer review of 7 September 2026, which evaluated the tool's fidelity rather than
its code. Items are grouped by what they would buy, not by effort.

The organising judgement: **the engineering is ahead of the evidence.** The
geometry is real, the state machine matches the standard evacuation-time
decomposition, and the invariants are tested. What is missing is any external
grounding for ~141 numeric parameters, and — more urgently — the discipline to
distinguish what the model *discovers* from what it was *told*.

---

## P0 — Credibility. Do these before showing the tool to anyone as evidence.

### 1. Reclassify the reported findings
The README reports as a finding that institutional units clear 1.79× slower than
solo households. The travel-unit table assigns them a pace multiplier of 1.82.
**The model was told this and reported it back.** Same for "a returner costs
itself 2.6 hours", which is arithmetic over a defined backtrack fraction.

Partition every reported number into:
- **tautological** — computable from the inputs with arithmetic; stop reporting
  as a finding, or reframe as "what this assumption implies at scale"
- **emergent** — route-load distribution, the 42-point district divergence, the
  ice-at-night deadlock, and *raising hazard lengthens median clearance*
- **structural** — properties of the model, e.g. sample-size invariance

The hazard result should be the headline. It is counter-intuitive and real.

### 2. Sensitivity sweep over every parameter
~141 constants, none calibrated, so the parameter vector is unidentifiable.
Vary each ±50%, report the elasticity of median clearance and p90. Expect a
handful to dominate. This tells us where evidence is worth buying, and converts
"we don't know" into "we know what we don't know".

### 3. Fix the speed distribution
Adult walking speed is drawn with SD **0.12**. The best-established figure in
this literature is mean 1.34 m/s, **SD 0.37** (Buchmueller & Weidmann 2006). The
population is ~3× too homogeneous, which understates the slow tail and therefore
the 90th-percentile clearance the tool foregrounds. One-line change; re-run
everything after it. Also revisit elderly 0.75 m/s against published ~0.94.

### 4. Say what the tool is for
It is described as "planning and teaching" but a reader cannot tell which
decisions it can inform. State plainly: fit for building intuition about
interaction effects; **not** fit for setting corridor capacity or estimating
clearance for a real operation.

---

## P1 — Fidelity. These change what the model computes.

### 5. Give routes a width; express capacity as specific flow
Capacity is people/minute with no width parameter, so one slider sets five very
different corridors identically — worst in Lower Manhattan, where the bridge is
the bottleneck. Pedestrian capacity is people/second/metre of width. OSM often
carries `width`/`lanes`; otherwise assign by highway class, which we already read.

### 6. Make hazard spatial
783 UNOSAT damage points are rendered and affect movement not at all, while
hazard is one global scalar. A viewer will infer a connection that does not
exist. Interpolate a hazard field from the points — the data is already loaded —
or visually separate the layer and say in the legend that it is contextual.

### 7. Vehicle mode, or label the US cities pedestrian-only
Everyone walks at 0.55–1.35 m/s in all four cities. Miami-Dade Zone A and NYC
surge evacuation are overwhelmingly vehicular. Either add a mode share with
vehicle speeds and vehicle-based capacity, or label those three scenarios in the
interface. The label is a day's work and removes the misleading implication.

### 8. Split the overloaded variables
`info` drives five distinct mechanisms (warning arrival, confirmation duration,
queue legibility, route-closure knowledge, re-route eligibility). `hazard` drives
three. These are different constructs and fusing them makes both uninterpretable
and uncalibratable. Split into named sub-variables — `warningReach`,
`queueLegibility`, `routeStatusKnowledge` — even if one slider drives them at
first.

### 9. Report uncertainty
Every output is a point estimate from one seed. Run ≥30 seeds and put an
inter-quartile band on the clearance tile.

---

## P2 — Evidence. The long game.

### 10. Calibrate against one real evacuation
No clearance curve, no benchmark, nothing. Even a poor fit against one
documented case with published egress times is worth more than perfect internal
consistency across four hypothetical ones. Start with the two or three
parameters the sensitivity sweep says dominate.

### 11. Face validity with practitioners
Show it to two evacuation practitioners and publish what they said. For a model
with no calibration data this is the cheapest available evidence and is standard
practice in agent-based modelling.

### 12. Source or disown the behaviour shares
The travel-unit split (28/44/20/8) and behaviour split (24/30/26/13/7) are
attributed to "the evacuation-behaviour literature's broad findings" with no
citation for any of the nine numbers. Cite them or restate them as priors.

### 13. Parameter table in METHOD.md
Every constant, its value, its role, its provenance — including "author's
judgement". Making the count visible is itself a finding.

---

## P2b — Known ceiling: capacity response saturates at ~25%

Dropping route capacity twentyfold (3000 → 150 people/min) lengthens median
*walking* time by only ~25%, and the ceiling does not move however concentrated
departures are (tested at 90, 15 and 5 minute warning spreads). The reason is
geometric rather than a missing mechanism: over a 9.5 km corridor the column
spreads out along the route as speeds differ, so density peaks around 1.3
people/m against a jam density of 4.2 and never approaches it.

Whether that is right depends on something the model does not represent: real
corridor bottlenecks are usually a *point* — a bridge mouth, a checkpoint, a
gate — not a uniform property of nine kilometres of road. Adding an explicit
bottleneck at a named point on a route would probably matter more than tuning
the density relation. Related to P1 item 5 (route width).

## P3 — Correctness and hygiene

- **`weight` is no longer a headcount.** Post-stratification leaves a solo
  household representing 1.42 people, with the ratio varying 1.29–1.42 by unit
  type. Rename it, document the raking as iterative proportional fitting on the
  cohort margin, and report the induced distortion of the household-size
  distribution. METHOD.md §0 currently claims otherwise.
- **The colour legend is wrong.** It says "size is headcount"; dot radius is
  computed from `group`, while the headcount is `weight`.
- **Greenshields is a vehicular relation.** `JAM_RATIO = 2.0` is correctly
  entailed *by* Greenshields, but METHOD.md presents that as settling the
  question. Choosing Greenshields for a walking crowd is itself a judgement and
  should say so.
- **`CRAWL = 0.03`** is a numerical guard against deadlock, not a behavioural
  parameter. Label it as such.
- **`returnAtFrac`** is uniform on [0.2, 0.65] with no rationale; returning is
  presumably likelier early, nearer home.
- **`LOCAL_WEIGHT = 0.75`** sets how far "watching your neighbours" reaches and
  is likely consequential. Include it in the sensitivity sweep.
- **Dead route.** NYC's "North · Midtown high ground" takes zero households in
  every run. Correct behaviour; label it a control rather than an option.
- **Name collision.** Miami has two routes beginning "West ·".

---

## Enabling CI

The test workflow is not committed: the token used to push lacks the GitHub
`workflow` scope. Run `gh auth refresh -s workflow` and commit
`.github/workflows/ci.yml`, or add it through the web UI. It needs only
`actions/checkout`, `actions/setup-node`, and `npm test`.

---

## Not doing, and why

- **Per-agent network influence.** Coupling is mean-field at zone resolution:
  agents respond to aggregates other agents produce, not to specific other
  agents. Adding a real social network would be a different model, and without
  data on who talks to whom it would add parameters without adding evidence.
- **Real building footprints instead of extruded centroids.** Heights are now
  OSM's own where recorded (96% in Lower Manhattan). Footprint polygons would
  cost several MB for a visual gain that changes no result.
