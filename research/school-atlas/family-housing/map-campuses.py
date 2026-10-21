#!/usr/bin/env python3
"""Pin campus address and Census ZIP evidence. Network runs are resumable snapshots."""
import concurrent.futures,html,json,re,urllib.request,urllib.parse
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent;S=HERE/'sources';S.mkdir(exist_ok=True)
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
def loadjs(p):return json.loads(p.read_text().removeprefix('export default ').strip().removesuffix(';'))
def get(url,p):
 if p.exists() and p.stat().st_size:return p.read_bytes()
 try:
  req=urllib.request.Request(url,headers={'User-Agent':'SchoolAtlas research contact local dataset audit'})
  with urllib.request.urlopen(req,timeout=35) as r:b=r.read()
  if b:p.write_bytes(b)
  return b
 except Exception:return b''
private=loadjs(OUTPUT/'private-school-data.js')['schools'];local=loadjs(OUTPUT/'school-data.js')['schools'] if (OUTPUT/'school-data.js').exists() else []
print('local',len(local))
restricted=loadjs(OUTPUT/'public-options-data.js')['schools'];catalog=local+restricted+private
candidates={r['national_rank']:r for r in json.loads((ROOT/'research/school-atlas/admissions-audit/ranking-source/candidates-1-500.json').read_text())}
existing=ROOT/'research/school-atlas/private-schools/coverage/sources-community';maps={r['school_id']:r for r in json.loads((existing/'mappings.json').read_text())}
def work(s):
 sid=s.get('school_id') or f"public:{s['national_rank']}";state=s['state'];rank=s.get('private_rank') or s['national_rank'];item={'school_id':sid,'school':s['school'],'state':state,'zip_code':None}
 if sid.startswith('public:'):
  c=candidates[rank];address=', '.join(filter(None,[c.get('address_street'),c['city'],state]));source=c['profile_url'];item.update(address=address,mapping_source_url=source,mapping_note='Publisher-transcribed campus street address; Census geocoder ZIP. School ZIP is a nearby rental proxy, not proof of attendance-zone eligibility.')
  if not c.get('address_street'):item['mapping_note']='No campus street address in pinned ranking snapshot.';return item
 else:
  m=maps.get(sid);source=s.get('tuition_source_url') or s['ranking_profile_url'];address=m['address'] if m else None
  if m:
   source=m['school_url'];match=re.search(r'\b'+state+r'\s+(\d{5})',address)
   if match:item['zip_code']=match[1]
  if not address:
   path=S/f'private-{rank:03}.html';b=get(source,path);t=html.unescape(re.sub('<[^>]+>',' ',b.decode(errors='ignore')));t=re.sub(r'\s+',' ',t)
   zipmatches=list(dict.fromkeys(re.findall(r'\b'+state+r'\s*,?\s+(\d{5})(?:-\d{4})?\b',t)))
   # Require exactly one state-matching ZIP to avoid silently choosing among campuses.
   if len(zipmatches)==1:item['zip_code']=zipmatches[0];address=f"{s['school_listed_city']}, {state} {zipmatches[0]}"
   item['mapping_snapshot_path']=str(path.relative_to(ROOT)) if path.exists() else None
  item.update(address=address,mapping_source_url=source,mapping_note='Official school address ZIP, a nearby rental proxy rather than family residence or attendance eligibility.' if item['zip_code'] else 'Campus ZIP unresolved: no unique state-matching postal address in official school snapshot.')
  if item['zip_code']:return item
  if not address:return item
 url='https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?'+urllib.parse.urlencode({'address':address,'benchmark':'Public_AR_Current','format':'json'})
 path=S/f"geocoder-{sid.replace(':','-')}.json";b=get(url,path)
 try:
  d=json.loads(b);matches=d['result']['addressMatches']
  if len(matches)==1 and matches[0]['addressComponents'].get('state')==state:
   item['zip_code']=matches[0]['addressComponents'].get('zip');item['matched_address']=matches[0]['matchedAddress']
 except Exception:pass
 item['geocoder_source_url']=url;item['geocoder_snapshot_path']=str(path.relative_to(ROOT)) if path.exists() else None
 return item
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:rows=list(pool.map(work,catalog))
(HERE/'campus-mappings.json').write_text(json.dumps(rows,indent=2)+'\n')
print('total',len(rows),'ZIP',sum(bool(r['zip_code']) for r in rows));print('missing',[(r['school'],r['state']) for r in rows if not r['zip_code']])
