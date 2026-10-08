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

import { COHORTS, rng } from './population.js';

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

export function pointAt(path, dist, offsetM = 0) {
  const { coords, cum, length } = path;
  const d = Math.min(Math.max(dist, 0), length);
  let i = 1;
  while (i < cum.length - 1 && cum[i] < d) i++;
  const t = (d - cum[i - 1]) / Math.max(cum[i] - cum[i - 1], 1e-6);
  const [x0, y0] = coords[i - 1], [x1, y1] = coords[i];
  const lon = x0 + (x1 - x0) * t, lat = y0 + (y1 - y0) * t;
  if (!offsetM) return [lon, lat];

  // Step sideways off the centreline. Every household used to walk the exact
  // same polyline, so a crowd of six thousand rendered as a single-file string
  // of beads. Real columns occupy the width of the road, and the lateral place
  // someone takes in one is stable — you do not weave across the carriageway.
  const k = Math.cos((lat * Math.PI) / 180);
  let dx = (x1 - x0) * k, dy = y1 - y0;
  const m = Math.hypot(dx, dy) || 1;
  dx /= m; dy /= m;
  const dLat = offsetM / 111320;
  return [lon + (-dy * dLat) / (k || 1), lat + dx * dLat];
}

/** Prepare each route once: measured geometry, capacity, live occupancy. */
export function prepareRoutes(features, capacityPerMin) {
  return features.map((f, i) => ({
    id: f.properties.route_id || `R${i + 1}`,
    name: f.properties.name,
    note: f.properties.note,
    // Whether the far end of this route is safety, or merely not-the-city.
    // Mariupol's eastward route led to filtration. Counting the people who
    // took it as "evacuated" would be the most misleading thing this model
    // could do, so they are counted separately.
    safe: f.properties.safe !== false,
    // A transit exit is a station or landing, not a road out. It is routed
    // like a bridge — a real road path to the door — but the door can be shut:
    // by the weather, mode by mode, and by the operator's shutdown clock in a
    // forecast hazard. Its capacity is its own modelled boarding rate, not the
    // road-capacity slider.
    transit: !!f.properties.transit,
    mode: f.properties.mode || null,          // 'subway' | 'rail' | 'ferry'
    lines: f.properties.lines || null,
    baseCapacity: f.properties.transit ? f.properties.capacity : null,
    coords: f.geometry.coordinates,
    path: measurePath(f.geometry.coordinates),
    lengthM: f.properties.length_m || measurePath(f.geometry.coordinates).length,
    colour: ROUTE_COLOURS[i % ROUTE_COLOURS.length],
    capacity: capacityPerMin,   // PEOPLE per minute
    open: true,                 // the user's toggle
    live: true,                 // open AND not suspended or shut down this tick
    suspended: false,           // shut by weather or by the shutdown clock
    why: null,                  // 'weather' | 'shutdown' — for the console
    queued: 0,                  // people inside the entry band right now
    onRoute: 0,                 // people on the route itself right now
    density: 0,                 // people per metre on the route
    flowFactor: 1,              // 0..1 speed multiplier from that density
    taken: 0,                   // people that chose it
    out: 0,                     // households that reached its far end
    outPeople: 0,               // people that did
  }));
}

export const ROUTE_COLOURS = [
  [74, 222, 128], [56, 189, 248], [251, 191, 36], [244, 114, 182], [167, 139, 250],
  [45, 212, 191], [251, 146, 60], [232, 121, 249], [163, 230, 53], [96, 165, 250],
  [248, 113, 113], [250, 204, 21],
];

/**
 * Where an agent joins a route, and how it gets there.
 *
 * The approach leg is a road path precomputed per zone × route by
 * tools/fetch_city.py — not a straight line. That matters: a straight line from
 * a Battery Park City address to the nearest point on the Holland Tunnel route
 * runs across the Hudson. Every metre an agent walks is now on a road.
 *
 * Joining at the point on the route nearest your own zone, rather than at the
 * route's head, is what keeps route choice a real trade-off — the shortest
 * route is often not the closest one to you.
 */
function entryFor(agent, route, approaches) {
  const leg = approaches?.[`${agent.zone}|${route.id}`];
  if (leg) {
    return {
      index: leg.entryIndex,
      coords: leg.coords,
      walk: leg.length + haversine(agent.origin, leg.coords[0]),
      remaining: route.path.length - route.path.cum[leg.entryIndex],
    };
  }
  // Fallback for a pack built before approaches existed: nearest vertex,
  // straight line. Kept so an old pack still runs, not because it is right.
  let best = 0, bd = Infinity;
  for (let i = 0; i < route.coords.length; i++) {
    const d = haversine(agent.origin, route.coords[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return { index: best, coords: [route.coords[best]], walk: bd,
           remaining: route.path.length - route.path.cum[best] };
}

/** Index the approach legs by "zone|route" for the lookup above. */
export function indexApproaches(features) {
  const out = {};
  for (const f of features || []) {
    // Zone → route approach legs, and station → route transfer legs, in one
    // table: the key is where the walk starts.
    out[`${f.properties.zone_id ?? f.properties.from_route}|${f.properties.route_id}`] = {
      entryIndex: f.properties.entry_index,
      length: f.properties.length_m,
      coords: f.geometry.coordinates,
    };
  }
  return out;
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
/**
 * What an agent believes a route will cost it, in seconds. The single source of
 * truth for route choice: the first decision and every later reconsideration
 * use this, because scoring a switch under a different metric than the one that
 * made the original choice means the switch is always vetoed — which is exactly
 * what happened, and why nobody ever re-routed.
 */
export function routeCost(agent, route, routes, herd, visibility, totalTaken) {
  const seen = agent.info * visibility;
  const e = agent.entries[route.id];
  const travel = (e.walk + e.remaining) / agent.speed;

  // Expected queueing: everyone already committed and not yet out, over the
  // route's capacity — seen only as clearly as the agent's information allows.
  const committed = Math.max(0, route.taken - route.outPeople);   // people, both
  const expected = (committed / Math.max(route.capacity / 60, 0.1)) * seen;

  // Idiosyncratic preference: the road you know, the direction your family
  // lives in, the bridge you have always used.
  const taste = e.bias;

  // Following the crowd, strongest in the badly informed and in ad-hoc groups.
  const pull = agent.unit === 'group' ? 1.5 : 1;
  const follow = herd * (1 - seen) * pull * (route.taken / totalTaken) * travel;

  return (travel + expected) * taste - follow;
}

export function chooseRoute(agent, routes, herd, visibility = 1) {
  const seen = agent.info * visibility;
  const totalTaken = routes.reduce((s, r) => s + r.taken, 0) || 1;
  let best = null, bestCost = Infinity;
  for (const r of routes) {
    if (r.transit && r.suspended && agent.info * visibility > 0.4) continue;   // a closed gate is on the news
    if (!r.live && seen > 0.7) continue;            // only the informed know
    const cost = routeCost(agent, r, routes, herd, visibility, totalTaken);
    if (cost < bestCost) { bestCost = cost; best = r; }
  }
  return best || routes[0];
}

/** Precompute every agent's entry onto every route, and its taste for each.
 *  Done once per population, from the population seed, so a run reproduces. */
export function buildEntries(agents, routes, seed = 20220316, approaches = null) {
  const r0 = rng(seed ^ 0x5eed);
  for (const a of agents) {
    a.entries = {};
    for (const r of routes) {
      const e = entryFor(a, r, approaches);
      // A multiplicative preference centred on 1: most agents mildly prefer or
      // avoid a given route, a few strongly.
      e.bias = Math.exp((r0() - 0.5) * 0.9);
      a.entries[r.id] = e;
    }
  }
}

/**
 * Commit an agent to a route: build the polyline it will actually walk.
 *
 * `from` is where the walk starts. It is the agent's front door on the first
 * assignment, and wherever the agent is actually standing when it changes its
 * mind — a re-route used to reset `dist` to zero, which snapped the household
 * instantaneously back across the map to its own doorstep. People who change
 * their mind carry on from where they are.
 */
function assign(agent, route, from = null) {
  const e = agent.entries[route.id];
  if (agent.route && agent.route !== route) agent.route.taken -= agent.weight;
  const start = from || agent.origin;
  agent.route = route;
  // Start → road approach leg → the route itself, all on real geometry.
  agent.path = measurePath([start, ...e.coords, ...route.coords.slice(e.index + 1)]);
  // The district leg ends where the approach meets the route.
  agent.entryDist = agent.path.cum[e.coords.length];
  agent.dist = 0;                // measured along the new path, from here
  route.taken += agent.weight;   // people, not households
}

/**
 * Reconsider a route already chosen.
 *
 * Route choice used to be made once, at departure, and never revisited — which
 * meant nobody ever saw a jam and went another way, in a model whose whole
 * subject is what people know. Now anyone still in their own district, who can
 * actually see something (good information, decent visibility), re-evaluates
 * periodically and will switch if an alternative looks meaningfully better.
 *
 * Two constraints keep this honest. You can only switch before you have
 * committed to the route — once you are on it, you are on it. And an
 * alternative has to be better by a clear margin, or the whole crowd
 * oscillates between two routes forever, which is a simulation artefact and
 * not a thing people do.
 */
function reconsider(agent, routes, herd, visibility, t) {
  if (agent.dist >= agent.entryDist) return false;      // already on the route
  if (t < agent.nextThink) return false;
  agent.nextThink = t + RECONSIDER_EVERY;
  // Someone who cannot judge a queue cannot be re-routed by one.
  if (agent.info * visibility < 0.35) return false;

  const current = agent.route;
  const best = chooseRoute(agent, routes, herd, visibility);
  if (best === current) return false;
  const totalTaken = routes.reduce((s, r) => s + r.taken, 0) || 1;
  const cost = r => routeCost(agent, r, routes, herd, visibility, totalTaken);
  if (cost(current) > cost(best) * SWITCH_MARGIN) {
    // Carry on from where the household is actually standing.
    assign(agent, best, pointAt(agent.path, agent.dist, 0));
    agent.reroutes = (agent.reroutes || 0) + 1;
    return true;
  }
  return false;
}

export const DEFAULTS = {
  routeCapacity: 900,   // people/minute each route's mouth can absorb
  hazard: 0.35,         // 0..1 danger on the leg out of the district
  herd: 0.35,           // 0..1 how strongly agents follow the crowd
  reroute: true,        // may agents change route when they meet a jam?
  // Hours after T0 at which transit stops running, as the operator would in a
  // forecast hazard. The MTA suspended the subway at 19:00 before Sandy, seven
  // and a half hours after the evacuation order; 8 is that precedent rounded.
  // Infinity means it runs until the weather stops it.
  transitShutdown: 8,
  timeScale: 120,       // simulated seconds per real second
  // Weather and time of day, from conditions.js. Every field is a multiplier
  // on something the model already had, so conditions can be changed mid-run.
  env: { speed: 1, capacity: 1, hazard: 0, visibility: 1, warn: 1, gather: 1, perCohort: {} },
};

/** The lifecycle every agent passes through, in order. The names are the ones
 *  the CoLab's Evacuation Behavior Simulator uses, and the key order here is
 *  that order. */
export const STATE_LABEL = {
  unaware: 'Not yet warned',
  seeking: 'Confirming the warning',
  milling: 'Waiting — for family, for others',
  stayed: 'Refusing to leave',
  evacuating: 'On a route',
  returning: 'Gone back for someone',
  done: 'Reached safety',
  filtered: 'Left the city, not to safety',
  back: 'Turned back — route closed',
};

/** Free walking speed used to turn a route's capacity into a density. */
const FREE_SPEED = 1.2;
/**
 * Jam density as a multiple of the density at which capacity is achieved.
 *
 * Under Greenshields — the standard linear speed-density relation — flow peaks
 * at exactly half the jam density, so this constant is 2 and not a tuning knob.
 * It was 3.5 on first writing, which let a route carry far more than its stated
 * capacity before slowing, and made the capacity slider nearly inert.
 */
const JAM_RATIO = 2.0;
/**
 * The slowest anyone moves while still on their feet — about 100 m/hour. Real
 * crowds shuffle; they do not freeze. Without a floor here the model deadlocks
 * its own slowest agents, and it deadlocks exactly the people the model exists
 * to say something about.
 */
const CRAWL = 0.03;
/** How much of a zone's social proof is what it can see of itself, as opposed
 *  to what it can see of the city. Milling is a local act. */
const LOCAL_WEIGHT = 0.75;
/** How often an agent reconsiders its route, in simulated seconds. */
const RECONSIDER_EVERY = 300;
/**
 * How much better an alternative must look before someone actually switches.
 *
 * Some hysteresis is needed or the crowd oscillates between two routes for
 * ever, which is a simulation artefact rather than a thing people do. But this
 * is a margin on the *whole journey*, and whole journeys differ by 5-15%, not
 * 25% — set at 1.25 it vetoed every switch the model ever proposed, including
 * an agent sitting on an 8,365-second route with a 7,227-second one in plain
 * view. Backtracking to the front door is itself a real deterrent, so the
 * margin does not have to do all the work.
 */
const SWITCH_MARGIN = 1.08;

export function createSim(agents, routes, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  let t = 0;
  const people = agents.reduce((s, a) => s + (a.weight || 1), 0);

  // Per-zone bookkeeping for local social proof.
  const zonePeople = {}, zoneMoving = {}, zoneProof = {};
  for (const a of agents) {
    zonePeople[a.zone] = (zonePeople[a.zone] || 0) + a.weight;
    zoneMoving[a.zone] = 0;
    zoneProof[a.zone] = 0;
  }
  const r0 = rng((opts.seed || 20220316) ^ 0xbeef);
  for (const a of agents) {
    // Decided once, up front, so it does not change under the agent mid-run —
    // and kept, so reset() can restore it rather than quietly losing it.
    a.willReturnBase = r0() < a.returnChance;
    a.willReturn = a.willReturnBase;
    a.returnAtFrac = 0.2 + r0() * 0.45;
    // Staggered so the whole city does not reconsider on the same tick.
    a.nextThink = r0() * RECONSIDER_EVERY;
    a.reroutes = 0;
  }

  function tick(dt) {
    t += dt;
    const env = cfg.env || DEFAULTS.env;
    for (const r of routes) {
      r.queued = 0; r.onRoute = 0;
      if (r.transit) {
        // Boarding rate for this mode in this weather. A ferry in a gale is
        // not slow, it is tied up; the clock, if it has run out, shuts the
        // rest. Either way the station is a closed door and `live` is false.
        const factor = env.transit?.[r.mode] ?? 1;
        const shut = t >= (cfg.transitShutdown ?? Infinity) * 3600;
        r.suspended = shut || factor < 0.05;
        r.why = shut ? 'shutdown' : factor < 0.05 ? 'weather' : null;
        r.capacity = r.baseCapacity * factor;
      } else {
        r.capacity = cfg.routeCapacity * env.capacity;
      }
      r.live = r.open && !r.suspended;
    }

    // Three shared, emergent quantities the agents react to. All of them are
    // measured in PEOPLE — the sum of household weights — so none of them
    // change when you change how many households are being simulated.
    //
    // Queueing: people inside the last 300 m before their route's mouth.
    // Occupancy: people on the route itself, which sets its density.
    // Social proof: the share visibly on the move — what collapses milling.
    //
    // Social proof is measured PER ZONE, not city-wide. Milling is watching
    // your neighbours out of your own window, not reading a city-wide
    // statistic; with one global number every district mobilised in lockstep,
    // which is the one thing a real evacuation never does. A zone that starts
    // moving now pulls its own residents out; the district next to it can
    // still be sitting still.
    let onTheMove = 0;
    for (const z of Object.keys(zoneMoving)) { zoneMoving[z] = 0; }
    for (const a of agents) {
      const moving = a.state === 'evacuating' || a.state === 'returning' || a.done;
      if (moving) { onTheMove += a.weight; zoneMoving[a.zone] += a.weight; }
      if (!a.route || a.done || a.turnedBack) continue;
      if (a.dist > 0 && a.dist < a.entryDist && a.entryDist - a.dist < 300) a.route.queued += a.weight;
      else if (a.dist >= a.entryDist) a.route.onRoute += a.weight;
    }
    const socialProof = onTheMove / Math.max(people, 1);
    // What each zone can see of itself, blended with a little of what it can
    // see of the city as a whole — sirens, main roads, the news.
    for (const z of Object.keys(zoneMoving)) {
      zoneProof[z] = LOCAL_WEIGHT * (zoneMoving[z] / Math.max(zonePeople[z], 1)) +
                     (1 - LOCAL_WEIGHT) * socialProof;
    }

    // Speed-density on the route itself, not only at its mouth. A route with a
    // capacity has a density at which that capacity is achieved; past it the
    // column slows, the way a road does. Without this a "200 people per minute"
    // corridor happily carried three thousand at full walking pace, which made
    // the capacity slider almost meaningless — the one thing a corridor
    // negotiation is actually about.
    for (const r of routes) {
      r.density = r.onRoute / Math.max(r.lengthM, 1);      // people per metre
      const atCapacity = (r.capacity / 60) / FREE_SPEED;   // density at max flow
      const jam = Math.max(atCapacity * JAM_RATIO, 1e-6);
      r.flowFactor = Math.max(0.08, 1 - r.density / jam);
    }

    const counts = { unaware: 0, seeking: 0, milling: 0, stayed: 0, evacuating: 0,
                     returning: 0, done: 0, filtered: 0, back: 0 };
    // People currently reduced to a shuffle by the crowd in front of them.
    let crawling = 0;

    for (const a of agents) {
      switch (a.state) {

        case 'unaware':
          // The warning has to arrive before anything else can happen — and at
          // night, asleep, it takes twice as long to land.
          if (t >= a.warnedAt * env.warn) {
            a.state = 'seeking';
            a.seekUntil = t + a.seekFor / (0.35 + a.info);
          }
          break;

        case 'seeking':
          // Confirming the warning. Poor information makes this drag; a city
          // already visibly emptying confirms it for you.
          if (t >= a.seekUntil - a.seekFor * zoneProof[a.zone]) {
            a.state = 'milling';
            a.millLeft = a.millFor;
          }
          break;

        case 'milling': {
          // Waiting: for the rest of the family to get home, for the ward's
          // transport, or simply for enough neighbours to go first. Milling
          // burns down faster the more of the district is already moving.
          // Gathering takes longer when the household is scattered across a
          // working day, and less time when everyone is already home.
          a.millLeft -= (dt / env.gather) * (1 + 2.5 * zoneProof[a.zone]);
          // The reluctant stay put while they judge the danger survivable —
          // and the weather is part of that danger.
          const danger = Math.min(1, cfg.hazard + env.hazard);
          if (a.millLeft <= 0) {
            if (danger >= a.reluctance) {
              a.state = 'evacuating'; a.leftAt = t;
              assign(a, chooseRoute(a, routes, cfg.herd, env.visibility));
            } else {
              // Ready to go, and choosing not to. Its own state, because
              // filing these people under "still waiting" hid the finding.
              a.state = 'stayed';
            }
          }
          break;
        }

        case 'stayed':
          // Refusing to leave is not permanent: it is a judgement about the
          // danger, and the danger can rise. Re-checked every tick.
          if (Math.min(1, cfg.hazard + env.hazard) >= a.reluctance) {
            a.state = 'evacuating'; a.leftAt = t;
            assign(a, chooseRoute(a, routes, cfg.herd, env.visibility));
          }
          break;

        case 'evacuating': {
          if (cfg.reroute) reconsider(a, routes, cfg.herd, env.visibility, t);
          let v = paceOf(a, cfg, env);
          // A queue creeps; it does not stop dead. Treating anything below a
          // threshold as "not moving" deadlocked the slowest agents: a disabled
          // household in a jammed band was part of the jam, so the jam could
          // never clear enough to release it, and it stayed there for ever. In
          // ice at night that meant not one disabled household in Lower
          // Manhattan ever got out. They are still recorded as stalled — that
          // is the finding — but they keep inching forward.
          if (v < CRAWL) { a.stalled += dt; crawling += a.weight; v = CRAWL; }
          const wasInDistrict = a.dist < a.entryDist;
          a.dist += v * dt;
          if (wasInDistrict && a.dist >= a.entryDist) {
            // A road closure is met at the mouth of the road. A station is
            // found closed at the door, which is the far end of its route, so
            // a transit route is not checked here.
            if (!a.route.live && !a.route.transit) { a.state = 'back'; a.turnedBack = true; break; }
            a.exitTime ??= t;
          }
          // The returner: far enough out to be safe, and goes back anyway.
          if (a.willReturn && a.returnedAt === null &&
              a.dist > a.path.length * a.returnAtFrac) {
            a.state = 'returning';
            a.returnedAt = t;
            break;
          }
          if (a.dist >= a.path.length && a.route.transit && !a.route.live) {
            // The station is shut. Nobody sleeps on the steps: the household
            // picks the best way out that is still running, from where it is
            // standing — usually a bridge it could have taken an hour ago.
            // Counted, because "how many people walked to a closed station"
            // is the question a shutdown clock exists to answer.
            const here = pointAt(a.path, a.dist, 0);
            if (!transfer(a, here)) { a.state = 'back'; a.turnedBack = true; break; }
            a.exitTime ??= t;
            a.turnedAway = (a.turnedAway || 0) + 1;
            a.reroutes = (a.reroutes || 0) + 1;
            break;
          }
          if (a.dist >= a.path.length) {
            a.dist = a.path.length; a.done = true;
            // Reaching the end of a route is not the same as reaching safety.
            a.state = a.route.safe ? 'done' : 'filtered';
            a.exitTime ??= t;
            // `exitTime` is when the agent cleared the district; `doneAt` is
            // when it actually reached the far end. They are different numbers
            // for anyone who turned back, and it is `doneAt` that the clearance
            // percentiles are built on.
            // `leftAt` is when the household stepped out of its door.
            a.doneAt = t;
            a.route.out++;
            a.route.outPeople += a.weight;
          }
          break;
        }

        case 'returning': {
          // Back down the same road, into the hazard, at a hurrying pace.
          const v = Math.max(CRAWL, paceOf(a, cfg, env) * 1.15);
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
      counts[a.state] += a.weight;
    }

    return { t, socialProof, people, crawling, zoneProof: { ...zoneProof },
             reroutes: agents.reduce((n, a) => n + (a.reroutes ? a.weight : 0), 0),
             turnedAway: agents.reduce((n, a) => n + (a.turnedAway ? a.weight : 0), 0),
             transitOut: routes.reduce((n, r) => n + (r.transit ? r.outPeople : 0), 0),
             moving: counts.evacuating + counts.returning,
             waiting: counts.unaware + counts.seeking + counts.milling + counts.stayed,
             evacuated: counts.done, filtered: counts.filtered,
             back: counts.back, counts };
  }

  /**
   * From a shut station door, onto the best route still running. The walk is
   * the precomputed road leg from this station to that route (a transfer leg
   * from tools/fetch_city.py), so nobody crosses the river to reach a bridge.
   * Chosen on what the household can see standing there: distance, and the
   * queue at the route it would be joining.
   */
  function transfer(a, here) {
    let best = null, bestCost = Infinity, bestPath = null, bestLeg = 0;
    for (const r of routes) {
      if (!r.live || r === a.route) continue;
      const leg = cfg.approaches?.[`${a.route.id}|${r.id}`];
      let idx, legCoords, walk;
      if (leg) {
        idx = leg.entryIndex; legCoords = leg.coords;
        walk = leg.length + haversine(here, leg.coords[0]);
      } else {
        // An old pack without transfer legs: nearest vertex, straight line.
        idx = 0; let bd = Infinity;
        for (let i = 0; i < r.coords.length; i++) {
          const d = haversine(here, r.coords[i]);
          if (d < bd) { bd = d; idx = i; }
        }
        legCoords = [r.coords[idx]]; walk = bd;
      }
      const remaining = r.path.length - r.path.cum[idx];
      const queue = Math.max(0, r.taken - r.outPeople) / Math.max(r.capacity / 60, 0.1);
      const cost = (walk + remaining) / a.speed + queue;
      if (cost < bestCost) {
        bestCost = cost; best = r;
        bestPath = [here, ...legCoords, ...r.coords.slice(idx + 1)];
        bestLeg = legCoords.length;
      }
    }
    if (!best) return false;
    a.route.taken -= a.weight;
    a.route = best;
    a.path = measurePath(bestPath);
    // The transfer walk is this household's leg to its new route: it queues
    // at that route's mouth like everyone else arriving there.
    a.entryDist = a.path.cum[bestLeg];
    a.dist = 0;
    best.taken += a.weight;
    return true;
  }

  /** Metres per second for an agent right now, given where it is and what the
   *  weather is doing to it. Conditions that fall on particular cohorts — ice
   *  on the elderly, heat on the very young — are applied here, which is why a
   *  hard winter costs a care home far more than it costs a solo adult. */
  function paceOf(a, cfg, env) {
    let v = a.speed * env.speed * (env.perCohort[a.cohort] ?? 1);
    if (a.dist < a.entryDist) {
      // Still inside the district: hazard costs time — taking cover,
      // backtracking around a blocked street.
      const danger = Math.min(1, cfg.hazard + env.hazard);
      v *= 1 - danger * (1 - 0.4 * a.risk) * 0.6;
      if (a.entryDist - a.dist < 300) {
        const load = a.route.queued / Math.max(a.route.capacity, 1);
        v *= 1 - 0.85 * Math.min(1, load);
      }
    } else {
      // On the route: column pace, throttled by how dense the column is.
      v *= 0.92 * a.route.flowFactor;
    }
    return v;
  }

  function reset() {
    t = 0;
    for (const r of routes) {
      r.taken = 0; r.out = 0; r.outPeople = 0; r.queued = 0; r.onRoute = 0;
      r.density = 0; r.flowFactor = 1; r.suspended = false; r.why = null; r.live = r.open;
    }
    for (const a of agents) {
      a.dist = 0; a.done = false; a.turnedBack = false; a.stalled = 0;
      a.exitTime = null; a.doneAt = null; a.leftAt = null; a.route = null; a.path = null;
      a.state = 'unaware'; a.returnedAt = null; a.reroutes = 0; a.nextThink = 0; a.turnedAway = 0;
      // Restore the decision made at construction, rather than ANDing with
      // whatever the last run left behind — which silently threw away every
      // returner that had already returned.
      a.willReturn = a.willReturnBase;
    }
  }

  return { tick, reset, cfg, routes, people, get time() { return t; } };
}

/** Live positions for rendering, coloured by the route each agent chose. */
export function positions(agents) {
  const out = [];
  for (const a of agents) {
    // The finished are not drawn. Leaving them piled on the exit rendered a
    // static crust that read as congestion which was not there.
    if (!a.route || a.done || a.turnedBack) continue;
    out.push({
      position: pointAt(a.path, a.dist, a.lane),
      colour: COHORTS[a.cohort].colour,
      routeColour: a.route.colour,
      cohort: a.cohort, zone: a.zone, group: a.group, unit: a.unit,
      behaviour: a.behaviour, weight: a.weight, done: false,
      colour: a.colour,          // this household's own colour
      route: a.route.name,
    });
  }
  return out;
}
