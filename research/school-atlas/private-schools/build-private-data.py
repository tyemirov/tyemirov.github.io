#!/usr/bin/env python3
"""Normalize the complete source-ranked private100; missing metrics never remove rows."""
import importlib.util,json,concurrent.futures,hashlib
from pathlib import Path
HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
import os
OUTPUT = Path(os.environ.get('SCHOOL_ATLAS_OUTPUT_ROOT', ROOT / 'school-atlas')).resolve()
spec=importlib.util.spec_from_file_location('community',ROOT/'research/school-atlas/admission-options/build-public-options.py')
community=importlib.util.module_from_spec(spec);spec.loader.exec_module(community)
source=json.loads((HERE/'niche-2027-candidates.json').read_text())
candidates=source['schools']
assert [r['private_rank'] for r in candidates]==list(range(1,108))
records=[r for r in candidates if r['delivery_mode']=='campus'][:100]
assert len(records)==100 and records[-1]['private_rank']==107
coverage=HERE/'coverage'
community_overrides=json.loads((coverage/'community-overrides.json').read_text())['schools']
cost_overrides=json.loads((coverage/'cost-overrides.json').read_text())['schools']
tuition_path=HERE/'tuition.json'
tuition=json.loads(tuition_path.read_text()) if tuition_path.exists() else {}
if 'schools' in tuition: tuition={r['school_id']:r for r in tuition['schools']}
pairs=sorted({(r['city'],r['state']) for r in records if r['city'] and r['delivery_mode']=='campus'})
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 enriched=dict(zip(pairs,pool.map(lambda pair:community.enrich_community(*pair),pairs)))
rows=[]
for order,r in enumerate(records,1):
 row={k:None for k in community.resident[0]}
 if r['city'] and r['delivery_mode']=='campus': row.update(enriched[(r['city'],r['state'])])
 else: row.update(community=None,community_mapping_note='Online school: the listed administrative location does not establish where a student lives. Community livability and regional price comparisons are unavailable.',cost=None)
 row.update(school_id=r['school_id'],school_type='private',school=r['school_name'],school_listed_city=r['city'] or 'Online',state=r['state'],private_rank=r['private_rank'],national_rank=None,delivery_mode=r['delivery_mode'],residential_entry=False,admission_category='private',ranking_edition=r['ranking_edition'],ranking_publisher_url=r['ranking_source_url'],ranking_transcription_url=r['ranking_source_url'],ranking_profile_url=r['profile_url'],ranking_primary_confirmation_urls='',admissions_evidence='Private-school entry requires a separate application. Consult the school for its current admission criteria, deadlines, available seats and financial aid; this catalog does not certify nonselective entry.',admissions_note='Published day or boarding tuition and known required annual fees are included in the modeled value score before financial aid. '+('Online delivery; no campus-community proxy assigned.' if r['delivery_mode']=='online' else 'Listed locality is a community proxy, not an attendance boundary or admission guarantee.'),admissions_source_url=r['profile_url'],admissions_supporting_urls=[],tuition_usd=None,tuition_note='Current day tuition is unverified. Check the school’s published tuition and financial aid.',tuition_source_url=None,locality_override=False)
 if r['school_id'] in tuition: row.update({k:v for k,v in tuition[r['school_id']].items() if k in ['tuition_usd','tuition_note','tuition_source_url','tuition_year','tuition_status','tuition_basis','tuition_source_title','tuition_verified_on','mandatory_annual_fees_usd','mandatory_household_annual_fees_usd','fees_complete','required_fee_total_unresolved','fees_note','nonrecurring_fees_note','boarding_tuition_usd','grade_basis','tuition_supporting_source_urls']})
 row['private_cohort_order']=order
 row.update(community_overrides.get(r['school_id'],{}))
 row.update(cost_overrides.get(r['school_id'],{}))
 row.setdefault('cost_basis','day')
 row.setdefault('tuition_supporting_source_urls',[])
 rows.append(row)
result={'ranking_edition':'2027','ranking_title':'First 100 campus private schools by Niche rank','ranking_methodology_url':source['ranking_methodology_url'],'schools':rows,'limitations':source['limitations']}
(OUTPUT/'private-school-data.js').write_text('export default '+json.dumps(result,ensure_ascii=False)+';\n')
report={'schools':len(rows),'livability_available':sum(r['quality_of_life_proxy'] is not None for r in rows),'community_and_prices_available':sum(r['quality_of_life_proxy'] is not None and r.get('cost',{} ) and r['cost'].get('price_index') is not None for r in rows if r.get('cost')),'online_schools':sum(r['delivery_mode']=='online' for r in rows),'tuition_verified':sum(r['tuition_status']=='verified' for r in rows),'tuition_publisher_reported':sum(r['tuition_status']=='publisher_reported' for r in rows)}
(HERE/'build-report.json').write_text(json.dumps(report,indent=2)+'\n')
print(report)

manifest=[]
for r in rows:
 geoid=r.get('community_geoid'); snapshot=ROOT/'research/school-atlas/admission-options/aarp-snapshots'/f'{geoid}.json'
 if geoid and snapshot.exists(): manifest.append({'source_url':r.get('community_api_url'),'snapshot':str(snapshot.relative_to(ROOT)),'sha256':hashlib.sha256(snapshot.read_bytes()).hexdigest()})
(HERE/'community-source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
