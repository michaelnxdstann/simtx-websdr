const WebSocket = require('ws');
const net = require('net');

const PORT = process.env.PORT || 6080;
const RTL_HOST = '193.24.208.6';
const RTL_PORT = 1240;

const wss = new WebSocket.Server({ port: PORT });
console.log(`WebSocket-to-TCP bridge listening on port ${PORT}, forwarding to ${RTL_HOST}:${RTL_PORT}`);

wss.on('connection', (ws) => {
  console.log('Client connected');
  const tcpSocket = new net.Socket();

  tcpSocket.connect(RTL_PORT, RTL_HOST, () => {
    console.log(`Connected to rtl_tcp at ${RTL_HOST}:${RTL_PORT}`);
  });

  // Forward raw RTL TCP data to this specific client
  tcpSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  // Handle incoming messages from the client (SDR commands or Chat broadcasts)
  ws.on('message', (message) => {
    // Check if it's a chat message (string / JSON)
    if (typeof message === 'string' || isJsonString(message)) {
      // Broadcast chat to all OTHER connected clients
      wss.clients.forEach((client) => {
        if (client !== ws && client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } else {
      // Binary SDR command data -> forward to TCP
      tcpSocket.write(message);
    }
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

function isJsonString(str) {
  try {
    const parsed = JSON.parse(str);
    return typeof parsed === 'object' && parsed !== null;
  } catch (e) {
    return false;
  }
}
