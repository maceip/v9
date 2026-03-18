# Phase 3 Conformance Catalog: Frozen Node.js API Contracts

**Purpose:** This is the single source of truth for what Node.js APIs actually do. Every implementation in Phase 3 must match these contracts exactly. No "close enough." No "works for our case." If the behavior diverges from this catalog, it's a bug.

**Why this exists:** Without a frozen reference, engineers will implement what they *think* the API does, test it against their own implementation, and declare victory. That is how you get a fake Node.js that breaks the moment Claude Code calls an API in a slightly different way.

**How to use:** Before implementing any API, read its contract here. After implementing, write a test that validates every behavior listed. If a behavior is listed as MUST, the test MUST exist. No exceptions.

---

## EventEmitter Contract (CORE-01)

Source of truth: Node.js `events` module

### MUST behaviors
```
emitter.on(event, fn)         → adds listener, returns emitter (for chaining)
emitter.once(event, fn)       → fires fn exactly once, then auto-removes
emitter.emit(event, ...args)  → calls all listeners synchronously in registration order
                              → returns true if listeners exist, false otherwise
emitter.off(event, fn)        → removes specific listener (by reference equality)
emitter.removeListener(event, fn) → alias for off()
emitter.removeAllListeners([event]) → removes all listeners for event, or all events if no arg
emitter.listenerCount(event)  → returns number of listeners for event
emitter.listeners(event)      → returns copy of listener array
emitter.eventNames()          → returns array of event names with registered listeners
emitter.prependListener(event, fn) → adds listener to BEGINNING of array
emitter.setMaxListeners(n)    → sets warning threshold (default 10)
emitter.getMaxListeners()     → returns current threshold
```

### MUST edge cases (THESE ARE THE ONES PEOPLE SKIP)
```
emit('error') with no listener → MUST throw the error (or TypeError if not Error)
emit('error', err) with listener → calls listener, does NOT throw
removeListener during emit  → listener still fires for current emit, removed for next
once listener              → removed BEFORE calling (so listenerCount is 0 inside the callback)
adding listener emits 'newListener' event BEFORE adding
removing listener emits 'removeListener' event AFTER removing
Symbol event names         → must work (not just strings)
```

### Test file: `tests/conformance/test-eventemitter.mjs`
Every MUST above = one test case minimum. Ship the tests BEFORE the implementation.

---

## Buffer Contract (CORE-02)

Source of truth: Node.js `Buffer` class

### MUST behaviors
```
Buffer.from(string, encoding) → creates buffer from string
  encodings: 'utf8' (default), 'base64', 'hex', 'ascii', 'latin1', 'binary', 'base64url'
Buffer.from(array)            → creates buffer from byte array
Buffer.from(buffer)           → creates copy
Buffer.from(arrayBuffer, offset, length) → creates view (shared memory!)
Buffer.alloc(size, fill, encoding) → zero-filled buffer
Buffer.allocUnsafe(size)      → uninitialized buffer (may contain old data)
Buffer.concat(list, totalLength) → concatenates buffers
Buffer.isBuffer(obj)          → true for Buffer instances
Buffer.byteLength(string, encoding) → byte count (NOT string.length for multibyte)

buf.toString(encoding, start, end) → decode to string
buf.slice(start, end)         → returns NEW buffer sharing same memory (like subarray)
buf.subarray(start, end)      → same as slice
buf.copy(target, targetStart, sourceStart, sourceEnd) → copies bytes, returns count
buf.compare(other)            → -1, 0, or 1 (for sorting)
buf.equals(other)             → true if identical bytes
buf.indexOf(value, byteOffset, encoding) → first occurrence or -1
buf.includes(value, byteOffset, encoding) → boolean
buf.write(string, offset, length, encoding) → writes string, returns bytes written
buf.fill(value, offset, end, encoding) → fills buffer
buf.length                    → byte length (number)
buf[i]                        → read/write individual bytes (0-255)
buf.readUInt8(offset)         → read unsigned 8-bit int
buf.readUInt16BE(offset)      → read unsigned 16-bit big-endian
buf.readUInt32BE(offset)      → read unsigned 32-bit big-endian
buf.writeUInt8(value, offset) → write unsigned 8-bit int
```

### MUST edge cases (WHERE SHORTCUTS WILL BITE YOU)
```
Buffer.from('') → empty buffer, length 0, NOT null
Buffer.from('aGVsbG8=', 'base64') → must decode correctly (not just utf8)
buf.toString('hex') → lowercase hex pairs, no separators
buf.toString('base64') → standard base64 with padding
Buffer.byteLength('é', 'utf8') → 2 (not 1!)
Buffer.byteLength('hello', 'hex') → 2 (not 5, because hex string "68656c6c6f" is 5 bytes but "hello" as hex input = 2.5, rounds to... actually this is tricky)
buf.slice() shares memory — mutating the slice mutates the original
Buffer instances MUST be instanceof Uint8Array
```

### Test file: `tests/conformance/test-buffer.mjs`

---

## Streams Contract (CORE-03)

Source of truth: Node.js `stream` module

### Readable MUST behaviors
```
new Readable({ read(size) {} })  → create readable, _read called when data needed
readable.push(chunk)             → enqueue data (null = end of stream)
readable.on('data', fn)          → switches to flowing mode, fn receives chunks
readable.on('end', fn)           → fires after push(null) and all data consumed
readable.on('error', fn)         → fires on error
readable.pipe(writable)          → auto-reads and writes to writable, returns writable
readable.unpipe(writable)        → stops piping
readable.read(size)              → pull mode: returns chunk or null
readable.pause()                 → stops 'data' events
readable.resume()                → resumes 'data' events
readable.destroy(err)            → destroys stream, emits 'close'
```

### Writable MUST behaviors
```
new Writable({ write(chunk, encoding, callback) {} })
writable.write(chunk, encoding, callback) → returns false if backpressure
writable.end(chunk, encoding, callback)   → signals no more writes
writable.on('drain', fn)        → fires when safe to write again after backpressure
writable.on('finish', fn)       → fires after end() and all writes flushed
writable.on('error', fn)        → fires on error
writable.on('close', fn)        → fires after stream fully destroyed
writable.destroy(err)           → destroys stream
```

### MUST: Backpressure (THIS IS THE HARD ONE — DO NOT SKIP)
```
writable.write() returns false → readable MUST pause
writable emits 'drain'         → readable MUST resume
pipe() handles this automatically
WITHOUT backpressure: piping 100MB through a slow Transform will buffer everything in memory and OOM
```

### Transform MUST behaviors
```
new Transform({ transform(chunk, encoding, callback) {} })
transform._transform(chunk, enc, cb) → process chunk, call cb(null, output) or cb(err)
transform._flush(cb)                 → called at end, for final output
Transform is both Readable and Writable
```

### MUST edge cases
```
pipe chain: readable.pipe(transform).pipe(writable) → must work
error in pipe chain → must propagate and clean up
destroy() in middle of pipe → must clean up both sides
'end' fires AFTER all data events, not before
pushing null MUST be the last push — pushing after null throws
```

### Test file: `tests/conformance/test-streams.mjs`

---

## process Contract (CORE-04, CORE-05)

### MUST behaviors
```
process.env                   → plain object, injectable via initEdgeJS()
process.env.KEY = 'value'     → must be settable at runtime
process.cwd()                 → returns string, configurable via initEdgeJS()
process.chdir(dir)            → changes cwd (within MEMFS)
process.argv                  → array, minimum ['node', 'script.js']
process.pid                   → number (can be fake, but must be number)
process.platform              → 'browser' (our choice, documented)
process.arch                  → 'wasm32'
process.version               → string starting with 'v'
process.versions              → object with node, v8, etc.
process.exit(code)            → must fire 'exit' event, then terminate
process.nextTick(fn, ...args) → must fire BEFORE next I/O, AFTER current synchronous code
process.hrtime.bigint()       → nanosecond-resolution BigInt

process.stdin                 → Readable stream
process.stdout                → Writable stream (write() works)
process.stderr                → Writable stream (write() works)
process.stdout.isTTY          → boolean
```

### MUST edge cases
```
process.on('exit', fn)        → fn receives exit code, CANNOT do async work
process.on('uncaughtException', fn) → catches unhandled throws
process.nextTick fires before setTimeout(fn, 0) and before Promise.then
process.env values are ALWAYS strings — process.env.PORT = 3000 → '3000'
```

### Test file: `tests/conformance/test-process.mjs`

---

## fs Contract (FS-01 through FS-07)

### MUST behaviors
```
fs.readFileSync(path, encoding)    → Buffer (no encoding) or string (with encoding)
fs.readFile(path, encoding, cb)    → cb(err, data)
fs.writeFileSync(path, data, opts) → creates/overwrites file
fs.writeFile(path, data, opts, cb) → cb(err)
fs.readdirSync(path)               → string[] of names (NOT full paths)
fs.readdirSync(path, {withFileTypes:true}) → Dirent[] with name, isFile(), isDirectory()
fs.statSync(path)                  → Stats object
fs.mkdirSync(path, {recursive})    → creates dir, recursive creates parents
fs.unlinkSync(path)                → deletes file
fs.renameSync(oldPath, newPath)    → moves/renames
fs.existsSync(path)                → boolean (never throws)
fs.accessSync(path)                → throws if not accessible
```

### Stats object MUST
```
stats.isFile()          → boolean
stats.isDirectory()     → boolean
stats.isSymbolicLink()  → boolean (always false in MEMFS v1)
stats.size              → number (bytes)
stats.mtime             → Date
stats.ctime             → Date
stats.atime             → Date
stats.mode              → number
stats.uid               → number (0)
stats.gid               → number (0)
stats.dev               → number
stats.ino               → number
stats.nlink             → number
```

### Error codes MUST
```
ENOENT → file/dir not found (errno: -2)
EISDIR → is a directory (when file expected)
ENOTDIR → is not a directory (when dir expected)
EEXIST → already exists (mkdir without recursive on existing dir)
EACCES → permission denied

Error shape: { code: 'ENOENT', errno: -2, syscall: 'open', path: '/missing' }
             Error must have .code property (Claude Code checks this!)
```

### MUST edge cases (CRITICAL — Claude Code depends on these)
```
readFileSync on dir       → throws EISDIR
writeFileSync to /a/b/c when /a/b doesn't exist → throws ENOENT (NOT auto-mkdir)
readdirSync on file       → throws ENOTDIR
statSync on missing       → throws ENOENT
existsSync on missing     → returns false (NEVER throws)
readdir returns names only → NOT full paths, NOT '.' or '..'
mkdir recursive on existing dir → succeeds silently (no error)
writeFileSync with encoding → encodes string, not raw bytes
readFileSync with 'utf8'  → returns string, not Buffer
unlink on dir             → throws EISDIR (use rmdir for dirs)
rename overwrites target  → if target exists, it's replaced
```

### fs.promises MUST
```
fs.promises.readFile(path, opts)  → returns Promise<Buffer|string>
fs.promises.writeFile(path, data) → returns Promise<void>
fs.promises.readdir(path, opts)   → returns Promise<string[]|Dirent[]>
fs.promises.stat(path)            → returns Promise<Stats>
fs.promises.mkdir(path, opts)     → returns Promise<void>
fs.promises.unlink(path)          → returns Promise<void>
fs.promises.rename(old, new)      → returns Promise<void>
```

### Test file: `tests/conformance/test-fs.mjs`

---

## util Contract (CORE-08)

### MUST behaviors
```
util.promisify(fn)           → returns function that returns Promise
  fn must follow (err, result) callback convention
  promisified(args) → Promise that resolves with result or rejects with err
util.inherits(ctor, super)   → sets up prototype chain (legacy, but still used)
util.types.isPromise(val)    → true for Promise instances
util.types.isDate(val)       → true for Date instances
util.types.isRegExp(val)     → true for RegExp instances
util.inspect(obj, opts)      → string representation (basic is fine, depth + colors optional)
```

### Test file: `tests/conformance/test-util.mjs`

---

## path Contract (CORE-06)

Already implemented in `pathBridge`. Validate:
```
path.join('/a', 'b', 'c')     → '/a/b/c'
path.join('/a', '../b')        → '/b'
path.resolve('a', 'b')         → '/a/b' (relative to cwd)
path.dirname('/a/b/c')         → '/a/b'
path.basename('/a/b/c.js')     → 'c.js'
path.basename('/a/b/c.js', '.js') → 'c'
path.extname('file.txt')       → '.txt'
path.extname('file')           → ''
path.extname('.hidden')        → ''  ← THIS ONE IS TRICKY
path.isAbsolute('/a')          → true
path.isAbsolute('a')           → false
path.relative('/a/b', '/a/c')  → '../c'
path.parse('/a/b/c.js')        → { root:'/', dir:'/a/b', base:'c.js', ext:'.js', name:'c' }
path.format({dir:'/a', base:'b.js'}) → '/a/b.js'
path.sep                       → '/'
path.delimiter                 → ':'
```

### Test file: `tests/conformance/test-path.mjs`

---

## url Contract (CORE-07)

Already partially implemented. Validate:
```
url.parse('http://host:8080/path?q=1#hash')  → parsed object
new URL('http://host/path')                  → URL instance (native)
url.fileURLToPath('file:///tmp/a.txt')        → '/tmp/a.txt'
url.pathToFileURL('/tmp/a.txt')               → URL with file: protocol
```

### Test file: `tests/conformance/test-url.mjs`

---

## Catalog Maintenance Rules

1. **This catalog is append-only until Phase 3 closes.** Do not remove contracts.
2. **If you discover a Claude Code dependency not listed here, ADD IT.** Then implement and test it.
3. **If a contract is impossible in the browser, document WHY and what the fallback is.** Do not silently skip.
4. **Conformance tests MUST be written BEFORE implementations.** Test-first, not test-after.
5. **Every MUST in this catalog = one test assertion minimum.** No untested contracts.
6. **Run conformance tests against real Node.js first** (`node tests/conformance/test-*.mjs`) to prove the tests themselves are correct. Then run against our implementation.
