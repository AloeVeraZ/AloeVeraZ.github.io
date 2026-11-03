"""Check portfolio-data.json against the site's set format.

Every object of a kind is written the same way: the same fields, in the same
order, each holding the same kind of value, with "" or [] where it has nothing.
portfolio-template.json shows one of each. This script says what in the data
does not match, and what it would show wrong on the page:

    python tools/check-data.py          # report
    python tools/check-data.py --fix    # also put fields in order, add any
                                        # missing ones empty, and copy the
                                        # data's words into index.html

index.html carries a copy of the words the page shows before the data has
loaded (its data-content elements). --fix keeps that copy the same as the
data, so the first paint never shows old words.

Exits 1 if anything is wrong, so it can sit in a hook.
"""
import collections, html, io, json, os, re, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(REPO)
FIX = '--fix' in sys.argv[1:]

# Every link is { type, label, url }; the type picks its icon (LINK_ICONS in portfolio.js).
LINK_TYPES = ['github', 'linkedin', 'cad', 'video', 'resume', 'email', 'link', 'projects', 'contact', 'section']
SECTION_IDS = ['about', 'skills', 'projects', 'archive', 'contact']

# The format: for each kind of object, its fields in order and what each holds.
# A kind is 'str', 'int', 'bool', ['str'] (a list of strings), another format's
# name, or a list holding one name (a list of those).
FORMATS = {
    'data': [('profile', 'profile'), ('sections', 'sections'), ('about', ['about']), ('skills', ['skill']),
             ('collections', ['collection']), ('projects', ['project'])],
    'link': [('type', 'str'), ('label', 'str'), ('url', 'str')],
    'profile': [('name', 'str'), ('title', 'str'), ('badge', 'str'), ('tagline', 'str'),
                ('actions', ['link']), ('links', ['link'])],
    'sections': [(name, 'section') for name in SECTION_IDS],
    'section': [('menu', 'str'), ('label', 'str'), ('title', 'str'), ('summary', 'str')],
    'about': [('label', 'str'), ('title', 'str'), ('summary', 'str'), ('roles', ['role']),
              ('subline', 'str'), ('link', 'link')],
    'role': [('title', 'str'), ('position', 'str'), ('period', 'str')],
    'skill': [('title', 'str'), ('items', ['str'])],
    'collection': [('id', 'str'), ('title', 'str'), ('summary', 'str'), ('itemNoun', 'str'),
                   ('itemNounPlural', 'str'), ('carousel', 'bool'), ('categories', ['str'])],
    'project': [('id', 'str'), ('title', 'str'), ('category', 'str'), ('additionalCategories', ['str']),
                ('period', 'str'), ('collectionOrder', 'int'), ('featured', 'bool'), ('featuredOrder', 'int'),
                ('summary', 'str'), ('cardSummary', 'str'), ('programSummary', 'str'),
                ('image', 'str'), ('imageAlt', 'str'), ('imageSrcset', 'str'), ('imagePresentation', 'str'),
                ('motionImage', 'str'), ('motionImageAlt', 'str'), ('tags', ['str']),
                ('quickLink', 'link'), ('featureVideo', 'video'), ('overview', 'overview'),
                ('sections', ['part']), ('media', ['media']), ('links', ['link'])],
    'video': [('src', 'str'), ('label', 'str')],
    'overview': [('headings', ['str']), ('problem', 'str'), ('method', 'str'), ('result', 'str')],
    'part': [('heading', 'str'), ('body', 'str')],
    'media': [('type', 'str'), ('src', 'str'), ('label', 'str'), ('alt', 'str'), ('fit', 'str')],
}

problems = []
def problem(where, text):
    problems.append('%s: %s' % (re.sub(r'^data\.?', '', where) or 'the file', text))

def blank(kind):
    if isinstance(kind, list):
        return []
    if kind in ('str',):
        return ''
    if kind == 'int':
        return 0
    if kind == 'bool':
        return False
    return collections.OrderedDict((key, blank(sub)) for key, sub in FORMATS[kind])

def check(value, kind, where):
    """Check one value against its kind; return it, put in order when fixing."""
    if isinstance(kind, list):
        if not isinstance(value, list):
            problem(where, 'should be a list')
            return value
        return [check(item, kind[0], '%s[%d]' % (where, i)) for i, item in enumerate(value)]
    if kind == 'str':
        if not isinstance(value, str):
            problem(where, 'should be text in quotes')
        return value
    if kind == 'int':
        if not isinstance(value, int) or isinstance(value, bool):
            problem(where, 'should be a whole number')
        return value
    if kind == 'bool':
        if not isinstance(value, bool):
            problem(where, 'should be true or false')
        return value
    if not isinstance(value, dict):
        problem(where, 'should be { ... }')
        return value
    fields = FORMATS[kind]
    names = [key for key, _ in fields]
    out = collections.OrderedDict()
    for key, sub in fields:
        if key in value:
            out[key] = check(value[key], sub, '%s.%s' % (where, key))
        else:
            problem(where, 'is missing "%s"' % key)
            out[key] = blank(sub)
    extra = [key for key in value if key not in names]
    for key in extra:
        problem(where, 'has "%s", which is not in the format (left as it is)' % key)
        out[key] = value[key]
    present = [key for key in value if key in names]
    if present != [key for key in names if key in value]:
        problem(where, 'has its fields out of order')
    return out

def name_of(item, fallback):
    return item.get('id') or item.get('title') or fallback if isinstance(item, dict) else fallback

def exists(path):
    return os.path.isfile(path.split('?')[0].split('#')[0])

def local(url):
    return url and not re.match(r'^(https?:|mailto:|#)', url)

raw = io.open('portfolio-data.json', encoding='utf-8').read()
try:
    data = json.loads(raw, object_pairs_hook=collections.OrderedDict)
except ValueError as error:
    print('portfolio-data.json is not valid JSON: %s' % error)
    print('(a missing or extra comma, or a quote left open, is the usual cause)')
    sys.exit(1)

data = check(data, 'data', 'data')

# What the format alone cannot say.
def check_link(link, where, may_be_empty=True):
    if not isinstance(link, dict):
        return
    if link.get('type') not in LINK_TYPES:
        problem(where, 'type "%s" is not one of %s' % (link.get('type'), ', '.join(LINK_TYPES)))
    if not may_be_empty and not link.get('url'):
        problem(where, 'has no url')
    if local(link.get('url', '')) and not exists(link['url']):
        problem(where, 'points at %s, which is not in the repository' % link['url'])

profile = data.get('profile') or {}
for i, link in enumerate(profile.get('actions', [])):
    check_link(link, 'profile.actions[%d]' % i)
for i, link in enumerate(profile.get('links', [])):
    check_link(link, 'profile.links[%d]' % i)
    if link.get('type') == 'email' and link.get('url') and not link['url'].startswith('mailto:'):
        problem('profile.links[%d]' % i, 'an email link\'s url starts with mailto:')

collection_ids = []
categories = set()
for i, folder in enumerate(data.get('collections', [])):
    where = 'collections[%d] (%s)' % (i, name_of(folder, i))
    if folder.get('id') in collection_ids:
        problem(where, 'has the same id as another folder')
    if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', folder.get('id', '')):
        problem(where, 'id should be lower-case words joined by hyphens')
    collection_ids.append(folder.get('id'))
    categories.update(folder.get('categories', []))

anchors = set(collection_ids) | {'about', 'skills', 'projects', 'contact', 'hero', 'main-content'}
for i, card in enumerate(data.get('about', [])):
    link = card.get('link') or {}
    check_link(link, 'about[%d].link' % i)
    url = link.get('url', '')
    if url.startswith('#') and url[1:] not in anchors:
        problem('about[%d].link' % i, '%s is not a folder or section on the page' % url)

project_ids = set()
featured_orders = collections.Counter()
collection_orders = collections.Counter()
for i, project in enumerate(data.get('projects', [])):
    if not isinstance(project, dict):
        continue
    where = 'projects[%d] (%s)' % (i, name_of(project, i))
    pid = project.get('id', '')
    if pid in project_ids:
        problem(where, 'has the same id as another project')
    project_ids.add(pid)
    if not re.match(r'^[a-z0-9]+(-[a-z0-9]+)*$', pid):
        problem(where, 'id should be lower-case words joined by hyphens')
    for category in [project.get('category')] + list(project.get('additionalCategories', [])):
        if category not in categories:
            problem(where, 'category "%s" is in no folder, so the project shows nowhere in the archive' % category)
    if project.get('featured'):
        if not project.get('featuredOrder', 0) >= 1:
            problem(where, 'is featured, so its featuredOrder should be 1 or more')
        featured_orders[project.get('featuredOrder')] += 1
    elif project.get('featuredOrder'):
        problem(where, 'is not featured, so its featuredOrder should be 0')
    collection_orders[(project.get('category'), project.get('collectionOrder'))] += 1
    if project.get('imagePresentation') not in ('photo', 'certificate'):
        problem(where, 'imagePresentation should be "photo" or "certificate"')
    for key in ('image', 'motionImage'):
        if project.get(key) and not exists(project[key]):
            problem(where, '%s %s is not in the repository' % (key, project[key]))
    if project.get('image') and not project.get('imageAlt'):
        problem(where, 'has an image but no imageAlt')
    for part in (project.get('imageSrcset') or '').split(','):
        path = part.strip().split(' ')[0]
        if path and not exists(path):
            problem(where, 'imageSrcset names %s, which is not in the repository' % path)
    headings = (project.get('overview') or {}).get('headings', [])
    if len(headings) not in (0, 3):
        problem(where, 'overview.headings should have three headings, or none for the usual ones')
    check_link(project.get('quickLink'), where + '.quickLink')
    for j, link in enumerate(project.get('links', [])):
        check_link(link, '%s.links[%d]' % (where, j), may_be_empty=False)
    for j, item in enumerate(project.get('media', [])):
        if not isinstance(item, dict):
            continue
        at = '%s.media[%d]' % (where, j)
        kind = item.get('type')
        if kind not in ('image', 'gif', 'video'):
            problem(at, 'type should be "image", "gif" or "video"')
        elif kind == 'video':
            if item.get('alt') or item.get('fit'):
                problem(at, 'a video leaves alt and fit empty')
        else:
            if item.get('fit') not in ('cover', 'contain'):
                problem(at, 'fit should be "cover" or "contain"')
            if item.get('src') and not item.get('alt'):
                problem(at, 'has a picture but no alt')
            if local(item.get('src', '')) and not exists(item['src']):
                problem(at, '%s is not in the repository' % item['src'])
for order, count in featured_orders.items():
    if count > 1:
        problem('projects', '%d featured projects share featuredOrder %s' % (count, order))
for (category, order), count in collection_orders.items():
    if count > 1:
        problem('projects', '%d projects in "%s" share collectionOrder %s' % (count, category, order))

# index.html's copy of the words, for the first paint.
page = io.open('index.html', encoding='utf-8', newline='').read()
ELEMENT = re.compile(r'<(\w+)([^>]*?\sdata-content="([^"]+)"[^>]*)>((?:\s*<i\b[^>]*></i>)*)(.*?)</\1>', re.S)
def field(path):
    value = data
    for key in path.split('.'):
        value = value.get(key) if isinstance(value, dict) else None
    return value
def copy(match):
    tag, attributes, path, icons, inner = match.groups()
    value = field(path)
    if not isinstance(value, str):
        problem('index.html', 'data-content="%s" names nothing in the data' % path)
        return match.group(0)
    shown = html.unescape(re.sub(r'\s+', ' ', inner)).strip()
    hidden = re.search(r'\shidden(\s|$|=)', attributes) is not None
    if shown == value and hidden == (not value):
        return match.group(0)
    problem('index.html', 'its first-paint copy of %s is not the data\'s' % path)
    attributes = re.sub(r'\shidden(?=\s|$)', '', attributes) + ('' if value else ' hidden')
    words = html.escape(value, quote=False)
    return '<%s%s>%s%s</%s>' % (tag, attributes, icons, (' ' + words) if icons and words else words, tag)
page_fixed = ELEMENT.sub(copy, page)

if FIX:
    io.open('portfolio-data.json', 'w', encoding='utf-8', newline='\n').write(
        json.dumps(data, indent=4, ensure_ascii=False) + '\n')
    if page_fixed != page:
        io.open('index.html', 'w', encoding='utf-8', newline='').write(page_fixed)

if problems:
    print('%d thing%s to look at:' % (len(problems), '' if len(problems) == 1 else 's'))
    for line in problems:
        print('  ' + line)
    if FIX:
        print('\nFixed what could be: fields put in order, missing ones added empty, index.html copied from the data.')
        print('Run it again to see what is left.')
    sys.exit(1)
print('portfolio-data.json matches the format (%d projects, %d folders).' % (len(data.get('projects', [])), len(data.get('collections', []))))
