function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), { ...init, headers });
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

    if (url.pathname.startsWith('/api/')) {
      return json({
        ok: false,
        error: 'API not migrated to Cloudflare yet.',
        staging: true,
      }, { status: 501 });
    }

    return env.ASSETS.fetch(request);
  },
};
