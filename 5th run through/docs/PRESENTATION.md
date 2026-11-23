# Presenting Zombie Escape (talking points)

**1. What it is.** A choose-your-own-adventure escape across the U.S. in January. Seven start cities, 14 story stops, 20 seconds per choice, 8 mini games. The game runs in a browser or in the console.

**2. What is real.** Every place is a real county. The game uses the Census Bureau's 2023 population estimates and land area to calculate density (Manhattan: about 70,500 people per square mile; Teton County, Wyoming: about 2). Temperatures and snowfall are NOAA's official 1991–2020 January averages. Distances are real driving distances from OpenStreetMap (about 2,200–2,400 miles per route).

**3. What is invented, and labeled.** The zombie, how fast it spreads, and every risk number. The game marks them in orange on screen, keeps them all in one file (`params.py`) and lists them in `docs/MATH.md`.

**4. How the outbreak works.** An SEIR model. People go from Susceptible to Exposed to Infectious to Removed. Crowded and cold places spread faster (people crowd indoors), but very cold places slow the zombies down. Each county has its own curve. In the game you can watch your county's curve with a "you are here" line.

**5. Two separate risks.** Getting hurt depends on the choice, the weather and the dark. Getting infected depends on how many infected are around you, how long you're exposed and whether you're in a car or out in the open. After every choice the game shows the full calculation.

**6. Trade-offs.** Supplies cost time. Time matters because the safe zone seals at midnight on Day 7. Driving burns fuel; running out means a roadside scene. A detour can save a day or lose one.

**7. Monte Carlo.** We let six computer strategies play each route 1,000 times with the same random numbers. Careful strategies survive about 80–84% of the time, "speed first" about 69%, and random choices about 11%. At the end of each game, the page runs 500 trips in *your* style and compares.

**8. Testing.** 62 automated tests: the data loads and rejects bad values, the outbreak never goes negative and always adds up to the population, the rules work (no driving without fuel, no win without arriving), the browser version gives exactly the same results as the Python version, and the server works.

**9. Honest limits.** Counties don't infect each other. Fuel found in towns is a game rule, not real gas-station data. The survival percentages are game odds, not real-world odds.

Charts for slides: `reports/survival_by_policy.png`, `reports/endings_by_policy.png`, `reports/survival_by_route.png`, `reports/seir_start_counties.png`, screenshots in `reports/screenshots/`.
