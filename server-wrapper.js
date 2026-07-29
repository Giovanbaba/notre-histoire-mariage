import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const VERSION = '20260729-1645';

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

function canonicalizeHtml(html, file) {
  let next = html;

  // Une seule URL officielle par animation.
  next = next
    .replaceAll('https://www.laura-giova.be/', '/hit-kiss/')
    .replaceAll('https://quizz.laura-giova.be/', '/hit-kiss/')
    .replaceAll('href="https://photos.laura-giova.be/appareil/"', 'href="/appareil/"')
    .replaceAll('href="https://photos.laura-giova.be/hit-kiss/"', 'href="/hit-kiss/"')
    .replaceAll('href="https://photos.laura-giova.be/puzzle"', 'href="/puzzle"')
    .replaceAll('href="https://photos.laura-giova.be/puzzle/"', 'href="/puzzle"');

  // Corrige précisément les anciennes cartes de jeu restées dans certains builds.
  next = next
    .replace(/(<a[^>]*class="[^"]*music[^"]*"[^>]*href=")[^"]*(")/g, '$1/hit-kiss/$2')
    .replace(/(<a[^>]*class="[^"]*puzzle[^"]*"[^>]*href=")[^"]*(")/g, '$1/puzzle$2')
    .replace(/(<a[^>]*>\s*<span[^>]*>🧩<\/span>[\s\S]{0,180}?Notre histoire[\s\S]{0,180}?href=")[^"]*(")/g, '$1/puzzle$2');

  // Force le navigateur à reprendre les derniers fichiers et supprime les anciens caches/PWA.
  if (!next.includes('data-lg-cache-reset')) {
    const cacheReset = `<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate"><meta http-equiv="Pragma" content="no-cache"><meta http-equiv="Expires" content="0"><script data-lg-cache-reset>(async()=>{try{for(const r of await navigator.serviceWorker?.getRegistrations?.()||[])await r.unregister();for(const k of await caches?.keys?.()||[])await caches.delete(k)}catch{}})();</script>`;
    next = next.replace('</head>', `${cacheReset}</head>`);
  }

  // Cache-busting des scripts et styles locaux.
  next = next.replace(/((?:src|href)="\/(?!\/)[^"?#]+\.(?:js|css))(?:\?[^"#]*)?("?)/g, `$1?v=${VERSION}$2`);

  // Navigation de sécurité : le libellé du bouton détermine toujours la bonne destination.
  if (!next.includes('data-lg-link-audit')) {
    const audit = `<script data-lg-link-audit>document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const t=(a.textContent||'').toLowerCase();let u='';if(t.includes('hit & kiss')||t.includes('hit and kiss'))u='/hit-kiss/';else if(t.includes('notre histoire')||t.includes('puzzle'))u='/puzzle';else if(t.includes('appareil photo')||t.trim()==='photos')u='/appareil/';else if(t.includes('défis photo')||t.trim()==='défis')u='/defis/';else if(t.includes('classement')&&location.pathname!='/puzzle')u='/classement/';else if(t.includes('récompenses'))u='/recompenses/';else if(t.trim()==='accueil'||t.includes('toutes les animations'))u='/accueil';if(u&&a.getAttribute('href')!==u){e.preventDefault();location.assign(u)}});</script>`;
    next = next.replace('</body>', `${audit}</body>`);
  }

  return next;
}

try {
  const files = await walk(distDir);
  for (const file of files.filter(f => f.endsWith('.html'))) {
    const html = await fs.readFile(file, 'utf8');
    const patched = canonicalizeHtml(html, file);
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