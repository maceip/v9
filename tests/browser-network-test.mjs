// Test 1: Basic fetch (works in Node and browser)
async function testFetch() {
  console.log('=== Test 1: fetch() ===');
  try {
    const res = await fetch('https://httpbin.org/get');
    const data = await res.json();
    console.log('fetch status:', res.status);
    console.log('fetch url:', data.url);
    console.log('PASS: fetch works');
  } catch (e) {
    console.log('FAIL: fetch -', e.message);
  }
}

// Test 2: http.request (Node.js style)
async function testHttpRequest() {
  console.log('\n=== Test 2: http.request() ===');
  const http = require('http');
  const https = require('https');
  try {
    const body = await new Promise((resolve, reject) => {
      const req = https.get('https://httpbin.org/get', (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(chunks.join('')));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.end();
    });
    const data = JSON.parse(body);
    console.log('http.request url:', data.url);
    console.log('PASS: http.request works');
  } catch (e) {
    console.log('FAIL: http.request -', e.message);
  }
}

// Test 3: POST with fetch
async function testFetchPost() {
  console.log('\n=== Test 3: fetch() POST ===');
  try {
    const res = await fetch('https://httpbin.org/post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true, from: 'browser-runtime' }),
    });
    const data = await res.json();
    console.log('POST status:', res.status);
    console.log('POST echoed:', data.json?.from);
    console.log('PASS: fetch POST works');
  } catch (e) {
    console.log('FAIL: fetch POST -', e.message);
  }
}

// Test 4: Streaming response
async function testStreaming() {
  console.log('\n=== Test 4: Streaming ===');
  try {
    const res = await fetch('https://httpbin.org/stream/3');
    const reader = res.body.getReader();
    let chunks = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks++;
    }
    console.log('Stream chunks:', chunks);
    console.log('PASS: streaming works');
  } catch (e) {
    console.log('FAIL: streaming -', e.message);
  }
}

// Run all
await testFetch();
await testHttpRequest();
await testFetchPost();
await testStreaming();
console.log('\n=== All network tests complete ===');
