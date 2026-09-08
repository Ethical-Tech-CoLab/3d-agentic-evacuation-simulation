// The 3-D scene: a CARTO basemap under deck.gl layers.
//
// CARTO's dark-matter vector basemap is free and keyless, and its muted palette
// leaves the data layers to carry all the colour. deck.gl draws on top of it
// through MapboxOverlay in interleaved mode, so the extruded buildings sit in
// the same depth buffer as the basemap's own geometry.

import { COHORTS, TRAVEL_UNITS, BEHAVIOURS } from './population.js';

/**
 * Basemaps.
 *
 * Three, because they answer different questions. The dark vector map keeps the
 * city out of the way so the agents carry all the colour. The colour vector map
 * is the one to read street names and land use from. The satellite view is for
 * checking that a route goes where the ground says it should.
 *
 * The imagery is Sentinel-2 cloudless from EOX, not Esri. Esri's World Imagery
 * is sharper in cities, but it is display-only under Esri's terms, and this
 * repo's own terrain plan sets the rule: prefer Copernicus so an open,
 * attributable, redistributable dataset stays open. The cost is honest — the
 * Sentinel-2 mosaic is 10 m, so it softens as you zoom into a street.
 */
export const BASEMAPS = {
  dark: {
    label: 'Dark',
    note: 'CARTO dark matter. The city recedes; the agents carry the colour.',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    ground: 'dark',
    credit: 'Basemap © <a href="https://carto.com/about-carto/">CARTO</a>',
  },
  colour: {
    label: 'Colour',
    note: 'CARTO Voyager. Street names, parks and land use, sharp at every zoom.',
    style: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
    ground: 'light',
    credit: 'Basemap © <a href="https://carto.com/about-carto/">CARTO</a>',
  },
  satellite: {
    label: 'Satellite',
    note: 'Sentinel-2 cloudless (EOX, CC BY 4.0) over Copernicus data — 10 m, so it softens close in. Roads and labels are drawn over it.',
    style: satelliteStyle(),
    ground: 'imagery',
    // Attribution is a licence condition, not decoration: CC BY 4.0 requires it.
    credit: 'Imagery: <a href="https://s2maps.eu">Sentinel-2 cloudless 2020 by EOX</a> ' +
            '(modified Copernicus Sentinel data 2020, CC BY 4.0)',
  },
};

/** A MapLibre style with the Sentinel-2 mosaic underneath, and CARTO's road and
 *  label layers on top so the route geometry stays legible over imagery. */
function satelliteStyle() {
  return {
    version: 8,
    sources: {
      s2: {
        type: 'raster',
        tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg'],
        tileSize: 256,
        maxzoom: 15,
        attribution:
          'Sentinel-2 cloudless 2020 by <a href="https://s2maps.eu">EOX IT Services</a> ' +
          '(Contains modified Copernicus Sentinel data 2020)',
      },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#0b1016' } },
      { id: 's2', type: 'raster', source: 's2', paint: { 'raster-saturation': 0.12 } },
    ],
  };
}

export const CARTO_STYLE = BASEMAPS.dark.style;

const DAMAGE_COLOUR = [
  [250, 204, 21, 180],   // 0 possible
  [251, 146, 60, 200],   // 1 moderate
  [239, 68, 68, 220],    // 2 severe
  [220, 38, 38, 255],    // 3 destroyed
];

// Road classes, drawn at a width that reads their capacity.
const ROAD_WIDTH = {
  motorway: 9, trunk: 8, primary: 6.5, secondary: 5, tertiary: 3.6,
  residential: 2, unclassified: 2, living_street: 1.6,
  motorway_link: 4, trunk_link: 4, primary_link: 3.4, secondary_link: 3,
  tertiary_link: 2.4,
};
const roadWidth = c => ROAD_WIDTH[c] ?? 2;

/**
 * Building heights.
 *
 * A building entry is [lon, lat, height]; a height of 0 means OpenStreetMap
 * records none, and only those get a synthetic one. In Lower Manhattan and
 * Miami that is a few per cent of the skyline; in Las Vegas and Mariupol it is
 * most of it, and the app says so.
 *
 * The synthetic fallback used to be the *only* source, and it was not merely
 * approximate — it was inverted. It put its tallest buildings in a radial blob
 * around an arbitrary centre point, which in Lower Manhattan meant 84 m towers
 * on the Lower East Side and 23 m on Wall Street, with nothing above 100 m in a
 * skyline that reaches 541 m.
 */
export function makeHeight(centre) {
  const [clon, clat] = centre;
  return d => {
    const real = d[2];
    if (real > 0) return real;
    // No recorded height: a low, plausible massing that gets denser toward the
    // centre. Never tall, so an invented building cannot pose as a landmark.
    const [lon, lat] = d;
    const h = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453) % 1;
    const dist = Math.hypot(lon - clon, lat - clat);
    const urban = Math.max(0, 1 - dist / 0.045);
    return 8 + h * 10 + urban * 14;
  };
}

const COLOUR_BY = {
  // Every household its own colour, from four of its own variables at once.
  individual: { table: null, key: 'individual', label: 'Each household' },
  cohort: { table: COHORTS, key: 'cohort', label: 'Who they are' },
  unit: { table: TRAVEL_UNITS, key: 'unit', label: 'Who they travel with' },
  behaviour: { table: BEHAVIOURS, key: 'behaviour', label: 'How they behave' },
  route: { table: null, key: 'route', label: 'Route taken' },
};

/** Palettes per basemap. Dark-blue massing disappears on imagery and looks
 *  filthy on a light street map, so each ground gets its own. */
const GROUND = {
  dark: {
    road: [110, 130, 158, 190], minorRoad: [72, 88, 110, 150],
    building: (v, real) => (real ? [v * 0.72, v * 0.80, v] : [v * 0.55, v * 0.62, v * 0.78]),
    labelBg: [8, 12, 18, 200], zoneLine: [56, 189, 248, 180], zoneFill: [56, 189, 248, 30],
    buildingOpacity: 0.85,
  },
  light: {
    road: [90, 105, 130, 150], minorRoad: [140, 152, 170, 110],
    // Warm concrete rather than blue steel: on a pale street map, cool grey
    // massing reads as a shadow rather than as buildings.
    building: (v, real) => (real ? [v * 0.95, v * 0.90, v * 0.83] : [v * 0.80, v * 0.82, v * 0.86]),
    labelBg: [255, 255, 255, 225], zoneLine: [2, 132, 199, 210], zoneFill: [2, 132, 199, 28],
    buildingOpacity: 0.92,
  },
  imagery: {
    road: [235, 238, 245, 140], minorRoad: [200, 208, 220, 90],
    // Over imagery the massing has to read as built form without hiding the
    // ground it stands on.
    building: (v, real) => (real ? [v * 0.92, v * 0.88, v * 0.80] : [v * 0.72, v * 0.74, v * 0.78]),
    labelBg: [8, 12, 18, 215], zoneLine: [125, 211, 252, 225], zoneFill: [125, 211, 252, 22],
    buildingOpacity: 0.80,
  },
};

export function baseLayers(deck, ctx) {
  const { ColumnLayer, ScatterplotLayer, PathLayer, TextLayer } = deck;
  const { city, zones, routes, damage, buildings, roads, show, height } = ctx;
  const g = GROUND[ctx.ground] || GROUND.dark;
  const layers = [];

  if (show.roads) {
    layers.push(new PathLayer({
      id: 'roads',
      data: roads,
      getPath: d => d.coords,
      getColor: d => (roadWidth(d.cls) >= 6 ? g.road : g.minorRoad),
      getWidth: d => roadWidth(d.cls),
      widthMinPixels: 0.6,
      widthMaxPixels: 8,
      capRounded: true,
      jointRounded: true,
    }));
  }

  if (show.buildings) {
    layers.push(new ColumnLayer({
      id: 'buildings',
      data: buildings,
      diskResolution: 4,
      radius: 16,
      angle: 45,
      extruded: true,
      elevationScale: 1,
      getPosition: d => [d[0], d[1]],
      getElevation: height,
      // Lighter with height, so a real skyline reads as one. Buildings whose
      // height was invented are tinted cooler and kept dim, so a viewer can
      // see at a glance which parts of the massing are evidence.
      getFillColor: d => {
        const h = height(d);
        const v = 52 + Math.min(h, 220) * 0.62;
        return g.building(v, d[2] > 0);
      },
      opacity: g.buildingOpacity,
      updateTriggers: { getFillColor: ctx.ground },
    }));
  }

  if (show.damage && damage.length) {
    layers.push(new ScatterplotLayer({
      id: 'damage',
      data: damage,
      getPosition: d => [d[0], d[1]],
      getFillColor: d => DAMAGE_COLOUR[d[2]] || DAMAGE_COLOUR[0],
      getRadius: d => 22 + d[2] * 16,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      stroked: false,
    }));
  }

  // The evacuation routes — every one a real path over the road graph.
  layers.push(new PathLayer({
    id: 'routes',
    data: routes,
    getPath: r => r.coords,
    // Thin and semi-transparent on purpose: the route is a guide, and drawn
    // any heavier it is wider than the crowd walking it, so a column of
    // households reads as one solid tube instead of as people.
    getColor: r => (r.open ? [...r.colour, 150] : [110, 118, 130, 90]),
    getWidth: 10,
    widthMinPixels: 1.5,
    widthMaxPixels: 5,
    capRounded: true,
    jointRounded: true,
    updateTriggers: { getColor: routes.map(r => r.open).join() },
  }));

  layers.push(new ScatterplotLayer({
    id: 'route-exits',
    data: routes,
    getPosition: r => r.coords[r.coords.length - 1],
    getRadius: 130,
    radiusMinPixels: 4,
    getFillColor: r => [...r.colour, 60],
    getLineColor: r => [...r.colour, 235],
    lineWidthMinPixels: 2,
    stroked: true,
  }));

  layers.push(new ScatterplotLayer({
    id: 'zones',
    data: zones,
    getPosition: f => f.geometry.coordinates,
    getRadius: f => f.properties.radius || 180,
    getFillColor: g.zoneFill,
    getLineColor: g.zoneLine,
    lineWidthMinPixels: 1.5,
    stroked: true,
  }));

  layers.push(new TextLayer({
    id: 'labels',
    data: [
      ...routes.map(r => ({ text: r.name, at: r.coords[r.coords.length - 1], colour: r.colour })),
      ...zones.map(z => ({ text: z.properties.name, at: z.geometry.coordinates, colour: [125, 211, 252] })),
    ],
    getPosition: d => d.at,
    getText: d => d.text,
    getSize: 11,
    getColor: d => (ctx.ground === 'light' ? d.colour.map(c => c * 0.55) : d.colour),
    getPixelOffset: [0, -15],
    updateTriggers: { getColor: ctx.ground, getBackgroundColor: ctx.ground },
    fontFamily: 'ui-monospace, monospace',
    background: true,
    getBackgroundColor: g.labelBg,
    backgroundPadding: [4, 2],
    characterSet: 'auto',
  }));

  return layers;
}

export function agentLayers(deck, { live, trails, showTrails, time, colourBy, ground }) {
  const layers = [];
  const spec = COLOUR_BY[colourBy];
  const colourOf = d => {
    if (colourBy === 'individual') return d.colour;
    if (colourBy === 'route') return d.routeColour;
    return spec.table[d[spec.key]]?.colour || [200, 200, 200];
  };

  if (showTrails && trails.length) {
    layers.push(new deck.TripsLayer({
      id: 'trails',
      data: trails,
      getPath: d => d.path,
      getTimestamps: d => d.timestamps,
      getColor: d => d.colour,
      opacity: 0.5,
      widthMinPixels: 1.4,
      trailLength: 2400,
      currentTime: time,
    }));
  }

  layers.push(new deck.ScatterplotLayer({
    id: 'agents',
    data: live,
    getPosition: d => d.position,
    getFillColor: d => (d.done ? [...colourOf(d), 60] : [...colourOf(d), 235]),
    // A travel unit is drawn at a size that reads its headcount, so an
    // institutional unit of thirty is visibly not one person.
    getRadius: d => 12 + Math.sqrt(d.group) * 7,
    radiusMinPixels: 1.6,
    radiusMaxPixels: 6,
    // A dot with no edge vanishes into bright imagery or a pale street map.
    stroked: ground !== 'dark',
    getLineColor: ground === 'light' ? [255, 255, 255, 210] : [10, 14, 20, 190],
    lineWidthMinPixels: 0.8,
    updateTriggers: { getPosition: time, getFillColor: `${time}|${colourBy}`, getLineColor: ground },
  }));

  return layers;
}
