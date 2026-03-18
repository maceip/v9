import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const reportPath = join(__dirname, 'jspi-benchmark-report.json');

console.log('=== True JSPI / Engine Boundary Benchmark ===\n');

// 1. Synthesize a tiny raw Wasm module that imports a suspending function
// and exports a function that calls it. This tests the actual V8/SpiderMonkey
// C++ -> JS -> C++ boundary overhead, not just pure JavaScript loops.
const wasmCode = new Uint8Array([0x00,0x61,0x73,0x6d,0x01,0x00,0x00,0x00,0x01,0x04,0x01,0x60,0x00,0x00,0x02,0x0a,0x01,0x03,0x65,0x6e,0x76,0x02,0x63,0x62,0x00,0x00,0x03,0x02,0x01,0x00,0x07,0x07,0x01,0x03,0x72,0x75,0x6e,0x00,0x01,0x0a,0x06,0x01,0x04,0x00,0x10,0x00,0x0b]);

const ITERATIONS = 100000;

async function runBenchmark() {
  if (typeof WebAssembly.Suspending !== 'function') {
    console.warn("WARNING: JSPI (WebAssembly.Suspending) is not supported in this Node/V8 version.");
    console.warn("Run with --experimental-wasm-jspi to enable true testing.");
    console.warn("Falling back to pure-sync simulation for demonstration.\n");
  }

  // --- 1. Synchronous Baseline ---
  let syncInst = await WebAssembly.instantiate(wasmCode, {
    env: { cb: () => {} } // pure empty sync function
  });
  let syncRun = syncInst.instance.exports.run;
  
  let startSync = performance.now();
  for (let i = 0; i < ITERATIONS; i++) {
    syncRun();
  }
  let endSync = performance.now();
  let syncTimeMs = endSync - startSync;

  // --- 2. JSPI Asynchronous Test ---
  let asyncTimeMs = 0;
  
  // Use JSPI if available, else simulate the Promise overhead
  if (typeof WebAssembly.Suspending === 'function') {
    let asyncCb = new WebAssembly.Suspending(() => Promise.resolve());
    let asyncInst = await WebAssembly.instantiate(wasmCode, {
      env: { cb: asyncCb }
    });
    // Wrap export to return a promise
    let asyncRun = WebAssembly.promising(asyncInst.instance.exports.run);
    
    let startAsync = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await asyncRun();
    }
    let endAsync = performance.now();
    asyncTimeMs = endAsync - startAsync;
  } else {
    // Fake the JSPI wrapper overhead for platforms without the flag
    let fakeAsyncRun = async () => { syncRun(); return Promise.resolve(); };
    let startAsync = performance.now();
    for (let i = 0; i < ITERATIONS; i++) {
      await fakeAsyncRun();
    }
    let endAsync = performance.now();
    asyncTimeMs = endAsync - startAsync;
  }

  console.log(`Sync boundary chain (${ITERATIONS} iters): ${syncTimeMs.toFixed(2)} ms`);
  console.log(`JSPI boundary chain (${ITERATIONS} iters): ${asyncTimeMs.toFixed(2)} ms`);

  const currentRun = {
    date: new Date().toISOString(),
    iterations: ITERATIONS,
    syncTimeMs,
    asyncTimeMs,
    realJSPI: typeof WebAssembly.Suspending === 'function'
  };

  // Regression check
  if (existsSync(reportPath)) {
    const history = JSON.parse(readFileSync(reportPath, 'utf8'));
    const lastRun = history[history.length - 1];
    
    const regressionThreshold = 1.5; // 50% slower is a regression
    if (currentRun.asyncTimeMs > lastRun.asyncTimeMs * regressionThreshold) {
      console.error(`\nFAIL: Regression detected! Current async time (${currentRun.asyncTimeMs.toFixed(2)}ms) is > 50% slower than last run (${lastRun.asyncTimeMs.toFixed(2)}ms).`);
      process.exit(1);
    } else {
      console.log('\nPASS: No performance regression detected.');
    }
    history.push(currentRun);
    writeFileSync(reportPath, JSON.stringify(history, null, 2));
  } else {
    console.log('\nINFO: No previous benchmark data. Creating baseline.');
    writeFileSync(reportPath, JSON.stringify([currentRun], null, 2));
  }
}

runBenchmark().catch(err => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});