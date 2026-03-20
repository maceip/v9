// Auto-generated ESM wrapper for node:cluster
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('cluster');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('cluster');
  _defaultExport = mod;
  SCHED_NONE = mod.SCHED_NONE;
  SCHED_RR = mod.SCHED_RR;
  Worker = mod.Worker;
  disconnect = mod.disconnect;
  fork = mod.fork;
  isMaster = mod.isMaster;
  isPrimary = mod.isPrimary;
  isWorker = mod.isWorker;
  schedulingPolicy = mod.schedulingPolicy;
  settings = mod.settings;
  setupMaster = mod.setupMaster;
  setupPrimary = mod.setupPrimary;
  workers = mod.workers;
}
export let SCHED_NONE;
export let SCHED_RR;
export let Worker;
export let disconnect;
export let fork;
export let isMaster;
export let isPrimary;
export let isWorker;
export let schedulingPolicy;
export let settings;
export let setupMaster;
export let setupPrimary;
export let workers;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('cluster', _syncNodeApiModuleBindings);
