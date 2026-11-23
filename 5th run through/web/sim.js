// Zombie Escape simulation: JavaScript port of the Python package zombie_sim/.
// Same random-number generator, SEIR solver, risk formulas, travel and game rules.
// tests/test_parity.py runs both versions with the same seeds and checks they agree.
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- rng.py
  function imul(a, b) { return Math.imul(a, b) >>> 0; }
  function fnv1a(text) {
    const bytes = new TextEncoder().encode(text);
    let h = 0x811c9dc5;
    for (const ch of bytes) { h = (h ^ ch) >>> 0; h = imul(h, 0x01000193); }
    return h >>> 0;
  }
  class Mulberry32 {
    constructor(seed) { this.state = seed >>> 0; }
    random() {
      this.state = (this.state + 0x6d2b79f5) >>> 0;
      let t = this.state;
      t = imul(t ^ (t >>> 15), t | 1);
      t = (t ^ ((t + imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    uniform(a, b) { return a + (b - a) * this.random(); }
  }
  class Streams {
    constructor(seed) { this.seed = seed; this.s = {}; }
    get(name) {
      if (!this.s[name]) this.s[name] = new Mulberry32(fnv1a(`${this.seed}:${name}`));
      return this.s[name];
    }
  }

  // ---------------------------------------------------------------- seir.py
  function densityMultiplier(density, p) {
    const m = 1 + p.density_slope * Math.log10(Math.max(density, 1e-9) / p.density_ref);
    return Math.min(p.density_mult_max, Math.max(p.density_mult_min, m));
  }
  function coldMultiplier(t, p) {
    const crowd = 1 + p.cold_slope * Math.max(0, p.cold_ref_f - t);
    let stiff = 1;
    if (t < p.stiff_threshold_f) stiff = Math.max(p.stiff_floor, 1 - p.stiff_slope * (p.stiff_threshold_f - t));
    return crowd * stiff;
  }
  function ageMultiplier(pct65, ref, p) {
    if (pct65 == null) return 1;
    return Math.min(p.age_mult_max, Math.max(p.age_mult_min, 1 + p.age_slope * (pct65 - ref)));
  }
  const betaAt = (b, t, p) => b * (1 + p.winter_ramp_per_day * t);
  function deriv(S, E, I, beta, sg, gm) { const inf = beta * S * I; return [-inf, inf - sg * E, sg * E - gm * I, gm * I]; }

  class Trajectory {
    constructor(density, tempF, strength, p, ageMult, i0in) {
      this.p = p;
      this.dm = densityMultiplier(density, p);
      this.cm = coldMultiplier(tempF, p);
      this.am = ageMult == null ? 1 : ageMult;
      this.baseBeta = p.beta_base * this.dm * this.cm * this.am * (strength == null ? 1 : strength);
      this.sigma = 1 / p.incubation_days; this.gamma = p.gamma; this.dt = p.seir_dt_days;
      const n = Math.round(p.seir_horizon_days / this.dt);
      const i0 = i0in == null ? p.initial_prevalence : i0in;
      this.i0 = i0;
      let S = 1 - i0, E = 0, I = i0, R = 0;
      this.points = [[S, E, I, R]];
      const dt = this.dt, sg = this.sigma, gm = this.gamma;
      for (let k = 0; k < n; k++) {
        const t = k * dt;
        const b1 = betaAt(this.baseBeta, t, p), b2 = betaAt(this.baseBeta, t + dt / 2, p), b3 = betaAt(this.baseBeta, t + dt, p);
        const k1 = deriv(S, E, I, b1, sg, gm);
        const k2 = deriv(S + dt / 2 * k1[0], E + dt / 2 * k1[1], I + dt / 2 * k1[2], b2, sg, gm);
        const k3 = deriv(S + dt / 2 * k2[0], E + dt / 2 * k2[1], I + dt / 2 * k2[2], b2, sg, gm);
        const k4 = deriv(S + dt * k3[0], E + dt * k3[1], I + dt * k3[2], b3, sg, gm);
        S = S + dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
        E = E + dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
        I = I + dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
        R = R + dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
        S = Math.max(S, 0); E = Math.max(E, 0); I = Math.max(I, 0); R = Math.max(R, 0);
        const tot = S + E + I + R;
        S /= tot; E /= tot; I /= tot; R /= tot;
        this.points.push([S, E, I, R]);
      }
    }
    at(tDays) {
      const t = Math.min(Math.max(tDays, 0), this.p.seir_horizon_days);
      const x = t / this.dt;
      const i = Math.min(Math.floor(x), this.points.length - 2);
      const f = x - i, a = this.points[i], b = this.points[i + 1];
      return [0, 1, 2, 3].map((j) => a[j] + (b[j] - a[j]) * f);
    }
    r0(t) { return betaAt(this.baseBeta, t, this.p) / this.gamma; }
    rEffective(t) { return this.r0(t) * this.at(t)[0]; }
  }

  // ---------------------------------------------------------------- engine.py
  const RATINGS = ["BEST", "OKAY", "RISKY", "WORST"];
  const ENDINGS = {
    VICTORY: "Reached the safe zone alive, uninfected and before the deadline.",
    DIED: "Health reached 0.",
    TURNED: "The infection reached onset before it was treated.",
    TOO_LATE: "The safe zone closed (Day 7 midnight) before the player arrived.",
    STRANDED: "Ran out of ways to keep moving (no fuel or vehicle after repeated fallback scenes).",
    DENIED: "Reached the safe zone but was turned away at the gate.",
  };
  const EVENT_ORDER = ["rabies", "fuel", "r0", "svi", "age"];
  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const fmtG = (v) => String(Math.round(v * 1e6) / 1e6);
  const signed = (v) => (v >= 0 ? "+" : "") + fmtG(v);
  const optionFlags = (o) => { const out = (o.sets_flags || []).slice(); if (o.sets_flag) out.push(o.sets_flag); return out; };

  class Game {
    constructor(B, code, seed, pOverride) {
      const p = this.p = pOverride || B.params;
      this.B = B;
      this.rng = new Streams(seed); this.seed = seed;
      this.city = B.content.cities.find((c) => c.code === code); this.code = code;
      this.attrs = B.attrs; this.fallbacks = B.fallbacks;
      this.eventsContent = {}; (B.content.events || []).forEach((e) => (this.eventsContent[e.trigger] = e));
      this.rgames = {}; (B.content.realistic_minigames || []).forEach((g) => (this.rgames[g.name] = g));
      this.pool = B.minigame_order.concat((B.content.realistic_minigames || []).map((g) => g.name));
      this.stops = B.world.routes[code]; this.counties = B.world.counties; this.stations = B.world.stations;
      this.svi = B.world.svi || {}; this.ageRef = B.world.age_ref;
      this.totalMi = this.stops[this.stops.length - 1].cum_mi;
      this.strength = this.rng.get("outbreak").uniform(p.outbreak_strength_min, p.outbreak_strength_max);
      this.traj = this.stops.map((s) => new Trajectory(this.counties[s.geoid].density, this.stations[s.station].tavg_f, this.strength, p, this.ageMult(s.geoid), s.i0));
      this.places = [];
      for (let i = 0; i < 14; i++) {
        const d = Math.floor(i / 2) + 1;
        if (i === 13) this.places.push({ a: 7, b: 7, mi: this.stops[7].cum_mi, nominal: (d - 1) * 24 + 12 });
        else if (i % 2 === 0) this.places.push({ a: d - 1, b: d - 1, mi: this.stops[d - 1].cum_mi, nominal: (d - 1) * 24 });
        else this.places.push({ a: d - 1, b: d, mi: (this.stops[d - 1].cum_mi + this.stops[d].cum_mi) / 2, nominal: (d - 1) * 24 + 12 });
      }
      this.place = this.places[0];
      this.hour = 0; this.miles = 0; this.fuel = p.start_fuel_gallons; this.vehicle = true;
      this.health = p.start_health; this.food = p.start_food; this.water = p.start_water;
      this.flags = []; this.infection = null; this.infections = 0; this.injuries = 0; this.savedHours = 0; this.quarantineHours = 0;
      this.pending = []; this.playedCallbacks = []; this.usedBranches = []; this.usedGames = []; this.playedEvents = []; this.recent = [];
      this.history = []; this.ledger = []; this.events = []; this.msgs = [];
      this.ending = null; this.endingDetail = ""; this.sceneIndex = 0;
      this.minigameLog = { HARD: 0, NORMAL: 0, EASY: 0, wins: 0, detours: 0 };
    }

    ageMult(geoid) {
      const d = this.svi[geoid];
      if (!d || this.ageRef == null) return 1;
      return ageMultiplier(d.pct65, this.ageRef, this.p);
    }
    sviHere(place) { const pl = place || this.place, d = this.svi[this.stops[pl.a].geoid]; return d && d.svi != null ? d.svi : null; }
    pct65Here(place) { const pl = place || this.place, d = this.svi[this.stops[pl.a].geoid]; return d ? d.pct65 : null; }

    day() { return Math.floor((this.hour + 8) / 24) + 1; }
    isNight() { const h = (8 + this.hour) % 24; return h >= 20 || h < 6; }
    outbreakDay() { return this.p.outbreak_start_day + this.hour / 24; }
    local(place) {
      const pl = place || this.place, t = this.outbreakDay();
      const a = this.traj[pl.a].at(t);
      if (pl.a === pl.b) return a;
      const b = this.traj[pl.b].at(t);
      return [0, 1, 2, 3].map((j) => (a[j] + b[j]) / 2);
    }
    placeLabel(place) {
      const pl = place || this.place;
      if (pl.a === pl.b) return this.stops[pl.a].label;
      return `Between ${this.stops[pl.a].label} and ${this.stops[pl.b].label}`;
    }
    weather(place) {
      const pl = place || this.place;
      const s1 = this.stations[this.stops[pl.a].station], s2 = this.stations[this.stops[pl.b].station];
      const temp = (s1.tavg_f + s2.tavg_f) / 2;
      const snow = s1.snow_in == null || s2.snow_in == null ? null : (s1.snow_in + s2.snow_in) / 2;
      return [temp, snow];
    }
    hoursBehind() { return this.hour - this.places[this.sceneIndex].nominal; }
    fmtHour(h) {
      const t = 8 + h, d = Math.floor(t / 24) + 1, hh = Math.floor(t % 24), mm = Math.round((t % 1) * 60) % 60;
      return `Day ${d} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    }

    change(source, health = 0, food = 0, water = 0, fuel = 0) {
      const p = this.p, old = [this.health, this.food, this.water, this.fuel];
      this.health = clamp(this.health + health, 0, p.max_health);
      this.food = clamp(this.food + food, 0, p.max_food);
      this.water = clamp(this.water + water, 0, p.max_water);
      this.fuel = clamp(this.fuel + fuel, 0, p.tank_gallons);
      const real = [this.health - old[0], this.food - old[1], this.water - old[2], this.fuel - old[3]];
      if (real.some((x) => Math.abs(x) > 1e-9))
        this.ledger.push({ day: this.day(), hour: this.hour, source, health: real[0], food: real[1], water: real[2], fuel: real[3] });
      if (this.health <= 0 && !this.ending) this.end("DIED", source);
      return real;
    }
    hurt(amount, source, why) {
      this.msgs.push({ kind: "bad", text: `-${fmtG(amount)} health: ${why}`, why, health: -amount });
      this.change(source, -amount);
    }
    advance(hours, source) {
      if (hours <= 0 || this.ending) return;
      const p = this.p, fr = p.food_drain_per_12h / 12, wr = p.water_drain_per_12h / 12;
      const hFood0 = Math.max(0, hours - this.food / fr), hWater0 = Math.max(0, hours - this.water / wr);
      this.hour += hours;
      this.change("hunger & thirst", 0, -fr * hours, -wr * hours);
      const dmg = p.starving_damage_per_12h * hFood0 / 12 + p.dehydrated_damage_per_12h * hWater0 / 12;
      if (dmg > 0) {
        const why = "you ran out of " + (hFood0 > 0 && hWater0 > 0 ? "food and water" : hFood0 > 0 ? "food" : "water");
        this.msgs.push({ kind: "bad", text: `-${dmg.toFixed(1)} health: ${why}`, why, health: -dmg });
        this.change("starving / dehydrated", -dmg);
      }
      this.checkInfection();
    }
    checkInfection() {
      const inf = this.infection;
      if (!inf || inf.treated || this.ending) return;
      const p = this.p, age = this.hour - inf.at;
      let warnAt = p.incubation_hours_player - p.warning_hours_before_onset;
      if (this.flags.includes("SYMPTOM_LIST")) warnAt -= p.symptom_list_hours;
      if (!inf.warned && age >= warnAt) {
        inf.warned = true;
        this.msgs.push({ kind: "bad", text: "A fever is building and the bite throbs. You've been infected." });
        this.tryTreatment("medicine in your pack");
      }
      if (!inf.treated && age >= p.incubation_hours_player) this.end("TURNED", `infected at ${this.fmtHour(inf.at)}, untreated at onset`);
    }
    tryTreatment(how) {
      const cure = this.B.cure_flags.find((f) => this.flags.includes(f));
      if (!cure || !this.infection || this.infection.treated) return false;
      this.flags.splice(this.flags.indexOf(cure), 1);
      return this.treat(how);
    }
    treat(how) {
      const ok = this.rng.get("treat").random() < this.p.treatment_success;
      this.events.push({ hour: this.hour, type: "treatment", ok });
      if (ok) { this.infection.treated = true; this.msgs.push({ kind: "good", text: `Treated with ${how}. The fever breaks.` }); }
      else this.msgs.push({ kind: "bad", text: `The treatment (${how}) didn't work.` });
      return ok;
    }
    end(kind, detail = "") {
      if (!this.ending) { this.ending = kind; this.endingDetail = detail; this.events.push({ hour: this.hour, type: "ending", ending: kind }); }
    }

    optionAttrs(scene, o) {
      let a;
      if (o.attrs) a = o.attrs;
      else {
        const key = `${scene.id}:${o.letter}` + (o._alt ? ":alt" : "");
        if (!(key in this.attrs)) throw new Error(`No decision attributes for option ${key}`);
        a = this.attrs[key];
      }
      return this.effectiveAttrs(o, a);
    }
    effectiveAttrs(o, a0) {
      const a = Object.assign({}, a0);
      if (this.flags.includes("CROWD_SMART") && a.exposure === "high") a.exposure = "medium";
      if (this.flags.includes("NEXT_SHELTER_CONTACT") && a.activity === "shelter") a.exposure = "contact";
      if (o.svi_delay) { const svi = this.sviHere(); a.hours = a.hours + o.svi_delay * (this.p.svi_delay_base + this.p.svi_delay_slope * (svi == null ? 0 : svi)); }
      const g = o.gate || {};
      if (g.needs_fuel) { if (this.fuel >= g.needs_fuel) a.fuel_gal = -g.fuel_cost; else a.hours = a.hours + g.else_hours; }
      return a;
    }
    injuryBreakdown(o, a, night) {
      const p = this.p, [temp, snow] = this.weather();
      const base = o.injury_chance / 100;
      let w = 1;
      if (a.setting === "open") {
        w = 1 + p.weather_cold_slope * Math.max(0, 32 - temp);
        if (snow != null) w += p.weather_snow_slope * snow;
        w = Math.min(p.weather_mult_max, w);
      }
      const act = p.activity_injury_mult[a.activity], tm = night ? p.night_injury_mult : 1;
      return { base, weather: w, activity: act, time: tm, p: Math.min(p.injury_cap, base * w * act * tm), temp_f: temp, snow_in: snow, damage: o.damage };
    }
    infectionBreakdown(a, night) {
      const p = this.p, I = this.local()[2];
      const k = p.k_by_exposure[a.exposure], setting = p.setting_mult[a.setting], nm = night ? p.night_infection_mult : 1, gear = p.gear_mult;
      const lam = k * I * a.hours * setting * nm * gear;
      return { k, prevalence: I, hours: a.hours, setting, night: nm, gear, p: 1 - Math.exp(-lam) };
    }
    expectedOption(scene, o, night) {
      const a = this.optionAttrs(scene, o), inj = this.injuryBreakdown(o, a, night), inf = this.infectionBreakdown(a, night);
      const harm = (o.harm || {}).health || 0;
      const sick = this.infection != null && !this.infection.treated;
      return { a, p_injury: inj.p, exp_damage: inj.p * o.damage + harm, p_infection: inf.p, hours: a.hours - a.travel_hours_saved,
        food: o.food || 0, water: o.water || 0, heal: o.heal || 0, fuel: a.fuel_gal, cure: o.treat && sick ? this.p.treatment_success : 0 };
    }

    condition(cond) {
      const p = this.p;
      if (cond === "low_fuel") return this.vehicle && this.fuel < p.low_fuel_gal;
      if (cond === "infected_symptoms") return !!(this.infection && this.infection.warned && !this.infection.treated);
      if (cond === "behind") return this.hoursBehind() > p.behind_hours;
      if (cond === "low_health") return this.health < p.low_health;
      return false;
    }
    visibleOptions(scene) {
      const out = [];
      for (const o of scene.options) {
        if (o.unlock_flag && !this.flags.includes(o.unlock_flag)) continue;
        if (o.condition && !this.condition(o.condition)) continue;
        if (o.requires_flag && !this.flags.includes(o.requires_flag)) {
          const alt = Object.assign({}, o.alt, { letter: o.letter, sets_flag: null, sets_flags: null, minigame: null, _alt: true });
          if (alt.injury_chance == null) alt.injury_chance = o.injury_chance;
          if (alt.damage == null) alt.damage = o.damage;
          if (alt.rating == null) alt.rating = o.rating;
          out.push(alt);
        } else out.push(o);
      }
      return out;
    }
    async ask(ui, scene, kind) {
      const options = this.visibleOptions(scene);
      const letter = await ui.choose(this, scene, options, kind);
      const o = options.find((x) => x.letter === letter);
      const result = this.resolve(scene, o, kind);
      this.history.push([scene.id, o.letter, o.rating]);
      await ui.outcome(this, scene, o, result);
      if (o.minigame && !this.ending) await this.realisticGame(ui, o.minigame, "NORMAL", true);
      return o;
    }
    resolve(scene, o, kind) {
      const p = this.p;
      this.msgs = [];
      const a = this.optionAttrs(scene, o);
      const night = kind === "main" ? scene.time === "Night" : this.isNight();
      const inj = this.injuryBreakdown(o, a, night), inf = this.infectionBreakdown(a, night);
      const rInj = this.rng.get("injury").random(), rInf = this.rng.get("infection").random();
      const result = { injury: inj, infection: inf, attrs: a, hurt: false, infected: false, roll_injury: rInj, roll_infection: rInf, hour_before: this.hour,
        before: { health: this.health, food: this.food, water: this.water, fuel: this.fuel, miles: this.miles } };
      if (this.flags.includes("NEXT_SHELTER_CONTACT") && a.activity === "shelter") this.flags.splice(this.flags.indexOf("NEXT_SHELTER_CONTACT"), 1);
      if (rInj < inj.p) {
        result.hurt = true; this.injuries += 1;
        this.hurt(o.damage, `injury (${scene.id})`, o.note || "the choice went badly");
      }
      if (rInf < inf.p && !this.infection) {
        result.infected = true;
        this.infection = { at: this.hour, warned: false, treated: false };
        this.infections += 1;
        this.events.push({ hour: this.hour, type: "infected", scene: scene.id });
      }
      if (o.harm && !this.ending) this.hurt(o.harm.health, `cost (${scene.id})`, o.harm.reason);
      const gains = { health: o.heal || 0, food: o.food || 0, water: o.water || 0 };
      let fuel = a.fuel_gal;
      if (fuel >= p.tank_gallons) fuel = p.tank_gallons - this.fuel;
      if (gains.health || gains.food || gains.water || fuel) {
        this.change(`supplies (${scene.id})`, gains.health, gains.food, gains.water, fuel);
        let txt = Object.entries(gains).filter(([, v]) => v).map(([k, v]) => `${signed(v)} ${k}`).join(", ");
        if (fuel) txt = (txt ? txt + ", " : "") + `${fuel >= 0 ? "+" : ""}${fuel.toFixed(1)} gal fuel`;
        this.msgs.push({ kind: Math.min(gains.health, gains.food, gains.water, fuel) >= 0 ? "good" : "bad", text: txt });
      }
      if (a.vehicle === "lost" && this.vehicle) {
        this.vehicle = false;
        this.msgs.push({ kind: "bad", text: "You no longer have a vehicle." });
      } else if (a.vehicle === "gained") {
        if (!this.vehicle) this.msgs.push({ kind: "good", text: "You have a vehicle again." });
        this.vehicle = true;
        if (this.fuel < p.found_vehicle_min_fuel) this.change("found vehicle's tank", 0, 0, 0, p.found_vehicle_min_fuel - this.fuel);
      }
      if (a.miles_bonus > 0) {
        const gain = Math.min(a.miles_bonus, this.totalMi - this.miles);
        this.miles += gain;
        this.msgs.push({ kind: "good", text: `You cover ${gain.toFixed(0)} extra miles.` });
      }
      if (a.travel_hours_saved > 0) this.savedHours += a.travel_hours_saved;
      if (a.medicine && !this.flags.includes("MED_KIT")) {
        this.flags.push("MED_KIT");
        this.msgs.push({ kind: "good", text: "You now carry medicine (cures an infection before onset, 90%)." });
      }
      if (o.medicine_chance) {
        if (this.rng.get("medicine").random() < o.medicine_chance && !this.flags.includes("MED_KIT")) {
          this.flags.push("MED_KIT");
          this.msgs.push({ kind: "good", text: "You find medicine in the next town." });
        } else this.msgs.push({ kind: "bad", text: "No medicine to be found." });
      }
      if (o.treat) {
        if (this.infection && !this.infection.treated) this.treat("the medics' treatment");
        else this.msgs.push({ kind: "good", text: "The medics check you over: no infection." });
      }
      for (const flag of optionFlags(o)) {
        if (!this.flags.includes(flag)) {
          this.flags.push(flag);
          for (const cb of this.city.callbacks)
            if (cb.trigger_flag === flag && !this.playedCallbacks.includes(cb.id)) this.pending.push([cb.delay, cb]);
        }
      }
      const g = o.gate;
      if (g) {
        this.quarantineHours = g.quarantine_h || 0;
        if (g.needs_fuel) this.msgs.push(a.fuel_gal < 0 ? { kind: "good", text: "The captain takes your fuel." } : { kind: "bad", text: `Not enough fuel (${this.fuel.toFixed(1)} gal): you wait for the morning boat.` });
      }
      if (this.infection && this.infection.warned && !this.infection.treated) this.tryTreatment("the medicine you just found");
      if (a.denied_entry && scene.id === this.city.scenarios[this.city.scenarios.length - 1].id) this.end("DENIED", o.note);
      this.advance(a.hours, `time (${scene.id})`);
      result.msgs = this.msgs; result.hour_after = this.hour;
      this.events.push({ hour: this.hour, type: "choice", scene: scene.id, rating: o.rating, p_injury: inj.p, p_infection: inf.p, hurt: result.hurt, infected: result.infected, health: this.health });
      return result;
    }

    speedMph(place, night) {
      const p = this.p, [temp, snow] = this.weather(place);
      let slow = 1 + p.cold_speed_slope * Math.max(0, 32 - temp);
      if (snow != null) slow += p.snow_speed_slope * snow;
      return p.base_speed_mph / slow * (night ? p.night_speed_factor : 1);
    }
    async travelTo(ui, i) {
      const p = this.p, target = this.places[i], nightLeg = i % 2 === 0;
      let used = 0;
      while (this.miles < target.mi - 1e-6 && !this.ending) {
        const dist = target.mi - this.miles;
        if (!this.vehicle || this.fuel <= 1e-9) {
          if (used >= p.max_fallbacks_per_leg) { this.end("STRANDED", `${dist.toFixed(0)} miles short of the next stop`); return; }
          used += 1;
          await this.ask(ui, this.fallbacks[!this.vehicle ? "no_vehicle" : "out_of_fuel"], "fallback");
          continue;
        }
        const mph = this.speedMph(target, nightLeg);
        const driveMi = Math.min(dist, this.fuel * p.mpg);
        let hours = driveMi / mph;
        const credit = Math.min(this.savedHours, hours * 0.5);
        this.savedHours -= credit; hours -= credit;
        const wm = 1 + p.cold_speed_slope * Math.max(0, 32 - this.weather(target)[0]);
        const pRoad = 1 - Math.exp(-p.road_risk_per_hour * wm * hours);
        const r = this.rng.get("road").random();
        this.miles += driveMi;
        this.change("fuel used driving", 0, 0, 0, -driveMi / p.mpg);
        this.events.push({ hour: this.hour, type: "drive", miles: driveMi, hours, mph, p_road: pRoad });
        this.msgs = [{ kind: "", text: `You drive ${driveMi.toFixed(0)} miles in ${hours.toFixed(1)} h (${(driveMi / p.mpg).toFixed(1)} gal of fuel).`, drive: { miles: driveMi, hours } }];
        this.advance(hours, "driving");
        if (r < pRoad && !this.ending) this.hurt(p.road_damage, "road accident", "you slid off the icy road");
        await ui.message(this, "On the road", this.msgs);
      }
      if (this.ending) return;
      this.place = target;
      if (i % 2 === 0 && this.vehicle) {
        const gal = this.rng.get("town_fuel").uniform(p.town_fuel_min, p.town_fuel_max);
        const got = this.change("fuel scavenged in town", 0, 0, 0, gal)[3];
        if (got > 0) await ui.message(this, "In town", [{ kind: "good", text: `You scavenge ${got.toFixed(1)} gallons of fuel.` }]);
      }
      if (this.hour < target.nominal) {
        this.msgs = [];
        this.advance(target.nominal - this.hour, "rest / waiting");
        if (this.msgs.length) await ui.message(this, "Resting", this.msgs);
      }
    }

    eventDue(i) {
      const p = this.p;
      for (const trig of EVENT_ORDER) {
        const ev = this.eventsContent[trig];
        if (!ev || this.playedEvents.includes(ev.id)) continue;
        let ok;
        if (trig === "rabies") ok = !!(this.infection && !this.infection.warned && !this.infection.treated && !this.B.cure_flags.some((f) => this.flags.includes(f)));
        else if (trig === "fuel") ok = i % 2 === 0 && this.vehicle && this.fuel < p.fuel_event_threshold;
        else if (trig === "r0") ok = i === 5;
        else if (trig === "svi") { const s = this.sviHere(); ok = i < 13 && s != null && s >= p.svi_event_threshold; }
        else { const a65 = this.pct65Here(); ok = i < 13 && a65 != null && a65 >= p.age_event_threshold; }
        if (ok) return ev;
      }
      return null;
    }
    eventScene(ev) {
      const s = Object.assign({}, ev);
      if (ev.trigger === "r0") { const r0 = this.traj[this.place.a].r0(this.outbreakDay()); s.text = ev.text.replace("[local R0]", r0.toFixed(0)); s.r0 = r0; }
      if (ev.trigger === "svi") { const svi = this.sviHere(); s.svi = svi; s.delay_h = this.p.svi_delay_base + this.p.svi_delay_slope * svi; }
      if (ev.trigger === "age") s.pct65 = this.pct65Here();
      s.county = this.counties[this.stops[this.place.a].geoid].name;
      return s;
    }

    async realisticGame(ui, name, tier, story = false) {
      if (story && this.usedGames.includes(name)) return;
      const p = this.p;
      if (!this.usedGames.includes(name)) this.usedGames.push(name);
      this.minigameLog[tier] += 1;
      const live = await ui.minigame(this, name, tier, false);
      const r = this.rng.get("minigame_win").random();
      const win = live == null ? r < p.minigame_win_prob_sim[tier] : !!live.win;
      const G = this.rgames[name], fx = G.fx[win ? "win" : "fail"];
      this.msgs = [];
      if (win) {
        this.minigameLog.wins += 1;
        this.msgs.push({ kind: "good", text: "Good job! " + G.win_text });
        if (fx.heal || fx.water || fx.fuel) this.change(`minigame (${name})`, fx.heal || 0, 0, fx.water || 0, fx.fuel || 0);
        if (fx.saved) this.savedHours += fx.saved;
        if (fx.flag && !this.flags.includes(fx.flag)) this.flags.push(fx.flag);
        if (fx.reveal && this.infection && !this.infection.warned && !this.infection.treated) {
          this.infection.warned = true;
          this.msgs.push({ kind: "bad", text: "Cleaning the wound, you find a bite mark. You're infected, but you know early." });
          this.tryTreatment("medicine in your pack");
        } else if (fx.reveal) this.msgs.push({ kind: "good", text: "No bite marks. It's just a wound." });
      } else if (tier === "EASY") this.msgs.push({ kind: "", text: "Not this time, but no harm done." });
      else {
        if (fx.harm) this.hurt(fx.harm, `minigame (${name})`, fx.reason);
        if (fx.fuel) { this.change(`minigame (${name})`, 0, 0, 0, fx.fuel); this.msgs.push({ kind: "bad", text: `${fx.fuel >= 0 ? "+" : ""}${fx.fuel.toFixed(1)} gal fuel: ${fx.reason}` }); }
        if (fx.lose_vehicle && this.vehicle) { this.vehicle = false; this.msgs.push({ kind: "bad", text: `You lose the vehicle: ${fx.reason}.` }); }
        if (fx.hours) { this.msgs.push({ kind: "bad", text: `+${fmtG(fx.hours)} h: ${fx.reason}` }); this.advance(fx.hours, `minigame (${name})`); }
        if (!Object.keys(fx).length) this.msgs.push({ kind: "", text: "No luck, but no harm done." });
      }
      this.events.push({ hour: this.hour, type: "minigame", name, tier, win });
      await ui.message(this, `Mini game: ${name} (${tier})`, this.msgs);
    }
    async miniGame(ui, tier, double = false) {
      const p = this.p;
      let unused = this.pool.filter((g) => !this.usedGames.includes(g));
      if (!unused.length) { this.usedGames = []; unused = this.pool.slice(); }
      const name = unused[Math.floor(this.rng.get("minigame_pick").random() * unused.length)];
      if (this.rgames[name]) { await this.realisticGame(ui, name, tier); return; }
      this.usedGames.push(name); this.minigameLog[tier] += 1;
      const live = await ui.minigame(this, name, tier, double);
      const r = this.rng.get("minigame_win").random();
      let win, bonus;
      if (live == null) { win = r < p.minigame_win_prob_sim[tier]; bonus = {}; } else { win = live.win; bonus = live.bonus || {}; }
      this.msgs = [];
      if (bonus && (bonus.health || bonus.food || bonus.water))
        this.change(`minigame bonus (${name})`, bonus.health || 0, bonus.food || 0, bonus.water || 0);
      const reward = this.B.minigames[name];
      const dmgR = this.rng.get("minigame_dmg").random();
      if (win) {
        this.minigameLog.wins += 1;
        if (tier === "HARD") {
          this.change(`minigame (${name})`, p.hard_win_health);
          this.msgs.push({ kind: "good", text: `Good job! You escaped unhurt. +${fmtG(p.hard_win_health)} health` });
        } else {
          const amt = p.minigame_reward[tier] * (double ? 2 : 1);
          this.change(`minigame (${name})`, reward === "health" ? amt : 0, reward.includes("food") ? amt : 0, reward.includes("water") ? amt : 0);
          this.msgs.push({ kind: "good", text: `Good job! +${fmtG(amt)} ${reward}` });
        }
      } else if (tier !== "EASY") {
        const [lo, hi] = tier === "HARD" ? p.hard_loss_damage : p.normal_loss_damage;
        const dmg = lo + Math.floor(dmgR * (hi - lo + 1));
        this.hurt(dmg, `minigame (${name})`, `you lost the ${name} mini game`);
      } else this.msgs.push({ kind: "", text: "Failed, but no harm done." });
      this.events.push({ hour: this.hour, type: "minigame", name, tier, win });
      await ui.message(this, `Mini game: ${name} (${tier})`, this.msgs);
    }
    async pairRoll(ui) {
      const bad = this.recent.filter((r) => r === "RISKY" || r === "WORST").length;
      const pair = bad === 2 ? "risky" : bad === 1 ? "mixed" : "good";
      const roll = Math.floor(this.rng.get("roll").random() * 101);
      const last = this.recent[this.recent.length - 1];
      this.recent = [];
      if (pair === "risky") {
        if (roll <= 60) await this.miniGame(ui, "HARD");
        else {
          const d = this.day();
          const fits = this.city.branches.filter((b) => b.days[0] <= d && d <= b.days[1] && !this.usedBranches.includes(b.id));
          fits.sort((x, y) => (x.type !== last) - (y.type !== last));
          if (fits.length) { this.usedBranches.push(fits[0].id); this.minigameLog.detours += 1; await this.ask(ui, fits[0], "detour"); }
          else await this.miniGame(ui, "NORMAL");
        }
      } else if (pair === "mixed") await this.miniGame(ui, roll <= 50 ? "NORMAL" : "EASY");
      else await this.miniGame(ui, "EASY", roll > 50);
    }
    async run(ui) {
      const main = this.city.scenarios;
      for (let i = 0; i < main.length; i++) {
        const s = main[i];
        this.sceneIndex = i;
        if (i > 0) {
          await this.travelTo(ui, i);
          if (this.ending) break;
          if (this.hour > this.p.deadline_hours) { this.end("TOO_LATE", `arrived near stop ${i + 1} at ${this.fmtHour(this.hour)}`); break; }
        }
        const ev = this.eventDue(i);
        if (ev) {
          this.playedEvents.push(ev.id);
          await this.ask(ui, this.eventScene(ev), "event");
          if (this.ending) break;
        }
        for (const item of this.pending.filter((x) => x[0] <= 0)) {
          this.pending.splice(this.pending.indexOf(item), 1);
          this.playedCallbacks.push(item[1].id);
          await this.ask(ui, item[1], "callback");
          if (this.ending) break;
        }
        if (this.ending) break;
        const o = await this.ask(ui, s, "main");
        this.recent.push(o.weather_rating || o.rating);
        const fl = optionFlags(o);
        for (const item of this.pending) if (!fl.includes(item[1].trigger_flag)) item[0] -= 1;
        if (this.ending) break;
        if (i % 2 === 1 && i < main.length - 1) { await this.pairRoll(ui); if (this.ending) break; }
      }
      if (!this.ending) this.arrive();
      await ui.end(this);
      return this.ending;
    }
    arrive() {
      if (this.miles < this.totalMi - 1e-6) { this.end("STRANDED", "the story ended before the player reached the safe zone"); return; }
      if (this.hour > this.p.deadline_hours) { this.end("TOO_LATE", `arrived ${this.fmtHour(this.hour)}`); return; }
      if (this.infection && !this.infection.treated) {
        const ok = this.rng.get("treat").random() < this.p.treatment_success;
        this.events.push({ hour: this.hour, type: "screening", ok });
        if (ok) { this.infection.treated = true; this.endingDetail = "infected, treated in quarantine at the safe zone"; }
        else { this.end("TURNED", "infection found at the gate; treatment failed"); return; }
      }
      if (this.quarantineHours && !this.endingDetail) this.endingDetail = `admitted after ${fmtG(this.quarantineHours)} h of quarantine`;
      this.end("VICTORY", this.endingDetail || "");
    }
    summary() {
      const ratings = this.history.map((h) => h[2]);
      const choices = {}; RATINGS.forEach((r) => (choices[r] = ratings.filter((x) => x === r).length));
      return { city: this.code, seed: this.seed, ending: this.ending, detail: this.endingDetail, survived: this.ending === "VICTORY",
        hours: this.hour, days: this.hour / 24, health: this.health, food: this.food, water: this.water, fuel: this.fuel,
        miles: this.miles, miles_left: Math.max(0, this.totalMi - this.miles), infections: this.infections, injuries: this.injuries,
        strength: this.strength, choices, minigames: this.usedGames.slice(), callbacks: this.playedCallbacks.slice(), detours: this.usedBranches.slice(),
        events: this.playedEvents.slice() };
    }
  }

  // ---------------------------------------------------------------- policies.py
  function scored(g, scene, options, score) {
    const night = scene.day != null && scene.trigger == null ? scene.time === "Night" : g.isNight();
    let best = null, bestS = null;
    for (const o of options) {
      const e = g.expectedOption(scene, o, night);
      let s = score(g, o, e);
      if (scene.id.startsWith("FB-") && e.fuel <= 0 && e.a.vehicle !== "gained" && e.a.miles_bonus <= 0) s += 50;
      if (bestS === null || s < bestS - 1e-12) { best = o; bestS = s; }
    }
    return best.letter;
  }
  function behindSchedule(g) {
    const leftMi = Math.max(0, g.totalMi - g.miles), leftH = g.p.deadline_hours - g.hour;
    const needH = leftMi / g.p.base_speed_mph * 1.4;
    return Math.max(0, needH - leftH + 24);
  }
  const POLICIES = {
    balanced: (g, s, opts) => scored(g, s, opts, (g, o, e) => {
      const hpW = 1 + (1 - g.health / 100) * 2, timeW = 0.5 + behindSchedule(g) / 12;
      const foodW = g.food < 40 ? 0.4 : 0.15, waterW = g.water < 40 ? 0.4 : 0.15, fuelW = g.fuel < 10 ? 1 : 0.2;
      return hpW * e.exp_damage + 60 * e.p_infection - 60 * e.cure + timeW * e.hours - foodW * e.food - waterW * e.water - hpW * 0.5 * e.heal - fuelW * e.fuel;
    }),
    lowest_risk: (g, s, opts) => scored(g, s, opts, (g, o, e) => e.exp_damage + g.p.infection_cost_for_policy * e.p_infection - g.p.infection_cost_for_policy * e.cure + 0.01 * e.hours),
    supplies: (g, s, opts) => scored(g, s, opts, (g, o, e) => {
      const nf = g.food < 30 ? 1.5 : 1, nw = g.water < 30 ? 1.5 : 1, nh = g.health < 40 ? 1.5 : 0.5, nfu = g.fuel < 8 ? 3 : 1;
      return -(nf * e.food + nw * e.water + nh * e.heal + nfu * e.fuel) + 0.3 * e.exp_damage - 60 * e.cure;
    }),
    speed: (g, s, opts) => scored(g, s, opts, (g, o, e) => e.hours - e.a.miles_bonus / 50 + 0.05 * e.exp_damage - 60 * e.cure),
    random: (g, s, opts) => opts[Math.floor(g.rng.get("policy").random() * opts.length)].letter,
    best_rating: (g, s, opts) => { for (const r of RATINGS) for (const o of opts) if (o.rating === r) return o.letter; },
  };
  function stylePolicy(weights) {
    const tot = RATINGS.reduce((a, r) => a + (weights[r] || 0) + 0.5, 0);
    const probs = RATINGS.map((r) => ((weights[r] || 0) + 0.5) / tot);
    return (g, s, opts) => {
      const u = g.rng.get("policy").random();
      let acc = 0, want = RATINGS[3];
      for (let i = 0; i < 4; i++) { acc += probs[i]; if (u < acc) { want = RATINGS[i]; break; } }
      const order = RATINGS.slice().sort((a, b) => Math.abs(RATINGS.indexOf(a) - RATINGS.indexOf(want)) - Math.abs(RATINGS.indexOf(b) - RATINGS.indexOf(want)));
      for (const r of order) for (const o of opts) if (o.rating === r) return o.letter;
    };
  }

  // ---------------------------------------------------------------- sim.py
  function simUI(policy) {
    return { choose: (g, s, o) => policy(g, s, o), outcome() {}, minigame() { return null; }, message() {}, end() {} };
  }
  async function playOne(B, city, seed, policy) {
    const g = new Game(B, city, seed);
    await g.run(simUI(policy));
    return g;
  }
  // Synchronous runner for Monte Carlo in the page: the sim UI never waits, so promises resolve in order.
  async function monteCarlo(B, city, policy, runs, seed0 = 1, onProgress) {
    const rows = [];
    for (let k = 0; k < runs; k++) {
      rows.push((await playOne(B, city, seed0 + k, policy)).summary());
      if (onProgress && k % 50 === 49) await onProgress(k + 1);
    }
    return summarize(rows);
  }
  function summarize(rows) {
    const n = rows.length, surv = rows.filter((r) => r.survived);
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const endings = {}; Object.keys(ENDINGS).forEach((k) => (endings[k] = rows.filter((r) => r.ending === k).length / n));
    return { runs: n, survival_rate: surv.length / n, endings, avg_days: mean(rows.map((r) => r.days)),
      avg_health_survivors: mean(surv.map((r) => r.health)), avg_food: mean(rows.map((r) => r.food)), avg_water: mean(rows.map((r) => r.water)),
      avg_fuel: mean(rows.map((r) => r.fuel)), infection_rate: rows.filter((r) => r.infections > 0).length / n,
      avg_miles_left: mean(rows.map((r) => r.miles_left)), avg_injuries: mean(rows.map((r) => r.injuries)) };
  }

  const API = { Mulberry32, Streams, fnv1a, Trajectory, densityMultiplier, coldMultiplier, ageMultiplier, Game, POLICIES, stylePolicy, simUI, playOne, monteCarlo, summarize, ENDINGS, RATINGS };
  if (typeof module !== "undefined" && module.exports) module.exports = API;
  else root.ZombieSim = API;
})(typeof window !== "undefined" ? window : globalThis);
