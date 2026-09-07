"""Self-host Inter and Barlow Condensed instead of loading them from Google.

Two wins: the render-blocking cross-origin stylesheet leaves the critical path,
and Google stops seeing a request (and an IP) for every visitor.

Google serves Inter as a single variable font -- the same bytes for every weight
-- so identical payloads are stored once and declared with a weight range.
Only latin and latin-ext are kept; unicode-range means a visitor reading English
downloads the latin file alone.
"""
import io, os, re, glob, hashlib, urllib.request, collections

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
OUT = "assets/fonts"
os.makedirs(OUT, exist_ok=True)

for stale in glob.glob(os.path.join(OUT, "inter*.woff2")) + \
             glob.glob(os.path.join(OUT, "barlow*.woff2")):
    os.remove(stale)

CSS_URL = ("https://fonts.googleapis.com/css2"
           "?family=Barlow+Condensed:wght@500;600;700;800"
           "&family=Inter:wght@300;400;500;600;700&display=swap")
HDRS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"}

css = urllib.request.urlopen(
    urllib.request.Request(CSS_URL, headers=HDRS), timeout=60).read().decode("utf-8")

# ---- pass 1: fetch every latin face, keyed by content ---------------------
# (family, subset, digest) -> {"data", "range", "weights"}
groups = collections.OrderedDict()
for subset_name, block in re.findall(
        r"/\*\s*([\w\-\[\]]+)\s*\*/\s*(@font-face\s*\{[^}]+\})", css):
    if subset_name not in ("latin", "latin-ext"):
        continue
    family = re.search(r"font-family:\s*'([^']+)'", block).group(1)
    weight = int(re.search(r"font-weight:\s*(\d+)", block).group(1))
    url = re.search(r"url\((https://[^)]+\.woff2)\)", block).group(1)
    urange = re.search(r"unicode-range:\s*([^;]+);", block)

    data = urllib.request.urlopen(
        urllib.request.Request(url, headers=HDRS), timeout=60).read()
    key = (family, subset_name, hashlib.sha1(data).hexdigest())
    g = groups.setdefault(key, {"data": data, "weights": [],
                                "range": urange.group(1).strip() if urange else None})
    g["weights"].append(weight)

# a family whose weights all share one file is variable -> name it without one
variable = {f for f in {k[0] for k in groups}
            if all(len(g["weights"]) > 1 for k, g in groups.items() if k[0] == f)}

# ---- pass 2: write the files and the stylesheet ---------------------------
faces, total = [], 0
for (family, subset_name, _), g in groups.items():
    stem = family.lower().replace(" ", "-")
    weights = sorted(set(g["weights"]))
    name = ("%s-%s.woff2" % (stem, subset_name) if family in variable
            else "%s-%d-%s.woff2" % (stem, weights[0], subset_name))
    open(os.path.join(OUT, name), "wb").write(g["data"])
    total += len(g["data"])
    faces.append(
        "@font-face {\n"
        "    font-family: '%s';\n"
        "    font-style: normal;\n"
        "    font-weight: %s;\n"
        "    font-display: swap;\n"
        "    src: url('%s/%s') format('woff2');\n"
        "%s}" % (family,
                 "%d %d" % (weights[0], weights[-1]) if len(weights) > 1 else weights[0],
                 OUT, name,
                 "    unicode-range: %s;\n" % g["range"] if g["range"] else ""))

io.open("fonts.css", "w", encoding="utf-8", newline="\n").write(
    """/*!
 * Inter and Barlow Condensed, self-hosted.
 * Both are SIL Open Font License 1.1 -- https://openfontlicense.org
 * Latin subsets only, so no visitor request ever leaves this origin.
 * Inter is a variable font: one file covers 300-700.
 * Regenerate with tools/build-fonts.py.
 */
%s
""" % "\n".join(faces))

print("wrote fonts.css -- %d faces, %.1f KB on disk" % (len(faces), total / 1024))
for f in sorted(glob.glob(os.path.join(OUT, "*.woff2"))):
    print("  %-42s %6.1f KB" % (os.path.basename(f), os.path.getsize(f) / 1024))
