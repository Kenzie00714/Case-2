// Runs the JavaScript engine for a list of (city, seed, policy) and prints JSON results.
const fs = require("fs"), path = require("path");
const Z = require(path.join(__dirname, "..", "web", "sim.js"));
const B = JSON.parse(fs.readFileSync(path.join(__dirname, "bundle.json"), "utf8"));
const cases = JSON.parse(process.argv[2]);
(async () => {
  const out = [];
  for (const [city, seed, pol] of cases) {
    const g = await Z.playOne(B, city, seed, Z.POLICIES[pol]);
    const s = g.summary();
    out.push({ history: g.history, ending: s.ending, hours: s.hours, health: s.health, food: s.food, water: s.water,
      fuel: s.fuel, miles: s.miles, minigames: s.minigames, strength: s.strength, events: s.events,
      traj: g.traj.map((t) => t.at(9.3)) });
  }
  console.log(JSON.stringify(out));
})();
