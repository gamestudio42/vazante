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

for name, build in [("vz_muzzle", muzzle), ("vz_explosion", explosion), ("vz_bile_burst", bile), ("vz_scream", scream)]:
    d = os.path.join(ROOT, name)
    os.makedirs(d, exist_ok=True)
    steps = build() + [{"command": "file.save", "params": {"path": os.path.join(d, name + ".ecproj")}}]
    with open(os.path.join(d, "build.json"), "w") as f:
        json.dump(steps, f, indent=1)
    print(name, len(steps), "steps")
