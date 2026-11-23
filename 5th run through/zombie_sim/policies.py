"""
Decision policies used by the Monte Carlo simulator ("AI players"). All are state-dependent:
they look at the player's health, supplies, fuel, schedule and the local outbreak.
"""
import math

RATINGS = ("BEST", "OKAY", "RISKY", "WORST")


def _scored(game, scene, options, score):
    night = (scene.get("time") == "Night") if ("day" in scene and "trigger" not in scene) else game.is_night()
    best, best_s = None, None
    for o in options:
        e = game.expected_option(scene, o, night)
        s = score(game, o, e)
        if scene["id"].startswith("FB-") and e["fuel"] <= 0 and e["a"]["vehicle"] != "gained" \
                and e["a"]["miles_bonus"] <= 0:
            s += 50.0   # every policy knows that waiting does not fix an empty tank or a missing car
        if best_s is None or s < best_s - 1e-12:
            best, best_s = o, s
    return best["letter"]


def behind_schedule(game):
    """Hours behind the pace needed to reach the safe zone by the deadline (0 if on pace)."""
    left_mi = max(0.0, game.total_mi - game.miles)
    left_h = game.p["deadline_hours"] - game.hour
    need_h = left_mi / game.p["base_speed_mph"] * 1.4
    return max(0.0, need_h - left_h + 24.0)


def lowest_risk(game, scene, options):
    c = game.p["infection_cost_for_policy"]
    return _scored(game, scene, options, lambda g, o, e: e["exp_damage"] + c * e["p_infection"] - c * e["cure"] + 0.01 * e["hours"])


def supplies(game, scene, options):
    def score(g, o, e):
        need_f = 1.5 if g.food < 30 else 1.0
        need_w = 1.5 if g.water < 30 else 1.0
        need_h = 1.5 if g.health < 40 else 0.5
        need_fuel = 3.0 if g.fuel < 8 else 1.0
        gain = need_f * e["food"] + need_w * e["water"] + need_h * e["heal"] + need_fuel * e["fuel"]
        return -gain + 0.3 * e["exp_damage"] - 60.0 * e["cure"]
    return _scored(game, scene, options, score)


def speed(game, scene, options):
    return _scored(game, scene, options, lambda g, o, e: e["hours"] - e["a"]["miles_bonus"] / 50.0 + 0.05 * e["exp_damage"] - 60.0 * e["cure"])


def balanced(game, scene, options):
    """Weighs injury, infection, time and supplies, with weights that change with the player's state."""
    def score(g, o, e):
        hp_w = 1.0 + (1.0 - g.health / 100.0) * 2.0
        late = behind_schedule(g)
        time_w = 0.5 + late / 12.0
        food_w = 0.4 if g.food < 40 else 0.15
        water_w = 0.4 if g.water < 40 else 0.15
        fuel_w = 1.0 if g.fuel < 10 else 0.2
        return (hp_w * e["exp_damage"] + 60.0 * e["p_infection"] - 60.0 * e["cure"] + time_w * e["hours"]
                - food_w * e["food"] - water_w * e["water"] - hp_w * 0.5 * e["heal"] - fuel_w * e["fuel"])
    return _scored(game, scene, options, score)


def best_rating(game, scene, options):
    """Oracle reference: always the option the writers rated BEST (players cannot see ratings)."""
    for r in RATINGS:
        for o in options:
            if o["rating"] == r:
                return o["letter"]


def random_policy(game, scene, options):
    return options[int(game.rng.get("policy").random() * len(options))]["letter"]


def style_policy(weights):
    """'Your style': picks a rating with the same frequencies as a real player's choices."""
    tot = sum(weights.get(r, 0) + 0.5 for r in RATINGS)
    probs = [(weights.get(r, 0) + 0.5) / tot for r in RATINGS]

    def choose(game, scene, options):
        u = game.rng.get("policy").random()
        acc = 0.0
        want = RATINGS[-1]
        for r, pr in zip(RATINGS, probs):
            acc += pr
            if u < acc:
                want = r
                break
        order = sorted(RATINGS, key=lambda r: abs(RATINGS.index(r) - RATINGS.index(want)))
        for r in order:
            for o in options:
                if o["rating"] == r:
                    return o["letter"]
    return choose


POLICIES = {"balanced": balanced, "lowest_risk": lowest_risk, "supplies": supplies, "speed": speed,
            "random": random_policy, "best_rating": best_rating}
