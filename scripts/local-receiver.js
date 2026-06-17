#!/usr/bin/env node
/**
 * Local webhook receiver — saves session JSON from Render to data/synced/
 *
 * Usage:
 *   npm run receiver
 *   npm run tunnel:receiver   # Cloudflare quick tunnel (recommended)
 *   # set DATA_WEBHOOK_URL on Render to the tunnel URL
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = Number(process.env.RECEIVER_PORT || 9999);
const SYNC_DIR = path.join(__dirname, '..', 'data', 'synced');

fs.mkdirSync(SYNC_DIR, { recursive: true });

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('POST only');
    return;
  }

  let body = '';
  req.on('data', (chunk) => {
    body += chunk;
  });
  req.on('end', () => {
    try {
      const session = JSON.parse(body);
      if (!session?.id) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing session.id');
        return;
      }
      const fp = path.join(SYNC_DIR, `${session.id}.json`);
      fs.writeFileSync(fp, JSON.stringify(session, null, 2));
      console.log(`[sync] saved ${session.id}`);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: session.id }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end(String(err.message));
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Local receiver listening on http://127.0.0.1:${PORT}`);
  console.log(`Saving to ${SYNC_DIR}`);
});
