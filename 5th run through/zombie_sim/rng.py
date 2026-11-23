"""
Seeded random numbers that give IDENTICAL results in Python and JavaScript.

Mulberry32 generator + FNV-1a hashing for named streams. Each kind of random event
(injury, infection, timer, rolls, minigames, policy choices...) has its own stream, so
two strategies run with the same seed share the same random numbers for the same kind
of event ("matched random-number streams").
"""
MASK = 0xFFFFFFFF


def _imul(a, b):
    return (a * b) & MASK


def fnv1a(text):
    h = 0x811C9DC5
    for ch in text.encode("utf-8"):
        h ^= ch
        h = _imul(h, 0x01000193)
    return h


class Mulberry32:
    def __init__(self, seed):
        self.state = seed & MASK

    def random(self):
        self.state = (self.state + 0x6D2B79F5) & MASK
        t = self.state
        t = _imul(t ^ (t >> 15), t | 1)
        t ^= (t + _imul(t ^ (t >> 7), t | 61)) & MASK
        t &= MASK
        return ((t ^ (t >> 14)) & MASK) / 4294967296.0

    def randint(self, a, b):
        return a + int(self.random() * (b - a + 1))

    def uniform(self, a, b):
        return a + (b - a) * self.random()

    def choice(self, seq):
        return seq[int(self.random() * len(seq))]


class Streams:
    """Named, independent random streams derived from one seed."""

    def __init__(self, seed):
        self.seed = int(seed)
        self._streams = {}

    def get(self, name):
        if name not in self._streams:
            self._streams[name] = Mulberry32(fnv1a(f"{self.seed}:{name}"))
        return self._streams[name]
