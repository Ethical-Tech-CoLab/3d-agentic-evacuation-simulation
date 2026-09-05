# Mariupol Site Pack data (real open data + schematic corridor)

These files back the schematic Mariupol scenario (`?scenario=mariupol`). The
**buildings, damage, and zone-cohort statistics are real captured data** (see
below); only the **evacuation corridor line and exact zone marker placements**
remain schematic.

| File | What it is |
|---|---|
| `buildings.json` | **Real** — 45,544 OSM building centroids (`[lon,lat]` tuples) from the ETC `mariupol_lights.json`; heights are hashed for skyline variation (no per-building height in the source). |
| `damage.json` | **Real** — 783 UNITAR/UNOSAT verified damage points (14 Mar 2022, code CE20220223UKR) as `[lon,lat,severity]` (0 possible → 3 destroyed). |
| `route.geojson` | Schematic evacuation-corridor `LineString` (EXIT WEST → Zaporizhzhia direction). |
| `pois.geojson` | The **five real emergency-zone cohorts** (captured population/vulnerable/child/elderly/disabled + damage/dark/destroyed + a `tag`), plus EXIT WEST, the Zaporizhzhia destination, Bezimenne filtration, Azovstal, and a shelter. |

## Captured (real) data now in the pack

The zone cohorts in `pois.geojson` and `src/app/scenarios/mariupol-data.ts` are
**transcribed real figures** from the ETC / Christine Lumen
`mariupol-evacuation-model` "Data-Driven Evacuation Analysis" (Late Mar–Apr 2022)
and the 16 Mar 2022 severity model:

- **Five emergency zones** summing to the published **37,663 exposed** /
  **16,102 vulnerable** (Zone 5's child/elderly/disabled split is estimated to
  its exact vulnerable total; the source row is truncated).
- Scenario facts: severity **0.54** (Phase 3/5), pre-siege pop **343,598**,
  **~16%** damaged, **22%** lights, **783** UNOSAT points, **45,544** buildings,
  corridor **227 km** to Zaporizhzhia (in-city Dijkstra route **7.0 km**).
- **Buildings** (`buildings.json`) — the real 45,544 OSM centroids, vendored from
  ETC `mariupol_lights.json` (heights hashed; the source has none).
- **Damage** (`damage.json`) — the real 783 UNOSAT points (14 Mar 2022), vendored
  from ETC `unosat_mariupol_damage.json` (`march` set).

Still schematic: the evacuation-corridor line (`route.geojson`) and the exact
lon/lat of the five zone markers (positioned in the real city centre for the
model, not surveyed cell centroids).

## Satellite before/after (real imagery)

The high-fidelity before/after satellite comparison (Esri Wayback Archive tiles +
UNOSAT overlays) lives on the ETC feasibility page and is **linked, not
re-hosted**, to respect Esri Wayback provider terms — see the Operator Console's
**Satellite ↗** button → `https://ethical-tech-colab.github.io/mariupol-evacuation-model/`.

## Replacing the remaining schematic geometry (gated)

The engine consumes generic shapes (see `scenarios/geo.ts`), so real,
appropriately-licensed data can drop in **without code changes** by overwriting
these files:

- **Buildings** — OSM building centroids (e.g. ETC's `mariupol_lights.json`,
  45,544 points) mapped to `{lon,lat,height}` or `{centroid:[lon,lat]}`.
- **Danger zones** — UNOSAT damage points (e.g. `unosat_mariupol_damage.json`,
  UNOSAT code CE20220223UKR) clustered into `danger_zone` POIs.
- **Corridor** — the georeferenced negotiated-corridor polyline.

## Provenance & ethics

Source models and datasets: ETC
[mariupol-evacuation-model](https://github.com/Ethical-Tech-CoLab/mariupol-evacuation-model)
(open data, IHL-anchored). Any real data added here must honor its upstream
licensing and attribution (UNOSAT / ACLED / NASA VIIRS / OpenStreetMap / ERA5),
be descriptive-and-attributed rather than adjudicative, and remain a
**retrospective planning/education** artifact — never operational, never keyed to
live individual location. See `docs/P7-MARIUPOL-PREP.md` §5–§6.
