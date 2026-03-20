// ESM wrapper for node:perf_hooks
export const performance = globalThis.performance;
export const PerformanceObserver = globalThis.PerformanceObserver || class PerformanceObserver { constructor() {} observe() {} disconnect() {} };
export const PerformanceEntry = globalThis.PerformanceEntry || class PerformanceEntry {};
export const PerformanceResourceTiming = globalThis.PerformanceResourceTiming || class PerformanceResourceTiming {};
export function monitorEventLoopDelay() { return { enable(){}, disable(){}, min: 0, max: 0, mean: 0, stddev: 0, percentile() { return 0; }, percentiles: new Map(), reset() {} }; }
export function createHistogram() { return { min: 0, max: 0, mean: 0, percentile() { return 0; }, reset() {} }; }
const _module = { performance, PerformanceObserver, PerformanceEntry, PerformanceResourceTiming, monitorEventLoopDelay, createHistogram };
export default _module;
