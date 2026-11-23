# Data sources

Every number in `city_data.csv`, `weather_data.csv` and `route_data.csv` was downloaded from the source named below (retrieved November 2026). Nothing in these three files was estimated or made up. Values the source did not publish are left **blank**, and the code treats a blank as missing, never as zero.

## city_data.csv: counties (44 rows)

| Column | Source | Notes |
|---|---|---|
| `geoid` | U.S. Census Bureau FIPS code | 2-digit state + 3-digit county |
| `county_name`, `state_name` | Census | |
| `geo_type` | | Always `county`. Every place in the game is a **county**, not a city proper. "New York City" uses New York County (Manhattan); "Boston" uses Suffolk County. |
| `pop_estimates_base_2020` | Census Vintage 2023 county population estimates, file `co-est2023-alldata.csv`, column `ESTIMATESBASE2020` | https://www2.census.gov/programs-surveys/popest/datasets/2020-2023/counties/totals/ |
| `pop_estimate_2023` | Same file, column `POPESTIMATE2023` (July 1, 2023) | Used by the game |
| `land_area_sq_m` | Census TIGERweb, `State_County` MapServer layer 1, field `AREALAND` (square meters) | https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1 |
| `internal_point_lat`, `internal_point_lon` | Same TIGERweb layer, `CENTLAT` / `CENTLON` | Census "internal point", not a city center |

**Transformation (done in code, `zombie_sim/data_loader.py`):** land area in sq mi = `AREALAND / 2,589,988.11`; density = `POPESTIMATE2023 / land sq mi`. Density is never stored, always calculated.

## weather_data.csv: NOAA stations (42 rows)

| Column | Source |
|---|---|
| `station_id`, `latitude`, `longitude`, `elevation_m` | NOAA NCEI station metadata returned with the normals |
| `jan_tavg_normal_f` | NOAA NCEI U.S. Climate Normals 1991–2020, monthly, `MLY-TAVG-NORMAL`, January (°F) |
| `jan_prcp_normal_in` | Same, `MLY-PRCP-NORMAL`, January (inches) |
| `jan_snow_normal_in` | Same, `MLY-SNOW-NORMAL`, January (inches). **Blank** for Poughkeepsie (USW00014757), Laramie (USW00024022) and Denver (USW00003017; not used on a route) because NOAA publishes no snowfall normal for them. |

API used: `https://www.ncei.noaa.gov/access/services/data/v1?dataset=normals-monthly-1991-2020&stations=...&dataTypes=MLY-TAVG-NORMAL,MLY-PRCP-NORMAL,MLY-SNOW-NORMAL&format=csv`

These are **long-term January averages**, not the weather on any real day. Several scenarios describe fictional storms (for example "-12°F in Laramie"). The game uses the normal for its math and labels the story weather as fiction.

**Station choice:** the main airport or long-record station nearest each route stop. Distance from the county internal point is calculated in code (`station_distance_mi`). Three stops have no first-order station in the county and use the nearest one with complete normals:

| Stop | Station | Distance |
|---|---|---|
| Guadalupe County, NM (BOS day 7) | Albuquerque airport | about 104 mi |
| Emery County, UT (PIT day 6) | Grand Junction airport, CO | about 116 mi |
| Rockingham County, VA (AUS day 4) | Washington Dulles airport | about 82 mi |

Rejected during collection: USW00094012 (turned out to be Havre, MT, from its returned coordinates); USW00014714 and USW00023063 (no normals returned).

## route_data.csv: route stops (7 routes × 8 stops)

| Column | Source |
|---|---|
| `stop_day`, `stop_label` | The game's story (stop 1 = start city, stops 2–7 = each day's morning location, stop 8 = safe zone) |
| `county_geoid`, `station_id` | Links to the two files above |
| `waypoint_lat`, `waypoint_lon` | The NOAA station coordinates, or the Census county internal point when `waypoint_source = county_internal_point` |
| `leg_to_next_m`, `leg_to_next_s` | Driving distance (meters) and free-flow duration (seconds) to the next stop from the OSRM routing engine on OpenStreetMap data: `https://router.project-osrm.org/route/v1/driving/lon,lat;lon,lat;...`. The duration is stored for reference only; the game calculates its own winter speed. |

**Transformation:** miles = meters / 1,609.344; cumulative miles summed in code. Route totals: NYC 2,249, BOS 2,404, PIT 2,249, SLC 2,230, JAC 2,416, SEA 2,412, AUS 2,296 road miles.

OpenStreetMap data © OpenStreetMap contributors, ODbL.

## svi_data.csv (added in version 2)

| Column | Source |
|---|---|
| `geoid` | Census county FIPS, the 44 route counties |
| `svi_overall` | CDC/ATSDR Social Vulnerability Index 2022, county `RPL_THEMES` (0 = least, 1 = most vulnerable) |
| `pct_age65` | SVI 2022 `EP_AGE65` (ACS 2018–2022 estimate of % aged 65+) |
| `pct_no_vehicle` | SVI 2022 `EP_NOVEH` (% of households with no vehicle) |
| `source`, `retrieved` | CDC SVI 2022 ArcGIS county layer (`.../CDC_ATSDR_Social_Vulnerability_Index_2022_USA/FeatureServer`, layer 1), retrieved 2026-11-19 |

**Use in the game:** SVI only changes evacuation difficulty: the SVI event (SVI ≥ 0.75) and a congestion delay of 2 + 6 × SVI hours on some options. It never changes infection or survival chance directly. % aged 65+ scales the fictional zombie's spread rate by ±1% per point from the route mean (clamped 0.9–1.1); this is a FICTIONAL rule using a REAL input.

## r0_reference.csv and rabies_reference.csv

Published values entered by hand with citations (Guerra et al. 2017; Biggerstaff et al. 2014; Liu et al. 2020; Liu & Rocklöv 2021; Hampson et al. 2009; CDC MMWR 2008 and 2010). Used for the R0 event text and the end-screen comparison table, and the rabies event. No game probability is computed from them.

## Not included (and why)

| Dataset | Status | How to add it |
|---|---|---|
| OpenStreetMap hospitals, grocery stores, fuel stations near each stop | **Not collected.** The Overpass API was not reachable from the build environment. The game does **not** pretend to know these; fuel found in town is a labeled fictional rule. | Query Overpass (`https://overpass-api.de/api/interpreter`) with e.g. `[out:json];(node["amenity"="fuel"](around:16000,LAT,LON););out count;` for each stop and save `poi_data.csv` with columns `county_geoid, amenity, count_within_10mi, query_date`. Then replace `town_fuel_min/max` in `params.py` with a rule based on the count. |
| Real outbreak data | Not applicable | The zombie is fictional. Spread rates are invented and labeled as such. |

## Replacing a dataset

1. Edit or replace the CSV (keep the column names).
2. Run `python -m pytest tests/test_data.py`. The loader reports every invalid or missing value by file and line.
3. Run `python tools/build_web.py` to rebuild the web game's data bundle.
