#!/usr/bin/env python3
"""Normalize 100 audited official tuition decisions; never substitute boarding rates."""
import json,re
from pathlib import Path
HERE=Path(__file__).resolve().parent
expected={r['private_rank']:r for r in json.loads((HERE/'niche-2027-top100.json').read_text())['schools']}
rows=[]
for path in sorted((HERE/'tuition-audit').glob('batch-*.json')):
 data=json.loads(path.read_text());raw=data if isinstance(data,list) else data.get('schools',data.get('rows'))
 for r in raw:
  rank=r['private_rank'];assert r['school_id']==expected[rank]['school_id']
  year=r.get('tuition_year')
  if year and re.fullmatch(r'20\d\d-\d\d',year):year=year[:5]+'20'+year[-2:]
  if year and not re.fullmatch(r'20\d\d-20\d\d',year):year=None
  row={'school_id':r['school_id'],'private_rank':rank,'tuition_status':r['status'],'tuition_usd':r.get('tuition_usd'),'tuition_year':year,'tuition_basis':r.get('tuition_basis',r.get('basis')),'tuition_source_url':r.get('tuition_source_url',r.get('source_url')),'tuition_source_title':r.get('source_title',r.get('title')),'tuition_verified_on':r.get('retrieved_on',r.get('verified_on')),'tuition_note':r.get('evidence_summary') or r.get('tuition_year_note') or r.get('fees_note'),'mandatory_annual_fees_usd':r.get('mandatory_recurring_fees_usd'),'fees_complete':r.get('fees_complete',False),'required_fee_total_unresolved':r.get('required_fee_total_unresolved',False),'fees_note':r.get('fees_note'),'nonrecurring_fees_note':r.get('nonrecurring_fees_note'),'boarding_tuition_usd':r.get('boarding_tuition_usd'),'grade_basis':r.get('grade_basis') or 'Highest high-school grade where prices differ','tuition_supporting_source_urls':[r['supporting_source_url']] if r.get('supporting_source_url') else [],'source_audit_file':str(path.relative_to(HERE))}
  # Final-year comparison includes compulsory senior/year-specific fees, as do Year13 exam fees.
  if rank==4:
   row['mandatory_annual_fees_usd']=525;row['fees_note']+=' Model includes the $525 Fifth Form fee for the final-year comparison.'
  if rank==63:
   row['mandatory_annual_fees_usd']=1800+1250;row['grade_basis']='12';row['fees_note']+=' Model includes the $1,250 senior fee for the final-year comparison.'
  row['mandatory_household_annual_fees_usd']=0
  if rank in (26,87):
   household=50 if rank==26 else 65
   row['mandatory_annual_fees_usd']-=household
   row['mandatory_household_annual_fees_usd']=household
   row['fees_note']+=' Family-level dues are added once per household; remaining modeled charges are per student.'
  assert row['tuition_source_url'] and row['tuition_basis']
  if row['tuition_status']=='verified':assert isinstance(row['tuition_usd'],(int,float)) and row['tuition_usd']>=0
  else:assert row['tuition_usd'] is None
  rows.append(row)
assert len(rows)==100 and sorted(r['private_rank'] for r in rows)==list(range(1,101))
rows.sort(key=lambda r:r['private_rank'])
result={'checked_on':'2026-10-20','basis':'Latest published annual full-time day tuition before aid; final high-school grade when grade-dependent. Includes known mandatory fees applicable to that grade/year; excludes application/new-student fees and optional charges. Published years differ and are retained.','schools':rows}
(HERE/'tuition.json').write_text(json.dumps(result,indent=2,ensure_ascii=False)+'\n')
print({status:sum(r['tuition_status']==status for r in rows) for status in ['verified','boarding_only','unresolved']})
