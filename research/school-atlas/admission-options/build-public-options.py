#!/usr/bin/env python3
"""Rebuild the first100 audited restricted-public schools in national-rank order.

Community joins use exact listed-city/state matches only. Cities are locality proxies,
not campus boundaries, catchments, eligibility guarantees, or family budgets.
"""
import csv, io, json, re, unicodedata, urllib.request, concurrent.futures, zipfile, hashlib
from pathlib import Path
import xml.etree.ElementTree as ET
ROOT=Path(__file__).resolve().parents[3]
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
HERE=Path(__file__).resolve().parent
SNAP=HERE/'aarp-snapshots'; SNAP.mkdir(exist_ok=True)
DATE='2026-10-20'
FROZEN = json.loads((ROOT/'research/school-atlas/frozen-payloads.json').read_text())
RETRIEVED = {row['national_rank']: row['retrieved_utc'] for row in FROZEN['public-options-data.js']['schools']}
PLACE_URL='https://www2.census.gov/geo/docs/reference/codes2020/national_place2020.txt'
METRO_URL='https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx'
BEA_URL='https://apps.bea.gov/regional/zip/MARPP.zip'
def js_payload(path): return json.loads(path.read_text().removeprefix('export default ').strip().removesuffix(';'))
def norm(s):
 return re.sub(r'\s+',' ',unicodedata.normalize('NFKD',s).encode('ascii','ignore').decode().lower()).strip()
def place_name(s): return re.sub(r' (city|town|village|borough|municipality|cdp|zona urbana|comunidad)$','',norm(s))
resident=js_payload(OUTPUT/'school-data.js')['schools']
costs=js_payload(OUTPUT/'cost-data.js')['schools']
places=list(csv.DictReader((ROOT/'research/school-atlas/national_place2020.txt').open(),delimiter='|'))
place_index={}
for p in places: place_index.setdefault((p['STATE'],place_name(p['PLACENAME'])),[]).append(p)
existing={}
for r in resident: existing.setdefault((r['state'],norm(r['school_listed_city'])),[]).append(r)

def xlsx_rows(path):
 ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
 with zipfile.ZipFile(path) as z:
  strings=[''.join(t.itertext()) for t in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
  for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row',ns):
   values={}
   for c in row:
    v=c.find('s:v',ns)
    if v is not None: values[''.join(x for x in c.attrib['r'] if x.isalpha())]=strings[int(v.text)] if c.attrib.get('t')=='s' else v.text
   yield values
metro_by_county={}
for row in xlsx_rows(ROOT/'research/school-atlas/list1_2023.xlsx'):
 if row.get('E')=='Metropolitan Statistical Area': metro_by_county[(row['J'],row['H'])]=(row['A'],row['D'])
with zipfile.ZipFile(ROOT/'research/school-atlas/MARPP.zip') as z:
 price_rows=list(csv.DictReader(io.StringIO(z.read('MARPP_MSA_2008_2024.csv').decode()),skipinitialspace=True))
prices={r['GeoFIPS']:float(r['2024']) for r in price_rows if r['LineCode']=='1' and r['2024'].strip().replace('.','',1).isdigit()}
housing={r['GeoFIPS']:float(r['2024']) for r in price_rows if r['LineCode']=='3' and r['2024'].strip().replace('.','',1).isdigit()}
community_keys=['community','community_geography_type','community_geoid','quality_of_life_proxy','quality_of_life_display','aarp_housing','aarp_neighborhood','aarp_transportation','aarp_environment','aarp_health','aarp_engagement','aarp_opportunity_excluded','aarp_overall_for_reference','aarp_edition','community_source_url','community_api_url','community_mapping_note']
score_keys={'aarp_housing':'score_house','aarp_neighborhood':'score_prox','aarp_transportation':'score_trans','aarp_environment':'score_env','aarp_health':'score_health','aarp_engagement':'score_engage','aarp_opportunity_excluded':'score_opp'}
def place_cost(p):
 counties=[c.strip() for c in p['COUNTIES'].split('~~~')]
 metros=[metro_by_county.get((p['STATEFP'],c)) for c in counties]
 metro=metros[0] if metros and all(m is not None and m==metros[0] for m in metros) else None
 code,name=metro if metro else ('','')
 return {'price_index':prices.get(code),'housing_price_index':housing.get(code),'metro_code':code,'metro_name':name,'mapping_source_url':PLACE_URL,'mapping_note':'Exact Census place counties all map to the same July 2023 metropolitan area.' if metro else 'No single verified metropolitan area for this Census place; metro price index unavailable.','year':2024,'source_url':BEA_URL,'county_metro_source_url':METRO_URL}
def enrich_community(city,state):
 out={k:None for k in community_keys};out['community']=city;out['cost']=None
 matches=[r for r in existing.get((state,norm(city)),[]) if not r.get('locality_override') and r.get('community_geography_type') != 'county' and place_name(r.get('community') or '') == norm(city)]
 # Reuse only a unique geographic interpretation of an exact listed city/state.
 if matches and len({(r['community_geography_type'],r['community_geoid']) for r in matches})==1:
  r=matches[0];out.update({k:r.get(k) for k in community_keys});out['cost']=dict(costs[str(r['national_rank'])]);out['community_mapping_note']='Exact listed city/state and actual community name match an existing verified non-override community mapping. City/community is a locality proxy; it does not identify campus attendance boundaries or admission eligibility. '+str(r.get('community_mapping_note',''))
  return out
 matches=place_index.get((state,norm(city)),[])
 if len(matches)!=1:
  out['community_mapping_note']=f'No unique exact Census place match for listed city/state ({len(matches)} matches); metrics unavailable. Listed city is a locality label, not an attendance boundary.'
  return out
 p=matches[0];geoid=p['STATEFP']+p['PLACEFP'];url=f'https://api.livabilityindex.aarp.org/api/features/local/{geoid}/scores'
 out.update(community=p['PLACENAME'],community_geography_type='local',community_geoid=geoid,community_source_url=f'https://livabilityindex.aarp.org/search?geoid={geoid}',community_api_url=url,cost=place_cost(p))
 note='Unique exact listed-city/state match to Census 2020 place name (geographic suffix normalized). City is a locality proxy, not the campus attendance boundary or admission eligibility. '
 path=SNAP/(geoid+'.json')
 try:
  if path.exists(): data=json.loads(path.read_text())
  else:
   raise FileNotFoundError(f'Frozen AARP snapshot missing: {path}')
  assert data.get('geoid')==geoid and data.get('featureType')=='local','API geography mismatch'
  rows=[x for x in data.get('result',[]) if str(x.get('ver'))=='2025' and x.get('featureType')=='local']
  assert len(rows)==1,'No unique 2025 result'
  scores=rows[0]['scores']
  for dest,key in score_keys.items():
   value=scores.get(key);out[dest]=float(value) if isinstance(value,(int,float)) and 0<=value<=100 else None
  six=[out[k] for k in list(score_keys)[:6]]
  if all(v is not None for v in six): out['quality_of_life_proxy']=sum(six)/6;out['quality_of_life_display']=round(sum(six)/6,1)
  out['aarp_edition']='2025';note+='Six-category mean uses the API\'s rounded 2025 category scores; opportunity is excluded.'
 except Exception as e: note+=f'AARP 2025 metrics unavailable: {type(e).__name__}: {e}'
 out['community_mapping_note']=note
 return out

def main():
 candidates={r['national_rank']:r for r in json.loads((ROOT/'research/school-atlas/admissions-audit/ranking-source/candidates-1-500.json').read_text())}
 audit=json.loads((OUTPUT/'admissions-audit.json').read_text())
 assert {r['national_rank'] for r in audit['schools']}==set(range(1,354))
 excluded=sorted((r for r in audit['schools'] if r['status']=='excluded'),key=lambda r:r['national_rank'])
 assert len(excluded)==253
 # Rank selection precedes enrichment; unavailable metrics never change membership.
 rows=excluded[:100]
 assert len(rows)==100
 unique=sorted({(candidates[r['national_rank']]['city'],r['state']) for r in rows})
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  enriched=dict(zip(unique,pool.map(lambda pair:enrich_community(*pair),unique)))
 schools=[]
 for order,r in enumerate(rows,1):
  c=candidates[r['national_rank']];out={k:None for k in resident[0]};out.update(enriched[(c['city'],r['state'])])
  out.update(national_rank=r['national_rank'],school=r['school'],school_listed_city=c['city'],state=r['state'],ranking_edition='2026-2027',education_data_school_year=None,ranking_publisher_url=c['ranking_publisher_url'],ranking_transcription_url=c['ranking_display_source_url'],ranking_profile_url=c['profile_url'],ranking_primary_confirmation_urls=r.get('rank_primary_source_url') or '',ranking_verification='Secondary U.S. News republication; see admission audit for primary confirmations',admissions_status='lottery_or_selective',admission_category='lottery_or_selective',school_type='public',school_id=f"public:{r['national_rank']}",id=f"public:{r['national_rank']}",admissions_source_url=r['admissions_source_urls'][0],admissions_supporting_urls=r['admissions_source_urls'][1:],admissions_evidence=r['evidence_summary'],admissions_note=r['reason']+'. '+r.get('caveats',''),admissions_verified_on=audit['checked_on'],eligible_cohort_order=None,restricted_cohort_order=order,locality_override=False,retrieved_utc=RETRIEVED[r['national_rank']])
  schools.append(out)
 result={'schools':schools,'summary':{'count':len(schools),'scope':'First 100 lottery/selection public schools in audited national-rank order, excluding resident-entry schools. Original U.S. News ranks preserved; admission-filtered category defined by School Atlas.','screened_public_ranks':353,'eligible_catalog_size':len(excluded),'national_rank_cutoff':rows[-1]['national_rank'],'next_eligible_national_rank':excluded[100]['national_rank'],'admissions_category':'lottery_or_selective','category_note':'Combined category preserves the audit decision without guessing an exclusive lottery-versus-selection classification.','ranking_provenance':audit['ranking_provenance'],'aarp_note':'Existing exact-city mappings retain their source precision; new unique Census place matches use rounded 2025 API categories.','checked_on':DATE}}
 (OUTPUT/'public-options-data.js').write_text('export default '+json.dumps(result,ensure_ascii=False,separators=(',',':'))+';\n')
 report={'count':len(schools),'unique_cities':len(unique),'with_livability':sum(s['quality_of_life_proxy'] is not None for s in schools),'with_price':sum(s.get('cost') is not None and s['cost'].get('price_index') is not None for s in schools),'with_both':sum(s['quality_of_life_proxy'] is not None and s.get('cost') is not None and s['cost'].get('price_index') is not None for s in schools),'unavailable':[{'rank':s['national_rank'],'city':s['school_listed_city'],'state':s['state'],'note':s['community_mapping_note']} for s in schools if s['quality_of_life_proxy'] is None]}
 (HERE/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
 manifest={'checked_on':DATE,'aarp_snapshots':[{'path':str(Path('school-atlas') / p.relative_to(OUTPUT)) if p.is_relative_to(OUTPUT) else str(p.relative_to(ROOT)),'url':f'https://api.livabilityindex.aarp.org/api/features/local/{p.stem}/scores','sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(SNAP.glob('*.json'))],'shared_inputs':[{'path':str(Path('school-atlas') / p.relative_to(OUTPUT)) if p.is_relative_to(OUTPUT) else str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [OUTPUT/'school-data.js',OUTPUT/'cost-data.js',ROOT/'research/school-atlas/national_place2020.txt',ROOT/'research/school-atlas/list1_2023.xlsx',ROOT/'research/school-atlas/MARPP.zip',OUTPUT/'admissions-audit.json',ROOT/'research/school-atlas/admissions-audit/ranking-source/candidates-1-500.json']]}
 (HERE/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({k:v for k,v in report.items() if k!='unavailable'}))
 assert len({s['school_id'] for s in schools})==100
 assert [s['national_rank'] for s in schools]==[r['national_rank'] for r in excluded[:100]]
 assert not {s['national_rank'] for s in schools}&{s['national_rank'] for s in resident}
 assert len({s['national_rank'] for s in schools}|{s['national_rank'] for s in resident})==200
if __name__=='__main__': main()
