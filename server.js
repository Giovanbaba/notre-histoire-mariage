import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const recentUploads = new Map();
const CHALLENGE_STATE_KEY = 'mariage-2026-system/challenges.json';
let challengeWriteQueue = Promise.resolve();

const CHALLENGES = [
  { id: 'maries', emoji: '💍', title: 'Avec les mariés', text: 'Prenez une photo originale avec Laura et Giovanni.', points: 120 },
  { id: 'grimace', emoji: '😂', title: 'La grimace', text: 'Toute la table fait sa meilleure grimace.', points: 80 },
  { id: 'danse', emoji: '💃', title: 'Sur la piste', text: 'Réunissez toute votre table sur la piste de danse.', points: 150 },
  { id: 'coeur', emoji: '❤️', title: 'Un grand cœur', text: 'Formez un cœur collectif avec vos mains.', points: 90 },
  { id: 'generations', emoji: '👶', title: 'Les générations', text: 'Prenez une photo réunissant un enfant et un aîné.', points: 140 },
  { id: 'film', emoji: '🎬', title: 'Scène de cinéma', text: 'Recréez une scène de film reconnaissable.', points: 180 },
  { id: 'accessoire', emoji: '🎩', title: 'Accessoire surprise', text: 'Créez une photo drôle avec un accessoire inattendu.', points: 100 },
  { id: 'selfie', emoji: '🤳', title: 'Selfie géant', text: 'Faites entrer le plus de personnes possible dans un selfie.', points: 130 },
  { id: 'bisou', emoji: '😘', title: 'Pluie de bisous', text: 'Toute la table envoie un bisou aux mariés.', points: 70 },
  { id: 'lettres', emoji: '🔤', title: 'L & G', text: 'Formez les lettres L et G avec les invités.', points: 200 },
  { id: 'elegance', emoji: '✨', title: 'Photo élégante', text: 'Réalisez la photo la plus chic de votre table.', points: 110 },
  { id: 'fou-rire', emoji: '🤣', title: 'Fou rire', text: 'Capturez un véritable fou rire collectif.', points: 100 },
];

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function cleanSegment(value, fallback) {
  const cleaned = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
  return cleaned || fallback;
}
function readEnv(name) { const value = process.env[name]; return typeof value === 'string' ? value.trim() : ''; }
function r2ConfigState() {
  const values = { endpoint: readEnv('R2_ENDPOINT').replace(/\/+$/, ''), accessKeyId: readEnv('R2_ACCESS_KEY_ID'), secretAccessKey: readEnv('R2_SECRET_ACCESS_KEY'), bucket: readEnv('R2_BUCKET_NAME') };
  const missing = [];
  if (!values.endpoint) missing.push('R2_ENDPOINT');
  if (!values.accessKeyId) missing.push('R2_ACCESS_KEY_ID');
  if (!values.secretAccessKey) missing.push('R2_SECRET_ACCESS_KEY');
  if (!values.bucket) missing.push('R2_BUCKET_NAME');
  if (values.endpoint && values.bucket) values.endpoint = values.endpoint.replace(new RegExp(`/${encodeURIComponent(values.bucket)}$`), '').replace(new RegExp(`/${values.bucket}$`), '');
  return { configured: missing.length === 0, missing, values };
}
function r2Client(values) { return new S3Client({ region: 'auto', endpoint: values.endpoint, forcePathStyle: true, credentials: { accessKeyId: values.accessKeyId, secretAccessKey: values.secretAccessKey } }); }
function getClientIp(req) { return String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim(); }
function rateLimit(req, res, next) {
  const now = Date.now(), ip = getClientIp(req), entry = recentUploads.get(ip) || { count: 0, resetAt: now + 60_000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60_000; }
  entry.count += 1; recentUploads.set(ip, entry);
  if (entry.count > 40) return res.status(429).json({ ok: false, error: 'Trop de requêtes en peu de temps.' });
  next();
}
function requireAdmin(req, res, next) {
  const configuredPin = readEnv('ADMIN_PIN');
  if (!configuredPin) return res.status(503).json({ ok: false, error: 'ADMIN_PIN non configuré sur Railway.' });
  const suppliedPin = String(req.headers['x-admin-pin'] || req.body?.pin || '');
  if (suppliedPin !== configuredPin) return res.status(401).json({ ok: false, error: 'Code administrateur incorrect.' });
  next();
}
async function listAllPhotos(client, bucket) {
  const all = []; let continuationToken;
  do {
    const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'mariage-2026/', MaxKeys: 1000, ContinuationToken: continuationToken }));
    all.push(...(page.Contents || [])); continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  return all.filter(o => o.Key && o.Size > 0 && !o.Key.startsWith('mariage-2026-system/')).sort((a, b) => new Date(b.LastModified || 0) - new Date(a.LastModified || 0));
}
function photoInfo(object) {
  const parts = String(object.Key || '').split('/'), table = parts[1] || 'Sans-table', filename = parts.at(-1) || '';
  const match = filename.match(/^(.*?)_PEL(\d+)_(\d+)_/);
  return { table, guest: match?.[1] || 'Invite', roll: Number(match?.[2] || 1), shot: Number(match?.[3] || 1) };
}
async function readChallengeState(client, bucket) {
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: CHALLENGE_STATE_KEY }));
    const parsed = JSON.parse(await result.Body.transformToString());
    return parsed && typeof parsed === 'object' ? parsed : { tables: {} };
  } catch (error) {
    if (error?.name === 'NoSuchKey' || error?.$metadata?.httpStatusCode === 404) return { tables: {} };
    throw error;
  }
}
async function writeChallengeState(client, bucket, state) {
  await client.send(new PutObjectCommand({ Bucket: bucket, Key: CHALLENGE_STATE_KEY, Body: JSON.stringify(state), ContentType: 'application/json', CacheControl: 'no-store' }));
}
function normalizeTableData(data = {}) {
  return { completed: Array.isArray(data.completed) ? data.completed : [], score: Number(data.score || 0), bonus: Number(data.bonus || 0), blocked: Boolean(data.blocked), updatedAt: data.updatedAt || null };
}
function leaderboardFromState(state) {
  return Object.entries(state.tables || {}).map(([name, raw]) => { const data = normalizeTableData(raw); return { name, score: data.score, completed: data.completed.length, blocked: data.blocked, updatedAt: data.updatedAt }; }).sort((a, b) => b.score - a.score || b.completed - a.completed || a.name.localeCompare(b.name)).map((row, index) => ({ ...row, rank: index + 1 }));
}
async function mutateChallengeState(config, mutation) {
  return (challengeWriteQueue = challengeWriteQueue.then(async () => {
    const client = r2Client(config.values), state = await readChallengeState(client, config.values.bucket);
    state.tables ||= {};
    const result = await mutation(state);
    await writeChallengeState(client, config.values.bucket, state);
    return result ?? state;
  }));
}

app.get('/api/health', (_req, res) => {
  const state = r2ConfigState();
  res.status(state.configured ? 200 : 503).json({ ok: state.configured, storage: 'cloudflare-r2', storageConfigured: state.configured, missingVariables: state.missing });
});

app.post('/api/upload', rateLimit, upload.single('photo'), async (req, res) => {
  try {
    const state = r2ConfigState();
    if (!state.configured) return res.status(503).json({ ok: false, error: 'Cloudflare R2 n’est pas configuré.', missingVariables: state.missing });
    if (!req.file || !req.file.mimetype.startsWith('image/')) return res.status(400).json({ ok: false, error: 'Photo manquante ou format invalide.' });
    if (!new Set(['image/jpeg', 'image/png', 'image/webp']).has(req.file.mimetype)) return res.status(415).json({ ok: false, error: 'Format de photo non accepté.' });
    const { bucket } = state.values, table = cleanSegment(req.body.table, 'Sans-table'), guest = cleanSegment(req.body.guest, 'Invite');
    const roll = String(Math.max(1, Number.parseInt(req.body.roll || '1', 10) || 1)).padStart(2, '0');
    const shot = String(Math.max(1, Number.parseInt(req.body.shot || '1', 10) || 1)).padStart(2, '0');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = req.file.mimetype === 'image/png' ? 'png' : req.file.mimetype === 'image/webp' ? 'webp' : 'jpg';
    const filename = `${guest}_PEL${roll}_${shot}_${timestamp}.${extension}`, key = `mariage-2026/${table}/${filename}`;
    await r2Client(state.values).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype, CacheControl: 'private, max-age=0, no-store', Metadata: { guest, table, roll, shot, uploadedat: new Date().toISOString() } }));
    res.status(201).json({ ok: true, key, filename });
  } catch (error) { console.error('R2 upload error:', error?.message || error); res.status(502).json({ ok: false, error: 'Impossible d’envoyer la photo vers le cloud.' }); }
});

app.delete('/api/photo', rateLimit, async (req, res) => {
  try {
    const state = r2ConfigState();
    if (!state.configured) return res.status(503).json({ ok: false, error: 'Cloudflare R2 n’est pas configuré.' });
    const key = String(req.body?.key || '');
    if (!key.startsWith('mariage-2026/') || key.includes('..')) return res.status(400).json({ ok: false, error: 'Référence de photo invalide.' });
    await r2Client(state.values).send(new DeleteObjectCommand({ Bucket: state.values.bucket, Key: key }));
    res.json({ ok: true });
  } catch (error) { console.error('R2 delete error:', error?.message || error); res.status(502).json({ ok: false, error: 'Impossible de supprimer la photo du cloud.' }); }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const state = r2ConfigState(); if (!state.configured) return res.status(503).json({ ok: false });
    const client = r2Client(state.values), objects = await listAllPhotos(client, state.values.bucket), tables = new Map(), guests = new Set(), now = Date.now(); let photosLast5Minutes = 0;
    for (const object of objects) { const info = photoInfo(object); tables.set(info.table, (tables.get(info.table) || 0) + 1); guests.add(info.guest); if (now - new Date(object.LastModified || 0).getTime() <= 300000) photosLast5Minutes += 1; }
    const recent = await Promise.all(objects.slice(0, 36).map(async object => { const info = photoInfo(object); return { key: object.Key, size: object.Size, modified: object.LastModified, ...info, url: await getSignedUrl(client, new GetObjectCommand({ Bucket: state.values.bucket, Key: object.Key }), { expiresIn: 300 }) }; }));
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, generatedAt: new Date().toISOString(), total: objects.length, guestCount: guests.size, tableCount: tables.size, photosLast5Minutes, lastModified: objects[0]?.LastModified || null, tables: [...tables.entries()].sort((a, b) => b[1] - a[1]).map(([name, count], index) => ({ name, count, rank: index + 1 })), recent });
  } catch (error) { console.error('Dashboard error:', error?.message || error); res.status(502).json({ ok: false, error: 'Dashboard indisponible.' }); }
});

app.get('/api/challenges', async (req, res) => {
  try {
    const config = r2ConfigState(); if (!config.configured) return res.status(503).json({ ok: false });
    const table = cleanSegment(req.query.table, '');
    const state = await readChallengeState(r2Client(config.values), config.values.bucket);
    const current = table ? normalizeTableData(state.tables?.[table]) : normalizeTableData();
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, challenges: CHALLENGES, table, completed: current.completed, score: current.score, blocked: current.blocked, leaderboard: leaderboardFromState(state) });
  } catch (error) { console.error('Challenge read error:', error?.message || error); res.status(502).json({ ok: false, error: 'Défis indisponibles.' }); }
});

app.post('/api/challenges/complete', rateLimit, async (req, res) => {
  const table = cleanSegment(req.body?.table, ''), challengeId = String(req.body?.challengeId || '');
  const challenge = CHALLENGES.find(item => item.id === challengeId);
  if (!table || !challenge) return res.status(400).json({ ok: false, error: 'Table ou défi invalide.' });
  try {
    const config = r2ConfigState(); if (!config.configured) return res.status(503).json({ ok: false });
    const result = await mutateChallengeState(config, state => {
      const current = normalizeTableData(state.tables[table]);
      if (current.blocked) throw new Error('Cette table est temporairement bloquée.');
      if (!current.completed.includes(challengeId)) { current.completed.push(challengeId); current.score += challenge.points; current.updatedAt = new Date().toISOString(); state.tables[table] = current; }
      return { completed: current.completed, score: current.score, leaderboard: leaderboardFromState(state) };
    });
    res.json({ ok: true, ...result });
  } catch (error) { challengeWriteQueue = Promise.resolve(); console.error('Challenge write error:', error?.message || error); res.status(502).json({ ok: false, error: error?.message || 'Impossible de valider le défi.' }); }
});

app.get('/api/admin/challenges', requireAdmin, async (_req, res) => {
  try {
    const config = r2ConfigState(); if (!config.configured) return res.status(503).json({ ok: false });
    const state = await readChallengeState(r2Client(config.values), config.values.bucket);
    const tables = Object.entries(state.tables || {}).map(([name, raw]) => ({ name, ...normalizeTableData(raw) })).sort((a, b) => b.score - a.score);
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, challenges: CHALLENGES, tables, leaderboard: leaderboardFromState(state) });
  } catch (error) { res.status(502).json({ ok: false, error: 'Administration indisponible.' }); }
});

app.post('/api/admin/challenges/action', requireAdmin, rateLimit, async (req, res) => {
  const table = cleanSegment(req.body?.table, '');
  const action = String(req.body?.action || '');
  if (!table) return res.status(400).json({ ok: false, error: 'Table invalide.' });
  try {
    const config = r2ConfigState(); if (!config.configured) return res.status(503).json({ ok: false });
    const result = await mutateChallengeState(config, state => {
      const current = normalizeTableData(state.tables[table]);
      if (action === 'adjust') {
        const delta = Math.max(-2000, Math.min(2000, Number(req.body?.points || 0)));
        current.score = Math.max(0, current.score + delta);
        current.bonus += delta;
      } else if (action === 'remove-challenge') {
        const id = String(req.body?.challengeId || '');
        const challenge = CHALLENGES.find(item => item.id === id);
        if (!challenge || !current.completed.includes(id)) throw new Error('Défi non trouvé pour cette table.');
        current.completed = current.completed.filter(item => item !== id);
        current.score = Math.max(0, current.score - challenge.points);
      } else if (action === 'add-challenge') {
        const id = String(req.body?.challengeId || '');
        const challenge = CHALLENGES.find(item => item.id === id);
        if (!challenge) throw new Error('Défi inconnu.');
        if (!current.completed.includes(id)) { current.completed.push(id); current.score += challenge.points; }
      } else if (action === 'toggle-block') {
        current.blocked = !current.blocked;
      } else if (action === 'reset') {
        state.tables[table] = normalizeTableData();
        return { table: state.tables[table], leaderboard: leaderboardFromState(state) };
      } else if (action === 'delete-table') {
        delete state.tables[table];
        return { deleted: true, leaderboard: leaderboardFromState(state) };
      } else throw new Error('Action inconnue.');
      current.updatedAt = new Date().toISOString(); state.tables[table] = current;
      return { table: current, leaderboard: leaderboardFromState(state) };
    });
    res.json({ ok: true, ...result });
  } catch (error) { challengeWriteQueue = Promise.resolve(); res.status(400).json({ ok: false, error: error?.message || 'Action impossible.' }); }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => { if (req.method !== 'GET' || req.path.startsWith('/api/')) return next(); res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
app.listen(PORT, '0.0.0.0', () => { const state = r2ConfigState(); console.log(`L’appareil photo de Lau & Gio listening on port ${PORT}`); console.log(`R2 configured: ${state.configured ? 'yes' : 'no'}`); });