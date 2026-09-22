import { Buffer } from 'node:buffer';
import { HitKissRoom, WeddingState, type AppEnv } from './state';

export { HitKissRoom, WeddingState };

const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']);
const NAV_PATHS = new Set(['/accueil', '/appareil', '/photos-mariage', '/videos-mariage', '/defis', '/classement', '/recompenses', '/partage', '/hit-kiss', '/puzzle', '/animateur', '/admin-defis', '/mur', '/dj', '/roue']);

const GLOBAL_NAV = `<style>
  body{padding-bottom:92px!important}
  body>.global-game-nav,body>.wedding-nav{display:none!important}
  .lg-global-nav{position:fixed;z-index:99999;left:50%;bottom:12px;transform:translateX(-50%);display:flex;align-items:center;gap:5px;max-width:calc(100vw - 20px);padding:7px;border:1px solid #eadbbf;border-radius:18px;background:#fffaf4f2;box-shadow:0 14px 45px #0008;backdrop-filter:blur(14px);overflow-x:auto;scrollbar-width:none}
  .lg-global-nav::-webkit-scrollbar{display:none}
  .lg-global-nav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:74px;padding:7px 9px;border-radius:12px;color:#172542!important;text-decoration:none!important;font:800 10px Inter,system-ui,sans-serif!important;white-space:nowrap}
  .lg-global-nav a:hover,.lg-global-nav a[aria-current="page"]{background:#efe2c9}
  .lg-global-nav b{font-size:20px;line-height:1}
  @media(max-width:650px){.lg-global-nav{left:8px;right:8px;bottom:8px;transform:none;justify-content:flex-start}.lg-global-nav a{min-width:68px;padding:7px 6px}}
</style><nav class="lg-global-nav" aria-label="Navigation du mariage">
  <a href="/accueil/"><b>🏠</b><span>Accueil</span></a>
  <a href="/appareil/"><b>📷</b><span>Appareil</span></a>
  <a href="/photos-mariage/"><b>🖼️</b><span>Photos mariage</span></a>
  <a href="/videos-mariage/"><b>🎬</b><span>Vidéos mariage</span></a>
  <a href="/hit-kiss/"><b>🎵</b><span>Hit & Kiss</span></a>
  <a href="/puzzle"><b>🧩</b><span>Notre histoire</span></a>
  <a href="/classement/"><b>🏆</b><span>Classement</span></a>
  <a href="/animateur/"><b>🔐</b><span>ADMIN</span></a>
</nav><script>
(() => {
  const cleanInterface = () => {
    document.querySelectorAll('a[href*="change=1"]').forEach(link => link.remove());
    document.querySelectorAll('body *:not(script):not(style)').forEach(element => {
      if (element.children.length) return;
      const text = element.textContent || '';
      if (/régie/i.test(text)) element.textContent = text.replace(/régie/gi, 'ADMIN');
      if (/^espace animateur$/i.test(text.trim())) element.textContent = 'ADMIN';
    });
    const current = location.pathname.replace(/\\/+$/, '') || '/';
    document.querySelectorAll('.lg-global-nav a').forEach(link => {
      const target = new URL(link.href).pathname.replace(/\\/+$/, '') || '/';
      if (target === current) link.setAttribute('aria-current', 'page');
    });
  };
  cleanInterface();
  new MutationObserver(cleanInterface).observe(document.body, { childList: true, subtree: true });
})();
</script>`;

function addGlobalNavigation(response: Response, pathname: string) {
  const normalizedPath = pathname.replace(/\/+$/, '') || '/';
  if (!NAV_PATHS.has(normalizedPath) || !response.headers.get('content-type')?.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store, no-cache, must-revalidate');
  return new HTMLRewriter().on('body', { element(body) { body.append(GLOBAL_NAV, { html: true }); } }).transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}

function json(data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers); headers.set('content-type', 'application/json; charset=utf-8'); headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

function cleanSegment(value: unknown, fallback: string) {
  const cleaned = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return cleaned || fallback;
}

function extensionFor(type: string) {
  if (type === 'image/png') return 'png'; if (type === 'image/webp') return 'webp'; if (type === 'video/mp4') return 'mp4'; if (type === 'video/webm') return 'webm'; if (type === 'video/quicktime') return 'mov'; return 'jpg';
}

async function safeEqual(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(provided)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function isAdmin(request: Request, env: AppEnv, body?: Record<string, unknown>) {
  const supplied = request.headers.get('x-admin-pin') || String(body?.pin || '');
  return Boolean(env.ADMIN_PIN) && await safeEqual(supplied, env.ADMIN_PIN || '');
}

function stateStub(env: AppEnv) { return env.WEDDING_STATE.getByName('laura-giovanni-2026'); }

function photoInfo(object: R2Object) {
  const parts = object.key.split('/'); const table = parts[1] || 'Sans-table'; const filename = parts.at(-1) || '';
  const match = filename.match(/^(.*?)_(?:PEL|VIDEO)(\d+)_(\d+)_/);
  return { table, guest: match?.[1] || 'Invite', roll: Number(match?.[2] || 1), shot: Number(match?.[3] || 1) };
}

async function listAllPhotos(bucket: R2Bucket) {
  const all: R2Object[] = []; let cursor: string | undefined;
  do { const page = await bucket.list({ prefix: 'mariage-2026/', limit: 1000, cursor }); all.push(...page.objects); cursor = page.truncated ? page.cursor : undefined; } while (cursor);
  return all.filter(item => item.size > 0 && !item.key.startsWith('mariage-2026-system/')).sort((a, b) => b.uploaded.getTime() - a.uploaded.getTime());
}

async function photoPayload(env: AppEnv, object: R2Object) {
  const analysis = await stateStub(env).getAnalysis(object.key);
  return { key: object.key, size: object.size, modified: object.uploaded, ...photoInfo(object), analysis, url: `/api/media?key=${encodeURIComponent(object.key)}` };
}

function mediaKind(key: string) {
  const lower = key.toLowerCase();
  if (lower.includes('_video') || /\.(mp4|webm|mov|m4v)$/i.test(lower)) return 'video';
  return 'photo';
}

function mediaName(key: string) {
  return (key.split('/').at(-1) || 'souvenir').replace(/[\r\n"]/g, '_');
}

async function galleryPayload(bucket: R2Bucket, kind: 'photo' | 'video') {
  const objects = await listAllPhotos(bucket);
  return objects.filter(object => mediaKind(object.key) === kind).map(object => {
    const info = photoInfo(object);
    const official = info.table === 'galerie-photos' || info.table === 'galerie-videos';
    return {
      key: object.key,
      kind,
      size: object.size,
      modified: object.uploaded,
      ...info,
      guest: official ? 'Laura & Giovanni' : info.guest,
      official,
      sourceLabel: official ? 'Galerie des mariés' : `Table ${info.table}`,
      name: mediaName(object.key),
      url: `/api/media?key=${encodeURIComponent(object.key)}`,
      downloadUrl: `/api/download?key=${encodeURIComponent(object.key)}`,
    };
  });
}

async function uploadToR2(request: Request, env: AppEnv) {
  const form = await request.formData(); const file = form.get('photo') || form.get('file');
  if (!(file instanceof File) || !ALLOWED_UPLOAD_TYPES.has(file.type)) return json({ ok: false, error: 'Photo ou vidéo manquante, ou format invalide.' }, { status: 415 });
  if (file.size > MAX_UPLOAD_BYTES) return json({ ok: false, error: 'Fichier trop volumineux (100 Mo maximum).' }, { status: 413 });
  const table = cleanSegment(form.get('table'), 'Sans-table'); const guest = cleanSegment(form.get('guest'), 'Invite');
  const roll = String(Math.max(1, Number.parseInt(String(form.get('roll') || '1'), 10) || 1)).padStart(2, '0'); const shot = String(Math.max(1, Number.parseInt(String(form.get('shot') || '1'), 10) || 1)).padStart(2, '0');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); const kind = file.type.startsWith('video/') ? 'VIDEO' : 'PEL';
  const filename = `${guest}_${kind}${roll}_${shot}_${timestamp}.${extensionFor(file.type)}`; const key = `mariage-2026/${table}/${filename}`;
  await env.WEDDING_BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type, cacheControl: 'private, max-age=0, no-store' }, customMetadata: { guest, table, roll, shot, uploadedat: new Date().toISOString() } });
  return json({ ok: true, key, filename }, { status: 201 });
}

async function dashboard(env: AppEnv) {
  const objects = await listAllPhotos(env.WEDDING_BUCKET); const tables = new Map<string, number>(); const guests = new Set<string>(); const now = Date.now(); let photosLast5Minutes = 0;
  for (const object of objects) { const info = photoInfo(object); tables.set(info.table, (tables.get(info.table) || 0) + 1); guests.add(info.guest); if (now - object.uploaded.getTime() <= 300000) photosLast5Minutes += 1; }
  const recent = await Promise.all(objects.slice(0, 80).map(object => photoPayload(env, object)));
  return { ok: true, generatedAt: new Date().toISOString(), total: objects.length, guestCount: guests.size, tableCount: tables.size, photosLast5Minutes, aiConfigured: Boolean(env.OPENAI_API_KEY), lastModified: objects[0]?.uploaded || null, tables: [...tables.entries()].sort((a, b) => b[1] - a[1]).map(([name, count], index) => ({ name, count, rank: index + 1 })), recent };
}

function clampText(value: unknown, max: number, fallback = '') { return String(value || fallback).trim().slice(0, max); }

async function analyzeImage(env: AppEnv, key: string, guest: string, table: string) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY non configurée.');
  const object = await env.WEDDING_BUCKET.get(key); if (!object) throw new Error('Photo introuvable.');
  if (object.size > 12 * 1024 * 1024) throw new Error('Cette photo est trop volumineuse pour l’analyse IA.');
  const mime = object.httpMetadata?.contentType || 'image/jpeg'; const imageUrl = `data:${mime};base64,${Buffer.from(await object.arrayBuffer()).toString('base64')}`;
  const prompt = `Tu animes un jeu de mariage appelé « Sosie IA », basé réellement sur le cliché joint. Observe uniquement des éléments visibles et non sensibles : coiffure, barbe, lunettes, accessoires, tenue, couleurs, expression, posture, composition et ambiance. Ne prétends jamais reconnaître ou identifier une personne réelle, une célébrité ou un personnage protégé. Ne déduis pas l’identité, l’origine, la santé, la religion ou d’autres données sensibles. Génère trois personnages-archétypes ORIGINAUX et spécifiques à cette photo, classés du plus convaincant au moins convaincant. Ils doivent être variés, drôles, bienveillants et fondés sur les indices observés. Donne aussi 3 à 6 observations concrètes. Réponds uniquement en JSON valide : {"emoji":"","title":"","comment":"","badge":"","score":0,"observations":[""],"profiles":[{"emoji":"","title":"","score":0,"reason":""},{"emoji":"","title":"","score":0,"reason":""},{"emoji":"","title":"","score":0,"reason":""}]}. Prénom déclaré : ${guest}. Table : ${table}.`;
  const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.AI_VISION_MODEL || 'gpt-5-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, { type: 'input_image', image_url: imageUrl, detail: 'high' }] }], max_output_tokens: 700 }) });
  if (!response.ok) throw new Error(`OpenAI ${response.status}`);
  const data = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  const output = data.output_text || data.output?.flatMap(item => item.content || []).find(item => item.type === 'output_text')?.text || '';
  const parsed = JSON.parse(output.replace(/^```json\s*|\s*```$/g, '').trim()) as Record<string, unknown>;
  const profiles = (Array.isArray(parsed.profiles) ? parsed.profiles : []).slice(0, 3).map((item, index) => { const profile = item as Record<string, unknown>; return { emoji: clampText(profile.emoji, 8, '🎭'), title: clampText(profile.title, 80, `Profil ${index + 1}`), score: Math.max(0, Math.min(100, Number(profile.score || 0))), reason: clampText(profile.reason, 220, 'Profil fondé sur les éléments visibles.') }; });
  if (!profiles.length) throw new Error('Réponse IA incomplète.'); const best = profiles[0];
  return { emoji: clampText(parsed.emoji, 8, best.emoji), title: clampText(parsed.title, 80, best.title), comment: clampText(parsed.comment, 300, `${guest} révèle un profil inattendu : ${best.title}.`), badge: clampText(parsed.badge, 80, best.title), score: Math.max(0, Math.min(100, Number(parsed.score ?? best.score))), observations: (Array.isArray(parsed.observations) ? parsed.observations : []).slice(0, 6).map(item => clampText(item, 120)).filter(Boolean), profiles, source: 'openai-vision', createdAt: new Date().toISOString() };
}

async function handleApi(request: Request, env: AppEnv, url: URL): Promise<Response> {
  if (url.pathname === '/api/cloudflare-health' || url.pathname === '/api/health') { const listed = await env.WEDDING_BUCKET.list({ limit: 1 }); return json({ ok: true, platform: 'cloudflare-workers', storage: 'cloudflare-r2', r2Connected: true, aiConfigured: Boolean(env.OPENAI_API_KEY), sampleObjects: listed.objects.length }); }
  if (url.pathname === '/api/cloudflare-self-test') { const key = `mariage-2026-system/e2e-${crypto.randomUUID()}.txt`; try { await env.WEDDING_BUCKET.put(key, 'ok'); const object = await env.WEDDING_BUCKET.get(key); const value = object ? await object.text() : ''; await env.WEDDING_BUCKET.delete(key); return json({ ok: value === 'ok', r2ReadWriteDelete: value === 'ok' }, { status: value === 'ok' ? 200 : 503 }); } catch (error) { await env.WEDDING_BUCKET.delete(key); return json({ ok: false, error: error instanceof Error ? error.message : 'R2 self-test failed' }, { status: 503 }); } }
  if (url.pathname === '/api/upload' && request.method === 'POST') return uploadToR2(request, env);
  if (url.pathname === '/api/media' && request.method === 'GET') { const key = url.searchParams.get('key') || ''; if (!key.startsWith('mariage-2026/') || key.includes('..')) return new Response('Not found', { status: 404 }); const object = await env.WEDDING_BUCKET.get(key); if (!object) return new Response('Not found', { status: 404 }); const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('cache-control', 'private, max-age=300'); return new Response(object.body, { headers }); }
  if (url.pathname === '/api/gallery' && request.method === 'GET') { const kind = url.searchParams.get('kind') === 'video' ? 'video' : 'photo'; const items = await galleryPayload(env.WEDDING_BUCKET, kind); return json({ ok: true, kind, total: items.length, items }); }
  if (url.pathname === '/api/download' && request.method === 'GET') { const key = url.searchParams.get('key') || ''; if (!key.startsWith('mariage-2026/') || key.includes('..')) return new Response('Not found', { status: 404 }); const object = await env.WEDDING_BUCKET.get(key); if (!object) return new Response('Not found', { status: 404 }); const headers = new Headers(); object.writeHttpMetadata(headers); headers.set('etag', object.httpEtag); headers.set('cache-control', 'private, max-age=60'); headers.set('content-disposition', `attachment; filename="${mediaName(key)}"`); return new Response(object.body, { headers }); }
  if (url.pathname === '/api/dashboard' && request.method === 'GET') return json(await dashboard(env));
  if (url.pathname === '/api/admin/verify' && request.method === 'GET') return await isAdmin(request, env) ? json({ ok: true }) : json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 });
  if (url.pathname === '/api/photo' && request.method === 'DELETE') { const body = await request.json<Record<string, unknown>>(); if (!await isAdmin(request, env, body)) return json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 }); const key = String(body.key || ''); if (!key.startsWith('mariage-2026/') || key.includes('..')) return json({ ok: false, error: 'Référence invalide.' }, { status: 400 }); await env.WEDDING_BUCKET.delete(key); return json({ ok: true }); }
  if (url.pathname === '/api/admin/photos' && request.method === 'GET') { if (!await isAdmin(request, env)) return json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 }); const objects = await listAllPhotos(env.WEDDING_BUCKET); return json({ ok: true, total: objects.length, photos: await Promise.all(objects.slice(0, 500).map(object => photoPayload(env, object))) }); }
  if (url.pathname === '/api/challenges' && request.method === 'GET') { const table = cleanSegment(url.searchParams.get('table'), ''); return json({ ok: true, ...await stateStub(env).getChallenges(table) }); }
  if (url.pathname === '/api/challenges/complete' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); const table = cleanSegment(body.table, ''); return json({ ok: true, ...await stateStub(env).completeChallenge(table, String(body.challengeId || '')) }); }
  if (url.pathname === '/api/admin/challenges' && request.method === 'GET') { if (!await isAdmin(request, env)) return json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 }); return json({ ok: true, ...await stateStub(env).adminChallenges() }); }
  if (url.pathname === '/api/admin/challenges/action' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); if (!await isAdmin(request, env, body)) return json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 }); return json({ ok: true, ...await stateStub(env).adminChallengeAction(cleanSegment(body.table, ''), String(body.action || ''), Number(body.points || 0), String(body.challengeId || '')) }); }
  if (url.pathname === '/api/admin/reset-game' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); if (!await isAdmin(request, env, body)) return json({ ok: false, error: 'Code administrateur incorrect.' }, { status: 401 }); const game = String(body.game || ''); if (game === 'puzzle') return json({ ok: true, ...await stateStub(env).resetPuzzleResults() }); if (game === 'challenges') return json({ ok: true, ...await stateStub(env).resetChallengeResults() }); return json({ ok: false, error: 'Jeu inconnu.' }, { status: 400 }); }
  if (url.pathname === '/api/puzzle/results' && request.method === 'GET') return json({ ok: true, results: await stateStub(env).puzzleResults() });
  if (url.pathname === '/api/puzzle/submit' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); const result = await stateStub(env).submitPuzzle({ team: String(body.team || '').slice(0, 160), teamKey: String(body.teamKey || '').slice(0, 160), attempt: 0, order: Array.isArray(body.order) ? body.order.map(Number).slice(0, 21) : [], exact: Number(body.exact || 0), distance: Number(body.distance || 0), score: Number(body.score || 0), elapsed: Number(body.elapsed || 0), createdAt: Date.now() }); return json({ ok: true, result }); }
  if (url.pathname === '/api/ai/analyze' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); const key = String(body.key || ''); if (!key.startsWith('mariage-2026/') || key.includes('..')) return json({ ok: false, error: 'Photo invalide.' }, { status: 400 }); const cached = await stateStub(env).getAnalysis(key); if (cached && !body.force) return json({ ok: true, configured: true, analysis: cached }); const analysis = await analyzeImage(env, key, String(body.guest || 'Invité').slice(0, 60), String(body.table || 'Sans table').slice(0, 60)); await stateStub(env).saveAnalysis(key, analysis); return json({ ok: true, configured: true, analysis }); }
  if (url.pathname === '/api/ai/speech' && request.method === 'POST') { const body = await request.json<Record<string, unknown>>(); const text = String(body.text || '').trim().slice(0, 500); if (!text) return json({ ok: false, error: 'Texte manquant.' }, { status: 400 }); if (!env.OPENAI_API_KEY) return json({ ok: false, error: 'Voix IA non configurée.' }, { status: 503 }); const response = await fetch('https://api.openai.com/v1/audio/speech', { method: 'POST', headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: env.AI_TTS_MODEL || 'gpt-4o-mini-tts', voice: env.AI_VOICE || 'onyx', input: text, response_format: 'mp3', instructions: 'Voix française chaleureuse, énergique et théâtrale de présentateur de mariage.' }) }); if (!response.ok) return json({ ok: false, error: 'Voix IA indisponible.' }, { status: 502 }); return new Response(response.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } }); }
  if (url.pathname === '/api/hit-kiss/ws') { const room = env.HIT_KISS.getByName('laura-giovanni-2026'); return room.fetch(request); }
  if (url.pathname === '/api/hit-kiss/health') return json({ ok: true, realtime: 'durable-object-websocket' });
  return json({ ok: false, error: 'API inconnue.' }, { status: 404 });
}

export default {
  async fetch(request: Request, env: AppEnv): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(request, env, url);
      // Serve the SPA shell without requesting /index.html directly: with
      // html_handling enabled, Cloudflare canonicalises /index.html to /,
      // which previously made the Puzzle card bounce back to the homepage.
      if (url.pathname === '/puzzle' || url.pathname === '/puzzle/') return addGlobalNavigation(await env.ASSETS.fetch(new Request(new URL('/', url), request)), url.pathname);
      return addGlobalNavigation(await env.ASSETS.fetch(request), url.pathname);
    } catch (error) {
      console.error(JSON.stringify({ message: 'request failed', path: url.pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ ok: false, error: error instanceof Error ? error.message : 'Erreur interne.' }, { status: 500 });
    }
  },
} satisfies ExportedHandler<AppEnv>;
