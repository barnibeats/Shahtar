// Запуск: node server.js  (затем открыть http://localhost:3000)
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const SITE = 'https://shakhtar.com';
const FIXTURES = SITE + '/uk-ua/matchday/fixtures/';
const MONTHS = { 'січня': 1, 'лютого': 2, 'березня': 3, 'квітня': 4, 'травня': 5, 'червня': 6, 'липня': 7, 'серпня': 8, 'вересня': 9, 'жовтня': 10, 'листопада': 11, 'грудня': 12 };
const MIME = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const PUBLIC = ['index.html', 'shakhtar.svg'];

let cache = null;

// Киевское время -> UTC timestamp (учитывает летнее/зимнее время)
function kyivToTs(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kyiv', hourCycle: 'h23',
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
  });
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, +x.value]));
  const asKyiv = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return guess - (asKyiv - guess);
}

function clean(s) {
  return s.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, '’').replace(/\s+/g, ' ').trim();
}
function abs(src) {
  return SITE + (src.startsWith('/') ? '' : '/') + src.replace(/&amp;/g, '&');
}

async function loadNextMatch() {
  const res = await fetch(FIXTURES, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const html = await res.text();
  const block = html.match(/<div class="match-details"[\s\S]*?<!-- END MATCH DETAILS-->/);
  if (!block) throw new Error('match-details not found');
  const b = block[0];

  const teams = [...b.matchAll(/<img src="([^"]+)" class="match-details-logo"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>/g)]
    .map(m => ({ logo: abs(m[1]), name: clean(m[2]) }));
  const time = clean((b.match(/match-details-time">([\s\S]*?)<br/) || [])[1] || '');
  const t = time.match(/(\d{1,2})\s+(\S+)\s+(\d{4}).*?(\d{1,2}):(\d{2})/);
  if (teams.length < 2 || !t || !MONTHS[t[2]]) throw new Error('cannot parse: ' + time);
  const league = clean((b.match(/match-details-header">([\s\S]*?)<\/p>/) || [])[1] || '');

  return {
    home: teams[0], away: teams[1], league,
    timestamp: kyivToTs(+t[3], MONTHS[t[2]], +t[1], +t[4], +t[5]),
    fetchedAt: Date.now(),
  };
}

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
