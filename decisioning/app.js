import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

(function initializeDecisionCoachPage() {
  "use strict";

      const axisDomains = { minimum: 0, maximum: 10 };
      const thresholdMidpoint = 5;
      const neutralDefaultValue = 5;
      const neutralValueTolerance = 0.0001;

      const CASE_TYPES = {
        truth_stakes: "truth_stakes",
        bet_sizing: "bet_sizing",
        one_way_door: "one_way_door"
      };

      const SCENARIO_TYPES = {
        base: "base",
        upside: "upside",
        downside: "downside"
      };

      const scenarioDefinitions = [
        {
          scenarioKey: SCENARIO_TYPES.base,
          labelText: "Base",
          helpText: "Most likely case"
        },
        {
          scenarioKey: SCENARIO_TYPES.upside,
          labelText: "Upside",
          helpText: "If assumptions break in your favor"
        },
        {
          scenarioKey: SCENARIO_TYPES.downside,
          labelText: "Downside",
          helpText: "If key risks materialize"
        }
      ];

      const sliderStateKeys = [
        "accuracyConfidence",
        "stakesImpact",
        "expectedValue",
        "uncertainty",
        "reversibility"
      ];

      const initialScoreState = {
        accuracyConfidence: 5.0,
        stakesImpact: 5.0,
        expectedValue: 5.0,
        uncertainty: 5.0,
        reversibility: 5.0
      };

      function cloneInitialScoreState() {
        return { ...initialScoreState };
      }

      const initialApplicationState = {
        caseType: null,
        problemText: "",
        scenarioModeEnabled: false,
        activeScenarioKey: SCENARIO_TYPES.base
      };
      const applicationState = { ...initialApplicationState };
      const scenarioScoresByKey = {
        [SCENARIO_TYPES.base]: cloneInitialScoreState(),
        [SCENARIO_TYPES.upside]: cloneInitialScoreState(),
        [SCENARIO_TYPES.downside]: cloneInitialScoreState()
      };

      const wizardState = { unlockedStep: 1 };
      const touchedSliderKeys = new Set();

      function clampToDomain(candidateValue) {
        if (candidateValue < axisDomains.minimum) return axisDomains.minimum;
        if (candidateValue > axisDomains.maximum) return axisDomains.maximum;
        return candidateValue;
      }

	      function roundToSingleDecimal(candidateValue) {
	        return Math.round(candidateValue * 10) / 10;
	      }

	      function applyStyles(targetSelection, styleObject) {
	        for (const [propertyName, propertyValue] of Object.entries(styleObject)) {
	          targetSelection.style(propertyName, propertyValue);
	        }
	      }

      function isHigh(candidateValue) {
        return candidateValue > thresholdMidpoint;
      }

      function isNeutralValue(candidateValue) {
        return Math.abs(candidateValue - neutralDefaultValue) <= neutralValueTolerance;
      }

      function areAllNeutralValues(valueList) {
        return valueList.every(isNeutralValue);
      }

      function getRequiredSliderKeysForCase(caseType) {
        if (caseType === CASE_TYPES.truth_stakes) {
          return ["accuracyConfidence", "stakesImpact"];
        }
        if (caseType === CASE_TYPES.bet_sizing) {
          return ["expectedValue", "uncertainty"];
        }
        if (caseType === CASE_TYPES.one_way_door) {
          return ["expectedValue", "uncertainty", "reversibility"];
        }
        return [];
      }

      function getVisibleControlGroupCaseTypes(caseType) {
        if (caseType === CASE_TYPES.truth_stakes) {
          return [CASE_TYPES.truth_stakes];
        }
        if (caseType === CASE_TYPES.bet_sizing) {
          return [CASE_TYPES.bet_sizing];
        }
        if (caseType === CASE_TYPES.one_way_door) {
          return [CASE_TYPES.bet_sizing, CASE_TYPES.one_way_door];
        }
        return [];
      }

      function getPrimaryControlGroupCaseType(caseType) {
        if (caseType === CASE_TYPES.one_way_door) {
          return CASE_TYPES.one_way_door;
        }
        return caseType || null;
      }

      function getScenarioLabelText(scenarioKey) {
        return scenarioDefinitions.find((definition) => definition.scenarioKey === scenarioKey)?.labelText || scenarioKey;
      }

      function getScenarioScores(scenarioKey) {
        return scenarioScoresByKey[scenarioKey] || scenarioScoresByKey[SCENARIO_TYPES.base];
      }

      function getActiveScenarioScores() {
        return getScenarioScores(applicationState.activeScenarioKey);
      }

      function getScoreValue(stateKey, scenarioKey = applicationState.activeScenarioKey) {
        return getScenarioScores(scenarioKey)[stateKey];
      }

      function setActiveScenarioScores(partialScoreUpdate) {
        const activeScores = getActiveScenarioScores();
        Object.assign(activeScores, partialScoreUpdate);
        synchronizeAllViews();
      }

      function resetScenarioScores() {
        for (const scenarioDefinition of scenarioDefinitions) {
          scenarioScoresByKey[scenarioDefinition.scenarioKey] = cloneInitialScoreState();
        }
      }

      function setState(partialUpdate) {
        Object.assign(applicationState, partialUpdate);
        synchronizeAllViews();
      }

      // ---------- Step 1: Case selection ----------
      const caseGrid = document.getElementById("caseGrid");
      const step1Section = document.getElementById("step1Section");
      const step2Section = document.getElementById("step2Section");
      const step3Section = document.getElementById("step3Section");
      const step4Section = document.getElementById("step4Section");
      const step5Section = document.getElementById("step5Section");

      const step1ContinueButton = document.getElementById("step1ContinueButton");
      const step2ContinueButton = document.getElementById("step2ContinueButton");
      const step3ContinueButton = document.getElementById("step3ContinueButton");
      const step4ContinueButton = document.getElementById("step4ContinueButton");
      const step3GuideText = document.getElementById("step3GuideText");
      const scenarioModeCheckbox = document.getElementById("scenarioModeCheckbox");
      const scenarioModeHint = document.getElementById("scenarioModeHint");
      const scenarioTabs = document.getElementById("scenarioTabs");
      const scenarioTabButtonsByKey = new Map(
        scenarioDefinitions.map((definition) => [
          definition.scenarioKey,
          document.getElementById(`scenarioTab-${definition.scenarioKey}`)
        ])
      );

      const caseDefinitions = [
        {
          caseType: CASE_TYPES.truth_stakes,
          titleText: "I’m unsure what’s true, but consequences vary",
          badgeText: "Primary: Confidence × Consequence",
          bodyText: "Use when you’re choosing a belief or action and the key question is: how confident am I, and how costly is it if I’m wrong?"
        },
        {
          caseType: CASE_TYPES.bet_sizing,
          titleText: "I’m choosing among opportunities and how hard to push",
          badgeText: "Primary: EV × Outcome uncertainty",
          bodyText: "Use when you’re deciding how big the bet should be: core bet, option/probe, or reject."
        },
        {
          caseType: CASE_TYPES.one_way_door,
          titleText: "This might lock me in (hard to undo)",
          badgeText: "Primary: 3D with Reversibility",
          bodyText: "Use when reversibility changes everything: irreversible moves require higher proof and safety margins."
        }
      ];

      function renderCaseCards() {
        caseGrid.innerHTML = "";

        for (const caseDefinition of caseDefinitions) {
          const cardElement = document.createElement("div");
          cardElement.className = "case-card";
          cardElement.dataset.selected = String(applicationState.caseType === caseDefinition.caseType);

          const titleRow = document.createElement("div");
          titleRow.className = "case-title-row";

          const titleElement = document.createElement("p");
          titleElement.className = "case-title";
          titleElement.textContent = caseDefinition.titleText;

          const badgeElement = document.createElement("span");
          badgeElement.className = "case-badge";
          badgeElement.textContent = caseDefinition.badgeText;

          titleRow.appendChild(titleElement);
          titleRow.appendChild(badgeElement);

          const bodyElement = document.createElement("p");
          bodyElement.className = "case-body";
          bodyElement.textContent = caseDefinition.bodyText;

          cardElement.appendChild(titleRow);
          cardElement.appendChild(bodyElement);

          cardElement.addEventListener("click", () => {
            if (applicationState.caseType !== caseDefinition.caseType) {
              touchedSliderKeys.clear();
              wizardState.unlockedStep = Math.min(wizardState.unlockedStep, 2);
            }
            setState({ caseType: caseDefinition.caseType });
          });

          caseGrid.appendChild(cardElement);
        }
      }

      // ---------- Step 2: Problem text ----------
      const problemTextArea = document.getElementById("problemTextArea");
      problemTextArea.addEventListener("input", () => {
        setState({ problemText: problemTextArea.value });
      });

      scenarioModeCheckbox.addEventListener("change", () => {
        const shouldEnableScenarioMode = Boolean(scenarioModeCheckbox.checked);
        if (!shouldEnableScenarioMode) {
          setState({
            scenarioModeEnabled: false,
            activeScenarioKey: SCENARIO_TYPES.base
          });
          return;
        }
        setState({ scenarioModeEnabled: true });
      });

      for (const scenarioDefinition of scenarioDefinitions) {
        const buttonElement = scenarioTabButtonsByKey.get(scenarioDefinition.scenarioKey);
        buttonElement?.addEventListener("click", () => {
          if (!applicationState.scenarioModeEnabled) return;
          setState({ activeScenarioKey: scenarioDefinition.scenarioKey });
        });
      }

      // ---------- Step 3: Controls ----------
      const controlsHost = document.getElementById("controlsHost");

      function createSliderRow(sliderDefinition) {
        const rowElement = document.createElement("div");
        rowElement.className = "control-row";

        const labelElement = document.createElement("label");
        labelElement.textContent = sliderDefinition.labelText;

        const inputStackElement = document.createElement("div");
        inputStackElement.className = "control-input-stack";

        const inputElement = document.createElement("input");
        inputElement.type = "range";
        inputElement.min = String(axisDomains.minimum);
        inputElement.max = String(axisDomains.maximum);
        inputElement.step = "0.1";
        inputElement.value = String(getScoreValue(sliderDefinition.stateKey));
        inputElement.setAttribute("aria-label", sliderDefinition.labelText);
        inputElement.id = `slider-${sliderDefinition.stateKey}`;
        labelElement.htmlFor = inputElement.id;

        const extremesElement = document.createElement("div");
        extremesElement.className = "control-extremes";

        const lowExtremeElement = document.createElement("span");
        lowExtremeElement.className = "control-extreme control-extreme--low";
        lowExtremeElement.textContent = sliderDefinition.lowLabelText || "0 = Low";

        const highExtremeElement = document.createElement("span");
        highExtremeElement.className = "control-extreme control-extreme--high";
        highExtremeElement.textContent = sliderDefinition.highLabelText || "10 = High";

        extremesElement.appendChild(lowExtremeElement);
        extremesElement.appendChild(highExtremeElement);

        inputStackElement.appendChild(inputElement);
        inputStackElement.appendChild(extremesElement);

        const outputElement = document.createElement("output");
        outputElement.textContent = roundToSingleDecimal(getScoreValue(sliderDefinition.stateKey)).toFixed(1);
        outputElement.title = sliderDefinition.helpText;

        inputElement.addEventListener("input", () => {
          const parsedValue = Number(inputElement.value);
          touchedSliderKeys.add(sliderDefinition.stateKey);
          setActiveScenarioScores({ [sliderDefinition.stateKey]: clampToDomain(parsedValue) });
        });

        rowElement.appendChild(labelElement);
        rowElement.appendChild(inputStackElement);
        rowElement.appendChild(outputElement);

        return { rowElement, inputElement, outputElement };
      }

      const sliderBindingsByKey = new Map();
      const controlGroupBindingsByCaseType = new Map();

      const groupDefinitions = [
        {
          groupKey: "truth_group",
          titleText: "Confidence × Consequence (truth vs cost of error)",
          emphasisCaseType: CASE_TYPES.truth_stakes,
          sliders: [
            {
              stateKey: "accuracyConfidence",
              labelText: "Confidence in being right",
              helpText: "How likely you’re correct",
              lowLabelText: "0 = very low confidence",
              highLabelText: "10 = very high confidence"
            },
            {
              stateKey: "stakesImpact",
              labelText: "Consequence if wrong",
              helpText: "How costly this is if your choice is wrong",
              lowLabelText: "0 = almost no downside if wrong",
              highLabelText: "10 = severe downside if wrong"
            }
          ]
        },
        {
          groupKey: "bet_group",
          titleText: "Expected Value × Outcome uncertainty (upside vs spread)",
          emphasisCaseType: CASE_TYPES.bet_sizing,
          sliders: [
            {
              stateKey: "expectedValue",
              labelText: "Expected Value",
              helpText: "Mean benefit if you do it",
              lowLabelText: "0 = little / negative upside",
              highLabelText: "10 = large upside"
            },
            {
              stateKey: "uncertainty",
              labelText: "Outcome uncertainty",
              helpText: "How wide outcomes can vary (estimate fragility)",
              lowLabelText: "0 = outcomes are predictable",
              highLabelText: "10 = outcomes vary a lot"
            }
          ]
        },
        {
          groupKey: "reversibility_group",
          titleText: "Reversibility (changes the proof bar)",
          emphasisCaseType: CASE_TYPES.one_way_door,
          sliders: [
            {
              stateKey: "reversibility",
              labelText: "Reversibility",
              helpText: "How easily you can undo the decision",
              lowLabelText: "0 = hard to undo",
              highLabelText: "10 = easy to undo"
            }
          ]
        }
      ];

      const sliderDefinitionByKey = new Map();
      for (const groupDefinition of groupDefinitions) {
        for (const sliderDefinition of groupDefinition.sliders) {
          sliderDefinitionByKey.set(sliderDefinition.stateKey, sliderDefinition);
        }
      }

      function buildControls() {
        controlsHost.innerHTML = "";
        sliderBindingsByKey.clear();
        controlGroupBindingsByCaseType.clear();

        for (const groupDefinition of groupDefinitions) {
          const groupElement = document.createElement("div");
          groupElement.className = "control-group";
          groupElement.dataset.emphasisCaseType = groupDefinition.emphasisCaseType;
          groupElement.dataset.emphasis = "false";

	          const titleElement = document.createElement("p");
	          titleElement.className = "control-group-title";

	          const leftTitle = document.createElement("span");
	          leftTitle.className = "control-group-title-main";
	          leftTitle.textContent = groupDefinition.titleText;

          const rightTitle = document.createElement("span");
          rightTitle.className = "control-group-title-status";

          titleElement.innerHTML = "";
          titleElement.appendChild(leftTitle);
          titleElement.appendChild(rightTitle);

          groupElement.appendChild(titleElement);

          for (const sliderDefinition of groupDefinition.sliders) {
            const created = createSliderRow(sliderDefinition);
            groupElement.appendChild(created.rowElement);
            sliderBindingsByKey.set(sliderDefinition.stateKey, created);
          }

          controlGroupBindingsByCaseType.set(groupDefinition.emphasisCaseType, {
            groupElement,
            statusElement: rightTitle
          });

          controlsHost.appendChild(groupElement);
        }
      }

      function updateControlGroupEmphasis() {
        const visibleCaseTypes = new Set(getVisibleControlGroupCaseTypes(applicationState.caseType));
        const primaryCaseType = getPrimaryControlGroupCaseType(applicationState.caseType);

        for (const [caseType, binding] of controlGroupBindingsByCaseType.entries()) {
          const isVisible = visibleCaseTypes.has(caseType);
          const isPrimary = caseType === primaryCaseType;
          binding.groupElement.hidden = !isVisible;
          binding.groupElement.dataset.emphasis = String(isPrimary);
          if (isVisible) {
            binding.statusElement.textContent = isPrimary ? "Required now" : "Also required";
          } else {
            binding.statusElement.textContent = "";
          }
        }
      }

      function updateScenarioControls() {
        scenarioModeCheckbox.checked = applicationState.scenarioModeEnabled;
        scenarioTabs.hidden = !applicationState.scenarioModeEnabled;

        if (!applicationState.scenarioModeEnabled) {
          scenarioModeHint.textContent = "Using one score set. Enable scenarios to compare Base/Upside/Downside before committing.";
        } else {
          const activeScenarioLabel = getScenarioLabelText(applicationState.activeScenarioKey);
          scenarioModeHint.textContent = `Scenario mode enabled. You are editing ${activeScenarioLabel}.`;
        }

        for (const scenarioDefinition of scenarioDefinitions) {
          const buttonElement = scenarioTabButtonsByKey.get(scenarioDefinition.scenarioKey);
          if (!buttonElement) continue;
          buttonElement.disabled = !applicationState.scenarioModeEnabled;
          buttonElement.dataset.selected = String(applicationState.activeScenarioKey === scenarioDefinition.scenarioKey);
          buttonElement.title = scenarioDefinition.helpText;
        }
      }

      // ---------- 2D Charts (D3) ----------
      function create2DChart(chartHostElementId, xAxisLabelText, yAxisLabelText, getPointFromState, setPointPreviewIntoState, setPointCommitIntoState) {
        const hostElement = document.getElementById(chartHostElementId);

        const margins = { top: 16, right: 16, bottom: 46, left: 54 };
        const desiredHeight = 340;

        const svgRoot = d3.select(hostElement)
          .append("svg")
          .attr("width", "100%")
          .attr("height", desiredHeight)
          .style("overflow", "hidden");

        const defsGroup = svgRoot.append("defs");
        const plotClipId = `${chartHostElementId}-plot-clip`;
        const plotClipRect = defsGroup
          .append("clipPath")
          .attr("id", plotClipId)
          .append("rect");

        const frameGroup = svgRoot.append("g");
        const plotGroup = frameGroup.append("g")
          .attr("clip-path", `url(#${plotClipId})`);
        const xAxisGroup = frameGroup.append("g");
        const yAxisGroup = frameGroup.append("g");

        const xAxisLabel = frameGroup.append("text");
        const yAxisLabel = frameGroup.append("text");

        const backgroundRect = plotGroup.append("rect");
        const verticalMidline = plotGroup.append("line");
        const horizontalMidline = plotGroup.append("line");

        const quadrantTextGroup = plotGroup.append("g");

        const pointGroup = plotGroup.append("g")
          .attr("data-testid", `${chartHostElementId}-point-group`);
        const pointCircle = pointGroup.append("circle")
          .attr("data-testid", `${chartHostElementId}-point`);
        const pointLabel = pointGroup.append("text");

        let currentChartWidth = 0;
        let currentInnerWidth = 0;
        let currentInnerHeight = 0;
        let xScale = null;
        let yScale = null;

        function computeChartWidth() {
          const boundingClientRect = hostElement.getBoundingClientRect();
          return Math.max(420, Math.floor(boundingClientRect.width));
        }

        function layoutChart() {
          currentChartWidth = computeChartWidth();
          svgRoot.attr("viewBox", `0 0 ${currentChartWidth} ${desiredHeight}`);

          frameGroup.attr("transform", `translate(${margins.left},${margins.top})`);

          currentInnerWidth = currentChartWidth - margins.left - margins.right;
          currentInnerHeight = desiredHeight - margins.top - margins.bottom;

          plotClipRect
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", currentInnerWidth)
            .attr("height", currentInnerHeight);

          xScale = d3.scaleLinear()
            .domain([axisDomains.minimum, axisDomains.maximum])
            .range([0, currentInnerWidth]);

          yScale = d3.scaleLinear()
            .domain([axisDomains.minimum, axisDomains.maximum])
            .range([currentInnerHeight, 0]);

          // Background
          backgroundRect
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", currentInnerWidth)
            .attr("height", currentInnerHeight)
            .attr("fill", "white")
            .attr("stroke", "rgba(0,0,0,0.12)");

          // Midlines
          verticalMidline
            .attr("x1", xScale(thresholdMidpoint))
            .attr("x2", xScale(thresholdMidpoint))
            .attr("y1", 0)
            .attr("y2", currentInnerHeight)
            .attr("stroke", "rgba(0,0,0,0.25)")
            .attr("stroke-width", 1);

          horizontalMidline
            .attr("x1", 0)
            .attr("x2", currentInnerWidth)
            .attr("y1", yScale(thresholdMidpoint))
            .attr("y2", yScale(thresholdMidpoint))
            .attr("stroke", "rgba(0,0,0,0.25)")
            .attr("stroke-width", 1);

          // Axes
          xAxisGroup
            .attr("transform", `translate(0,${currentInnerHeight})`)
            .call(d3.axisBottom(xScale).ticks(5));

          yAxisGroup
            .attr("transform", `translate(0,0)`)
            .call(d3.axisLeft(yScale).ticks(5));

          // Axis labels
          xAxisLabel
            .attr("x", currentInnerWidth / 2)
            .attr("y", currentInnerHeight + 40)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .attr("fill", "rgba(0,0,0,0.75)")
            .text(xAxisLabelText);

          yAxisLabel
            .attr("transform", `translate(${-40},${currentInnerHeight / 2}) rotate(-90)`)
            .attr("text-anchor", "middle")
            .attr("font-size", 12)
            .attr("fill", "rgba(0,0,0,0.75)")
            .text(yAxisLabelText);

          // Quadrant labels (light)
          quadrantTextGroup.selectAll("*").remove();

          const quadrantTextStyle = { "font-size": "12px", fill: "rgba(0,0,0,0.55)" };

	          quadrantTextGroup.append("text")
	            .attr("x", xScale(7.5))
	            .attr("y", yScale(7.5))
	            .attr("text-anchor", "middle")
	            .call(applyStyles, quadrantTextStyle)
	            .text("act / commit");

	          quadrantTextGroup.append("text")
	            .attr("x", xScale(2.5))
	            .attr("y", yScale(7.5))
	            .attr("text-anchor", "middle")
	            .call(applyStyles, quadrantTextStyle)
	            .text("slow down");

	          quadrantTextGroup.append("text")
	            .attr("x", xScale(7.5))
	            .attr("y", yScale(2.5))
	            .attr("text-anchor", "middle")
	            .call(applyStyles, quadrantTextStyle)
	            .text("cheap / routine");

	          quadrantTextGroup.append("text")
	            .attr("x", xScale(2.5))
	            .attr("y", yScale(2.5))
	            .attr("text-anchor", "middle")
	            .call(applyStyles, quadrantTextStyle)
	            .text("ignore / tiny test");
	        }

        function updatePointVisuals() {
          const currentPoint = getPointFromState();
          const labelCandidate = (applicationState.problemText || "").trim();
          const scenarioPrefix = applicationState.scenarioModeEnabled ? `${getScenarioLabelText(applicationState.activeScenarioKey)}: ` : "";
          const labelText = labelCandidate.length > 0 ? `${scenarioPrefix}${labelCandidate}` : `${scenarioPrefix}Your decision`;
          const clippedLabelText = labelText.length > 38 ? (labelText.slice(0, 38) + "…") : labelText;

          const pointX = xScale(currentPoint.xValue);
          const pointY = yScale(currentPoint.yValue);

          pointCircle
            .attr("cx", pointX)
            .attr("cy", pointY)
            .attr("r", 7)
            .attr("fill", "#111");

          pointLabel
            .attr("y", pointY - 10)
            .attr("font-size", 12)
            .attr("fill", "rgba(0,0,0,0.75)")
            .attr("pointer-events", "none")
            .text(clippedLabelText);

          // Keep the label within the plot frame to avoid layout jank. Some browsers treat SVG overflow
          // as contributing to intrinsic sizing, which can make the grid column expand while dragging.
          const labelWidth = pointLabel.node()?.getComputedTextLength?.() ?? 0;
          const labelPadding = 10;

          let labelAnchor = "start";
          let labelX = pointX + labelPadding;

          if (labelX + labelWidth > currentInnerWidth) {
            labelAnchor = "end";
            labelX = pointX - labelPadding;
          }

          if (labelAnchor === "end" && labelX - labelWidth < 0) {
            labelAnchor = "start";
            labelX = labelPadding;
          }

          pointLabel
            .attr("x", labelX)
            .attr("text-anchor", labelAnchor);
        }

        const commitPointIntoState = setPointCommitIntoState || setPointPreviewIntoState;

        const preventScrollDuringDrag = (sourceEvent) => {
          if (sourceEvent?.stopPropagation) sourceEvent.stopPropagation();
          if (sourceEvent?.preventDefault) sourceEvent.preventDefault();
        };

        const dragBehavior = d3.drag()
          .container(plotGroup.node())
          .on("start", (event) => {
            // Per d3-drag docs, use the underlying source event to control default browser actions.
            // This prevents scroll/pan gestures from competing with the drag.
            if (event?.sourceEvent?.stopPropagation) event.sourceEvent.stopPropagation();
            preventScrollDuringDrag(event?.sourceEvent);

            // Per d3-drag docs: disable native drag+selection during an active mouse gesture.
            // This helps prevent the browser from scrolling the page or selecting text while dragging.
            if (d3.dragDisable) d3.dragDisable(window);

            // Some browsers/trackpads can still emit wheel/touchmove gestures while the pointer is down.
            // Block those during an active drag so the page cannot scroll.
            window.addEventListener("wheel", preventScrollDuringDrag, { passive: false });
            window.addEventListener("touchmove", preventScrollDuringDrag, { passive: false });
          })
          .on("drag", (event) => {
            preventScrollDuringDrag(event?.sourceEvent);

            // d3-drag already computes event.x/event.y relative to the drag container (plotGroup).
            // Use those values directly to avoid coordinate drift.
            const draggedX = clampToDomain(xScale.invert(event.x));
            const draggedY = clampToDomain(yScale.invert(event.y));
            // During drag, update only the SVG visuals. Do not synchronize the full page; it can
            // trigger reflow and layout changes elsewhere while dragging.
            setPointPreviewIntoState({ xValue: draggedX, yValue: draggedY });
            updatePointVisuals();
          })
          .on("end", (event) => {
            window.removeEventListener("wheel", preventScrollDuringDrag, { passive: false });
            window.removeEventListener("touchmove", preventScrollDuringDrag, { passive: false });
            if (d3.dragEnable) d3.dragEnable(window, true);

            const draggedX = clampToDomain(xScale.invert(event.x));
            const draggedY = clampToDomain(yScale.invert(event.y));
            commitPointIntoState({ xValue: draggedX, yValue: draggedY });
          });

        pointGroup.call(dragBehavior);

        const resizeObserver = new ResizeObserver(() => {
          layoutChart();
          updatePointVisuals();
        });
        resizeObserver.observe(hostElement);

        layoutChart();
        updatePointVisuals();

        return {
          update: updatePointVisuals
        };
      }

      const accuracyStakesChart = create2DChart(
        "accuracyStakesChart",
        "Confidence in being right →",
        "Consequence if wrong →",
        () => ({ xValue: getScoreValue("accuracyConfidence"), yValue: getScoreValue("stakesImpact") }),
        ({ xValue, yValue }) => Object.assign(getActiveScenarioScores(), { accuracyConfidence: xValue, stakesImpact: yValue }),
        ({ xValue, yValue }) => setActiveScenarioScores({ accuracyConfidence: xValue, stakesImpact: yValue })
      );

      const expectedValueUncertaintyChart = create2DChart(
        "expectedValueUncertaintyChart",
        "Expected Value →",
        "Outcome uncertainty →",
        () => ({ xValue: getScoreValue("expectedValue"), yValue: getScoreValue("uncertainty") }),
        ({ xValue, yValue }) => Object.assign(getActiveScenarioScores(), { expectedValue: xValue, uncertainty: yValue }),
        ({ xValue, yValue }) => setActiveScenarioScores({ expectedValue: xValue, uncertainty: yValue })
      );

      // ---------- 3D Chart (Three.js) ----------
      function create3DChart(threeHostElementId) {
        const hostElement = document.getElementById(threeHostElementId);

        const noopChart = { setPointPosition: () => {} };

        if (!hostElement) {
          return noopChart;
        }

        function renderFallback(message) {
          hostElement.innerHTML = "";
          const fallbackElement = document.createElement("div");
          fallbackElement.className = "three-fallback";
          fallbackElement.textContent = message;
          hostElement.appendChild(fallbackElement);
        }

        try {
          const scene = new THREE.Scene();
          scene.background = new THREE.Color(0xffffff);

          const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000);
          camera.position.set(14, 12, 14);

          const renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setPixelRatio(window.devicePixelRatio || 1);
          hostElement.appendChild(renderer.domElement);

          const orbitControls = new OrbitControls(camera, renderer.domElement);
          orbitControls.enableDamping = true;
          orbitControls.dampingFactor = 0.08;
          orbitControls.target.set(5, 5, 5);

        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        scene.add(ambientLight);

	        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.55);
	        directionalLight.position.set(10, 18, 12);
	        scene.add(directionalLight);

	        const cubeSize = 10;

	        const warmDecisionColor = new THREE.Color(0xf04b3a);
	        const coolDecisionColor = new THREE.Color(0x23d76b);

	        function computeFavorabilityScore(expectedValueValue, uncertaintyValue, reversibilityValue) {
	          return THREE.MathUtils.clamp(
	            (
	              (expectedValueValue / cubeSize) +
	              (1 - (uncertaintyValue / cubeSize)) +
	              (reversibilityValue / cubeSize)
	            ) / 3,
	            0,
	            1
	          );
	        }

	        function createDecisionFieldOverlay() {
	          const overlayGroup = new THREE.Group();
	          const sliceGeometry = new THREE.PlaneGeometry(cubeSize, cubeSize);
	          const sliceCountPerAxis = 18;
	          const sharedSliceMaterial = new THREE.ShaderMaterial({
	            transparent: true,
	            depthWrite: false,
	            side: THREE.DoubleSide,
	            uniforms: {
	              cubeSize: { value: cubeSize },
	              warmColor: { value: warmDecisionColor.clone() },
	              coolColor: { value: coolDecisionColor.clone() },
	              baseOpacity: { value: 0.072 }
	            },
	            vertexShader: `
	              varying vec3 vVolumePosition;
	              uniform float cubeSize;
	
	              void main() {
	                vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
	                vVolumePosition = clamp(worldPosition / cubeSize, 0.0, 1.0);
	                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
	              }
	            `,
	            fragmentShader: `
	              varying vec3 vVolumePosition;
	              uniform vec3 warmColor;
	              uniform vec3 coolColor;
	              uniform float baseOpacity;
	
	              float softNoise(vec3 positionVector) {
	                float value = 0.0;
	                value += sin(dot(positionVector, vec3(2.9, 5.1, 4.2)));
	                value += 0.5 * sin(dot(positionVector, vec3(7.0, 3.7, 6.6)));
	                value += 0.25 * sin(dot(positionVector, vec3(11.2, 8.6, 9.1)));
	                return value / 1.75;
	              }
	
	              void main() {
	                float favorabilityScore =
	                  (vVolumePosition.x + (1.0 - vVolumePosition.y) + vVolumePosition.z) / 3.0;
	                float noiseValue = softNoise(vVolumePosition * 6.28318530718);
		                float coloredScore = clamp(favorabilityScore + noiseValue * 0.17, 0.0, 1.0);
	                vec3 mixedColor = mix(warmColor, coolColor, coloredScore);
	
	                float centerDistance = length(vVolumePosition - vec3(0.5));
	                float centerWeight = 1.0 - smoothstep(0.68, 0.96, centerDistance);
		                float alphaValue = baseOpacity * (0.52 + 0.48 * centerWeight);
	
	                gl_FragColor = vec4(mixedColor, alphaValue);
	              }
	            `
	          });

	          function addGradientSlicesForAxis(axisKey) {
	            for (let sliceIndex = 0; sliceIndex < sliceCountPerAxis; sliceIndex += 1) {
	              const axisValue = ((sliceIndex + 0.5) / sliceCountPerAxis) * cubeSize;
	              const sliceMesh = new THREE.Mesh(sliceGeometry, sharedSliceMaterial);
	              sliceMesh.position.set(cubeSize * 0.5, cubeSize * 0.5, cubeSize * 0.5);

	              if (axisKey === "x") {
	                sliceMesh.rotation.y = Math.PI / 2;
	                sliceMesh.position.x = axisValue;
	              } else if (axisKey === "y") {
	                sliceMesh.rotation.x = Math.PI / 2;
	                sliceMesh.position.y = axisValue;
	              } else {
	                sliceMesh.position.z = axisValue;
	              }

	              overlayGroup.add(sliceMesh);
	            }
	          }

	          addGradientSlicesForAxis("x");
	          addGradientSlicesForAxis("y");
	          addGradientSlicesForAxis("z");

	          const cloudParticleCount = 1400;
	          const particleGeometry = new THREE.BufferGeometry();
	          const particlePositions = new Float32Array(cloudParticleCount * 3);
	          const particleColors = new Float32Array(cloudParticleCount * 3);
	          const positiveBlobCenter = new THREE.Vector3(8.0, 2.2, 8.1);
	          const negativeBlobCenter = new THREE.Vector3(2.2, 7.6, 2.3);
	          const temporaryParticleVector = new THREE.Vector3();

	          for (let particleIndex = 0; particleIndex < cloudParticleCount; particleIndex += 1) {
	            const xValue = Math.random() * cubeSize;
	            const yValue = Math.random() * cubeSize;
	            const zValue = Math.random() * cubeSize;
	            temporaryParticleVector.set(xValue, yValue, zValue);
	            const positiveDistance = temporaryParticleVector.distanceTo(positiveBlobCenter);
	            const negativeDistance = temporaryParticleVector.distanceTo(negativeBlobCenter);
	            const localShift =
	              0.24 * Math.exp(-(positiveDistance * positiveDistance) / 9) -
	              0.22 * Math.exp(-(negativeDistance * negativeDistance) / 9);
	            const favorabilityScore = computeFavorabilityScore(xValue, yValue, zValue);
	            const colorMixScore = THREE.MathUtils.clamp(favorabilityScore + localShift, 0, 1);
	            const particleColor = warmDecisionColor.clone().lerp(coolDecisionColor, colorMixScore);

	            particlePositions[particleIndex * 3 + 0] = xValue;
	            particlePositions[particleIndex * 3 + 1] = yValue;
	            particlePositions[particleIndex * 3 + 2] = zValue;
	            particleColors[particleIndex * 3 + 0] = particleColor.r;
	            particleColors[particleIndex * 3 + 1] = particleColor.g;
	            particleColors[particleIndex * 3 + 2] = particleColor.b;
	          }

	          particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
	          particleGeometry.setAttribute("color", new THREE.BufferAttribute(particleColors, 3));

	          const particleMaterial = new THREE.PointsMaterial({
	            size: 0.15,
	            vertexColors: true,
	            transparent: true,
	            opacity: 0.18,
	            depthWrite: false,
	            sizeAttenuation: true,
	            blending: THREE.NormalBlending
	          });

	          const particleCloud = new THREE.Points(particleGeometry, particleMaterial);
	          overlayGroup.add(particleCloud);

	          return overlayGroup;
	        }

	        const decisionFieldOverlay = createDecisionFieldOverlay();
	        scene.add(decisionFieldOverlay);

	        function createCubeBoundsLineSegments() {
	          const geometry = new THREE.BufferGeometry();
	          const vertices = new Float32Array([
            // bottom square
            0, 0, 0,   cubeSize, 0, 0,
            cubeSize, 0, 0,   cubeSize, 0, cubeSize,
            cubeSize, 0, cubeSize,   0, 0, cubeSize,
            0, 0, cubeSize,   0, 0, 0,

            // top square
            0, cubeSize, 0,   cubeSize, cubeSize, 0,
            cubeSize, cubeSize, 0,   cubeSize, cubeSize, cubeSize,
            cubeSize, cubeSize, cubeSize,   0, cubeSize, cubeSize,
            0, cubeSize, cubeSize,   0, cubeSize, 0,

            // vertical edges
            0, 0, 0,   0, cubeSize, 0,
            cubeSize, 0, 0,   cubeSize, cubeSize, 0,
            cubeSize, 0, cubeSize,   cubeSize, cubeSize, cubeSize,
            0, 0, cubeSize,   0, cubeSize, cubeSize
          ]);
          geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
          const material = new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.25 });
          return new THREE.LineSegments(geometry, material);
        }

        const cubeBounds = createCubeBoundsLineSegments();
        scene.add(cubeBounds);

        function createAxisArrow(axisDirectionVector, axisColorValue) {
          const arrowOrigin = new THREE.Vector3(0, 0, 0);
          const axisArrow = new THREE.ArrowHelper(
            axisDirectionVector.clone().normalize(),
            arrowOrigin,
            cubeSize,
            axisColorValue,
            0.4,
            0.2
          );
          axisArrow.cone.material.transparent = true;
          axisArrow.cone.material.opacity = 0.6;
          axisArrow.line.material.transparent = true;
          axisArrow.line.material.opacity = 0.6;
          return axisArrow;
        }

	        function createAxisLabelSprite(labelText) {
          const labelCanvas = document.createElement("canvas");
          const labelContext = labelCanvas.getContext("2d");
          const fontSizePx = 56;
          const horizontalPaddingPx = 18;
          const verticalPaddingPx = 12;

          if (!labelContext) {
            return null;
          }

          labelContext.font = `700 ${fontSizePx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
          const measuredTextWidth = Math.ceil(labelContext.measureText(labelText).width);
          labelCanvas.width = measuredTextWidth + horizontalPaddingPx * 2;
          labelCanvas.height = fontSizePx + verticalPaddingPx * 2;

          // Reset drawing settings after changing canvas dimensions.
          labelContext.font = `700 ${fontSizePx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
          labelContext.textBaseline = "middle";
          labelContext.textAlign = "left";

          labelContext.fillStyle = "rgba(255,255,255,0.92)";
          labelContext.fillRect(0, 0, labelCanvas.width, labelCanvas.height);

          labelContext.strokeStyle = "rgba(0,0,0,0.16)";
          labelContext.lineWidth = 2;
          labelContext.strokeRect(1, 1, labelCanvas.width - 2, labelCanvas.height - 2);

          labelContext.fillStyle = "rgba(0,0,0,0.88)";
          labelContext.fillText(labelText, horizontalPaddingPx, labelCanvas.height / 2 + 1);

          const labelTexture = new THREE.CanvasTexture(labelCanvas);
          labelTexture.minFilter = THREE.LinearFilter;
          labelTexture.magFilter = THREE.LinearFilter;
          labelTexture.generateMipmaps = false;

          const labelMaterial = new THREE.SpriteMaterial({
            map: labelTexture,
            transparent: true,
            depthTest: false
          });

          const labelSprite = new THREE.Sprite(labelMaterial);
          const spriteHeight = 0.95;
          const spriteWidth = (labelCanvas.width / labelCanvas.height) * spriteHeight;
          labelSprite.scale.set(spriteWidth, spriteHeight, 1);

	          return labelSprite;
	        }

	        function createAxisTickValueSprite(labelText) {
	          const tickCanvas = document.createElement("canvas");
	          const tickContext = tickCanvas.getContext("2d");
	          const fontSizePx = 38;
	          const horizontalPaddingPx = 10;
	          const verticalPaddingPx = 6;

	          if (!tickContext) {
	            return null;
	          }

	          tickContext.font = `700 ${fontSizePx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
	          const measuredTextWidth = Math.ceil(tickContext.measureText(labelText).width);
	          tickCanvas.width = measuredTextWidth + horizontalPaddingPx * 2;
	          tickCanvas.height = fontSizePx + verticalPaddingPx * 2;

	          tickContext.font = `700 ${fontSizePx}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
	          tickContext.textBaseline = "middle";
	          tickContext.textAlign = "left";
	          tickContext.fillStyle = "rgba(255,255,255,0.78)";
	          tickContext.fillRect(0, 0, tickCanvas.width, tickCanvas.height);
	          tickContext.fillStyle = "rgba(0,0,0,0.82)";
	          tickContext.fillText(labelText, horizontalPaddingPx, tickCanvas.height / 2 + 1);

	          const tickTexture = new THREE.CanvasTexture(tickCanvas);
	          tickTexture.minFilter = THREE.LinearFilter;
	          tickTexture.magFilter = THREE.LinearFilter;
	          tickTexture.generateMipmaps = false;

	          const tickMaterial = new THREE.SpriteMaterial({
	            map: tickTexture,
	            transparent: true,
	            depthTest: false,
	            depthWrite: false
	          });

	          const tickSprite = new THREE.Sprite(tickMaterial);
	          const spriteHeight = 0.42;
	          const spriteWidth = (tickCanvas.width / tickCanvas.height) * spriteHeight;
	          tickSprite.scale.set(spriteWidth, spriteHeight, 1);

	          return tickSprite;
	        }

	        function createAxisTickGroup(axisKey) {
	          const tickGroup = new THREE.Group();
	          const tickValues = [0, 2, 4, 6, 8, 10];
	          const tickLength = 0.22;
	          const tickLabelOffset = 0.36;
	          const tickMaterial = new THREE.LineBasicMaterial({
	            color: 0x111111,
	            transparent: true,
	            opacity: 0.42
	          });

	          for (const tickValue of tickValues) {
	            let tickStart;
	            let tickEnd;
	            let tickLabelPosition;

	            if (axisKey === "x") {
	              tickStart = new THREE.Vector3(tickValue, 0, 0);
	              tickEnd = new THREE.Vector3(tickValue, tickLength, 0);
	              tickLabelPosition = new THREE.Vector3(tickValue, -tickLabelOffset, 0);
	            } else if (axisKey === "y") {
	              tickStart = new THREE.Vector3(0, tickValue, 0);
	              tickEnd = new THREE.Vector3(0, tickValue, tickLength);
	              tickLabelPosition = new THREE.Vector3(-tickLabelOffset, tickValue, 0);
	            } else {
	              tickStart = new THREE.Vector3(0, 0, tickValue);
	              tickEnd = new THREE.Vector3(tickLength, 0, tickValue);
	              tickLabelPosition = new THREE.Vector3(0, -tickLabelOffset, tickValue);
	            }

	            const tickGeometry = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd]);
	            const tickLine = new THREE.LineSegments(tickGeometry, tickMaterial);
	            tickGroup.add(tickLine);

	            const tickLabel = createAxisTickValueSprite(String(tickValue));
	            if (tickLabel) {
	              tickLabel.position.copy(tickLabelPosition);
	              tickGroup.add(tickLabel);
	            }
	          }

	          return tickGroup;
	        }

	        const expectedValueAxisArrow = createAxisArrow(new THREE.Vector3(1, 0, 0), 0x111111);
	        const uncertaintyAxisArrow = createAxisArrow(new THREE.Vector3(0, 1, 0), 0x111111);
	        const reversibilityAxisArrow = createAxisArrow(new THREE.Vector3(0, 0, 1), 0x111111);

	        scene.add(expectedValueAxisArrow);
	        scene.add(uncertaintyAxisArrow);
	        scene.add(reversibilityAxisArrow);
	        scene.add(createAxisTickGroup("x"));
	        scene.add(createAxisTickGroup("y"));
	        scene.add(createAxisTickGroup("z"));

        const expectedValueAxisLabel = createAxisLabelSprite("X: Expected Value");
        const uncertaintyAxisLabel = createAxisLabelSprite("Y: Outcome uncertainty");
        const reversibilityAxisLabel = createAxisLabelSprite("Z: Reversibility");

        if (expectedValueAxisLabel) {
          expectedValueAxisLabel.position.set(cubeSize + 1.1, 0.45, 0);
          scene.add(expectedValueAxisLabel);
        }

        if (uncertaintyAxisLabel) {
          uncertaintyAxisLabel.position.set(0, cubeSize + 1.1, 0.45);
          scene.add(uncertaintyAxisLabel);
        }

        if (reversibilityAxisLabel) {
          reversibilityAxisLabel.position.set(0.45, 0, cubeSize + 1.1);
          scene.add(reversibilityAxisLabel);
        }

	        // Point
	        const pointGeometry = new THREE.SphereGeometry(0.22, 28, 20);
	        const pointMaterial = new THREE.MeshStandardMaterial({ color: 0x111111 });
	        const pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
	        pointMesh.renderOrder = 10;
	        scene.add(pointMesh);

	        function createProjectionMarker(markerColorValue) {
	          const markerGeometry = new THREE.SphereGeometry(0.11, 18, 12);
	          const markerMaterial = new THREE.MeshStandardMaterial({
	            color: markerColorValue,
	            transparent: true,
	            opacity: 0.82,
	            roughness: 0.42,
	            metalness: 0.08
	          });
	          const markerMesh = new THREE.Mesh(markerGeometry, markerMaterial);
	          markerMesh.renderOrder = 9;
	          scene.add(markerMesh);
	          return markerMesh;
	        }

	        function createProjectionLine(lineColorValue) {
	          const lineMaterial = new THREE.LineBasicMaterial({
	            color: lineColorValue,
	            transparent: true,
	            opacity: 0.32
	          });
	          const lineGeometry = new THREE.BufferGeometry();
	          lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
	          const lineMesh = new THREE.Line(lineGeometry, lineMaterial);
	          scene.add(lineMesh);
	          return lineMesh;
	        }

	        function setLineEndpoints(lineMesh, startX, startY, startZ, endX, endY, endZ) {
	          const lineArray = lineMesh.geometry.attributes.position.array;
	          lineArray[0] = startX;
	          lineArray[1] = startY;
	          lineArray[2] = startZ;
	          lineArray[3] = endX;
	          lineArray[4] = endY;
	          lineArray[5] = endZ;
	          lineMesh.geometry.attributes.position.needsUpdate = true;
	        }

	        // Orthogonal projections: XY (z=0), XZ (y=0), YZ (x=0)
	        const projectionMarkerXY = createProjectionMarker(0xdd4f3b);
	        const projectionMarkerXZ = createProjectionMarker(0x2b8cff);
	        const projectionMarkerYZ = createProjectionMarker(0xf0b43f);
	        const projectionLineXY = createProjectionLine(0xdd4f3b);
	        const projectionLineXZ = createProjectionLine(0x2b8cff);
	        const projectionLineYZ = createProjectionLine(0xf0b43f);

	        function setPointPosition(expectedValueValue, uncertaintyValue, reversibilityValue) {
	          const expectedValueClamped = clampToDomain(expectedValueValue);
	          const uncertaintyClamped = clampToDomain(uncertaintyValue);
	          const reversibilityClamped = clampToDomain(reversibilityValue);

	          pointMesh.position.set(expectedValueClamped, uncertaintyClamped, reversibilityClamped);

	          projectionMarkerXY.position.set(expectedValueClamped, uncertaintyClamped, 0);
	          projectionMarkerXZ.position.set(expectedValueClamped, 0, reversibilityClamped);
	          projectionMarkerYZ.position.set(0, uncertaintyClamped, reversibilityClamped);

	          setLineEndpoints(
	            projectionLineXY,
	            expectedValueClamped,
	            uncertaintyClamped,
	            reversibilityClamped,
	            expectedValueClamped,
	            uncertaintyClamped,
	            0
	          );
	          setLineEndpoints(
	            projectionLineXZ,
	            expectedValueClamped,
	            uncertaintyClamped,
	            reversibilityClamped,
	            expectedValueClamped,
	            0,
	            reversibilityClamped
	          );
	          setLineEndpoints(
	            projectionLineYZ,
	            expectedValueClamped,
	            uncertaintyClamped,
	            reversibilityClamped,
	            0,
	            uncertaintyClamped,
	            reversibilityClamped
	          );
	        }

        function resizeRendererToHost() {
          const hostRect = hostElement.getBoundingClientRect();
          const hostWidth = Math.max(420, Math.floor(hostRect.width));
          const hostHeight = Math.max(420, Math.floor(hostRect.height));
          renderer.setSize(hostWidth, hostHeight, false);
          camera.aspect = hostWidth / hostHeight;
          camera.updateProjectionMatrix();
        }

        const resizeObserver = new ResizeObserver(() => resizeRendererToHost());
        resizeObserver.observe(hostElement);
        resizeRendererToHost();

        function animateFrame() {
          orbitControls.update();
          renderer.render(scene, camera);
          requestAnimationFrame(animateFrame);
        }
        animateFrame();

        return { setPointPosition };
        } catch (error) {
          console.error(error);
          renderFallback("3D view unavailable (WebGL context could not be created).");
          return noopChart;
        }
      }

      const threeDimensionChart = create3DChart("threeDimensionHost");

      // ---------- Step 4: Policy logic ----------
      function buildQuadrantLabel(horizontalLabelLow, horizontalLabelHigh, verticalLabelLow, verticalLabelHigh, horizontalValue, verticalValue) {
        const horizontalLabel = isHigh(horizontalValue) ? horizontalLabelHigh : horizontalLabelLow;
        const verticalLabel = isHigh(verticalValue) ? verticalLabelHigh : verticalLabelLow;
        return `${horizontalLabel} · ${verticalLabel}`;
      }

      function policyForAccuracyStakes(accuracyConfidence, stakesImpact) {
        if (areAllNeutralValues([accuracyConfidence, stakesImpact])) {
          return {
            titleText: "Hold (insufficient signal)",
            bulletItems: [
              "Inputs are still at the neutral 50/50 baseline.",
              "Collect one concrete data point before committing.",
              "If no fast signal is available, do nothing for now."
            ]
          };
        }

        const confidenceHigh = isHigh(accuracyConfidence);
        const stakesHigh = isHigh(stakesImpact);

        if (stakesHigh && confidenceHigh) {
          return {
            titleText: "Commit (execute)",
            bulletItems: [
              "Decide once, then focus on execution details (timeline, owners, risks).",
              "Add one concrete safeguard for the main failure mode.",
              "Stop gathering info unless new evidence appears."
            ]
          };
        }

        if (stakesHigh && !confidenceHigh) {
          return {
            titleText: "Don’t commit yet (reduce uncertainty)",
            bulletItems: [
              "Identify the single fact that would flip you to “confident.”",
              "Run the fastest check that targets that fact (test, call, measurement).",
              "If you must act now, choose a reversible version of the decision."
            ]
          };
        }

        if (!stakesHigh && confidenceHigh) {
          return {
            titleText: "Do it cheaply (avoid overthinking)",
            bulletItems: [
              "Act with minimal process; don’t invest in perfect certainty.",
              "Cap time/effort upfront (e.g., 30 minutes, 1 day, $X).",
              "If it fails, move on without regret."
            ]
          };
        }

        return {
            titleText: "Ignore or run a tiny experiment",
            bulletItems: [
              "If you’re curious, do a small probe with a hard cap.",
              "Otherwise, drop it and move to higher-leverage decisions.",
              "Don’t let low-consequence uncertainty consume attention."
            ]
          };
      }

      function policyForExpectedValueUncertainty(expectedValue, uncertainty) {
        if (areAllNeutralValues([expectedValue, uncertainty])) {
          return {
            titleText: "Hold (no clear edge)",
            bulletItems: [
              "Both axes are still at the neutral 50/50 baseline.",
              "Run one cheap probe to estimate upside or uncertainty.",
              "Until then, avoid committing meaningful resources."
            ]
          };
        }

        const expectedValueHigh = isHigh(expectedValue);
        const uncertaintyHigh = isHigh(uncertainty);

        if (expectedValueHigh && !uncertaintyHigh) {
          return {
            titleText: "Core bet (scale up)",
            bulletItems: [
              "Commit real resources; treat this as a mainline path.",
              "Track one key metric to validate you’re getting the value.",
              "Remove distractions; focus on throughput."
            ]
          };
        }

        if (expectedValueHigh && uncertaintyHigh) {
          return {
            titleText: "Option (small bet to learn fast)",
            bulletItems: [
              "Define a cheap experiment that can kill or validate the idea.",
              "Keep bet size small until uncertainty drops.",
              "Timebox the probe; decide based on the outcome."
            ]
          };
        }

        if (!expectedValueHigh && !uncertaintyHigh) {
          return {
            titleText: "Reject",
            bulletItems: [
              "Don’t spend more time; it’s not worth it.",
              "If you’re forced to do it, minimize cost and duration.",
              "Redirect effort to higher-EV choices."
            ]
          };
        }

        return {
          titleText: "Mostly noise (only touch if learning is cheap)",
          bulletItems: [
            "If there’s a very cheap test that could reveal hidden EV, run it.",
            "Otherwise, ignore: low EV with big error bars rarely pays off.",
            "Don’t confuse uncertainty with opportunity."
          ]
        };
      }

      function policyForThreeDimension(expectedValue, uncertainty, reversibility) {
        if (areAllNeutralValues([expectedValue, uncertainty, reversibility])) {
          return {
            titleText: "Hold (neutral priors)",
            subtitleText: "Suggested intensity: 0%",
            bulletItems: [
              "All three dimensions are at the neutral 50/50 baseline.",
              "Do not take a one-way-door action without stronger evidence.",
              "Gather disconfirming evidence, then rescore."
            ]
          };
        }

        const expectedValueHigh = isHigh(expectedValue);
        const uncertaintyHigh = isHigh(uncertainty);
        const reversibilityHigh = reversibility >= 6;

        const suggestedIntensityRaw = (expectedValue / 10) * (1 - (uncertainty / 10)) * (reversibility / 10);
        const suggestedIntensityPercent = Math.round(clampToDomain(suggestedIntensityRaw * 10) * 10); // 0..100

        if (!expectedValueHigh) {
          return {
            titleText: "Reject (EV too low)",
            subtitleText: `Suggested intensity: ${suggestedIntensityPercent}%`,
            bulletItems: [
              "Don’t commit further resources.",
              "Only proceed if you can transform it into a cheap learning option.",
              "Move on."
            ]
          };
        }

        if (reversibilityHigh && uncertaintyHigh) {
          return {
            titleText: "Run an experiment (reversible + uncertain)",
            subtitleText: `Suggested intensity: ${suggestedIntensityPercent}%`,
            bulletItems: [
              "Make it a two-week probe or a minimal pilot.",
              "Predefine a pass/fail threshold.",
              "Increase commitment only after uncertainty drops."
            ]
          };
        }

        if (reversibilityHigh && !uncertaintyHigh) {
          return {
            titleText: "Commit (reversible enough)",
            subtitleText: `Suggested intensity: ${suggestedIntensityPercent}%`,
            bulletItems: [
              "Commit resources and set checkpoints.",
              "If reality disagrees, adjust quickly (you can unwind).",
              "Focus on execution."
            ]
          };
        }

        if (!reversibilityHigh && uncertaintyHigh) {
          return {
            titleText: "Do not take an irreversible bet while uncertain",
            subtitleText: `Suggested intensity: ${suggestedIntensityPercent}%`,
            bulletItems: [
              "Find a reversible path: pilot, staged rollout, contract with exit clause.",
              "Gather the missing evidence first.",
              "Only commit after uncertainty drops materially."
            ]
          };
        }

        return {
          titleText: "Commit with safeguards (one-way door)",
          subtitleText: `Suggested intensity: ${suggestedIntensityPercent}%`,
          bulletItems: [
            "Do a pre-mortem: list top 3 failure modes and add mitigations.",
            "Add a safety margin (time, money, redundancy).",
            "Decide once, then execute without churn."
          ]
        };
      }

      // ---------- Emphasis + Hints ----------
      const accuracyStakesArea = document.getElementById("accuracyStakesArea");
      const expectedValueUncertaintyArea = document.getElementById("expectedValueUncertaintyArea");
      const twoDimensionSection = document.getElementById("twoDimensionSection");
      const threeDimensionSection = document.getElementById("threeDimensionSection");
      const threeDimensionHost = document.getElementById("threeDimensionHost");

      const accuracyStakesHint = document.getElementById("accuracyStakesHint");
      const expectedValueUncertaintyHint = document.getElementById("expectedValueUncertaintyHint");
      const threeDimensionHint = document.getElementById("threeDimensionHint");

      function updatePathVisibility() {
        const isTruthCase = applicationState.caseType === CASE_TYPES.truth_stakes;
        const isBetSizingCase = applicationState.caseType === CASE_TYPES.bet_sizing;
        const isOneWayDoorCase = applicationState.caseType === CASE_TYPES.one_way_door;

        const shouldShow2D = isTruthCase || isBetSizingCase;
        const shouldShow3D = isOneWayDoorCase;

        twoDimensionSection.hidden = !shouldShow2D;
        threeDimensionSection.hidden = !shouldShow3D;
        accuracyStakesArea.hidden = !isTruthCase;
        expectedValueUncertaintyArea.hidden = !isBetSizingCase;
      }

      function updateEmphasis() {
        accuracyStakesArea.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.truth_stakes);
        expectedValueUncertaintyArea.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.bet_sizing);
        threeDimensionHost.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.one_way_door);

        let hintTextForAccuracyStakes = "This view is hidden unless you choose the confidence/consequence path.";
        let hintTextForExpectedValueUncertainty = "This view is hidden unless you choose the EV sizing path.";
        let hintTextForThreeDimension = "This view is hidden unless you choose the one-way-door path.";

        if (applicationState.caseType === CASE_TYPES.truth_stakes) {
          hintTextForAccuracyStakes = "Primary for your path: place the dot by confidence (x) and consequence-if-wrong (y).";
        } else if (applicationState.caseType === CASE_TYPES.bet_sizing) {
          hintTextForExpectedValueUncertainty = "Primary for your path: this should directly tell you core bet vs option vs reject.";
        } else if (applicationState.caseType === CASE_TYPES.one_way_door) {
          hintTextForThreeDimension = "Primary for your path: if reversibility is low, the proof bar must be higher.";
        }

        accuracyStakesHint.textContent = hintTextForAccuracyStakes;
        expectedValueUncertaintyHint.textContent = hintTextForExpectedValueUncertainty;
        threeDimensionHint.textContent = hintTextForThreeDimension;
      }

      // ---------- Recommendations rendering ----------
      const recommendationGrid = document.getElementById("recommendationGrid");
      const accuracyStakesRecommendationCard = document.getElementById("accuracyStakesRecommendationCard");
      const expectedValueUncertaintyRecommendationCard = document.getElementById("expectedValueUncertaintyRecommendationCard");
      const threeDimensionRecommendationCard = document.getElementById("threeDimensionRecommendationCard");
      const recommendationWhySection = document.getElementById("recommendationWhySection");
      const recommendationWhySubtitle = document.getElementById("recommendationWhySubtitle");
      const recommendationWhyList = document.getElementById("recommendationWhyList");
      const scenarioComparisonSection = document.getElementById("scenarioComparisonSection");
      const scenarioComparisonGrid = document.getElementById("scenarioComparisonGrid");

      const accuracyStakesQuadrantLabel = document.getElementById("accuracyStakesQuadrantLabel");
      const expectedValueUncertaintyQuadrantLabel = document.getElementById("expectedValueUncertaintyQuadrantLabel");
      const threeDimensionQuadrantLabel = document.getElementById("threeDimensionQuadrantLabel");

      const accuracyStakesPolicyTitle = document.getElementById("accuracyStakesPolicyTitle");
      const expectedValueUncertaintyPolicyTitle = document.getElementById("expectedValueUncertaintyPolicyTitle");
      const threeDimensionPolicyTitle = document.getElementById("threeDimensionPolicyTitle");

      const accuracyStakesPolicyList = document.getElementById("accuracyStakesPolicyList");
      const expectedValueUncertaintyPolicyList = document.getElementById("expectedValueUncertaintyPolicyList");
      const threeDimensionPolicyList = document.getElementById("threeDimensionPolicyList");

      function renderBulletList(targetListElement, bulletItems) {
        targetListElement.innerHTML = "";
        for (const bulletItem of bulletItems) {
          const listItem = document.createElement("li");
          listItem.textContent = bulletItem;
          targetListElement.appendChild(listItem);
        }
      }

      function formatScoreLabel(candidateValue) {
        return roundToSingleDecimal(candidateValue).toFixed(1);
      }

      function getCaseLabelText(caseType) {
        if (caseType === CASE_TYPES.truth_stakes) return "Confidence × Consequence";
        if (caseType === CASE_TYPES.bet_sizing) return "Expected Value × Outcome uncertainty";
        if (caseType === CASE_TYPES.one_way_door) return "EV × Outcome uncertainty × Reversibility";
        return "Decision";
      }

      function getSnapshotForScenario(scenarioKey) {
        const scenarioScores = getScenarioScores(scenarioKey);
        const accuracyStakesQuadrant = buildQuadrantLabel(
          "Low confidence", "High confidence",
          "Low downside if wrong", "High downside if wrong",
          scenarioScores.accuracyConfidence,
          scenarioScores.stakesImpact
        );

        const expectedValueUncertaintyQuadrant = buildQuadrantLabel(
          "Low EV", "High EV",
          "Low outcome uncertainty", "High outcome uncertainty",
          scenarioScores.expectedValue,
          scenarioScores.uncertainty
        );

        const reversibilityDescriptor = scenarioScores.reversibility >= 6 ? "Two-way door (reversible)" : "One-way door (hard to undo)";
        const threeDimensionQuadrant = `${expectedValueUncertaintyQuadrant} · ${reversibilityDescriptor}`;

        const accuracyPolicy = policyForAccuracyStakes(scenarioScores.accuracyConfidence, scenarioScores.stakesImpact);
        const expectedValuePolicy = policyForExpectedValueUncertainty(scenarioScores.expectedValue, scenarioScores.uncertainty);
        const threeDimensionPolicy = policyForThreeDimension(scenarioScores.expectedValue, scenarioScores.uncertainty, scenarioScores.reversibility);

        return {
          scenarioScores,
          accuracyStakesQuadrant,
          expectedValueUncertaintyQuadrant,
          threeDimensionQuadrant,
          accuracyPolicy,
          expectedValuePolicy,
          threeDimensionPolicy
        };
      }

      function getPolicyForCase(snapshot, caseType) {
        if (caseType === CASE_TYPES.truth_stakes) return snapshot.accuracyPolicy;
        if (caseType === CASE_TYPES.bet_sizing) return snapshot.expectedValuePolicy;
        if (caseType === CASE_TYPES.one_way_door) return snapshot.threeDimensionPolicy;
        return { titleText: "Choose a path first", bulletItems: [] };
      }

      function getScoreSummaryForCase(scenarioScores, caseType) {
        if (caseType === CASE_TYPES.truth_stakes) {
          return `Confidence ${formatScoreLabel(scenarioScores.accuracyConfidence)} · Consequence ${formatScoreLabel(scenarioScores.stakesImpact)}`;
        }
        if (caseType === CASE_TYPES.bet_sizing) {
          return `EV ${formatScoreLabel(scenarioScores.expectedValue)} · Uncertainty ${formatScoreLabel(scenarioScores.uncertainty)}`;
        }
        if (caseType === CASE_TYPES.one_way_door) {
          return `EV ${formatScoreLabel(scenarioScores.expectedValue)} · Uncertainty ${formatScoreLabel(scenarioScores.uncertainty)} · Reversibility ${formatScoreLabel(scenarioScores.reversibility)}`;
        }
        return "No active scoring path";
      }

      function getWhyLinesForCase(scenarioScores, caseType) {
        if (caseType === CASE_TYPES.truth_stakes) {
          const confidenceHigh = isHigh(scenarioScores.accuracyConfidence);
          const stakesHigh = isHigh(scenarioScores.stakesImpact);
          if (areAllNeutralValues([scenarioScores.accuracyConfidence, scenarioScores.stakesImpact])) {
            return [
              `Confidence (${formatScoreLabel(scenarioScores.accuracyConfidence)}) and consequence (${formatScoreLabel(scenarioScores.stakesImpact)}) are both neutral.`,
              "Neutral priors imply no reliable edge yet.",
              "Recommendation defaults to hold until one concrete signal changes confidence or stakes."
            ];
          }
          return [
            `Confidence ${formatScoreLabel(scenarioScores.accuracyConfidence)} is ${confidenceHigh ? "above" : "at/below"} the commit threshold.`,
            `Consequence ${formatScoreLabel(scenarioScores.stakesImpact)} is ${stakesHigh ? "high" : "low/moderate"} for being wrong.`,
            "Policy is mapped from the high/low quadrant intersection of these two factors."
          ];
        }

        if (caseType === CASE_TYPES.bet_sizing) {
          const expectedValueHigh = isHigh(scenarioScores.expectedValue);
          const uncertaintyHigh = isHigh(scenarioScores.uncertainty);
          if (areAllNeutralValues([scenarioScores.expectedValue, scenarioScores.uncertainty])) {
            return [
              `Expected value (${formatScoreLabel(scenarioScores.expectedValue)}) and uncertainty (${formatScoreLabel(scenarioScores.uncertainty)}) are neutral.`,
              "No clear edge means option value is low until new evidence appears.",
              "Recommendation defaults to hold / cheap probe instead of commitment."
            ];
          }
          return [
            `Expected value ${formatScoreLabel(scenarioScores.expectedValue)} is ${expectedValueHigh ? "high" : "low/moderate"}.`,
            `Uncertainty ${formatScoreLabel(scenarioScores.uncertainty)} is ${uncertaintyHigh ? "high" : "low/moderate"}.`,
            "Policy chooses core bet, option, reject, or ignore based on this EV-uncertainty pairing."
          ];
        }

        if (caseType === CASE_TYPES.one_way_door) {
          const reversibilityHigh = scenarioScores.reversibility >= 6;
          const suggestedIntensityRaw =
            (scenarioScores.expectedValue / 10) *
            (1 - (scenarioScores.uncertainty / 10)) *
            (scenarioScores.reversibility / 10);
          const suggestedIntensityPercent = Math.round(clampToDomain(suggestedIntensityRaw * 10) * 10);
          if (areAllNeutralValues([scenarioScores.expectedValue, scenarioScores.uncertainty, scenarioScores.reversibility])) {
            return [
              "All three factors are still neutral priors (5.0).",
              "One-way-door decisions require explicit evidence, not neutral assumptions.",
              "Recommendation is hold with intensity 0%."
            ];
          }
          return [
            `Reversibility ${formatScoreLabel(scenarioScores.reversibility)} is ${reversibilityHigh ? "sufficiently high" : "low"} for safe iteration.`,
            `Suggested intensity is ${suggestedIntensityPercent}% = EV × (1 - uncertainty) × reversibility.`,
            "When reversibility is low, uncertainty must drop materially before committing."
          ];
        }

        return ["Select a decision path in Step 1 to generate a policy explanation."];
      }

      function renderScenarioComparisonCards(caseType) {
        scenarioComparisonGrid.innerHTML = "";
        if (!applicationState.scenarioModeEnabled || !caseType) {
          scenarioComparisonSection.hidden = true;
          return;
        }

        scenarioComparisonSection.hidden = false;

        for (const scenarioDefinition of scenarioDefinitions) {
          const scenarioKey = scenarioDefinition.scenarioKey;
          const snapshot = getSnapshotForScenario(scenarioKey);
          const scenarioPolicy = getPolicyForCase(snapshot, caseType);

          const cardElement = document.createElement("article");
          cardElement.className = "scenario-comparison-card";
          cardElement.dataset.selected = String(applicationState.activeScenarioKey === scenarioKey);

          const scenarioNameElement = document.createElement("p");
          scenarioNameElement.className = "scenario-comparison-name";
          scenarioNameElement.textContent = scenarioDefinition.labelText;

          const scoreElement = document.createElement("p");
          scoreElement.className = "scenario-comparison-scores";
          scoreElement.textContent = getScoreSummaryForCase(snapshot.scenarioScores, caseType);

          const policyElement = document.createElement("p");
          policyElement.className = "scenario-comparison-policy";
          if (scenarioPolicy.subtitleText) {
            policyElement.textContent = `${scenarioPolicy.titleText} — ${scenarioPolicy.subtitleText}`;
          } else {
            policyElement.textContent = scenarioPolicy.titleText;
          }

          const noteElement = document.createElement("p");
          noteElement.className = "scenario-comparison-note";
          noteElement.textContent = applicationState.activeScenarioKey === scenarioKey
            ? "Currently active in charts and sliders."
            : "Click this scenario tab in Step 3 to inspect and adjust assumptions.";

          cardElement.appendChild(scenarioNameElement);
          cardElement.appendChild(scoreElement);
          cardElement.appendChild(policyElement);
          cardElement.appendChild(noteElement);
          scenarioComparisonGrid.appendChild(cardElement);
        }
      }

      function updateRecommendations() {
        const activeSnapshot = getSnapshotForScenario(applicationState.activeScenarioKey);
        const activeScores = activeSnapshot.scenarioScores;
        const activeScenarioLabel = getScenarioLabelText(applicationState.activeScenarioKey);

        accuracyStakesRecommendationCard.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.truth_stakes);
        expectedValueUncertaintyRecommendationCard.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.bet_sizing);
        threeDimensionRecommendationCard.dataset.emphasis = String(applicationState.caseType === CASE_TYPES.one_way_door);

        accuracyStakesRecommendationCard.hidden = applicationState.caseType !== CASE_TYPES.truth_stakes;
        expectedValueUncertaintyRecommendationCard.hidden = applicationState.caseType !== CASE_TYPES.bet_sizing;
        threeDimensionRecommendationCard.hidden = applicationState.caseType !== CASE_TYPES.one_way_door;

        const visibleCardCount =
          Number(!accuracyStakesRecommendationCard.hidden) +
          Number(!expectedValueUncertaintyRecommendationCard.hidden) +
          Number(!threeDimensionRecommendationCard.hidden);
        recommendationGrid.dataset.single = String(visibleCardCount <= 1);

        threeDimensionQuadrantLabel.textContent = activeSnapshot.threeDimensionQuadrant;
        accuracyStakesQuadrantLabel.textContent = activeSnapshot.accuracyStakesQuadrant;
        expectedValueUncertaintyQuadrantLabel.textContent = activeSnapshot.expectedValueUncertaintyQuadrant;

        const accuracyPolicy = activeSnapshot.accuracyPolicy;
        const expectedValuePolicy = activeSnapshot.expectedValuePolicy;
        const threeDimensionPolicy = activeSnapshot.threeDimensionPolicy;

        accuracyStakesPolicyTitle.textContent = accuracyPolicy.titleText;
        expectedValueUncertaintyPolicyTitle.textContent = expectedValuePolicy.titleText;

        if (threeDimensionPolicy.subtitleText) {
          threeDimensionPolicyTitle.textContent = `${threeDimensionPolicy.titleText} — ${threeDimensionPolicy.subtitleText}`;
        } else {
          threeDimensionPolicyTitle.textContent = threeDimensionPolicy.titleText;
        }

        renderBulletList(accuracyStakesPolicyList, accuracyPolicy.bulletItems);
        renderBulletList(expectedValueUncertaintyPolicyList, expectedValuePolicy.bulletItems);
        renderBulletList(threeDimensionPolicyList, threeDimensionPolicy.bulletItems);

        const whyLines = getWhyLinesForCase(activeScores, applicationState.caseType);
        recommendationWhySection.hidden = !applicationState.caseType;
        recommendationWhySubtitle.textContent =
          `${getCaseLabelText(applicationState.caseType)} • ${activeScenarioLabel} scenario • ${getScoreSummaryForCase(activeScores, applicationState.caseType)}`;
        renderBulletList(recommendationWhyList, whyLines);

        renderScenarioComparisonCards(applicationState.caseType);
      }

      function updateWizardFlow() {
        const hasCaseSelection = Boolean(applicationState.caseType);
        const hasProblemText = (applicationState.problemText || "").trim().length > 0;
        const requiredSliderKeys = getRequiredSliderKeysForCase(applicationState.caseType);
        const hasStartedScoring = requiredSliderKeys.some((stateKey) => touchedSliderKeys.has(stateKey));
        const canContinueFromStep3 = hasCaseSelection && hasProblemText;
        const scenarioPrefix = applicationState.scenarioModeEnabled
          ? `${getScenarioLabelText(applicationState.activeScenarioKey)} scenario: `
          : "";

        step1ContinueButton.disabled = !hasCaseSelection;
        step2ContinueButton.disabled = !hasProblemText;
        step3ContinueButton.disabled = !canContinueFromStep3;
        step4ContinueButton.hidden = wizardState.unlockedStep >= 5;

        if (!hasCaseSelection) {
          step3GuideText.textContent = "Pick a path in Step 1 to see which dimensions are required.";
        } else if (requiredSliderKeys.length === 0) {
          step3GuideText.textContent = "No sliders required for this path.";
        } else if (!hasStartedScoring) {
          step3GuideText.textContent =
            `${scenarioPrefix}Optional: keep 50/50 defaults and continue, or move sliders to encode your actual beliefs.`;
        } else {
          const missingSliderLabels = requiredSliderKeys
            .filter((stateKey) => !touchedSliderKeys.has(stateKey))
            .map((stateKey) => sliderDefinitionByKey.get(stateKey)?.labelText || stateKey);

          if (missingSliderLabels.length === 0) {
            step3GuideText.textContent = `${scenarioPrefix}Scoring complete. Continue to visualization.`;
          } else {
            step3GuideText.textContent = `${scenarioPrefix}Optional: move once if needed: ${missingSliderLabels.join(", ")}.`;
          }
        }

        let maximumStepAllowedByPrerequisites = 1;
        if (hasCaseSelection) {
          maximumStepAllowedByPrerequisites = 2;
        }
        if (hasCaseSelection && hasProblemText) {
          maximumStepAllowedByPrerequisites = 5;
        }

        wizardState.unlockedStep = Math.min(wizardState.unlockedStep, maximumStepAllowedByPrerequisites);

        const stepSections = [
          { stepNumber: 1, sectionElement: step1Section },
          { stepNumber: 2, sectionElement: step2Section },
          { stepNumber: 3, sectionElement: step3Section },
          { stepNumber: 4, sectionElement: step4Section },
          { stepNumber: 5, sectionElement: step5Section }
        ];

        for (const stepDefinition of stepSections) {
          const shouldOpen = wizardState.unlockedStep >= stepDefinition.stepNumber;
          stepDefinition.sectionElement.dataset.open = String(shouldOpen);
          stepDefinition.sectionElement.hidden = !shouldOpen;
        }
      }

      function unlockStep(stepNumber, sectionElementToScroll) {
        wizardState.unlockedStep = Math.max(wizardState.unlockedStep, stepNumber);
        synchronizeAllViews();
        if (sectionElementToScroll) {
          sectionElementToScroll.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }

      step1ContinueButton.addEventListener("click", () => {
        if (!step1ContinueButton.disabled) {
          unlockStep(2, step2Section);
        }
      });

      step2ContinueButton.addEventListener("click", () => {
        if (!step2ContinueButton.disabled) {
          unlockStep(3, step3Section);
        }
      });

      step3ContinueButton.addEventListener("click", () => {
        if (!step3ContinueButton.disabled) {
          unlockStep(4, step4Section);
        }
      });

      step4ContinueButton.addEventListener("click", () => {
        unlockStep(5, step5Section);
      });

      // ---------- Buttons ----------
      const resetButton = document.getElementById("resetButton");
      const loadExampleButton = document.getElementById("loadExampleButton");

      resetButton.addEventListener("click", () => {
        touchedSliderKeys.clear();
        wizardState.unlockedStep = 1;
        resetScenarioScores();
        setState({ ...initialApplicationState });
      });

      loadExampleButton.addEventListener("click", () => {
        touchedSliderKeys.clear();
        for (const requiredSliderKey of getRequiredSliderKeysForCase(CASE_TYPES.one_way_door)) {
          touchedSliderKeys.add(requiredSliderKey);
        }
        wizardState.unlockedStep = 5;

        resetScenarioScores();
        Object.assign(scenarioScoresByKey[SCENARIO_TYPES.base], {
          accuracyConfidence: 4.0,
          stakesImpact: 9.0,
          expectedValue: 8.0,
          uncertainty: 7.2,
          reversibility: 3.0
        });
        Object.assign(scenarioScoresByKey[SCENARIO_TYPES.upside], {
          accuracyConfidence: 6.2,
          stakesImpact: 7.2,
          expectedValue: 8.8,
          uncertainty: 4.8,
          reversibility: 4.8
        });
        Object.assign(scenarioScoresByKey[SCENARIO_TYPES.downside], {
          accuracyConfidence: 3.1,
          stakesImpact: 9.4,
          expectedValue: 4.6,
          uncertainty: 8.6,
          reversibility: 1.9
        });

        setState({
          caseType: CASE_TYPES.one_way_door,
          problemText: "Quit job to build product full-time",
          scenarioModeEnabled: true,
          activeScenarioKey: SCENARIO_TYPES.base
        });
      });

      // ---------- Synchronization ----------
      function synchronizeAllViews() {
        renderCaseCards();

        if (problemTextArea.value !== applicationState.problemText) {
          problemTextArea.value = applicationState.problemText;
        }

        updateScenarioControls();
        updateControlGroupEmphasis();
        updatePathVisibility();
        updateEmphasis();

        // Update slider values in place (no control rebuild during drags)
        for (const [stateKey, binding] of sliderBindingsByKey.entries()) {
          const stateValue = getScoreValue(stateKey);
          if (Number(binding.inputElement.value) !== stateValue) {
            binding.inputElement.value = String(stateValue);
          }
          binding.outputElement.textContent = roundToSingleDecimal(stateValue).toFixed(1);
        }

        accuracyStakesChart.update();
        expectedValueUncertaintyChart.update();

        threeDimensionChart.setPointPosition(
          getScoreValue("expectedValue"),
          getScoreValue("uncertainty"),
          getScoreValue("reversibility")
        );

        updateRecommendations();
        updateWizardFlow();
      }

      // Initial render
      buildControls();
      synchronizeAllViews();
    })();
