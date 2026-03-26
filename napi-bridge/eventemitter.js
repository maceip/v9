/**
 * EventEmitter — Node.js-compatible event emitter for browser/Wasm.
 *
 * Implements the full Node.js EventEmitter contract per the conformance catalog (CORE-01).
 * Every MUST behavior and edge case from 03-04-CONFORMANCE-CATALOG.md is covered.
 */

const DEFAULT_MAX_LISTENERS = 10;

export class EventEmitter {
  constructor() {
    this._events = Object.create(null);
    this._maxListeners = DEFAULT_MAX_LISTENERS;
  }

  on(event, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received ' + typeof fn);
    }
    // Emit 'newListener' BEFORE adding the listener
    if (this._events.newListener) {
      this.emit('newListener', event, fn.listener || fn);
    }
    if (!this._events[event]) {
      this._events[event] = [fn];
    } else {
      this._events[event].push(fn);
      // Max listeners warning
      const max = this._maxListeners;
      if (max > 0 && this._events[event].length > max && !this._events[event].warned) {
        this._events[event].warned = true;
        const warning = new Error(
          `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ` +
          `${this._events[event].length} ${String(event)} listeners added. ` +
          `Use emitter.setMaxListeners() to increase limit`
        );
        warning.name = 'MaxListenersExceededWarning';
        warning.emitter = this;
        warning.type = event;
        warning.count = this._events[event].length;
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(warning);
        }
      }
    }
    return this;
  }

  addListener(event, fn) {
    return this.on(event, fn);
  }

  prependListener(event, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received ' + typeof fn);
    }
    // Emit 'newListener' BEFORE adding the listener
    if (this._events.newListener) {
      this.emit('newListener', event, fn.listener || fn);
    }
    if (!this._events[event]) {
      this._events[event] = [fn];
    } else {
      this._events[event].unshift(fn);
    }
    return this;
  }

  once(event, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received ' + typeof fn);
    }
    const wrapper = (...args) => {
      // Remove BEFORE calling so listenerCount is 0 inside callback
      this.removeListener(event, wrapper);
      fn.apply(this, args);
    };
    // Store reference to original so off(event, fn) works
    wrapper.listener = fn;
    this.on(event, wrapper);
    return this;
  }

  prependOnceListener(event, fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function. Received ' + typeof fn);
    }
    const wrapper = (...args) => {
      this.removeListener(event, wrapper);
      fn.apply(this, args);
    };
    wrapper.listener = fn;
    this.prependListener(event, wrapper);
    return this;
  }

  off(event, fn) {
    return this.removeListener(event, fn);
  }

  removeListener(event, fn) {
    const listeners = this._events[event];
    if (!listeners) return this;

    for (let i = listeners.length - 1; i >= 0; i--) {
      if (listeners[i] === fn || listeners[i].listener === fn) {
        listeners.splice(i, 1);
        // Emit 'removeListener' AFTER removing
        if (this._events.removeListener) {
          this.emit('removeListener', event, fn);
        }
        break;
      }
    }
    if (listeners.length === 0) {
      delete this._events[event];
    }
    return this;
  }

  removeAllListeners(event) {
    if (arguments.length === 0) {
      // Remove all listeners for all events
      // But emit 'removeListener' for each if we have removeListener listeners
      if (this._events.removeListener) {
        const eventNames = this.eventNames().filter(e => e !== 'removeListener');
        for (const name of eventNames) {
          this.removeAllListeners(name);
        }
        this.removeAllListeners('removeListener');
      } else {
        this._events = Object.create(null);
      }
      return this;
    }

    const listeners = this._events[event];
    if (!listeners) return this;

    if (this._events.removeListener) {
      // Emit removeListener for each, in reverse order
      for (let i = listeners.length - 1; i >= 0; i--) {
        this.removeListener(event, listeners[i].listener || listeners[i]);
      }
    } else {
      delete this._events[event];
    }
    return this;
  }

  emit(event, ...args) {
    // errorMonitor: fire before 'error' listeners, even if there are none.
    // Allows observation without consuming the error.
    if (event === 'error') {
      const monitorSym = EventEmitter.errorMonitor;
      const monitors = this._events[monitorSym];
      if (monitors) {
        const copy = monitors.slice();
        for (let i = 0; i < copy.length; i++) {
          copy[i].apply(this, args);
        }
      }
    }

    // Special 'error' event handling: throw if no listener
    if (event === 'error' && !this._events.error) {
      const err = args[0];
      if (err instanceof Error) {
        throw err;
      }
      const error = new TypeError(`Unhandled 'error' event. (${err})`);
      error.context = err;
      throw error;
    }

    const listeners = this._events[event];
    if (!listeners) return false;

    // Copy the array so removeListener during emit doesn't skip listeners.
    // Listeners removed during emit still fire for the current emit.
    const copy = listeners.slice();
    for (let i = 0; i < copy.length; i++) {
      const result = copy[i].apply(this, args);
      // captureRejections: if the listener returns a rejected promise,
      // emit it as an 'error' event or call the rejection handler.
      if (EventEmitter.captureRejections && result && typeof result.then === 'function') {
        result.then(undefined, (err) => {
          const rejectionHandler = this[EventEmitter.captureRejectionSymbol];
          if (typeof rejectionHandler === 'function') {
            rejectionHandler.call(this, err, event, ...args);
          } else {
            // Temporarily disable captureRejections to avoid infinite loop
            const prev = EventEmitter.captureRejections;
            try {
              EventEmitter.captureRejections = false;
              this.emit('error', err);
            } finally {
              EventEmitter.captureRejections = prev;
            }
          }
        });
      }
    }
    return true;
  }

  listenerCount(event) {
    const listeners = this._events[event];
    return listeners ? listeners.length : 0;
  }

  listeners(event) {
    const listeners = this._events[event];
    if (!listeners) return [];
    // Return copy, unwrapping once wrappers
    return listeners.map(fn => fn.listener || fn);
  }

  rawListeners(event) {
    const listeners = this._events[event];
    return listeners ? listeners.slice() : [];
  }

  eventNames() {
    // Support both string and Symbol event names
    return Reflect.ownKeys(this._events);
  }

  setMaxListeners(n) {
    if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
      throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n);
    }
    this._maxListeners = n;
    return this;
  }

  getMaxListeners() {
    return this._maxListeners;
  }
}

// ---- Static properties ----

EventEmitter.defaultMaxListeners = DEFAULT_MAX_LISTENERS;

// Symbol used by captureRejections to define a rejection handler on emitters.
EventEmitter.captureRejectionSymbol = Symbol.for('nodejs.rejection');

// When true, emitters auto-capture unhandled promise rejections from async listeners.
EventEmitter.captureRejections = false;

// Symbol for observing 'error' events without consuming them.
EventEmitter.errorMonitor = Symbol.for('events.errorMonitor');

// ---- Static methods ----

/**
 * Static once() — returns a Promise that resolves with the event args
 * the first time `event` fires, or rejects on 'error'.
 */
EventEmitter.once = function once(emitter, event, options) {
  return new Promise((resolve, reject) => {
    const signal = options && options.signal;
    if (signal && signal.aborted) {
      reject(new DOMException('The operation was aborted', 'AbortError'));
      return;
    }

    const onEvent = (...args) => {
      cleanup();
      resolve(args);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onAbort = () => {
      cleanup();
      reject(new DOMException('The operation was aborted', 'AbortError'));
    };

    function cleanup() {
      emitter.removeListener(event, onEvent);
      if (event !== 'error') emitter.removeListener('error', onError);
      if (signal) signal.removeEventListener('abort', onAbort);
    }

    emitter.on(event, onEvent);
    if (event !== 'error') emitter.on('error', onError);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
};

/**
 * Static on() — returns an AsyncIterable that yields event args each time
 * `event` fires.  Rejects the iterator on 'error'.
 */
EventEmitter.on = function on(emitter, event, options) {
  const signal = options && options.signal;
  const unconsumedEvents = [];
  const unconsumedPromises = [];
  let error = null;
  let finished = false;

  const eventHandler = (...args) => {
    if (unconsumedPromises.length > 0) {
      unconsumedPromises.shift().resolve(args);
    } else {
      unconsumedEvents.push(args);
    }
  };

  const errorHandler = (err) => {
    error = err;
    if (unconsumedPromises.length > 0) {
      unconsumedPromises.shift().reject(err);
    }
  };

  const abortHandler = () => {
    errorHandler(new DOMException('The operation was aborted', 'AbortError'));
  };

  function cleanup() {
    finished = true;
    emitter.removeListener(event, eventHandler);
    emitter.removeListener('error', errorHandler);
    if (signal) signal.removeEventListener('abort', abortHandler);
    // Reject any remaining pending consumers
    for (const p of unconsumedPromises) {
      p.resolve({ value: undefined, done: true });
    }
    unconsumedPromises.length = 0;
  }

  emitter.on(event, eventHandler);
  if (event !== 'error') emitter.on('error', errorHandler);
  if (signal) {
    if (signal.aborted) {
      abortHandler();
    } else {
      signal.addEventListener('abort', abortHandler, { once: true });
    }
  }

  const iterator = {
    next() {
      if (unconsumedEvents.length > 0) {
        return Promise.resolve({ value: unconsumedEvents.shift(), done: false });
      }
      if (error) {
        const err = error;
        error = null;
        return Promise.reject(err);
      }
      if (finished) {
        return Promise.resolve({ value: undefined, done: true });
      }
      return new Promise((resolve, reject) => {
        unconsumedPromises.push({ resolve: (val) => resolve({ value: val, done: false }), reject });
      });
    },
    return() {
      cleanup();
      return Promise.resolve({ value: undefined, done: true });
    },
    throw(err) {
      error = err;
      cleanup();
      return Promise.resolve({ value: undefined, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };

  return iterator;
};

/**
 * Static getEventListeners() — returns a copy of the listener array for
 * `event` on the given emitter/EventTarget.
 */
EventEmitter.getEventListeners = function getEventListeners(emitter, event) {
  if (typeof emitter.listeners === 'function') {
    return emitter.listeners(event);
  }
  return [];
};

/**
 * Static listenerCount() — returns the number of listeners for `event`.
 */
EventEmitter.listenerCount = function listenerCount(emitter, event) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(event);
  }
  return 0;
};

/**
 * Static setMaxListeners() — sets default max listeners across multiple emitters.
 */
EventEmitter.setMaxListeners = function setMaxListeners(n, ...emitters) {
  if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
    throw new RangeError('The value of "n" is out of range.');
  }
  if (emitters.length === 0) {
    EventEmitter.defaultMaxListeners = n;
  } else {
    for (const emitter of emitters) {
      // Handle both EventEmitter instances and EventTarget/other objects
      if (typeof emitter.setMaxListeners === 'function') {
        emitter.setMaxListeners(n);
      }
      // Silently skip objects without setMaxListeners (e.g. AbortSignal)
    }
  }
};

/**
 * Static getMaxListeners() — returns the max listeners setting for an emitter.
 */
EventEmitter.getMaxListeners = function getMaxListeners(emitter) {
  if (typeof emitter.getMaxListeners === 'function') {
    return emitter.getMaxListeners();
  }
  return EventEmitter.defaultMaxListeners;
};

/**
 * addAbortListener() — attaches a one-time listener to an AbortSignal.
 * Returns a Disposable that removes the listener when disposed.
 */
EventEmitter.addAbortListener = function addAbortListener(signal, listener) {
  if (signal.aborted) {
    queueMicrotask(() => listener());
  } else {
    signal.addEventListener('abort', listener, { once: true });
  }
  return {
    [Symbol.dispose]() {
      signal.removeEventListener('abort', listener);
    },
  };
};

// Values (not functions) — these are exported directly
EventEmitter.usingDomains = false;
EventEmitter.init = EventEmitter; // compat alias

// For compatibility: EventEmitter.EventEmitter = EventEmitter
EventEmitter.EventEmitter = EventEmitter;

export default EventEmitter;
