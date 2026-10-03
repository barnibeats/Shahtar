// Запуск: node server.js  (затем открыть http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const { loadNextMatch, SITE } = require('./scrape');
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ttf': 'font/ttf' };
const PUBLIC = ['index.html', 'shakhtar.svg', 'match.json', 'DINPro-Medium.ttf'];

let cache = null;

async function getMatch() {
  if (cache && Date.now() - cache.fetchedAt < 5 * 60 * 1000) return cache;
  try { cache = await loadNextMatch(); }
  catch (e) { console.error('Parse error:', e.message); if (!cache) throw e; }
  return cache;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/next-match') {
    try {
      const data = await getMatch();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(data));
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }
  if (url.pathname === '/logo') {
    const u = url.searchParams.get('u') || '';
    if (!u.startsWith(SITE + '/-/media/')) { res.writeHead(400); return res.end('bad url'); }
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'image/png', 'Cache-Control': 'max-age=86400' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch (e) { res.writeHead(502); res.end(); }
    return;
  }
  const name = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  if (!PUBLIC.includes(name)) { res.writeHead(404); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(name)] });
  fs.createReadStream(path.join(__dirname, name)).pipe(res);
}).listen(PORT, () => console.log('http://localhost:' + PORT));
