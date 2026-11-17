const WebSocket = require('ws');
const net = require('net');

const PORT = process.env.PORT || 6080;
const RTL_HOST = '193.24.208.6';
const RTL_PORT = 1240;

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket-to-TCP bridge listening on port ${PORT}, forwarding to ${RTL_HOST}:${RTL_PORT}`);

const history = [];
const MAX_HISTORY = 30;

const clean = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);

function broadcast(obj) {
  const text = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(text);
    }
  }
}

function handleChat(ws, message) {
  let m;
  try {
    m = JSON.parse(message.toString());
  } catch (e) {
    return;
  }
  if (!m || m.type !== 'chat') return;

  const text = clean(m.text, 200);
  if (!text) return;

  const now = Date.now();
  if (now - (ws.lastChat || 0) < 500) return;
  ws.lastChat = now;

  const out = { type: 'chat', name: clean(m.name, 24) || 'Anon', text, t: now };
  history.push(out);
  if (history.length > MAX_HISTORY) history.shift();
  console.log(`chat <${out.name}> ${out.text}`);
  broadcast(out);
}

wss.on('connection', (ws) => {
  console.log('Client connected');
  const tcpSocket = new net.Socket();

  for (const h of history) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(h));
    }
  }

  tcpSocket.connect(RTL_PORT, RTL_HOST, () => {
    console.log(`Connected to rtl_tcp at ${RTL_HOST}:${RTL_PORT}`);
  });

  tcpSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ws.on('message', (message, isBinary) => {
    if (!isBinary) {
      handleChat(ws, message);
      return;
    }
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
