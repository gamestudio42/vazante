"""EffectCraft recipes for Vazante's combat flipbooks. Colours come from packages/view3d/src/palette.ts.

python3 recipes.py [OUT_DIR]   writes OUT_DIR/<asset>/build.json (default: next to this file); then
effectcraft-cli run --commands OUT_DIR/<asset>/build.json builds and saves <asset>.ecproj.
"""
import json, os, sys

ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.dirname(os.path.abspath(__file__))
MUZZLE, SPARK, FIRE, DUST, BILE, BLOOD, SCREAM = "#fff2b0", "#ffe08a", "#ff7a2a", "#9b958a", "#a9b84a", "#9a1a14", "#ff5a3c"

def key(layer, path, t, v):
    return {"command": "prop.addKey", "params": {"layer": layer, "path": path, "time": t, "value": v}}

def scale(layer, *pts):
    return [key(layer, "transform/scale", t, [s, s, 100]) for t, s in pts]

def opacity(layer, *pts):
    return [key(layer, "transform/opacity", t, o) for t, o in pts]

def shape(name, kind, size, fill=None, stroke=None, width=0, pos=None):
    p = {"kind": kind, "name": name, "size": size, "fill": fill}
    if stroke: p.update(stroke=stroke, strokeWidth=width)
    if pos: p["position"] = pos
    return {"command": "layer.newShape", "params": p}

def glow(*layers):
    return {"command": "effect.apply", "params": {"effect": "Glow", "layers": list(layers)}}

def turb(layer, amount, size):
    # Breaks the flat vector edge into a ragged, boiling one; evolution turns with time.
    return [{"command": "effect.apply", "params": {"effect": "Turbulent Displace", "layers": [layer]}},
            {"command": "prop.set", "params": {"layer": layer, "path": "effects/#1/amount", "value": amount}},
            {"command": "prop.set", "params": {"layer": layer, "path": "effects/#1/size", "value": size}},
            {"command": "prop.setExpression", "params": {"layer": layer, "path": "effects/#1/evolution", "expression": "time * 540"}}]

def setp(layer, path, value):
    return {"command": "prop.set", "params": {"layer": layer, "path": path, "value": value}}

def comp(name, px, fps, frames):
    return {"command": "comp.new", "params": {"name": name, "width": px, "height": px, "frameRate": fps, "duration": frames / fps}}

def muzzle():
    # 64 px, 4 frames at 30 fps: a hot star that pops and is gone.
    s = [comp("vz_muzzle", 64, 30, 4),
         shape("star", "star", [52, 52], fill=MUZZLE),
         shape("core", "ellipse", [18, 18], fill="#ffffff"),
         setp("star", "contents/group/contents/star/points", 7),
         setp("star", "contents/group/contents/star/innerRadius", 5),
         setp("star", "contents/group/contents/star/outerRadius", 27),
         glow("star", "core")]
    s += scale("star", (0, 60), (0.033, 100), (0.1, 70)) + opacity("star", (0, 100), (0.066, 80), (0.1, 0))
    s += scale("core", (0, 100), (0.066, 70)) + opacity("core", (0, 100), (0.066, 40), (0.1, 0))
    s += [key("star", "transform/rotation", 0, 0), key("star", "transform/rotation", 0.1, 25)]
    return s

def explosion():
    # 128 px, 16 frames at 24 fps: white flash, orange fireball, a grey smoke ring that thins out.
    end = 16 / 24
    s = [comp("vz_explosion", 128, 24, 16),
         shape("smoke", "ellipse", [84, 84], fill="#6e6a63"),
         shape("fire", "ellipse", [76, 76], fill=FIRE),
         shape("flash", "ellipse", [50, 50], fill=MUZZLE)]
    s += turb("smoke", 22, 26) + turb("fire", 16, 20) + [glow("fire", "flash")]
    s += scale("flash", (0, 30), (0.08, 110), (0.25, 60)) + opacity("flash", (0, 100), (0.12, 100), (0.25, 0))
    s += scale("fire", (0, 20), (0.17, 100), (0.45, 108)) + opacity("fire", (0, 100), (0.25, 90), (0.5, 0))
    s += scale("smoke", (0, 30), (0.3, 100), (end, 112)) + opacity("smoke", (0, 0), (0.15, 90), (0.42, 60), (end - 1 / 24, 0))
    return s

def bile():
    # 96 px, 12 frames at 24 fps: the Inchado bursts, a bile ring and droplets thrown out.
    end = 12 / 24
    s = [comp("vz_bile_burst", 96, 24, 12),
         shape("ring", "ellipse", [70, 70], fill=None, stroke=BILE, width=8),
         shape("core", "ellipse", [44, 44], fill=BILE)]
    drops = [(-26, -18), (24, -22), (30, 14), (-20, 26), (2, -32), (-32, 4)]
    for i, (dx, dy) in enumerate(drops):
        s.append(shape(f"d{i}", "ellipse", [8, 8], fill=BLOOD if i % 3 == 2 else BILE, pos=[48, 48]))
    s += turb("core", 10, 14) + turb("ring", 6, 12)
    s += scale("core", (0, 40), (0.08, 110), (0.3, 70)) + opacity("core", (0, 100), (0.12, 95), (0.3, 0))
    s += scale("ring", (0, 25), (0.33, 104)) + opacity("ring", (0, 90), (0.2, 70), (end - 1 / 24, 0))
    for i, (dx, dy) in enumerate(drops):
        n = f"d{i}"
        s += [key(n, "transform/position", 0, [48, 48]), key(n, "transform/position", end - 1 / 24, [48 + dx, 48 + dy + 6])]
        s += opacity(n, (0, 100), (0.25, 100), (end - 1 / 24, 0))
    return s

def scream():
    # 128 px, 22 frames at 24 fps, drawn flat on the ground: three wobbling rings leave the
    # Gritador one after another and fade before they reach the edge.
    end = 21 / 24
    s = [comp("vz_scream", 128, 24, 22)]
    for i, t0 in enumerate((0.0, 0.15, 0.3)):
        n = f"r{i}"
        s.append(shape(n, "ellipse", [110, 110], fill=None, stroke=SCREAM, width=7 - 2 * i))
        s += turb(n, 4, 18)
        span = end - t0
        peak = 95 - 20 * i
        if t0 == 0:
            s += scale(n, (0, 12), (0.35 * span, 70), (end, 100))
            s += opacity(n, (0, peak), (0.55 * span, 55), (end, 0))
        else:
            s += scale(n, (0, 4), (t0, 4), (t0 + 0.35 * span, 70), (end, 100))
            s += opacity(n, (0, 0), (t0, 0), (t0 + 0.04, peak), (t0 + 0.55 * span, 55 - 10 * i), (end, 0))
    return s

def rect(name, size, fill, pos):
    return {"command": "layer.newShape", "params": {"kind": "rect", "name": name, "size": size, "fill": fill, "position": pos}}

def dust():
    # 128 px, 24 frames at 20 fps: a wall gives way. Five boiling puffs roll out and up from the base,
    # concrete and sandbag chunks are thrown out and fall, and the cloud thins away.
    end = 23 / 20
    c = [64, 80]
    s = [comp("vz_dust", 128, 20, 24)]
    puffs = [((-26, -10), 46, "#8a857b"), ((24, -8), 44, "#9b958a"), ((-8, -26), 50, "#a7a196"), ((12, -30), 40, "#b8b2a6"), ((0, -4), 52, "#7d786e")]
    for i, ((dx, dy), size, col) in enumerate(puffs):
        n = f"p{i}"
        s.append(shape(n, "ellipse", [size, size], fill=col, pos=c))
        s += turb(n, 9, 16)
        t0 = 0.03 * i
        s += [key(n, "transform/position", 0, c), key(n, "transform/position", 0.35, [c[0] + dx * 0.8, c[1] + dy * 0.7]), key(n, "transform/position", end, [c[0] + dx, c[1] + dy - 6])]
        s += scale(n, (0, 10), (t0 + 0.25, 80), (end, 100))
        s += opacity(n, (0, 90), (0.45, 80), (end, 0))
    chunks = [(-40, "#9a9890"), (36, "#b59a6a"), (-18, "#9a9890"), (44, "#9a9890"), (8, "#b59a6a")]
    for i, (dx, col) in enumerate(chunks):
        n = f"c{i}"
        s.append(rect(n, [6, 5], col, c))
        top = 30 + 8 * (i % 3)
        s += [key(n, "transform/position", 0, c), key(n, "transform/position", 0.3, [c[0] + dx * 0.6, c[1] - top]), key(n, "transform/position", 0.7, [c[0] + dx, c[1] - 4])]
        s += [key(n, "transform/rotation", 0, 0), key(n, "transform/rotation", 0.7, 300 * (1 if i % 2 else -1))]
        s += opacity(n, (0, 100), (0.55, 100), (0.75, 0))
    return s

def sparks():
    # 64 px, 8 frames at 30 fps: metal struck. A hot pin of light and seven thin sparks that shoot out,
    # drop a little and burn out.
    import math
    end = 7 / 30
    c = [32, 32]
    s = [comp("vz_sparks", 64, 30, 8), shape("core", "ellipse", [14, 14], fill="#ffffff", pos=c), glow("core")]
    s += scale("core", (0, 100), (0.1, 40)) + opacity("core", (0, 100), (0.1, 30), (0.14, 0))
    for i, deg in enumerate((-160, -120, -95, -60, -25, 15, 40)):
        n = f"s{i}"
        a = math.radians(deg)
        reach = 18 + 6 * (i % 3)
        s.append(rect(n, [2, 9 - (i % 2) * 2], SPARK if i % 3 else MUZZLE, c))
        s.append(key(n, "transform/rotation", 0, deg + 90))
        s += [key(n, "transform/position", 0, c),
              key(n, "transform/position", 0.12, [c[0] + math.cos(a) * reach * 0.75, c[1] + math.sin(a) * reach * 0.75]),
              key(n, "transform/position", end, [c[0] + math.cos(a) * reach, c[1] + math.sin(a) * reach + 6])]
        s += opacity(n, (0, 100), (0.1, 100), (end, 0))
    return s

def blood():
    # 64 px, 8 frames at 24 fps: a round strikes flesh. A ragged spray opens and fades while six drops
    # fly out and fall.
    end = 7 / 24
    c = [32, 30]
    s = [comp("vz_blood", 64, 24, 8), shape("spray", "ellipse", [26, 22], fill=BLOOD, pos=c)]
    s += turb("spray", 6, 8)
    s += scale("spray", (0, 30), (0.08, 100), (end, 120)) + opacity("spray", (0, 100), (0.12, 85), (end, 0))
    for i, (dx, dy) in enumerate(((-22, -8), (20, -12), (-12, -20), (14, -4), (4, -22), (-24, 6))):
        n = f"d{i}"
        s.append(shape(n, "ellipse", [5 - i % 2, 5 - i % 2], fill=BLOOD if i % 2 else "#4a1010", pos=c))
        s += [key(n, "transform/position", 0, c), key(n, "transform/position", 0.12, [c[0] + dx * 0.7, c[1] + dy * 0.7]),
              key(n, "transform/position", end, [c[0] + dx, c[1] + dy + 14])]
        s += opacity(n, (0, 100), (0.15, 100), (end, 0))
    return s

def settle():
    # 128 px, 16 frames at 20 fps: work is done. A low, wide puff of sand and dust rolls out along the
    # ground and settles; lighter and flatter than vz_dust, with nothing thrown.
    end = 15 / 20
    c = [64, 88]
    s = [comp("vz_settle", 128, 20, 16)]
    puffs = [(-34, -6, 30, "#c9bda4"), (34, -6, 30, "#b8ac92"), (-18, -12, 36, "#b8ac92"), (18, -12, 36, "#c9bda4"), (0, -16, 40, "#a9a08c"), (0, -4, 34, "#9b958a")]
    for i, (dx, dy, size, col) in enumerate(puffs):
        n = f"p{i}"
        s.append(shape(n, "ellipse", [size, size * 0.8], fill=col, pos=c))
        s += turb(n, 6, 14)
        s += [key(n, "transform/position", 0, c), key(n, "transform/position", 0.3, [c[0] + dx * 0.8, c[1] + dy * 0.6]), key(n, "transform/position", end, [c[0] + dx, c[1] + dy])]
        s += scale(n, (0, 15), (0.3, 85), (end, 100))
        s += opacity(n, (0, 80), (0.3, 70), (end, 0))
    return s

def heal():
    # 96 px, 18 frames at 20 fps: a bitten soldier is cured. A soft green glow and ring open around
    # them and four small crosses float up and fade.
    end = 17 / 20
    c = [48, 60]
    green, mint = "#8fe08a", "#d8f5d4"
    s = [comp("vz_heal", 96, 20, 18),
         shape("ring", "ellipse", [64, 26], fill=None, stroke=green, width=3, pos=[48, 74]),
         shape("glow", "ellipse", [34, 46], fill=green, pos=c), glow("glow")]
    s += scale("ring", (0, 30), (0.5, 100), (end, 110)) + opacity("ring", (0, 90), (0.4, 70), (end, 0))
    s += scale("glow", (0, 40), (0.25, 100), (end, 90)) + opacity("glow", (0, 0), (0.15, 45), (0.5, 30), (end, 0))
    for i, (dx, t0) in enumerate(((-16, 0.0), (14, 0.12), (-4, 0.24), (20, 0.36))):
        for part, size in (("v", [3, 9]), ("h", [9, 3])):
            n = f"x{i}{part}"
            s.append(rect(n, size, mint if i % 2 else green, [48 + dx, 70]))
            s += [key(n, "transform/position", 0, [48 + dx, 70]), key(n, "transform/position", t0, [48 + dx, 70]),
                  key(n, "transform/position", end, [48 + dx, 22])]
            s += opacity(n, (0, 0), (t0, 0), (t0 + 0.05, 100), (t0 + 0.3, 90), (end, 0)) if t0 else opacity(n, (0, 100), (0.3, 90), (end, 0))
    return s

def wave_pulse():
    # 96 px, 16 frames at 20 fps, white: a HUD emblem used as a CSS mask and tinted by the alert's
    # tone, played three times. A core blinks while two rings leave it and fade.
    end = 15 / 20
    c = [48, 48]
    s = [comp("vz_wave_pulse", 96, 20, 16), shape("core", "ellipse", [26, 26], fill="#ffffff", pos=c)]
    s += scale("core", (0, 70), (0.12, 100), (0.45, 85), (end, 70)) + opacity("core", (0, 100), (0.5, 90), (end, 0))
    for i, t0 in enumerate((0.0, 0.2)):
        n = f"r{i}"
        s.append(shape(n, "ellipse", [84, 84], fill=None, stroke="#ffffff", width=5 - i, pos=c))
        span = end - t0
        if t0 == 0:
            s += scale(n, (0, 30), (end, 100)) + opacity(n, (0, 100), (0.5 * span, 60), (end, 0))
        else:
            s += scale(n, (0, 30), (t0, 30), (end, 100)) + opacity(n, (0, 0), (t0, 0), (t0 + 0.05, 90), (t0 + 0.5 * span, 50), (end, 0))
    return s

for name, build in [("vz_muzzle", muzzle), ("vz_explosion", explosion), ("vz_bile_burst", bile), ("vz_scream", scream), ("vz_dust", dust), ("vz_sparks", sparks), ("vz_blood", blood), ("vz_settle", settle), ("vz_heal", heal), ("vz_wave_pulse", wave_pulse)]:
    d = os.path.join(ROOT, name)
    os.makedirs(d, exist_ok=True)
    steps = build() + [{"command": "file.save", "params": {"path": os.path.join(d, name + ".ecproj")}}]
    with open(os.path.join(d, "build.json"), "w") as f:
        json.dump(steps, f, indent=1)
    print(name, len(steps), "steps")
