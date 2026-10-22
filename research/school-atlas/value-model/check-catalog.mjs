import assert from 'node:assert/strict';
import fs from 'node:fs';
import { calculate } from '../../../school-atlas/value-calculation.js';
import SCHOOL_ATLAS_DATA from '../../../school-atlas/school-data.js';
import SCHOOL_ATLAS_COST_DATA from '../../../school-atlas/cost-data.js';
import SCHOOL_ATLAS_PUBLIC_OPTIONS from '../../../school-atlas/public-options-data.js';
import SCHOOL_ATLAS_PRIVATE_DATA from '../../../school-atlas/private-school-data.js';
import SCHOOL_ATLAS_VALUE_MODEL from '../../../school-atlas/value-model.js';
import SCHOOL_ATLAS_FAMILY_HOUSING from '../../../school-atlas/family-housing.js';
import SCHOOL_ATLAS_ATTENDANCE from '../../../school-atlas/attendance-modes.js';
const m=SCHOOL_ATLAS_VALUE_MODEL,base={nonHousingBudgetUsd:m.default_non_housing_budget_usd,homeBudgetUsd:m.default_home_budget_usd,boardingTravelUsd:m.default_boarding_travel_usd,students:m.default_students};
const publicSchools=[...SCHOOL_ATLAS_DATA.schools,...SCHOOL_ATLAS_PUBLIC_OPTIONS.schools];
assert.equal(publicSchools.length,200);
assert.equal(new Set(publicSchools.map(s=>s.national_rank)).size,200);
const audit=JSON.parse(fs.readFileSync(new URL('../../../school-atlas/admissions-audit.json', import.meta.url),'utf8'));
assert.deepEqual(audit.schools.map(s=>s.national_rank).sort((a,b)=>a-b),Array.from({length:353},(_,i)=>i+1));
const expectedRestricted=audit.schools.filter(s=>s.status==='excluded').sort((a,b)=>a.national_rank-b.national_rank).slice(0,100);
const restricted=SCHOOL_ATLAS_PUBLIC_OPTIONS.schools;
assert.equal(restricted.length,100);
assert.deepEqual(Array.from(restricted,s=>s.national_rank),expectedRestricted.map(s=>s.national_rank));
assert.deepEqual(Array.from(restricted,s=>s.school_id),expectedRestricted.map(s=>`public:${s.national_rank}`));
assert.deepEqual(Array.from(restricted,s=>s.restricted_cohort_order),Array.from({length:100},(_,i)=>i+1));
const allIds=[...SCHOOL_ATLAS_DATA.schools.map(s=>`public:${s.national_rank}`),...restricted.map(s=>s.school_id),...SCHOOL_ATLAS_PRIVATE_DATA.schools.map(s=>s.school_id)];
assert.equal(allIds.length,300);
assert.equal(new Set(allIds).size,300);
const housing=SCHOOL_ATLAS_FAMILY_HOUSING.schools,attendance=SCHOOL_ATLAS_ATTENDANCE.schools;
assert.deepEqual(Object.keys(housing).sort(),allIds.sort());
for(const h of Object.values(housing)){assert.equal(h.bedrooms,3);assert.equal(h.year,2027);assert.ok(h.monthly_rent_usd>0);assert.match(h.zip_code,/^\d{5}$/);assert.ok(h.source_url);assert.ok(h.mapping_source_url);}
for(const school of publicSchools){
 const id=`public:${school.national_rank}`;
 const result=calculate({...school,school_type:'public',housing:housing[id]},base,m.reference_scale_usd);
 assert.equal(result.estimated_annual_living_cost_usd,12*housing[id].monthly_rent_usd+base.nonHousingBudgetUsd);
 if(school.quality_of_life_proxy!==null)assert.ok(result.cost_adjusted_livability>0);
}
const schools=SCHOOL_ATLAS_PRIVATE_DATA.schools;
assert.equal(schools.length,100);
assert.deepEqual([...schools].map(s=>s.private_rank).sort((a,b)=>a-b),Array.from({length:107},(_,i)=>i+1).filter(rank=>![10,18,23,50,71,75,85].includes(rank)));
assert.deepEqual(Object.keys(attendance).sort(),Array.from(schools,s=>s.school_id).sort());
let day=0,boarding=0,both=0;
for(const school of schools){
 const modes=attendance[school.school_id];assert.ok(modes.day||modes.boarding);if(modes.day&&modes.boarding)both++;
 for(const mode of ['day','boarding']){
  if(!modes[mode])continue;
  const input={...school,...modes[mode],attendance_mode:mode,housing:housing[school.school_id]};
  const result=calculate(input,base,m.reference_scale_usd);
  assert.ok(result.estimated_total_annual_cost_usd>0);
  assert.ok(modes[mode].tuition_source_url);if(!modes[mode].tuition_year && modes[mode].tuition_usd>0){assert.equal(result.value_is_tuition_assumption,true);assert.ok(result.value_bound_condition);assert.ok(/year|undated/i.test(modes[mode].tuition_basis+' '+modes[mode].tuition_note));}
  if(mode==='day'){day++;assert.ok(result.cost_adjusted_livability>0);assert.equal(result.estimated_annual_living_cost_usd,12*housing[school.school_id].monthly_rent_usd+base.nonHousingBudgetUsd);}
  else{boarding++;assert.equal(result.cost_adjusted_livability,null);assert.equal(result.estimated_annual_living_cost_usd,base.homeBudgetUsd);assert.equal(result.cost_is_lower_bound,true);assert.equal(result.monthly_family_rent_usd,null);}
 }
}
assert.equal(day,96);assert.equal(boarding,32);assert.equal(both,28);
const regis=schools.find(s=>s.private_rank===33),de=schools.find(s=>s.private_rank===22);
assert.equal(housing[regis.school_id].monthly_rent_usd,5640);assert.equal(housing[de.school_id].monthly_rent_usd,2410);
const regisValue=calculate({...regis,...attendance[regis.school_id].day,attendance_mode:'day',housing:housing[regis.school_id]},base,m.reference_scale_usd);
assert.equal(regisValue.estimated_total_annual_cost_usd,120636);
const deValue=calculate({...de,...attendance[de.school_id].boarding,attendance_mode:'boarding',housing:housing[de.school_id]},base,m.reference_scale_usd);
assert.equal(deValue.estimated_total_annual_cost_usd,152826);assert.equal(deValue.value_lower_bound,null);
const wa=schools.find(s=>s.private_rank===68);
assert.equal(attendance[wa.school_id].boarding.tuition_year,'2027-2028');
console.log('Catalog checks passed: exact three disjoint100-school cohorts;300ZIP3BRrents;96day/32boardingalternatives under100uniqueprivateIDs; boardinghome/travelbounds; Regis/DEcostreconciliation; no campusQOL boardingvalue.');
