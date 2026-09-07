"""Re-encode the portfolio's raster assets to WebP.

Stills are capped at 1600px on the long edge (the project modal is 820 CSS px,
so 1600 still covers a 2x display). Animated GIFs are capped at 1280 and become
animated WebP, which every browser the site targets has supported for years.
"""
import os, sys, glob
from PIL import Image, ImageSequence

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)

STILL_MAX = 1600
ANIM_MAX = 1280
DRY = "--dry" in sys.argv


def fit(size, cap):
    w, h = size
    if max(w, h) <= cap:
        return None
    scale = cap / float(max(w, h))
    return (max(1, int(round(w * scale))), max(1, int(round(h * scale))))


def convert_still(path, out):
    im = Image.open(path)
    new = fit(im.size, STILL_MAX)
    if new:
        im = im.resize(new, Image.LANCZOS)
    if im.mode in ("P", "LA"):
        im = im.convert("RGBA")
    if im.mode == "RGBA":
        # keep alpha only when it is actually doing something
        alpha = im.getchannel("A")
        if alpha.getextrema()[0] == 255:
            im = im.convert("RGB")
    elif im.mode != "RGB":
        im = im.convert("RGB")
    if not DRY:
        im.save(out, "WEBP", quality=82, method=6)
    return im.size


def convert_anim(path, out):
    im = Image.open(path)
    new = fit(im.size, ANIM_MAX)
    frames, durations = [], []
    for frame in ImageSequence.Iterator(im):
        f = frame.convert("RGBA")
        if new:
            f = f.resize(new, Image.LANCZOS)
        frames.append(f)
        durations.append(frame.info.get("duration", 60) or 60)
    if not DRY:
        frames[0].save(
            out, "WEBP", save_all=True, append_images=frames[1:],
            duration=durations, loop=0, quality=68, method=4,
            minimize_size=True,
        )
    return (new or im.size), len(frames)


total_before = total_after = 0
report = []
for path in sorted(glob.glob("assets/*")):
    ext = os.path.splitext(path)[1].lower()
    if ext == ".svg":
        continue
    before = os.path.getsize(path)
    out = os.path.splitext(path)[0] + ".webp"
    try:
        n_frames = getattr(Image.open(path), "n_frames", 1)
        if n_frames > 1:
            dim, nf = convert_anim(path, out)
            note = "anim %s %df" % ("x".join(map(str, dim)), nf)
        else:
            dim = convert_still(path, out)
            note = "x".join(map(str, dim))
    except Exception as e:
        print("FAIL %s: %s" % (path, e))
        continue
    after = os.path.getsize(out) if os.path.exists(out) else 0
    total_before += before
    total_after += after
    report.append((before, after, os.path.basename(path), note))

report.sort(key=lambda r: -r[0])
print("%-46s %10s %10s %8s  %s" % ("file", "before", "after", "saved", "out"))
for before, after, name, note in report:
    pct = (1 - after / before) * 100 if before and after else 0
    print("%-46s %9.1fK %9.1fK %7.1f%%  %s" % (name, before / 1024, after / 1024, pct, note))
print("\nTOTAL %.2f MB -> %.2f MB  (%.1f%% smaller)" % (
    total_before / 1048576, total_after / 1048576,
    (1 - total_after / total_before) * 100 if total_before else 0))
