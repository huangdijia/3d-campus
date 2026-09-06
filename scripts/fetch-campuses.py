"""Download ODbL campus geometry without asserting official verification.
Resumable; bounded two-request concurrency and timeout; failed responses are retained separately.
"""
import json,urllib.request,urllib.parse,pathlib,concurrent.futures,time
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'data/sources/campuses';OUT.mkdir(exist_ok=True)
candidates=json.load(open(ROOT/'data/candidates.json'))
def request(query):
 url='https://overpass-api.de/api/interpreter?'+urllib.parse.urlencode({'data':query})
 req=urllib.request.Request(url,headers={'User-Agent':'CampusAtlasResearch/0.1 (OpenStreetMap attribution retained)'})
 with urllib.request.urlopen(req,timeout=70) as r:return json.load(r)
def fetch(item):
 code,e=item;p=OUT/(code+'.json')
 if p.exists():return code,'cached'
 try:
  c=e.get('center',e);lat,lon=c['lat'],c['lon'];kind='rel' if e['type']=='relation' else 'way'
  # Query actual campus polygon and all nearby ways; importer clips to polygon, never box-fills.
  q=f'[out:json][timeout:45];({kind}({e["id"]}););out geom;'
  boundary=request(q)
  if not boundary.get('elements'):raise ValueError('No campus boundary')
  first=boundary['elements'][0]
  coords=first.get('geometry',[])+[pt for m in first.get('members',[]) for pt in m.get('geometry',[])]
  if not coords:raise ValueError('Boundary has no geometry')
  south,north=min(x['lat'] for x in coords),max(x['lat'] for x in coords)
  west,east=min(x['lon'] for x in coords),max(x['lon'] for x in coords)
  if (north-south)*(east-west)>0.008:raise ValueError('Campus boundary covers excessive area; manual selection required')
  box=f'{south},{west},{north},{east}'
  q=f'[out:json][timeout:45];(way({box})[building];way({box})[highway];way({box})[natural=water];way({box})[landuse];way({box})[leisure];);out geom;'
  geom=request(q)
  if 'remark' in geom:raise ValueError(geom['remark'])
  p.write_text(json.dumps({'boundary':boundary,'geometry':geom,'source':f'https://www.openstreetmap.org/{e["type"]}/{e["id"]}','fetchedAt':'2026-09-06','license':'ODbL-1.0'},ensure_ascii=False))
  return code,f'{len(geom["elements"])} features'
 except Exception as ex:
  (OUT/(code+'.error.txt')).write_text(str(ex));return code,str(ex)[:100]
# Guarantee initial slice appears first, then use the same path for every candidate.
items=sorted(candidates.items(),key=lambda p:(p[0]!='10003',p[0]!='10001',p[0]))
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for code,state in pool.map(fetch,items):print(code,state,flush=True)
