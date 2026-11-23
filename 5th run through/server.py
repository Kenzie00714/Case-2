"""
Self-hosted web server for Zombie Escape. Python standard library only, no domain needed.

  python server.py                    http://localhost:8000 (this computer only)
  python server.py --host 0.0.0.0     also reachable from other devices on your network at
                                      http://<this computer's IP address>:8000
  python server.py --port 9000

Endpoints:
  /                 the game (web/index.html)
  /health           "ok" (for uptime checks)
  /api/montecarlo?city=NYC&policy=balanced&runs=500    Monte Carlo from the Python engine (JSON)
"""
import argparse
import http.server
import json
import os
import socket
import sys
import threading
from urllib.parse import urlparse, parse_qs

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
sys.path.insert(0, ROOT)

LOCK = threading.Lock()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=WEB, **kw)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def _json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        if u.path == "/health":
            body = b"ok"
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(body)
            return
        if u.path == "/api/montecarlo":
            from zombie_sim.sim import monte_carlo
            from zombie_sim.policies import POLICIES
            q = parse_qs(u.query)
            city = q.get("city", ["NYC"])[0].upper()
            pol = q.get("policy", ["balanced"])[0]
            try:
                runs = max(1, min(2000, int(q.get("runs", ["500"])[0])))
            except ValueError:
                return self._json(400, {"error": "runs must be a whole number"})
            if city not in ("NYC", "BOS", "PIT", "SLC", "JAC", "SEA", "AUS") or pol not in POLICIES:
                return self._json(400, {"error": "unknown city or policy", "policies": sorted(POLICIES)})
            with LOCK:
                res = monte_carlo(city, POLICIES[pol], runs)
            res.pop("rows", None)
            return self._json(200, {"city": city, "policy": pol, **res,
                                    "note": "Probabilities inside the game's fictional model, not real-world odds."})
        return super().do_GET()

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    a = ap.parse_args()
    if not os.path.exists(os.path.join(WEB, "data.js")):
        sys.exit("web/data.js is missing. Run: python tools/build_web.py")
    srv = http.server.ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"Zombie Escape running at http://localhost:{a.port}")
    if a.host == "0.0.0.0" and lan_ip():
        print(f"Other devices on your network: http://{lan_ip()}:{a.port}")
    print("Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
