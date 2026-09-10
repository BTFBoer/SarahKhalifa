const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DEEPSEEK_API_KEY;
const PORT = process.env.PORT || 3000;

if (!API_KEY) {
  console.error('\n  Missing DEEPSEEK_API_KEY.');
  console.error('  Get one at https://platform.deepseek.com/api_keys\n');
  console.error('  macOS/Linux:  export DEEPSEEK_API_KEY=sk-xxxx');
  console.error('  Windows CMD:  set DEEPSEEK_API_KEY=sk-xxxx\n');
  process.exit(1);
}

function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {

  // --- serve the UI ---
  if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
    fs.readFile(path.join(__dirname, 'index.html'), (err, html) => {
      if (err) return sendJSON(res, 500, { error: 'index.html not found next to server.js' });
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    });
    return;
  }

  // --- proxy to DeepSeek ---
  if (req.method === 'POST' && req.url === '/api/chat') {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 500000) req.destroy(); });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(raw); }
      catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON body' }); }

      const upstream = https.request({
        hostname: 'api.deepseek.com',
        path: '/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + API_KEY,
          'Accept': payload.stream ? 'text/event-stream' : 'application/json'
        }
      }, up => {
        // pass status + content-type straight through, including errors
        res.writeHead(up.statusCode, {
          'Content-Type': up.headers['content-type'] || 'application/json',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no'
        });
        up.pipe(res);
      });

      upstream.on('error', err => {
        if (!res.headersSent) sendJSON(res, 502, { error: 'Upstream error: ' + err.message });
        else res.end();
      });

      upstream.write(JSON.stringify(payload));
      upstream.end();
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, () => {
  console.log('\n  Mia is up →  http://localhost:' + PORT + '\n');
});