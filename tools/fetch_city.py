#!/usr/bin/env python3
"""Build a city pack from OpenStreetMap.

For each city we need three things the simulation cannot invent:

  buildings  centroids of every mapped building, for the skyline
  roads      the drivable/walkable network, as a graph
  routes     at least four evacuation routes, each a real path *through that
             graph* from an origin zone to an exit — not a drawn line

The routes are the point. A straight line from a zone to an exit is a claim
about geometry; a Dijkstra path over the real road graph is a claim about the
city, and it goes around the water, the rail cut and the park the way people
actually would.

Usage:  python3 tools/fetch_city.py <city-id>
"""
import json, math, sys, time, heapq, os, urllib.request, urllib.parse, urllib.error
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Road classes we keep, ordered by how much evacuation traffic they can carry.
# The capacity figure is lanes-worth of throughput, used to weight the route
# search toward roads that can actually take a column of people.
ROAD_CLASSES = {
    "motorway": 4.0, "motorway_link": 2.0,
    "trunk": 3.5, "trunk_link": 2.0,
    "primary": 3.0, "primary_link": 1.8,
    "secondary": 2.2, "secondary_link": 1.4,
    "tertiary": 1.6, "tertiary_link": 1.2,
    "residential": 1.0, "unclassified": 1.0, "living_street": 0.8,
}

CITIES = {
    "mariupol": {
        "name": "Mariupol",
        "country": "Ukraine",
        "hazard": "siege",
        "hazard_label": "Siege · March 2022",
        "bbox": (47.05, 37.45, 47.20, 37.65),
        "centre": (37.5432, 47.0972),
        "note": "Retrospective. Zone cohorts are the published ETC severity-model figures.",
    },
    "nyc": {
        "name": "Lower Manhattan",
        "country": "United States",
        "hazard": "surge",
        "hazard_label": "Coastal storm surge · Zone 1",
        "bbox": (40.700, -74.021, 40.752, -73.968),
        "centre": (-73.9905, 40.7240),
        "note": "Illustrative. Footprint of NYC OEM hurricane evacuation Zone 1; population is modelled, not surveyed.",
    },
    "vegas": {
        "name": "Las Vegas Strip",
        "country": "United States",
        "hazard": "crowd",
        "hazard_label": "Mass-gathering egress",
        "bbox": (36.080, -115.190, 36.135, -115.145),
        "centre": (-115.1720, 36.1055),
        "note": "Illustrative. The upstream Race Condition marathon corridor, read as a crowd-egress problem.",
    },
    "miami": {
        "name": "Downtown Miami & Brickell",
        "country": "United States",
        "hazard": "hurricane",
        "hazard_label": "Hurricane · Zone A",
        "bbox": (25.745, -80.225, 25.805, -80.165),
        "centre": (-80.1930, 25.7745),
        "note": "Illustrative. Footprint of Miami-Dade evacuation Zone A; population is modelled, not surveyed.",
    },
}


def overpass(query, tries=3):
    last = None
    for attempt in range(tries):
        for url in ENDPOINTS:
            try:
                req = urllib.request.Request(
                    url, data=("data=" + urllib.parse.quote(query)).encode(),
                    headers={"User-Agent": "ETC mariupol-3d city pack builder (github.com/Ethical-Tech-CoLab/mariupol-3d)"})
                with urllib.request.urlopen(req, timeout=600) as r:
                    return json.loads(r.read())
            except Exception as e:                      # noqa: BLE001
                last = e
                print(f"    {url.split('/')[2]} failed: {e}", flush=True)
                time.sleep(8)
    raise RuntimeError(f"Overpass unavailable: {last}")


R = 6371000.0

def haversine(a, b):
    lon1, lat1 = a; lon2, lat2 = b
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    h = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(h))


def fetch_buildings(bbox):
    s, w, n, e = bbox
    q = f"""[out:json][timeout:600];
way["building"]({s},{w},{n},{e});
out center;"""
    data = overpass(q)
    pts = []
    for el in data.get("elements", []):
        c = el.get("center")
        if c:
            pts.append([round(c["lon"], 5), round(c["lat"], 5)])
    return pts


def fetch_roads(bbox):
    s, w, n, e = bbox
    cls = "|".join(ROAD_CLASSES)
    q = f"""[out:json][timeout:600];
way["highway"~"^({cls})$"]({s},{w},{n},{e});
out geom;"""
    data = overpass(q)
    ways = []
    for el in data.get("elements", []):
        g = el.get("geometry") or []
        if len(g) < 2:
            continue
        ways.append({
            "cls": el["tags"]["highway"],
            "name": el["tags"].get("name"),
            "coords": [[round(p["lon"], 5), round(p["lat"], 5)] for p in g],
        })
    return ways


def build_graph(ways):
    """Node = rounded coordinate. Edge cost = metres, discounted by capacity so
    the search prefers a slightly longer arterial over a shorter side street."""
    adj = defaultdict(list)
    for wi, w in enumerate(ways):
        cap = ROAD_CLASSES.get(w["cls"], 1.0)
        cs = w["coords"]
        for i in range(len(cs) - 1):
            a, b = tuple(cs[i]), tuple(cs[i + 1])
            if a == b:
                continue
            d = haversine(a, b)
            cost = d / (0.55 + 0.45 * cap)
            adj[a].append((b, cost, d, wi))
            adj[b].append((a, cost, d, wi))
    return adj


def nearest_node(adj, pt):
    best, bd = None, float("inf")
    for n in adj:
        d = (n[0] - pt[0]) ** 2 + (n[1] - pt[1]) ** 2
        if d < bd:
            bd, best = d, n
    return best


def dijkstra(adj, src, dst):
    dist = {src: 0.0}
    prev = {}
    pq = [(0.0, src)]
    seen = set()
    while pq:
        d, u = heapq.heappop(pq)
        if u in seen:
            continue
        seen.add(u)
        if u == dst:
            break
        for v, cost, _m, _wi in adj[u]:
            nd = d + cost
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(pq, (nd, v))
    if dst not in dist:
        return None, None
    path, u = [dst], dst
    while u in prev:
        u = prev[u]
        path.append(u)
    path.reverse()
    metres = sum(haversine(path[i], path[i + 1]) for i in range(len(path) - 1))
    return [list(p) for p in path], metres


def simplify(coords, tol_m=8.0):
    """Douglas-Peucker, so a 4,000-vertex route ships as a few hundred."""
    if len(coords) < 3:
        return coords
    def rdp(pts):
        if len(pts) < 3:
            return pts
        a, b = pts[0], pts[-1]
        worst, idx = 0.0, 0
        for i in range(1, len(pts) - 1):
            p = pts[i]
            # perpendicular distance in metres, flat-earth is fine at this scale
            ax, ay = a; bx, by = b; px, py = p
            k = math.cos(math.radians(ay))
            dx, dy = (bx - ax) * k, by - ay
            L = dx * dx + dy * dy
            t = 0.0 if L == 0 else max(0, min(1, (((px - ax) * k) * dx + (py - ay) * dy) / L))
            cx, cy = ax + (bx - ax) * t, ay + (by - ay) * t
            d = haversine((px, py), (cx, cy))
            if d > worst:
                worst, idx = d, i
        if worst <= tol_m:
            return [a, b]
        return rdp(pts[:idx + 1])[:-1] + rdp(pts[idx:])
    sys.setrecursionlimit(10000)
    return rdp(coords)


# Exits are real, named egress points — the places a city actually empties
# through. Each is (label, lon, lat, note). The route search finds the road path
# to them; nothing about the path itself is drawn by hand.
EXITS = {
    "mariupol": [
        ("West · Zaporizhzhia corridor", 37.4520, 47.1440, "The negotiated humanitarian corridor via Manhush"),
        ("North · Donetsk highway (H-20)", 37.5480, 47.1720, "Toward Volnovakha; contested throughout the siege"),
        ("East · Novoazovsk / Bezimenne", 37.6390, 47.1010, "Filtration-bound; an exit from the city, not to safety"),
        ("South-west · coastal road", 37.4610, 47.0630, "Melekyne shore road, west along the Sea of Azov"),
    ],
    "nyc": [
        ("Brooklyn Bridge", -73.9903, 40.7075, "Onto high ground in Brooklyn Heights"),
        ("Manhattan Bridge", -73.9903, 40.7100, "Second East River crossing, into Dumbo"),
        ("Williamsburg Bridge", -73.9835, 40.7167, "Northernmost crossing; Delancey Street approach"),
        ("Holland Tunnel", -74.0110, 40.7270, "Westbound to New Jersey; closes early in a surge"),
        ("North · Midtown high ground", -73.9840, 40.7500, "Out of Zone 1 on foot, up the island"),
    ],
    "vegas": [
        ("North · Sahara Ave", -115.1560, 36.1440, "Off the Strip to the north"),
        ("South · Russell Rd", -115.1720, 36.0820, "Toward the airport and Russell"),
        ("West · I-15 / Valley View", -115.1880, 36.1080, "Across the interstate to the west"),
        ("East · Paradise Rd", -115.1500, 36.1050, "Behind the resort line, to the east"),
    ],
    "miami": [
        ("West · SW 8th St (Tamiami)", -80.2230, 25.7650, "Inland and out of Zone A"),
        ("North · Biscayne Blvd / I-95", -80.1900, 25.8020, "Northbound off the peninsula"),
        ("West · SR-836 Dolphin Expwy", -80.2220, 25.7850, "The designated westbound evacuation route"),
        ("South · US-1 South Dixie", -80.2050, 25.7480, "Southbound along the ridge"),
    ],
}

# Origin zones. Mariupol's five are the published ETC cohorts and are read from
# the existing pack; the other cities get a modelled zone set whose totals are
# stated as modelled everywhere they are shown.
MODELLED_ZONES = {
    "nyc": [
        ("Z1", "Financial District", -74.0100, 40.7060, 320, 21400),
        ("Z2", "Battery Park City", -74.0165, 40.7120, 300, 13900),
        ("Z3", "Two Bridges", -73.9945, 40.7115, 300, 16800),
        ("Z4", "Lower East Side", -73.9835, 40.7180, 340, 24600),
        ("Z5", "Tribeca / Hudson Sq", -74.0080, 40.7215, 300, 15300),
    ],
    "vegas": [
        ("Z1", "Strip · north resorts", -115.1690, 36.1220, 260, 14200),
        ("Z2", "Strip · centre", -115.1725, 36.1120, 260, 19800),
        ("Z3", "Strip · south resorts", -115.1755, 36.0985, 260, 16400),
        ("Z4", "Convention corridor", -115.1530, 36.1290, 300, 9100),
        ("Z5", "Harmon / Koval", -115.1650, 36.1055, 240, 7500),
    ],
    "miami": [
        ("Z1", "Brickell", -80.1930, 25.7620, 300, 32800),
        ("Z2", "Downtown core", -80.1910, 25.7760, 280, 18400),
        ("Z3", "Edgewater", -80.1880, 25.7940, 300, 16200),
        ("Z4", "Port / Bayfront", -80.1810, 25.7790, 280, 5400),
        ("Z5", "Little Havana edge", -80.2130, 25.7690, 320, 21100),
    ],
}

# Age structure used to split a modelled zone into cohorts. Roughly the US urban
# profile; stated as modelled, unlike Mariupol's published counts.
US_SPLIT = {"children": 0.17, "elderly": 0.16, "disabled": 0.11}


def zone_features(city_id):
    if city_id == "mariupol":
        # The five published ETC cohorts, kept in the provenance file rather
        # than restated here.
        src = json.load(open(os.path.join(ROOT, "data", "pois.geojson")))
        return [f for f in src["features"] if f["properties"]["poi_type"] == "origin_zone"]
    out = []
    for zid, name, lon, lat, radius, pop in MODELLED_ZONES[city_id]:
        ch = round(pop * US_SPLIT["children"])
        el = round(pop * US_SPLIT["elderly"])
        di = round(pop * US_SPLIT["disabled"])
        out.append({
            "type": "Feature",
            "properties": {
                "poi_type": "origin_zone", "zone_id": zid,
                "name": f"{zid} · {name} · {pop:,}",
                "population": pop, "vulnerable": ch + el + di,
                "children": ch, "elderly": el, "disabled": di,
                "damage_pct": 0, "radius": radius, "modelled": True,
            },
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
        })
    return out


def build_city(city_id):
    cfg = CITIES[city_id]
    out_dir = os.path.join(ROOT, "data", "cities", city_id)
    os.makedirs(out_dir, exist_ok=True)
    print(f"[{city_id}] {cfg['name']} — {cfg['hazard_label']}", flush=True)

    bpath = os.path.join(out_dir, "buildings.json")
    if os.path.exists(bpath):
        # Mariupol's is vendored rather than fetched: its provenance (the ETC
        # mariupol_lights.json centroids) is better documented than a fresh
        # Overpass pull would be, so it is never re-fetched.
        buildings = json.load(open(bpath))
    else:
        print("  buildings…", flush=True)
        buildings = fetch_buildings(cfg["bbox"])
        json.dump(buildings, open(bpath, "w"), separators=(",", ":"))
    print(f"  buildings: {len(buildings):,}", flush=True)

    rpath = os.path.join(out_dir, "roads.json")
    if os.path.exists(rpath):
        ways = json.load(open(rpath))
    else:
        print("  roads…", flush=True)
        ways = fetch_roads(cfg["bbox"])
        json.dump(ways, open(rpath, "w"), separators=(",", ":"))
    print(f"  roads: {len(ways):,} ways", flush=True)

    adj = build_graph(ways)
    print(f"  graph: {len(adj):,} nodes", flush=True)

    zones = zone_features(city_id)
    json.dump({"type": "FeatureCollection", "features": zones},
              open(os.path.join(out_dir, "zones.geojson"), "w"), indent=1)

    # One route per exit. All four start from the population-weighted centroid of
    # the origin zones, so their lengths are comparable — a route measured from
    # whichever zone happens to sit next to an exit would flatter that exit.
    # Every route is a real path over the road graph.
    tot = sum(z["properties"]["population"] for z in zones)
    origin = (
        sum(z["geometry"]["coordinates"][0] * z["properties"]["population"] for z in zones) / tot,
        sum(z["geometry"]["coordinates"][1] * z["properties"]["population"] for z in zones) / tot,
    )
    src = nearest_node(adj, origin)
    routes = []
    for i, (label, lon, lat, note) in enumerate(EXITS[city_id]):
        dst = nearest_node(adj, (lon, lat))
        path, metres = dijkstra(adj, src, dst)
        if not path:
            print(f"  ✗ no road path to {label}", flush=True)
            continue
        simple = simplify(path)
        routes.append({
            "type": "Feature",
            "properties": {
                "route_id": f"R{i+1}", "name": label, "note": note,
                "length_m": round(metres), "vertices": len(simple),
                "exit": [lon, lat],
            },
            "geometry": {"type": "LineString", "coordinates": simple},
        })
        print(f"  ✓ {label}: {metres/1000:.1f} km, {len(path)}→{len(simple)} pts", flush=True)

    json.dump({"type": "FeatureCollection", "features": routes},
              open(os.path.join(out_dir, "routes.geojson"), "w"), indent=1)

    json.dump({
        "id": city_id, "name": cfg["name"], "country": cfg["country"],
        "hazard": cfg["hazard"], "hazardLabel": cfg["hazard_label"],
        "note": cfg["note"], "bbox": cfg["bbox"], "centre": cfg["centre"],
        "counts": {"buildings": len(buildings), "roadWays": len(ways),
                   "routes": len(routes), "zones": len(zones),
                   "exposed": sum(z["properties"]["population"] for z in zones)},
    }, open(os.path.join(out_dir, "meta.json"), "w"), indent=1)
    print(f"  wrote {out_dir}", flush=True)


if __name__ == "__main__":
    for cid in (sys.argv[1:] or list(CITIES)):
        build_city(cid)
