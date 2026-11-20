#!/usr/bin/env node
/* bridge.js: runs everything on your PC. No npm install needed.
 *
 *   node bridge.js              start the bridge + a cloudflared quick tunnel
 *   node bridge.js --push       also commit/push server.json after the link changes (git repo)
 *   node bridge.js --no-tunnel  bridge only (use your own tunnel)
 *
 * - WebSocket <-> rtl_tcp bridge at /rtl
 * - serves index.html, config.json, server.json
 * - starts "cloudflared tunnel --url http://localhost:PORT", reads the new
 *   trycloudflare.com link and writes it into server.json
 * Host/port of rtl_tcp come from config.json (source.host / source.port),
 * or the env vars RTL_HOST / RTL_PORT. Listen port: PORT (default 8080).
 */
const http = require('http'), net = require('net'), fs = require('fs'), path = require('path');
const crypto = require('crypto'), { spawn, execFile } = require('child_process');

const args = process.argv.slice(2);
const cfg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')).source || {}; } catch {}
  return {};
})();
const RTL_HOST = process.env.RTL_HOST || cfg.host || '193.24.208.6';
const RTL_PORT = +(process.env.RTL_PORT || cfg.port || 1234);
const PORT = +(process.env.PORT || 8080);
const WS_PATH = cfg.wsPath || '/rtl';
const FILES = { '/index.html': 'text/html; charset=utf-8', '/config.json': 'application/json', '/server.json': 'application/json' };

/* ---------- static files ---------- */
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  if (!FILES[p]) { res.writeHead(404); return res.end('Not found'); }
  fs.readFile(path.join(__dirname, p), (e, d) => {
    if (e) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': FILES[p], 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
    res.end(d);
  });
});

/* ---------- minimal WebSocket server (RFC 6455) ---------- */
function frame(op, payload) {
  const n = payload.length;
  let h;
  if (n < 126) h = Buffer.from([0x80 | op, n]);
  else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(n, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeUInt32BE(0, 2); h.writeUInt32BE(n, 6); }
  return Buffer.concat([h, payload]);
}

server.on('upgrade', (req, socket) => {
  if (req.url.split('?')[0] !== WS_PATH || !req.headers['sec-websocket-key']) { socket.destroy(); return; }
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
  socket.setNoDelay(true);
  console.log(`client connected -> ${RTL_HOST}:${RTL_PORT}`);

  const rtl = net.connect(RTL_PORT, RTL_HOST);
  rtl.setNoDelay(true);
  let closed = false, first = true, left = null, buf = Buffer.alloc(0);
  const close = () => { if (closed) return; closed = true; try { socket.end(frame(8, Buffer.alloc(0))); } catch {} socket.destroy(); rtl.destroy(); console.log('client disconnected'); };

  /* rtl_tcp -> browser (drop the "RTL0" header, keep I/Q pairs aligned, drop data if the tunnel is slow) */
  rtl.on('data', d => {
    if (first) { first = false; if (d.length >= 12 && d.toString('latin1', 0, 4) === 'RTL0') d = d.subarray(12); }
    if (left) { d = Buffer.concat([left, d]); left = null; }
    if (d.length & 1) { left = d.subarray(d.length - 1); d = d.subarray(0, d.length - 1); }
    if (d.length && !closed && socket.writableLength < 2e6) socket.write(frame(2, d));
  });
  rtl.on('error', e => { console.error('rtl_tcp error:', e.message); close(); });
  rtl.on('close', close);

  /* browser -> rtl_tcp (5-byte commands) */
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const op = buf[0] & 15, masked = buf[1] & 128;
      let len = buf[1] & 127, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = buf.readUInt32BE(6); off = 10; }
      const mlen = masked ? 4 : 0;
      if (buf.length < off + mlen + len) return;
      const mask = masked ? buf.subarray(off, off + 4) : null;
      const data = Buffer.from(buf.subarray(off + mlen, off + mlen + len));
      if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
      buf = buf.subarray(off + mlen + len);
      if (op === 8) return close();
      if (op === 9) socket.write(frame(10, data));
      else if ((op === 1 || op === 2 || op === 0) && rtl.writable) rtl.write(data);
    }
  });
  socket.on('close', close);
  socket.on('error', close);
});

/* ---------- cloudflared quick tunnel -> server.json ---------- */
let lastLink = '';
function publish(link) {
  if (link === lastLink) return;
  lastLink = link;
  fs.writeFileSync(path.join(__dirname, 'server.json'), JSON.stringify({ url: link }, null, 2) + '\n');
  console.log('\n  tunnel link: ' + link + '\n  written to server.json\n');
  if (args.includes('--push')) {
    const git = a => new Promise(r => execFile('git', a, { cwd: __dirname }, (e, o, s) => r(e ? (s || e.message).trim() : '')));
    (async () => {
      await git(['add', 'server.json']);
      await git(['commit', '-m', 'tunnel link']);
      const err = await git(['push']);
      console.log(err ? 'git push failed: ' + err : 'server.json pushed');
    })();
  }
}
function startTunnel() {
  const cf = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${PORT}`]);
  cf.on('error', e => console.error(e.code === 'ENOENT'
    ? 'cloudflared not found in PATH. Install it, or run: node bridge.js --no-tunnel'
    : 'cloudflared error: ' + e.message));
  const onLog = d => {
    const t = d.toString();
    const m = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (m) publish(m[0]);
    if (/\bERR\b/.test(t)) process.stderr.write(t.split('\n').filter(l => /\bERR\b/.test(l)).join('\n') + '\n');
  };
  cf.stdout.on('data', onLog); cf.stderr.on('data', onLog);
  cf.on('exit', c => { console.log('cloudflared exited (' + c + '), restarting in 5 s'); setTimeout(startTunnel, 5000); });
  process.on('exit', () => cf.kill());
  process.on('SIGINT', () => { cf.kill(); process.exit(); });
}

server.listen(PORT, () => {
  console.log(`bridge on http://localhost:${PORT}  (WebSocket ${WS_PATH})`);
  console.log(`rtl_tcp: ${RTL_HOST}:${RTL_PORT}`);
  if (args.includes('--no-tunnel')) console.log('tunnel: skipped (--no-tunnel)');
  else { console.log('starting cloudflared…'); startTunnel(); }
});