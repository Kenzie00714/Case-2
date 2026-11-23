# Phase 1 audit: the game before this refactor

## What existed

| Part | File(s) | What it did |
|---|---|---|
| Console game | `zombie_game_engine.py` | 14 main scenarios per city (7 days × morning/night), timed input, injury rolls, exposure timer, food/water drain per scenario, roll every 2 picks, detours, callbacks, ledger |
| Outbreak model | `outbreak_model.py` | SEIR per route day, Euler method, 24 steps per day |
| Mini games | `minigames.py` (console, curses) and `web/game.js` (browser canvas) | 8 games, 3 tiers, no repeats in a playthrough |
| Content | `zombie_game_data.json` built from text files | 7 cities × (14 main + 4 detours + 2 callbacks) = 140 scenes, 560 options |
| Route "data" | `route_data.csv` | Density and January temperature for 49 route days |
| Web game | `web/engine.js`, `web/game.js`, `web/index.html` | A separate JavaScript copy of the rules |

## Hardcoded vs calculated (before)

| Value | Before |
|---|---|
| Density and temperature per route day | **Hardcoded approximations** typed into `route_data.csv`, not downloaded and not sourced |
| Route miles | Hardcoded round numbers in the story |
| Infection % in the story text and profiles | Some hardcoded in text; the model calculated the rest |
| Injury chances | Hidden per-option values in rating bands (kept) |
| Exposure chance | Calculated, but only after an injury: injury and infection were one event |

## Problems found

1. **Negative transmission.** The cold multiplier `(1 + 0.01·(50 − T)) × (1 − 0.03·(20 − T))` goes below zero under about −13°F, so the outbreak would run backwards.
2. **Victory ignored travel.** Surviving scenario 14 counted as reaching the safe zone. Time, distance and fuel did not exist.
3. **Injury and infection were the same roll.** Infection could only happen after an injury on a RISKY/WORST pick, and zombies nearby also raised the injury chance. The two risks were double counted.
4. **Data was not real.** Densities and temperatures were reasonable guesses with no source.
5. **Two copies of the rules** (Python and JavaScript) with nothing checking that they agreed.
6. **Python `random` and JS `Math.random`**: games could not be replayed or compared.
7. **Euler steps** with no check that S+E+I+R stayed equal to the population.
8. **No test suite** beyond manual playthroughs.

## What changed (summary)

| Problem | Fix |
|---|---|
| Negative transmission | Cold "stiffening" now has a floor of 0.40; tested from −60°F to 80°F |
| Victory | Requires: alive, not turned, physically at the safe zone (road miles), before Day 7 midnight. Five other endings. |
| Injury vs infection | Two separate formulas, rolls and random streams |
| Data | Census, TIGERweb, NOAA normals and OSRM distances downloaded and documented in `data/data_sources.md` |
| Two copies | `web/sim.js` is a port of `zombie_sim/`; `tests/test_parity.py` runs 210 games in both and checks every choice and number |
| Randomness | Seeded Mulberry32 generator with named streams, identical in both languages |
| SEIR | 4th-order Runge–Kutta, 1-hour steps, clamped and renormalized, conservation tested |
| Tests | 62 automated tests plus a headless-browser playthrough of all 7 routes |

## Preserved

All 7 cities, 140 scenes, 560 options and their text, the hidden ratings and injury values, all callbacks and flags, the 4 detours per city, the roll every 2 picks, all 8 mini games with their controls, tiers, rewards and the no-repeat rule.
