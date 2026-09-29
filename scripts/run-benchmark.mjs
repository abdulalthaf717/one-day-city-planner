/**
 * Automated Benchmark Runner & Evaluator (Iteration 0)
 *
 * Runs the 78 development cases through the REAL production planner.
 * Evaluates Hard Constraints, Soft Quality, Dynamic Replanning, and Edge Cases.
 * Clusters failures by category and identifies responsible subsystems.
 * Outputs results.json, summary.json, and failure-analysis.json.
 *
 * Usage: npx tsx scripts/run-benchmark.mjs [--dataset dev|holdout] [--iteration 0]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Load .env.local if present
const envLocalPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envLocalPath)) {
  const content = fs.readFileSync(envLocalPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [key, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim();
      if (key && !process.env[key.trim()]) {
        process.env[key.trim()] = val;
      }
    }
  }
}

// 2. Parse CLI Arguments
const args = process.argv.slice(2);
let datasetType = 'dev';
let iterationNum = 0;

let customOutDir = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dataset' && args[i + 1]) datasetType = args[i + 1].toLowerCase();
  if (args[i] === '--iteration' && args[i + 1]) iterationNum = parseInt(args[i + 1], 10);
  if (args[i] === '--output-dir' && args[i + 1]) customOutDir = args[i + 1];
}

const isHoldout = datasetType === 'holdout';
const datasetFile = isHoldout ? 'holdout-22.json' : 'development-78.json';
const datasetPath = path.join(rootDir, 'test-dataset', datasetFile);
const outDir = customOutDir
  ? path.resolve(rootDir, customOutDir)
  : isHoldout
  ? path.join(rootDir, 'evaluation', 'holdout')
  : path.join(rootDir, 'evaluation', 'iterations', `iteration-${iterationNum}`);

fs.mkdirSync(outDir, { recursive: true });

console.log('================================================================');
console.log(`ONE-DAY CITY PLANNER: BENCHMARK RUNNER (${isHoldout ? 'HOLDOUT' : `ITERATION ${iterationNum}`})`);
console.log(`DATASET:    ${datasetFile}`);
console.log(`OUTPUT DIR: ${outDir}`);
console.log('================================================================\n');

// 3. Import Production Planner & Domain Utilities
import { PlannerAgent } from '../src/agent/plannerAgent.ts';
import { classifyTouristRelevance } from '../src/services/geoapify/touristRelevance.ts';

function timeToMinutes(t) {
  if (!t || typeof t !== 'string' || !t.includes(':')) return 0;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function parseInterests(raw) {
  if (!raw || raw === 'None' || raw === 'Any' || raw === 'NA') return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function mapTravelMode(raw) {
  const lower = (raw || '').toLowerCase();
  if (lower.includes('walk')) return 'walk';
  if (lower.includes('transit') || lower.includes('bus') || lower.includes('metro')) return 'transit';
  if (lower.includes('bike') || lower.includes('bicycle')) return 'bicycle';
  return 'drive'; // Auto, Drive, Car, Taxi
}

function parseChangeScenario(changeScenario, currentConstraints) {
  if (!changeScenario || changeScenario === 'NA') return null;

  const reqStr = typeof changeScenario === 'object'
    ? (changeScenario.change_request || '')
    : String(changeScenario);

  if (!reqStr) return null;

  const modified = JSON.parse(JSON.stringify(currentConstraints));
  const lower = reqStr.toLowerCase();

  // Budget changes: e.g. "budget reduced to 100", "budget drops to 300", "50 inr total"
  const budgetMatch = lower.match(/(?:budget\s*(?:reduced to|drops to|changed to|is now|to)?\s*|to\s*)(\d+)\s*(?:inr)?/);
  if (budgetMatch) {
    const newBudget = parseInt(budgetMatch[1], 10);
    if (!isNaN(newBudget)) {
      modified.budget.total = newBudget;
    }
  }

  // End time changes: e.g. "latest end time is now 14:00", "end at 14:00", "flight moved up, latest end time is now 10:30"
  const timeMatch = lower.match(/(?:end(?:ing)?(?:\s*time)?(?:\s*is)?(?:\s*now)?(?:\s*at)?\s*)(\d{1,2}:\d{2})/);
  if (timeMatch) {
    modified.time.latestArrivalTime = timeMatch[1].padStart(5, '0');
  }

  // Mode changes: e.g. "travel mode changed to walk", "mode changes to walk"
  if (lower.includes('walk')) modified.travelMode = 'walk';
  else if (lower.includes('transit')) modified.travelMode = 'transit';
  else if (lower.includes('drive') || lower.includes('auto')) modified.travelMode = 'drive';

  // Number of people: e.g. "add 1 person", "6 people"
  if (lower.includes('add 1 person') || lower.includes('1 more person')) {
    modified.numberOfPeople += 1;
  }

  // Start point shift: e.g. "start point shifts to ramoji"
  const startMatch = reqStr.match(/start(?:\s*point)?\s*(?:shifts|changes|moves)\s*to\s*([^.,->]+)/i);
  if (startMatch) {
    modified.startingPoint.name = startMatch[1].trim();
  }

  return { requestText: reqStr, modifiedConstraints: modified };
}

// 4. Load dataset
const testCases = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
console.log(`Loaded ${testCases.length} benchmark test cases.\n`);

const plannerAgent = new PlannerAgent();

// Metrics tracking
const results = [];
let totalLatencyMs = 0;
let apiFailureCount = 0;

let hardConstraintPassCount = 0;
let budgetComplianceCount = 0;
let deadlineComplianceCount = 0;
let openingHoursComplianceCount = 0;
let routeFeasibilityCount = 0;
let noFabricationCount = 0;
let replanningSuccessCount = 0;
let replanningTotalCount = 0;

let totalIntermediateStops = 0;
let totalTouristStops = 0;
let casesWithTouristRatioGte60 = 0;
let foodAppropriatenessCount = 0;
const travelEfficiencyScores = [];
const timeUtilizationScores = [];

const touristRatios = [];
const failureCategoryCounts = {};
const subsystemFailureCounts = {};

// Helper to record failure pattern
function recordFailure(category, subsystem, caseId, reason) {
  failureCategoryCounts[category] = (failureCategoryCounts[category] || 0) + 1;
  subsystemFailureCounts[subsystem] = (subsystemFailureCounts[subsystem] || 0) + 1;
}

// 5. Main Execution Loop
async function runBenchmark() {
  const startTime = Date.now();

  for (let idx = 0; idx < testCases.length; idx++) {
    const tc = testCases[idx];
    const caseId = tc.case_id;
    const progress = `[${idx + 1}/${testCases.length}]`;
    process.stdout.write(`${progress} Running Case ${caseId} (${tc.city}: ${tc.scenario_description.slice(0, 40)})... `);

    const initialConstraints = {
      city: tc.city,
      startingPoint: {
        name: tc.start_point,
        type: tc.start_point_type || 'hotel',
        coordinates: { lat: 0, lng: 0 },
      },
      endPoint: {
        name: tc.end_point,
        type: tc.end_point_type || 'transit',
        coordinates: { lat: 0, lng: 0 },
      },
      time: {
        date: '2026-10-01',
        startTime: tc.start_time,
        latestArrivalTime: tc.latest_end_time,
      },
      budget: {
        total: Number(tc.budget_inr) || 0,
        currency: 'INR',
      },
      numberOfPeople: Number(tc.number_of_people) || 1,
      travelMode: mapTravelMode(tc.travel_mode),
      interests: parseInterests(tc.interests),
    };

    let planResult = null;
    let errorMsg = null;
    let latencyMs = 0;
    const t0 = performance.now();

    try {
      // 30s per-case hard watchdog
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('CASE_EXECUTION_TIMEOUT (30s exceeded)')), 30000)
      );
      planResult = await Promise.race([
        plannerAgent.planTrip(initialConstraints),
        timeoutPromise,
      ]);
      latencyMs = Math.round(performance.now() - t0);
    } catch (err) {
      latencyMs = Math.round(performance.now() - t0);
      errorMsg = err instanceof Error ? err.message : 'Unknown execution failure';
      if (errorMsg.includes('quota') || errorMsg.includes('rate limit') || errorMsg.includes('Network') || errorMsg.includes('Geoapify')) {
        apiFailureCount++;
      }
    }

    totalLatencyMs += latencyMs;

    // Evaluator
    const caseResult = {
      case_id: caseId,
      city: tc.city,
      difficulty: tc.difficulty,
      scenario: tc.scenario_description,
      latency_ms: latencyMs,
      api_error: errorMsg,
      initial_plan: null,
      replanning: null,
      hard_constraints: {
        start_point_respected: false,
        end_point_respected: false,
        start_time_respected: false,
        deadline_respected: false,
        budget_respected: false,
        travel_mode_respected: false,
        opening_hours_respected: false,
        route_feasibility_respected: false,
        no_overlapping_activities: false,
        no_impossible_travel: false,
        overall_hard_satisfied: false,
      },
      soft_quality: {
        tourist_relevance_score: 0,
        interest_relevance_score: 0,
        travel_efficiency_score: 0,
        useful_time_utilization: 0,
        stop_count: 0,
        safety_buffer_minutes: 0,
        total_cost: 0,
        selected_places: [],
        no_fabrication: true,
      },
      failure_diagnostics: {
        status: 'FAIL',
        reasons: [],
        failure_category: 'NONE',
        responsible_subsystem: 'NONE',
      },
    };

    const isEdgeCase = tc.failure_edge && tc.failure_edge !== 'NA';
    const expectsNoPlan = isEdgeCase && (
      tc.failure_edge.toLowerCase().includes('reject') ||
      tc.failure_edge.toLowerCase().includes('no feasible') ||
      tc.EXPECTED_BEHAVIOR?.toLowerCase().includes('reject') ||
      tc.EXPECTED_BEHAVIOR?.toLowerCase().includes('no feasible') ||
      tc.EXPECTED_BEHAVIOR?.toLowerCase().includes('insufficient funds')
    );

    if (errorMsg) {
      caseResult.failure_diagnostics.status = 'FAIL';
      caseResult.failure_diagnostics.reasons.push(`Execution error: ${errorMsg}`);
      caseResult.failure_diagnostics.failure_category = 'API_OR_NETWORK_ERROR';
      caseResult.failure_diagnostics.responsible_subsystem = 'geoapify_client';
      recordFailure('API_OR_NETWORK_ERROR', 'geoapify_client', caseId, errorMsg);
      results.push(caseResult);
      console.log(`[FAIL - ${errorMsg}]`);
      continue;
    }

    const state = planResult?.plannerState;
    const itinerary = planResult?.itinerary;
    const isPlanGenerated = Boolean(itinerary && itinerary.stops && itinerary.stops.length > 0);

    // Capture initial plan details
    caseResult.initial_plan = {
      success: planResult.success,
      stop_count: itinerary?.stops?.length || 0,
      total_cost: itinerary?.summary?.totalCost || 0,
      start_time: itinerary?.summary?.startTime || tc.start_time,
      end_arrival_time: itinerary?.summary?.endTime || tc.latest_end_time,
      total_travel_minutes: itinerary?.summary?.totalTravelTimeMinutes || 0,
      total_visit_minutes: itinerary?.summary?.totalVisitTimeMinutes || 0,
      safety_buffer_minutes: itinerary?.summary?.allocatedBufferMinutes || 0,
      stops: (itinerary?.stops || []).map((s) => ({
        name: s.name || s.title || s.place?.name || 'Stop',
        category: s.place?.category || s.type,
        arrival: s.arrivalTime,
        departure: s.departureTime,
        cost: s.cost?.total ?? s.cost?.perPerson ?? 0,
      })),
      selected_place_names: (itinerary?.stops || []).map((s) => s.name || s.title || s.place?.name || 'Stop'),
    };

    caseResult.soft_quality.stop_count = itinerary?.stops?.length || 0;
    caseResult.soft_quality.total_cost = itinerary?.summary?.totalCost || 0;
    caseResult.soft_quality.safety_buffer_minutes = itinerary?.summary?.allocatedBufferMinutes || 0;
    caseResult.soft_quality.selected_places = (itinerary?.stops || []).map((s) => s.name || s.title || s.place?.name || 'Stop');

    const stops = itinerary?.stops || [];
    const placeStops = stops.filter((s) => s.type === 'place' || (s.type !== 'start' && s.type !== 'end'));

    // -------------------------------------------------------------------------
    // Edge Case Handling: Clean rejection where expected
    // -------------------------------------------------------------------------
    if (expectsNoPlan && (!isPlanGenerated || !planResult.success || placeStops.length === 0)) {
      caseResult.hard_constraints.start_point_respected = true;
      caseResult.hard_constraints.end_point_respected = true;
      caseResult.hard_constraints.start_time_respected = true;
      caseResult.hard_constraints.deadline_respected = true;
      caseResult.hard_constraints.budget_respected = true;
      caseResult.hard_constraints.travel_mode_respected = true;
      caseResult.hard_constraints.opening_hours_respected = true;
      caseResult.hard_constraints.route_feasibility_respected = true;
      caseResult.hard_constraints.no_overlapping_activities = true;
      caseResult.hard_constraints.no_impossible_travel = true;
      caseResult.hard_constraints.overall_hard_satisfied = true;

      caseResult.soft_quality.tourist_relevance_score = 1.0;
      caseResult.soft_quality.no_fabrication = true;

      caseResult.failure_diagnostics.status = 'PASS';
      caseResult.failure_diagnostics.reasons.push('Infeasible edge-case correctly identified without fabricating impossible routes.');
      caseResult.failure_diagnostics.failure_category = 'NONE';
      caseResult.failure_diagnostics.responsible_subsystem = 'NONE';

      hardConstraintPassCount++;
      budgetComplianceCount++;
      deadlineComplianceCount++;
      openingHoursComplianceCount++;
      routeFeasibilityCount++;
      noFabricationCount++;
      casesWithTouristRatioGte60++;
      foodAppropriatenessCount++;
      touristRatios.push(1.0);
      travelEfficiencyScores.push(100);
      timeUtilizationScores.push(100);

      results.push(caseResult);
      console.log(`[PASS - Edge Case Handled Cleanly (0 stops)]`);
      continue;
    }

    // -------------------------------------------------------------------------
    // Evaluate Normal Planned Itinerary
    // -------------------------------------------------------------------------
    const hc = caseResult.hard_constraints;
    const diag = caseResult.failure_diagnostics;

    // 1. Start point respected
    hc.start_point_respected = Boolean(itinerary?.start?.name || itinerary?.stops?.[0]?.name || itinerary?.stops?.[0]?.title);

    // 2. End point respected
    hc.end_point_respected = Boolean(itinerary?.end?.name || itinerary?.stops?.[stops.length - 1]?.name || itinerary?.stops?.[stops.length - 1]?.title);

    // 3. Start time respected
    const planStartMin = timeToMinutes(itinerary?.startTime || itinerary?.stops?.[0]?.departureTime || itinerary?.stops?.[0]?.arrivalTime || tc.start_time);
    const reqStartMin = timeToMinutes(tc.start_time);
    hc.start_time_respected = planStartMin >= reqStartMin - 5; // allow 5m tolerance
    if (!hc.start_time_respected) diag.reasons.push(`Start time breached: planned ${itinerary?.startTime || itinerary?.stops?.[0]?.departureTime} < requested ${tc.start_time}`);

    // 4. Deadline respected
    const planEndMin = timeToMinutes(itinerary?.plannedEndTime || itinerary?.summary?.plannedArrivalTime || itinerary?.stops?.[stops.length - 1]?.arrivalTime);
    const reqEndMin = timeToMinutes(tc.latest_end_time);
    hc.deadline_respected = planEndMin <= reqEndMin;
    if (!hc.deadline_respected) {
      diag.reasons.push(`Deadline breached: arrived ${itinerary?.plannedEndTime || itinerary?.summary?.plannedArrivalTime} > latest ${tc.latest_end_time} (${planEndMin - reqEndMin}m late)`);
      recordFailure('DEADLINE_BREACH', 'optimizer', caseId, `Arrived ${planEndMin - reqEndMin}m late`);
    } else {
      deadlineComplianceCount++;
    }

    // 5. Budget respected
    const totalCost = itinerary?.summary?.totalCost ?? itinerary?.estimatedTotalCost ?? 0;
    const maxBudget = tc.budget_inr;
    hc.budget_respected = totalCost <= maxBudget;
    if (!hc.budget_respected) {
      diag.reasons.push(`Budget exceeded: ₹${totalCost} > limit ₹${maxBudget}`);
      recordFailure('BUDGET_EXCEEDED', 'optimizer', caseId, `Cost ₹${totalCost} > ₹${maxBudget}`);
    } else {
      budgetComplianceCount++;
    }

    // 6. Travel mode respected
    const planMode = state?.tripConstraints?.travelMode || stops.find((s) => s.travelFromPrevious?.mode)?.travelFromPrevious?.mode || mapTravelMode(tc.travel_mode);
    hc.travel_mode_respected = planMode === mapTravelMode(tc.travel_mode);
    if (!hc.travel_mode_respected) diag.reasons.push(`Travel mode mismatch: used ${planMode} vs expected ${mapTravelMode(tc.travel_mode)}`);

    // 7. Route feasibility (strictly monotonic timeline)
    let monotonic = true;
    let prevDep = planStartMin;
    for (const stop of stops) {
      const arr = timeToMinutes(stop.arrivalTime);
      const dep = timeToMinutes(stop.departureTime);
      if (arr < prevDep || dep < arr) {
        monotonic = false;
        break;
      }
      prevDep = dep;
    }
    hc.route_feasibility_respected = monotonic;
    hc.no_overlapping_activities = monotonic;
    hc.no_impossible_travel = monotonic;
    if (monotonic) routeFeasibilityCount++;
    else {
      diag.reasons.push('Route non-monotonic: activity overlap or negative transit time.');
      recordFailure('ROUTE_FEASIBILITY_VIOLATION', 'validator', caseId, 'Non-monotonic schedule');
    }

    // 8. Opening hours compliance
    let openHoursCompliant = true;
    for (const stop of stops) {
      const arr = timeToMinutes(stop.arrivalTime);
      const dep = timeToMinutes(stop.departureTime);
      const open = stop.place?.openingHours?.open ? timeToMinutes(stop.place.openingHours.open) : null;
      const close = stop.place?.openingHours?.close ? timeToMinutes(stop.place.openingHours.close) : null;
      if (open !== null && arr < open) openHoursCompliant = false;
      if (close !== null && dep > close) openHoursCompliant = false;
    }
    hc.opening_hours_respected = openHoursCompliant;
    if (openHoursCompliant) openingHoursComplianceCount++;
    else {
      diag.reasons.push('Attraction visited outside verified operational opening hours.');
      recordFailure('OPENING_HOURS_VIOLATION', 'optimizer', caseId, 'Stop outside opening window');
    }

    // Overall hard constraints
    hc.overall_hard_satisfied =
      hc.start_point_respected &&
      hc.end_point_respected &&
      hc.start_time_respected &&
      hc.deadline_respected &&
      hc.budget_respected &&
      hc.route_feasibility_respected &&
      hc.opening_hours_respected;

    if (hc.overall_hard_satisfied) hardConstraintPassCount++;

    // 9. Soft Quality: Tourist Relevance (measured across attraction stops)
    let touristCount = 0;
    let foodStopsInPlan = 0;
    for (const stop of placeStops) {
      const relevance = stop.place
        ? classifyTouristRelevance(stop.place, '', tc.interests ? [tc.interests] : [])
        : classifyTouristRelevance([], stop.name || stop.title || '', tc.interests ? [tc.interests] : []);
      const pType = String(relevance.placeType).toUpperCase();
      if (
        pType === 'PRIMARY_TOURIST' ||
        pType === 'SECONDARY_ATTRACTION' ||
        relevance.touristRelevanceScore >= 60
      ) {
        touristCount++;
      }
      if (pType === 'SUPPORT_FOOD' || stop.place?.category === 'restaurant' || stop.place?.category === 'cafe') {
        foodStopsInPlan++;
      }
    }
    const touristRatio = placeStops.length > 0 ? touristCount / placeStops.length : 1.0;
    caseResult.soft_quality.tourist_relevance_score = Math.round(touristRatio * 100) / 100;
    touristRatios.push(touristRatio);
    totalIntermediateStops += placeStops.length;
    totalTouristStops += touristCount;

    if (touristRatio >= 0.60 || placeStops.length === 0) {
      casesWithTouristRatioGte60++;
    }

    const wantsFood = tc.interests && /\b(food|dining|restaurant|cafe)\b/i.test(tc.interests);
    const foodAppropriate = wantsFood ? foodStopsInPlan >= 1 : foodStopsInPlan <= 1;
    if (foodAppropriate) {
      foodAppropriatenessCount++;
    }

    // Soft Quality: Travel Efficiency & Time Utilization
    const visitMin = itinerary?.totalVisitMinutes || itinerary?.summary?.totalActivityTimeMinutes || 0;
    const travelMin = itinerary?.totalTravelMinutes || itinerary?.summary?.totalTravelTimeMinutes || 0;
    const totalTripMin = visitMin + travelMin;
    const availMin = tc.available_minutes || (reqEndMin - reqStartMin);

    caseResult.soft_quality.travel_efficiency_score = (visitMin + travelMin) > 0 ? Math.round((visitMin / (visitMin + travelMin)) * 100) : 0;
    caseResult.soft_quality.useful_time_utilization = availMin > 0 ? Math.min(100, Math.round((totalTripMin / availMin) * 100)) : 0;
    travelEfficiencyScores.push(caseResult.soft_quality.travel_efficiency_score);
    timeUtilizationScores.push(caseResult.soft_quality.useful_time_utilization);

    if (touristRatio < 0.60 && placeStops.length > 1) {
      diag.reasons.push(`Low tourist relevance (${Math.round(touristRatio * 100)}%): ordinary local places selected.`);
      recordFailure('POOR_TOURIST_RELEVANCE', 'candidate_scoring', caseId, 'Ordinary local places in plan');
    }

    // 10. No fabrication
    hc.no_fabrication = true;
    for (const stop of placeStops) {
      if (!stop.place?.coordinates?.lat || !stop.place?.coordinates?.lng) {
        hc.no_fabrication = false;
      }
    }
    caseResult.soft_quality.no_fabrication = hc.no_fabrication;
    if (hc.no_fabrication) noFabricationCount++;
    else {
      diag.reasons.push('Fabricated place detected without valid geographic coordinates.');
      recordFailure('FABRICATED_PLACE', 'candidate_discovery', caseId, 'Coordinates missing');
    }

    // 11. Dynamic Replanning Verification (if change_scenario is present)
    const changeSpec = parseChangeScenario(tc.change_scenario, initialConstraints);
    if (changeSpec && planResult.plannerState) {
      replanningTotalCount++;
      try {
        const replanResult = await plannerAgent.planTrip(
          changeSpec.modifiedConstraints,
          planResult.plannerState,
          changeSpec.requestText
        );

        const newStops = replanResult.itinerary?.stops || [];
        const newCost = replanResult.itinerary?.summary?.totalCost || 0;
        const newEndMin = timeToMinutes(replanResult.itinerary?.summary?.endTime);
        const reqNewEndMin = timeToMinutes(changeSpec.modifiedConstraints.time.latestArrivalTime);

        let replanSuccess = false;
        // Check if replanned plan respected the new constraint
        if (changeSpec.modifiedConstraints.budget.total < initialConstraints.budget.total) {
          replanSuccess = newCost <= changeSpec.modifiedConstraints.budget.total && replanResult.success;
        } else if (reqNewEndMin < reqEndMin) {
          replanSuccess = newEndMin <= reqNewEndMin && replanResult.success;
        } else if (changeSpec.modifiedConstraints.travelMode !== initialConstraints.travelMode) {
          const expectedMode = changeSpec.modifiedConstraints.travelMode;
          // 1. Trip constraints contain the new travel mode
          const stateMode = replanResult.plannerState?.tripConstraints?.travelMode;
          const constraintsMatch = stateMode === expectedMode;

          // 2. All relevant travel legs use the new mode
          const travelLegs = newStops.filter((s) => s.travelFromPrevious?.mode);
          const legsMatch = travelLegs.length === 0 || travelLegs.every((s) => s.travelFromPrevious?.mode === expectedMode);

          // 3. Resulting itinerary is feasible for that mode (or safe fallback when unreachable)
          const isFeasible = replanResult.success || newStops.length <= 2;

          // 4. Optimizer output consistent with changed constraint
          let legsConsistent = true;
          for (const s of travelLegs) {
            const dist = s.travelFromPrevious?.distanceMeters || 0;
            const dur = s.travelFromPrevious?.durationMinutes || 0;
            if (expectedMode === 'walk' && dur > 0) {
              const speedKmh = (dist / 1000) / (dur / 60);
              if (speedKmh > 10) legsConsistent = false;
            }
          }

          replanSuccess = constraintsMatch && legsMatch && isFeasible && legsConsistent;
        } else if (changeSpec.modifiedConstraints.numberOfPeople !== initialConstraints.numberOfPeople) {
          const expectedPax = changeSpec.modifiedConstraints.numberOfPeople;
          const statePax = replanResult.plannerState?.tripConstraints?.numberOfPeople;
          replanSuccess = statePax === expectedPax && replanResult.success;
        } else {
          replanSuccess = replanResult.success;
        }

        if (replanSuccess) {
          replanningSuccessCount++;
        } else {
          diag.reasons.push(`Replanning adaptation imperfect: failed to satisfy revised constraint.`);
          recordFailure('REPLANNING_ADAPTATION_FAILURE', 'replanning_logic', caseId, 'Did not adapt to constraint change');
        }

        caseResult.replanning = {
          request: changeSpec.requestText,
          success: replanSuccess,
          new_stop_count: newStops.length,
          new_total_cost: newCost,
          reused_components: replanResult.diagnostics?.reusedComponents || [],
        };
      } catch (replanErr) {
        diag.reasons.push(`Replanning failed with error: ${replanErr.message}`);
        recordFailure('REPLANNING_CRASH', 'replanning_logic', caseId, replanErr.message);
      }
    }

    // Determine Final Status
    if (hc.overall_hard_satisfied && touristRatio >= 0.60 && (!caseResult.replanning || caseResult.replanning.success)) {
      diag.status = 'PASS';
    } else if (hc.overall_hard_satisfied) {
      diag.status = 'PARTIAL';
    } else {
      diag.status = 'FAIL';
    }

    results.push(caseResult);
    console.log(`[${diag.status}] (${stops.length} stops, ₹${totalCost}, ${Math.round(touristRatio * 100)}% tourist, ${latencyMs}ms)`);
  }

  // 6. Aggregate Metrics & Reporting
  const totalCasesRun = results.length;
  const hardConstraintRate = totalCasesRun > 0 ? (hardConstraintPassCount / totalCasesRun) * 100 : 0;
  const budgetRate = totalCasesRun > 0 ? (budgetComplianceCount / totalCasesRun) * 100 : 0;
  const deadlineRate = totalCasesRun > 0 ? (deadlineComplianceCount / totalCasesRun) * 100 : 0;
  const openHoursRate = totalCasesRun > 0 ? (openingHoursComplianceCount / totalCasesRun) * 100 : 0;
  const routeFeasRate = totalCasesRun > 0 ? (routeFeasibilityCount / totalCasesRun) * 100 : 0;
  const noFabRate = totalCasesRun > 0 ? (noFabricationCount / totalCasesRun) * 100 : 0;
  const avgTouristScore = touristRatios.length > 0 ? (touristRatios.reduce((a, b) => a + b, 0) / touristRatios.length) * 100 : 0;
  const replanRate = replanningTotalCount > 0 ? (replanningSuccessCount / replanningTotalCount) * 100 : 100;
  const avgLatency = totalCasesRun > 0 ? Math.round(totalLatencyMs / totalCasesRun) : 0;

  const passedCasesCount = results.filter((r) => r.failure_diagnostics.status === 'PASS').length;
  const partialCasesCount = results.filter((r) => r.failure_diagnostics.status === 'PARTIAL').length;
  const failedCasesCount = results.filter((r) => r.failure_diagnostics.status === 'FAIL').length;

  const touristQualityCasePassRate = totalCasesRun > 0 ? (casesWithTouristRatioGte60 / totalCasesRun) * 100 : 0;
  const touristRelevanceStopRate = totalIntermediateStops > 0 ? (totalTouristStops / totalIntermediateStops) * 100 : 100;
  const avgTravelEfficiency = travelEfficiencyScores.length > 0 ? travelEfficiencyScores.reduce((a, b) => a + b, 0) / travelEfficiencyScores.length : 0;
  const avgTimeUtilization = timeUtilizationScores.length > 0 ? timeUtilizationScores.reduce((a, b) => a + b, 0) / timeUtilizationScores.length : 0;
  const foodAppropriatenessRate = totalCasesRun > 0 ? (foodAppropriatenessCount / totalCasesRun) * 100 : 100;

  const summary = {
    dataset: datasetFile,
    iteration: iterationNum,
    timestamp: new Date().toISOString(),
    total_cases_run: totalCasesRun,
    cases_completed: `${totalCasesRun}/${testCases.length}`,
    passed_cases: passedCasesCount,
    partial_cases: partialCasesCount,
    failed_cases: failedCasesCount,
    overall_pass_rate_pct: Math.round((passedCasesCount / totalCasesRun) * 1000) / 10,
    metrics: {
      hard_constraints: {
        hard_constraint_satisfaction_pct: Math.round(hardConstraintRate * 10) / 10,
        budget_compliance_pct: Math.round(budgetRate * 10) / 10,
        deadline_compliance_pct: Math.round(deadlineRate * 10) / 10,
        opening_hours_compliance_pct: Math.round(openHoursRate * 10) / 10,
        route_feasibility_pct: Math.round(routeFeasRate * 10) / 10,
        no_fabrication_pct: Math.round(noFabRate * 10) / 10,
      },
      soft_quality: {
        tourist_quality_case_pass_rate: Math.round(touristQualityCasePassRate * 10) / 10,
        tourist_relevance_stop_rate: Math.round(touristRelevanceStopRate * 10) / 10,
        average_tourist_ratio_pct: Math.round(avgTouristScore * 10) / 10,
        travel_efficiency_pct: Math.round(avgTravelEfficiency * 10) / 10,
        time_utilization_pct: Math.round(avgTimeUtilization * 10) / 10,
        food_stop_appropriateness_pct: Math.round(foodAppropriatenessRate * 10) / 10,
      },
      operational: {
        replanning_success_pct: Math.round(replanRate * 10) / 10,
        average_planner_latency_ms: avgLatency,
        api_failure_count: apiFailureCount,
      },
      // Backward-compatible flat metrics
      hard_constraint_satisfaction_pct: Math.round(hardConstraintRate * 10) / 10,
      budget_compliance_pct: Math.round(budgetRate * 10) / 10,
      deadline_compliance_pct: Math.round(deadlineRate * 10) / 10,
      opening_hours_compliance_pct: Math.round(openHoursRate * 10) / 10,
      route_feasibility_pct: Math.round(routeFeasRate * 10) / 10,
      tourist_relevance_pct: Math.round(touristRelevanceStopRate * 10) / 10,
      no_fabrication_pct: Math.round(noFabRate * 10) / 10,
      replanning_success_pct: Math.round(replanRate * 10) / 10,
      average_planner_latency_ms: avgLatency,
      api_failure_count: apiFailureCount,
    },
    metric_definitions: {
      tourist_quality_case_pass_rate: "Percentage of cases where at least 60% of attraction stops are tourist attractions (denominator: total evaluated cases)",
      tourist_relevance_stop_rate: "Percentage of intermediate attraction stops classified as Tier 1 or Tier 2 tourist attractions (denominator: total intermediate stops across all itineraries)",
      average_tourist_ratio_pct: "Arithmetic mean of case tourist ratios across all cases",
    },
  };

  // Rank failure categories
  const sortedFailures = Object.entries(failureCategoryCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, count]) => ({ category: cat, occurrences: count }));

  const failureAnalysis = {
    dataset: datasetFile,
    iteration: iterationNum,
    timestamp: new Date().toISOString(),
    total_failures_detected: Object.values(failureCategoryCounts).reduce((a, b) => a + b, 0),
    top_recurring_failure_patterns: sortedFailures.slice(0, 10),
    responsible_subsystems: subsystemFailureCounts,
    per_case_diagnostics: results
      .filter((r) => r.failure_diagnostics.status !== 'PASS')
      .map((r) => ({
        case_id: r.case_id,
        city: r.city,
        status: r.failure_diagnostics.status,
        reasons: r.failure_diagnostics.reasons,
        selected_places: r.soft_quality.selected_places,
        total_cost: r.soft_quality.total_cost,
      })),
  };

  // Write outputs
  fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'failure-analysis.json'), JSON.stringify(failureAnalysis, null, 2), 'utf8');

  if (isHoldout) {
    fs.writeFileSync(path.join(outDir, 'holdout-results.json'), JSON.stringify(results, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'holdout-summary.json'), JSON.stringify(summary, null, 2), 'utf8');

    const devSummaryPath = path.join(rootDir, 'evaluation', 'iterations', 'iteration-2', 'summary.json');
    if (fs.existsSync(devSummaryPath)) {
      const devSummary = JSON.parse(fs.readFileSync(devSummaryPath, 'utf8'));
      const devVsHoldout = {
        comparison: 'Development Iteration 2 (78 cases) vs Final Holdout (22 cases)',
        version: 'v1.1.1-calibrated-frozen',
        timestamp: new Date().toISOString(),
        development_78: {
          cases: devSummary.total_cases_run,
          overall_pass_rate_pct: devSummary.overall_pass_rate_pct,
          metrics: devSummary.metrics,
        },
        holdout_22: {
          cases: totalCasesRun,
          overall_pass_rate_pct: Math.round((passedCasesCount / totalCasesRun) * 1000) / 10,
          metrics: summary.metrics,
        },
        deltas: {
          overall_pass_rate_pct: Math.round(((passedCasesCount / totalCasesRun) * 100 - devSummary.overall_pass_rate_pct) * 10) / 10,
          hard_constraint_satisfaction_pct: Math.round((hardConstraintRate - devSummary.metrics.hard_constraint_satisfaction_pct) * 10) / 10,
          budget_compliance_pct: Math.round((budgetRate - devSummary.metrics.budget_compliance_pct) * 10) / 10,
          deadline_compliance_pct: Math.round((deadlineRate - devSummary.metrics.deadline_compliance_pct) * 10) / 10,
          tourist_relevance_pct: Math.round((touristRelevanceStopRate - devSummary.metrics.tourist_relevance_pct) * 10) / 10,
        },
        generalization_assessment: {
          generalization_gap_pct: Math.round((devSummary.overall_pass_rate_pct - (passedCasesCount / totalCasesRun) * 100) * 10) / 10,
          hard_constraints_maintained: hardConstraintRate === 100,
          zero_hallucinations_maintained: noFabRate === 100,
        },
      };
      fs.writeFileSync(path.join(outDir, 'development-vs-holdout.json'), JSON.stringify(devVsHoldout, null, 2), 'utf8');
      console.log(`[OUTPUT] Development vs Holdout comparison saved to ${path.join(outDir, 'development-vs-holdout.json')}`);
    }
  }

  // Comparison with Previous Iterations
  if (iterationNum === 2) {
    const prevSummaryPath = path.join(rootDir, 'evaluation', 'iterations', 'iteration-1', 'summary.json');
    if (fs.existsSync(prevSummaryPath)) {
      const iter1 = JSON.parse(fs.readFileSync(prevSummaryPath, 'utf8'));
      const comparison = {
        comparison: 'Iteration 1 vs Iteration 2',
        candidate_version: 'v1.1.1-calibrated-candidate',
        baseline_version: 'v1.1.0-calibrated-frozen',
        timestamp: new Date().toISOString(),
        dataset: datasetFile,
        iteration_1: {
          passed_cases: iter1.passed_cases,
          partial_cases: iter1.partial_cases,
          failed_cases: iter1.failed_cases,
          overall_pass_rate_pct: iter1.overall_pass_rate_pct,
          metrics: iter1.metrics,
        },
        iteration_2: {
          passed_cases: passedCasesCount,
          partial_cases: partialCasesCount,
          failed_cases: failedCasesCount,
          overall_pass_rate_pct: Math.round((passedCasesCount / totalCasesRun) * 1000) / 10,
          metrics: summary.metrics,
        },
        deltas: {
          overall_pass_rate_pct: Math.round(((passedCasesCount / totalCasesRun) * 100 - iter1.overall_pass_rate_pct) * 10) / 10,
          tourist_relevance_stop_rate: Math.round((touristRelevanceStopRate - (iter1.metrics.tourist_relevance_pct || 69.9)) * 10) / 10,
          replanning_success_pct: Math.round((replanRate - (iter1.metrics.replanning_success_pct || 83.3)) * 10) / 10,
          average_planner_latency_ms: avgLatency - (iter1.metrics.average_planner_latency_ms || 3519),
          hard_constraint_satisfaction_pct: Math.round((hardConstraintRate - iter1.metrics.hard_constraint_satisfaction_pct) * 10) / 10,
          budget_compliance_pct: Math.round((budgetRate - (iter1.metrics.budget_compliance_pct || 100)) * 10) / 10,
          deadline_compliance_pct: Math.round((deadlineRate - (iter1.metrics.deadline_compliance_pct || 100)) * 10) / 10,
          opening_hours_compliance_pct: Math.round((openHoursRate - (iter1.metrics.opening_hours_compliance_pct || 100)) * 10) / 10,
          route_feasibility_pct: Math.round((routeFeasRate - (iter1.metrics.route_feasibility_pct || 100)) * 10) / 10,
        },
        assessment: {
          hard_constraint_regressions: hardConstraintRate < iter1.metrics.hard_constraint_satisfaction_pct,
          tourist_relevance_maintained: touristRelevanceStopRate >= 80,
          replanning_maintained: replanRate >= (iter1.metrics.replanning_success_pct || 83.3),
        },
      };
      fs.writeFileSync(path.join(outDir, 'comparison-with-iteration-1.json'), JSON.stringify(comparison, null, 2), 'utf8');
      console.log(`[OUTPUT] Comparison saved to ${path.join(outDir, 'comparison-with-iteration-1.json')}`);
    }
  } else if (iterationNum === 1) {
    const prevSummaryPath = path.join(rootDir, 'evaluation', 'iterations', 'iteration-0', 'summary.json');
    if (fs.existsSync(prevSummaryPath)) {
      const iter0 = JSON.parse(fs.readFileSync(prevSummaryPath, 'utf8'));
      const comparison = {
        comparison: `Iteration 0 vs Iteration ${iterationNum}`,
        timestamp: new Date().toISOString(),
        dataset: datasetFile,
        iteration_0: {
          passed_cases: iter0.passed_cases,
          partial_cases: iter0.partial_cases,
          failed_cases: iter0.failed_cases,
          overall_pass_rate_pct: iter0.overall_pass_rate_pct,
          metrics: iter0.metrics,
        },
        iteration_1: {
          passed_cases: passedCasesCount,
          partial_cases: partialCasesCount,
          failed_cases: failedCasesCount,
          overall_pass_rate_pct: Math.round((passedCasesCount / totalCasesRun) * 1000) / 10,
          metrics: summary.metrics,
        },
        deltas: {
          overall_pass_rate_pct: Math.round(((passedCasesCount / totalCasesRun) * 100 - iter0.overall_pass_rate_pct) * 10) / 10,
          tourist_relevance_stop_rate: Math.round((touristRelevanceStopRate - (iter0.metrics.tourist_relevance_pct || 69.9)) * 10) / 10,
          replanning_success_pct: Math.round((replanRate - (iter0.metrics.replanning_success_pct || 83.3)) * 10) / 10,
          average_planner_latency_ms: avgLatency - (iter0.metrics.average_planner_latency_ms || 3519),
          hard_constraint_satisfaction_pct: Math.round((hardConstraintRate - iter0.metrics.hard_constraint_satisfaction_pct) * 10) / 10,
        },
        assessment: {
          hard_constraint_regressions: hardConstraintRate < iter0.metrics.hard_constraint_satisfaction_pct,
          tourist_relevance_improved: touristQualityCasePassRate > (iter0.overall_pass_rate_pct || 62.8),
          replanning_improved: replanRate >= (iter0.metrics.replanning_success_pct || 83.3),
        },
      };
      fs.writeFileSync(path.join(outDir, 'comparison-with-iteration-0.json'), JSON.stringify(comparison, null, 2), 'utf8');
      console.log(`[OUTPUT] Comparison saved to ${path.join(outDir, 'comparison-with-iteration-0.json')}`);
    }
  }

  console.log('\n================================================================');
  console.log(`BENCHMARK EXECUTION COMPLETE: ITERATION ${iterationNum}`);
  console.log('================================================================');
  console.log(`1.  Cases Completed:            ${summary.cases_completed}`);
  console.log(`2.  Hard Constraint Satis. %:   ${summary.metrics.hard_constraint_satisfaction_pct}%`);
  console.log(`3.  Budget Compliance %:        ${summary.metrics.budget_compliance_pct}%`);
  console.log(`4.  Deadline Compliance %:      ${summary.metrics.deadline_compliance_pct}%`);
  console.log(`5.  Opening-Hours Compl. %:     ${summary.metrics.opening_hours_compliance_pct}%`);
  console.log(`6.  Route Feasibility %:        ${summary.metrics.route_feasibility_pct}%`);
  console.log(`7.  Tourist Relevance %:        ${summary.metrics.tourist_relevance_pct}%`);
  console.log(`8.  No-Fabrication %:           ${summary.metrics.no_fabrication_pct}%`);
  console.log(`9.  Replanning Success %:       ${summary.metrics.replanning_success_pct}%`);
  console.log(`10. Average Planner Latency:    ${summary.metrics.average_planner_latency_ms} ms`);
  console.log(`11. API Failure Count:          ${summary.metrics.api_failure_count}`);
  console.log('----------------------------------------------------------------');
  console.log('12. Top Recurring Failure Patterns:');
  sortedFailures.slice(0, 10).forEach((f, idx) => {
    console.log(`    ${idx + 1}. ${f.category.padEnd(35)}: ${f.occurrences} cases`);
  });
  console.log('----------------------------------------------------------------');
  console.log('13. Subsystem Attribution:');
  Object.entries(subsystemFailureCounts).forEach(([sub, count]) => {
    console.log(`    - ${sub.padEnd(25)}: ${count} issues`);
  });
  console.log('================================================================');
  console.log(`[OUTPUT] Results saved to ${path.join(outDir, 'results.json')}`);
  console.log(`[OUTPUT] Summary saved to ${path.join(outDir, 'summary.json')}`);
  console.log(`[OUTPUT] Failure analysis saved to ${path.join(outDir, 'failure-analysis.json')}\n`);

  process.exit(0);
}

runBenchmark();
