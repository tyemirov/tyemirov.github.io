// @ts-check
import payload from './school-data.js';
import costData from './cost-data.js';
import publicOptions from './public-options-data.js';
import privateData from './private-school-data.js';
import housingData from './family-housing.js';
import attendanceData from './attendance-modes.js';
import valueModel from './value-model.js';
import { calculate } from './value-calculation.js';

import { initializePage, onPageLeave } from '/assets/js/navigation.js';

/** @typedef {{nonHousingBudgetUsd: number, homeBudgetUsd: number, boardingTravelUsd: number | null, students: number}} FamilyScenario */
export function mountPage() {
  const listeners = [];
  const listen = (target, event, handler) => {
    target.addEventListener(event, handler);
    listeners.push(() => target.removeEventListener(event, handler));
  };
const d3 = globalThis.d3;
const SCENARIO_KEY = 'school-atlas-family-scenario-v3';
let persistenceMessage = 'Research defaults';
  const defaultScenario=()=>({nonHousingBudgetUsd:valueModel.default_non_housing_budget_usd,homeBudgetUsd:valueModel.default_home_budget_usd,boardingTravelUsd:valueModel.default_boarding_travel_usd,students:valueModel.default_students});
  let scenario=defaultScenario();
  try {
    const saved=JSON.parse(localStorage.getItem(SCENARIO_KEY));
    if(saved){calculate({},saved,valueModel.reference_scale_usd);scenario=saved;}
  } catch (error) {
    persistenceMessage = `Could not load saved costs: ${error.message}. Research defaults are shown.`;
  }
  const allSchools = [
    ...payload.schools.map(school => ({...school,school_type:"public",residential_entry:true})),
    ...publicOptions.schools,
    ...privateData.schools.map(school => ({...school,school_type:"private"}))
  ].map(school => {
    const rank = school.school_type === "private" ? school.private_rank : school.national_rank;
    const schoolId = school.school_id || `public:${rank}`;
    const cost = school.cost || (school.school_type === "public" ? costData?.schools?.[rank] : null);
    const priceIndex = typeof cost?.price_index === "number" && Number.isFinite(cost.price_index) && cost.price_index > 0 ? cost.price_index : null;
    return {...school,school_id:schoolId,rank,ranking_family:school.school_type === "private" ? "Niche Best Private High Schools" : "U.S. News public high schools",residential_entry:school.school_type === "public" && Boolean(school.residential_entry),community:school.community || school.school_listed_city || "Unverified community",admissions_note:school.admissions_note || "",price_index:priceIndex,cost_adjusted_livability:null,cost};
  });
  let schools = [], valueDivider, valueExtent, rankExtent, summary = {};
  let privateAttendance="day";
  const stateNames = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia"};
  const categories = [
    {label:"Housing",key:"aarp_housing"},
    {label:"Neighborhood",key:"aarp_neighborhood"},
    {label:"Transportation",key:"aarp_transportation"},
    {label:"Environment",key:"aarp_environment"},
    {label:"Health",key:"aarp_health"},
    {label:"Engagement",key:"aarp_engagement"}
  ];
  const hybridRanks = new Set([135,202,291,303]);
  const schoolById = new Map(allSchools.map(school => [school.school_id,school]));
  const chartElement = document.getElementById("school-chart");
  const chart = d3.select(chartElement);
  const chartWrap = document.getElementById("chart-wrap");
  const tooltip = document.getElementById("chart-tooltip");
  const profile = document.getElementById("school-profile");
  const scopeNotice = document.getElementById("scope-notice");
  const schoolSearch = document.getElementById("school-search");
  const scopeControl = document.getElementById("school-scope");
  let schoolScope = "resident";
  let schoolChoice = null;
  const schoolPicker = document.getElementById("school-picker");
  const schoolOptions = document.getElementById("school-options");
  const budgetSettings = document.getElementById("budget-settings");
  const budgetInput = document.getElementById("non-housing-budget");
  const homeBudgetInput=document.getElementById("home-budget");
  const travelInput=document.getElementById("boarding-travel");
  const attendanceControl=document.getElementById("attendance-control");
  const studentInput = document.getElementById("student-count");
  budgetInput.value = scenario.nonHousingBudgetUsd;
  homeBudgetInput.value=scenario.homeBudgetUsd;
  travelInput.value=scenario.boardingTravelUsd??"";
  studentInput.value = scenario.students;
  let sortKey = "value";
  let sortDirection = "descending";
  let sortMetricMode = "value";
  const sortHeaders = [...document.querySelectorAll(".table-sort")];
  const tableBody = document.getElementById("school-list");
  const oneDecimal = d3.format(".1f");
  const scoreText = value => typeof value === "number" && Number.isFinite(value) ? oneDecimal(value) : "Unavailable";
  const money = value => typeof value === "number" && Number.isFinite(value) ? `$${Math.round(value).toLocaleString("en-US")}` : "Unavailable";
  const cleanCommunity = community => community.replace(/ (city|CDP)$/,"");
  const normalize = value => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim();
  const searchableText = new Map(allSchools.map(school => [school.school_id,normalize(`${school.school} ${school.community} ${school.school_listed_city} ${school.state} ${stateNames[school.state]} ${school.rank}`)]));
  let visibleSchools = [...schools];
  let selectedSchool = schoolFromHash();
  let positions = [];
  let chartGeometry = null;
  let hoveredRank = null;
  let lastWidth = 0;

  function element(tagName,className,text) {
    const createdElement = document.createElement(tagName);
    if (className) createdElement.className = className;
    if (text !== undefined) createdElement.textContent = text;
    return createdElement;
  }

  function schoolFromHash(hash=window.location.hash) {
    const hashParameters = new URLSearchParams(hash.slice(1));
    return schoolById.get(hashParameters.has("private") ? `private:${hashParameters.get("private")}` : `public:${Number(hashParameters.get("school"))}`);
  }


  function isPrivate(school) { return school.school_type === "private"; }
  function boardingView(){return schoolScope==="private" && privateAttendance==="boarding";}
  function isBoarding(school){return school.attendance_mode==="boarding";}
  function chartMetric(school){return boardingView()?school.estimated_total_annual_cost_usd:school.cost_adjusted_livability;}
  function openCost(school){return school.cost_is_lower_bound || school.value_is_upper_bound;}
  function rankLabel(school) { return isPrivate(school) ? "Niche private-school rank" : "U.S. News public-school rank"; }
  function admissionLabel(school) { return isPrivate(school) ? "Private · application required" : school.residential_entry ? "Resident entry" : "Lottery / selective entry"; }
  function schoolHash(school) {
    return isPrivate(school) ? `#private=${encodeURIComponent(school.school_id.slice(8))}${isBoarding(school)?"&attendance=boarding":""}` : `#school=${school.rank}`;
  }
  function scopeHash() {
    return `#scope=${schoolScope}${boardingView()?"&attendance=boarding":""}`;
  }

  function clearSelection() {
    selectedSchool = null;
    profile.hidden = true;
    delete profile.dataset.schoolId;
    scopeNotice.hidden = true;
    tooltip.hidden = true;
    updateSelectionMarks();
    history.replaceState(null,"",scopeHash());
  }

  function sourceLink(url,label) {
    try {
      const parsedUrl = new URL(url);
      if (!['https:','http:'].includes(parsedUrl.protocol)) return null;
      const link = element("a",null,`${label} ↗`);
      link.href = parsedUrl.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    } catch {
      return null;
    }
  }

  function appendMetric(container,label,value,context,primary=false,unit="") {
    const metric = element("div",`profile-metric${primary ? " primary-metric" : ""}`);
    metric.append(element("span","metric-label",label));
    const valueElement = element("span",`metric-value${value === "Unavailable" ? " metric-unavailable" : ""}`,value);
    if (unit) valueElement.append(element("span","metric-unit",unit));
    metric.append(valueElement,element("span","metric-context",context));
    if (primary) {
      const explanation = element("a","metric-help","How it’s calculated");
      explanation.href = "#value-methodology";
      explanation.setAttribute("aria-label",`How ${label === "Value index" ? "the Value index" : "annual family cost"} is calculated`);
      metric.append(explanation);
    }
    container.append(metric);
  }

  function annualCostText(school){
    if(school.estimated_total_annual_cost_usd===null)return "Unavailable";
    return `${openCost(school)?school.value_is_tuition_assumption?"≈≥":"≥":"≈"}${money(school.estimated_total_annual_cost_usd)}`;
  }
  function valueText(school) {
    if(isBoarding(school)) return `${annualCostText(school)}/yr`;
    return school.cost_adjusted_livability === null ? "Unavailable" : school.value_is_upper_bound ? `${school.value_is_tuition_assumption ? "≈" : ""}≤${oneDecimal(school.cost_adjusted_livability)}` : school.value_has_range ? `${oneDecimal(school.value_lower_bound)}–${oneDecimal(school.value_upper_bound)}` : `${school.value_is_estimate ? "≈" : ""}${oneDecimal(school.cost_adjusted_livability)}`;
  }

  function schoolDescription(school) {
    return `${school.school}, ${school.state}, ${rankLabel(school)} ${school.rank}, ${isBoarding(school)?"annual family cost":"value index"} ${valueText(school)}, ${isBoarding(school)?"family remains at its current home":`local 3-bedroom rent ${money(school.monthly_family_rent_usd)} per month; community score ${scoreText(school.quality_of_life_proxy)} out of 100`}`;
  }

  function renderProfile(school) {
    profile.hidden = false;
    profile.dataset.schoolId = school.school_id;
    document.getElementById("profile-title").textContent = school.school;
    const boarding=isBoarding(school);
    const costSummary=!boarding && school.estimated_total_annual_cost_usd!==null?` · Family cost ${annualCostText(school)}/yr`:"";
    document.getElementById("profile-quick-stats").textContent=`#${school.rank} · ${boarding?"Annual family cost":"Value index"} ${valueText(school)}${costSummary}`;
    document.getElementById("profile-location").textContent=`${school.school_listed_city}, ${stateNames[school.state]}`;
    document.getElementById("profile-cohort").textContent=isPrivate(school)?`${boarding?"Boarding":"Day"} school`:school.residential_entry?`Resident #${school.eligible_cohort_order}`:"Lottery / selective";
    const metrics=document.getElementById("profile-metrics");metrics.replaceChildren();
    appendMetric(metrics,isPrivate(school)?"Private rank":"National rank",`#${school.rank}`,isPrivate(school)?`Niche · ${school.ranking_edition}`:"U.S. News · 2026–27");
    appendMetric(metrics,boarding?"Annual family cost":"Value index",valueText(school),boarding?"Current home + boarding + known travel, before aid":school.value_is_upper_bound?"Unitless ceiling · unpriced charges":"Unitless estimate · higher is better",true);
    if(!boarding)appendMetric(metrics,"Annual family cost",annualCostText(school)+"/yr","Local rent + household spending + school");
    if(isPrivate(school)){
      appendMetric(metrics,boarding?"Boarding / child":"Day tuition / child",money(school.tuition_usd),`${school.tuition_year||"Year unverified"} · Before aid`);
      metrics.lastElementChild.classList.add("tuition-metric");
    }
    const costMetrics=document.getElementById("profile-cost-metrics");costMetrics.replaceChildren();
    const tuitionDetail=document.getElementById("tuition-detail");tuitionDetail.hidden=!isPrivate(school);
    const tuitionNotes=[...new Set([school.tuition_basis,school.tuition_note,school.fees_note,school.cost_estimate_note,school.value_bound_condition,school.unpriced_cost_note,boarding?`Family stays at its current home. ${school.boarding_schedule?"Boarding schedule: "+school.boarding_schedule+".":"Boarding schedule is not stated; verify weekend/holiday arrangements."}`:"",school.school_fees_incomplete?"Known fees are included; other costs may remain unpriced.":""].filter(Boolean))];
    tuitionDetail.textContent=isPrivate(school)?tuitionNotes.filter((note,index)=>!tuitionNotes.some((other,otherIndex)=>otherIndex!==index && other.includes(note))).join(" "):"";
    if(boarding){
      appendMetric(costMetrics,"Current-home spending / year",money(scenario.homeBudgetUsd),"Editable national three-person benchmark; not your actual spending");
      appendMetric(costMetrics,"Boarding travel / child / year",scenario.boardingTravelUsd===null?"Unpriced":money(scenario.boardingTravelUsd),scenario.boardingTravelUsd===null?"Add travel in Costs; total remains a floor":"Your annual allowance");
    }else{
      appendMetric(costMetrics,"3-bedroom gross rent / month",money(school.monthly_family_rent_usd),`${school.housing?.year||""} HUD · ${school.housing?.geography_name||"Campus ZIP"} · covered utilities included`);
      costMetrics.lastElementChild.classList.add("housing-metric");
      appendMetric(costMetrics,"Rent + covered utilities / year",money(school.annual_family_rent_usd),"12 × monthly gross rent");
      appendMetric(costMetrics,"Other household costs / year",money(scenario.nonHousingBudgetUsd),"BLS three-person residual, national 2024 prices; editable");
    }
    if(isPrivate(school))appendMetric(costMetrics,"School / child / year",money(school.annual_school_cost_per_student_usd),boarding?"Boarding package + known fees, before aid":"Day tuition + known fees, before aid");
    if(school.annual_household_school_fees_usd>0)appendMetric(costMetrics,"Household school fees / year",money(school.annual_household_school_fees_usd),"Added once");
    appendMetric(costMetrics,"Annual family total",annualCostText(school),boarding?"Current home + boarding + known travel":"Local rent + other household costs + school");
    if(!boarding)appendMetric(costMetrics,"Community score",scoreText(school.quality_of_life_proxy),"Six-category AARP proxy; includes affordability",false,"/ 100");
    document.getElementById("profile-cost-context").textContent=boarding
      ? "The family remains at home. The $74,326 default is a national 2024 three-person spending benchmark, not a researched bill for your household. Edit it for your current home and any savings while a child boards; meals may otherwise overlap the boarding package. Unknown travel and required fees remain unpriced. Campus housing and campus livability do not determine family value here. Aid and moving costs are not assumed."
      : `${school.value_missing_reason?school.value_missing_reason+". ":""}Local housing is a 3-bedroom HUD gross-rent benchmark, not an advertised rental or attendance-boundary guarantee. ${school.housing?.mapping_note||""} The $52,956 default for other household spending excludes all shelter and covered energy/water utilities before rent is added; it retains food, transportation, health/vehicle insurance, phone/internet and household goods. It is held at national 2024 prices. Tuition years vary; aid, moving costs and unknown charges are not assumed. Adjust assumptions for your family.`;
    const rankHalf=school.rank<summary.school_rank_divider?"Better than this tab’s center rank":"Below this tab’s center rank";
    document.getElementById("profile-quadrant").textContent=boarding?`${rankHalf} · lower annual cost is farther right; family value is not scored from the campus community.`:school.cost_adjusted_livability===null?`${rankHalf} · Value unavailable for this school.`:`${rankHalf} · ${school.value_is_upper_bound?"value ceiling; ordering uncertain":school.cost_adjusted_livability>=valueDivider?"above this tab’s value reference":"below this tab’s value reference"}.`;
    document.getElementById("profile-community").textContent=`${boarding?"Campus context only; not a family-home score. ":""}Score geography: ${school.community}, ${school.state}. Community proxy, not an attendance boundary or admission guarantee.`;
    const breakdown = document.getElementById("category-breakdown");
    breakdown.replaceChildren();
    categories.forEach(category => {
      const categoryRow = element("div","category-row");
      const track = element("div","category-track");
      track.setAttribute("aria-hidden","true");
      const fill = element("div","category-fill");
      fill.style.width = `${school[category.key] ?? 0}%`;
      track.append(fill);
      categoryRow.append(element("span",null,category.label),track,element("span","category-value",scoreText(school[category.key])));
      breakdown.append(categoryRow);
    });
    const geographyNote = document.getElementById("geography-note");
    geographyNote.hidden = !school.locality_override;
    if (school.community_geography_type === "county") {
      geographyNote.hidden = false;
      geographyNote.textContent = isPrivate(school) ? `Broader county proxy: ${school.community}. This score covers the county, not the school campus or a family’s exact neighborhood.` : `Broader geography: this school uses the ${school.community} score. Its campus is outside Suwanee city and any incorporated city or Census-designated place. This proxy covers a larger area than most schools in the graph.`;
    } else if (school.locality_override) {
      geographyNote.textContent = `Community proxy: ${school.community}. ${school.community_mapping_note || ""}`;
    }
    document.getElementById("enrollment-heading").textContent = admissionLabel(school);
    document.querySelector(".address-reminder").textContent = isPrivate(school) ? "Check admission requirements, tuition, financial aid and entry year with the school." : school.residential_entry ? "Check the exact address, capacity, and intended entry year with the district." : "Check the application, selection rules, deadlines and intended entry year with the school.";
    document.getElementById("enrollment-evidence").textContent = school.admissions_evidence;
    const note = document.getElementById("enrollment-note");
    note.replaceChildren();
    const admissionNote = school.admissions_note.trim();
    note.hidden = !admissionNote && !(school.school_type === "public" && hybridRanks.has(school.rank));
    if (!note.hidden) {
      note.append(element("strong",null,school.school_type === "public" && hybridRanks.has(school.rank) ? "Specialized programs have separate rules" : "Enrollment detail"));
      if (school.school_type === "public" && hybridRanks.has(school.rank)) note.append(element("span",null,"The published rank includes the combined school population. Residential enrollment does not establish admission to its selective programs. "));
      if (admissionNote) note.append(document.createTextNode(admissionNote));
    }
    document.getElementById("enrollment-source").href = school.admissions_source_url;
    document.getElementById("enrollment-source").textContent = isPrivate(school) ? "School profile and admission links ↗" : "Official enrollment rules ↗";
    const sources = document.getElementById("profile-sources-content");
    sources.replaceChildren();
    const rankNote = isPrivate(school) ? "Private-school position from Niche’s Best Private High Schools in America. This ranking is shown separately from public-school ranks." : school.ranking_primary_confirmation_urls ? "Exact rank also corroborated by the official school source linked below." : "Exact national rank transcribed from HighSchoolTrends’ republication; no separate primary rank confirmation is recorded for this row.";
    sources.append(element("p",null,`${rankNote} Ranking edition: ${school.ranking_edition}; ${isPrivate(school) ? "Private day or boarding tuition and known required annual fees are added to modeled living costs. Published years differ; figures are not inflation-adjusted or net of financial aid." : school.education_data_school_year ? `principal school data: ${school.education_data_school_year}.` : "Underlying school-data year unavailable."}`));
    sources.append(element("p",null,"Community scores use AARP 2025 inputs. The displayed average is an analyst-created proxy, separate from AARP’s published overall score. The community geography is not the attendance boundary."));
    sources.append(element("p",null,isBoarding(school)?`Annual boarding comparison = ${money(scenario.homeBudgetUsd)} current-home spending + boarding school costs for ${scenario.students} children + known travel. Campus community scores do not determine family value. A hollow point is a known cost floor, not a complete quote.`:`Value = six-category community score × ${valueModel.reference_scale_usd.toLocaleString("en-US")} ÷ (local 3-bedroom annual gross rent + ${money(scenario.nonHousingBudgetUsd)} other household spending + school costs). Gross rent includes covered utilities. The national nonhousing benchmark is BLS 2024 three-person spending; no regional all-items price multiplier is applied. Aid, moving costs and unpriced charges may change actual spending.`));
    if (school.community_mapping_note) sources.append(element("p",null,school.community_mapping_note));
    const links = element("div","source-links");
    const sourceEntries = [
      [school.ranking_transcription_url,isPrivate(school) ? "Private-school rank table" : "National rank table"],
      [school.community_source_url,"AARP community profile"],
      ...(school.community_evidence_urls || []).map(url => [url,"Campus geography evidence"]),
      [school.ranking_publisher_url,isPrivate(school) ? "Niche ranking publisher" : "U.S. News ranking publisher"],
      [school.tuition_source_url,school.tuition_status === "publisher_reported" ? "Publisher-reported tuition; year unverified" : "Official tuition and financial aid"],
      [valueModel.budget_source_url,"BLS three-person household benchmark"],
      [school.housing?.source_url,"HUD local 3-bedroom gross-rent data"],
      [school.housing?.mapping_source_url,"Campus ZIP evidence"],
      [school.cost?.source_url || costData?.source_url || "https://www.bea.gov/data/prices-inflation/regional-price-parities-state-and-metro-area","BEA regional price parities"],
      [costData?.methodology_url,"BEA price methodology"],
      [school.cost?.mapping_source_url,"Regional geography mapping"]
    ];
    if (school.ranking_primary_confirmation_urls) school.ranking_primary_confirmation_urls.split(/\s*[;|]\s*/).filter(Boolean).forEach(url => sourceEntries.push([url,"Official rank corroboration"]));
    (school.tuition_supporting_source_urls || []).forEach(url => sourceEntries.push([url,"Additional tuition evidence"]));
    const uniqueAdditional = [...new Set(school.admissions_supporting_urls || [])].filter(url => url !== school.admissions_source_url);
    uniqueAdditional.forEach((url,index) => sourceEntries.push([url,`Additional district source ${index+1}`]));
    sourceEntries.forEach(([url,label]) => {const link = sourceLink(url,label);if (link) links.append(link);});
    sources.append(links);
    document.getElementById("school-permalink").href = schoolHash(school);
  }

  function selectSchool(school,{updateUrl=true,announce=true}={}) {
    if (!school) return;
    selectedSchool = school;
    scopeNotice.hidden = true;
    renderProfile(school);
    updateSelectionMarks();
    tableBody.querySelectorAll("tr").forEach(row => {
      const isSelected = row.dataset.schoolId === school.school_id;
      row.classList.toggle("is-selected",isSelected);
      row.querySelector("button").setAttribute("aria-pressed",String(isSelected));
    });
    if (updateUrl) history.replaceState(null,"",schoolHash(school));
    if (announce) document.getElementById("selection-announcement").textContent = `${schoolDescription(school)}. Its details are shown below the graph.`;

  }

  function renderList() {
    const sortValue = school => sortKey === "name" ? school.school : sortKey === "resident" ? school.eligible_cohort_order ?? null : sortKey === "rank" ? school.rank : sortKey === "cost" || boardingView() ? school.estimated_total_annual_cost_usd : school.cost_adjusted_livability;
    const sortedSchools = [...visibleSchools].sort((firstSchool,secondSchool) => {
      const first = sortValue(firstSchool), second = sortValue(secondSchool);
      if (first == null) return second == null ? firstSchool.rank-secondSchool.rank : 1;
      if (second == null) return -1;
      const comparison = typeof first === "string" ? first.localeCompare(second) : first-second;
      return comparison*(sortDirection === "ascending" ? 1 : -1) || firstSchool.rank-secondSchool.rank;
    });
    sortHeaders.forEach(button=>{
      const active = button.dataset.sort === sortKey;
      button.closest("th").setAttribute("aria-sort",active ? sortDirection : "none");
      button.querySelector(".sort-indicator").textContent = active ? sortDirection === "ascending" ? "↑" : "↓" : "↕";
      const nextDirection = active && sortDirection === "ascending" ? "descending" : active ? "ascending" : button.dataset.sort === "value" && !boardingView() ? "descending" : "ascending";
      button.setAttribute("aria-label",`${button.querySelector(".sort-label").textContent}: sort ${nextDirection}`);
    });
    tableBody.replaceChildren();
    const fragment = document.createDocumentFragment();
    sortedSchools.forEach(school => {
      const row = element("tr",school.school_id === selectedSchool?.school_id ? "is-selected" : "");
      row.dataset.schoolId = school.school_id;
      row.addEventListener("click",() => selectSchool(school));
      const nameCell = element("td");
      const button = element("button",null,school.school);
      button.type = "button";
      button.setAttribute("aria-label",`View ${schoolDescription(school)}. Select school to open its details below the graph.`);
      button.setAttribute("aria-pressed",String(school.school_id === selectedSchool?.school_id));
      nameCell.append(button,element("span","school-place",`${cleanCommunity(school.community)}, ${school.state} · ${admissionLabel(school)}`));
      const residentRankCell=element("td","table-rank",school.residential_entry ? `#${school.eligible_cohort_order}` : "—");
      residentRankCell.hidden=schoolScope!=="resident";
      row.append(nameCell,residentRankCell,element("td","table-rank",`#${school.rank}`),element("td","table-life",valueText(school)));
      const costCell=element("td","table-cost",annualCostText(school)+"/yr");
      costCell.hidden=boardingView();
      row.append(costCell);
      fragment.append(row);
    });
    tableBody.append(fragment);
    document.getElementById("list-count").textContent = visibleSchools.length;
    document.getElementById("list-empty").hidden = visibleSchools.length > 0;
  }

  function showTooltip(position) {
    if (!position) {tooltip.hidden=true;return;}
    const school = position.school;
    if (hoveredRank !== school.school_id) {
      tooltip.replaceChildren();
      tooltip.append(element("strong",null,school.school),element("div","tooltip-place",`${cleanCommunity(school.community)}, ${school.state} · ${admissionLabel(school)}`));
      const values = element("div","tooltip-values");
      values.append(element("span",null,`Rank #${school.rank}`),element("span",null,`${isBoarding(school)?"Annual family cost":"Value index"} ${valueText(school)}`));
      if(!isBoarding(school))values.append(element("span",null,`Annual family cost ${annualCostText(school)}/yr`));
      tooltip.append(values,element("div","tooltip-hint","Select school · details below"));
      hoveredRank = school.school_id;
    }
    tooltip.hidden = false;
    const desiredLeft = position.horizontal+13;
    const desiredTop = position.vertical-tooltip.offsetHeight-13;
    tooltip.style.left = `${Math.max(5,Math.min(desiredLeft,chartGeometry.width-tooltip.offsetWidth-5))}px`;
    tooltip.style.top = `${Math.max(5,desiredTop)}px`;
  }

  function updateSelectionMarks() {
    if (!chartGeometry) return;
    const selectedPosition = positions.find(position => position.school.school_id === selectedSchool?.school_id);
    chart.selectAll(".school-point").classed("is-selected",position => position.school.school_id === selectedSchool?.school_id).attr("aria-pressed",position => String(position.school.school_id === selectedSchool?.school_id));
    chart.selectAll(".selection-ring,.selected-annotation").remove();
    if (!selectedPosition) return;
    chart.append("circle").attr("class","selection-ring").attr("cx",selectedPosition.horizontal).attr("cy",selectedPosition.vertical).attr("r",9);
    if (chartGeometry.width < 490) return;
    const label = selectedSchool.school.replace(/ High School$/,"").replace(/ Senior$/,"");
    const annotation = chart.append("text").attr("class","selected-annotation").text(label.length > 33 ? `${label.slice(0,30)}…` : label);
    const labelWidth = annotation.node().getBBox().width;
    const candidates = [
      {horizontal:selectedPosition.horizontal+13,vertical:selectedPosition.vertical-9,anchor:"start"},
      {horizontal:selectedPosition.horizontal-13,vertical:selectedPosition.vertical-9,anchor:"end"},
      {horizontal:selectedPosition.horizontal+13,vertical:selectedPosition.vertical+20,anchor:"start"},
      {horizontal:selectedPosition.horizontal-13,vertical:selectedPosition.vertical+20,anchor:"end"}
    ];
    const fittingCandidate = candidates.find(candidate => {
      const candidateLeft = candidate.anchor === "start" ? candidate.horizontal : candidate.horizontal-labelWidth;
      const candidateRight = candidateLeft+labelWidth;
      if (candidateLeft < chartGeometry.plotLeft+5 || candidateRight > chartGeometry.plotRight-5 || candidate.vertical < chartGeometry.plotTop+48 || candidate.vertical > chartGeometry.plotBottom-33) return false;
      return positions.every(position => position.school.school_id === selectedSchool?.school_id || position.horizontal < candidateLeft-7 || position.horizontal > candidateRight+7 || position.vertical < candidate.vertical-18 || position.vertical > candidate.vertical+7);
    });
    if (fittingCandidate) annotation.attr("x",fittingCandidate.horizontal).attr("y",fittingCandidate.vertical).attr("text-anchor",fittingCandidate.anchor);
    else annotation.remove();
  }

  function drawChart() {
    const width = Math.floor(chartWrap.getBoundingClientRect().width);
    if (width < 180) return;
    lastWidth = width;
    const narrow = width < 490;
    const stageTop = chartWrap.getBoundingClientRect().top + window.scrollY;
    const height = Math.max(260,Math.min(620,Math.floor(window.innerHeight-stageTop-138)));
    const plotLeft = 58;
    const plotRight = width-12;
    const plotTop = 14;
    const plotBottom = height-28;
    const horizontalScale = d3.scaleLinear().domain(boardingView()?[...valueExtent].reverse():valueExtent).range([plotLeft+7,plotRight-7]);
    const verticalScale = d3.scaleLinear().domain(rankExtent).range([plotTop+7,plotBottom-7]);
    const referenceHorizontal = horizontalScale(valueDivider ?? .5);
    const referenceVertical = verticalScale(summary.school_rank_divider);
    chartGeometry = {width,height,plotLeft,plotRight,plotTop,plotBottom};
    tooltip.hidden = true;
    hoveredRank = null;
    chart.selectAll("*").remove();
    chart.attr("width",width).attr("height",height).attr("viewBox",`0 0 ${width} ${height}`);
    chart.append("title").text("School ranking and community value for the selected school category");
    chart.append("desc").text(`${visibleSchools.filter(school => chartMetric(school) !== null).length} schools plotted. Better rank is up; ${boardingView()?"lower annual family cost":"higher unitless value index"} is right. Scales fit the full selected school tab and stay fixed while filtering locations. Different tabs use different scales. The centered axes cross at visual references: rank ${summary.school_rank_divider} and ${boardingView()?"annual cost":"value"} ${boardingView()?money(valueDivider):oneDecimal(valueDivider)}. Schools with unavailable value data remain in the list.`);
    const quadrants = [
      {horizontal:plotLeft,vertical:plotTop,width:referenceHorizontal-plotLeft,height:referenceVertical-plotTop,fill:"var(--blue-soft)",heading:"Better rank",description:boardingView()?"Higher cost":"Lower value",anchor:"start",labelHorizontal:plotLeft+11,labelVertical:plotTop+18},
      {horizontal:referenceHorizontal,vertical:plotTop,width:plotRight-referenceHorizontal,height:referenceVertical-plotTop,fill:"var(--teal-soft)",heading:"Better rank",description:boardingView()?"Lower cost":"Higher value",anchor:"end",labelHorizontal:plotRight-11,labelVertical:plotTop+18},
      {horizontal:plotLeft,vertical:referenceVertical,width:referenceHorizontal-plotLeft,height:plotBottom-referenceVertical,fill:"var(--gray-soft)",heading:"Lower rank",description:boardingView()?"Higher cost":"Lower value",anchor:"start",labelHorizontal:plotLeft+11,labelVertical:plotBottom-24},
      {horizontal:referenceHorizontal,vertical:referenceVertical,width:plotRight-referenceHorizontal,height:plotBottom-referenceVertical,fill:"var(--sand-soft)",heading:"Lower rank",description:boardingView()?"Lower cost":"Higher value",anchor:"end",labelHorizontal:plotRight-11,labelVertical:plotBottom-24}
    ];
    quadrants.forEach(quadrant => chart.append("rect").attr("x",quadrant.horizontal).attr("y",quadrant.vertical).attr("width",quadrant.width).attr("height",quadrant.height).attr("fill",quadrant.fill));
    const horizontalTicks = horizontalScale.ticks(narrow ? 3 : 6);
    const verticalTicks = verticalScale.ticks(narrow ? 5 : 6).filter(tick => Number.isInteger(tick) && tick > 0);
    const grid = chart.append("g").attr("aria-hidden","true");
    horizontalTicks.forEach(tick => grid.append("line").attr("x1",horizontalScale(tick)).attr("x2",horizontalScale(tick)).attr("y1",plotTop).attr("y2",plotBottom).attr("stroke","var(--chart-grid)").attr("stroke-opacity",.24));
    verticalTicks.forEach(tick => grid.append("line").attr("x1",plotLeft).attr("x2",plotRight).attr("y1",verticalScale(tick)).attr("y2",verticalScale(tick)).attr("stroke","var(--chart-grid)").attr("stroke-opacity",.24));
    chart.append("defs").append("marker")
      .attr("id","axis-arrow").attr("viewBox","0 0 12 12")
      .attr("refX",10).attr("refY",6).attr("markerWidth",12).attr("markerHeight",12)
      .attr("markerUnits","userSpaceOnUse").attr("orient","auto-start-reverse")
      .append("path").attr("d","M1,1 L11,6 L1,11 Z").attr("fill","var(--chart-axis)");
    chart.append("g").attr("class","horizontal-axis").attr("transform",`translate(0,${referenceVertical})`).call(d3.axisBottom(horizontalScale).tickValues(horizontalTicks).tickFormat(boardingView()?d3.format("$,.0f"):d3.format("~g")).tickSizeInner(7).tickSizeOuter(0).tickPadding(7));
    chart.append("g").attr("class","vertical-axis").attr("transform",`translate(${referenceHorizontal},0)`).call(d3.axisLeft(verticalScale).tickValues(verticalTicks).tickFormat(rank => `#${rank}`).tickSizeInner(7).tickSizeOuter(0).tickPadding(5));
    chart.select(".horizontal-axis .domain").attr("marker-end","url(#axis-arrow)");
    chart.select(".vertical-axis .domain").attr("marker-start","url(#axis-arrow)");
    const axisLink = chart.append("a").attr("class","axis-link").attr("href","#value-methodology").attr("tabindex",0).attr("aria-label",boardingView()?"Annual family cost: how it is calculated":"Value index: how it is calculated");
    axisLink.append("title").text("Open the calculation and methodology");
    const horizontalTitle = axisLink.append("text").attr("class","axis-title").attr("data-axis","x").attr("x",plotRight-14).attr("y",referenceVertical-(narrow ? 30 : 15)).attr("text-anchor","end");
    if (narrow) {
      horizontalTitle.append("tspan").attr("x",plotRight-14).text(boardingView()?"Annual family cost":"Value index");
      horizontalTitle.append("tspan").attr("x",plotRight-14).attr("dy",15).text(boardingView()?"lower is better":"higher is better");
    } else horizontalTitle.text(boardingView()?"Annual family cost · lower is better":"Value index · higher is better");
    chart.append("text").attr("class","axis-title").attr("data-axis","y").attr("transform",`translate(${referenceHorizontal+20},${plotTop+57}) rotate(-90)`).attr("text-anchor","end").text("School rank · better");
    quadrants.forEach(quadrant => {
      const label = chart.append("text").attr("class","quadrant-heading").attr("x",quadrant.labelHorizontal).attr("y",quadrant.labelVertical).attr("text-anchor",quadrant.anchor);
      label.append("tspan").attr("x",quadrant.labelHorizontal).text(quadrant.heading);
      label.append("tspan").attr("class","quadrant-subtitle").attr("x",quadrant.labelHorizontal).attr("dy",14).text(quadrant.description);
    });
    positions = visibleSchools.filter(school => chartMetric(school) !== null).map(school => ({school,horizontal:horizontalScale(chartMetric(school)),vertical:verticalScale(school.rank)}));
    chart.append("g").attr("class","school-points").selectAll("circle").data(positions).join("circle")
      .attr("class",position => `school-point${openCost(position.school) ? " is-upper-bound" : ""}${position.school.value_is_estimate ? " is-estimate" : ""}`).attr("data-school-id",position => position.school.school_id)
      .attr("cx",position => position.horizontal).attr("cy",position => position.vertical).attr("r",narrow ? 4 : 4.7)
      .attr("tabindex",0).attr("role","button").attr("aria-label",position => `${schoolDescription(position.school)}. Select school to open its details below the graph.`)
      .on("focus",(_event,position) => showTooltip(position)).on("blur",() => {tooltip.hidden=true;})
      .on("keydown",(event,position) => {
        if (event.key === "Enter" || event.key === " ") {event.preventDefault();selectSchool(position.school);tooltip.hidden=true;}
      });
    chart.append("g").attr("class","value-ranges").attr("aria-hidden","true").selectAll("line").data(positions.filter(p=>boardingView()?p.school.cost_has_range:p.school.value_has_range)).join("line").attr("x1",p=>horizontalScale(boardingView()?p.school.estimated_total_annual_cost_low_usd:p.school.value_lower_bound)).attr("x2",p=>horizontalScale(boardingView()?p.school.estimated_total_annual_cost_high_usd:p.school.value_upper_bound)).attr("y1",p=>p.vertical).attr("y2",p=>p.vertical).attr("stroke","var(--chart-range)").attr("stroke-width",2).attr("opacity",.65);
    chart.select(".school-points").raise();
    chart.selectAll(".axis-link,.axis-title").raise();
    updateSelectionMarks();
    document.getElementById("chart-empty").hidden = positions.length > 0;
    document.getElementById("chart-empty-title").textContent = visibleSchools.length ? boardingView()?"Cost data unavailable":"Value data unavailable" : "No matching schools";
    document.getElementById("chart-empty-note").textContent = visibleSchools.length ? "These schools remain available in the list below." : (schoolChoice ? `No schools in this tab for ${schoolChoice.label}. Choose another location or school type.` : "Choose another location or school type.");
    document.getElementById("chart-dividers").textContent = `Tab scale · Center: #${summary.school_rank_divider} / ${boardingView()?money(valueDivider):"index "+oneDecimal(valueDivider)}`;
    document.getElementById("legend-bound-label").textContent=boardingView()?"Unpriced costs · cost floor (≥)":"Unpriced costs · value ceiling (≤)";
    document.getElementById("chart-coverage").textContent = `${positions.length} plotted${visibleSchools.length === positions.length ? "" : ` · ${visibleSchools.length-positions.length} missing ${boardingView()?"cost":"value"} data`}${schoolScope === "private" ? boardingView()?" · travel may be unpriced":" · bar = range" : ""}`;
  }

  function nearestPosition(event) {
    if (!chartGeometry || !positions.length) return null;
    const [pointerHorizontal,pointerVertical] = d3.pointer(event,chartElement);
    if (pointerHorizontal < chartGeometry.plotLeft || pointerHorizontal > chartGeometry.plotRight || pointerVertical < chartGeometry.plotTop || pointerVertical > chartGeometry.plotBottom) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    positions.forEach(position => {
      const distance = Math.hypot(position.horizontal-pointerHorizontal,position.vertical-pointerVertical);
      if (distance < nearestDistance) {nearest = position;nearestDistance = distance;}
    });
    const hitRadius = window.matchMedia("(pointer: coarse)").matches ? 28 : 22;
    return nearestDistance <= hitRadius ? nearest : null;
  }

  chart.on("pointermove",event => {
    if (event.pointerType === "touch") return;
    if (event.target.closest?.("a")) {tooltip.hidden=true;chartElement.style.cursor="";return;}
    const nearest = nearestPosition(event);
    showTooltip(nearest);
    chartElement.style.cursor = nearest ? "pointer" : "default";
  });
  chart.on("pointerleave",() => {tooltip.hidden=true;hoveredRank=null;});
  chart.on("click",event => {
    if (event.target.closest?.("a")) return;
    const directId = event.target.closest?.(".school-point")?.getAttribute("data-school-id");
    const selectedPosition = directId ? positions.find(position => position.school.school_id === directId) : nearestPosition(event);
    if (selectedPosition) {selectSchool(selectedPosition.school);tooltip.hidden=true;}
  });

  function applyFilters() {
    visibleSchools = schools.filter(school => !schoolChoice || (schoolChoice.type === "state" ? school.state === schoolChoice.id : schoolChoice.type === "school" ? school.school_id === schoolChoice.id : `${school.school_listed_city}|${school.state}` === schoolChoice.id));
    document.getElementById("result-count").textContent = visibleSchools.length === schools.length ? `${schools.length} schools` : `${visibleSchools.length} of ${schools.length} schools`;
    if (selectedSchool && !visibleSchools.some(school => school.school_id === selectedSchool.school_id)) clearSelection();
    profile.hidden = !selectedSchool;
    renderList();
    drawChart();
    updateDownload();
    renderSchoolOptions();
  }

  function clearFilters() {
    schoolSearch.value = "";
    schoolChoice = null;
    schoolPicker.open = false;
    clearSelection();
    applyFilters();
    document.getElementById("selection-announcement").textContent = "All schools and locations shown. No school selected.";
  }

  function fittedDomain(values,fallback) {
    const finite = values.filter(value=>typeof value === "number" && Number.isFinite(value));
    if (!finite.length) return [...fallback];
    const [minimum,maximum] = d3.extent(finite);
    const padding = Math.max((maximum-minimum)*.06,maximum===minimum ? Math.max(Math.abs(minimum)*.06,1) : 0);
    return d3.scaleLinear().domain([Math.max(0,minimum-padding),maximum+padding]).nice(6).domain();
  }

  function configureComparison() {
    const privateView=schoolScope==="private";
    scopeControl.querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.scope===schoolScope)));
    attendanceControl.hidden=!privateView;
    attendanceControl.querySelectorAll("button").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.attendance===privateAttendance)));
    document.getElementById("boarding-budget-fields").hidden=!boardingView();
    document.getElementById("relocation-budget-fields").hidden=boardingView();
    document.getElementById("family-budget-intro").textContent=boardingView()?"Family stays at its current home. Add boarding school costs and annual travel; campus rent is excluded.":"Local 3-bedroom gross rent, including covered utilities, plus other household spending and school costs.";
    document.getElementById("family-budget-note").textContent=boardingView()?"Default home spending is $74,326: a national BLS 2024 three-person benchmark, not your actual bills. It stays unchanged while a child boards; reduce it for any meal or utility savings. Blank travel stays unpriced, so the total is a model cost floor. Aid may reduce tuition; other fees and moving costs may add to spending.":"Default other spending is $52,956: BLS 2024 three-person spending after removing all shelter and covered energy/water utilities. It retains health/vehicle insurance, food, transportation and phone/internet at national 2024 prices. Local gross rent is added separately. Adjust for your family. Aid may reduce tuition; unknown fees and moving costs may add to spending.";
    budgetSettings.hidden=false;
    document.querySelector(".toolbar").classList.add("budget-enabled");
    const cohort=allSchools.filter(school=>privateView?isPrivate(school):!isPrivate(school) && (schoolScope==="resident"?school.residential_entry:!school.residential_entry));
    schools=cohort.filter(school=>!privateView || attendanceData.schools[school.school_id]?.[privateAttendance]).map(school=>{
      const rate=privateView?attendanceData.schools[school.school_id][privateAttendance]:{};
      const input={...school,...rate,attendance_mode:privateView?privateAttendance:"public",housing:housingData.schools[school.school_id]};
      return {...input,...calculate(input,scenario,valueModel.reference_scale_usd)};
    });
    selectedSchool=schools.find(s=>s.school_id===selectedSchool?.school_id) || null;
    rankExtent=fittedDomain(schools.map(s=>s.rank),[0,400]);
    valueExtent=fittedDomain(schools.flatMap(s=>boardingView()?[s.estimated_total_annual_cost_usd,s.estimated_total_annual_cost_low_usd,s.estimated_total_annual_cost_high_usd]:[s.cost_adjusted_livability,s.value_lower_bound,s.value_upper_bound]),boardingView()?[0,200000]:[0,100]);
    valueDivider=(valueExtent[0]+valueExtent[1])/2;
    summary={...payload.summary,school_rank_divider:(rankExtent[0]+rankExtent[1])/2};
    document.getElementById("family-cost-column").hidden=boardingView();
    document.getElementById("resident-rank-column").hidden=schoolScope!=="resident";
    document.getElementById("value-column").querySelector(".sort-label").textContent=boardingView()?"Annual family cost":"Value index";
    const metricMode = boardingView()?"cost":"value";
    if (sortKey === "value" && sortMetricMode !== metricMode || sortKey === "cost" && boardingView()) {
      sortKey = "value";
      sortDirection = boardingView()?"ascending":"descending";
    }
    if (sortKey === "resident" && schoolScope !== "resident") {sortKey="rank";sortDirection="ascending";}
    sortMetricMode = metricMode;
    document.getElementById("chart-title").textContent=boardingView()?"School rank vs. annual family cost":"School rank vs. value index";
    document.getElementById("comparison-note").textContent = privateView
      ? `${boardingView()?"Family stays home":"Local 3-bedroom rent"} · ${scenario.students} ${scenario.students === 1 ? "child" : "children"}`
      : schoolScope === "restricted" ? "Lottery or selective entry"
      : "No lottery or selection";
    document.getElementById("chart-description").textContent = "Each dot is a school. Better rank is up; higher day-school value index or lower boarding annual cost is right. Day-school value includes local 3-bedroom gross rent, other household spending and school costs before aid. Boarding is a separate annual-cost comparison; family stays at home and campus livability is not used as family value. Approximate values are marked ≈. Hollow dots show value ceilings where required fees remain unpriced. Range bars show modeled expense uncertainty; their dot uses the conservative end. Axes fit each school tab and stay centered. Scales change between tabs and stay fixed for location filters. Rank numbers retain their separate publisher meanings. Schools with unavailable value data remain in the list.";
    document.querySelector(".school-table").classList.toggle("private-view",privateView);
    const rankingFamily = document.getElementById("ranking-family");
    rankingFamily.replaceChildren();
    if (privateView) {
      const rankingSource = sourceLink("https://www.niche.com/k12/search/best-private-high-schools/?page=1","Niche 2027");
      rankingSource.id = "ranking-source-link";
      rankingSource.title = "Niche's 2027 Best Private High Schools in America ranking edition; tuition years are listed separately.";
      rankingSource.setAttribute("aria-label","Niche 2027 Best Private High Schools in America ranking (opens in a new tab)");
      rankingFamily.append(rankingSource,` · ${schools.length} ${privateAttendance} options / 100 schools`);
    } else {
      const rankingSource = sourceLink("https://www.usnews.com/education/best-high-schools/national-rankings","U.S. News 2026–27");
      rankingSource.id = "ranking-source-link";
      rankingSource.title = "U.S. News 2026–2027 Best High Schools ranking publisher. Exact ranks were transcribed from HighSchoolTrends; see Rank tables.";
      rankingSource.setAttribute("aria-label","U.S. News 2026–2027 Best High Schools ranking (opens in a new tab)");
      const rankTables = sourceLink("https://highschooltrends.org/atlas","Rank tables");
      rankTables.id = "ranking-tables-link";
      rankTables.title = "HighSchoolTrends republication: browse states and their public-school rank tables. This is the secondary source used for exact ranks.";
      rankTables.setAttribute("aria-label","HighSchoolTrends public-school rank tables, secondary data source (opens in a new tab)");
      rankingFamily.append(rankingSource," · Public schools · ",rankTables);
    }
    document.getElementById("rank-column").querySelector(".sort-label").textContent = privateView ? "Private rank" : "National rank";
    document.getElementById("national-rank-range").textContent = schools.length ? `#${d3.min(schools,s=>s.rank)}–#${d3.max(schools,s=>s.rank)}` : "Unavailable";
    document.getElementById("empty-reset").textContent = "Clear location";
    applyFilters();
    if (selectedSchool && !profile.hidden) selectSchool(selectedSchool,{announce:false});
    else clearSelection();
  }
  document.getElementById("audit-coverage").textContent = `All ${payload.summary.audit_cutoff} national ranks through the cutoff were reviewed, with zero unresolved decisions.`;
  function renderSchoolOptions() {
    const terms = normalize(schoolSearch.value).split(/\s+/).filter(Boolean);
    const available = schools;
    schoolOptions.replaceChildren();
    function addChoice(label,choice,selected,detail) {
      const button = element("button","school-option");
      button.type = "button";
      button.setAttribute("aria-pressed",String(selected));
      button.append(element("span",null,label));
      if (detail) button.append(element("small",null,detail));
      button.addEventListener("click",()=>{
        if (!choice) {
          clearFilters();
          schoolPicker.querySelector("summary").focus();
          return;
        }
        schoolChoice=choice;
        schoolSearch.value="";
        schoolPicker.open=false;
        applyFilters();
        if (choice.type === "school") selectSchool(visibleSchools.find(school=>school.school_id===choice.id));
        schoolPicker.querySelector("summary").focus();
      });
      schoolOptions.append(button);
    }
    addChoice("All schools & locations",null,!schoolChoice);
    const matches = text => terms.every(term=>normalize(text).includes(term));
    const matchingStates = [...new Set([...available.map(school=>school.state),...(schoolChoice?.type === "state" ? [schoolChoice.id] : [])])].filter(state=>matches(`${stateNames[state]} ${state}`)).sort((a,b)=>stateNames[a].localeCompare(stateNames[b]));
    if (matchingStates.length) schoolOptions.append(element("div","option-heading","States"));
    matchingStates.forEach(state=>{
      const count=available.filter(school=>school.state===state).length;
      addChoice(stateNames[state],{type:"state",id:state,label:stateNames[state]},schoolChoice?.type==="state" && schoolChoice.id===state,`${count} ${count===1 ? "school" : "schools"}`);
    });
    const cities = new Map();
    available.forEach(school=>{
      const id=`${school.school_listed_city}|${school.state}`;
      if(!cities.has(id)) cities.set(id,{id,state:school.state,label:`${school.school_listed_city}, ${school.state}`,count:0});
      cities.get(id).count++;
    });
    if (schoolChoice?.type === "city" && !cities.has(schoolChoice.id)) cities.set(schoolChoice.id,{...schoolChoice,count:0});
    const matchingCities=[...cities.values()].filter(city=>matches(`${city.label} ${stateNames[city.state]}`)).sort((a,b)=>a.label.localeCompare(b.label));
    if(matchingCities.length) schoolOptions.append(element("div","option-heading","Cities"));
    matchingCities.forEach(city=>addChoice(city.label,{type:"city",id:city.id,state:city.state,label:city.label},schoolChoice?.type==="city" && schoolChoice.id===city.id,`${city.count} ${city.count===1 ? "school" : "schools"}`));
    const matchingSchools=available.filter(school=>terms.every(term=>searchableText.get(school.school_id).includes(term))).sort((a,b)=>a.school.localeCompare(b.school));
    if(matchingSchools.length) schoolOptions.append(element("div","option-heading","Schools"));
    matchingSchools.forEach(school=>addChoice(school.school,{type:"school",id:school.school_id,label:school.school},schoolChoice?.type==="school" && schoolChoice.id===school.school_id,`${cleanCommunity(school.community)}, ${school.state}`));
    if(!matchingStates.length && !matchingCities.length && !matchingSchools.length) schoolOptions.append(element("p","options-empty","No matching states, cities, or schools."));
    document.getElementById("school-options-status").textContent=`${matchingStates.length} states, ${matchingCities.length} cities, and ${matchingSchools.length} schools found`;
    document.getElementById("school-picker-label").textContent=schoolChoice?.label || "School or location";
    schoolPicker.querySelector("summary").setAttribute("aria-label",schoolChoice ? `School or location: ${schoolChoice.label}` : "School or location");
  }
  schoolSearch.addEventListener("input",renderSchoolOptions);
  schoolSearch.addEventListener("keydown",event=>{if(event.key==="ArrowDown"){event.preventDefault();schoolOptions.querySelector("button")?.focus();}});
  schoolOptions.addEventListener("keydown",event=>{
    const buttons=[...schoolOptions.querySelectorAll("button")],index=buttons.indexOf(document.activeElement);
    if(event.key==="ArrowDown" || event.key==="ArrowUp"){
      event.preventDefault();
      buttons[(index+(event.key==="ArrowDown"?1:-1)+buttons.length)%buttons.length]?.focus();
    }
  });
  schoolPicker.addEventListener("toggle",()=>{if(schoolPicker.open){budgetSettings.open=false;renderSchoolOptions();schoolSearch.focus();}else{schoolSearch.value="";}});
  budgetSettings.addEventListener("toggle",()=>{if(budgetSettings.open) schoolPicker.open=false;});
  sortHeaders.forEach(button=>button.addEventListener("click",()=>{
    const key = button.dataset.sort;
    sortDirection = sortKey === key ? sortDirection === "ascending" ? "descending" : "ascending" : key === "value" && !boardingView() ? "descending" : "ascending";
    sortKey = key;
    renderList();
    document.querySelector(".school-table-wrap").scrollTop=0;
  }));
  scopeControl.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
    schoolScope=button.dataset.scope;
    if (schoolChoice?.type === "school") schoolChoice=null;
    schoolSearch.value="";
    schoolPicker.open=false;
    configureComparison();
  }));
  attendanceControl.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{privateAttendance=button.dataset.attendance;if(schoolChoice?.type==="school")schoolChoice=null;schoolSearch.value="";schoolPicker.open=false;configureComparison();}));
  scopeControl.addEventListener("keydown",event=>{
    if(!["ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const buttons=[...scopeControl.querySelectorAll("button")],index=buttons.indexOf(document.activeElement);
    const next=event.key==="Home" ? 0 : event.key==="End" ? buttons.length-1 : (index+(event.key==="ArrowRight" ? 1 : -1)+buttons.length)%buttons.length;
    buttons[next].focus();buttons[next].click();
  });
  const budgetForm = document.getElementById("budget-form");
  const budgetStatus = document.getElementById("budget-status");
  budgetStatus.textContent = persistenceMessage;
  function persistCostEdits() {
    const next={nonHousingBudgetUsd:budgetInput.valueAsNumber,homeBudgetUsd:homeBudgetInput.valueAsNumber,boardingTravelUsd:travelInput.value===""?null:travelInput.valueAsNumber,students:studentInput.valueAsNumber};
    try { calculate({},next,valueModel.reference_scale_usd); }
    catch (error) {
      budgetStatus.textContent = error.message;
      budgetStatus.dataset.state = 'validation';
      return;
    }
    scenario = next;
    configureComparison();
    budgetStatus.textContent = 'Pending';
    budgetStatus.dataset.state = 'pending';
    try {
      localStorage.setItem(SCENARIO_KEY,JSON.stringify(scenario));
      budgetStatus.textContent = 'Saved';
      budgetStatus.dataset.state = 'saved';
    } catch (error) {
      budgetStatus.textContent = `Could not save costs: ${error.message}. Your edits remain in this view.`;
      budgetStatus.dataset.state = 'failure';
    }
  }
  function synchronizeCosts() {
    if (['validation', 'failure', 'pending'].includes(budgetStatus.dataset.state)) return;
    try {
      const saved = localStorage.getItem(SCENARIO_KEY);
      const next = saved === null ? defaultScenario() : JSON.parse(saved);
      calculate({}, next, valueModel.reference_scale_usd);
      scenario = next;
      budgetInput.value = next.nonHousingBudgetUsd;
      homeBudgetInput.value = next.homeBudgetUsd;
      travelInput.value = next.boardingTravelUsd ?? '';
      studentInput.value = next.students;
      configureComparison();
      budgetStatus.textContent = saved === null ? 'Research defaults' : 'Saved';
      budgetStatus.dataset.state = 'saved';
    } catch (error) {
      budgetStatus.textContent = `Could not load saved costs: ${error.message}. Your edits remain in this view.`;
      budgetStatus.dataset.state = 'failure';
    }
  }
  listen(window, 'storage', event => { if (event.key === SCENARIO_KEY) synchronizeCosts(); });
  listen(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') synchronizeCosts(); });
  budgetForm.addEventListener('submit', event => event.preventDefault());
  budgetForm.addEventListener('input', persistCostEdits);
  document.getElementById("budget-defaults").addEventListener("click",() => {
    budgetInput.value=valueModel.default_non_housing_budget_usd;
    homeBudgetInput.value=valueModel.default_home_budget_usd;
    travelInput.value=valueModel.default_boarding_travel_usd??"";
    studentInput.value = valueModel.default_students;
    persistCostEdits();
  });
  listen(document,"pointerdown",event => {if (budgetSettings.open && !budgetSettings.contains(event.target)) budgetSettings.open=false;if(schoolPicker.open && !schoolPicker.contains(event.target)) schoolPicker.open=false;});
  listen(document,"keydown",event => {if(event.key === "Escape"){if(schoolPicker.open){schoolPicker.open=false;schoolPicker.querySelector("summary").focus();}budgetSettings.open=false;}});
  document.getElementById("empty-reset").addEventListener("click",clearFilters);
  function showScopeNotice(message,audit=false){
    scopeNotice.replaceChildren(element("span",null,message));
    if(audit){const link=element("a",null," View the complete public admission audit ↗");link.href="admissions-audit.html";scopeNotice.append(link);}
    scopeNotice.hidden=false;
  }
  function restoreHash() {
    const target = schoolFromHash();
    if (!target) {
      const params = new URLSearchParams(location.hash.slice(1));
      if (["resident","restricted","private"].includes(params.get("scope"))) {
        schoolScope = params.get("scope");
        privateAttendance = params.get("attendance") === "boarding" ? "boarding" : "day";
        schoolSearch.value = ""; schoolChoice = null; schoolPicker.open = false;
        selectedSchool = null;
        configureComparison();
        return;
      }
      if (!params.has("school") && !params.has("private")) return;
      schoolScope = params.has("private") ? "private" : "restricted";
      schoolSearch.value = ""; schoolChoice = null; schoolPicker.open = false;
      selectedSchool = null;
      configureComparison();
      showScopeNotice("This school is outside the current top-100 groups. Choose a school from the current group.",true);
      return;
    }
    schoolScope = isPrivate(target) ? "private" : target.residential_entry ? "resident" : "restricted";
    let modeNotice="";
    if(isPrivate(target)){
      const requested=new URLSearchParams(location.hash.slice(1)).get("attendance"),modes=attendanceData.schools[target.school_id];
      if((requested==="boarding" || requested==="day") && !modes[requested]){
        privateAttendance=modes.day?"day":"boarding";
        modeNotice=`${requested==="boarding"?"Boarding":"Day"} costs are not verified for ${target.school}. Showing its ${privateAttendance} option.`;
      }else privateAttendance=requested==="boarding" || !modes.day?"boarding":"day";
    }
    schoolSearch.value = "";
    schoolChoice = null;
    schoolPicker.open = false;
    selectedSchool = target;
    configureComparison();
    if(selectedSchool) selectSchool(selectedSchool,{updateUrl:false,announce:false});
    if(modeNotice)showScopeNotice(modeNotice);
  }
  listen(window,"hashchange",restoreHash);
  function openMethodologyFromHash() {
    if (["#methodology","#value-methodology"].includes(location.hash)) {
      document.getElementById("methodology-details").open = true;
      document.getElementById(location.hash.slice(1))?.scrollIntoView({block:"start"});
    }
  }
  listen(window,"hashchange",openMethodologyFromHash);
  listen(document,"click",event => {
    const link = event.target.closest('a[href="#methodology"],a[href="#value-methodology"]');
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    document.getElementById("methodology-details").open = true;
    const targetHash = link.getAttribute("href");
    if (targetHash === "#value-methodology") {
      event.preventDefault();
      if (location.hash !== targetHash) history.pushState(null,"",targetHash);
      const explanation = document.getElementById("value-methodology");
      explanation.scrollIntoView({block:"start"});
      explanation.focus({preventScroll:true});
    }
  });
  const chartObserver = new ResizeObserver(() => {
    if (Math.floor(chartWrap.getBoundingClientRect().width) !== lastWidth) drawChart();
  });
  chartObserver.observe(chartWrap);
  let resizeFrame;
  listen(window,"resize",() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(drawChart);
  });
  let downloadUrl;
  function updateDownload() {
    const records = visibleSchools.map(school => ({...school,
      original_livability_quadrant:school.quadrant,
      chart_rank_reference:summary.school_rank_divider,
      chart_value_reference:boardingView()?null:valueDivider,
      chart_cost_reference:boardingView()?valueDivider:null,
      chart_x_metric:boardingView()?"annual_family_cost_usd":"cost_adjusted_livability",
      chart_rank_domain:rankExtent.join("–"),
      chart_scale_basis:"Full school tab or attendance view; centered domain midpoints; location filters preserve scale",
      chart_value_domain:boardingView()?null:valueExtent.join("–"),
      chart_cost_domain:boardingView()?valueExtent.join("–"):null,
      family_housing_source_url:school.housing?.source_url,
      family_housing_geography:school.housing?.geography_name,
      family_housing_zip_code:school.housing?.zip_code,
      family_housing_year:school.housing?.year,
      family_housing_mapping_note:school.housing?.mapping_note,
      value_quadrant:boardingView()?"Boarding cost comparison; campus livability excluded":school.value_is_upper_bound ? "Value ceiling; ordering uncertain" : school.cost_adjusted_livability === null ? "Unavailable" : `${school.rank <= summary.school_rank_divider ? "Better" : "Lower"} rank / ${school.cost_adjusted_livability >= valueDivider ? "Higher" : "Lower"} value`,
      regional_price_index_role:"Context only; not used in the family-cost formula",
      housing_cost_basis:boardingView()?"Current-home budget; campus rent excluded":"Campus-ZIP HUD 3-bedroom gross-rent benchmark",
      private_tuition_included_in_family_cost:isPrivate(school),
      regional_price_year:costData?.year || 2024,
      regional_price_index_us_100:school.price_index,
      housing_price_index:school.cost?.housing_price_index,
      buying_power_vs_us:school.price_index === null ? null : 100/school.price_index,
      price_metro_code:school.cost?.metro_code,
      price_metro_name:school.cost?.metro_name,
      price_source_url:school.cost?.source_url || costData?.source_url,
      price_basis:school.cost?.price_basis || "metro",
      price_region_code:school.cost?.metro_code || school.cost?.region_code,
      price_region_name:school.cost?.price_geography || school.cost?.metro_name || school.cost?.region_name,
      price_mapping_source_url:school.cost?.mapping_source_url,
      price_mapping_note:school.cost?.mapping_note,
      private_tuition_included_in_value:isPrivate(school) && !isBoarding(school) ? school.cost_adjusted_livability===null?null:true:false,
      budget_source_url:valueModel.budget_source_url,
      budget_benchmark_year:valueModel.budget_year,
      budget_basis:boardingView()?"Current-home household benchmark plus boarding costs; unpriced travel retained":"Local 3-bedroom gross rent plus national nonhousing household benchmark plus day school",
      normalized_value_reference_usd:valueModel.reference_scale_usd
    }));
    const csvColumns = [...new Set(["school_id","ranking_family","national_rank","private_rank","eligible_cohort_order",...Object.keys(payload.schools[0]),...records.flatMap(Object.keys)])].filter(key => key !== "cost" && key !== "housing");
    const csvCell = value => `"${String(value ?? "").replaceAll('"','""')}"`;
    const csvRows = records.map(record => csvColumns.map(key => csvCell(Array.isArray(record[key]) ? record[key].join("; ") : record[key])).join(","));
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(new Blob([[csvColumns.map(csvCell).join(","),...csvRows].join("\r\n")],{type:"text/csv;charset=utf-8"}));
    document.getElementById("download-data").href = downloadUrl;
  }
  const initialHash = location.hash;
  const refreshed = performance.getEntriesByType("navigation")[0]?.type === "reload";
  if (refreshed) {
    const initialParams = new URLSearchParams(initialHash.slice(1));
    if (selectedSchool) schoolScope = isPrivate(selectedSchool) ? "private" : selectedSchool.residential_entry ? "resident" : "restricted";
    else if (["resident","restricted","private"].includes(initialParams.get("scope"))) schoolScope = initialParams.get("scope");
    privateAttendance = initialParams.get("attendance") === "boarding" ? "boarding" : "day";
    selectedSchool = null;
    configureComparison();
  }
  else if (selectedSchool) restoreHash();
  else {
    const initialParams = new URLSearchParams(initialHash.slice(1));
    if (initialParams.has("school") || initialParams.has("private") || ["resident","restricted","private"].includes(initialParams.get("scope"))) restoreHash();
    else configureComparison();
  }
  if (["#methodology","#value-methodology"].includes(initialHash)) {
    history.replaceState(null,"",initialHash);
    openMethodologyFromHash();
    document.getElementById(initialHash.slice(1))?.scrollIntoView({block:"start"});
  }


  onPageLeave(() => {
    listeners.forEach(dispose => dispose());
    chartObserver.disconnect();
    cancelAnimationFrame(resizeFrame);
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  });
}
initializePage(mountPage);
