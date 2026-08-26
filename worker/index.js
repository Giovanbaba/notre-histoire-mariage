function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
}

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

const ALLOWED_UPLOAD_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
  'video/quicktime',
]);

function extensionFor(type) {
  if (type === 'image/png') return 'png';
  if (type === 'image/webp') return 'webp';
  if (type === 'video/mp4') return 'mp4';
  if (type === 'video/webm') return 'webm';
  if (type === 'video/quicktime') return 'mov';
  return 'jpg';
}

async function uploadToR2(request, env) {
  try {
    const form = await request.formData();
    const file = form.get('photo') || form.get('file');
    if (!(file instanceof File) || !ALLOWED_UPLOAD_TYPES.has(file.type)) {
      return json({ ok: false, error: 'Photo ou vidéo manquante, ou format invalide.' }, { status: 415 });
    }

    // Keep uploads intentionally bounded on the public wedding endpoint.
    if (file.size > 100 * 1024 * 1024) {
      return json({ ok: false, error: 'Fichier trop volumineux (100 Mo maximum).' }, { status: 413 });
    }

    const table = cleanSegment(form.get('table'), 'Sans-table');
    const guest = cleanSegment(form.get('guest'), 'Invite');
    const roll = String(Math.max(1, parseInt(String(form.get('roll') || '1'), 10) || 1)).padStart(2, '0');
    const shot = String(Math.max(1, parseInt(String(form.get('shot') || '1'), 10) || 1)).padStart(2, '0');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = extensionFor(file.type);
    const kind = file.type.startsWith('video/') ? 'VIDEO' : 'PEL';
    const filename = `${guest}_${kind}${roll}_${shot}_${timestamp}.${extension}`;
    const key = `mariage-2026/${table}/${filename}`;

    await env.WEDDING_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
        cacheControl: 'private, max-age=0, no-store',
      },
      customMetadata: {
        guest,
        table,
        roll,
        shot,
        uploadedat: new Date().toISOString(),
      },
    });

    return json({ ok: true, key, filename }, { status: 201 });
  } catch (error) {
    return json({
      ok: false,
      error: 'Impossible d’envoyer le fichier vers Cloudflare R2.',
      detail: error instanceof Error ? error.message : 'Upload error',
    }, { status: 502 });
  }
}

async function serveSpa(request, env) {
  const indexUrl = new URL('/index.html', request.url);
  return env.ASSETS.fetch(new Request(indexUrl, { method: 'GET', headers: request.headers }));
}

async function proxyLegacyRealtime(request) {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, 'https://photos.laura-giova.be');
  const headers = new Headers(request.headers);
  headers.set('host', target.host);
  return fetch(new Request(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual',
  }));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/cloudflare-health') {
      try {
        const listed = await env.WEDDING_BUCKET.list({ limit: 1 });
        return json({
          ok: true,
          platform: 'cloudflare-workers',
          storage: 'cloudflare-r2',
          r2Connected: true,
          sampleObjects: listed.objects.length,
        });
      } catch (error) {
        return json({
          ok: false,
          platform: 'cloudflare-workers',
          storage: 'cloudflare-r2',
          r2Connected: false,
          error: error instanceof Error ? error.message : 'R2 unavailable',
        }, { status: 503 });
      }
    }

    if (url.pathname === '/api/upload' && request.method === 'POST') {
      return uploadToR2(request, env);
    }

    // Hit & Kiss still uses the existing Socket.IO backend during the staged migration.
    // This keeps the Cloudflare preview playable while no wedding photo upload passes through Railway.
    if (url.pathname.startsWith('/socket.io/')) {
      return proxyLegacyRealtime(request);
    }

    if (url.pathname.startsWith('/api/')) {
      return json({
        ok: false,
        error: 'Cette API n’est pas encore migrée vers Cloudflare.',
        staging: true,
      }, { status: 501 });
    }

    // /puzzle is a React SPA route and has no physical puzzle/index.html file.
    if (url.pathname === '/puzzle' || url.pathname === '/puzzle/') {
      return serveSpa(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
