"use strict";

function deepCopyJson(valueToCopy) {
  return JSON.parse(JSON.stringify(valueToCopy));
}

function clampNumber(rawValue, minValue, maxValue) {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return minValue;
  }
  if (parsedValue < minValue) {
    return minValue;
  }
  if (parsedValue > maxValue) {
    return maxValue;
  }
  return parsedValue;
}

function formatInteger(numberValue) {
  const roundedValue = Math.round(numberValue);
  if (!Number.isFinite(roundedValue)) {
    return "-";
  }
  return roundedValue.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function formatFixed(numberValue, fractionDigits) {
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return numberValue.toFixed(fractionDigits);
}

function formatPercent(numberValue) {
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  return (numberValue * 100).toFixed(1) + "%";
}

function getCssVar(variableName) {
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
}

function tooltipShow(htmlValue, xPosition, yPosition) {
  const tooltip = document.getElementById("tooltip");
  tooltip.innerHTML = htmlValue;
  tooltip.style.display = "block";
  tooltip.style.left = Math.round(xPosition + 14) + "px";
  tooltip.style.top = Math.round(yPosition + 14) + "px";
}

function tooltipHide() {
  const tooltip = document.getElementById("tooltip");
  tooltip.style.display = "none";
}

const enumMaps = {
  scale: {
    town: { label: "Town", multiplier: 0.35 },
    region: { label: "Region", multiplier: 1.0 },
    nation: { label: "Nation", multiplier: 6.0 },
  },
  resilience: {
    fragile: { label: "Fragile", opsMultiplier: 0.85, capitalMultiplier: 0.90, expertMultiplier: 0.90 },
    robust: { label: "Robust", opsMultiplier: 1.00, capitalMultiplier: 1.00, expertMultiplier: 1.00 },
    redundant: { label: "Redundant", opsMultiplier: 1.25, capitalMultiplier: 1.35, expertMultiplier: 1.15 },
  },
  autarky: {
    "import-heavy": { label: "Import-heavy", opsMultiplier: 0.75, capitalMultiplier: 0.80, expertMultiplier: 0.85 },
    "import-light": { label: "Import-light", opsMultiplier: 1.00, capitalMultiplier: 1.00, expertMultiplier: 1.00 },
    "import-free": { label: "Import-free", opsMultiplier: 1.35, capitalMultiplier: 1.45, expertMultiplier: 1.20 },
  },
  level: {
    off: { label: "Off", opsMultiplier: 0.0, expertPoolMultiplier: 0.0, capitalMultiplier: 0.0 },
    minimal: { label: "Minimal", opsMultiplier: 0.78, expertPoolMultiplier: 0.80, capitalMultiplier: 0.80 },
    modern: { label: "Modern", opsMultiplier: 1.0, expertPoolMultiplier: 1.0, capitalMultiplier: 1.0 },
  },
  scarcity: {
    common: { label: "Common (1.0%)", fractionEligible: 0.010 },
    scarce: { label: "Scarce (0.3%)", fractionEligible: 0.003 },
    "very-scarce": { label: "Very scarce (0.1%)", fractionEligible: 0.001 },
  },
};

const defaultDomains = [
  {
    key: "food",
    name: "Food",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["energy", "fuel", "chemicals", "logistics", "manufacturing"],
    opsPositions: 3500,
    maintRatio: 0.55,
    expertPool: 1500,
    capitalIndex: 5000,
    depreciationRate: 0.060,
  },
  {
    key: "water",
    name: "Water and Sanitation",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["energy", "chemicals", "manufacturing"],
    opsPositions: 2000,
    maintRatio: 0.80,
    expertPool: 800,
    capitalIndex: 3500,
    depreciationRate: 0.040,
  },
  {
    key: "energy",
    name: "Electric Grid",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "very-scarce",
    requires: ["manufacturing", "machine_tools", "logistics"],
    opsPositions: 4500,
    maintRatio: 1.15,
    expertPool: 1500,
    capitalIndex: 9000,
    depreciationRate: 0.040,
  },
  {
    key: "fuel",
    name: "Fuels (refining)",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "very-scarce",
    requires: ["energy", "manufacturing", "machine_tools", "logistics"],
    opsPositions: 2000,
    maintRatio: 1.25,
    expertPool: 1100,
    capitalIndex: 6000,
    depreciationRate: 0.050,
  },
  {
    key: "chemicals",
    name: "Chemicals (fertilizer, chlorine)",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "very-scarce",
    requires: ["energy", "manufacturing", "machine_tools", "logistics"],
    opsPositions: 1700,
    maintRatio: 1.20,
    expertPool: 1200,
    capitalIndex: 5500,
    depreciationRate: 0.050,
  },
  {
    key: "manufacturing",
    name: "Manufacturing (basic)",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["energy", "fuel", "logistics", "machine_tools"],
    opsPositions: 3200,
    maintRatio: 1.00,
    expertPool: 1400,
    capitalIndex: 7000,
    depreciationRate: 0.060,
  },
  {
    key: "machine_tools",
    name: "Machine Tools and Spares",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "very-scarce",
    requires: ["energy", "manufacturing", "logistics"],
    opsPositions: 1500,
    maintRatio: 1.10,
    expertPool: 1400,
    capitalIndex: 4500,
    depreciationRate: 0.060,
  },
  {
    key: "logistics",
    name: "Transport and Logistics",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "common",
    requires: ["fuel", "manufacturing"],
    opsPositions: 4800,
    maintRatio: 0.70,
    expertPool: 900,
    capitalIndex: 6500,
    depreciationRate: 0.080,
  },
  {
    key: "governance",
    name: "Governance and Security",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "common",
    requires: ["food", "energy", "logistics"],
    opsPositions: 3500,
    maintRatio: 0.25,
    expertPool: 700,
    capitalIndex: 1500,
    depreciationRate: 0.040,
  },
  {
    key: "institutions",
    name: "Institutions (courts, registries)",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["governance", "education"],
    opsPositions: 1200,
    maintRatio: 0.20,
    expertPool: 900,
    capitalIndex: 800,
    depreciationRate: 0.030,
  },
  {
    key: "finance",
    name: "Finance and Payments",
    enabled: true,
    level: "modern",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["institutions", "telecom"],
    opsPositions: 900,
    maintRatio: 0.20,
    expertPool: 800,
    capitalIndex: 800,
    depreciationRate: 0.030,
  },
  {
    key: "telecom",
    name: "Telecom (minimal)",
    enabled: true,
    level: "minimal",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["energy", "manufacturing", "logistics"],
    opsPositions: 900,
    maintRatio: 0.95,
    expertPool: 650,
    capitalIndex: 4000,
    depreciationRate: 0.050,
  },
  {
    key: "compute",
    name: "Compute (optional)",
    enabled: false,
    level: "minimal",
    domainResilience: "robust",
    domainAutarky: "import-heavy",
    expertScarcity: "very-scarce",
    requires: ["energy", "telecom", "manufacturing", "logistics"],
    opsPositions: 700,
    maintRatio: 1.05,
    expertPool: 550,
    capitalIndex: 2500,
    depreciationRate: 0.080,
  },
  {
    key: "medicine",
    name: "Medicine (minimal)",
    enabled: true,
    level: "minimal",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "scarce",
    requires: ["water", "energy", "chemicals", "logistics"],
    opsPositions: 1400,
    maintRatio: 0.40,
    expertPool: 900,
    capitalIndex: 2500,
    depreciationRate: 0.060,
  },
  {
    key: "education",
    name: "Education and Training",
    enabled: true,
    level: "minimal",
    domainResilience: "robust",
    domainAutarky: "import-light",
    expertScarcity: "common",
    requires: ["food", "governance"],
    opsPositions: 1600,
    maintRatio: 0.15,
    expertPool: 1000,
    capitalIndex: 2000,
    depreciationRate: 0.040,
  },
];

const defaultGlobalState = {
  globalScale: "region",
  globalResilience: "robust",
  globalAutarky: "import-light",
  coverageFactor: 5.0,

  lifeExpectancyYears: 75,
  workingAgeStart: 18,
  retirementAge: 65,
  workforceParticipation: 0.75,
  coreFractionOfWorkers: 0.35,

  fertilityRate: 2.10,
  survivalToWorkingAge: 0.98,
  femaleShare: 0.50,

  trainingCompletionAge: 25,
  expertAttritionRate: 0.020,
  trainingOverhead: 0.12,

  capitalProductivity: 0.050,
  extraMarketFriction: 1.00,
};

let state = {
  globals: deepCopyJson(defaultGlobalState),
  domains: deepCopyJson(defaultDomains),
};

let lastModelResult = null;
let rerenderScheduled = false;
let enhancedNumericControls = [];

const controlGuidanceSpecs = {
  globalScale: {
    meaning: "Sets the overall size multiplier for the entire model.",
    formatCurrent: (rawValue) => {
      const spec = enumMaps.scale[rawValue];
      return spec ? `${spec.label} (${spec.multiplier}x)` : String(rawValue);
    },
    impact: (rawValue) => {
      if (rawValue === "town") {
        return "Smallest workforce and capital footprint.";
      }
      if (rawValue === "nation") {
        return "Largest workforce and capital footprint.";
      }
      return "Balanced baseline footprint.";
    },
  },
  globalResilience: {
    meaning: "Controls how much redundancy is required in each domain.",
    formatCurrent: (rawValue) => {
      const spec = enumMaps.resilience[rawValue];
      return spec ? spec.label : String(rawValue);
    },
    impact: (rawValue) => {
      if (rawValue === "fragile") {
        return "Lower headcount, but less slack for disruptions.";
      }
      if (rawValue === "redundant") {
        return "Higher headcount and capital for failure tolerance.";
      }
      return "Moderate redundancy and staffing pressure.";
    },
  },
  globalAutarky: {
    meaning: "Defines how much production must be local vs imported.",
    formatCurrent: (rawValue) => {
      const spec = enumMaps.autarky[rawValue];
      return spec ? spec.label : String(rawValue);
    },
    impact: (rawValue) => {
      if (rawValue === "import-heavy") {
        return "Lower local burden, stronger external dependency.";
      }
      if (rawValue === "import-free") {
        return "Highest local burden, least external dependency.";
      }
      return "Mixed local production and trade exposure.";
    },
  },
  coverageFactor: {
    meaning: "Inflates baseline roles into staffed FTE for real operations.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lean staffing buffer with less resilience margin.",
        "Balanced staffing buffer for normal operations.",
        "Large staffing buffer with higher population demand."
      ),
  },
  lifeExpectancyYears: {
    meaning: "Used to estimate cohort flow and working-age population share.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement) + " years",
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Short lifespan raises turnover risk in the labor pool.",
        "Middle range balance for turnover and labor duration.",
        "Long lifespan can reduce yearly replacement inflow."
      ),
  },
  workingAgeStart: {
    meaning: "Age when people enter the workforce in the model.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement) + " years",
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Earlier entry expands workforce years.",
        "Mid-range entry age with balanced workforce span.",
        "Later entry shrinks workforce years and raises pressure."
      ),
  },
  retirementAge: {
    meaning: "Age when workers exit the labor force.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement) + " years",
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Earlier retirement increases replacement demand.",
        "Middle retirement age with moderate replacement demand.",
        "Later retirement reduces annual replacement pressure."
      ),
  },
  workforceParticipation: {
    meaning: "Share of working-age people active in the labor force.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 1),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Low participation increases minimum population required.",
        "Moderate participation with balanced pressure.",
        "High participation lowers minimum population required."
      ),
  },
  coreFractionOfWorkers: {
    meaning: "Share of workers allocated to critical domains.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 1),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Small core share pushes required population upward.",
        "Balanced core allocation across critical sectors.",
        "Large core share lowers staffing population constraint."
      ),
  },
  fertilityRate: {
    meaning: "Births per woman used for demographic replacement.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Low fertility weakens long-term replacement.",
        "Moderate fertility keeps replacement near balance.",
        "Higher fertility strengthens replacement pipeline."
      ),
  },
  survivalToWorkingAge: {
    meaning: "Fraction of births reaching working age.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 1),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lower survival tightens expert replacement flow.",
        "Moderate survival with manageable pipeline risk.",
        "Higher survival improves replacement capacity."
      ),
  },
  femaleShare: {
    meaning: "Female population share used in cohort-size estimation.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 1),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lower share reduces modeled birth flow.",
        "Middle share keeps cohort assumptions balanced.",
        "Higher share increases modeled birth flow."
      ),
  },
  trainingCompletionAge: {
    meaning: "Age experts complete training and begin full careers.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement) + " years",
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Earlier completion lengthens expert career span.",
        "Moderate completion age with balanced career span.",
        "Later completion shortens careers and raises pipeline demand."
      ),
  },
  expertAttritionRate: {
    meaning: "Annual loss rate of experts due to non-retirement exits.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 2),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lower attrition eases replacement burden.",
        "Moderate attrition with stable replacement demand.",
        "Higher attrition sharply increases pipeline demand."
      ),
  },
  trainingOverhead: {
    meaning: "Extra staffing needed to sustain expert training pipelines.",
    formatCurrent: (rawValue) => formatPercentWithDigits(rawValue, 1),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lean training overhead minimizes staffing load.",
        "Moderate overhead supports pipeline stability.",
        "High overhead adds meaningful core staffing demand."
      ),
  },
  capitalProductivity: {
    meaning: "How much depreciating capital one worker can renew yearly.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement),
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Low productivity needs more staff for capital renewal.",
        "Moderate productivity with balanced renewal staffing.",
        "High productivity reduces renewal staffing demand."
      ),
  },
  extraMarketFriction: {
    meaning: "Additional transaction drag from institutions and markets.",
    formatCurrent: (rawValue, controlElement) => formatNumericControlValue(rawValue, controlElement) + "x",
    impact: (rawValue, controlElement) =>
      getBandMessage(
        controlElement,
        rawValue,
        "Lower friction keeps operating overhead down.",
        "Moderate friction with manageable operating drag.",
        "Higher friction amplifies workforce and capital needs."
      ),
  },
};

function formatPercentWithDigits(rawValue, fractionDigits) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }
  return (numericValue * 100).toFixed(fractionDigits) + "%";
}

function formatNumericControlValue(rawValue, controlElement) {
  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return "-";
  }
  const stepValue = Number(controlElement.step || "1");
  const decimals = getStepDecimals(stepValue);
  return formatBoundValue(numericValue, decimals);
}

function getControlRangeBand(controlElement, rawValue) {
  const numericValue = Number(rawValue);
  const minValue = Number(controlElement.min);
  const maxValue = Number(controlElement.max);
  if (!Number.isFinite(numericValue) || !Number.isFinite(minValue) || !Number.isFinite(maxValue) || maxValue <= minValue) {
    return "mid";
  }
  const ratio = (numericValue - minValue) / (maxValue - minValue);
  if (ratio <= 0.33) {
    return "low";
  }
  if (ratio >= 0.67) {
    return "high";
  }
  return "mid";
}

function getBandMessage(controlElement, rawValue, lowMessage, midMessage, highMessage) {
  const band = getControlRangeBand(controlElement, rawValue);
  if (band === "low") {
    return lowMessage;
  }
  if (band === "high") {
    return highMessage;
  }
  return midMessage;
}

function ensureControlGuidanceElement(controlElement) {
  const fieldContainer = controlElement.parentElement;
  if (!fieldContainer) {
    return null;
  }
  let guidanceElement = fieldContainer.querySelector(".control-guidance");
  if (!guidanceElement) {
    guidanceElement = document.createElement("div");
    guidanceElement.className = "control-guidance";
    fieldContainer.appendChild(guidanceElement);
  }
  return guidanceElement;
}

function ensureControlCurrentValueElement(controlElement) {
  const fieldContainer = controlElement.parentElement;
  if (!fieldContainer) {
    return null;
  }
  const labelElement = fieldContainer.querySelector(".form-label");
  if (!labelElement) {
    return null;
  }
  let currentValueElement = labelElement.querySelector(".control-current-pill");
  if (!currentValueElement) {
    currentValueElement = document.createElement("span");
    currentValueElement.className = "control-current-pill mono";
    labelElement.appendChild(currentValueElement);
  }
  return currentValueElement;
}

function renderControlGuidance() {
  const controlIds = Object.keys(controlGuidanceSpecs);
  for (const controlId of controlIds) {
    const controlElement = document.getElementById(controlId);
    if (!controlElement) {
      continue;
    }
    const guidanceSpec = controlGuidanceSpecs[controlId];
    const guidanceElement = ensureControlGuidanceElement(controlElement);
    if (!guidanceElement) {
      continue;
    }

    const rawValue = controlElement.value;
    const currentValueText = guidanceSpec.formatCurrent ? guidanceSpec.formatCurrent(rawValue, controlElement) : String(rawValue);
    const impactText = guidanceSpec.impact ? guidanceSpec.impact(rawValue, controlElement) : "";
    const currentValueElement = ensureControlCurrentValueElement(controlElement);
    if (currentValueElement) {
      currentValueElement.textContent = currentValueText;
    }

    guidanceElement.innerHTML = "";

    const meaningLine = document.createElement("div");
    meaningLine.className = "guidance-meaning";
    meaningLine.textContent = guidanceSpec.meaning;

    const impactLine = document.createElement("div");
    impactLine.className = "guidance-current";
    impactLine.append("Current: ");

    const currentValueSpan = document.createElement("span");
    currentValueSpan.className = "mono";
    currentValueSpan.textContent = currentValueText;
    impactLine.appendChild(currentValueSpan);

    if (impactText) {
      impactLine.append(" - " + impactText);
    }

    guidanceElement.appendChild(meaningLine);
    guidanceElement.appendChild(impactLine);
  }
}

function buildSelectOptions(selectElement, enumMap, selectedValue) {
  selectElement.innerHTML = "";
  const optionKeys = Object.keys(enumMap);
  for (const optionKey of optionKeys) {
    const optionElement = document.createElement("option");
    optionElement.value = optionKey;
    optionElement.textContent = enumMap[optionKey].label;
    if (optionKey === selectedValue) {
      optionElement.selected = true;
    }
    selectElement.appendChild(optionElement);
  }
}

function getDomainByKey(domainKey) {
  for (const domain of state.domains) {
    if (domain.key === domainKey) {
      return domain;
    }
  }
  return null;
}

function isDomainActive(domain) {
  return Boolean(domain && domain.enabled && domain.level !== "off");
}

function buildActiveDomainMap() {
  const activeDomainMap = {};
  for (const domain of state.domains) {
    activeDomainMap[domain.key] = isDomainActive(domain);
  }
  return activeDomainMap;
}

function computeDemographyDerived() {
  const lifeExpectancyYears = clampNumber(state.globals.lifeExpectancyYears, 35, 95);
  const workingAgeStart = clampNumber(state.globals.workingAgeStart, 12, 30);
  const retirementAge = clampNumber(state.globals.retirementAge, 40, 80);
  const workforceParticipation = clampNumber(state.globals.workforceParticipation, 0.40, 0.95);
  const coreFractionOfWorkers = clampNumber(state.globals.coreFractionOfWorkers, 0.10, 0.70);

  const fertilityRate = clampNumber(state.globals.fertilityRate, 0.8, 4.5);
  const survivalToWorkingAge = clampNumber(state.globals.survivalToWorkingAge, 0.80, 0.995);
  const femaleShare = clampNumber(state.globals.femaleShare, 0.45, 0.55);

  const trainingCompletionAge = clampNumber(state.globals.trainingCompletionAge, 18, 32);
  const expertAttritionRate = clampNumber(state.globals.expertAttritionRate, 0.0, 0.060);
  const trainingOverhead = clampNumber(state.globals.trainingOverhead, 0.0, 0.60);

  const workingYears = Math.max(0.0, retirementAge - workingAgeStart);
  const workingAgeShare = Math.min(0.90, Math.max(0.0, workingYears / lifeExpectancyYears));
  const workersPerCapita = workingAgeShare * workforceParticipation;
  const coreWorkersPerCapita = workersPerCapita * coreFractionOfWorkers;

  const birthsPerYearPerCapita = (femaleShare * fertilityRate) / lifeExpectancyYears;
  const newAdultsPerYearPerCapita = birthsPerYearPerCapita * survivalToWorkingAge;
  const newAdultsPerYearPerMillion = newAdultsPerYearPerCapita * 1_000_000;

  const replacementFactor = femaleShare * fertilityRate * survivalToWorkingAge;

  return {
    lifeExpectancyYears,
    workingAgeStart,
    retirementAge,
    workforceParticipation,
    coreFractionOfWorkers,
    fertilityRate,
    survivalToWorkingAge,
    femaleShare,
    trainingCompletionAge,
    expertAttritionRate,
    trainingOverhead,
    workingAgeShare,
    workersPerCapita,
    coreWorkersPerCapita,
    newAdultsPerYearPerCapita,
    newAdultsPerYearPerMillion,
    replacementFactor,
  };
}

function computeInstitutionFinanceMultipliers(activeDomainMap) {
  const institutionsDomain = getDomainByKey("institutions");
  const financeDomain = getDomainByKey("finance");
  const educationDomain = getDomainByKey("education");

  function effectiveLevel(domain) {
    if (!domain) {
      return "off";
    }
    if (!activeDomainMap[domain.key]) {
      return "off";
    }
    return domain.level;
  }

  const institutionsLevel = effectiveLevel(institutionsDomain);
  const financeLevel = effectiveLevel(financeDomain);
  const educationLevel = effectiveLevel(educationDomain);

  const institutionsFriction = institutionsLevel === "modern" ? 1.00 : institutionsLevel === "minimal" ? 1.20 : 1.45;
  const financeFriction = financeLevel === "modern" ? 1.00 : financeLevel === "minimal" ? 1.15 : 1.30;

  const institutionsHuman = institutionsLevel === "modern" ? 1.00 : institutionsLevel === "minimal" ? 0.85 : 0.65;
  const financeHuman = financeLevel === "modern" ? 1.00 : financeLevel === "minimal" ? 0.90 : 0.75;
  const educationHuman = educationLevel === "modern" ? 1.00 : educationLevel === "minimal" ? 0.80 : 0.50;

  const extraMarketFriction = clampNumber(state.globals.extraMarketFriction, 0.90, 1.60);

  return {
    transactionFriction: institutionsFriction * financeFriction * extraMarketFriction,
    humanCapitalMultiplier: institutionsHuman * financeHuman * educationHuman,
    institutionsLevel,
    financeLevel,
    educationLevel,
  };
}

function computeFeasibility(activeDomainMap, demographyDerived) {
  const issues = [];

  if (demographyDerived.workingAgeStart >= demographyDerived.retirementAge) {
    issues.push({ type: "error", title: "Invalid ages", detail: "Work start age must be lower than retirement age." });
  }

  if (demographyDerived.trainingCompletionAge >= demographyDerived.retirementAge) {
    issues.push({ type: "error", title: "Invalid training completion age", detail: "Training completion age must be lower than retirement age." });
  }

  if (demographyDerived.replacementFactor < 1.0) {
    issues.push({
      type: "error",
      title: "Not demographically sustainable",
      detail: "Replacement factor is below 1.0. Population shrinks without migration.",
    });
  }

  const dependencyViolations = [];
  for (const domain of state.domains) {
    if (!isDomainActive(domain)) {
      continue;
    }
    const missingKeys = [];
    for (const requiredKey of domain.requires || []) {
      if (!activeDomainMap[requiredKey]) {
        missingKeys.push(requiredKey);
      }
    }
    if (missingKeys.length > 0) {
      dependencyViolations.push({ domainKey: domain.key, domainName: domain.name, missing: missingKeys });
    }
  }

  if (dependencyViolations.length > 0) {
    issues.push({
      type: "error",
      title: "Infeasible dependency graph",
      detail: "Some enabled domains depend on disabled domains. Fix dependencies or disable the dependent domain.",
      data: dependencyViolations,
    });
  }

  if (!activeDomainMap["institutions"] || !activeDomainMap["finance"]) {
    issues.push({
      type: "warning",
      title: "Weak market infrastructure",
      detail: "Market economy works poorly without institutions and finance. Higher transaction friction is assumed.",
    });
  }

  const feasible = issues.filter((issue) => issue.type === "error").length === 0;
  return { feasible, issues };
}

function computeModel() {
  const activeDomainMap = buildActiveDomainMap();
  const demographyDerived = computeDemographyDerived();

  const globalScaleSpec = enumMaps.scale[state.globals.globalScale];
  const globalResilienceSpec = enumMaps.resilience[state.globals.globalResilience];
  const globalAutarkySpec = enumMaps.autarky[state.globals.globalAutarky];
  const coverageFactor = clampNumber(state.globals.coverageFactor, 3.0, 8.0);
  const capitalProductivity = clampNumber(state.globals.capitalProductivity, 0.005, 0.200);

  const institutionFinance = computeInstitutionFinanceMultipliers(activeDomainMap);
  const transactionFriction = institutionFinance.transactionFriction;
  const humanCapitalMultiplier = institutionFinance.humanCapitalMultiplier;

  const globalOpsMultiplier =
    globalScaleSpec.multiplier *
    globalResilienceSpec.opsMultiplier *
    globalAutarkySpec.opsMultiplier *
    transactionFriction;

  const globalCapitalMultiplier =
    globalScaleSpec.multiplier *
    globalResilienceSpec.capitalMultiplier *
    globalAutarkySpec.capitalMultiplier *
    transactionFriction;

  const globalExpertMultiplier =
    globalScaleSpec.multiplier *
    globalResilienceSpec.expertMultiplier *
    globalAutarkySpec.expertMultiplier;

  const careerLengthYears = Math.max(1.0, demographyDerived.retirementAge - demographyDerived.trainingCompletionAge);
  const retirementReplacementRatePerYear = 1.0 / careerLengthYears;
  const expertReplacementRatePerYear = retirementReplacementRatePerYear + demographyDerived.expertAttritionRate;

  const domainResults = [];
  let totalCoreWorkforce = 0;

  for (const domain of state.domains) {
    const levelSpec = enumMaps.level[domain.level];
    const domainResilienceSpec = enumMaps.resilience[domain.domainResilience];
    const domainAutarkySpec = enumMaps.autarky[domain.domainAutarky];

    const enabledMultiplier = isDomainActive(domain) ? 1.0 : 0.0;

    const domainOpsMultiplier =
      enabledMultiplier *
      levelSpec.opsMultiplier *
      globalOpsMultiplier *
      domainResilienceSpec.opsMultiplier *
      domainAutarkySpec.opsMultiplier;

    const domainCapitalMultiplier =
      enabledMultiplier *
      levelSpec.capitalMultiplier *
      globalCapitalMultiplier *
      domainResilienceSpec.capitalMultiplier *
      domainAutarkySpec.capitalMultiplier;

    const domainExpertMultiplier =
      enabledMultiplier *
      levelSpec.expertPoolMultiplier *
      globalExpertMultiplier *
      domainResilienceSpec.expertMultiplier *
      domainAutarkySpec.expertMultiplier;

    const opsStaff = domain.opsPositions * domainOpsMultiplier * coverageFactor;
    const maintStaff = opsStaff * domain.maintRatio;
    const opsPlusMaint = opsStaff + maintStaff;

    const capitalRenewalUnitsPerYear = domain.capitalIndex * domain.depreciationRate * domainCapitalMultiplier;
    const capitalRenewalStaff = capitalRenewalUnitsPerYear / capitalProductivity;

    const expertPool = domain.expertPool * domainExpertMultiplier;
    const trainingStaff = expertPool * demographyDerived.trainingOverhead;

    const coreTotal = opsPlusMaint + capitalRenewalStaff + expertPool + trainingStaff;

    const baseEligibleFraction = enumMaps.scarcity[domain.expertScarcity].fractionEligible;
    const effectiveEligibleFraction = Math.max(0.00005, Math.min(0.05, baseEligibleFraction * humanCapitalMultiplier));

    const neededNewExpertsPerYear = expertPool * expertReplacementRatePerYear;
    const pipelinePopulationRequired =
      demographyDerived.newAdultsPerYearPerCapita > 0
        ? neededNewExpertsPerYear / (demographyDerived.newAdultsPerYearPerCapita * effectiveEligibleFraction)
        : Number.POSITIVE_INFINITY;

    domainResults.push({
      key: domain.key,
      name: domain.name,
      enabled: domain.enabled,
      level: domain.level,
      opsPlusMaint,
      capitalRenewalStaff,
      expertPool,
      trainingStaff,
      coreTotal,
      pipelinePopulationRequired,
      neededNewExpertsPerYear,
      effectiveEligibleFraction,
    });

    totalCoreWorkforce += coreTotal;
  }

  const staffingPopulationRequired =
    demographyDerived.coreWorkersPerCapita > 0 ? totalCoreWorkforce / demographyDerived.coreWorkersPerCapita : Number.POSITIVE_INFINITY;

  let pipelinePopulationRequiredMax = 0;
  let pipelineDriverKey = "";
  for (const domainResult of domainResults) {
    if (domainResult.coreTotal <= 0.01) {
      continue;
    }
    if (domainResult.pipelinePopulationRequired > pipelinePopulationRequiredMax) {
      pipelinePopulationRequiredMax = domainResult.pipelinePopulationRequired;
      pipelineDriverKey = domainResult.key;
    }
  }

  const domainResultsSortedByCore = [...domainResults].sort((a, b) => b.coreTotal - a.coreTotal);
  const topCoreDriverKey = domainResultsSortedByCore.length > 0 ? domainResultsSortedByCore[0].key : "";

  const finalPopulationRequired = Math.max(staffingPopulationRequired, pipelinePopulationRequiredMax);
  const bindingConstraint = staffingPopulationRequired >= pipelinePopulationRequiredMax ? "Core staffing" : "Expert pipeline";

  const feasibility = computeFeasibility(activeDomainMap, demographyDerived);

  const domainFeasibilityMap = {};
  for (const domain of state.domains) {
    domainFeasibilityMap[domain.key] = true;
  }
  for (const issue of feasibility.issues) {
    if (issue.type !== "error") {
      continue;
    }
    if (issue.title !== "Infeasible dependency graph") {
      continue;
    }
    const details = issue.data || [];
    for (const detail of details) {
      domainFeasibilityMap[detail.domainKey] = false;
    }
  }

  const domainResultsSortedByPipeline = [...domainResults].sort((a, b) => b.pipelinePopulationRequired - a.pipelinePopulationRequired);

  return {
    activeDomainMap,
    demographyDerived,
    institutionFinance,
    transactionFriction,
    humanCapitalMultiplier,
    totalCoreWorkforce,
    staffingPopulationRequired,
    pipelinePopulationRequiredMax,
    pipelineDriverKey,
    topCoreDriverKey,
    finalPopulationRequired,
    bindingConstraint,
    feasibility,
    domainFeasibilityMap,
    domainResults,
    domainResultsSortedByCore,
    domainResultsSortedByPipeline,
  };
}

function updateGlobalControlsFromState() {
  document.getElementById("globalScale").value = state.globals.globalScale;
  document.getElementById("globalResilience").value = state.globals.globalResilience;
  document.getElementById("globalAutarky").value = state.globals.globalAutarky;
  document.getElementById("coverageFactor").value = String(state.globals.coverageFactor);

  document.getElementById("lifeExpectancyYears").value = String(state.globals.lifeExpectancyYears);
  document.getElementById("workingAgeStart").value = String(state.globals.workingAgeStart);
  document.getElementById("retirementAge").value = String(state.globals.retirementAge);
  document.getElementById("workforceParticipation").value = String(state.globals.workforceParticipation);
  document.getElementById("coreFractionOfWorkers").value = String(state.globals.coreFractionOfWorkers);

  document.getElementById("fertilityRate").value = String(state.globals.fertilityRate);
  document.getElementById("survivalToWorkingAge").value = String(state.globals.survivalToWorkingAge);
  document.getElementById("femaleShare").value = String(state.globals.femaleShare);

  document.getElementById("trainingCompletionAge").value = String(state.globals.trainingCompletionAge);
  document.getElementById("expertAttritionRate").value = String(state.globals.expertAttritionRate);
  document.getElementById("trainingOverhead").value = String(state.globals.trainingOverhead);

  document.getElementById("capitalProductivity").value = String(state.globals.capitalProductivity);
  document.getElementById("extraMarketFriction").value = String(state.globals.extraMarketFriction);
  syncEnhancedNumericControls();
  renderControlGuidance();
}

function getStepDecimals(stepValue) {
  const stepText = String(stepValue || "1");
  if (stepText.includes("e-")) {
    const exponentPart = stepText.split("e-")[1];
    const parsedExponent = Number(exponentPart);
    return Number.isFinite(parsedExponent) ? parsedExponent : 0;
  }
  if (!stepText.includes(".")) {
    return 0;
  }
  return stepText.split(".")[1].length;
}

function formatBoundValue(numberValue, decimals) {
  if (!Number.isFinite(numberValue)) {
    return "-";
  }
  if (decimals <= 0) {
    return String(Math.round(numberValue));
  }
  return numberValue.toFixed(decimals);
}

function syncEnhancedNumericControls() {
  for (const control of enhancedNumericControls) {
    control.rangeElement.value = String(control.numberElement.value);
    control.valueElement.textContent = formatBoundValue(Number(control.numberElement.value), control.decimals);
  }
}

function enhanceNumericControls() {
  if (enhancedNumericControls.length > 0) {
    return;
  }

  const numberInputs = document.querySelectorAll(".control-panel input[type='number']");
  for (const numberInput of numberInputs) {
    const minValue = Number(numberInput.min);
    const maxValue = Number(numberInput.max);
    const stepValue = Number(numberInput.step || "1");
    if (!Number.isFinite(minValue) || !Number.isFinite(maxValue) || !Number.isFinite(stepValue)) {
      continue;
    }

    const parentElement = numberInput.parentElement;
    if (!parentElement) {
      continue;
    }

    const labelElement = parentElement.querySelector(".form-label");
    const labelText = labelElement ? labelElement.textContent.trim() : numberInput.id;

    const controlElement = document.createElement("div");
    controlElement.className = "numeric-control";

    const mainRowElement = document.createElement("div");
    mainRowElement.className = "numeric-main";

    const rangeInput = document.createElement("input");
    rangeInput.type = "range";
    rangeInput.className = "form-range numeric-range";
    rangeInput.min = String(minValue);
    rangeInput.max = String(maxValue);
    rangeInput.step = String(stepValue);
    rangeInput.value = String(numberInput.value);
    rangeInput.setAttribute("aria-label", labelText);
    rangeInput.title = `Range: ${minValue} to ${maxValue}`;

    numberInput.classList.add("numeric-hidden-input");
    numberInput.setAttribute("aria-hidden", "true");
    numberInput.tabIndex = -1;

    const valueElement = document.createElement("div");
    valueElement.className = "numeric-value mono";
    valueElement.setAttribute("aria-live", "polite");

    const decimals = getStepDecimals(stepValue);
    valueElement.textContent = formatBoundValue(Number(numberInput.value), decimals);

    let isPointerAdjusting = false;
    let hideValueTimer = null;

    function clearValueHideTimer() {
      if (hideValueTimer !== null) {
        window.clearTimeout(hideValueTimer);
        hideValueTimer = null;
      }
    }

    function showValueBadge() {
      clearValueHideTimer();
      valueElement.classList.add("is-visible");
    }

    function scheduleValueHide(delayMs) {
      clearValueHideTimer();
      hideValueTimer = window.setTimeout(() => {
        if (!isPointerAdjusting) {
          valueElement.classList.remove("is-visible");
        }
      }, delayMs);
    }

    parentElement.insertBefore(controlElement, numberInput);
    mainRowElement.appendChild(rangeInput);
    mainRowElement.appendChild(valueElement);
    controlElement.appendChild(mainRowElement);

    rangeInput.addEventListener("pointerdown", () => {
      isPointerAdjusting = true;
      showValueBadge();
    });

    rangeInput.addEventListener("pointerup", () => {
      isPointerAdjusting = false;
      scheduleValueHide(260);
    });

    rangeInput.addEventListener("pointercancel", () => {
      isPointerAdjusting = false;
      scheduleValueHide(260);
    });

    rangeInput.addEventListener("blur", () => {
      isPointerAdjusting = false;
      scheduleValueHide(160);
    });

    rangeInput.addEventListener("input", () => {
      numberInput.value = rangeInput.value;
      valueElement.textContent = formatBoundValue(Number(rangeInput.value), decimals);
      showValueBadge();
      if (!isPointerAdjusting) {
        scheduleValueHide(860);
      }
      numberInput.dispatchEvent(new Event("input", { bubbles: true }));
    });

    numberInput.addEventListener("input", () => {
      rangeInput.value = numberInput.value;
      valueElement.textContent = formatBoundValue(Number(numberInput.value), decimals);
    });

    enhancedNumericControls.push({
      numberElement: numberInput,
      rangeElement: rangeInput,
      valueElement,
      decimals,
    });
  }
}

function attachGlobalControlHandlers() {
  const inputMappings = [
    { elementId: "globalScale", field: "globalScale", clamp: null },
    { elementId: "globalResilience", field: "globalResilience", clamp: null },
    { elementId: "globalAutarky", field: "globalAutarky", clamp: null },
    { elementId: "coverageFactor", field: "coverageFactor", clamp: (v) => clampNumber(v, 3.0, 8.0) },

    { elementId: "lifeExpectancyYears", field: "lifeExpectancyYears", clamp: (v) => clampNumber(v, 35, 95) },
    { elementId: "workingAgeStart", field: "workingAgeStart", clamp: (v) => clampNumber(v, 12, 30) },
    { elementId: "retirementAge", field: "retirementAge", clamp: (v) => clampNumber(v, 40, 80) },
    { elementId: "workforceParticipation", field: "workforceParticipation", clamp: (v) => clampNumber(v, 0.40, 0.95) },
    { elementId: "coreFractionOfWorkers", field: "coreFractionOfWorkers", clamp: (v) => clampNumber(v, 0.10, 0.70) },

    { elementId: "fertilityRate", field: "fertilityRate", clamp: (v) => clampNumber(v, 0.8, 4.5) },
    { elementId: "survivalToWorkingAge", field: "survivalToWorkingAge", clamp: (v) => clampNumber(v, 0.80, 0.995) },
    { elementId: "femaleShare", field: "femaleShare", clamp: (v) => clampNumber(v, 0.45, 0.55) },

    { elementId: "trainingCompletionAge", field: "trainingCompletionAge", clamp: (v) => clampNumber(v, 18, 32) },
    { elementId: "expertAttritionRate", field: "expertAttritionRate", clamp: (v) => clampNumber(v, 0.0, 0.060) },
    { elementId: "trainingOverhead", field: "trainingOverhead", clamp: (v) => clampNumber(v, 0.0, 0.60) },

    { elementId: "capitalProductivity", field: "capitalProductivity", clamp: (v) => clampNumber(v, 0.005, 0.200) },
    { elementId: "extraMarketFriction", field: "extraMarketFriction", clamp: (v) => clampNumber(v, 0.90, 1.60) },
  ];

  for (const mapping of inputMappings) {
    const element = document.getElementById(mapping.elementId);
    const isSelectElement = element.tagName.toLowerCase() === "select";
    const eventName = isSelectElement ? "change" : "input";
    element.addEventListener(eventName, () => {
      const rawValue = element.value;
      if (mapping.clamp) {
        state.globals[mapping.field] = mapping.clamp(rawValue);
        element.value = String(state.globals[mapping.field]);
      } else {
        state.globals[mapping.field] = rawValue;
      }
      renderControlGuidance();
      requestRerender();
    });
  }

  document.getElementById("resetButton").addEventListener("click", () => {
    state = { globals: deepCopyJson(defaultGlobalState), domains: deepCopyJson(defaultDomains) };
    updateGlobalControlsFromState();
    buildDomainControlsTable();
    requestRerender();
  });

  window.addEventListener("resize", () => {
    requestRerender();
  });
}

function buildDomainControlsTable() {
  const tableBody = document.getElementById("domainControlsBody");
  tableBody.innerHTML = "";

  for (const domain of state.domains) {
    const rowElement = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.className = "domain-name";
    nameDiv.textContent = domain.name;
    const keyDiv = document.createElement("div");
    keyDiv.className = "text-muted hint mono";
    keyDiv.textContent = domain.key;
    nameCell.appendChild(nameDiv);
    nameCell.appendChild(keyDiv);
    rowElement.appendChild(nameCell);

    const enabledCell = document.createElement("td");
    const enabledSelect = document.createElement("select");
    enabledSelect.className = "form-select form-select-sm";
    enabledSelect.innerHTML = `
      <option value="true"${domain.enabled ? " selected" : ""}>Yes</option>
      <option value="false"${!domain.enabled ? " selected" : ""}>No</option>
    `;
    enabledSelect.addEventListener("change", () => {
      domain.enabled = enabledSelect.value === "true";
      requestRerender();
    });
    enabledCell.appendChild(enabledSelect);
    rowElement.appendChild(enabledCell);

    const levelCell = document.createElement("td");
    const levelSelect = document.createElement("select");
    levelSelect.className = "form-select form-select-sm";
    buildSelectOptions(levelSelect, enumMaps.level, domain.level);
    levelSelect.addEventListener("change", () => {
      domain.level = levelSelect.value;
      requestRerender();
    });
    levelCell.appendChild(levelSelect);
    rowElement.appendChild(levelCell);

    const resilienceCell = document.createElement("td");
    const resilienceSelect = document.createElement("select");
    resilienceSelect.className = "form-select form-select-sm";
    buildSelectOptions(resilienceSelect, enumMaps.resilience, domain.domainResilience);
    resilienceSelect.addEventListener("change", () => {
      domain.domainResilience = resilienceSelect.value;
      requestRerender();
    });
    resilienceCell.appendChild(resilienceSelect);
    rowElement.appendChild(resilienceCell);

    const autarkyCell = document.createElement("td");
    const autarkySelect = document.createElement("select");
    autarkySelect.className = "form-select form-select-sm";
    buildSelectOptions(autarkySelect, enumMaps.autarky, domain.domainAutarky);
    autarkySelect.addEventListener("change", () => {
      domain.domainAutarky = autarkySelect.value;
      requestRerender();
    });
    autarkyCell.appendChild(autarkySelect);
    rowElement.appendChild(autarkyCell);

    const scarcityCell = document.createElement("td");
    const scarcitySelect = document.createElement("select");
    scarcitySelect.className = "form-select form-select-sm";
    buildSelectOptions(scarcitySelect, enumMaps.scarcity, domain.expertScarcity);
    scarcitySelect.addEventListener("change", () => {
      domain.expertScarcity = scarcitySelect.value;
      requestRerender();
    });
    scarcityCell.appendChild(scarcitySelect);
    rowElement.appendChild(scarcityCell);

    const dependenciesCell = document.createElement("td");
    const requiresList = (domain.requires || []).join(", ");
    const dependencyDiv = document.createElement("div");
    dependencyDiv.className = "text-muted hint mono";
    dependencyDiv.textContent = requiresList.length > 0 ? requiresList : "(none)";
    dependenciesCell.appendChild(dependencyDiv);
    rowElement.appendChild(dependenciesCell);

    tableBody.appendChild(rowElement);
  }
}

function renderDerivedIndicators(modelResult) {
  document.getElementById("derivedWorkingAgeShare").textContent = formatPercent(modelResult.demographyDerived.workingAgeShare);
  document.getElementById("derivedWorkersPerCapita").textContent = formatFixed(modelResult.demographyDerived.workersPerCapita, 3);
  document.getElementById("derivedCoreWorkersPerCapita").textContent = formatFixed(modelResult.demographyDerived.coreWorkersPerCapita, 3);
  document.getElementById("derivedNewAdultsPerYearPerMillion").textContent = formatInteger(modelResult.demographyDerived.newAdultsPerYearPerMillion);
  document.getElementById("derivedReplacementFactor").textContent = formatFixed(modelResult.demographyDerived.replacementFactor, 3);
  document.getElementById("derivedTransactionFriction").textContent = formatFixed(modelResult.transactionFriction, 3);
}

function renderWarnings(modelResult) {
  const warningsContainer = document.getElementById("warningsContainer");
  warningsContainer.innerHTML = "";

  if (modelResult.feasibility.issues.length === 0) {
    const okItem = document.createElement("div");
    okItem.className = "okbox";
    const okText = document.createElement("div");
    okText.className = "mono";
    okText.textContent = "No issues detected.";
    okItem.appendChild(okText);
    warningsContainer.appendChild(okItem);
    return;
  }

  for (const issue of modelResult.feasibility.issues) {
    const box = document.createElement("div");
    box.className = issue.type === "error" ? "badbox" : "warnbox";

    const titleRow = document.createElement("div");
    titleRow.className = "d-flex justify-content-between align-items-center gap-2";

    const titleText = document.createElement("div");
    titleText.className = "domain-name";
    titleText.textContent = issue.title;

    const typeBadge = document.createElement("span");
    typeBadge.className = "badge badge-soft mono";
    typeBadge.textContent = issue.type.toUpperCase();

    titleRow.appendChild(titleText);
    titleRow.appendChild(typeBadge);

    const detailText = document.createElement("div");
    detailText.className = "text-muted hint mt-1";
    detailText.textContent = issue.detail;

    box.appendChild(titleRow);
    box.appendChild(detailText);

    if (issue.title === "Infeasible dependency graph" && issue.data) {
      const list = document.createElement("div");
      list.className = "mt-2";
      for (const detail of issue.data) {
        const line = document.createElement("div");
        line.className = "mono hint";
        line.textContent = detail.domainKey + " missing: " + detail.missing.join(", ");
        list.appendChild(line);
      }
      box.appendChild(list);
    }

    warningsContainer.appendChild(box);
  }
}

function renderKpis(modelResult) {
  const statusBadge = document.getElementById("statusBadge");
  const isFeasible = modelResult.feasibility.feasible;
  statusBadge.textContent = isFeasible ? "OK" : "Not feasible";
  statusBadge.classList.toggle("status-ok", isFeasible);
  statusBadge.classList.toggle("status-bad", !isFeasible);

  document.getElementById("kpiFinalPopulation").textContent = isFeasible ? formatInteger(modelResult.finalPopulationRequired) : "Infeasible";
  document.getElementById("kpiCoreWorkforce").textContent = formatInteger(modelResult.totalCoreWorkforce);

  document.getElementById("kpiPopulationStaffing").textContent = formatInteger(modelResult.staffingPopulationRequired);
  document.getElementById("kpiPopulationPipeline").textContent = formatInteger(modelResult.pipelinePopulationRequiredMax);
  document.getElementById("kpiBindingConstraint").textContent = modelResult.bindingConstraint;
}

function attachResultsTabHandlers() {
  const resultTabs = document.querySelectorAll('[data-bs-toggle="tab"]');
  for (const tabButton of resultTabs) {
    tabButton.addEventListener("shown.bs.tab", () => {
      requestRerender();
    });
  }
}

function renderBottlenecks(modelResult) {
  function renderBottleneckList(containerId, items, valueGetter, subtitleGetter) {
    const container = document.getElementById(containerId);
    container.innerHTML = "";
    const filteredItems = items.filter((item) => item.coreTotal > 0.01).slice(0, 5);

    for (const item of filteredItems) {
      const wrapper = document.createElement("div");
      wrapper.className = "card p-2";

      const titleLine = document.createElement("div");
      titleLine.className = "d-flex justify-content-between align-items-center gap-2";

      const left = document.createElement("div");
      left.innerHTML = `<span class="domain-name">${item.name}</span> <span class="badge badge-soft mono">${item.key}</span>`;

      const right = document.createElement("div");
      right.className = "mono";
      right.textContent = valueGetter(item);

      titleLine.appendChild(left);
      titleLine.appendChild(right);

      const subtitleLine = document.createElement("div");
      subtitleLine.className = "text-muted hint mt-1";
      subtitleLine.textContent = subtitleGetter(item);

      wrapper.appendChild(titleLine);
      wrapper.appendChild(subtitleLine);
      container.appendChild(wrapper);
    }
  }

  renderBottleneckList(
    "coreBottlenecks",
    modelResult.domainResultsSortedByCore,
    (item) => formatInteger(item.coreTotal) + " core",
    (item) => {
      const share = modelResult.totalCoreWorkforce > 0 ? item.coreTotal / modelResult.totalCoreWorkforce : 0;
      return "Share of core: " + formatPercent(share);
    }
  );

  renderBottleneckList(
    "pipelineBottlenecks",
    modelResult.domainResultsSortedByPipeline,
    (item) => (Number.isFinite(item.pipelinePopulationRequired) ? formatInteger(item.pipelinePopulationRequired) : "-") + " pop",
    (item) => "New experts/year: " + formatFixed(item.neededNewExpertsPerYear, 1) + " | Eligible fraction: " + formatPercent(item.effectiveEligibleFraction)
  );
}

function renderDomainBreakdown(modelResult) {
  const tableBody = document.getElementById("domainBreakdownBody");
  tableBody.innerHTML = "";

  const totalCore = modelResult.totalCoreWorkforce;
  const resultsSorted = [...modelResult.domainResults].sort((a, b) => b.coreTotal - a.coreTotal);

  for (const item of resultsSorted) {
    const share = totalCore > 0 ? item.coreTotal / totalCore : 0;
    const feasible = modelResult.domainFeasibilityMap[item.key] ? "Yes" : "No";

    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameDiv = document.createElement("div");
    nameDiv.className = "domain-name";
    nameDiv.textContent = item.name;
    const keyDiv = document.createElement("div");
    keyDiv.className = "text-muted hint mono";
    keyDiv.textContent = item.key;
    nameCell.appendChild(nameDiv);
    nameCell.appendChild(keyDiv);
    row.appendChild(nameCell);

    const opsCell = document.createElement("td");
    opsCell.className = "mono";
    opsCell.textContent = formatInteger(item.opsPlusMaint);
    row.appendChild(opsCell);

    const capitalCell = document.createElement("td");
    capitalCell.className = "mono";
    capitalCell.textContent = formatInteger(item.capitalRenewalStaff);
    row.appendChild(capitalCell);

    const expertCell = document.createElement("td");
    expertCell.className = "mono";
    expertCell.textContent = formatInteger(item.expertPool);
    row.appendChild(expertCell);

    const trainingCell = document.createElement("td");
    trainingCell.className = "mono";
    trainingCell.textContent = formatInteger(item.trainingStaff);
    row.appendChild(trainingCell);

    const totalCell = document.createElement("td");
    totalCell.className = "mono";
    totalCell.textContent = formatInteger(item.coreTotal);
    row.appendChild(totalCell);

    const pipelineCell = document.createElement("td");
    pipelineCell.className = "mono";
    pipelineCell.textContent = Number.isFinite(item.pipelinePopulationRequired) ? formatInteger(item.pipelinePopulationRequired) : "-";
    row.appendChild(pipelineCell);

    const shareCell = document.createElement("td");
    shareCell.className = "mono";
    shareCell.textContent = formatPercent(share);
    row.appendChild(shareCell);

    const feasibleCell = document.createElement("td");
    feasibleCell.className = "mono";
    feasibleCell.textContent = feasible;
    row.appendChild(feasibleCell);

    tableBody.appendChild(row);
  }
}

function renderConstraintsBarChart(modelResult) {
  const svg = d3.select("#constraintsBarSvg");
  svg.selectAll("*").remove();

  const svgNode = svg.node();
  const width = svgNode.getBoundingClientRect().width;
  const height = svgNode.getBoundingClientRect().height;

  const margin = { top: 20, right: 16, bottom: 50, left: 56 };
  const plotWidth = Math.max(10, width - margin.left - margin.right);
  const plotHeight = Math.max(10, height - margin.top - margin.bottom);

  const values = [
    { key: "Staffing", value: modelResult.staffingPopulationRequired },
    { key: "Pipeline", value: modelResult.pipelinePopulationRequiredMax },
  ];

  const finalValue = modelResult.finalPopulationRequired;
  const isFeasible = modelResult.feasibility.feasible;

  const maxValue = Math.max(1, ...values.map((d) => (Number.isFinite(d.value) ? d.value : 0)), finalValue);

  const xScale = d3.scaleBand().domain(values.map((d) => d.key)).range([0, plotWidth]).padding(0.35);
  const yScale = d3.scaleLinear().domain([0, maxValue * 1.08]).nice().range([plotHeight, 0]);

  const chartGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  chartGroup
    .append("g")
    .attr("class", "grid")
    .call(d3.axisLeft(yScale).ticks(6).tickSize(-plotWidth).tickFormat(""))
    .call((selection) => selection.select(".domain").remove());

  chartGroup.append("g").attr("class", "axis").call(d3.axisLeft(yScale).ticks(6).tickFormat((d) => formatInteger(d)));

  chartGroup
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(xScale));

  const barFill = "rgba(255,255,255,0.20)";
  const barFillBind = "rgba(255,255,255,0.35)";

  chartGroup
    .selectAll("rect.bar")
    .data(values)
    .enter()
    .append("rect")
    .attr("class", "bar")
    .attr("x", (d) => xScale(d.key))
    .attr("y", (d) => yScale(Number.isFinite(d.value) ? d.value : 0))
    .attr("width", xScale.bandwidth())
    .attr("height", (d) => plotHeight - yScale(Number.isFinite(d.value) ? d.value : 0))
    .attr("rx", 6)
    .attr("fill", (d) => {
      const isBinding =
        (d.key === "Staffing" && modelResult.bindingConstraint === "Core staffing") ||
        (d.key === "Pipeline" && modelResult.bindingConstraint === "Expert pipeline");
      return isBinding ? barFillBind : barFill;
    })
    .attr("stroke", "rgba(255,255,255,0.14)")
    .on("mousemove", (event, d) => {
      const htmlValue =
        `<div class="mono"><b>${d.key}</b></div>` +
        `<div class="mono">Population required: ${formatInteger(d.value)}</div>` +
        `<div class="text-muted">Binding: ${modelResult.bindingConstraint}</div>` +
        (isFeasible ? "" : `<div style="color:#ff9d9d">Configuration infeasible</div>`);
      tooltipShow(htmlValue, event.clientX, event.clientY);
    })
    .on("mouseleave", () => tooltipHide());

  chartGroup
    .append("line")
    .attr("x1", 0)
    .attr("x2", plotWidth)
    .attr("y1", yScale(finalValue))
    .attr("y2", yScale(finalValue))
    .attr("stroke", "rgba(255,255,255,0.55)")
    .attr("stroke-width", 2)
    .attr("stroke-dasharray", "6,4");

  chartGroup
    .append("text")
    .attr("x", plotWidth)
    .attr("y", yScale(finalValue) - 8)
    .attr("text-anchor", "end")
    .attr("fill", "rgba(255,255,255,0.78)")
    .attr("class", "mono")
    .style("font-size", "12px")
    .text("Final = " + (isFeasible ? formatInteger(finalValue) : "Infeasible"));
}

function renderStackedWorkforceChart(modelResult) {
  const svg = d3.select("#stackedWorkforceSvg");
  svg.selectAll("*").remove();

  const svgNode = svg.node();
  const width = svgNode.getBoundingClientRect().width;
  const height = svgNode.getBoundingClientRect().height;

  const margin = { top: 18, right: 14, bottom: 36, left: 170 };
  const plotWidth = Math.max(10, width - margin.left - margin.right);
  const plotHeight = Math.max(10, height - margin.top - margin.bottom);

  const allActive = modelResult.domainResults
    .filter((d) => d.coreTotal > 0.01)
    .sort((a, b) => b.coreTotal - a.coreTotal);

  const topCount = Math.min(10, allActive.length);
  const data = allActive.slice(0, topCount);

  const segmentKeys = ["opsPlusMaint", "capitalRenewalStaff", "expertPool", "trainingStaff"];
  const segmentLabels = {
    opsPlusMaint: "Ops+Maint",
    capitalRenewalStaff: "Capital",
    expertPool: "Experts",
    trainingStaff: "Training",
  };
  const segmentColors = {
    opsPlusMaint: getCssVar("--seg-ops"),
    capitalRenewalStaff: getCssVar("--seg-cap"),
    expertPool: getCssVar("--seg-exp"),
    trainingStaff: getCssVar("--seg-trn"),
  };

  const yScale = d3
    .scaleBand()
    .domain(data.map((d) => d.name))
    .range([0, plotHeight])
    .padding(0.18);

  const maxCoreTotal = Math.max(1, ...data.map((d) => d.coreTotal));
  const xScale = d3.scaleLinear().domain([0, maxCoreTotal * 1.05]).nice().range([0, plotWidth]);

  const chartGroup = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

  chartGroup
    .append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(xScale).ticks(6).tickSize(-plotHeight).tickFormat(""))
    .call((selection) => selection.select(".domain").remove());

  chartGroup
    .append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${plotHeight})`)
    .call(d3.axisBottom(xScale).ticks(6).tickFormat((d) => formatInteger(d)));

  chartGroup
    .append("g")
    .attr("class", "axis")
    .call(d3.axisLeft(yScale))
    .call((selection) => selection.selectAll("text").style("font-size", "11px"));

  const stackedData = d3.stack().keys(segmentKeys)(data);

  chartGroup
    .selectAll("g.segment")
    .data(stackedData)
    .enter()
    .append("g")
    .attr("class", "segment")
    .attr("fill", (d) => segmentColors[d.key])
    .selectAll("rect")
    .data((d) => d.map((segmentValue) => ({ key: d.key, segmentValue, item: segmentValue.data })))
    .enter()
    .append("rect")
    .attr("x", (d) => xScale(d.segmentValue[0]))
    .attr("y", (d) => yScale(d.item.name))
    .attr("width", (d) => Math.max(0, xScale(d.segmentValue[1]) - xScale(d.segmentValue[0])))
    .attr("height", yScale.bandwidth())
    .attr("rx", 4)
    .attr("stroke", "rgba(255,255,255,0.10)")
    .on("mousemove", (event, d) => {
      const value = d.item[d.key] || 0;
      const htmlValue =
        `<div class="mono"><b>${d.item.name}</b></div>` +
        `<div class="mono">${segmentLabels[d.key]}: ${formatInteger(value)}</div>` +
        `<div class="mono">Core total: ${formatInteger(d.item.coreTotal)}</div>` +
        `<div class="text-muted">Domain key: <span class="mono">${d.item.key}</span></div>`;
      tooltipShow(htmlValue, event.clientX, event.clientY);
    })
    .on("mouseleave", () => tooltipHide());

  chartGroup
    .selectAll("text.total")
    .data(data)
    .enter()
    .append("text")
    .attr("class", "mono")
    .style("font-size", "11px")
    .attr("fill", "rgba(255,255,255,0.68)")
    .attr("x", (d) => xScale(d.coreTotal) + 6)
    .attr("y", (d) => yScale(d.name) + yScale.bandwidth() / 2 + 4)
    .text((d) => formatInteger(d.coreTotal));
}

function renderDependencyGraph(modelResult) {
  const svg = d3.select("#dependencyGraphSvg");
  svg.selectAll("*").remove();

  const svgNode = svg.node();
  const width = svgNode.getBoundingClientRect().width;
  const height = svgNode.getBoundingClientRect().height;

  const nodeActiveColor = getCssVar("--node-active");
  const nodeDisabledColor = getCssVar("--node-disabled");
  const nodeInfeasibleColor = getCssVar("--node-infeasible");
  const nodeHighlightColor = getCssVar("--node-highlight");

  const linkColor = getCssVar("--link");
  const linkDisabledColor = getCssVar("--link-disabled");
  const linkBadColor = getCssVar("--link-bad");

  const nodes = state.domains.map((domain) => {
    const computed = modelResult.domainResults.find((item) => item.key === domain.key) || null;
    const coreTotal = computed ? computed.coreTotal : 0;
    const pipelinePop = computed ? computed.pipelinePopulationRequired : 0;
    const enabled = modelResult.activeDomainMap[domain.key];
    const feasible = modelResult.domainFeasibilityMap[domain.key];

    return {
      id: domain.key,
      name: domain.name,
      enabled,
      feasible,
      coreTotal,
      pipelinePop,
    };
  });

  const links = [];
  for (const domain of state.domains) {
    const requires = domain.requires || [];
    for (const requiredKey of requires) {
      links.push({
        source: requiredKey,
        target: domain.key,
      });
    }
  }

  const coreValues = nodes.filter((n) => n.coreTotal > 0.01).map((n) => n.coreTotal);
  const coreMin = coreValues.length > 0 ? d3.min(coreValues) : 1;
  const coreMax = coreValues.length > 0 ? d3.max(coreValues) : 10;

  const radiusScale = d3.scaleSqrt().domain([coreMin, coreMax]).range([8, 28]).clamp(true);

  const pipelineValues = nodes
    .filter((n) => Number.isFinite(n.pipelinePop) && n.pipelinePop > 0 && n.enabled)
    .map((n) => n.pipelinePop);
  const pipeMin = pipelineValues.length > 0 ? d3.min(pipelineValues) : 1;
  const pipeMax = pipelineValues.length > 0 ? d3.max(pipelineValues) : 10;

  const strokeScale = d3
    .scaleLog()
    .domain([Math.max(1, pipeMin), Math.max(10, pipeMax)])
    .range([1.0, 6.0])
    .clamp(true);

  const graphGroup = svg.append("g");

  const defs = svg.append("defs");
  defs
    .append("marker")
    .attr("id", "arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 12)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(255,255,255,0.45)");

  defs
    .append("marker")
    .attr("id", "arrow-bad")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 12)
    .attr("refY", 0)
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "rgba(255,90,90,0.60)");

  const zoomBehavior = d3
    .zoom()
    .scaleExtent([0.4, 2.6])
    .on("zoom", (event) => {
      graphGroup.attr("transform", event.transform);
    });

  svg.call(zoomBehavior);

  const linkSelection = graphGroup
    .append("g")
    .attr("stroke-width", 1.4)
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("stroke", (d) => {
      const sourceNode = nodes.find((n) => n.id === d.source);
      const targetNode = nodes.find((n) => n.id === d.target);
      const enabledPath = sourceNode && targetNode && sourceNode.enabled && targetNode.enabled;
      const feasiblePath = sourceNode && targetNode && sourceNode.feasible && targetNode.feasible;
      if (!enabledPath) {
        return linkDisabledColor;
      }
      if (!feasiblePath) {
        return linkBadColor;
      }
      return linkColor;
    })
    .attr("marker-end", (d) => {
      const sourceNode = nodes.find((n) => n.id === d.source);
      const targetNode = nodes.find((n) => n.id === d.target);
      const feasiblePath = sourceNode && targetNode && sourceNode.feasible && targetNode.feasible;
      return feasiblePath ? "url(#arrow)" : "url(#arrow-bad)";
    });

  const nodeSelection = graphGroup
    .append("g")
    .selectAll("g.node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node")
    .call(
      d3
        .drag()
        .on("start", (event, d) => {
          if (!event.active) {
            simulation.alphaTarget(0.25).restart();
          }
          d.fx = d.x;
          d.fy = d.y;
        })
        .on("drag", (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on("end", (event, d) => {
          if (!event.active) {
            simulation.alphaTarget(0);
          }
          d.fx = null;
          d.fy = null;
        })
    );

  const circleSelection = nodeSelection
    .append("circle")
    .attr("r", (d) => (d.coreTotal > 0.01 ? radiusScale(d.coreTotal) : 8))
    .attr("fill", (d) => {
      if (!d.enabled) {
        return nodeDisabledColor;
      }
      if (!d.feasible) {
        return nodeInfeasibleColor;
      }
      return nodeActiveColor;
    })
    .attr("stroke", (d) => {
      const isTop = d.id === modelResult.topCoreDriverKey || d.id === modelResult.pipelineDriverKey;
      return isTop ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)";
    })
    .attr("stroke-width", (d) => {
      const base = d.enabled && Number.isFinite(d.pipelinePop) && d.pipelinePop > 0 ? strokeScale(Math.max(1, d.pipelinePop)) : 1.2;
      const isTop = d.id === modelResult.topCoreDriverKey || d.id === modelResult.pipelineDriverKey;
      return isTop ? base + 1.4 : base;
    })
    .on("mousemove", (event, d) => {
      const coreText = formatInteger(d.coreTotal);
      const pipeText = Number.isFinite(d.pipelinePop) ? formatInteger(d.pipelinePop) : "-";
      const htmlValue =
        `<div class="mono"><b>${d.name}</b> <span class="text-muted">(${d.id})</span></div>` +
        `<div class="mono">Core FTE: ${coreText}</div>` +
        `<div class="mono">Pipeline pop: ${pipeText}</div>` +
        `<div class="text-muted">Enabled: <span class="mono">${d.enabled ? "Yes" : "No"}</span> | Feasible: <span class="mono">${d.feasible ? "Yes" : "No"}</span></div>` +
        `<div class="text-muted">Top core driver: <span class="mono">${modelResult.topCoreDriverKey}</span> | Top pipeline driver: <span class="mono">${modelResult.pipelineDriverKey}</span></div>`;
      tooltipShow(htmlValue, event.clientX, event.clientY);
    })
    .on("mouseleave", () => tooltipHide());

  nodeSelection
    .append("circle")
    .attr("r", (d) => (d.coreTotal > 0.01 ? radiusScale(d.coreTotal) + 6 : 14))
    .attr("fill", "transparent")
    .attr("stroke", (d) => {
      const isTop = d.id === modelResult.topCoreDriverKey || d.id === modelResult.pipelineDriverKey;
      return isTop ? nodeHighlightColor : "transparent";
    })
    .attr("stroke-width", 8)
    .attr("pointer-events", "none");

  nodeSelection
    .append("text")
    .attr("text-anchor", "middle")
    .attr("dy", 4)
    .attr("fill", "rgba(255,255,255,0.82)")
    .style("font-size", "11px")
    .style("pointer-events", "none")
    .text((d) => d.id);

  const simulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((d) => d.id).distance(110).strength(0.65))
    .force("charge", d3.forceManyBody().strength(-450))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius((d) => (d.coreTotal > 0.01 ? radiusScale(d.coreTotal) + 10 : 20)));

  simulation.on("tick", () => {
    linkSelection
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    nodeSelection.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });
}

function requestRerender() {
  if (rerenderScheduled) {
    return;
  }
  rerenderScheduled = true;
  window.requestAnimationFrame(() => {
    rerenderScheduled = false;
    renderEverything();
  });
}

function renderEverything() {
  const modelResult = computeModel();
  lastModelResult = modelResult;

  renderDerivedIndicators(modelResult);
  renderKpis(modelResult);
  renderWarnings(modelResult);
  renderBottlenecks(modelResult);
  renderDomainBreakdown(modelResult);

  renderDependencyGraph(modelResult);
  renderConstraintsBarChart(modelResult);
  renderStackedWorkforceChart(modelResult);
}

function initialize() {
  updateGlobalControlsFromState();
  buildDomainControlsTable();
  attachGlobalControlHandlers();
  enhanceNumericControls();
  renderControlGuidance();
  attachResultsTabHandlers();
  renderEverything();
}

initialize();
