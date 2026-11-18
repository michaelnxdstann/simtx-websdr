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

function broadcastUserStates() {
  const users = [];
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN && client.clientInfo) {
      users.push(client.clientInfo);
    }
  }
  broadcast({ type: 'usersList', users, count: wss.clients.size });
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
  if (now - (ws.lastChat || 0) < 300) return;
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
  broadcastUserStates();

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
    // If it's explicitly a binary buffer or flagged as binary, forward to rtl_tcp
    if (isBinary || Buffer.isBuffer(message)) {
      tcpSocket.write(message);
      return;
    }

    // Otherwise treat as text/JSON frame (Chat or Status)
    try {
      const textData = message.toString();
      const m = JSON.parse(textData);
      if (m && m.type === 'chat') {
        handleChat(ws, textData);
      } else if (m && m.type === 'status') {
        ws.clientInfo = { name: clean(m.name, 24), freq: m.freq, mode: m.mode };
        broadcastUserStates();
      }
    } catch (e) {
      // Fallback if raw string
      handleChat(ws, message);
    }
  });

  tcpSocket.on('close', () => {
    ws.close();
  });

  tcpSocket.on('error', () => {
    ws.close();
  });

  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    tcpSocket.destroy();
    broadcastUserStates();
  });

  ws.on('error', () => {
    tcpSocket.destroy();
  });
});
