// ESM wrapper for node:diagnostics_channel
export class Channel {
  constructor(name) {
    this.name = name;
    this._subscribers = [];
    this._parentWrap = undefined;  // undici checks this
  }
  get hasSubscribers() { return this._subscribers.length > 0; }
  subscribe(fn) { this._subscribers.push(fn); }
  unsubscribe(fn) { this._subscribers = this._subscribers.filter(s => s !== fn); }
  publish(message) { for (const fn of this._subscribers) fn(message, this.name); }
  bindStore() {}
  unbindStore() {}
  runStores(data, fn, ...args) { return fn(...args); }
}
const _channels = new Map();
export function channel(name) { if (!_channels.has(name)) _channels.set(name, new Channel(name)); return _channels.get(name); }
export function hasSubscribers(name) { return _channels.has(name) && _channels.get(name).hasSubscribers; }
export function subscribe(name, fn) { channel(name).subscribe(fn); }
export function unsubscribe(name, fn) { channel(name).unsubscribe(fn); }
export class TracingChannel {
  constructor(nameOrChannels) {
    if (typeof nameOrChannels === 'string') {
      this.start = channel(nameOrChannels + ':start');
      this.end = channel(nameOrChannels + ':end');
      this.asyncStart = channel(nameOrChannels + ':asyncStart');
      this.asyncEnd = channel(nameOrChannels + ':asyncEnd');
      this.error = channel(nameOrChannels + ':error');
    } else {
      Object.assign(this, nameOrChannels);
    }
  }
  get hasSubscribers() { return false; }
  subscribe(handlers) {}
  unsubscribe(handlers) {}
  traceSync(fn, ctx, thisArg, ...args) { return fn.apply(thisArg, args); }
  tracePromise(fn, ctx, thisArg, ...args) { return fn.apply(thisArg, args); }
  traceCallback(fn) { return fn; }
}
export function tracingChannel(name) { return new TracingChannel(name); }
const _module = { Channel, channel, hasSubscribers, subscribe, unsubscribe, TracingChannel, tracingChannel };
export default _module;
