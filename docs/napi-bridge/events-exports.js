// ESM wrapper for node:events
// Default export MUST be the EventEmitter constructor (not a plain object)
// because Node.js code does: import EventEmitter from 'events'; class Foo extends EventEmitter {}

import { EventEmitter } from './eventemitter.js';

// Re-export EventEmitter as the default (it's a constructor, can be extended)
export { EventEmitter };
export const EventEmitterAsyncResource = EventEmitter; // stub
export const captureRejectionSymbol = Symbol.for('nodejs.rejection');
export const captureRejections = false;
export const defaultMaxListeners = 10;
export const errorMonitor = Symbol('events.errorMonitor');
export function addAbortListener() {}
export function getEventListeners(emitter, name) { return emitter.listeners?.(name) || []; }
export function getMaxListeners(emitter) { return emitter.getMaxListeners?.() || 10; }
export function listenerCount(emitter, name) { return emitter.listenerCount?.(name) || 0; }
export function on(emitter, name) { /* async iterator stub */ return { [Symbol.asyncIterator]() { return this; }, next() { return new Promise(() => {}); } }; }
export function once(emitter, name) { return new Promise((resolve) => { emitter.once(name, (...args) => resolve(args)); }); }
export function setMaxListeners(n, ...emitters) { for (const e of emitters) e.setMaxListeners?.(n); }
export const init = undefined;
export const usingDomains = false;

// Default export is the EventEmitter CLASS (constructor), with properties attached
Object.assign(EventEmitter, { EventEmitter, EventEmitterAsyncResource, addAbortListener, captureRejectionSymbol, captureRejections, defaultMaxListeners, errorMonitor, getEventListeners, getMaxListeners, listenerCount, on, once, setMaxListeners, usingDomains });
export default EventEmitter;
