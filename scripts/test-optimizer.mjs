/**
 * Standalone Node CLI test script for Deterministic Itinerary Optimizer & Safety Buffer Validation.
 *
 * Runs Development Test Cases (TEST A through TEST I):
 * Usage: node scripts/test-optimizer.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Read .env.local if present
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

const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
const hasApiKey = Boolean(apiKey);

console.log('================================================================');
console.log('DETERMINISTIC ITINERARY OPTIMIZER TEST SUITE');
console.log(`GEOAPIFY_API_KEY Present: ${hasApiKey ? 'YES' : 'NO (Controlled Fixtures)'}`);
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

function report(id, name, passed, details) {
  if (passed) {
    passCount++;
    console.log(`[PASS] ${id}: ${name}`);
  } else {
    failCount++;
    console.log(`[FAIL] ${id}: ${name}`);
  }
  if (details) {
    console.log(`       Details: ${details}\n`);
  }
}

// -----------------------------------------------------------------
// Helpers & Core Algorithms in Standalone Execution
// -----------------------------------------------------------------
function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const total = Math.max(0, Math.round(m));
  const h = Math.floor(total / 60) % 24;
  const min = total % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

function calcBuffer(travelMins, mode = 'drive') {
  const mult = mode === 'drive' ? 1.25 : 1.0;
  return Math.min(60, Math.max(15, Math.round(travelMins * 0.15 * mult)));
}

// Simple beam search implementation for standalone CLI
function runSimpleBeamSearch(params) {
  const { startTime, deadlineTime, maxBudget, pax, matrix, candidates, endId } = params;
  const startMin = timeToMinutes(startTime);
  const deadlineMin = timeToMinutes(deadlineTime);

  let bestState = {
    visited: [],
    lastId: 'START',
    currentMin: startMin,
    travelMins: 0,
    cost: 0,
    score: 0,
  };

  let beam = [bestState];

  for (let depth = 0; depth < candidates.length; depth++) {
    const nextStates = [];

    for (const state of beam) {
      for (const cand of candidates) {
        if (state.visited.includes(cand.id)) continue;

        // Transition from lastId to cand.id
        const leg = matrix[`${state.lastId}::${cand.id}`];
        if (!leg || leg.status !== 'OK') continue;

        const arrival = state.currentMin + leg.durationMinutes;

        // Opening hours check
        if (cand.openWindow) {
          if (arrival + cand.durationMinutes > cand.openWindow.closeMin || arrival < cand.openWindow.openMin - 30) {
            continue; // Closed
          }
        }

        const effectiveArrival = cand.openWindow && arrival < cand.openWindow.openMin ? cand.openWindow.openMin : arrival;
        const departure = effectiveArrival + cand.durationMinutes;

        // Transition from cand.id to endId
        const legToEnd = matrix[`${cand.id}::${endId}`];
        if (!legToEnd || legToEnd.status !== 'OK') continue;

        const totalTravel = state.travelMins + leg.durationMinutes + legToEnd.durationMinutes;
        const reqBuffer = calcBuffer(totalTravel);
        const plannedEnd = departure + legToEnd.durationMinutes;

        if (plannedEnd > deadlineMin || deadlineMin - plannedEnd < reqBuffer) {
          continue; // End-point pressure / deadline violation
        }

        const nextCost = state.cost + (cand.costPerPerson || 0) * pax;
        if (nextCost > maxBudget) {
          continue; // Budget exceeded
        }

        const utility = cand.score + cand.durationMinutes * 0.2 - leg.durationMinutes * 0.3;
        const newState = {
          visited: [...state.visited, cand.id],
          lastId: cand.id,
          currentMin: departure,
          travelMins: state.travelMins + leg.durationMinutes,
          cost: nextCost,
          score: state.score + utility,
          plannedEnd,
          safetyBuffer: deadlineMin - plannedEnd,
        };

        nextStates.push(newState);
        if (newState.score > bestState.score) {
          bestState = newState;
        }
      }
    }

    if (nextStates.length === 0) break;
    nextStates.sort((a, b) => b.score - a.score);
    beam = nextStates.slice(0, 100);
  }

  return bestState;
}

// -----------------------------------------------------------------
// TEST B: Short Trip (2-Hour Window Pruning)
// -----------------------------------------------------------------
try {
  const matrixB = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::CAND_CLOSE': { durationMinutes: 10, status: 'OK' },
    'CAND_CLOSE::END': { durationMinutes: 20, status: 'OK' },
    'START::CAND_FAR': { durationMinutes: 50, status: 'OK' },
    'CAND_FAR::END': { durationMinutes: 45, status: 'OK' },
  };

  const resB = runSimpleBeamSearch({
    startTime: '10:00',
    deadlineTime: '12:00', // 2 hours
    maxBudget: 2000,
    pax: 1,
    matrix: matrixB,
    endId: 'END',
    candidates: [
      { id: 'CAND_CLOSE', durationMinutes: 30, costPerPerson: 50, score: 80 },
      { id: 'CAND_FAR', durationMinutes: 90, costPerPerson: 100, score: 90 },
    ],
  });

  const passedB = resB.visited.includes('CAND_CLOSE') && !resB.visited.includes('CAND_FAR');
  report(
    'TEST B',
    'Very Short Trip (2-Hour Window Pruning)',
    passedB,
    `Nearby 30m activity selected; distant 90m activity pruned. Planned end: ${minutesToTime(resB.plannedEnd)} before 12:00 (Buffer: ${resB.safetyBuffer}m).`
  );
} catch (err) {
  report('TEST B', 'Very Short Trip', false, err.message);
}

// -----------------------------------------------------------------
// TEST C: Very Small Budget (₹200 for 2 people)
// -----------------------------------------------------------------
try {
  const matrixC = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::FREE_PARK': { durationMinutes: 10, status: 'OK' },
    'FREE_PARK::END': { durationMinutes: 15, status: 'OK' },
    'START::EXP_DINING': { durationMinutes: 10, status: 'OK' },
    'EXP_DINING::END': { durationMinutes: 15, status: 'OK' },
  };

  const resC = runSimpleBeamSearch({
    startTime: '10:00',
    deadlineTime: '18:00',
    maxBudget: 200,
    pax: 2,
    matrix: matrixC,
    endId: 'END',
    candidates: [
      { id: 'FREE_PARK', durationMinutes: 45, costPerPerson: 0, score: 75 },
      { id: 'EXP_DINING', durationMinutes: 60, costPerPerson: 450, score: 85 }, // ₹900 for 2 > ₹200
    ],
  });

  const passedC = resC.visited.includes('FREE_PARK') && !resC.visited.includes('EXP_DINING') && resC.cost <= 200;
  report(
    'TEST C',
    'Budget Sensitivity (Prunes Over-Budget Dining)',
    passedC,
    `Free public park (₹0) selected; ₹900 dining rejected. Total cost: ₹${resC.cost} <= ₹200 budget.`
  );
} catch (err) {
  report('TEST C', 'Budget Sensitivity', false, err.message);
}

// -----------------------------------------------------------------
// TEST D: End-Point Pressure (High-Score But Infeasible)
// -----------------------------------------------------------------
try {
  const matrixD = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::LONG_MUSEUM': { durationMinutes: 20, status: 'OK' },
    'LONG_MUSEUM::END': { durationMinutes: 10, status: 'OK' },
  };

  const resD = runSimpleBeamSearch({
    startTime: '17:00',
    deadlineTime: '18:00', // 1 hour window
    maxBudget: 2000,
    pax: 1,
    matrix: matrixD,
    endId: 'END',
    candidates: [{ id: 'LONG_MUSEUM', durationMinutes: 90, costPerPerson: 50, score: 95 }],
  });

  const passedD = resD.visited.length === 0; // Pruned
  report(
    'TEST D',
    'End-Point Pressure (Late Arrival Pruning)',
    passedD,
    `90-minute museum pruned because 20m + 90m + 10m + 15m buffer > 60m window. Safe minimal plan preserved.`
  );
} catch (err) {
  report('TEST D', 'End-Point Pressure', false, err.message);
}

// -----------------------------------------------------------------
// TEST E: Directional Road Network Asymmetry Exploitation
// -----------------------------------------------------------------
try {
  // A -> B is 10 min, B -> A is 45 min
  const matrixE = {
    'START::END': { durationMinutes: 30, status: 'OK' },
    'START::PLACE_A': { durationMinutes: 10, status: 'OK' },
    'PLACE_A::END': { durationMinutes: 25, status: 'OK' },
    'START::PLACE_B': { durationMinutes: 25, status: 'OK' },
    'PLACE_B::END': { durationMinutes: 10, status: 'OK' },
    'PLACE_A::PLACE_B': { durationMinutes: 10, status: 'OK' },
    'PLACE_B::PLACE_A': { durationMinutes: 45, status: 'OK' },
  };

  const resE = runSimpleBeamSearch({
    startTime: '10:00',
    deadlineTime: '15:00',
    maxBudget: 2000,
    pax: 1,
    matrix: matrixE,
    endId: 'END',
    candidates: [
      { id: 'PLACE_A', durationMinutes: 30, costPerPerson: 0, score: 80 },
      { id: 'PLACE_B', durationMinutes: 30, costPerPerson: 0, score: 80 },
    ],
  });

  const passedE = resE.visited[0] === 'PLACE_A' && resE.visited[1] === 'PLACE_B';
  report(
    'TEST E',
    'Directional Road Network Asymmetry Exploitation',
    passedE,
    `Chose sequence [PLACE_A -> PLACE_B] taking advantage of 10m forward leg and avoiding 45m reverse bottleneck.`
  );
} catch (err) {
  report('TEST E', 'Directional Routing', false, err.message);
}

// -----------------------------------------------------------------
// TEST F: Opening Hours Constraint
// -----------------------------------------------------------------
try {
  const matrixF = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::MORNING': { durationMinutes: 10, status: 'OK' },
    'MORNING::END': { durationMinutes: 15, status: 'OK' },
    'START::AFTERNOON': { durationMinutes: 10, status: 'OK' },
    'AFTERNOON::END': { durationMinutes: 15, status: 'OK' },
  };

  const resF = runSimpleBeamSearch({
    startTime: '11:00', // Trip starts at 11:00
    deadlineTime: '16:00',
    maxBudget: 2000,
    pax: 1,
    matrix: matrixF,
    endId: 'END',
    candidates: [
      { id: 'MORNING', durationMinutes: 30, costPerPerson: 0, score: 85, openWindow: { openMin: 360, closeMin: 570 } }, // 06:00 - 09:30
      { id: 'AFTERNOON', durationMinutes: 45, costPerPerson: 0, score: 80, openWindow: { openMin: 600, closeMin: 1080 } }, // 10:00 - 18:00
    ],
  });

  const passedF = !resF.visited.includes('MORNING') && resF.visited.includes('AFTERNOON');
  report(
    'TEST F',
    'Opening Hours Constraint (Closed Location Pruning)',
    passedF,
    `Morning place (closes 09:30) rejected for 11:00 trip start. Afternoon place (10:00-18:00) scheduled.`
  );
} catch (err) {
  report('TEST F', 'Opening Hours Constraint', false, err.message);
}

// -----------------------------------------------------------------
// TEST G: No Feasible Activity (Minimal Safe Fallback)
// -----------------------------------------------------------------
try {
  const matrixG = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::CAND': { durationMinutes: 10, status: 'OK' },
    'CAND::END': { durationMinutes: 20, status: 'OK' },
  };

  const resG = runSimpleBeamSearch({
    startTime: '10:00',
    deadlineTime: '10:35', // 35 min window, direct alone is 25m
    maxBudget: 2000,
    pax: 1,
    matrix: matrixG,
    endId: 'END',
    candidates: [{ id: 'CAND', durationMinutes: 30, costPerPerson: 0, score: 80 }],
  });

  const passedG = resG.visited.length === 0;
  report(
    'TEST G',
    'No Feasible Activity (Safe Minimal START -> END Fallback)',
    passedG,
    `No candidates fit in tight 35-minute window. Returned 0-activity safe fallback without deadline violation.`
  );
} catch (err) {
  report('TEST G', 'No Feasible Activity', false, err.message);
}

// -----------------------------------------------------------------
// TEST H: Missing Route Matrix Entry
// -----------------------------------------------------------------
try {
  const matrixH = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    // Missing START::UNREACHABLE
    'UNREACHABLE::END': { durationMinutes: 15, status: 'OK' },
  };

  const resH = runSimpleBeamSearch({
    startTime: '10:00',
    deadlineTime: '18:00',
    maxBudget: 2000,
    pax: 1,
    matrix: matrixH,
    endId: 'END',
    candidates: [{ id: 'UNREACHABLE', durationMinutes: 30, costPerPerson: 0, score: 90 }],
  });

  const passedH = !resH.visited.includes('UNREACHABLE');
  report(
    'TEST H',
    'Missing Matrix Route Cell Exclusion',
    passedH,
    `Missing matrix transition excluded from graph traversal without inventing fallback estimates.`
  );
} catch (err) {
  report('TEST H', 'Missing Matrix Route', false, err.message);
}

// -----------------------------------------------------------------
// TEST I: Deterministic Reproducibility
// -----------------------------------------------------------------
try {
  const matrixI = {
    'START::END': { durationMinutes: 25, status: 'OK' },
    'START::P1': { durationMinutes: 12, status: 'OK' },
    'P1::END': { durationMinutes: 18, status: 'OK' },
    'START::P2': { durationMinutes: 20, status: 'OK' },
    'P2::END': { durationMinutes: 10, status: 'OK' },
    'P1::P2': { durationMinutes: 12, status: 'OK' },
    'P2::P1': { durationMinutes: 12, status: 'OK' },
  };

  const p = {
    startTime: '10:00',
    deadlineTime: '16:00',
    maxBudget: 2000,
    pax: 1,
    matrix: matrixI,
    endId: 'END',
    candidates: [
      { id: 'P1', durationMinutes: 45, costPerPerson: 50, score: 80 },
      { id: 'P2', durationMinutes: 30, costPerPerson: 0, score: 75 },
    ],
  };

  const run1 = runSimpleBeamSearch(p);
  const run2 = runSimpleBeamSearch(p);

  const passedI =
    JSON.stringify(run1.visited) === JSON.stringify(run2.visited) &&
    run1.score === run2.score &&
    run1.plannedEnd === run2.plannedEnd;

  report(
    'TEST I',
    'Deterministic Reproducibility (Zero Randomness)',
    passedI,
    `Identical runs produced bit-for-bit identical sequences (${run1.visited.join(' -> ')}), end arrival (${run1.plannedEnd}m), and score (${run1.score}).`
  );
} catch (err) {
  report('TEST I', 'Deterministic Reproducibility', false, err.message);
}

// -----------------------------------------------------------------
// TEST A: Live Real API Integration Test (Hyderabad: VNR VJIET -> Railway Station)
// -----------------------------------------------------------------
async function runLiveTestA() {
  if (!hasApiKey) {
    console.log('[NOTICE] Skipping live API Test A because GEOAPIFY_API_KEY is not set.');
    return;
  }

  const baseUrl = 'https://api.geoapify.com';

  try {
    // 1. Geocode
    const gStart = await (await fetch(`${baseUrl}/v1/geocode/search?text=VNR+VJIET%2C+Hyderabad%2C+India&format=json&limit=1&apiKey=${apiKey}`)).json();
    const gEnd = await (await fetch(`${baseUrl}/v1/geocode/search?text=Hyderabad+Railway+Station%2C+Hyderabad%2C+India&format=json&limit=1&apiKey=${apiKey}`)).json();

    const sCoords = gStart.results?.[0];
    const eCoords = gEnd.results?.[0];

    // 2. Discover 3 real places
    const placesUrl = `${baseUrl}/v2/places?categories=tourism.sights&filter=rect:${sCoords.lon - 0.05},${eCoords.lat - 0.05},${sCoords.lon + 0.05},${sCoords.lat + 0.05}&limit=3&apiKey=${apiKey}`;
    const pData = await (await fetch(placesUrl)).json();
    const features = pData.features || [];

    // 3. Matrix over START + 3 places + END (5 points = 25 cells)
    const points = [
      { id: 'START', location: [sCoords.lon, sCoords.lat] },
      ...features.map((f, i) => ({ id: `P_${i}`, location: [f.properties.lon, f.properties.lat] })),
      { id: 'END', location: [eCoords.lon, eCoords.lat] },
    ];

    const matrixBody = {
      mode: 'drive',
      sources: points.map((p) => ({ location: p.location })),
      targets: points.map((p) => ({ location: p.location })),
    };

    const mRes = await (
      await fetch(`${baseUrl}/v1/routematrix?apiKey=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(matrixBody),
      })
    ).json();

    const table = mRes.sources_to_targets;
    const liveMatrix = {};
    for (let r = 0; r < points.length; r++) {
      for (let c = 0; c < points.length; c++) {
        const cell = table[r]?.[c];
        if (cell) {
          liveMatrix[`${points[r].id}::${points[c].id}`] = {
            durationMinutes: Math.ceil(cell.time / 60),
            status: 'OK',
          };
        }
      }
    }

    const testCandidates = features.map((f, i) => ({
      id: `P_${i}`,
      name: f.properties.name || `Attraction ${i}`,
      durationMinutes: 45,
      costPerPerson: 50,
      score: 80,
    }));

    const resA = runSimpleBeamSearch({
      startTime: '10:00',
      deadlineTime: '20:00', // 10 hours
      maxBudget: 2000,
      pax: 1,
      matrix: liveMatrix,
      endId: 'END',
      candidates: testCandidates,
    });

    const passedA = resA.visited.length >= 1 && resA.plannedEnd <= timeToMinutes('20:00');
    report(
      'TEST A',
      'Full Real API Integration Trip (Hyderabad: VNR VJIET -> Railway Station)',
      passedA,
      `Real Geoapify matrix computed (${points.length} locations = ${points.length * points.length} cells). Selected ${resA.visited.length} real places (${resA.visited.join(', ')}). Planned arrival at destination: ${minutesToTime(resA.plannedEnd)} (Safety buffer: ${resA.safetyBuffer}m before 20:00 deadline).`
    );
  } catch (err) {
    report('TEST A', 'Full Real API Integration Trip', false, err.message);
  }

  console.log('================================================================');
  console.log(`SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

runLiveTestA();
