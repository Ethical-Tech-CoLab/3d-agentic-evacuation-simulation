// Agentic synthetic population.
//
// Every agent is drawn from a published zone cohort. We never invent the
// demography — we expand the published aggregates into individuals, then give
// each individual the three things the movement model needs and the aggregates
// cannot supply: who it is, who it is travelling with, and how it behaves when
// it is told to leave.
//
// The three classifications are independent axes, and it matters that they are:
// an elderly person travelling alone and an elderly person inside a family that
// is waiting for a son to come home are the same row in a census and completely
// different evacuation outcomes.

/* ── 1. Who they are ─────────────────────────────────────────────────────── */

export const COHORTS = {
  adult:    { label: 'Adult',    baseSpeed: 1.35, colour: [ 96, 165, 250] },
  child:    { label: 'Child',    baseSpeed: 0.95, colour: [250, 204,  21] },
  elderly:  { label: 'Elderly',  baseSpeed: 0.75, colour: [244, 114, 182] },
  disabled: { label: 'Disabled', baseSpeed: 0.55, colour: [248, 113, 113] },
};

/* ── 2. Who they travel with ─────────────────────────────────────────────── */
//
// The travel unit is the decision unit. It is what actually moves, and it moves
// at the pace of its slowest member — which is why a city's vulnerable people
// slow down far more of the population than their own headcount suggests.

export const TRAVEL_UNITS = {
  solo: {
    label: 'Alone',
    share: 0.28,
    size: () => 1,
    pace: 1.0,
    // Nobody to wait for, nobody to carry: fastest, and the first to leave.
    millingScale: 0.7,
    colour: [148, 163, 184],
  },
  family: {
    label: 'Family',
    share: 0.44,
    size: r => 2 + Math.floor(r() * 4),          // 2–5
    pace: 0.80,
    // A family will not leave until it is whole. This is the single largest
    // source of delay in the evacuation literature and it is modelled here as
    // a longer milling phase, not as a slower walk.
    millingScale: 1.9,
    colour: [250, 204, 21],
  },
  group: {
    label: 'Ad-hoc group',
    share: 0.20,
    size: r => 3 + Math.floor(r() * 8),          // 3–10, formed on the street
    pace: 0.86,
    // Groups form out of people already moving, so they mill less — but they
    // are the strongest transmitters of whatever route the crowd is taking.
    millingScale: 0.8,
    colour: [56, 189, 248],
  },
  institutional: {
    label: 'Institutional',
    share: 0.08,
    size: r => 12 + Math.floor(r() * 28),        // a ward, a home, a coach
    pace: 0.55,
    // A care home or a hospital ward cannot self-evacuate: it waits for
    // transport that may not come. The longest milling of any unit.
    millingScale: 3.2,
    colour: [167, 139, 250],
  },
};

/* ── 3. How they behave ──────────────────────────────────────────────────── */
//
// Behaviour is the axis the census never records and the one that decides who
// is still inside when the route closes. The lifecycle these drive —
// UNAWARE → SEEKING → MILLING → EVACUATING → DONE — is the same vocabulary the
// CoLab's Evacuation Behavior Simulator uses, deliberately.

export const BEHAVIOURS = {
  prompt: {
    label: 'Prompt',
    share: 0.24,
    // Acts on the first warning it believes.
    seek: 0.3, mill: 0.4, reluctance: 0.0, returns: 0.02,
    colour: [74, 222, 128],
  },
  seeker: {
    label: 'Information-seeker',
    share: 0.30,
    // Will not move until it has confirmed the warning from another source.
    // Good information makes this fast; bad information makes it endless.
    seek: 2.2, mill: 0.9, reluctance: 0.05, returns: 0.05,
    colour: [56, 189, 248],
  },
  milling: {
    label: 'Wait-and-see',
    share: 0.26,
    // Watches the neighbours. Leaves when enough others have left — which
    // means a whole district can sit still and then move at once.
    seek: 0.8, mill: 2.6, reluctance: 0.10, returns: 0.06,
    colour: [251, 191, 36],
  },
  reluctant: {
    label: 'Reluctant to leave',
    share: 0.13,
    // Will not go while it judges staying survivable: property, animals, an
    // immobile relative, or simple disbelief. Only rising danger moves them.
    seek: 1.0, mill: 2.0, reluctance: 0.72, returns: 0.04,
    colour: [248, 113, 113],
  },
  returner: {
    label: 'Returner',
    share: 0.07,
    // Leaves, then goes back — for a person, a document, an animal. Costs the
    // agent its head start and puts it back into the hazard.
    seek: 0.6, mill: 0.8, reluctance: 0.02, returns: 0.85,
    colour: [244, 114, 182],
  },
};

/* ── Sampling ────────────────────────────────────────────────────────────── */

// Deterministic PRNG so a seed reproduces a run exactly.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

const gauss = (r, mean, sd) => {
  const u = Math.max(r(), 1e-9), v = r();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

/** Draw a key from a {key: share} map. Shares are assumed to sum to 1; any
 *  rounding shortfall lands on the last key, which is harmless. */
const pickShare = (shares, r) => {
  let x = r();
  const keys = Object.keys(shares);
  for (const k of keys) { x -= shares[k]; if (x <= 0) return k; }
  return keys[keys.length - 1];
};

/** Zone feature -> cohort counts that preserve the published proportions. */
export function zoneCohorts(zone) {
  const p = zone.properties;
  const child = p.children || 0, elderly = p.elderly || 0, disabled = p.disabled || 0;
  const adult = Math.max(0, (p.population || 0) - child - elderly - disabled);
  return { adult, child, elderly, disabled };
}

function pickCohort(weights, total, r) {
  let x = r() * total;
  for (const k of Object.keys(weights)) { x -= weights[k]; if (x <= 0) return k; }
  return 'adult';
}

/**
 * Expand the zone aggregates into `size` agents.
 *
 * The cohort mix is the published one. The travel-unit and behaviour mixes are
 * modelled — they come from the evacuation-behaviour literature, not from any
 * survey of these cities, and the app says so wherever it shows them.
 */
export function buildPopulation({ zones, size, seed = 20220316, infoQuality = 0.6,
                                  warningSpread = 5400, mix = null, homes = null }) {
  const r = rng(seed);
  const m = mix || {
    cohort: null,
    unit: Object.fromEntries(Object.entries(TRAVEL_UNITS).map(([k, v]) => [k, v.share])),
    behaviour: Object.fromEntries(Object.entries(BEHAVIOURS).map(([k, v]) => [k, v.share])),
    spread: { speed: 1, info: 1, risk: 1, timing: 1 },
  };
  const sp = m.spread || { speed: 1, info: 1, risk: 1, timing: 1 };

  const totals = zones.map(zoneCohorts);
  const zoneTotals = totals.map(t => t.adult + t.child + t.elderly + t.disabled);
  const grand = zoneTotals.reduce((a, b) => a + b, 0);
  const agents = [];

  for (let i = 0; i < size; i++) {
    let x = r() * grand, zi = 0;
    while (zi < zoneTotals.length - 1 && (x -= zoneTotals[zi]) > 0) zi++;
    const zone = zones[zi];
    // With no cohort override the split is the zone's own published one, which
    // differs zone to zone. An override replaces it with a single city-wide
    // mix — a deliberate loss of resolution, and the app labels it as such.
    const cohort = m.cohort ? pickShare(m.cohort, r)
                            : pickCohort(totals[zi], zoneTotals[zi], r);

    // A child is never alone and rarely in an ad-hoc group; someone in
    // institutional care is disproportionately elderly or disabled.
    let unitKey = pickShare(m.unit, r);
    if (cohort === 'child' && (unitKey === 'solo' || unitKey === 'group')) unitKey = 'family';
    if (unitKey === 'institutional' && cohort === 'adult' && r() < 0.6) unitKey = 'family';
    const unit = TRAVEL_UNITS[unitKey];

    const behaviourKey = pickShare(m.behaviour, r);
    const behaviour = BEHAVIOURS[behaviourKey];

    // The spread multipliers say how much individuals differ from their group's
    // mean. At 0 every member of a cohort is identical — a useful control run
    // and a terrible model of a city.
    const info = Math.min(1, Math.max(0, gauss(r, infoQuality, 0.18 * sp.info)));
    const risk = Math.min(1, Math.max(0, gauss(r, 0.5, 0.2 * sp.risk)));

    // Walking speed: the individual's own pace, dragged to the unit's pace.
    const own = Math.max(0.25, gauss(r, COHORTS[cohort].baseSpeed, 0.12 * sp.speed));
    const speed = own * unit.pace;

    // A warning does not reach everyone at once. Better-informed agents hear
    // it sooner; this is the only thing that happens before the lifecycle.
    const warnedAt = Math.max(0, gauss(r, warningSpread * (1 - info) * 0.55,
                                       warningSpread * 0.15 * sp.timing));

    agents.push({
      id: i,
      zone: zone.properties.zone_id,
      cohort, unit: unitKey, behaviour: behaviourKey,
      speed, ownSpeed: own,
      group: unit.size(r),
      info, risk,
      warnedAt,
      // How long this agent spends confirming the warning, and then waiting on
      // its unit and its neighbours. Both are scaled by who it travels with.
      seekFor: Math.max(0, gauss(r, behaviour.seek * 900, behaviour.seek * 260 * sp.timing)),
      millFor: Math.max(0, gauss(r, behaviour.mill * 900 * unit.millingScale,
                                 behaviour.mill * 300 * sp.timing)),
      // Threshold of danger above which a reluctant agent finally moves.
      reluctance: behaviour.reluctance * (1 - 0.4 * risk),
      // Probability this agent turns back once, mid-route.
      returnChance: behaviour.returns,
      origin: originIn(zone, r, homes),
      // Runtime state, reset by the engine.
      state: 'unaware', dist: 0, done: false, turnedBack: false,
      route: null, path: null, exitTime: null, doneAt: null, stalled: 0, returnedAt: null,
    });
  }
  return agents;
}

/**
 * Where an agent starts. People start in buildings, so we sample a real OSM
 * building centroid from inside the zone — which also means nobody starts in
 * the river, the way a jittered circle around a waterfront zone will happily
 * put them.
 */
function originIn(zone, r, homes) {
  const list = homes && homes[zone.properties.zone_id];
  if (list && list.length) {
    const b = list[Math.floor(r() * list.length)];
    // A few metres of jitter so a block of flats is not a single point.
    return [b[0] + (r() - 0.5) * 0.0004, b[1] + (r() - 0.5) * 0.0003];
  }
  // Fallback only: a city pack with no building list.
  const rad = (zone.properties.radius || 180) / 111320;
  const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * rad;
  const [lon, lat] = zone.geometry.coordinates;
  return [lon + (d * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + d * Math.sin(a)];
}

/** Counts by any classification axis, for the console readouts. */
export function tally(agents, key) {
  const out = {};
  for (const a of agents) {
    const b = (out[a[key]] ??= { n: 0, out: 0, stuck: 0 });
    b.n++;
    if (a.done) b.out++;
    else if (a.state === 'unaware' || a.state === 'seeking' || a.state === 'milling') b.stuck++;
  }
  return out;
}
