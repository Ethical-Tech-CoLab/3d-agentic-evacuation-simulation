// The 3-D scene: a CARTO basemap under deck.gl layers.
//
// CARTO's dark-matter vector basemap is free and keyless, and its muted palette
// leaves the data layers to carry all the colour. deck.gl draws on top of it
// through MapboxOverlay in interleaved mode, so the extruded buildings sit in
// the same depth buffer as the basemap's own geometry.

export const CARTO_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export const INITIAL_VIEW = {
  longitude: 37.530, latitude: 47.103, zoom: 13.3, pitch: 58, bearing: -32,
};

const DAMAGE_COLOUR = [
  [250, 204, 21, 180],   // 0 possible
  [251, 146, 60, 200],   // 1 moderate
  [239, 68, 68, 220],    // 2 severe
  [220, 38, 38, 255],    // 3 destroyed
];

const POI_STYLE = {
  landmark:    { colour: [226, 232, 240], radius: 90 },
  origin_zone: { colour: [56, 189, 248], radius: 0 },
  exit:        { colour: [74, 222, 128], radius: 0 },
  destination: { colour: [134, 239, 172], radius: 0 },
  filtration:  { colour: [248, 113, 113], radius: 0 },
  danger_zone: { colour: [239, 68, 68],   radius: 0 },
  shelter:     { colour: [125, 211, 252], radius: 0 },
};

/**
 * Building heights. The OSM extract for Mariupol carries no per-building
 * height, so we hash the centroid into a plausible Soviet-plan skyline —
 * mostly 5-storey khrushchyovka stock with taller blocks along the centre.
 * This is deliberately *illustrative geometry*, flagged as such in the legend.
 */
export function hashedHeight([lon, lat]) {
  const h = Math.abs(Math.sin(lon * 12.9898 + lat * 78.233) * 43758.5453) % 1;
  const centre = Math.hypot(lon - 37.5432, lat - 47.0972);
  const urban = Math.max(0, 1 - centre / 0.045);
  return 9 + h * 12 + urban * (h < 0.82 ? 8 : 42);
}

export function baseLayers(deck, { buildings, damage, pois, corridor, showBuildings, showDamage }) {
  const { ColumnLayer, ScatterplotLayer, PathLayer, TextLayer } = deck;
  const zones = pois.features.filter(f => f.properties.poi_type === 'origin_zone');
  const marks = pois.features.filter(f => f.properties.poi_type !== 'origin_zone');

  return [
    showBuildings && new ColumnLayer({
      id: 'buildings',
      data: buildings,
      diskResolution: 4,
      radius: 16,
      angle: 45,
      extruded: true,
      elevationScale: 1.6,
      getPosition: d => d,
      getElevation: hashedHeight,
      getFillColor: d => {
        const h = hashedHeight(d);
        const v = 58 + Math.min(h, 60) * 1.7;
        return [v * 0.66, v * 0.76, v];
      },
      opacity: 0.85,
      pickable: false,
    }),

    showDamage && new ScatterplotLayer({
      id: 'damage',
      data: damage,
      getPosition: d => [d[0], d[1]],
      getFillColor: d => DAMAGE_COLOUR[d[2]] || DAMAGE_COLOUR[0],
      getRadius: d => 22 + d[2] * 16,
      radiusMinPixels: 2,
      radiusMaxPixels: 5,
      stroked: false,
      pickable: true,
      onHover: () => {},
    }),

    // The five published emergency-zone cohorts, sized by exposed population.
    new ScatterplotLayer({
      id: 'zones',
      data: zones,
      getPosition: f => f.geometry.coordinates,
      getRadius: f => f.properties.radius || 180,
      getFillColor: [56, 189, 248, 34],
      getLineColor: [56, 189, 248, 190],
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      pickable: true,
    }),

    new ScatterplotLayer({
      id: 'markers',
      data: marks,
      getPosition: f => f.geometry.coordinates,
      getRadius: f => f.properties.radius || POI_STYLE[f.properties.poi_type]?.radius || 120,
      getFillColor: f => [...(POI_STYLE[f.properties.poi_type]?.colour || [200, 200, 200]), 40],
      getLineColor: f => [...(POI_STYLE[f.properties.poi_type]?.colour || [200, 200, 200]), 220],
      lineWidthMinPixels: 1.5,
      stroked: true,
      filled: true,
      pickable: true,
    }),

    new TextLayer({
      id: 'labels',
      data: marks,
      getPosition: f => f.geometry.coordinates,
      getText: f => f.properties.name,
      getSize: 11,
      getColor: f => POI_STYLE[f.properties.poi_type]?.colour || [230, 230, 230],
      getPixelOffset: [0, -16],
      fontFamily: 'ui-monospace, monospace',
      background: true,
      getBackgroundColor: [10, 14, 20, 190],
      backgroundPadding: [4, 2],
      characterSet: 'auto',
    }),

    new PathLayer({
      id: 'corridor',
      data: [corridor],
      getPath: d => d,
      getColor: [74, 222, 128, 200],
      getWidth: 22,
      widthMinPixels: 3,
      capRounded: true,
      jointRounded: true,
    }),
  ].filter(Boolean);
}

export function agentLayers(deck, { live, trails, showTrails, time }) {
  const { ScatterplotLayer } = deck;
  const layers = [];

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

  layers.push(new ScatterplotLayer({
    id: 'agents',
    data: live,
    getPosition: d => d.position,
    getFillColor: d => (d.done ? [...d.colour, 70] : [...d.colour, 235]),
    getRadius: d => 14 + d.group * 4,
    radiusMinPixels: 1.6,
    radiusMaxPixels: 7,
    updateTriggers: { getPosition: time, getFillColor: time },
  }));

  return layers;
}
