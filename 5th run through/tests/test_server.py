import json, os, subprocess, sys, time, urllib.request, urllib.error
import pytest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture(scope="module")
def server():
    p = subprocess.Popen([sys.executable, os.path.join(ROOT, "server.py"), "--port", "8799"],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    for _ in range(50):
        try:
            urllib.request.urlopen("http://127.0.0.1:8799/health", timeout=1)
            break
        except OSError:
            time.sleep(0.1)
    yield "http://127.0.0.1:8799"
    p.terminate()
    p.wait()


def test_serves_game_and_health(server):
    assert urllib.request.urlopen(server + "/health").read() == b"ok"
    html = urllib.request.urlopen(server + "/").read().decode()
    assert "Zombie" in html and "sim.js" in html
    assert urllib.request.urlopen(server + "/data.js").status == 200


def test_monte_carlo_api(server):
    r = json.loads(urllib.request.urlopen(server + "/api/montecarlo?city=SLC&policy=random&runs=20").read())
    assert r["runs"] == 20 and 0 <= r["survival_rate"] <= 1


def test_bad_request(server):
    with pytest.raises(urllib.error.HTTPError) as e:
        urllib.request.urlopen(server + "/api/montecarlo?city=ZZZ")
    assert e.value.code == 400
