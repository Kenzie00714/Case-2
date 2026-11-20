import json, csv, re, sys, copy, collections
import os; ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
from zombie_sim.data_loader import load_world
from handwritten import FLAGS, COND, COND_RULES, GATES, GATE_CHECK, SHARED

W = load_world()
C = json.load(open(os.path.join(ROOT, "content", "scenarios.json")))
A = {r["option_key"]: r for r in csv.DictReader(open(os.path.join(ROOT, "content", "option_attributes.csv")))}
ORDER = ["BEST", "OKAY", "RISKY", "WORST"]
SUPPLY_WORDS = re.compile(r"\b(search|raid|grab|loot|food|supplies|store|cafeteria|houses|cabins|trucks|motel|buildings|mall|cooler|snacks)\b", re.I)
TRAP_APPEAL = re.compile(r"\b(help|shelter|warm|hospital|stadium|join|fast|faster|quick|straight|jump|swim|soak|drink|save time|mall|crowd|music|survivors|helicopter|race car|boat|demand|threaten|floor it|speed)\b", re.I)
TEMPT = re.compile(r"\b(steal|take|grab|raid|sneak|ride|drive|keep driving|run|force|push|climb|break|walk|try|go)\b", re.I)
GEM_TIMID = re.compile(r"\b(slow|slowly|wait|skip|walk|stay|back up|calmly|honest|give|decline|hand over|respect|follow their rules|distract|bypass|other bridge|outer loop)\b", re.I)

def stop_normal(code, sid, day, time):
    stops = W["routes"][code]
    if day is None:
        return None, None
    a = day - 1
    b = a if time == "Morning" else min(day, 7)
    if sid.endswith("07N"):
        a = b = 7
    s1, s2 = W["stations"][stops[a]["station"]], W["stations"][stops[b]["station"]]
    label = stops[a]["label"] if a == b else f"between {stops[a]['label']} and {stops[b]['label']}"
    return (s1["tavg_f"] + s2["tavg_f"]) / 2, label

def opt_metrics(o):
    return (o["injury_chance"] * o["damage"] / 100.0, o["hours"], o.get("food", 0) + o.get("water", 0) + o.get("heal", 0), o["fuel"])

def dominated_one(a, others):
    ma = opt_metrics(a)
    for b in others:
        mb = opt_metrics(b)
        if mb[0] <= ma[0] and mb[1] <= ma[1] and mb[2] >= ma[2] and mb[3] >= ma[3] and mb != ma:
            return True
    return False

def dominated(opts):
    n = 0
    for a in opts:
        ma = opt_metrics(a)
        for b in opts:
            if a is b: continue
            mb = opt_metrics(b)
            if mb[0] <= ma[0] and mb[1] <= ma[1] and mb[2] >= ma[2] and mb[3] >= ma[3] and mb != ma:
                n += 1; break
    return n

out = {"cities": [], "shared": SHARED, "cond_rules": COND_RULES, "gate_check": GATE_CHECK}
stats = collections.Counter()
weather_rows = []
for city in C["cities"]:
    code = city["code"]
    stops = W["routes"][code]
    c0 = W["counties"][stops[0]["geoid"]]; st0 = W["stations"][stops[0]["station"]]
    profile = re.sub(r"\(about [\d,]+ people per square mile\)", f"({c0['name']}: about {c0['density']:,.0f} people per square mile, 2023 Census)", city["profile"])
    profile = re.sub(r"\(about (\d+)°F\)", f"(January normal {st0['tavg_f']:.1f}°F, NOAA)", profile)
    profile = re.sub(r"\((\d+)°F\)", f"(January normal {st0['tavg_f']:.1f}°F, NOAA)", profile)
    flagmap = {(f[0], f[1]): f for f in FLAGS[code]}
    payoffs = collections.defaultdict(list)
    for f in FLAGS[code]:
        payoffs[f[4]].append(f)
    conds = collections.defaultdict(list)
    for cnd in COND[code]:
        conds[cnd[0]].append(cnd)
    scenes = []
    groups = [("main", city["scenarios"]), ("detour", city["branches"]), ("callback", city["callbacks"])]
    for kind, lst in groups:
        for s in lst:
            s2 = {k: s[k] for k in s if k != "options"}
            s2["kind"] = kind
            day, tm = s.get("day"), s.get("time")
            normal, place = stop_normal(code, s["id"], day, tm) if kind == "main" else (None, None)
            s2["normal_f"], s2["place"] = normal, place
            # weather correction
            notes = []
            for m in re.finditer(r"(-?\d+)\s?°F", s["title"] + " " + s["text"]):
                t = int(m.group(1))
                if (t > 60 and "water" in s["text"].lower()) or "stays about" in s["text"]: continue  # water/cave temperature, not air
                if normal is not None and abs(t - normal) > 15:
                    notes.append(f"{t}°F is a fictional record storm; the real January normal here is {normal:.1f}°F (NOAA 1991-2020).")
                    weather_rows.append([s["id"], f"{t}°F", f"{normal:.1f}°F", "Labeled as a record storm"])
                elif normal is not None:
                    weather_rows.append([s["id"], f"{t}°F", f"{normal:.1f}°F", "Close to normal; kept"])
                else:
                    notes.append(f"{t}°F is a fictional storm (detour/callback scenes have no fixed stop).")
                    weather_rows.append([s["id"], f"{t}°F", "—", "Labeled as a fictional storm"])
            if "1,968 miles" in s["text"]:
                notes.append("Mileage corrected to 2,230 road miles (OSRM).")
            s2["weather_note"] = " ".join(dict.fromkeys(notes))
            opts = []
            for o in s["options"]:
                a = A[f"{s['id']}:{o['letter']}"]
                o2 = {"letter": o["letter"], "text": o["text"], "why": o["note"], "rating": o["rating"], "looks": o.get("looks") or "",
                      "injury_chance": o["injury_chance"], "damage": o["damage"], "food": o.get("food", 0), "water": o.get("water", 0),
                      "heal": o.get("heal", 0), "hours": float(a["hours"]), "fuel": float(a["fuel_gal"]), "vehicle": a["vehicle"],
                      "miles": float(a["miles_bonus"]), "sets_flag": o.get("sets_flag") or "", "requires_flag": o.get("requires_flag") or "",
                      "alt": o.get("alt"), "setting": a["setting"], "activity": a["activity"], "changes": []}
                explicit_time = "h:" in a["evidence"] and "+" in a["evidence"]
                opts.append((o2, explicit_time))
            before = dominated([o for o, _ in opts])
            if s["id"] not in GATES and kind != "callback":
                ol = [o for o, _ in opts]
                for o in ol:
                    if dominated_one(o, [x for x in ol if x is not o]): stats["dom_before_" + o["rating"]] += 1
            is_gate = s["id"] in GATES
            if not is_gate and kind != "callback":
                for o, explicit in opts:
                    r = o["rating"]
                    if r == "BEST":
                        if o["food"] > 20 or o["water"] > 20:
                            o["changes"].append(f"supplies capped at 20 each (was food {o['food']}, water {o['water']}): you can only carry so much")
                            o["food"], o["water"] = min(o["food"], 20), min(o["water"], 20)
                            stats["best_capped"] += 1
                        target = 2.0 if (o["food"] or o["water"] or o["heal"]) else 1.5
                        if o["hours"] < target and not (o["vehicle"] == "gained" or o["miles"]):
                            o["changes"].append(f"time {o['hours']:g} h -> {target:g} h: the careful way is slower")
                            o["hours"] = target; stats["best_slower"] += 1
                    elif r == "RISKY":
                        if o["food"] + o["water"] == 0 and o["activity"] in ("scavenge", "contact") and SUPPLY_WORDS.search(o["text"]):
                            o["food"], o["water"] = 15, 10
                            o["changes"].append("risky grab now pays: +15 food, +10 water")
                            stats["risky_pays"] += 1
                        if not explicit and o["hours"] > 0.5:
                            o["changes"].append(f"time {o['hours']:g} h -> 0.5 h: the fast option")
                            o["hours"] = 0.5
                        if not explicit and o["activity"] == "travel" and o["setting"] != "open":
                            o["changes"].append("saves 2 h of driving: the fast option")
                            o["hours_saved"] = 2.0; stats["risky_fast"] += 1
                    elif r == "OKAY":
                        if not explicit and o["hours"] > 1.0:
                            o["changes"].append(f"time {o['hours']:g} h -> 1 h: quicker than the careful option, safer than the fast one")
                            o["hours"] = 1.0
                        if explicit and o["hours"] >= 3:
                            rest = min(15, 5 * int(o["hours"] // 6))
                            o["changes"].append(f"slow but safest: keeps its {o['hours']:g} h story delay, injury chance {o['injury_chance']}% -> 5%" + (f", +{rest} health from rest" if rest else ""))
                            o["injury_chance"] = min(o["injury_chance"], 5); o["heal"] = o["heal"] + rest
                            stats["okay_safest"] += 1
            # weather-adjusted rating
            if kind == "main" and normal is not None and not is_gate:
                for o, _ in opts:
                    indoorish = re.search(r"\b(home|armory|houses|pharmacy|trucks)\b", o["text"], re.I)
                    onfoot = re.search(r"\b(walk|on foot|hike|climb|swim|ski|sleep under|camp)\b", o["text"], re.I)
                    outdoors = not indoorish and o["setting"] == "open" and (o["activity"] in ("scavenge", "contact", "social", "shelter") or re.search(r"\b(walk|on foot|hike|climb|swim|ski|sleep under|camp)\b", o["text"], re.I))
                    if outdoors and o["hours"] >= 0.5 and o["rating"] in ("OKAY", "RISKY"):
                        i = ORDER.index(o["rating"])
                        if normal <= 25:
                            o["weather_rating"] = ORDER[min(3, i + 1)]; stats["weather_worse"] += 1
                        elif normal >= 40 and onfoot:
                            o["weather_rating"] = ORDER[i - 1]; stats["weather_better"] += 1
            # traps and gems where the scene has none
            if not any(o["looks"] for o, _ in opts) and not is_gate:
                for o, _ in opts:
                    if o["rating"] == "WORST" and TRAP_APPEAL.search(o["text"]):
                        o["looks"] = "trap"; o["changes"].append("tagged TRAP: sounds appealing, plays out badly"); stats["new_trap"] += 1; break
                else:
                  for o, _ in opts:
                    if o["rating"] == "WORST" and TEMPT.search(o["text"]):
                        o["looks"] = "trap"; o["changes"].append("tagged TRAP: a tempting shortcut that plays out badly"); stats["new_trap"] += 1; break
                  else:
                    for o, _ in opts:
                        if o["rating"] == "BEST" and GEM_TIMID.search(o["text"]):
                            o["looks"] = "hidden_gem"; o["changes"].append("tagged HIDDEN GEM: sounds timid or slow, works best"); stats["new_gem"] += 1; break
            # flags set
            for o, _ in opts:
                f = flagmap.get((s["id"], o["letter"]))
                if f:
                    o["sets_flag"] = (o["sets_flag"] + ", " if o["sets_flag"] else "") + f[2]
                    o["changes"].append(f"now also sets {f[2]}: {f[3]}")
            if is_gate:
                newopts = []
                for (L, t, r, lk, eff, why) in GATES[s["id"]]:
                    newopts.append(({"letter": L, "text": t, "rating": r, "looks": lk, "effects_text": eff, "why": why, "changes": ["rewritten final-gate option"]}, False))
                opts = newopts
                s2["gate_check"] = GATE_CHECK
            s2["options"] = [o for o, _ in opts]
            s2["unlocked"] = [{"flag": f[2], "text": f[5], "rating": f[6], "effects_text": f[7], "why": f[8], "from": f[0]} for f in payoffs.get(s["id"], [])]
            s2["conditional"] = [{"when": c[1], "text": c[2], "rating": c[3], "effects_text": c[4], "why": c[5]} for c in conds.get(s["id"], [])]
            if not is_gate:
                after = dominated(s2["options"])
                for o in s2["options"]:
                    others = [x for x in s2["options"] if x is not o]
                    if dominated([o] + others) and dominated_one(o, others): stats["dom_after_" + o["rating"]] += 1
                if kind == "main":
                    stats["dom_before"] += before; stats["dom_after"] += after
            scenes.append(s2)
    out["cities"].append({"code": code, "start": city["start"], "end": city["end"], "route": city["route"], "miles": round(stops[-1]["cum_mi"]),
                          "profile_old": city["profile"], "profile": profile, "scenes": scenes,
                          "flags": [{"scene": f[0], "letter": f[1], "flag": f[2], "gets": f[3], "payoff_scene": f[4], "payoff": f[5]} for f in FLAGS[code]],
                          "conds": [{"scene": c[0], "when": c[1], "text": c[2]} for c in COND[code]]})
# looks coverage
cov = sum(1 for c in out["cities"] for s in c["scenes"] if s["kind"] == "main" and any(o.get("looks") for o in s["options"]))
stats["looks_coverage"] = cov
seen = set(); wr = []
for r in weather_rows:
    if tuple(r) not in seen: seen.add(tuple(r)); wr.append(r)
out["weather_rows"] = wr
out["stats"] = dict(stats)
json.dump(out, open("revised.json", "w"), ensure_ascii=False, indent=1)
print(dict(stats))
print(len(weather_rows))
