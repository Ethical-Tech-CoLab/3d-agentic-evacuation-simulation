// Movement engine.
//
// Structurally this is the upstream Race Condition marathon loop: N agents on a
// shared spline, each with its own pace, advanced by a fixed tick, with the
// leaders pulling away and the field stretching out behind them. Two things
// change once it is an evacuation rather than a race.
//
// First, what slows an agent down. A runner is slowed by fatigue; an evacuee is
// slowed by congestion where the crowd funnels onto a route, by hazard on the
// leg out of the district, and by not knowing whether the way out is open.
//
// Second, there is more than one course. Every city carries four or more real
// evacuation routes — Dijkstra paths over its actual OpenStreetMap road graph —
// and each agent has to choose one. That choice, made on imperfect information,
// is most of what the model is about: a route is only fast until everyone
// picks it.

import { COHORTS, TRAVEL_UNITS, BEHAVIOURS, rng } from './population.js';

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

/** Prepare each route once: measured geometry, capacity, live occupancy. */
export function prepareRoutes(features, capacityPerMin) {
  return features.map((f, i) => ({
    id: f.properties.route_id || `R${i + 1}`,
    name: f.properties.name,
    note: f.properties.note,
    coords: f.geometry.coordinates,
    path: measurePath(f.geometry.coordinates),
    lengthM: f.properties.length_m,
    colour: ROUTE_COLOURS[i % ROUTE_COLOURS.length],
    capacity: capacityPerMin,   // people/minute the route can absorb at its mouth
    open: true,
    queued: 0,                  // agents currently inside the entry band
    taken: 0,                   // agents that chose it
    out: 0,                     // agents that finished on it
  }));
}

export const ROUTE_COLOURS = [
  [74, 222, 128], [56, 189, 248], [251, 191, 36], [244, 114, 182], [167, 139, 250],
];

/**
 * Where an agent joins a route: the nearest vertex, and the walk to reach it.
 * Joining at your nearest point rather than at the route's head is what makes
 * route choice a real trade-off — the shortest route is often not the closest.
 */
function entryFor(origin, route) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < route.coords.length; i++) {
    const d = haversine(origin, route.coords[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return { index: best, walk: bd, remaining: route.path.length - route.path.cum[best] };
}

/**
 * Route choice. An agent estimates the time each route will cost it and takes
 * the cheapest — but it estimates with the information it has.
 *
 * A well-informed agent sees current queueing and the true remaining distance.
 * A poorly-informed one mostly sees what is nearest, and follows the crowd,
 * which is exactly how a route that is already overloaded keeps attracting
 * people. `herd` is how strongly the crowd pulls; it is what turns four
 * adequate routes into one jammed one.
 */
export function chooseRoute(agent, routes, herd) {
  let best = null, bestCost = Infinity;
  const totalTaken = routes.reduce((s, r) => s + r.taken, 0) || 1;
  for (const r of routes) {
    if (!r.open && agent.info > 0.7) continue;      // only the informed know
    const e = agent.entries[r.id];
    const travel = (e.walk + e.remaining) / agent.speed;

    // What the agent expects to lose to queueing. The load that matters is
    // everyone already committed to the route and not yet out — not just the
    // handful visible at its mouth right now. An agent sees this in proportion
    // to how good its information is; the rest is guesswork.
    const committed = Math.max(0, r.taken - r.out);
    const expected = (committed / Math.max(r.capacity / 60, 0.1)) * agent.info;

    // Idiosyncratic preference: the road you know, the direction you have
    // family in, the bridge you have always used. Without this every agent of
    // a given speed makes an identical choice and the whole city takes one
    // route, which is the one thing real evacuations never do.
    const taste = e.bias;

    // Following the crowd. Strongest in the badly-informed, and in ad-hoc
    // groups, which form out of people already moving.
    const pull = agent.unit === 'group' ? 1.5 : 1;
    const follow = herd * (1 - agent.info) * pull * (r.taken / totalTaken) * travel;

    const cost = (travel + expected) * taste - follow;
    if (cost < bestCost) { bestCost = cost; best = r; }
  }
  return best || routes[0];
}

/** Precompute every agent's entry onto every route, and its taste for each.
 *  Done once per population, from the population seed, so a run reproduces. */
export function buildEntries(agents, routes, seed = 20220316) {
  const r0 = rng(seed ^ 0x5eed);
  for (const a of agents) {
    a.entries = {};
    for (const r of routes) {
      const e = entryFor(a.origin, r);
      // A multiplicative preference centred on 1: most agents mildly prefer or
      // avoid a given route, a few strongly.
      e.bias = Math.exp((r0() - 0.5) * 0.9);
      a.entries[r.id] = e;
    }
  }
}

/** Commit an agent to a route: build the polyline it will actually walk. */
function assign(agent, route) {
  const e = agent.entries[route.id];
  agent.route = route;
  agent.path = measurePath([agent.origin, ...route.coords.slice(e.index)]);
  agent.entryDist = agent.path.cum[1];   // end of the leg through the district
  route.taken++;
}

export const DEFAULTS = {
  routeCapacity: 900,   // people/minute each route's mouth can absorb
  hazard: 0.35,         // 0..1 danger on the leg out of the district
  herd: 0.35,           // 0..1 how strongly agents follow the crowd
  timeScale: 120,       // simulated seconds per real second
};

/** The lifecycle every agent passes through, in order. The names are the ones
 *  the CoLab's Evacuation Behavior Simulator uses. */
export const STATES = ['unaware', 'seeking', 'milling', 'evacuating', 'returning', 'done', 'back'];

export const STATE_LABEL = {
  unaware: 'Not yet warned',
  seeking: 'Confirming the warning',
  milling: 'Waiting — for family, for others',
  evacuating: 'On a route',
  returning: 'Turned back for someone',
  done: 'Out',
  back: 'Gave up / turned back',
};

export function createSim(agents, routes, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  let t = 0;
  const r0 = rng((opts.seed || 20220316) ^ 0xbeef);
  for (const a of agents) {
    // Decided once, up front, so it does not change under the agent mid-run.
    a.willReturn = r0() < a.returnChance;
    a.returnAtFrac = 0.2 + r0() * 0.45;
  }

  function tick(dt) {
    t += dt;
    for (const r of routes) { r.queued = 0; r.capacity = cfg.routeCapacity; }

    // Two shared, emergent quantities the agents react to.
    //
    // Queueing: who is inside the last 300 m before their chosen route's mouth.
    // Social proof: what fraction of the district is visibly on the move. This
    // is what collapses milling — a street sits still, then empties at once.
    let onTheMove = 0;
    for (const a of agents) {
      if (a.state === 'evacuating' || a.state === 'returning' || a.done) onTheMove++;
      if (a.route && !a.done && !a.turnedBack && a.dist > 0 &&
          a.dist < a.entryDist && a.entryDist - a.dist < 300) a.route.queued++;
    }
    const socialProof = onTheMove / Math.max(agents.length, 1);

    const counts = { unaware: 0, seeking: 0, milling: 0, evacuating: 0,
                     returning: 0, done: 0, back: 0 };

    for (const a of agents) {
      switch (a.state) {

        case 'unaware':
          // The warning has to arrive before anything else can happen.
          if (t >= a.warnedAt) { a.state = 'seeking'; a.seekUntil = t + a.seekFor / (0.35 + a.info); }
          break;

        case 'seeking':
          // Confirming the warning. Poor information makes this drag; a city
          // already visibly emptying confirms it for you.
          if (t >= a.seekUntil - a.seekFor * socialProof) {
            a.state = 'milling';
            a.millLeft = a.millFor;
          }
          break;

        case 'milling': {
          // Waiting: for the rest of the family to get home, for the ward's
          // transport, or simply for enough neighbours to go first. Milling
          // burns down faster the more of the district is already moving.
          a.millLeft -= dt * (1 + 2.5 * socialProof);
          // The reluctant stay put while they judge the danger survivable.
          const moved = cfg.hazard >= a.reluctance;
          if (a.millLeft <= 0 && moved) {
            a.state = 'evacuating';
            assign(a, chooseRoute(a, routes, cfg.herd));
          }
          break;
        }

        case 'evacuating': {
          const v = paceOf(a, cfg);
          if (v < 0.05) { a.stalled += dt; break; }
          const wasInDistrict = a.dist < a.entryDist;
          a.dist += v * dt;
          if (wasInDistrict && a.dist >= a.entryDist) {
            if (!a.route.open) { a.state = 'back'; a.turnedBack = true; break; }
            a.exitTime ??= t;
          }
          // The returner: far enough out to be safe, and goes back anyway.
          if (a.willReturn && a.returnedAt === null &&
              a.dist > a.path.length * a.returnAtFrac) {
            a.state = 'returning';
            a.returnedAt = t;
            break;
          }
          if (a.dist >= a.path.length) {
            a.dist = a.path.length; a.done = true; a.state = 'done';
            a.exitTime ??= t;
            // `exitTime` is when the agent cleared the district; `doneAt` is
            // when it actually reached the far end. They are different numbers
            // for anyone who turned back, and it is `doneAt` that the clearance
            // percentiles are built on.
            a.doneAt = t;
            a.route.out++;
          }
          break;
        }

        case 'returning': {
          // Back down the same road, into the hazard, at a hurrying pace.
          const v = paceOf(a, cfg) * 1.15;
          a.dist -= v * dt;
          if (a.dist <= a.entryDist * 0.4) {
            a.dist = Math.max(0, a.dist);
            a.state = 'evacuating';           // found them, or gave up looking
            a.willReturn = false;
          }
          break;
        }

        default: break;                        // done / back are terminal
      }
      counts[a.state]++;
    }

    return { t, socialProof,
             moving: counts.evacuating + counts.returning,
             waiting: counts.unaware + counts.seeking + counts.milling,
             evacuated: counts.done, back: counts.back, counts };
  }

  /** Metres per second for an agent right now, given where it is. */
  function paceOf(a, cfg) {
    let v = a.speed;
    if (a.dist < a.entryDist) {
      // Still inside the district: hazard costs time — taking cover,
      // backtracking around a blocked street.
      v *= 1 - cfg.hazard * (1 - 0.4 * a.risk) * 0.6;
      if (a.entryDist - a.dist < 300) {
        const load = a.route.queued / Math.max(a.route.capacity, 1);
        v *= 1 - 0.85 * Math.min(1, load);
      }
    } else {
      v *= 0.92;                                // column pace on the road
    }
    return v;
  }

  function reset() {
    t = 0;
    for (const r of routes) { r.taken = 0; r.out = 0; r.queued = 0; }
    for (const a of agents) {
      a.dist = 0; a.done = false; a.turnedBack = false; a.stalled = 0;
      a.exitTime = null; a.doneAt = null; a.route = null; a.path = null;
      a.state = 'unaware'; a.returnedAt = null; a.willReturn = a.returnChance > 0 && a.willReturn;
    }
  }

  return { tick, reset, cfg, routes, get time() { return t; } };
}

/** Live positions for rendering, coloured by the route each agent chose. */
export function positions(agents, t) {
  const out = [];
  for (const a of agents) {
    if (!a.route || t < a.departure || a.turnedBack) continue;
    out.push({
      position: pointAt(a.path, a.dist),
      colour: COHORTS[a.cohort].colour,
      routeColour: a.route.colour,
      cohort: a.cohort, zone: a.zone, group: a.group, done: a.done,
      route: a.route.name,
    });
  }
  return out;
}
