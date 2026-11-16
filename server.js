// server.js — Zero-dependency WebSocket-to-TCP Bridge for SimTX (No npm/ws required!)
const http = require('http');
const net = require('net');
const crypto = require('crypto');

const PORT = 6080;
const SIMTX_HOST = '193.24.208.6';
const SIMTX_PORT = 1240;

// Encode a raw TCP buffer into a WebSocket frame (Server -> Browser)
function encodeWsFrame(buffer, opcode = 0x02) {
    const len = buffer.length;
    let header;
    if (len < 126) {
        header = Buffer.alloc(2);
        header[0] = 0x80 | opcode;
        header[1] = len;
    } else if (len < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(len, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x80 | opcode;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(len), 2);
    }
    return Buffer.concat([header, buffer]);
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SimTX WebSocket Bridge is online.\n');
});

server.on('upgrade', (req, clientSocket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) return clientSocket.destroy();

    // Complete the standard RFC 6455 WebSocket handshake
    const acceptKey = crypto
        .createHash('sha1')
        .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
        .digest('base64');

    clientSocket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${acceptKey}\r\n\r\n`
    );

    console.log('[Bridge] Browser WebSocket connected!');

    // Connect to upstream SimTX TCP server
    const simtxSocket = new net.Socket();
    simtxSocket.connect(SIMTX_PORT, SIMTX_HOST, () => {
        console.log(`[Bridge] Connected to SimTX at ${SIMTX_HOST}:${SIMTX_PORT}`);
    });

    // Decode incoming masked WebSocket frames from Browser -> SimTX
    let rxBuffer = Buffer.alloc(0);
    clientSocket.on('data', (chunk) => {
        rxBuffer = Buffer.concat([rxBuffer, chunk]);
        while (rxBuffer.length >= 2) {
            const opcode = rxBuffer[0] & 0x0f;
            const isMasked = (rxBuffer[1] & 0x80) !== 0;
            let payloadLen = rxBuffer[1] & 0x7f;
            let offset = 2;

            if (payloadLen === 126) {
                if (rxBuffer.length < 4) return;
                payloadLen = rxBuffer.readUInt16BE(2);
                offset = 4;
            } else if (payloadLen === 127) {
                if (rxBuffer.length < 10) return;
                payloadLen = Number(rxBuffer.readBigUInt64BE(2));
                offset = 10;
            }

            const totalLen = offset + (isMasked ? 4 : 0) + payloadLen;
            if (rxBuffer.length < totalLen) return;

            let payload = rxBuffer.subarray(offset + (isMasked ? 4 : 0), totalLen);
            if (isMasked) {
                const mask = rxBuffer.subarray(offset, offset + 4);
                const unmasked = Buffer.alloc(payloadLen);
                for (let i = 0; i < payloadLen; i++) {
                    unmasked[i] = payload[i] ^ mask[i % 4];
                }
                payload = unmasked;
            }

            rxBuffer = rxBuffer.subarray(totalLen);

            if (opcode === 0x08) { // Close frame
                clientSocket.end();
                return;
            } else if (opcode === 0x09) { // Ping -> Pong
                clientSocket.write(encodeWsFrame(payload, 0x0a));
            } else if ((opcode === 0x01 || opcode === 0x02) && simtxSocket.writable) {
                simtxSocket.write(payload);
            }
        }
    });

    // Forward raw SimTX data -> Browser WebSocket
    simtxSocket.on('data', (data) => {
        if (clientSocket.writable) {
            clientSocket.write(encodeWsFrame(data, 0x02));
        }
    });

    simtxSocket.on('error', (err) => {
        console.error('[Bridge] SimTX error:', err.message);
        clientSocket.end();
    });

    simtxSocket.on('close', () => {
        console.log('[Bridge] SimTX connection closed');
        clientSocket.end();
    });

    clientSocket.on('close', () => {
        console.log('[Bridge] Browser disconnected');
        simtxSocket.destroy();
    });

    clientSocket.on('error', () => simtxSocket.destroy());
});

server.listen(PORT, () => {
    console.log(`[Bridge] Zero-dependency WebSocket bridge running on ws://localhost:${PORT}`);
});