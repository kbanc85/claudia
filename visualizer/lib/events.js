import { getLastModified } from './database.js';

const clients = new Set();
let lastTimestamp = '0';
let pollInterval = null;
let _getDb = null;

export function addClient(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.write('event: connected\ndata: {"status":"ok"}\n\n');
  clients.add(res);
  res.on('close', () => clients.delete(res));
}

export function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try { client.write(msg); } catch { clients.delete(client); }
  }
}

export function startPolling(getDb) {
  _getDb = getDb;
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    try {
      const db = _getDb();
      if (!db) return;
      const ts = getLastModified(db);
      if (ts !== lastTimestamp) {
        lastTimestamp = ts;
        broadcast('graph-update', { timestamp: ts });
      }
    } catch { /* ignore */ }
  }, 5000);
}

export function stopPolling() {
  if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
}
