import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function contentTypeFor(pathname) {
  return CONTENT_TYPES[extname(pathname)] || 'application/octet-stream';
}

function sanitizePath(pathname) {
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const withoutSlash = decoded.replace(/^\/+/, '');
  return normalize(withoutSlash);
}

export async function startStaticServer({
  rootDir,
  port = 0,
  headers = {},
  log = false,
} = {}) {
  if (!rootDir) {
    throw new Error('startStaticServer requires rootDir');
  }
  const absoluteRoot = resolve(rootDir);

  const server = createServer(async (req, res) => {
    try {
      const requestPath = req.url === '/' ? '/index.html' : req.url;
      const relativePath = sanitizePath(requestPath);
      const absolutePath = resolve(join(absoluteRoot, relativePath));
      if (!absolutePath.startsWith(absoluteRoot)) {
        res.writeHead(403, {
          'content-type': 'text/plain; charset=utf-8',
          ...headers,
        });
        res.end('Forbidden');
        return;
      }

      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) {
        res.writeHead(404, {
          'content-type': 'text/plain; charset=utf-8',
          ...headers,
        });
        res.end('Not Found');
        return;
      }

      const body = await readFile(absolutePath);
      res.writeHead(200, {
        'content-type': contentTypeFor(absolutePath),
        'cache-control': 'no-store',
        ...headers,
      });
      res.end(body);
      if (log) {
        console.log(`[static-server] 200 ${requestPath}`);
      }
    } catch (error) {
      res.writeHead(404, {
        'content-type': 'text/plain; charset=utf-8',
        ...headers,
      });
      res.end('Not Found');
      if (log) {
        console.log(`[static-server] 404 ${req.url} (${error.message})`);
      }
    }
  });

  await new Promise((resolveStart, rejectStart) => {
    server.once('error', rejectStart);
    server.listen(port, '127.0.0.1', resolveStart);
  });

  const address = server.address();
  if (!address || typeof address !== 'object') {
    throw new Error('Could not determine static server address');
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    baseUrl,
    async close() {
      await new Promise((resolveClose) => server.close(resolveClose));
    },
  };
}
