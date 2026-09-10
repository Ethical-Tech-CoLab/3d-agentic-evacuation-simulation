// The population mix — the part of the model you are meant to argue with.
//
// The three classification axes ship with default shares, but those defaults
// are the weakest thing in the repo: the cohort split is published only for
// Mariupol, and the travel-unit and behaviour splits are read off the
// evacuation-behaviour literature rather than measured anywhere. So they are
// not constants. Every share is editable, every edit is reflected in the URL,
// and the app says plainly whenever a mix has been moved off its source.
//
// Editing a mix is the intended way to use this thing. "What if a third of this
// district is in institutional care?" is a question you should be able to ask
// in ten seconds and share as a link.

import { COHORTS, TRAVEL_UNITS, BEHAVIOURS } from './population.js';

export const AXES = {
  cohort: { table: COHORTS, label: 'Who they are' },
  unit: { table: TRAVEL_UNITS, label: 'Who they travel with' },
  behaviour: { table: BEHAVIOURS, label: 'How they behave' },
};

/** The shipped defaults, read off the tables so there is one source of truth. */
export function defaultMix() {
  return {
    // null means "use the city's published per-zone cohort counts" — the
    // honest default, and the only one Mariupol has a real source for.
    cohort: null,
    unit: Object.fromEntries(Object.entries(TRAVEL_UNITS).map(([k, v]) => [k, v.share])),
    behaviour: Object.fromEntries(Object.entries(BEHAVIOURS).map(([k, v]) => [k, v.share])),
    // How much individuals differ from their group's mean. At 0 everyone in a
    // cohort walks at exactly the same speed and hears the warning at exactly
    // the same moment, which is a useful sanity check and a terrible model.
    spread: {
      speed: 1,      // ×  variation in walking speed
      info: 1,       // ×  variation in information quality
      risk: 1,       // ×  variation in risk tolerance
      timing: 1,     // ×  variation in seeking and milling durations
    },
  };
}

/** Even split across an axis — the "I have no information" baseline. */
export function flat(axis) {
  const keys = Object.keys(AXES[axis].table);
  return Object.fromEntries(keys.map(k => [k, 1 / keys.length]));
}

/** Shares always sum to 1. Editing one share rescales the others in place,
 *  rather than silently normalising behind the user's back on the next read. */
export function rebalance(shares, changedKey, value) {
  const keys = Object.keys(shares);
  const v = Math.min(1, Math.max(0, value));
  const others = keys.filter(k => k !== changedKey);
  const rest = others.reduce((s, k) => s + shares[k], 0);
  const out = { [changedKey]: v };
  if (rest <= 1e-9) {
    // Everything else was at zero: spread the remainder evenly.
    for (const k of others) out[k] = (1 - v) / others.length;
  } else {
    for (const k of others) out[k] = (shares[k] / rest) * (1 - v);
  }
  return out;
}

export function normalise(shares) {
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  if (total <= 1e-9) return flatLike(shares);
  return Object.fromEntries(Object.entries(shares).map(([k, v]) => [k, v / total]));
}

const flatLike = shares => {
  const keys = Object.keys(shares);
  return Object.fromEntries(keys.map(k => [k, 1 / keys.length]));
};

/**
 * Presets. Each is a claim about a population, not a preference — the note
 * says what the claim is, so a run made under one can be argued with.
 */
export const PRESETS = {
  source: {
    label: 'As sourced',
    note: '',   // filled in per city from the pack's own demography record
    mix: () => defaultMix(),
  },
  ageing: {
    label: 'Ageing district',
    note: 'A third elderly, more people in institutional care, more reluctance to leave. The hard case for any corridor.',
    mix: () => ({
      ...defaultMix(),
      cohort: { adult: 0.44, child: 0.08, elderly: 0.34, disabled: 0.14 },
      unit: { solo: 0.30, family: 0.32, group: 0.15, institutional: 0.23 },
      behaviour: { prompt: 0.15, seeker: 0.22, milling: 0.26, reluctant: 0.30, returner: 0.07 },
    }),
  },
  families: {
    label: 'Family district',
    note: 'Children and family units dominate. Reunification, not walking speed, sets the clearance time.',
    mix: () => ({
      ...defaultMix(),
      cohort: { adult: 0.52, child: 0.33, elderly: 0.09, disabled: 0.06 },
      unit: { solo: 0.10, family: 0.72, group: 0.14, institutional: 0.04 },
      behaviour: { prompt: 0.20, seeker: 0.30, milling: 0.31, reluctant: 0.08, returner: 0.11 },
    }),
  },
  visitors: {
    label: 'Strip visitors (not residents)',
    note: 'The population actually on the Las Vegas Strip at any hour is visitors, not Clark County residents — and their age structure is very different. ' +
          'Child share derived from LVCVA: ~13–14% of visitors bring anyone under 21. Mean visitor age 43.6 (2024). ' +
          'The elderly and disabled shares here are MODELLED, not sourced: travel selects for mobility, but no published visitor figure was found.',
    mix: () => ({
      ...defaultMix(),
      // adult dominates because leisure travel selects hard for working-age
      // adults; see the note for which of these four numbers has a source.
      cohort: { adult: 0.79, child: 0.06, elderly: 0.11, disabled: 0.04 },
      unit: { solo: 0.22, family: 0.24, group: 0.52, institutional: 0.02 },
      behaviour: { prompt: 0.26, seeker: 0.38, milling: 0.28, reluctant: 0.03, returner: 0.05 },
    }),
  },
  drilled: {
    label: 'Drilled population',
    note: 'Everyone has practised this. The upper bound on what warning and rehearsal can buy you.',
    mix: () => ({
      ...defaultMix(),
      behaviour: { prompt: 0.72, seeker: 0.18, milling: 0.07, reluctant: 0.02, returner: 0.01 },
      spread: { speed: 1, info: 0.5, risk: 1, timing: 0.4 },
    }),
  },
  distrustful: {
    label: 'Warning not believed',
    note: 'A population that has been told to leave before and was wrong to. Almost nobody acts on the first warning.',
    mix: () => ({
      ...defaultMix(),
      behaviour: { prompt: 0.05, seeker: 0.30, milling: 0.30, reluctant: 0.29, returner: 0.06 },
    }),
  },
  uniform: {
    label: 'Uniform (control)',
    note: 'Every category equally likely and individuals barely differ. Not a real population — a control run for reading the others against.',
    mix: () => ({
      cohort: flat('cohort'), unit: flat('unit'), behaviour: flat('behaviour'),
      spread: { speed: 0.15, info: 0.15, risk: 0.15, timing: 0.15 },
    }),
  },
};

/* ── URL round-tripping ──────────────────────────────────────────────────── */
//
// A configured population should be a link. Shares are packed as two-digit
// percentages in the table's own key order, so the parameter stays short and
// stable rather than becoming a blob of JSON.

const pack = shares => (shares ? Object.values(shares)
  .map(v => String(Math.round(v * 100)).padStart(2, '0')).join('') : '');

const unpack = (axis, str) => {
  const keys = Object.keys(AXES[axis].table);
  if (!str || str.length !== keys.length * 2) return null;
  const raw = keys.map((k, i) => [k, Number(str.slice(i * 2, i * 2 + 2)) / 100]);
  if (raw.some(([, v]) => Number.isNaN(v))) return null;
  return normalise(Object.fromEntries(raw));
};

export function mixToParams(mix, params = new URLSearchParams()) {
  if (mix.cohort) params.set('mc', pack(mix.cohort)); else params.delete('mc');
  params.set('mu', pack(mix.unit));
  params.set('mb', pack(mix.behaviour));
  const s = mix.spread;
  params.set('sp', [s.speed, s.info, s.risk, s.timing].map(v => v.toFixed(2)).join(','));
  return params;
}

export function mixFromParams(params) {
  const mix = defaultMix();
  const c = unpack('cohort', params.get('mc'));
  if (c) mix.cohort = c;
  const u = unpack('unit', params.get('mu'));
  if (u) mix.unit = u;
  const b = unpack('behaviour', params.get('mb'));
  if (b) mix.behaviour = b;
  const sp = (params.get('sp') || '').split(',').map(Number);
  if (sp.length === 4 && sp.every(v => !Number.isNaN(v))) {
    mix.spread = { speed: sp[0], info: sp[1], risk: sp[2], timing: sp[3] };
  }
  return mix;
}

/** Which axes have been moved off their shipped/published source. Drives the
 *  "custom" badges, so a screenshot can never quietly misrepresent its source. */
export function customAxes(mix) {
  const d = defaultMix();
  const near = (a, b) => Object.keys(b).every(k => Math.abs((a[k] ?? 0) - b[k]) < 0.005);
  const out = [];
  if (mix.cohort) out.push('cohort');
  if (!near(mix.unit, d.unit)) out.push('unit');
  if (!near(mix.behaviour, d.behaviour)) out.push('behaviour');
  if (Object.keys(d.spread).some(k => Math.abs(mix.spread[k] - 1) > 0.01)) out.push('spread');
  return out;
}
