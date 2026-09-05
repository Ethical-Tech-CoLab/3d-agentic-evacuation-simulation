// Agentic synthetic population.
//
// Every agent is drawn from a real zone cohort in data/pois.geojson (ETC
// mariupol-evacuation-model, late Mar-Apr 2022): the published population,
// vulnerable, children, elderly and disabled counts for the five emergency
// zones. We never invent the demography — we only expand the published
// aggregates into individuals, then give each individual the behavioural
// attributes the movement model needs.

export const COHORTS = {
  adult:    { label: 'Adult',            baseSpeed: 1.35, colour: [ 96, 165, 250] },
  child:    { label: 'Child (with kin)', baseSpeed: 0.95, colour: [250, 204,  21] },
  elderly:  { label: 'Elderly',          baseSpeed: 0.75, colour: [244, 114, 182] },
  disabled: { label: 'Disabled',         baseSpeed: 0.55, colour: [248, 113, 113] },
};

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

/** Zone features -> cohort weights that preserve the published proportions. */
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
 * Each agent carries:
 *   zone        which published cohort it was drawn from
 *   cohort      adult | child | elderly | disabled
 *   speed       m/s on open ground, cohort mean with individual spread
 *   info        0..1 quality of what it knows about the corridor — drives how
 *               late it leaves and how readily it turns back at a rumour
 *   risk        0..1 willingness to move while the zone is under fire
 *   group       people travelling as one decision unit (a family moves at the
 *               speed of its slowest member)
 *   departure   seconds after the corridor opens that it actually sets off
 *   origin      jittered start point inside its zone radius
 */
export function buildPopulation({ zones, size, seed = 20220316, infoQuality = 0.6,
                                  departureSpread = 5400 }) {
  const r = rng(seed);
  const totals = zones.map(zoneCohorts);
  const zoneTotals = totals.map(t => t.adult + t.child + t.elderly + t.disabled);
  const grand = zoneTotals.reduce((a, b) => a + b, 0);
  const agents = [];

  for (let i = 0; i < size; i++) {
    // Sample the zone proportionally to its published exposed population.
    let x = r() * grand, zi = 0;
    while (zi < zoneTotals.length - 1 && (x -= zoneTotals[zi]) > 0) zi++;
    const zone = zones[zi];
    const cohort = pickCohort(totals[zi], zoneTotals[zi], r);

    const info = Math.min(1, Math.max(0, gauss(r, infoQuality, 0.18)));
    const risk = Math.min(1, Math.max(0, gauss(r, 0.5, 0.2)));
    // Poor information and low risk tolerance both delay departure; heavy
    // damage in the home zone pushes the other way (nothing left to stay for).
    const damagePush = (zone.properties.damage_pct || 0) / 100;
    const delay = departureSpread * (1 - info) * (1 - 0.5 * risk) * (1 - 0.4 * damagePush);

    const group = cohort === 'child' ? 1 : (r() < 0.42 ? 2 + Math.floor(r() * 3) : 1);
    const rad = (zone.properties.radius || 180) / 111320; // metres -> deg, near enough at 47N
    const a = r() * 2 * Math.PI, d = Math.sqrt(r()) * rad;
    const [lon, lat] = zone.geometry.coordinates;

    agents.push({
      id: i,
      zone: zone.properties.zone_id,
      cohort,
      speed: Math.max(0.25, gauss(r, COHORTS[cohort].baseSpeed, 0.12)),
      info, risk, group,
      departure: Math.max(0, gauss(r, delay, departureSpread * 0.12)),
      origin: [lon + (d * Math.cos(a)) / Math.cos((lat * Math.PI) / 180), lat + d * Math.sin(a)],
      // Runtime state, reset by the engine.
      dist: 0, done: false, stalled: 0, turnedBack: false, exitTime: null,
    });
  }
  return agents;
}

export function summarise(agents) {
  const by = {};
  for (const a of agents) by[a.cohort] = (by[a.cohort] || 0) + 1;
  return by;
}
