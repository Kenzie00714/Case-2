"""
SEIR outbreak model, one INDEPENDENT trajectory per county.

  dS/dt = -beta(t) * S * I
  dE/dt =  beta(t) * S * I - sigma * E
  dI/dt =  sigma * E - gamma * I
  dR/dt =  gamma * I
  (S, E, I, R are shares of the county's population and always sum to 1.)

beta(t) = beta_base x density_mult x cold_mult x age_mult x (1 + ramp x t) x outbreak_strength
(age_mult = 1 when no age data is loaded)

Locations are modeled independently: no infected people flow between counties.
That is a stated simplification (see docs/MATH.md). When the player enters a place,
the game looks up that place's own curve at the current outbreak time.

Solved with 4th-order Runge-Kutta, 1-hour steps. After each step tiny negative values
from floating-point rounding are set to 0 and the shares are renormalized to sum to 1.
"""
import math

from .params import PARAMS as P


def density_multiplier(density, p=P):
    m = 1.0 + p["density_slope"] * math.log10(max(density, 1e-9) / p["density_ref"])
    return min(p["density_mult_max"], max(p["density_mult_min"], m))


def cold_multiplier(temp_f, p=P):
    crowd = 1.0 + p["cold_slope"] * max(0.0, p["cold_ref_f"] - temp_f)
    stiff = 1.0
    if temp_f < p["stiff_threshold_f"]:
        stiff = max(p["stiff_floor"], 1.0 - p["stiff_slope"] * (p["stiff_threshold_f"] - temp_f))
    return crowd * stiff


def age_multiplier(pct65, ref, p=P):
    """Older counties spread a little faster (fictional rule on CDC SVI / ACS age data)."""
    if pct65 is None:
        return 1.0
    return min(p["age_mult_max"], max(p["age_mult_min"], 1.0 + p["age_slope"] * (pct65 - ref)))


def beta_at(base_beta, t_days, p=P):
    return base_beta * (1.0 + p["winter_ramp_per_day"] * t_days)


def _deriv(S, E, I, beta, sigma, gamma):
    inf = beta * S * I
    return (-inf, inf - sigma * E, sigma * E - gamma * I, gamma * I)


class Trajectory:
    """Precomputed outbreak curve for one place."""

    def __init__(self, density, temp_f, strength=1.0, p=P, age_mult=1.0, i0=None):
        self.p = p
        self.dm = density_multiplier(density, p)
        self.cm = cold_multiplier(temp_f, p)
        self.am = age_mult
        self.base_beta = p["beta_base"] * self.dm * self.cm * age_mult * strength
        self.sigma = 1.0 / p["incubation_days"]
        self.gamma = p["gamma"]
        self.dt = p["seir_dt_days"]
        n = int(round(p["seir_horizon_days"] / self.dt))
        if i0 is None:
            i0 = p["initial_prevalence"]
        self.i0 = i0
        S, E, I, R = 1.0 - i0, 0.0, i0, 0.0
        self.points = [(S, E, I, R)]
        dt, sg, gm = self.dt, self.sigma, self.gamma
        for k in range(n):
            t = k * dt
            b1 = beta_at(self.base_beta, t, p)
            b2 = beta_at(self.base_beta, t + dt / 2, p)
            b3 = beta_at(self.base_beta, t + dt, p)
            k1 = _deriv(S, E, I, b1, sg, gm)
            k2 = _deriv(S + dt / 2 * k1[0], E + dt / 2 * k1[1], I + dt / 2 * k1[2], b2, sg, gm)
            k3 = _deriv(S + dt / 2 * k2[0], E + dt / 2 * k2[1], I + dt / 2 * k2[2], b2, sg, gm)
            k4 = _deriv(S + dt * k3[0], E + dt * k3[1], I + dt * k3[2], b3, sg, gm)
            S = S + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])
            E = E + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
            I = I + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])
            R = R + dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
            S, E, I, R = max(S, 0.0), max(E, 0.0), max(I, 0.0), max(R, 0.0)
            total = S + E + I + R
            S, E, I, R = S / total, E / total, I / total, R / total
            self.points.append((S, E, I, R))

    def at(self, t_days):
        """(S, E, I, R) shares at outbreak time t (days), linear interpolation between steps."""
        t = min(max(t_days, 0.0), self.p["seir_horizon_days"])
        x = t / self.dt
        i = min(int(x), len(self.points) - 2)
        f = x - i
        a, b = self.points[i], self.points[i + 1]
        return tuple(a[j] + (b[j] - a[j]) * f for j in range(4))

    def r0(self, t_days):
        """Basic reproduction number: beta(t) / gamma (calculated, fictional)."""
        return beta_at(self.base_beta, t_days, self.p) / self.gamma

    def r_effective(self, t_days):
        """Effective reproduction number: R0(t) x S(t)."""
        return self.r0(t_days) * self.at(t_days)[0]


def arrival_day(stop_index, p=P):
    """Outbreak day of the player's scheduled arrival at route stop k (0-7): Day k+1 08:00; safe zone Day 7 20:00."""
    hours = 6 * 24 + 12 if stop_index == 7 else stop_index * 24
    return p["outbreak_start_day"] + hours / 24.0


def seed_target(stop_index, density, p=P):
    """Target infectious share at arrival: rises from Day 1 to Day 7, tilted by density (FICTIONAL)."""
    frac = (arrival_day(stop_index, p) - p["outbreak_start_day"]) / 6.5
    base = p["seed_target_day1"] + (p["seed_target_day7"] - p["seed_target_day1"]) * min(1.0, max(0.0, frac))
    z = min(1.0, max(-1.0, math.log10(max(density, 1e-9) / p["density_ref"]) / 2.0))
    return min(p["seed_target_max"], max(p["seed_target_min"], base + p["seed_density_tilt"] * z))


def calibrate_i0(density, temp_f, age_mult, stop_index, p=P):
    """Starting infectious share (outbreak day 0) that puts I(arrival) at the target, with strength 1.0.

    Log-spaced scan for the first starting level that reaches the target, then 30 bisection steps.
    If no level reaches it (a slow county late in the week), the highest level tried is used.
    """
    t = arrival_day(stop_index, p)
    target = seed_target(stop_index, density, p)
    f = lambda lg: Trajectory(density, temp_f, 1.0, p, age_mult, 10.0 ** lg).at(t)[2]
    lo, hi = -9.0, math.log10(target)
    grid = [lo + (hi - lo) * k / 24 for k in range(25)]
    prev = grid[0]
    if f(prev) >= target:
        return 10.0 ** prev
    for g in grid[1:]:
        if f(g) >= target:
            a, b = prev, g
            for _ in range(30):
                m = (a + b) / 2
                if f(m) >= target:
                    b = m
                else:
                    a = m
            return 10.0 ** b
        prev = g
    return 10.0 ** hi


def sensitivity(densities_temps, betas, gammas, t_days, p=P):
    """Prevalence at outbreak day t for each place under different beta/gamma (for the report)."""
    out = []
    for b in betas:
        for g in gammas:
            q = dict(p, beta_base=b, gamma=g)
            prev = [Trajectory(d, t, 1.0, q).at(t_days)[2] for d, t in densities_temps]
            out.append({"beta": b, "gamma": g, "r0_ref": b / g,
                        "min_prev": min(prev), "max_prev": max(prev), "spread": max(prev) - min(prev),
                        "prevalences": prev})
    return out
