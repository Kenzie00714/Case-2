"""
Zombie Escape - mini games.

LIVE versions use Python's built-in `curses` module: things move on screen in real
time and react to your keypresses. They run in a real terminal window:
  * Mac / Linux: works as-is (Terminal app).
  * Windows: run `pip install windows-curses` once, then use Command Prompt or PowerShell.
If curses can't start (IDLE, Colab, a window that's too small), each game automatically
switches to its TEXT version so the game never crashes.

Every game: play(name, tier) -> (won: bool, bonus: dict)
tier is "HARD", "NORMAL" or "EASY". bonus can hold extra supplies earned live, e.g. {"water": 10}.
"""
import random
import sys
import time

try:
    import curses
except ImportError:          # Windows without windows-curses
    curses = None


class TooSmall(Exception):
    pass


# ======================================================================
# Shared helpers for live games
# ======================================================================
def _setup(scr, rows=22, cols=64):
    h, w = scr.getmaxyx()
    if h < rows or w < cols:
        raise TooSmall()
    curses.curs_set(0)
    scr.keypad(True)
    scr.nodelay(True)
    if curses.has_colors():
        curses.start_color()
        try:
            curses.use_default_colors()
            bg = -1
        except curses.error:
            bg = curses.COLOR_BLACK
        curses.init_pair(1, curses.COLOR_GREEN, bg)
        curses.init_pair(2, curses.COLOR_RED, bg)
        curses.init_pair(3, curses.COLOR_YELLOW, bg)
        curses.init_pair(4, curses.COLOR_CYAN, bg)
        curses.init_pair(5, curses.COLOR_BLUE, bg)


def C(n):
    return curses.color_pair(n) if curses.has_colors() else 0


def put(scr, y, x, s, attr=0):
    try:
        scr.addstr(y, x, s, attr)
    except curses.error:
        pass


def flush(scr):
    while scr.getch() != -1:
        pass


def intro(scr, title, tier, lines):
    scr.nodelay(False)
    scr.timeout(20000)                      # wait up to 20 s on the instructions
    scr.erase()
    color = {"HARD": C(2), "NORMAL": C(3), "EASY": C(1)}[tier]
    put(scr, 1, 2, f"MINI GAME: {title}", curses.A_BOLD | C(4))
    put(scr, 2, 2, f"Difficulty: {tier}", curses.A_BOLD | color)
    for i, line in enumerate(lines):
        put(scr, 4 + i, 4, line)
    put(scr, 5 + len(lines), 4, "Press any key to start...", C(3))
    scr.refresh()
    scr.getch()
    for n in ("3", "2", "1", "GO!"):
        scr.erase()
        put(scr, 9, 28, n, curses.A_BOLD | C(3))
        scr.refresh()
        time.sleep(0.5)
    scr.nodelay(True)
    scr.timeout(0)
    flush(scr)


def outro(scr, won, msg=""):
    scr.erase()
    put(scr, 8, 24, "SUCCESS!" if won else "FAILED!", curses.A_BOLD | (C(1) if won else C(2)))
    if msg:
        put(scr, 10, 6, msg)
    scr.refresh()
    time.sleep(1.8)


def timer_bar(scr, y, x, left, total, width=30):
    frac = max(0.0, min(1.0, left / total))
    filled = int(frac * width)
    color = C(1) if frac > 0.5 else C(3) if frac > 0.25 else C(2)
    put(scr, y, x, "TIME [")
    put(scr, y, x + 6, "#" * filled, color | curses.A_BOLD)
    put(scr, y, x + 6 + filled, "-" * (width - filled))
    put(scr, y, x + 6 + width, f"] {max(0, left):4.1f}s")


def read_key_into(scr, buf, allowed):
    """Collect typed keys into a buffer. Returns (buf, entered)."""
    entered = False
    k = scr.getch()
    while k != -1:
        if k in (10, 13, curses.KEY_ENTER):
            entered = True
        elif k in (8, 127, curses.KEY_BACKSPACE):
            buf = buf[:-1]
        elif 0 <= k < 256 and chr(k).upper() in allowed and len(buf) < 20:
            buf += chr(k).upper()
        k = scr.getch()
    return buf, entered


# ======================================================================
# 1. LOCK THE DOOR (live timing bar)
# ======================================================================
LOCK = {"HARD": (3, 44), "NORMAL": (5, 30), "EASY": (9, 20)}   # green zone width, marker speed


def live_lock_door(scr, tier):
    _setup(scr)
    zone, speed = LOCK[tier]
    intro(scr, "Lock the Door", tier, [
        "The infected are slamming against the door!",
        "A marker slides back and forth across the lock bar.",
        "Press SPACE when the marker is inside the GREEN zone.",
        "3 rounds. Lock it 2 times to win."])
    W, wins = 44, 0
    for rnd in range(1, 4):
        start = random.randint(8, W - zone - 2)
        pos, direction, passes, result = 0.0, 1, 0, None
        last = time.monotonic()
        while result is None:
            now = time.monotonic()
            pos += direction * speed * (now - last)
            last = now
            if pos >= W - 1:
                pos, direction, passes = W - 1, -1, passes + 1
            elif pos <= 0:
                pos, direction, passes = 0, 1, passes + 1
            if passes >= 4:
                result = False
            if scr.getch() == ord(" "):
                result = start <= int(pos) < start + zone
            scr.erase()
            put(scr, 1, 2, f"LOCK THE DOOR   Round {rnd}/3   Locks: {wins}", curses.A_BOLD)
            put(scr, 4, 4, "BANG! BANG!" if int(now * 3) % 2 else "", C(2) | curses.A_BOLD)
            put(scr, 7, 4, "[")
            for i in range(W):
                in_zone = start <= i < start + zone
                put(scr, 7, 5 + i, "=" if in_zone else "-", (C(1) | curses.A_BOLD) if in_zone else 0)
            put(scr, 7, 5 + W, "]")
            put(scr, 6, 5 + int(pos), "v", C(3) | curses.A_BOLD)
            put(scr, 8, 5 + int(pos), "^", C(3) | curses.A_BOLD)
            put(scr, 11, 4, "Press SPACE in the green zone!")
            scr.refresh()
            time.sleep(0.016)
        wins += bool(result)
        scr.erase()
        put(scr, 9, 8, "LOCKED!" if result else "MISSED! The door cracks open...",
            curses.A_BOLD | (C(1) if result else C(2)))
        scr.refresh()
        time.sleep(0.9)
        flush(scr)
        if wins >= 2 or rnd - wins >= 2:
            break
    won = wins >= 2
    outro(scr, won)
    return won, {}


# ======================================================================
# 2. ESCAPE THE HORDE (live chase on a grid)
# ======================================================================
HORDE = {"HARD": (5, 0.33, 25), "NORMAL": (3, 0.5, 30), "EASY": (2, 0.8, 40)}  # zombies, step time, seconds


def _path_exists(grid, a, b):
    seen, todo = {a}, [a]
    while todo:
        y, x = todo.pop()
        if (y, x) == b:
            return True
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < len(grid) and 0 <= nx < len(grid[0]) and grid[ny][nx] != "#" and (ny, nx) not in seen:
                seen.add((ny, nx))
                todo.append((ny, nx))
    return False


def _zombie_step(grid, z, p, taken):
    options = []
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = z[0] + dy, z[1] + dx
        if 0 <= ny < len(grid) and 0 <= nx < len(grid[0]) and grid[ny][nx] != "#" \
                and ((ny, nx) not in taken or (ny, nx) == p):
            options.append((abs(ny - p[0]) + abs(nx - p[1]), random.random(), (ny, nx)))
    if not options:
        return z
    if random.random() < 0.2:                         # zombies stumble sometimes
        return random.choice(options)[2]
    return min(options)[2]


def live_escape_horde(scr, tier):
    _setup(scr)
    nz, step, limit = HORDE[tier]
    intro(scr, "Escape the Horde", tier, [
        "You're trapped in a parking lot full of wrecked cars (#).",
        "Move with the ARROW KEYS or W A S D.",
        "Reach the exit E before the infected Z catch you.",
        f"{nz} infected are hunting you. You have {limit} seconds."])
    GW, GH = 40, 14
    while True:
        grid = [["#" if random.random() < 0.18 else " " for _ in range(GW)] for _ in range(GH)]
        p, e = (GH // 2, 1), (random.randint(1, GH - 2), GW - 2)
        grid[p[0]][p[1]] = grid[e[0]][e[1]] = " "
        if _path_exists(grid, p, e):
            break
    zs = []
    while len(zs) < nz:
        z = (random.randint(0, GH - 1), random.randint(GW // 3, GW - 4))
        if grid[z[0]][z[1]] == " " and z != e and z not in zs:
            zs.append(z)
    moves = {curses.KEY_UP: (-1, 0), curses.KEY_DOWN: (1, 0), curses.KEY_LEFT: (0, -1), curses.KEY_RIGHT: (0, 1)}
    for ch, mv in (("w", (-1, 0)), ("s", (1, 0)), ("a", (0, -1)), ("d", (0, 1))):
        moves[ord(ch)] = moves[ord(ch.upper())] = mv
    t0 = last_z = time.monotonic()
    result = None
    while result is None:
        now = time.monotonic()
        k = scr.getch()
        while k != -1:
            if k in moves:
                dy, dx = moves[k]
                ny, nx = p[0] + dy, p[1] + dx
                if 0 <= ny < GH and 0 <= nx < GW and grid[ny][nx] != "#":
                    p = (ny, nx)
            k = scr.getch()
        if p == e:
            result = True
        elif now - last_z >= step:
            last_z = now
            zs = [_zombie_step(grid, z, p, set(zs)) for z in zs]
        if result is None and (p in zs or now - t0 > limit):
            result = False
        scr.erase()
        put(scr, 1, 2, "ESCAPE THE HORDE", curses.A_BOLD | C(4))
        timer_bar(scr, 2, 2, limit - (now - t0), limit)
        oy, ox = 4, 4
        put(scr, oy - 1, ox - 1, "+" + "-" * GW + "+")
        put(scr, oy + GH, ox - 1, "+" + "-" * GW + "+")
        for y in range(GH):
            put(scr, oy + y, ox - 1, "|")
            put(scr, oy + y, ox + GW, "|")
            for x in range(GW):
                if grid[y][x] == "#":
                    put(scr, oy + y, ox + x, "#", C(5))
        put(scr, oy + e[0], ox + e[1], "E", C(1) | curses.A_BOLD)
        for z in zs:
            put(scr, oy + z[0], ox + z[1], "Z", C(2) | curses.A_BOLD)
        put(scr, oy + p[0], ox + p[1], "@", C(3) | curses.A_BOLD)
        put(scr, oy + GH + 1, ox, "You = @   Exit = E   Infected = Z")
        scr.refresh()
        time.sleep(0.02)
    outro(scr, result, "You slipped out of the lot!" if result else "They caught up to you...")
    return result, {}


# ======================================================================
# 3. DODGE THE WRECKS (live lane driving, grab water bottles)
# ======================================================================
DODGE = {"HARD": (0.09, 20, 1), "NORMAL": (0.14, 16, 2), "EASY": (0.2, 12, 3)}  # tick, seconds, hits allowed


def live_dodge(scr, tier):
    _setup(scr)
    tick, duration, lives = DODGE[tier]
    intro(scr, "Dodge the Wrecks", tier, [
        "You're racing down a jammed highway at night.",
        "LEFT / RIGHT arrows (or A / D) switch lanes.",
        "Dodge wrecks # and infected Z. Grab water bottles W for bonus water!",
        f"Survive {duration} seconds. You can take {lives} hit(s)."])
    H, car_row, lane = 16, 14, 1
    objs, hits, bottles, cooldown = [], 0, 0, 0
    t0 = last = time.monotonic()
    result = None

    def collide():
        nonlocal hits, bottles
        for o in objs[:]:
            if o[0] == car_row and o[1] == lane:
                if o[2] == "W":
                    bottles += 1
                else:
                    hits += 1
                objs.remove(o)

    while result is None:
        now = time.monotonic()
        k = scr.getch()
        while k != -1:
            if k in (curses.KEY_LEFT, ord("a"), ord("A")):
                lane = max(0, lane - 1)
                collide()
            elif k in (curses.KEY_RIGHT, ord("d"), ord("D")):
                lane = min(2, lane + 1)
                collide()
            k = scr.getch()
        if now - last >= tick:
            last = now
            for o in objs:
                o[0] += 1
            collide()
            objs[:] = [o for o in objs if o[0] <= car_row]
            cooldown -= 1
            if cooldown <= 0:
                lanes = [0, 1, 2]
                random.shuffle(lanes)
                for l in lanes[:1 if random.random() < 0.65 else 2]:     # never block all 3 lanes
                    objs.append([0, l, random.choice("##Z")])
                if random.random() < 0.3:
                    objs.append([0, lanes[2], "W"])
                cooldown = random.randint(3, 5)
        if hits >= lives:
            result = False
        elif now - t0 >= duration:
            result = True
        scr.erase()
        put(scr, 1, 2, "DODGE THE WRECKS", curses.A_BOLD | C(4))
        timer_bar(scr, 2, 2, duration - (now - t0), duration)
        put(scr, 3, 2, f"Hits: {hits}/{lives}    Water bottles: {bottles}")
        ox = 20
        for r in range(H):
            put(scr, 5 + r, ox, "|      :      :      |")
        for row, l, kind in objs:
            color = C(2) if kind == "Z" else C(4) if kind == "W" else C(5)
            put(scr, 5 + row, ox + 3 + l * 7, kind, color | curses.A_BOLD)
        put(scr, 5 + car_row, ox + 2 + lane * 7, "[A]", C(3) | curses.A_BOLD)
        scr.refresh()
        time.sleep(0.015)
    outro(scr, result, f"You grabbed {bottles} water bottle(s)." if bottles else "")
    return result, ({"water": 5 * bottles} if bottles else {})


# ======================================================================
# 4. BARRICADE THE DOOR (live falling words)
# ======================================================================
BARRICADE = {"HARD": (0.55, 0), "NORMAL": (0.8, 1), "EASY": (1.15, 2)}   # seconds per row, breaches allowed
WORDS = ["BOARD", "NAIL", "BRACE", "LOCK", "CHAIN", "WEDGE", "BOLT", "PLANK", "HAMMER", "SCREW", "BEAM", "DOOR"]


def live_barricade(scr, tier):
    _setup(scr)
    fall, allowed = BARRICADE[tier]
    need = 6
    intro(scr, "Barricade the Door", tier, [
        "The infected are tearing at the boards!",
        "Words fall toward the door. TYPE a word to nail it in place.",
        "(It locks in as soon as you finish typing it. BACKSPACE fixes typos.)",
        f"Nail {need} words. Breaches allowed: {allowed}."])
    H, active, buf, done, breaches = 13, [], "", 0, 0
    last_fall = next_spawn = time.monotonic()
    result = None
    while result is None:
        now = time.monotonic()
        buf, entered = read_key_into(scr, buf, "ABCDEFGHIJKLMNOPQRSTUVWXYZ")
        for w in active[:]:
            if buf == w[0]:
                active.remove(w)
                done += 1
                buf = ""
                break
        if entered:
            buf = ""
        if now - last_fall >= fall:
            last_fall = now
            for w in active:
                w[1] += 1
            for w in [w for w in active if w[1] >= H]:
                active.remove(w)
                breaches += 1
        if now >= next_spawn and len(active) < 3:
            word = random.choice([w for w in WORDS if w not in [a[0] for a in active]])
            active.append([word, 0, random.randint(2, 40)])
            next_spawn = now + fall * random.uniform(3, 5)
        if done >= need:
            result = True
        elif breaches > allowed:
            result = False
        scr.erase()
        put(scr, 1, 2, f"BARRICADE THE DOOR   Nailed: {done}/{need}   Breaches: {breaches}/{allowed}",
            curses.A_BOLD | C(4))
        for word, row, col in active:
            near = row >= H - 4
            put(scr, 3 + row, 6 + col, word, curses.A_BOLD | (C(2) if near else C(3)))
        put(scr, 3 + H, 4, "=" * 54, C(5) | curses.A_BOLD)
        put(scr, 4 + H, 4, "DOOR", C(5))
        put(scr, 6 + H, 4, f"Typing: {buf}_", curses.A_BOLD)
        scr.refresh()
        time.sleep(0.02)
    outro(scr, result)
    return result, {}


# ======================================================================
# 5. SAFE OR UNSAFE? (live conveyor)
# ======================================================================
SAFE_UNSAFE = [
    ("A bulging, swollen can of beans", "U"), ("Snow melted and boiled", "S"),
    ("Water from a red mine pit lake", "U"), ("A sealed bottle of water", "S"),
    ("A rusty, leaking can of soup", "U"), ("A chocolate bar from a gas station", "S"),
    ("Lake water you didn't boil", "U"), ("A jar of honey from a pantry", "S"),
    ("Raw meat from a truck that thawed days ago", "U"), ("A sealed pack of crackers", "S"),
    ("Eating snow instead of melting it first", "U"), ("Water from a home's water heater tank", "S"),
]
CONVEYOR = {"HARD": 13, "NORMAL": 8, "EASY": 5}     # cells per second


def live_safe_unsafe(scr, tier):
    _setup(scr)
    speed = CONVEYOR[tier]
    items, need, right = random.sample(SAFE_UNSAFE, 5), 4, 0
    intro(scr, "Safe or Unsafe?", tier, [
        "Supplies slide down a conveyor toward your backpack.",
        "Press S if the item is SAFE to eat or drink, U if it's UNSAFE.",
        "Decide before it falls off the end!",
        f"Get {need} of 5 right."])
    track = 46
    for n, (text, truth) in enumerate(items, 1):
        x, answer = float(track), None
        last = time.monotonic()
        while answer is None:
            now = time.monotonic()
            x -= speed * (now - last)
            last = now
            k = scr.getch()
            while k != -1:
                if k in (ord("s"), ord("S")):
                    answer = "S"
                elif k in (ord("u"), ord("U")):
                    answer = "U"
                k = scr.getch()
            if x <= 0 and answer is None:
                answer = "-"
            scr.erase()
            put(scr, 1, 2, f"SAFE OR UNSAFE?   Item {n}/5   Correct: {right}", curses.A_BOLD | C(4))
            put(scr, 5, 4, text, curses.A_BOLD | C(3))
            put(scr, 8, 4, "[PACK]" + "_" * track)
            put(scr, 7, 10 + int(max(0, x)), "[?]", C(3) | curses.A_BOLD)
            put(scr, 11, 4, "S = SAFE     U = UNSAFE")
            scr.refresh()
            time.sleep(0.016)
        ok = answer == truth
        right += ok
        scr.erase()
        put(scr, 5, 4, text, curses.A_BOLD)
        verdict = "SAFE" if truth == "S" else "UNSAFE"
        msg = f"Correct! It's {verdict}." if ok else ("Too slow! " if answer == "-" else "Wrong! ") + f"It's {verdict}."
        put(scr, 8, 4, msg, curses.A_BOLD | (C(1) if ok else C(2)))
        scr.refresh()
        time.sleep(1.1)
        flush(scr)
    won = right >= need
    outro(scr, won, f"{right} of 5 correct.")
    return won, {}


# ======================================================================
# 6. COUNT THE INFECTED (live march across the screen)
# ======================================================================
MARCH = {"HARD": 26, "NORMAL": 17, "EASY": 10}      # cells per second


def _ask_number(scr, prompt, y):
    scr.nodelay(True)
    buf, entered = "", False
    deadline = time.monotonic() + 15
    while not entered and time.monotonic() < deadline:
        buf, entered = read_key_into(scr, buf, "0123456789")
        put(scr, y, 4, " " * 50)
        put(scr, y, 4, f"{prompt} {buf}_", curses.A_BOLD)
        scr.refresh()
        time.sleep(0.03)
    return int(buf) if buf.isdigit() else -1


def live_count(scr, tier):
    _setup(scr)
    speed = MARCH[tier]
    intro(scr, "Count the Infected", tier, [
        "A crowd is shuffling past your hiding spot.",
        "Count ONLY the infected (Z). Ignore the survivors (H).",
        "After they pass, type your count and press ENTER.",
        "2 rounds. You need to be within 2 both times."])
    width = 50
    for rnd in (1, 2):
        nz, nh, length = random.randint(7, 14), random.randint(4, 8), 70
        stream = {}
        spots = random.sample([(r, c) for r in range(3) for c in range(length)], nz + nh)
        for i, s in enumerate(spots):
            stream[s] = "Z" if i < nz else "H"
        offset = -float(width)
        last = time.monotonic()
        while offset < length:
            now = time.monotonic()
            offset += speed * (now - last)
            last = now
            scr.erase()
            put(scr, 1, 2, f"COUNT THE INFECTED   Round {rnd}/2", curses.A_BOLD | C(4))
            put(scr, 4, 4, "=" * (width + 2), C(5))
            put(scr, 8, 4, "=" * (width + 2), C(5))
            for (r, c), kind in stream.items():
                sx = c - int(offset)
                if 0 <= sx < width:
                    put(scr, 5 + r, 5 + (width - 1 - sx), kind, curses.A_BOLD | (C(2) if kind == "Z" else C(1)))
            scr.refresh()
            time.sleep(0.02)
            flush(scr)
        guess = _ask_number(scr, "How many infected (Z)?", 11)
        ok = abs(guess - nz) <= 2
        put(scr, 13, 4, f"There were {nz}. " + ("Close enough!" if ok else "Not close enough."),
            curses.A_BOLD | (C(1) if ok else C(2)))
        scr.refresh()
        time.sleep(1.3)
        if not ok:
            outro(scr, False)
            return False, {}
    outro(scr, True)
    return True, {}


# ======================================================================
# 7. CRACK THE SUPPLY LOCKER (live countdown, footsteps approach)
# ======================================================================
LOCKER = {"HARD": (4, 15), "NORMAL": (5, 25), "EASY": (6, 45)}   # guesses, seconds


def live_locker(scr, tier):
    _setup(scr)
    tries, limit = LOCKER[tier]
    code = random.randint(1, 20)
    intro(scr, "Crack the Supply Locker", tier, [
        "A locked supply cabinet. Footsteps are getting closer...",
        "The code is a number from 1 to 20.",
        "Type a guess and press ENTER. You'll hear HIGHER or LOWER.",
        f"{tries} guesses, {limit} seconds."])
    t0, buf, log, result = time.monotonic(), "", [], None
    while result is None:
        now = time.monotonic()
        buf, entered = read_key_into(scr, buf, "0123456789")
        if entered and buf.isdigit():
            g = int(buf)
            buf = ""
            if g == code:
                result = True
            else:
                log.append(f"{g:>2}  ->  {'HIGHER' if g < code else 'LOWER'}")
                if len(log) >= tries:
                    result = False
        if now - t0 > limit:
            result = False
        left = limit - (now - t0)
        scr.erase()
        put(scr, 1, 2, "CRACK THE SUPPLY LOCKER", curses.A_BOLD | C(4))
        timer_bar(scr, 2, 2, left, limit)
        steps = int((1 - left / limit) * 30)
        put(scr, 4, 4, "Footsteps: " + "." * (30 - steps) + "Z" * min(3, steps // 10 + 1), C(2))
        put(scr, 6, 4, "+-------+")
        put(scr, 7, 4, "| [ ? ] |   Guesses left: " + str(tries - len(log)))
        put(scr, 8, 4, "+-------+")
        for i, line in enumerate(log):
            put(scr, 10 + i, 6, line, C(3))
        put(scr, 11 + tries, 4, f"Your guess: {buf}_", curses.A_BOLD)
        scr.refresh()
        time.sleep(0.03)
    outro(scr, result, f"The code was {code}.")
    return result, {}


# ======================================================================
# 8. DECODE THE RADIO (live static + countdown)
# ======================================================================
RADIO = {"HARD": (8, 0.35), "NORMAL": (12, 0.2), "EASY": (20, 0.1)}   # seconds per word, static amount
RADIO_WORDS = ["SAFE ZONE", "BRIDGE", "CONVOY", "SHELTER", "BLIZZARD", "GATES", "MEDIC", "RESCUE", "WATER", "SUPPLY"]


def live_radio(scr, tier):
    _setup(scr)
    limit, static = RADIO[tier]
    intro(scr, "Decode the Radio", tier, [
        "A rescue broadcast is breaking up with static.",
        "Unscramble each word, type it and press ENTER.",
        "Static (#) flickers over the letters, so watch closely!",
        f"2 words, {limit} seconds each."])
    for n, word in enumerate(random.sample(RADIO_WORDS, 2), 1):
        letters = list(word.replace(" ", ""))
        while "".join(letters) == word.replace(" ", ""):
            random.shuffle(letters)
        t0, buf, result, shown, last_flicker = time.monotonic(), "", None, letters[:], 0
        while result is None:
            now = time.monotonic()
            buf, entered = read_key_into(scr, buf, "ABCDEFGHIJKLMNOPQRSTUVWXYZ ")
            if entered:
                result = buf.replace(" ", "") == word.replace(" ", "")
            elif now - t0 > limit:
                result = False
            if now - last_flicker > 0.4:
                last_flicker = now
                shown = [("#" if random.random() < static else ch) for ch in letters]
            scr.erase()
            put(scr, 1, 2, f"DECODE THE RADIO   Word {n}/2", curses.A_BOLD | C(4))
            timer_bar(scr, 2, 2, limit - (now - t0), limit)
            put(scr, 5, 4, "~~ kzzzt ~~ " + "  ".join(shown) + " ~~ kzzzt ~~", curses.A_BOLD | C(3))
            put(scr, 8, 4, f"Your answer: {buf}_", curses.A_BOLD)
            scr.refresh()
            time.sleep(0.03)
        scr.erase()
        put(scr, 8, 4, ("Got it! " if result else "Lost the signal! ") + f"The word was {word}.",
            curses.A_BOLD | (C(1) if result else C(2)))
        scr.refresh()
        time.sleep(1.1)
        flush(scr)
        if not result:
            outro(scr, False)
            return False, {}
    outro(scr, True)
    return True, {}


# ======================================================================
# TEXT VERSIONS (backup when curses can't run)
# ======================================================================
def _timed(prompt):
    t = time.monotonic()
    a = input(prompt)
    return a.strip().upper(), time.monotonic() - t


TEXT_TIME = {   # seconds for the text versions
    "HARD": {"react": 1.0, "show": 2.0, "word": 2.5, "item": 3.0, "radio": 8.0, "lane": 2.0},
    "NORMAL": {"react": 1.6, "show": 3.5, "word": 4.0, "item": 5.0, "radio": 12.0, "lane": 3.0},
    "EASY": {"react": 2.5, "show": 6.0, "word": 7.0, "item": 8.0, "radio": 20.0, "lane": 5.0},
}


def text_lock_door(tier):
    window, wins = TEXT_TIME[tier]["react"], 0
    print(f"Press ENTER the moment you see LOCK! 3 rounds, win 2. ({window}s to react)")
    for rnd in range(1, 4):
        input(f"Round {rnd}: press ENTER to get ready...")
        time.sleep(random.uniform(1.5, 4))
        print("   >>> LOCK! <<<")
        _, took = _timed("")
        ok = 0.08 < took <= window
        print(f"   {'Locked' if ok else 'Missed'} ({took:.2f}s)")
        wins += ok
    return wins >= 2, {}


def text_escape(tier):
    show = TEXT_TIME[tier]["show"]
    for length in (4, 5):
        route = [random.choice(["LEFT", "RIGHT", "UP", "DOWN"]) for _ in range(length)]
        print(f"Memorize the escape route ({show}s):  " + " > ".join(route))
        time.sleep(show)
        print("\n" * 40)
        ans, _ = _timed("Type it back (like L U U R): ")
        if [c for c in ans if c in "LRUD"] != [m[0] for m in route]:
            print("   Wrong turn!")
            return False, {}
    return True, {}


def text_dodge(tier):
    limit, lives, hits = TEXT_TIME[tier]["lane"], {"HARD": 1, "NORMAL": 2, "EASY": 3}[tier], 0
    print(f"Wrecks ahead! Type the SAFE lane (L, M or R) within {limit}s. 5 rounds.")
    for _ in range(5):
        safe = random.choice("LMR")
        lanes = "  ".join("..." if l == safe else "###" for l in "LMR")
        ans, took = _timed(f"   L    M    R\n   {lanes}\n   Lane: ")
        if ans != safe or took > limit:
            hits += 1
            print("   CRASH!")
            if hits >= lives:
                return False, {}
    return True, {}


def text_barricade(tier):
    limit = TEXT_TIME[tier]["word"]
    for w in random.sample(WORDS, 3):
        ans, took = _timed(f"Type {w} ({limit}s): ")
        if ans != w or took > limit:
            return False, {}
    return True, {}


def text_safe_unsafe(tier):
    limit, right = TEXT_TIME[tier]["item"], 0
    print(f"SAFE or UNSAFE? Type S or U ({limit}s each). Get 4 of 5.")
    for text, truth in random.sample(SAFE_UNSAFE, 5):
        ans, took = _timed(f"   {text}: ")
        right += ans == truth and took <= limit
    return right >= 4, {}


def text_count(tier):
    show = TEXT_TIME[tier]["show"]
    count = random.randint(6, 16)
    cells = ["Z"] * count + ["."] * (60 - count)
    random.shuffle(cells)
    print(f"Count the Z ({show}s):")
    for r in range(5):
        print("   " + " ".join(cells[r * 12:(r + 1) * 12]))
    time.sleep(show)
    print("\n" * 40)
    ans, _ = _timed("How many? ")
    return ans.isdigit() and abs(int(ans) - count) <= 2, {}


def text_locker(tier):
    tries, limit = LOCKER[tier]
    code, t0 = random.randint(1, 20), time.monotonic()
    print(f"Locker code 1-20. {tries} guesses, {limit}s.")
    for left in range(tries, 0, -1):
        ans, _ = _timed(f"   Guess ({left} left): ")
        if time.monotonic() - t0 > limit:
            return False, {}
        if ans.isdigit() and int(ans) == code:
            return True, {}
        print("   HIGHER" if ans.isdigit() and int(ans) < code else "   LOWER")
    return False, {}


def text_radio(tier):
    limit = TEXT_TIME[tier]["radio"]
    for w in random.sample(RADIO_WORDS, 2):
        letters = list(w.replace(" ", ""))
        random.shuffle(letters)
        ans, took = _timed(f"Unscramble {''.join(letters)} ({limit}s): ")
        if ans.replace(" ", "") != w.replace(" ", "") or took > limit:
            return False, {}
    return True, {}


# ======================================================================
# Registry and the one function the engine calls
# ======================================================================
GAMES = {
    # name: (live version, text version, reward type)
    "Lock the Door": (live_lock_door, text_lock_door, "health"),
    "Escape the Horde": (live_escape_horde, text_escape, "health"),
    "Dodge the Wrecks": (live_dodge, text_dodge, "water"),
    "Barricade the Door": (live_barricade, text_barricade, "health"),
    "Safe or Unsafe?": (live_safe_unsafe, text_safe_unsafe, "food and water"),
    "Count the Infected": (live_count, text_count, "food"),
    "Crack the Supply Locker": (live_locker, text_locker, "food"),
    "Decode the Radio": (live_radio, text_radio, "water"),
}


def play(name, tier):
    """Run one mini game. Tries the live version first, then the text version."""
    live, text, _ = GAMES[name]
    if curses is not None and sys.stdin.isatty() and sys.stdout.isatty():
        try:
            return curses.wrapper(live, tier)
        except TooSmall:
            print("(Make your terminal window bigger, at least 64 x 22, for the live version.)")
        except curses.error:
            pass
    print(f"\nMINI GAME ({tier}): {name}  [text version]")
    return text(tier)


if __name__ == "__main__":
    # Try any game directly:  python minigames.py "Dodge the Wrecks" HARD
    name = sys.argv[1] if len(sys.argv) > 1 else random.choice(list(GAMES))
    tier = sys.argv[2] if len(sys.argv) > 2 else "NORMAL"
    print(play(name, tier))
