from zombie_sim.sim import monte_carlo
from zombie_sim.policies import POLICIES


def test_monte_carlo_is_reproducible_and_ranks_strategies():
    a = monte_carlo("PIT", POLICIES["balanced"], runs=60)
    b = monte_carlo("PIT", POLICIES["balanced"], runs=60)
    assert a["survival_rate"] == b["survival_rate"]
    r = monte_carlo("PIT", POLICIES["random"], runs=60)
    assert a["survival_rate"] > r["survival_rate"]
    assert abs(sum(a["endings"].values()) - 1) < 1e-9
