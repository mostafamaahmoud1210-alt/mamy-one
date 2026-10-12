const http = require('node:http');
const url = require('node:url');
const fs = require('node:fs');
const path = require('node:path');
const { handleApi } = require('./routes');
const { startScheduler } = require('./scheduler');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

/**
 * Static file server helper
 */
function serveStaticFile(res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle API Requests
  if (pathname.startsWith('/api/')) {
    let rawBody = '';
    req.on('data', chunk => {
      rawBody += chunk;
      if (rawBody.length > 5 * 1024 * 1024) { // 5MB limit
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      let body = {};
      if (rawBody) {
        try {
          body = JSON.parse(rawBody);
        } catch (e) {
          try {
            const params = new URLSearchParams(rawBody);
            body = Object.fromEntries(params.entries());
          } catch (e2) {
            body = {};
          }
        }
      }

      handleApi(req, res, pathname, parsedUrl.query, body);
    });
    return;
  }

  // Handle Static Files & SPA Routing
  let targetFile = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // Security check: prevent directory traversal
  if (!targetFile.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.stat(targetFile, (err, stats) => {
    if (!err && stats.isFile()) {
      serveStaticFile(res, targetFile);
    } else {
      // SPA Fallback: Serve index.html for client-side routing
      const indexFile = path.join(PUBLIC_DIR, 'index.html');
      serveStaticFile(res, indexFile);
    }
  });
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\n[!] تنبيه: المنفذ ${PORT} قيد الاستخدام بالفعل. البرنامج يعمل بالفعل في نافذة أخرى.`);
    console.log(`يمكنك فتح الرابط مباشرة في المتصفح: http://localhost:${PORT}\n`);
  } else {
    console.error('Server error:', err);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  const msg = `
=============================================================
  نظام مامي وان لإدارة الحضانات (Mamy One Management System)
  المخدم يعمل بنجاح على: http://localhost:${PORT}
  جاهز للعمل - التوقيت المحلي: بتوقيت القاهرة (Africa/Cairo)
=============================================================
`;
  console.log(msg);
  // Start background notification scheduler
  startScheduler();
});
