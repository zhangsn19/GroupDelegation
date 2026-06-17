#!/usr/bin/env node
/**
 * Cloudflare quick tunnel — exposes local port to a public HTTPS URL.
 *
 * Usage:
 *   npm run tunnel              # default: app on :3456
 *   npm run tunnel:receiver     # webhook receiver on :9999
 *
 * Requires: brew install cloudflared
 * Free URL is stable for the tunnel session; restart gives a new hostname.
 */

const { spawn } = require('child_process');

const port = process.env.TUNNEL_PORT || process.argv[2] || '3456';
const target = `http://127.0.0.1:${port}`;

console.log(`Cloudflare quick tunnel → ${target}`);
console.log('Install if needed: brew install cloudflared\n');

const child = spawn('cloudflared', ['tunnel', '--url', target], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (err) => {
  if (err.code === 'ENOENT') {
    console.error('\ncloudflared not found. Install: brew install cloudflared');
    process.exit(1);
  }
  throw err;
});

child.on('exit', (code) => process.exit(code ?? 0));
