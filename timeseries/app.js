const modeDefinitions = {
  process: {
    label: "Observe a process",
    shortLabel: "Process",
    description: "Tracking ongoing behavior over time (courtship, grades, business performance).",
    intro: "Is this noise, a stable pattern, or a breakdown?",
    criteria: [
      { key: "level", title: "Level", description: "Average state/baseline quality." },
      { key: "trend", title: "Trend", description: "Direction: improving, flat, or degrading?" },
      { key: "variance", title: "Variance", description: "Stability: high volatility reduces trust." },
      { key: "shock", title: "Shock", description: "Impact of serious disruptions." },
      { key: "recovery", title: "Recovery", description: "Ability to return to state after stress." },
      { key: "persistence", title: "Persistence", description: "Has the pattern lasted long enough?" }
    ]
  },
  event: {
    label: "Decide on a threshold",
    shortLabel: "Threshold",
    description: "Accepting or rejecting a specific outcome (marriage, hire, purchase).",
    intro: "Is this outcome acceptable as-is?",
    criteria: [
      { key: "targetFit", title: "Target fit", description: "Closeness to the actual desired outcome." },
      { key: "salience", title: "Salience", description: "How noticeable are the deviations?" },
      { key: "functionalAdequacy", title: "Functional adequacy", description: "Does it work as needed?" },
      { key: "reworkCost", title: "Rework cost", description: "Ease of correcting later." },
      { key: "irreversibility", title: "Irreversibility", description: "Remaining optionality if you proceed." },
      { key: "downstreamConsequence", title: "Consequence", description: "Future cost if accepted." }
    ]
  },
  readiness: {
    label: "Check Readiness",
    shortLabel: "Readiness",
    description: "Is a process ripe for a commitment (interviewing to hiring)?",
    intro: "Does waiting add more clarity than it adds cost?",
    criteria: [
      { key: "level", title: "Level", description: "Favorability for a commitment." },
      { key: "trend", title: "Trend", description: "Is it moving toward a clear signal?" },
      { key: "variance", title: "Variance", description: "Stable enough to interpret?" },
      { key: "recovery", title: "Recovery", description: "Behavior after stress/conflict." },
      { key: "persistence", title: "Persistence", description: "Has the signal lasted long enough?" },
      { key: "urgency", title: "Urgency", description: "Cost of further delay." }
    ]
  },
  regime: {
    label: "Evaluate Regime",
    shortLabel: "Regime",
    description: "Understanding the ongoing reality after a decision (married life).",
    intro: "Did the decision initialize a healthy or fragile regime?",
    criteria: [
      { key: "initialConditionQuality", title: "Starting State", description: "Quality immediately after threshold." },
      { key: "constraintLoad", title: "Constraints", description: "Burdens/obligations created." },
      { key: "feedbackLoopQuality", title: "Feedback Loops", description: "Reinforcing loops quality." },
      { key: "adaptationCapacity", title: "Adaptation", description: "Self-correction capability." },
      { key: "monitoringClarity", title: "Clarity", description: "Visibility of health/drift." },
      { key: "earlyDrift", title: "Early Drift", description: "Direction since initialization." }
    ]
  }
};

const domainDefinitions = ["Relationship", "Health", "Work", "Product", "Custom"];

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

function formatNumber(n) { return Number(n).toFixed(1); }

function initializeCriteriaForMode(modeKey) {
  const criteria = modeDefinitions[modeKey].criteria;
  const nextValues = {};
  criteria.forEach(c => {
    nextValues[c.key] = state.criteriaValues[c.key] || { estimate: 3, confidence: 3, importance: 3, note: "" };
  });
  state.criteriaValues = nextValues;
}

function renderModeButtons() {
  modeButtonGrid.innerHTML = "";
  Object.entries(modeDefinitions).forEach(([key, def]) => {
    const btn = document.createElement("button");
    btn.className = "choice-button" + (state.mode === key ? " active" : "");
    btn.innerHTML = `<span class="choice-title">${def.label}</span><span class="choice-copy">${def.description}</span>`;
    btn.onclick = () => { state.mode = key; initializeCriteriaForMode(key); renderAll(); };
    modeButtonGrid.appendChild(btn);
  });
}

function renderDomainButtons() {
  domainTagRow.innerHTML = "";
  domainDefinitions.forEach(val => {
    const btn = document.createElement("button");
    btn.className = "tag-button" + (state.domain === val ? " active" : "");
    btn.textContent = val;
    btn.onclick = () => { state.domain = val; renderAll(); };
    domainTagRow.appendChild(btn);
  });
}

function renderCriteria() {
  const cur = modeDefinitions[state.mode];
  document.getElementById("lenses-intro-copy").textContent = cur.intro + " Score each lens (1-5) based on current state, confidence, and importance.";
  criterionGrid.innerHTML = "";

  cur.criteria.forEach(c => {
    const vals = state.criteriaValues[c.key];
    const card = document.createElement("div");
    card.className = "criterion-card";
    card.innerHTML = `
      <div class="criterion-header"><div class="criterion-title">${c.title}</div></div>
      <p class="criterion-description">${c.description}</p>
      <div class="range-group">
        <div class="range-block"><div class="range-label-row"><span>Estimate</span><span>${vals.estimate}</span></div>
          <input type="range" min="1" max="5" step="1" value="${vals.estimate}" data-key="${c.key}" data-field="estimate" /></div>
        <div class="range-block"><div class="range-label-row"><span>Confidence</span><span>${vals.confidence}</span></div>
          <input type="range" min="1" max="5" step="1" value="${vals.confidence}" data-key="${c.key}" data-field="confidence" /></div>
        <div class="range-block"><div class="range-label-row"><span>Importance</span><span>${vals.importance}</span></div>
          <input type="range" min="1" max="5" step="1" value="${vals.importance}" data-key="${c.key}" data-field="importance" /></div>
      </div>
      <textarea placeholder="Contextual note..." data-key="${c.key}" data-field="note">${escapeHtml(vals.note)}</textarea>
    `;
    criterionGrid.appendChild(card);
  });

  criterionGrid.querySelectorAll("input, textarea").forEach(el => {
    el.oninput = (e) => {
      const key = e.target.dataset.key;
      const field = e.target.dataset.field;
      const val = field === "note" ? e.target.value : Number(e.target.value);
      state.criteriaValues[key][field] = val;
      if (field !== "note") e.target.previousElementSibling.querySelector("span:last-child").textContent = val;
      updateSidebarStats();
    };
  });
}

function escapeHtml(t) { return String(t).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }

function getCriteriaArray() {
  return modeDefinitions[state.mode].criteria.map(c => ({ ...c, ...state.criteriaValues[c.key] }));
}

function updateSidebarStats() {
  const arr = getCriteriaArray();
  const avgConf = arr.reduce((s, c) => s + c.confidence, 0) / arr.length;
  document.getElementById("sidebar-average-confidence").textContent = `${formatNumber(avgConf)} / 5`;
  document.getElementById("current-mode-label").textContent = modeDefinitions[state.mode].shortLabel;
  document.getElementById("current-domain-label").textContent = state.domain;
}

function renderResultTable() {
  const arr = getCriteriaArray();
  resultTableBody.innerHTML = arr.map(c => `<tr><td>${c.title}</td><td>${c.estimate}</td><td>${c.confidence}</td></tr>`).join("");
}

function scoreCriteria() {
  const arr = getCriteriaArray();
  const weightedTotal = arr.reduce((s, c) => s + c.estimate * c.importance * c.confidence, 0);
  const weightedMax = arr.reduce((s, c) => s + 5 * c.importance * c.confidence, 0);
  const normalizedScore = weightedMax === 0 ? 0 : weightedTotal / weightedMax;
  const avgConf = arr.reduce((s, c) => s + c.confidence, 0) / arr.length;
  const lowestConf = [...arr].sort((a, b) => a.confidence - b.confidence)[0];
  const strongest = [...arr].sort((a, b) => (b.estimate * b.importance) - (a.estimate * a.importance))[0];
  const weakest = [...arr].sort((a, b) => (a.estimate * a.importance) - (b.estimate * b.importance))[0];
  return { normalizedScore, avgConf, lowestConf, strongest, weakest };
}

function renderRecommendation() {
  const s = scoreCriteria();
  const sub = state.subject.trim() ? `${state.subject}: ` : "";
  let label = "Mixed", cls = "warn", copy = "", action = "";

  if (state.mode === "process") {
    if (s.normalizedScore >= 0.78 && s.avgConf >= 3.2) { label = "Healthy"; cls = "good"; copy = `${sub}Stable and strong. Focus on maintenance.`; action = "Keep observing at normal cadence."; }
    else if (s.avgConf < 2.5) { label = "Early"; cls = "warn"; copy = `${sub}Signal is too weak for judgment.`; action = "Gather more evidence cycles."; }
    else { label = "Weak Control"; cls = "bad"; copy = `${sub}Process is unstable or degrading.`; action = "Intervene on structural issues."; }
  } else if (state.mode === "event") {
    if (s.normalizedScore >= 0.8 && s.avgConf >= 3) { label = "Accept"; cls = "good"; copy = `${sub}Outcome is acceptable. Manageable tradeoffs.`; action = "Proceed and document concerns."; }
    else if (s.avgConf < 2.5) { label = "Delay"; cls = "warn"; copy = `${sub}Uncertainty is too high to commit.`; action = "Gather missing decision-relevant info."; }
    else { label = "Reject/Rework"; cls = "bad"; copy = `${sub}Quality gap or irreversibility is too high.`; action = "Push for rework or reject."; }
  } else if (state.mode === "readiness") {
    if (s.normalizedScore >= 0.78 && s.avgConf >= 3) { label = "Ready"; cls = "good"; copy = `${sub}Process is mature. Signal is strong.`; action = "Move to threshold decision."; }
    else { label = "Not Ready"; cls = "warn"; copy = `${sub}Signal too weak or pattern unclear.`; action = "Wait for stronger evidence."; }
  } else {
    if (s.normalizedScore >= 0.78 && s.avgConf >= 3) { label = "Stable Regime"; cls = "good"; copy = `${sub}Post-event reality is healthy.`; action = "Protect working loops."; }
    else { label = "Fragile Regime"; cls = "bad"; copy = `${sub}Regime is not converging well.`; action = "Intervene on feedback loops."; }
  }

  const resVal = document.getElementById("result-state-value");
  resVal.textContent = label; resVal.className = `result-state-value ${cls}`;
  document.getElementById("result-state-copy").textContent = copy;
  document.getElementById("driver-insight").textContent = `Strongest: ${s.strongest.title}, Weakest: ${s.weakest.title}.`;
  document.getElementById("uncertainty-insight").textContent = `Lowest confidence: ${s.lowestConf.title} (${s.lowestConf.confidence}/5).`;
  document.getElementById("action-insight").textContent = action;
  renderResultTable();
  document.getElementById("nav-step-result").classList.add("active");
  resVal.scrollIntoView({ behavior: "smooth", block: "center" });
}

function loadExample() {
  if (state.mode === "process") {
    state.domain = "Relationship"; state.subject = "Courtship";
    state.criteriaValues = {
      level: { estimate: 4, confidence: 4, importance: 4, note: "Strong compatibility." },
      trend: { estimate: 4, confidence: 3, importance: 5, note: "Improving closeness." },
      variance: { estimate: 3, confidence: 3, importance: 4, note: "Normal conflict." },
      shock: { estimate: 4, confidence: 4, importance: 3, note: "No betrayals." },
      recovery: { estimate: 3, confidence: 2, importance: 5, note: "Untested repair." },
      persistence: { estimate: 3, confidence: 3, importance: 4, note: "Few months only." }
    };
  } else if (state.mode === "event") {
    state.domain = "Health"; state.subject = "Implant Result";
    state.criteriaValues = {
      targetFit: { estimate: 3, confidence: 4, importance: 5, note: "Color slightly off." },
      salience: { estimate: 2, confidence: 4, importance: 4, note: "Visible." },
      functionalAdequacy: { estimate: 5, confidence: 5, importance: 5, note: "Comfortable." },
      reworkCost: { estimate: 2, confidence: 4, importance: 4, note: "Expensive redo." },
      irreversibility: { estimate: 2, confidence: 4, importance: 5, note: "Permanent." },
      downstreamConsequence: { estimate: 3, confidence: 3, importance: 5, note: "Static flaw." }
    };
  }
  renderAll(); renderRecommendation();
}

function resetScores() { initializeCriteriaForMode(state.mode); state.subject = ""; subjectInput.value = ""; renderAll(); }

function renderAll() {
  renderModeButtons(); renderDomainButtons(); renderCriteria(); updateSidebarStats();
  document.querySelectorAll(".step-item").forEach(el => el.classList.remove("active"));
  document.getElementById("nav-step-mode").classList.add("active");
  subjectInput.value = state.subject;
}

document.getElementById("compute-button").onclick = renderRecommendation;
document.getElementById("reset-button").onclick = resetScores;
document.getElementById("example-button").onclick = loadExample;
subjectInput.oninput = (e) => state.subject = e.target.value;

initializeCriteriaForMode(state.mode);
renderAll();
