/**
 * worker_threads — Node.js-compatible worker_threads stub for browser/Wasm.
 *
 * Claude Code imports but gracefully degrades when workers can't spawn.
 * Uses browser-native MessageChannel/MessagePort where available.
 */

import { EventEmitter } from './eventemitter.js';

export const isMainThread = true;
export const parentPort = null;
export const workerData = undefined;
export const threadId = 0;
export const resourceLimits = {};

export class Worker extends EventEmitter {
  constructor(filename, options = {}) {
    super();
    this.threadId = 0;
    this.resourceLimits = options.resourceLimits || {};
    // Cannot actually spawn workers in this environment
    // Emit 'exit' on next tick so callers can register listeners
    Promise.resolve().then(() => {
      this.emit('error', new Error('worker_threads.Worker is not supported in browser environment'));
      this.emit('exit', 1);
    });
  }

  postMessage() {}
  terminate() { return Promise.resolve(0); }
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
export function markAsUncloneable() {}
export function moveMessagePortToContext() { throw new Error('Not supported'); }
export function receiveMessageOnPort() { return undefined; }
export function getEnvironmentData() { return undefined; }
export function setEnvironmentData() {}

export const SHARE_ENV = Symbol('SHARE_ENV');
export const isInternalThread = false;
export const isMarkedAsUntransferable = () => false;
export const locks = undefined;
export const postMessageToThread = () => {
  throw new Error('Not supported');
};
export const threadName = 'main';

export default {
  isMainThread, parentPort, workerData, threadId, resourceLimits,
  Worker, MessageChannel, MessagePort, BroadcastChannel,
  markAsUncloneable, markAsUntransferable, moveMessagePortToContext, receiveMessageOnPort,
  getEnvironmentData, setEnvironmentData, SHARE_ENV,
  isInternalThread, isMarkedAsUntransferable, locks, postMessageToThread, threadName,
};
