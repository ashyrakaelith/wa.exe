import express from 'express';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static(path.join(__dirname, 'public')));

const MAX_HISTORY = 200;
const history = [];

function broadcast(event) {
    history.push(event);
    if (history.length > MAX_HISTORY) history.shift();
    const data = JSON.stringify(event);
    for (const client of wss.clients) {
        if (client.readyState === 1) client.send(data);
    }
}

wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ type: 'history', items: history }));
});

export function logMessage({ direction, from, to, text, messageType, timestamp }) {
    broadcast({ type: 'message', direction, from, to, text, messageType, timestamp: timestamp || new Date().toISOString() });
}

export function logError(label, err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : null;
    broadcast({ type: 'error', label, message, stack, timestamp: new Date().toISOString() });
}

export function logInfo(text) {
    broadcast({ type: 'info', text, timestamp: new Date().toISOString() });
}

export function startWebServer(port = 5000) {
    server.listen(port, '0.0.0.0', () => {
        console.log(`🌐 Web UI running at http://0.0.0.0:${port}`);
    });
}
