// Loopback-only static preview server. Never serves credentials or private configuration.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../launcher');
const port = /^[0-9]{4,5}$/.test(process.env.PORT || '') ? Number(process.env.PORT) : 4173;
// Only top-level page files of launcher/ (no subdirectories, no dotfiles); the preview config.js holds no private data.
const allowedName = /^[a-z][a-z0-9-]*\.(html|css|js|png)$/;
const types = {'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.png':'image/png'};
http.createServer((req, res) => {
  const name = req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0].slice(1);
  if (!allowedName.test(name)) { res.writeHead(404); res.end('Not found'); return; }
  fs.readFile(path.join(root, name), (error, data) => {
    if (error) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, {'Content-Type':types[path.extname(name)], 'Cache-Control':'no-store'}); res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Launcher preview: http://127.0.0.1:' + port));
