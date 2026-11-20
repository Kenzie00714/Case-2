const fs = require("fs");
const D = JSON.parse(fs.readFileSync("revised.json", "utf8"));
const S = D.stats;
const MG = JSON.parse(fs.readFileSync("minigames.json", "utf8"));
const MGG = Object.fromEntries(MG.games.map((g) => [g[0], g]));
const MGP = {}; for (const [code, pl] of Object.entries(MG.placement)) for (const [sid, L, g, why] of pl) MGP[`${sid}:${L}`] = { g, why };
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  HeadingLevel, PageOrientation, AlignmentType, Footer, PageNumber, PageBreak } = require("docx");
const W = 13680;
const bd = { style: BorderStyle.SINGLE, size: 4, color: "B7C3CC" };
const borders = { top: bd, bottom: bd, left: bd, right: bd };
const kids = [];
const add = (...x) => x.flat().forEach((y) => kids.push(y));
const P = (t, o = {}) => new Paragraph({ spacing: { after: 100 }, ...o.p, children: [new TextRun({ text: t, size: o.size || 20, ...o.run })] });
const H1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(t)] });
const H1n = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const H2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const H3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });
const RCOL = { BEST: "1E7B45", OKAY: "6B6B00", RISKY: "B35900", WORST: "B3261E" };
let tno = 0;
function T(title, headers, rows, fr, opts = {}) {
  const tot = fr.reduce((a, b) => a + b, 0);
  const widths = fr.map((f) => Math.floor(W * f / tot));
  widths[widths.length - 1] += W - widths.reduce((a, b) => a + b, 0);
  const size = opts.size || 17;
  const cell = (v, i, head, shade, fill) => {
    const runs = (Array.isArray(v) ? v : [v]).map((x) => typeof x === "object" && x !== null ? new TextRun({ size, font: "Arial", ...x }) : new TextRun({ text: String(x ?? ""), size, font: "Arial", bold: head, color: head ? "FFFFFF" : "1A1A1A" }));
    return new TableCell({ borders, width: { size: widths[i], type: WidthType.DXA },
      shading: head ? { fill: "1F2F3D", type: ShadingType.CLEAR, color: "auto" } : fill ? { fill, type: ShadingType.CLEAR, color: "auto" } : shade ? { fill: "EEF2F5", type: ShadingType.CLEAR, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 }, children: [new Paragraph({ children: runs })] });
  };
  const out = [];
  if (title) { tno += 1; out.push(new Paragraph({ keepNext: true, spacing: { before: 160, after: 60 }, children: [new TextRun({ text: `Table ${tno}. ${title}`, bold: true, size: 19, color: "C25E00" })] })); }
  out.push(new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths,
    rows: [new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, i, true)) }),
      ...rows.map((r, k) => new TableRow({ cantSplit: true, children: (r.cells || r).map((v, i) => cell(v, i, false, k % 2 === 1, r.cells ? r.fill : undefined)) }))] }));
  out.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
  return out;
}
const pctFmt = (n, d) => `${n} of ${d}`;

// ----- title & summary
add(new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: "Zombie Escape: Revised Scenarios", bold: true, size: 56, color: "1F2F3D" })] }),
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "All 140 scenes with the 10 scenario improvements and 10 realistic mini games (scenario document only; the game code is unchanged)", size: 26, color: "C25E00" })] }),
  P("This document updates every scene and option. Scene text is kept as written, except where real data corrected it. Each option now shows its rating, whether it is a trap or hidden gem, its full effects (injury chance and damage, time, supplies, fuel, vehicle, flags), why it plays out that way, and exactly what changed. New content (flags that pay off later, options that appear only in certain situations, rewritten final gates and five new scenes built on the new data) is marked in each scene."),
  P("Numbers marked fictional are game assumptions. Real data (Census, NOAA, CDC) is named where used."));

add(H1n("1. What changed"),
  T("The improvements and how each was applied", ["#", "Improvement", "What was done", "How many"], [
    ["1", "Real trade-offs", "Every option now sits on a time ladder: RISKY is fastest (0.5 h), OKAY is middle (1 h), BEST is careful (1.5–2 h). BEST supplies are capped at 20 per resource. Risky supply grabs now pay more. Slow OKAY options with a story delay are now the safest choice and heal while you rest.", `${S.best_slower} BEST options slower; ${S.best_capped} BEST supply caps; ${S.risky_pays} risky grabs pay; ${S.risky_fast} risky drives save 2 h; ${S.okay_safest} slow OKAY options made safest`],
    ["2", "Traps and hidden gems", "Scenes without one were tagged: WORST options that sound appealing or tempting are traps; BEST options that sound timid or slow are hidden gems.", `${S.new_trap} new traps, ${S.new_gem} new gems; ${S.looks_coverage} of 98 main scenes now have one`],
    ["3", "Fair final gate", "All 7 final gates rewritten. Bad choices now cost time or health instead of ending the game. Every gate runs a screening check (infected → quarantine and treatment).", "7 gates"],
    ["4", "Early choices pay off", "Two new flags per route on Days 1–2, each unlocking a better option on Days 3–7.", "14 flags, 14 unlocked options"],
    ["5", "Scenes react to your state", "Options that appear only when fuel is low, when you're secretly infected and showing symptoms, or when you're far behind schedule. Plus 2 rules for every route.", "21 route options + 2 general rules"],
    ["6", "Real data in the story", "Story temperatures compared with NOAA January normals; big gaps labeled as record storms. Route profiles corrected to real county density and NOAA normals; wrong mileage fixed.", `${D.weather_rows.length} temperature mentions checked; 7 profiles corrected`],
    ["7", "Why each option plays out", "Every option shows its explanation (the hidden note).", "all 560 options + new ones"],
    ["8", "Scenes from the new data", "Five new shared scenes: evacuation gridlock (SVI), nursing home (age 65+), treatment window (rabies timing), radio doctor (R0 comparison), last working pump (fuel). Data decides where they play.", "5 scenes, 20 options"],
    ["9", "More fuel and vehicle choices", "Fuel and vehicle effects shown on every option; new low-fuel options on every route; a new fuel scene.", "7 low-fuel options + 1 fuel scene"],
    ["11", "Realistic mini games", "Ten hands-on mini games based on real procedures (tire change, jump-start, first aid, cold injuries, water safety, siphoning, chains, map and compass, emergency radio, carbon monoxide). Each plays right where the story sets it up, and joins the random roll pool. A shared noise meter and cold-hands rule tie them to the outbreak and weather data.", "10 games; 28 story placements (4 per route); 18 games in the pool"],
    ["10", "Setting changes the rating", "Outdoor options of 30+ minutes get one rating worse where the January normal is 25°F or colder, and one better (OKAY/RISKY only) where it is 40°F or warmer.", `${S.weather_worse} worse, ${S.weather_better} better`],
  ], [0.3, 1.3, 4.2, 1.8]),
  T("Balance check: options no better than another option in the same scene on every measure", ["Rating", "Before", "After", "Meaning"], [
    ["OKAY", S.dom_before_OKAY, S.dom_after_OKAY, "OKAY is now a real middle choice (faster than BEST, or the safest when slow)"],
    ["RISKY", S.dom_before_RISKY, S.dom_after_RISKY, "RISKY is now the fastest, and risky grabs pay"],
    ["WORST", S.dom_before_WORST, S.dom_after_WORST, "Intended: WORST options should lose on the numbers; many now look tempting (traps)"],
  ], [1, 0.8, 0.8, 4]),
  P("Measures compared: expected injury damage (chance × damage), hours, food + water + health gained, fuel. Main scenes and detours; callbacks and final gates excluded.", { size: 17 }));

add(H1("2. Rules used across all scenes"),
  T("Trade-off rules", ["Rating", "Time", "Supplies", "Risk", "Role"], [
    ["BEST", "1.5 h, or 2 h if it gives supplies (story delays kept)", "Capped at 20 food and 20 water", "Lowest (0–10%)", "Careful and reliable, but slower"],
    ["OKAY", "1 h; if the story says it's slow, the delay is kept", "As written", "10–25%; slow options drop to 5% and heal 5 per 6 h rested (max 15)", "Middle choice, or the slow-but-safest choice"],
    ["RISKY", "0.5 h; travel options save 2 h of driving", "Supply grabs: +15 food, +10 water", "30–55%", "Fast and/or rewarding"],
    ["WORST", "As written", "As written", "60–85%", "Bad, and now often tempting (trap)"],
  ], [0.8, 2, 1.6, 2, 2]),
  T("Weather-adjusted ratings (uses NOAA January normals at the scene's location)", ["Condition", "Change"], [
    ["Outdoor option of 30 minutes or more, January normal 25°F or colder", "Rating one step worse (e.g. OKAY → RISKY)"],
    ["Outdoor OKAY or RISKY option of 30 minutes or more, January normal 40°F or warmer", "Rating one step better"],
    ["Indoors or in a vehicle", "No change"],
  ], [3, 3]),
  T("Weather in the story vs. real January normals", ["Scene", "Story says", "NOAA January normal there", "Change"], D.weather_rows, [1, 1, 1.5, 2.5]),
  T("Route profiles corrected", ["Route", "Old profile (start)", "Corrected profile (start)"], D.cities.map((c) => [c.code, c.profile_old.slice(0, 120) + "…", c.profile.slice(0, 140) + "…"]), [0.5, 3, 3]));

add(H1("3. Flags that pay off later"),
  T("New flags (Days 1–2) and what they unlock", ["Route", "Set in", "Option", "Flag", "What you get", "Unlocks in", "Unlocked option"],
    D.cities.flatMap((c) => c.flags.map((f) => [c.code, f.scene, f.letter, f.flag, f.gets, f.payoff_scene, f.payoff])), [0.5, 0.8, 0.5, 1.2, 2.4, 0.8, 2.4]),
  P("Several flags were deliberately put on OKAY options (e.g. NYC-01N A, BOS-01N D, PIT-01M D, PIT-02M B, JAC-01N A), so the 'second-best' choice now has a reason to pick it."));

add(H1("4. Options that react to your situation"),
  T("Route-specific conditional options", ["Route", "Scene", "Appears when", "Option"], D.cities.flatMap((c) => c.conds.map((x) => [c.code, x.scene, x.when, x.text])), [0.5, 0.8, 1.6, 3.5]),
  T("General rules (every route)", ["Appears when", "Where", "Option", "Rating", "Effects", "Why"], D.cond_rules, [1.2, 1.4, 1.5, 0.6, 1, 2]));

add(H1("5. Final gates"), P(D.gate_check));

add(H1("6. New scenes built on the new data"));
for (const s of D.shared) {
  add(H2(`${s.id}: ${s.title}`),
    P(`Data: ${s.data}`, { run: { bold: true } }), P(`When it plays: ${s.trigger}`), P(`Effect of the data: ${s.effect}`), P(s.text, { run: { italics: true } }),
    T(null, ["Opt", "Choice", "Rating", "Looks", "Effects", "Why"], s.options.map((o) => [o[0], o[1], { text: o[2], bold: true, color: RCOL[o[2]] }, o[3] ? o[3].replace("_", " ").toUpperCase() : "", o[4], o[5]]), [0.42, 2, 0.6, 0.7, 2, 2.2]));
}

add(H1("7. Realistic mini games"),
  P("Ten new mini games where you do the real task step by step with the mouse or touch. They play right where the story calls for them (the option that leads into each is marked ▶ in the scene tables), and any not yet played also join the random roll pool with the original eight."),
  T("Rules shared by all ten", ["Rule", "How it works", "Data behind it"], MG.rules, [1, 3, 3]));
for (const g of MG.games) {
  add(H2(g[0]), T(null, ["Part", "Details"], [["How you play", g[1]], ["Correct steps (real procedure)", g[2]], ["Mistakes and what happens", g[3]], ["Real-data tie-in", g[4]], ["Tiers", g[5]], ["Win", g[6]], ["Fail", g[7]]], [1.2, 5]));
}
add(T("Where each mini game plays in the story", ["Route", "Scene", "Option", "Mini game", "Why it fits"], Object.entries(MG.placement).flatMap(([code, pl]) => pl.map(([sid, L, g, why]) => [code, sid, L, g, why])), [0.5, 0.8, 0.5, 1.8, 3.2]));
let ch0 = 0;
// ----- per city
function effects(o) {
  if (o.effects_text) return o.effects_text;
  const parts = [`injury ${o.injury_chance}% (−${o.damage})`, `${o.hours} h`];
  const sup = [["food", o.food], ["water", o.water], ["health", o.heal]].filter(([, v]) => v).map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${k}`);
  if (sup.length) parts.push(sup.join(", "));
  if (o.fuel >= 25) parts.push("fills the fuel tank"); else if (o.fuel) parts.push(`${o.fuel > 0 ? "+" : ""}${o.fuel} gal fuel`);
  if (o.hours_saved) parts.push(`saves ${o.hours_saved} h driving`);
  if (o.vehicle) parts.push(`vehicle ${o.vehicle}`);
  if (o.miles) parts.push(`+${o.miles} miles`);
  if (o.sets_flag) parts.push(`sets ${o.sets_flag}`);
  if (o.requires_flag) parts.push(`needs ${o.requires_flag}`);
  return parts.join("; ");
}
let ch = 8;
for (const c of D.cities) {
  add(H1(`${ch}. ${c.code}: ${c.start} → ${c.end} (${c.miles.toLocaleString()} road miles)`), P(c.profile), P(`Route: ${c.route}`, { size: 18 }));
  ch++;
  const groups = [["main", "Main story"], ["detour", "Detours"], ["callback", "Callbacks"]];
  for (const [kind, label] of groups) {
    add(H2(label));
    for (const s of c.scenes.filter((x) => x.kind === kind)) {
      const head = kind === "main" ? `${s.id} · Day ${s.day} ${s.time} · ${s.title}` : kind === "callback" ? `${s.id} · ${s.title} (after flag ${s.trigger_flag}, ${s.delay} scenes later)` : `${s.id} · ${s.title} (${s.type} detour, Days ${s.days[0]}–${s.days[1]})`;
      add(H3(head));
      if (s.place) add(P(`Where: ${s.place}. NOAA January normal ${s.normal_f.toFixed(1)}°F.`, { size: 17, run: { color: "555555" } }));
      add(P(s.text, { run: { italics: true } }));
      if (s.weather_note) add(P("Data note: " + s.weather_note, { size: 17, run: { color: "1F5E8C" } }));
      if (s.gate_check) add(P("Gate check: " + s.gate_check, { size: 17, run: { color: "1F5E8C" } }));
      const rows = s.options.map((o) => {
        const rating = [{ text: o.rating, bold: true, color: RCOL[o.rating] }];
        if (o.weather_rating && o.weather_rating !== o.rating) rating.push({ text: ` → ${o.weather_rating} in this weather`, color: RCOL[o.weather_rating], italics: true });
        let txt = o.text;
        if (o.alt && o.requires_flag) txt += ` (without ${o.requires_flag}: "${o.alt.text}")`;
        const mg = MGP[`${s.id}:${o.letter}`];
        const eff = mg ? [effects(o), { text: ` ▶ mini game: ${mg.g} (win: ${MGG[mg.g][6]}; fail: ${MGG[mg.g][7]})`, bold: true, color: "6A1B9A" }] : effects(o);
        const chg = (o.changes || []).concat(mg ? [`now plays the ${mg.g} mini game: ${mg.why}`] : []).join("; ");
        return [mg ? `${o.letter} ▶` : o.letter, txt, rating, o.looks ? o.looks.replace("_", " ").toUpperCase() : "", eff, o.why, chg];
      });
      for (const u of s.unlocked) { const mg = MGP[`${s.id}:★`]; rows.push({ cells: [{ text: mg ? "★ ▶" : "★", bold: true }, `${u.text} (needs ${u.flag}, earned at ${u.from})`, [{ text: u.rating, bold: true, color: RCOL[u.rating] }], "", mg ? [u.effects_text, { text: ` ▶ mini game: ${mg.g}`, bold: true, color: "6A1B9A" }] : u.effects_text, u.why, "new unlocked option" + (mg ? `; plays the ${mg.g} mini game` : "")], fill: "E8F4EA" }); }
      for (const x of s.conditional) rows.push({ cells: [{ text: "IF", bold: true }, `${x.text} (only when: ${x.when})`, [{ text: x.rating, bold: true, color: RCOL[x.rating] }], "", x.effects_text, x.why, "new conditional option"], fill: "FFF4E5" });
      add(T(null, ["Opt", "Choice", "Rating", "Looks", "Effects", "Why it plays out", "What changed"], rows, [0.42, 1.9, 0.9, 0.7, 1.7, 2.1, 1.9], { size: 16 }));
    }
  }
}

const doc = new Document({
  styles: { default: { document: { run: { font: "Arial", size: 20 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 32, bold: true, color: "1F2F3D" }, paragraph: { spacing: { before: 240, after: 120 }, keepNext: true, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 26, bold: true, color: "C25E00" }, paragraph: { spacing: { before: 200, after: 80 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: "Arial", size: 21, bold: true, color: "1F2F3D" }, paragraph: { spacing: { before: 180, after: 60 }, keepNext: true, outlineLevel: 2 } },
    ] },
  sections: [{ properties: { page: { size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Zombie Escape revised scenarios · page ", size: 16, color: "666666" }), new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "666666" })] })] }) },
    children: kids }],
});
Packer.toBuffer(doc).then((b) => { fs.writeFileSync("Zombie_Escape_Revised_Scenarios.docx", b); console.log("ok"); });
