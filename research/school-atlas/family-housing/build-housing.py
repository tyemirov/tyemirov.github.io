#!/usr/bin/env python3
"""Reproduce school-level FY2027 HUD ZIP rent benchmarks from pinned inputs (stdlib only)."""
import collections,hashlib,json,xml.etree.ElementTree as E,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
URL='https://www.huduser.gov/portal/datasets/fmr/fmr2027/FY27_safmrs.xlsx'
NS={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
def workbook(path):
 with zipfile.ZipFile(path) as z:
  strings=[''.join(n.itertext()) for n in E.fromstring(z.read('xl/sharedStrings.xml'))]
  for r in E.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//m:row',NS):
   out={}
   for c in r:
    v=c.find('m:v',NS)
    if v is not None:out[''.join(x for x in c.get('r') if x.isalpha())]=strings[int(v.text)] if c.get('t')=='s' else v.text
   yield out
rows=list(workbook(HERE/'sources/FY27_safmrs.xlsx'));assert rows[0]['M']=='SAFMR\n3BR'
byzip=collections.defaultdict(list)
for r in rows[1:]:
 if r.get('A') and r.get('M'):byzip[r['A'].zfill(5)].append(r)
mappings=json.loads((HERE/'campus-mappings.json').read_text());assert len(mappings)==300
out={};gaps=[]
for m in mappings:
 z=m.get('zip_code');matches=byzip.get(z,[]);r=matches[0] if len({x['M'] for x in matches})==1 else None
 item={'monthly_rent_usd':int(float(r['M'])) if r else None,'bedrooms':3,'geography_name':f'Campus ZIP {z}' if z else 'Campus ZIP unresolved','geography_type':'zip' if z else None,'zip_code':z,'year':2027,'effective_date':'2026-10-01','source_url':URL,'mapping_source_url':m['mapping_source_url'],'mapping_note':m['mapping_note'],'estimate_kind':'hud_small_area_fair_market_rent' if r else 'missing','gross_rent_includes_utilities':True}
 if r:
  item['hud_area_names']=sorted({x['C'] for x in matches});item['hud_area_codes']=sorted({x['B'] for x in matches})
  item['hud_area_name']=' / '.join(item['hud_area_names']);item['hud_area_code']=item['hud_area_codes'][0] if len(item['hud_area_codes'])==1 else None
  item['hud_zip_rows']=len(matches)
 else:gaps.append({'school_id':m['school_id'],'school':m['school'],'zip_code':z,'reason':'ZIP not present or ambiguous in HUD FY2027 SAFMR workbook' if z else 'Campus ZIP unresolved'})
 item['mapping_supporting_source_urls']=list(dict.fromkeys([u for u in [m.get('mapping_source_url'),m.get('geocoder_source_url')] if u]))
 out[m['school_id']]=item
assert len(out)==300
def jsrows(name):return json.loads((OUTPUT/name).read_text().removeprefix('export default ').strip().removesuffix(';'))['schools']
expected={x.get('school_id') or f"public:{x['national_rank']}" for name in ['school-data.js','public-options-data.js','private-school-data.js'] for x in jsrows(name)}
assert set(out)==expected,'Housing IDs must exactly match the displayed school catalog'
sources=[]
for p in [HERE/'sources/FY27_safmrs.xlsx',HERE/'campus-mappings.json']:
 sources.append({'path':str(Path('school-atlas') / p.relative_to(OUTPUT)) if p.is_relative_to(OUTPUT) else str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()})
payload={'bedrooms':3,'year':2027,'source_url':URL,'source_title':'HUD FY2027 Small Area Fair Market Rents','retrieved_on':'2026-10-20','methodology':'HUD ZIP-specific 3-bedroom gross-rent benchmark near each campus, not an advertised detached-home quote, attendance-boundary validation, actual family residence, or guaranteed available home. Includes tenant-paid utilities except telephone/internet. No metro or state rent substitution. Missing campus ZIPs or absent HUD ZIPs remain null.','schools':out,'summary':{'schools':300,'rent_available':sum(r['monthly_rent_usd'] is not None for r in out.values()),'missing':len(gaps)},'sources':sources}
(OUTPUT/'family-housing.js').write_text('export default '+json.dumps(payload,ensure_ascii=False)+';\n')
(HERE/'source-manifest.json').write_text(json.dumps([{'path':str(Path('school-atlas') / p.relative_to(OUTPUT)) if p.is_relative_to(OUTPUT) else str(p.relative_to(ROOT)),'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted((HERE/'sources').glob('*')) if p.is_file() and p.stat().st_size],indent=2)+'\n')
(HERE/'housing-data.json').write_text(json.dumps(payload,indent=2)+'\n');(HERE/'gap-report.json').write_text(json.dumps(gaps,indent=2)+'\n')
print(json.dumps(payload['summary']))
for sid in ['private:regis-high-school-new-york-ny','private:st-andrews-school-middletown-de']:print(sid,out[sid])
