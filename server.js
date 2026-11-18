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
  let openCount = 0;
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      openCount++;
      if (client.clientInfo) {
        users.push(client.clientInfo);
      }
    }
  }
  broadcast({ type: 'usersList', users, count: openCount || 1 });
}

function handleChat(ws, textData) {
  let m;
  try {
    m = JSON.parse(textData);
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

  // Initialize default client info immediately upon connection
  ws.clientInfo = { name: 'Anon', freq: 10100, mode: 'am', device: 'Unknown' };
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
    if (isBinary) {
      tcpSocket.write(message);
      return;
    }

    const textData = message.toString('utf8');
    try {
      const m = JSON.parse(textData);
      if (m && m.type === 'chat') {
        handleChat(ws, textData);
      } else if (m && m.type === 'status') {
        const name = clean(m.name, 24) || 'Anon';
        const device = clean(m.device, 20) || 'Unknown';
        const freq = typeof m.freq === 'number' ? m.freq : 10100;
        const mode = clean(m.mode, 10) || 'am';

        const isFirstRealStatus = ws.clientInfo.device === 'Unknown';
        ws.clientInfo = { name, freq, mode, device };
        broadcastUserStates();

        if (isFirstRealStatus && name !== 'Anon') {
          const sysMsg = {
            type: 'sys',
            text: `* ${name} joined the receiver (${device})`,
            t: Date.now()
          };
          history.push(sysMsg);
          if (history.length > MAX_HISTORY) history.shift();
          broadcast(sysMsg);
        }
      }
    } catch (e) {
      console.error('Failed to parse text frame:', e.message);
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
    // Defer broadcast slightly so the socket is fully removed from wss.clients
    setImmediate(broadcastUserStates);
  });

  ws.on('error', () => {
    tcpSocket.destroy();
  });
});
