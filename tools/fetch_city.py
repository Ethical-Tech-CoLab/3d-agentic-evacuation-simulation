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
import json, math, sys, time, heapq, os, io, csv, zipfile, urllib.request, urllib.parse, urllib.error
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
                    headers={"User-Agent": "ETC 3d-agentic-evacuation-simulation city pack builder (github.com/Ethical-Tech-CoLab/3d-agentic-evacuation-simulation)"})
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


# Metres per storey where only a level count is tagged. Deliberately generic:
# it is the standard rule of thumb, not a per-city survey.
STOREY_M = 3.2


def parse_height(tags):
    """Real height in metres from OSM tags, or None if the building has none.

    Order matters: an explicit `height` beats a levels count, and both beat
    guessing. Returning None rather than a default is the point — the renderer
    has to know which buildings it is inventing, so the app can say what share
    of a skyline is real.
    """
    h = tags.get("height")
    if h:
        try:
            # "52", "52 m", "52.5", occasionally "170 ft"
            txt = str(h).strip().lower().replace("metres", "").replace("meter", "").replace("m", "").strip()
            if "'" in str(h) or "ft" in str(h).lower():
                return round(float(str(h).lower().replace("ft", "").replace("'", "").strip()) * 0.3048, 1)
            v = float(txt)
            if 1 <= v <= 700:
                return round(v, 1)
        except (TypeError, ValueError):
            pass
    lv = tags.get("building:levels")
    if lv:
        try:
            v = float(str(lv).split(";")[0].strip())
            if 0 < v <= 180:
                return round(v * STOREY_M, 1)
        except (TypeError, ValueError):
            pass
    return None


def fetch_buildings(bbox):
    """Building centroids with their real height where OSM records one.

    Each entry is [lon, lat, height] with height 0 meaning "not known" — those,
    and only those, get a synthetic height at render time.
    """
    s, w, n, e = bbox
    q = f"""[out:json][timeout:600];
way["building"]({s},{w},{n},{e});
out center tags;"""
    data = overpass(q)
    pts = []
    real = 0
    for el in data.get("elements", []):
        c = el.get("center")
        if not c:
            continue
        h = parse_height(el.get("tags", {}))
        if h is not None:
            real += 1
        pts.append([round(c["lon"], 5), round(c["lat"], 5), h if h is not None else 0])
    print(f"    real heights: {real:,} of {len(pts):,} ({100*real/max(len(pts),1):.0f}%)", flush=True)
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
# through. Each is (label, lon, lat, note, safe). The route search finds the road
# path to them; nothing about the path itself is drawn by hand.
#
# `safe` is the difference between leaving the city and reaching safety. The
# eastward route out of Mariupol led to filtration, not to protection; counting
# someone who took it as "evacuated" would be the single most misleading thing
# this model could do, so it is counted separately and always has been labelled
# as such in the route note.
EXITS = {
    "mariupol": [
        ("West · Zaporizhzhia corridor", 37.4520, 47.1440, "The negotiated humanitarian corridor via Manhush", True),
        ("North · Donetsk highway (H-20)", 37.5480, 47.1720, "Toward Volnovakha; contested throughout the siege", True),
        ("East · Novoazovsk / Bezimenne", 37.6390, 47.1010, "Filtration-bound; an exit from the city, not to safety", False),
        ("South-west · coastal road", 37.4610, 47.0630, "Melekyne shore road, west along the Sea of Azov", True),
    ],
    "nyc": [
        ("Brooklyn Bridge", -73.9903, 40.7075, "Onto high ground in Brooklyn Heights", True),
        ("Manhattan Bridge", -73.9903, 40.7100, "Second East River crossing, into Dumbo", True),
        ("Williamsburg Bridge", -73.9835, 40.7167, "Northernmost crossing; Delancey Street approach", True),
        ("Holland Tunnel", -74.0110, 40.7270, "Westbound to New Jersey; closes early in a surge", True),
        ("North · Midtown high ground", -73.9840, 40.7500, "Out of Zone 1 on foot, up the island", True),
    ],
    "vegas": [
        ("North · Sahara Ave", -115.1560, 36.1440, "Off the Strip to the north", True),
        ("South · Russell Rd", -115.1720, 36.0820, "Toward the airport and Russell", True),
        ("West · I-15 / Valley View", -115.1880, 36.1080, "Across the interstate to the west", True),
        ("East · Paradise Rd", -115.1500, 36.1050, "Behind the resort line, to the east", True),
    ],
    "miami": [
        ("West · SW 8th St (Tamiami)", -80.2230, 25.7650, "Inland and out of Zone A", True),
        ("North · Biscayne Blvd / I-95", -80.1900, 25.8020, "Northbound off the peninsula", True),
        ("West · SR-836 Dolphin Expwy", -80.2220, 25.7850, "The designated westbound evacuation route", True),
        ("South · US-1 South Dixie", -80.2050, 25.7480, "Southbound along the ridge", True),
    ],
}

# ── Transit ──────────────────────────────────────────────────────────────────
#
# Stations and landings are real: they come from the operators' own published
# feeds, not from a sketch. Which of them the model treats as a way out, and how
# many people a minute each can board, are modelled — a station is a door with
# a throughput, and the throughput is a judgement stated in METHOD.md.
#
# Two things make a transit exit unlike a bridge. It can be *suspended* by the
# weather (a gale stops the ferries; a flooded tunnel stops the trains), and in
# a forecast hazard it is *shut down on a clock* before the hazard arrives — the
# MTA stopped the subway at 19:00 the evening before Sandy, seven and a half
# hours after the evacuation order. Both live in the engine, not here.
TRANSIT_SOURCES = {
    "nyc": [
        ("subway", "MTA Subway Stations, NY Open Data 39hk-dx4f (lines, ADA)",
         "https://data.ny.gov/api/views/39hk-dx4f/rows.csv?accessType=DOWNLOAD"),
        ("ferry", "NYC Ferry GTFS static feed (landings)",
         "http://nycferry.connexionz.net/rtt/public/utility/gtfs.aspx"),
        ("rail", "PATH GTFS static feed, Port Authority via Trillium (stations)",
         "https://data.trilliumtransit.com/gtfs/path-nj-us/path-nj-us.zip"),
    ],
}

# Stations the feeds above do not carry, placed by hand from the operator's
# published terminal location. Each says where it came from.
TRANSIT_FIXED = {
    "nyc": [
        {"mode": "ferry", "name": "Whitehall Terminal · Staten Island Ferry", "lines": "Staten Island Ferry",
         "operator": "NYC DOT", "ada": True, "lon": -74.0130, "lat": 40.7012,
         "source": "NYC DOT Staten Island Ferry, Whitehall Terminal (placed by hand)"},
        {"mode": "rail", "name": "Penn Station · LIRR / NJ Transit / Amtrak", "lines": "LIRR, NJ Transit, Amtrak",
         "operator": "MTA / NJT / Amtrak", "ada": True, "lon": -73.9936, "lat": 40.7505,
         "source": "Penn Station, Amtrak/LIRR (placed by hand)"},
    ],
}

# The transit exits the model routes to. (label, lon, lat, mode, lines,
# boarding capacity in people/minute, note). Capacity is a modelled throughput
# for the whole station or terminal in the outbound direction — not a measured
# figure — and is stated as such wherever it is shown.
TRANSIT_EXITS = {
    "nyc": [
        ("Fulton St · subway hub", -74.0095, 40.7104, "subway", "2 3 4 5 A C J Z", 500,
         "Eight lines under one roof; the zone's deepest-reaching station"),
        ("World Trade Center · PATH", -74.0119, 40.7127, "rail", "PATH to Hoboken and Newark", 300,
         "Under the Hudson to New Jersey"),
        ("Whitehall · Staten Island Ferry", -74.0130, 40.7012, "ferry", "Staten Island Ferry", 150,
         "One 4,400-passenger boat every half hour; the first thing a gale stops"),
        ("Pier 11 · NYC Ferry", -74.0061, 40.7032, "ferry", "NYC Ferry ER · SB · RW · AS", 25,
         "Small boats to Brooklyn, Queens and the Rockaways"),
        ("Canal St · subway", -74.0018, 40.7195, "subway", "6 J N Q R W Z", 400,
         "Seven lines at the zone's northern edge"),
        ("Delancey–Essex · subway", -73.9881, 40.7186, "subway", "F J M Z", 300,
         "The Lower East Side's hub; J/M/Z cross the Williamsburg Bridge"),
        ("Penn Station · rail", -73.9936, 40.7505, "rail", "LIRR · NJ Transit · Amtrak", 600,
         "Out of the city by rail, once you are already out of the zone"),
    ],
}


def _in_bbox(lon, lat, bbox):
    s, w, n, e = bbox
    return s <= lat <= n and w <= lon <= e


def _get(url, timeout=120):
    req = urllib.request.Request(url, headers={"User-Agent": "ETC 3d-agentic-evacuation-simulation city pack builder"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def _gtfs_stops(raw):
    """stops.txt rows from a GTFS zip, as dicts."""
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        return list(csv.DictReader(io.TextIOWrapper(z.open("stops.txt"), encoding="utf-8-sig")))


def fetch_transit_feeds(city_id, bbox):
    """Every station and landing inside the bbox, from the operators' feeds."""
    feats = []
    for mode, label, url in TRANSIT_SOURCES.get(city_id, []):
        print(f"  transit · {label}…", flush=True)
        raw = _get(url)
        if mode == "subway" and "data.ny.gov" in url:
            # One feature per station complex, so Fulton St is one place with
            # eight lines rather than four platforms with two each.
            by_complex = {}
            for r in csv.DictReader(io.StringIO(raw.decode("utf-8-sig"))):
                lon, lat = float(r["GTFS Longitude"]), float(r["GTFS Latitude"])
                if not _in_bbox(lon, lat, bbox):
                    continue
                c = by_complex.setdefault(r["Complex ID"], {
                    "mode": "subway", "name": r["Stop Name"], "operator": "MTA New York City Transit",
                    "lines": set(), "ada": False, "lon": [], "lat": [], "source": label})
                c["lines"].update(r["Daytime Routes"].split())
                c["ada"] = c["ada"] or r["ADA"] in ("1", "2")
                c["lon"].append(lon); c["lat"].append(lat)
            for c in by_complex.values():
                c["lines"] = " ".join(sorted(c["lines"]))
                c["lon"] = round(sum(c["lon"]) / len(c["lon"]), 5)
                c["lat"] = round(sum(c["lat"]) / len(c["lat"]), 5)
                feats.append(c)
        else:
            for r in _gtfs_stops(raw):
                # Parent stations only where the feed has them; every stop otherwise.
                if r.get("location_type") not in (None, "", "0", "1"):
                    continue
                if r.get("parent_station"):
                    continue
                lon, lat = float(r["stop_lon"]), float(r["stop_lat"])
                if not _in_bbox(lon, lat, bbox):
                    continue
                feats.append({
                    "mode": mode, "name": r["stop_name"],
                    "operator": "NYC Ferry" if mode == "ferry" else "PATH (Port Authority)",
                    "lines": "NYC Ferry" if mode == "ferry" else "PATH",
                    "ada": r.get("wheelchair_boarding", "") == "1",
                    "lon": round(lon, 5), "lat": round(lat, 5), "source": label,
                })
    feats.extend(TRANSIT_FIXED.get(city_id, []))
    return feats


def fetch_transit_osm(bbox):
    """Fallback for a city without published feeds: whatever OSM has."""
    s, w, n, e = bbox
    q = f"""[out:json][timeout:180];
(node["railway"="station"]({s},{w},{n},{e});
 node["amenity"="ferry_terminal"]({s},{w},{n},{e});
 way["amenity"="ferry_terminal"]({s},{w},{n},{e}););
out center tags;"""
    feats = []
    for el in overpass(q).get("elements", []):
        t = el.get("tags", {})
        lon = el.get("lon") or el.get("center", {}).get("lon")
        lat = el.get("lat") or el.get("center", {}).get("lat")
        if lon is None or not t.get("name"):
            continue
        if t.get("amenity") == "ferry_terminal":
            mode = "ferry"
        elif t.get("station") in ("subway", "light_rail", "monorail"):
            mode = "subway"
        else:
            mode = "rail"
        feats.append({"mode": mode, "name": t["name"], "operator": t.get("operator") or t.get("network") or "",
                      "lines": t.get("network", ""), "ada": t.get("wheelchair") == "yes",
                      "lon": round(lon, 5), "lat": round(lat, 5), "source": "OpenStreetMap (ODbL)"})
    return feats


def transit_features(city_id, bbox):
    try:
        feats = fetch_transit_feeds(city_id, bbox) if city_id in TRANSIT_SOURCES else fetch_transit_osm(bbox)
    except Exception as e:                      # noqa: BLE001
        print(f"  ✗ transit inventory unavailable: {e}", flush=True)
        return []
    return [{
        "type": "Feature",
        "properties": {k: v for k, v in f.items() if k not in ("lon", "lat")},
        "geometry": {"type": "Point", "coordinates": [f["lon"], f["lat"]]},
    } for f in feats]


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

# Real cohort structure per city, from the US Census Bureau's American Community
# Survey (ACS) 2024 1-year estimates, retrieved via the Census Reporter API.
#
# The four cohorts are made MUTUALLY EXCLUSIVE so they partition the population:
#
#   child     under 18
#   elderly   65 and over
#   disabled  ages 18-64 with a disability   (older and younger disabled people
#             fall in `elderly` and `child`, so nobody is counted twice)
#   adult     everyone else
#
# Tables B01001 (sex by age) and B18101 (sex by age by disability status).
#
# RESOLUTION CAVEAT, stated because it matters: these are COUNTY figures applied
# to a district. Lower Manhattan is not demographically identical to the whole
# of New York County, and Brickell is not Miami-Dade. Sub-county geographies
# (PUMA, community district) were not reachable through the open API. Real
# county data beats the generic US average this replaced, but it is not the
# neighbourhood.
CITY_COHORTS = {
    "nyc": {
        "children": 0.133, "elderly": 0.187, "disabled": 0.059,
        "geography": "New York County (Manhattan), NY",
        "source": "US Census Bureau ACS 2024 1-year, tables B01001 and B18101",
    },
    "miami": {
        "children": 0.197, "elderly": 0.172, "disabled": 0.039,
        "geography": "Miami-Dade County, FL",
        "source": "US Census Bureau ACS 2024 1-year, tables B01001 and B18101",
    },
    "vegas": {
        # Residents of Clark County. For the Strip this is arguably the wrong
        # population — see the "Strip visitors" mix in src/mix.js, and the note
        # below.
        "children": 0.215, "elderly": 0.165, "disabled": 0.074,
        "geography": "Clark County, NV",
        "source": "US Census Bureau ACS 2024 1-year, tables B01001 and B18101",
        "caveat": ("Residents of Clark County. At any given hour the Strip is "
                   "mostly visitors, whose age structure is very different — "
                   "use the 'Strip visitors' population mix for that."),
    },
}


def zone_features(city_id):
    if city_id == "mariupol":
        # The five published ETC cohorts, kept in the provenance file rather
        # than restated here.
        src = json.load(open(os.path.join(ROOT, "data", "pois.geojson")))
        return [f for f in src["features"] if f["properties"]["poi_type"] == "origin_zone"]
    out = []
    split = CITY_COHORTS[city_id]
    for zid, name, lon, lat, radius, pop in MODELLED_ZONES[city_id]:
        ch = round(pop * split["children"])
        el = round(pop * split["elderly"])
        di = round(pop * split["disabled"])
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
    if os.path.exists(bpath) and not os.environ.get("REFETCH_BUILDINGS"):
        buildings = json.load(open(bpath))
    else:
        print("  buildings…", flush=True)
        buildings = fetch_buildings(cfg["bbox"])
        json.dump(buildings, open(bpath, "w"), separators=(",", ":"))
    with_height = sum(1 for b in buildings if len(b) > 2 and b[2] > 0)
    print(f"  buildings: {len(buildings):,} ({with_height:,} with a real height)", flush=True)

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
    # Road exits first, then transit exits. A transit exit is routed exactly
    # like a bridge — a real road path to the station door — and differs only
    # in what the engine does with it once someone arrives.
    exits = [(f"R{i+1}", label, lon, lat, note, safe, {})
             for i, (label, lon, lat, note, safe) in enumerate(EXITS[city_id])]
    exits += [(f"T{i+1}", label, lon, lat, note, True,
               {"transit": True, "mode": mode, "lines": lines, "capacity": cap})
              for i, (label, lon, lat, mode, lines, cap, note) in enumerate(TRANSIT_EXITS.get(city_id, []))]
    routes = []
    for rid, label, lon, lat, note, safe, extra in exits:
        dst = nearest_node(adj, (lon, lat))
        path, metres = dijkstra(adj, src, dst)
        if not path:
            print(f"  ✗ no road path to {label}", flush=True)
            continue
        simple = simplify(path)
        routes.append({
            "type": "Feature",
            "properties": {
                "route_id": rid, "name": label, "note": note,
                "length_m": round(metres), "vertices": len(simple),
                "exit": [lon, lat], "safe": safe, **extra,
            },
            "geometry": {"type": "LineString", "coordinates": simple},
        })
        print(f"  ✓ {label}: {metres/1000:.1f} km, {len(path)}→{len(simple)} pts"
              f"{'' if safe else '   [NOT SAFETY — counted separately]'}"
              f"{'   [' + extra['mode'] + ', ' + str(extra['capacity']) + '/min]' if extra else ''}", flush=True)

    transit = transit_features(city_id, cfg["bbox"])
    json.dump({"type": "FeatureCollection", "features": transit},
              open(os.path.join(out_dir, "transit.geojson"), "w"), indent=1)
    print(f"  transit: {len(transit)} stations and landings", flush=True)

    json.dump({"type": "FeatureCollection", "features": routes},
              open(os.path.join(out_dir, "routes.geojson"), "w"), indent=1)

    # Approach legs: for every zone × route, the road path from that zone to the
    # point on the route nearest to it.
    #
    # Without these, an agent walks a straight line from wherever it starts to
    # its nearest route vertex — which in Lower Manhattan means walking across
    # the Hudson. An evacuation model that lets people cross open water is not
    # modelling an evacuation. Every metre an agent covers is now on a road.
    approaches = []
    for z in zones:
        zsrc = nearest_node(adj, tuple(z["geometry"]["coordinates"]))
        for rt in routes:
            coords = rt["geometry"]["coordinates"]
            # The vertex of this route nearest to this zone — the natural place
            # for someone from here to join it.
            best_i, best_d = 0, float("inf")
            for i, c in enumerate(coords):
                d = haversine(tuple(c), tuple(z["geometry"]["coordinates"]))
                if d < best_d:
                    best_d, best_i = d, i
            zdst = nearest_node(adj, tuple(coords[best_i]))
            path, metres = dijkstra(adj, zsrc, zdst)
            if not path:
                # No road connection at all: fall back to joining at the route's
                # head, which every zone can reach because that is where the
                # routes were measured from.
                path, metres, best_i = [list(zsrc), list(coords[0])], \
                    haversine(zsrc, tuple(coords[0])), 0
            approaches.append({
                "type": "Feature",
                "properties": {"zone_id": z["properties"]["zone_id"],
                               "route_id": rt["properties"]["route_id"],
                               "entry_index": best_i, "length_m": round(metres)},
                "geometry": {"type": "LineString", "coordinates": simplify(path)},
            })
    # Transfer legs: for every transit exit × every other route, the road path
    # from the station door to the nearest point on that route. This is what a
    # household walks when it reaches a shut station — without it the engine
    # would have to draw a straight line from Whitehall to the Brooklyn Bridge,
    # across the East River.
    transfers = 0
    for src_rt in routes:
        if not src_rt["properties"].get("transit"):
            continue
        door = tuple(src_rt["geometry"]["coordinates"][-1])
        dsrc = nearest_node(adj, door)
        for rt in routes:
            if rt is src_rt:
                continue
            coords = rt["geometry"]["coordinates"]
            best_i, best_d = 0, float("inf")
            for i, c in enumerate(coords):
                d = haversine(tuple(c), door)
                if d < best_d:
                    best_d, best_i = d, i
            path, metres = dijkstra(adj, dsrc, nearest_node(adj, tuple(coords[best_i])))
            if not path:
                path, metres, best_i = [list(dsrc), list(coords[0])], haversine(dsrc, tuple(coords[0])), 0
            approaches.append({
                "type": "Feature",
                "properties": {"from_route": src_rt["properties"]["route_id"],
                               "route_id": rt["properties"]["route_id"],
                               "entry_index": best_i, "length_m": round(metres)},
                "geometry": {"type": "LineString", "coordinates": simplify(path)},
            })
            transfers += 1

    json.dump({"type": "FeatureCollection", "features": approaches},
              open(os.path.join(out_dir, "approaches.geojson"), "w"), indent=1)
    print(f"  approaches: {len(approaches) - transfers} (zone x route legs) + {transfers} transfer legs", flush=True)

    # Where agents actually start: real building centroids inside each zone's
    # radius. A jittered circle puts people in the river; a building does not.
    homes = {}
    for z in zones:
        zlon, zlat = z["geometry"]["coordinates"]
        rad = z["properties"].get("radius", 250)
        inside = [b for b in buildings if haversine((b[0], b[1]), (zlon, zlat)) <= rad]
        if len(inside) < 25:
            # Sparse zone (a park, a port): widen until there is something to
            # stand on, rather than silently falling back to open ground.
            inside = sorted(buildings, key=lambda b: haversine((b[0], b[1]), (zlon, zlat)))[:200]
        # Cap the list so the pack stays small; agents sample from it.
        step = max(1, len(inside) // 1200)
        homes[z["properties"]["zone_id"]] = inside[::step][:1200]
        print(f"    {z['properties']['zone_id']}: {len(homes[z['properties']['zone_id']])} start buildings", flush=True)
    json.dump(homes, open(os.path.join(out_dir, "homes.json"), "w"), separators=(",", ":"))

    json.dump({
        "id": city_id, "name": cfg["name"], "country": cfg["country"],
        "demography": (
            {"source": "Ethical Tech CoLab mariupol-evacuation-model, published "
                       "emergency-zone cohorts (late Mar-Apr 2022)",
             "geography": "Five surveyed emergency zones, Mariupol",
             "real": True}
            if city_id == "mariupol" else
            {"source": CITY_COHORTS[city_id]["source"],
             "geography": CITY_COHORTS[city_id]["geography"],
             "caveat": CITY_COHORTS[city_id].get("caveat"),
             "note": "County figures applied to a district; zone populations remain modelled.",
             "real": True}),
        "hazard": cfg["hazard"], "hazardLabel": cfg["hazard_label"],
        "note": cfg["note"], "bbox": cfg["bbox"], "centre": cfg["centre"],
        "transit": {
            "sources": sorted({f["properties"]["source"] for f in transit}),
            "note": "Station and landing locations are the operators' published figures. "
                    "Which stations are exits, and their boarding capacity, are modelled.",
        } if transit else None,
        "counts": {"buildings": len(buildings), "roadWays": len(ways),
                   "routes": len(routes), "zones": len(zones),
                   "transitRoutes": sum(1 for r in routes if r["properties"].get("transit")),
                   "transitStations": len(transit),
                   "buildingsWithRealHeight": with_height,
                   "exposed": sum(z["properties"]["population"] for z in zones)},
    }, open(os.path.join(out_dir, "meta.json"), "w"), indent=1)
    print(f"  wrote {out_dir}", flush=True)


if __name__ == "__main__":
    for cid in (sys.argv[1:] or list(CITIES)):
        build_city(cid)
