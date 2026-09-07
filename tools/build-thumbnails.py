"""Generate 900px-wide card variants alongside the full-size project images.

The project cards draw into a box about 440 CSS px wide, so on an ordinary 2x
laptop they need roughly 880 device pixels -- not the 1600 the modal wants. This
writes a `<name>-900.webp` next to each `<name>.webp`, and the card markup
offers both through srcset so the browser picks whichever fits the screen it is
actually on. The modal keeps using the full-size file.

Animated images are skipped: re-encoding every frame at a second size costs more
bytes on disk than it saves on the wire for the handful of cards that use one.
"""
import os, glob
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)

CARD_WIDTH = 900
saved_before = saved_after = 0
made = skipped = 0

for path in sorted(glob.glob("assets/*.webp")):
    if path.endswith("-900.webp"):
        continue
    im = Image.open(path)
    if getattr(im, "n_frames", 1) > 1:
        skipped += 1
        continue
    if im.width <= CARD_WIDTH * 1.15:
        # already small enough that a second file would not earn its place
        skipped += 1
        continue

    out = path.replace(".webp", "-900.webp")
    scale = CARD_WIDTH / float(im.width)
    small = im.convert("RGB" if im.mode not in ("RGBA",) else "RGBA")
    small = small.resize((CARD_WIDTH, max(1, int(round(im.height * scale)))), Image.LANCZOS)
    small.save(out, "WEBP", quality=80, method=6)

    saved_before += os.path.getsize(path)
    saved_after += os.path.getsize(out)
    made += 1
    print("  %-46s %7.1fK -> %6.1fK" % (os.path.basename(out),
                                        os.path.getsize(path) / 1024,
                                        os.path.getsize(out) / 1024))

print("\n%d variants written, %d skipped (animated or already small)" % (made, skipped))
if made:
    print("card payload for those images: %.1f KB -> %.1f KB (%.0f%% smaller)"
          % (saved_before / 1024, saved_after / 1024,
             (1 - saved_after / saved_before) * 100))
