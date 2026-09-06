// The 3-D scene: a CARTO basemap under deck.gl layers.
//
// CARTO's dark-matter vector basemap is free and keyless, and its muted palette
// leaves the data layers to carry all the colour. deck.gl draws on top of it
// through MapboxOverlay in interleaved mode, so the extruded buildings sit in
// the same depth buffer as the basemap's own geometry.

import { COHORTS, TRAVEL_UNITS, BEHAVIOURS } from './population.js';

export const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

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
 * Building heights. The OSM extracts carry no per-building height, so we hash
 * the centroid into a plausible skyline — denser and taller toward the city
 * centre. Deliberately *illustrative geometry*, flagged as such in the legend.
 */
export function makeHeight(centre) {
  const [clon, clat] = centre;
  return ([lon, lat]) => {
    const h = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453) % 1;
    const d = Math.hypot(lon - clon, lat - clat);
    const urban = Math.max(0, 1 - d / 0.045);
    return 9 + h * 12 + urban * (h < 0.82 ? 8 : 42);
  };
}

export const COLOUR_BY = {
  // Every household its own colour, from four of its own variables at once.
  individual: { table: null, key: 'individual', label: 'Each household' },
  cohort: { table: COHORTS, key: 'cohort', label: 'Who they are' },
  unit: { table: TRAVEL_UNITS, key: 'unit', label: 'Who they travel with' },
  behaviour: { table: BEHAVIOURS, key: 'behaviour', label: 'How they behave' },
  route: { table: null, key: 'route', label: 'Route taken' },
};

export function baseLayers(deck, ctx) {
  const { ColumnLayer, ScatterplotLayer, PathLayer, TextLayer } = deck;
  const { city, zones, routes, damage, buildings, roads, show, height } = ctx;
  const layers = [];

  if (show.roads) {
    layers.push(new PathLayer({
      id: 'roads',
      data: roads,
      getPath: d => d.coords,
      getColor: d => (roadWidth(d.cls) >= 6 ? [110, 130, 158, 190] : [72, 88, 110, 150]),
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
      elevationScale: 1.6,
      getPosition: d => d,
      getElevation: height,
      getFillColor: d => {
        const v = 58 + Math.min(height(d), 60) * 1.7;
        return [v * 0.66, v * 0.76, v];
      },
      opacity: 0.82,
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
    getColor: r => (r.open ? [...r.colour, 225] : [110, 118, 130, 120]),
    getWidth: 26,
    widthMinPixels: 3,
    widthMaxPixels: 12,
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
    getFillColor: [56, 189, 248, 30],
    getLineColor: [56, 189, 248, 180],
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
    getColor: d => d.colour,
    getPixelOffset: [0, -15],
    fontFamily: 'ui-monospace, monospace',
    background: true,
    getBackgroundColor: [8, 12, 18, 200],
    backgroundPadding: [4, 2],
    characterSet: 'auto',
  }));

  return layers;
}

export function agentLayers(deck, { live, trails, showTrails, time, colourBy }) {
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
    updateTriggers: { getPosition: time, getFillColor: `${time}|${colourBy}` },
  }));

  return layers;
}
