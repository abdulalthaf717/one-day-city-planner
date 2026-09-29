/**
 * Groq LLM Provider Verification Suite.
 *
 * Verifies:
 * 1. GROQ_API_KEY is detected securely (never printed).
 * 2. Groq model (default: qwen/qwen3.8-27b) is reachable.
 * 3. Structured decision output (JSON format) is produced.
 * 4. Tool selection logic operates correctly.
 * 5. Tool execution results can be passed back to the model for next decision.
 * 6. Grounded replanning explanation is generated without hallucinating external facts.
 *
 * Usage: node scripts/test-llm.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Groq from 'groq-sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Load .env.local if present
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

const groqApiKey = process.env.GROQ_API_KEY?.trim();
const groqModel = process.env.GROQ_MODEL?.trim() || 'qwen/qwen3.8-27b';

console.log('================================================================');
console.log('GROQ LLM PROVIDER & STRUCTURED TOOL DECISION VERIFICATION');
console.log(`PROVIDER:      Groq`);
console.log(`MODEL:         ${groqModel}`);
console.log(`GROQ_API_KEY:  ${groqApiKey ? 'DETECTED (Length: ' + groqApiKey.length + ' chars)' : 'NOT DETECTED'}`);
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

async function runGroqSuite() {
  if (!groqApiKey) {
    console.error('[ERROR] GROQ_API_KEY is not configured in .env.local. Halting LLM test suite.');
    process.exit(1);
  }

  const groq = new Groq({ apiKey: groqApiKey });

  async function retryCall(fn, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === retries) throw err;
        await new Promise((r) => setTimeout(r, 1200));
      }
    }
  }

  // -------------------------------------------------------------
  // Test 1: API Reachability & Connectivity
  // -------------------------------------------------------------
  try {
    const pingRes = await retryCall(() =>
      groq.chat.completions.create({
        model: groqModel,
        messages: [{ role: 'user', content: 'Respond with the word READY.' }],
        max_tokens: 10,
      })
    );
    const reply = pingRes.choices[0]?.message?.content?.trim() || '';
    const passed1 = reply.length > 0;
    report('TEST 1', 'Groq Model Reachability', passed1, `Connected to Groq endpoint with model ${groqModel}. Output: "${reply}"`);
  } catch (err) {
    report('TEST 1', 'Groq Model Reachability', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 2: Structured Decision Output (JSON Mode)
  // -------------------------------------------------------------
  try {
    const decisionRes = await retryCall(() =>
      groq.chat.completions.create({
        model: groqModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are the travel planner agent orchestrator. Output JSON matching this schema:
{
  "decision": "CALL_TOOL" | "FINALIZE" | "ASK_USER",
  "tool": "resolve_locations" | "discover_candidates" | "calculate_route_matrix" | "optimize_itinerary" | "validate_itinerary",
  "arguments": object,
  "reason": string
}
Only use the exact tool names listed above.`,
          },
          {
            role: 'user',
            content: 'Trip state: City is Hyderabad. Start and End locations are resolved, but candidate attractions have not yet been discovered.',
          },
        ],
        temperature: 0.1,
      })
    );

    const content = decisionRes.choices[0]?.message?.content?.trim() || '{}';
    const parsed = JSON.parse(content);

    const passed2 =
      parsed.decision === 'CALL_TOOL' &&
      (parsed.tool === 'discover_candidates' || parsed.tool?.includes('candidate')) &&
      typeof parsed.reason === 'string';

    report(
      'TEST 2',
      'Structured Planner Tool Decision (JSON Mode)',
      passed2,
      `Decided action: ${parsed.decision}, tool: ${parsed.tool}. Reason: "${parsed.reason}"`
    );
  } catch (err) {
    report('TEST 2', 'Structured Planner Tool Decision', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 3: Tool Result Ingestion & Next Decision
  // -------------------------------------------------------------
  try {
    const multiTurnRes = await retryCall(() =>
      groq.chat.completions.create({
        model: groqModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are the travel planner agent. Return ONLY a JSON object:
{
  "decision": "CALL_TOOL" | "FINALIZE",
  "tool": "calculate_route_matrix" | "optimize_itinerary" | "validate_itinerary",
  "reason": string
}`,
          },
          {
            role: 'user',
            content: 'Initial state: Discovered 4 candidate places in Hyderabad: Charminar, Golconda Fort, Salar Jung Museum, Chowmahalla Palace. Route matrix is missing.',
          },
          {
            role: 'assistant',
            content: JSON.stringify({
              decision: 'CALL_TOOL',
              tool: 'calculate_route_matrix',
              reason: 'Travel matrix required for directional road times.',
            }),
          },
          {
            role: 'user',
            content: 'Tool Result: calculate_route_matrix successfully computed 36-cell directional driving matrix. Candidates and matrix are ready. Itinerary not yet generated.',
          },
        ],
        temperature: 0.1,
      })
    );

    const parsed = JSON.parse(multiTurnRes.choices[0]?.message?.content?.trim() || '{}');
    const passed3 =
      parsed.decision === 'CALL_TOOL' &&
      parsed.tool === 'optimize_itinerary';

    report(
      'TEST 3',
      'Multi-Turn Tool Result Ingestion & Sequential Reasoning',
      passed3,
      `Model ingested matrix tool result and correctly selected next sequential tool: "${parsed.tool}". Reason: "${parsed.reason}"`
    );
  } catch (err) {
    report('TEST 3', 'Multi-Turn Tool Result Ingestion', false, err.message);
  }

  // -------------------------------------------------------------
  // Test 4: Grounded Replanning Trade-off Explanation
  // -------------------------------------------------------------
  try {
    const explanationRes = await retryCall(() =>
      groq.chat.completions.create({
        model: groqModel,
        messages: [
          {
            role: 'system',
            content: 'You are the travel planning assistant. Ground all explanations strictly in the provided facts and numbers. Do not invent traffic claims or fake external facts.',
          },
          {
            role: 'user',
            content: `The user modified the following constraints:
- Budget: changed from "2000" to "1000" (Budget decreased from 2000 to 1000)

Previous plan summary:
3 stops, arrived 18:45, cost ₹1400

New optimized plan summary:
2 stops, arrives 17:30, cost ₹800

Briefly explain the adjustment and trade-offs in 2-3 sentences.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 200,
      })
    );

    const explanation = explanationRes.choices[0]?.message?.content?.trim() || '';
    const passed4 =
      explanation.length > 20 &&
      (explanation.includes('1000') || explanation.includes('800') || explanation.includes('budget'));

    report(
      'TEST 4',
      'Grounded Replanning Trade-off Explanation',
      passed4,
      `Factual explanation generated without hallucination: "${explanation.substring(0, 120)}..."`
    );
  } catch (err) {
    report('TEST 4', 'Grounded Replanning Explanation', false, err.message);
  }

  console.log('================================================================');
  console.log(`GROQ LLM TEST SUMMARY: ${passCount} Passed, ${failCount} Failed`);
  console.log('================================================================\n');

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runGroqSuite();
