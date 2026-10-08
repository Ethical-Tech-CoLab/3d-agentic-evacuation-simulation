// Wiring: pick a city, build a population, run the clock, redraw.

import { buildPopulation, tally, scaleOf, individualLegend,
         COHORTS, TRAVEL_UNITS, BEHAVIOURS } from './population.js';
import { prepareRoutes, buildEntries, createSim, positions, pointAt, STATE_LABEL, indexApproaches } from './engine.js';
import { BASEMAPS, baseLayers, agentLayers, makeHeight, MODE_LABEL } from './map.js';
import { CITIES, byId, loadCity, isKnown } from './cities.js';
import { AXES, PRESETS, defaultMix, flat, rebalance, mixToParams, mixFromParams, customAxes }
  from './mix.js';
import { WEATHER, TIME_OF_DAY, environment, describe } from './conditions.js';

const $ = id => document.getElementById(id);
const fmt = n => n.toLocaleString('en-US');

const params = new URLSearchParams(location.search);

const state = {
  cityId: isKnown(params.get('city')) ? params.get('city') : 'mariupol',
  mix: mixFromParams(params),
  mixAxis: 'cohort',
  weather: params.get('w') || 'clear',
  basemap: BASEMAPS[params.get('map')] ? params.get('map') : 'dark',
  tod: params.get('tod') || 'day',
  city: null, pack: null, height: null,
  agents: [], routes: [], sim: null,
  running: false, trails: [], last: 0, colourBy: 'individual',
};

const initial = byId(state.cityId).view;
const map = new maplibregl.Map({
  container: 'map', style: BASEMAPS[state.basemap].style,
  center: [initial.longitude, initial.latitude],
  zoom: initial.zoom, pitch: initial.pitch, bearing: initial.bearing,
  antialias: true,
  // Let the camera lie almost flat, so a skyline can be seen along a street
  // rather than only from above.
  maxPitch: 85,
});
// Rotation is on by default in MapLibre but hidden behind a right-drag that
// nobody discovers, so it is also on the keyboard and in the console.
map.dragRotate.enable();
map.touchZoomRotate.enableRotation();
map.keyboard.enable();
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

/** Turn the camera by `deg`, the short way round, and keep going past north. */
function spin(deg) {
  map.easeTo({ bearing: map.getBearing() + deg, duration: 420 });
}

// A slow continuous orbit, for looking at a run rather than driving it.
let orbit = null;
function toggleOrbit(on) {
  if (orbit) { cancelAnimationFrame(orbit); orbit = null; }
  if (!on) return;
  let last = performance.now();
  const step = now => {
    const dt = (now - last) / 1000; last = now;
    map.setBearing(map.getBearing() + dt * 6);   // 6 degrees a second: one turn a minute
    orbit = requestAnimationFrame(step);
  };
  orbit = requestAnimationFrame(step);
}

// Any manual camera input stops the orbit rather than fighting it.
for (const ev of ['mousedown', 'touchstart', 'wheel']) {
  map.getCanvas().addEventListener(ev, () => {
    if (orbit) { toggleOrbit(false); const b = $('orbit'); if (b) b.classList.remove('on'); }
  }, { passive: true });
}

// Replacing a MapLibre style tears down the WebGL context the deck overlay was
// built against, so the overlay cannot simply be re-added — it has to be a new
// one. Hence a mutable handle rather than a const.
let overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
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
  if (params.get('shut')) $('shut').value = params.get('shut');
  $('presetNote').textContent = PRESETS.source.note;
  for (const o of $('basemap').querySelectorAll('button')) o.classList.toggle('on', o.dataset.map === state.basemap);
  $('mapNote').textContent = BASEMAPS[state.basemap].note;
  $('mapCredit').innerHTML = BASEMAPS[state.basemap].credit;
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
  const c = state.pack.meta.counts;
  const realH = c.buildingsWithRealHeight ?? 0;
  const pctH = Math.round((realH / Math.max(c.buildings, 1)) * 100);
  $('cityHazard').innerHTML =
    `${state.city.sub} · <span class="muted">${c.exposed.toLocaleString()} exposed · ` +
    `${c.routes} routes · ${fmt(c.buildings)} buildings, ` +
    `<b title="The rest are given a low synthetic massing, tinted blue">${pctH}% at their real height</b></span>`;
  $('cityNote').textContent = state.pack.meta.note;
  if ($('preset').value === 'source') setSourceNote();
  // Damage only exists for Mariupol; hide the toggle where it means nothing.
  $('dmg').closest('label').style.display = state.pack.damage.length ? '' : 'none';
  // Transit controls likewise: only where the pack has stations and a transit exit.
  const hasTransit = state.pack.routes.some(f => f.properties.transit);
  $('shutRow').style.display = hasTransit ? '' : 'none';
  $('trnRow').style.display = state.pack.transit.length ? '' : 'none';

  const v = state.city.view;
  map.flyTo({ center: [v.longitude, v.latitude], zoom: v.zoom,
              pitch: v.pitch, bearing: v.bearing, duration: 1200 });

  const url = new URL(location);
  url.searchParams.set('city', id);
  history.replaceState({}, '', url);

  rebuild();
}

/** The "As sourced" preset means something different in each city, so it
 *  describes the city's own demographic source rather than a fixed sentence. */
function setSourceNote() {
  const d = (state.pack && state.pack.meta.demography) || {};
  $('presetNote').textContent = d.source
    ? `Cohorts: ${d.source}${d.geography ? ' — ' + d.geography : ''}.`
    : 'Cohorts from the city’s own figures.';
}

function readOpts() {
  return {
    size: +$('size').value,
    infoQuality: +$('info').value,
    warningSpread: +$('spread').value * 60,
    seed: +$('seed').value,
    routeCapacity: +$('cap').value,
    hazard: +$('haz').value,
    transitShutdown: +$('shut').value >= 24 ? Infinity : +$('shut').value,
    herd: +$('herd').value,
    approaches: state.approaches,
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
  state.approaches = indexApproaches(state.pack.approaches);
  buildEntries(state.agents, state.routes, o.seed, state.approaches);
  state.sim = createSim(state.agents, state.routes, { ...o, approaches: state.approaches });
  state.trails = [];
  renderRouteList();
  renderMix();
  renderEnv();
  syncUrl();
  draw(emptyStats());
}

const emptyStats = () => {
  const people = state.agents.length ? scaleOf(state.agents).people : 0;
  return {
    t: 0, moving: 0, waiting: people, evacuated: 0, filtered: 0, back: 0,
    crawling: 0, socialProof: 0, people,
    counts: { unaware: people, seeking: 0, milling: 0, stayed: 0, evacuating: 0,
              returning: 0, done: 0, filtered: 0, back: 0 },
  };
};

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
  const live = positions(state.agents);
  overlay.setProps({
    layers: [
      ...baseLayers(deck, {
        city: state.city,
        zones: state.pack.zones,
        routes: state.routes,
        damage: state.pack.damage,
        buildings: state.pack.buildings,
        roads: state.pack.roads,
        transit: state.pack.transit,
        height: state.height,
        show: { buildings: $('bld').checked, roads: $('rds').checked,
                damage: $('dmg').checked, transit: $('trn').checked },
        ground: BASEMAPS[state.basemap].ground,
      }),
      ...agentLayers(deck, {
        live,
        trails: state.trails.filter(t => t.colour),
        showTrails: $('trl').checked,
        time: s.t,
        colourBy: state.colourBy,
        ground: BASEMAPS[state.basemap].ground,
      }),
    ],
  });
  renderStats(s);
}

// Everything shown here is in PEOPLE — sums of household weights. The number
// of simulated households is a resolution setting and is reported separately,
// so it can never be mistaken for the size of the population.
function renderStats(s) {
  const h = Math.floor(s.t / 3600), m = Math.floor((s.t % 3600) / 60);
  $('clock').textContent = `T+${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const n = s.people || 1;
  const pct = x => `${((x / n) * 100).toFixed(1)}%`;
  const round = x => fmt(Math.round(x));

  // Clearance is measured on when someone actually reached safety — not when
  // they left the district, which flatters anyone who turned back.
  const times = state.agents.filter(a => a.state === 'done').map(a => a.doneAt).sort((a, b) => a - b);
  const q = p => (times.length ? `${(times[Math.floor(times.length * p)] / 3600).toFixed(1)} h` : '—');
  const inside = s.counts.unaware + s.counts.seeking + s.counts.milling + s.counts.stayed;

  $('stats').innerHTML = `
    <div><b>${round(s.evacuated)}</b><span>reached safety (${pct(s.evacuated)})</span></div>
    <div><b>${round(s.moving)}</b><span>on a route</span></div>
    <div><b>${round(inside)}</b><span>still inside</span></div>
    <div class="${s.filtered > 0 ? 'warn' : ''}"><b>${round(s.filtered)}</b><span>left, not to safety</span></div>
    <div><b>${q(0.5)} / ${q(0.9)}</b><span>50th / 90th clearance</span></div>
    <div class="${s.crawling > 0 ? 'warn' : ''}"><b>${round(s.crawling || 0)}</b><span>reduced to a shuffle</span></div>` +
    (state.routes.some(r => r.transit) ? `
    <div><b>${round(s.transitOut || 0)}</b><span>out by train or boat</span></div>
    <div class="${s.turnedAway > 0 ? 'warn' : ''}"><b>${round(s.turnedAway || 0)}</b><span>found the station shut</span></div>` : '');

  $('lifecycle').innerHTML = ['unaware', 'seeking', 'milling', 'stayed', 'evacuating',
                              'returning', 'done', 'filtered', 'back']
    .filter(k => (s.counts[k] || 0) > 0 || ['unaware', 'seeking', 'milling', 'evacuating', 'done'].includes(k))
    .map(k => {
      const v = s.counts[k] || 0;
      const w = (v / n) * 100;
      const tone = k === 'filtered' || k === 'back' ? '#f87171'
                 : k === 'stayed' ? '#fbbf24' : 'var(--accent)';
      return `<div class="life"><span class="lname">${STATE_LABEL[k]}</span>
        <span class="bar"><i style="width:${w}%;background:${tone}"></i></span>
        <span class="pctv">${round(v)}</span></div>`;
    }).join('');

  renderBreakdown();
  renderRouteStats();
}

function renderBreakdown() {
  const axis = state.colourBy;

  // Each household its own colour: there is nothing to tally, so the panel
  // explains the encoding instead, using real households from this run.
  if (axis === 'individual') {
    $('breakdown').innerHTML =
      `<p class="note enc">Every household has its own colour.
        <b>Hue</b> is behaviour, nudged by cohort · <b>washed out</b> means badly
        informed · <b>dark</b> means slow · <b>size</b> is headcount.</p>` +
      individualLegend(state.agents).map(l => `<div class="cohort">
        <span class="swatch" style="background:rgb(${l.colour.join(',')})"></span>
        <span class="name" style="grid-column: 2 / span 3">${l.label}</span>
      </div>`).join('');
    return;
  }
  if (axis === 'route') {
    const total = state.routes.reduce((a, r) => a + r.taken, 0) || 1;
    $('breakdown').innerHTML = state.routes.map(r => {
      const w = (r.taken / total) * 100;
      return `<div class="cohort">
        <span class="swatch" style="background:rgb(${r.colour.join(',')})"></span>
        <span class="name" title="${r.note}">${r.safe ? '' : '⚠ '}${r.name}</span>
        <span class="bar"><i style="width:${w}%;background:rgb(${r.colour.join(',')})"></i></span>
        <span class="pctv">${fmt(Math.round(r.taken))}</span></div>`;
    }).join('');
    return;
  }
  const table = { cohort: COHORTS, unit: TRAVEL_UNITS, behaviour: BEHAVIOURS }[axis];
  const counts = tally(state.agents, axis);
  $('breakdown').innerHTML = Object.entries(table).map(([k, c]) => {
    const d = counts[k] || { n: 0, out: 0 };
    const w = d.n ? (d.out / d.n) * 100 : 0;   // share of this group that is out
    return `<div class="cohort">
      <span class="swatch" style="background:rgb(${c.colour.join(',')})"></span>
      <span class="name">${c.label}</span>
      <span class="bar"><i style="width:${w}%;background:rgb(${c.colour.join(',')})"></i></span>
      <span class="pctv">${w.toFixed(0)}%</span></div>`;
  }).join('');
}

function renderRouteList() {
  $('routeList').innerHTML = state.routes.map(r => `
    <button class="route ${r.open ? '' : 'closed'} ${r.safe ? '' : 'unsafe'} ${r.transit ? 'transit' : ''}"
            data-route="${r.id}" title="${r.note}${r.transit ? ` · ${r.lines} · boards ${r.baseCapacity}/min (modelled)` : ''}">
      <span class="swatch" style="background:rgb(${r.colour.join(',')})"></span>
      <span class="rname">${r.transit ? `<span class="mode ${r.mode}">${MODE_LABEL[r.mode]}</span>` : ''}${r.safe ? '' : '⚠ '}${r.name}<span class="why" data-why="${r.id}"></span></span>
      <span class="rlen">${(r.lengthM / 1000).toFixed(1)} km</span>
      <span class="rtaken" data-taken="${r.id}">0</span>
    </button>`).join('');
  for (const b of $('routeList').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const r = state.routes.find(x => x.id === b.dataset.route);
      r.open = !r.open;
      r.live = r.open && !r.suspended;
      b.classList.toggle('closed', !r.open);
      if (!state.running) draw(state.last_stats || emptyStats());
    });
  }
}

function renderRouteStats() {
  for (const r of state.routes) {
    const el = $('routeList').querySelector(`[data-taken="${r.id}"]`);
    if (el) {
      el.textContent = fmt(Math.round(r.taken));
      // A route that is jamming should say so while it is happening.
      el.style.color = r.flowFactor < 0.6 ? '#f87171'
                     : r.flowFactor < 0.9 ? '#fbbf24' : '';
    }
    if (r.transit) {
      const btn = $('routeList').querySelector(`[data-route="${r.id}"]`);
      const why = $('routeList').querySelector(`[data-why="${r.id}"]`);
      if (btn) btn.classList.toggle('suspended', !!r.suspended);
      if (why) why.textContent = r.why === 'weather' ? '· suspended' : r.why === 'shutdown' ? '· shut down' : '';
    }
  }
}

function loop(now) {
  requestAnimationFrame(loop);
  const dtReal = Math.min((now - state.last) / 1000, 0.1);
  state.last = now;
  if (!state.running || !state.sim) return;
  const s = state.sim.tick(dtReal * state.sim.cfg.timeScale);
  state.last_stats = s;
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
    shut: v => (+v >= 24 ? 'weather only' : `T+${Number(v).toFixed(+v % 1 ? 1 : 0)} h`),
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
      if (['cap', 'haz', 'shut', 'herd', 'ts'].includes(id) && state.sim) Object.assign(state.sim.cfg, readOpts());
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
    if (e.target.value === 'source') setSourceNote();
    else $('presetNote').textContent = preset.note;
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

  // Switching basemap replaces the MapLibre style, which discards any custom
  // layers with it — so the deck overlay has to be put back once the new style
  // has loaded, or the agents vanish.
  for (const b of $('basemap').querySelectorAll('button')) {
    b.addEventListener('click', () => {
      const key = b.dataset.map;
      if (key === state.basemap) return;
      state.basemap = key;
      for (const o of $('basemap').querySelectorAll('button')) o.classList.toggle('on', o === b);
      $('mapNote').textContent = BASEMAPS[key].note;
      $('mapCredit').innerHTML = BASEMAPS[key].credit;
      try { map.removeControl(overlay); } catch { /* not attached */ }
      map.once('styledata', () => {
        overlay = new deck.MapboxOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay);
        draw(lastStats());
      });
      map.setStyle(BASEMAPS[key].style);
      syncUrl();
    });
  }

  $('rotL').addEventListener('click', () => spin(-45));
  $('rotR').addEventListener('click', () => spin(45));
  $('north').addEventListener('click', () => map.easeTo({ bearing: 0, duration: 500 }));
  $('orbit').addEventListener('click', e => {
    const on = !e.currentTarget.classList.contains('on');
    e.currentTarget.classList.toggle('on', on);
    toggleOrbit(on);
  });
  $('flat').addEventListener('click', () => {
    // Toggle between looking down and looking along the street.
    const steep = map.getPitch() > 70;
    map.easeTo({ pitch: steep ? 55 : 82, duration: 600 });
  });
  window.addEventListener('keydown', e => {
    if (e.target.matches('input, select, textarea')) return;
    if (e.key === 'q' || e.key === 'Q') spin(-15);
    if (e.key === 'e' || e.key === 'E') spin(15);
  });

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
  const counts = { unaware: 0, seeking: 0, milling: 0, stayed: 0, evacuating: 0,
                   returning: 0, done: 0, filtered: 0, back: 0 };
  let onMove = 0, people = 0;
  for (const a of state.agents) {
    counts[a.state] += a.weight;
    people += a.weight;
    if (a.state === 'evacuating' || a.state === 'returning' || a.done) onMove += a.weight;
  }
  return {
    t, counts, people,
    moving: counts.evacuating + counts.returning,
    waiting: counts.unaware + counts.seeking + counts.milling + counts.stayed,
    evacuated: counts.done, filtered: counts.filtered, back: counts.back,
    crawling: 0,
    socialProof: onMove / Math.max(people, 1),
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
    const dem = state.pack.meta.demography || {};
    $('cohortSource').innerHTML =
      `<b>Real cohort figures.</b> ${dem.source || 'City figures'}` +
      (dem.geography ? ` — ${dem.geography}.` : '.') +
      (dem.note ? ` <span class="muted">${dem.note}</span>` : '') +
      (dem.caveat ? ` <span class="warnText">${dem.caveat}</span>` : '') +
      ` Move any slider to replace them with a mix of your own.`;
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
  const modes = new Set((state.routes || []).filter(r => r.transit).map(r => r.mode));
  const { rows, worst } = describe(env, modes);
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
  p.set('map', state.basemap);
  p.set('tod', state.tod);
  if ($('shutRow').style.display !== 'none') p.set('shut', $('shut').value); else p.delete('shut');
  mixToParams(state.mix, p);
  history.replaceState({}, '', url);
}
