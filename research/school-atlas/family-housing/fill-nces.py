#!/usr/bin/env python3
"""Pin NCES current-location evidence and propose only unique exact-name/state ZIP matches."""
import concurrent.futures,difflib,json,re,urllib.parse,urllib.request
from pathlib import Path
HERE=Path(__file__).resolve().parent;rows=json.loads((HERE/'campus-mappings.json').read_text())
def norm(s):return re.sub('[^a-z0-9]','',s.lower()).replace('the','').replace('highschool','hs').replace('school','')
def getgroup(g):
 typ,state=g;base=f'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/{typ}_School_Locations_Current/FeatureServer/0'
 allrows=[];offset=0
 while True:
  params={'where':f"STATE = '{state}'",'outFields':'NAME,STREET,CITY,STATE,ZIP','returnGeometry':'false','f':'json','resultOffset':offset,'resultRecordCount':2000,'orderByFields':'OBJECTID'}
  url=base+'/query?'+urllib.parse.urlencode(params);p=HERE/f'sources/nces-{typ.lower()}-{state}-{offset}.json'
  if not p.exists():p.write_bytes(urllib.request.urlopen(url,timeout=45).read())
  d=json.loads(p.read_text());allrows.extend([r['attributes'] for r in d.get('features',[])])
  if not d.get('exceededTransferLimit'):break
  offset+=2000
 return g,(allrows,base)
groups={(('Private' if r['school_id'].startswith('private:') else 'Public'),r['state']) for r in rows if not r['zip_code']}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as p:data=dict(p.map(getgroup,groups))
proposals=[]
for r in rows:
 if r['zip_code']:continue
 g=('Private' if r['school_id'].startswith('private:') else 'Public',r['state']);candidates,base=data[g]
 matches=[c for c in candidates if norm(c['NAME'])==norm(r['school'])]
 near=sorted(candidates,key=lambda c:difflib.SequenceMatcher(None,norm(c['NAME']),norm(r['school'])).ratio(),reverse=True)[:3]
 if len(matches)==1:
  c=matches[0];r.update(zip_code=c['ZIP'],address=f"{c['STREET']}, {c['CITY']}, {c['STATE']} {c['ZIP']}",mapping_source_url=base,mapping_note='Unique exact normalized school-name/state match to NCES current school location directory (public 2024–25 / private 2023–24). Campus ZIP is a nearby rental proxy, not attendance-boundary eligibility or family residence.',nces_match=c)
 else:proposals.append({'school_id':r['school_id'],'school':r['school'],'candidates':near})
(HERE/'campus-mappings.json').write_text(json.dumps(rows,indent=2)+'\n');(HERE/'nces-review.json').write_text(json.dumps(proposals,indent=2)+'\n')
print('remaining',len(proposals));print(json.dumps(proposals,indent=2))
reviewed=json.loads((HERE/'reviewed-nces-matches.json').read_text())
for m in reviewed:
 r=next(r for r in rows if r['school_id']==m['school_id']);c=m['nces_location'];typ='Private' if r['school_id'].startswith('private:') else 'Public'
 r.update(zip_code=c['ZIP'],address=f"{c['STREET']}, {c['CITY']}, {c['STATE']} {c['ZIP']}",mapping_source_url=f'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services/{typ}_School_Locations_Current/FeatureServer/0',mapping_note=m['review_note']+' NCES current school-location directory (public 2024–25 / private 2023–24). Campus ZIP is a nearby rental proxy; no attendance-boundary eligibility implied.',nces_match=c)
(HERE/'campus-mappings.json').write_text(json.dumps(rows,indent=2)+'\n')
for i,m in enumerate(json.loads((HERE/'reviewed-official-matches.json').read_text())):
 r=next(r for r in rows if r['school_id']==m['school_id']);r.update(m);r['mapping_note']='Reviewed current campus postal address on official school website. Campus ZIP is a nearby rental proxy, not family residence or attendance-boundary eligibility.'
 p=HERE/f'sources/official-address-{i+1}.html'
 try:
  if not p.exists():p.write_bytes(urllib.request.urlopen(m['mapping_source_url'],timeout=35).read())
 except Exception:pass
 if p.exists():r['mapping_snapshot_path']=str(p.relative_to(HERE.parents[1]))
(HERE/'campus-mappings.json').write_text(json.dumps(rows,indent=2)+'\n')
