"""
Download the next round of real data for Zombie Escape (does NOT change or run the game).

  python tools/download_new_data.py            # everything
  python tools/download_new_data.py --only svi
  python tools/download_new_data.py --only age     (needs a free Census API key, see below)
  python tools/download_new_data.py --only reference

Creates these files in data/ (next to city_data.csv):

  svi_data.csv          CDC/ATSDR Social Vulnerability Index 2022, one row per game county
  age_data.csv          Census ACS 5-year 2019-2023: population 65+, median age, per game county
  rabies_reference.csv  Rabies incubation and post-exposure treatment timing (CDC publications)
  r0_reference.csv      Published R0 values for real diseases (peer-reviewed studies)

Rules this script follows:
  * It only downloads; it never edits the game's parameters or code.
  * A value the source does not publish (CDC uses -999) is written as BLANK, never 0.
  * Every failed download stops with a clear message. Nothing is silently skipped or invented.
  * The two reference files are not downloadable datasets. They are values copied by hand from
    the publications listed in their 'source' and 'url' columns, so they can be checked.

Census API key (needed only for age_data.csv):
  1. Get a free key: https://api.census.gov/data/key_signup.html
  2. Windows:   set CENSUS_API_KEY=yourkey        Mac/Linux:  export CENSUS_API_KEY=yourkey
  3. Run this script again.

Standard library only (Python 3.10+).
"""
import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TODAY = date.today().isoformat()
UA = {"User-Agent": "ZombieEscape-class-project/1.0"}

SVI_URL = ("https://onemap.cdc.gov/onemapservices/rest/services/SVI/"
           "CDC_ATSDR_Social_Vulnerability_Index_2022_USA/MapServer/1/query")
ACS_YEAR = "2023"   # ACS 5-year 2019-2023
ACS_URL = f"https://api.census.gov/data/{ACS_YEAR}/acs/acs5"
# B01001 = Sex by Age. 65+ = male 020-025 + female 044-049. B01002_001E = median age.
AGE65_VARS = [f"B01001_{n:03d}E" for n in list(range(20, 26)) + list(range(44, 50))]


class DownloadError(Exception):
    pass


def get_json(url, tries=3):
    last = None
    for k in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as r:
                text = r.read().decode("utf-8")
            try:
                return json.loads(text)
            except json.JSONDecodeError:
                raise DownloadError(f"Not JSON from {url[:120]}...\nFirst 300 characters:\n{text[:300]}")
        except (urllib.error.URLError, TimeoutError) as e:
            last = e
            time.sleep(2 * (k + 1))
    raise DownloadError(f"Could not reach {url[:120]}... after {tries} tries: {last}")


def game_counties():
    path = os.path.join(DATA, "city_data.csv")
    if not os.path.exists(path):
        raise DownloadError(f"{path} not found. Run this script from inside the zombie_escape folder.")
    with open(path, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    return [(r["geoid"], r["county_name"], r["state_name"]) for r in rows]


def num_or_blank(v):
    """CDC SVI uses -999 for 'not available'. Keep it blank, never 0."""
    if v is None:
        return ""
    try:
        x = float(v)
    except (TypeError, ValueError):
        return ""
    return "" if x <= -999 else x


def write_csv(name, fields, rows, note):
    path = os.path.join(DATA, name)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    print(f"  wrote {path} ({len(rows)} rows) - {note}")


# ---------------------------------------------------------------- 1. CDC/ATSDR SVI 2022
def download_svi():
    print("CDC/ATSDR Social Vulnerability Index 2022 (county layer)...")
    counties = game_counties()
    fields = ["STCNTY", "COUNTY", "STATE", "E_TOTPOP", "RPL_THEMES", "RPL_THEME1", "RPL_THEME2",
              "RPL_THEME3", "RPL_THEME4", "EP_NOVEH", "EP_AGE65", "EP_CROWD", "EP_MUNIT", "EP_DISABL"]
    found = {}
    for i in range(0, len(counties), 10):
        batch = counties[i:i + 10]
        where = "STCNTY IN (" + ",".join(f"'{g}'" for g, _, _ in batch) + ")"
        url = SVI_URL + "?" + urllib.parse.urlencode({"where": where, "outFields": ",".join(fields),
                                                       "returnGeometry": "false", "f": "json"})
        data = get_json(url)
        if "error" in data:
            raise DownloadError(f"CDC SVI service error: {data['error']}")
        for feat in data.get("features", []):
            a = feat["attributes"]
            found[str(a["STCNTY"]).zfill(5)] = a
        time.sleep(0.5)
    missing = [g for g, _, _ in counties if g not in found]
    if missing:
        raise DownloadError(f"SVI has no row for these game counties: {missing}")
    rows = []
    for g, name, state in counties:
        a = found[g]
        rows.append({
            "geoid": g, "county_name": a["COUNTY"], "state_name": a["STATE"],
            "svi_year": 2022, "svi_population": num_or_blank(a["E_TOTPOP"]),
            "svi_overall": num_or_blank(a["RPL_THEMES"]),
            "svi_socioeconomic": num_or_blank(a["RPL_THEME1"]),
            "svi_household": num_or_blank(a["RPL_THEME2"]),
            "svi_minority_language": num_or_blank(a["RPL_THEME3"]),
            "svi_housing_transport": num_or_blank(a["RPL_THEME4"]),
            "pct_no_vehicle": num_or_blank(a["EP_NOVEH"]),
            "pct_age65_svi": num_or_blank(a["EP_AGE65"]),
            "pct_crowded_housing": num_or_blank(a["EP_CROWD"]),
            "pct_multiunit_housing": num_or_blank(a["EP_MUNIT"]),
            "pct_disability": num_or_blank(a["EP_DISABL"]),
            "source": "CDC/ATSDR SVI 2022, county layer (built from ACS 2018-2022)",
            "retrieved": TODAY,
        })
    write_csv("svi_data.csv", list(rows[0]), rows,
              "percentile ranks 0-1 (1 = most vulnerable); blank = not published by CDC")


# ---------------------------------------------------------------- 2. Census ACS age structure
def download_age():
    print(f"Census ACS 5-year {int(ACS_YEAR) - 4}-{ACS_YEAR}: age structure (table B01001, B01002)...")
    key = os.environ.get("CENSUS_API_KEY", "").strip()
    if not key:
        raise DownloadError("CENSUS_API_KEY is not set. The Census API now requires a free key:\n"
                            "  1. https://api.census.gov/data/key_signup.html\n"
                            "  2. set CENSUS_API_KEY=yourkey  (Mac/Linux: export CENSUS_API_KEY=yourkey)\n"
                            "  3. run: python tools/download_new_data.py --only age")
    counties = game_counties()
    by_state = {}
    for g, _, _ in counties:
        by_state.setdefault(g[:2], []).append(g[2:])
    get = ["NAME", "B01001_001E", "B01002_001E"] + AGE65_VARS
    values = {}
    for st, cos in sorted(by_state.items()):
        url = ACS_URL + "?" + urllib.parse.urlencode({"get": ",".join(get), "for": "county:" + ",".join(cos),
                                                      "in": f"state:{st}", "key": key})
        data = get_json(url)
        head = data[0]
        for row in data[1:]:
            r = dict(zip(head, row))
            values[r["state"] + r["county"]] = r
        time.sleep(0.3)
    missing = [g for g, _, _ in counties if g not in values]
    if missing:
        raise DownloadError(f"ACS returned no row for: {missing}")
    rows = []
    for g, name, state in counties:
        r = values[g]
        total = float(r["B01001_001E"])
        parts = [r[v] for v in AGE65_VARS]
        if total <= 0 or any(p is None or float(p) < 0 for p in parts):
            raise DownloadError(f"ACS value missing or negative for county {g}: {r}")
        age65 = sum(float(p) for p in parts)
        med = float(r["B01002_001E"])
        rows.append({
            "geoid": g, "county_name": name, "state_name": state, "acs_name": r["NAME"],
            "acs_total_population": int(total), "acs_age65plus": int(age65),
            "pct_age65plus": round(100 * age65 / total, 2),
            "median_age": "" if med < 0 else med,
            "source": f"Census ACS 5-year {int(ACS_YEAR) - 4}-{ACS_YEAR}, B01001 + B01002",
            "retrieved": TODAY,
        })
    write_csv("age_data.csv", list(rows[0]), rows, "65+ share calculated from B01001 age groups")


# ---------------------------------------------------------------- 3. reference tables (from publications)
RABIES = [
    ["incubation_typical", "1 to 3 months", "", "CDC MMWR 2010;59(RR-2), Rupprecht et al.",
     "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5902a1.htm", "Usual time from exposure to symptoms"],
    ["incubation_range", "days to years", "", "CDC MMWR 2010;59(RR-2)",
     "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5902a1.htm", "Rare cases fall far outside the usual range"],
    ["pep_unvaccinated_vaccine_days", "0, 3, 7, 14", "4", "CDC MMWR 2010;59(RR-2) (ACIP 4-dose schedule)",
     "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5902a1.htm",
     "Day 0 = as soon as possible after exposure; plus rabies immune globulin once at the start"],
    ["pep_immune_globulin", "once, day 0", "1", "CDC MMWR 2008;57(RR-3)",
     "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5703a1.htm", "Only for people not previously vaccinated"],
    ["pep_previously_vaccinated_vaccine_days", "0, 3", "2", "CDC MMWR 2008;57(RR-3)",
     "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5703a1.htm", "No immune globulin needed"],
    ["pep_effectiveness", "highly effective when wound care, immune globulin and vaccine are prompt", "",
     "CDC MMWR 2010;59(RR-2)", "https://www.cdc.gov/mmwr/preview/mmwrhtml/rr5902a1.htm",
     "CDC gives no single percentage; treat any cure-chance number in the game as a fictional choice"],
    ["after_symptoms", "nearly always fatal", "", "U.S. Army DCPH-A rabies fact sheet",
     "https://ph.health.mil/cdt/cphe-cdt-rabies-human-ref.pdf",
     "Real-world basis for 'treatment must happen before symptoms'"],
]
R0 = [
    ["Measles", 12, 18, "", "commonly cited range", "Guerra et al., Lancet Infect Dis 2017;17:e420-e428",
     "https://pubmed.ncbi.nlm.nih.gov/28757186/"],
    ["Seasonal influenza", 1.19, 1.37, 1.28, "median (IQR) of 47 estimates", "Biggerstaff et al., BMC Infect Dis 2014;14:480",
     "https://doi.org/10.1186/1471-2334-14-480"],
    ["1918 pandemic influenza", 1.47, 2.27, 1.80, "median (IQR) of 51 estimates", "Biggerstaff et al., BMC Infect Dis 2014;14:480",
     "https://doi.org/10.1186/1471-2334-14-480"],
    ["1957 pandemic influenza", 1.53, 1.70, 1.65, "median (IQR)", "Biggerstaff et al., BMC Infect Dis 2014;14:480",
     "https://doi.org/10.1186/1471-2334-14-480"],
    ["COVID-19 (original strain)", 1.4, 6.49, 2.79, "median (range) of early estimates", "Liu et al., J Travel Med 2020;27(2):taaa021",
     "https://doi.org/10.1093/jtm/taaa021"],
    ["COVID-19 (Delta variant)", "", "", 5.08, "mean of estimates", "Liu & Rocklov, J Travel Med 2021;28(7):taab124",
     "https://doi.org/10.1093/jtm/taab124"],
    ["Canine rabies (dogs, Tanzania)", "", 2, 1.2, "about 1.2 in the study area; under 2 across its historic range",
     "Hampson et al., PLoS Biol 2009;7(3):e53", "https://doi.org/10.1371/journal.pbio.1000053"],
]


def write_reference():
    print("Reference tables from published sources (entered by hand, with citations)...")
    rows = [dict(zip(["parameter", "value", "doses", "source", "url", "note"], r)) for r in RABIES]
    for r in rows:
        r["entered"] = TODAY
    write_csv("rabies_reference.csv", list(rows[0]), rows, "CDC rabies timing; check each url before citing")
    rows = [dict(zip(["disease", "r0_low", "r0_high", "r0_central", "measure", "source", "url"], r)) for r in R0]
    for r in rows:
        r["entered"] = TODAY
    write_csv("r0_reference.csv", list(rows[0]), rows, "real-disease R0 for comparison only; blank = not reported")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=["svi", "age", "reference"])
    a = ap.parse_args()
    jobs = {"svi": download_svi, "age": download_age, "reference": write_reference}
    failed = []
    for name, fn in jobs.items():
        if a.only and a.only != name:
            continue
        try:
            fn()
        except DownloadError as e:
            failed.append(name)
            print(f"  FAILED ({name}): {e}\n")
    if failed:
        print("Finished with failures:", ", ".join(failed))
        return 1
    print("All downloads finished. The game itself was not changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
