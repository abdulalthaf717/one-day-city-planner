import { TripCopilotEngine } from '../src/copilot/copilotEngine.ts';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

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

async function verifyTwoTurns() {
  const engine = new TripCopilotEngine();

  const constraints = {
    city: 'Hyderabad',
    startingPoint: {
      name: 'VNR VJIET, Bachupally',
      coordinates: { lat: 17.5389, lng: 78.3862 },
      type: 'custom',
    },
    endPoint: {
      name: 'Secunderabad Railway Station',
      coordinates: { lat: 17.4344, lng: 78.5013 },
      type: 'station',
    },
    time: {
      date: '2026-10-06',
      startTime: '09:30',
      latestArrivalTime: '19:00',
    },
    budget: {
      total: 2500,
      currency: '₹',
    },
    travelMode: 'drive',
    interests: [],
    numberOfPeople: 2,
    pace: 'moderate',
  };

  console.log('--- TURN 1 ---');
  const t1Message = "I like historical places, but I don't enjoy crowded attractions. I'd also prefer a relaxed day.";
  const t1Res = await engine.processMessage({
    message: t1Message,
    constraints,
    itinerary: null,
    userPreferences: {
      preferredCategories: [],
      dislikedCategories: [],
      pacePreference: 'moderate',
      crowdPreference: 'moderate',
      notes: [],
    },
  });

  console.log('Turn 1 Reply:\n' + t1Res.reply);
  console.log('Turn 1 Mode:', t1Res.conversationMode);
  console.log('Turn 1 Preferences:', JSON.stringify(t1Res.updatedPreferences, null, 2));
  console.log('Turn 1 Itinerary is null?', t1Res.updatedItinerary === null);

  console.log('\n--- TURN 2 ---');
  const t2Message = "What would you recommend?";
  const history = [
    { id: '1', role: 'user', content: t1Message, timestamp: '09:30' },
    { id: '2', role: 'assistant', content: t1Res.reply, timestamp: '09:30' },
  ];

  const t2Res = await engine.processMessage({
    message: t2Message,
    constraints,
    itinerary: null,
    userPreferences: t1Res.updatedPreferences,
    conversationHistory: history,
  });

  console.log('Turn 2 Reply:\n' + t2Res.reply);
  console.log('Turn 2 Mode:', t2Res.conversationMode);
  console.log('Turn 2 Discussed Place:', t2Res.lastDiscussedPlace);
}

verifyTwoTurns().catch(console.error);
