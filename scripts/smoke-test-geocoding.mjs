/**
 * Smoke test for Geoapify geocoding with hard timeout and timing metrics.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const envPath = path.join(rootDir, '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      const key = k.trim();
      const val = rest.join('=').trim();
      if (key && !process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

import { GeoapifyClient } from '../src/services/geoapify/client.ts';
import { geocodeLocation } from '../src/services/geoapify/geocoding.ts';

async function runSmokeTest() {
  console.log('====================================================');
  console.log('GEOAPIFY GEOCODING SMOKE TEST (WITH 10s HARD TIMEOUT)');
  console.log('====================================================\n');

  const client = new GeoapifyClient();

  // Test 1: Bengaluru
  console.log('1. Starting Bengaluru geocode (Cubbon Park)...');
  const t0 = performance.now();
  let blr;
  try {
    blr = await geocodeLocation(client, { city: 'Bengaluru', locationText: 'Cubbon Park' });
  } catch (err) {
    blr = { success: false, message: err.message };
  }
  const blrDurationMs = Math.round(performance.now() - t0);
  console.log(`   Duration: ${blrDurationMs}ms`);
  console.log(`   Result:   ${blr.success ? blr.formattedAddress : JSON.stringify(blr)}`);
  console.log('');

  // Test 2: Chennai
  console.log('2. Starting Chennai geocode (Marina Beach)...');
  const t1 = performance.now();
  let chn;
  try {
    chn = await geocodeLocation(client, { city: 'Chennai', locationText: 'Marina Beach' });
  } catch (err) {
    chn = { success: false, message: err.message };
  }
  const chnDurationMs = Math.round(performance.now() - t1);
  console.log(`   Duration: ${chnDurationMs}ms`);
  console.log(`   Result:   ${chn.success ? chn.formattedAddress : JSON.stringify(chn)}`);
  console.log('');

  console.log('====================================================');
  console.log(`Bengaluru Success: ${blr.success ? 'YES' : 'NO'} (${blrDurationMs}ms)`);
  console.log(`Chennai Success:   ${chn.success ? 'YES' : 'NO'} (${chnDurationMs}ms)`);
  console.log('SMOKE TEST PROCESS TERMINATING CLEANLY (Exit 0)');
  console.log('====================================================');

  process.exit(0);
}

runSmokeTest();
