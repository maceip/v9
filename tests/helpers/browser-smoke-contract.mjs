import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const contractsDir = join(__dirname, '..', 'contracts');
const schemaPath = join(contractsDir, 'browser-smoke-contract.schema.v1.json');
const contractPath = join(contractsDir, 'browser-smoke-contract.v1.json');

function ensure(condition, message) {
  if (!condition) {
    throw new Error(`Browser smoke contract invalid: ${message}`);
  }
}

function parseDate(dateStr) {
  const ms = Date.parse(`${dateStr}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : NaN;
}

function todayUtcStartMs() {
  const todayUtc = new Date().toISOString().slice(0, 10);
  return Date.parse(`${todayUtc}T00:00:00Z`);
}

export async function loadBrowserSmokeContract() {
  const [schemaRaw, contractRaw] = await Promise.all([
    readFile(schemaPath, 'utf8'),
    readFile(contractPath, 'utf8'),
  ]);
  const schema = JSON.parse(schemaRaw);
  const contract = JSON.parse(contractRaw);
  validateBrowserSmokeContract(contract, schema);
  return contract;
}

export function validateBrowserSmokeContract(contract, schema = {}) {
  ensure(contract && typeof contract === 'object', 'contract must be an object');
  const schemaVersion = schema?.properties?.schemaVersion?.const ?? 1;
  ensure(contract.schemaVersion === schemaVersion, `schemaVersion must be ${schemaVersion}`);

  const defaults = contract.defaults || {};
  ensure(typeof defaults.baseUrl === 'string' && defaults.baseUrl.length > 0, 'defaults.baseUrl is required');
  ensure(Number.isInteger(defaults.protocolTimeoutMs) && defaults.protocolTimeoutMs > 0, 'defaults.protocolTimeoutMs must be > 0');
  ensure(Number.isInteger(defaults.navigationTimeoutMs) && defaults.navigationTimeoutMs > 0, 'defaults.navigationTimeoutMs must be > 0');
  ensure(Number.isInteger(defaults.smokeRenderWaitMs) && defaults.smokeRenderWaitMs > 0, 'defaults.smokeRenderWaitMs must be > 0');
  ensure(Number.isInteger(defaults.interactiveRenderWaitMs) && defaults.interactiveRenderWaitMs > 0, 'defaults.interactiveRenderWaitMs must be > 0');

  ensure(Array.isArray(contract.scenarios) && contract.scenarios.length > 0, 'scenarios must be a non-empty array');
  const ids = new Set();
  const names = new Set();
  const today = todayUtcStartMs();

  for (const scenario of contract.scenarios) {
    ensure(typeof scenario.id === 'string' && scenario.id.length > 0, 'scenario.id is required');
    ensure(!ids.has(scenario.id), `scenario.id must be unique: ${scenario.id}`);
    ids.add(scenario.id);

    ensure(typeof scenario.displayName === 'string' && scenario.displayName.length > 0, `displayName is required for ${scenario.id}`);
    ensure(!names.has(scenario.displayName), `displayName must be unique: ${scenario.displayName}`);
    names.add(scenario.displayName);

    ensure(typeof scenario.bundlePath === 'string' && /^\/dist\/.+\.js$/.test(scenario.bundlePath), `${scenario.id} bundlePath must look like /dist/*.js`);
    ensure(Array.isArray(scenario.cliMarkers) && scenario.cliMarkers.length > 0, `${scenario.id} cliMarkers must be non-empty`);
    ensure(Array.isArray(scenario.allowlistedRejectionSubstrings), `${scenario.id} allowlistedRejectionSubstrings must be an array`);
    ensure(Array.isArray(scenario.knownSkips), `${scenario.id} knownSkips must be an array`);

    const budgets = scenario.phaseBudgetsMs || {};
    for (const key of ['smokeLoad', 'smokeRender', 'interactiveLoad', 'interactiveRender']) {
      ensure(Number.isInteger(budgets[key]) && budgets[key] > 0, `${scenario.id} phaseBudgetsMs.${key} must be > 0`);
    }

    for (const skip of scenario.knownSkips) {
      ensure(typeof skip.code === 'string' && skip.code.length > 0, `${scenario.id} knownSkip.code is required`);
      ensure(['smoke', 'interactivity', 'all'].includes(skip.scope), `${scenario.id} knownSkip.scope must be smoke|interactivity|all`);
      ensure(typeof skip.matchSubstring === 'string' && skip.matchSubstring.length > 0, `${scenario.id} knownSkip.matchSubstring is required`);
      ensure(typeof skip.issueUrl === 'string' && /^https?:\/\//.test(skip.issueUrl), `${scenario.id} knownSkip.issueUrl must be http(s)`);
      ensure(typeof skip.expiresOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(skip.expiresOn), `${scenario.id} knownSkip.expiresOn must be YYYY-MM-DD`);
      ensure(parseDate(skip.expiresOn) >= today, `${scenario.id} knownSkip ${skip.code} is expired (${skip.expiresOn})`);
    }
  }

  const conversation = contract.conversation || {};
  ensure(typeof conversation.scenarioId === 'string' && conversation.scenarioId.length > 0, 'conversation.scenarioId is required');
  ensure(ids.has(conversation.scenarioId), `conversation.scenarioId must reference an existing scenario: ${conversation.scenarioId}`);
  ensure(typeof conversation.requiredEnvKey === 'string' && conversation.requiredEnvKey.length > 0, 'conversation.requiredEnvKey is required');
  ensure(typeof conversation.prompt === 'string' && conversation.prompt.length > 0, 'conversation.prompt is required');
  ensure(Number.isInteger(conversation.responseWaitMs) && conversation.responseWaitMs > 0, 'conversation.responseWaitMs must be > 0');
}

export function getScenarioByDisplayName(contract, displayName) {
  return contract.scenarios.find((s) => s.displayName === displayName) || null;
}

export function shouldSkipForKnownIssue(scenario, scope, message) {
  if (!scenario || !Array.isArray(scenario.knownSkips)) {
    return null;
  }
  const text = String(message || '');
  for (const skip of scenario.knownSkips) {
    if (!(skip.scope === scope || skip.scope === 'all')) {
      continue;
    }
    if (text.includes(skip.matchSubstring)) {
      return skip;
    }
  }
  return null;
}
