import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 1 },
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

function cleanSegment(value, fallback) {
  const cleaned = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return cleaned || fallback;
}

function webdavConfig() {
  const baseUrl = process.env.NAS_WEBDAV_URL?.replace(/\/+$/, '');
  const username = process.env.NAS_WEBDAV_USER;
  const password = process.env.NAS_WEBDAV_PASSWORD;
  const uploadToken = process.env.UPLOAD_TOKEN;
  if (!baseUrl || !username || !password || !uploadToken) return null;
  return { baseUrl, username, password, uploadToken };
}

function authHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

async function ensureCollection(url, headers) {
  const response = await fetch(url, { method: 'MKCOL', headers });
  if (![201, 405].includes(response.status)) {
    const body = await response.text().catch(() => '');
    throw new Error(`MKCOL ${response.status}: ${body.slice(0, 200)}`);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, storageConfigured: Boolean(webdavConfig()) });
});

app.post('/api/upload', upload.single('photo'), async (req, res) => {
  try {
    const config = webdavConfig();
    if (!config) {
      return res.status(503).json({ ok: false, error: 'Stockage NAS non configuré.' });
    }

    if (req.get('x-upload-token') !== config.uploadToken) {
      return res.status(401).json({ ok: false, error: 'Jeton invalide.' });
    }

    if (!req.file || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ ok: false, error: 'Photo manquante ou format invalide.' });
    }

    const table = cleanSegment(req.body.table, 'Sans-table');
    const guest = cleanSegment(req.body.guest, 'Invite');
    const roll = String(Math.max(1, Number.parseInt(req.body.roll || '1', 10) || 1)).padStart(2, '0');
    const shot = String(Math.max(1, Number.parseInt(req.body.shot || '1', 10) || 1)).padStart(2, '0');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const filename = `${table}_${guest}_PEL${roll}_${shot}_${timestamp}.${extension}`;

    const headers = { Authorization: authHeader(config.username, config.password) };
    const tableUrl = `${config.baseUrl}/${encodeURIComponent(table)}`;
    await ensureCollection(tableUrl, headers);

    const destination = `${tableUrl}/${encodeURIComponent(filename)}`;
    const response = await fetch(destination, {
      method: 'PUT',
      headers: {
        ...headers,
        'Content-Type': req.file.mimetype,
        'Content-Length': String(req.file.size),
      },
      body: req.file.buffer,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`PUT ${response.status}: ${body.slice(0, 200)}`);
    }

    res.status(201).json({ ok: true, filename });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(502).json({ ok: false, error: 'Impossible d’envoyer la photo vers le NAS.' });
  }
});

app.use(express.static(path.join(__dirname, 'dist')));
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Laura & Giovanni app listening on port ${PORT}`);
});
