// Zombie Escape - the 10 realistic, interactive mini games.
// Each game is a list of real-world steps. Some steps are "pick the right next action" cards; others are
// hands-on controls (tap, hold a gauge in the green, stop a timer, tune a dial, rotate a compass, keep a rhythm).
// Real data used: the January NOAA normal temperature (cold hands slow your controls), the station elevation
// (CDC boiling rule: 1 minute, or 3 minutes above 6,500 ft), the local infectious share from the SEIR model
// (mistakes make more noise where more infected are around), and the real coordinates of your route stops
// (compass bearing to the next stop). Everything else is fictional game design.
(function () {
  "use strict";
  window.ZE_REAL = function (H) {
    const { el, esc, makeCanvas, text, COL } = H;
    const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const NOT_YET = { sec: 4, noise: 8, why: "Not yet: that step comes later." };

    // ------------------------------------------------------------------ the run (timer, noise, checklist)
    function makeRun(area, G, tier, env) {
      const lim = env.dev ? null : limitFor(G, tier);
      const st = { noise: 0, t0: performance.now(), penalty: 0, limit: lim, over: null, widget: null, cur: null, msg: "", msgCol: COL.muted, steps: [], k: 0, ended: false };
      const cv = makeCanvas(area, 640, 250);
      const check = el("div", "rg-check"); area.appendChild(check);
      const fb = el("div", "rg-feedback", ""); area.appendChild(fb);
      const cards = el("div", "rg-cards"); area.appendChild(cards);
      st.cv = cv; st.check = check; st.fb = fb; st.cards = cards;
      st.lag = env.coldLag;
      st.say = (m, col) => { fb.textContent = m; fb.style.color = col || COL.frost; };
      st.mistake = (p) => {
        const n = p.noise * (1 + 3 * env.I);
        st.noise = clamp(st.noise + n, 0, 100); st.penalty += p.sec || 0;
        st.say(`Mistake: ${p.why}${p.sec ? ` (−${p.sec} s` : ""}${p.sec ? `, +${Math.round(n)} noise)` : ` (+${Math.round(n)} noise)`}`, COL.blood);
        if (p.fatal) st.end("fatal", p.why);
      };
      st.end = (kind, why) => { if (!st.over) { st.over = kind; st.overWhy = why; if (st.cur) { const c = st.cur; st.cur = null; c(false); } } };
      st.left = () => (st.limit == null ? Infinity : st.limit - (performance.now() - st.t0) / 1000 - st.penalty);
      st.renderCheck = () => {
        if (tier === "HARD") { st.check.innerHTML = `<span class="now">Step ${Math.min(st.k + 1, st.steps.length)} of ${st.steps.length}: no checklist on HARD</span>`; return; }
        st.check.innerHTML = st.steps.map((s, i) => i < st.k ? `<span class="done">✓ ${esc(s.short)}</span>`
          : i === st.k ? `<span class="now">${i + 1}. ${esc(tier === "EASY" ? s.short : "What comes next?")}</span>`
          : tier === "EASY" ? `<span>${i + 1}. ${esc(s.short)}</span>` : "").join("");
      };
      // frame loop: HUD strip + current widget
      const frame = () => {
        if (st.ended) return;
        const { x, w } = cv;
        x.fillStyle = COL.bg; x.fillRect(0, 0, w, cv.h);
        const left = st.left();
        if (st.limit != null) {
          const frac = clamp(left / st.limit, 0, 1);
          x.fillStyle = "#0b121a"; x.fillRect(10, 8, 300, 10);
          x.fillStyle = frac > 0.5 ? COL.hazard : frac > 0.25 ? COL.food : COL.blood; x.fillRect(10, 8, 300 * frac, 10);
          text(x, `TIME ${Math.max(0, Math.ceil(left))} s`, 10, 30, COL.frost, 13);
        } else text(x, "TIME: no limit (developer mode)", 10, 30, COL.muted, 13);
        x.fillStyle = "#0b121a"; x.fillRect(330, 8, 300, 10);
        x.fillStyle = st.noise < 50 ? COL.ice : st.noise < 80 ? COL.food : COL.blood; x.fillRect(330, 8, 3 * st.noise, 10);
        text(x, `NOISE ${Math.round(st.noise)}/100`, 330, 30, COL.frost, 13);
        text(x, `cold hands ×${(1 - st.lag).toFixed(2)} speed`, 630, 30, COL.muted, 12, "IBM Plex Mono", "right");
        x.fillStyle = "#24323f"; x.fillRect(0, 44, w, 1);
        if (st.widget && st.widget.draw) st.widget.draw(x, w, cv.h);
        else text(x, `Step ${Math.min(st.k + 1, st.steps.length)} of ${st.steps.length}`, w / 2, 145, COL.muted, 20, "Big Shoulders Display", "center", "800");
        if (left <= 0) st.end("time", "you ran out of time");
        if (st.noise >= 100) st.end("noise", "the noise drew the infected to you");
        if (!st.over) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      return st;
    }
    function limitFor(G, tier) {
      const m = new RegExp(tier + "\\s+(\\d+)\\s*s").exec(G.tiers || "");
      return m ? +m[1] : { EASY: 120, NORMAL: 90, HARD: 70 }[tier];
    }

    // ------------------------------------------------------------------ step types
    // pick: choose the right next action from cards (keys 1-5 or click)
    function pick(st, step, laterSteps, env) {
      return new Promise((res) => {
        st.widget = null; st.cur = res;
        const wrong = (step.wrong || []).map((w) => Object.assign({ ok: false }, w));
        const later = shuffle(laterSteps.filter((s) => s.kind === "pick")).slice(0, Math.max(0, 3 - wrong.length)).map((s) => Object.assign({ ok: false, label: s.label }, NOT_YET));
        const opts = shuffle([{ ok: true, label: step.label }].concat(wrong.slice(0, 3), later));
        st.cards.innerHTML = "";
        st.say(step.prompt || "Pick the right next step.", COL.frost);
        const bs = opts.map((o, i) => {
          const b = el("button", "rg-card", `<span class="k">${i + 1}</span>${esc(o.label)}`);
          b.addEventListener("click", () => choose(i)); st.cards.appendChild(b); return b;
        });
        function choose(i) {
          if (st.cur !== res || bs[i].disabled) return;
          const o = opts[i];
          if (o.ok) { st.cards.innerHTML = ""; st.cur = null; st.say("✓ " + (step.done || "Done."), COL.safe); res(true); return; }
          bs[i].disabled = true; bs[i].classList.add("bad");
          st.mistake(o);
        }
        H.setKey((e) => { const i = "12345".indexOf(e.key); if (i >= 0 && i < opts.length) { choose(i); return true; } });
      });
    }
    // tap: press Space / the button N times
    function tap(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let n = step.n + Math.round(step.n * st.lag);
        const total = n;
        st.cards.innerHTML = "";
        const b = el("button", "btn", step.button || "TAP"); st.cards.appendChild(b);
        st.say(`${step.label} Press SPACE or tap the button ${total} times.`, COL.frost);
        st.widget = { draw(x, w) {
          text(x, step.label, w / 2, 90, COL.frost, 22, "Big Shoulders Display", "center", "800");
          for (let i = 0; i < total; i++) { x.fillStyle = i < total - n ? COL.safe : "#24323f"; x.fillRect(w / 2 - total * 14 + i * 28, 140, 22, 22); }
          text(x, `${n} left`, w / 2, 200, COL.muted, 16, "IBM Plex Mono", "center");
        } };
        const hit = () => { if (st.cur !== res) return; n -= 1; if (n <= 0) { st.cur = null; st.cards.innerHTML = ""; st.say("✓ " + (step.done || "Done."), COL.safe); res(true); } };
        b.addEventListener("click", hit);
        H.setKey((e) => { if (e.key === " " || e.key === "Enter") { hit(); return true; } });
      });
    }
    // hold: hold Space / the button to raise a gauge; keep it in the green until the progress ring fills
    function hold(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let v = 0, prog = 0, held = false, last = performance.now(), wasHigh = false;
        const lo = step.lo, hi = step.hi, need = step.secs;
        st.cards.innerHTML = "";
        const b = el("button", "btn", step.button || "HOLD"); st.cards.appendChild(b);
        st.say(`${step.label} Hold SPACE (or press and hold the button). Keep the needle inside the GREEN band for ${need} s. Let go to lower it.`, COL.frost);
        const down = (e) => { held = true; if (e) e.preventDefault(); }, up = () => { held = false; };
        b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointerleave", up);
        H.setKey((e) => { if (e.key === " ") { held = true; return true; } });
        H.setKeyUp((e) => { if (e.key === " ") { held = false; return true; } });
        st.widget = { draw(x, w) {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          const speed = 1 - st.lag;
          v = clamp(v + (held ? 55 : -45) * speed * dt, 0, 100);
          if (v >= lo && v <= hi) prog += dt;
          if (v > hi + 8 && !wasHigh && step.tooHigh) { wasHigh = true; st.mistake(step.tooHigh); }
          if (v < hi) wasHigh = false;
          const gx = 120, gy = 60, gw = 400, gh = 26;
          text(x, step.label, w / 2, 80 - 20, COL.frost, 18, "Big Shoulders Display", "center", "800");
          x.fillStyle = "#0b121a"; x.fillRect(gx, gy + 30, gw, gh);
          x.fillStyle = "#1f5a39"; x.fillRect(gx + gw * lo / 100, gy + 30, gw * (hi - lo) / 100, gh);
          x.fillStyle = COL.frost; x.fillRect(gx + gw * v / 100 - 2, gy + 24, 4, gh + 12);
          text(x, step.lowWord || "too little", gx, gy + 76, COL.muted, 12); text(x, step.highWord || "too much", gx + gw, gy + 76, COL.muted, 12, "IBM Plex Mono", "right");
          x.fillStyle = "#0b121a"; x.fillRect(gx, 190, gw, 12); x.fillStyle = COL.safe; x.fillRect(gx, 190, gw * Math.min(1, prog / need), 12);
          text(x, `in the green: ${prog.toFixed(1)} / ${need} s`, w / 2, 220, COL.muted, 13, "IBM Plex Mono", "center");
          if (prog >= need && st.cur === res) { st.cur = null; st.widget = null; H.setKeyUp(null); st.cards.innerHTML = ""; st.say("✓ " + (step.done || "Done."), COL.safe); res(true); }
        } };
      });
    }
    // crank: hold to crank the starter in short bursts; a burst longer than maxBurst drains the battery
    function crank(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let held = false, burst = 0, prog = 0, last = performance.now();
        const need = step.secs;
        st.cards.innerHTML = "";
        const b = el("button", "btn", "CRANK"); st.cards.appendChild(b);
        st.say(`Hold SPACE (or the button) to crank. Crank in bursts of under ${step.maxBurst} s, then let go to rest. The engine catches after ${need.toFixed(1)} s of cranking in total.`, COL.frost);
        b.addEventListener("pointerdown", (e) => { held = true; e.preventDefault(); }); b.addEventListener("pointerup", () => (held = false)); b.addEventListener("pointerleave", () => (held = false));
        H.setKey((e) => { if (e.key === " ") { held = true; return true; } });
        H.setKeyUp((e) => { if (e.key === " ") { held = false; return true; } });
        st.widget = { draw(x, w) {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (held) { burst += dt; prog += dt * (1 - st.lag * 0.5); } else burst = 0;
          if (burst > step.maxBurst) { burst = 0; held = false; prog = Math.max(0, prog - need * 0.5); st.mistake({ sec: 6, noise: 10, why: "you cranked too long and drained the battery a little" }); }
          text(x, "Dash lights", w / 2, 66, COL.muted, 14, "IBM Plex Mono", "center");
          for (let i = 0; i < 5; i++) { x.fillStyle = prog / need > i / 5 ? COL.safe : "#24323f"; x.beginPath(); x.arc(w / 2 - 100 + i * 50, 100, 14, 0, 7); x.fill(); }
          x.fillStyle = "#0b121a"; x.fillRect(120, 150, 400, 12); x.fillStyle = burst > step.maxBurst * 0.7 ? COL.blood : COL.hazard; x.fillRect(120, 150, 400 * burst / step.maxBurst, 12);
          text(x, `this burst ${burst.toFixed(1)} / ${step.maxBurst} s`, w / 2, 180, COL.muted, 13, "IBM Plex Mono", "center");
          text(x, `cranked ${prog.toFixed(1)} / ${need.toFixed(1)} s${step.coldNote || ""}`, w / 2, 210, COL.frost, 13, "IBM Plex Mono", "center");
          if (prog >= need && st.cur === res) { st.cur = null; st.widget = null; H.setKeyUp(null); st.cards.innerHTML = ""; st.say("✓ The engine catches!", COL.safe); res(true); }
        } };
      });
    }
    // stop: a value climbs; press Space / STOP inside the target window
    function stop(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let v = 0, running = !step.needStart, last = performance.now(), paused = 0;
        st.cards.innerHTML = "";
        const b = el("button", "btn", step.needStart ? "START" : "STOP"); st.cards.appendChild(b);
        st.say(step.label, COL.frost);
        const press = () => {
          if (st.cur !== res) return;
          if (!running) { running = true; b.textContent = "STOP"; return; }
          running = false;
          if (v < step.lo) { if (step.early) { st.mistake(step.early); if (st.over) return; } v = 0; running = !step.needStart; b.textContent = step.needStart ? "START" : "STOP"; st.say("Try again: " + step.label, COL.food); return; }
          if (v > step.hi) { if (step.late) { st.mistake(step.late); if (st.over) return; } }
          st.cur = null; st.widget = null; st.cards.innerHTML = ""; st.say("✓ " + (step.done || "Done."), COL.safe); res(true);
        };
        b.addEventListener("click", press);
        H.setKey((e) => { if (e.key === " " || e.key === "Enter") { press(); return true; } });
        st.widget = { draw(x, w) {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          if (running) {
            if (step.sputter && paused <= 0 && Math.random() < dt * 0.4) paused = 0.8;
            if (paused > 0) paused -= dt; else v += step.rate * dt;
          }
          if (v > step.max) { v = step.max; if (step.over) { st.mistake(step.over); if (!st.over) { v = 0; running = !step.needStart; b.textContent = step.needStart ? "START" : "STOP"; } } }
          text(x, step.title, w / 2, 66, COL.frost, 18, "Big Shoulders Display", "center", "800");
          const gx = 70, gw = 500;
          x.fillStyle = "#0b121a"; x.fillRect(gx, 100, gw, 30);
          x.fillStyle = "#1f5a39"; x.fillRect(gx + gw * step.lo / step.max, 100, gw * (step.hi - step.lo) / step.max, 30);
          x.fillStyle = COL.hazard; x.fillRect(gx, 104, gw * v / step.max, 22);
          text(x, step.show(v), w / 2, 165, COL.frost, 30, "Big Shoulders Display", "center", "800");
          text(x, paused > 0 ? "the stove sputters… the boil stops" : step.hint || "", w / 2, 205, paused > 0 ? COL.blood : COL.muted, 13, "IBM Plex Mono", "center");
        } };
      });
    }
    // tune: LEFT/RIGHT (or the slider) to find a hidden target; hold inside the band for 1.5 s
    function tune(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let v = step.start, target = step.target, inside = 0, last = performance.now(), dir = 0;
        st.cards.innerHTML = "";
        const row = el("div", "controls");
        const L = el("button", "btn ghost", "◀"), R = el("button", "btn ghost", "▶");
        const sl = document.createElement("input"); sl.type = "range"; sl.min = step.min; sl.max = step.max; sl.step = (step.max - step.min) / 1000; sl.value = v; sl.className = "rg-slider"; sl.setAttribute("aria-label", step.title);
        row.append(L, sl, R); st.cards.appendChild(row);
        st.say(step.label + " Use LEFT/RIGHT arrows, the ◀ ▶ buttons or the slider. Stop when it is clear and hold still for 1.5 s.", COL.frost);
        sl.addEventListener("input", () => (v = +sl.value));
        const hd = (d) => () => (dir = d);
        [[L, -1], [R, 1]].forEach(([b, d]) => { b.addEventListener("pointerdown", hd(d)); b.addEventListener("pointerup", hd(0)); b.addEventListener("pointerleave", hd(0)); });
        H.setKey((e) => { if (e.key === "ArrowLeft") { dir = -1; return true; } if (e.key === "ArrowRight") { dir = 1; return true; } });
        H.setKeyUp((e) => { if (e.key === "ArrowLeft" || e.key === "ArrowRight") { dir = 0; return true; } });
        st.widget = { draw(x, w) {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          const range = step.max - step.min;
          v = step.wrap ? ((v - step.min + dir * range * 0.18 * (1 - st.lag) * dt) % range + range) % range + step.min : clamp(v + dir * range * 0.18 * (1 - st.lag) * dt, step.min, step.max);
          sl.value = v;
          if (step.drift) target = clamp(target + Math.sin(now / 900) * range * 0.02 * dt, step.min, step.max);
          let d = Math.abs(v - target); if (step.wrap) d = Math.min(d, range - d);
          const clear = clamp(1 - d / (range * 0.25), 0, 1);
          if (d <= step.tol) inside += dt; else inside = 0;
          text(x, step.title, w / 2, 62, COL.frost, 18, "Big Shoulders Display", "center", "800");
          if (step.draw) step.draw(x, w, v, clear);
          else {
            for (let i = 0; i < 260 * (1 - clear); i++) { x.fillStyle = `rgba(230,238,243,${Math.random() * 0.4})`; x.fillRect(Math.random() * w, 80 + Math.random() * 90, 2, 2); }
            text(x, step.show(v), w / 2, 125, COL.frost, 34, "Big Shoulders Display", "center", "800");
          }
          x.fillStyle = "#0b121a"; x.fillRect(120, 190, 400, 10); x.fillStyle = clear > 0.9 ? COL.safe : COL.ice; x.fillRect(120, 190, 400 * clear, 10);
          text(x, `${step.clearWord || "signal"} ${Math.round(clear * 100)}%  ·  holding ${Math.min(1.5, inside).toFixed(1)} / 1.5 s`, w / 2, 220, COL.muted, 13, "IBM Plex Mono", "center");
          if (inside >= 1.5 && st.cur === res) { st.cur = null; st.widget = null; H.setKeyUp(null); st.cards.innerHTML = ""; st.say("✓ " + (step.done || "Locked in."), COL.safe); res(true); }
        } };
      });
    }
    // rhythm: a ring pulses; press Space / the button while it is inside the green ring
    function rhythm(st, step) {
      return new Promise((res) => {
        st.cur = res;
        let hits = 0, t = 0, last = performance.now(), misses = 0, flash = 0, used = false;
        st.cards.innerHTML = "";
        const b = el("button", "btn", step.button || "PRESS"); st.cards.appendChild(b);
        st.say(`${step.label} Press SPACE (or the button) when the white ring is inside the green ring. ${step.hits} good presses needed.`, COL.frost);
        const press = () => {
          if (st.cur !== res) return;
          const ph = (t % step.period) / step.period;
          if (ph > 0.72 && ph < 0.95 && !used) { hits += 1; used = true; misses = 0; flash = 0.2; }
          else { misses += 1; if (misses >= 2) { misses = 0; st.mistake(step.miss); } }
          if (hits >= step.hits) { st.cur = null; st.widget = null; st.cards.innerHTML = ""; st.say("✓ " + (step.done || "Done."), COL.safe); res(true); }
        };
        b.addEventListener("click", press);
        H.setKey((e) => { if (e.key === " " || e.key === "Enter") { press(); return true; } });
        st.widget = { draw(x, w) {
          const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now;
          const before = t % step.period; t += dt; if (t % step.period < before) used = false;
          const ph = (t % step.period) / step.period;
          text(x, step.title, w / 2, 62, COL.frost, 18, "Big Shoulders Display", "center", "800");
          x.strokeStyle = "#1f5a39"; x.lineWidth = 14; x.beginPath(); x.arc(w / 2, 145, 60 * 0.835, 0, 7); x.stroke();
          x.strokeStyle = flash > 0 ? COL.safe : COL.frost; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, 145, 60 * ph + 2, 0, 7); x.stroke();
          flash -= dt;
          text(x, `${hits} / ${step.hits}`, w / 2 + 150, 145, COL.frost, 26, "Big Shoulders Display", "center", "800");
        } };
      });
    }
    // inspect: tap every sign to see what it shows
    function inspect(st, step) {
      return new Promise((res) => {
        st.cur = res; st.widget = null;
        st.cards.innerHTML = "";
        st.say(step.label + " Tap each one to check it.", COL.frost);
        let left = step.items.length;
        const found = [];
        st.widget = { draw(x, w) {
          text(x, step.title, w / 2, 62, COL.frost, 18, "Big Shoulders Display", "center", "800");
          found.forEach((f, i) => text(x, f, w / 2, 100 + i * 30, COL.food, 16, "IBM Plex Mono", "center"));
        } };
        const bs = step.items.map(([name, what], i) => {
          const b = el("button", "rg-card", `<span class="k">${i + 1}</span>Check ${esc(name)}`);
          b.addEventListener("click", () => look(i)); st.cards.appendChild(b); return b;
        });
        function look(i) {
          if (st.cur !== res || bs[i].disabled) return;
          bs[i].disabled = true; found.push(`${step.items[i][0]}: ${step.items[i][1]}`); left -= 1;
          if (!left) { setTimeout(() => { if (st.cur !== res) return; st.cur = null; st.widget = null; st.cards.innerHTML = ""; st.say("✓ " + step.done, COL.safe); res(true); }, 900); }
        }
        H.setKey((e) => { const i = "12345".indexOf(e.key); if (i >= 0 && i < bs.length) { look(i); return true; } });
      });
    }
    const RUNNERS = { pick, tap, hold, crank, stop, tune, rhythm, inspect };

    // ------------------------------------------------------------------ the 10 games
    const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
    const P = (label, wrong, extra) => Object.assign({ kind: "pick", label, wrong: wrong || [] }, extra || {});
    const GAMES = {
      "Change a Flat in the Dark": (tier, env) => [
        P("Wedge the wheel opposite the flat", [{ label: "Jack the car up first", why: "the wheel spins in the air when you try to loosen the nuts", sec: 8, noise: 20 }], { short: "Wedge the opposite wheel" }),
        P("Loosen the lug nuts a half turn while the tire is on the ground", [], { short: "Loosen nuts (tire down)" }),
        { kind: "tap", label: tier === "HARD" ? "One lug nut is seized. Work the wrench." : "Break each lug nut loose.", n: tier === "HARD" ? 14 : 8, button: "TURN WRENCH", done: "Nuts loosened.", short: "Turn the wrench" },
        P("Place the jack at the frame point behind the front wheel", [{ label: "Place the jack under the plastic bumper", why: "the bumper cracks and the car drops", sec: 0, noise: 30, fatal: true }], { short: "Jack at the frame point" }),
        { kind: "hold", label: "Hold the flashlight steady while you swap the tire.", lo: 45, hi: 75, secs: tier === "HARD" ? 4 : 3, button: "HOLD LIGHT", lowWord: "too dark", highWord: "beam everywhere", done: "Tire swapped.", short: "Swap the tire" },
        P("Hand-tighten, lower the car, then tighten in a star pattern", [{ label: "Tighten each nut fully, one by one, around the circle", why: "the wheel seats crooked; you redo it", sec: 8, noise: 8 }], { short: "Lower, star-pattern tighten" }),
      ],
      "Jump-Start a Dead Battery": (tier, env) => {
        const lab = tier === "EASY" ? " (red, marked +)" : "";
        const s = [];
        if (tier === "HARD") s.push({ kind: "tap", label: "The terminals are crusted. Scrape them clean.", n: 8, button: "SCRAPE", done: "Terminals clean.", short: "Scrape terminals" });
        s.push(P("Red clamp on the DEAD battery's positive terminal" + lab, [{ label: "Black clamp on the dead battery's negative terminal", why: "sparks right next to the battery", sec: 6, noise: 30 }], { short: "Red on dead (+)" }));
        s.push(P("Other red clamp on the GOOD battery's positive terminal" + lab, [{ label: "Touch the two free clamps together to test them", why: "a loud shower of sparks", sec: 6, noise: 35 }], { short: "Red on good (+)" }));
        s.push(P("Black clamp on the GOOD battery's negative terminal", [], { short: "Black on good (−)" }));
        s.push(P("Last black clamp on bare metal away from the dead battery", [{ label: "Last black clamp on the dead battery's negative terminal", why: "sparks near the battery's gas", sec: 6, noise: 25 }], { short: "Black on bare metal" }));
        const cold = env.tempF < 20;
        s.push({ kind: "crank", secs: cold ? 4.5 : 2.5, maxBurst: 4, coldNote: cold ? ` (cold battery: ${env.tempFtxt} normal, needs more)` : "", short: "Crank the engine" });
        return s;
      },
      "Treat a Wound": (tier, env) => {
        const s = [P("Put on gloves", [{ label: "Pour alcohol straight into the wound", why: "it stings badly and you yell", sec: 3, noise: 25 }], { short: "Gloves on" }),
          { kind: "hold", label: "Press firmly on the wound until the bleeding slows.", lo: 55, hi: 85, secs: 3, button: "PRESS", lowWord: "still bleeding", highWord: "too hard", done: "Bleeding slowed.", short: "Firm direct pressure" }];
        if (tier === "HARD") s.push({ kind: "hold", label: "A second wound on your forearm. Press again.", lo: 55, hi: 85, secs: 3, button: "PRESS", lowWord: "still bleeding", highWord: "too hard", done: "Both wounds controlled.", short: "Second wound" });
        s.push(P("Rinse the wound with clean water", [{ label: "Pour alcohol deep into the wound", why: "it stings badly and you yell", sec: 3, noise: 25 }], { short: "Rinse with clean water" }));
        s.push({ kind: "inspect", title: "Look closely at the wound", label: "Look for bite marks.", items: [["the edges", "torn, ragged"], ["the shape", env.infected ? "a curved row of tooth marks" : "a straight scrape, no tooth marks"], ["the skin around it", env.infected ? "dark red streaks" : "normal colour"]], done: "You've looked carefully.", short: "Look for bite marks" });
        s.push(P("Bandage it and note the time", [{ label: "Leave it open to the air", why: "it starts bleeding again", sec: 5, noise: 5 }], { short: "Bandage, note the time" }));
        return s;
      },
      "Cold Emergency Triage": (tier, env) => {
        const s = [{ kind: "inspect", title: "Your companion is shivering", label: "Check their speech, skin and fingers.", items: [["speech", "slow and slurred"], ["skin", "pale and cold"], ["fingers", tier === "HARD" ? "white, waxy and numb (frostbite)" : "cold but pink"]], done: "Signs of hypothermia.", short: "Check the signs" },
          P("Get them out of the wind", [{ label: "Walk them around fast to warm up", why: "they stumble and fall in the snow", sec: 6, noise: 12 }], { short: "Out of the wind" }),
          P("Remove their wet clothes", [{ label: "Add dry layers over the wet clothes", why: "the wet layer keeps pulling heat out", sec: 6, noise: 5 }], { short: "Remove wet clothes" }),
          P("Dry layers and a sleeping bag", [], { short: "Dry layers + sleeping bag" }),
          P("A warm, sweet drink once they are alert", [{ label: "A shot of whiskey to warm them up", why: "alcohol makes them lose heat faster", sec: 5, noise: 5 }], { short: "Warm sweet drink (alert)" })];
        if (tier === "HARD") s.push(P("Frostbite: rewarm the fingers in warm (not hot) water, no rubbing", [{ label: "Rub the fingers hard with snow", why: "rubbing damages frozen tissue", sec: 8, noise: 8 }, { label: "Soak the fingers in very hot water", why: "numb skin burns without feeling it", sec: 8, noise: 8 }], { short: "Rewarm frostbite gently" }));
        return s;
      },
      "Make Water Safe": (tier, env) => {
        const high = env.elevM * 3.281 > 6500, mins = high ? 3 : 1;
        const elevTxt = tier === "HARD" || tier === "NORMAL" ? "" : ` You are at about ${Math.round(env.elevM * 3.281).toLocaleString()} ft.`;
        return [
          P("Take water from the clearest moving stream", [{ label: "Scoop from the roadside puddle", why: "it's full of runoff and oil", sec: 6, noise: 4 }, { label: "Break the ice on the still pond by the ditch", why: "still, murky water; you start over", sec: 6, noise: 10 }], { short: "Clearest source" }),
          P("Pour it through a folded cloth to filter it", [{ label: "Boil it straight away, grit and all", why: "the grit clogs the pot", sec: 4, noise: 4 }], { short: "Filter through cloth" }),
          { kind: "stop", title: "Rolling boil", needStart: false, label: `Stop the stove after a full rolling boil of ${tier === "EASY" ? mins + " minute" + (mins > 1 ? "s" : "") : "the right time (CDC: 1 minute, 3 minutes above 6,500 ft)"}.${elevTxt}${tier !== "EASY" ? ` Check the map: this stop's weather station is at ${Math.round(env.elevM * 3.281).toLocaleString()} ft.` : ""} Press SPACE or STOP.`,
            rate: 12, max: mins * 60 * 2.2, lo: mins * 60, hi: mins * 60 * 1.6, sputter: tier === "HARD", show: (v) => mmss(v), hint: "1 second here = 12 seconds of boiling",
            early: { sec: 4, noise: 4, why: "not boiled long enough; you start the boil again" }, late: { sec: 3, noise: 2, why: "you wasted stove fuel" }, over: { sec: 6, noise: 4, why: "the pot boiled half dry" }, done: "Safe to drink once it cools.", short: `Boil ${mins} min` },
          P("Let it cool and store it covered", [{ label: "Pour it into the open, dirty bottle", why: "you just re-contaminated it", sec: 6, noise: 2 }], { short: "Cool, store covered" }),
        ];
      },
      "Siphon Fuel": (tier, env) => [
        { kind: "tune", title: "Feed the hose past the anti-rollover valve", label: "Wiggle the hose until you feel it slip past the valve (the bar fills).", min: 0, max: 100, start: 0, target: 40 + Math.random() * 45, tol: 4, show: (v) => `hose depth ${Math.round(v)} cm`, clearWord: "feel", done: "The hose slides past the valve.", short: "Hose past the valve" },
        P("Set the gas can on the ground, below the tank", [{ label: "Hold the can up level with the tank", why: "nothing flows uphill", sec: 5, noise: 3 }], { short: "Can below the tank" }),
        { kind: "rhythm", title: "Squeeze the pump bulb", label: "Pump the bulb steadily until fuel flows.", hits: tier === "HARD" ? 7 : 5, period: 1.1, button: "SQUEEZE", miss: { sec: 3, noise: 15, why: "frantic pumping splashes gasoline" }, done: "Fuel is flowing.", short: "Pump the bulb" },
        { kind: "stop", title: "Gas can filling", label: "Pull the hose out when the can is 85–98% full. Press SPACE or STOP.", rate: tier === "HARD" ? 14 : 10, max: 104, lo: 85, hi: 98, show: (v) => `${Math.min(100, Math.round(v))}% full`, hint: "a spill near a running engine is a fire risk",
          early: { sec: 2, noise: 2, why: "barely any fuel; you restart the flow" }, late: { sec: 2, noise: 15, why: "it slopped over the top" }, over: { sec: 0, noise: 30, why: "the can overflowed and gasoline spilled everywhere", fatal: tier !== "EASY" }, done: "Can filled.", short: "Stop before it overflows" },
      ],
      "Put On Tire Chains": (tier, env) => {
        const one = (side) => [P(`Lay the ${side}chain flat and untwist it`, [{ label: `Throw the ${side}chain over the tire as it is`, why: "a twisted chain will snap on the climb", sec: 6, noise: 10 }], { short: "Lay flat, no twists" }),
          P(`Drape the ${side}chain over the tire`, [], { short: "Drape over the tire" }),
          P("Hook the INSIDE fastener first", [{ label: "Hook the outside fastener first", why: "you can't reach the inside hook now", sec: 6, noise: 6 }], { short: "Hook inside first" }),
          P("Hook the outside fastener", [], { short: "Hook the outside" }),
          { kind: "hold", label: "Pull the tensioner tight.", lo: 60, hi: 85, secs: 2.5, button: "PULL", lowWord: "loose", highWord: "hook bends", done: "Tight.", short: "Tighten" }];
        const s = one(tier === "HARD" ? "first " : "");
        if (tier === "HARD") s.push(...one("second "));
        s.push(P("Drive 10 feet, stop, and retighten", [{ label: "Drive off up the grade right away", why: "the chains loosen halfway up", sec: 10, noise: 15 }], { short: "Drive 10 ft, retighten" }));
        return s;
      },
      "Navigate by Map and Compass": (tier, env) => [
        { kind: "tune", title: "Orient the map to north", label: "Turn the map until its north arrow points the same way as the compass needle.", min: 0, max: 360, wrap: true, start: Math.random() * 360, target: 0, tol: 6, clearWord: "lined up",
          draw: (x, w, v, clear) => { compass(x, w / 2, 130, 60, v, "N"); }, done: "Map oriented.", short: "Orient the map" },
        P(`Mark where you are: ${env.here}`, env.others.slice(0, 2).map((o) => ({ label: `Mark where you are: ${o}`, why: "that's a different county on your route", sec: 6, noise: 4 })), { short: "Mark your position", prompt: "Which county are you in now?" + (tier === "EASY" ? ` (the road sign says ${env.here})` : "") }),
        P("Trace back roads around the closure", [{ label: "Take the interstate through the closure anyway", why: "it's blocked; you turn back", sec: 8, noise: 10 }], { short: "Pick roads around the closure" }),
        { kind: "tune", title: `Follow bearing ${Math.round(env.bearing)}° toward ${env.nextLabel}`, label: `Rotate the compass bezel to ${Math.round(env.bearing)}°${tier === "HARD" ? " by flashlight" : ""}.`, min: 0, max: 360, wrap: true, start: (env.bearing + 120 + Math.random() * 120) % 360, target: env.bearing, tol: tier === "HARD" ? 4 : 6, clearWord: "on bearing",
          draw: (x, w, v) => { compass(x, w / 2, 130, 60, v, `${Math.round(v)}°`); }, done: "On bearing.", short: "Follow the bearing" },
        P(`Check the landmark: the sign for ${env.nextCounty}`, [{ label: "Skip the landmarks and trust your gut", why: "a dead end; you backtrack", sec: 8, noise: 6 }], { short: "Check landmarks" }),
      ],
      "Find the Emergency Broadcast": (tier, env) => {
        const freqs = [162.4, 162.425, 162.45, 162.475, 162.5, 162.525, 162.55], f = freqs[Math.floor(Math.random() * freqs.length)];
        return [
          { kind: "tune", title: "NOAA Weather Radio band", label: "Turn the dial through 162.400–162.550 MHz until the static clears.", min: 162.4, max: 162.55, start: 162.4 + Math.random() * 0.15, target: f, tol: tier === "EASY" ? 0.006 : 0.004, drift: tier === "HARD", show: (v) => v.toFixed(3) + " MHz", done: `Clear signal at ${f.toFixed(3)} MHz.`, short: "Tune the radio" },
          P(`Note: the ${env.safeName} safe zone`, env.otherSafe.map((o) => ({ label: `Note: the ${o} safe zone`, why: "you misheard the broadcast", sec: 5, noise: 3 })), { short: "Note the safe zone", prompt: `Broadcast: "…evacuees should proceed to the ${env.safeName} safe zone…" What do you write down?` }),
          P("Note: the gates seal at midnight on Day 7", [{ label: "Note: the gates seal at noon on Day 6", why: "you misheard the broadcast", sec: 5, noise: 3 }, { label: "Note: the gates seal at dawn on Day 8", why: "you misheard the broadcast", sec: 5, noise: 3 }], { short: "Note the closing time", prompt: '"…gates seal at midnight at the end of Day 7…" What do you write down?' }),
          P(`Note: lows near ${env.tempFtxt} tonight`, [{ label: `Note: lows near ${env.tempWrong1}`, why: "you misheard the forecast", sec: 4, noise: 3 }, { label: `Note: lows near ${env.tempWrong2}`, why: "you misheard the forecast", sec: 4, noise: 3 }], { short: "Note the weather", prompt: `"…January temperatures near ${env.tempFtxt}…" (the real January normal here). What do you write down?` }),
        ];
      },
      "Snowed In: Carbon Monoxide": (tier, env) => [
        { kind: "tap", label: "Dig the snow away from around the car.", n: 8, button: "DIG", done: "The car is dug out.", short: "Dig out the car" },
        P("Clear the tailpipe completely", [{ label: "Start the engine to warm up first", why: "exhaust fills the car (carbon monoxide): your head pounds", sec: 10, noise: 10, fatal: tier === "HARD" }], { short: "Clear the tailpipe" }),
        P("Crack the window on the downwind side", [{ label: "Crack the window facing the wind", why: "snow blows in and you're soaked", sec: 5, noise: 3 }, { label: "Keep every window sealed tight", why: "no fresh air at all", sec: 6, noise: 3 }], { short: "Crack a downwind window" }),
        { kind: "stop", title: "Engine running for heat", label: "Run the engine about 10 minutes, then shut it off (8–12 minutes). Press SPACE or STOP.", rate: 2, max: 20, lo: 8, hi: 12, show: (v) => `${v.toFixed(1)} min`, hint: tier === "HARD" ? "fuel is low: every minute costs fuel" : "1 second here = 2 minutes",
          early: { sec: 3, noise: 2, why: "not warm enough; you start it again" }, late: { sec: 3, noise: 4, why: "you burned extra fuel" }, over: { sec: 6, noise: 8, why: "you nodded off with the engine running" }, done: "Warm enough. Engine off.", short: "Run the engine ~10 min" },
        { kind: "rhythm", title: "Stay awake", label: "Your eyes keep closing. Snap awake on time.", hits: 3, period: 1.6, button: "WAKE UP", miss: { sec: 3, noise: 6, why: "you dozed off for a moment" }, done: "You stayed awake through the night.", short: "Stay awake" },
      ],
    };
    function compass(x, cx, cy, r, ang, label) {
      x.strokeStyle = COL.line; x.lineWidth = 3; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
      const a = (ang - 90) * Math.PI / 180;
      x.strokeStyle = COL.blood; x.lineWidth = 4; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); x.stroke();
      x.strokeStyle = COL.ice; x.lineWidth = 2; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy - r * 0.9); x.stroke();
      text(x, label, cx + r + 50, cy, COL.frost, 22, "Big Shoulders Display", "center", "800");
      text(x, "needle", cx - r - 50, cy - 10, COL.ice, 12, "IBM Plex Mono", "center"); text(x, "map", cx - r - 50, cy + 10, COL.blood, 12, "IBM Plex Mono", "center");
    }

    // ------------------------------------------------------------------ public
    async function play(area, name, tier, env) {
      const G = env.G, steps = GAMES[name](tier, env);
      const st = makeRun(area, G, tier, env);
      st.steps = steps; st.renderCheck();
      for (let i = 0; i < steps.length && !st.over; i++) {
        st.k = i; st.renderCheck();
        const ok = await RUNNERS[steps[i].kind](st, steps[i], steps.slice(i + 1), env);
        H.setKey(null); H.setKeyUp(null);
        if (!ok || st.over) break;
        st.k = i + 1; st.renderCheck();
      }
      const win = !st.over;
      st.ended = true; st.widget = null; H.setKey(null); H.setKeyUp(null);
      st.cards.innerHTML = "";
      return { win, note: win ? "" : `Failed: ${st.overWhy}.` };
    }
    return { play, names: Object.keys(GAMES), steps: (name, tier, env) => GAMES[name](tier, env) };
  };
})();
