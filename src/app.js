// Wiring: load the data packs, build a population, run the clock, redraw.

import { buildPopulation, COHORTS } from './population.js';
import { buildPaths, createSim, positions, pointAt } from './engine.js';
import { CARTO_STYLE, INITIAL_VIEW, baseLayers, agentLayers } from './map.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');

const state = {
  agents: [], sim: null, running: false, trails: [], last: 0,
  data: null, exit: null, corridor: null,
};

const map = new maplibregl.Map({
  container: 'map',
  style: CARTO_STYLE,
  center: [INITIAL_VIEW.longitude, INITIAL_VIEW.latitude],
  zoom: INITIAL_VIEW.zoom,
  pitch: INITIAL_VIEW.pitch,
  bearing: INITIAL_VIEW.bearing,
  antialias: true,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

const overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
map.on('load', () => { map.addControl(overlay); boot(); });

async function boot() {
  const [buildings, damage, pois, route] = await Promise.all(
    ['buildings', 'damage', 'pois', 'route'].map((f, i) =>
      fetch(`data/${f}.${i > 1 ? 'geojson' : 'json'}`).then(r => r.json())));

  state.data = { buildings, damage, pois };
  state.exit = pois.features.find(f => f.properties.poi_type === 'exit').geometry.coordinates;
  state.corridor = route.features[0].geometry.coordinates;
  rebuild();
  bindControls();
  requestAnimationFrame(loop);
}

function readOpts() {
  return {
    size: +$('size').value,
    infoQuality: +$('info').value,
    departureSpread: +$('spread').value * 60,
    seed: +$('seed').value,
    corridorCapacity: +$('cap').value,
    hazard: +$('haz').value,
    corridorOpen: $('open').checked,
    timeScale: +$('ts').value,
  };
}

function rebuild() {
  const o = readOpts();
  const zones = state.data.pois.features.filter(f => f.properties.poi_type === 'origin_zone');
  state.agents = buildPopulation({ zones, size: o.size, seed: o.seed,
                                   infoQuality: o.infoQuality, departureSpread: o.departureSpread });
  buildPaths(state.agents, state.exit, state.corridor);
  state.sim = createSim(state.agents, o);
  state.trails = [];
  draw({ t: 0, moving: 0, waiting: o.size, evacuated: 0, back: 0, congestion: 0, atMouth: 0 });
}

// Trails are sampled, not per-frame: a hundred representative agents is enough
// to read the flow, and keeps TripsLayer cheap at 20,000 agents.
function sampleTrails() {
  const step = Math.max(1, Math.floor(state.agents.length / 120));
  if (!state.trails.length) {
    for (let i = 0; i < state.agents.length; i += step) {
      const a = state.agents[i];
      state.trails.push({ agent: a, path: [], timestamps: [], colour: COHORTS[a.cohort].colour });
    }
  }
  const t = state.sim.time;
  for (const tr of state.trails) {
    const a = tr.agent;
    if (t < a.departure || a.turnedBack) continue;
    const p = pointAt(a.path, a.dist);
    const last = tr.path[tr.path.length - 1];
    if (!last || Math.abs(last[0] - p[0]) > 1e-5 || Math.abs(last[1] - p[1]) > 1e-5) {
      tr.path.push(p); tr.timestamps.push(t);
      if (tr.path.length > 400) { tr.path.shift(); tr.timestamps.shift(); }
    }
  }
}

function draw(s) {
  const live = positions(state.agents, state.sim ? state.sim.time : 0);
  overlay.setProps({
    layers: [
      ...baseLayers(deck, {
        buildings: state.data.buildings,
        damage: state.data.damage,
        pois: state.data.pois,
        corridor: state.corridor,
        showBuildings: $('bld').checked,
        showDamage: $('dmg').checked,
      }),
      ...agentLayers(deck, {
        live, trails: state.trails,
        showTrails: $('trl').checked,
        time: s.t,
      }),
    ],
  });
  renderStats(s);
}

function renderStats(s) {
  const h = Math.floor(s.t / 3600), m = Math.floor((s.t % 3600) / 60);
  $('clock').textContent = `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const n = state.agents.length || 1;
  const pct = x => `${((x / n) * 100).toFixed(1)}%`;

  // Clearance percentiles: the number that actually matters to a corridor
  // negotiator is not "how many got out" but "how long until most did".
  const times = state.agents.filter(a => a.done).map(a => a.exitTime).sort((a, b) => a - b);
  const q = p => (times.length ? `${(times[Math.floor(times.length * p)] / 3600).toFixed(1)} h` : '—');

  $('stats').innerHTML = `
    <div><b>${fmt(s.evacuated)}</b><span>out (${pct(s.evacuated)})</span></div>
    <div><b>${fmt(s.moving)}</b><span>moving</span></div>
    <div><b>${fmt(s.waiting)}</b><span>not yet moving</span></div>
    <div><b>${fmt(s.back)}</b><span>turned back</span></div>
    <div><b>${(s.congestion * 100).toFixed(0)}%</b><span>mouth congestion</span></div>
    <div><b>${q(0.5)} / ${q(0.9)}</b><span>50th / 90th clearance</span></div>`;

  const byCohort = {};
  for (const a of state.agents) {
    const c = (byCohort[a.cohort] ??= { n: 0, out: 0 });
    c.n++; if (a.done) c.out++;
  }
  $('cohorts').innerHTML = Object.entries(COHORTS).map(([k, c]) => {
    const d = byCohort[k] || { n: 0, out: 0 };
    const w = d.n ? (d.out / d.n) * 100 : 0;
    return `<div class="cohort">
      <span class="swatch" style="background:rgb(${c.colour.join(',')})"></span>
      <span class="name">${c.label}</span>
      <span class="bar"><i style="width:${w}%;background:rgb(${c.colour.join(',')})"></i></span>
      <span class="pctv">${w.toFixed(0)}%</span></div>`;
  }).join('');
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtReal = Math.min((now - state.last) / 1000, 0.1);
  state.last = now;
  if (!state.running || !state.sim) return;
  const s = state.sim.tick(dtReal * state.sim.cfg.timeScale);
  sampleTrails();
  draw(s);
}

function bindControls() {
  const live = {
    size: v => `${fmt(+v)}`,
    info: v => Number(v).toFixed(2),
    spread: v => `${v} min`,
    cap: v => `${v} /min`,
    haz: v => Number(v).toFixed(2),
    ts: v => `${v}×`,
  };
  for (const [id, f] of Object.entries(live)) {
    const el = $(id), out = $(`${id}Out`);
    const sync = () => { out.textContent = f(el.value); };
    sync();
    el.addEventListener('input', () => {
      sync();
      // Corridor and clock settings apply live; population settings need a rebuild.
      if (['cap', 'haz', 'ts'].includes(id)) Object.assign(state.sim.cfg, readOpts());
    });
    if (['size', 'info', 'spread'].includes(id)) el.addEventListener('change', rebuild);
  }
  $('seed').addEventListener('change', rebuild);
  $('open').addEventListener('change', () => Object.assign(state.sim.cfg, readOpts()));
  for (const id of ['bld', 'dmg', 'trl']) $(id).addEventListener('change', () => draw({ ...lastStats() }));

  $('play').addEventListener('click', () => {
    state.running = !state.running;
    $('play').textContent = state.running ? '❚❚ Pause' : '▶ Run';
    $('play').classList.toggle('primary', !state.running);
  });
  $('reset').addEventListener('click', () => {
    state.running = false;
    $('play').textContent = '▶ Run';
    $('play').classList.add('primary');
    rebuild();
  });
}

function lastStats() {
  const t = state.sim ? state.sim.time : 0;
  let moving = 0, waiting = 0, evacuated = 0, back = 0;
  for (const a of state.agents) {
    if (a.done) evacuated++;
    else if (a.turnedBack) back++;
    else if (t < a.departure) waiting++;
    else moving++;
  }
  return { t, moving, waiting, evacuated, back, congestion: 0, atMouth: 0 };
}
