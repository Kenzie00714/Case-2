// Builds the Game Breakdown Word doc. Its input, /tmp/docdata.json, was generated in the chat from the game data (routes, SEIR results, mc_results.json).
const fs = require("fs");
const D = JSON.parse(fs.readFileSync("/tmp/docdata.json", "utf8"));
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  HeadingLevel, PageOrientation, AlignmentType, Footer, PageNumber, TableOfContents, PageBreak } = require("docx");

const W = 13680; // landscape letter, 0.75" margins
const border = { style: BorderStyle.SINGLE, size: 4, color: "B7C3CC" };
const borders = { top: border, bottom: border, left: border, right: border };
const P = (text, opts = {}) => new Paragraph({ spacing: { after: 120 }, ...opts, children: [new TextRun({ text, ...(opts.run || {}) })] });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
let tno = 0;
function T(title, headers, rows, fr) {
  tno += 1;
  const tot = fr.reduce((a, b) => a + b, 0);
  const widths = fr.map((f) => Math.floor(W * f / tot));
  widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
  const cell = (txt, i, head, shade) => new TableCell({
    borders, width: { size: widths[i], type: WidthType.DXA },
    shading: head ? { fill: "1F2F3D", type: ShadingType.CLEAR, color: "auto" } : shade ? { fill: "EEF2F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 50, bottom: 50, left: 90, right: 90 },
    children: String(txt).split("\n").map((line) => new Paragraph({ children: [new TextRun({ text: line, size: 17, bold: head, color: head ? "FFFFFF" : "1A1A1A", font: "Arial" })] })),
  });
  return [
    new Paragraph({ keepNext: true, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: `Table ${tno}. ${title}`, bold: true, size: 20, color: "C25E00" })] }),
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths,
      rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
        ...rows.map((r, k) => new TableRow({ cantSplit: true, children: r.map((v, i) => cell(v, i, false, k % 2 === 1)) }))] }),
    new Paragraph({ spacing: { after: 120 }, children: [] }),
  ];
}
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const kids = [];
const add = (...x) => x.flat().forEach((y) => kids.push(y));

// ---------------- title
add(new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 60 }, children: [new TextRun({ text: "Zombie Escape", bold: true, size: 56, color: "1F2F3D" })] }),
  new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: "Game breakdown: data, models, probabilities, screens and results, one table per part", size: 28, color: "C25E00" })] }),
  P("This document breaks the game into its parts. Each part has its own table: what was downloaded, how the data is used, how the outbreak (SEIR) model and the probabilities work, the game menu, in-game play, the mini games, the endings and the Monte Carlo results. Labels used throughout: REAL = downloaded data; FICTIONAL = an invented game assumption; CALCULATED = computed from the other two; DECISION = comes from the player's choice and the story text."),
  new Paragraph({ spacing: { before: 200, after: 80 }, children: [new TextRun({ text: "Contents", bold: true, size: 26 })] }),
  ...["1. The game at a glance", "2. Backend data: what was downloaded", "3. Backend data: how each piece is used", "4. Route data, stop by stop (one table per route)", "5. Real vs. fictional vs. calculated vs. decision", "6. The outbreak model (SEIR)", "7. Probabilities (injury, infection, infection timeline)", "8. How the story text becomes numbers", "9. Travel, clock, fuel, food, water and health", "10. Game menu (title screen)", "11. In-game play: screens and dashboards", "12. Story structure", "13. Rolls and mini games", "14. Callbacks, detours and fallback scenes", "15. Endings and the end screen", "16. Monte Carlo simulation", "17. Technical pieces (random numbers, tests, files, how to run)"].map((t) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: t, size: 21 })] })),
  new Paragraph({ children: [new PageBreak()] }));

// ---------------- 1 overview
add(H1("1. The game at a glance"),
  T("Game summary", ["Item", "Detail"], [
    ["Goal", "Get from your start city to a safe zone about 2,200–2,400 road miles away before it seals at midnight on Day 7, alive and not infected."],
    ["Routes", "7: New York City → Salt Lake City; Boston → Albuquerque; Pittsburgh → Las Vegas; Salt Lake City → New York (Governors Island); Jackson, WY → Boston Harbor; Seattle → Cincinnati; Austin → Bangor, ME"],
    ["Story", "14 main scenes per route (Day 1–7, Morning and Night), 4 detours and 2 callbacks per route: 140 scenes and 560 options in all"],
    ["Choices", "4 options per scene (A–D), 20-second timer. Each option has a hidden rating: BEST, OKAY, RISKY or WORST"],
    ["Player resources", "Health (start 100), Food (60), Water (60), Fuel (25 gal, full tank), vehicle (yes/no), miles left, the clock"],
    ["Risks", "Injury (choice, weather, activity, night) and infection (local outbreak, exposure, hours, setting) are separate"],
    ["Mini games", "8 live games in 3 difficulty tiers, triggered by a roll every 2 main choices; none repeats in a playthrough"],
    ["Endings", "Victory, Died, Turned, Too late, Stranded, Turned away at the gate"],
    ["Versions", "Browser game (one HTML page or server.py) and console game (play.py). Both run the same rules; a test checks they match."],
  ], [1, 4]));

// ---------------- 2 backend data
add(H1("2. Backend data: what was downloaded"),
  P("Every value below was downloaded from the source named. Nothing in the data files was estimated. Where a source did not publish a value, the cell is left blank and the game treats it as missing, never as zero."),
  T("Downloaded datasets", ["Dataset", "Source", "Year / period", "Geography", "Variables taken", "Rows", "File"], [
    ["County population", "U.S. Census Bureau, Vintage 2023 county population estimates (co-est2023-alldata.csv)", "July 1, 2023 estimate; 2020 estimates base", "County (5-digit FIPS GEOID)", "POPESTIMATE2023, ESTIMATESBASE2020, county and state names", "44 counties", "data/city_data.csv"],
    ["County land area and location", "Census TIGERweb, State_County MapServer layer 1", "Current TIGER boundaries", "County", "AREALAND (square meters), CENTLAT, CENTLON (Census internal point)", "44 counties", "data/city_data.csv"],
    ["January climate normals", "NOAA NCEI U.S. Climate Normals, monthly", "1991–2020 average", "Weather station", "January average temperature (°F), precipitation (in), snowfall (in); station latitude, longitude, elevation", "42 stations", "data/weather_data.csv"],
    ["Road distances", "OSRM routing engine on OpenStreetMap data (router.project-osrm.org)", "Queried Nov 2026", "Point to point between route stops", "Driving distance (meters) and free-flow driving time (seconds) for each leg", "7 routes × 7 legs", "data/route_data.csv"],
  ], [1.2, 2, 1.1, 1, 2, 0.7, 1.1]),
  T("Data that is NOT in the game", ["Dataset", "Status", "What the game does instead", "How to add it"], [
    ["OpenStreetMap hospitals, grocery stores, gas stations", "Not collected (the Overpass API could not be reached)", "Fuel found in towns is a labeled fictional rule: 8–16 gallons at each Morning stop", "Query Overpass for amenities near each stop, save poi_data.csv, replace the town-fuel rule"],
    ["CDC/ATSDR Social Vulnerability Index", "Not collected", "Not used", "Download the county SVI CSV; use it only for evacuation difficulty, never for infection or survival odds"],
    ["Real outbreak data", "Not applicable", "The zombie is invented; all spread rates are labeled fictional", "—"],
    ["Snowfall normal for Poughkeepsie, Laramie, Denver", "NOAA does not publish one", "Left blank; the snow term in the formulas is skipped and the screen says so", "—"],
  ], [1.4, 1.4, 2, 2]));

add(H1("3. Backend data: how each piece is used"),
  T("From downloaded value to game effect", ["Data item", "Kind", "Transformation", "Used in", "Effect on the game"], [
    ["2023 county population", "REAL", "Population ÷ land sq mi = density", "SEIR density multiplier; outbreak dashboard counts (S, E, I, R × population)", "Denser counties spread the outbreak faster, so infection chances are higher there"],
    ["County land area (m²)", "REAL", "÷ 2,589,988.11 = square miles", "Density", "Same as above"],
    ["County internal point (lat/lon)", "REAL", "Used as the route waypoint when no weather station is in the county; distance to the station calculated", "Route map, OSRM routing", "Where the stop is drawn and where driving distance is measured"],
    ["January average temperature", "REAL", "None (used directly)", "SEIR cold multiplier; injury weather factor; driving speed", "Cold below 50°F crowds people indoors (faster spread); below 20°F zombies stiffen (slower spread, with a floor); cold below 32°F raises outdoor injury risk and slows driving"],
    ["January snowfall", "REAL (may be blank)", "None; blank = skipped, not zero", "Injury weather factor; driving speed", "More snow = higher outdoor injury risk and slower driving"],
    ["January precipitation", "REAL", "None", "Shown for reference only", "No effect on the math"],
    ["Road distance per leg", "REAL", "Meters ÷ 1,609.344 = miles; summed into cumulative miles", "Travel, fuel use, miles left, victory check", "Sets how long each drive takes and how much fuel it burns; you must reach the final mile to win"],
    ["OSRM driving time", "REAL", "Stored only", "Reference", "Not used; the game calculates its own winter speed"],
  ], [1.3, 0.8, 1.5, 1.6, 2.6]));

// ---------------- route tables
add(H1("4. Route data, stop by stop"),
  P("Each route has 8 stops: the start city, the place for each morning of Days 2–7, and the safe zone. Population, land area and density come from the Census; temperature and snow are NOAA January normals at the listed station; miles are OSRM road distances."));
const names = Object.fromEntries(D.cities.map((c) => [c[0], `${c[1]} → ${c[2]} (${c[3].toLocaleString()} road miles)`]));
for (const code of Object.keys(D.routes)) {
  add(H2(`${code}: ${names[code]}`),
    T(`${code} route stops`, ["Stop", "Place", "County (GEOID)", "Pop. 2023", "Land sq mi", "People / sq mi", "Weather station", "Jan °F", "Jan snow in", "Miles from start", "Miles to next stop"], D.routes[code],
      [0.5, 1.6, 1.7, 0.8, 0.7, 0.7, 1.5, 0.5, 0.6, 0.7, 0.7]));
}

// ---------------- classification
add(H1("5. Real vs. fictional vs. calculated vs. decision"),
  T("What kind of number each part of the game is", ["Kind", "Examples", "Where it lives", "Can it be changed?"], [
    ["REAL", "Population, land area, January temperature and snow, road miles", "data/*.csv", "Replace the CSV; the loader checks every value and reports problems by file and line"],
    ["FICTIONAL", "Zombie spread rate (beta), incubation, removal rate (gamma), every risk coefficient, fuel economy, town fuel, mini game rewards", "zombie_sim/params.py (one file)", "Edit params.py, then rebuild the web bundle"],
    ["CALCULATED", "Density, outbreak curves, R0 and effective R, injury and infection chances, driving time, fuel used", "Computed each game from REAL + FICTIONAL", "Changes automatically"],
    ["DECISION", "Hours an option takes, fuel gained, vehicle lost or found, extra miles, exposure level, medicine", "content/option_attributes.csv (read from each option's own text, with the matching phrase saved as evidence)", "Edit the CSV by hand"],
  ], [0.8, 2.4, 1.6, 2]));

// ---------------- SEIR
add(H1("6. The outbreak model (SEIR)"),
  P("Each county has its own outbreak curve. People move from Susceptible → Exposed → Infectious → Removed. The four shares always add up to 100% of the county. Counties do not exchange infected people (a stated limitation); a point halfway between two stops averages their two curves."),
  T("SEIR equations", ["Compartment", "Equation", "Meaning"], [
    ["S (susceptible)", "dS/dt = −β(t)·S·I", "Healthy people get bitten at a rate set by β and how many are infectious"],
    ["E (exposed)", "dE/dt = β(t)·S·I − σ·E", "Bitten people incubate for about 1 day"],
    ["I (infectious)", "dI/dt = σ·E − γ·I", "Active zombies; this share drives the player's infection risk"],
    ["R (removed)", "dR/dt = γ·I", "Zombies that are destroyed or collapse (15% per day)"],
    ["Solver", "4th-order Runge–Kutta, 1-hour steps, 16 days", "Tiny negative rounding is set to 0 and shares renormalized; tested to sum to 1"],
  ], [1, 2, 3]),
  T("SEIR parameters", ["Parameter", "Value", "Kind", "What it does", "Effect on the game"], [
    ["β base (transmission)", "1.5 per day", "FICTIONAL", "Bites per infectious person per day before modifiers", "Higher = faster outbreak everywhere"],
    ["Incubation (1/σ)", "1 day", "FICTIONAL", "Time from bite to infectious", "Short incubation = quick explosion"],
    ["γ (removal)", "0.15 per day", "FICTIONAL", "Share of zombies removed per day", "Lower = zombies linger longer"],
    ["Starting infectious", "0.001%", "FICTIONAL", "Seed of the outbreak", "Tiny start, so early days are calmer"],
    ["Game start", "Outbreak day 7", "FICTIONAL", "Day 1, 08:00 is a week into the outbreak", "Some infection already exists on Day 1"],
    ["Density multiplier", "1 + 0.2·log10(density/100), between 0.6 and 1.8", "FICTIONAL rule on REAL density", "Crowded counties spread faster", "Manhattan ×1.57; rural Wyoming ×0.75"],
    ["Cold multiplier", "(1 + 0.01·max(0, 50 − T)) × max(0.40, 1 − 0.03·(20 − T)) if T < 20°F", "FICTIONAL rule on REAL temperature", "Cold crowds people indoors; deep cold stiffens zombies", "Fixed bug: can no longer go negative"],
    ["Winter ramp", "+2% per outbreak day", "FICTIONAL", "Spread speeds up as winter deepens", "Later days are more dangerous"],
    ["Outbreak strength", "×0.9 to ×1.1 per playthrough (seeded)", "FICTIONAL", "Each game's outbreak differs a little", "Replays with a new seed feel different"],
    ["R0", "β(t) ÷ γ", "CALCULATED", "How many people one zombie infects in a fully healthy county", "Shown on the outbreak panel; not a real-disease estimate"],
    ["Effective R", "R0 × S", "CALCULATED", "Spread once part of the county is already infected", "Falls as the outbreak burns through"],
  ], [1.3, 1.9, 1.1, 1.6, 1.6]),
  T("Outbreak at each start county (default parameters, strength ×1.0)", ["Route", "Start county", "People / sq mi", "Jan °F", "Density ×", "Cold ×", "R0 on Day 1", "Infectious Day 1 08:00", "Day 4 08:00", "Day 7 08:00"], D.seir,
    [0.6, 1.4, 0.9, 0.6, 0.7, 0.6, 0.8, 1, 0.8, 0.8]),
  T("Sensitivity of the model", ["Change", "Result"], [
    ["β from 1.0 to 2.0, γ from 0.10 to 0.30", "Day 4 infectious share at the worst stop ranges from about 3% to over 70%. Higher β or lower γ always means more infection."],
    ["Smaller time step (15 minutes instead of 1 hour)", "Results change by less than 0.01 percentage points (stable)"],
    ["Survival of the balanced strategy vs. β", (D.mc.survival_vs_beta_balanced || []).map(([b, s]) => `β ${b}: ${pct(s)}`).join("; ")],
  ], [2, 4]));

// ---------------- probabilities
add(H1("7. Probabilities"),
  T("Injury chance: P(injury) = min(95%, base × weather × activity × time)", ["Factor", "Value", "Kind", "How it works", "Example"], [
    ["Base", "The option's hidden injury chance: BEST 0–10%, OKAY 10–25%, RISKY 30–55%, WORST 60–85%", "FICTIONAL (original game)", "Set per option", "An OKAY option might be 25%"],
    ["Weather", "Outdoors only: min(1.5, 1 + 0.01 × degrees below 32°F + 0.01 × January snow inches). Inside or in a vehicle: 1.0", "FICTIONAL rule on REAL normals", "Cold and snowy places are more dangerous outside", "Jackson, WY (16.2°F, 19.1 in) ×1.35"],
    ["Activity", "travel 1.0, scavenge 1.0, contact 1.1, social 0.85, shelter 0.75", "FICTIONAL", "Read from the option text", "Hiding indoors lowers risk"],
    ["Time", "Night ×1.15", "FICTIONAL", "Night scenes are riskier", "—"],
    ["Cap", "95%", "FICTIONAL", "Nothing is ever certain", "—"],
    ["Damage", "The option's hidden damage value (5–35)", "FICTIONAL (original game)", "Applied if the roll is under the chance", "—"],
    ["Not included", "The local outbreak", "—", "Zombies nearby no longer raise injury risk (that was double counting)", "—"],
  ], [0.8, 2.4, 1.1, 1.6, 1.3]),
  T("Infection chance: P(infection) = 1 − exp(−k × p × t × setting × night × gear)", ["Factor", "Value", "Kind", "How it works"], [
    ["k (exposure level)", "none 0, low 0.05, medium 0.2, high 0.5, contact 1.5", "FICTIONAL", "How close you get to the infected; read from the option text (crowds, hospitals, opening doors = higher)"],
    ["p (local infectious share)", "From the SEIR curve where you are, at the current hour", "CALCULATED", "More zombies around = higher chance; rises day by day"],
    ["t (hours)", "Hours the option takes", "DECISION", "Longer exposure = higher chance"],
    ["Setting", "vehicle 0.3, shelter 0.5, open 1.0", "FICTIONAL", "Walls and car doors protect you"],
    ["Night", "×1.25", "FICTIONAL", "Harder to see them coming"],
    ["Gear", "×1.0", "FICTIONAL", "Slot for protective gear; the story has no gear item yet"],
    ["Worked example", "Scavenging (medium, k 0.2) outdoors for 2 hours where 25% are infectious: 1 − exp(−0.2 × 0.25 × 2) = 9.5%", "—", "Each factor is used once, so nothing is counted twice"],
  ], [1.2, 2.4, 0.9, 2.5]),
  T("Infection timeline", ["Time after being infected", "What happens"], [
    ["0 hours", "Hidden. The player isn't told."],
    ["24 hours", "Symptoms appear (fever message). If the player carries medicine, it is used automatically: 90% cure."],
    ["Medicine found later, before 36 hours", "Used right away: 90% cure"],
    ["36 hours, untreated", "TURNED ending"],
    ["Reach the safe zone infected but before 36 hours", "Quarantine at the gate: 90% cure (Victory), otherwise TURNED"],
  ], [1.5, 4]));

// ---------------- option attributes
add(H1("8. How the story text becomes numbers"),
  P("Every option's text and hidden note were read by rules in attributes.py. The result is saved in content/option_attributes.csv with an evidence column showing the exact phrase behind each value, so outcomes match what the story says. The CSV can be edited by hand."),
  T("Option attributes", ["Field", "Values", "Read from", "Effect"], [
    ["activity", "contact, scavenge, social, shelter, travel", "Option text (e.g. 'search', 'trade', 'hide', 'open the door')", "Injury activity factor; default hours and exposure"],
    ["hours", "0.5 to 2 by default; +2, +3, +12, +24 or +36", "Note ('costs a day', 'half a day', 'takes hours')", "Clock moves forward; more hours = more food/water used and more infection exposure"],
    ["exposure", "none, low, medium, high, contact", "Activity, plus words like crowd, hospital, mall", "Infection k"],
    ["setting", "vehicle, shelter, open", "Activity and vehicle words", "Infection setting factor; weather applies only in the open"],
    ["fuel_gal", "−6 to +25 (25 = fill the tank)", "'full tank', 'gas cans', 'siphon', 'trade fuel'", "Fuel gained or spent"],
    ["vehicle", "lost / gained / none", "'car is wrecked', 'take the tow truck', 'keys in it'", "Losing it forces the 'On Foot' fallback; a found vehicle has at least 6 gal"],
    ["miles_bonus", "e.g. 200", "'200 miles' on a train, tow or ride", "Covers distance without fuel"],
    ["travel_hours_saved", "2", "'shortcut', 'saves hours'", "Cuts up to half of the next drive"],
    ["medicine", "yes / no", "'first aid', 'antibiotics', 'pharmacy'", "Carries a cure (90%)"],
    ["denied_entry", "yes / no (final scene only)", "'turned away', 'gates lock'", "TURNED AWAY ending"],
  ], [1, 1.6, 2, 2.2]));

// ---------------- travel/resources
add(H1("9. Travel, clock and fuel"),
  T("Travel rules", ["Rule", "Value", "Kind", "Effect"], [
    ["Clock", "Day 1 08:00 = hour 0. Deadline: Day 7 midnight = hour 160", "FICTIONAL", "Arrive later and the safe zone is sealed (TOO LATE)"],
    ["Where scenes happen", "Morning of Day d at stop d; Night of Day d halfway to the next stop; Day 7 Night at the safe zone", "FICTIONAL layout on REAL miles", "The story stays in step with real geography"],
    ["Scheduled times", "Mornings at 08:00, Nights at 20:00", "FICTIONAL", "Arriving early means resting until then (food and water still drain)"],
    ["Driving speed", "50 mph ÷ (1 + 0.005 × degrees below 32°F + 0.02 × snow inches); ×0.85 overnight", "FICTIONAL rule on REAL normals", "Snowy, cold legs take longer"],
    ["Fuel use", "25 miles per gallon; 25-gallon tank; starts full", "FICTIONAL", "About 92 gallons needed per route"],
    ["Fuel in towns", "8–16 gallons at each Morning stop (random, seeded)", "FICTIONAL", "Stand-in until real gas-station data is added"],
    ["Road accident", "1 − exp(−0.01 × cold factor × driving hours); −8 health", "FICTIONAL", "Long cold drives carry some risk"],
    ["No fuel or no vehicle", "A fallback scene plays; after 3 on one leg the player is STRANDED", "rule", "You cannot drive with an empty tank"],
  ], [1.2, 2.6, 1.1, 2]),
  T("Food, water and health", ["Resource", "Start", "Change over time", "If it hits 0", "Limits"], [
    ["Health", "100", "Injuries, road accidents, mini games, healing from options", "DIED ending", "0–100"],
    ["Food", "60", "−8 per 12 hours", "−8 health per 12 hours", "0–100"],
    ["Water", "60", "−10 per 12 hours", "−12 health per 12 hours", "0–100"],
    ["Fuel", "25 gal", "−1 gal per 25 miles driven", "Fallback scene", "0–25 gal"],
    ["Ledger", "—", "Every change is recorded with its cause", "Shown at the end", "Includes fuel"],
  ], [1, 0.7, 2, 1.5, 1]));

// ---------------- menu
add(H1("10. Game menu (title screen)"),
  T("Title screen", ["Element", "What it shows / does", "Data behind it"], [
    ["Title and intro", "'Zombie Escape' and the story set-up: 7 days to reach a safe zone", "—"],
    ["Alert banner", "'All bridges and tunnels are closing. Choose your city and go.'", "—"],
    ["7 city buttons", "Start → destination, road miles, start county density, January temperature. Clicking starts the game.", "OSRM miles, Census density, NOAA normal"],
    ["Seed box", "Type a number to replay the same game; blank = random", "Seeded random-number generator"],
    ["Testing toggle", "'Show option ratings before choosing': reveals each option's rating and base injury chance", "Hidden option ratings"],
    ["How to play", "Injury vs infection, travel and fuel, the roll every 2 picks, keyboard keys", "—"],
    ["Data note", "Lists the real sources and says what is fictional; survival odds are game odds", "data_sources.md"],
  ], [1.2, 3.2, 1.6]));

// ---------------- in-game
add(H1("11. In-game play: screens and dashboards"),
  T("Player dashboard (top bar, always visible)", ["Element", "What it shows", "How it's calculated"], [
    ["Clock", "Day and time, plus 'night'", "Game hours since Day 1 08:00"],
    ["Location", "Current stop, or 'Between X and Y'", "Story stop for the current scene"],
    ["Hours until the safe zone seals", "Countdown to hour 160", "160 − current hour"],
    ["Health / Food / Water bars", "0–100", "Engine values after every change"],
    ["Fuel bar", "Gallons in the tank", "Tank level ÷ 25"],
    ["Miles left bar", "Road miles to the safe zone", "Total OSRM miles − miles driven"],
    ["Infectious here", "Share of the local county that is infectious now", "SEIR curve at the current hour"],
    ["Risk now line", "Injury multiplier outdoors and infection chance for 1 hour scavenging outside", "Weather × night factor; 1 − exp(−0.2 × p × 1)"],
    ["ON FOOT tag", "Appears if the vehicle is lost", "Vehicle flag"],
  ], [1.4, 2.2, 2.4]),
  T("Scene screen (making a choice)", ["Element", "What it does"], [
    ["Tag", "Day and Morning/Night, or Callback / Detour / On the road"],
    ["Title and story text", "The scene, unchanged from the original writing"],
    ["Timer bar", "20 seconds; turns yellow then red. If it runs out, a random option is chosen."],
    ["Options A–D", "Click, or press A–D or 1–4"],
  ], [1, 5]),
  T("Outcome screen ('How this was calculated')", ["Row", "What it shows"], [
    ["You chose / note", "The option and what happened in the story"],
    ["Messages", "Injury, supplies gained, fuel, vehicle, extra miles, medicine, starvation, symptoms"],
    ["Rating", "The option's hidden rating (revealed after choosing)"],
    ["Injury", "The full formula with every factor, the random roll and the result"],
    ["Infection", "The full formula with every factor, the roll and whether you were infected (hidden until symptoms)"],
    ["Time", "Hours used and the clock before and after"],
    ["Travel", "Fuel, vehicle and extra miles from the option"],
    ["From the text", "The phrase in the option that produced those effects"],
  ], [1, 5]),
  T("Side panels", ["Panel", "What it shows", "Interaction"], [
    ["Route map", "The 8 stops placed by real latitude and longitude; driven part in orange; your position; each stop coloured by its infectious share now (green = low, red = high)", "Hover a stop for its county, miles and infection; click it to open that stop's outbreak"],
    ["Outbreak panel", "County, GEOID, 2023 population, land area, density, January normal temperature and snow, S/E/I/R as people and %, R0 and effective R, weather station used and its distance", "Dropdown to inspect any stop"],
    ["SEIR chart", "S, E, I, R curves over the 7 game days with a dashed 'you' line at the current time", "Hover for the exact values at any time"],
    ["Colour key", "Green = real data, blue = calculated, orange = fictional", "—"],
  ], [1, 3.4, 1.8]),
  T("Other in-game screens", ["Screen", "When it appears", "What it shows"], [
    ["On the road", "After a drive with an event", "Road accident, starvation, symptoms"],
    ["In town", "Arriving at a Morning stop with a vehicle", "Fuel scavenged"],
    ["Mini game", "After the roll every 2 main choices", "Instructions, the live game, result and reward"],
    ["Callback", "2–3 scenes after setting certain flags", "A scene that follows up an earlier choice"],
    ["Detour", "On a risky roll", "An extra scene"],
    ["Fallback", "Out of fuel or no vehicle", "Running on Fumes or On Foot"],
  ], [1, 2, 3]));

// ---------------- story structure
const sched = [];
for (let d = 1; d <= 7; d++) {
  sched.push([`Day ${d}`, "Morning", d === 1 ? "08:00 (hour 0)" : `08:00 (hour ${(d - 1) * 24})`, d === 1 ? "Start city (stop 1)" : `Stop ${d}`]);
  sched.push([`Day ${d}`, "Night", `20:00 (hour ${(d - 1) * 24 + 12})`, d === 7 ? "Safe zone (stop 8)" : `Halfway between stop ${d} and stop ${d + 1}`]);
}
add(H1("12. Story structure"),
  T("The 14 main scenes", ["Day", "Scene", "Scheduled time", "Where"], sched, [1, 1, 1.5, 2.5]),
  T("Option ratings", ["Rating", "Hidden injury chance", "Hidden damage", "Meaning"], [
    ["BEST", "0–10%", "5–10", "The smart choice"],
    ["OKAY", "10–25%", "8–15", "Reasonable, small risk"],
    ["RISKY", "30–55%", "12–22", "Could go badly"],
    ["WORST", "60–85%", "20–35", "Very dangerous"],
  ], [1, 1.5, 1, 3]));

// ---------------- rolls + minigames
add(H1("13. Rolls and mini games"),
  T("The roll after every 2 main choices (0–100)", ["Your last 2 picks", "Roll", "Result"], [
    ["Both RISKY/WORST", "0–60", "HARD mini game"],
    ["Both RISKY/WORST", "61–100", "Detour scene (a NORMAL mini game if no detour fits the day)"],
    ["One risky, one safe", "0–50", "NORMAL mini game"],
    ["One risky, one safe", "51–100", "EASY mini game"],
    ["Both BEST/OKAY", "0–50", "EASY mini game"],
    ["Both BEST/OKAY", "51–100", "EASY mini game with double reward"],
  ], [2, 1, 3]),
  T("Mini game rewards", ["Tier", "Win", "Lose"], [
    ["HARD", "+5 health (you escaped)", "−20 to −30 health"],
    ["NORMAL", "+15 of the game's reward type", "−10 to −15 health"],
    ["EASY", "+25 of the reward type (×2 on the double roll)", "Nothing lost"],
    ["Simulations only", "Win chances 35% hard, 60% normal, 85% easy", "Used by Monte Carlo instead of live play"],
  ], [1, 2.5, 2.5]),
  T("The 8 mini games", ["Mini game", "Reward type", "How to play", "Difficulty settings (HARD / NORMAL / EASY)"], [
    ["Lock the Door", "Health", "Press SPACE or tap LOCK when the marker is in the green zone. 3 rounds; lock it twice to win.", "Green zone 3 / 5 / 9 wide; marker speed 44 / 30 / 20"],
    ["Escape the Horde", "Health", "Move with the arrow keys, WASD or the pad through a parking lot of wrecks; reach the exit before the infected catch you.", "5 / 3 / 2 zombies; zombie speed 0.33 / 0.5 / 0.8 s per step; 25 / 30 / 40 s"],
    ["Dodge the Wrecks", "Water (+5 per bottle grabbed)", "Switch lanes left/right to dodge wrecks and infected on a night highway.", "Speed 0.09 / 0.14 / 0.2 s per step; 20 / 16 / 12 s; 1 / 2 / 3 lives"],
    ["Barricade the Door", "Health", "Type each falling word before it hits the door. Nail 6 to win.", "Fall speed 0.55 / 0.8 / 1.15 s; 0 / 1 / 2 misses allowed"],
    ["Safe or Unsafe?", "Food and water", "Press S or U: is each item on the conveyor safe to eat or drink? Get 4 of 5.", "Conveyor speed 13 / 8 / 5"],
    ["Count the Infected", "Food", "Count only the red Z's (not the green survivors) as the crowd passes. 2 rounds, within 2 each time.", "Crowd speed 26 / 17 / 10"],
    ["Crack the Supply Locker", "Food", "Guess the code from 1 to 20; each guess says HIGHER or LOWER.", "4 / 5 / 6 guesses; 15 / 25 / 45 s"],
    ["Decode the Radio", "Water", "Unscramble each word of a rescue broadcast through static.", "8 / 12 / 20 s; static 35% / 20% / 10%"],
  ], [1.2, 1, 2.8, 2]),
  P("No mini game repeats within a playthrough. The game is chosen at random from the ones not yet played."));

// ---------------- callbacks / detours / fallbacks
add(H1("14. Callbacks, detours and fallback scenes"),
  T("Callbacks (a later scene caused by an earlier choice)", ["Route", "Scene ID", "Title", "Triggered by flag", "Appears after (main scenes)"], D.cb, [0.6, 1, 2, 1.4, 1.2]),
  P("Other flags: SPARE_TIRE (SLC Day 4), SNOWMOBILE (JAC Day 2; unlocks options on Days 4, 6 and 7), MED_SUPPLIES (SLC; needed by one callback option). Options that need a flag you don't have show an alternative option instead."),
  T("Detours (extra scenes on a risky roll)", ["Route", "Scene ID", "Title", "Type", "Can appear"], D.det, [0.6, 1, 2.4, 0.8, 1]),
  T("Fallback scenes (when travel and the story collide)", ["Scene", "When", "Options"], [
    ["Running on Fumes (FB-FUEL)", "The tank is empty", "A: siphon from stalled cars (+6 gal, 2 h). B: walk to the next exit (+10 gal, 6 h, riskier). C: flag down a car and trade food (+5 gal, −10 food, high exposure). D: wait for a patrol (12 h, nothing gained)."],
    ["On Foot (FB-CAR)", "No vehicle", "A: search the motel lot for a car with keys. B: hitch a ride with a convoy (high exposure). C: hotwire one at the dealership (contact exposure). D: start walking (6 h, 18 miles)."],
    ["Limit", "3 fallback scenes on one leg", "Then STRANDED"],
  ], [1.3, 1.2, 4.5]));

// ---------------- endings + end screen
add(H1("15. Endings and the end screen"),
  T("Endings", ["Ending", "Screen title", "Condition"], [
    ["VICTORY", "You survived", "Alive, not turned (or cured), physically at the safe zone's last road mile, before Day 7 midnight"],
    ["DIED", "You didn't make it", "Health reached 0"],
    ["TURNED", "You turned", "Untreated infection reached 36 hours, or the cure at the gate failed"],
    ["TOO_LATE", "Too late", "The clock passed Day 7 midnight"],
    ["STRANDED", "Stranded", "Out of fuel or vehicle after 3 fallback scenes, or not at the safe zone when the story ended"],
    ["DENIED", "Turned away", "The final option's note says the gate turned you away"],
  ], [1, 1.2, 4]),
  T("End screen", ["Element", "What it shows"], [
    ["Ending title and reason", "Which ending and why (for example 'injury (NYC-07M)')"],
    ["Stat boxes", "Health, food, water, fuel, miles left, days used"],
    ["Summary line", "Seed, how many BEST/OKAY/RISKY/WORST picks, injuries, infected yes/no, mini games won"],
    ["Whole-trip ledger", "Gains, losses and net for health, food, water and fuel, plus health by cause"],
    ["Trip timeline chart", "Health, food, water and fuel over time; dots for infection and the ending; dashed deadline line"],
    ["Monte Carlo", "500 simulated trips on this route for each strategy, including 'Your style' (picks ratings as often as you did); table and stacked bar chart of endings"],
    ["Play again", "Back to the menu"],
  ], [1.3, 4.7]));

// ---------------- monte carlo
const R = D.mc.results, POL = { balanced: "Balanced (player stand-in)", lowest_risk: "Lowest risk", supplies: "Max supplies", speed: "Max speed", random: "Random", best_rating: "Always BEST (oracle)" };
add(H1("16. Monte Carlo simulation"),
  P(`${D.mc.runs_per_route} simulated trips per route per strategy (seeds 1–${D.mc.runs_per_route}). Every strategy uses the same seeds, so each kind of random event draws the same random numbers for every strategy (matched streams). These are probabilities inside the game's model, not real-world survival odds.`),
  T("Strategies (computer players)", ["Strategy", "How it chooses"], [
    ["Balanced (player stand-in)", "Weighs expected injury, infection, time and supplies; cares more about health when hurt, about time when behind schedule, about food/water/fuel when low"],
    ["Lowest risk", "Lowest expected injury damage + 60 × infection chance"],
    ["Max supplies", "Most food, water, healing and fuel, weighted toward whatever is scarce"],
    ["Max speed", "Fewest hours (counts shortcuts and extra miles)"],
    ["Random", "Any option, equally likely"],
    ["Always BEST (oracle)", "Always the BEST-rated option (a real player can't see ratings)"],
    ["Your style (web end screen)", "Picks each rating as often as you did in your game"],
    ["All strategies", "Avoid fallback options that don't fix an empty tank or a missing car"],
  ], [1.5, 4.5]),
  T("Results, all 7 routes", ["Strategy", "Survive", "Died", "Turned", "Too late", "Stranded", "Denied", "Avg days", "Health (survivors)", "Infected at least once"],
    Object.entries(POL).map(([k, n]) => { const r = R[k].ALL, e = r.endings; return [n, pct(r.survival_rate), pct(e.DIED), pct(e.TURNED), pct(e.TOO_LATE), pct(e.STRANDED), pct(e.DENIED), r.avg_days.toFixed(2), Math.round(r.avg_health_survivors), pct(r.infection_rate)]; }),
    [1.8, 0.7, 0.6, 0.6, 0.6, 0.7, 0.6, 0.6, 0.8, 0.9]),
  T("Survival by route", ["Strategy", "NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"],
    Object.entries(POL).map(([k, n]) => [n, ...["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"].map((c) => pct(R[k][c].survival_rate, 0))]),
    [2, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6, 0.6]),
  T("What the results show", ["Finding", "Why"], [
    ["Careful play survives about 4 in 5 trips", "Low-risk options avoid most injuries; infection is the main remaining danger"],
    ["Speed-first survives less (about 69%)", "Fast options are usually riskier; more injuries and more infection"],
    ["Random play survives about 11%", "Half its picks are RISKY or WORST; most random runs die of injuries"],
    ["Jackson (JAC) and Austin (AUS) routes are hardest for careful players", "Both end in northeastern counties late in the outbreak, when infection is highest; balanced survival is about 68% on each"],
    ["TOO LATE and STRANDED are rare for careful players", "Town fuel plus story fuel usually covers the trip; time costs matter mostly for random and risky play"],
  ], [2.5, 3.5]));

// ---------------- technical
add(H1("17. Technical pieces"),
  T("Random-number streams (seeded Mulberry32, identical in Python and JavaScript)", ["Stream", "Used for"], [
    ["outbreak", "This playthrough's outbreak strength (×0.9–1.1)"], ["injury", "Injury rolls"], ["infection", "Infection rolls"],
    ["road", "Road accident rolls"], ["town_fuel", "Fuel found in towns"], ["treat", "Cure rolls"], ["roll", "The roll every 2 choices"],
    ["minigame_pick / _win / _dmg", "Which mini game, simulated win, damage on a loss"], ["policy", "Random and 'your style' strategies"], ["timeout", "Option picked when the timer runs out"],
  ], [1.5, 4.5]),
  T("Automated tests (62, all passing)", ["Test file", "What it checks"], [
    ["test_data.py", "Data loads; density equals population ÷ land area; road miles match OSRM; missing snow stays missing; bad, missing or mismatched values are rejected with a clear message"],
    ["test_seir.py", "Cold multiplier never negative (−60°F to 80°F); compartments never negative and always sum to 1; stable with smaller steps; R0 and effective R; counties independent; sensitivity goes the right direction"],
    ["test_game.py", "All 140 scenes and 8 mini games kept; every option has attributes; injury and infection formulas; resources clamped; no driving without fuel; fuel use matches mpg; every route ends validly; no win without arriving; late arrival isn't a win; untreated infection turns; medicine cures; story time costs applied; same seed = same game"],
    ["test_montecarlo.py", "Results reproducible; careful play beats random"],
    ["test_parity.py", "210 games played in both Python and the browser code give identical choices, endings and numbers"],
    ["test_server.py", "Server serves the game, /health and the Monte Carlo API; rejects bad requests"],
    ["browser_playthrough.py", "Plays all 7 routes in a headless browser with no page errors"],
  ], [1.3, 4.7]),
  T("Project files", ["File / folder", "What it is"], [
    ["data/", "Census, NOAA and OSRM data files and data_sources.md"],
    ["content/", "Scenario text (scenarios.json), fallback scenes, option attributes"],
    ["zombie_sim/params.py", "Every fictional number in one place"],
    ["zombie_sim/data_loader.py", "Reads and checks the data; calculates density and miles"],
    ["zombie_sim/seir.py", "Outbreak model, R0, effective R, sensitivity"],
    ["zombie_sim/engine.py", "Game rules: clock, travel, fuel, risks, rolls, endings, ledger"],
    ["zombie_sim/policies.py, sim.py", "Computer strategies and Monte Carlo"],
    ["play.py, minigames.py", "Console game and its live mini games"],
    ["server.py", "Web server for hosting (no domain needed)"],
    ["web/", "Browser game: index.html, sim.js (rules), game.js (screens and mini games), data.js (generated)"],
    ["tools/", "Rebuild option attributes, rebuild the web data, run the survival report"],
    ["tests/, docs/, reports/", "Tests; audit, math, architecture and presentation notes; survival report and charts"],
  ], [1.8, 4.2]),
  T("How to run and host", ["Goal", "Command or step"], [
    ["Play in a browser, no setup", "Double-click zombie_escape_full_game.html"],
    ["Play from the server", "python server.py, then open http://localhost:8000"],
    ["Let others on your network play", "python server.py --host 0.0.0.0, then share http://<your IP>:8000"],
    ["Console version", "python play.py (add --debug to see every calculation)"],
    ["Run the tests", "python tools/build_web.py, then python -m pytest -q tests"],
    ["Rebuild the survival report", "python tools/monte_carlo_report.py --runs 1000"],
  ], [2, 4]));

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 32, bold: true, color: "1F2F3D" }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 25, bold: true, color: "C25E00" }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Zombie Escape game breakdown · page ", size: 16, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" })] })] }) },
    children: kids,
  }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync("Zombie_Escape_Game_Breakdown.docx", b); console.log("tables:", tno); });
