// ISKorea 방문 카운터 (Cloudflare Worker + D1)
const APPS = ['heat', 'wcl', 'home'];
const ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?iskorea\.org$/;

// 한국 시간(KST) 기준 날짜
const today = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = ORIGIN_RE.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    // 방문 기록: POST /hit?app=heat
    if (req.method === 'POST' && url.pathname === '/hit') {
      const app = url.searchParams.get('app');
      if (!allowed || !APPS.includes(app)) return new Response('bad request', { status: 400, headers: cors });
      await env.DB.prepare(
        'INSERT INTO daily (app, day, n) VALUES (?1, ?2, 1) ON CONFLICT(app, day) DO UPDATE SET n = n + 1'
      ).bind(app, today()).run();
      return new Response(null, { status: 204, headers: cors });
    }

    // 통계 조회: GET /stats
    if (req.method === 'GET' && url.pathname === '/stats') {
      const { results } = await env.DB.prepare(
        'SELECT app, SUM(n) AS total, SUM(CASE WHEN day = ?1 THEN n ELSE 0 END) AS today FROM daily GROUP BY app'
      ).bind(today()).all();
      const out = {};
      for (const r of results) out[r.app] = { total: r.total, today: r.today };
      return new Response(JSON.stringify(out), {
        headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
      });
    }

    return new Response('not found', { status: 404, headers: cors });
  },
};
