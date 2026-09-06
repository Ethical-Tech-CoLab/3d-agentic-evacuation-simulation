// Model invariants.
//
// Every assertion here corresponds to a defect that was found by hand, once,
// and must never come back. The first one is the important one: an answer that
// moves when you change the sample size is not an answer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { buildPopulation, tally, scaleOf } from '../src/population.js';
import { prepareRoutes, buildEntries, createSim, positions, indexApproaches } from '../src/engine.js';
import { environment } from '../src/conditions.js';
import { defaultMix, mixToParams, mixFromParams, rebalance, normalise } from '../src/mix.js';

const ROOT = path.join(import.meta.dirname, '..');
const CITIES = ['mariupol', 'nyc', 'vegas', 'miami'];
const load = (city, file) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cities', city, file), 'utf8'));

function build(city, size, opts = {}) {
  const zones = load(city, 'zones.geojson').features;
  const homes = load(city, 'homes.json');
  const agents = buildPopulation({ zones, size, homes, seed: 20220316, mix: opts.mix });
  const routes = prepareRoutes(load(city, 'routes.geojson').features, opts.routeCapacity ?? 900);
  buildEntries(agents, routes, 20220316, indexApproaches(load(city, 'approaches.geojson').features));
  return { agents, routes, zones, sim: createSim(agents, routes, opts) };
}

const run = (sim, steps = 2600, dt = 30) => { let s; for (let i = 0; i < steps; i++) s = sim.tick(dt); return s; };
const median = xs => (xs.length ? xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);
const clearance = agents => median(agents.filter(a => a.state === 'done').map(a => a.doneAt));

/* ── The defect that mattered most ───────────────────────────────────────── */

test('clearance time does not depend on how many households are simulated', () => {
  const got = [1000, 4000, 12000].map(n => {
    const { agents, sim } = build('mariupol', n, { routeCapacity: 400 });
    run(sim);
    return clearance(agents) / 3600;
  });
  const spread = (Math.max(...got) - Math.min(...got)) / Math.min(...got);
  assert.ok(spread < 0.10,
    `median clearance varied ${(spread * 100).toFixed(1)}% across sample sizes: ${got.map(v => v.toFixed(2)).join(', ')} h`);
});

test('peak queueing does not depend on how many households are simulated', () => {
  const peaks = [1000, 4000, 12000].map(n => {
    const { routes, sim } = build('mariupol', n, { routeCapacity: 400 });
    let peak = 0;
    for (let i = 0; i < 2600; i++) { sim.tick(30); peak = Math.max(peak, ...routes.map(r => r.queued)); }
    return peak;
  });
  const spread = (Math.max(...peaks) - Math.min(...peaks)) / Math.max(Math.min(...peaks), 1);
  assert.ok(spread < 0.25,
    `peak queue varied ${(spread * 100).toFixed(0)}% across sample sizes: ${peaks.map(Math.round).join(', ')} people`);
});

/* ── The unit of account ─────────────────────────────────────────────────── */

for (const city of CITIES) {
  test(`${city}: household weights sum to the exposed population`, () => {
    const { agents, zones } = build(city, 3000);
    const exposed = zones.reduce((s, z) => s + z.properties.population, 0);
    assert.ok(Math.abs(scaleOf(agents).people - exposed) < 1,
      `weights sum to ${scaleOf(agents).people}, exposed is ${exposed}`);
  });

  test(`${city}: cohort shares are person-weighted and match the source`, () => {
    const { agents, zones } = build(city, 3000);
    const exposed = zones.reduce((s, z) => s + z.properties.population, 0);
    const pubVulnerable = zones.reduce((s, z) => s + z.properties.vulnerable, 0) / exposed;
    const t = tally(agents, 'cohort');
    const got = (t.child.n + t.elderly.n + t.disabled.n) / scaleOf(agents).people;
    assert.ok(Math.abs(got - pubVulnerable) < 0.005,
      `vulnerable share ${(got * 100).toFixed(2)}% vs published ${(pubVulnerable * 100).toFixed(2)}%`);
  });
}

/* ── Outcomes must not be conflated ──────────────────────────────────────── */

test('reaching a filtration exit is not counted as reaching safety', () => {
  const { agents, routes, sim } = build('mariupol', 4000);
  const unsafe = routes.filter(r => !r.safe);
  assert.ok(unsafe.length === 1, 'Mariupol should have exactly one non-safety exit');
  const s = run(sim);
  const filtered = agents.filter(a => a.state === 'filtered');
  assert.ok(filtered.length > 0, 'nobody took the eastward route, so the test proves nothing');
  assert.ok(filtered.every(a => !a.route.safe), 'someone on a safe route was marked filtered');
  assert.ok(agents.filter(a => a.state === 'done').every(a => a.route.safe),
    'someone on the filtration route was counted as having reached safety');
  assert.ok(s.filtered > 0 && s.evacuated > 0 && s.filtered !== s.evacuated);
});

/* ── Congestion has to be able to bite ───────────────────────────────────── */

test('route capacity constrains the whole route, not just its mouth', () => {
  // Measured on time spent ON the route, not total clearance. Total clearance
  // is dominated by warning and milling — hours before anyone starts walking —
  // which would mask a capacity effect that is really there.
  const onRoute = agents => median(agents
    .filter(a => a.state === 'done' && a.exitTime != null)
    .map(a => a.doneAt - a.exitTime));
  const slow = build('mariupol', 6000, { routeCapacity: 150 });
  const fast = build('mariupol', 6000, { routeCapacity: 3000 });
  run(slow.sim, 4000); run(fast.sim, 4000);
  const a = onRoute(slow.agents), b = onRoute(fast.agents);
  assert.ok(a > b * 1.25,
    `walking the route took ${(a / 3600).toFixed(2)} h at 150/min vs ${(b / 3600).toFixed(2)} h at 3000/min — capacity is not biting`);
});

test('a jammed route slows the column on the route itself', () => {
  const { routes, sim } = build('mariupol', 12000, { routeCapacity: 120 });
  let minFlow = 1;
  for (let i = 0; i < 1500; i++) { sim.tick(30); minFlow = Math.min(minFlow, ...routes.map(r => r.flowFactor)); }
  assert.ok(minFlow < 0.85, `flow factor never dropped below ${minFlow.toFixed(2)}`);
});

/* ── State machine ───────────────────────────────────────────────────────── */

test('refusing to leave is its own state, and rising hazard ends it', () => {
  const calm = build('mariupol', 3000, { hazard: 0.1 });
  const sCalm = run(calm.sim);
  assert.ok(sCalm.counts.stayed > 0, 'nobody refused to leave at low hazard');

  const grim = build('mariupol', 3000, { hazard: 0.95 });
  const sGrim = run(grim.sim);
  assert.ok(sGrim.counts.stayed < sCalm.counts.stayed * 0.2,
    `high hazard left ${Math.round(sGrim.counts.stayed)} refusing, low hazard ${Math.round(sCalm.counts.stayed)}`);
});

test('closing every route turns people back rather than evacuating them', () => {
  const { routes, sim } = build('mariupol', 2000);
  for (const r of routes) r.open = false;
  const s = run(sim);
  assert.equal(s.evacuated, 0, 'someone escaped through a closed route');
  assert.ok(s.back > 0, 'nobody was turned back');
});

test('reset() restores the run exactly', () => {
  const { agents, routes, sim } = build('mariupol', 2000);
  const before = agents.filter(a => a.willReturn).length;
  run(sim);
  sim.reset();
  assert.equal(agents.filter(a => a.willReturn).length, before, 'returner flags were lost by reset()');
  assert.ok(agents.every(a => a.state === 'unaware' && a.dist === 0 && !a.route));
  assert.ok(routes.every(r => r.taken === 0 && r.out === 0));
  const s = run(sim);
  assert.ok(s.evacuated > 0, 'the run after reset produced nothing');
});

/* ── Geometry ────────────────────────────────────────────────────────────── */

for (const city of CITIES) {
  test(`${city}: every metre walked is on the pack's own geometry`, () => {
    const { agents, sim } = build(city, 1500);
    run(sim, 900);
    const moved = agents.filter(a => a.path);
    assert.ok(moved.length > 0);
    for (const a of moved) {
      assert.ok(a.entryDist > 0 && a.entryDist <= a.path.length,
        'the district leg is longer than the whole path');
      assert.ok(a.path.coords.length >= 2);
    }
  });
}

test('no Lower Manhattan agent starts in, or crosses, the Hudson', () => {
  const { agents, sim } = build('nyc', 4000);
  run(sim, 1200);
  const SHORE = -74.020;          // west of this at these latitudes is river
  assert.ok(agents.every(a => a.origin[0] > SHORE), 'an agent started in the river');
  for (const a of agents) {
    if (!a.path) continue;
    assert.ok(a.path.coords.every(c => c[0] > SHORE), 'a path crossed the Hudson');
  }
});

/* ── Rendering ───────────────────────────────────────────────────────────── */

test('finished households are not handed to the renderer', () => {
  const { agents, sim } = build('mariupol', 4000);
  run(sim);
  const live = positions(agents);
  const stillMoving = agents.filter(a => a.route && !a.done && !a.turnedBack).length;
  assert.equal(live.length, stillMoving);
  assert.ok(live.every(d => !d.done));
});

/* ── Conditions ──────────────────────────────────────────────────────────── */

test('nobody deadlocks: every cohort still gets out in the worst conditions', () => {
  // The slowest agents used to stall permanently in a jam they were themselves
  // part of, so in ice at night not one disabled household in Lower Manhattan
  // ever finished. Any cohort reaching zero completions is a deadlock, not a
  // finding.
  const { agents, sim } = build('nyc', 3000, { env: environment('ice', 'night') });
  run(sim, 8000);
  for (const cohort of ['adult', 'child', 'elderly', 'disabled']) {
    const total = agents.filter(a => a.cohort === cohort).length;
    const out = agents.filter(a => a.cohort === cohort && a.state === 'done').length;
    assert.ok(out > total * 0.25,
      `only ${out} of ${total} ${cohort} households finished in ice at night`);
  }
});

test('bad weather makes things worse, and worst for the least mobile', () => {
  // Measured on time spent walking. Total clearance is dominated by warning and
  // milling, which are the same for everyone, and that common constant dilutes
  // the very gap being measured.
  const walk = (agents, cohort) => {
    const xs = agents.filter(a => a.state === 'done' && a.cohort === cohort && a.exitTime != null)
      .map(a => a.doneAt - a.exitTime);
    return median(xs);
  };
  const clear = build('nyc', 3000, { env: environment('clear', 'day') });
  const ice = build('nyc', 3000, { env: environment('ice', 'night') });
  // Run to near-completion. Comparing means over "those who finished" while
  // many have not is survivorship bias: it selects the fastest of the slow
  // cohort and flattens the very gap the test is looking for.
  run(clear.sim, 6000); run(ice.sim, 6000);
  assert.ok(clearance(ice.agents) > clearance(clear.agents), 'ice at night was not slower');
  const dClear = walk(clear.agents, 'disabled') / walk(clear.agents, 'adult');
  const dIce = walk(ice.agents, 'disabled') / walk(ice.agents, 'adult');
  assert.ok(dIce > dClear * 1.02,
    `disabled/adult walking-time ratio was ${dClear.toFixed(2)} in the clear and ${dIce.toFixed(2)} in ice at night`);
});

/* ── Mix editing ─────────────────────────────────────────────────────────── */

test('rebalancing an axis keeps it summing to one', () => {
  const m = defaultMix();
  const next = rebalance(m.unit, 'institutional', 0.4);
  const total = Object.values(next).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-9, `shares summed to ${total}`);
  assert.ok(Math.abs(next.institutional - 0.4) < 1e-9);
});

test('a mix round-trips through the URL', () => {
  const m = defaultMix();
  m.cohort = normalise({ adult: 0.4, child: 0.2, elderly: 0.3, disabled: 0.1 });
  m.spread = { speed: 0.5, info: 1.5, risk: 1, timing: 0.2 };
  const back = mixFromParams(mixToParams(m, new URLSearchParams()));
  for (const k of Object.keys(m.cohort)) assert.ok(Math.abs(back.cohort[k] - m.cohort[k]) < 0.01);
  assert.deepEqual(back.spread, m.spread);
});

test('a cohort override changes the population it produces', () => {
  const mix = defaultMix();
  mix.cohort = { adult: 0.1, child: 0.1, elderly: 0.7, disabled: 0.1 };
  const { agents } = build('mariupol', 3000, { mix });
  const t = tally(agents, 'cohort');
  const share = t.elderly.n / scaleOf(agents).people;
  assert.ok(Math.abs(share - 0.7) < 0.01, `elderly share came out at ${(share * 100).toFixed(1)}%`);
});
