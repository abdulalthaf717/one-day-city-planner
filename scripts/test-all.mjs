/**
 * Master Verification Test Suite (test:all).
 *
 * Sequentially executes all 7 unit, integration, agent, multimodal, and evaluation suites:
 * 1. test:tools       (Geoapify live API, route matrix, directional routing)
 * 2. test:candidates  (Candidate discovery, filtering, scoring)
 * 3. test:optimizer   (Beam search, time windows, safety buffers, 14 hard constraints)
 * 4. test:agent       (Planner Agent orchestration, state transitions, surgical invalidation)
 * 5. test:llm         (Groq API live tool calling with qwen/qwen3.8-27b)
 * 6. test:vision      (Multimodal image recognition, verification, feasibility check)
 * 7. test:evaluation  (20 benchmark scenarios, 5 recovery test cases, 12 rubric metrics)
 *
 * Usage: npm run test:all  or  node scripts/test-all.mjs
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const suites = [
  { name: '1. Tools & Geoapify API', script: 'scripts/test-tools.mjs' },
  { name: '2. Candidate Place Discovery', script: 'scripts/test-candidates.mjs' },
  { name: '3. Deterministic Optimizer & Validator', script: 'scripts/test-optimizer.mjs' },
  { name: '4. Planner Agent & Replanning', script: 'scripts/test-agent.mjs' },
  { name: '5. Groq LLM Tool Calling', script: 'scripts/test-llm.mjs' },
  { name: '6. Multimodal Vision & Verification', script: 'scripts/test-vision.mjs' },
  { name: '7. Comprehensive Evaluation Benchmark', script: 'scripts/test-evaluation.mjs' },
];

async function runCommand(scriptPath) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const proc = spawn('node', [scriptPath], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('close', (code) => {
      const durationMs = Math.round(performance.now() - t0);
      resolve({ code, durationMs });
    });
  });
}

async function runMasterSuite() {
  console.log('================================================================');
  console.log('ONE-DAY CITY PLANNER: MASTER TEST SUITE (npm run test:all)');
  console.log('RUNNING ALL 7 TEST SUITES SEQUENTIALLY');
  console.log('================================================================\n');

  const results = [];
  let overallPass = true;

  for (const suite of suites) {
    console.log(`\n>>> STARTING SUITE: ${suite.name} (${suite.script})`);
    console.log('----------------------------------------------------------------');
    const { code, durationMs } = await runCommand(suite.script);
    const passed = code === 0;
    if (!passed) overallPass = false;
    results.push({ name: suite.name, script: suite.script, passed, code, durationMs });
    // Brief pause to allow sockets and child processes to cleanly flush on Windows
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log('\n================================================================');
  console.log('MASTER TEST SUITE EXECUTION SUMMARY');
  console.log('================================================================');
  console.log(
    'SUITE'.padEnd(45) +
    'DURATION'.padEnd(12) +
    'STATUS'
  );
  console.log('----------------------------------------------------------------');

  results.forEach((r) => {
    const status = r.passed ? '[PASS]' : `[FAIL - exit code ${r.code}]`;
    const dur = `${r.durationMs}ms`;
    console.log(r.name.padEnd(45) + dur.padEnd(12) + status);
  });

  console.log('================================================================');
  if (overallPass) {
    console.log('OVERALL RESULT: ALL 7 TEST SUITES PASSED (100% SUCCESS)\n');
    process.exit(0);
  } else {
    console.log('OVERALL RESULT: ONE OR MORE SUITES FAILED\n');
    process.exit(1);
  }
}

runMasterSuite();
