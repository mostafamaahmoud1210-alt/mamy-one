const url = require('node:url');
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

  const parsedUrl = url.parse(req.url, true);

  // Resolve true pathname:
  // 1. From Vercel's x-matched-path header (e.g. "/api/auth/login")
  // 2. From __path query parameter from vercel.json rewrite (e.g. "auth/login")
  // 3. From req.url
  let pathname = req.headers['x-matched-path']
              || req.headers['x-invoke-path']
              || (parsedUrl.query && parsedUrl.query.__path ? '/api/' + String(parsedUrl.query.__path).replace(/^\/+/, '') : null)
              || parsedUrl.pathname;

  // Clean pathname of query strings
  pathname = url.parse(pathname).pathname;

  // Strip trailing slashes
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  // If pointing to index.js, fallback to query parameter or x-matched-path
  if (pathname === '/api/index.js' || pathname === '/api/index' || pathname === '/api') {
    if (parsedUrl.query && parsedUrl.query.__path) {
      pathname = '/api/' + String(parsedUrl.query.__path).replace(/^\/+/, '');
    } else if (req.headers['x-matched-path']) {
      pathname = url.parse(req.headers['x-matched-path']).pathname;
    }
  }

  // Ensure pathname starts with /api
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
      await handleApi(req, res, pathname, parsedUrl.query, body || {});
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
