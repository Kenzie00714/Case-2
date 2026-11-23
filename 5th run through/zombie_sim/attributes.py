"""
Decision attributes for every option: activity type, time used, exposure level, setting,
fuel, vehicle and distance effects.

These are derived from what each option's own text and hidden note SAY ("costs a full day",
"a full tank", "the car is wrecked", "200 fast miles"), so the outcomes match the story.
The rules write content/option_attributes.csv with an 'evidence' column showing the phrase
that triggered each value. Your group can edit that CSV by hand; the game reads the CSV.
"""
import csv
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CONTENT = os.path.join(ROOT, "content")
ATTR_FILE = os.path.join(CONTENT, "option_attributes.csv")
FIELDS = ["option_key", "activity", "hours", "exposure", "setting", "fuel_gal", "vehicle",
          "miles_bonus", "travel_hours_saved", "denied_entry", "medicine", "evidence"]

# Default time (hours) and infection exposure by activity type (fictional assumptions)
ACTIVITY_DEFAULTS = {
    "contact":  {"hours": 0.5, "exposure": "contact", "setting": "open"},
    "scavenge": {"hours": 1.5, "exposure": "medium",  "setting": "open"},
    "social":   {"hours": 1.0, "exposure": "low",     "setting": "shelter"},
    "shelter":  {"hours": 1.0, "exposure": "low",     "setting": "shelter"},
    "travel":   {"hours": 0.5, "exposure": "low",     "setting": "vehicle"},
}

RX = lambda p: re.compile(p, re.I)
ACTIVITY_RULES = [  # first match wins, checked on the option TEXT
    ("contact", RX(r"\b(open the (car|bus|door)|check on (his|the)|rush in|burst|walk in (through )?the (main|front)|"
                   r"go into|go in through|join the crowd|push to the front|front of the stage|poke|kick a|"
                   r"run for the airport|crowd onto|head toward the music|go toward the music|"
                   r"go to the (stadium|hospital|truck stop|gas station)|seek help at the hospital|"
                   r"run in for|walk into the|break in through the glass|drive into (downtown|manhattan|the city)|"
                   r"head into the city|drive (straight )?through downtown|drive down the strip)\b")),
    ("scavenge", RX(r"\b(search|raid|grab|loot|steal|siphon|break in|break into|sneak (in|into|onto|through)|"
                    r"fill (up|every|the|your|water|gas)|take (the|a) .*(from|cash)|cut meat|load up|get (cold|real|winter) gear|"
                    r"top off|check the (cargo|station|ranger|mine office|building|footprints)|hook the)\b")),
    ("social", RX(r"\b(trade|ask|offer|knock|talk|introduce|help|accept|show|cooperate|tell|report|be honest|"
                  r"wave|thank|beg|argue|demand|give|call out|approach|join them|join the|stop at the gate|"
                  r"respect|let them check|follow their rules|let the guard|calmly|suggest|signal|radio|"
                  r"broadcast|message them|watch|listen|buy|explain|apologize)\b")),
    ("shelter", RX(r"\b(sleep|stay|shelter|barricade|hide|camp|wait|rest|lock (yourself|the doors)|"
                   r"huddle|soak|swim|bathe|pull over|pull off)\b")),
    ("travel", RX(r".")),
]

HIGH_EXPOSURE = RX(r"\b(crowd|stadium|mall|hospital|overrun|showroom|front doors|packed|mobbed|casino|strip)\b")
NO_VEHICLE_SETTING = RX(r"\b(on foot|walk|swim|climb|ski|hike|run |sprint)\b")
VEHICLE_WORDS = RX(r"\b(drive|car|truck|tow|humvee|snowcat|plow|pickup|bus|locomotive|train|snowmobile|boat|barge|"
                   r"floor it|speed|steer)\b")

TIME_RULES = [  # checked on the NOTE; first match wins; hours ADDED to the activity
    (RX(r"(costs?|loses?|lost|costing) (the player )?(a |most of a |a full |one )?(full )?day|a day lost|"
        r"a full day|loses a day|lose a day|day late|time lost(?!\.)(.*day)"), 24.0),
    (RX(r"takes? days|could take days|days of waiting|it takes three days|days\.|for days|several days|lose days"), 36.0),
    (RX(r"half a day|half day|most of the morning|most of a day"), 12.0),
    (RX(r"hours of (work|shoveling|waiting)|takes hours|it takes hours|hours lost|hours wasted|"
        r"after two hours|hours to reach|drifts for an hour|an hour first|takes an hour|loses an hour|hours?\b.*waiting"), 3.0),
    (RX(r"time lost|time wasted|slow but|slow progress|slowly|loses time|lose time|wastes time|costs time|slower"), 2.0),
]
SAVE_RULES = [(RX(r"saves hours|shortcut|fast crossing|quick and smart|easy detour|faster, safer route"), 2.0)]

FUEL_RULES = [  # checked on text + note
    (RX(r"full tank|fill up at the fuel depot|fill up from the|fuel depot|fill the gas tank|fuel up and|"
        r"fills? (up|the tank)|top off fuel|hand-crank|plenty of fuel|a full tank and"), 25.0, "to_full"),
    (RX(r"gas cans?|spare cans|two spare cans|extra fuel|fuel and food|shares (gas|fuel)|trades? a gas can|"
        r"gives? the player fuel|military fuel|fuel and a"), 10.0, "add"),
    (RX(r"siphon"), 6.0, "add"),
    (RX(r"trade (a little|most of your) gas|trade gas for|trade your extra fuel|trade fuel|offer .*fuel|"
        r"trade a gas can for"), -6.0, "add"),
]
VEHICLE_LOST = RX(r"car (is )?(wrecked|totaled|destroyed|falls|seizes|is half-buried)|"
                  r"(lose|loses|lost) (the|your) (car|vehicle)|leave the car|leaves? the car|"
                  r"engine (seizes|dies)|has no car|car isn't going anywhere|car stays behind|"
                  r"no car at the end|tears out the bottom|radiator is destroyed|loses the car")
VEHICLE_GAINED = RX(r"take the (tow truck|humvee|pickup|plow|snowcat|four-wheel|plow truck|race car)|"
                    r"drive the plow|hotwire|grab a (new )?car|find a car|take a car|cars? .*keys|car with keys|"
                    r"vehicle on the|a car with keys|abandoned with keys|keys in (it|the cab)")
MILES_RX = RX(r"(\d{2,4}) (fast |more )?miles")
MEDICINE = RX(r"\b(first[- ]aid|antibiotics?|pharmacy|medic(al)? (kit|supplies|bag)|medicine|bandages and)\b")
DENIED = RX(r"turned away|lock the gates|gates lock|gates on both|refuses to take|arrested")


def _first(rules, text):
    for rx, val in rules:
        m = rx.search(text)
        if m:
            return val, m.group(0)
    return None, None


def annotate_option(o, is_final=False):
    text, note = o["text"], o.get("note", "")
    both = f"{text} || {note}"
    evidence = []
    activity = next(a for a, rx in ACTIVITY_RULES if rx.search(text))
    d = dict(ACTIVITY_DEFAULTS[activity])
    exposure, setting, hours = d["exposure"], d["setting"], d["hours"]
    if HIGH_EXPOSURE.search(both) and exposure in ("low", "medium"):
        exposure = "high"
        evidence.append("high exposure: " + HIGH_EXPOSURE.search(both).group(0))
    if activity == "travel" and (NO_VEHICLE_SETTING.search(text) or not VEHICLE_WORDS.search(both)):
        setting = "open"
    add, why = _first(TIME_RULES, note)
    if add:
        hours += add
        evidence.append(f"+{add:g}h: {why}")
    if re.search(r"\b(wait|until (morning|dawn)|cross at dawn|in the morning|morning boat)\b", text, re.I):
        hours += 6.0
        evidence.append("+6h: waits in text")
    saved, why = _first(SAVE_RULES, note)
    if saved:
        evidence.append(f"-{saved:g}h travel: {why}")
    fuel = 0.0
    for rx, amount, kind in FUEL_RULES:
        m = rx.search(both)
        if m:
            fuel = amount
            evidence.append(f"fuel {amount:+g} gal: {m.group(0)}")
            break
    vehicle = ""
    m = VEHICLE_LOST.search(note)
    if m:
        vehicle = "lost"
        evidence.append("vehicle lost: " + m.group(0))
    m2 = VEHICLE_GAINED.search(both)
    if m2 and vehicle != "lost":
        vehicle = "gained"
        evidence.append("vehicle gained: " + m2.group(0))
    miles = 0.0
    m = MILES_RX.search(note)
    if m and re.search(r"locomotive|train|ride|flies|fly|tow|escort|boat|barge|walk|scout|shortcut", both, re.I) \
            and not re.search(r"no services|empty|between towns|to the next|miles (away|out|of)|last gas", both, re.I):
        miles = float(m.group(1))
        evidence.append(f"+{miles:g} miles: {m.group(0)}")
    denied = bool(is_final and DENIED.search(note))
    if denied:
        evidence.append("denied entry: " + DENIED.search(note).group(0))
    med = MEDICINE.search(both)
    if med:
        evidence.append("medicine: " + med.group(0))
    return {"activity": activity, "hours": round(hours, 2), "exposure": exposure, "setting": setting,
            "fuel_gal": fuel, "vehicle": vehicle, "miles_bonus": miles,
            "travel_hours_saved": saved or 0.0, "denied_entry": int(denied), "medicine": int(bool(med)), "evidence": "; ".join(evidence)}


def build_attribute_rows(content):
    rows = []
    for city in content["cities"]:
        main = city["scenarios"]
        final_id = main[-1]["id"]
        for s in main + city["branches"] + city["callbacks"]:
            for o in s["options"]:
                a = annotate_option(o, is_final=(s["id"] == final_id))
                rows.append(dict(a, option_key=f"{s['id']}:{o['letter']}"))
                if o.get("alt"):
                    alt = dict(o["alt"], letter=o["letter"])
                    a2 = annotate_option(alt, is_final=(s["id"] == final_id))
                    rows.append(dict(a2, option_key=f"{s['id']}:{o['letter']}:alt"))
    return rows


def write_attributes(content, path=ATTR_FILE):
    rows = build_attribute_rows(content)
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    return rows


def load_attributes(path=ATTR_FILE):
    if not os.path.exists(path):
        raise FileNotFoundError(f"{path} is missing. Run: python tools/build_attributes.py")
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            out[r["option_key"]] = {
                "activity": r["activity"], "hours": float(r["hours"]), "exposure": r["exposure"],
                "setting": r["setting"], "fuel_gal": float(r["fuel_gal"]), "vehicle": r["vehicle"],
                "miles_bonus": float(r["miles_bonus"]), "travel_hours_saved": float(r["travel_hours_saved"]),
                "denied_entry": r["denied_entry"] in ("1", "True", "true"),
                "medicine": r["medicine"] in ("1", "True", "true"), "evidence": r["evidence"],
            }
    return out


def load_content(path=os.path.join(CONTENT, "scenarios.json")):
    with open(path, encoding="utf-8") as f:
        return json.load(f)
