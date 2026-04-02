/**
 * worker_threads — Node.js-compatible worker_threads stub for browser/Wasm.
 *
 * Claude Code imports but gracefully degrades when workers can't spawn.
 * Uses browser-native MessageChannel/MessagePort where available.
 */

import { EventEmitter } from './eventemitter.js';

const _inWorkerContext = typeof WorkerGlobalScope !== 'undefined'
  && globalThis instanceof WorkerGlobalScope
  && !('document' in globalThis);

export const isMainThread = !_inWorkerContext;
export const parentPort = _inWorkerContext ? (globalThis.__edgeWorkerParentPort || null) : null;
export const workerData = _inWorkerContext ? globalThis.__edgeWorkerData : undefined;
export const threadId = _inWorkerContext ? (globalThis.__edgeWorkerThreadId || 1) : 0;
export const resourceLimits = {};
const _workerEnvData = new Map();
let _nextThreadId = 1;

function _toWorkerUrl(filename) {
  if (filename instanceof URL) return filename.toString();
  const specifier = String(filename);
  if (/^(blob:|data:|https?:|file:)/i.test(specifier)) return specifier;
  return new URL(specifier, globalThis.location?.href || 'http://localhost/').toString();
}

function _createWorkerBootstrap(targetUrl, workerDataValue, assignedThreadId) {
  const source = `
    self.__edgeWorkerThreadId = ${JSON.stringify(assignedThreadId)};
    self.__edgeWorkerData = ${JSON.stringify(workerDataValue ?? null)};
    self.__edgeWorkerEnvData = new Map();
    self.__edgeWorkerParentPort = {
      postMessage(value, transfer) { self.postMessage(value, transfer || []); },
      onmessage: null,
      addEventListener(type, handler) { if (type === 'message') self.addEventListener('message', handler); },
      removeEventListener(type, handler) { if (type === 'message') self.removeEventListener('message', handler); },
      once(type, handler) {
        if (type !== 'message') return;
        const wrapped = (event) => { self.removeEventListener('message', wrapped); handler(event); };
        self.addEventListener('message', wrapped);
      },
      start() {},
      close() { self.close(); },
      ref() { return this; },
      unref() { return this; },
    };
    self.addEventListener('message', (event) => {
      if (typeof self.__edgeWorkerParentPort.onmessage === 'function') {
        self.__edgeWorkerParentPort.onmessage(event);
      }
    });
    import(${JSON.stringify(targetUrl)});
  `;
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
}

export class Worker extends EventEmitter {
  constructor(filename, options = {}) {
    super();
    this.threadId = _nextThreadId++;
    this.resourceLimits = options.resourceLimits || {};
    this._worker = null;
    this._bootstrapUrl = null;
    this._stdout = null;
    this._stderr = null;

    try {
      if (typeof globalThis.Worker !== 'function') {
        throw new Error('worker_threads.Worker is not supported in this browser');
      }
      const targetUrl = _toWorkerUrl(filename);
      this._bootstrapUrl = _createWorkerBootstrap(targetUrl, options.workerData, this.threadId);
      this._worker = new globalThis.Worker(this._bootstrapUrl, { type: 'module', name: options.name });
      this._worker.addEventListener('message', (event) => {
        this.emit('message', event.data);
      });
      this._worker.addEventListener('error', (event) => {
        const err = event?.error || new Error(event?.message || 'Worker error');
        this.emit('error', err);
      });
      this._worker.addEventListener('messageerror', (event) => {
        this.emit('error', event);
      });
    } catch (error) {
      Promise.resolve().then(() => {
        this.emit('error', error);
        this.emit('exit', 1);
      });
    }
  }

  postMessage(value, transferList) {
    this._worker?.postMessage(value, transferList || []);
  }
  terminate() {
    try {
      this._worker?.terminate();
      this.emit('exit', 0);
    } finally {
      if (this._bootstrapUrl) {
        URL.revokeObjectURL(this._bootstrapUrl);
        this._bootstrapUrl = null;
      }
    }
    return Promise.resolve(0);
  }
  ref() { return this; }
  unref() { return this; }
  getHeapSnapshot() { return Promise.reject(new Error('Not supported')); }
}

// Use browser-native MessagePort/MessageChannel if available.
// MessagePort must be defined before MessageChannel to avoid TDZ in fallback.
export const MessagePort = globalThis.MessagePort || class MessagePort extends EventEmitter {
  constructor() {
    super();
    this._started = false;
  }
  postMessage() {}
  start() { this._started = true; }
  close() {}
  ref() { return this; }
  unref() { return this; }
};

export const MessageChannel = globalThis.MessageChannel || class MessageChannel {
  constructor() {
    this.port1 = new MessagePort();
    this.port2 = new MessagePort();
  }
};

export const BroadcastChannel = globalThis.BroadcastChannel || class BroadcastChannel extends EventEmitter {
  constructor(name) {
    super();
    this.name = name;
  }
  postMessage() {}
  close() {}
};

export function markAsUntransferable() {}
export function moveMessagePortToContext() { throw new Error('Not supported'); }
export function receiveMessageOnPort() { return undefined; }
export function getEnvironmentData(key) {
  return (_inWorkerContext ? globalThis.__edgeWorkerEnvData : _workerEnvData)?.get(key);
}
export function setEnvironmentData(key, value) {
  (_inWorkerContext ? globalThis.__edgeWorkerEnvData : _workerEnvData).set(key, value);
}

export const SHARE_ENV = Symbol('SHARE_ENV');

export default {
  isMainThread, parentPort, workerData, threadId, resourceLimits,
  Worker, MessageChannel, MessagePort, BroadcastChannel,
  markAsUntransferable, moveMessagePortToContext, receiveMessageOnPort,
  getEnvironmentData, setEnvironmentData, SHARE_ENV,
};
