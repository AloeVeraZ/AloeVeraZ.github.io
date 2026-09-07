"""Record the card srcset for every project that has a 900px variant.

Written into the data rather than guessed at runtime: the page cannot stat the
filesystem, and a guessed filename that turns out not to exist is a 404 on every
card. Run after tools/build-thumbnails.py.
"""
import io, json, os, collections
from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)

data = json.loads(io.open("portfolio-data.json", encoding="utf-8").read(),
                  object_pairs_hook=collections.OrderedDict)

linked = cleared = 0
for project in data["projects"]:
    image = project.get("image") or ""
    thumb = image.replace(".webp", "-900.webp")
    if image.endswith(".webp") and os.path.exists(thumb):
        width = Image.open(image).width
        srcset = "%s 900w, %s %dw" % (thumb, image, width)
        if project.get("imageSrcset") != srcset:
            project["imageSrcset"] = srcset
            linked += 1
    elif "imageSrcset" in project:
        del project["imageSrcset"]
        cleared += 1

io.open("portfolio-data.json", "w", encoding="utf-8", newline="\n").write(
    json.dumps(data, indent=4, ensure_ascii=False) + "\n")
print("srcset recorded on %d projects, %d cleared" % (linked, cleared))
