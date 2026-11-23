# The math, labeled

Every quantity is one of four kinds:

- **REAL**: downloaded data (see `data/data_sources.md`)
- **FICTIONAL**: an invented game assumption (all in `zombie_sim/params.py`)
- **CALCULATED**: computed from the two above
- **DECISION**: comes from the player's choices and the story text

## 1. Places

| Quantity | Kind | Formula |
|---|---|---|
| Population | REAL | Census 2023 estimate (county) |
| Land area | REAL | TIGERweb AREALAND / 2,589,988.11 |
| Density *d* | CALCULATED | population / land sq mi |
| January temperature *T*, snowfall | REAL | NOAA 1991–2020 normals at the nearest station |
| Road distance | REAL | OSRM on OpenStreetMap |

## 2. Outbreak (SEIR), one independent curve per county

```
dS/dt = −β(t)·S·I
dE/dt =  β(t)·S·I − σ·E
dI/dt =  σ·E − γ·I
dR/dt =  γ·I            (S, E, I, R are shares of the county population; they sum to 1)
```

| Symbol | Value | Kind |
|---|---|---|
| β base | 1.5 per day | FICTIONAL |
| σ = 1 / incubation | 1 / 1 day | FICTIONAL |
| γ | 0.15 per day | FICTIONAL |
| Initial infectious | 0.001% | FICTIONAL |
| Game Day 1 08:00 | outbreak day 7.0 | FICTIONAL |
| Density multiplier | clamp(1 + 0.2·log10(d/100), 0.6, 1.8) | FICTIONAL rule on REAL density |
| Cold multiplier | (1 + 0.01·max(0, 50 − T)) × max(0.40, 1 − 0.03·(20 − T)) when T < 20 | FICTIONAL rule on REAL temperature |
| Winter ramp | × (1 + 0.02·t) | FICTIONAL |
| Outbreak strength | each playthrough × U(0.9, 1.1) | FICTIONAL (seeded) |

β(t) = 1.5 × density mult × cold mult × (1 + 0.02t) × strength.

**Solver:** 4th-order Runge–Kutta, 1-hour steps over 16 days. After each step tiny negative rounding errors are set to 0 and the shares renormalized. Tested: all shares ≥ 0, sum = 1 to 12 decimal places, results unchanged (to 0.0001) with 15-minute steps. The curve is always calculated, never typed in.

**R0 and effective R** (CALCULATED from fictional parameters): R0(t) = β(t)/γ; R_eff(t) = R0(t)·S(t). With the default parameters, R0 at the start counties ranges from about 10 (Teton County, WY, 6 people/sq mi, 16°F) to 21 (Manhattan). These describe the invented zombie, not any real disease.

**Limitation:** counties do not exchange infected people. Each stop's curve is its own. A halfway point between two stops averages their curves.

**Sensitivity** (`reports/seir_sensitivity.csv`): with β from 1.0 to 2.0 and γ from 0.10 to 0.30, Day 4 prevalence at the most infected stop ranges from about 3% to over 70%. Higher β or lower γ always means more infection. Balanced-strategy survival with β = 1.0 / 1.5 / 2.0 is in the survival report.

## 3. Injury risk (separate from infection)

```
P(injury) = min(0.95, base × weather × activity × time)
```

| Factor | Value | Kind |
|---|---|---|
| base | the option's hidden injury chance (BEST 0–10%, OKAY 10–25%, RISKY 30–55%, WORST 60–85%) | FICTIONAL (existing game) |
| weather | outdoor (`open`) options only: min(1.5, 1 + 0.01·max(0, 32 − T) + 0.01·snow). If NOAA has no snow normal, the snow term is skipped and the screen says so. Indoors / in a vehicle: 1.0 | FICTIONAL rule on REAL normals |
| activity | travel 1.0, scavenge 1.0, contact 1.1, social 0.85, shelter 0.75 | FICTIONAL |
| time | 1.15 at night | FICTIONAL |

The damage is the option's existing hidden damage value. The local outbreak does **not** change injury risk.

## 4. Infection risk

```
P(infection) = 1 − exp(−k × p × t × M)
M = setting × night × gear
```

| Factor | Value | Kind |
|---|---|---|
| k by exposure | none 0, low 0.05, medium 0.2, high 0.5, contact 1.5 | FICTIONAL |
| p | infectious share I where the player is, at that hour | CALCULATED (SEIR) |
| t | hours the option takes | DECISION (from the option text) |
| setting | vehicle 0.3, shelter 0.5, open 1.0 | FICTIONAL |
| night | 1.25 | FICTIONAL |
| gear | 1.0 (no protective-gear item exists in the story yet) | FICTIONAL |

Each factor appears once, so nothing is counted twice. Infection is hidden. Symptoms appear 24 hours later; the player **turns** at 36 hours unless treated. Medicine (found in the story) cures 90% of the time before onset. Arriving infected but not yet turned means quarantine at the safe zone, with the same 90% cure chance.

## 5. Time, travel and fuel

| Rule | Value | Kind |
|---|---|---|
| Clock | Day 1 08:00 = hour 0; deadline Day 7 24:00 = hour 160 | FICTIONAL |
| Story stops | Morning of day *d* at stop *d*; Night halfway to stop *d+1*; Day 7 Night at the safe zone | FICTIONAL layout on REAL road miles |
| Speed | 50 mph / (1 + 0.005·max(0, 32 − T) + 0.02·snow), × 0.85 overnight | FICTIONAL rule on REAL normals |
| Fuel | 25 mpg, 25-gallon tank, starts full | FICTIONAL |
| Fuel in towns | each Morning stop: U(8, 16) gallons | FICTIONAL (OSM fuel-station data not collected) |
| Road accident | 1 − exp(−0.01 × cold factor × driving hours), −8 health | FICTIONAL |
| Arriving early | the player rests until the scene's scheduled time | rule |
| Option time, fuel, vehicle, extra miles | read from each option's own text and note (`content/option_attributes.csv`, with the matching phrase in the `evidence` column) | DECISION |

No fuel or no vehicle means the player cannot drive. A **fallback scene** plays (Running on Fumes / On Foot). After 3 fallback scenes on the same leg the player is **stranded**.

## 6. Food, water, health

Food drains 8 and water 10 per 12 hours (the old "per scenario" rule, now tied to the clock). At 0 food the player loses 8 health per 12 hours; at 0 water, 12. All resources are clamped to 0–100 (fuel to 0–25 gal) and every change goes into the ledger with its cause.

## 7. Rolls and mini games (unchanged)

Every 2 main picks: risky pair → 0–60 HARD mini game, 61–100 detour; mixed pair → 0–50 NORMAL, else EASY; good pair → EASY, double reward above 50. HARD win +5 health, loss −20 to −30; NORMAL win +15 of the reward type, loss −10 to −15; EASY win +25 (×2 on the double roll), loss free. The 8 mini games never repeat in one playthrough. In simulations, mini games are won with fixed chances (35% / 60% / 85%).

## 8. Endings

| Ending | Condition |
|---|---|
| VICTORY | alive, not turned (or cured), at the safe zone's road mile, by hour 160 |
| DIED | health 0 |
| TURNED | untreated infection reached onset, or the gate treatment failed |
| TOO_LATE | the clock passed Day 7 midnight |
| STRANDED | out of fuel/vehicle after 3 fallback scenes, or not at the safe zone when the story ended |
| DENIED | the final option says the gate turned the player away |

## 9. Random numbers

Mulberry32, seeded per game. Each kind of random event has its own named stream (outbreak, injury, infection, road, town_fuel, treat, roll, minigame_pick, minigame_win, minigame_dmg, policy). The same seed with the same choices replays the same game. Monte Carlo runs every strategy on seeds 1–N, so the strategies face matched random numbers for the same kind of event.

## 10. What the survival percentages mean

They are frequencies inside this model. They show how the game's rules reward or punish strategies. They are **not** estimates of anyone's real chance of surviving anything.

## 11. Version 2 additions

| Rule | Formula | Label |
|---|---|---|
| Age multiplier on β | `clamp(1 + 0.01 × (pct65 − 16.08), 0.9, 1.1)`; 16.08 = mean % aged 65+ across the 44 route counties | REAL input (SVI 2022 EP_AGE65), FICTIONAL rule |
| SVI congestion delay | `factor × (2 + 6 × SVI)` hours on options with `svi_delay` | REAL input (SVI 2022 RPL_THEMES), FICTIONAL rule |
| Events | rabies (infected, not yet symptomatic, no cure item) → fuel (< 8 gal, Morning) → R0 (Day 3 Night) → SVI ≥ 0.75 → % 65+ ≥ 20; at most one per scene, each once | DECISION |
| Treatment options | 90% cure if infected and untreated (`treatment_success`) | FICTIONAL |
| Symptom list flag | symptoms warn 6 h earlier | FICTIONAL |
| Fixed costs (`harm`) | flat health loss with a stated reason | FICTIONAL |
| Final gate | quarantine hours are not counted against the deadline; fuel gates need a stated number of gallons or add hours | DECISION |
| Realistic mini games | follow real steps; fixed win/fail effects per game; no loss on EASY; cold hands = controls slowed by `clamp((32 − °F)/50, 0, 0.5)` from the NOAA normal; mistake noise × (1 + 3 × local infectious share); boiling rule 1 min, 3 min above 6,500 ft (CDC) from station elevation | REAL inputs, FICTIONAL scoring |

## 12. Monte Carlo, version 2 (1,000 runs per route per strategy, seeds 1–1000)

| Strategy | Survival | Main failure |
|---|---|---|
| Balanced | 96.9% | turned 2.5% |
| Lowest risk | 96.9% | turned 2.1% |
| Always BEST | 94.6% | turned 3.2% |
| Max supplies | 37.9% | too late 57.4% |
| Max speed | 14.3% | died 84.9% |
| Random | 11.5% | died 67.1% |

Careful play survives about 97% of the time, because infection is now usually curable (treatment options, the rabies event, the wound check). Full tables: `reports/survival_report.md`.

## 13. Version 3: arrival seeding (replaces the single 0.001% start)

Every county used to start at 0.001% infectious, so the first days were nearly risk-free and tiny rural counties stayed safe all week, while big cities neared their peak. Version 3 gives each route stop its own starting level (`i0`), solved so that, at the player's scheduled arrival and with outbreak strength 1.0, the county is near a target:

| Step | Rule | Label |
|---|---|---|
| Arrival time | stop k (0–6) = Day k+1 08:00; safe zone = Day 7 20:00 | DECISION |
| Base target | 5% on Day 1, rising in a straight line to 35% at the Day 7 evening arrival | FICTIONAL |
| Density tilt | + 10 points × clamp(log10(density / 100) / 2, −1, 1): 1/sq mi → −10, 100 → 0, 10,000+ → +10 | REAL input, FICTIONAL rule |
| Limits | target between 2% and 60% | FICTIONAL |
| Solve | log-spaced scan of starting levels, then 30 bisection steps (`seir.calibrate_i0`) | CALCULATED |

Story framing: the outbreak reached each county at a different time. The game's random outbreak strength (±10%) still moves each run above or below the target, and the curve keeps growing after you arrive, so arriving late is still more dangerous.

Monte Carlo, 1,000 runs per route per strategy:

| Strategy | v2 survival | v3 survival | v2 infected | v3 infected | v3 turned |
|---|---|---|---|---|---|
| Balanced | 96.9% | 96.0% | 27.3% | 37.6% | 3.4% |
| Lowest risk | 96.9% | 95.7% | 26.0% | 31.9% | 3.3% |
| Always BEST | 94.6% | 93.6% | 36.4% | 46.0% | 4.7% |
| Random | 11.5% | 9.8% | 34.9% | 51.9% | 19.3% |

Infections are now more common, and careless play turns almost twice as often. Careful play still survives about 96%, because infection is usually caught and cured (90% treatments, the rabies event, the wound check, the gate screening). The next lever for difficulty is the cure side, not the outbreak.
