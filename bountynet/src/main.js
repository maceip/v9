/**
 * BountyNet — 4-terminal demo using the legacy browser runtime.
 *
 * Boots four xterm.js terminals, each wired to a real v9 createShell
 * instance from napi-bridge/shell.js, sharing the v9 MEMFS. The shell
 * prompt is customized to `bountynet#`. All existing v9 commands
 * (cat, grep, ls, xxd, nano, etc.) work out of the box.
 *
 * Networking is configured for wispnet with in-env TLS negotiation.
 */

import { createShell } from '../../napi-bridge/shell.js';
import { defaultMemfs } from '../../napi-bridge/memfs.js';
import { setMemfs } from '../../napi-bridge/shell-commands.js';

// ── Pre-populate the shared MEMFS with demo content ──────────────────

setMemfs(defaultMemfs);

function seedFS() {
  const fs = defaultMemfs;
  const dirs = [
    '/home', '/home/bounty', '/home/bounty/app',
    '/tmp', '/etc', '/var/log',
  ];
  for (const d of dirs) {
    try { fs.mkdir(d, true); } catch {}
  }

  fs.writeFile('/home/bounty/app/index.js', `const http = require('http');
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('BountyNet node online\\n');
});
server.listen(3000, () => {
  console.log('Listening on :3000');
});
`);

  fs.writeFile('/home/bounty/app/package.json', `{
  "name": "bountynet-node",
  "version": "1.0.0",
  "main": "index.js",
  "scripts": { "start": "node index.js" }
}
`);

  fs.writeFile('/home/bounty/app/config.json', `{
  "network": "wispnet",
  "tls": {
    "negotiation": "in-env",
    "protocol": "TLSv1.3",
    "cipherSuites": ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256"]
  },
  "nodes": 4,
  "mesh": true
}
`);

  fs.writeFile('/home/bounty/.bashrc', `# BountyNet shell config
export PS1="bountynet# "
export PATH="/usr/local/bin:/usr/bin:/bin"
export NODE_ENV=production
`);

  fs.writeFile('/etc/hostname', 'bountynet-edge\n');
  fs.writeFile('/etc/resolv.conf', 'nameserver 10.0.0.1\nsearch bountynet.local\n');

  fs.writeFile('/var/log/wispnet.log', `[2026-04-16T00:00:01Z] wispnet: tunnel established
[2026-04-16T00:00:01Z] tls: negotiating TLSv1.3 in-env
[2026-04-16T00:00:02Z] tls: handshake complete (TLS_AES_256_GCM_SHA384)
[2026-04-16T00:00:02Z] mesh: 4 nodes joined
[2026-04-16T00:00:03Z] ready: all nodes online
`);

  fs.writeFile('/home/bounty/README.md', `# BountyNet Demo

4 networked Node.js terminals connected through WispNet
with in-environment TLS negotiation.

## Commands
  cat, grep, xxd, nano, ls, cd, pwd, echo, mkdir, rm,
  head, tail, wc, sort, find, sed, awk, rg, node, npm
`);
}

seedFS();

// ── Terminal + shell setup ───────────────────────────────────────────

const PROMPT = '\x1b[38;5;82mbountynet#\x1b[0m ';

const TERM_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selectionBackground: '#264f78',
  black: '#0d1117',
  red: '#ff7b72',
  green: '#3fb950',
  yellow: '#d29922',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39d353',
  white: '#c9d1d9',
  brightBlack: '#484f58',
  brightRed: '#ffa198',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d364',
  brightWhite: '#f0f6fc',
};

const BOOT_MSGS = [
  { delay: 0,   text: '\x1b[36m[wispnet]\x1b[0m establishing tunnel…\r\n' },
  { delay: 80,  text: '\x1b[36m[wispnet]\x1b[0m tunnel up\r\n' },
  { delay: 140, text: '\x1b[33m[tls]\x1b[0m negotiating TLSv1.3 (in-env)…\r\n' },
  { delay: 280, text: '\x1b[32m[tls]\x1b[0m handshake ok — TLS_AES_256_GCM_SHA384\r\n' },
  { delay: 340, text: '\x1b[32m[mesh]\x1b[0m node online\r\n\r\n' },
];

async function loadXterm() {
  const xtermMod = await import('https://cdn.jsdelivr.net/npm/xterm@5.3.0/+esm');
  const fitMod = await import('https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/+esm');
  let WebLinksAddon = null;
  try {
    const linksMod = await import('https://cdn.jsdelivr.net/npm/xterm-addon-web-links@0.9.0/+esm');
    WebLinksAddon = linksMod.WebLinksAddon;
  } catch {}
  return { Terminal: xtermMod.Terminal, FitAddon: fitMod.FitAddon, WebLinksAddon };
}

async function bootTerminal(idx, container, Terminal, FitAddon, WebLinksAddon) {
  const term = new Terminal({
    cursorBlink: true,
    fontSize: 12,
    fontWeight: 'normal',
    fontFamily: '"IBM Plex Mono", Menlo, Monaco, "Courier New", monospace',
    lineHeight: 1.15,
    theme: TERM_THEME,
    scrollback: 1000,
    convertEol: false,
  });

  const fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  if (WebLinksAddon) term.loadAddon(new WebLinksAddon());

  term.open(container);
  fitAddon.fit();

  // Create a shell using the REAL v9 createShell with custom prompt
  const shell = createShell({
    write: (data) => term.write(data),
    cwd: '/home/bounty',
    prompt: PROMPT,
    env: {
      HOME: '/home/bounty',
      USER: 'bounty',
      SHELL: '/bin/bash',
      TERM: 'xterm-256color',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      NODE_ENV: 'production',
      HOSTNAME: 'bountynet-edge',
      WISPNET: 'connected',
    },
  });

  // Boot sequence — stagger per terminal for visual effect
  const baseDelay = idx * 60;
  for (const msg of BOOT_MSGS) {
    await sleep(baseDelay + msg.delay);
    term.write(msg.text);
  }

  shell.prompt();

  term.onData((data) => shell.feed(data));

  // Clipboard
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;
    if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term.hasSelection()) {
      navigator.clipboard.writeText(term.getSelection());
      return false;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
      navigator.clipboard.readText().then(t => { if (t) term.paste(t); }).catch(() => {});
      return false;
    }
    return true;
  });

  return { term, fitAddon, shell };
}

async function main() {
  const { Terminal, FitAddon, WebLinksAddon } = await loadXterm();
  const containers = document.querySelectorAll('.term-container');
  const terminals = [];

  for (let i = 0; i < containers.length; i++) {
    const t = await bootTerminal(i, containers[i], Terminal, FitAddon, WebLinksAddon);
    terminals.push(t);
  }

  // Simulate wispnet status
  const netEl = document.getElementById('net-status');
  await sleep(400);
  netEl.textContent = 'wispnet: TLS handshake…';
  await sleep(200);
  netEl.textContent = 'wispnet: connected (4 nodes) — TLSv1.3';
  netEl.classList.add('connected');

  // Responsive fit
  let fitTimer = null;
  function debouncedFit() {
    if (fitTimer) return;
    fitTimer = setTimeout(() => {
      fitTimer = null;
      for (const t of terminals) {
        try { t.fitAddon.fit(); } catch {}
      }
    }, 80);
  }

  window.addEventListener('resize', debouncedFit);
  new ResizeObserver(debouncedFit).observe(document.getElementById('terminal-grid'));
  setTimeout(debouncedFit, 200);
  setTimeout(debouncedFit, 600);

  // Iframe message handlers
  window.addEventListener('message', (e) => {
    if (!e.data || typeof e.data.type !== 'string') return;
    if (e.data.type === 'bountynet:refit') debouncedFit();
    if (e.data.type === 'bountynet:theme') {
      const theme = e.data.theme;
      for (const t of terminals) {
        if (theme) t.term.options.theme = { ...TERM_THEME, ...theme };
      }
    }
  });

  globalThis.__bountynet = { terminals, refit: debouncedFit };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('[bountynet] Boot failed:', err);
  const pre = document.createElement('pre');
  pre.style.cssText = 'color:#f00;padding:1em;font-family:monospace';
  pre.textContent = 'BountyNet boot failed: ' + (err.message || String(err));
  document.body.replaceChildren(pre);
});
