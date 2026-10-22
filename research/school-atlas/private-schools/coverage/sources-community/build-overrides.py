#!/usr/bin/env python3
"""Rebuild reviewed private-campus community overrides from pinned primary-source snapshots."""
import csv,hashlib,importlib.util,io,json,zipfile
from pathlib import Path
HERE=Path(__file__).resolve().parent; ROOT=HERE.parents[4]
spec=importlib.util.spec_from_file_location('community',ROOT/'research/school-atlas/admission-options/build-public-options.py');c=importlib.util.module_from_spec(spec);spec.loader.exec_module(c)
mappings=json.loads((HERE/'mappings.json').read_text())
metro_by_county={}
for r in c.xlsx_rows(ROOT/'research/school-atlas/list1_2023.xlsx'):
 if r.get('E')=='Metropolitan Statistical Area':metro_by_county[r['J']+r['K']]=(r['A'],r['D'])
with zipfile.ZipFile(HERE/'SARPP.zip') as z: state_rows=list(csv.DictReader(io.StringIO(z.read('SARPP_STATE_2008_2024.csv').decode()),skipinitialspace=True))
state_prices={r['GeoFIPS']:float(r['2024']) for r in state_rows if r['LineCode']=='1'}
state_housing={r['GeoFIPS']:float(r['2024']) for r in state_rows if r['LineCode']=='3'}
schools={}; sources=[]
def source(path,url):
 sources.append({'path':str(path.relative_to(ROOT)),'source_url':url,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
for m in mappings:
 kind,g=m['kind'],m['geoid'];url=f'https://api.livabilityindex.aarp.org/api/features/{kind}/{g}/scores';path=HERE/f'aarp-{kind}-{g}.json';d=json.loads(path.read_text())
 assert d['geoid']==g and d['featureType']==kind
 result=[x for x in d['result'] if isinstance(x,dict) and x.get('ver')=='2025' and x.get('featureType')==kind and 'scores' in x];assert len(result)==1
 scores=result[0]['scores'];row={k:float(scores[v]) for k,v in c.score_keys.items()};assert all(0<=v<=100 for v in row.values())
 mean=sum(row[k] for k in list(c.score_keys)[:6])/6
 row.update(community=m['community'],community_geography_type=kind,community_geoid=g,quality_of_life_proxy=mean,quality_of_life_display=round(mean,1),aarp_edition='2025',aarp_overall_for_reference=None,community_source_url=f'https://livabilityindex.aarp.org/search?geoid={g}',community_api_url=url,community_mapping_note=m['note']+'Six-category arithmetic mean uses rounded AARP 2025 scores; opportunity is excluded. Locality is a community proxy, not an attendance boundary, admission guarantee, or family residence.',community_evidence_urls=m['evidence_urls'],locality_override=True)
 metro=metro_by_county.get(m['county']); basis='metro' if metro and metro[0] in c.prices else 'state';code,name=metro if basis=='metro' else (m['county'][:2]+'000',{'09':'Connecticut','25':'Massachusetts','33':'New Hampshire','35':'New Mexico','51':'Virginia'}[m['county'][:2]])
 price=c.prices[code] if basis=='metro' else state_prices[code];house=c.housing.get(code) if basis=='metro' else state_housing.get(code)
 cost=dict(price_index=price,housing_price_index=house,metro_code=code if basis=='metro' else '',metro_name=name if basis=='metro' else '',price_basis=basis,price_geoid=code,price_geography=name,year=2024,source_url=c.BEA_URL if basis=='metro' else 'https://apps.bea.gov/regional/zip/SARPP.zip',mapping_source_url='https://geocoding.geo.census.gov/geocoder/',county_metro_source_url=c.METRO_URL,mapping_note=('Verified campus county-equivalent '+m['county']+' joins directly to July 2023 Census metropolitan delineation; 2024 BEA all-items RPP.' if basis=='metro' else 'Verified campus county '+m['county']+' has no metropolitan-area entry in July 2023 Census delineation. Explicit broad state RPP fallback: '+name+' 2024 BEA all-items; this is not a local or nonmetropolitan-only price estimate.'),county_geoid=m['county'])
 row['cost']=cost; row['price_basis']=basis;schools[m['school_id']]=row
 source(path,url)
 school_path=HERE/f"school-{m['rank']:03}.html"
 if school_path.exists():source(school_path,m.get('school_snapshot_url',m['school_url']))
 geo_path=HERE/f"census-address-{m['rank']:03}.json"
 if geo_path.exists():
  gd=json.loads(geo_path.read_text());matches=gd['result']['addressMatches']
  if matches:assert len(matches)==1 and matches[0]['geographies']['Counties'][0]['GEOID']==m['county'],m['rank']
  source(geo_path,'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?'+__import__('urllib.parse',fromlist=['urlencode']).urlencode({'address':m['address'],'benchmark':'Public_AR_Current','vintage':'Current_Current','format':'json'}))
 source(path,url)
for path,url in [(ROOT/'research/school-atlas/list1_2023.xlsx',c.METRO_URL),(ROOT/'research/school-atlas/MARPP.zip',c.BEA_URL),(HERE/'SARPP.zip','https://apps.bea.gov/regional/zip/SARPP.zip'),(ROOT/'research/school-atlas/2025_Gaz_cousubs_national.zip','https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cousubs_national.zip'),(ROOT/'research/school-atlas/national_place2020.txt',c.PLACE_URL)]:source(path,url)
for filename,url in [('census-address-105-legacy.json','https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=300+East+Seminary+Street%2C+Mercersburg%2C+PA+17236&benchmark=Public_AR_Current&vintage=Current_Current&format=json'),('school-101-directions.html','https://summer.gds.org/directions/'),('madison-county-planning-2022.pdf','https://mccmeetings.blob.core.usgovcloudapi.net/madcova-pubu/MEET-Packet-32aba4a68805400d8ecbddcb51da5506.pdf')]:
 if (HERE/filename).exists():source(HERE/filename,url)
for evidence in json.loads((HERE/'official-location-readback.json').read_text())['evidence']:
 source(HERE/'official-location-readback.json',evidence['url'])
sources=list({(s['path'],s['source_url']):s for s in sources}.values())
out={'checked_on':'2026-10-20','methodology':'Reviewed campus locality/borough/county proxies; current Census address geography and 2025 county subdivisions; AARP 2025 six-category mean; 2024 BEA metro RPP or explicitly labeled state fallback. County and broad municipal scores do not measure campus-neighborhood conditions.','schools':schools,'summary':{'schools':len(schools),'livability_available':len(schools),'price_available':len(schools),'price_basis_counts':{k:sum(s['price_basis']==k for s in schools.values()) for k in ['metro','state']},'geography_type_counts':{k:sum(s['community_geography_type']==k for s in schools.values()) for k in ['local','subdiv','county']}},'sources':sources}
(HERE.parent/'community-overrides.json').write_text(json.dumps(out,indent=2,ensure_ascii=False)+'\n');print(json.dumps(out['summary']))
