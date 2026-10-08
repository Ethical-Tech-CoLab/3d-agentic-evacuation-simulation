// City registry.
//
// A city is a data pack, not code: buildings, a road network, origin zones, and
// four or more evacuation routes that are real paths over that road network.
// Adding a city means running tools/fetch_city.py, not editing the engine.

export const CITIES = [
  {
    id: 'mariupol',
    label: 'Mariupol',
    sub: 'Siege · March 2022',
    view: { longitude: 37.530, latitude: 47.103, zoom: 12.6, pitch: 58, bearing: -32 },
    // The one city whose demography is published rather than modelled.
    real: true,
  },
  {
    id: 'nyc',
    label: 'Lower Manhattan',
    sub: 'Coastal storm surge · Zone 1',
    view: { longitude: -73.995, latitude: 40.719, zoom: 13.4, pitch: 55, bearing: 22 },
  },
  {
    id: 'vegas',
    label: 'Las Vegas Strip',
    sub: 'Mass-gathering egress',
    view: { longitude: -115.170, latitude: 36.108, zoom: 13.2, pitch: 58, bearing: -8 },
  },
  {
    id: 'miami',
    label: 'Miami · Downtown & Brickell',
    sub: 'Hurricane · Zone A',
    view: { longitude: -80.196, latitude: 25.774, zoom: 13.7, pitch: 56, bearing: 14 },
  },
];

export const byId = id => CITIES.find(c => c.id === id) || CITIES[0];

/** Is this a city we actually ship? The `?city=` parameter is used to build a
 *  fetch path, so it is checked against the registry before it gets there — not
 *  because it can escape the origin (it cannot, and there is nothing to reach
 *  on a static host), but because an unrecognised value should give you
 *  Mariupol rather than an unhandled rejection and a blank page. */
export const isKnown = id => CITIES.some(c => c.id === id);

export async function loadCity(id) {
  if (!isKnown(id)) id = CITIES[0].id;
  const base = `data/cities/${id}`;
  // Transit is optional: a pack built before stations existed, or a city with
  // none, simply has no file, and a static host answers that with a 404 page.
  const optional = r => (r.ok ? r.json() : { features: [] });
  const [meta, buildings, roads, zones, routes, approaches, homes, transit] = await Promise.all([
    fetch(`${base}/meta.json`).then(r => r.json()),
    fetch(`${base}/buildings.json`).then(r => r.json()),
    fetch(`${base}/roads.json`).then(r => r.json()),
    fetch(`${base}/zones.geojson`).then(r => r.json()),
    fetch(`${base}/routes.geojson`).then(r => r.json()),
    fetch(`${base}/approaches.geojson`).then(r => r.json()),
    fetch(`${base}/homes.json`).then(r => r.json()),
    fetch(`${base}/transit.geojson`).then(optional, () => ({ features: [] })),
  ]);
  // Mariupol alone carries a damage layer; the others have no equivalent, and
  // inventing one would be the exact kind of false precision this repo avoids.
  let damage = [];
  if (id === 'mariupol') damage = await fetch(`${base}/damage.json`).then(r => r.json());
  return { meta, buildings, roads, zones: zones.features, routes: routes.features,
           approaches: approaches.features, homes, damage, transit: transit.features || [] };
}
