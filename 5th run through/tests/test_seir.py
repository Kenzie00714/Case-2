import math
import pytest
from zombie_sim.seir import Trajectory, cold_multiplier, density_multiplier, sensitivity
from zombie_sim.params import PARAMS


@pytest.mark.parametrize("temp", [-60, -40, -13, 0, 10, 19.9, 20, 35, 50, 80])
def test_cold_multiplier_never_negative(temp):
    assert cold_multiplier(temp) >= PARAMS["stiff_floor"] * 0.999


def test_old_negative_beta_bug_is_fixed():
    # the old formula gave 1.63 x (1 - 0.03 x 40) = -0.33 at -20F
    assert cold_multiplier(-20) > 0


def test_density_multiplier_bounds():
    assert density_multiplier(0.5) == PARAMS["density_mult_min"]
    assert density_multiplier(1e9) == PARAMS["density_mult_max"]
    assert density_multiplier(100) == pytest.approx(1.0)


@pytest.mark.parametrize("density,temp", [(70503, 34), (1, 16), (2000, 50), (13190, -30)])
def test_compartments_nonnegative_and_conserved(density, temp):
    tr = Trajectory(density, temp, 1.1)
    for S, E, I, R in tr.points:
        assert min(S, E, I, R) >= 0
        assert S + E + I + R == pytest.approx(1.0, abs=1e-12)
        assert 0 <= I <= 1


def test_curve_is_calculated_and_grows_then_peaks():
    tr = Trajectory(1000, 30)
    infected = [p[1] + p[2] + p[3] for p in tr.points]
    assert all(b >= a - 1e-12 for a, b in zip(infected, infected[1:]))   # ever-infected never decreases
    I = [p[2] for p in tr.points]
    assert max(I) > 100 * PARAMS["initial_prevalence"]


def test_step_size_is_stable():
    p2 = dict(PARAMS, seir_dt_days=1 / 96)
    a, b = Trajectory(2000, 30), Trajectory(2000, 30, 1.0, p2)
    for t in (7, 9, 11, 13):
        assert a.at(t)[2] == pytest.approx(b.at(t)[2], abs=1e-4)


def test_r0_and_effective_r():
    tr = Trajectory(100, 50)   # density and cold multipliers both 1.0
    assert tr.r0(0) == pytest.approx(PARAMS["beta_base"] / PARAMS["gamma"])
    assert tr.r_effective(10) == pytest.approx(tr.r0(10) * tr.at(10)[0])
    assert tr.r_effective(10) < tr.r0(10)


def test_independent_trajectories():
    a = Trajectory(500, 30).at(10)
    Trajectory(70000, 30)
    assert Trajectory(500, 30).at(10) == a


def test_sensitivity_moves_in_expected_direction():
    rows = sensitivity([(1000, 30)], [1.0, 2.0], [0.15, 0.3], 10.5)
    get = lambda b, g: next(r for r in rows if r["beta"] == b and r["gamma"] == g)["max_prev"]
    assert get(2.0, 0.15) > get(1.0, 0.15)
    assert get(1.0, 0.3) < get(1.0, 0.15)
