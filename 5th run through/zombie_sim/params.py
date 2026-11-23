"""
Every FICTIONAL modeling assumption in one place.

Nothing in this file is a real-world measurement. Real data (population, land area,
January climate normals, road distances) lives in data/*.csv and is loaded by data_loader.py.
Change a number here and both the Python game and the web game (via build_web.py) use it.
"""

PARAMS = {
    # ---------------- SEIR outbreak model (fictional zombie biology) ----------------
    "beta_base": 1.5,            # bites per infectious person per day, before modifiers
    "incubation_days": 1.0,      # sigma = 1 / incubation_days
    "gamma": 0.15,               # share of infectious removed per day
    "initial_prevalence": 0.00001,   # 0.001% infectious on outbreak day 0 (used when seed_mode = "uniform")
    # v3 "arrival seeding" (FICTIONAL rule: the outbreak reached each county at a different time).
    # Each route stop's starting infectious share is solved so that, at the player's scheduled arrival
    # (strength 1.0), the county is near a target that rises over the trip, nudged by density.
    "seed_mode": "arrival",          # "arrival" (v3) or "uniform" (v1/v2: every county starts at initial_prevalence)
    "seed_target_day1": 0.05,        # target infectious share at a Day 1 arrival
    "seed_target_day7": 0.35,        # target at the Day 7 evening arrival (safe zone)
    "seed_density_tilt": 0.10,       # +/- 10 points: z = clamp(log10(density / 100) / 2, -1, 1)
    "seed_target_min": 0.02,         # no stop is ever below 2% at arrival
    "seed_target_max": 0.60,
    "outbreak_start_day": 7.0,   # game Day 1, 08:00 = outbreak day 7.0
    "winter_ramp_per_day": 0.02, # transmission grows 2% per outbreak day
    "density_ref": 100.0,        # people/sq mi where the density multiplier = 1
    "density_slope": 0.20,       # +0.20 per tenfold increase in density
    "density_mult_min": 0.6,
    "density_mult_max": 1.8,
    "cold_ref_f": 50.0,          # below this, people crowd indoors: +1% per degree F
    "cold_slope": 0.01,
    "stiff_threshold_f": 20.0,   # below this, zombies stiffen: -3% per degree F...
    "stiff_slope": 0.03,
    "stiff_floor": 0.40,         # ...but never below 40% (fixes the old negative-beta bug)
    "outbreak_strength_min": 0.9,  # each playthrough's outbreak is scaled by U(0.9, 1.1)
    "outbreak_strength_max": 1.1,
    "seir_dt_days": 1.0 / 24.0,  # RK4 step = 1 hour
    "seir_horizon_days": 16.0,   # simulate outbreak days 0..16 (game ends by day ~14)

    # ---------------- Clock, travel and fuel (fictional) ----------------
    "deadline_hours": 160.0,     # game hour 0 = Day 1 08:00; deadline = Day 7 midnight
    "base_speed_mph": 50.0,      # average apocalypse driving speed, clear dry roads
    "snow_speed_slope": 0.02,    # speed divided by (1 + 0.02*snow_in + 0.005*deg below 32F)
    "cold_speed_slope": 0.005,
    "night_speed_factor": 0.85,
    "walk_speed_mph": 3.0,
    "walk_segment_hours": 6.0,   # on foot, the game checks in every 6 hours
    "mpg": 25.0,                 # SUV with jerry cans
    "tank_gallons": 25.0,
    "start_fuel_gallons": 25.0,
    "road_risk_per_hour": 0.01,  # chance per driving hour of a road accident (before weather)
    "road_damage": 8.0,
    "town_fuel_min": 8.0,            # each Morning stop is a town: the player scavenges U(8, 16) gallons
    "town_fuel_max": 16.0,
    "found_vehicle_min_fuel": 6.0,   # a vehicle found in the story is assumed to hold at least 6 gallons
    "max_fallbacks_per_leg": 3,      # after 3 failed fallback scenes on one leg the player is stranded

    # ---------------- Survival resources (existing game rules) ----------------
    "start_health": 100.0, "start_food": 60.0, "start_water": 60.0,
    "max_health": 100.0, "max_food": 100.0, "max_water": 100.0,
    "food_drain_per_12h": 8.0,   # existing rule: -8 food per scenario (= per 12 hours)
    "water_drain_per_12h": 10.0, # existing rule: -10 water per scenario
    "starving_damage_per_12h": 8.0,
    "dehydrated_damage_per_12h": 12.0,

    # ---------------- Injury risk (fictional coefficients) ----------------
    # P(injury) = min(0.95, base x weather x activity x time)
    # base = the option's existing hidden injury chance (BEST/OKAY/RISKY/WORST bands)
    "injury_cap": 0.95,
    "weather_cold_slope": 0.01,  # +1% per degree F below 32F (outdoor activities only)
    "weather_snow_slope": 0.01,  # +1% per inch of January normal snowfall (outdoor only)
    "weather_mult_max": 1.5,
    "activity_injury_mult": {"travel": 1.0, "scavenge": 1.0, "contact": 1.1, "social": 0.85, "shelter": 0.75},
    "night_injury_mult": 1.15,

    # ---------------- Infection exposure risk (fictional coefficients) ----------------
    # P(infection) = 1 - exp(-k x p x t x M)
    "k_by_exposure": {"none": 0.0, "low": 0.05, "medium": 0.2, "high": 0.5, "contact": 1.5},
    "setting_mult": {"vehicle": 0.3, "shelter": 0.5, "open": 1.0},
    "night_infection_mult": 1.25,
    "gear_mult": 1.0,            # slot for protective gear; the story has no gear item yet, so 1.0
    "incubation_hours_player": 36.0,   # player's own hidden incubation before turning
    "warning_hours_before_onset": 12.0,
    "treatment_success": 0.9,          # medicine before onset (rabies PEP analogy)
    "infection_cost_for_policy": 60.0, # how much the "lowest risk" policy fears infection

    # ---------------- v2: data-driven events and situational options (fictional rules on real data) ----------------
    "age_slope": 0.01,           # outbreak spread x (1 + 0.01 per point of 65+ share above the 44-county mean)
    "age_mult_min": 0.9, "age_mult_max": 1.1,
    "svi_event_threshold": 0.75, # Gridlock scene plays at the first stop with CDC SVI >= 0.75
    "svi_delay_base": 2.0,       # gridlock delay = 2 + 6 x SVI hours (SVI changes time only)
    "svi_delay_slope": 6.0,
    "age_event_threshold": 20.0, # Nursing Home scene plays at the first stop with >= 20% aged 65+
    "fuel_event_threshold": 8.0, # Last Working Pump scene plays at a Morning stop under 8 gallons
    "low_fuel_gal": 5.0, "behind_hours": 12.0, "low_health": 40.0,
    "symptom_list_hours": 6.0,   # the Radio Doctor's checklist shows symptoms 6 hours earlier

    # ---------------- Rolls and mini games (existing game rules) ----------------
    "minigame_win_prob_sim": {"HARD": 0.35, "NORMAL": 0.6, "EASY": 0.85},  # used only in simulations
    "minigame_reward": {"HARD": 0.0, "NORMAL": 15.0, "EASY": 25.0},
    "hard_win_health": 5.0,
    "hard_loss_damage": [20, 30],
    "normal_loss_damage": [10, 15],
    "timer_seconds": 20,
}

MINIGAMES = {
    "Lock the Door": "health", "Escape the Horde": "health", "Dodge the Wrecks": "water",
    "Barricade the Door": "health", "Safe or Unsafe?": "food and water", "Count the Infected": "food",
    "Crack the Supply Locker": "food", "Decode the Radio": "water",
}
MINIGAME_ORDER = list(MINIGAMES)

CURE_FLAGS = ["MED_KIT", "MED_SUPPLIES"]
