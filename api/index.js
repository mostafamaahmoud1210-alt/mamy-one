const { handleApi } = require('../routes');
const { runInDbContext } = require('../db');

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL cleanly using WHATWG URL (no deprecation warning)
  let parsedUrl;
  try {
    parsedUrl = new URL(req.url, 'http://localhost');
  } catch (e) {
    parsedUrl = { pathname: req.url || '/', searchParams: new URLSearchParams() };
  }

  // Extract query parameters
  const query = {};
  if (parsedUrl.searchParams) {
    for (const [key, val] of parsedUrl.searchParams.entries()) {
      if (key !== 'slug') query[key] = val;
    }
  }
  if (req.query) {
    for (const [key, val] of Object.entries(req.query)) {
      if (key !== 'slug') query[key] = val;
    }
  }

  // Resolve true API pathname
  let pathname;
  if (req.query && req.query.slug) {
    const slugParts = Array.isArray(req.query.slug) ? req.query.slug : [req.query.slug];
    pathname = '/api/' + slugParts.join('/');
  } else if (req.headers && req.headers['x-matched-path']) {
    pathname = req.headers['x-matched-path'];
  } else if (query.__path) {
    pathname = '/api/' + String(query.__path).replace(/^\/+/, '');
  } else {
    pathname = parsedUrl.pathname || '/api';
  }

  // Normalize pathname
  pathname = pathname.replace(/\/+$/, ''); // remove trailing slash
  if (!pathname.startsWith('/api')) {
    pathname = '/api' + (pathname.startsWith('/') ? pathname : '/' + pathname);
  }

  // Handle body parsing (supports pre-parsed Vercel body or raw stream)
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      try {
        const params = new URLSearchParams(body);
        body = Object.fromEntries(params.entries());
      } catch (e2) {
        body = {};
      }
    }
  } else if (!body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => { data += chunk; });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          try {
            const params = new URLSearchParams(data);
            resolve(Object.fromEntries(params.entries()));
          } catch (e2) {
            resolve({});
          }
        }
      });
      req.on('error', () => resolve({}));
    });
  }

  try {
    await runInDbContext(async () => {
      await handleApi(req, res, pathname, query, body || {});
    });
  } catch (err) {
    console.error('API Error in Vercel function:', err);
    if (!res.headersSent) {
      res.writeHead(500, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(JSON.stringify({ success: false, error: 'Internal Server Error', details: err.message }));
    }
  }
};
