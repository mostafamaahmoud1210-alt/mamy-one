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
  let pathname = parsedUrl.pathname;

  // Normalize pathname to ensure it starts with /api
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
