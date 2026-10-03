// Запускается GitHub Actions: парсит сайт и сохраняет match.json + логотипы команд
const fs = require('fs');
const { loadNextMatch } = require('./scrape');

async function saveLogo(team, name) {
  const res = await fetch(team.logo, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('logo HTTP ' + res.status);
  fs.mkdirSync('logos', { recursive: true });
  const file = 'logos/' + name + '.png';
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  team.logo = file;
}

(async () => {
  const m = await loadNextMatch();
  await saveLogo(m.home, 'home');
  await saveLogo(m.away, 'away');
  delete m.fetchedAt; // чтобы файл менялся только при смене матча
  fs.writeFileSync('match.json', JSON.stringify(m, null, 2) + '\n');
  console.log('OK', m.home.name, '-', m.away.name, new Date(m.timestamp).toISOString());
})().catch(e => { console.error(e); process.exit(1); });
