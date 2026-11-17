require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon'
};

const apiRoutes = [
  { pattern: /^\/api\/health\/?$/, handler: require('./api/health') },
  { pattern: /^\/api\/auth\/register\/?$/, handler: require('./api/auth/register') },
  { pattern: /^\/api\/auth\/login\/?$/, handler: require('./api/auth/login') },
  { pattern: /^\/api\/auth\/logout\/?$/, handler: require('./api/auth/logout') },
  { pattern: /^\/api\/auth\/me\/?$/, handler: require('./api/auth/me') },
  { pattern: /^\/api\/listings\/?$/, handler: require('./api/listings/index') },
  {
    pattern: /^\/api\/listings\/([^/]+)\/?$/,
    handler: require('./api/listings/[id]'),
    paramName: 'id'
  },
  { pattern: /^\/api\/compare\/?$/, handler: require('./api/compare') },
  { pattern: /^\/api\/storefront\/?$/, handler: require('./api/storefront') },
  { pattern: /^\/api\/inquiries\/?$/, handler: require('./api/inquiries') },
  { pattern: /^\/api\/reservations\/?$/, handler: require('./api/reservations/index') },
  {
    pattern: /^\/api\/reservations\/([^/]+)\/?$/,
    handler: require('./api/reservations/[id]'),
    paramName: 'id'
  },
  { pattern: /^\/api\/admin\/queue\/?$/, handler: require('./api/admin/queue') },
  {
    pattern: /^\/api\/admin\/verify\/([^/]+)\/?$/,
    handler: require('./api/admin/verify/[id]'),
    paramName: 'id'
  },
  {
    pattern: /^\/api\/admin\/listings\/([^/]+)\/?$/,
    handler: require('./api/admin/listings/[id]'),
    paramName: 'id'
  },
  { pattern: /^\/api\/admin\/audit\/?$/, handler: require('./api/admin/audit') }
];

function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      if (pathname.startsWith('/api/')) {
        for (const route of apiRoutes) {
          const match = pathname.match(route.pattern);
          if (match) {
            req.query = Object.fromEntries(parsedUrl.searchParams.entries());
            if (route.paramName && match[1]) {
              req.query[route.paramName] = decodeURIComponent(match[1]);
            }
            return await route.handler(req, res);
          }
        }
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(JSON.stringify({ error: `API route not found: ${pathname}` }));
      }

      let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.(\/|\\|$))+/, '');
      if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
      }

      let filePath = path.join(PUBLIC_DIR, safePath);
      if (!fs.existsSync(filePath) && !path.extname(filePath)) {
        const htmlCandidate = `${filePath}.html`;
        if (fs.existsSync(htmlCandidate)) {
          filePath = htmlCandidate;
        }
      }

      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end('<h1>404 - Page Not Found</h1><p><a href="/index.html">Return to MotoSheba Home</a></p>');
      }

      const ext = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      fs.createReadStream(filePath).pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Internal server error: ' + err.message }));
    }
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`MotoSheba server listening on http://localhost:${PORT}`);
  });
}

module.exports = { createServer };
