// Auto-generated ESM wrapper for node:worker_threads
// Source: scripts/generate-esm-wrappers.mjs
// Reference: 21 exports from Node.js worker_threads

import * as _mod from './worker-threads.js';
const _impl = _mod.default || _mod;

function _notImplemented(name) {
  return function() { throw new Error(`${name} is not implemented in the browser runtime`); };
}

export const BroadcastChannel = typeof _impl.BroadcastChannel !== 'undefined' ? _impl.BroadcastChannel : _notImplemented('worker_threads.BroadcastChannel');
export const MessageChannel = typeof _impl.MessageChannel !== 'undefined' ? _impl.MessageChannel : _notImplemented('worker_threads.MessageChannel');
export const MessagePort = typeof _impl.MessagePort !== 'undefined' ? _impl.MessagePort : _notImplemented('worker_threads.MessagePort');
export const SHARE_ENV = typeof _impl.SHARE_ENV !== 'undefined' ? _impl.SHARE_ENV : _notImplemented('worker_threads.SHARE_ENV');
export const Worker = typeof _impl.Worker !== 'undefined' ? _impl.Worker : _notImplemented('worker_threads.Worker');
export const getEnvironmentData = typeof _impl.getEnvironmentData !== 'undefined' ? _impl.getEnvironmentData : _notImplemented('worker_threads.getEnvironmentData');
export const isInternalThread = typeof _impl.isInternalThread !== 'undefined' ? _impl.isInternalThread : _notImplemented('worker_threads.isInternalThread');
export const isMainThread = typeof _impl.isMainThread !== 'undefined' ? _impl.isMainThread : _notImplemented('worker_threads.isMainThread');
export const isMarkedAsUntransferable = typeof _impl.isMarkedAsUntransferable !== 'undefined' ? _impl.isMarkedAsUntransferable : _notImplemented('worker_threads.isMarkedAsUntransferable');
export const locks = typeof _impl.locks !== 'undefined' ? _impl.locks : _notImplemented('worker_threads.locks');
export const markAsUncloneable = typeof _impl.markAsUncloneable !== 'undefined' ? _impl.markAsUncloneable : _notImplemented('worker_threads.markAsUncloneable');
export const markAsUntransferable = typeof _impl.markAsUntransferable !== 'undefined' ? _impl.markAsUntransferable : _notImplemented('worker_threads.markAsUntransferable');
export const moveMessagePortToContext = typeof _impl.moveMessagePortToContext !== 'undefined' ? _impl.moveMessagePortToContext : _notImplemented('worker_threads.moveMessagePortToContext');
export const parentPort = typeof _impl.parentPort !== 'undefined' ? _impl.parentPort : _notImplemented('worker_threads.parentPort');
export const postMessageToThread = typeof _impl.postMessageToThread !== 'undefined' ? _impl.postMessageToThread : _notImplemented('worker_threads.postMessageToThread');
export const receiveMessageOnPort = typeof _impl.receiveMessageOnPort !== 'undefined' ? _impl.receiveMessageOnPort : _notImplemented('worker_threads.receiveMessageOnPort');
export const resourceLimits = typeof _impl.resourceLimits !== 'undefined' ? _impl.resourceLimits : _notImplemented('worker_threads.resourceLimits');
export const setEnvironmentData = typeof _impl.setEnvironmentData !== 'undefined' ? _impl.setEnvironmentData : _notImplemented('worker_threads.setEnvironmentData');
export const threadId = typeof _impl.threadId !== 'undefined' ? _impl.threadId : _notImplemented('worker_threads.threadId');
export const threadName = typeof _impl.threadName !== 'undefined' ? _impl.threadName : _notImplemented('worker_threads.threadName');
export const workerData = typeof _impl.workerData !== 'undefined' ? _impl.workerData : _notImplemented('worker_threads.workerData');

const _module = { BroadcastChannel, MessageChannel, MessagePort, SHARE_ENV, Worker, getEnvironmentData, isInternalThread, isMainThread, isMarkedAsUntransferable, locks, markAsUncloneable, markAsUntransferable, moveMessagePortToContext, parentPort, postMessageToThread, receiveMessageOnPort, resourceLimits, setEnvironmentData, threadId, threadName, workerData };
export default _module;
