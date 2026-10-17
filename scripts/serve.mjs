import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
const root = fileURLToPath(new URL('../public/', import.meta.url));
const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const port = Number(process.env.PORT || 4173);
const server = createServer(async (req, res) => {
  for (const { key, value } of config.headers[0].headers) res.setHeader(key, value);
  if (!['GET','HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(resolve(root) + sep) || !(await stat(path)).isFile()) { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    const file = await readFile(path); res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : file);
  } catch { res.writeHead(404).end(); }
});
server.listen(port, '127.0.0.1', () => console.log(`SafeMark preview: http://127.0.0.1:${port}`));
