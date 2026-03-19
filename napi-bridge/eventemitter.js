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
      copy[i].apply(this, args);
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

// Static
EventEmitter.defaultMaxListeners = DEFAULT_MAX_LISTENERS;

// For compatibility: EventEmitter.EventEmitter = EventEmitter
EventEmitter.EventEmitter = EventEmitter;

export default EventEmitter;
