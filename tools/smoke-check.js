#!/usr/bin/env node
// tools/smoke-check.js — deterministic, dependency-free sanity checks.
//
// This is NOT a test framework and does not exercise any runtime logic
// (no FIFO math, no API calls, nothing live). It only checks things that
// are true or false by inspecting the source files on disk:
//   1. Syntax integrity      — every js/*.js file and AppScript_FULL.gs parse cleanly.
//   2. Critical functions    — the handful of entry points the app cannot run without exist.
//   3. Duplicate functions   — no top-level function in AppScript_FULL.gs is defined twice
//                              (Apps Script silently lets the last one win — see the
//                              2026-08-14 maintenance pass in docs/TECHNICAL_DEBT.md).
//   4. Config sanity         — AUTH_DISABLED agrees across all three files that define it,
//                              and sw.js's cache name agrees with version.json.
//
// Usage: node tools/smoke-check.js   (exit 0 = all passed, 1 = at least one failed)

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let failures = 0;

function ok(label) { console.log('  ✓ ' + label); }
function fail(label, detail) {
  failures++;
  console.log('  ✗ ' + label + (detail ? ' — ' + detail : ''));
}

function readFile(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── 1. Syntax integrity ──────────────────────────────────────────────
console.log('\n[1/4] Syntax integrity');

const jsDir = path.join(ROOT, 'js');
const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js')).sort();
for (const f of jsFiles) {
  const src = readFile(path.join('js', f));
  try {
    new vm.Script(src, { filename: 'js/' + f });
    ok('js/' + f);
  } catch (e) {
    fail('js/' + f, e.message);
  }
}

for (const f of ['AppScript_FULL.gs', 'AppScript_PATCH.gs']) {
  const src = readFile(f);
  try {
    // Apps Script executes in a non-strict, non-module global scope —
    // vm.Script matches that (unlike node --check on a .mjs file, which
    // wrongly rejects legitimate GAS patterns like repeated var/function
    // declarations across the concatenated project).
    new vm.Script(src, { filename: f });
    ok(f);
  } catch (e) {
    fail(f, e.message);
  }
}

// ── 2. Critical function existence ───────────────────────────────────
console.log('\n[2/4] Critical function existence');

const CRITICAL_GS_FUNCTIONS = [
  'doGet', 'doPost', 'applyFIFO_', 'handleGetPrices_', 'handleLogin_',
  'validateToken_', 'handleGetOperations_', 'mergePositionMeta_',
  'mergeTradeMeta_',
];
const gsSrc = readFile('AppScript_FULL.gs');
for (const name of CRITICAL_GS_FUNCTIONS) {
  const re = new RegExp('^function ' + name + '\\s*\\(', 'm');
  if (re.test(gsSrc)) ok('AppScript_FULL.gs defines ' + name + '()');
  else fail('AppScript_FULL.gs missing ' + name + '()');
}

const CRITICAL_FRONTEND = [
  { file: 'js/utils.js', pattern: /calcStats\s*[:(]/, label: 'utils.js defines calcStats' },
  { file: 'js/api.js', pattern: /const API_URL\s*=/, label: 'api.js defines API_URL' },
  { file: 'js/auth.js', pattern: /AUTH_DISABLED\s*=/, label: 'auth.js defines AUTH_DISABLED' },
];
for (const c of CRITICAL_FRONTEND) {
  if (c.pattern.test(readFile(c.file))) ok(c.label);
  else fail(c.label + ' — NOT FOUND');
}

// ── 3. Duplicate top-level function detection (AppScript_FULL.gs) ────
console.log('\n[3/4] Duplicate top-level function detection');

const fnNames = [...gsSrc.matchAll(/^function\s+([a-zA-Z0-9_]+)\s*\(/gm)].map(m => m[1]);
const counts = {};
for (const n of fnNames) counts[n] = (counts[n] || 0) + 1;
const dupes = Object.entries(counts).filter(([, c]) => c > 1);
if (dupes.length === 0) {
  ok('0 duplicate top-level function names in AppScript_FULL.gs (' + fnNames.length + ' total)');
} else {
  fail('duplicate top-level functions found', dupes.map(([n, c]) => n + ' x' + c).join(', '));
}

// ── 4. Configuration sanity ──────────────────────────────────────────
console.log('\n[4/4] Configuration sanity');

function extractAuthDisabled(src) {
  const m = src.match(/AUTH_DISABLED\s*=\s*(true|false)/);
  return m ? m[1] : null;
}
const authValues = {
  'js/auth.js': extractAuthDisabled(readFile('js/auth.js')),
  'js/api.js': extractAuthDisabled(readFile('js/api.js')),
  'AppScript_FULL.gs': extractAuthDisabled(gsSrc),
};
const distinctAuthValues = new Set(Object.values(authValues));
if (distinctAuthValues.size === 1 && !distinctAuthValues.has(null)) {
  ok('AUTH_DISABLED = ' + [...distinctAuthValues][0] + ' consistently across ' + Object.keys(authValues).join(', '));
} else {
  fail('AUTH_DISABLED disagrees across files', JSON.stringify(authValues));
}

try {
  const versionJson = JSON.parse(readFile('version.json'));
  const swSrc = readFile('sw.js');
  const m = swSrc.match(/const BUILD_CACHE\s*=\s*'([^']+)'/);
  const swCache = m ? m[1] : null;
  if (swCache && swCache === versionJson.cache) {
    ok('sw.js BUILD_CACHE matches version.json cache (' + swCache + ')');
  } else {
    fail('sw.js BUILD_CACHE / version.json cache mismatch', 'sw.js=' + swCache + ' version.json=' + versionJson.cache);
  }
} catch (e) {
  fail('version.json / sw.js cache check', e.message);
}

const apiUrlMatch = readFile('js/api.js').match(/const API_URL\s*=\s*'([^']+)'/);
if (apiUrlMatch && /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(apiUrlMatch[1])) {
  ok('API_URL is a well-formed Apps Script exec URL');
} else {
  fail('API_URL missing or malformed', apiUrlMatch ? apiUrlMatch[1] : '(not found)');
}

// ── Summary ───────────────────────────────────────────────────────────
console.log('\n' + (failures === 0
  ? '✓ All smoke checks passed.'
  : '✗ ' + failures + ' smoke check(s) failed.'));
process.exit(failures === 0 ? 0 : 1);
