"""Download attributed, school-specific emblem originals; never invent missing logos.

Uses a pinned public VIS directory for discovery, school-name matching rather than
assuming external IDs match this app, and the collection's explicitly advertised
512px PNG thumbnail. Assets are copied byte-for-byte; no crop/recolour/redrawing.
Run: python3 scripts/fetch-emblems.py [--ids=10001,10003] [--check]
"""
import concurrent.futures
import hashlib
import io
import zipfile
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import struct
import zlib
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
DIRECT = {
    '10001': {
        'sourceUrl': 'https://vim.pku.edu.cn/docs/20240527144201516364.zip',
        'officialPage': 'https://vim.pku.edu.cn/xzzq/index.htm',
        'archiveMember': '标志_红色.png',
        'expectedSha256': 'b328ed3c9e579ec8c2031ad8a5b6c244994fba5d1e93cc98901d1fcc3c306bdb',
        'notes': ['官网“标志(圆形校徽).zip”内的原始红色 PNG；仅解压单个文件，未改色或裁剪。'],
    },
    '91020': {
        'sourceUrl': 'https://cdn.urongda.com/images/universities/海军军医大学-logo-512px.png',
        'officialPage': 'https://www.smmu.edu.cn/',
        'discoveryPage': 'https://www.urongda.com/universities/project-211',
        'expectedSha256': '655a124e46c354829853fe78ea2531edd7c20e9ca9eb73acffe5a04c05771c74',
        'notes': ['当前海军军医大学校徽：已对照官网页眉原图的校名、蛇杖、八一星徽、船锚、橄榄枝及英文环；未沿用旧第二军医大学文字版本。'],
    },
    '91030': {
        'sourceUrl': 'https://www.fmmu.edu.cn/__local/0/96/81/B410D8E6EE5DC29D3DE90F01677_BFDF5B60_327E8.png',
        'officialPage': 'https://www.fmmu.edu.cn/xxgk/xxbz1.htm',
        'expectedSha256': '50cdea8b22187c6cb0e6d48cc4500890c683d5229535dff248a6cb9721bbf96c',
        'notes': ['直接采用官网“学校标志”校徽原始 PNG；城墙、橄榄枝、蛇杖、空军翅膀、1941 与 AFMU 均与官方释义一致。'],
    },
}


DIRECT.update({'10004': {'sourceUrl': 'https://www.bjtu.edu.cn/images/2024-11/0d4cb3bdd27a4088ae62c36f75d98738.png',
           'officialPage': 'https://www.bjtu.edu.cn/xxgk/xxbz/index.htm',
           'expectedSha256': 'aa506bcafce2bd33059592fcb5322aa97527be10a53f31a835003c3f50ed4a0f',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10005': {'sourceUrl': 'https://www.bjut.edu.cn/__local/0/3B/29/B0955FD37DB3B273D1C31678217_6AA6537D_9507.png?e=.png',
           'officialPage': 'https://www.bjut.edu.cn/dxwh/gdbs1.htm',
           'expectedSha256': '6dbd8a1cc7e1b4f2bf2dc65736d10e9be94417ed0afca8d0c02d3744afe754bd',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10022': {'sourceUrl': 'https://vi.bjfu.edu.cn/images/xiaohui.png',
           'officialPage': 'https://vi.bjfu.edu.cn/',
           'expectedSha256': 'f7b7d68d019e1f5c4ad9b0b89aa6b5745643c8a60405b0d2a048d8bcfdaa324c',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10145': {'sourceUrl': 'https://www.neu.edu.cn/__local/4/30/EA/0509D19C69223A9F496920EB50A_B834D310_1019D.png',
           'officialPage': 'https://www.neu.edu.cn/xygk/ddbs.htm',
           'expectedSha256': 'd635116b76afbadaa6d7bd2139780eb608eca0508400bc8a9d32035b39ec481c',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10213': {'sourceUrl': 'https://www.hit.edu.cn/_upload/article/images/d3/ec/8fcaa5d24cb59a8e9660324ef50b/735df70a-538b-4bd6-8e52-3f373085a616.png',
           'officialPage': 'https://www.hit.edu.cn/11544/list.htm',
           'expectedSha256': '5aa509588f338bc6e6cff09ddf6100fc324289c2cd042288d3b56194d383a3f9',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '11903': {'sourceUrl': 'https://www.shu.edu.cn/__local/0/08/C6/1EABE492B0CF228A5564D6E6ABE_779D1EE3_5BF7.png',
           'officialPage': 'https://www.shu.edu.cn/xxgk/sdwh.htm',
           'expectedSha256': '6c4a2c0c6c8870df0ecd55e045543010999aea34ee53c71f857f2131948e4fd5',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10425': {'sourceUrl': 'https://www.upc.edu.cn/__local/C/F5/A5/5D4E68C8E5AC5EAC303B91B6AF3_8B597FCD_855B.png',
           'officialPage': 'https://www.upc.edu.cn/xygk/xywh.htm',
           'expectedSha256': '5b31eb9b57ef713881132f02570ccf01972094daf5c2d4f0e0b9c1b5992ac6c4',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10459': {'sourceUrl': 'http://www.zzu.edu.cn/__local/F/09/A3/7C2002C534020EAD7036D42F848_DB67C5F8_AC59.png',
           'officialPage': 'http://www.zzu.edu.cn/xxgk/whbs.htm',
           'expectedSha256': '203c283bb8aa31d28224f7a54eec01a176ecb6d544fe2043380ba22adee12534',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10558': {'sourceUrl': 'https://www.sysu.edu.cn/__local/C/8E/79/6236A91AEAFBB9F7F2C23A9F836_97F1F3B5_178FF.png?e=.png',
           'officialPage': 'https://www.sysu.edu.cn/xxg/zdjj1.htm',
           'expectedSha256': '61b24c100d11ada4738623ceb9855a027dee199223b959c506f2f5d2be003f4f',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10561': {'sourceUrl': 'https://www.scut.edu.cn/_upload/article/images/16/02/3166fd1b4c8cb0148ec56c04f071/c6faf181-ecc2-4b0b-b05d-1f4c04780ce6.png',
           'officialPage': 'https://www.scut.edu.cn/new/9017/list.htm',
           'expectedSha256': '66f2324cb979c31aeae39d59c7a9261cdf22109612ad7d2010aaea04b71569c4',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10651': {'sourceUrl': 'https://www.swufe.edu.cn/__local/5/F1/AC/0CE89B7DCE6366962A361A08B6D_BF76F71B_A98E.png',
           'officialPage': 'https://www.swufe.edu.cn/xywh/xh.htm',
           'expectedSha256': '5037b39079e91b646ff8544aaa8aab9ffec81ccd10c8bcc70c966c4304f7fb59',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']},
 '10697': {'sourceUrl': 'https://www.nwu.edu.cn/__local/3/63/A5/73750A799BDE7ED88E21F1A0A65_89AD1DD1_24F50.png',
           'officialPage': 'https://www.nwu.edu.cn/xxgk/xxbs/xb.htm',
           'expectedSha256': '770ecfddffee3585627070d7ae374a380c06fd79a9f3337d7ead5da87584d2f5',
           'notes': ['优先采用官方标识页面提供的独立 PNG 原图；已对照校名及标志形制，保留原始尺寸、颜色与留白。']}})


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


def validate_png(blob):
    width, height = png_info(blob)
    offset = 8
    compressed = bytearray()
    found_end = False
    while offset < len(blob):
        length = int.from_bytes(blob[offset:offset + 4], 'big')
        tag = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + length]
        crc = int.from_bytes(blob[offset + 8 + length:offset + 12 + length], 'big')
        assert len(data) == length and zlib.crc32(tag + data) & 0xffffffff == crc, 'PNG CRC mismatch'
        if tag == b'IDAT':
            compressed.extend(data)
        if tag == b'IEND':
            found_end = True
            break
        offset += length + 12
    assert found_end and compressed, 'incomplete PNG'
    raw = zlib.decompress(compressed)
    bit_depth, color_type, interlace = blob[24], blob[25], blob[28]
    if interlace == 0:
        channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color_type]
        row_bytes = (width * channels * bit_depth + 7) // 8
        assert len(raw) == height * (1 + row_bytes), 'PNG decoded row length mismatch'
        assert all(raw[y * (1 + row_bytes)] <= 4 for y in range(height)), 'PNG filter invalid'
    return width, height


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
    if id in DIRECT:
        source = DIRECT[id]
        url = urllib.parse.quote(source['sourceUrl'], safe=':/?=&%')
        blob = fetch(url)
        archive_hash = sha(blob) if source.get('archiveMember') else None
        if source.get('archiveMember'):
            archive = zipfile.ZipFile(io.BytesIO(blob))
            names = {name.encode('cp437').decode('gbk'): name for name in archive.namelist()}
            blob = archive.read(names[source['archiveMember']])
        digest = sha(blob)
        if digest != source['expectedSha256']:
            raise ValueError(f'{id}: official/manual-reviewed source changed; review before replacing')
        width, height = png_info(blob)
        (OUT / (id + '.png')).write_bytes(blob)
        record = {'universityId': id, 'name': school['name'], 'localPath': '/emblems/' + id + '.png', 'sourceUrl': source['sourceUrl'], 'officialPage': source['officialPage'], 'verified': True, 'notes': source['notes'] + ['标识权利归学校；verified 为图像身份与形制核对，不代表学校授权。'], 'sha256': digest, 'width': width, 'height': height, 'bytes': len(blob), 'format': 'image/png', 'retrievedAt': DATE, 'verification': {'method': 'official-original' if id != '91020' else 'visual-comparison-to-official-image', 'checkedAt': DATE}}
        if source.get('archiveMember'):
            record.update({'archiveMember': source['archiveMember'], 'archiveSha256': archive_hash})
        if source.get('discoveryPage'):
            record['discoveryPage'] = source['discoveryPage']
        return id, record
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
            assert validate_png(blob) == (item['width'], item['height']), f'{id}: dimensions mismatch'
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
