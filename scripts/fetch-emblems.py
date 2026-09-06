"""Download attributed, school-specific emblem originals; never invent missing logos.

Uses a pinned public VIS directory for discovery, school-name matching rather than
assuming external IDs match this app, and the collection's explicitly advertised
512px PNG thumbnail. Assets are copied byte-for-byte; no crop/recolour/redrawing.
Run: python3 scripts/fetch-emblems.py [--ids=10001,10003] [--check]
"""
import concurrent.futures
import hashlib
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/emblems'
MANIFEST = ROOT / 'public/data/university-emblems.json'
CACHE = Path(tempfile.gettempdir()) / 'university-emblem-research'
CATALOG_URL = 'https://raw.githubusercontent.com/urongda/Visual_Identity_System_Chinese_University/7120523b8d9e6242389ffc2e7008d23a5a006d93/schools.json'
HEADERS = {'User-Agent': 'CampusAtlas/1.0 (public university identity reference; educational exploration)'}
DATE = '2026-09-06'


def sha(blob):
    return hashlib.sha256(blob).hexdigest()


def fetch(url, limit=8_000_000, cache=True):
    key = CACHE / sha(url.encode())
    if cache and key.exists():
        return key.read_bytes()
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=12) as response:
        blob = response.read(limit + 1)
    if len(blob) > limit:
        raise ValueError('download exceeds bounded emblem limit')
    if cache:
        key.write_bytes(blob)
    return blob


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.images = []
        self.links = []
        self.texts = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        if tag == 'img':
            self.images.append(values)
        if tag in ('a', 'link'):
            self.links.append(values)

    def handle_data(self, data):
        self.texts.append(data)


def parse(blob):
    p = Page()
    try:
        p.feed(blob.decode('utf-8'))
    except UnicodeDecodeError:
        p.feed(blob.decode('gb18030', errors='replace'))
    return p


def canonical(name):
    return re.sub(r'[\s（）()]', '', name)


def png_info(blob):
    if blob[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('not a PNG image (error/placeholder pages rejected)')
    return struct.unpack('>II', blob[16:24])


def official_check(url, school_name):
    try:
        blob = fetch(url, limit=4_000_000)
        p = parse(blob)
        text = ' '.join(p.texts)
        good = school_name in text and any(word in text for word in ['校徽', '标识', '标志', '视觉'])
        return {'status': 'retrieved' if good else 'retrieved-needs-review', 'pageSha256': sha(blob), 'containsNameAndIdentityText': good}
    except Exception as error:
        return {'status': 'unavailable', 'error': str(error)[:220]}


def collect(school, catalog_by_name, previous):
    id = school['id']
    source = catalog_by_name.get(canonical(school['name']))
    record = {'universityId': id, 'name': school['name'], 'localPath': None, 'sourceUrl': None, 'officialPage': (source or {}).get('vis') or school['website'], 'verified': False, 'notes': [], 'retrievedAt': DATE}
    if not source:
        record['notes'].append('公开 VIS 目录未找到校名完全匹配的资源；不使用相似学校或旧军医校徽代替。')
        return id, record
    record['discoveryPage'] = 'https://urongda.com/logos/' + str(source['slug'])
    record['catalogUrl'] = CATALOG_URL
    record['officialEvidence'] = official_check(record['officialPage'], school['name'])
    try:
        page = fetch(record['discoveryPage'], limit=2_000_000)
        parsed = parse(page)
        matches = [image for image in parsed.images if canonical(image.get('alt', '')) == canonical(school['name'] + '校徽')]
        if len(matches) != 1:
            raise ValueError(f'expected one image explicitly named {school["name"]}校徽; found {len(matches)}')
        standard = matches[0]['src']
        decoded = unescape(page.decode('utf-8')).replace('\\"', '"')
        # Use the page's published small PNG, not an invented image endpoint.
        pattern = r'https://[^\s"<>]+/images/normal/small/[^\s"<>]+?\.png'
        thumbnails = list(dict.fromkeys(re.findall(pattern, decoded)))
        basename = urllib.parse.urlsplit(standard).path.split('/')[-1].replace('-1024px.png', '-512px.png')
        candidates = [url for url in thumbnails if urllib.parse.urlsplit(url).path.split('/')[-1] == basename]
        image_url = candidates[0] if candidates else standard
        blob = fetch(image_url)
        width, height = png_info(blob)
        if width < 64 or height < 64 or not 0.65 <= width / height <= 1.5:
            raise ValueError(f'image is not a usable standalone emblem: {width}x{height}')
        digest = sha(blob)
        path = OUT / (id + '.png')
        path.write_bytes(blob)
        record.update({'localPath': '/emblems/' + id + '.png', 'sourceUrl': image_url, 'sourcePageSha256': sha(page), 'sha256': digest, 'width': width, 'height': height, 'bytes': len(blob), 'format': 'image/png'})
        record['notes'].append('资源页明确以该校全名标注独立校徽；使用原始 PNG，未裁剪、重绘或改色。')
        record['notes'].append('标识权利归相应大学；资源集合来源不等于大学授权。')
        old = previous.get(id, {})
        if old.get('sha256') == digest and old.get('verified'):
            record['verified'] = True
            record['notes'] = old['notes']
            if 'verification' in old:
                record['verification'] = old['verification']
        else:
            record['notes'].append('已核对资源页校名；官方视觉形制逐图对照尚未完成，不标记 verified。')
    except Exception as error:
        record['notes'].append('采集缺口：' + str(error)[:300])
    return id, record


def check(records, schools):
    assert set(records) == {s['id'] for s in schools}, 'manifest must cover every current school ID'
    hashes = {}
    for id, item in records.items():
        assert item['universityId'] == id
        if item['localPath']:
            blob = (ROOT / 'public' / item['localPath'].lstrip('/')).read_bytes()
            assert sha(blob) == item['sha256'], f'{id}: hash mismatch'
            assert png_info(blob) == (item['width'], item['height']), f'{id}: dimensions mismatch'
            hashes.setdefault(item['sha256'], []).append(id)
        else:
            assert not item['verified'], f'{id}: missing image cannot be verified'
    duplicates = [ids for ids in hashes.values() if len(ids) > 1]
    assert not duplicates, f'duplicate emblems require explicit school identity review: {duplicates}'
    print(json.dumps({'schools': len(records), 'available': sum(bool(v['localPath']) for v in records.values()), 'verified': sum(v['verified'] for v in records.values()), 'missing': [v['name'] for v in records.values() if not v['localPath']], 'bytes': sum(v.get('bytes', 0) for v in records.values())}, ensure_ascii=False))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    schools = json.loads((ROOT / 'app/data/universities.json').read_text())
    previous = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    if '--check' in sys.argv:
        check(previous, schools)
        return
    catalog = json.loads(fetch(CATALOG_URL))
    by_name = {canonical(s['title']): s for s in catalog}
    option = next((a[6:] for a in sys.argv if a.startswith('--ids=')), None)
    selected = set(option.split(',')) if option else None
    targets = [s for s in schools if not selected or s['id'] in selected]
    records = dict(previous)
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futures = {pool.submit(collect, s, by_name, previous): s for s in targets}
        for future in concurrent.futures.as_completed(futures):
            id, record = future.result()
            records[id] = record
            print(id, record['name'], 'downloaded' if record['localPath'] else 'MISSING', flush=True)
    records = {s['id']: records[s['id']] for s in schools if s['id'] in records}
    MANIFEST.write_text(json.dumps(records, ensure_ascii=False, indent=2) + '\n')
    check(records, schools)


if __name__ == '__main__':
    main()
