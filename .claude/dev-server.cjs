const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');

// Rewrites from vercel.json
const rewrites = {
  '/dashboard': '/public/pages/dashboard.html',
  '/actions': '/public/pages/actions.html',
  '/projects': '/public/pages/projects.html',
  '/record': '/public/pages/record.html',
  '/today': '/public/pages/today.html',
  '/settings': '/public/pages/settings.html',
  '/context': '/public/pages/context.html',
  '/patterns': '/public/pages/patterns.html',
  '/radar': '/public/pages/radar.html',
  '/gmail': '/public/pages/gmail.html',
  '/insights': '/public/pages/insights.html',
  '/folders': '/public/pages/folders.html',
  '/finance': '/public/pages/finance.html',
  '/app.css': '/public/css/app.css',
  '/app.js': '/public/js/app.js',
  '/sw.js': '/public/sw.js',
  '/manifest.json': '/public/manifest.json',
  '/icon-192.png': '/public/icons/icon-192.png',
  '/icon-512.png': '/public/icons/icon-512.png',
  '/apple-touch-icon.png': '/public/icons/apple-touch-icon.png',
};

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;

  // API proxy to production
  if (pathname.startsWith('/api/')) {
    const https = require('https');
    const opts = {
      hostname: 'eolys-assistant.vercel.app',
      port: 443,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: 'eolys-assistant.vercel.app' },
    };
    const proxy = https.request(opts, (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    });
    proxy.on('error', () => { res.writeHead(502); res.end('Bad Gateway'); });
    req.pipe(proxy);
    return;
  }

  // Redirect / -> /dashboard
  if (pathname === '/') {
    res.writeHead(302, { Location: '/dashboard' });
    res.end();
    return;
  }

  // Apply rewrites
  let filePath;
  if (rewrites[pathname]) {
    filePath = path.join(ROOT, rewrites[pathname]);
  } else {
    // Try public directory
    filePath = path.join(PUBLIC, pathname);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(3002, () => console.log('Dev server ready on http://localhost:3002'));
