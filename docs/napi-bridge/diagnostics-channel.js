/**
 * diagnostics_channel — Node.js-compatible stub for browser/Wasm.
 *
 * undici uses diagnostics_channel for telemetry. In the browser we don't
 * need tracing, so every channel is a no-op. The Channel shape must match
 * what undici's diagnostics.js expects: .subscribe(), .unsubscribe(),
 * .publish(), .hasSubscribers, and the ._parentWrap property that
 * TracingChannel uses internally.
 */

class Channel {
  constructor(name) {
    this.name = name;
    this.hasSubscribers = false;
  }
  subscribe(onMessage) {}
  unsubscribe(onMessage) {}
  publish(message) {}
  bindStore(store, transform) {}
  unbindStore(store) {}
  runStores(message, fn, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }
}

class TracingChannel {
  constructor(nameOrChannels) {
    const prefix = typeof nameOrChannels === 'string' ? nameOrChannels : '';
    this.start = new Channel(`${prefix}:start`);
    this.end = new Channel(`${prefix}:end`);
    this.asyncStart = new Channel(`${prefix}:asyncStart`);
    this.asyncEnd = new Channel(`${prefix}:asyncEnd`);
    this.error = new Channel(`${prefix}:error`);
  }
  get hasSubscribers() { return false; }
  subscribe(handlers) {}
  unsubscribe(handlers) {}
  traceSync(fn, context, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }
  tracePromise(fn, context, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }
  traceCallback(fn, position, context, thisArg, ...args) {
    return fn.apply(thisArg, args);
  }
}

const _channels = new Map();

export function channel(name) {
  let ch = _channels.get(name);
  if (!ch) {
    ch = new Channel(name);
    _channels.set(name, ch);
  }
  return ch;
}

export function tracingChannel(name) {
  return new TracingChannel(name);
}

export function hasSubscribers(name) {
  return false;
}

export function subscribe(name, onMessage) {
  channel(name).subscribe(onMessage);
}

export function unsubscribe(name, onMessage) {
  channel(name).unsubscribe(onMessage);
}

export { Channel, TracingChannel };

export default {
  channel,
  tracingChannel,
  hasSubscribers,
  subscribe,
  unsubscribe,
  Channel,
  TracingChannel,
};
