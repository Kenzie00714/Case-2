"""
Zombie Escape - console version.

  python play.py                 play (pick a city)
  python play.py --city NYC --seed 42 --debug   show every probability calculation
  python play.py --auto balanced  let an AI policy play (balanced, lowest_risk, supplies, speed, random, best_rating)
"""
import argparse
import random
import sys
import time

from zombie_sim.engine import Game, load_fallbacks, ENDINGS
from zombie_sim.data_loader import load_world
import os
from zombie_sim.attributes import load_attributes, load_content, CONTENT
from zombie_sim.policies import POLICIES
from zombie_sim.params import PARAMS

TIME_LIMIT = PARAMS["timer_seconds"]


def bar(v, width=20):
    n = int(round(max(0, min(100, v)) / 100 * width))
    return "#" * n + "." * (width - n)


class ConsoleUI:
    def __init__(self, debug=False, policy=None):
        self.debug, self.policy = debug, policy

    def status(self, g):
        S, E, I, R = g.local()
        st = g.stops[g.place["a"]]
        c = g.counties[st["geoid"]]
        print(f"  {g.fmt_hour(g.hour)} | {g.place_label()} | {g.total_mi - g.miles:,.0f} mi to go | deadline Day 7 24:00")
        print(f"  HEALTH {g.health:5.1f} {bar(g.health)}  FOOD {g.food:5.1f}  WATER {g.water:5.1f}  "
              f"FUEL {g.fuel:4.1f} gal  {'vehicle' if g.vehicle else 'ON FOOT'}")
        print(f"  Outbreak in {c['name']}, {c['state']}: {I * 100:.1f}% infectious, {E * 100:.1f}% exposed "
              f"\n  January normal at this stop (NOAA 1991-2020): {g.weather()[0]:.1f}F - story weather may be a fictional storm"
              f"\n  (R0 {g.traj[g.place['a']].r0(g.outbreak_day()):.1f}, Re {g.traj[g.place['a']].r_effective(g.outbreak_day()):.1f}; fictional)")

    def choose(self, g, scene, options, kind):
        print("\n" + "=" * 70)
        label = {"main": f"Day {scene.get('day')} {scene.get('time')}", "callback": "CALLBACK",
                 "detour": "DETOUR", "fallback": "ON THE ROAD", "event": "EVENT"}[kind]
        print(f"{label}: {scene['title']}")
        self.status(g)
        print("\n" + scene["text"])
        for o in options:
            tag = {"low_fuel": " [low fuel]", "infected_symptoms": " [symptoms]", "behind": " [behind schedule]",
                   "low_health": " [low health]"}.get(o.get("condition"), "")
            if o.get("unlock_flag"):
                tag = f" [unlocked: {o['unlock_flag']}]"
            print(f"  {o['letter']}. {o['text']}{tag}")
        if self.policy:
            return self.policy(g, scene, options)
        t0 = time.time()
        choice = input(f"Choose {'/'.join(o['letter'] for o in options)}" + ("" if self.debug else f" ({TIME_LIMIT} seconds)") + ": ").strip().upper()
        letters = [o["letter"] for o in options]
        if (not self.debug and time.time() - t0 > TIME_LIMIT) or choice not in letters:
            choice = random.choice(letters)
            print(f"  Too slow or unclear. You froze, and your feet chose {choice}.")
        return choice

    def outcome(self, g, scene, o, r):
        inj, inf, a = r["injury"], r["infection"], r["attrs"]
        print(f"  -> {o['note']}")
        for m in r["msgs"]:
            print("  * " + m["text"])
        if self.debug:
            snow = "no NOAA snow normal" if inj["snow_in"] is None else f"{inj['snow_in']:.1f} in snow"
            print(f"  [injury]   {inj['base']:.2f} base x {inj['weather']:.2f} weather ({inj['temp_f']:.1f}F, {snow}) "
                  f"x {inj['activity']:.2f} {a['activity']} x {inj['time']:.2f} time = {inj['p']:.1%}  roll {r['roll_injury']:.3f}")
            print(f"  [infection] 1-exp(-{inf['k']} k x {inf['prevalence']:.3f} prevalence x {inf['hours']}h x "
                  f"{inf['setting']} {a['setting']} x {inf['night']} night x {inf['gear']} gear) = {inf['p']:.2%}  "
                  f"roll {r['roll_infection']:.3f}")
            print(f"  [rating {o['rating']}] time {a['hours']}h, fuel {a['fuel_gal']:+g}, {a['evidence'] or 'no special effects'}")

    def minigame(self, g, name, tier):
        if self.policy:
            return None
        if name in g.rgames:
            return self.realistic(g.rgames[name], tier)
        print("\n" + "*" * 70 + f"\nMINI GAME ({tier}): {name}")
        try:
            import minigames
            return minigames.play(name, tier)
        except Exception as exc:   # report it: the engine then uses the simulated result
            print(f"  (live mini game unavailable: {exc}; result simulated)")
            return None

    def realistic(self, game, tier):
        """Console version of a realistic mini game: put the real steps in the right order before time runs out."""
        import re
        steps = [x.strip() for x in re.split(r"\s*\d+\.\s+", game["steps"]) if x.strip()]
        order = list(range(len(steps)))
        random.shuffle(order)
        limit = {"EASY": 90, "NORMAL": 60, "HARD": 40}[tier]
        print("\n" + "*" * 70 + f"\nMINI GAME ({tier}): {game['name']}")
        print(f"Goal: type the steps in the correct real-world order (e.g. 3 1 2 ...). You have {limit} seconds.")
        if tier == "EASY":
            print("Hint: " + game["mistakes"])
        for n, k in enumerate(order, 1):
            print(f"  {n}. {steps[k]}")
        t0 = time.time()
        ans = input("Your order: ").replace(",", " ").split()
        try:
            picked = [order[int(x) - 1] for x in ans]
        except (ValueError, IndexError):
            picked = []
        win = picked == list(range(len(steps))) and time.time() - t0 <= limit
        print("Good job! That's the right order." if win else "Not quite. The right order was: " + " -> ".join(steps))
        return (win, {})

    def message(self, g, title, msgs):
        print(f"\n-- {title} --")
        for m in msgs:
            print("  * " + m["text"])

    def end(self, g):
        print("\n" + "=" * 70)
        print(f"ENDING: {g.ending} - {ENDINGS[g.ending]}" + (f" ({g.ending_detail})" if g.ending_detail else ""))
        s = g.summary()
        print(f"Time {g.fmt_hour(g.hour)}  health {g.health:.0f}  food {g.food:.0f}  water {g.water:.0f}  "
              f"fuel {g.fuel:.1f}  miles left {s['miles_left']:.0f}")
        print("Choices:", s["choices"], "| mini games:", s["minigames"])
        print("Supply ledger (gains / losses):")
        for k in ("health", "food", "water", "fuel"):
            gain = sum(l[k] for l in g.ledger if l[k] > 0)
            loss = sum(-l[k] for l in g.ledger if l[k] < 0)
            print(f"  {k:7} +{gain:6.1f}  -{loss:6.1f}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--city", choices=["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"])
    ap.add_argument("--seed", type=int)
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--auto", choices=sorted(POLICIES))
    args = ap.parse_args()
    world, attrs, fb = load_world(), load_attributes(), load_fallbacks()
    content = load_content(os.path.join(CONTENT, "scenarios_v2.json"))
    city = args.city
    if not city:
        for i, c in enumerate(content["cities"], 1):
            print(f"{i}. {c['start']} -> {c['end']}")
        city = content["cities"][int(input("Pick a city 1-7: ")) - 1]["code"]
    seed = args.seed if args.seed is not None else random.randrange(1, 10 ** 9)
    print(f"Seed {seed} (replay this game with --seed {seed})")
    g = Game(world, content, attrs, fb, city, seed)
    g.run(ConsoleUI(args.debug, POLICIES.get(args.auto)))


if __name__ == "__main__":
    sys.exit(main())
