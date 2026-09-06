"""Rebuild the atlas catalog from versioned sources, preserving research fields.

No network calls. Explicit campus selections outrank name matching. This script
never writes the national map or turns candidate geometry into verified data.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = 'https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html'
raw = json.loads((ROOT / 'data/sources/universities-osm.json').read_text())
rows = [line.split('|') for line in (ROOT / 'data/universities.tsv').read_text().splitlines() if line]
existing = {u['id']: u for u in json.loads((ROOT / 'app/data/universities.json').read_text())}
selections = json.loads((ROOT / 'data/campus-selections.json').read_text())
identity_audit = {r['id']: r for r in json.loads((ROOT / 'data/roster-audit.json').read_text())['records']}
def code_for(row):
    # TSV keys are stable application IDs, not necessarily current school codes.
    record = identity_audit.get(row[0], {})
    return record.get('moeIdentifier', existing.get(row[0], {}).get('code', row[0]))[-5:]
flag = set('清华大学 北京大学 复旦大学 上海交通大学 浙江大学 南京大学 中国科学技术大学 武汉大学 华中科技大学 西安交通大学 哈尔滨工业大学 北京航空航天大学 同济大学 中山大学 厦门大学 四川大学 东南大学 天津大学 南开大学 山东大学'.split())
other985 = set('中国人民大学 北京理工大学 中国农业大学 北京师范大学 中央民族大学 大连理工大学 东北大学 吉林大学 华东师范大学 中国海洋大学 湖南大学 中南大学 中国人民解放军国防科技大学 华南理工大学 电子科技大学 重庆大学 西北工业大学 西北农林科技大学 兰州大学'.split())
a_codes = {r[0] for r in rows if r[1] in other985}
a_codes.update([r[0] for r in sorted(rows, key=code_for) if r[1] not in flag | other985][:21])
candidates = json.loads((ROOT / 'data/candidates.json').read_text())
result = []
for code, name, province, city in rows:
    u = existing.get(code, dict(id=code, subjects=[], campusId=None, position=None, website=None, campusName=None,
        sources=[dict(url=SOURCE, title='教育部 211 工程学校名单（历史口径）', checkedAt='2026-09-06')],
        gaps=['代表校区需官网确认', '校园布局需官方地图交叉核验', '特色建筑精细模型缺失', '学科及简介需官方资料核验', '学校代码及现名需最新名录复核']))
    u.update(code=code_for([code]), name=name, province=province, city=city, is985=name in flag | other985, is211=True,
        tier='S' if name in flag else 'A' if code in a_codes else 'B')
    if code in selections:
        s = selections[code]
        e = next((e for e in raw['elements'] if e['type'] == s['osmType'] and e['id'] == s['osmId']), candidates.get(code))
        assert e and e['type'] == s['osmType'] and e['id'] == s['osmId'], f'Missing selected OSM element: {code}'
        candidates[code] = e
        u.update(campusName=s['name'], website=s['website'],
            campusSelection=dict(basis=s['basis'], sourceUrl=s['sourceUrl'], status=s['status']))
        if u['position'] is None:
            u['position'] = [e['center']['lon'], e['center']['lat']]
        for source in [dict(url=s['sourceUrl'], title='官方校区选择依据（不代表布局已核验）', checkedAt=s['checkedAt']),
            dict(url=f"https://www.openstreetmap.org/{e['type']}/{e['id']}", title='OpenStreetMap 校园候选几何', license='ODbL-1.0', checkedAt=s['checkedAt'])]:
            if not any(old['url'] == source['url'] for old in u['sources']):
                u['sources'].append(source)
    result.append(u)
assert len(result) == len({u['id'] for u in result}) == 115
assert sum(u['is985'] for u in result) == 39
assert {t: sum(u['tier'] == t for u in result) for t in 'SAB'} == {'S': 20, 'A': 40, 'B': 55}
for relative, value in [('app/data/universities.json', result), ('data/candidates.json', candidates)]:
    target = ROOT / relative
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(target)
print('115 schools, 39 historical 985, S20/A40/B55;', len(candidates), 'campus geometry candidates')
