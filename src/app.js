// Wiring: pick a city, build a population, run the clock, redraw.

import { buildPopulation, tally, COHORTS, TRAVEL_UNITS, BEHAVIOURS } from './population.js';
import { prepareRoutes, buildEntries, createSim, positions, pointAt, STATE_LABEL, indexApproaches } from './engine.js';
import { CARTO_STYLE, baseLayers, agentLayers, makeHeight } from './map.js';
import { CITIES, byId, loadCity } from './cities.js';
import { AXES, PRESETS, defaultMix, flat, rebalance, mixToParams, mixFromParams, customAxes }
  from './mix.js';
import { WEATHER, TIME_OF_DAY, environment, describe } from './conditions.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');

const params = new URLSearchParams(location.search);

const state = {
  cityId: params.get('city') || 'mariupol',
  mix: mixFromParams(params),
  mixAxis: 'cohort',
  weather: params.get('w') || 'clear',
  tod: params.get('tod') || 'day',
  city: null, pack: null, height: null,
  agents: [], routes: [], sim: null,
  running: false, trails: [], last: 0, colourBy: 'cohort',
};

const initial = byId(state.cityId).view;
const map = new maplibregl.Map({
  container: 'map', style: CARTO_STYLE,
  center: [initial.longitude, initial.latitude],
  zoom: initial.zoom, pitch: initial.pitch, bearing: initial.bearing,
  antialias: true,
});
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

const overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
map.on('load', () => { map.addControl(overlay); boot(); });

async function boot() {
  $('city').innerHTML = CITIES.map(c =>
    `<option value="${c.id}">${c.label} — ${c.sub}</option>`).join('');
  $('city').value = state.cityId;

  $('preset').innerHTML = Object.entries(PRESETS)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('weather').innerHTML = Object.entries(WEATHER)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('tod').innerHTML = Object.entries(TIME_OF_DAY)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('weather').value = state.weather;
  $('tod').value = state.tod;
  if (params.get('n')) $('size').value = params.get('n');
  if (params.get('seed')) $('seed').value = params.get('seed');
  $('presetNote').textContent = PRESETS.source.note;
  for (const [k, v] of Object.entries(state.mix.spread)) {
    const el = $(`sp${k[0].toUpperCase()}${k.slice(1)}`);
    if (el) el.value = v;
  }
  bindControls();
  await switchCity(state.cityId);
}

async function switchCity(id) {
  state.running = false;
  $('play').textContent = '▶ Run';
  $('play').classList.add('primary');
  state.cityId = id;
  state.city = byId(id);
  state.pack = await loadCity(id);
  state.height = makeHeight(state.pack.meta.centre);

  $('cityName').textContent = state.city.label;
  $('cityHazard').innerHTML =
    `${state.city.sub} · <span class="muted">${state.pack.meta.counts.exposed.toLocaleString()} exposed · ` +
    `${state.pack.meta.counts.routes} routes · ${fmt(state.pack.meta.counts.buildings)} buildings</span>`;
  $('cityNote').textContent = state.pack.meta.note;
  // Damage only exists for Mariupol; hide the toggle where it means nothing.
  $('dmg').closest('label').style.display = state.pack.damage.length ? '' : 'none';

  const v = state.city.view;
  map.flyTo({ center: [v.longitude, v.latitude], zoom: v.zoom,
              pitch: v.pitch, bearing: v.bearing, duration: 1200 });

  const url = new URL(location);
  url.searchParams.set('city', id);
  history.replaceState({}, '', url);

  rebuild();
}

function readOpts() {
  return {
    size: +$('size').value,
    infoQuality: +$('info').value,
    warningSpread: +$('spread').value * 60,
    seed: +$('seed').value,
    routeCapacity: +$('cap').value,
    hazard: +$('haz').value,
    herd: +$('herd').value,
    timeScale: +$('ts').value,
    mix: state.mix,
    env: environment(state.weather, state.tod),
  };
}

function rebuild() {
  const o = readOpts();
  const open = Object.fromEntries(state.routes.map(r => [r.id, r.open]));
  state.routes = prepareRoutes(state.pack.routes, o.routeCapacity);
  for (const r of state.routes) if (r.id in open) r.open = open[r.id];   // keep closures
  state.agents = buildPopulation({
    zones: state.pack.zones, size: o.size, seed: o.seed,
    infoQuality: o.infoQuality, warningSpread: o.warningSpread,
    homes: state.pack.homes, mix: state.mix,
  });
  buildEntries(state.agents, state.routes, o.seed, indexApproaches(state.pack.approaches));
  state.sim = createSim(state.agents, state.routes, o);
  state.trails = [];
  renderRouteList();
  renderMix();
  renderEnv();
  syncUrl();
  draw(emptyStats(o.size));
}

const emptyStats = n => ({
  t: 0, moving: 0, waiting: n, evacuated: 0, back: 0, socialProof: 0,
  counts: { unaware: n, seeking: 0, milling: 0, evacuating: 0, returning: 0, done: 0, back: 0 },
});

// Trails are sampled, not per-frame: ~120 representative agents is enough to
// read the flow and keeps TripsLayer cheap at 20,000 agents.
function sampleTrails() {
  const step = Math.max(1, Math.floor(state.agents.length / 120));
  if (!state.trails.length) {
    for (let i = 0; i < state.agents.length; i += step) state.trails.push({ agent: state.agents[i], path: [], timestamps: [] });
  }
  const t = state.sim.time;
  for (const tr of state.trails) {
    const a = tr.agent;
    if (!a.route || !a.path) continue;
    tr.colour = a.route.colour;
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
        city: state.city,
        zones: state.pack.zones,
        routes: state.routes,
        damage: state.pack.damage,
        buildings: state.pack.buildings,
        roads: state.pack.roads,
        height: state.height,
        show: { buildings: $('bld').checked, roads: $('rds').checked,
                damage: $('dmg').checked, },
      }),
      ...agentLayers(deck, {
        live,
        trails: state.trails.filter(t => t.colour),
        showTrails: $('trl').checked,
        time: s.t,
        colourBy: state.colourBy,
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

  // Clearance is measured on when an agent actually reached the far end of its
  // route — not when it left the district, which flatters anyone who turned back.
  const times = state.agents.filter(a => a.done).map(a => a.doneAt).sort((a, b) => a - b);
  const q = p => (times.length ? `${(times[Math.floor(times.length * p)] / 3600).toFixed(1)} h` : '—');
  const neverLeft = s.counts.milling + s.counts.seeking + s.counts.unaware;

  $('stats').innerHTML = `
    <div><b>${fmt(s.evacuated)}</b><span>out (${pct(s.evacuated)})</span></div>
    <div><b>${fmt(s.moving)}</b><span>on a route</span></div>
    <div><b>${fmt(neverLeft)}</b><span>still inside</span></div>
    <div><b>${fmt(s.counts.returning)}</b><span>gone back</span></div>
    <div><b>${q(0.5)} / ${q(0.9)}</b><span>50th / 90th clearance</span></div>
    <div><b>${(s.socialProof * 100).toFixed(0)}%</b><span>visibly moving</span></div>`;

  $('lifecycle').innerHTML = ['unaware', 'seeking', 'milling', 'evacuating', 'returning', 'done']
    .map(k => {
      const v = s.counts[k] || 0;
      const w = (v / n) * 100;
      return `<div class="life"><span class="lname">${STATE_LABEL[k]}</span>
        <span class="bar"><i style="width:${w}%"></i></span>
        <span class="pctv">${fmt(v)}</span></div>`;
    }).join('');

  renderBreakdown();
  renderRouteStats();
}

function renderBreakdown() {
  const axis = state.colourBy;
  if (axis === 'route') {
    const total = state.routes.reduce((a, r) => a + r.taken, 0) || 1;
    $('breakdown').innerHTML = state.routes.map(r => {
      const w = (r.taken / total) * 100;
      return `<div class="cohort">
        <span class="swatch" style="background:rgb(${r.colour.join(',')})"></span>
        <span class="name" title="${r.name}">${r.name}</span>
        <span class="bar"><i style="width:${w}%;background:rgb(${r.colour.join(',')})"></i></span>
        <span class="pctv">${fmt(r.taken)}</span></div>`;
    }).join('');
    return;
  }
  const table = { cohort: COHORTS, unit: TRAVEL_UNITS, behaviour: BEHAVIOURS }[axis];
  const counts = tally(state.agents, axis);
  $('breakdown').innerHTML = Object.entries(table).map(([k, c]) => {
    const d = counts[k] || { n: 0, out: 0 };
    const w = d.n ? (d.out / d.n) * 100 : 0;
    return `<div class="cohort">
      <span class="swatch" style="background:rgb(${c.colour.join(',')})"></span>
      <span class="name">${c.label}</span>
      <span class="bar"><i style="width:${w}%;background:rgb(${c.colour.join(',')})"></i></span>
      <span class="pctv">${w.toFixed(0)}%</span></div>`;
  }).join('');
}

function renderRouteList() {
  $('routeList').innerHTML = state.routes.map(r => `
    <button class="route ${r.open ? '' : 'closed'}" data-route="${r.id}">
      <span class="swatch" style="background:rgb(${r.colour.join(',')})"></span>
      <span class="rname">${r.name}</span>
      <span class="rlen">${(r.lengthM / 1000).toFixed(1)} km</span>
      <span class="rtaken" data-taken="${r.id}">0</span>
    </button>`).join('');
  for (const b of $('routeList').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const r = state.routes.find(x => x.id === b.dataset.route);
      r.open = !r.open;
      b.classList.toggle('closed', !r.open);
    });
  }
}

function renderRouteStats() {
  for (const r of state.routes) {
    const el = $('routeList').querySelector(`[data-taken="${r.id}"]`);
    if (el) el.textContent = fmt(r.taken);
  }
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
requestAnimationFrame(loop);

function bindControls() {
  const live = {
    size: v => fmt(+v),
    info: v => Number(v).toFixed(2),
    spread: v => `${v} min`,
    cap: v => `${v} /min`,
    haz: v => Number(v).toFixed(2),
    herd: v => Number(v).toFixed(2),
    ts: v => `${v}×`,
  };
  for (const [id, f] of Object.entries(live)) {
    const el = $(id), out = $(`${id}Out`);
    const sync = () => { out.textContent = f(el.value); };
    sync();
    el.addEventListener('input', () => {
      sync();
      // Conditions apply live; population settings need a rebuild.
      if (['cap', 'haz', 'herd', 'ts'].includes(id) && state.sim) Object.assign(state.sim.cfg, readOpts());
    });
    if (['size', 'info', 'spread'].includes(id)) el.addEventListener('change', rebuild);
  }
  $('seed').addEventListener('change', rebuild);
  $('city').addEventListener('change', e => switchCity(e.target.value));

  // Population mix
  for (const b of $('mixTabs').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      state.mixAxis = b.dataset.axis;
      for (const o of $('mixTabs').querySelectorAll('button')) o.classList.toggle('on', o === b);
      renderMix();
    });
  }
  $('preset').addEventListener('change', e => {
    const preset = PRESETS[e.target.value];
    state.mix = preset.mix();
    $('presetNote').textContent = preset.note;
    for (const [k, v] of Object.entries(state.mix.spread)) {
      const el = $(`sp${k[0].toUpperCase()}${k.slice(1)}`);
      if (el) { el.value = v; $(`${el.id}Out`).textContent = `${(+v).toFixed(1)}×`; }
    }
    rebuild();
  });
  $('mixEven').addEventListener('click', () => {
    state.mix[state.mixAxis] = flat(state.mixAxis);
    rebuild();
  });
  $('mixReset').addEventListener('click', () => {
    const d = defaultMix();
    state.mix[state.mixAxis] = d[state.mixAxis];
    rebuild();
  });

  // How much individuals differ
  for (const [id, key] of [['spSpeed', 'speed'], ['spInfo', 'info'],
                           ['spRisk', 'risk'], ['spTiming', 'timing']]) {
    const el = $(id), out = $(`${id}Out`);
    out.textContent = `${(+el.value).toFixed(1)}×`;
    el.addEventListener('input', () => { out.textContent = `${(+el.value).toFixed(1)}×`; });
    el.addEventListener('change', () => { state.mix.spread[key] = +el.value; rebuild(); });
  }

  // Weather and time of day apply live — no rebuild, so you can watch fog roll
  // in over a run that is already going.
  for (const [id, key] of [['weather', 'weather'], ['tod', 'tod']]) {
    $(id).addEventListener('change', e => {
      state[key] = e.target.value;
      if (state.sim) state.sim.cfg.env = environment(state.weather, state.tod);
      renderEnv();
      syncUrl();
    });
  }

  $('share').addEventListener('click', async () => {
    syncUrl();
    try {
      await navigator.clipboard.writeText(location.href);
      $('share').textContent = 'Copied';
      setTimeout(() => { $('share').textContent = 'Link'; }, 1400);
    } catch { /* clipboard blocked: the URL bar already has it */ }
  });
  for (const id of ['bld', 'rds', 'dmg', 'trl']) {
    $(id).addEventListener('change', () => draw(lastStats()));
  }
  for (const b of $('tabs').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      state.colourBy = b.dataset.axis;
      for (const o of $('tabs').querySelectorAll('button')) o.classList.toggle('on', o === b);
      draw(lastStats());
    });
  }
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
  const counts = { unaware: 0, seeking: 0, milling: 0, evacuating: 0, returning: 0, done: 0, back: 0 };
  let onMove = 0;
  for (const a of state.agents) {
    counts[a.state]++;
    if (a.state === 'evacuating' || a.state === 'returning' || a.done) onMove++;
  }
  return {
    t, counts,
    moving: counts.evacuating + counts.returning,
    waiting: counts.unaware + counts.seeking + counts.milling,
    evacuated: counts.done, back: counts.back,
    socialProof: onMove / Math.max(state.agents.length, 1),
  };
}

/* ── Population mix editor ───────────────────────────────────────────────── */
//
// The shares are the weakest numbers in the model, so they are the ones you can
// move. Every edit rebalances the rest of its axis to keep the total at 100%,
// marks the axis as custom, and lands in the URL — a configured population is a
// link you can send someone.

function renderMix() {
  const axis = state.mixAxis;
  const table = AXES[axis].table;
  const shares = state.mix[axis];
  const custom = customAxes(state.mix);
  $('mixBadge').hidden = custom.length === 0;

  if (axis === 'cohort' && !shares) {
    // The honest default: the city's own per-zone figures, which no single set
    // of city-wide sliders can represent without losing that resolution.
    $('mixSliders').innerHTML = '';
    $('cohortSource').innerHTML =
      `Using <b>${state.city.real ? 'the published' : 'this city’s'} per-zone cohort figures</b>. ` +
      `Move any slider below to replace them with one city-wide mix.`;
    $('mixSliders').innerHTML = Object.entries(table).map(([k, c]) => {
      const v = impliedCohortShare(k);
      return sliderRow(k, c, v);
    }).join('');
    bindMixRows();
    return;
  }
  $('cohortSource').innerHTML = axis === 'cohort'
    ? 'Replaced the per-zone figures with one city-wide mix. <b>Reset axis</b> restores them.'
    : '';
  $('mixSliders').innerHTML = Object.entries(table)
    .map(([k, c]) => sliderRow(k, c, shares[k] ?? 0)).join('');
  bindMixRows();
}

/** What the published per-zone figures come to across the whole city — shown so
 *  the sliders start from the real number rather than from nothing. */
function impliedCohortShare(key) {
  let tot = 0, hit = 0;
  for (const z of state.pack.zones) {
    const p = z.properties;
    const counts = {
      child: p.children || 0, elderly: p.elderly || 0, disabled: p.disabled || 0,
      adult: Math.max(0, (p.population || 0) - (p.children || 0) - (p.elderly || 0) - (p.disabled || 0)),
    };
    tot += p.population || 0;
    hit += counts[key] || 0;
  }
  return tot ? hit / tot : 0;
}

const sliderRow = (k, c, v) => `
  <div class="mixrow">
    <span class="swatch" style="background:rgb(${c.colour.join(',')})"></span>
    <span class="mlabel">${c.label}</span>
    <span class="mval" data-val="${k}">${Math.round(v * 100)}%</span>
    <input type="range" min="0" max="1" step="0.01" value="${v}" data-mix="${k}">
  </div>`;

function bindMixRows() {
  for (const el of $('mixSliders').querySelectorAll('input[data-mix]')) {
    el.addEventListener('input', () => {
      const axis = state.mixAxis;
      const base = state.mix[axis] || Object.fromEntries(
        Object.keys(AXES[axis].table).map(k => [k, impliedCohortShare(k)]));
      state.mix[axis] = rebalance(base, el.dataset.mix, +el.value);
      renderMix();
    });
    el.addEventListener('change', rebuild);
  }
}

/* ── Conditions ─────────────────────────────────────────────────────────── */

function renderEnv() {
  const env = environment(state.weather, state.tod);
  $('envNote').textContent = env.notes.join(' ');
  const { rows, worst } = describe(env);
  const bar = good => {
    // One bar, read left-to-right as "how much of normal is left".
    const pct = Math.max(0, Math.min(1, good)) * 100;
    const colour = good >= 0.98 ? 'var(--accent)' : good > 0.75 ? '#fbbf24' : '#f87171';
    return `<span class="bar"><i style="width:${pct}%;background:${colour}"></i></span>`;
  };
  $('envEffect').innerHTML =
    rows.map(([name, val, good]) =>
      `<div class="erow"><span class="ename">${name}</span>${bar(good)}<span class="eval">${val}</span></div>`).join('') +
    (worst.length
      ? `<p class="worst">Falls hardest on: ${worst.map(([k, v]) =>
          `${AXES.cohort.table[k].label.toLowerCase()} (${Math.round((v - 1) * 100)}%)`).join(', ')}.</p>`
      : '');
}

/** A run should be reproducible from its link: city, population, mix, weather. */
function syncUrl() {
  const url = new URL(location);
  const p = url.searchParams;
  p.set('city', state.cityId);
  p.set('n', $('size').value);
  p.set('seed', $('seed').value);
  p.set('w', state.weather);
  p.set('tod', state.tod);
  mixToParams(state.mix, p);
  history.replaceState({}, '', url);
}
