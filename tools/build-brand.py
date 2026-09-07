"""Generate the site's icon set and social preview card.

The mark is a single 'A' drawn as a truss: it reads as a letter at 16px and as
a structural member at 512px, and it needs no font to render.
Palette is the site's own -- #080808 ground, #7ba8d8 accent, #f7f4ed ink.
"""
import os
from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)

BG = (8, 8, 8)
BLUE = (123, 168, 216)
INK = (247, 244, 237)
MUTED = (167, 164, 157)

FONTS = r"C:\Windows\Fonts"


def bahn(size, weight=700, width=87.5):
    f = ImageFont.truetype(os.path.join(FONTS, "bahnschrift.ttf"), size)
    try:
        f.set_variation_by_axes([weight, width])
    except Exception:
        pass
    return f


def segoe(size, bold=False):
    return ImageFont.truetype(
        os.path.join(FONTS, "segoeuib.ttf" if bold else "segoeui.ttf"), size)


# ---------------------------------------------------------------- icon mark
def draw_mark(px, bleed=True):
    """The 'A' truss, drawn at 4x then downsampled for clean edges."""
    S = px * 4
    im = Image.new("RGBA", (S, S), BG + (255,) if bleed else (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    u = S / 64.0            # design units -> pixels
    w = int(round(6.5 * u))  # stroke weight

    apex = (32 * u, 12 * u)
    left = (12.5 * u, 52 * u)
    right = (51.5 * u, 52 * u)

    for a, b in ((left, apex), (apex, right)):
        d.line([a, b], fill=BLUE, width=w, joint="curve")
    # crossbar sits low, like a tie beam
    d.line([(21.5 * u, 38.5 * u), (42.5 * u, 38.5 * u)], fill=BLUE, width=w)
    # round off the three ends so the strokes don't look chopped
    for cx, cy in (apex, left, right):
        d.ellipse([cx - w / 2, cy - w / 2, cx + w / 2, cy + w / 2], fill=BLUE)

    return im.resize((px, px), Image.LANCZOS)


for size in (180, 192, 512):
    name = "apple-touch-icon.png" if size == 180 else "icon-%d.png" % size
    draw_mark(size).convert("RGB").save(name, optimize=True)
    print("wrote", name)

ico = draw_mark(64)
ico.save("favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
print("wrote favicon.ico")

# Hand-written SVG twin of the same mark, for browsers that prefer it.
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Angelo Demetroulakos">
  <rect width="64" height="64" fill="#080808"/>
  <g fill="none" stroke="#7ba8d8" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12.5 52 L32 12 L51.5 52"/>
    <path d="M21.5 38.5 H42.5"/>
  </g>
</svg>
"""
open("favicon.svg", "w", encoding="utf-8", newline="\n").write(svg)
print("wrote favicon.svg")


# ------------------------------------------------------------ social card
W, H = 1200, 630
card = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(card)

# the site's 48px lattice, lifted just enough to survive preview downscaling
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gd = ImageDraw.Draw(grid)
for x in range(0, W, 48):
    gd.line([(x, 0), (x, H)], fill=(255, 255, 255, 14))
for y in range(0, H, 48):
    gd.line([(0, y), (W, y)], fill=(255, 255, 255, 14))
card = Image.alpha_composite(card.convert("RGBA"), grid).convert("RGB")
d = ImageDraw.Draw(card)

PAD = 84
y = 150

# eyebrow
d.rectangle([PAD, y + 7, PAD + 34, y + 10], fill=BLUE)
f_eyebrow = segoe(21, bold=True)
d.text((PAD + 50, y), "MECHANICAL ENGINEERING & ROBOTICS",
       font=f_eyebrow, fill=BLUE)

# name -- shrink to fit rather than overflow
y += 62
f_name = bahn(112)
while d.textlength("ANGELO DEMETROULAKOS", font=f_name) > W - PAD * 2:
    f_name = bahn(f_name.size - 2)
d.text((PAD, y), "ANGELO DEMETROULAKOS", font=f_name, fill=INK)

# tagline
y += int(f_name.size * 1.24)
f_tag = segoe(31)
d.text((PAD, y), "Robotics  ·  CAD Design  ·  Prototyping  ·  Autonomous Systems",
       font=f_tag, fill=MUTED)

# footer rule + url + mark
d.line([(PAD, H - 108), (W - PAD, H - 108)], fill=(247, 244, 237, 40), width=1)
f_url = segoe(25, bold=True)
d.text((PAD, H - 78), "aloeveraz.github.io", font=f_url, fill=INK)

mark = draw_mark(64)
card.paste(mark, (W - PAD - 64, H - 86), mark)

card.save("og-image.png", optimize=True)
print("wrote og-image.png  %.1f KB" % (os.path.getsize("og-image.png") / 1024))
