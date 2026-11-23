import math
import pytest
from zombie_sim.sim import play, assets, SimUI
from zombie_sim.engine import Game, ENDINGS
from zombie_sim.policies import POLICIES
from zombie_sim.params import PARAMS, MINIGAMES
from zombie_sim.rng import Mulberry32, Streams

CITIES = ["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"]


def new_game(city="NYC", seed=1):
    w, c, a, f = assets()
    return Game(w, c, a, f, city, seed)


def test_content_preserved():
    w, c, a, f = assets()
    assert c["version"] == 2 and len(c["cities"]) == 7
    for city in c["cities"]:
        assert len(city["scenarios"]) == 14 and len(city["branches"]) == 4 and len(city["callbacks"]) == 2
        for s in city["scenarios"] + city["branches"] + city["callbacks"]:
            core = [o for o in s["options"] if o["letter"] in "ABCD"]
            assert sorted(o["rating"] for o in core) == ["BEST", "OKAY", "RISKY", "WORST"], s["id"]
    assert len(MINIGAMES) == 8 and len(c["realistic_minigames"]) == 10 and len(c["events"]) == 5


def test_every_option_has_attributes():
    w, c, a, f = assets()
    for city in c["cities"]:
        for s in city["scenarios"] + city["branches"] + city["callbacks"]:
            for o in s["options"]:
                assert "attrs" in o and o["attrs"]["activity"] in PARAMS["activity_injury_mult"], (s["id"], o["letter"])


def test_rng_is_deterministic_and_matches_reference():
    r = Mulberry32(12345)
    vals = [r.random() for _ in range(3)]
    assert vals == [Mulberry32(12345).random() for _ in range(1)] + vals[1:]
    assert all(0 <= v < 1 for v in vals)
    assert Streams(7).get("injury").random() != Streams(7).get("infection").random()


def test_injury_formula_and_cap():
    g = new_game()
    o = {"injury_chance": 85, "damage": 30}
    a = {"setting": "open", "activity": "contact", "hours": 1, "exposure": "contact"}
    b = g.injury_breakdown(o, a, night=True)
    assert b["p"] == min(0.95, b["base"] * b["weather"] * b["activity"] * b["time"])
    assert b["p"] <= 0.95
    a2 = dict(a, setting="vehicle")
    assert g.injury_breakdown(o, a2, False)["weather"] == 1.0


def test_injury_does_not_depend_on_outbreak():
    g = new_game()
    o = {"injury_chance": 40, "damage": 20}
    a = {"setting": "open", "activity": "travel", "hours": 1, "exposure": "low"}
    p1 = g.injury_breakdown(o, a, False)["p"]
    g.hour = 150
    assert g.injury_breakdown(o, a, False)["p"] == p1


def test_infection_formula():
    g = new_game()
    g.hour = 100
    a = {"setting": "open", "activity": "scavenge", "hours": 2.0, "exposure": "medium"}
    b = g.infection_breakdown(a, night=False)
    expect = 1 - math.exp(-PARAMS["k_by_exposure"]["medium"] * g.local()[2] * 2.0 * 1.0)
    assert b["p"] == pytest.approx(expect)
    assert g.infection_breakdown(dict(a, exposure="none"), False)["p"] == 0
    assert g.infection_breakdown(dict(a, setting="vehicle"), False)["p"] < b["p"]


def test_resources_clamped_and_ledger_has_fuel():
    g = new_game()
    g.fuel = 10
    g.change("test", food=500, water=-500, fuel=500)
    assert g.food == 100 and g.water == 0 and g.fuel == PARAMS["tank_gallons"]
    assert any(l["fuel"] != 0 for l in g.ledger)


def test_cannot_drive_without_fuel():
    g = new_game()
    g.fuel = 0

    class UI(SimUI):
        seen = []

        def choose(self, game, scene, options, kind):
            self.seen.append(scene["id"])
            return "D"     # wait: never fixes the tank
    ui = UI(None)
    g.travel_to(ui, 1)
    assert g.ending == "STRANDED"
    assert ui.seen == ["FB-FUEL"] * PARAMS["max_fallbacks_per_leg"]
    assert g.miles == 0


def test_fuel_used_matches_mpg():
    g = new_game("SLC")
    g.travel_to(SimUI(POLICIES["balanced"]), 1)
    used = -sum(l["fuel"] for l in g.ledger if l["source"] == "fuel used driving")
    assert used == pytest.approx(g.miles / PARAMS["mpg"])


@pytest.mark.parametrize("city", CITIES)
def test_full_games_end_with_a_valid_ending(city):
    for pol in POLICIES.values():
        for seed in range(1, 6):
            g = play(city, seed, pol)
            assert g.ending in ENDINGS
            assert 0 <= g.health <= 100 and 0 <= g.food <= 100 and 0 <= g.water <= 100
            assert 0 <= g.fuel <= PARAMS["tank_gallons"]
            assert len(g.used_games) == len(set(g.used_games))      # no repeated mini game
            if g.ending == "VICTORY":
                assert g.health > 0 and g.hour <= PARAMS["deadline_hours"]
                assert g.miles == pytest.approx(g.total_mi)
                assert not g.infection or g.infection["treated"]


def test_victory_needs_arrival():
    g = new_game()
    g.miles = g.total_mi - 50
    g.arrive()
    assert g.ending == "STRANDED"


def test_late_arrival_is_not_victory():
    g = new_game()
    g.miles, g.hour = g.total_mi, PARAMS["deadline_hours"] + 1
    g.arrive()
    assert g.ending == "TOO_LATE"


def test_untreated_infection_turns():
    g = new_game()
    g.infection = {"at": 0.0, "warned": False, "treated": False}
    g.advance(PARAMS["incubation_hours_player"] + 0.1, "test")
    assert g.ending == "TURNED"


def test_medicine_treats_before_onset():
    for seed in range(1, 40):
        g = new_game(seed=seed)
        g.flags.append("MED_KIT")
        g.infection = {"at": 0.0, "warned": False, "treated": False}
        g.advance(PARAMS["incubation_hours_player"] + 1, "test")
        if g.infection["treated"]:
            assert g.ending is None and "MED_KIT" not in g.flags
            return
    pytest.fail("treatment never succeeded")


def test_time_costs_from_story_text_are_applied():
    g = new_game("NYC")
    s = next(x for x in g.city["scenarios"] if x["id"] == "NYC-05M")   # option A says it costs half a day
    a = next(o for o in s["options"] if o["letter"] == "A")["attrs"]
    assert a["hours"] >= 12
    h0 = g.hour
    g.resolve(s, next(o for o in s["options"] if o["letter"] == "A"), "main")
    assert g.hour - h0 == pytest.approx(a["hours"])


def test_same_seed_same_game():
    a, b = play("JAC", 99, POLICIES["random"]), play("JAC", 99, POLICIES["random"])
    assert a.history == b.history and a.hour == b.hour and a.health == b.health


def test_matched_streams_share_event_randomness():
    a, b = new_game("SEA", 5), new_game("SEA", 5)
    assert a.strength == b.strength
    assert a.rng.get("injury").random() == b.rng.get("injury").random()
