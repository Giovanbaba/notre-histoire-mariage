import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const recentUploads = new Map();

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
  if (entry.count > 40) return res.status(429).json({ ok: false, error: 'Trop de photos envoyées en peu de temps.' });
  next();
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
    const filename = `${guest}_PEL${roll}_${shot}_${timestamp}.${extension}`;
    const key = `mariage-2026/${table}/${filename}`;
    await r2Client(state.values).send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype, CacheControl: 'private, max-age=0, no-store', Metadata: { guest, table, roll, shot, uploadedat: new Date().toISOString() } }));
    console.log(`R2 upload successful: ${key} (${req.file.size} bytes)`);
    res.status(201).json({ ok: true, key, filename });
  } catch (error) {
    console.error('R2 upload error:', { name: error?.name, message: error?.message, code: error?.Code || error?.code, status: error?.$metadata?.httpStatusCode });
    res.status(502).json({ ok: false, error: 'Impossible d’envoyer la photo vers le cloud.' });
  }
});

app.get('/api/dashboard', async (_req, res) => {
  try {
    const state = r2ConfigState();
    if (!state.configured) return res.status(503).json({ ok: false });
    const client = r2Client(state.values);
    const listed = await client.send(new ListObjectsV2Command({ Bucket: state.values.bucket, Prefix: 'mariage-2026/', MaxKeys: 500 }));
    const objects = (listed.Contents || []).filter(o => o.Key && o.Size > 0).sort((a, b) => new Date(b.LastModified || 0) - new Date(a.LastModified || 0));
    const tables = {};
    for (const o of objects) { const table = o.Key.split('/')[1] || 'Sans-table'; tables[table] = (tables[table] || 0) + 1; }
    const recent = await Promise.all(objects.slice(0, 24).map(async o => ({ key: o.Key, size: o.Size, modified: o.LastModified, url: await getSignedUrl(client, new GetObjectCommand({ Bucket: state.values.bucket, Key: o.Key }), { expiresIn: 300 }) })));
    res.json({ ok: true, total: objects.length, tables: Object.entries(tables).sort((a,b)=>b[1]-a[1]).map(([name,count])=>({name,count})), recent });
  } catch (error) {
    console.error('Dashboard error:', error?.message || error);
    res.status(502).json({ ok: false, error: 'Dashboard indisponible.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => { if (req.method !== 'GET' || req.path.startsWith('/api/')) return next(); res.sendFile(path.join(__dirname, 'dist', 'index.html')); });
app.listen(PORT, '0.0.0.0', () => { const state = r2ConfigState(); console.log(`L’appareil photo de Lau & Gio listening on port ${PORT}`); console.log(`R2 configured: ${state.configured ? 'yes' : 'no'}`); });