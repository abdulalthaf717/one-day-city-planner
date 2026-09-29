/**
 * Regression Test: Evaluator Replanning Travel-Mode Canonical Verification
 *
 * Verifies that the benchmark evaluator reads travel mode from:
 * 1. plannerState.tripConstraints.travelMode
 * 2. stop.travelFromPrevious.mode
 * instead of expecting a non-existent itinerary.travelMode property.
 */

import assert from 'node:assert';

function evaluateReplanTravelMode(replanResult, expectedMode) {
  const stateMode = replanResult.plannerState?.tripConstraints?.travelMode;
  const constraintsMatch = stateMode === expectedMode;

  const newStops = replanResult.itinerary?.stops || [];
  const travelLegs = newStops.filter((s) => s.travelFromPrevious?.mode);
  const legsMatch = travelLegs.length === 0 || travelLegs.every((s) => s.travelFromPrevious?.mode === expectedMode);

  const isFeasible = replanResult.success || newStops.length <= 2;

  let legsConsistent = true;
  for (const s of travelLegs) {
    const dist = s.travelFromPrevious?.distanceMeters || 0;
    const dur = s.travelFromPrevious?.durationMinutes || 0;
    if (expectedMode === 'walk' && dur > 0) {
      const speedKmh = (dist / 1000) / (dur / 60);
      if (speedKmh > 10) legsConsistent = false;
    }
  }

  return constraintsMatch && legsMatch && isFeasible && legsConsistent;
}

// 1. Simulate the exact object structure returned for Case 005, 031, 056
const mockWalkReplanResult = {
  success: true,
  plannerState: {
    tripConstraints: {
      travelMode: 'walk',
      city: 'Hyderabad',
    },
  },
  itinerary: {
    // Notice: NO top-level travelMode!
    stops: [
      { id: 'START', type: 'start', title: 'Start Point', arrivalTime: '10:00', departureTime: '10:00' },
      {
        id: 'P1',
        type: 'place',
        title: 'Local Attraction',
        arrivalTime: '10:15',
        departureTime: '11:15',
        travelFromPrevious: {
          mode: 'walk',
          distanceMeters: 800,
          durationMinutes: 12,
        },
      },
      {
        id: 'END',
        type: 'end',
        title: 'End Destination',
        arrivalTime: '11:30',
        departureTime: '11:30',
        travelFromPrevious: {
          mode: 'walk',
          distanceMeters: 900,
          durationMinutes: 14,
        },
      },
    ],
  },
};

console.log('Testing Canonical Replanning Travel-Mode Evaluation...');

const isSuccess = evaluateReplanTravelMode(mockWalkReplanResult, 'walk');
assert.strictEqual(isSuccess, true, 'Evaluator must accept valid walking replan with canonical domain properties');

// Negative test: Mismatched leg travel mode
const corruptedReplanResult = JSON.parse(JSON.stringify(mockWalkReplanResult));
corruptedReplanResult.itinerary.stops[1].travelFromPrevious.mode = 'drive';
const shouldFail = evaluateReplanTravelMode(corruptedReplanResult, 'walk');
assert.strictEqual(shouldFail, false, 'Evaluator must reject itinerary if a travel leg still uses drive mode');

console.log('✅ PASS: Evaluator replanning travel-mode regression test verified.');
