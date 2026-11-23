// Zombie Escape - page code: screens, the status dashboard, charts, the 20-second timer (with pause),
// developer mode, unit toggle and the live mini games. All game rules live in sim.js (the same rules as the
// Python engine); the 10 realistic mini games live in realgames.js. This file only draws and collects input.
(function () {
  "use strict";
  const B = window.GAME_DATA, Z = window.ZombieSim, P = B.params;
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (v, d = 0) => Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
  let dev = false, metric = false, current = null, inspectStop = null;
  let lastPauseEnd = -1e9;                 // pause cooldown: 30 s after each resume
  const PAUSE_COOLDOWN_S = 30;
  const queue = [];                        // outcome + travel messages waiting for the next status dashboard
  let snap = null;                         // stats at the last dashboard (for the +/- deltas)
  let healthLog = [];                      // every health loss with its reason (end screen)

  // Keys: one handler at a time. Held-down Enter (key repeat) is ignored, so one press = one step forward.
  let keyHandler = null, keyUpHandler = null;
  document.addEventListener("keydown", (e) => {
    if (e.repeat && (e.key === "Enter" || e.key === " ")) { if (keyHandler) e.preventDefault(); return; }
    if (keyHandler && keyHandler(e) === true) e.preventDefault();
  });
  document.addEventListener("keyup", (e) => { if (keyUpHandler && keyUpHandler(e) === true) e.preventDefault(); });

  // ---------- units (°F / miles / gallons  or  °C / km / liters) ----------
  try { metric = localStorage.getItem("ze_metric") === "1"; } catch (e) { metric = false; }
  const uT = (f, d = 1) => (metric ? ((f - 32) * 5 / 9).toFixed(d) + "°C" : f.toFixed(d) + "°F");
  const uD = (mi, d = 0) => (metric ? fmt(mi * 1.609344, d) + " km" : fmt(mi, d) + " mi");
  const uDn = (mi) => (metric ? fmt(mi * 1.609344) : fmt(mi));
  const uV = (gal, d = 1) => (metric ? (gal * 3.785411).toFixed(d) + " L" : gal.toFixed(d) + " gal");
  const uL = (inch) => (metric ? (inch * 2.54).toFixed(1) + " cm" : inch.toFixed(1) + " in");
  const uE = (m) => (metric ? fmt(m) + " m" : fmt(m * 3.281) + " ft");
  function convText(s) {
    s = String(s);
    if (!metric) return s;
    return s.replace(/(-?\d+(?:\.\d+)?)\s?°F/g, (m, v) => ((+v - 32) * 5 / 9).toFixed(0) + "°C")
      .replace(/(\d[\d,]*(?:\.\d+)?)(\s|-)(miles?|mi)\b/g, (m, v, sp) => fmt(parseFloat(v.replace(/,/g, "")) * 1.609344) + sp + "km")
      .replace(/(\d+(?:\.\d+)?)\s(gallons?|gal)\b/g, (m, v) => (+v * 3.785411).toFixed(1) + " L")
      .replace(/(\d+(?:\.\d+)?) in(ches)? of snow/g, (m, v) => (+v * 2.54).toFixed(0) + " cm of snow");
  }
  const T = (s) => esc(convText(s));
  function setMetric(v) {
    metric = !!v;
    try { localStorage.setItem("ze_metric", metric ? "1" : "0"); } catch (e) { /* storage unavailable: setting lasts this visit */ }
    if ($("metric")) $("metric").checked = metric;
    if ($("unitbtn")) $("unitbtn").textContent = metric ? "°C · km · L" : "°F · mi · gal";
    if (current) hud(current); else titleScreen();
  }

  // ---------- developer mode password ----------
  // The page keeps only a SHA-256 hash of the password, not the password itself. This is a convenience lock
  // for a class project, NOT real security: anyone can read this file and switch dev mode on.
  const DEV_HASH = "67ad69dd5b96051c542b083bebafc6be5be0ace4a70e5fecab20c816f0d4aff4";
  function sha256(ascii) {   // compact SHA-256 for short ASCII strings
    const rr = (v, n) => (v >>> n) | (v << (32 - n));
    const maxWord = 2 ** 32, words = [], bitLen = ascii.length * 8;
    let hash = [], k = [], pc = 0, result = "";
    const comp = {};
    for (let c = 2; pc < 64; c++) {
      if (!comp[c]) {
        for (let i = 0; i < 313; i += c) comp[i] = c;
        hash[pc] = (Math.pow(c, 0.5) * maxWord) | 0;
        k[pc++] = (Math.pow(c, 1 / 3) * maxWord) | 0;
      }
    }
    ascii += "\x80";
    while (ascii.length % 64 - 56) ascii += "\x00";
    for (let i = 0; i < ascii.length; i++) { const j = ascii.charCodeAt(i); if (j >> 8) return ""; words[i >> 2] |= j << ((3 - i) % 4) * 8; }
    words[words.length] = (bitLen / maxWord) | 0; words[words.length] = bitLen;
    for (let j = 0; j < words.length;) {
      const w = words.slice(j, (j += 16)), old = hash;
      hash = hash.slice(0, 8);
      for (let i = 0; i < 64; i++) {
        const w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
        const t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ (~e & hash[6])) + k[i] +
          (w[i] = i < 16 ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
        hash = [(t1 + t2) | 0].concat(hash);
        hash[4] = (hash[4] + t1) | 0;
      }
      for (let i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
    }
    for (let i = 0; i < 8; i++) for (let j = 3; j + 1; j--) { const b = (hash[i] >> (j * 8)) & 255; result += (b < 16 ? "0" : "") + b.toString(16); }
    return result;
  }
  function tryUnlock() {
    const ok = sha256($("devpw").value) === DEV_HASH;
    dev = ok;
    $("devstate").textContent = ok ? "Developer mode ON: no timer, all stats, calculations and code notes shown." : "Wrong password. Player mode.";
    $("devstate").style.color = ok ? "var(--safe)" : "var(--blood)";
    document.body.classList.toggle("devmode", ok);
    $("devpw").value = "";
  }

  // ---------- snow ----------
  (function snow() {
    const c = $("snow"), x = c.getContext("2d");
    let flakes = [];
    function size() {
      c.width = innerWidth; c.height = innerHeight;
      flakes = Array.from({ length: Math.min(140, Math.floor(innerWidth / 8)) }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 2 + 0.6, s: Math.random() * 0.6 + 0.3, d: Math.random() * 0.6 - 0.3 }));
    }
    function draw() {
      x.clearRect(0, 0, c.width, c.height);
      x.fillStyle = "rgba(230,238,243,0.45)";
      for (const f of flakes) {
        x.beginPath(); x.arc(f.x, f.y, f.r, 0, 7); x.fill();
        if (!reduceMotion) { f.y += f.s; f.x += f.d; if (f.y > c.height) { f.y = -4; f.x = Math.random() * c.width; } }
      }
      if (!reduceMotion) requestAnimationFrame(draw);
    }
    size(); addEventListener("resize", size); draw();
  })();

  // ---------- title ----------
  function titleScreen() {
    $("title").classList.remove("hidden");
    $("game").classList.add("hidden");
    const box = $("cities"); box.innerHTML = "";
    for (const c of B.content.cities) {
      const stops = B.world.routes[c.code], first = B.world.counties[stops[0].geoid], st = B.world.stations[stops[0].station];
      const b = el("button", "city");
      b.innerHTML = `<span class="from">${esc(c.start)}</span><span class="to">to ${esc(c.end)}</span>
        <span class="meta">${uD(stops[7].cum_mi)} by road &middot; ${metric ? fmt(first.density / 2.58999) + " people/km²" : fmt(first.density) + " people/sq mi"} &middot; Jan ${uT(st.tavg_f)}</span>`;
      b.addEventListener("click", () => startGame(c.code));
      box.appendChild(b);
    }
    keyHandler = null;
  }
  $("metric").checked = metric;
  $("metric").addEventListener("change", (e) => setMetric(e.target.checked));
  $("unitbtn").addEventListener("click", () => setMetric(!metric));
  $("devgo").addEventListener("click", tryUnlock);
  $("devpw").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.stopPropagation(); tryUnlock(); } });

  async function startGame(code) {
    const sv = parseInt($("seed").value, 10);
    const seed = Number.isFinite(sv) ? sv : Math.floor(Math.random() * 1e9);
    $("title").classList.add("hidden");
    $("game").classList.remove("hidden");
    window.scrollTo(0, 0);
    const g = new Z.Game(B, code, seed);
    current = g; inspectStop = null; queue.length = 0; healthLog = []; lastPauseEnd = -1e9;
    snap = snapshot(g);
    $("route-sub").textContent = `seed ${seed}${dev ? " · developer mode" : ""}`;
    setMetric(metric);
    await g.run(UI);
  }

  // ---------- player dashboard (top bar) ----------
  const revealed = (g) => dev || !!g.ending;   // SEIR numbers and calculations: developer mode, or the end screen
  function dangerWord(I) { return I < 0.02 ? "Low" : I < 0.08 ? "Moderate" : I < 0.2 ? "High" : "Severe"; }
  function hud(g) {
    const [S, E, I] = g.local();
    const hoursLeft = P.deadline_hours - g.hour, show = revealed(g);
    $("when").textContent = g.fmtHour(g.hour) + (g.isNight() ? " · night" : "");
    $("where").textContent = `${g.placeLabel()} · ${hoursLeft >= 0 ? fmt(hoursLeft) + " h until the safe zone seals" : "deadline passed"}${g.vehicle ? "" : " · ON FOOT"}`;
    const left = Math.max(0, g.totalMi - g.miles);
    $("l-dist").textContent = metric ? "Km left" : "Miles left";
    $("l-zombie").textContent = show ? "Infectious here" : "Danger here";
    const vals = { health: [g.health, g.health], food: [g.food, g.food], water: [g.water, g.water],
      fuel: [uV(g.fuel), (g.fuel / P.tank_gallons) * 100], dist: [uDn(left), (g.miles / g.totalMi) * 100],
      zombie: [show ? pct(I) : dangerWord(I), Math.max(2, Math.min(100, I * 100 / 0.3))] };
    for (const [k, [txt, w]] of Object.entries(vals)) {
      $("v-" + k).textContent = typeof txt === "number" ? Math.round(txt) : txt;
      $("b-" + k).style.width = Math.max(0, Math.min(100, w)) + "%";
    }
    $("riskrow").classList.toggle("hidden", !show);
    if (show) {
      const [temp, snow] = g.weather();
      let w = 1 + P.weather_cold_slope * Math.max(0, 32 - temp); if (snow != null) w += P.weather_snow_slope * snow; w = Math.min(P.weather_mult_max, w);
      const tm = g.isNight() ? P.night_injury_mult : 1;
      const inf1h = 1 - Math.exp(-P.k_by_exposure.medium * I * 1 * (g.isNight() ? P.night_infection_mult : 1));
      $("riskrow").innerHTML = `<span>Injury multiplier outdoors now: <b>×${(w * tm).toFixed(2)}</b> (weather ×${w.toFixed(2)}, ${g.isNight() ? "night ×" + tm : "day ×1"})</span>
        <span>Infection chance per hour scavenging outdoors: <b>${pct(inf1h, 2)}</b></span>
        <span>Age mult ×${g.traj[g.place.a].am.toFixed(3)} · SVI ${g.sviHere() == null ? "n/a" : g.sviHere().toFixed(2)}</span>
        <span>Day ${Math.min(7, g.day())} of 7</span>`;
    }
    $("outbreak").classList.toggle("hidden", !show);
    $("devnotes").classList.toggle("hidden", !dev);
    drawMap(g);
    if (show) drawOutbreak(g);
    if (dev) devNotes(g);
  }

  // ---------- route map ----------
  function project(stops, W, H, pad) {
    const lons = stops.map((s) => s.lon), lats = stops.map((s) => s.lat);
    const mid = (Math.min(...lats) + Math.max(...lats)) / 2, kx = Math.cos(mid * Math.PI / 180);
    const x0 = Math.min(...lons) * kx, x1 = Math.max(...lons) * kx, y0 = Math.min(...lats), y1 = Math.max(...lats);
    const sc = Math.min((W - 2 * pad) / Math.max(1e-6, x1 - x0), (H - 2 * pad) / Math.max(1e-6, y1 - y0));
    const ox = (W - (x1 - x0) * sc) / 2, oy = (H - (y1 - y0) * sc) / 2;
    return (lon, lat) => [ox + (lon * kx - x0) * sc, H - (oy + (lat - y0) * sc)];
  }
  const heat = (I) => { const t = Math.min(1, I / 0.6); return `rgb(${Math.round(92 + t * 147)},${Math.round(199 - t * 108)},${Math.round(133 - t * 38)})`; };
  let mapHits = [];
  function drawMap(g) {
    const c = $("map"), x = c.getContext("2d"), W = c.width, H = c.height, show = revealed(g);
    x.clearRect(0, 0, W, H); x.fillStyle = "#0b121a"; x.fillRect(0, 0, W, H);
    const pr = project(g.stops, W, H, 40), pts = g.stops.map((s) => pr(s.lon, s.lat));
    x.strokeStyle = "#2b3d4f"; x.lineWidth = 6; x.lineCap = "round"; x.beginPath();
    pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py))); x.stroke();
    let k = 0; while (k < 7 && g.stops[k + 1].cum_mi <= g.miles) k++;
    const f = k < 7 ? (g.miles - g.stops[k].cum_mi) / Math.max(1e-9, g.stops[k].leg_mi) : 0;
    const me = k < 7 ? [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f] : pts[7];
    x.strokeStyle = "#ff8a1f"; x.lineWidth = 4; x.beginPath();
    for (let i = 0; i <= k; i++) (i ? x.lineTo(pts[i][0], pts[i][1]) : x.moveTo(pts[i][0], pts[i][1]));
    x.lineTo(me[0], me[1]); x.stroke();
    mapHits = [];
    const t = g.outbreakDay();
    g.stops.forEach((s, i) => {
      const I = g.traj[i].at(t)[2], [px, py] = pts[i];
      x.fillStyle = show ? heat(I) : i === 7 ? "#5cc785" : "#93a7b7"; x.beginPath(); x.arc(px, py, i === 7 ? 11 : 8, 0, 7); x.fill();
      x.strokeStyle = "#0e1721"; x.lineWidth = 2; x.stroke();
      x.font = "600 24px 'IBM Plex Mono', monospace"; x.fillStyle = "#e6eef3"; x.textAlign = "center";
      x.fillText(i === 7 ? "SAFE" : String(i + 1), px, py + (i % 2 ? 30 : -16));
      mapHits.push({ px, py, i });
    });
    x.fillStyle = "#e6eef3"; x.beginPath(); x.arc(me[0], me[1], 6, 0, 7); x.fill();
    x.strokeStyle = "#ff8a1f"; x.lineWidth = 3; x.stroke();
    x.textAlign = "left"; x.font = "19px 'IBM Plex Mono', monospace"; x.fillStyle = "#93a7b7";
    x.fillText(show ? "dot colour = infectious share now (green low, red high)" : "orange = the road you've driven", 12, H - 12);
  }
  $("map").addEventListener("mousemove", (e) => {
    if (!current) return;
    const c = $("map"), r = c.getBoundingClientRect(), mx = (e.clientX - r.left) * c.width / r.width, my = (e.clientY - r.top) * c.height / r.height;
    const hit = mapHits.find((h) => Math.hypot(h.px - mx, h.py - my) < 16), tip = $("map-tip");
    if (!hit) { tip.style.display = "none"; return; }
    const s = current.stops[hit.i], cty = current.counties[s.geoid];
    tip.innerHTML = `${esc(s.label)}<br>${esc(cty.name)}, ${esc(cty.state)}<br>${uD(s.cum_mi)} from start` + (revealed(current) ? `<br>infectious now ${pct(current.traj[hit.i].at(current.outbreakDay())[2])}` : "");
    tip.style.display = "block"; tip.style.left = Math.min(r.width - 180, e.clientX - r.left + 10) + "px"; tip.style.top = (e.clientY - r.top + 10) + "px";
  });
  $("map").addEventListener("mouseleave", () => ($("map-tip").style.display = "none"));
  $("map").addEventListener("click", (e) => {
    if (!current || !revealed(current)) return;
    const c = $("map"), r = c.getBoundingClientRect(), mx = (e.clientX - r.left) * c.width / r.width, my = (e.clientY - r.top) * c.height / r.height;
    const hit = mapHits.find((h) => Math.hypot(h.px - mx, h.py - my) < 18);
    if (hit) { inspectStop = hit.i; drawOutbreak(current); }
  });

  // ---------- city outbreak dashboard (developer mode and end screen only) ----------
  function drawOutbreak(g) {
    const box = $("outbreak");
    const idx = inspectStop != null ? inspectStop : (g.place.a === g.place.b ? g.place.a : g.place.b);
    const s = g.stops[idx], c = g.counties[s.geoid], st = g.stations[s.station], tr = g.traj[idx], t = g.outbreakDay();
    const [S, E, I, R] = tr.at(t);
    const sv = g.svi[s.geoid];
    const opts = g.stops.map((x, i) => `<option value="${i}" ${i === idx ? "selected" : ""}>${i === 7 ? "Safe zone" : "Stop " + (i + 1)}: ${esc(x.label)}</option>`).join("");
    box.innerHTML = `<h3>Outbreak <small>SEIR · one county</small></h3>
      <select id="stop-pick" aria-label="Pick a stop to inspect">${opts}</select>
      <div class="kv">
        <span>County</span><span>${esc(c.name)}, ${esc(c.state)} (${c.geoid})</span>
        <span class="real">Population 2023</span><span>${fmt(c.population)}</span>
        <span class="real">Land area</span><span>${metric ? fmt(c.land_sq_mi * 2.58999) + " km²" : fmt(c.land_sq_mi) + " sq mi"}</span>
        <span class="calc">Density</span><span>${metric ? fmt(c.density / 2.58999) + " /km²" : fmt(c.density) + " /sq mi"}</span>
        <span class="real">January normal</span><span>${uT(st.tavg_f)}, snow ${st.snow_in == null ? "not published" : uL(st.snow_in)}</span>
        <span class="real">CDC SVI 2022</span><span>${sv && sv.svi != null ? sv.svi.toFixed(2) : "n/a"}</span>
        <span class="real">Aged 65+</span><span>${sv ? sv.pct65.toFixed(1) + "%" : "n/a"} → age ×${tr.am.toFixed(3)}</span>
        <span class="calc">Susceptible</span><span>${fmt(S * c.population)} (${pct(S)})</span>
        <span class="calc">Exposed</span><span>${fmt(E * c.population)} (${pct(E)})</span>
        <span class="calc">Infectious</span><span>${fmt(I * c.population)} (${pct(I)})</span>
        <span class="calc">Removed</span><span>${fmt(R * c.population)} (${pct(R)})</span>
        <span class="fict">R0 / effective R</span><span>${tr.r0(t).toFixed(1)} / ${tr.rEffective(t).toFixed(1)}</span>
      </div>
      <div class="chartbox"><canvas id="seir" width="680" height="320"></canvas><div class="tip" id="seir-tip"></div></div>
      <div class="legend" id="seir-legend"></div>
      <div class="src">Weather station: ${esc(st.label)} (${st.id}), ${uD(s.station_distance_mi)} from the county's internal point. Story text may describe a fictional storm colder than this normal.
      <br><span class="real">green = real data</span> · <span class="calc">blue = calculated</span> · <span class="fict">orange = fictional</span>. Each county's curve is modeled on its own (no travel between counties).</div>`;
    $("stop-pick").addEventListener("change", (e) => { inspectStop = +e.target.value; drawOutbreak(g); });
    drawSeir(tr, t);
  }
  // Line styles: colour AND dash pattern AND marker shape, so the lines can be told apart without colour.
  const SEIR_STYLE = [
    { j: 0, n: "Susceptible", col: "#8ccbe8", dash: [], w: 2.5, mk: "circle" },
    { j: 1, n: "Exposed", col: "#e3b45a", dash: [10, 6], w: 2.5, mk: "square" },
    { j: 2, n: "Infectious", col: "#ef5b5f", dash: [], w: 4, mk: "triangle" },
    { j: 3, n: "Removed", col: "#5cc785", dash: [2, 5], w: 3, mk: "diamond" },
  ];
  function marker(x, kind, px, py, col, r = 5) {
    x.fillStyle = col; x.beginPath();
    if (kind === "circle") x.arc(px, py, r, 0, 7);
    else if (kind === "square") x.rect(px - r, py - r, 2 * r, 2 * r);
    else if (kind === "triangle") { x.moveTo(px, py - r - 1); x.lineTo(px + r + 1, py + r); x.lineTo(px - r - 1, py + r); x.closePath(); }
    else { x.moveTo(px, py - r - 1); x.lineTo(px + r + 1, py); x.lineTo(px, py + r + 1); x.lineTo(px - r - 1, py); x.closePath(); }
    x.fill();
  }
  function legendHTML(items) {
    const svgMk = (k, c) => k === "circle" ? `<circle cx="22" cy="7" r="4" fill="${c}"/>` : k === "square" ? `<rect x="18" y="3" width="8" height="8" fill="${c}"/>`
      : k === "triangle" ? `<polygon points="22,2 27,12 17,12" fill="${c}"/>` : k === "diamond" ? `<polygon points="22,2 27,7 22,12 17,7" fill="${c}"/>` : "";
    return items.map((s) => `<span class="lg"><svg width="44" height="14" aria-hidden="true"><line x1="2" y1="7" x2="42" y2="7" stroke="${s.col}" stroke-width="${Math.min(4, s.w)}" ${s.dash.length ? `stroke-dasharray="${s.dash.join(",")}"` : ""}/>${svgMk(s.mk, s.col)}</svg>${esc(s.n)}</span>`).join("");
  }
  function drawSeir(tr, tNow) {
    const c = $("seir"), x = c.getContext("2d"), W = c.width, H = c.height, L = 64, Rr = 14, T = 16, Bm = 44;
    const t0 = P.outbreak_start_day - 1, t1 = P.outbreak_start_day + P.deadline_hours / 24 + 0.5;
    const X = (t) => L + (t - t0) / (t1 - t0) * (W - L - Rr), Y = (v) => T + (1 - v) * (H - T - Bm);
    x.clearRect(0, 0, W, H); x.fillStyle = "#0b121a"; x.fillRect(0, 0, W, H);
    x.strokeStyle = "#1c2b39"; x.lineWidth = 1; x.font = "20px 'IBM Plex Mono', monospace"; x.fillStyle = "#93a7b7";
    for (let v = 0; v <= 1.001; v += 0.25) { x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(W - Rr, Y(v)); x.stroke(); x.textAlign = "right"; x.fillText(Math.round(v * 100) + "%", L - 6, Y(v) + 4); }
    for (let d = 1; d <= 7; d++) { const tt = P.outbreak_start_day + (d - 1); x.textAlign = "center"; x.fillText("D" + d, X(tt), H - 12); }
    for (const s of SEIR_STYLE) {
      x.strokeStyle = s.col; x.lineWidth = s.w; x.setLineDash(s.dash); x.beginPath();
      for (let k = 0; k <= 160; k++) { const t = t0 + (t1 - t0) * k / 160, v = tr.at(t)[s.j]; k ? x.lineTo(X(t), Y(v)) : x.moveTo(X(t), Y(v)); }
      x.stroke(); x.setLineDash([]);
      for (let k = 0; k <= 8; k++) { const t = t0 + (t1 - t0) * (k + s.j * 0.25) / 8.5; marker(x, s.mk, X(t), Y(tr.at(t)[s.j]), s.col); }
    }
    x.strokeStyle = "#ff8a1f"; x.lineWidth = 2; x.setLineDash([5, 4]); x.beginPath(); x.moveTo(X(tNow), T); x.lineTo(X(tNow), H - Bm); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#ff8a1f"; x.textAlign = "left"; x.fillText("now", Math.min(W - 50, X(tNow) + 4), T + 18);
    if ($("seir-legend")) $("seir-legend").innerHTML = legendHTML(SEIR_STYLE) + `<span class="lg"><svg width="44" height="14"><line x1="2" y1="7" x2="42" y2="7" stroke="#ff8a1f" stroke-width="2" stroke-dasharray="5,4"/></svg>now</span>`;
    c.onmousemove = (e) => {
      const r = c.getBoundingClientRect(), mx = (e.clientX - r.left) * W / r.width;
      const t = t0 + (mx - L) / (W - L - Rr) * (t1 - t0), tip = $("seir-tip");
      if (t < t0 || t > t1) { tip.style.display = "none"; return; }
      const v = tr.at(t), gh = (t - P.outbreak_start_day) * 24;
      tip.innerHTML = `${current ? current.fmtHour(gh) : ""} (outbreak day ${t.toFixed(2)})<br>S ${pct(v[0])} · E ${pct(v[1])}<br>I ${pct(v[2])} · R ${pct(v[3])}<br>Re ${tr.rEffective(t).toFixed(1)}`;
      tip.style.display = "block"; tip.style.left = Math.min(r.width - 190, e.clientX - r.left + 10) + "px"; tip.style.top = (e.clientY - r.top - 70) + "px";
    };
    c.onmouseleave = () => ($("seir-tip").style.display = "none");
  }

  // ---------- developer notes: how the code works, with the live numbers ----------
  function devNotes(g) {
    const a = g.place.a, tr = g.traj[a], [temp, snow] = g.weather(), I = g.local()[2];
    $("devnotes").innerHTML = `<h3>How it's built <small>developer mode</small></h3>
      <div class="src">
      <b>Engine.</b> web/sim.js is a line-for-line port of zombie_sim/engine.py (Python). tests/test_parity.py plays 210 seeded games in both and checks they match.<br>
      <b>Randomness.</b> Mulberry32 with named streams (injury, infection, road, roll, minigame_*, treat, medicine, timeout…), so one roll never shifts another. Seed ${g.seed}.<br>
      <b>SEIR</b> (seir.py · Trajectory): RK4, 1-hour steps. β = β0 × density ×${tr.dm.toFixed(3)} × cold ×${tr.cm.toFixed(3)} × age ×${tr.am.toFixed(3)} × outbreak ×${g.strength.toFixed(3)} × winter ramp. Incubation ${P.incubation_days} d, γ ${P.gamma}.<br>
      <b>Arrival seeding</b> (data_loader.seed_routes · seir.calibrate_i0): this county starts the outbreak at ${(tr.i0 * 100).toPrecision(3)}% infectious, solved so it is near its target when you're scheduled to arrive: ${(P.seed_target_day1 * 100).toFixed(0)}% on Day 1 rising to ${(P.seed_target_day7 * 100).toFixed(0)}% on Day 7, ±${(P.seed_density_tilt * 100).toFixed(0)} points for density, never below ${(P.seed_target_min * 100).toFixed(0)}%.<br>
      <b>Age</b> ×(1 + ${P.age_slope} × (%65+ − ${g.ageRef.toFixed(2)})), clamped ${P.age_mult_min}–${P.age_mult_max}; %65+ from CDC SVI 2022 (ACS 2018–22).<br>
      <b>Injury</b> (engine.injury_breakdown) = min(${P.injury_cap}, base × weather × activity × night). Weather now ×${Math.min(P.weather_mult_max, 1 + P.weather_cold_slope * Math.max(0, 32 - temp) + (snow == null ? 0 : P.weather_snow_slope * snow)).toFixed(2)} (${uT(temp)}, snow ${snow == null ? "n/a" : uL(snow)}).<br>
      <b>Infection</b> (engine.infection_breakdown) = 1 − exp(−k × I × hours × setting × night × gear), I here = ${pct(I, 2)}.<br>
      <b>Events</b> (engine.event_due): rabies → fuel &lt; ${P.fuel_event_threshold} gal → R0 (scene 6) → SVI ≥ ${P.svi_event_threshold} → age ≥ ${P.age_event_threshold}%. SVI delay = 2 + 6 × SVI hours.<br>
      <b>Flags</b> ${g.flags.length ? esc(g.flags.join(", ")) : "none"} · pending callbacks ${g.pending.length} · infection ${g.infection ? (g.infection.treated ? "treated" : g.infection.warned ? "symptomatic" : "hidden, at " + g.fmtHour(g.infection.at)) : "none"}.<br>
      <b>Mini games</b> every 2 main picks: roll 0–100 on the pair's ratings (weather_rating for outdoor picks). 18-game pool, no repeats.<br>
      <b>Content</b> content/scenarios_v2.json (built by tools/build_content_v2.py). Option letters E = unlocked, F/G = conditional, R = rest.
      </div>`;
  }

  // ---------- screens ----------
  const screen = () => $("screen");
  function waitContinue(card, text = "Continue") {
    return new Promise((res) => {
      const b = el("button", "btn", text);
      card.appendChild(b);
      card.appendChild(el("div", "hint", "Press Enter once to continue"));
      b.focus({ preventScroll: true });
      let done = false;
      const go = () => { if (done) return; done = true; keyHandler = null; res(); };
      b.addEventListener("click", go);
      keyHandler = (e) => { if (e.key === "Enter") { go(); return true; } };
    });
  }
  const msgList = (msgs) => { const m = el("div", "msgs"); msgs.forEach((x) => m.appendChild(el("div", "msg " + (x.kind || "info"), T(x.text)))); return m; };
  const KIND = { main: "", callback: "Callback · something from earlier", detour: "Detour · your luck ran out", fallback: "On the road · the trip and the story collide", event: "Event · real data at this stop" };
  const RATING_WORD = { BEST: "BEST", OKAY: "OKAY", RISKY: "RISKY", WORST: "BAD" };

  function calcTable(o, r) {
    const i = r.injury, f = r.infection, a = r.attrs;
    const snow = i.snow_in == null ? "no NOAA snow normal, snow term skipped" : `${uL(i.snow_in)} normal snow`;
    return `<table class="calc-table">
      <tr><td>Rating</td><td>${o.rating}${o.looks ? " (" + esc(o.looks) + ")" : ""}${o.weather_rating ? " · weather rating " + o.weather_rating : ""}</td></tr>
      <tr><td>Injury</td><td>min(0.95, ${i.base.toFixed(2)} base × ${i.weather.toFixed(2)} weather × ${i.activity.toFixed(2)} ${a.activity} × ${i.time.toFixed(2)} time) = <b>${pct(i.p)}</b><br>
        weather: ${a.setting === "open" ? `${uT(i.temp_f)} January normal, ${snow}` : a.setting + " (sheltered from weather)"} · roll ${r.roll_injury.toFixed(3)} → ${r.hurt ? "hurt, −" + o.damage : "no injury"}</td></tr>
      <tr><td>Infection</td><td>1 − exp(−${f.k} k × ${f.prevalence.toFixed(4)} infectious × ${(+f.hours).toFixed(2)} h × ${f.setting} ${a.setting} × ${f.night} night × ${f.gear} gear) = <b>${pct(f.p, 2)}</b><br>
        exposure: ${a.exposure} · roll ${r.roll_infection.toFixed(3)} → ${r.infected ? "INFECTED (hidden from the player until symptoms)" : "not infected"}</td></tr>
      <tr><td>Time</td><td>${(+a.hours).toFixed(2)} h${a.travel_hours_saved ? `, saves up to ${a.travel_hours_saved} h of driving` : ""} · clock ${current.fmtHour(r.hour_before)} → ${current.fmtHour(r.hour_after)}</td></tr>
      <tr><td>Travel</td><td>fuel ${a.fuel_gal ? (a.fuel_gal > 0 ? "+" : "") + uV(a.fuel_gal) : "none"}${a.vehicle ? " · vehicle " + a.vehicle : ""}${a.miles_bonus ? " · +" + uD(a.miles_bonus) : ""}</td></tr>
      ${o.harm ? `<tr><td>Fixed cost</td><td>−${o.harm.health} health (${esc(o.harm.reason)})</td></tr>` : ""}
      ${o.treat ? `<tr><td>Treatment</td><td>${pct(P.treatment_success, 0)} cure if infected</td></tr>` : ""}
      <tr><td>From the text</td><td>${esc(a.evidence || "no time, fuel or vehicle effect in the text")}</td></tr>
    </table>`;
  }

  // ---------- the status dashboard shown between scenes ----------
  function snapshot(g) { return { health: g.health, food: g.food, water: g.water, fuel: g.fuel, left: Math.max(0, g.totalMi - g.miles), hour: g.hour }; }
  function statTiles(g) {
    const now = snapshot(g), d = (k) => now[k] - snap[k];
    const tile = (label, val, delta, deltaTxt, goodUp = true) => {
      const cls = Math.abs(delta) < 0.05 ? "" : (delta > 0) === goodUp ? "pos" : "neg";
      return `<div class="tile"><span>${label}</span><b>${val}</b><i class="${cls}">${Math.abs(delta) < 0.05 ? "no change" : deltaTxt}</i></div>`;
    };
    const sg = (v, dd = 0) => (v >= 0 ? "+" : "−") + Math.abs(v).toFixed(dd);
    return el("div", "tiles", [
      tile("Health", Math.round(now.health), d("health"), sg(d("health"))),
      tile("Food", Math.round(now.food), d("food"), sg(d("food"))),
      tile("Water", Math.round(now.water), d("water"), sg(d("water"))),
      tile("Fuel", uV(now.fuel), d("fuel"), (d("fuel") >= 0 ? "+" : "−") + uV(Math.abs(d("fuel")))),
      tile(metric ? "Km left" : "Miles left", uDn(now.left), -d("left"), (d("left") <= 0 ? "−" : "+") + uDn(Math.abs(d("left"))), true),
      tile("Clock", g.fmtHour(g.hour).replace("Day ", "D"), 0.0001 + d("hour"), "+" + d("hour").toFixed(1) + " h", true).replace('class="pos"', 'class=""'),
    ].join(""));
  }
  function healthWhy(msgs) { return msgs.filter((m) => m.health && m.health < 0); }
  function outcomeBlock(g, it) {
    const { o, r } = it, box = el("div", "dash-sec");
    const dH = it.healthAfter - r.before.health, hurts = healthWhy(r.msgs);
    const word = RATING_WORD[o.rating] || o.rating;
    box.appendChild(el("div", "outcome-head", `<span class="rating r-${o.rating}">${word}</span><span><b>${esc(o.letter)}.</b> ${T(o.text)}</span>`));
    box.appendChild(el("p", "text", T(o.note)));
    let why;
    if (dH < -0.05) why = `<b>Health −${Math.abs(dH).toFixed(0)}.</b> ` + (hurts.length ? hurts.map((m) => T(m.why) + ` (−${Math.abs(m.health).toFixed(0)})`).join("; ") : "the choice took its toll") + ".";
    else if (dH > 0.05) why = `<b>Health +${dH.toFixed(0)}.</b> ${o.heal ? "Rest and first aid helped." : "You recovered a little."}`;
    else why = `<b>Health unchanged.</b> ${r.injury.p > 0.15 ? "A real chance of getting hurt here, but you came through." : "A low-risk choice: no injury."}`;
    if (o._timedOut) why = "<b>Too slow!</b> You froze, and your feet chose for you. " + why;
    box.appendChild(el("p", "why " + (dH < -0.05 ? "neg" : dH > 0.05 ? "pos" : ""), why));
    const rest = r.msgs.filter((m) => !(m.health && m.health < 0));
    if (rest.length) box.appendChild(msgList(rest));
    if (dev) {
      const dd = el("details", "calc"); dd.open = true;
      dd.innerHTML = `<summary>How this was calculated (developer mode)</summary>` + calcTable(o, r);
      box.appendChild(dd);
    }
    return box;
  }
  function msgBlock(it) {
    const box = el("div", "dash-sec");
    box.appendChild(el("div", "tag", esc(it.title)));
    const hurts = healthWhy(it.msgs);
    box.appendChild(msgList(it.msgs.filter((m) => !(m.health && m.health < 0))));
    if (hurts.length) box.appendChild(el("p", "why neg", hurts.map((m) => `<b>Health −${Math.abs(m.health).toFixed(0)}:</b> ${T(m.why)}`).join("<br>")));
    return box;
  }
  async function flush(g) {
    if (!queue.length) { snap = snapshot(g); return; }
    hud(g);
    const items = queue.splice(0);
    items.forEach((it) => (it.kind === "outcome" ? it.r.msgs : it.msgs).filter((m) => m.health && m.health < 0).forEach((m) => healthLog.push({ hour: g.hour, why: m.why, amount: -m.health })));
    const card = el("div", "card dash");
    card.appendChild(el("div", "tag", "Status report · " + esc(g.fmtHour(g.hour)) + " · " + esc(g.placeLabel())));
    card.appendChild(statTiles(g));
    const hrs = g.hour - snap.hour;
    if (hrs > 0.05) card.appendChild(el("div", "hint", `Over these ${hrs.toFixed(1)} hours you ate and drank about ${(P.food_drain_per_12h * hrs / 12).toFixed(0)} food and ${(P.water_drain_per_12h * hrs / 12).toFixed(0)} water (they drain all the time).`));
    for (const it of items) card.appendChild(it.kind === "outcome" ? outcomeBlock(g, it) : msgBlock(it));
    screen().innerHTML = ""; screen().appendChild(card);
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    await waitContinue(card, g.ending ? "See how it ended" : "Continue");
    snap = snapshot(g);
  }

  const UI = {
    async choose(g, s, opts, kind) {
      await flush(g);
      return new Promise((resolve) => {
        hud(g);
        const card = el("div", "card");
        card.appendChild(el("div", "tag " + (kind === "callback" ? "cb" : kind === "detour" || kind === "fallback" ? "det" : kind === "event" ? "ev" : ""),
          esc(kind === "main" ? `Day ${s.day} · ${s.time}` : KIND[kind] || kind)));
        card.appendChild(el("h2", "", T(s.title)));
        card.appendChild(el("p", "text", T(s.text)));
        if (dev && kind === "event") card.appendChild(el("div", "dev", `data: ${esc(s.data || "")}${s.r0 != null ? ` · local R0 ${s.r0.toFixed(2)}` : ""}${s.svi != null ? ` · SVI ${s.svi.toFixed(4)} → delay ${s.delay_h.toFixed(2)} h` : ""}${s.pct65 != null ? ` · aged 65+ ${s.pct65}%` : ""} · ${esc(s.county || "")}`));
        const timer = el("div", "timer", "<i></i>");
        if (!dev) card.appendChild(timer);
        const list = el("div", "opts");
        const tags = { E: "unlocked", F: "only now", G: "only now", R: "rest" };
        const buttons = opts.map((o, i) => {
          const extra = o.unlock_flag ? "unlocked by an earlier choice" : o.condition ? { low_fuel: "low fuel", infected_symptoms: "you have symptoms", behind: "you're behind schedule", low_health: "low health" }[o.condition] : o.letter === "R" ? "rest" : "";
          const b = el("button", "opt", `<span class="k">${o.letter}</span><span>${T(o.text)}${extra ? ` <small class="flagtag">${esc(extra)}</small>` : ""}${dev ? ` <small class="hint">[${o.rating}${o.weather_rating ? "/" + o.weather_rating : ""}, base injury ${o.injury_chance}%${o.minigame ? ", game: " + esc(o.minigame) : ""}]</small>` : ""}</span>`);
          b.addEventListener("click", () => done(o, b)); list.appendChild(b); return b;
        });
        card.appendChild(list);
        const foot = el("div", "controls");
        const pauseBtn = el("button", "btn ghost small", "Pause (P)");
        if (!dev) foot.appendChild(pauseBtn);
        foot.appendChild(el("span", "hint", `${opts.map((o) => o.letter).join(" ")} or 1–${opts.length} to choose · ${dev ? "no timer (developer mode)" : P.timer_seconds + " seconds · P to pause (" + PAUSE_COOLDOWN_S + " s cooldown)"}`));
        card.appendChild(foot);
        const veil = el("div", "veil hidden", `<b>Paused</b><span>Press P or Resume to continue.</span>`);
        card.appendChild(veil);
        screen().innerHTML = ""; screen().appendChild(card);
        let finished = false, pausedAt = null, pausedTotal = 0;
        const t0 = performance.now(), bar = timer.firstChild;
        function pauseLabel() {
          const cd = PAUSE_COOLDOWN_S - (performance.now() - lastPauseEnd) / 1000;
          pauseBtn.disabled = pausedAt == null && cd > 0;
          pauseBtn.textContent = pausedAt != null ? "Resume (P)" : cd > 0 ? `Pause in ${Math.ceil(cd)} s` : "Pause (P)";
        }
        function togglePause() {
          if (dev || finished) return;
          if (pausedAt == null) {
            if ((performance.now() - lastPauseEnd) / 1000 < PAUSE_COOLDOWN_S) return;
            pausedAt = performance.now(); card.classList.add("paused"); veil.classList.remove("hidden");
          } else {
            pausedTotal += performance.now() - pausedAt; pausedAt = null; lastPauseEnd = performance.now();
            card.classList.remove("paused"); veil.classList.add("hidden");
          }
          pauseLabel();
        }
        pauseBtn.addEventListener("click", togglePause);
        function tick() {
          if (finished) return;
          pauseLabel();
          if (pausedAt == null && !dev) {
            const left = 1 - (performance.now() - t0 - pausedTotal) / (P.timer_seconds * 1000);
            bar.style.width = Math.max(0, left * 100) + "%";
            bar.style.background = left > 0.5 ? "var(--hazard)" : left > 0.25 ? "#e3b45a" : "var(--blood)";
            if (left <= 0) { const i = Math.floor(g.rng.get("timeout").random() * opts.length); done(opts[i], buttons[i], true); return; }
          }
          requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
        function done(o, b, timedOut) {
          if (finished || pausedAt != null) return;
          finished = true; keyHandler = null;
          buttons.forEach((x) => (x.disabled = true)); b.classList.add("picked");
          o._timedOut = !!timedOut;
          setTimeout(() => resolve(o.letter), 250);
        }
        keyHandler = (e) => {
          const k = e.key.toUpperCase();
          if (k === "P") { togglePause(); return true; }
          if (pausedAt != null) return;
          let i = opts.findIndex((o) => o.letter === k);
          if (i < 0) i = "1234567".indexOf(e.key);
          if (i >= 0 && opts[i]) { done(opts[i], buttons[i]); return true; }
        };
      });
    },
    async outcome(g, s, o, r) {
      queue.push({ kind: "outcome", o, r, s, healthAfter: g.health });
    },
    async message(g, title, msgs) {
      if (msgs && msgs.length) queue.push({ kind: "msg", title, msgs: msgs.slice() });
    },
    async minigame(g, name, tier, double) {
      await flush(g);
      hud(g);
      if (window.__ZE_SIM_MINIGAMES) return null;   // automated tests: use the simulated result
      const res = await playMinigame(name, tier, double, g);
      return { win: !!res.win, bonus: res.bonus || {} };
    },
    async end(g) { await flush(g); hud(g); keyHandler = null; await endScreen(g); },
  };

  // ---------- end screen + Monte Carlo ----------
  const END_COL = { VICTORY: "var(--safe)", DIED: "var(--blood)", TURNED: "#c58cf0", TOO_LATE: "#e3b45a", STRANDED: "var(--ice)", DENIED: "var(--muted)" };
  const END_TITLE = { VICTORY: "You survived", DIED: "You didn't make it", TURNED: "You turned", TOO_LATE: "Too late", STRANDED: "Stranded", DENIED: "Turned away" };
  async function endScreen(g) {
    const s = g.summary(), won = g.ending === "VICTORY";
    const card = el("div", "card end " + (won ? "won" : "lost"));
    card.appendChild(el("div", "tag", won ? `${esc(g.city.end)} safe zone` : "Game over"));
    const h = el("h2", "", END_TITLE[g.ending]); h.style.color = END_COL[g.ending]; card.appendChild(h);
    card.appendChild(el("p", "text", esc(Z.ENDINGS[g.ending]) + (g.endingDetail ? ` <span class="hint">(${T(g.endingDetail)})</span>` : "")));
    card.appendChild(el("div", "bigstats", `
      <div><b>${Math.round(g.health)}</b><span>health</span></div><div><b>${Math.round(g.food)}</b><span>food</span></div>
      <div><b>${Math.round(g.water)}</b><span>water</span></div><div><b>${uV(g.fuel)}</b><span>fuel</span></div>
      <div><b>${uDn(s.miles_left)}</b><span>${metric ? "km" : "miles"} left</span></div><div><b>${(g.hour / 24).toFixed(2)}</b><span>days used</span></div>`));
    card.appendChild(el("p", "hint", `Seed ${g.seed} · picks: ${s.choices.BEST} best, ${s.choices.OKAY} okay, ${s.choices.RISKY} risky, ${s.choices.WORST} bad · injuries ${g.injuries} · infected ${g.infections ? "yes" : "no"} · mini games won ${g.minigameLog.wins} of ${g.minigameLog.HARD + g.minigameLog.NORMAL + g.minigameLog.EASY}${s.events.length ? " · real-data events: " + s.events.join(", ") : ""}`));
    card.appendChild(el("div", "tag", "Your trip over time"));
    card.appendChild(el("div", "chartbox big", `<canvas id="timeline" width="1100" height="520"></canvas>`));
    card.appendChild(el("div", "legend", "", ""));
    const lg = card.lastChild;
    card.appendChild(el("div", "tag", "Every health loss, and why"));
    card.appendChild(healthTable());
    card.appendChild(el("div", "tag", "Whole-trip ledger"));
    card.appendChild(ledgerTable(g));
    card.appendChild(el("div", "tag", "The outbreak model (hidden during play)"));
    card.appendChild(el("p", "hint", "Infectious share in each county on your route, Day 1 to Day 7 (SEIR model). The outbreak panel beside the map now shows every stop's full S, E, I and R curves; pick a stop to inspect it."));
    card.appendChild(el("div", "chartbox big", `<canvas id="allstops" width="1100" height="460"></canvas>`));
    card.appendChild(el("div", "legend", "", ""));
    const lg2 = card.lastChild;
    card.appendChild(el("div", "tag", "How contagious? Your route's zombie R0 vs real diseases"));
    card.appendChild(r0Table(g));
    const mc = el("div", "", ""); mc.style.cssText = "display:flex;flex-direction:column;gap:10px";
    card.appendChild(mc);
    const again = el("button", "btn ghost", "Play again");
    again.addEventListener("click", () => { screen().innerHTML = ""; current = null; titleScreen(); window.scrollTo(0, 0); });
    card.appendChild(again);
    screen().innerHTML = ""; screen().appendChild(card);
    window.scrollTo(0, 0);
    drawTimeline(g, lg);
    drawAllStops(g, lg2);
    await runMonteCarlo(g, mc);
  }
  function healthTable() {
    const t = el("table", "ledger");
    if (!healthLog.length) { t.innerHTML = "<tr><td>No health lost on this trip.</td></tr>"; return t; }
    t.innerHTML = "<tr><th>When</th><th>Health</th><th style='text-align:left'>Reason</th></tr>" +
      healthLog.map((h) => `<tr><td>${esc(current.fmtHour(h.hour))}</td><td class="neg">−${h.amount.toFixed(0)}</td><td style="text-align:left">${T(h.why)}</td></tr>`).join("");
    return t;
  }
  function ledgerTable(g) {
    const t = el("table", "ledger");
    const rows = ["health", "food", "water", "fuel"].map((k) => {
      const inn = g.ledger.filter((l) => l[k] > 0).reduce((a, l) => a + l[k], 0), out = g.ledger.filter((l) => l[k] < 0).reduce((a, l) => a - l[k], 0);
      const net = inn - out, f = (v) => (k === "fuel" ? uV(v) : v.toFixed(1));
      return `<tr><td>${k[0].toUpperCase() + k.slice(1)}</td><td>+${f(inn)}</td><td>−${f(out)}</td><td class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : "−"}${f(Math.abs(net))}</td></tr>`;
    });
    const by = {};
    g.ledger.forEach((l) => { const k = l.source.replace(/ \(.*\)$/, ""); by[k] = by[k] || { health: 0, fuel: 0 }; by[k].health += l.health; by[k].fuel += l.fuel; });
    t.innerHTML = "<tr><th></th><th>In</th><th>Out</th><th>Net</th></tr>" + rows.join("") +
      `<tr><th colspan="4" style="text-align:left;padding-top:10px">Health by cause</th></tr>` +
      Object.entries(by).filter(([, v]) => Math.abs(v.health) > 0.05).map(([k, v]) => `<tr><td>${esc(k)}</td><td colspan="3" class="${v.health >= 0 ? "pos" : "neg"}">${v.health >= 0 ? "+" : ""}${v.health.toFixed(1)}</td></tr>`).join("");
    return t;
  }
  const TL_STYLE = [
    { k: "health", n: "Health", col: "#ef5b5f", dash: [], w: 4, mk: "circle" },
    { k: "food", n: "Food", col: "#e3b45a", dash: [14, 7], w: 3, mk: "square" },
    { k: "water", n: "Water", col: "#8ccbe8", dash: [3, 6], w: 3.5, mk: "triangle" },
    { k: "fuel", n: "Fuel (% of tank)", col: "#c58cf0", dash: [16, 5, 3, 5], w: 3, mk: "diamond" },
  ];
  function drawTimeline(g, legend) {
    const c = $("timeline"), x = c.getContext("2d"), W = c.width, H = c.height, L = 64, Rr = 20, T0 = 20, Bm = 50;
    const hmax = Math.max(P.deadline_hours, g.hour);
    const X = (h) => L + h / hmax * (W - L - Rr), Y = (v) => T0 + (1 - v / 100) * (H - T0 - Bm);
    x.fillStyle = "#0b121a"; x.fillRect(0, 0, W, H);
    x.font = "18px 'IBM Plex Mono', monospace"; x.fillStyle = "#93a7b7"; x.strokeStyle = "#1c2b39"; x.lineWidth = 1;
    for (let v = 0; v <= 100; v += 25) { x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(W - Rr, Y(v)); x.stroke(); x.textAlign = "right"; x.fillText(v, L - 8, Y(v) + 6); }
    for (let d = 1; d <= 7; d++) { x.textAlign = "center"; x.fillText("Day " + d, X((d - 1) * 24 + 8), H - 16); x.beginPath(); x.moveTo(X((d - 1) * 24), T0); x.lineTo(X((d - 1) * 24), H - Bm); x.stroke(); }
    x.strokeStyle = "#ef5b5f99"; x.lineWidth = 2; x.setLineDash([6, 6]); x.beginPath(); x.moveTo(X(P.deadline_hours), T0); x.lineTo(X(P.deadline_hours), H - Bm); x.stroke(); x.setLineDash([]);
    x.fillStyle = "#ef5b5f"; x.textAlign = "right"; x.fillText("gates seal", X(P.deadline_hours) - 6, T0 + 18);
    const st = { health: P.start_health, food: P.start_food, water: P.start_water, fuel: P.start_fuel_gallons };
    const pts = { health: [[0, st.health]], food: [[0, st.food]], water: [[0, st.water]], fuel: [[0, st.fuel / P.tank_gallons * 100]] };
    for (const l of g.ledger) for (const k of ["health", "food", "water", "fuel"]) {
      if (!l[k]) continue; st[k] += l[k]; pts[k].push([l.hour, k === "fuel" ? st[k] / P.tank_gallons * 100 : st[k]]);
    }
    const valAt = (arr, h) => { let v = arr[0][1]; for (const [hh, vv] of arr) { if (hh > h) break; v = vv; } return v; };
    TL_STYLE.forEach((s, si) => {
      x.strokeStyle = s.col; x.lineWidth = s.w; x.setLineDash(s.dash); x.beginPath();
      pts[s.k].forEach(([hh, v], i) => (i ? x.lineTo(X(hh), Y(v)) : x.moveTo(X(hh), Y(v)))); x.lineTo(X(g.hour), Y(pts[s.k][pts[s.k].length - 1][1])); x.stroke(); x.setLineDash([]);
      for (let hh = si * 3; hh <= g.hour; hh += 12) marker(x, s.mk, X(hh), Y(valAt(pts[s.k], hh)), s.col, 6);
    });
    const evs = g.events.filter((e) => e.type === "infected" || e.type === "treatment" || e.type === "ending");
    evs.forEach((e) => {
      x.fillStyle = e.type === "infected" ? "#c58cf0" : e.type === "treatment" ? "#5cc785" : "#e6eef3";
      x.beginPath(); x.arc(X(e.hour), T0 + 4, 7, 0, 7); x.fill();
    });
    legend.innerHTML = legendHTML(TL_STYLE) +
      `<span class="lg"><svg width="44" height="14"><circle cx="22" cy="7" r="6" fill="#c58cf0"/></svg>infected</span><span class="lg"><svg width="44" height="14"><circle cx="22" cy="7" r="6" fill="#5cc785"/></svg>treatment</span><span class="lg"><svg width="44" height="14"><circle cx="22" cy="7" r="6" fill="#e6eef3"/></svg>ending</span><span class="lg"><svg width="44" height="14"><line x1="2" y1="7" x2="42" y2="7" stroke="#ef5b5f" stroke-width="2" stroke-dasharray="6,6"/></svg>gates seal (Day 7 midnight)</span>`;
  }
  const STOP_COLS = ["#8ccbe8", "#e3b45a", "#ef5b5f", "#5cc785", "#c58cf0", "#ff8a1f", "#e6eef3", "#f28cc0"];
  const STOP_DASH = [[], [12, 6], [3, 5], [16, 5, 3, 5], [], [12, 6], [3, 5], [16, 5, 3, 5]];
  const STOP_MK = ["circle", "square", "triangle", "diamond", "square", "circle", "diamond", "triangle"];
  function drawAllStops(g, legend) {
    const c = $("allstops"), x = c.getContext("2d"), W = c.width, H = c.height, L = 64, Rr = 20, T0 = 20, Bm = 50;
    const t0 = P.outbreak_start_day, t1 = P.outbreak_start_day + P.deadline_hours / 24;
    let ymax = 0; g.traj.forEach((tr) => { for (let k = 0; k <= 60; k++) ymax = Math.max(ymax, tr.at(t0 + (t1 - t0) * k / 60)[2]); });
    ymax = Math.max(0.05, Math.ceil(ymax * 20) / 20);
    const X = (t) => L + (t - t0) / (t1 - t0) * (W - L - Rr), Y = (v) => T0 + (1 - v / ymax) * (H - T0 - Bm);
    x.fillStyle = "#0b121a"; x.fillRect(0, 0, W, H);
    x.font = "18px 'IBM Plex Mono', monospace"; x.fillStyle = "#93a7b7"; x.strokeStyle = "#1c2b39"; x.lineWidth = 1;
    for (let v = 0; v <= ymax + 1e-9; v += ymax / 4) { x.beginPath(); x.moveTo(L, Y(v)); x.lineTo(W - Rr, Y(v)); x.stroke(); x.textAlign = "right"; x.fillText(Math.round(v * 100) + "%", L - 8, Y(v) + 6); }
    for (let d = 1; d <= 7; d++) { x.textAlign = "center"; x.fillText("Day " + d, X(t0 + d - 1 + 0.33), H - 16); }
    const items = [];
    g.traj.forEach((tr, i) => {
      const col = STOP_COLS[i], dash = STOP_DASH[i], mk = STOP_MK[i], w = i === 7 ? 4 : 2.5;
      x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash); x.beginPath();
      for (let k = 0; k <= 140; k++) { const t = t0 + (t1 - t0) * k / 140, v = tr.at(t)[2]; k ? x.lineTo(X(t), Y(v)) : x.moveTo(X(t), Y(v)); }
      x.stroke(); x.setLineDash([]);
      for (let k = 0; k <= 6; k++) { const t = t0 + (t1 - t0) * (k + i / 8) / 7; if (t <= t1) marker(x, mk, X(t), Y(tr.at(t)[2]), col, 5); }
      items.push({ n: `${i === 7 ? "Safe zone" : "Stop " + (i + 1)}: ${g.counties[g.stops[i].geoid].name}`, col, dash, w, mk });
    });
    legend.innerHTML = legendHTML(items);
  }
  function r0Table(g) {
    const t = el("table", "ledger r0");
    const t0 = P.outbreak_start_day, tEnd = P.outbreak_start_day + Math.min(g.hour, P.deadline_hours) / 24;
    const rows = g.stops.map((s, i) => `<tr><td>${i === 7 ? "Safe zone" : "Stop " + (i + 1)}: ${esc(g.counties[s.geoid].name)}</td><td>${g.traj[i].r0(t0).toFixed(1)}</td><td>${g.traj[i].r0(tEnd).toFixed(1)}</td><td class="fict">fictional zombie</td></tr>`).join("");
    const real = (B.reference && B.reference.r0 || []).map((r) => `<tr><td>${esc(r.disease)}</td><td colspan="2">${r.r0_central ? esc(r.r0_central) + " (" + esc(r.r0_low) + "–" + esc(r.r0_high) + ")" : esc(r.r0_low) + "–" + esc(r.r0_high)}</td><td class="real">${esc(r.source)}</td></tr>`).join("");
    t.innerHTML = `<tr><th style="text-align:left">Where / what</th><th>R0 Day 1</th><th>R0 at the end</th><th style="text-align:left">Source</th></tr>${rows}<tr><th colspan="4" style="text-align:left;padding-top:10px">Measured R0 of real diseases (data/r0_reference.csv)</th></tr>${real}`;
    return t;
  }

  const POL_LABEL = { you: "Your style", balanced: "Balanced", lowest_risk: "Lowest risk", supplies: "Max supplies", speed: "Max speed", random: "Random", best_rating: "Always BEST (oracle)" };
  async function runMonteCarlo(g, box) {
    const RUNS = 500;
    box.appendChild(el("div", "tag", `Monte Carlo: ${RUNS} simulated trips on this route per strategy`));
    const status = el("p", "hint", "Running…"); box.appendChild(status);
    const ratings = g.summary().choices;
    const pols = Object.assign({ you: Z.stylePolicy(ratings) }, Z.POLICIES);
    const res = {};
    for (const [name, fn] of Object.entries(pols)) {
      status.textContent = `Running ${POL_LABEL[name]}…`;
      await sleep(10);
      res[name] = await Z.monteCarlo(B, g.code, fn, RUNS, 1, async () => { await sleep(0); });
    }
    status.innerHTML = `Seeds 1–${RUNS}, the same for every strategy (matched random streams). "Your style" picks BEST/OKAY/RISKY/WORST options as often as you just did (${ratings.BEST}/${ratings.OKAY}/${ratings.RISKY}/${ratings.WORST}). Mini games are simulated (win ${P.minigame_win_prob_sim.HARD * 100}/${P.minigame_win_prob_sim.NORMAL * 100}/${P.minigame_win_prob_sim.EASY * 100}% hard/normal/easy). These are probabilities inside the game's fictional model, not real-world odds.`;
    const t = el("table", "mc");
    t.innerHTML = `<tr><th>Strategy</th><th>Survive</th><th>Died</th><th>Turned</th><th>Late</th><th>Stranded</th><th>Denied</th><th>Days</th><th>Health*</th></tr>` +
      Object.entries(res).map(([k, r]) => `<tr class="${k === "you" ? "you" : ""}"><td>${POL_LABEL[k]}</td><td>${pct(r.survival_rate, 0)}</td><td>${pct(r.endings.DIED, 0)}</td><td>${pct(r.endings.TURNED, 0)}</td><td>${pct(r.endings.TOO_LATE, 0)}</td><td>${pct(r.endings.STRANDED, 0)}</td><td>${pct(r.endings.DENIED, 0)}</td><td>${r.avg_days.toFixed(2)}</td><td>${isNaN(r.avg_health_survivors) ? "–" : Math.round(r.avg_health_survivors)}</td></tr>`).join("");
    box.appendChild(t);
    box.appendChild(el("div", "hint", "*average health of survivors. Days = average game days used."));
    const cb = el("div", "chartbox", `<canvas id="mcchart" width="900" height="${Object.keys(res).length * 40 + 30}"></canvas>`); box.appendChild(cb);
    const c = $("mcchart"), x = c.getContext("2d"), W = c.width, L = 200;
    x.fillStyle = "#0b121a"; x.fillRect(0, 0, W, c.height);
    const cols = { VICTORY: "#5cc785", DIED: "#ef5b5f", TURNED: "#c58cf0", TOO_LATE: "#e3b45a", STRANDED: "#8ccbe8", DENIED: "#93a7b7" };
    Object.entries(res).forEach(([k, r], i) => {
      const y = 12 + i * 40; let left = L;
      x.fillStyle = k === "you" ? "#ff8a1f" : "#e6eef3"; x.font = "15px 'IBM Plex Mono', monospace"; x.textAlign = "right"; x.fillText(POL_LABEL[k], L - 10, y + 18);
      for (const e of Object.keys(cols)) { const w = r.endings[e] * (W - L - 16); x.fillStyle = cols[e]; x.fillRect(left, y, w, 26); left += w; }
    });
    box.appendChild(el("div", "hint", Object.entries(cols).map(([k, v]) => `<span style="color:${v}">■</span> ${k}`).join(" · ")));
  }

  // =====================================================================

  // =====================================================================
  // MINI GAMES
  // =====================================================================
  // Each entry: the story, then a clear Goal / Controls / To win.
  const INFO = {
    "Lock the Door": { story: "The infected are slamming the door. A marker slides back and forth across the lock bar.",
      goal: "Lock the door before it gives way.", controls: "SPACE, Enter or the LOCK button.", win: "Press while the marker is inside the GREEN zone. Up to 3 rounds: lock it 2 times before you miss 2 times." },
    "Escape the Horde": { story: "You're trapped in a parking lot full of wrecked cars (#).",
      goal: "Reach the exit (E) without being caught.", controls: "ARROW keys, WASD or the on-screen pad. Each press moves one square.", win: "Step onto E before any infected (Z) steps onto you. Cars (#) block you and them." },
    "Dodge the Wrecks": { story: "You're racing down a jammed highway at night.",
      goal: "Survive to the end of the road.", controls: "LEFT/RIGHT arrows, A/D, or the lane buttons.", win: "Don't hit a wreck (#) or an infected (Z). Water bottles (W) are a bonus, not required." },
    "Barricade the Door": { story: "Words fall toward the door like boards you have to nail in place.",
      goal: "Nail 6 boards before the words reach the door.", controls: "Type a falling word in the box. It nails itself as soon as it's spelled right (no Enter needed). Enter clears the box.", win: "Type 6 words. Words allowed to reach the door: HARD 0, NORMAL 1, EASY 2." },
    "Safe or Unsafe?": { story: "Supplies slide down a conveyor toward your pack.",
      goal: "Keep only what's safe to eat or drink.", controls: "S = safe, U = unsafe (or the buttons).", win: "Answer 4 of the 5 items correctly before each one reaches the end." },
    "Count the Infected": { story: "A crowd shuffles past your hiding spot.",
      goal: "Count only the infected (red Z). Ignore survivors (green H).", controls: "Watch, then type your count and press Enter (15 seconds to answer).", win: "2 rounds. Each count must be within 2 of the real number. Exactly right = \"Good job!\"" },
    "Crack the Supply Locker": { story: "A locked supply cabinet, and footsteps getting closer.",
      goal: "Find the locker code (a number from 1 to 20).", controls: "Type a guess and press Enter. Each wrong guess says HIGHER or LOWER.", win: "Find the code before you run out of guesses or time: HARD 4 guesses / 15 s, NORMAL 5 / 25 s, EASY 6 / 45 s." },
    "Decode the Radio": { story: "A rescue broadcast is breaking up with static.",
      goal: "Unscramble the broadcast words.", controls: "Type the real word and press Enter. Static (#) flickers over the letters.", win: "Unscramble 2 words, each before its timer runs out: HARD 8 s, NORMAL 12 s, EASY 20 s each." },
  };
  const COL = { bg: "#070c12", line: "#2b3d4f", frost: "#e6eef3", muted: "#93a7b7", hazard: "#ff8a1f", ice: "#8ccbe8", blood: "#ef5b5f", safe: "#5cc785", food: "#e3b45a" };

  function stakes(name, tier, double) {
    const R = B.content.realistic_minigames.find((x) => x.name === name);
    if (R) return `<b>Win:</b> ${esc(R.win_text)}. <b>Lose:</b> ${tier === "EASY" ? "nothing (EASY tier)" : esc(R.fail_text)}.`;
    const rw = B.minigames[name];
    if (tier === "HARD") return `<b>Win:</b> +${P.hard_win_health} health. <b>Lose:</b> −${P.hard_loss_damage[0]} to −${P.hard_loss_damage[1]} health.`;
    if (tier === "NORMAL") return `<b>Win:</b> +${P.minigame_reward.NORMAL} ${rw}. <b>Lose:</b> −${P.normal_loss_damage[0]} to −${P.normal_loss_damage[1]} health.`;
    return `<b>Win:</b> +${P.minigame_reward.EASY * (double ? 2 : 1)} ${rw}${double ? " (double reward)" : ""}. <b>Lose:</b> nothing.`;
  }
  // real-world context for the realistic games, taken from the current stop
  function realEnv(g, name) {
    const a = g.place.a, b = Math.min(7, g.place.a === g.place.b ? a + 1 : g.place.b), s1 = g.stops[a], s2 = g.stops[b];
    const temp = g.weather()[0], I = g.local()[2];
    const rad = Math.PI / 180, dl = (s2.lon - s1.lon) * rad;
    const bearing = a === b ? 0 : (Math.atan2(Math.sin(dl) * Math.cos(s2.lat * rad), Math.cos(s1.lat * rad) * Math.sin(s2.lat * rad) - Math.sin(s1.lat * rad) * Math.cos(s2.lat * rad) * Math.cos(dl)) / rad + 360) % 360;
    const cname = (s) => g.counties[s.geoid].name + ", " + g.counties[s.geoid].state;
    const others = shuffle(g.stops.filter((s, i) => i !== a).map(cname));
    const otherSafe = shuffle(B.content.cities.map((c) => c.end).filter((e) => e !== g.city.end)).slice(0, 2);
    return { G: B.content.realistic_minigames.find((x) => x.name === name), dev, tempF: temp, tempFtxt: uT(temp, 0), tempWrong1: uT(temp + 18, 0), tempWrong2: uT(temp - 18, 0),
      I, elevM: g.stations[s1.station].elev_m || 0, bearing, here: cname(s1), others, nextLabel: s2.label, nextCounty: cname(s2),
      safeName: g.city.end, otherSafe, infected: !!(g.infection && !g.infection.treated), coldLag: Math.max(0, Math.min(0.5, (32 - temp) / 50)) };
  }
  const REAL = window.ZE_REAL({ el, esc, makeCanvas: (a, w, h) => makeCanvas(a, w, h), text: (...a) => text(...a), COL,
    setKey: (f) => (keyHandler = f), setKeyUp: (f) => (keyUpHandler = f) });

  function playMinigame(name, tier, double, g) {
    return new Promise((resolve) => {
      const isReal = !!B.content.realistic_minigames.find((x) => x.name === name);
      const env = isReal && g ? realEnv(g, name) : null;
      const card = el("div", "card");
      const head = el("div", "mg-head", `<h2 style="font-size:clamp(28px,6vw,40px)">${esc(name)}</h2><span class="pill ${tier}">${tier}${double ? " · DOUBLE REWARD" : ""}</span>`);
      card.appendChild(el("div", "tag", isReal ? "Mini game · real-world skill" : "Mini game"));
      card.appendChild(head);
      let rows;
      if (isReal) {
        const steps = REAL.steps(name, tier, env), kinds = new Set(steps.map((s) => s.kind));
        const ctl = ["<b>1–5</b> or click a card: pick the right next step"];
        if (kinds.has("tap")) ctl.push("<b>SPACE</b> (or the button) repeatedly: tap / dig / turn");
        if (kinds.has("hold") || kinds.has("crank")) ctl.push("<b>hold SPACE</b> (or press and hold the button): raise the gauge, let go to lower it");
        if (kinds.has("stop")) ctl.push("<b>SPACE</b> or STOP: stop the climbing bar inside the green window");
        if (kinds.has("tune")) ctl.push("<b>LEFT/RIGHT</b> arrows, ◀ ▶ or the slider: tune until it's clear, then hold still");
        if (kinds.has("rhythm")) ctl.push("<b>SPACE</b> when the white ring is inside the green ring");
        if (kinds.has("inspect")) ctl.push("click each <b>Check</b> card to look closer");
        const lim = dev ? "no time limit (developer mode)" : `${(env.G.tiers.match(new RegExp(tier + "\\s+(\\d+)\\s*s")) || [0, { EASY: 120, NORMAL: 90, HARD: 70 }[tier]])[1]} seconds`;
        rows = [["Goal", `Do it the real way, in order: ${steps.map((s) => esc(s.short)).join(" → ")}.` + (tier === "EASY" ? "" : " (The order is hidden on NORMAL and HARD: work it out.)")],
          ["Controls", ctl.join("<br>")],
          ["To win", `Finish every step within ${lim}, before the NOISE meter reaches 100. Wrong steps cost time and add noise (more noise where more infected are around).`],
          ["Watch out", esc(env.G.mistakes)],
          ["Real data", `January normal here: ${uT(env.tempF)}${env.coldLag > 0 ? ` (below freezing: cold hands slow your controls by ${Math.round(env.coldLag * 100)}%)` : " (no cold-hands slowdown)"}.`],
          ["Stakes", stakes(name, tier, double)]];
      } else {
        const I = INFO[name];
        card.appendChild(el("p", "text", esc(I.story)));
        rows = [["Goal", esc(I.goal)], ["Controls", esc(I.controls)], ["To win", esc(I.win)], ["Stakes", stakes(name, tier, double)]];
      }
      card.appendChild(el("table", "howto", rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")));
      const start = el("button", "btn", "Start");
      card.appendChild(start);
      card.appendChild(el("div", "hint", "Press Enter to start. A 3-2-1 countdown comes first."));
      screen().innerHTML = ""; screen().appendChild(card);
      start.focus({ preventScroll: true });
      let started = false;
      const go = async () => {
        if (started) return; started = true;
        keyHandler = null;
        const tbl = card.querySelector("table.howto");
        [...card.querySelectorAll("p.text, .btn, .hint")].forEach((n) => n.remove());
        if (tbl && isReal) tbl.classList.add("compact"); else if (tbl) tbl.remove();
        const area = el("div", "", ""); area.style.cssText = "display:flex;flex-direction:column;gap:10px";
        card.appendChild(area);
        await countdown(area);
        const res = isReal ? await REAL.play(area, name, tier, env) : await GAMES[name](area, tier);
        keyHandler = null; keyUpHandler = null;
        area.innerHTML = "";
        if (tbl) tbl.remove();
        const hh = area.appendChild(el("h2", "", res.win ? "Good job!" : "Failed!")); hh.style.color = res.win ? COL.safe : COL.blood;
        if (res.note) area.appendChild(el("p", "text", esc(res.note)));
        await sleep(1300);
        resolve(res);
      };
      start.addEventListener("click", go);
      keyHandler = (e) => { if (e.key === "Enter") { go(); return true; } };
    });
  }

  async function countdown(area) {
    const h = el("h2", "", "3");
    h.style.cssText = "font-size:64px;color:" + COL.hazard;
    area.appendChild(h);
    for (const t of ["3", "2", "1", "GO!"]) { h.textContent = t; await sleep(500); }
    h.remove();
  }

  function makeCanvas(area, w, h) {
    const stage = el("div", "stage");
    const c = document.createElement("canvas");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr; c.height = h * dpr;
    const x = c.getContext("2d"); x.scale(dpr, dpr);
    stage.appendChild(c); area.appendChild(stage);
    return { c, x, w, h };
  }
  function text(x, s, px, py, color, size = 16, font = "IBM Plex Mono", align = "left", weight = "400") {
    x.fillStyle = color; x.font = `${weight} ${size}px "${font}", monospace`; x.textAlign = align; x.textBaseline = "middle"; x.fillText(s, px, py);
  }
  function timeBar(x, w, frac, y = 6) {
    x.fillStyle = "#0b121a"; x.fillRect(10, y, w - 20, 6);
    x.fillStyle = frac > 0.5 ? COL.hazard : frac > 0.25 ? COL.food : COL.blood;
    x.fillRect(10, y, (w - 20) * Math.max(0, frac), 6);
  }
  function loop(fn) {
    return new Promise((resolve) => {
      let last = performance.now();
      function f(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        const r = fn(dt, now);
        if (r !== undefined) resolve(r); else requestAnimationFrame(f);
      }
      requestAnimationFrame(f);
    });
  }
  function buttonRow(area, labels) {
    const row = el("div", "controls");
    const bs = labels.map((l) => { const b = el("button", "btn ghost", l); row.appendChild(b); return b; });
    area.appendChild(row);
    return bs;
  }
  function textInput(area, placeholder, digits) {
    const row = el("div", "controls");
    const inp = document.createElement("input");
    inp.id = "mg-input-" + Math.random().toString(36).slice(2, 7);
    inp.setAttribute("aria-label", placeholder);
    inp.placeholder = placeholder; inp.autocomplete = "off"; inp.spellcheck = false;
    if (digits) { inp.inputMode = "numeric"; inp.style.width = "140px"; }
    row.appendChild(inp); area.appendChild(row);
    setTimeout(() => inp.focus({ preventScroll: true }), 30);
    return inp;
  }

  const GAMES = {};

  // ---- 1. Lock the Door ----
  GAMES["Lock the Door"] = async (area, tier) => {
    const [zone, speed] = { HARD: [3, 44], NORMAL: [5, 30], EASY: [9, 20] }[tier];
    const { x, w, h } = makeCanvas(area, 640, 220);
    const [lockBtn] = buttonRow(area, ["LOCK"]);
    let wins = 0, losses = 0;
    for (let rnd = 1; rnd <= 3 && wins < 2 && losses < 2; rnd++) {
      const W = 44, start = rint(8, W - zone - 2);
      let pos = 0, dir = 1, passes = 0, pressed = false;
      const press = () => { pressed = true; };
      lockBtn.onclick = press;
      keyHandler = (e) => { if (e.key === " " || e.key === "Enter") { press(); return true; } };
      const ok = await loop((dt, now) => {
        pos += dir * speed * dt;
        if (pos >= W - 1) { pos = W - 1; dir = -1; passes++; } else if (pos <= 0) { pos = 0; dir = 1; passes++; }
        x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
        text(x, `ROUND ${rnd}/3   LOCKED ${wins}`, 16, 22, COL.frost, 15);
        const shake = Math.sin(now / 60) * 3;
        x.fillStyle = "#3a2a1c"; x.fillRect(w - 120 + shake, 40, 80, 150);
        text(x, "BANG!", w - 80 + shake, 30, COL.blood, 15, "IBM Plex Mono", "center", "600");
        const cell = 10, bx = 40, by = 120;
        for (let i = 0; i < W; i++) { x.fillStyle = i >= start && i < start + zone ? COL.safe : "#24323f"; x.fillRect(bx + i * cell, by, cell - 1, 22); }
        x.fillStyle = COL.hazard; x.fillRect(bx + Math.floor(pos) * cell - 1, by - 14, cell + 1, 50);
        if (pressed) return pos >= start && pos < start + zone;
        if (passes >= 4) return false;
      });
      ok ? wins++ : losses++;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, ok ? "LOCKED!" : "MISSED! The door cracks open...", w / 2, h / 2, ok ? COL.safe : COL.blood, 28, "Big Shoulders Display", "center", "800");
      await sleep(800);
    }
    return { win: wins >= 2 };
  };

  // ---- 2. Escape the Horde ----
  GAMES["Escape the Horde"] = async (area, tier) => {
    const [nz, step, limit] = { HARD: [5, 0.33, 25], NORMAL: [3, 0.5, 30], EASY: [2, 0.8, 40] }[tier];
    const GW = 40, GH = 14, CS = 16;
    const { x, w, h } = makeCanvas(area, GW * CS, GH * CS + 24);
    let grid, p, ex;
    const pathOK = (a, b) => { const seen = new Set([a + ""]), todo = [a]; while (todo.length) { const [y, xx] = todo.pop(); if (y === b[0] && xx === b[1]) return true; for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ny = y + dy, nx = xx + dx; if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] !== "#" && !seen.has(ny + "," + nx)) { seen.add(ny + "," + nx); todo.push([ny, nx]); } } } return false; };
    do {
      grid = Array.from({ length: GH }, () => Array.from({ length: GW }, () => (Math.random() < 0.18 ? "#" : " ")));
      p = [GH >> 1, 1]; ex = [rint(1, GH - 2), GW - 2];
      grid[p[0]][p[1]] = " "; grid[ex[0]][ex[1]] = " ";
    } while (!pathOK(p, ex));
    let zs = [];
    while (zs.length < nz) { const z = [rint(0, GH - 1), rint(GW / 3 | 0, GW - 4)]; if (grid[z[0]][z[1]] === " " && !(z[0] === ex[0] && z[1] === ex[1]) && !zs.some((q) => q[0] === z[0] && q[1] === z[1])) zs.push(z); }
    const move = (dy, dx) => { const ny = p[0] + dy, nx = p[1] + dx; if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] !== "#") p = [ny, nx]; };
    const pad = el("div", "pad", `<span class="sp"></span><button aria-label="Up">&#9650;</button><span class="sp"></span><button aria-label="Left">&#9664;</button><button aria-label="Down">&#9660;</button><button aria-label="Right">&#9654;</button>`);
    area.appendChild(pad);
    const [, up, , left, down, right] = pad.children;
    up.onclick = () => move(-1, 0); down.onclick = () => move(1, 0); left.onclick = () => move(0, -1); right.onclick = () => move(0, 1);
    const keys = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], w: [-1, 0], s: [1, 0], a: [0, -1], d: [0, 1] };
    keyHandler = (e) => { const k = keys[e.key] || keys[e.key.toLowerCase()]; if (k) { move(...k); return true; } };
    const zstep = (z, taken) => {
      const opts = [];
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = z[0] + dy, nx = z[1] + dx;
        if (ny >= 0 && ny < GH && nx >= 0 && nx < GW && grid[ny][nx] !== "#" && (!taken.has(ny + "," + nx) || (ny === p[0] && nx === p[1])))
          opts.push([Math.abs(ny - p[0]) + Math.abs(nx - p[1]) + Math.random() * 0.5, [ny, nx]]);
      }
      if (!opts.length) return z;
      if (Math.random() < 0.2) return opts[rint(0, opts.length - 1)][1];
      return opts.sort((a, b) => a[0] - b[0])[0][1];
    };
    let t = 0, zt = 0;
    const win = await loop((dt) => {
      t += dt; zt += dt;
      if (p[0] === ex[0] && p[1] === ex[1]) return true;
      if (zt >= step) { zt = 0; const taken = new Set(zs.map((z) => z + "")); zs = zs.map((z) => zstep(z, taken)); }
      if (zs.some((z) => z[0] === p[0] && z[1] === p[1]) || t > limit) return false;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      timeBar(x, w, 1 - t / limit, 8);
      for (let y = 0; y < GH; y++) for (let xx = 0; xx < GW; xx++) if (grid[y][xx] === "#") { x.fillStyle = "#2c4258"; x.fillRect(xx * CS + 1, 24 + y * CS + 1, CS - 2, CS - 2); }
      text(x, "E", ex[1] * CS + CS / 2, 24 + ex[0] * CS + CS / 2, COL.safe, 15, "IBM Plex Mono", "center", "600");
      zs.forEach((z) => text(x, "Z", z[1] * CS + CS / 2, 24 + z[0] * CS + CS / 2, COL.blood, 15, "IBM Plex Mono", "center", "600"));
      x.fillStyle = COL.hazard; x.beginPath(); x.arc(p[1] * CS + CS / 2, 24 + p[0] * CS + CS / 2, 6, 0, 7); x.fill();
    });
    return { win, note: win ? "You slipped out of the lot!" : "They caught up to you..." };
  };

  // ---- 3. Dodge the Wrecks ----
  GAMES["Dodge the Wrecks"] = async (area, tier) => {
    const [tick, dur, lives] = { HARD: [0.09, 20, 1], NORMAL: [0.14, 16, 2], EASY: [0.2, 12, 3] }[tier];
    const ROWS = 16, CAR = 14;
    const { x, w, h } = makeCanvas(area, 420, 360);
    const [lb, rb] = buttonRow(area, ["◀ Left", "Right ▶"]);
    let lane = 1, objs = [], hits = 0, bottles = 0, cool = 0, t = 0, acc = 0;
    const collide = () => { objs = objs.filter((o) => { if (o.r === CAR && o.l === lane) { o.k === "W" ? bottles++ : hits++; return false; } return true; }); };
    const steer = (d) => { lane = Math.max(0, Math.min(2, lane + d)); collide(); };
    lb.onclick = () => steer(-1); rb.onclick = () => steer(1);
    keyHandler = (e) => { const k = e.key.toLowerCase(); if (k === "arrowleft" || k === "a") { steer(-1); return true; } if (k === "arrowright" || k === "d") { steer(1); return true; } };
    const laneX = (l) => 60 + l * 100 + 50, rowY = (r) => 30 + r * 20;
    const win = await loop((dt) => {
      t += dt; acc += dt;
      while (acc >= tick) {
        acc -= tick;
        objs.forEach((o) => o.r++); collide(); objs = objs.filter((o) => o.r <= CAR);
        if (--cool <= 0) {
          const ls = shuffle([0, 1, 2]);
          ls.slice(0, Math.random() < 0.65 ? 1 : 2).forEach((l) => objs.push({ r: 0, l, k: Math.random() < 0.66 ? "#" : "Z" }));
          if (Math.random() < 0.3) objs.push({ r: 0, l: ls[2], k: "W" });
          cool = rint(3, 5);
        }
      }
      if (hits >= lives) return false;
      if (t >= dur) return true;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      timeBar(x, w, 1 - t / dur, 6);
      text(x, `HITS ${hits}/${lives}   WATER ${bottles}`, 14, 22, COL.frost, 13);
      x.fillStyle = "#151f29"; x.fillRect(60, 30, 300, 330);
      x.strokeStyle = COL.line; x.setLineDash([10, 12]); x.lineDashOffset = -t * 120;
      [160, 260].forEach((lx) => { x.beginPath(); x.moveTo(lx, 30); x.lineTo(lx, 360); x.stroke(); });
      x.setLineDash([]);
      objs.forEach((o) => {
        if (o.k === "#") { x.fillStyle = "#5c6f82"; x.fillRect(laneX(o.l) - 18, rowY(o.r) - 8, 36, 16); }
        else text(x, o.k, laneX(o.l), rowY(o.r), o.k === "Z" ? COL.blood : COL.ice, 20, "IBM Plex Mono", "center", "600");
      });
      x.fillStyle = COL.hazard; x.fillRect(laneX(lane) - 14, rowY(CAR) - 12, 28, 24);
      x.fillStyle = "#fff6c4"; x.fillRect(laneX(lane) - 12, rowY(CAR) - 14, 6, 4); x.fillRect(laneX(lane) + 6, rowY(CAR) - 14, 6, 4);
    });
    return { win, bonus: bottles ? { water: 5 * bottles } : {}, note: bottles ? `You grabbed ${bottles} water bottle(s).` : "" };
  };

  // ---- 4. Barricade the Door ----
  const WORDS = ["BOARD", "NAIL", "BRACE", "LOCK", "CHAIN", "WEDGE", "BOLT", "PLANK", "HAMMER", "SCREW", "BEAM", "DOOR"];
  GAMES["Barricade the Door"] = async (area, tier) => {
    const [fall, allowed] = { HARD: [0.55, 0], NORMAL: [0.8, 1], EASY: [1.15, 2] }[tier];
    const need = 6, ROWS = 13;
    const { x, w, h } = makeCanvas(area, 640, 320);
    const inp = textInput(area, "Type a word");
    let active = [], done = 0, breaches = 0, ft = 0, next = 0, t = 0;
    inp.addEventListener("input", () => {
      const v = inp.value.toUpperCase().replace(/[^A-Z]/g, "");
      const hit = active.find((a) => a.word === v);
      if (hit) { active = active.filter((a) => a !== hit); done++; inp.value = ""; }
    });
    keyHandler = (e) => { if (e.key === "Enter") { inp.value = ""; return true; } };
    const win = await loop((dt) => {
      t += dt; ft += dt;
      if (ft >= fall) { ft = 0; active.forEach((a) => a.row++); const lost = active.filter((a) => a.row >= ROWS); breaches += lost.length; active = active.filter((a) => a.row < ROWS); }
      if (t >= next && active.length < 3) {
        const used = active.map((a) => a.word);
        active.push({ word: shuffle(WORDS.filter((wd) => !used.includes(wd)))[0], row: 0, col: rint(20, 520) });
        next = t + fall * (3 + Math.random() * 2);
      }
      if (done >= need) return true;
      if (breaches > allowed) return false;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, `NAILED ${done}/${need}   BREACHES ${breaches}/${allowed}`, 14, 16, COL.frost, 13);
      const typed = inp.value.toUpperCase();
      active.forEach((a) => {
        const y = 36 + a.row * 20, near = a.row >= ROWS - 4;
        text(x, a.word, a.col, y, near ? COL.blood : COL.hazard, 22, "Big Shoulders Display", "left", "800");
        if (typed && a.word.startsWith(typed)) { x.font = '800 22px "Big Shoulders Display", sans-serif'; text(x, typed, a.col, y, COL.safe, 22, "Big Shoulders Display", "left", "800"); }
      });
      x.fillStyle = "#3a2a1c"; x.fillRect(0, h - 24, w, 24);
      text(x, "D O O R", w / 2, h - 12, COL.muted, 13, "IBM Plex Mono", "center");
    });
    inp.disabled = true;
    return { win };
  };

  // ---- 5. Safe or Unsafe? ----
  const SAFE_UNSAFE = [
    ["A bulging, swollen can of beans", "U"], ["Snow melted and boiled", "S"], ["Water from a red mine pit lake", "U"],
    ["A sealed bottle of water", "S"], ["A rusty, leaking can of soup", "U"], ["A chocolate bar from a gas station", "S"],
    ["Lake water you didn't boil", "U"], ["A jar of honey from a pantry", "S"], ["Raw meat from a truck that thawed days ago", "U"],
    ["A sealed pack of crackers", "S"], ["Eating snow instead of melting it first", "U"], ["Water from a home's water heater tank", "S"],
  ];
  GAMES["Safe or Unsafe?"] = async (area, tier) => {
    const speed = { HARD: 13, NORMAL: 8, EASY: 5 }[tier], TRACK = 46;
    const { x, w, h } = makeCanvas(area, 640, 200);
    const [sb, ub] = buttonRow(area, ["S · Safe", "U · Unsafe"]);
    let right = 0;
    const items = shuffle(SAFE_UNSAFE.slice()).slice(0, 5);
    for (let n = 0; n < 5; n++) {
      const [label, truth] = items[n];
      let pos = TRACK, ans = null;
      sb.onclick = () => (ans = "S"); ub.onclick = () => (ans = "U");
      keyHandler = (e) => { const k = e.key.toUpperCase(); if (k === "S" || k === "U") { ans = k; return true; } };
      await loop((dt) => {
        pos -= speed * dt;
        if (!ans && pos <= 0) ans = "-";
        x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
        text(x, `ITEM ${n + 1}/5   CORRECT ${right}`, 14, 16, COL.frost, 13);
        text(x, label, w / 2, 60, COL.hazard, 22, "Barlow", "center", "700");
        x.fillStyle = "#24323f"; x.fillRect(70, 140, 540, 8);
        x.fillStyle = "#3a2a1c"; x.fillRect(14, 112, 50, 40); text(x, "PACK", 39, 132, COL.muted, 11, "IBM Plex Mono", "center");
        const bx = 70 + (Math.max(0, pos) / TRACK) * 520;
        x.fillStyle = COL.ice; x.fillRect(bx, 114, 26, 26); text(x, "?", bx + 13, 127, COL.bg, 16, "IBM Plex Mono", "center", "600");
        if (ans) return true;
      });
      const ok = ans === truth;
      right += ok;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, (ok ? "Correct! " : ans === "-" ? "Too slow! " : "Wrong! ") + `It's ${truth === "S" ? "SAFE" : "UNSAFE"}.`, w / 2, h / 2, ok ? COL.safe : COL.blood, 24, "Big Shoulders Display", "center", "800");
      await sleep(900);
    }
    return { win: right >= 4, note: `${right} of 5 correct.` };
  };

  // ---- 6. Count the Infected ----
  GAMES["Count the Infected"] = async (area, tier) => {
    const speed = { HARD: 26, NORMAL: 17, EASY: 10 }[tier];
    const { x, w, h } = makeCanvas(area, 640, 160);
    for (let rnd = 1; rnd <= 2; rnd++) {
      const nz = rint(7, 14), nh = rint(4, 8), LEN = 70, WIDTH = 50;
      const spots = shuffle(Array.from({ length: 3 * (LEN / 2) }, (_, i) => [i % 3, 2 * Math.floor(i / 3)])).slice(0, nz + nh);   // every other column, so letters never touch
      const crowd = spots.map((s, i) => ({ r: s[0], c: s[1], k: i < nz ? "Z" : "H" }));
      let off = -WIDTH;
      await loop((dt) => {
        off += speed * dt;
        x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
        text(x, `ROUND ${rnd}/2`, 14, 14, COL.frost, 13);
        x.fillStyle = "#24323f"; x.fillRect(0, 34, w, 2); x.fillRect(0, 138, w, 2);
        crowd.forEach((m) => { const sx = m.c - off; if (sx >= 0 && sx < WIDTH) text(x, m.k, w - 20 - sx * 12, 60 + m.r * 30, m.k === "Z" ? COL.blood : COL.safe, 22, "IBM Plex Mono", "center", "600"); });
        if (off >= LEN) return true;
      });
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, "How many infected (Z)?", w / 2, h / 2, COL.hazard, 24, "Big Shoulders Display", "center", "800");
      const inp = textInput(area, "Count + Enter", true);
      const guess = await new Promise((res) => {
        const timer = setTimeout(() => res(-1), 15000);
        keyHandler = (e) => { if (e.key === "Enter") { clearTimeout(timer); res(parseInt(inp.value, 10)); return true; } };
      });
      inp.parentNode.remove();
      const ok = Math.abs(guess - nz) <= 2;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, `There were ${nz}. ${guess === nz ? "Good job! Exactly right." : ok ? `Close enough (you said ${guess}).` : "Not close enough."}`, w / 2, h / 2, ok ? COL.safe : COL.blood, 24, "Big Shoulders Display", "center", "800");
      await sleep(1100);
      if (!ok) return { win: false };
    }
    return { win: true };
  };

  // ---- 7. Crack the Supply Locker ----
  GAMES["Crack the Supply Locker"] = async (area, tier) => {
    const [tries, limit] = { HARD: [4, 15], NORMAL: [5, 25], EASY: [6, 45] }[tier];
    const code = rint(1, 20);
    const { x, w, h } = makeCanvas(area, 640, 220);
    const inp = textInput(area, "1-20 + Enter", true);
    const log = [];
    let t = 0, result;
    keyHandler = (e) => {
      if (e.key !== "Enter") return;
      const g = parseInt(inp.value, 10); inp.value = "";
      if (!(g >= 1 && g <= 20)) return true;
      if (g === code) result = true;
      else { log.push(`${g}  ->  ${g < code ? "HIGHER" : "LOWER"}`); if (log.length >= tries) result = false; }
      return true;
    };
    const win = await loop((dt) => {
      t += dt;
      if (result !== undefined) return result;
      if (t > limit) return false;
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      timeBar(x, w, 1 - t / limit, 6);
      const steps = t / limit;
      text(x, "FOOTSTEPS", 14, 30, COL.muted, 12);
      for (let i = 0; i < 20; i++) { x.fillStyle = i / 20 < steps ? COL.blood : "#24323f"; x.fillRect(110 + i * 24, 24, 18, 12); }
      x.strokeStyle = COL.line; x.strokeRect(24, 60, 140, 140);
      text(x, "[ ? ]", 94, 120, COL.hazard, 28, "IBM Plex Mono", "center", "600");
      text(x, `Guesses left: ${tries - log.length}`, 94, 170, COL.frost, 13, "IBM Plex Mono", "center");
      log.forEach((l, i) => text(x, l, 200, 72 + i * 22, COL.food, 16));
    });
    inp.disabled = true;
    return { win, note: `The code was ${code}.` };
  };

  // ---- 8. Decode the Radio ----
  const RADIO_WORDS = ["SAFE ZONE", "BRIDGE", "CONVOY", "SHELTER", "BLIZZARD", "GATES", "MEDIC", "RESCUE", "WATER", "SUPPLY"];
  GAMES["Decode the Radio"] = async (area, tier) => {
    const [limit, stat] = { HARD: [8, 0.35], NORMAL: [12, 0.2], EASY: [20, 0.1] }[tier];
    const { x, w, h } = makeCanvas(area, 640, 160);
    const inp = textInput(area, "Answer + Enter");
    const words = shuffle(RADIO_WORDS.slice()).slice(0, 2);
    for (let n = 0; n < 2; n++) {
      const word = words[n], plain = word.replace(" ", "");
      let letters;
      do { letters = shuffle(plain.split("")); } while (letters.join("") === plain);
      let t = 0, flick = 0, shown = letters.slice(), entered = null;
      inp.value = "";
      keyHandler = (e) => { if (e.key === "Enter") { entered = inp.value.toUpperCase().replace(/\s/g, ""); return true; } };
      const ok = await loop((dt) => {
        t += dt; flick += dt;
        if (entered !== null) return entered === plain;
        if (t > limit) return false;
        if (flick > 0.4) { flick = 0; shown = letters.map((ch) => (Math.random() < stat ? "#" : ch)); }
        x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
        timeBar(x, w, 1 - t / limit, 6);
        text(x, `WORD ${n + 1}/2`, 14, 26, COL.frost, 13);
        for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(147,167,183,${Math.random() * 0.25})`; x.fillRect(Math.random() * w, 40 + Math.random() * 110, 2, 2); }
        text(x, shown.join("  "), w / 2, 90, COL.hazard, 30, "IBM Plex Mono", "center", "600");
      });
      x.fillStyle = COL.bg; x.fillRect(0, 0, w, h);
      text(x, (ok ? "Got it! " : "Lost the signal! ") + `The word was ${word}.`, w / 2, h / 2, ok ? COL.safe : COL.blood, 24, "Big Shoulders Display", "center", "800");
      await sleep(1000);
      if (!ok) { inp.disabled = true; return { win: false }; }
    }
    inp.disabled = true;
    return { win: true };
  };

  // test hook: lets an automated test start any mini game directly

  // test hook: lets an automated test start any mini game directly
  window.__ZE_TEST = { playMinigame: (n, t) => { $("title").classList.add("hidden"); $("game").classList.remove("hidden"); return playMinigame(n, t, false, current || new Z.Game(B, "SLC", 1)); } };
  titleScreen();
})();
