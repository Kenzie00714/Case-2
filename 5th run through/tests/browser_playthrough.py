"""Plays the web game in headless Chrome: full trips on every route, checks for page errors, screenshots."""
import os, sys, threading, http.server, functools, json
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
OUT = os.path.join(ROOT, "reports", "screenshots")
os.makedirs(OUT, exist_ok=True)


def serve():
    h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=WEB)
    h.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8765), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    srv = serve()
    errors, results = [], []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=os.environ.get("CHROME") or None)
        page = b.new_page(viewport={"width": 1280, "height": 900})
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "ERR_TUNNEL" not in m.text and "fonts" not in m.text else None)
        cities = ["NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS"]
        for ci, code in enumerate(cities):
            page.goto("http://127.0.0.1:8765/index.html")
            page.evaluate("() => { window.__ZE_SIM_MINIGAMES = true; return 1; }")
            page.fill("#seed", str(100 + ci))
            if ci == 1:   # one route in developer mode
                page.fill("#devpw", "$@lt3d_Butter"); page.click("#devgo")
                assert "ON" in page.locator("#devstate").inner_text()
            if ci == 0:
                page.screenshot(path=os.path.join(OUT, "title.png"), full_page=True)
            page.locator(".city").nth(ci).click()
            shots = 0
            enters = 0
            for step in range(400):
                if page.locator("table.mc").count() and "Running" not in page.locator(".end .hint").first.inner_text():
                    if page.locator("#mcchart").count():
                        break
                opt = page.locator("button.opt:not([disabled])")
                if opt.count():
                    if ci == 1 and shots == 0:
                        shots = 0
                    if ci in (0, 1) and shots == 0:
                        page.screenshot(path=os.path.join(OUT, "scene.png" if ci == 0 else "scene_dev.png"), full_page=True); shots += 1
                    opt.nth(step % opt.count()).click()
                    page.wait_for_timeout(320)
                    continue
                btn = page.locator("#screen button.btn:not(.ghost)")
                if btn.count():
                    if ci in (0, 1) and shots == 1 and page.locator(".tiles").count() and page.locator(".outcome-head").count():
                        page.screenshot(path=os.path.join(OUT, "dashboard.png" if ci == 0 else "dashboard_dev.png"), full_page=True); shots += 1
                    if ci == 0 and page.locator("#outbreak:not(.hidden)").count() and "ended" not in btn.first.inner_text().lower():
                        errors.append("SEIR panel visible during player-mode play")
                    btn.first.click()
                    continue
                page.wait_for_timeout(150)
            page.wait_for_selector("#mcchart", timeout=60000)
            ending = page.locator(".end h2").inner_text()
            surv = page.locator("table.mc tr").nth(1).inner_text()
            results.append((code, ending, surv.replace("\t", " ")))
            if ci == 0:
                page.screenshot(path=os.path.join(OUT, "end.png"), full_page=True)
        b.close()
    srv.shutdown()
    for r in results:
        print(*r)
    print("page errors:", errors or "none")
    return 1 if errors or len(results) != 7 else 0


if __name__ == "__main__":
    sys.exit(main())
