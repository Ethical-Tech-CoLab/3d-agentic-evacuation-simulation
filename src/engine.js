// Movement engine.
//
// Structurally this is the upstream Race Condition marathon loop: N agents on a
// shared spline, each with its own pace, advanced by a fixed tick, with the
// leaders pulling away and the field stretching behind them. What changes is
// what slows an agent down. A marathon runner is slowed by fatigue; an evacuee
// is slowed by congestion at the corridor mouth, by hazard along the route, and
// by not knowing whether the corridor is open at all.

import { COHORTS } from './population.js';

const R = 6371000;
const toRad = d => (d * Math.PI) / 180;

export function haversine([lon1, lat1], [lon2, lat2]) {
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Cumulative-length polyline you can sample by metres travelled. */
export function measurePath(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  return { coords, cum, length: cum[cum.length - 1] };
}

export function pointAt(path, dist) {
  const { coords, cum, length } = path;
  const d = Math.min(Math.max(dist, 0), length);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-6);
  const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
  return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
}

/**
 * Each agent walks its own path: origin inside its zone -> EXIT WEST -> the
 * negotiated corridor. Built once per population, since the origin is fixed.
 */
export function buildPaths(agents, exitPoint, corridor) {
  for (const a of agents) a.path = measurePath([a.origin, exitPoint, ...corridor.slice(1)]);
}

export const DEFAULTS = {
  corridorCapacity: 900,   // people/minute the corridor mouth can absorb
  hazard: 0.35,            // 0..1 shelling intensity along the in-city leg
  corridorOpen: true,      // a closed corridor turns agents back at the mouth
  timeScale: 60,           // simulated seconds per real second
};

export function createSim(agents, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  let t = 0;

  // Where the in-city leg ends and the corridor proper begins, per agent: the
  // second vertex of its path (EXIT WEST).
  for (const a of agents) a.exitDist = a.path.cum[1];

  function tick(dt) {
    t += dt;
    // Congestion is a shared, emergent quantity: how many agents are queued in
    // the last 300 m before the exit right now.
    let atMouth = 0;
    for (const a of agents) {
      if (!a.done && !a.turnedBack && a.dist > 0 && a.dist < a.exitDist && a.exitDist - a.dist < 300) atMouth++;
    }
    const throughput = cfg.corridorCapacity / 60; // people/second
    const congestion = atMouth > 0 ? Math.min(1, atMouth / Math.max(throughput * 60, 1)) : 0;

    let moving = 0, waiting = 0, evacuated = 0, back = 0;
    for (const a of agents) {
      if (a.done) { evacuated++; continue; }
      if (a.turnedBack) { back++; continue; }
      if (t < a.departure) { waiting++; continue; }

      const inCity = a.dist < a.exitDist;
      // A group moves at the pace of its slowest member.
      let v = a.speed * (a.group > 1 ? 0.82 : 1);
      if (inCity) {
        // Hazard costs time: taking cover, backtracking around a struck block.
        v *= 1 - cfg.hazard * (1 - 0.4 * a.risk) * 0.6;
        // Queue pressure only bites near the mouth.
        if (a.exitDist - a.dist < 300) v *= 1 - 0.85 * congestion;
      } else {
        v *= 0.92; // column pace on the open road
      }
      if (v < 0.05) { a.stalled += dt; waiting++; continue; }

      const wasInCity = inCity;
      a.dist += v * dt;
      if (wasInCity && a.dist >= a.exitDist) {
        if (!cfg.corridorOpen && a.info < 0.7) { a.turnedBack = true; back++; continue; }
        a.exitTime = t;
      }
      if (a.dist >= a.path.length) { a.dist = a.path.length; a.done = true; a.exitTime ??= t; evacuated++; }
      else moving++;
    }
    return { t, moving, waiting, evacuated, back, congestion, atMouth };
  }

  function reset() {
    t = 0;
    for (const a of agents) { a.dist = 0; a.done = false; a.turnedBack = false; a.stalled = 0; a.exitTime = null; }
  }

  return { tick, reset, cfg, get time() { return t; } };
}

/** Live positions for rendering. */
export function positions(agents, t) {
  const out = [];
  for (const a of agents) {
    if (t < a.departure || a.turnedBack) continue;
    out.push({
      position: pointAt(a.path, a.dist),
      colour: COHORTS[a.cohort].colour,
      cohort: a.cohort, zone: a.zone, group: a.group, done: a.done,
    });
  }
  return out;
}
