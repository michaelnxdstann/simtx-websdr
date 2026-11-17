const WebSocket = require('ws');
const net = require('net');

// Fly.io automatically assigns a PORT via environment variables (defaults to 6080 locally)
const PORT = process.env.PORT || 6080;
const RTL_HOST = '193.24.208.6';
const RTL_PORT = 1240;

// maxPayload: rtl_tcp commands are 5 bytes and chat lines are small, so keep client frames tiny
const wss = new WebSocket.Server({ port: PORT, maxPayload: 4096 });
console.log(`WebSocket-to-TCP bridge listening on port ${PORT}, forwarding to ${RTL_HOST}:${RTL_PORT}`);

// ---- chat: text frames = chat, binary frames = rtl_tcp (unchanged)
const history = [];                       // last chat messages, sent to people who join later
const MAX_HISTORY = 30;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function broadcast(obj) {
  const text = JSON.stringify(obj);       // a string is sent as a text frame
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(text);
  }
}

function handleChat(ws, message) {
  let m;
  try { m = JSON.parse(message.toString()); } catch (e) { return; }
  if (!m || m.type !== 'chat') return;

  const text = clean(m.text, 200);
  if (!text) return;

  const now = Date.now();
  if (now - (ws.lastChat || 0) < 700) return;   // simple flood limit: one message per 0.7 s per person
  ws.lastChat = now;

  const out = { type: 'chat', name: clean(m.name, 24) || 'Anon', text, t: now };
  history.push(out);
  if (history.length > MAX_HISTORY) history.shift();
  console.log(`chat <${out.name}> ${out.text}`);
  broadcast(out);                               // everyone using the receiver, including the sender
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  const tcpSocket = new net.Socket();

  for (const h of history) ws.send(JSON.stringify(h));   // recent chat for the new listener

  tcpSocket.connect(RTL_PORT, RTL_HOST, () => {
    console.log(`Connected to rtl_tcp at ${RTL_HOST}:${RTL_PORT}`);
  });

  tcpSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ws.on('message', (message, isBinary) => {
    if (!isBinary) return handleChat(ws, message);
    tcpSocket.write(message);
  });

  tcpSocket.on('close', () => {
    console.log('TCP connection closed');
    ws.close();
  });

  tcpSocket.on('error', (err) => {
    console.error('TCP error:', err.message);
    ws.close();
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    tcpSocket.destroy();
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    tcpSocket.destroy();
  });
});
