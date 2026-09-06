"""Download ODbL campus geometry without asserting official verification.
Resumable; bounded two-request concurrency and timeout; failed responses are retained separately.
"""
import json,urllib.request,urllib.parse,pathlib,concurrent.futures,time,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'data/sources/campuses';OUT.mkdir(exist_ok=True)
candidates=json.load(open(ROOT/'data/candidates.json'))
def request(url):
 r=subprocess.run(['curl','-Ls','--fail','--retry','1','--retry-delay','2','--max-time','40',url],capture_output=True,check=True)
 return json.loads(r.stdout)
def with_geometry(raw):
 elements=raw.get('elements',[])
 nodes={e['id']:dict(lat=e['lat'],lon=e['lon']) for e in elements if e['type']=='node'}
 ways={e['id']:{**e,'geometry':[nodes[n] for n in e.get('nodes',[]) if n in nodes]} for e in elements if e['type']=='way'}
 result=[]
 for e in elements:
  if e['type']=='way':result.append(ways[e['id']])
  if e['type']=='relation':result.append({**e,'members':[{**m,'geometry':ways.get(m['ref'],{}).get('geometry',[])} for m in e.get('members',[])]})
 return {'elements':result}
def fetch(item):
 code,e=item;p=OUT/(code+'.json')
 source=f'https://www.openstreetmap.org/{e["type"]}/{e["id"]}'
 if p.exists():
  previous=json.loads(p.read_text())
  if previous.get('source')==source:
   (OUT/(code+'.error.txt')).unlink(missing_ok=True)
   return code,'cached'
 try:
  c=e.get('center',e);lat,lon=c['lat'],c['lon'];kind='rel' if e['type']=='relation' else 'way'
  # Query actual campus polygon and all nearby ways; importer clips to polygon, never box-fills.
  raw_boundary=request(f'https://api.openstreetmap.org/api/0.6/{e["type"]}/{e["id"]}/full.json')
  b=with_geometry(raw_boundary)
  boundary={'elements':[x for x in b['elements'] if x['id']==e['id'] and x['type']==e['type']]}
  if not boundary.get('elements'):raise ValueError('No campus boundary')
  first=boundary['elements'][0]
  coords=first.get('geometry',[])+[pt for m in first.get('members',[]) for pt in m.get('geometry',[])]
  if not coords:raise ValueError('Boundary has no geometry')
  south,north=min(x['lat'] for x in coords),max(x['lat'] for x in coords)
  west,east=min(x['lon'] for x in coords),max(x['lon'] for x in coords)
  if (north-south)*(east-west)>0.008:raise ValueError('Campus boundary covers excessive area; manual selection required')
  box=f'{west},{south},{east},{north}'
  geom=with_geometry(request(f'https://api.openstreetmap.org/api/0.6/map.json?bbox={box}'))
  geom['elements']=[x for x in geom['elements'] if any(k in x.get('tags',{}) for k in ['building','highway','natural','water','landuse','leisure'])]
  if 'remark' in geom:raise ValueError(geom['remark'])
  temporary=p.with_suffix('.json.tmp')
  temporary.write_text(json.dumps({'boundary':boundary,'geometry':geom,'source':source,'fetchedAt':'2026-09-06','license':'ODbL-1.0'},ensure_ascii=False))
  temporary.replace(p)
  (OUT/(code+'.error.txt')).unlink(missing_ok=True)
  return code,f'{len(geom["elements"])} features'
 except Exception as ex:
  (OUT/(code+'.error.txt')).write_text(str(ex));return code,str(ex)[:100]
# Guarantee initial slice appears first, then use the same path for every candidate.
items=sorted(candidates.items(),key=lambda p:(p[0]!='10003',p[0]!='10001',p[0]))
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for code,state in pool.map(fetch,items):print(code,state,flush=True)
