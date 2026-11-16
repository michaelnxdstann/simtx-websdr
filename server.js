const WebSocket = require('ws');
const net = require('net');

// Fly.io automatically assigns a PORT via environment variables (defaults to 6080 locally)
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

  tcpSocket.on('data', (data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  });

  ws.on('message', (message) => {
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