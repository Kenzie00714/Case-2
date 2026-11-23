# Architecture

```
data/                 REAL data (CSV) + data_sources.md
content/              the story: scenarios_v2.json (revised scenes, events, realistic mini games; built by
                      tools/build_content_v2.py), scenarios.json (v1), fallbacks.json,
                      option_attributes.csv (time/fuel/exposure per option, editable)
zombie_sim/           the simulation (no screen code)
  params.py           every FICTIONAL coefficient in one place
  data_loader.py      reads + validates the CSVs, calculates density and road miles
  seir.py             SEIR curves (RK4), R0, effective R, sensitivity
  rng.py              seeded Mulberry32 + named streams (same as JS)
  attributes.py       reads option text -> option_attributes.csv
  engine.py           game rules: clock, travel, fuel, injury, infection, rolls, endings, ledger
  policies.py         AI strategies for Monte Carlo
  sim.py              headless runs + Monte Carlo summary
play.py               console game (uses minigames.py for live curses mini games)
server.py             self-hosted web server (standard library only)
web/                  browser game
  sim.js              JavaScript port of zombie_sim (parity-tested)
  game.js             screens, status dashboard, pause, units, developer mode, charts, 8 canvas mini games
  realgames.js        the 10 realistic step-by-step mini games
  data.js             generated bundle (tools/build_web.py)
tools/                build_attributes.py, build_web.py, monte_carlo_report.py
tests/                pytest suite, Python-vs-JS parity, server, browser playthrough
reports/              survival report, charts, CSVs, screenshots
```

## Flow of one game

```
load_world() ──> Census/NOAA/OSRM CSVs ──> counties (density), stations, routes (cumulative miles)
Game(seed)   ──> outbreak strength ──> one SEIR Trajectory per route stop
run(ui):
  for each of 14 story scenes:
    travel_to(scene)      drive: speed from weather, fuel from mpg, road-accident roll
                          no fuel / no vehicle -> fallback scene (max 3, then STRANDED)
                          Morning stops: town fuel; early -> rest until scheduled time
    deadline check        -> TOO_LATE
    real-data event       one per scene if due: rabies, fuel, R0, SVI, age (engine.event_due)
    due callbacks         (flag + delay, unchanged)
    ask(scene)            ui.choose -> resolve():
                            injury roll   (base x weather x activity x time)
                            infection roll (1 - exp(-k p t M)), hidden timer
                            supplies, fuel, vehicle, miles, medicine, flags
                            advance clock -> food/water drain, starvation, infection onset
    every 2 scenes        pair roll -> mini game or detour (no repeats)
  arrive()                distance + deadline + gate screening -> ending
```

The engine never draws anything. It calls four methods on a `ui` object (`choose`, `outcome`, `minigame`, `message`, plus `end`). The console, the browser and the Monte Carlo simulator are three different `ui` objects driving the same rules.

## Python and JavaScript

The Python package is the reference. `web/sim.js` repeats it line by line, using the same random generator and the same order of random draws. `tests/test_parity.py` plays 210 games (7 routes × 5 seeds × 6 strategies) in both languages and requires identical choices, endings and mini games, and equal numbers to 1e-9.

## Changing things

| To change… | Edit | Then |
|---|---|---|
| a coefficient | `zombie_sim/params.py` | `python tools/build_web.py`, run tests |
| a dataset | `data/*.csv` | tests, `build_web.py` |
| an option's time/fuel/exposure | `content/option_attributes.csv` | `build_web.py` |
| story text | `content/scenarios.json` | `build_attributes.py` (overwrites hand edits), `build_web.py` |

## Version 2 option fields

Options in `scenarios_v2.json` carry their attributes inline and may add: `unlock_flag` (shown only after an earlier choice), `condition` (low_fuel, infected_symptoms, behind, low_health), `harm` ({health, reason}), `treat` (90% cure), `medicine_chance`, `svi_delay`, `gate` (final-gate quarantine or fuel), `sets_flags`, `minigame` (a story-linked realistic game) and `weather_rating`. Every health loss goes through `engine.hurt(amount, source, why)`, so the screen can always say why.
