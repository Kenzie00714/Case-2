"""
Monte Carlo survival report.

  python tools/monte_carlo_report.py --runs 1000

Writes reports/survival_report.md, charts (PNG), mc_results.json, decision_impact.csv,
dominance.csv and seir_sensitivity.csv. These are probabilities INSIDE THE GAME'S FICTIONAL
MODEL, not real-world survival odds.
"""
import argparse
import csv
import json
import os
import sys
import time
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from zombie_sim.sim import assets, play, summarize
from zombie_sim.policies import POLICIES
from zombie_sim.engine import Game, ENDINGS
from zombie_sim.seir import sensitivity, Trajectory
from zombie_sim.params import PARAMS

OUT = os.path.join(ROOT, "reports")
CITIES = ["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"]
LABEL = {"balanced": "Player stand-in (balanced)", "lowest_risk": "Lowest risk", "supplies": "Max supplies",
         "speed": "Max speed", "random": "Random", "best_rating": "Always BEST (oracle)"}
COLORS = {"balanced": "#ff8a1f", "lowest_risk": "#5cc785", "supplies": "#e3b45a", "speed": "#8ccbe8",
          "random": "#93a7b7", "best_rating": "#c58cf0"}
END_COL = {"VICTORY": "#5cc785", "DIED": "#ef5b5f", "TURNED": "#c58cf0", "TOO_LATE": "#e3b45a",
           "STRANDED": "#8ccbe8", "DENIED": "#93a7b7"}


def style():
    plt.rcParams.update({"figure.facecolor": "#0e1721", "axes.facecolor": "#16222e", "axes.edgecolor": "#2b3d4f",
                         "axes.labelcolor": "#e6eef3", "xtick.color": "#93a7b7", "ytick.color": "#93a7b7",
                         "text.color": "#e6eef3", "grid.color": "#2b3d4f", "font.size": 10})


def dominance_rows(world):
    """Options that are no better than another option of the same scene on every measure (at start-of-scene state)."""
    w, content, attrs, fb = world
    rows = []
    for city in content["cities"]:
        g = Game(w, content, attrs, fb, city["code"], 1)
        for i, s in enumerate(city["scenarios"]):
            g.place = g.places[i]
            g.hour = g.places[i]["nominal"]
            night = s["time"] == "Night"
            ev = {o["letter"]: g.expected_option(s, o, night) for o in s["options"]}
            for a, ea in ev.items():
                for b, eb in ev.items():
                    if a == b:
                        continue
                    worse_or_eq = (eb["exp_damage"] <= ea["exp_damage"] and eb["p_infection"] <= ea["p_infection"]
                                   and eb["hours"] <= ea["hours"] and eb["food"] >= ea["food"]
                                   and eb["water"] >= ea["water"] and eb["fuel"] >= ea["fuel"] and eb["heal"] >= ea["heal"])
                    strictly = (eb["exp_damage"] < ea["exp_damage"] - 1e-9 or eb["p_infection"] < ea["p_infection"] - 1e-9
                                or eb["hours"] < ea["hours"] or eb["food"] > ea["food"] or eb["water"] > ea["water"]
                                or eb["fuel"] > ea["fuel"])
                    if worse_or_eq and strictly:
                        rows.append({"scene": s["id"], "dominated": a, "by": b,
                                     "dominated_rating": next(o["rating"] for o in s["options"] if o["letter"] == a),
                                     "by_rating": next(o["rating"] for o in s["options"] if o["letter"] == b)})
                        break
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=1000)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)
    style()
    world = assets()
    t0 = time.time()

    results, rows_by = {}, {}
    impact = defaultdict(lambda: [0, 0])
    for pol, fn in POLICIES.items():
        for city in CITIES:
            rows = []
            for k in range(args.runs):
                g = play(city, 1 + k, fn, world)
                rows.append(g.summary())
                if pol == "random":
                    for sid, letter, rating in g.history:
                        if sid.startswith(city) and sid[4:6].isdigit():
                            impact[(sid, letter, rating)][0] += 1
                            impact[(sid, letter, rating)][1] += g.ending == "VICTORY"
            s = summarize(rows)
            rows_by[(pol, city)] = rows
            s.pop("rows")
            results.setdefault(pol, {})[city] = s
        allrows = [r for c in CITIES for r in rows_by[(pol, c)]]
        s = summarize(allrows)
        s.pop("rows")
        results[pol]["ALL"] = s
        print(f"{pol:12} survival {s['survival_rate']:.1%}")

    # ---- decision impact (from the random policy: every option gets picked often) ----
    imp = []
    by_scene = defaultdict(list)
    for (sid, letter, rating), (n, won) in impact.items():
        by_scene[sid].append((letter, rating, n, won / n if n else float("nan")))
    for sid, opts in sorted(by_scene.items()):
        rates = [r for _, _, n, r in opts if n >= 30]
        spread = (max(rates) - min(rates)) if len(rates) >= 2 else float("nan")
        for letter, rating, n, r in sorted(opts):
            imp.append({"scene": sid, "option": letter, "rating": rating, "times_picked": n,
                        "survival_if_picked": round(r, 4), "scene_spread": round(spread, 4)})
    with open(os.path.join(OUT, "decision_impact.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(imp[0]))
        w.writeheader()
        w.writerows(imp)
    top = sorted({(r["scene"], r["scene_spread"]) for r in imp if r["scene_spread"] == r["scene_spread"]},
                 key=lambda x: -x[1])[:10]

    # ---- dominance report ----
    dom = dominance_rows(world)
    with open(os.path.join(OUT, "dominance.csv"), "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["scene", "dominated", "dominated_rating", "by", "by_rating"])
        w.writeheader()
        w.writerows(dom)

    # ---- SEIR sensitivity on beta and gamma ----
    wd = world[0]
    places = []
    for code in CITIES:
        for st in wd["routes"][code]:
            places.append((wd["counties"][st["geoid"]]["density"], wd["stations"][st["station"]]["tavg_f"]))
    sens = sensitivity(places, [1.0, 1.25, 1.5, 1.75, 2.0], [0.10, 0.15, 0.20, 0.30], PARAMS["outbreak_start_day"] + 3.5)
    with open(os.path.join(OUT, "seir_sensitivity.csv"), "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["beta_base", "gamma", "R0_reference", "min_prevalence_day4", "max_prevalence_day4", "spread"])
        for r in sens:
            w.writerow([r["beta"], r["gamma"], round(r["r0_ref"], 2), round(r["min_prev"], 4),
                        round(r["max_prev"], 4), round(r["spread"], 4)])
    # sensitivity of survival to beta (balanced policy, 200 runs per city)
    surv_beta = []
    import zombie_sim.params as prm
    for b in [1.0, 1.5, 2.0]:
        q = dict(PARAMS, beta_base=b)
        ok = n = 0
        for city in CITIES:
            for k in range(200):
                g = Game(*world[:2], world[2], world[3], city, 1 + k, q)
                from zombie_sim.sim import SimUI
                g.run(SimUI(POLICIES["balanced"]))
                ok += g.ending == "VICTORY"
                n += 1
        surv_beta.append((b, ok / n))

    # ---- charts ----
    pols = list(POLICIES)
    fig, ax = plt.subplots(figsize=(8, 4))
    ax.bar([LABEL[p] for p in pols], [results[p]["ALL"]["survival_rate"] * 100 for p in pols],
           color=[COLORS[p] for p in pols])
    ax.set_ylabel("Survival rate, % (in-game model)")
    ax.set_title(f"Survival by strategy, all 7 routes ({args.runs} runs per route)")
    plt.xticks(rotation=20, ha="right")
    ax.grid(axis="y", alpha=.5)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "survival_by_policy.png"), dpi=130)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 4.2))
    width = 0.13
    for j, p in enumerate(pols):
        ax.bar([i + (j - 2.5) * width for i in range(len(CITIES))],
               [results[p][c]["survival_rate"] * 100 for c in CITIES], width, label=LABEL[p], color=COLORS[p])
    ax.set_xticks(range(len(CITIES)))
    ax.set_xticklabels(CITIES)
    ax.set_ylabel("Survival rate, %")
    ax.set_title("Survival by route and strategy")
    ax.legend(fontsize=8, ncol=3, facecolor="#16222e")
    ax.grid(axis="y", alpha=.5)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "survival_by_route.png"), dpi=130)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8, 4))
    left = [0] * len(pols)
    for e in ENDINGS:
        vals = [results[p]["ALL"]["endings"][e] * 100 for p in pols]
        ax.barh([LABEL[p] for p in pols], vals, left=left, color=END_COL[e], label=e)
        left = [a + b for a, b in zip(left, vals)]
    ax.set_xlabel("% of runs")
    ax.set_title("How runs end (failure causes)")
    ax.legend(fontsize=8, ncol=3, facecolor="#16222e", loc="lower right")
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "endings_by_policy.png"), dpi=130)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(9, 4.2))
    for code in CITIES:
        st = wd["routes"][code][0]
        tr = Trajectory(wd["counties"][st["geoid"]]["density"], wd["stations"][st["station"]]["tavg_f"])
        ts = [7 + x / 4 for x in range(0, 29)]
        ax.plot([t - 7 for t in ts], [tr.at(t)[2] * 100 for t in ts], label=f"{code} start ({wd['counties'][st['geoid']]['name']})")
    ax.set_xlabel("Game days since Day 1 08:00")
    ax.set_ylabel("Infectious, % of county")
    ax.set_title("SEIR curves at each starting county (fictional parameters, real density and January normals)")
    ax.legend(fontsize=8, facecolor="#16222e")
    ax.grid(alpha=.5)
    fig.tight_layout()
    fig.savefig(os.path.join(OUT, "seir_start_counties.png"), dpi=130)
    plt.close(fig)

    with open(os.path.join(OUT, "mc_results.json"), "w") as f:
        json.dump({"runs_per_route": args.runs, "seeds": f"1..{args.runs}", "results": results,
                   "survival_vs_beta_balanced": surv_beta}, f, indent=1)

    # ---- markdown report ----
    L = []
    L.append("# Zombie Escape: Monte Carlo survival report\n")
    L.append("> These numbers are probabilities **inside the game's fictional model**. They are not real-world survival "
             "odds. Real data (Census population and land area, NOAA January normals, OSRM road distances, CDC SVI 2022) sets the "
             "places, densities, temperatures and distances; every coefficient that turns those into risk is invented "
             "for the game (see docs/MATH.md).\n")
    L.append(f"Runs: {args.runs} per route per strategy, seeds 1-{args.runs}. Every strategy uses the same seeds, so each "
             "kind of random event (injury, infection, road accident, town fuel, mini games, rolls) draws from the same "
             "random-number stream for every strategy (matched streams). Mini games are simulated with fixed win "
             f"chances {PARAMS['minigame_win_prob_sim']}.\n")
    L.append("## Survival by strategy (all 7 routes)\n")
    L.append("| Strategy | Survival | Avg days used | Avg health (survivors) | Avg food | Avg water | Avg fuel | Infected at least once | Died | Turned | Too late | Stranded | Denied |")
    L.append("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
    for p in pols:
        r = results[p]["ALL"]
        e = r["endings"]
        L.append(f"| {LABEL[p]} | {r['survival_rate']:.1%} | {r['avg_days']:.2f} | {r['avg_health_survivors']:.0f} | "
                 f"{r['avg_food']:.0f} | {r['avg_water']:.0f} | {r['avg_fuel']:.1f} | {r['infection_rate']:.1%} | "
                 f"{e['DIED']:.1%} | {e['TURNED']:.1%} | {e['TOO_LATE']:.1%} | {e['STRANDED']:.1%} | {e['DENIED']:.1%} |")
    L.append("\n![Survival by strategy](survival_by_policy.png)\n\n![Endings](endings_by_policy.png)\n")
    L.append("## Survival by route\n")
    L.append("| Strategy | " + " | ".join(CITIES) + " |")
    L.append("|---|" + "---|" * len(CITIES))
    for p in pols:
        L.append(f"| {LABEL[p]} | " + " | ".join(f"{results[p][c]['survival_rate']:.0%}" for c in CITIES) + " |")
    L.append("\n![Survival by route](survival_by_route.png)\n")
    L.append("## Decisions with the biggest impact\n")
    L.append("From the random strategy (every option gets picked many times): survival rate of runs that picked each "
             "option. 'Spread' is the gap between the best and worst option in that scene. This is association inside "
             "the model, not proof that one choice alone caused the outcome.\n")
    L.append("| Scene | Spread | Options (rating: survival if picked) |")
    L.append("|---|---|---|")
    for sid, spread in top:
        opts = [r for r in imp if r["scene"] == sid]
        L.append(f"| {sid} | {spread:.0%} | " + "; ".join(f"{r['option']} {r['rating']}: {r['survival_if_picked']:.0%}"
                                                             for r in opts) + " |")
    L.append(f"\n## Obvious options (dominance check)\n\n{len(dom)} of 392 main-scene options are no better than another "
             "option in the same scene on every measure (expected injury damage, infection chance, time, food, water, "
             "fuel, healing). Most are WORST or RISKY options beaten by the BEST option, which is what the ratings intend. "
             "List: reports/dominance.csv. The scenario text was not rewritten.\n")
    L.append("## SEIR sensitivity (beta and gamma)\n")
    L.append("Prevalence (infectious share) at game Day 4 evening across all 56 route stops:\n")
    L.append("| beta | gamma | R0 at reference density | lowest stop | highest stop |")
    L.append("|---|---|---|---|---|")
    for r in sens:
        L.append(f"| {r['beta']} | {r['gamma']} | {r['r0_ref']:.1f} | {r['min_prev']:.1%} | {r['max_prev']:.1%} |")
    L.append("\nSurvival of the balanced strategy when beta changes (200 runs per route): " +
             ", ".join(f"beta {b}: {s:.1%}" for b, s in surv_beta) + ".\n")
    L.append("R0 values here are properties of the game's invented zombie, not estimates for any real disease.\n")
    L.append("![SEIR](seir_start_counties.png)\n")
    L.append(f"Generated in {time.time() - t0:.0f} s.")
    with open(os.path.join(OUT, "survival_report.md"), "w") as f:
        f.write("\n".join(L))
    print("Report written to", OUT)


if __name__ == "__main__":
    main()
