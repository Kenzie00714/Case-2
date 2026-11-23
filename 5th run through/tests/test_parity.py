"""The browser game (web/sim.js) must make exactly the same calculations as the Python engine."""
import json, os, shutil, subprocess
import pytest
from zombie_sim.sim import play
from zombie_sim.policies import POLICIES

HERE = os.path.dirname(os.path.abspath(__file__))
CASES = [[c, s, p] for c in ["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"] for s in (1, 2, 3, 17, 404)
         for p in POLICIES]


@pytest.mark.skipif(shutil.which("node") is None, reason="Node.js not installed")
def test_python_and_javascript_agree():
    if not os.path.exists(os.path.join(HERE, "bundle.json")):
        pytest.fail("Run python tools/build_web.py first")
    out = subprocess.run(["node", os.path.join(HERE, "parity_runner.js"), json.dumps(CASES)],
                         capture_output=True, text=True, check=True)
    js = json.loads(out.stdout)
    assert len(js) == len(CASES)
    for (city, seed, pol), j in zip(CASES, js):
        g = play(city, seed, POLICIES[pol])
        tag = f"{city} seed {seed} {pol}"
        assert [list(h) for h in g.history] == j["history"], tag
        assert g.ending == j["ending"], tag
        assert g.used_games == j["minigames"], tag
        assert g.played_events == j["events"], tag
        for k in ("hours", "health", "food", "water", "fuel", "miles", "strength"):
            assert g.summary()[k] == pytest.approx(j[k], abs=1e-9), (tag, k)
        for a, b in zip([t.at(9.3) for t in g.traj], j["traj"]):
            assert a == pytest.approx(b, abs=1e-12), tag
