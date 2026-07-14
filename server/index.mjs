import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfig, loadDashboardData } from './data-source.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = normalize(join(__dirname, '..', 'public'));
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const config = getConfig();

let cache = null;

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (url.pathname === '/api/events') {
      return sendJson(res, await getData(url.searchParams.get('refresh') === '1'));
    }

    if (url.pathname === '/api/status') {
      const data = await getData(url.searchParams.get('refresh') === '1');
      return sendJson(res, {
        ok: true,
        source: data.source,
        sourcePath: data.sourcePath,
        updatedAt: data.updatedAt,
        rows: data.rows.length,
        diagnostics: data.diagnostics,
      });
    }

    return serveStatic(url.pathname, res);
  } catch (error) {
    console.error(error);
    return sendJson(res, {
      ok: false,
      error: 'Не удалось получить данные',
      details: error.message,
    }, 502);
  }
});

server.listen(port, host, () => {
  console.log(`Dashboard server started: http://${host}:${port}`);
});

async function getData(forceRefresh = false) {
  const now = Date.now();
  const ttlMs = config.cacheSeconds * 1000;

  if (!forceRefresh && cache && ttlMs > 0 && now - cache.createdAt < ttlMs) {
    return cache.data;
  }

  const data = await loadDashboardData(config);
  cache = {
    createdAt: now,
    data,
  };
  return data;
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store, no-cache, must-revalidate',
  });
  res.end(JSON.stringify(data, null, 2));
}

async function serveStatic(pathname, res) {
  const cleanPath = normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname));
  if (cleanPath.includes('..')) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const filePath = normalize(join(publicDir, cleanPath));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error('Not a file');
    res.writeHead(200, {
      'content-type': contentType(filePath),
      'cache-control': 'public, max-age=60',
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, {
      'content-type': 'text/plain; charset=utf-8',
    });
    res.end('Not found');
  }
}

function contentType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
  }[ext] || 'application/octet-stream';
}
