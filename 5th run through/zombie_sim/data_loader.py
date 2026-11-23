"""
Load and VALIDATE the real-world datasets in data/.

Raises DataValidationError listing every problem found. It never fills in missing
values with zeros. The only value allowed to be blank is a station's January snowfall
normal, because NOAA does not publish one for every station. That case is kept as None
and the weather formulas say how they treat it.
"""
import csv
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(HERE), "data")
SQ_M_PER_SQ_MI = 2589988.110336
M_PER_MI = 1609.344

STATE_FIPS = {
    "01": "Alabama", "02": "Alaska", "04": "Arizona", "05": "Arkansas", "06": "California", "08": "Colorado",
    "09": "Connecticut", "10": "Delaware", "11": "District of Columbia", "12": "Florida", "13": "Georgia",
    "15": "Hawaii", "16": "Idaho", "17": "Illinois", "18": "Indiana", "19": "Iowa", "20": "Kansas",
    "21": "Kentucky", "22": "Louisiana", "23": "Maine", "24": "Maryland", "25": "Massachusetts",
    "26": "Michigan", "27": "Minnesota", "28": "Mississippi", "29": "Missouri", "30": "Montana",
    "31": "Nebraska", "32": "Nevada", "33": "New Hampshire", "34": "New Jersey", "35": "New Mexico",
    "36": "New York", "37": "North Carolina", "38": "North Dakota", "39": "Ohio", "40": "Oklahoma",
    "41": "Oregon", "42": "Pennsylvania", "44": "Rhode Island", "45": "South Carolina", "46": "South Dakota",
    "47": "Tennessee", "48": "Texas", "49": "Utah", "50": "Vermont", "51": "Virginia", "53": "Washington",
    "54": "West Virginia", "55": "Wisconsin", "56": "Wyoming",
}


class DataValidationError(Exception):
    def __init__(self, problems):
        self.problems = problems
        super().__init__("Data validation failed:\n  - " + "\n  - ".join(problems))


def _read(path):
    if not os.path.exists(path):
        raise DataValidationError([f"Missing data file: {path}"])
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _num(value, label, problems, allow_blank=False):
    if value is None or str(value).strip() == "":
        if allow_blank:
            return None
        problems.append(f"{label}: missing value")
        return None
    try:
        x = float(value)
    except ValueError:
        problems.append(f"{label}: not a number ({value!r})")
        return None
    if math.isnan(x) or math.isinf(x):
        problems.append(f"{label}: not a finite number")
        return None
    return x


def load_counties(path=None, problems=None):
    own = problems is None
    problems = [] if own else problems
    rows = _read(path or os.path.join(DATA_DIR, "city_data.csv"))
    counties = {}
    for i, r in enumerate(rows, 2):
        geoid = (r.get("geoid") or "").strip()
        label = f"city_data.csv line {i} ({geoid or '?'})"
        if len(geoid) != 5 or not geoid.isdigit():
            problems.append(f"{label}: GEOID must be 5 digits")
            continue
        if STATE_FIPS.get(geoid[:2]) != (r.get("state_name") or "").strip():
            problems.append(f"{label}: state FIPS {geoid[:2]} does not match state '{r.get('state_name')}'")
        if (r.get("geo_type") or "").strip() != "county":
            problems.append(f"{label}: geo_type must be 'county'")
        pop = _num(r.get("pop_estimate_2023"), f"{label} population", problems)
        base = _num(r.get("pop_estimates_base_2020"), f"{label} 2020 base", problems)
        area = _num(r.get("land_area_sq_m"), f"{label} land area", problems)
        lat = _num(r.get("internal_point_lat"), f"{label} latitude", problems)
        lon = _num(r.get("internal_point_lon"), f"{label} longitude", problems)
        if pop is not None and (pop <= 0 or pop != int(pop)):
            problems.append(f"{label}: population must be a positive whole number")
        if base is not None and base <= 0:
            problems.append(f"{label}: 2020 base population must be positive")
        if area is not None and area <= 0:
            problems.append(f"{label}: land area must be positive")
        if lat is not None and not (17 <= lat <= 72):
            problems.append(f"{label}: latitude outside the U.S.")
        if lon is not None and not (-180 <= lon <= -60):
            problems.append(f"{label}: longitude outside the U.S.")
        if geoid in counties:
            problems.append(f"{label}: duplicate GEOID")
        if None in (pop, area, lat, lon):
            continue
        land_sq_mi = area / SQ_M_PER_SQ_MI
        counties[geoid] = {
            "geoid": geoid, "name": r["county_name"].strip(), "state": r["state_name"].strip(),
            "population": int(pop), "pop_2020_base": int(base) if base else None,
            "land_sq_mi": land_sq_mi, "density": pop / land_sq_mi if land_sq_mi > 0 else -1,
            "lat": lat, "lon": lon,
        }
        if counties[geoid]["density"] <= 0:
            problems.append(f"{label}: density must be positive")
    if own and problems:
        raise DataValidationError(problems)
    return counties


def load_stations(path=None, problems=None):
    own = problems is None
    problems = [] if own else problems
    rows = _read(path or os.path.join(DATA_DIR, "weather_data.csv"))
    stations = {}
    for i, r in enumerate(rows, 2):
        sid = (r.get("station_id") or "").strip()
        label = f"weather_data.csv line {i} ({sid or '?'})"
        if len(sid) != 11 or not sid[:3].isalpha():
            problems.append(f"{label}: station ID should look like USW00012345")
        t = _num(r.get("jan_tavg_normal_f"), f"{label} January temperature", problems)
        p = _num(r.get("jan_prcp_normal_in"), f"{label} January precipitation", problems)
        s = _num(r.get("jan_snow_normal_in"), f"{label} January snowfall", problems, allow_blank=True)
        lat = _num(r.get("latitude"), f"{label} latitude", problems)
        lon = _num(r.get("longitude"), f"{label} longitude", problems)
        elev = _num(r.get("elevation_m"), f"{label} elevation", problems)
        if t is not None and not (-40 <= t <= 90):
            problems.append(f"{label}: January temperature {t}F is not plausible")
        if p is not None and p < 0:
            problems.append(f"{label}: precipitation cannot be negative")
        if s is not None and s < 0:
            problems.append(f"{label}: snowfall cannot be negative")
        if sid in stations:
            problems.append(f"{label}: duplicate station")
        if None in (t, p, lat, lon):
            continue
        stations[sid] = {"id": sid, "label": r["station_label"].strip(), "tavg_f": t, "prcp_in": p,
                         "snow_in": s, "lat": lat, "lon": lon, "elev_m": elev}
    if own and problems:
        raise DataValidationError(problems)
    return stations


def haversine_mi(lat1, lon1, lat2, lon2):
    r = 3958.7613
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_routes(counties, stations, path=None, problems=None):
    own = problems is None
    problems = [] if own else problems
    rows = _read(path or os.path.join(DATA_DIR, "route_data.csv"))
    routes = {}
    for i, r in enumerate(rows, 2):
        code = (r.get("route_code") or "").strip()
        label = f"route_data.csv line {i} ({code} stop {r.get('stop_day')})"
        day = _num(r.get("stop_day"), f"{label} stop_day", problems)
        lat = _num(r.get("waypoint_lat"), f"{label} latitude", problems)
        lon = _num(r.get("waypoint_lon"), f"{label} longitude", problems)
        geoid, sid = (r.get("county_geoid") or "").strip(), (r.get("station_id") or "").strip()
        if geoid not in counties:
            problems.append(f"{label}: county {geoid} is not in city_data.csv")
        if sid not in stations:
            problems.append(f"{label}: station {sid} is not in weather_data.csv")
        if (r.get("waypoint_source") or "").strip() not in ("station", "county_internal_point"):
            problems.append(f"{label}: waypoint_source must be 'station' or 'county_internal_point'")
        is_last = day == 8
        leg_m = _num(r.get("leg_to_next_m"), f"{label} leg distance", problems, allow_blank=is_last)
        leg_s = _num(r.get("leg_to_next_s"), f"{label} leg duration", problems, allow_blank=is_last)
        if not is_last and leg_m is not None and leg_m <= 0:
            problems.append(f"{label}: leg distance must be positive")
        if None in (day, lat, lon):
            continue
        stop = {"day": int(day), "label": r["stop_label"].strip(), "geoid": geoid, "station": sid,
                "lat": lat, "lon": lon, "waypoint_source": r["waypoint_source"].strip(),
                "leg_mi": (leg_m / M_PER_MI) if leg_m else 0.0, "leg_drive_h": (leg_s / 3600) if leg_s else 0.0}
        if geoid in counties and sid in stations:
            c, s = counties[geoid], stations[sid]
            stop["station_distance_mi"] = haversine_mi(c["lat"], c["lon"], s["lat"], s["lon"])
        routes.setdefault(code, []).append(stop)
    for code, stops in routes.items():
        stops.sort(key=lambda s: s["day"])
        if [s["day"] for s in stops] != list(range(1, 9)):
            problems.append(f"route {code}: needs stops 1..8 exactly once")
        cum = 0.0
        for s in stops:
            s["cum_mi"] = cum
            cum += s["leg_mi"]
    if own and problems:
        raise DataValidationError(problems)
    return routes


def load_svi(counties, path, problems):
    """Optional CDC/ATSDR SVI 2022 file: overall SVI (0-1), % aged 65+, % households with no vehicle."""
    if not os.path.exists(path):
        return None
    out = {}
    for i, r in enumerate(_read(path), 2):
        g = (r.get("geoid") or "").strip()
        label = f"svi_data.csv line {i} ({g})"
        if g not in counties:
            problems.append(f"{label}: county not in city_data.csv")
            continue
        svi = _num(r.get("svi_overall"), f"{label} SVI", problems, allow_blank=True)
        a65 = _num(r.get("pct_age65"), f"{label} % 65+", problems, allow_blank=True)
        nv = _num(r.get("pct_no_vehicle"), f"{label} % no vehicle", problems, allow_blank=True)
        if svi is not None and not (0 <= svi <= 1):
            problems.append(f"{label}: SVI must be between 0 and 1 (CDC uses -999 for missing; leave it blank)")
        for v, nm in ((a65, "% 65+"), (nv, "% no vehicle")):
            if v is not None and not (0 <= v <= 100):
                problems.append(f"{label}: {nm} must be 0-100")
        out[g] = {"svi": svi, "pct65": a65, "pct_no_vehicle": nv}
    missing = [g for g in counties if g not in out]
    if missing:
        problems.append(f"svi_data.csv is missing counties: {missing}")
    return out


def load_world(data_dir=None):
    """Load all three datasets and validate them together."""
    d = data_dir or DATA_DIR
    problems = []
    counties = load_counties(os.path.join(d, "city_data.csv"), problems)
    stations = load_stations(os.path.join(d, "weather_data.csv"), problems)
    routes = load_routes(counties, stations, os.path.join(d, "route_data.csv"), problems)
    svi = load_svi(counties, os.path.join(d, "svi_data.csv"), problems)
    if len(routes) != 7:
        problems.append(f"expected 7 routes, found {len(routes)}")
    if problems:
        raise DataValidationError(problems)
    world = {"counties": counties, "stations": stations, "routes": routes, "svi": svi or {}}
    ages = [v["pct65"] for v in (svi or {}).values() if v["pct65"] is not None]
    world["age_ref"] = sum(ages) / len(ages) if ages else None
    seed_routes(world)
    return world


def seed_routes(world, p=None):
    """v3 arrival seeding: store each route stop's starting infectious share as stop["i0"]."""
    from .params import PARAMS as DEFAULT
    from .seir import calibrate_i0, age_multiplier
    p = p or DEFAULT
    for stops in world["routes"].values():
        for k, s in enumerate(stops):
            if p.get("seed_mode") != "arrival":
                s["i0"] = None
                continue
            c = world["counties"][s["geoid"]]
            sv = world["svi"].get(s["geoid"])
            am = age_multiplier(sv["pct65"], world["age_ref"], p) if sv and world["age_ref"] is not None else 1.0
            s["i0"] = calibrate_i0(c["density"], world["stations"][s["station"]]["tavg_f"], am, k, p)
