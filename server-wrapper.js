import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const VERSION = '20260729-1700';

const URLS = {
  home: 'https://www.laura-giova.be/',
  camera: 'https://photos.laura-giova.be/appareil/',
  hitKiss: 'https://photos.laura-giova.be/hit-kiss/',
  puzzle: 'https://photos.laura-giova.be/puzzle',
  challenges: 'https://photos.laura-giova.be/defis/',
  ranking: 'https://photos.laura-giova.be/classement/',
  rewards: 'https://photos.laura-giova.be/recompenses/'
};

async function exists(file) {
  try { await fs.access(file); return true; } catch { return false; }
}

async function walk(dir) {
  const out = [];
  if (!(await exists(dir))) return out;
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await walk(full));
    else out.push(full);
  }
  return out;
}

function canonicalizeHtml(html) {
  let next = html;

  // Corrige les anciennes adresses connues sans jamais confondre l'accueil avec Hit & Kiss.
  next = next
    .replaceAll('https://quizz.laura-giova.be/', URLS.hitKiss)
    .replaceAll('https://www.laura-giova.be/hit-kiss/', URLS.hitKiss)
    .replaceAll('https://laura-giova.be/hit-kiss/', URLS.hitKiss);

  // Force les cartes identifiables vers leur destination officielle.
  next = next
    .replace(/(<a[^>]*class="[^"]*music[^"]*"[^>]*href=")[^"]*(")/g, `$1${URLS.hitKiss}$2`)
    .replace(/(<a[^>]*class="[^"]*puzzle[^"]*"[^>]*href=")[^"]*(")/g, `$1${URLS.puzzle}$2`);

  if (!next.includes('data-lg-cache-reset')) {
    const cacheReset = `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0"><script data-lg-cache-reset>(async()=>{try{for(const r of await navigator.serviceWorker?.getRegistrations?.()||[])await r.unregister();for(const k of await caches?.keys?.()||[])await caches.delete(k)}catch{}})();</script>`;
    next = next.replace('</head>', `${cacheReset}</head>`);
  }

  next = next.replace(/((?:src|href)="\/(?!\/)[^"?#]+\.(?:js|css))(?:\?[^"#]*)?("?)/g, `$1?v=${VERSION}$2`);

  // Le texte visible du bouton détermine sa destination officielle.
  if (!next.includes('data-lg-link-audit')) {
    const urls = JSON.stringify(URLS);
    const audit = `<script data-lg-link-audit>(()=>{const U=${urls};document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const t=(a.textContent||'').toLowerCase().replace(/\s+/g,' ').trim();let u='';if(t.includes('hit & kiss')||t.includes('hit and kiss'))u=U.hitKiss;else if(t.includes('notre histoire')||t.includes('puzzle'))u=U.puzzle;else if(t.includes('appareil photo')||t==='photos')u=U.camera;else if(t.includes('défis photo')||t==='défis')u=U.challenges;else if(t.includes('classement')&&location.pathname!='/puzzle')u=U.ranking;else if(t.includes('récompenses'))u=U.rewards;else if(t==='accueil'||t.includes('toutes les animations')||t.includes('retour à l’accueil'))u=U.home;if(u&&a.href!==u){e.preventDefault();location.assign(u)}})})();</script>`;
    next = next.replace('</body>', `${audit}</body>`);
  }

  return next;
}

try {
  const files = await walk(distDir);
  for (const file of files.filter(f => f.endsWith('.html'))) {
    const html = await fs.readFile(file, 'utf8');
    const patched = canonicalizeHtml(html);
    if (patched !== html) await fs.writeFile(file, patched, 'utf8');
  }

  const appareilIndex = path.join(distDir, 'appareil', 'index.html');
  if (await exists(appareilIndex)) {
    let html = await fs.readFile(appareilIndex, 'utf8');
    if (!html.includes('/appareil/history-fix.js')) {
      html = html.replace('</body>', `<script src="/appareil/history-fix.js?v=${VERSION}"></script></body>`);
      await fs.writeFile(appareilIndex, html, 'utf8');
    }
  }

  console.log(`Wedding links audited and normalized (${VERSION}).`);
} catch (error) {
  console.error('Unable to audit wedding links:', error);
}

await import('./server.js');