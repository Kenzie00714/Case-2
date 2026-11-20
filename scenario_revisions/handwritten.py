"""Hand-written scenario updates: flags and payoffs, conditional options, final gates, shared data scenes."""

# (scene, option letter, new flag, what the player gets) -> payoff (scene, flag, option text, rating, effects, why)
FLAGS = {
 "NYC": [
  ("NYC-01N", "A", "NJ_CONTACTS", "The lobby group writes your name on their survivor list and radios it ahead to the western safe zones.",
   "NYC-07N", "Give the guards your name from the Fort Lee survivor list", "BEST", "0.5 h; skips the line; still screened",
   "They have the list. You're moved to the front of screening and out of the wind."),
  ("NYC-02N", "A", "HUNTER_MAP", "The cabin owner draws you a map of Wyoming ranch roads and private fuel tanks.",
   "NYC-07M", "Follow the hunter's map to a ranch's private fuel tank", "BEST", "2 h; +12 gal fuel; low exposure",
   "The map is right: a farm tank miles from the frozen crowd in town."),
 ],
 "BOS": [
  ("BOS-01N", "D", "DORM_ROSTER", "The dorm adds you to its skills roster as their supply runner and stamps it.",
   "BOS-07N", "Show the dorm's stamped skills roster", "BEST", "0.5 h; counts as a proven skill",
   "Paper proof of a useful skill. The interviewer waves you through to screening."),
  ("BOS-02N", "D", "ARMY_RADIO", "The Humvee's radio is still tuned to the National Guard channel.",
   "BOS-05M", "Radio the Guard engineers on the Humvee channel and cross with their convoy", "BEST", "2 h; escorted; low exposure",
   "The engineers are laying a temporary span. You cross behind their trucks."),
 ],
 "PIT": [
  ("PIT-01M", "D", "TOWER_RADIO", "From the 42nd floor you copy down the emergency radio frequencies.",
   "PIT-07N", "Call the gate on the emergency frequency and ask for an escort", "BEST", "1 h; armored escort; low exposure",
   "The gate answers and sends a truck to lead you in by the service road."),
  ("PIT-02M", "B", "RACE_FUEL", "You carry two cans of high-octane race fuel.",
   "PIT-06M", "Pour in the race fuel cans and go before the rest stop crowd notices", "BEST", "0.5 h; +10 gal fuel",
   "The cans you filled in Indianapolis cover the 106 empty miles."),
 ],
 "SLC": [
  ("SLC-01N", "C", "SKI_RADIO", "The snowcat has a ski-patrol radio that reaches state police.",
   "SLC-06M", "Call the trooper on the ski-patrol radio before getting close", "BEST", "0.5 h; no contact",
   "He answers. He's fine, the road ahead is clear, and he warns you about a raider spike strip."),
  ("SLC-02N", "C", "GYM_LETTER", "The Laramie gym leader writes you a letter vouching for your guard shifts.",
   "SLC-07N", "Hand the guards the letter from the Laramie gym leader", "BEST", "quarantine shortened to 12 h",
   "A trusted camp vouches for you. You still quarantine, but half as long."),
 ],
 "JAC": [
  ("JAC-01M", "C", "SHERIFF_LETTER", "The sheriff signs a letter naming you a county volunteer.",
   "JAC-03N", "Show the sheriff's letter; emergency volunteers cross first", "BEST", "1 h; crosses tonight",
   "The soldiers honor it. You cross ahead of the line before the bridge closes."),
  ("JAC-01N", "A", "RANGER_PHONE", "A refuge ranger gives you a satellite phone number for the East Coast evacuation office.",
   "JAC-07N", "Call the evacuation office on the ranger's satellite number", "BEST", "1 h; a second boat is sent",
   "The office sends a second boat. The nurse and you both get across."),
 ],
 "SEA": [
  ("SEA-02M", "D", "WINTER_GEAR", "You're wearing a real parka, boots and gloves.",
   "SEA-05M", "Bundle up and scrape the windshield from outside", "BEST", "1 h; no frostbite risk",
   "With real gear, ten minutes outside at -25°F is safe, and the glass stays whole."),
  ("SEA-03N", "C", "FUEL_VOUCHER", "The refinery foreman gives you a fuel voucher for the Cincinnati depot.",
   "SEA-07N", "Show the guards the foreman's fuel voucher", "BEST", "0.5 h; both of you screened kindly",
   "You arrive with a fuel contact the city needs. The guards are calmer and the check is gentle."),
 ],
 "AUS": [
  ("AUS-02M", "B", "BARGE_CREW", "The barge captain's cousin runs a ferry on the Maine coast.",
   "AUS-07M", "Radio the captain's cousin and take the ferry up the coast", "BEST", "4 h; skips the Turnpike",
   "The ferry runs inside the islands, out of the worst wind."),
  ("AUS-04N", "D", "CIDER_JUGS", "The farmer sends you off with cider jugs and a crate of apples.",
   "AUS-07N", "Offer the farmer's cider and apples to the base kitchen", "BEST", "0.5 h; counts as something useful",
   "Fresh food in a winter siege. The guard waves you in."),
 ],
}

# conditional options: shown only when the player's state matches
COND = {
 "NYC": [("NYC-06M", "Low fuel (under 5 gal)", "Trade food for gasoline from the rail yard's drums", "OKAY", "1 h; -15 food; +10 gal fuel", "The rail worker needs food more than gas."),
         ("NYC-05M", "Infected (symptoms showing)", "Tell the soldiers you've been bitten and ask for their medic", "BEST", "6 h; treatment 90% (fictional); turned away from the bridge until cleared", "Honesty gets you treatment before the point of no return."),
         ("NYC-03N", "Behind schedule (over 12 h)", "Drive the whiteout in a snowplow's fresh tracks", "RISKY", "saves 3 h of driving; injury risk 40%", "Fast, but one slide off the tracks and you're in a ditch.")],
 "BOS": [("BOS-06M", "Low fuel (under 5 gal)", "Volunteer an hour at the checkpoint for emergency fuel", "OKAY", "2 h; +8 gal fuel", "The tribal police trade fuel for help unloading the water truck."),
         ("BOS-06M", "Infected (symptoms showing)", "Ask the medical tent to check a bite you've been hiding", "BEST", "6 h; treatment 90% (fictional)", "They have the medicine and the training."),
         ("BOS-06N", "Behind schedule (over 12 h)", "Drive on through the blizzard behind a sand truck", "RISKY", "saves 4 h; injury risk 45%", "The sand truck helps, until it turns off.")],
 "PIT": [("PIT-04M", "Low fuel (under 5 gal)", "Hand-pump the station's underground tank", "RISKY", "3 h; +15 gal fuel; medium exposure", "Slow work at a dark station, but the tank is nearly full."),
         ("PIT-04N", "Infected (symptoms showing)", "Go to the stadium's medical tent and admit the bite", "BEST", "6 h; treatment 90% (fictional); high-exposure area", "The crowd is risky, but the medics are real."),
         ("PIT-02N", "Behind schedule (over 12 h)", "Skip the camp and drive through the night to Kansas", "RISKY", "saves 6 h; night driving", "You make up time on empty interstate, tired and alone.")],
 "SLC": [("SLC-03N", "Low fuel (under 5 gal)", "Siphon cars in the motel lot", "OKAY", "1.5 h; +6 gal fuel; medium exposure", "A few gallons from each car adds up."),
         ("SLC-04N", "Infected (symptoms showing)", "Admit the bite at the checkpoint and ask the army medics for treatment", "BEST", "6 h; treatment 90% (fictional)", "Soldiers screen for bites because they can treat early ones."),
         ("SLC-06M", "Behind schedule (over 12 h)", "Turn onto the unplowed back road around the police car", "RISKY", "saves 3 h; injury risk 45%", "Faster, but deep snow and no help if you slide.")],
 "JAC": [("JAC-06N", "Low fuel (under 5 gal)", "Fill up from the fuel trucks outside the stadium", "RISKY", "1 h; +12 gal fuel; high exposure", "The fuel is there because the crowd is there."),
         ("JAC-03N", "Infected (symptoms showing)", "Tell the soldiers you were bitten and ask for their medic", "BEST", "6 h; treatment 90% (fictional); cross in the morning", "They treat you, but you miss tonight's crossing."),
         ("JAC-04M", "Behind schedule (over 12 h)", "Follow a snowplow convoy through the blizzard", "RISKY", "saves 4 h; injury risk 40%", "The plows keep a lane open, at plow speed.")],
 "SEA": [("SEA-04N", "Low fuel (under 5 gal)", "Siphon the store's delivery truck with the family's permission", "OKAY", "1.5 h; +8 gal fuel", "Asking first turns a theft into a trade."),
         ("SEA-06N", "Infected (symptoms showing)", "Ask the soldiers' medic to treat a bite", "BEST", "6 h; treatment 90% (fictional)", "The Guard has medicine, and you're still before onset."),
         ("SEA-05N", "Behind schedule (over 12 h)", "Skip the water park and drive straight through Wisconsin tonight", "RISKY", "saves 5 h; night driving at sub-zero", "You gain half a day if nothing goes wrong.")],
 "AUS": [("AUS-06N", "Low fuel (under 5 gal)", "Help the sailors load supplies for a can of fuel", "OKAY", "3 h; +10 gal fuel", "Hard work, fair pay."),
         ("AUS-05N", "Infected (symptoms showing)", "Show the ski patrol medic your bite and ask for help", "BEST", "6 h; treatment 90% (fictional)", "Ski patrol medics carry a real trauma kit and radio a doctor."),
         ("AUS-04N", "Behind schedule (over 12 h)", "Skip the barn and drive the valley overnight", "RISKY", "saves 6 h; icy night roads", "Time gained, rest lost.")],
}

# general conditional rules (all routes)
COND_RULES = [
 ("Low health (under 40)", "Any Night scene with a shelter option", "Rest the whole night before moving on", "OKAY", "10 h; +15 health", "Sleep heals, but costs time you may not have."),
 ("Carrying medicine and infected", "Automatic, when symptoms appear", "Use the medicine", "—", "90% cure (fictional)", "Same rule as before; now also offered as a choice so you can save it."),
]

# rewritten final gates: options (letter, text, rating, looks, effects, why). No single instant loss.
GATES = {
 "NYC-07N": [
  ("A", "Try to keep a hidden knife", "RISKY", "", "found: held 6 h for questioning; no injury", "The guards find it, take it, and make you wait. Costly, not fatal."),
  ("B", "Wait outside until morning when things calm down", "OKAY", "", "10 h in the cold; -10 health; still enter if before the deadline", "Calmer in daylight, but a long freezing night."),
  ("C", "Cooperate fully and step away from the stranger", "BEST", "", "1 h; screened and admitted", "Fast, safe, and honest."),
  ("D", "Demand the guards let the stranger in without a check", "WORST", "trap", "held overnight: 12 h; -10 health", "Looks brave, but it marks you as a risk. You're held until morning."),
 ],
 "BOS-07N": [
  ("A", "Lie and say you're a doctor", "WORST", "trap", "caught by one question: back of the line, 8 h", "They ask you to name a medicine dose. You can't."),
  ("B", "Refuse to give up your vehicle", "RISKY", "", "2 h of arguing; vehicle impounded anyway", "You get in, minus the car and two hours."),
  ("C", "Tell them your real skills", "BEST", "", "1 h; admitted", "Honest skills are what they need."),
  ("D", "Offer your supplies", "OKAY", "", "1 h; -15 food, -15 water", "Accepted, but you arrive with nothing."),
 ],
 "PIT-07N": [
  ("A", "Drive down the Strip to the safe zone", "WORST", "trap", "cornered by crowds: -15 health, 4 h detour", "The lights draw every infected in the city."),
  ("B", "Wait until morning", "OKAY", "", "10 h; enter if before the deadline", "Safe but slow."),
  ("C", "Signal the gate with your headlights", "RISKY", "", "2 h; injury risk 30%", "The gate sees you, and so do the infected."),
  ("D", "Take the back road the radio described", "BEST", "", "1 h; admitted", "Quiet and planned."),
 ],
 "SLC-07N": [
  ("A", "Accept the quarantine", "BEST", "", "24 h quarantine counts as arrival; admitted after", "Arriving before the deadline is what counts."),
  ("B", "Wait on the dock until the guards change shifts", "OKAY", "", "8 h in the cold, then quarantine", "The new shift has the same rules."),
  ("C", "Refuse quarantine and demand entry", "WORST", "", "held at gunpoint: -10 health, quarantined anyway", "You go in either way, just hurt."),
  ("D", "Argue that you've traveled 2,230 road miles", "RISKY", "", "2 h; then quarantine", "True, but every arrival has a story."),
 ],
 "JAC-07N": [
  ("A", "Fight the nurse for the seat", "WORST", "", "pulled off the dock: -15 health, morning boat (10 h)", "The crew sides with the nurse."),
  ("B", "Suggest you both squeeze in and leave your heavy gear behind", "BEST", "", "lose your gear; both cross now", "Gear is replaceable. You both make it."),
  ("C", "Offer the captain fuel to make an extra trip", "RISKY", "", "needs 5+ gal: -5 gal, both cross; otherwise morning boat (10 h)", "Works only if you still have fuel to give."),
  ("D", "Give the nurse your seat and wait for a morning boat", "OKAY", "hidden_gem", "10 h; the nurse vouches for you at the fort", "Generous, slow, and remembered."),
 ],
 "SEA-07N": [
  ("A", "Calmly unwrap it together and explain how it happened", "BEST", "", "1 h; both screened", "Honesty and calm keep things from escalating."),
  ("B", "Offer the guard your supplies to skip the check", "RISKY", "trap", "-15 food; checked anyway", "The guard takes the food and checks the hand anyway."),
  ("C", "Let the guard handle it and step back", "OKAY", "", "you enter; your companion goes to quarantine", "Safe for you, hard on your companion."),
  ("D", "Grab your companion and run for another entrance", "WORST", "", "chased: -20 health; other gate 4 h later", "You still get in, just hurt and late."),
 ],
 "AUS-07N": [
  ("A", "Hand over your food", "OKAY", "", "-20 food; admitted", "Useful enough."),
  ("B", "Sneak in through a gap in the fence", "WORST", "trap", "caught: held overnight, 10 h", "Fences are watched. You lose the night."),
  ("C", "Argue that you've traveled too far to be turned away", "RISKY", "", "3 h; sent to the screening line", "They've heard it all day."),
  ("D", "Offer your chains, gear and road reports from the whole trip", "BEST", "", "1 h; admitted", "Road reports from 2,300 road miles of travel are exactly what they need."),
 ],
}
GATE_CHECK = ("Every final gate now runs a screening check before admission. Not infected: admitted. Infected but not turned: "
              "quarantine with treatment (90%, fictional). The clock still matters: if a time penalty pushes arrival past "
              "Day 7 midnight, the ending is TOO LATE. No single choice at the gate ends the game by itself anymore.")

# shared scenes built on the new data (placement decided by the downloaded data)
SHARED = [
 {"id": "EV-SVI", "title": "Gridlock on the Evacuation Route", "data": "CDC/ATSDR SVI 2022 (svi_data.csv)",
  "trigger": "Plays at the first stop on the route whose county SVI overall score is 0.75 or higher (one of the most vulnerable quarter of U.S. counties). Not played if no stop qualifies.",
  "effect": "Extra delay on every option = 2 + 6 x SVI hours (fictional rule). SVI changes only time, never infection or survival odds.",
  "text": "Every road out of town is locked bumper to bumper. Many families here have no car of their own, and people are walking between the lanes with everything they own. A Guard soldier is trying to direct traffic alone.",
  "options": [
   ("A", "Wait in the jam with your doors locked", "OKAY", "", "full SVI delay; low exposure in the car", "Slow, but you stay inside."),
   ("B", "Cut through the neighborhoods on side streets", "RISKY", "", "half the SVI delay; medium exposure; injury 35%", "Faster, but you're driving through crowds on foot."),
   ("C", "Help the soldier direct traffic for an hour", "BEST", "hidden_gem", "1 h, then the Guard waves you down the emergency lane; sets GUARD_THANKS", "Looks like a waste of time, but it gets you the empty lane."),
   ("D", "Drive on the shoulder past everyone", "WORST", "trap", "injury 65%; damage 25", "The shoulder is full of people and stalled cars."),
  ]},
 {"id": "EV-AGE", "title": "The Nursing Home Bus", "data": "Census ACS 2019-2023 age structure (age_data.csv)",
  "trigger": "Plays at the first stop whose county has 20% or more residents aged 65+. The share is shown on screen. In the outbreak model, an older county spreads a little faster (fictional rule, labeled).",
  "effect": "Text names the real 65+ share; options use the normal risk rules.",
  "text": "Staff at a nursing home are wheeling residents into the parking lot. Their bus is running, but the driver never showed. A nurse sees your car keys and runs toward you.",
  "options": [
   ("A", "Drive their bus to the shelter across town", "BEST", "", "4 h; +20 food, +20 water from the staff; sets NURSE_FRIEND", "Slow, but the staff repay you and a nurse remembers you."),
   ("B", "Help load the residents, then leave on your own", "OKAY", "", "2 h; +10 water", "You help, without losing half a day."),
   ("C", "Take medicine from the unattended pharmacy cart", "RISKY", "", "1 h; gain medicine (MED_KIT); injury 30%", "The medicine is real. So are the staff watching you take it."),
   ("D", "Drive past while they're distracted", "WORST", "trap", "the panicked crowd surges into the road: injury 60%", "Looks like the fast choice; the lot spills into the street."),
  ]},
 {"id": "EV-RABIES", "title": "The Treatment Window", "data": "CDC rabies timing (rabies_reference.csv)",
  "trigger": "Plays once if the player is infected, symptoms have NOT started, and the player has no medicine. Based on the real rule that rabies treatment works only if it starts before symptoms.",
  "effect": "Real fact used: real rabies treatment is a series of shots on days 0, 3, 7 and 14 and must start before symptoms. The game compresses this to hours (fictional).",
  "text": "A field clinic's radio says it can treat recent bites, but only before the fever starts. You're not sure about the scratch on your arm. The clinic is 20 miles back the way you came.",
  "options": [
   ("A", "Drive back and start treatment now", "BEST", "", "40 miles + 6 h; treatment 90% (fictional)", "The real lesson from rabies: start before symptoms, no matter the cost."),
   ("B", "Ask the clinic to radio instructions and keep going", "OKAY", "", "1 h; no treatment, but you learn the symptom timeline", "You'll know when it's too late, which is little comfort."),
   ("C", "Look for medicine at the next town instead", "RISKY", "", "medicine found 50% (fictional) if you reach a town before onset", "Maybe. Onset doesn't wait."),
   ("D", "It's probably just a scratch. Keep driving", "WORST", "trap", "no treatment", "Looks like it saves time. If it was a bite, this was the last chance."),
  ]},
 {"id": "EV-R0", "title": "The Radio Doctor", "data": "Published R0 values (r0_reference.csv) + the game's calculated R0",
  "trigger": "Plays on Day 3 Night on every route.",
  "effect": "Text compares the local zombie R0 (calculated) with measles (12-18), seasonal flu (about 1.28), 1918 flu (about 1.80) and COVID-19 (about 2.79).",
  "text": "A doctor on the emergency channel explains the numbers: each infected person here infects about [local R0] others. Measles, the most contagious disease we know, is 12 to 18. Seasonal flu is about 1.3. Her advice: stay out of crowded indoor spaces.",
  "options": [
   ("A", "Avoid all crowded indoor spaces from now on", "BEST", "", "sets CROWD_SMART: 'high' exposure options count as 'medium' for the rest of the trip", "Turning the numbers into a rule."),
   ("B", "Write down her symptom checklist", "OKAY", "", "symptoms show 6 h earlier for the rest of the trip", "Earlier warning, more time to treat."),
   ("C", "Drive to her field hospital to volunteer", "RISKY", "", "4 h; high exposure; +20 food, +20 water", "Good deed, real risk."),
   ("D", "Head for the biggest shelter you can find: safety in numbers", "WORST", "trap", "next shelter option counts as 'contact' exposure", "Exactly what the doctor warned against."),
  ]},
 {"id": "EV-FUEL", "title": "The Last Working Pump", "data": "Game fuel rules (25 mpg, 25-gal tank); later OpenStreetMap fuel stations",
  "trigger": "Plays at a Morning stop when fuel is under 8 gallons.",
  "effect": "A real fuel decision with four different trade-offs.",
  "text": "One station in town still has power. The line is forty cars long, and two men at the front are arguing with the attendant.",
  "options": [
   ("A", "Wait in line", "OKAY", "", "3 h; +15 gal fuel", "Slow and safe."),
   ("B", "Siphon from the cars abandoned in the line", "RISKY", "", "1 h; +8 gal; medium exposure", "Faster, out in the open."),
   ("C", "Trade food for a full can from someone near the front", "BEST", "", "0.5 h; -15 food; +10 gal", "Spend the supply you have plenty of."),
   ("D", "Cut to the front of the line", "WORST", "trap", "injury 70%; damage 25; no fuel", "Looks fastest. The line turns on you."),
  ]},
]
