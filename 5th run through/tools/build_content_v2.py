"""
Build content/scenarios_v2.json: the playable version of the revised scenario document
(docs/word/Zombie_Escape_Revised_Scenarios.docx).

Inputs
  content/scenarios.json, content/option_attributes.csv   original story + attributes from the text
  scenario_revisions/revised.json                           rule-based rebalancing, traps/gems, flags, gates
  scenario_revisions/handwritten.py                         unlocked options, conditional options, gates, event scenes
  scenario_revisions/minigames_new.py                       realistic mini games + where they play

Every option in the output carries its own 'attrs' (time, exposure, setting, fuel...), so the engine
does not need option_attributes.csv for v2 content.
"""
import csv
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scenario_revisions"))
import handwritten as HW          # noqa: E402
import minigames_new as MGN       # noqa: E402

ORIG = json.load(open(os.path.join(ROOT, "content", "scenarios.json"), encoding="utf-8"))
REV = json.load(open(os.path.join(ROOT, "scenario_revisions", "revised.json"), encoding="utf-8"))
ATTR = {r["option_key"]: r for r in csv.DictReader(open(os.path.join(ROOT, "content", "option_attributes.csv"), encoding="utf-8"))}


def base_attrs(key):
    r = ATTR[key]
    return {"activity": r["activity"], "hours": float(r["hours"]), "exposure": r["exposure"], "setting": r["setting"],
            "fuel_gal": float(r["fuel_gal"]), "vehicle": r["vehicle"], "miles_bonus": float(r["miles_bonus"]),
            "travel_hours_saved": float(r["travel_hours_saved"]), "denied_entry": r["denied_entry"] in ("1", "True"),
            "medicine": r["medicine"] in ("1", "True"), "evidence": r["evidence"]}


def mk_attrs(activity="social", hours=1.0, exposure="low", setting="open", fuel=0.0, vehicle="", miles=0.0,
             saved=0.0, medicine=False, evidence="hand-written v2 option"):
    return {"activity": activity, "hours": float(hours), "exposure": exposure, "setting": setting, "fuel_gal": float(fuel),
            "vehicle": vehicle, "miles_bonus": float(miles), "travel_hours_saved": float(saved), "denied_entry": False,
            "medicine": medicine, "evidence": evidence}


def parse_fx(text):
    """Turn the short effect text written in handwritten.py into numbers."""
    t = text.lower()
    fx = {"hours": 1.0, "fuel": 0.0, "food": 0, "water": 0, "heal": 0, "saved": 0.0, "injury": 0, "treat": False,
          "exposure": "low"}
    m = re.match(r"\s*(\d+(?:\.\d+)?) h\b", t)
    if m:
        fx["hours"] = float(m.group(1))
    m = re.search(r"\+(\d+) gal", t)
    if m:
        fx["fuel"] = float(m.group(1))
    m = re.search(r"-(\d+) food", t)
    if m:
        fx["food"] = -int(m.group(1))
    m = re.search(r"\+(\d+) health", t)
    if m:
        fx["heal"] = int(m.group(1))
    m = re.search(r"saves (\d+) h", t)
    if m:
        fx["saved"] = float(m.group(1))
        fx["hours"] = 0.5
    m = re.search(r"injury risk (\d+)%", t)
    if m:
        fx["injury"] = int(m.group(1))
    if "treatment 90%" in t:
        fx["treat"] = True
    if "high exposure" in t or "high-exposure" in t:
        fx["exposure"] = "high"
    elif "medium exposure" in t:
        fx["exposure"] = "medium"
    return fx


RATING_INJ = {"BEST": (5, 6), "OKAY": (12, 10), "RISKY": (40, 15), "WORST": (65, 22)}


def option_from_fx(letter, text, rating, eff, why, extra=None, activity="social", setting="open"):
    fx = parse_fx(eff)
    inj, dmg = RATING_INJ[rating]
    if fx["injury"]:
        inj = fx["injury"]
    o = {"letter": letter, "text": text, "note": why, "rating": rating, "looks": "", "effects_text": eff,
         "injury_chance": inj, "damage": dmg, "food": fx["food"], "water": fx["water"], "heal": fx["heal"],
         "attrs": mk_attrs(activity=activity, hours=fx["hours"], exposure=fx["exposure"], setting=setting,
                           fuel=fx["fuel"], saved=fx["saved"], evidence="hand-written v2: " + eff)}
    if fx["treat"]:
        o["treat"] = True
    if extra:
        o.update(extra)
    return o


# ---------------------------------------------------------------- final gates, as numbers
def gate(letter, text, rating, looks, why, hours=1.0, harm=0, harm_reason="", food=0, water=0, inj=0, dmg=0,
         quarantine=0.0, lose_vehicle=False, needs_fuel=0.0, fuel_cost=0.0, else_hours=0.0, eff=""):
    o = {"letter": letter, "text": text, "note": why, "rating": rating, "looks": looks, "effects_text": eff,
         "injury_chance": inj, "damage": dmg, "food": food, "water": water, "heal": 0,
         "attrs": mk_attrs(activity="social", hours=hours, exposure="low", setting="open", evidence="final gate: " + eff),
         "gate": {"quarantine_h": quarantine}}
    if harm:
        o["harm"] = {"health": harm, "reason": harm_reason}
    if lose_vehicle:
        o["attrs"]["vehicle"] = "lost"
    if needs_fuel:
        o["gate"].update({"needs_fuel": needs_fuel, "fuel_cost": fuel_cost, "else_hours": else_hours})
    return o


def gates():
    G = {}
    for sid, opts in HW.GATES.items():
        G[sid] = opts
    out = {
     "NYC-07N": [gate("A", *G["NYC-07N"][0][1:4], G["NYC-07N"][0][5], hours=6, eff=G["NYC-07N"][0][4]),
                 gate("B", *G["NYC-07N"][1][1:4], G["NYC-07N"][1][5], hours=10, harm=10, harm_reason="a freezing night outside the gate", eff=G["NYC-07N"][1][4]),
                 gate("C", *G["NYC-07N"][2][1:4], G["NYC-07N"][2][5], hours=1, eff=G["NYC-07N"][2][4]),
                 gate("D", *G["NYC-07N"][3][1:4], G["NYC-07N"][3][5], hours=12, harm=10, harm_reason="held overnight in the cold", eff=G["NYC-07N"][3][4])],
     "BOS-07N": [gate("A", *G["BOS-07N"][0][1:4], G["BOS-07N"][0][5], hours=8, eff=G["BOS-07N"][0][4]),
                 gate("B", *G["BOS-07N"][1][1:4], G["BOS-07N"][1][5], hours=2, lose_vehicle=True, eff=G["BOS-07N"][1][4]),
                 gate("C", *G["BOS-07N"][2][1:4], G["BOS-07N"][2][5], hours=1, eff=G["BOS-07N"][2][4]),
                 gate("D", *G["BOS-07N"][3][1:4], G["BOS-07N"][3][5], hours=1, food=-15, water=-15, eff=G["BOS-07N"][3][4])],
     "PIT-07N": [gate("A", *G["PIT-07N"][0][1:4], G["PIT-07N"][0][5], hours=4, harm=15, harm_reason="cornered by crowds on the Strip", eff=G["PIT-07N"][0][4]),
                 gate("B", *G["PIT-07N"][1][1:4], G["PIT-07N"][1][5], hours=10, eff=G["PIT-07N"][1][4]),
                 gate("C", *G["PIT-07N"][2][1:4], G["PIT-07N"][2][5], hours=2, inj=30, dmg=15, eff=G["PIT-07N"][2][4]),
                 gate("D", *G["PIT-07N"][3][1:4], G["PIT-07N"][3][5], hours=1, eff=G["PIT-07N"][3][4])],
     "SLC-07N": [gate("A", *G["SLC-07N"][0][1:4], G["SLC-07N"][0][5], hours=0.5, quarantine=24, eff=G["SLC-07N"][0][4]),
                 gate("B", *G["SLC-07N"][1][1:4], G["SLC-07N"][1][5], hours=8, quarantine=24, eff=G["SLC-07N"][1][4]),
                 gate("C", *G["SLC-07N"][2][1:4], G["SLC-07N"][2][5], hours=0.5, quarantine=24, harm=10, harm_reason="held at gunpoint at the dock", eff=G["SLC-07N"][2][4]),
                 gate("D", *G["SLC-07N"][3][1:4], G["SLC-07N"][3][5], hours=2, quarantine=24, eff=G["SLC-07N"][3][4])],
     "JAC-07N": [gate("A", *G["JAC-07N"][0][1:4], G["JAC-07N"][0][5], hours=10, harm=15, harm_reason="pulled off the dock by the crew", eff=G["JAC-07N"][0][4]),
                 gate("B", *G["JAC-07N"][1][1:4], G["JAC-07N"][1][5], hours=0.5, eff=G["JAC-07N"][1][4]),
                 gate("C", *G["JAC-07N"][2][1:4], G["JAC-07N"][2][5], hours=0.5, needs_fuel=5, fuel_cost=5, else_hours=10, eff=G["JAC-07N"][2][4]),
                 gate("D", *G["JAC-07N"][3][1:4], G["JAC-07N"][3][5], hours=10, eff=G["JAC-07N"][3][4])],
     "SEA-07N": [gate("A", *G["SEA-07N"][0][1:4], G["SEA-07N"][0][5], hours=1, eff=G["SEA-07N"][0][4]),
                 gate("B", *G["SEA-07N"][1][1:4], G["SEA-07N"][1][5], hours=1, food=-15, eff=G["SEA-07N"][1][4]),
                 gate("C", *G["SEA-07N"][2][1:4], G["SEA-07N"][2][5], hours=1, eff=G["SEA-07N"][2][4]),
                 gate("D", *G["SEA-07N"][3][1:4], G["SEA-07N"][3][5], hours=4, harm=20, harm_reason="chased to another entrance", eff=G["SEA-07N"][3][4])],
     "AUS-07N": [gate("A", *G["AUS-07N"][0][1:4], G["AUS-07N"][0][5], hours=1, food=-20, eff=G["AUS-07N"][0][4]),
                 gate("B", *G["AUS-07N"][1][1:4], G["AUS-07N"][1][5], hours=10, eff=G["AUS-07N"][1][4]),
                 gate("C", *G["AUS-07N"][2][1:4], G["AUS-07N"][2][5], hours=3, eff=G["AUS-07N"][2][4]),
                 gate("D", *G["AUS-07N"][3][1:4], G["AUS-07N"][3][5], hours=1, eff=G["AUS-07N"][3][4])],
    }
    return out


UNLOCK_FX = {  # unlocked options whose effect text needs a hand translation
    "NJ_CONTACTS": dict(hours=0.5, gate={"quarantine_h": 0}),
    "DORM_ROSTER": dict(hours=0.5, gate={"quarantine_h": 0}),
    "TOWER_RADIO": dict(hours=1.0, gate={"quarantine_h": 0}),
    "GYM_LETTER": dict(hours=0.5, gate={"quarantine_h": 12}),
    "RANGER_PHONE": dict(hours=1.0, gate={"quarantine_h": 0}),
    "FUEL_VOUCHER": dict(hours=0.5, gate={"quarantine_h": 0}),
    "CIDER_JUGS": dict(hours=0.5, gate={"quarantine_h": 0}),
    "BARGE_CREW": dict(hours=4.0, saved=4.0),
    "SHERIFF_LETTER": dict(hours=1.0),
    "ARMY_RADIO": dict(hours=2.0),
    "SKI_RADIO": dict(hours=0.5),
    "WINTER_GEAR": dict(hours=1.0),
    "HUNTER_MAP": dict(hours=2.0, fuel=12.0),
    "RACE_FUEL": dict(hours=0.5, fuel=10.0),
}


def unlocked_option(u):
    f = UNLOCK_FX[u["flag"]]
    o = {"letter": "E", "text": u["text"], "note": u["why"], "rating": u["rating"], "looks": "", "effects_text": u["effects_text"],
         "injury_chance": 3, "damage": 5, "food": 0, "water": 0, "heal": 0, "unlock_flag": u["flag"],
         "attrs": mk_attrs(activity="social", hours=f.get("hours", 1.0), exposure="low",
                           setting="vehicle" if f.get("fuel") or f.get("saved") else "open",
                           fuel=f.get("fuel", 0.0), saved=f.get("saved", 0.0), evidence=f"unlocked by {u['flag']}")}
    if "gate" in f:
        o["gate"] = f["gate"]
    return o


COND_KEY = {"Low fuel (under 5 gal)": "low_fuel", "Infected (symptoms showing)": "infected_symptoms",
            "Behind schedule (over 12 h)": "behind"}


def conditional_option(c, i):
    kind = COND_KEY[c["when"]]
    act = {"low_fuel": "scavenge", "infected_symptoms": "social", "behind": "travel"}[kind]
    setting = {"low_fuel": "open", "infected_symptoms": "shelter", "behind": "vehicle"}[kind]
    o = option_from_fx("F" if i == 0 else "G", c["text"], c["rating"], c["effects_text"], c["why"],
                       extra={"condition": kind}, activity=act, setting=setting)
    if kind == "infected_symptoms":
        o["treat"] = True
        o["injury_chance"] = 2
    return o


def rest_option():
    return {"letter": "R", "text": "Rest the whole night before moving on", "note": "Sleep heals, but costs time you may not have.",
            "rating": "OKAY", "looks": "", "effects_text": "10 h; +15 health", "injury_chance": 5, "damage": 5,
            "food": 0, "water": 0, "heal": 15, "condition": "low_health",
            "attrs": mk_attrs(activity="shelter", hours=10, exposure="low", setting="shelter", evidence="general rule: low health")}


# ---------------------------------------------------------------- event scenes (new data)
def events():
    E = {s["id"]: s for s in HW.SHARED}
    ev = []

    def opt(L, text, rating, looks, why, eff, **kw):
        inj, dmg = kw.pop("inj", RATING_INJ[rating][0]), kw.pop("dmg", RATING_INJ[rating][1])
        o = {"letter": L, "text": text, "note": why, "rating": rating, "looks": looks, "effects_text": eff,
             "injury_chance": inj, "damage": dmg, "food": kw.pop("food", 0), "water": kw.pop("water", 0),
             "heal": kw.pop("heal", 0),
             "attrs": mk_attrs(activity=kw.pop("activity", "social"), hours=kw.pop("hours", 1.0), exposure=kw.pop("exposure", "low"),
                               setting=kw.pop("setting", "vehicle"), fuel=kw.pop("fuel", 0.0), miles=kw.pop("miles", 0.0),
                               medicine=kw.pop("medicine", False), evidence="event scene: " + eff)}
        o.update(kw)
        return o

    s = E["EV-SVI"]
    o = s["options"]
    ev.append({"id": "EV-SVI", "title": s["title"], "text": s["text"], "data": s["data"], "trigger": "svi",
               "options": [opt("A", o[0][1], "OKAY", "", o[0][5], o[0][4], hours=0, svi_delay=1.0, setting="vehicle"),
                           opt("B", o[1][1], "RISKY", "", o[1][5], o[1][4], hours=0, svi_delay=0.5, inj=35, dmg=15, exposure="medium", setting="open", activity="travel"),
                           opt("C", o[2][1], "BEST", "hidden_gem", o[2][5], o[2][4], hours=1.0, sets_flags=["GUARD_THANKS"], setting="open"),
                           opt("D", o[3][1], "WORST", "trap", o[3][5], o[3][4], hours=0.5, inj=65, dmg=25, setting="open", activity="travel")]})
    s = E["EV-AGE"]
    o = s["options"]
    ev.append({"id": "EV-AGE", "title": s["title"], "text": s["text"], "data": s["data"], "trigger": "age",
               "options": [opt("A", o[0][1], "BEST", "", o[0][5], o[0][4], hours=4, food=20, water=20, sets_flags=["NURSE_FRIEND"], setting="vehicle"),
                           opt("B", o[1][1], "OKAY", "", o[1][5], o[1][4], hours=2, water=10, setting="open", exposure="medium"),
                           opt("C", o[2][1], "RISKY", "", o[2][5], o[2][4], hours=1, inj=30, dmg=12, medicine=True, setting="shelter", activity="scavenge", exposure="medium"),
                           opt("D", o[3][1], "WORST", "trap", o[3][5], o[3][4], hours=0.5, inj=60, dmg=20, setting="open", activity="travel")]})
    s = E["EV-RABIES"]
    o = s["options"]
    ev.append({"id": "EV-RABIES", "title": s["title"], "text": s["text"], "data": s["data"], "trigger": "rabies",
               "options": [opt("A", o[0][1], "BEST", "", o[0][5], o[0][4], hours=6, fuel=-1.6, treat=True, inj=3, setting="shelter"),
                           opt("B", o[1][1], "OKAY", "", o[1][5], o[1][4], hours=1, sets_flags=["SYMPTOM_LIST"]),
                           opt("C", o[2][1], "RISKY", "", o[2][5], o[2][4], hours=1, medicine_chance=0.5, inj=20),
                           opt("D", o[3][1], "WORST", "trap", o[3][5], o[3][4], hours=0.5, inj=5)]})
    s = E["EV-R0"]
    o = s["options"]
    ev.append({"id": "EV-R0", "title": s["title"], "text": s["text"], "data": s["data"], "trigger": "r0",
               "options": [opt("A", o[0][1], "BEST", "", o[0][5], o[0][4], hours=0.5, sets_flags=["CROWD_SMART"], inj=2),
                           opt("B", o[1][1], "OKAY", "", o[1][5], o[1][4], hours=0.5, sets_flags=["SYMPTOM_LIST"], inj=2),
                           opt("C", o[2][1], "RISKY", "", o[2][5], o[2][4], hours=4, food=20, water=20, exposure="high", setting="shelter", inj=25),
                           opt("D", o[3][1], "WORST", "trap", o[3][5], o[3][4], hours=0.5, sets_flags=["NEXT_SHELTER_CONTACT"], inj=5)]})
    s = E["EV-FUEL"]
    o = s["options"]
    ev.append({"id": "EV-FUEL", "title": s["title"], "text": s["text"], "data": s["data"], "trigger": "fuel",
               "options": [opt("A", o[0][1], "OKAY", "", o[0][5], o[0][4], hours=3, fuel=15, setting="vehicle"),
                           opt("B", o[1][1], "RISKY", "", o[1][5], o[1][4], hours=1, fuel=8, exposure="medium", setting="open", activity="scavenge", inj=35),
                           opt("C", o[2][1], "BEST", "", o[2][5], o[2][4], hours=0.5, food=-15, fuel=10, inj=5),
                           opt("D", o[3][1], "WORST", "trap", o[3][5], o[3][4], hours=0.5, inj=70, dmg=25, setting="open")]})
    return ev


# ---------------------------------------------------------------- realistic mini games
RMG_FX = {  # win / fail effects as numbers (from minigames_new.GAMES win/fail text)
    "Change a Flat in the Dark": {"win": {}, "fail": {"hours": 3, "harm": 10, "reason": "the car slipped off the jack"}},
    "Jump-Start a Dead Battery": {"win": {"saved": 2}, "fail": {"lose_vehicle": True, "reason": "the battery never turned over"}},
    "Treat a Wound": {"win": {"heal": 10, "reveal": True}, "fail": {"harm": 10, "reason": "the wound kept bleeding"}},
    "Cold Emergency Triage": {"win": {"heal": 10}, "fail": {"harm": 15, "reason": "a cold injury got worse"}},
    "Make Water Safe": {"win": {"water": 30}, "fail": {"harm": 15, "reason": "sick from unsafe water"}},
    "Siphon Fuel": {"win": {"fuel": 8}, "fail": {"harm": 8, "reason": "a gasoline spill"}},
    "Put On Tire Chains": {"win": {}, "fail": {"harm": 15, "reason": "the car slid on the grade"}},
    "Navigate by Map and Compass": {"win": {"saved": 3}, "fail": {"hours": 1, "fuel": -1.6, "reason": "a 40-mile wrong turn"}},
    "Find the Emergency Broadcast": {"win": {"saved": 2, "flag": "RADIO_INTEL"}, "fail": {}},
    "Snowed In: Carbon Monoxide": {"win": {"heal": 10}, "fail": {"harm": 15, "reason": "carbon monoxide in the car"}},
}


def realistic_games():
    out = []
    for g in MGN.GAMES:
        name = g[0]
        out.append({"name": name, "how": g[1], "steps": g[2], "mistakes": g[3], "data": g[4], "tiers": g[5],
                    "win_text": g[6], "fail_text": g[7], "fx": RMG_FX[name]})
    return out


# ---------------------------------------------------------------- assemble
def main():
    gate_opts = gates()
    place = {}
    for code, pl in MGN.PLACEMENT.items():
        for sid, L, g, why in pl:
            place[(sid, L)] = (g, why)
    cities = []
    for oc, rc in zip(ORIG["cities"], REV["cities"]):
        assert oc["code"] == rc["code"]
        orig_scenes = {s["id"]: s for s in oc["scenarios"] + oc["branches"] + oc["callbacks"]}
        new = {"code": oc["code"], "start": oc["start"], "end": oc["end"], "route": oc["route"], "profile": rc["profile"],
               "scenarios": [], "branches": [], "callbacks": []}
        for s in rc["scenes"]:
            so = orig_scenes[s["id"]]
            s2 = {k: so[k] for k in so if k != "options"}
            s2["weather_note"] = s.get("weather_note", "")
            if s["id"] in gate_opts:
                opts = gate_opts[s["id"]]
            else:
                opts = []
                for ro, oo in zip(s["options"], so["options"]):
                    assert ro["letter"] == oo["letter"]
                    a = base_attrs(f"{s['id']}:{oo['letter']}")
                    a["hours"] = ro["hours"]
                    if ro.get("hours_saved"):
                        a["travel_hours_saved"] = max(a["travel_hours_saved"], ro["hours_saved"])
                    o = dict(oo)
                    o.update({"rating": ro["rating"], "looks": ro.get("looks", ""), "injury_chance": ro["injury_chance"],
                              "food": ro["food"], "water": ro["water"], "heal": ro["heal"], "attrs": a,
                              "changes": ro.get("changes", [])})
                    if ro.get("weather_rating"):
                        o["weather_rating"] = ro["weather_rating"]
                    flags = [f.strip() for f in (ro.get("sets_flag") or "").split(",") if f.strip()]
                    o.pop("sets_flag", None)
                    if flags:
                        o["sets_flags"] = flags
                    if o.get("alt"):
                        akey = f"{s['id']}:{oo['letter']}:alt"
                        o["alt"] = dict(o["alt"], attrs=base_attrs(akey))
                    mg = place.get((s["id"], oo["letter"]))
                    if mg:
                        o["minigame"] = mg[0]
                        o["minigame_why"] = mg[1]
                    opts.append(o)
            for u in s.get("unlocked", []):
                o = unlocked_option(u)
                mg = place.get((s["id"], "★"))
                if mg:
                    o["minigame"], o["minigame_why"] = mg
                opts.append(o)
            for i, c in enumerate(s.get("conditional", [])):
                opts.append(conditional_option(c, i))
            if s["kind"] == "main" and s.get("time") == "Night" and not s["id"].endswith("07N"):
                opts.append(rest_option())
            s2["options"] = opts
            {"main": new["scenarios"], "detour": new["branches"], "callback": new["callbacks"]}[s["kind"]].append(s2)
        cities.append(new)
    out = {"version": 2, "source": "docs/word/Zombie_Escape_Revised_Scenarios.docx", "cities": cities,
           "events": events(), "realistic_minigames": realistic_games(), "minigame_rules": MGN.SHARED_RULES}
    path = os.path.join(ROOT, "content", "scenarios_v2.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    n = sum(len(c[k]) for c in cities for k in ("scenarios", "branches", "callbacks"))
    nopt = sum(len(s["options"]) for c in cities for k in ("scenarios", "branches", "callbacks") for s in c[k])
    print(f"Wrote {path}: {n} scenes, {nopt} options, {len(out['events'])} event scenes, {len(out['realistic_minigames'])} realistic mini games")


if __name__ == "__main__":
    main()
