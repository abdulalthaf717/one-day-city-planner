/**
 * Dataset Ingestion & Validation Script (Phase 1)
 *
 * Validates:
 * - development-78.json vs development-78.csv
 * - holdout-22.json vs holdout-22.csv
 * - Exactly 78 dev cases, 22 holdout cases, 100 total
 * - No duplicate case IDs
 * - Required schema fields
 * - Generates test-dataset/validated-dataset-report.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const datasetDir = path.join(rootDir, 'test-dataset');

const devJsonPath = path.join(datasetDir, 'development-78.json');
const devCsvPath = path.join(datasetDir, 'development-78.csv');
const holdoutJsonPath = path.join(datasetDir, 'holdout-22.json');
const holdoutCsvPath = path.join(datasetDir, 'holdout-22.csv');
const reportPath = path.join(datasetDir, 'validated-dataset-report.json');

console.log('================================================================');
console.log('PHASE 1: DATASET INGESTION & CONSISTENCY VALIDATION');
console.log('================================================================\n');

// 1. Read JSON files
const devJson = JSON.parse(fs.readFileSync(devJsonPath, 'utf8'));
const holdoutJson = JSON.parse(fs.readFileSync(holdoutJsonPath, 'utf8'));

// 2. CSV parser that handles quoted commas and detects header presence
function parseCsv(content, fallbackHeaders = null) {
  const lines = content.trim().split('\n');
  if (lines.length === 0) return [];
  const firstLine = lines[0].trim();
  const hasHeader = firstLine.toLowerCase().startsWith('case_id');

  const headers = hasHeader ? parseCsvLine(lines[0]) : fallbackHeaders;
  const startIdx = hasHeader ? 1 : 0;
  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const values = parseCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h.trim()] = values[idx] !== undefined ? values[idx].trim() : '';
    });
    rows.push(obj);
  }
  return rows;
}

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const devHeaders = parseCsvLine(fs.readFileSync(devCsvPath, 'utf8').split('\n')[0]);
const devCsv = parseCsv(fs.readFileSync(devCsvPath, 'utf8'));
const holdoutCsv = parseCsv(fs.readFileSync(holdoutCsvPath, 'utf8'), devHeaders);

const totalDevCases = devJson.length;
const totalHoldoutCases = holdoutJson.length;
const totalCases = totalDevCases + totalHoldoutCases;

console.log(`Development Cases (JSON): ${totalDevCases}`);
console.log(`Development Cases (CSV):  ${devCsv.length}`);
console.log(`Holdout Cases (JSON):     ${totalHoldoutCases}`);
console.log(`Holdout Cases (CSV):      ${holdoutCsv.length}`);
console.log(`Total Combined Cases:     ${totalCases}\n`);

// Checks
const errors = [];
if (totalDevCases !== 78) errors.push(`Expected exactly 78 development cases in JSON, found ${totalDevCases}`);
if (devCsv.length !== 78) errors.push(`Expected exactly 78 development cases in CSV, found ${devCsv.length}`);
if (totalHoldoutCases !== 22) errors.push(`Expected exactly 22 holdout cases in JSON, found ${totalHoldoutCases}`);
if (holdoutCsv.length !== 22) errors.push(`Expected exactly 22 holdout cases in CSV, found ${holdoutCsv.length}`);
if (totalCases !== 100) errors.push(`Expected exactly 100 total cases, found ${totalCases}`);

// Check unique IDs
const idSet = new Set();
const duplicateIds = [];
[...devJson, ...holdoutJson].forEach((item) => {
  const id = item.case_id?.toString().trim();
  if (!id) errors.push('Found item with missing or empty case_id');
  if (idSet.has(id)) duplicateIds.push(id);
  idSet.add(id);
});
if (duplicateIds.length > 0) errors.push(`Duplicate case IDs found: ${duplicateIds.join(', ')}`);

// Required Fields Check
const requiredFields = [
  'case_id',
  'city',
  'difficulty',
  'scenario_description',
  'start_point',
  'end_point',
  'start_time',
  'latest_end_time',
  'budget_inr',
  'number_of_people',
  'travel_mode',
  'interests',
];

const missingFieldItems = [];
[...devJson, ...holdoutJson].forEach((item) => {
  for (const f of requiredFields) {
    if (item[f] === undefined || item[f] === null || item[f] === '') {
      missingFieldItems.push({ id: item.case_id, field: f });
    }
  }
});
if (missingFieldItems.length > 0) {
  errors.push(`Missing required fields in ${missingFieldItems.length} instances`);
}

// Consistency Check between JSON & CSV
const devMismatch = [];
devJson.forEach((jItem, idx) => {
  const cItem = devCsv[idx];
  if (!cItem || jItem.case_id !== cItem.case_id) {
    devMismatch.push(`Case ID mismatch at index ${idx}: JSON ${jItem.case_id} vs CSV ${cItem?.case_id}`);
  }
});
if (devMismatch.length > 0) errors.push(...devMismatch);

// Distributions
const cityDist = {};
const diffDist = {};
let changeScenarioCount = 0;
let multimodalCount = 0;
let failureEdgeCount = 0;

[...devJson, ...holdoutJson].forEach((item) => {
  cityDist[item.city] = (cityDist[item.city] || 0) + 1;
  diffDist[item.difficulty] = (diffDist[item.difficulty] || 0) + 1;
  if (item.change_scenario && item.change_scenario !== 'NA' && typeof item.change_scenario === 'object') {
    changeScenarioCount++;
  } else if (item.change_scenario && item.change_scenario !== 'NA' && typeof item.change_scenario === 'string') {
    changeScenarioCount++;
  }
  if (item.multimodal && item.multimodal !== 'NA') multimodalCount++;
  if (item.failure_edge && item.failure_edge !== 'NA') failureEdgeCount++;
});

console.log('City Distribution:', cityDist);
console.log('Difficulty Distribution:', diffDist);
console.log(`Change Scenarios:     ${changeScenarioCount}`);
console.log(`Multimodal Cases:     ${multimodalCount}`);
console.log(`Failure/Edge Cases:   ${failureEdgeCount}\n`);

const report = {
  timestamp: new Date().toISOString(),
  validation_status: errors.length === 0 ? 'PASSED' : 'FAILED',
  summary: {
    total_cases: totalCases,
    development_count: totalDevCases,
    holdout_count: totalHoldoutCases,
    unique_ids_count: idSet.size,
  },
  distributions: {
    city_distribution: cityDist,
    difficulty_distribution: diffDist,
    change_scenarios: changeScenarioCount,
    multimodal_cases: multimodalCount,
    failure_edge_cases: failureEdgeCount,
  },
  integrity_checks: {
    exact_78_dev_cases: totalDevCases === 78 && devCsv.length === 78,
    exact_22_holdout_cases: totalHoldoutCases === 22 && holdoutCsv.length === 22,
    exact_100_total_cases: totalCases === 100,
    no_duplicate_case_ids: duplicateIds.length === 0,
    required_fields_present: missingFieldItems.length === 0,
    json_csv_consistent: devMismatch.length === 0,
  },
  errors,
};

fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
console.log(`[REPORT SAVED] ${reportPath}`);

if (errors.length > 0) {
  console.error('\nVALIDATION FAILED WITH ERRORS:');
  errors.forEach((e) => console.error(`- ${e}`));
  process.exit(1);
} else {
  console.log('\nPHASE 1 VALIDATION SUCCESSFUL: All 100 test cases verified and consistent.');
}
