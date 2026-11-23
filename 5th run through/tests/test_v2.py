"""Rules added with the revised scenarios (v2)."""
import pytest
from zombie_sim.sim import assets, SimUI, play
from zombie_sim.engine import Game
from zombie_sim.policies import POLICIES
from zombie_sim.params import PARAMS
from zombie_sim.seir import age_multiplier


def new_game(city="NYC", seed=1):
    w, c, a, f = assets()
    return Game(w, c, a, f, city, seed)


def scene(g, sid):
    return next(s for s in g.city["scenarios"] + g.city["branches"] + g.city["callbacks"] if s["id"] == sid)


class Rec(SimUI):
    def __init__(self, policy=POLICIES["balanced"]):
        super().__init__(policy)
        self.scenes, self.msgs = [], []

    def choose(self, game, s, options, kind):
        self.scenes.append(s["id"])
        return self.policy(game, s, options)

    def message(self, game, title, msgs):
        self.msgs.append((title, list(msgs)))


def test_svi_loaded_and_valid():
    w = assets()[0]
    assert len(w["svi"]) == 44
    assert w["svi"]["48375"]["svi"] == pytest.approx(0.9889)       # Potter County, TX
    assert 15 < w["age_ref"] < 17


def test_age_multiplier_bounds_and_direction():
    assert age_multiplier(None, 16) == 1.0
    assert age_multiplier(26, 16) == pytest.approx(1.1)
    assert age_multiplier(0, 16) == pytest.approx(0.9)
    assert age_multiplier(18, 16) > 1 > age_multiplier(14, 16)


def test_unlocked_option_needs_its_flag():
    g = new_game("NYC")
    s = scene(g, "NYC-07N")
    assert "E" not in [o["letter"] for o in g.visible_options(s)]
    g.flags.append("NJ_CONTACTS")
    assert "E" in [o["letter"] for o in g.visible_options(s)]


def test_conditional_options_follow_state():
    g = new_game("NYC")
    g.scene_index = 10
    s = scene(g, "NYC-06M")
    letters = lambda: [o["letter"] for o in g.visible_options(s)]
    assert "F" not in letters()
    g.fuel = 3
    assert "F" in letters()
    n = scene(g, "NYC-01N")
    g.scene_index = 1
    assert "R" not in [o["letter"] for o in g.visible_options(n)]
    g.health = 30
    assert "R" in [o["letter"] for o in g.visible_options(n)]


def test_treatment_option_cures_most_infections():
    cured = 0
    for seed in range(1, 101):
        g = new_game("NYC", seed)
        g.infection = {"at": 0.0, "warned": True, "treated": False}
        s = scene(g, "NYC-05M")
        o = next(x for x in s["options"] if x.get("condition") == "infected_symptoms")
        g.resolve(s, o, "main")
        cured += g.infection["treated"]
    assert 80 <= cured <= 98      # 90% treatment success


def test_every_health_loss_has_a_reason():
    for city in ("NYC", "BOS", "JAC"):
        for seed in range(1, 15):
            ui = Rec(POLICIES["random"])
            g = Game(*assets()[:2], assets()[2], assets()[3], city, seed)
            g.run(ui)
            for title, msgs in ui.msgs:
                for m in msgs:
                    if "health" in m["text"] and m["text"].startswith("-"):
                        assert ": " in m["text"] and len(m["text"].split(": ", 1)[1]) > 3, m


def test_gate_quarantine_does_not_count_against_deadline():
    g = new_game("SLC")
    s = scene(g, "SLC-07N")
    g.scene_index, g.place = 13, g.places[13]
    g.miles, g.hour = g.total_mi, 150.0
    a = next(o for o in s["options"] if o["letter"] == "A")
    g.resolve(s, a, "main")
    g.arrive()
    assert g.ending == "VICTORY" and g.quarantine_hours == 24 and g.hour < PARAMS["deadline_hours"]


def test_gate_fuel_offer_depends_on_fuel():
    for fuel, ok in ((10, True), (2, False)):
        g = new_game("JAC")
        s = scene(g, "JAC-07N")
        g.scene_index, g.place, g.fuel, g.hour = 13, g.places[13], fuel, 150.0
        c = next(o for o in s["options"] if o["letter"] == "C")
        h0 = g.hour
        g.resolve(s, c, "main")
        assert (g.fuel == pytest.approx(fuel - 5)) if ok else (g.hour - h0 >= 10)


def test_events_play_where_the_data_says():
    # Boston (Suffolk County) has CDC SVI 0.78 >= 0.75: the gridlock scene plays on Day 1
    ui = Rec()
    g = Game(*assets()[:2], assets()[2], assets()[3], "BOS", 2)
    g.run(ui)
    assert "EV-SVI" in g.played_events and ui.scenes.index("EV-SVI") < ui.scenes.index("BOS-01M")
    # every route hears the radio doctor on Day 3 Night (if still alive then)
    for city in ("NYC", "SEA", "AUS"):
        g = play(city, 4, POLICIES["balanced"])
        if g.hour > 60:
            assert "EV-R0" in g.played_events


def test_realistic_minigame_plays_after_its_story_option():
    g = new_game("PIT")
    s = scene(g, "PIT-05M")
    ui = Rec()
    o = next(x for x in s["options"] if x["letter"] == "A")
    assert o["minigame"] == "Put On Tire Chains"
    g.place = g.places[8]
    g.scene_index = 8
    g.realistic_game(ui, o["minigame"], "NORMAL", story=True)
    assert "Put On Tire Chains" in g.used_games
    n = len(ui.msgs)
    g.realistic_game(ui, o["minigame"], "NORMAL", story=True)   # no repeats
    assert len(ui.msgs) == n


def test_no_minigame_repeats_with_18_games():
    for city in ("NYC", "PIT", "SEA"):
        for seed in range(1, 30):
            g = play(city, seed, POLICIES["random"])
            assert len(g.used_games) == len(set(g.used_games))


def test_arrival_seeding_hits_targets():
    """v3: every route stop's starting level puts it near its arrival target (strength 1.0)."""
    from zombie_sim.data_loader import load_world
    from zombie_sim.seir import Trajectory, arrival_day, seed_target, age_multiplier
    w = load_world()
    for stops in w["routes"].values():
        for k, s in enumerate(stops):
            c, st, sv = w["counties"][s["geoid"]], w["stations"][s["station"]], w["svi"].get(s["geoid"])
            am = age_multiplier(sv["pct65"], w["age_ref"]) if sv else 1.0
            I = Trajectory(c["density"], st["tavg_f"], 1.0, age_mult=am, i0=s["i0"]).at(arrival_day(k))[2]
            assert abs(I - seed_target(k, c["density"])) < 0.01, (s["label"], I)


def test_seed_target_shape():
    from zombie_sim.seir import seed_target
    assert seed_target(0, 100) < seed_target(3, 100) < seed_target(7, 100)   # rises over the trip
    assert seed_target(3, 10) < seed_target(3, 100) < seed_target(3, 10000)  # density tilt
    assert seed_target(0, 1) >= 0.02                                          # floor
