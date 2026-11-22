// Tiny local stand-in for Vercel's function runtime so `npm run dev` works without the Vercel CLI.
// Maps  /api/<name>  ->  api/<name>.js  and gives handlers the same req/res helpers Vercel provides.
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

try { process.loadEnvFile('.env'); } catch { /* .env is optional */ }
try { process.loadEnvFile('.env.local'); } catch { /* optional */ }

export function startApi(port = 3001) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const m = /^\/api\/([a-z0-9_-]+)$/i.exec(url.pathname);
    const file = m && path.resolve('api', `${m[1]}.js`);
    if (!m || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Not found' }));
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(url.searchParams);
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = raw; }
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(o)); };
    try {
      const mod = await import(pathToFileURL(file).href + `?t=${Date.now()}`);
      await mod.default(req, res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'Server error' });
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.API_PORT || 3001);
  await startApi(port);
  console.log(`API on http://localhost:${port}`);
}
