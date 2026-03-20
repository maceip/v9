// Auto-generated ESM wrapper for node:perf_hooks
import { getNodeApiModule, subscribeNodeApiModule } from '../node-api-surface.js';

let _defaultExport = getNodeApiModule('perf_hooks');
function _syncNodeApiModuleBindings() {
  const mod = getNodeApiModule('perf_hooks');
  _defaultExport = mod;
  Performance = mod.Performance;
  PerformanceEntry = mod.PerformanceEntry;
  PerformanceMark = mod.PerformanceMark;
  PerformanceMeasure = mod.PerformanceMeasure;
  PerformanceObserver = mod.PerformanceObserver;
  PerformanceObserverEntryList = mod.PerformanceObserverEntryList;
  PerformanceResourceTiming = mod.PerformanceResourceTiming;
  constants = mod.constants;
  createHistogram = mod.createHistogram;
  monitorEventLoopDelay = mod.monitorEventLoopDelay;
  performance = mod.performance;
}
export let Performance;
export let PerformanceEntry;
export let PerformanceMark;
export let PerformanceMeasure;
export let PerformanceObserver;
export let PerformanceObserverEntryList;
export let PerformanceResourceTiming;
export let constants;
export let createHistogram;
export let monitorEventLoopDelay;
export let performance;
export { _defaultExport as default };
_syncNodeApiModuleBindings();
subscribeNodeApiModule('perf_hooks', _syncNodeApiModuleBindings);
