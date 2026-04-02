/**
 * Minimal worker for claude API contract — same pattern as app code using
 * worker_threads (workerData in, postMessage out).
 */
import { parentPort, workerData } from 'node:worker_threads';

parentPort.postMessage({
  ok: true,
  echo: workerData,
  selfCheck: workerData?.n === 42 ? 1 : 0,
});
