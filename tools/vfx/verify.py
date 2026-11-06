"""Alpha profile per frame of each flipbook: coverage (alpha >= 8) and peak alpha, decoded by ffmpeg."""
import json, os, subprocess, sys
for name in sys.argv[1:]:
    d = os.path.join(name, "frames")
    files = sorted(f for f in os.listdir(d) if f.endswith(".png"))
    prof = []
    for f in files:
        p = os.path.join(d, f)
        info = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,pix_fmt", "-of", "json", p], capture_output=True, text=True)
        s = json.loads(info.stdout)["streams"][0]
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", p, "-vf", "alphaextract", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
        vis = sum(1 for b in raw if b >= 8)
        prof.append({"frame": f, "size": f"{s['width']}x{s['height']}", "pix_fmt": s["pix_fmt"], "coverage_pct": round(100 * vis / len(raw), 2), "alpha_max": max(raw)})
    print(name)
    for r in prof:
        print(f"  {r['frame']}  {r['size']} {r['pix_fmt']}  coverage {r['coverage_pct']:6.2f}%  max {r['alpha_max']}")
    with open(os.path.join(name, "alpha_profile.json"), "w") as f:
        json.dump(prof, f, indent=1)
