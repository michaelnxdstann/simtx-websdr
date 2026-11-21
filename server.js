// rtl_tcp <-> WebSocket bridge for cloudflared.
// Usage: npm i ws && node server.js
const http = require('http');
const net = require('net');
const { WebSocketServer } = require('ws');
const C = require('./config');

const CMD = { freq: 0x01, rate: 0x02, gainMode: 0x03, gain: 0x04, agc: 0x08 };
const send = (s, c, v) => { const b = Buffer.alloc(5); b[0] = c; b.writeUInt32BE(v >>> 0, 1); s.write(b); };

function setGain(s, g) {
  if (g === null || g === undefined) { send(s, CMD.gainMode, 0); send(s, CMD.agc, 1); }
  else { send(s, CMD.gainMode, 1); send(s, CMD.agc, 0); send(s, CMD.gain, Math.round(g * 10)); }
}

const httpServer = http.createServer((req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end('bridge running');
});

const wss = new WebSocketServer({ server: httpServer });
wss.on('connection', (ws, req) => {
  const clientIp = req.headers['cf-connecting-ip'] || req.socket.remoteAddress;
  console.log('client', clientIp);
  const s = net.connect(C.RTL_PORT, C.RTL_HOST);
  let skip = 12; // rtl_tcp sends a 12-byte "RTL0" header first

  s.on('connect', () => {
    send(s, CMD.rate, C.SAMPLE_RATE);
    send(s, CMD.freq, C.CENTER_FREQ + C.UPCONVERTER);
    setGain(s, C.GAIN);
  });
  s.on('data', (d) => {
    if (skip > 0) { const k = Math.min(skip, d.length); skip -= k; d = d.subarray(k); }
    if (d.length && ws.readyState === 1 && ws.bufferedAmount < 4e6) ws.send(d);
  });
  s.on('error', (e) => { console.log('rtl_tcp:', e.message); ws.close(); });
  s.on('close', () => ws.close());

  ws.on('message', (m) => {
    try {
      const j = JSON.parse(m);
      if (j.t === 'freq') {
        const rf = j.v - C.UPCONVERTER;
        if (rf >= C.MIN_FREQ && rf <= C.MAX_FREQ) send(s, CMD.freq, j.v);
      }
      else if (j.t === 'rate') send(s, CMD.rate, j.v);
      else if (j.t === 'gain') setGain(s, j.v);
    } catch (e) { /* ignore bad messages */ }
  });
  ws.on('close', () => s.destroy());
});

httpServer.listen(C.WS_PORT, '127.0.0.1', () => {
  console.log('bridge running');
});