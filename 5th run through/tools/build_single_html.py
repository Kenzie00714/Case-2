"""Inline data.js, sim.js, realgames.js and game.js into one HTML file: web/zombie_escape_full_game.html."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, "web")
html = open(os.path.join(WEB, "index.html"), encoding="utf-8").read()
def inline(m):
    js = open(os.path.join(WEB, m.group(1)), encoding="utf-8").read().replace("</script", "<\\/script")
    return f"<script>\n/* ---- {m.group(1)} ---- */\n{js}\n</script>"
out = re.sub(r'<script src="([a-z]+\.js)"></script>', inline, html)
path = os.path.join(WEB, "zombie_escape_full_game.html")
open(path, "w", encoding="utf-8").write(out)
print(f"Wrote {path} ({os.path.getsize(path) / 1024:.0f} KB)")
