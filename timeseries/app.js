const modeDefinitions = {
  process: {
    label: "Observe a process",
    shortLabel: "Process",
    description: "Use this when you are tracking something with multiple observations over time, such as courtship, grades, business performance, symptoms, or product quality.",
    intro: "This mode asks whether you are looking at noise, a stable pattern, a trend, or a breakdown.",
    criteria: [
      {
        key: "level",
        title: "Level",
        description: "How good is the average state right now? Think overall quality, average performance, or current baseline."
      },
      {
        key: "trend",
        title: "Trend",
        description: "Is the process improving, flat, or degrading? This is about direction, not just current level."
      },
      {
        key: "variance",
        title: "Variance",
        description: "How erratic is the process? High volatility reduces trust even if the average looks fine. Higher estimate means more stable."
      },
      {
        key: "shock",
        title: "Shock",
        description: "Has there been a serious disruption that changes the interpretation of the series? Higher estimate means fewer or weaker shocks."
      },
      {
        key: "recovery",
        title: "Recovery",
        description: "After stress or error, does the process recover well? Recovery often reveals character better than calm periods do."
      },
      {
        key: "persistence",
        title: "Persistence",
        description: "Has the observed pattern lasted long enough to trust your interpretation?"
      }
    ]
  },
  event: {
    label: "Decide on a threshold",
    shortLabel: "Threshold",
    description: "Use this when you need to accept, reject, delay, or rework a specific outcome or commitment, such as a marriage decision, a surgery decision, a hire, a purchase, or a dental implant result.",
    intro: "This mode asks whether the specific threshold decision or outcome is acceptable as-is, not whether an ongoing process is under control.",
    criteria: [
      {
        key: "targetFit",
        title: "Target fit",
        description: "How close is the actual outcome to what you really wanted? Not abstract perfection, the actual target."
      },
      {
        key: "salience",
        title: "Salience",
        description: "How noticeable will the deviation be in normal use or ordinary life?"
      },
      {
        key: "functionalAdequacy",
        title: "Functional adequacy",
        description: "Does it work as needed, without friction, pain, or serious compromise?"
      },
      {
        key: "reworkCost",
        title: "Rework cost",
        description: "How easy is it to correct later? Higher estimate means easier and cheaper to fix."
      },
      {
        key: "irreversibility",
        title: "Irreversibility",
        description: "How much future optionality remains if you proceed? Higher estimate means less lock-in and less irreversible downside."
      },
      {
        key: "downstreamConsequence",
        title: "Downstream consequence",
        description: "What future cost follows if you accept this? Higher estimate means lower downstream harm."
      }
    ]
  },
  readiness: {
    label: "See if a process is ready for decision",
    shortLabel: "Readiness",
    description: "Use this when a time series may be ripening into a one-off commitment or rejection, such as courtship to marriage, interviewing to hiring, or symptoms to surgery.",
    intro: "This mode still looks at a process, but the output is about whether waiting makes sense or whether the signal is already strong enough to justify a threshold decision.",
    criteria: [
      {
        key: "level",
        title: "Level",
        description: "How favorable is the average state for a future commitment or rejection?"
      },
      {
        key: "trend",
        title: "Trend",
        description: "Is the process moving in a direction that supports a decision, or is it stalling?"
      },
      {
        key: "variance",
        title: "Variance",
        description: "Is the process stable enough to interpret? Higher estimate means less noise and less oscillation."
      },
      {
        key: "recovery",
        title: "Recovery",
        description: "Have you seen how the process behaves after stress, conflict, or surprise?"
      },
      {
        key: "persistence",
        title: "Persistence",
        description: "Has the signal lasted long enough under varied conditions?"
      },
      {
        key: "urgency",
        title: "Urgency",
        description: "How costly is further waiting? Higher estimate means delay itself is becoming expensive or distortive."
      }
    ]
  },
  regime: {
    label: "Evaluate life after a decision",
    shortLabel: "Regime",
    description: "Use this after a threshold has already happened and you need to understand the ongoing reality it created, such as married life after marriage, recovery after surgery, or performance after hiring.",
    intro: "This mode asks whether the past decision initialized a healthy regime or a fragile one.",
    criteria: [
      {
        key: "initialConditionQuality",
        title: "Initial condition quality",
        description: "How good was the starting state immediately after the threshold?"
      },
      {
        key: "constraintLoad",
        title: "Constraint load",
        description: "How burdensome are the obligations, lock-ins, or structural constraints created by the threshold? Higher estimate means lighter load."
      },
      {
        key: "feedbackLoopQuality",
        title: "Feedback loop quality",
        description: "Are the new reinforcing loops healthy, or are they making things worse?"
      },
      {
        key: "adaptationCapacity",
        title: "Adaptation capacity",
        description: "How capable is the new system of self-correction and learning?"
      },
      {
        key: "monitoringClarity",
        title: "Monitoring clarity",
        description: "Can you clearly tell whether the regime is healthy, drifting, or failing?"
      },
      {
        key: "earlyDrift",
        title: "Early drift",
        description: "Is the new regime moving toward stability? Higher estimate means favorable early drift."
      }
    ]
  }
};

const domainDefinitions = [
  "Relationship",
  "Family / children",
  "Health",
  "Work / hiring",
  "Product / business",
  "Custom"
];

const state = {
  mode: "process",
  domain: "Relationship",
  subject: "",
  criteriaValues: {}
};

const modeButtonGrid = document.getElementById("mode-button-grid");
const domainTagRow = document.getElementById("domain-tag-row");
const criterionGrid = document.getElementById("criterion-grid");
const resultTableBody = document.getElementById("result-table-body");
const subjectInput = document.getElementById("subject-input");

function formatNumber(numberValue) {
  return Number(numberValue).toFixed(1);
}

function initializeCriteriaForMode(modeKey) {
  const criteria = modeDefinitions[modeKey].criteria;
  const nextValues = {};
  criteria.forEach((criterion) => {
    const existingValue = state.criteriaValues[criterion.key];
    nextValues[criterion.key] = existingValue || {
      estimate: 3,
      confidence: 3,
      importance: 3,
      note: ""
    };
  });
  state.criteriaValues = nextValues;
}

function renderModeButtons() {
  modeButtonGrid.innerHTML = "";
  Object.entries(modeDefinitions).forEach(([modeKey, modeDefinition]) => {
    const buttonElement = document.createElement("button");
    buttonElement.className = "choice-button" + (state.mode === modeKey ? " active" : "");
    buttonElement.innerHTML = `
      <span class="choice-title">${modeDefinition.label}</span>
      <span class="choice-copy">${modeDefinition.description}</span>
    `;
    buttonElement.addEventListener("click", () => {
      state.mode = modeKey;
      initializeCriteriaForMode(modeKey);
      renderAll();
    });
    modeButtonGrid.appendChild(buttonElement);
  });
}

function renderDomainButtons() {
  domainTagRow.innerHTML = "";
  domainDefinitions.forEach((domainValue) => {
    const buttonElement = document.createElement("button");
    buttonElement.className = "tag-button" + (state.domain === domainValue ? " active" : "");
    buttonElement.textContent = domainValue;
    buttonElement.addEventListener("click", () => {
      state.domain = domainValue;
      renderAll();
    });
    domainTagRow.appendChild(buttonElement);
  });
}

function renderCriteria() {
  const currentMode = modeDefinitions[state.mode];
  document.getElementById("lenses-intro-copy").textContent = currentMode.intro + " For each lens, use estimate, confidence, and importance rather than pretending at absolute certainty.";
  criterionGrid.innerHTML = "";

  currentMode.criteria.forEach((criterion) => {
    const values = state.criteriaValues[criterion.key];
    const cardElement = document.createElement("div");
    cardElement.className = "criterion-card";
    cardElement.innerHTML = `
      <div class="criterion-header">
        <div>
          <div class="criterion-title">${criterion.title}</div>
        </div>
        <div class="score-badge">${values.estimate}/5 estimate</div>
      </div>
      <p class="criterion-description">${criterion.description}</p>
      <div class="range-group">
        <div class="range-block">
          <div class="range-label-row">
            <div class="range-label">Estimate</div>
            <div class="range-value">${values.estimate}/5</div>
          </div>
          <input type="range" min="1" max="5" step="1" value="${values.estimate}" data-criterion-key="${criterion.key}" data-field-name="estimate" />
        </div>
        <div class="range-block">
          <div class="range-label-row">
            <div class="range-label">Confidence</div>
            <div class="range-value">${values.confidence}/5</div>
          </div>
          <input type="range" min="1" max="5" step="1" value="${values.confidence}" data-criterion-key="${criterion.key}" data-field-name="confidence" />
        </div>
        <div class="range-block">
          <div class="range-label-row">
            <div class="range-label">Importance</div>
            <div class="range-value">${values.importance}/5</div>
          </div>
          <input type="range" min="1" max="5" step="1" value="${values.importance}" data-criterion-key="${criterion.key}" data-field-name="importance" />
        </div>
      </div>
      <textarea placeholder="Optional note about this lens" data-criterion-key="${criterion.key}" data-field-name="note">${escapeHtml(values.note)}</textarea>
    `;
    criterionGrid.appendChild(cardElement);
  });

  const inputElements = criterionGrid.querySelectorAll("input[type='range'], textarea");
  inputElements.forEach((inputElement) => {
    inputElement.addEventListener("input", (event) => {
      const criterionKey = event.target.getAttribute("data-criterion-key");
      const fieldName = event.target.getAttribute("data-field-name");
      const nextValue = fieldName === "note" ? event.target.value : Number(event.target.value);
      state.criteriaValues[criterionKey][fieldName] = nextValue;
      updateSidebarStats();
      renderCriteria();
      renderResultTable();
    });
  });
}

function escapeHtml(textValue) {
  return String(textValue)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getCriteriaArray() {
  return modeDefinitions[state.mode].criteria.map((criterion) => ({
    ...criterion,
    ...state.criteriaValues[criterion.key]
  }));
}

function updateSidebarStats() {
  const criteriaArray = getCriteriaArray();
  const lensCount = criteriaArray.length;
  const averageEstimate = criteriaArray.reduce((sumValue, criterion) => sumValue + criterion.estimate, 0) / lensCount;
  const averageConfidence = criteriaArray.reduce((sumValue, criterion) => sumValue + criterion.confidence, 0) / lensCount;
  const averageImportance = criteriaArray.reduce((sumValue, criterion) => sumValue + criterion.importance, 0) / lensCount;

  document.getElementById("sidebar-lens-count").textContent = String(lensCount);
  document.getElementById("sidebar-average-score").textContent = `${formatNumber(averageEstimate)} / 5`;
  document.getElementById("sidebar-average-confidence").textContent = `${formatNumber(averageConfidence)} / 5`;
  document.getElementById("sidebar-average-importance").textContent = `${formatNumber(averageImportance)} / 5`;
  document.getElementById("current-mode-label").textContent = modeDefinitions[state.mode].shortLabel;
  document.getElementById("current-domain-label").textContent = state.domain;
}

function renderResultTable() {
  const criteriaArray = getCriteriaArray();
  resultTableBody.innerHTML = "";
  criteriaArray.forEach((criterion) => {
    const rowElement = document.createElement("tr");
    rowElement.innerHTML = `
      <td>${criterion.title}</td>
      <td>${criterion.estimate}/5</td>
      <td>${criterion.confidence}/5</td>
      <td>${criterion.importance}/5</td>
    `;
    resultTableBody.appendChild(rowElement);
  });
}

function scoreCriteria() {
  const criteriaArray = getCriteriaArray();
  const weightedTotal = criteriaArray.reduce((sumValue, criterion) => {
    return sumValue + criterion.estimate * criterion.importance * criterion.confidence;
  }, 0);
  const weightedMax = criteriaArray.reduce((sumValue, criterion) => {
    return sumValue + 5 * criterion.importance * criterion.confidence;
  }, 0);
  const normalizedScore = weightedMax === 0 ? 0 : weightedTotal / weightedMax;
  const averageConfidence = criteriaArray.reduce((sumValue, criterion) => sumValue + criterion.confidence, 0) / criteriaArray.length;
  const averageImportance = criteriaArray.reduce((sumValue, criterion) => sumValue + criterion.importance, 0) / criteriaArray.length;
  const lowestConfidenceCriterion = [...criteriaArray].sort((leftValue, rightValue) => leftValue.confidence - rightValue.confidence)[0];
  const strongestCriterion = [...criteriaArray].sort((leftValue, rightValue) => {
    return (rightValue.estimate * rightValue.importance) - (leftValue.estimate * leftValue.importance);
  })[0];
  const weakestCriterion = [...criteriaArray].sort((leftValue, rightValue) => {
    return (leftValue.estimate * leftValue.importance) - (rightValue.estimate * rightValue.importance);
  })[0];

  return {
    criteriaArray,
    normalizedScore,
    averageConfidence,
    averageImportance,
    lowestConfidenceCriterion,
    strongestCriterion,
    weakestCriterion
  };
}

function deriveRecommendation() {
  const scoreObject = scoreCriteria();
  const subjectText = state.subject.trim();
  const subjectPrefix = subjectText ? `${subjectText}: ` : "";
  let stateLabel = "";
  let stateClassName = "warn";
  let stateCopy = "";
  let actionText = "";

  if (state.mode === "process") {
    if (scoreObject.normalizedScore >= 0.78 && scoreObject.averageConfidence >= 3.2) {
      stateLabel = "Healthy and stable";
      stateClassName = "good";
      stateCopy = `${subjectPrefix}This process currently looks strong enough and stable enough to trust. The current question is less about emergency intervention and more about maintaining what is working.`;
      actionText = "Keep observing at a normal cadence. Do not manufacture drama where the process already looks legible and healthy.";
    } else if (scoreObject.normalizedScore >= 0.62) {
      stateLabel = "Mixed but legible";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}The process is not clearly broken, but it also does not cleanly justify complacency. You likely have some real strengths plus a few weak structural points.`;
      actionText = "Keep observing, but focus your attention on the weakest lens rather than treating every fluctuation as equally important.";
    } else if (scoreObject.averageConfidence < 2.5) {
      stateLabel = "Too early to judge";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}The main problem here is not necessarily that the process is bad. It is that your signal is still weak or too ambiguous to justify a hard interpretation.`;
      actionText = "Reduce uncertainty first. Gather one more cycle of evidence, especially around the lens with the lowest confidence.";
    } else {
      stateLabel = "Negative trend or weak control";
      stateClassName = "bad";
      stateCopy = `${subjectPrefix}This process does not currently look well controlled. Either the level is poor, the pattern is unstable, or the recovery behavior is too weak to trust.`;
      actionText = "Intervene instead of passively hoping. Treat the weakest lens as a structural problem, not a temporary annoyance.";
    }
  }

  if (state.mode === "event") {
    if (scoreObject.normalizedScore >= 0.8 && scoreObject.averageConfidence >= 3) {
      stateLabel = "Accept";
      stateClassName = "good";
      stateCopy = `${subjectPrefix}This specific threshold decision or outcome appears acceptable. The tradeoffs look manageable, and the downside of acceptance appears limited relative to the upside of closure.`;
      actionText = "Accept the threshold, but document any non-zero concern that could matter later.";
    } else if (scoreObject.normalizedScore >= 0.64) {
      stateLabel = "Accept with monitoring";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}The threshold is probably acceptable, but not cleanly so. There is at least one dimension where acceptance should be paired with active follow-up rather than passive trust.`;
      actionText = "Proceed only with a monitoring plan. Make the follow-up criteria explicit now rather than relying on memory later.";
    } else if (scoreObject.averageConfidence < 2.5) {
      stateLabel = "Delay";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}The limiting factor is uncertainty. You do not yet know enough to accept or reject this threshold cleanly.`;
      actionText = "Delay the decision and gather the most decision-relevant missing information. Do not hide uncertainty behind a forced yes or no.";
    } else {
      stateLabel = "Rework or reject";
      stateClassName = "bad";
      stateCopy = `${subjectPrefix}The current threshold quality does not justify acceptance. The gap from target, the lock-in, or the downstream cost is too high.`;
      actionText = "Push for rework if the outcome is fixable. Reject outright if the downside is irreversible or compounding.";
    }
  }

  if (state.mode === "readiness") {
    if (scoreObject.normalizedScore >= 0.78 && scoreObject.averageConfidence >= 3) {
      stateLabel = "Ready for threshold decision";
      stateClassName = "good";
      stateCopy = `${subjectPrefix}The process now looks mature enough that continued waiting probably adds less value than making a considered decision.`;
      actionText = "Move into a threshold decision. Do not keep observing simply because observation feels safer than commitment.";
    } else if (scoreObject.normalizedScore >= 0.6) {
      stateLabel = "Almost ripe, keep testing under real conditions";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}You probably have meaningful signal, but not yet enough depth or stability to treat it as decisive.`;
      actionText = "Observe under one or two more stressful or realistic conditions, especially around recovery and persistence.";
    } else if (scoreObject.averageConfidence < 2.6) {
      stateLabel = "Signal too weak";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}This process has not yet earned a threshold decision. The issue is more epistemic than emotional: the pattern is not yet clear enough.`;
      actionText = "Wait and gather stronger evidence. You do not yet have the right to conclude.";
    } else {
      stateLabel = "Not ready, or ready to reject";
      stateClassName = "bad";
      stateCopy = `${subjectPrefix}The signal is already informative enough to warn against commitment, or the process remains too weak to justify moving forward.`;
      actionText = "Do not escalate into commitment. Either keep distance or explicitly reject, depending on the domain and stakes.";
    }
  }

  if (state.mode === "regime") {
    if (scoreObject.normalizedScore >= 0.78 && scoreObject.averageConfidence >= 3) {
      stateLabel = "Stable regime";
      stateClassName = "good";
      stateCopy = `${subjectPrefix}The post-event reality looks healthy. Initial conditions, feedback loops, and early drift are aligned well enough to support trust.`;
      actionText = "Monitor at a normal cadence and protect the loops that are making the regime work.";
    } else if (scoreObject.normalizedScore >= 0.6) {
      stateLabel = "Fragile but recoverable";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}The regime is not failing, but it has weak spots. It needs explicit management before those weaknesses harden into structure.`;
      actionText = "Intervene early. Focus on adaptation capacity and early drift before this becomes a chronic pattern.";
    } else if (scoreObject.averageConfidence < 2.5) {
      stateLabel = "Unclear regime";
      stateClassName = "warn";
      stateCopy = `${subjectPrefix}You are inside a regime, but do not yet understand it well. That makes both complacency and panic premature.`;
      actionText = "Improve monitoring clarity first. Decide what signals would clearly tell you whether this regime is stabilizing or decaying.";
    } else {
      stateLabel = "Drifting or failing regime";
      stateClassName = "bad";
      stateCopy = `${subjectPrefix}The regime created by the past decision is not converging well. Weak initial conditions or bad loops are now visible in ongoing life.`;
      actionText = "Treat this as a regime problem, not a mood problem. Change structure, feedback loops, or constraints.";
    }
  }

  const driverInsight = `Strongest support comes from ${scoreObject.strongestCriterion.title.toLowerCase()}, while the main drag comes from ${scoreObject.weakestCriterion.title.toLowerCase()}. This means the recommendation is being pulled by one strong structural feature and one weak one, not by vague overall feeling.`;
  const uncertaintyInsight = `Your lowest-confidence lens is ${scoreObject.lowestConfidenceCriterion.title.toLowerCase()}. The next clarity move should target that lens directly instead of collecting more generic impressions. Average confidence is ${formatNumber(scoreObject.averageConfidence)} out of 5.`;

  return {
    stateLabel,
    stateClassName,
    stateCopy,
    actionText,
    driverInsight,
    uncertaintyInsight,
    scoreObject
  };
}

function renderRecommendation() {
  const recommendation = deriveRecommendation();
  const resultStateValue = document.getElementById("result-state-value");
  resultStateValue.textContent = recommendation.stateLabel;
  resultStateValue.className = `result-state-value ${recommendation.stateClassName}`;
  document.getElementById("result-state-copy").textContent = recommendation.stateCopy;
  document.getElementById("driver-insight").textContent = recommendation.driverInsight;
  document.getElementById("uncertainty-insight").textContent = recommendation.uncertaintyInsight;
  document.getElementById("action-insight").textContent = recommendation.actionText;
  document.getElementById("current-state-label").textContent = recommendation.stateLabel;

  const footerNote = document.getElementById("footer-note");
  footerNote.textContent = `Weighted fit score: ${formatNumber(recommendation.scoreObject.normalizedScore * 5)} / 5. Average confidence: ${formatNumber(recommendation.scoreObject.averageConfidence)} / 5. Average importance: ${formatNumber(recommendation.scoreObject.averageImportance)} / 5.`;

  document.getElementById("nav-step-mode").classList.remove("active");
  document.getElementById("nav-step-domain").classList.remove("active");
  document.getElementById("nav-step-score").classList.remove("active");
  document.getElementById("nav-step-result").classList.add("active");
}

function renderNavState() {
  document.getElementById("nav-step-mode").classList.add("active");
  document.getElementById("nav-step-domain").classList.add("active");
  document.getElementById("nav-step-score").classList.add("active");
  document.getElementById("nav-step-result").classList.remove("active");
}

function loadExample() {
  if (state.mode === "process") {
    state.domain = "Relationship";
    state.subject = "Courtship";
    subjectInput.value = state.subject;
    state.criteriaValues = {
      level: { estimate: 4, confidence: 4, importance: 4, note: "Overall compatibility feels strong." },
      trend: { estimate: 4, confidence: 3, importance: 5, note: "Closeness has grown over the last few months." },
      variance: { estimate: 3, confidence: 3, importance: 4, note: "Some oscillation around conflict." },
      shock: { estimate: 4, confidence: 4, importance: 3, note: "No major betrayal or break." },
      recovery: { estimate: 3, confidence: 2, importance: 5, note: "Conflict repair still not fully tested." },
      persistence: { estimate: 3, confidence: 3, importance: 4, note: "Pattern is encouraging, but not ancient." }
    };
  }

  if (state.mode === "event") {
    state.domain = "Health";
    state.subject = "Front tooth implant result";
    subjectInput.value = state.subject;
    state.criteriaValues = {
      targetFit: { estimate: 3, confidence: 4, importance: 5, note: "Shape is close, color slightly off." },
      salience: { estimate: 2, confidence: 4, importance: 4, note: "Visible at conversational distance." },
      functionalAdequacy: { estimate: 5, confidence: 5, importance: 5, note: "Function and comfort are good." },
      reworkCost: { estimate: 2, confidence: 4, importance: 4, note: "Redo is possible but annoying and costly." },
      irreversibility: { estimate: 2, confidence: 4, importance: 5, note: "Accepting sets a long baseline." },
      downstreamConsequence: { estimate: 3, confidence: 3, importance: 5, note: "Cosmetic dissatisfaction may persist." }
    };
  }

  if (state.mode === "readiness") {
    state.domain = "Relationship";
    state.subject = "Courtship to marriage";
    subjectInput.value = state.subject;
    state.criteriaValues = {
      level: { estimate: 4, confidence: 4, importance: 4, note: "Strong relationship overall." },
      trend: { estimate: 4, confidence: 3, importance: 4, note: "Direction remains positive." },
      variance: { estimate: 3, confidence: 3, importance: 5, note: "Some volatility but not chaos." },
      recovery: { estimate: 3, confidence: 2, importance: 5, note: "Not enough stress tests yet." },
      persistence: { estimate: 3, confidence: 3, importance: 4, note: "Enough time to matter, not enough to be final." },
      urgency: { estimate: 2, confidence: 3, importance: 3, note: "Delay is not yet expensive." }
    };
  }

  if (state.mode === "regime") {
    state.domain = "Work / hiring";
    state.subject = "New hire after 90 days";
    subjectInput.value = state.subject;
    state.criteriaValues = {
      initialConditionQuality: { estimate: 4, confidence: 4, importance: 4, note: "Started with role clarity." },
      constraintLoad: { estimate: 3, confidence: 3, importance: 3, note: "Team load is manageable." },
      feedbackLoopQuality: { estimate: 2, confidence: 4, importance: 5, note: "Weak communication loop is slowing adaptation." },
      adaptationCapacity: { estimate: 4, confidence: 4, importance: 5, note: "Learns quickly from feedback." },
      monitoringClarity: { estimate: 4, confidence: 5, importance: 4, note: "Performance signals are visible." },
      earlyDrift: { estimate: 3, confidence: 3, importance: 5, note: "Improving, but not cleanly enough yet." }
    };
  }

  renderAll();
  renderRecommendation();
}

function resetScores() {
  initializeCriteriaForMode(state.mode);
  state.subject = "";
  subjectInput.value = "";
  renderAll();
  document.getElementById("result-state-value").textContent = "Not computed yet";
  document.getElementById("result-state-value").className = "result-state-value warn";
  document.getElementById("result-state-copy").textContent = "Choose a mode, score the lenses, and compute a recommendation.";
  document.getElementById("driver-insight").textContent = "No result yet.";
  document.getElementById("uncertainty-insight").textContent = "No result yet.";
  document.getElementById("action-insight").textContent = "No result yet.";
  document.getElementById("current-state-label").textContent = "Not computed yet";
}

function renderAll() {
  renderModeButtons();
  renderDomainButtons();
  renderCriteria();
  updateSidebarStats();
  renderResultTable();
  renderNavState();
  subjectInput.value = state.subject;
}

document.getElementById("compute-button").addEventListener("click", renderRecommendation);
document.getElementById("reset-button").addEventListener("click", resetScores);
document.getElementById("example-button").addEventListener("click", loadExample);
subjectInput.addEventListener("input", (event) => {
  state.subject = event.target.value;
});

initializeCriteriaForMode(state.mode);
renderAll();
