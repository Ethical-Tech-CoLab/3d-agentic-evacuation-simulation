// Environmental conditions.
//
// The same population, on the same roads, with the same routes, evacuates very
// differently in freezing rain at three in the morning than on a clear
// afternoon. Weather and time of day are not decoration here — each one is a
// small set of multipliers applied to things the model already has: how fast
// people walk, how much a route can absorb, how dangerous it is to be outside,
// how well anyone can judge which way to go, and how long a household takes to
// gather itself.
//
// Every multiplier below is a modelling judgement, not a measurement. They are
// deliberately round, and the console prints the resulting effect so a run is
// never quietly shaped by numbers nobody looked at.
//
//   speed      × on walking pace, everyone
//   capacity   × on how many people a route's mouth absorbs per minute
//   hazard     + added to the hazard slider (clamped to 1)
//   visibility × on how well an agent can judge routes and queues
//   warn       × on how long the warning takes to reach someone
//   gather     × on milling — how long a household takes to become ready
//   perCohort  × extra pace penalty falling on specific cohorts

export const WEATHER = {
  clear: {
    label: 'Clear',
    note: 'The condition every evacuation plan is written for and few happen in.',
    speed: 1, capacity: 1, hazard: 0, visibility: 1, warn: 1, gather: 1,
    perCohort: {},
  },
  rain: {
    label: 'Rain',
    note: 'Slower on foot, slower through junctions, and harder to hear a loudhailer.',
    speed: 0.92, capacity: 0.85, hazard: 0.03, visibility: 0.85, warn: 1.1, gather: 1.05,
    perCohort: {},
  },
  downpour: {
    label: 'Heavy rain / flooding',
    note: 'Standing water on the low roads. Capacity collapses before walking speed does — the road, not the person, is the constraint.',
    speed: 0.80, capacity: 0.55, hazard: 0.14, visibility: 0.60, warn: 1.2, gather: 1.15,
    perCohort: { child: 0.85, elderly: 0.85, disabled: 0.75 },
  },
  snow: {
    label: 'Snow',
    note: 'Everyone slows; the people who were already slowest slow the most.',
    speed: 0.74, capacity: 0.60, hazard: 0.10, visibility: 0.70, warn: 1.15, gather: 1.2,
    perCohort: { elderly: 0.80, disabled: 0.70 },
  },
  ice: {
    label: 'Ice',
    note: 'The worst case for a population with any mobility impairment at all. A fall is not a delay, it is a stop.',
    speed: 0.64, capacity: 0.48, hazard: 0.16, visibility: 0.90, warn: 1.1, gather: 1.2,
    perCohort: { elderly: 0.62, disabled: 0.55 },
  },
  heat: {
    label: 'Extreme heat',
    note: 'Walking distance stops being free. Falls hardest on the old and the very young, and on anyone waiting in an unshaded queue.',
    speed: 0.85, capacity: 0.92, hazard: 0.10, visibility: 1, warn: 1, gather: 1.1,
    perCohort: { child: 0.82, elderly: 0.68, disabled: 0.78 },
  },
  wind: {
    label: 'High wind',
    note: 'Debris and downed lines. Being outdoors is itself the hazard, so hesitation rises with it.',
    speed: 0.86, capacity: 0.75, hazard: 0.18, visibility: 0.80, warn: 1.25, gather: 1.15,
    perCohort: { child: 0.86, elderly: 0.84, disabled: 0.80 },
  },
  fog: {
    label: 'Fog / smoke',
    note: 'Walking is barely affected and route choice is wrecked. The clearest case of information, not mobility, being the binding constraint.',
    speed: 0.94, capacity: 0.85, hazard: 0.05, visibility: 0.30, warn: 1.15, gather: 1.05,
    perCohort: {},
  },
};

export const TIME_OF_DAY = {
  day: {
    label: 'Daytime',
    note: 'Households are dispersed — work, school, elsewhere — so families take longer to become whole.',
    speed: 1, capacity: 1, hazard: 0, visibility: 1, warn: 1, gather: 1.25,
    perCohort: {},
  },
  evening: {
    label: 'Evening',
    note: 'Most households are together and awake. The best hour to be told to leave.',
    speed: 1, capacity: 1, hazard: 0, visibility: 0.9, warn: 1, gather: 0.85,
    perCohort: {},
  },
  night: {
    label: 'Night',
    note: 'Together, but asleep. The warning takes far longer to land, and everything after it happens in the dark.',
    speed: 0.88, capacity: 0.85, hazard: 0.06, visibility: 0.45, warn: 2.1, gather: 0.9,
    perCohort: { elderly: 0.85, disabled: 0.85 },
  },
};

/** Combine weather and time of day into the single object the engine reads.
 *  Multipliers compose; the hazard additions add. */
export function environment(weatherKey, timeKey) {
  const w = WEATHER[weatherKey] || WEATHER.clear;
  const t = TIME_OF_DAY[timeKey] || TIME_OF_DAY.day;
  const perCohort = {};
  for (const k of new Set([...Object.keys(w.perCohort), ...Object.keys(t.perCohort)])) {
    perCohort[k] = (w.perCohort[k] ?? 1) * (t.perCohort[k] ?? 1);
  }
  return {
    weather: weatherKey, time: timeKey,
    label: `${w.label} · ${t.label}`,
    speed: w.speed * t.speed,
    capacity: w.capacity * t.capacity,
    hazard: Math.min(1, w.hazard + t.hazard),
    visibility: w.visibility * t.visibility,
    warn: w.warn * t.warn,
    gather: w.gather * t.gather,
    perCohort,
    notes: [w.note, t.note],
  };
}

/** The resulting effect, in the plain terms the console prints. A condition
 *  that cannot be stated as a sentence should not be in the model. */
export function describe(env) {
  const pct = v => `${v >= 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  const rows = [
    ['Walking pace', pct(env.speed), env.speed],
    ['Route capacity', pct(env.capacity), env.capacity],
    ['Warning delay', pct(env.warn), 2 - env.warn],
    ['Time to gather', pct(env.gather), 2 - env.gather],
    ['Can judge routes', pct(env.visibility), env.visibility],
  ];
  if (env.hazard > 0) rows.push(['Added hazard', `+${env.hazard.toFixed(2)}`, 1 - env.hazard]);
  const worst = Object.entries(env.perCohort).filter(([, v]) => v < 0.999)
    .sort((a, b) => a[1] - b[1]);
  return { rows, worst };
}
