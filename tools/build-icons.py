"""Self-host a subset of Font Awesome 6 Free covering only the icons this site uses.

The CDN build ships ~112 KB of CSS plus three full webfonts (~450 KB) to draw
roughly a dozen glyphs, from a third-party origin that sees every visitor's IP.
This pulls the upstream files once, keeps the glyphs actually referenced in the
markup, and writes a local stylesheet using the same class names -- so no HTML
or JS has to change.
"""
import io, os, re, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
SP = os.path.join(REPO, "tools", ".cache")
os.makedirs(SP, exist_ok=True)
CDN = "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0"
HDRS = {"User-Agent": "Mozilla/5.0"}


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest):
        return dest
    req = urllib.request.Request(url, headers=HDRS)
    with urllib.request.urlopen(req, timeout=60) as r:
        open(dest, "wb").write(r.read())
    print("  fetched %-28s %7.1f KB" % (os.path.basename(dest), os.path.getsize(dest) / 1024))
    return dest


# ---- 1. what icons does the site actually reference? ----------------------
blob = ""
for f in ("index.html", "portfolio.js", "portfolio.css", "portfolio-data.json"):
    blob += io.open(f, encoding="utf-8").read()

STYLE_TOKENS = {"fa-solid", "fa-regular", "fa-brands", "fa-light", "fa-thin", "fa-duotone"}
used = sorted({t for t in re.findall(r"\bfa-[a-z0-9-]+\b", blob)} - STYLE_TOKENS)
print("icons referenced (%d): %s\n" % (len(used), ", ".join(used)))

# ---- 2. pull upstream css + fonts ----------------------------------------
print("downloading upstream Font Awesome 6.4.0 ...")
css_path = fetch(CDN + "/css/all.min.css", os.path.join(SP, "fa-all.min.css"))
css = io.open(css_path, encoding="utf-8").read()

FACES = {
    "solid":   ("fa-solid-900.woff2",   "Font Awesome 6 Free",   900),
    "regular": ("fa-regular-400.woff2", "Font Awesome 6 Free",   400),
    "brands":  ("fa-brands-400.woff2",  "Font Awesome 6 Brands", 400),
}
for _, (fn, _, _) in FACES.items():
    fetch(CDN + "/webfonts/" + fn.replace(".woff2", ".ttf"), os.path.join(SP, fn.replace(".woff2", ".ttf")))

# ---- 3. map icon name -> codepoint, straight from upstream css ------------
codepoints = {}
# Rules look like `.fa-a:before,.fa-b:before{content:"\f08e"}` -- every selector
# in the group carries its own ::before, so collect them all.
for sel_group, cp in re.findall(
        r"((?:\.fa-[a-z0-9-]+:{1,2}before\s*,?\s*)+)\{content:\s*\"\\([0-9a-f]{4,5})\"",
        css):
    for sel in re.findall(r"\.(fa-[a-z0-9-]+):{1,2}before", sel_group):
        codepoints.setdefault(sel, cp)

missing = [u for u in used if u not in codepoints]
if missing:
    raise SystemExit("no codepoint found for: %s" % missing)

# ---- 4. which style does each icon live in? ------------------------------
assign = {}
for style, (fn, _, _) in FACES.items():
    font = TTFont(os.path.join(SP, fn.replace(".woff2", ".ttf")))
    cmap = set(font.getBestCmap().keys())
    for name in used:
        cp = int(codepoints[name], 16)
        if cp in cmap:
            assign.setdefault(name, []).append(style)
    font.close()

# 'fa-brands' markup wins for brand glyphs; otherwise prefer solid, then regular
wanted = {"solid": set(), "regular": set(), "brands": set()}
for name in used:
    styles = assign.get(name, [])
    if not styles:
        raise SystemExit("glyph not present in any face: %s" % name)
    explicit = None
    for s in ("brands", "regular", "solid"):
        if re.search(r"fa-%s\s+%s\b|%s\s+fa-%s\b" % (s, name, name, s), blob):
            explicit = s
            break
    pick = explicit if explicit in styles else styles[0]
    # the markup uses fa-regular fa-calendar, so honour regular when available
    if explicit and explicit in styles:
        pick = explicit
    wanted[pick].add(codepoints[name])

# ---- 5. subset -----------------------------------------------------------
os.makedirs("assets/fonts", exist_ok=True)
face_css = []
total_before = total_after = 0
for style, (fn, family, weight) in FACES.items():
    cps = sorted(wanted[style])
    src = os.path.join(SP, fn.replace(".woff2", ".ttf"))
    total_before += os.path.getsize(src)
    if not cps:
        print("skip %-20s (no glyphs used)" % style)
        continue
    out = "assets/fonts/%s" % fn.replace(".woff2", ".subset.woff2")
    args = [src, "--output-file=" + out, "--flavor=woff2",
            "--unicodes=" + ",".join("U+" + c for c in cps),
            "--layout-features=", "--no-hinting", "--desubroutinize",
            "--drop-tables+=DSIG"]
    subset.main(args)
    total_after += os.path.getsize(out)
    print("%-20s %2d glyphs  %7.1f KB -> %6.1f KB" % (
        style, len(cps), os.path.getsize(src) / 1024, os.path.getsize(out) / 1024))
    face_css.append(
        "@font-face {\n"
        "    font-family: '%s';\n"
        "    font-style: normal;\n"
        "    font-weight: %d;\n"
        "    font-display: block;\n"
        "    src: url('assets/fonts/%s') format('woff2');\n"
        "}" % (family, weight, os.path.basename(out)))

# ---- 6. write the local stylesheet ---------------------------------------
icon_rules = []
for name in used:
    icon_rules.append(".%s::before { content: '\\%s'; }" % (name, codepoints[name]))

sheet = """/*!
 * Font Awesome 6.4.0 -- subset for this site only.
 * Icons: CC BY 4.0 | Fonts: SIL OFL 1.1 | Code: MIT -- https://fontawesome.com
 * Only the %d glyphs this portfolio actually draws are included, self-hosted so
 * no third party sees a request on page load. Regenerate with scripts/ notes in
 * README if the markup starts using a new icon.
 */
%s

.fa-solid,
.fa-regular,
.fa-brands {
    display: var(--fa-display, inline-block);
    font-style: normal;
    font-variant: normal;
    font-feature-settings: normal;
    font-kerning: none;
    line-height: 1;
    text-rendering: auto;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
}
.fa-solid { font-family: 'Font Awesome 6 Free'; font-weight: 900; }
.fa-regular { font-family: 'Font Awesome 6 Free'; font-weight: 400; }
.fa-brands { font-family: 'Font Awesome 6 Brands'; font-weight: 400; }

%s
""" % (len(used), "\n".join(face_css), "\n".join(icon_rules))

io.open("icons.css", "w", encoding="utf-8", newline="\n").write(sheet)
print("\nwrote icons.css  %.1f KB" % (os.path.getsize("icons.css") / 1024))
print("webfonts %.1f KB -> %.1f KB  (plus %.1f KB of CDN css dropped entirely)" % (
    total_before / 1024, total_after / 1024, os.path.getsize(css_path) / 1024))
