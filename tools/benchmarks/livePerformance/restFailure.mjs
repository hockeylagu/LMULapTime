import { register } from 'tsx/esm/api';
import http from 'node:http';
import { writeFileSync } from 'node:fs';
register();
const { lmuGet } = await import('../../../server/live/lmuPitRest.ts');
// Fault injection against an ephemeral local server, never the game's port.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.write(' ');
  if (req.url === '/abort') { setTimeout(() => res.destroy(), 50); return; }
  const drip = setInterval(() => res.write(' '), 100);
  setTimeout(() => { clearInterval(drip); res.end('{}'); }, 1500);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
const original = http.get;
http.get = (url, options, callback) => original(`http://127.0.0.1:${port}${new URL(url).pathname}`, options, response => {
  // Observe the response error so the probe can report a pending promise instead of exiting on an unhandled error.
  response.on('error', () => {});
  callback(response);
});
const results = [];
try {
  for (const path of ['/trickle', '/abort']) {
    const start = performance.now();
    let timer;
    const result = await Promise.race([lmuGet(path), new Promise(resolve => { timer = setTimeout(() => resolve('unsettled after 2200ms'), 2200); })]);
    clearTimeout(timer);
    results.push({ path, elapsedMs: performance.now() - start, result });
  }
} finally { http.get = original; server.closeAllConnections(); server.close(); }
writeFileSync('.cache/live-performance/rest-failure.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
