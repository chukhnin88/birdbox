import math
import numpy as np

PRESSURE_FULL_SCALE_PA = 10.0
BASE_GAP_M = 5e-6
STIFFNESS = 2e6
D0 = 2e-6
T0 = 0.9


def optical_depth(data):
    pressure = data * PRESSURE_FULL_SCALE_PA
    gap = np.maximum(1e-9, BASE_GAP_M + pressure / STIFFNESS)
    out = T0 * np.exp(-gap / D0)
    hi = float(out.max())
    lo = float(out.min())
    return (hi - lo) / (hi + lo) if hi + lo > 0 else 0.0


def analyze(data):
    rms = float(np.sqrt(np.mean(data ** 2)))
    peak = float(np.max(np.abs(data)))
    crest = min(8.0, peak / rms) if rms > 0.0001 else 0.0
    level = min(100, round(rms * 240))
    x1 = min(1.0, rms * 8)
    x2 = min(1.0, crest / 8)

    def sigmoid(x):
        return 1 / (1 + math.exp(-x))

    h1 = sigmoid(2.4 * x1 - 0.8 * x2 - 0.7)
    h2 = sigmoid(1.8 * x2 + 0.8 * x1 - 1.0)
    h3 = sigmoid(-2.0 * x1 + 0.2)
    scores = [("тихий фон", 2.5 * h3 - h1 - h2),
              ("обычный звук", 1.6 * h1 - 0.2 * h2 - 0.2 * h3),
              ("возможный резкий звук", 1.8 * h2 + 0.6 * h1 - 0.7 * h3)]
    top = max(s for _, s in scores)
    exps = [math.exp(s - top) for _, s in scores]
    best = exps.index(max(exps))
    return dict(level=level, crest=crest, mini_class=scores[best][0],
                mini_conf=exps[best] / sum(exps), optical_depth=optical_depth(data))
