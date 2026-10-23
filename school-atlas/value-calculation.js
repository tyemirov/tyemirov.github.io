// @ts-check

  const finite = value => typeof value === "number" && Number.isFinite(value);
  const nonnegative = value => finite(value) && value >= 0;
  /**
   * @param {Record<string, any>} school
   * @param {{nonHousingBudgetUsd: number, homeBudgetUsd: number, boardingTravelUsd: number | null, students: number}} scenario
   * @param {number} referenceScale
   */
  export function calculate(school,scenario,referenceScale) {
    const {nonHousingBudgetUsd,homeBudgetUsd,boardingTravelUsd,students}=scenario;
    if (!nonnegative(nonHousingBudgetUsd) || !nonnegative(homeBudgetUsd) || !(boardingTravelUsd===null || nonnegative(boardingTravelUsd)) || !Number.isInteger(students) || students<1 || students>20 || !finite(referenceScale) || referenceScale<=0) throw new RangeError("Enter nonnegative household costs and 1–20 enrolled children; leave unpriced boarding travel blank.");
    const privateSchool=school.school_type==="private", boarding=privateSchool && school.attendance_mode==="boarding";
    const tuitionAssumed=privateSchool && (school.tuition_status==="publisher_reported" || (!school.tuition_year && school.tuition_usd>0));
    const tuitionKnown=!privateSchool || (["verified","publisher_reported"].includes(school.tuition_status) && nonnegative(school.tuition_usd));
    const knownFees=nonnegative(school.mandatory_annual_fees_usd)?school.mandatory_annual_fees_usd:0;
    const householdFees=privateSchool && nonnegative(school.mandatory_household_annual_fees_usd)?school.mandatory_household_annual_fees_usd:0;
    const knownMinimum=tuitionKnown?(privateSchool?school.tuition_usd+knownFees:0):null;
    const schoolLow=knownMinimum===null?null:privateSchool && nonnegative(school.annual_school_cost_low_usd)?Math.max(knownMinimum,school.annual_school_cost_low_usd):knownMinimum;
    const schoolHigh=knownMinimum===null || (privateSchool && school.required_fee_total_unresolved===true)?null:privateSchool && nonnegative(school.annual_school_cost_high_usd)?Math.max(schoolLow,school.annual_school_cost_high_usd):schoolLow;
    const rent=school.housing?.monthly_rent_usd;
    const housingKnown=nonnegative(rent), qualityKnown=nonnegative(school.quality_of_life_proxy);
    const livingCost=boarding?homeBudgetUsd:housingKnown?12*rent+nonHousingBudgetUsd:null;
    const travel=boarding?(boardingTravelUsd??0)*students:0;
    const totalLow=livingCost===null || schoolLow===null?null:livingCost+students*schoolLow+householdFees+travel;
    const totalHigh=livingCost===null || schoolHigh===null || (boarding && boardingTravelUsd===null)?null:livingCost+students*schoolHigh+householdFees+travel;
    const costFloor=totalLow!==null && totalHigh===null, plotCost=totalHigh??totalLow, displaySchoolCost=schoolHigh??schoolLow;
    const valueUpper=!boarding && totalLow!==null && qualityKnown?school.quality_of_life_proxy*referenceScale/totalLow:null;
    const valueLower=!boarding && totalHigh!==null && qualityKnown?school.quality_of_life_proxy*referenceScale/totalHigh:null;
    const missing=[];
    if(!tuitionKnown) missing.push("Annual school tuition is unavailable");
    if(!boarding && !housingKnown) missing.push("Local 3-bedroom rental estimate is unavailable");
    if(!boarding && !qualityKnown) missing.push("Community quality-of-life data are unavailable");
    const range=totalLow!==null && totalHigh!==null && totalLow!==totalHigh;
    return {
      comparison_mode:boarding?"boarding_cost":"relocation_value",attendance_mode:privateSchool?(boarding?"boarding":"day"):"public",
      enrolled_students:students,value_reference_scale_usd:referenceScale,non_housing_budget_usd:nonHousingBudgetUsd,current_home_budget_usd:boarding?homeBudgetUsd:null,
      monthly_family_rent_usd:boarding?null:housingKnown?rent:null,annual_family_rent_usd:boarding?null:housingKnown?12*rent:null,
      annual_non_housing_cost_usd:boarding?null:nonHousingBudgetUsd,boarding_travel_per_student_usd:boarding?boardingTravelUsd:null,annual_boarding_travel_usd:boarding && boardingTravelUsd!==null?travel:null,
      estimated_annual_living_cost_usd:livingCost,annual_school_cost_per_student_usd:displaySchoolCost,
      annual_school_cost_for_students_usd:displaySchoolCost===null?null:students*displaySchoolCost+householdFees,annual_household_school_fees_usd:householdFees,
      estimated_total_annual_cost_usd:plotCost,estimated_total_annual_cost_low_usd:totalLow,estimated_total_annual_cost_high_usd:totalHigh,
      living_cost_only_value:!boarding && livingCost>0 && qualityKnown?school.quality_of_life_proxy*referenceScale/livingCost:null,
      cost_adjusted_livability:boarding?null:qualityKnown && plotCost>0?school.quality_of_life_proxy*referenceScale/plotCost:null,
      value_lower_bound:valueLower,value_upper_bound:valueUpper,value_is_upper_bound:!boarding && costFloor,cost_is_lower_bound:costFloor,
      value_has_range:!boarding && range,cost_has_range:range,value_is_estimate:true,
      value_is_tuition_assumption:tuitionAssumed,
      value_bound_condition:tuitionAssumed?(school.tuition_status==="publisher_reported"?"Conditional on unverified, undated publisher tuition":"Conditional on an undated official tuition rate; applicable year is unverified"):"",
      value_basis:boarding?(costFloor?"boarding_cost_floor":"boarding_cost_estimate"):costFloor?(tuitionAssumed?"tuition_assumption_ceiling":"upper_bound"):range?"modeled_cost_range":"local_rent_family_estimate",
      value_missing_reason:missing.join(". "),school_fees_incomplete:privateSchool && school.fees_complete!==true,
      unpriced_cost_note:[school.required_fee_total_unresolved?"Required school charges remain unpriced":"",boarding && boardingTravelUsd===null?"Boarding travel is unpriced; the displayed total is a cost floor":""].filter(Boolean).join(". "),
      value_formula_version:"local-family-rent-school-v3",school_cost_before_aid:true
    };
  }
