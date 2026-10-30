import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'single-use-demo-'));
const state = join(scratch, 'state');
const wrangler = resolve(root, 'node_modules/wrangler/bin/wrangler.js');
const port = 18799;
const origin = `http://127.0.0.1:${port}`;
const run = (...args) => execFileSync(process.execPath, [wrangler, ...args], {
  cwd: root, encoding: 'utf8', env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let worker;
let proxy;
let workerOutput = '';
try {
  // Every run has an isolated local D1/R2 directory, separate from interactive dev.
  run('d1', 'migrations', 'apply', 'demo-grants', '--local', '--persist-to', state);
  worker = spawn(process.execPath, [wrangler, 'dev', '--local', '--ip', '127.0.0.1',
    '--port', String(port), '--persist-to', state], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false' },
  });
  worker.stdout.on('data', b => { workerOutput += b.toString(); });
  worker.stderr.on('data', b => { workerOutput += b.toString(); });
  const deadline = Date.now() + 45_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (worker.exitCode !== null) throw new Error(`Worker exited: ${workerOutput}`);
    try {
      const response = await fetch(origin);
      if (response.ok) { ready = true; break; }
    } catch { /* Worker is still starting. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, `Worker failed to start: ${workerOutput}`);
  const reset = await fetch(`${origin}/api/demo/reset`, { method: 'POST' });
  assert.equal(reset.status, 200);
  const fixture = await reset.json();
  // Read fixture identifiers from the reset response, never product data.
  assert.ok(fixture.tokens?.fresh, 'Reset response must include tokens');
  const token = fixture.tokens.fresh;
  const idem = randomUUID();
  const grantPath = `/api/download/${token}?idem=${idem}`;
  const readState = async () => {
    const response = await fetch(`${origin}/api/demo/state/${token}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  const before = await readState();
  assert.equal(before.used_at, null);
  let upstreamStatus;
  let committedBeforeDrop;
  let dropped = false;
  let proxyError;
  proxy = createServer(async (request, response) => {
    try {
      const upstream = await fetch(`${origin}${request.url}`, {
        headers: { Accept: 'application/json' }, redirect: 'manual',
      });
      upstreamStatus = upstream.status;
      await upstream.arrayBuffer();
      // A completed upstream response plus a DB read establishes that the grant
      // committed before the proxy destroys the downstream connection.
      committedBeforeDrop = await readState();
      dropped = true;
      response.destroy();
    } catch (error) {
      proxyError = String(error);
      response.destroy();
    }
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const proxyPort = proxy.address().port;
  let clientSawNetworkFailure = false;
  try {
    await fetch(`http://127.0.0.1:${proxyPort}${grantPath}`, {
      // A non-idempotent HTTP method is not used: this reproduces the GET API.
      headers: { Accept: 'application/json' },
    });
  } catch { clientSawNetworkFailure = true; }
  assert.equal(proxyError, undefined);
  assert.ok(dropped && clientSawNetworkFailure);
  assert.equal(upstreamStatus, 200);
  assert.ok(committedBeforeDrop.used_at);
  assert.equal(committedBeforeDrop.idempotency_key, idem);
  const retry = await fetch(`${origin}${grantPath}`, { headers: { Accept: 'application/json' } });
  assert.equal(retry.status, 200);
  const { downloadUrl } = await retry.json();
  const after = await readState();
  assert.equal(after.used_at, committedBeforeDrop.used_at);
  assert.equal(after.idempotency_key, idem);
  const file = await fetch(downloadUrl);
  assert.equal(file.status, 200);
  const bytes = new Uint8Array(await file.arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes), fixture.fixtureText);
  const otherKey = await fetch(`${origin}/api/download/${token}?idem=${randomUUID()}`,
    { headers: { Accept: 'application/json' } });
  assert.equal(otherKey.status, 403);
  const result = {
    recordedAt: new Date().toISOString(),
    scenario: 'loopback HTTP proxy drops response after Worker commits D1 grant',
    environment: 'Wrangler local Worker/D1/R2; no cloud credentials or deployment',
    before, upstreamStatus, committedBeforeDrop, clientSawNetworkFailure,
    retryStatus: retry.status, after, usedAtUnchanged: true,
    differentKeyStatus: otherKey.status, fileStatus: file.status,
    fixtureBytesMatch: true,
    fileSha256: createHash('sha256').update(bytes).digest('hex'),
    limits: ['Controlled proxy disconnect, not an uncontrolled real-world outage',
      'No provider SigV4/ACL or production performance proof'],
  };
  await mkdir(resolve(root, 'evidence'), { recursive: true });
  await writeFile(resolve(root, 'evidence/network-smoke.json'), JSON.stringify(result, null, 2)+'\n');
  console.log('PASS: committed grant -> lost HTTP response -> same-key retry -> matching file bytes; other key denied');
} finally {
  if (proxy) {
    proxy.closeAllConnections();
    await new Promise(resolve => proxy.close(resolve));
  }
  if (worker && worker.exitCode === null) {
    const stopped = once(worker, 'exit');
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/PID', String(worker.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      worker.kill('SIGTERM');
    }
    await stopped;
  }
  const safeScratch = resolve(scratch);
  assert.equal(dirname(safeScratch), resolve(tmpdir()));
  assert.ok(basename(safeScratch).startsWith('single-use-demo-'));
  await rm(safeScratch, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
