# Zombie Escape

A 7-day winter escape across the U.S. Real county populations, real January weather, real road distances; a fictional zombie. Version 3 sets each county's starting infection from when you arrive (5% on Day 1 rising to 35% on Day 7, ±10 points for density; see docs/MATH.md §13). Version 2 added the revised scenarios (140 scenes, 5 real-data events, 10 realistic mini games), CDC SVI 2022 data, a status dashboard between scenes, pause, metric units and a password-protected developer mode.

## Requirements

- **Python 3.10+.** The game, the console version and the server use only the standard library.
- For the tests and the survival report: `pip install -r requirements.txt` (pytest, matplotlib).
- Optional: Node.js 18+ for the Python-vs-JavaScript parity test; `pip install playwright` + Chrome for the browser playthrough test.

## Run it

```bash
# Browser game on this computer
python server.py                       # open http://localhost:8000

# Host it for others on your network (no domain needed)
python server.py --host 0.0.0.0        # prints http://<your-ip>:8000

# Console game
python play.py                         # pick a city
python play.py --city NYC --seed 42 --debug     # show every calculation
python play.py --city SEA --auto balanced       # watch an AI strategy play
```

Opening `web/index.html` directly in a browser also works (no server needed).

### Hosting without registering a domain

| Option | What to do | Address people use |
|---|---|---|
| Your own computer, same Wi-Fi | `python server.py --host 0.0.0.0` (allow Python through the firewall if asked) | `http://192.168.x.x:8000` |
| A cloud virtual machine | Copy the folder, run `python server.py --host 0.0.0.0 --port 8000` (or `docker build -t zombie . && docker run -p 8000:8000 zombie`), open port 8000 in the VM's firewall | `http://<VM public IP>:8000` |
| Any static host | Upload the `web/` folder as is (it's plain HTML/JS); the `/api/montecarlo` endpoint is the only part that needs `server.py` | the host's free subdomain |

The server also has `/health` (returns `ok`) and `/api/montecarlo?city=NYC&policy=balanced&runs=500`.

## Play it on GitHub Pages (free, no domain)

In the repository: **Settings → Pages → Source: Deploy from a branch → Branch: main, folder: / (root) → Save.**
After a minute the game is live at `https://<username>.github.io/<repo-name>/`. The root `index.html` sends visitors to `web/index.html`.
(The `/api/montecarlo` endpoint needs `server.py`; everything else, including the in-browser Monte Carlo, works on Pages.)

## Tests

```bash
python tools/build_web.py              # rebuild web/data.js + tests/bundle.json
python -m pytest -q tests              # 75 tests: data, SEIR, game rules, Monte Carlo, Python/JS parity, server
python tests/browser_playthrough.py    # optional: plays all 7 routes in headless Chrome
```

## Survival report

```bash
python tools/monte_carlo_report.py --runs 1000     # about 4 minutes
```

Writes `reports/survival_report.md` with charts, decision impact, the dominance check and SEIR sensitivity.

## Playing (version 2)

| Feature | How it works |
|---|---|
| Status dashboard | After each choice, one screen shows your stats with +/− changes, the outcome rating (BEST / OKAY / RISKY / BAD), why health changed, and the drive. **One Enter** moves on. |
| Pause | **P** or the Pause button stops the 20-second timer and hides the options. After you resume, pause is locked for 30 seconds. |
| Units | "Metric units" on the title screen, or the °F/°C button in the top bar: °C, km, liters (story text too). |
| Player mode | No ratings, no formulas, no SEIR numbers during play. The SEIR model, every health loss with its reason, and R0 vs real diseases appear on the end screen. |
| Developer mode | Enter the team password on the title screen. No timer; option ratings, every calculation, the SEIR panel, live multipliers and "How it's built" code notes. The page stores only a SHA-256 hash of the password. This is a convenience lock, not security: anyone who reads the code can turn it on. |
| Option letters | A–D always; E = unlocked by an earlier choice; F/G = only in certain conditions (low fuel, symptoms, behind schedule, low health); R = rest. Keys: the letter or 1–7. |

## Data added in version 2

`data/svi_data.csv` (CDC/ATSDR SVI 2022, county: overall SVI, % aged 65+, % households without a vehicle), `data/r0_reference.csv` and `data/rabies_reference.csv` (published values, cited). `python tools/download_new_data.py` rebuilds them. The Census ACS API now needs a key, so age structure comes from the SVI file's ACS 2018–2022 column instead of a separate `age_data.csv`.

## Documentation

- `docs/AUDIT.md`: what the game was, what was wrong, what changed
- `docs/MATH.md`: every formula, labeled REAL / FICTIONAL / CALCULATED / DECISION
- `docs/ARCHITECTURE.md`: files and data flow
- `data/data_sources.md`: where every number came from, what is missing and how to add it
- `docs/PRESENTATION.md`: talking points for presenting the project
- `docs/word/Zombie_Escape_Game_Breakdown.docx`: every part of the game in tables
- `docs/word/Zombie_Escape_Revised_Scenarios.docx`: all 140 scenes with the 10 improvements and 10 realistic mini games (now in the game: content/scenarios_v2.json)
- `scenario_revisions/`: the scripts that build the revised scenario doc
- `web/zombie_escape_full_game.html`: the whole browser game in one file (double-click to play)
