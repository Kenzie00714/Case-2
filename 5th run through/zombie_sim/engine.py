"""
Game rules, separated from any screen. The console game, the Monte Carlo simulator and
the tests all drive this same engine. web/sim.js is a line-by-line port (checked by
tests/test_parity.py).

The engine talks to a "ui" object:
  choose(game, scene, options, kind) -> letter      kind: main / callback / detour / fallback / event
  outcome(game, scene, option, result)              result has the full calculation breakdown
  minigame(game, name, tier) -> (win, bonus) or None   None = simulate with fixed win odds
  message(game, title, msgs)
  end(game)

v2 (revised scenarios): options can be unlocked by flags, appear only in certain situations
(low fuel, symptoms, behind schedule, low health), carry fixed health costs with a reason,
start treatment, play a realistic mini game, or change the final gate. Five event scenes are
placed by real data (CDC SVI, % aged 65+) or by the player's state.
"""
import json
import math
import os

from .params import PARAMS, MINIGAMES, MINIGAME_ORDER, CURE_FLAGS
from .rng import Streams
from .seir import Trajectory, age_multiplier

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RATINGS = ("BEST", "OKAY", "RISKY", "WORST")
ENDINGS = {
    "VICTORY": "Reached the safe zone alive, uninfected and before the deadline.",
    "DIED": "Health reached 0.",
    "TURNED": "The infection reached onset before it was treated.",
    "TOO_LATE": "The safe zone closed (Day 7 midnight) before the player arrived.",
    "STRANDED": "Ran out of ways to keep moving (no fuel or vehicle after repeated fallback scenes).",
    "DENIED": "Reached the safe zone but was turned away at the gate.",
}
EVENT_ORDER = ("rabies", "fuel", "r0", "svi", "age")


def load_fallbacks(path=os.path.join(ROOT, "content", "fallbacks.json")):
    with open(path, encoding="utf-8") as f:
        return {s["kind"]: s for s in json.load(f)["scenes"]}


def clamp(x, lo, hi):
    return lo if x < lo else hi if x > hi else x


def option_flags(o):
    out = list(o.get("sets_flags") or [])
    if o.get("sets_flag"):
        out.append(o["sets_flag"])
    return out


class Game:
    def __init__(self, world, content, attrs, fallbacks, city_code, seed, p=PARAMS):
        self.p = p
        self.rng = Streams(seed)
        self.seed = seed
        self.city = next(c for c in content["cities"] if c["code"] == city_code)
        self.code = city_code
        self.attrs = attrs
        self.fallbacks = fallbacks
        self.events_content = {e["trigger"]: e for e in content.get("events", [])}
        self.rgames = {g["name"]: g for g in content.get("realistic_minigames", [])}
        self.pool = list(MINIGAME_ORDER) + [g["name"] for g in content.get("realistic_minigames", [])]
        self.stops = world["routes"][city_code]
        self.counties = world["counties"]
        self.stations = world["stations"]
        self.svi = world.get("svi") or {}
        self.age_ref = world.get("age_ref")
        self.total_mi = self.stops[-1]["cum_mi"]
        self.strength = self.rng.get("outbreak").uniform(p["outbreak_strength_min"], p["outbreak_strength_max"])
        self.traj = [Trajectory(self.counties[s["geoid"]]["density"], self.stations[s["station"]]["tavg_f"],
                                self.strength, p, self.age_mult(s["geoid"]), s.get("i0")) for s in self.stops]
        # 14 story stops: Morning d at waypoint d, Night d halfway to waypoint d+1, Day 7 Night at the safe zone
        self.places = []
        for i in range(14):
            d = i // 2 + 1
            if i == 13:
                self.places.append({"a": 7, "b": 7, "mi": self.stops[7]["cum_mi"], "nominal": (d - 1) * 24 + 12.0})
            elif i % 2 == 0:
                self.places.append({"a": d - 1, "b": d - 1, "mi": self.stops[d - 1]["cum_mi"], "nominal": (d - 1) * 24.0})
            else:
                self.places.append({"a": d - 1, "b": d, "mi": (self.stops[d - 1]["cum_mi"] + self.stops[d]["cum_mi"]) / 2,
                                    "nominal": (d - 1) * 24 + 12.0})
        self.place = self.places[0]
        self.hour = 0.0
        self.miles = 0.0
        self.fuel = p["start_fuel_gallons"]
        self.vehicle = True
        self.health, self.food, self.water = p["start_health"], p["start_food"], p["start_water"]
        self.flags = []
        self.infection = None   # {"at": hour, "warned": bool, "treated": bool}
        self.infections = 0
        self.injuries = 0
        self.saved_hours = 0.0
        self.quarantine_hours = 0.0
        self.pending = []       # [scenes_left, callback]
        self.played_callbacks = []
        self.used_branches = []
        self.used_games = []
        self.played_events = []
        self.recent = []
        self.history = []       # (scene id, letter, rating)
        self.ledger = []        # {"day", "source", "health", "food", "water", "fuel"}
        self.events = []        # timeline for the report / charts
        self.msgs = []
        self.ending = None
        self.ending_detail = ""
        self.scene_index = 0
        self.minigame_log = {"HARD": 0, "NORMAL": 0, "EASY": 0, "wins": 0, "detours": 0}

    # ------------------------------------------------------------------ data helpers
    def age_mult(self, geoid):
        d = self.svi.get(geoid)
        if not d or self.age_ref is None:
            return 1.0
        return age_multiplier(d["pct65"], self.age_ref, self.p)

    def svi_here(self, place=None):
        pl = place or self.place
        d = self.svi.get(self.stops[pl["a"]]["geoid"])
        return d["svi"] if d and d["svi"] is not None else None

    def pct65_here(self, place=None):
        pl = place or self.place
        d = self.svi.get(self.stops[pl["a"]]["geoid"])
        return d["pct65"] if d else None

    # ------------------------------------------------------------------ clock & place
    def day(self):
        """Calendar day (Day 1 starts at game hour 0 = 08:00, so Day 2 starts at hour 16 = midnight)."""
        return int((self.hour + 8.0) // 24) + 1

    def is_night(self):
        h = (8.0 + self.hour) % 24.0
        return h >= 20.0 or h < 6.0

    def outbreak_day(self):
        return self.p["outbreak_start_day"] + self.hour / 24.0

    def local(self, place=None):
        """S, E, I, R shares where the player is. Halfway points average the two counties' curves."""
        pl = place or self.place
        t = self.outbreak_day()
        a = self.traj[pl["a"]].at(t)
        if pl["a"] == pl["b"]:
            return a
        b = self.traj[pl["b"]].at(t)
        return tuple((a[j] + b[j]) / 2 for j in range(4))

    def place_label(self, place=None):
        pl = place or self.place
        if pl["a"] == pl["b"]:
            return self.stops[pl["a"]]["label"]
        return f"Between {self.stops[pl['a']]['label']} and {self.stops[pl['b']]['label']}"

    def weather(self, place=None):
        pl = place or self.place
        s1 = self.stations[self.stops[pl["a"]]["station"]]
        s2 = self.stations[self.stops[pl["b"]]["station"]]
        temp = (s1["tavg_f"] + s2["tavg_f"]) / 2
        snow = None if (s1["snow_in"] is None or s2["snow_in"] is None) else (s1["snow_in"] + s2["snow_in"]) / 2
        return temp, snow

    def hours_behind(self):
        return self.hour - self.places[self.scene_index]["nominal"]

    # ------------------------------------------------------------------ resources
    def change(self, source, health=0.0, food=0.0, water=0.0, fuel=0.0):
        p = self.p
        old = (self.health, self.food, self.water, self.fuel)
        self.health = clamp(self.health + health, 0.0, p["max_health"])
        self.food = clamp(self.food + food, 0.0, p["max_food"])
        self.water = clamp(self.water + water, 0.0, p["max_water"])
        self.fuel = clamp(self.fuel + fuel, 0.0, p["tank_gallons"])
        real = (self.health - old[0], self.food - old[1], self.water - old[2], self.fuel - old[3])
        if any(abs(x) > 1e-9 for x in real):
            self.ledger.append({"day": self.day(), "hour": self.hour, "source": source, "health": real[0],
                                "food": real[1], "water": real[2], "fuel": real[3]})
        if self.health <= 0 and not self.ending:
            self.end("DIED", source)
        return real

    def hurt(self, amount, source, why):
        """Every health loss goes through here, so it always carries a reason."""
        self.msgs.append({"kind": "bad", "text": f"-{amount:g} health: {why}", "why": why})
        self.change(source, health=-amount)

    def advance(self, hours, source):
        """Move the clock forward: food/water drain, starvation, and the hidden infection timeline."""
        if hours <= 0 or self.ending:
            return
        p = self.p
        fr, wr = p["food_drain_per_12h"] / 12.0, p["water_drain_per_12h"] / 12.0
        h_food0 = max(0.0, hours - self.food / fr)    # hours spent at 0 food during this stretch
        h_water0 = max(0.0, hours - self.water / wr)
        self.hour += hours
        self.change("hunger & thirst", food=-fr * hours, water=-wr * hours)
        dmg = p["starving_damage_per_12h"] * h_food0 / 12.0 + p["dehydrated_damage_per_12h"] * h_water0 / 12.0
        if dmg > 0:
            why = "you ran out of " + ("food and water" if h_food0 > 0 and h_water0 > 0 else "food" if h_food0 > 0 else "water")
            self.msgs.append({"kind": "bad", "text": f"-{dmg:.1f} health: {why}", "why": why})
            self.change("starving / dehydrated", health=-dmg)
        self.check_infection()

    def check_infection(self):
        inf = self.infection
        if not inf or inf["treated"] or self.ending:
            return
        p = self.p
        age = self.hour - inf["at"]
        warn_at = p["incubation_hours_player"] - p["warning_hours_before_onset"]
        if "SYMPTOM_LIST" in self.flags:
            warn_at -= p["symptom_list_hours"]
        if not inf["warned"] and age >= warn_at:
            inf["warned"] = True
            self.msgs.append({"kind": "bad", "text": "A fever is building and the bite throbs. You've been infected."})
            self.try_treatment("medicine in your pack")
        if not inf["treated"] and age >= p["incubation_hours_player"]:
            self.end("TURNED", f"infected at {self.fmt_hour(inf['at'])}, untreated at onset")

    def try_treatment(self, how):
        cure = next((f for f in CURE_FLAGS if f in self.flags), None)
        if not cure or not self.infection or self.infection["treated"]:
            return False
        self.flags.remove(cure)
        return self.treat(how)

    def treat(self, how):
        ok = self.rng.get("treat").random() < self.p["treatment_success"]
        self.events.append({"hour": self.hour, "type": "treatment", "ok": ok})
        if ok:
            self.infection["treated"] = True
            self.msgs.append({"kind": "good", "text": f"Treated with {how}. The fever breaks."})
        else:
            self.msgs.append({"kind": "bad", "text": f"The treatment ({how}) didn't work."})
        return ok

    def fmt_hour(self, h):
        t = 8.0 + h
        return f"Day {int(t // 24) + 1} {int(t % 24):02d}:{int(round((t % 1) * 60)) % 60:02d}"

    def end(self, kind, detail=""):
        if not self.ending:
            self.ending = kind
            self.ending_detail = detail
            self.events.append({"hour": self.hour, "type": "ending", "ending": kind})

    # ------------------------------------------------------------------ risk models
    def option_attrs(self, scene, o):
        if "attrs" in o:
            a = o["attrs"]
        else:
            key = f"{scene['id']}:{o['letter']}" + (":alt" if o.get("_alt") else "")
            if key not in self.attrs:
                raise KeyError(f"No decision attributes for option {key}. Rebuild content/option_attributes.csv.")
            a = self.attrs[key]
        return self.effective_attrs(o, a)

    def effective_attrs(self, o, a):
        """Situational changes to an option's time and exposure (no randomness, no state changes)."""
        a = dict(a)
        if "CROWD_SMART" in self.flags and a["exposure"] == "high":
            a["exposure"] = "medium"
        if "NEXT_SHELTER_CONTACT" in self.flags and a["activity"] == "shelter":
            a["exposure"] = "contact"
        if o.get("svi_delay"):
            svi = self.svi_here()
            a["hours"] = a["hours"] + o["svi_delay"] * (self.p["svi_delay_base"] + self.p["svi_delay_slope"] * (svi or 0.0))
        g = o.get("gate") or {}
        if g.get("needs_fuel"):
            if self.fuel >= g["needs_fuel"]:
                a["fuel_gal"] = -g["fuel_cost"]
            else:
                a["hours"] = a["hours"] + g["else_hours"]
        return a

    def injury_breakdown(self, o, a, night):
        p = self.p
        temp, snow = self.weather()
        base = o["injury_chance"] / 100.0
        if a["setting"] == "open":
            w = 1.0 + p["weather_cold_slope"] * max(0.0, 32.0 - temp)
            if snow is not None:
                w += p["weather_snow_slope"] * snow
            w = min(p["weather_mult_max"], w)
        else:
            w = 1.0
        act = p["activity_injury_mult"][a["activity"]]
        tm = p["night_injury_mult"] if night else 1.0
        prob = min(p["injury_cap"], base * w * act * tm)
        return {"base": base, "weather": w, "activity": act, "time": tm, "p": prob,
                "temp_f": temp, "snow_in": snow, "damage": o["damage"]}

    def infection_breakdown(self, a, night):
        p = self.p
        S, E, I, R = self.local()
        k = p["k_by_exposure"][a["exposure"]]
        setting = p["setting_mult"][a["setting"]]
        nm = p["night_infection_mult"] if night else 1.0
        gear = p["gear_mult"]
        lam = k * I * a["hours"] * setting * nm * gear
        return {"k": k, "prevalence": I, "hours": a["hours"], "setting": setting, "night": nm, "gear": gear,
                "p": 1.0 - math.exp(-lam)}

    def expected_option(self, scene, o, night):
        """Used by the AI policies and the dominance report: risks, time, supplies for one option."""
        a = self.option_attrs(scene, o)
        inj = self.injury_breakdown(o, a, night)
        inf = self.infection_breakdown(a, night)
        harm = (o.get("harm") or {}).get("health", 0)
        sick = self.infection is not None and not self.infection["treated"]
        return {"a": a, "p_injury": inj["p"], "exp_damage": inj["p"] * o["damage"] + harm, "p_infection": inf["p"],
                "hours": a["hours"] - a["travel_hours_saved"], "food": o.get("food", 0), "water": o.get("water", 0),
                "heal": o.get("heal", 0), "fuel": a["fuel_gal"],
                "cure": self.p["treatment_success"] if (o.get("treat") and sick) else 0.0}

    # ------------------------------------------------------------------ scenes
    def condition(self, cond):
        p = self.p
        if cond == "low_fuel":
            return self.vehicle and self.fuel < p["low_fuel_gal"]
        if cond == "infected_symptoms":
            return bool(self.infection and self.infection["warned"] and not self.infection["treated"])
        if cond == "behind":
            return self.hours_behind() > p["behind_hours"]
        if cond == "low_health":
            return self.health < p["low_health"]
        return False

    def visible_options(self, scene):
        out = []
        for o in scene["options"]:
            if o.get("unlock_flag") and o["unlock_flag"] not in self.flags:
                continue
            if o.get("condition") and not self.condition(o["condition"]):
                continue
            if o.get("requires_flag") and o["requires_flag"] not in self.flags:
                alt = dict(o["alt"], letter=o["letter"], sets_flag=None, sets_flags=None, minigame=None, _alt=True)
                alt.setdefault("injury_chance", o["injury_chance"])
                alt.setdefault("damage", o["damage"])
                alt.setdefault("rating", o["rating"])
                out.append(alt)
            else:
                out.append(o)
        return out

    def ask(self, ui, scene, kind):
        options = self.visible_options(scene)
        letter = ui.choose(self, scene, options, kind)
        o = next(x for x in options if x["letter"] == letter)
        result = self.resolve(scene, o, kind)
        self.history.append((scene["id"], o["letter"], o["rating"]))
        ui.outcome(self, scene, o, result)
        if o.get("minigame") and not self.ending:
            self.realistic_game(ui, o["minigame"], "NORMAL", story=True)
        return o

    def resolve(self, scene, o, kind):
        p = self.p
        self.msgs = []
        a = self.option_attrs(scene, o)
        night = (scene.get("time") == "Night") if kind == "main" else self.is_night()
        inj = self.injury_breakdown(o, a, night)
        inf = self.infection_breakdown(a, night)
        r_inj = self.rng.get("injury").random()
        r_inf = self.rng.get("infection").random()
        result = {"injury": inj, "infection": inf, "attrs": a, "hurt": False, "infected": False,
                  "roll_injury": r_inj, "roll_infection": r_inf, "hour_before": self.hour}
        if "NEXT_SHELTER_CONTACT" in self.flags and a["activity"] == "shelter":
            self.flags.remove("NEXT_SHELTER_CONTACT")
        if r_inj < inj["p"]:
            result["hurt"] = True
            self.injuries += 1
            self.hurt(o["damage"], f"injury ({scene['id']})", o.get("note") or "the choice went badly")
        if r_inf < inf["p"] and not self.infection:
            result["infected"] = True
            self.infection = {"at": self.hour, "warned": False, "treated": False}
            self.infections += 1
            self.events.append({"hour": self.hour, "type": "infected", "scene": scene["id"]})
        harm = o.get("harm")
        if harm and not self.ending:
            self.hurt(harm["health"], f"cost ({scene['id']})", harm["reason"])
        gains = {"health": o.get("heal", 0), "food": o.get("food", 0), "water": o.get("water", 0)}
        fuel = a["fuel_gal"]
        if fuel >= p["tank_gallons"]:
            fuel = p["tank_gallons"] - self.fuel
        if any(gains.values()) or fuel:
            self.change(f"supplies ({scene['id']})", health=gains["health"], food=gains["food"],
                        water=gains["water"], fuel=fuel)
            txt = ", ".join(f"{v:+g} {k}" for k, v in gains.items() if v)
            if fuel:
                txt = (txt + ", " if txt else "") + f"{fuel:+.1f} gal fuel"
            self.msgs.append({"kind": "good" if min(list(gains.values()) + [fuel]) >= 0 else "bad", "text": txt})
        if a["vehicle"] == "lost" and self.vehicle:
            self.vehicle = False
            self.msgs.append({"kind": "bad", "text": "You no longer have a vehicle."})
        elif a["vehicle"] == "gained":
            if not self.vehicle:
                self.msgs.append({"kind": "good", "text": "You have a vehicle again."})
            self.vehicle = True
            if self.fuel < p["found_vehicle_min_fuel"]:
                self.change("found vehicle's tank", fuel=p["found_vehicle_min_fuel"] - self.fuel)
        if a["miles_bonus"] > 0:
            gain = min(a["miles_bonus"], self.total_mi - self.miles)
            self.miles += gain
            self.msgs.append({"kind": "good", "text": f"You cover {gain:.0f} extra miles."})
        if a["travel_hours_saved"] > 0:
            self.saved_hours += a["travel_hours_saved"]
        if a["medicine"] and "MED_KIT" not in self.flags:
            self.flags.append("MED_KIT")
            self.msgs.append({"kind": "good", "text": "You now carry medicine (cures an infection before onset, 90%)."})
        if o.get("medicine_chance"):
            if self.rng.get("medicine").random() < o["medicine_chance"] and "MED_KIT" not in self.flags:
                self.flags.append("MED_KIT")
                self.msgs.append({"kind": "good", "text": "You find medicine in the next town."})
            else:
                self.msgs.append({"kind": "bad", "text": "No medicine to be found."})
        if o.get("treat"):
            if self.infection and not self.infection["treated"]:
                self.treat("the medics' treatment")
            else:
                self.msgs.append({"kind": "good", "text": "The medics check you over: no infection."})
        for flag in option_flags(o):
            if flag not in self.flags:
                self.flags.append(flag)
                for cb in self.city["callbacks"]:
                    if cb["trigger_flag"] == flag and cb["id"] not in self.played_callbacks:
                        self.pending.append([cb["delay"], cb])
        g = o.get("gate")
        if g:
            self.quarantine_hours = g.get("quarantine_h", 0.0)
            if g.get("needs_fuel"):
                self.msgs.append({"kind": "good" if a["fuel_gal"] < 0 else "bad",
                                  "text": "The captain takes your fuel." if a["fuel_gal"] < 0
                                  else f"Not enough fuel ({self.fuel:.1f} gal): you wait for the morning boat."})
        if self.infection and self.infection["warned"] and not self.infection["treated"]:
            self.try_treatment("the medicine you just found")
        if a["denied_entry"] and scene["id"] == self.city["scenarios"][-1]["id"]:
            self.end("DENIED", o["note"])
        self.advance(a["hours"], f"time ({scene['id']})")
        result["msgs"] = self.msgs
        result["hour_after"] = self.hour
        self.events.append({"hour": self.hour, "type": "choice", "scene": scene["id"], "rating": o["rating"],
                            "p_injury": inj["p"], "p_infection": inf["p"], "hurt": result["hurt"],
                            "infected": result["infected"], "health": self.health})
        return result

    # ------------------------------------------------------------------ travel
    def speed_mph(self, place, night):
        p = self.p
        temp, snow = self.weather(place)
        slow = 1.0 + p["cold_speed_slope"] * max(0.0, 32.0 - temp)
        if snow is not None:
            slow += p["snow_speed_slope"] * snow
        return p["base_speed_mph"] / slow * (p["night_speed_factor"] if night else 1.0)

    def travel_to(self, ui, i):
        """Drive from the current position to story stop i. Fallback scenes when fuel/vehicle fail."""
        p = self.p
        target = self.places[i]
        night_leg = i % 2 == 0   # legs that end at a Morning stop are driven overnight
        fallbacks_used = 0
        while self.miles < target["mi"] - 1e-6 and not self.ending:
            dist = target["mi"] - self.miles
            if not self.vehicle or self.fuel <= 1e-9:
                if fallbacks_used >= p["max_fallbacks_per_leg"]:
                    self.end("STRANDED", f"{dist:.0f} miles short of the next stop")
                    return
                fallbacks_used += 1
                scene = self.fallbacks["no_vehicle" if not self.vehicle else "out_of_fuel"]
                self.ask(ui, scene, "fallback")
                continue
            mph = self.speed_mph(target, night_leg)
            drive_mi = min(dist, self.fuel * p["mpg"])
            hours = drive_mi / mph
            credit = min(self.saved_hours, hours * 0.5)    # a shortcut can save at most half a leg
            self.saved_hours -= credit
            hours -= credit
            wm = 1.0 + p["cold_speed_slope"] * max(0.0, 32.0 - self.weather(target)[0])
            p_road = 1.0 - math.exp(-p["road_risk_per_hour"] * wm * hours)
            r = self.rng.get("road").random()
            self.miles += drive_mi
            self.change("fuel used driving", fuel=-drive_mi / p["mpg"])
            self.events.append({"hour": self.hour, "type": "drive", "miles": drive_mi, "hours": hours,
                                "mph": mph, "p_road": p_road})
            self.msgs = [{"kind": "", "text": f"You drive {drive_mi:.0f} miles in {hours:.1f} h ({drive_mi / p['mpg']:.1f} gal of fuel)."}]
            self.advance(hours, "driving")
            if r < p_road and not self.ending:
                self.hurt(p["road_damage"], "road accident", "you slid off the icy road")
            ui.message(self, "On the road", self.msgs)
        if self.ending:
            return
        self.place = target
        if i % 2 == 0 and self.vehicle:          # Morning stops are towns: scavenge some fuel
            gal = self.rng.get("town_fuel").uniform(p["town_fuel_min"], p["town_fuel_max"])
            got = self.change("fuel scavenged in town", fuel=gal)[3]
            if got > 0:
                ui.message(self, "In town", [{"kind": "good", "text": f"You scavenge {got:.1f} gallons of fuel."}])
        if self.hour < target["nominal"]:      # early: rest until the story's scheduled time
            self.msgs = []
            self.advance(target["nominal"] - self.hour, "rest / waiting")
            if self.msgs:
                ui.message(self, "Resting", self.msgs)

    # ------------------------------------------------------------------ data-driven event scenes
    def event_due(self, i):
        p = self.p
        for trig in EVENT_ORDER:
            ev = self.events_content.get(trig)
            if not ev or ev["id"] in self.played_events:
                continue
            if trig == "rabies":
                ok = bool(self.infection and not self.infection["warned"] and not self.infection["treated"]
                          and not any(f in self.flags for f in CURE_FLAGS))
            elif trig == "fuel":
                ok = i % 2 == 0 and self.vehicle and self.fuel < p["fuel_event_threshold"]
            elif trig == "r0":
                ok = i == 5
            elif trig == "svi":
                s = self.svi_here()
                ok = i < 13 and s is not None and s >= p["svi_event_threshold"]
            else:
                a65 = self.pct65_here()
                ok = i < 13 and a65 is not None and a65 >= p["age_event_threshold"]
            if ok:
                return ev
        return None

    def event_scene(self, ev):
        s = dict(ev)
        if ev["trigger"] == "r0":
            r0 = self.traj[self.place["a"]].r0(self.outbreak_day())
            s["text"] = ev["text"].replace("[local R0]", f"{r0:.0f}")
            s["r0"] = r0
        if ev["trigger"] == "svi":
            svi = self.svi_here()
            s["svi"] = svi
            s["delay_h"] = self.p["svi_delay_base"] + self.p["svi_delay_slope"] * svi
        if ev["trigger"] == "age":
            s["pct65"] = self.pct65_here()
        s["county"] = self.counties[self.stops[self.place["a"]]["geoid"]]["name"]
        return s

    # ------------------------------------------------------------------ rolls & minigames
    def realistic_game(self, ui, name, tier, story=False):
        if story and name in self.used_games:
            return
        p = self.p
        if name not in self.used_games:
            self.used_games.append(name)
        self.minigame_log[tier] += 1
        live = ui.minigame(self, name, tier)
        r = self.rng.get("minigame_win").random()
        win = (r < p["minigame_win_prob_sim"][tier]) if live is None else bool(live[0])
        fx = self.rgames[name]["fx"]["win" if win else "fail"]
        self.msgs = []
        if win:
            self.minigame_log["wins"] += 1
            self.msgs.append({"kind": "good", "text": "Good job! " + self.rgames[name]["win_text"]})
            if fx.get("heal") or fx.get("water") or fx.get("fuel"):
                self.change(f"minigame ({name})", health=fx.get("heal", 0), water=fx.get("water", 0), fuel=fx.get("fuel", 0))
            if fx.get("saved"):
                self.saved_hours += fx["saved"]
            if fx.get("flag") and fx["flag"] not in self.flags:
                self.flags.append(fx["flag"])
            if fx.get("reveal") and self.infection and not self.infection["warned"] and not self.infection["treated"]:
                self.infection["warned"] = True
                self.msgs.append({"kind": "bad", "text": "Cleaning the wound, you find a bite mark. You're infected, but you know early."})
                self.try_treatment("medicine in your pack")
            elif fx.get("reveal"):
                self.msgs.append({"kind": "good", "text": "No bite marks. It's just a wound."})
        elif tier == "EASY":
            self.msgs.append({"kind": "", "text": "Not this time, but no harm done."})
        else:
            if fx.get("harm"):
                self.hurt(fx["harm"], f"minigame ({name})", fx["reason"])
            if fx.get("fuel"):
                self.change(f"minigame ({name})", fuel=fx["fuel"])
                self.msgs.append({"kind": "bad", "text": f"{fx['fuel']:+.1f} gal fuel: {fx['reason']}"})
            if fx.get("lose_vehicle") and self.vehicle:
                self.vehicle = False
                self.msgs.append({"kind": "bad", "text": f"You lose the vehicle: {fx['reason']}."})
            if fx.get("hours"):
                self.msgs.append({"kind": "bad", "text": f"+{fx['hours']:g} h: {fx['reason']}"})
                self.advance(fx["hours"], f"minigame ({name})")
            if not fx:
                self.msgs.append({"kind": "", "text": "No luck, but no harm done."})
        self.events.append({"hour": self.hour, "type": "minigame", "name": name, "tier": tier, "win": win})
        ui.message(self, f"Mini game: {name} ({tier})", self.msgs)

    def mini_game(self, ui, tier, double=False):
        p = self.p
        unused = [g for g in self.pool if g not in self.used_games]
        if not unused:
            self.used_games, unused = [], list(self.pool)
        name = unused[int(self.rng.get("minigame_pick").random() * len(unused))]
        if name in self.rgames:
            self.realistic_game(ui, name, tier)
            return
        self.used_games.append(name)
        self.minigame_log[tier] += 1
        live = ui.minigame(self, name, tier)
        r = self.rng.get("minigame_win").random()
        if live is None:
            win, bonus = r < p["minigame_win_prob_sim"][tier], {}
        else:
            win, bonus = live
        self.msgs = []
        if bonus:
            self.change(f"minigame bonus ({name})", health=bonus.get("health", 0), food=bonus.get("food", 0),
                        water=bonus.get("water", 0))
        reward = MINIGAMES[name]
        dmg_r = self.rng.get("minigame_dmg").random()
        if win:
            self.minigame_log["wins"] += 1
            if tier == "HARD":
                self.change(f"minigame ({name})", health=p["hard_win_health"])
                self.msgs.append({"kind": "good", "text": f"Good job! You escaped unhurt. +{p['hard_win_health']:g} health"})
            else:
                amt = p["minigame_reward"][tier] * (2 if double else 1)
                self.change(f"minigame ({name})", health=amt if reward == "health" else 0,
                            food=amt if "food" in reward else 0, water=amt if "water" in reward else 0)
                self.msgs.append({"kind": "good", "text": f"Good job! +{amt:g} {reward}"})
        elif tier != "EASY":
            lo, hi = p["hard_loss_damage"] if tier == "HARD" else p["normal_loss_damage"]
            dmg = lo + int(dmg_r * (hi - lo + 1))
            self.hurt(dmg, f"minigame ({name})", f"you lost the {name} mini game")
        else:
            self.msgs.append({"kind": "", "text": "Failed, but no harm done."})
        self.events.append({"hour": self.hour, "type": "minigame", "name": name, "tier": tier, "win": win})
        ui.message(self, f"Mini game: {name} ({tier})", self.msgs)

    def pair_roll(self, ui):
        bad = sum(r in ("RISKY", "WORST") for r in self.recent)
        pair = "risky" if bad == 2 else "mixed" if bad == 1 else "good"
        roll = int(self.rng.get("roll").random() * 101)
        last = self.recent[-1]
        self.recent = []
        if pair == "risky":
            if roll <= 60:
                self.mini_game(ui, "HARD")
            else:
                d = self.day()
                fits = [b for b in self.city["branches"]
                        if b["days"][0] <= d <= b["days"][1] and b["id"] not in self.used_branches]
                fits.sort(key=lambda b: b["type"] != last)
                if fits:
                    self.used_branches.append(fits[0]["id"])
                    self.minigame_log["detours"] += 1
                    self.ask(ui, fits[0], "detour")
                else:
                    self.mini_game(ui, "NORMAL")
        elif pair == "mixed":
            self.mini_game(ui, "NORMAL" if roll <= 50 else "EASY")
        else:
            self.mini_game(ui, "EASY", double=roll > 50)

    # ------------------------------------------------------------------ main loop
    def run(self, ui):
        main = self.city["scenarios"]
        for i, s in enumerate(main):
            self.scene_index = i
            if i > 0:
                self.travel_to(ui, i)
                if self.ending:
                    break
                if self.hour > self.p["deadline_hours"]:
                    self.end("TOO_LATE", f"arrived near stop {i + 1} at {self.fmt_hour(self.hour)}")
                    break
            ev = self.event_due(i)
            if ev:
                self.played_events.append(ev["id"])
                self.ask(ui, self.event_scene(ev), "event")
                if self.ending:
                    break
            for item in [x for x in self.pending if x[0] <= 0]:
                self.pending.remove(item)
                self.played_callbacks.append(item[1]["id"])
                self.ask(ui, item[1], "callback")
                if self.ending:
                    break
            if self.ending:
                break
            o = self.ask(ui, s, "main")
            self.recent.append(o.get("weather_rating") or o["rating"])
            fl = option_flags(o)
            for item in self.pending:
                if item[1]["trigger_flag"] not in fl:
                    item[0] -= 1
            if self.ending:
                break
            if i % 2 == 1 and i < len(main) - 1:
                self.pair_roll(ui)
                if self.ending:
                    break
        if not self.ending:
            self.arrive()
        ui.end(self)
        return self.ending

    def arrive(self):
        """At the safe zone: medical screening. Infected but not yet turned -> treatment attempt.
        Quarantine time after arrival does not count against the deadline."""
        if self.miles < self.total_mi - 1e-6:
            self.end("STRANDED", "the story ended before the player reached the safe zone")
            return
        if self.hour > self.p["deadline_hours"]:
            self.end("TOO_LATE", f"arrived {self.fmt_hour(self.hour)}")
            return
        if self.infection and not self.infection["treated"]:
            ok = self.rng.get("treat").random() < self.p["treatment_success"]
            self.events.append({"hour": self.hour, "type": "screening", "ok": ok})
            if ok:
                self.infection["treated"] = True
                self.ending_detail = "infected, treated in quarantine at the safe zone"
            else:
                self.end("TURNED", "infection found at the gate; treatment failed")
                return
        if self.quarantine_hours and not self.ending_detail:
            self.ending_detail = f"admitted after {self.quarantine_hours:g} h of quarantine"
        self.end("VICTORY", self.ending_detail or "")

    # ------------------------------------------------------------------ reporting helpers
    def summary(self):
        ratings = [r for _, _, r in self.history]
        return {"city": self.code, "seed": self.seed, "ending": self.ending, "detail": self.ending_detail,
                "survived": self.ending == "VICTORY", "hours": self.hour, "days": self.hour / 24.0,
                "health": self.health, "food": self.food, "water": self.water, "fuel": self.fuel,
                "miles": self.miles, "miles_left": max(0.0, self.total_mi - self.miles),
                "infections": self.infections, "injuries": self.injuries, "strength": self.strength,
                "choices": {r: ratings.count(r) for r in RATINGS}, "minigames": list(self.used_games),
                "callbacks": list(self.played_callbacks), "detours": list(self.used_branches),
                "events": list(self.played_events)}
