"""Edge check, horizontal flipbook atlas (RGBA, ffmpeg tile) and manifest for each flipbook."""
import hashlib, json, os, subprocess, sys

FPS = {"vz_muzzle": 30, "vz_explosion": 24, "vz_bile_burst": 24, "vz_scream": 24, "vz_dust": 20, "vz_sparks": 30, "vz_blood": 24, "vz_settle": 20, "vz_heal": 20, "vz_wave_pulse": 20}
VER = subprocess.run(["effectcraft-cli", "--version"], capture_output=True, text=True).stdout.strip()

def alpha(path):
    return subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout

def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()

ok = True
for n, fps in FPS.items():
    frames = sorted(f for f in os.listdir(f"{n}/frames") if f.endswith(".png"))
    w = int(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=width", "-of", "csv=p=0", f"{n}/frames/{frames[0]}"], capture_output=True, text=True).stdout)
    edge = 0
    for f in frames:
        b = alpha(f"{n}/frames/{f}")
        h = len(b) // w
        edge = max(edge, max(list(b[:w]) + list(b[-w:]) + [b[r * w] for r in range(h)] + [b[r * w + w - 1] for r in range(h)]))
    atlas = f"{n}/{n}_atlas.png"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", str(fps), "-i", f"{n}/frames/{n}_%05d.png", "-vf", f"tile={len(frames)}x1", "-frames:v", "1", "-pix_fmt", "rgba", atlas], check=True)
    a = alpha(atlas)
    prof = json.load(open(f"{n}/alpha_profile.json"))
    peak = max(prof, key=lambda r: r["coverage_pct"])
    checks = {
        "first_frame_visible": prof[0]["coverage_pct"] > 0,
        "last_frame_empty": prof[-1]["alpha_max"] == 0,
        "no_edge_clipping": edge < 8,
        # Same peak as the frames (not 255: a ring drawn at 95% opacity peaks lower) and transparent gaps.
        "atlas_keeps_alpha": max(a) == max(r["alpha_max"] for r in prof) and min(a) == 0,
    }
    ok &= all(checks.values())
    manifest = {
        "asset": n, "kind": "vfx_flipbook", "engine_target": "vazante view3d (three.js sprite, UV offset per frame)",
        "source": f"{n}.ecproj", "recipe": "../recipes.py",
        "frame": {"width": w, "height": w, "count": len(frames), "fps": fps, "duration_s": round(len(frames) / fps, 4)},
        "atlas": {"file": os.path.basename(atlas), "layout": f"{len(frames)}x1", "width": w * len(frames), "height": w, "pix_fmt": "rgba", "bytes": os.path.getsize(atlas), "sha256": sha(atlas)},
        "verified": {"method": "ffmpeg alphaextract, visible = alpha >= 8", "edge_alpha_max": edge, "peak": {"frame": peak["frame"], "coverage_pct": peak["coverage_pct"]},
                     "coverage_pct_by_frame": [r["coverage_pct"] for r in prof], "alpha_max_by_frame": [r["alpha_max"] for r in prof], "checks": checks},
        "built_with": {"app": "effectcraft", "version": VER, "headless": True}, "license": "original work for Vazante (GameStudio42)",
    }
    json.dump(manifest, open(f"{n}/manifest.json", "w"), indent=1)
    print(f"{n:14} {w}px x{len(frames)} @{fps}fps  atlas {os.path.getsize(atlas)/1024:.1f} KiB  edge {edge}  " + " ".join(f"{k}={'ok' if v else 'FAIL'}" for k, v in checks.items()))
sys.exit(0 if ok else 1)
