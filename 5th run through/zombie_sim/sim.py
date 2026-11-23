"""Headless runs and the Monte Carlo simulator."""
import statistics

import os
from .attributes import load_attributes, load_content, CONTENT
from .data_loader import load_world
from .engine import Game, load_fallbacks, ENDINGS
from .policies import POLICIES


class SimUI:
    def __init__(self, policy):
        self.policy = policy

    def choose(self, game, scene, options, kind):
        return self.policy(game, scene, options)

    def outcome(self, game, scene, option, result):
        pass

    def minigame(self, game, name, tier):
        return None

    def message(self, game, title, msgs):
        pass

    def end(self, game):
        pass


_CACHE = {}


def assets():
    if "a" not in _CACHE:
        _CACHE["a"] = (load_world(), load_content(os.path.join(CONTENT, "scenarios_v2.json")), load_attributes(), load_fallbacks())
    return _CACHE["a"]


def play(city, seed, policy, world=None):
    w, content, attrs, fb = world or assets()
    g = Game(w, content, attrs, fb, city, seed)
    g.run(SimUI(policy))
    return g


def monte_carlo(city, policy, runs=1000, seed0=1, world=None):
    """Seeds seed0..seed0+runs-1. Every policy uses the same seeds -> matched random streams."""
    games = [play(city, seed0 + k, policy, world) for k in range(runs)]
    return summarize([g.summary() for g in games])


def summarize(rows):
    n = len(rows)
    surv = [r for r in rows if r["survived"]]
    endings = {k: sum(r["ending"] == k for r in rows) / n for k in ENDINGS}
    mean = lambda xs: statistics.fmean(xs) if xs else float("nan")
    return {
        "runs": n, "survival_rate": len(surv) / n, "endings": endings,
        "avg_days": mean([r["days"] for r in rows]),
        "avg_days_survivors": mean([r["days"] for r in surv]),
        "avg_health_survivors": mean([r["health"] for r in surv]),
        "avg_food": mean([r["food"] for r in rows]), "avg_water": mean([r["water"] for r in rows]),
        "avg_fuel": mean([r["fuel"] for r in rows]),
        "infection_rate": sum(r["infections"] > 0 for r in rows) / n,
        "avg_injuries": mean([r["injuries"] for r in rows]),
        "avg_miles_left": mean([r["miles_left"] for r in rows]),
        "rows": rows,
    }
