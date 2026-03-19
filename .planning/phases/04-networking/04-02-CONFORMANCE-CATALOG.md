# Phase 4 Conformance Catalog: Networking Contracts

## http/https Module Contract (if needed)

### http.request MUST behaviors
```
http.request(url, options, callback)  → returns ClientRequest
http.request(options, callback)       → url in options.hostname + options.path
http.get(url, callback)               → calls req.end() automatically
https.request(...)                    → same as http but implies TLS (browser handles it)

options shape:
  { hostname, port, path, method, headers, timeout }
  OR string URL
  OR URL object
```

### ClientRequest MUST behaviors
```
req.write(chunk)                → accumulates body data
req.end(chunk?, encoding?, cb?) → sends the request via fetch()
req.setHeader(name, value)      → sets header (case-insensitive storage)
req.getHeader(name)             → retrieves header
req.removeHeader(name)          → removes header
req.abort()                     → cancels request via AbortController
req.on('response', fn)          → fn(incomingMessage)
req.on('error', fn)             → fn(error)
req.on('timeout', fn)           → fires if request exceeds timeout
req.setTimeout(ms, fn?)         → sets timeout
```

### IncomingMessage MUST behaviors
```
res.statusCode                  → number (200, 404, etc.)
res.statusMessage               → string ('OK', 'Not Found')
res.headers                     → object with lowercased keys
res.on('data', fn)              → fn(chunk) — chunk is Buffer
res.on('end', fn)               → fires when body complete
res.on('error', fn)             → fires on network error
```

### MUST edge cases
```
Redirect (301/302)              → browser fetch follows automatically; res.statusCode is final
Request body as string          → encoded as UTF-8
Request body as Buffer          → sent as-is
Response with no body (204)     → 'end' fires immediately after 'response'
Network error                   → 'error' event on req, NOT throw
Timeout                         → req.abort() called, 'error' with ECONNRESET or similar
```

## Streaming / SSE Contract (NET-02)

### ReadableStream → Node.js Readable bridge MUST behaviors
```
webStreamToNodeReadable(readableStream)  → Node.js Readable
  - on('data', fn) receives Buffer chunks
  - on('end', fn) fires when stream completes
  - on('error', fn) fires if stream errors
  - pipe() works with Writable/Transform
  - backpressure propagates (pause/resume)
```

### SSE response handling
```
fetch() with Accept: text/event-stream
  → response.body is a ReadableStream
  → bridged to Node.js Readable
  → SDK parses SSE events from the byte stream
  → each event: "event: message_delta\ndata: {...}\n\n"

We do NOT parse SSE — the SDK does. We just deliver bytes.
```

## Crypto Contract (NET-03, NET-04)

### createHash MUST behaviors
```
crypto.createHash('sha256')     → Hash object
hash.update(data)               → chainable, accepts string or Buffer
hash.update(data, encoding)     → encoding for string input
hash.digest('hex')              → lowercase hex string
hash.digest('base64')           → base64 string
hash.digest()                   → Buffer

Supported algorithms: sha1, sha256, sha384, sha512
```

### createHmac MUST behaviors
```
crypto.createHmac('sha256', key) → Hmac object
hmac.update(data)                → chainable
hmac.digest('hex')               → hex string
hmac.digest('base64')            → base64 string
hmac.digest()                    → Buffer

key can be string or Buffer
```

### MUST: createHash must be SYNCHRONOUS
```
const hash = crypto.createHash('sha256');
hash.update('hello');
const result = hash.digest('hex');
// result is available immediately — NOT a Promise
```

This is critical. Node.js crypto is synchronous. If the SDK does:
```js
const sig = crypto.createHash('sha256').update(body).digest('hex');
headers['x-signature'] = sig;
```
It expects `sig` to be a string, not a Promise.

## Header Contract (NET-05)

### MUST behaviors
```
Request headers sent exactly as set (no modification)
Response headers lowercased: 'Content-Type' → 'content-type'
Multiple values for same header: joined with ', '
Set-Cookie: array of strings (not joined)
```

## Stub Modules (net, tls, dns)

### MUST behaviors
```
require('net')    → module loads without error
require('tls')    → module loads without error
require('dns')    → module loads without error

net.createConnection()  → throws Error('not available in browser')
net.Socket              → class exists (may be empty)
tls.connect()           → throws Error('not available in browser')
dns.lookup()            → throws Error('not available in browser')
```
