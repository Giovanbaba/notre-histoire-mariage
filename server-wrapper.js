import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const VERSION = '20260901-2216';

const URLS = {
  home: 'https://www.laura-giova.be/',
  camera: 'https://photos.laura-giova.be/appareil/',
  hitKiss: 'https://photos.laura-giova.be/hit-kiss/',
  puzzle: 'https://photos.laura-giova.be/puzzle',
  challenges: 'https://photos.laura-giova.be/defis/',
  ranking: 'https://photos.laura-giova.be/classement/',
  rewards: 'https://photos.laura-giova.be/recompenses/',
  animateur: 'https://photos.laura-giova.be/animateur/'
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

function gameDock() {
  const urls = JSON.stringify(URLS);
  return `<style data-lg-unified-dock>
  .global-game-nav,.wedding-nav{display:none!important}
  #lg-game-dock{position:fixed;z-index:2147483000;left:50%;bottom:max(8px,env(safe-area-inset-bottom));transform:translateX(-50%);display:grid;grid-template-columns:repeat(6,minmax(54px,1fr));gap:4px;width:min(640px,calc(100vw - 16px));padding:6px;border-radius:22px;background:rgba(255,250,241,.96);border:1px solid rgba(95,73,33,.18);box-shadow:0 14px 42px rgba(0,0,0,.24);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
  #lg-game-dock a{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:8px 3px;border-radius:14px;color:#20263b;text-decoration:none;font-size:10px;font-weight:800;line-height:1.05;text-align:center;-webkit-tap-highlight-color:transparent}
  #lg-game-dock a .lg-dock-icon{font-size:21px;line-height:1}
  #lg-game-dock a.active{background:#ead9b1;color:#17233e}
  #lg-game-dock a:focus-visible{outline:2px solid #b9944f;outline-offset:2px}
  @media(min-width:760px){#lg-game-dock{width:min(610px,calc(100vw - 32px));bottom:16px}#lg-game-dock a{font-size:12px;padding:9px 7px}}
  body{padding-bottom:max(86px,calc(78px + env(safe-area-inset-bottom)))!important}
  </style>
  <nav id="lg-game-dock" aria-label="Navigation du mariage">
    <a data-lg-tab="home" href="${URLS.home}"><span class="lg-dock-icon">🏠</span><span>Accueil</span></a>
    <a data-lg-tab="camera" href="${URLS.camera}"><span class="lg-dock-icon">📸</span><span>Photos</span></a>
    <a data-lg-tab="hitKiss" href="${URLS.hitKiss}"><span class="lg-dock-icon">🎵</span><span>Hit &amp; Kiss</span></a>
    <a data-lg-tab="puzzle" href="${URLS.puzzle}"><span class="lg-dock-icon">🧩</span><span>Notre histoire</span></a>
    <a data-lg-tab="ranking" href="${URLS.ranking}"><span class="lg-dock-icon">🏆</span><span>Classement</span></a>
    <a data-lg-tab="animateur" href="${URLS.animateur}"><span class="lg-dock-icon">🔐</span><span>Admin</span></a>
  </nav>
  <script data-lg-unified-dock-script>(()=>{const p=location.pathname.replace(/\\\/+$/,'')||'/';let active='home';if(p.startsWith('/hit-kiss'))active='hitKiss';else if(p==='/puzzle'||p.startsWith('/puzzle/'))active='puzzle';else if(p==='/classement')active='ranking';else if(p==='/animateur'||p.startsWith('/animateur/'))active='animateur';else if(['/appareil','/defis','/recompenses','/mur','/partage','/photos'].some(x=>p===x||p.startsWith(x+'/')))active='camera';else if(p==='/accueil')active='home';const el=document.querySelector('#lg-game-dock [data-lg-tab="'+active+'"]');if(el){el.classList.add('active');el.setAttribute('aria-current','page')}})();</script>`;
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

  // Ajoute exactement le même dock sur toutes les pages HTML du site.
  if (!next.includes('data-lg-unified-dock')) {
    next = next.replace('</body>', `${gameDock()}</body>`);
  }

  // Le texte visible du bouton détermine sa destination officielle.
  if (!next.includes('data-lg-link-audit')) {
    const urls = JSON.stringify(URLS);
    const audit = `<script data-lg-link-audit>(()=>{const U=${urls};document.addEventListener('click',e=>{const a=e.target.closest('a');if(!a)return;const t=(a.textContent||'').toLowerCase().replace(/\\s+/g,' ').trim();let u='';if(t.includes('hit & kiss')||t.includes('hit and kiss'))u=U.hitKiss;else if(t.includes('notre histoire')||t.includes('puzzle'))u=U.puzzle;else if(t.includes('appareil photo')||t==='photos')u=U.camera;else if(t.includes('défis photo')||t==='défis')u=U.challenges;else if(t.includes('classement')&&location.pathname!='/puzzle')u=U.ranking;else if(t.includes('récompenses'))u=U.rewards;else if(t==='accueil'||t.includes('toutes les animations')||t.includes('retour à l’accueil'))u=U.home;if(u&&a.href!==u){e.preventDefault();location.assign(u)}})})();</script>`;
    next = next.replace('</body>', `${audit}</body>`);
  }

  // La régie générale partage son accès avec Hit & Kiss sur le même appareil.
  if (!next.includes('data-lg-admin-handoff')) {
    const adminHandoff = `<script data-lg-admin-handoff>(()=>{const p=location.pathname.replace(/\\\/+$/,'')||'/';if(p==='/animateur'){const form=document.querySelector('#loginForm'),input=document.querySelector('#pin'),app=document.querySelector('#app');let candidate='';const saved=sessionStorage.getItem('lg-admin-pin')||'';if(saved&&input&&!input.value)input.value=saved;form?.addEventListener('submit',()=>{candidate=(input?.value||'').trim();if(!candidate)return;let tries=0;const check=()=>{if(app&&!app.classList.contains('hidden')){sessionStorage.setItem('lg-admin-pin',candidate);const link=[...document.querySelectorAll('a')].find(a=>(a.textContent||'').includes('Gérer Hit & Kiss'));if(link)link.href='/hit-kiss/?admin=1';return}if(++tries<30)setTimeout(check,100)};setTimeout(check,100)});const link=[...document.querySelectorAll('a')].find(a=>(a.textContent||'').includes('Gérer Hit & Kiss'));if(link)link.href='/hit-kiss/?admin=1';}document.addEventListener('click',e=>{const target=e.target.closest('a,button');if(!target)return;const text=(target.textContent||'').toLowerCase().replace(/\\s+/g,' ').trim();if((text==='régie animateur'||text==='admin')&&!p.startsWith('/hit-kiss')){e.preventDefault();location.assign('${URLS.animateur}')}})})();</script>`;
    next = next.replace('</body>', `${adminHandoff}</body>`);
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

  console.log(`Wedding links audited, normalized and unified dock injected (${VERSION}).`);
} catch (error) {
  console.error('Unable to audit wedding links:', error);
}

await import('./server.js');
