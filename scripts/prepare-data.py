import json,re,pathlib,math
ROOT=pathlib.Path(__file__).resolve().parents[1]
source='https://www.moe.gov.cn/srcsite/A22/s7065/200512/t20051223_82762.html'
raw=json.load(open('/tmp/campus-universities-osm.json'))
(ROOT/'data/sources/universities-osm.json').write_text(json.dumps(raw,ensure_ascii=False))
flag=set('清华大学 北京大学 复旦大学 上海交通大学 浙江大学 南京大学 中国科学技术大学 武汉大学 华中科技大学 西安交通大学 哈尔滨工业大学 北京航空航天大学 同济大学 中山大学 厦门大学 四川大学 东南大学 天津大学 南开大学 山东大学'.split())
other985=set('中国人民大学 北京理工大学 中国农业大学 北京师范大学 中央民族大学 大连理工大学 东北大学 吉林大学 华东师范大学 中国海洋大学 湖南大学 中南大学 中国人民解放军国防科技大学 华南理工大学 电子科技大学 重庆大学 西北工业大学 西北农林科技大学 兰州大学'.split())
# Overrides choose the landmark-bearing campus; all remain candidates until official-map verification.
overrides={'清华大学':'清华大学','北京大学':'北京大学','复旦大学':'邯郸','上海交通大学':'闵行','浙江大学':'紫金港','南京大学':'鼓楼','武汉大学':'武汉大学','华中科技大学':'华中科技大学','山东大学':'中心','中山大学':'广州校区南校园','厦门大学':'思明','四川大学':'望江','东南大学':'四牌楼','南开大学':'八里台','天津大学':'卫津路','中国科学技术大学':'东校区','西安交通大学':'兴庆','哈尔滨工业大学':'一校区'}
aliases={'中国人民解放军海军军医大学':['海军军医大学','第二军医大学'],'中国人民解放军空军军医大学':['空军军医大学','第四军医大学'],'中国人民解放军国防科技大学':['国防科技大学','国防科学技术大学'],'中国地质大学（武汉）':['中国地质大学'],'中国石油大学（华东）':['中国石油大学']}
rows=[x.split('|') for x in (ROOT/'data/universities.tsv').read_text().splitlines() if x]
a_codes=set(x[0] for x in sorted(rows) if x[1] not in flag and x[1] in other985)
a_codes.update([x[0] for x in sorted(rows) if x[1] not in flag|other985][:21])
result=[];candidates={}
for code,name,province,city in rows:
 names=[name]+aliases.get(name,[])
 def score(e):
  t=e.get('tags',{});n=t.get('name:zh',t.get('name',''));norm=n.replace('(','（').replace(')','）')
  s=max([100 if norm==a else 60 if a in norm else 0 for a in names])
  if not s or any(k in n for k in ['附属','医院','中学','小学','在建','研究院','基地','学院（']):return -1
  if province in t.get('addr:province','') or city in t.get('addr:city',''):s+=30
  if overrides.get(name,'###') in n:s+=80
  if e['type']=='relation':s+=4
  if e['type']=='node':s-=20
  return s
 matches=sorted([e for e in raw['elements'] if score(e)>0],key=score,reverse=True)
 best=matches[0] if matches else None
 # Ambiguous ties are not silently resolved into asserted primary campuses.
 unambiguous=bool(best and (len(matches)==1 or score(matches[0])>score(matches[1])))
 if best and best['type'] in ('way','relation') and unambiguous:
  candidates[code]=best
 pos=(best.get('center',best) if best else None)
 result.append(dict(id=code,code=code,name=name,province=province,city=city,is985=name in flag|other985,is211=True,tier='S' if name in flag else 'A' if code in a_codes else 'B',campusName=best['tags'].get('name') if best and unambiguous else None,position=[pos['lon'],pos['lat']] if pos and unambiguous else None,website=best['tags'].get('website') if best and unambiguous else None,subjects=[],sources=[dict(url=source,title='教育部 211 工程学校名单（历史口径）',checkedAt='2026-09-06')]+([dict(url=f"https://www.openstreetmap.org/{best['type']}/{best['id']}",title='OpenStreetMap 校园候选位置，待官网核验',license='ODbL-1.0',checkedAt='2026-09-06')] if best and unambiguous else []),campusId=None,gaps=['代表校区需官网确认','校园布局需官方地图交叉核验','特色建筑精细模型缺失','学科及简介需官方资料核验','学校代码及现名需最新名录复核']))
(ROOT/'app/data/universities.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
(ROOT/'data/candidates.json').write_text(json.dumps(candidates,ensure_ascii=False,indent=2))
# Preserve countries as received; this is a development backdrop, not a reviewed final boundary product.
j=json.load(open('/tmp/campus-countries.geojson'))
features=[]
for f in j['features']:
 p=f['properties']
 if p.get('ADM0_A3') in ['CHN','TWN']:
  features.append(dict(type='Feature',properties={'name':p.get('NAME_ZH',p['NAME']),'code':p['ADM0_A3']},geometry=f['geometry']))
(ROOT/'public/data/china.geojson').write_text(json.dumps(dict(type='FeatureCollection',features=features)))
print('records',len(result),'985',sum(x['is985'] for x in result),'tiers',{t:sum(x['tier']==t for x in result) for t in 'SAB'},'geometry candidates',len(candidates),'missing position',sum(x['position'] is None for x in result))
