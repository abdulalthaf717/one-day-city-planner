import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local
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

import { PlannerAgent } from '../src/agent/plannerAgent.ts';

async function diagnose() {
  const agent = new PlannerAgent();
  const constraints = {
    city: 'Hyderabad',
    startingPoint: { name: 'VNRVJIET', address: 'VNRVJIET, Hyderabad', coordinates: { lat: 17.5389, lng: 78.3846 } },
    endPoint: { name: 'Secunderabad Railway Station', address: 'Secunderabad Railway Station, Hyderabad', coordinates: { lat: 17.4344, lng: 78.5013 } },
    time: { date: '2026-10-01', startTime: '09:30', latestArrivalTime: '19:00' },
    budget: { currency: 'INR', total: 2500 },
    numberOfPeople: 2,
    travelMode: 'drive',
    interests: []
  };

  console.log('--- RUNNING PLANNER AGENT ---');
  const result = await agent.planTrip(constraints);

  console.log('\n================================================================');
  console.log('PART 7 — HYDERABAD VERIFICATION RUN');
  console.log('================================================================');
  console.log('1. Selected Stops:');
  for (const s of (result.itinerary?.stops || [])) {
    console.log(`   - ${s.name || s.title} (${s.type}): Arrival ${s.arrivalTime} -> Departure ${s.departureTime} (visit: ${s.durationMinutes}m, travelFromPrev: ${s.travelFromPreviousMinutes ?? 0}m)`);
  }
  console.log('2. Planned End Arrival:      ', result.itinerary?.summary.plannedArrivalTime, `(${result.itinerary?.summary.plannedEndArrivalMinutes}m)`);
  console.log('3. safetyBufferMinutes:      ', result.itinerary?.summary.safetyBufferMinutes, 'minutes (deliberate reserve)');
  console.log('4. unusedAvailableMinutes:   ', result.itinerary?.summary.unusedAvailableMinutes, 'minutes (free capacity after buffer)');
  console.log('5. Total Travel Time:        ', result.itinerary?.summary.totalTravelTimeMinutes, 'minutes');
  console.log('6. Total Visit Time:         ', result.itinerary?.summary.totalActivityTimeMinutes, 'minutes');
  console.log('7. Candidate Count:          ', result.plannerState?.candidates.length);
  console.log('8. Rejected Candidates:');
  const visitedIds = new Set(result.itinerary?.stops.map(s => s.placeId).filter(Boolean));
  for (const c of (result.plannerState?.candidates || [])) {
    if (!visitedIds.has(c.id)) {
      console.log(`   - ${c.name} (${c.category}, Score: ${c.candidateScore}, Rel: ${c.touristRelevanceScore ?? 'N/A'}): Not selected in optimal path`);
    }
  }
  console.log('9. Objective Score Breakdown:');
  console.log(JSON.stringify(result.itinerary?.scoreBreakdown, null, 2));
  console.log('Final Objective Score:       ', result.itinerary?.score);
  console.log('================================================================\n');

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
