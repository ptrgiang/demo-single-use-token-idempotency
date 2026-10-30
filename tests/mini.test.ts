import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import legacyMigration from '../migrations/0001_legacy.sql?raw';
import singleUseMigration from '../migrations/0002_single_use.sql?raw';
import miniMigration from '../migrations/0003_mini.sql?raw';
import { createApp } from '../src';
import { FIXTURE_TEXT } from '../src/fixtures';
import type { Env } from '../src/types';

const BASE_NOW = Date.UTC(2042, 2, 3, 10, 0, 0);
const ORIGIN = 'http://localhost';
const REMOTE_ACCESS = 'remote-demo-access-token-0123456789abcdef';
const REMOTE_SIGNING_KEY = 'remote-demo-signing-key-0123456789abcdef';

type MiniOrder = {
  id: number;
  title: string;
  price: number;
  status: string;
  token: string;
};

type SessionBody = {
  session: string;
  orders: MiniOrder[];
  expectedSha256: string;
};

type MiniState = {
  used_at: string | null;
  idempotency_key: string | null;
  policy_version: number;
  expires_at: string;
};

let now = BASE_NOW;
const app = createApp({ now: () => now });

function makeRequest(pathOrUrl: string, init: RequestInit = {}): Request {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : new URL(pathOrUrl, ORIGIN).toString();
  return new Request(url, init);
}

async function fetchApp(
  pathOrUrl: string,
  init: RequestInit = {},
  bindings: Env = env,
): Promise<Response> {
  return await app.fetch(makeRequest(pathOrUrl, init), bindings);
}

function sessionHeaders(session: string, extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra);
  headers.set('X-Mini-Session', session);
  return headers;
}

async function createSession(bindings: Env = env, headers: HeadersInit = {}): Promise<SessionBody> {
  const response = await fetchApp('/api/mini/session', { method: 'POST', headers }, bindings);
  expect(response.status).toBe(201);
  const body = await response.json() as SessionBody & {
    requestId: string;
    _trace: Array<{ stage: string; detail: string }>;
  };
  expect(response.headers.get('X-Request-Id')).toBe(body.requestId);
  expect(body._trace.map(({ stage }) => stage)).toEqual(expect.arrayContaining([
    'session_create', 'order_batch',
  ]));
  return body;
}

async function applyRawMigration(sql: string): Promise<void> {
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
}

async function hasTable(name: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?
  `).bind(name).first<{ name: string }>();
  return row !== null;
}

async function orderColumns(): Promise<Set<string>> {
  const result = await env.DB.prepare('PRAGMA table_info(orders)').all<{ name: string }>();
  return new Set(result.results.map(({ name }) => name));
}

async function ensureSchema(): Promise<void> {
  if (!await hasTable('products')) await applyRawMigration(legacyMigration);
  let columns = await orderColumns();
  if (!columns.has('policy_version')) {
    await applyRawMigration(singleUseMigration);
    columns = await orderColumns();
  }
  if (!await hasTable('mini_sessions')) await applyRawMigration(miniMigration);
}

async function readMiniState(session: string, token: string): Promise<MiniState> {
  const response = await fetchApp(`/api/mini/state/${token}`, {
    headers: sessionHeaders(session),
  });
  expect(response.status).toBe(200);
  const body = await response.json() as MiniState & {
    requestId: string;
    _trace: Array<{ stage: string; detail: string }>;
  };
  expect(response.headers.get('X-Request-Id')).toBe(body.requestId);
  expect(body._trace.length).toBeGreaterThan(0);
  return {
    used_at: body.used_at,
    idempotency_key: body.idempotency_key,
    policy_version: body.policy_version,
    expires_at: body.expires_at,
  };
}

function sha256Hex(bytes: Uint8Array): Promise<string> {
  return crypto.subtle.digest('SHA-256', bytes).then((digest) =>
    Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(''),
  );
}

const IDEM = '7b1e4b21-6ab0-4e73-9fb0-3a1c0de45001';

beforeAll(ensureSchema);
beforeEach(() => { now = BASE_NOW; });

describe('mini buyer flow', () => {
  it('creates isolated paid and free orders with opaque per-session tokens', async () => {
    const first = await createSession();
    const second = await createSession();

    expect(first.orders).toHaveLength(2);
    expect(first.orders.map(({ status }) => status)).toEqual(['paid', 'paid']);
    expect(first.orders.map(({ price }) => price)).toEqual([49_000, 0]);
    expect(first.orders.map(({ title }) => title)).toEqual([
      'Bộ tài liệu thiết kế giao diện',
      'Tài liệu khởi động dự án',
    ]);
    expect(new Set(first.orders.map(({ token }) => token)).size).toBe(2);
    expect(first.session).not.toBe(second.session);
    expect(first.orders.map(({ id }) => id)).not.toEqual(second.orders.map(({ id }) => id));
    expect(first.expectedSha256).toBe(await sha256Hex(new TextEncoder().encode(FIXTURE_TEXT)));

    const firstHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(first.session));
    const firstHashHex = Array.from(new Uint8Array(firstHash), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const stored = await env.DB.prepare('SELECT session_hash FROM mini_sessions WHERE session_hash = ?')
      .bind(firstHashHex)
      .first<{ session_hash: string }>();
    expect(stored?.session_hash).toBe(firstHashHex);
    expect(stored?.session_hash).not.toBe(first.session);

    const firstOrders = await fetchApp('/api/mini/orders', {
      headers: sessionHeaders(first.session),
    });
    const firstBody = await firstOrders.json() as {
      orders: MiniOrder[];
      expectedSha256: string;
      requestId: string;
      _trace: Array<{ stage: string; detail: string }>;
    };
    expect(firstOrders.status).toBe(200);
    expect(firstOrders.headers.get('X-Request-Id')).toBe(firstBody.requestId);
    expect(firstBody._trace.map(({ stage }) => stage)).toContain('orders_read');
    expect(firstBody.orders.map(({ id }) => id)).toEqual(first.orders.map(({ id }) => id));
    expect(firstBody.expectedSha256).toBe(first.expectedSha256);
    expect(firstBody.orders.every(({ id }) => !second.orders.some((order) => order.id === id))).toBe(true);
  });

  it('serves the mini page and reads token state without consuming a grant', async () => {
    const created = await createSession();
    const paid = created.orders[0];
    const before = await readMiniState(created.session, paid.token);

    const page = await fetchApp('/mini');
    const html = await page.text();
    const after = await readMiniState(created.session, paid.token);

    expect(page.status).toBe(200);
    expect(page.headers.get('Content-Type')).toMatch(/^text\/html/i);
    expect(html.toLowerCase()).toContain('<!doctype html>');
    expect(before).toMatchObject({ used_at: null, idempotency_key: null, policy_version: 1 });
    expect(after).toMatchObject(before);
  });

  it('reuses an active paid token and issues a new token after consumption', async () => {
    const created = await createSession();
    const paid = created.orders[0];

    const firstRenewal = await fetchApp(`/api/mini/orders/${paid.id}/renew`, {
      method: 'POST',
      headers: sessionHeaders(created.session),
    });
    expect(firstRenewal.status).toBe(200);
    expect(await firstRenewal.json()).toMatchObject({ token: paid.token, reused: true });

    const grant = await fetchApp(`/api/download/${paid.token}?idem=${IDEM}`, {
      headers: { Accept: 'application/json' },
    });
    const grantBody = await grant.json() as {
      downloadUrl: string;
      requestId: string;
      _trace: Array<{ stage: string; detail: string }>;
    };
    expect(grant.status).toBe(200);
    expect(grant.headers.get('X-Request-Id')).toBe(grantBody.requestId);
    expect(grantBody._trace.map(({ stage }) => stage)).toEqual(expect.arrayContaining([
      'token_validation', 'grant_lookup', 'idempotency_validation', 'file_preflight', 'grant_update',
    ]));
    expect(grantBody._trace.some(({ detail }) => /SigV4/i.test(detail))).toBe(false);

    const beforeRetry = await readMiniState(created.session, paid.token);
    now += 59_000;
    const retry = await fetchApp(`/api/download/${paid.token}?idem=${IDEM}`, {
      headers: { Accept: 'application/json' },
    });
    const retryBody = await retry.json() as {
      _trace: Array<{ stage: string; detail: string }>;
    };
    const afterRetry = await readMiniState(created.session, paid.token);
    expect(retry.status).toBe(200);
    expect(retryBody._trace.map(({ stage }) => stage)).toContain('grant_update');
    expect(retryBody._trace.map(({ stage }) => stage)).not.toContain('grant_consume');
    expect(retryBody._trace.find(({ stage }) => stage === 'grant_update')?.detail)
      .toMatch(/first grant or a same-key retry/i);
    expect(afterRetry).toEqual(beforeRetry);

    const renewedResponse = await fetchApp(`/api/mini/orders/${paid.id}/renew`, {
      method: 'POST',
      headers: sessionHeaders(created.session),
    });
    const renewed = await renewedResponse.json() as { token: string; reused: boolean };
    expect(renewedResponse.status).toBe(200);
    expect(renewed.reused).toBe(false);
    expect(renewed.token).not.toBe(paid.token);

    const nextRenewal = await fetchApp(`/api/mini/orders/${paid.id}/renew`, {
      method: 'POST',
      headers: sessionHeaders(created.session),
    });
    expect(await nextRenewal.json()).toMatchObject({ token: renewed.token, reused: true });

    const zeroPriceRenewal = await fetchApp(`/api/mini/orders/${created.orders[1].id}/renew`, {
      method: 'POST',
      headers: sessionHeaders(created.session),
    });
    expect(zeroPriceRenewal.status).toBe(200);
    expect(await zeroPriceRenewal.json()).toMatchObject({
      token: created.orders[1].token,
      reused: true,
    });
  });

  it('downloads the real fixture bytes for both paid and free mini orders', async () => {
    const created = await createSession();
    const actualFiles: Uint8Array[] = [];

    for (const [index, order] of created.orders.entries()) {
      const grant = await fetchApp(`/api/download/${order.token}?idem=${IDEM.replace(/.$/, String(index + 1))}`, {
        headers: { Accept: 'application/json' },
      });
      expect(grant.status).toBe(200);
      const { downloadUrl } = await grant.json() as { downloadUrl: string };
      const file = await fetchApp(downloadUrl);
      actualFiles.push(new Uint8Array(await file.arrayBuffer()));
      expect(file.status).toBe(200);
      expect(file.headers.get('Content-Disposition')).toContain('sample-notes.txt');
    }

    expect(await sha256Hex(actualFiles[0])).toBe(created.expectedSha256);
    expect(await sha256Hex(actualFiles[1])).toBe(created.expectedSha256);
  });

  it('denies cross-session order and token access and expires sessions after 24 hours', async () => {
    const first = await createSession();
    const second = await createSession();

    const foreignState = await fetchApp(`/api/mini/state/${first.orders[0].token}`, {
      headers: sessionHeaders(second.session),
    });
    const foreignRenewal = await fetchApp(`/api/mini/orders/${first.orders[0].id}/renew`, {
      method: 'POST',
      headers: sessionHeaders(second.session),
    });
    expect(foreignState.status).toBe(404);
    expect(foreignRenewal.status).toBe(404);

    now = BASE_NOW + 24 * 60 * 60 * 1000 + 1;
    const expiredOrders = await fetchApp('/api/mini/orders', {
      headers: sessionHeaders(first.session),
    });
    expect(expiredOrders.status).toBe(401);
  });

  it('keeps mini orders and tokens when local legacy fixtures are reset', async () => {
    const created = await createSession();
    const reset = await fetchApp('/api/demo/reset', { method: 'POST' });
    const orders = await fetchApp('/api/mini/orders', {
      headers: sessionHeaders(created.session),
    });
    const state = await fetchApp(`/api/mini/state/${created.orders[0].token}`, {
      headers: sessionHeaders(created.session),
    });

    expect(reset.status).toBe(200);
    expect(orders.status).toBe(200);
    expect((await orders.json() as { orders: MiniOrder[] }).orders).toHaveLength(2);
    expect(state.status).toBe(200);
  });
});

describe('remote demo gate', () => {
  it('fails closed when remote secrets are absent while keeping HTML and config public', async () => {
    const brokenRemote = { ...env, DEMO_REMOTE: 'true', DEMO_ACCESS_TOKEN: undefined };
    const fixtureSigningRemote = {
      ...env,
      DEMO_REMOTE: 'true',
      DEMO_ACCESS_TOKEN: REMOTE_ACCESS,
    };

    const config = await fetchApp('/api/mini/config', {}, brokenRemote);
    const session = await fetchApp('/api/mini/session', { method: 'POST' }, brokenRemote);
    const fixtureSigned = await fetchApp('/api/mini/session', {
      method: 'POST',
      headers: { 'X-Demo-Access': REMOTE_ACCESS },
    }, fixtureSigningRemote);
    const file = await fetchApp('/api/file', {}, brokenRemote);
    const page = await fetchApp('/mini', {}, brokenRemote);

    expect(await config.json()).toMatchObject({ remote: true, accessRequired: true });
    expect(session.status).toBe(503);
    expect(fixtureSigned.status).toBe(503);
    expect(file.status).toBe(503);
    expect(page.status).toBe(200);
  });

  it('requires the shared access token on every remote API including signed file delivery', async () => {
    const remote: Env = {
      ...env,
      DEMO_REMOTE: 'true',
      DEMO_ACCESS_TOKEN: REMOTE_ACCESS,
      DEMO_SIGNING_KEY: REMOTE_SIGNING_KEY,
    };

    const noAccess = await fetchApp('/api/mini/session', { method: 'POST' }, remote);
    const created = await createSession(remote, { 'X-Demo-Access': REMOTE_ACCESS });
    const unauthenticatedApis = await Promise.all([
      fetchApp('/api/mini/orders', { headers: sessionHeaders(created.session) }, remote),
      fetchApp(`/api/mini/orders/${created.orders[0].id}/renew`, {
        method: 'POST',
        headers: sessionHeaders(created.session),
      }, remote),
      fetchApp(`/api/mini/state/${created.orders[0].token}`, {
        headers: sessionHeaders(created.session),
      }, remote),
      fetchApp(`/api/download/${created.orders[0].token}?idem=${IDEM}`, {
        headers: { Accept: 'application/json' },
      }, remote),
      fetchApp('/api/demo/reset', { method: 'POST' }, remote),
      fetchApp(`/api/demo/state/${created.orders[0].token}`, {}, remote),
    ]);
    expect([noAccess, ...unauthenticatedApis].map(({ status }) => status)).toEqual(
      Array(7).fill(401),
    );
    const deniedMiniBody = await unauthenticatedApis[0].json() as {
      requestId: string;
      _trace: Array<{ stage: string; detail: string }>;
    };
    expect(unauthenticatedApis[0].headers.get('X-Request-Id')).toBe(deniedMiniBody.requestId);
    expect(deniedMiniBody._trace.map(({ stage }) => stage)).toContain('remote_access');

    const remoteReset = await fetchApp('/api/demo/reset', {
      method: 'POST',
      headers: { 'X-Demo-Access': REMOTE_ACCESS },
    }, remote);
    const orders = await fetchApp('/api/mini/orders', {
      headers: sessionHeaders(created.session, { 'X-Demo-Access': REMOTE_ACCESS }),
    }, remote);

    expect(noAccess.status).toBe(401);
    expect(remoteReset.status).toBe(404);
    expect(orders.status).toBe(200);

    const grant = await fetchApp(`/api/download/${created.orders[0].token}?idem=${IDEM}`, {
      headers: { Accept: 'application/json', 'X-Demo-Access': REMOTE_ACCESS },
    }, remote);
    const { downloadUrl } = await grant.json() as { downloadUrl: string };
    const noAccessFile = await fetchApp(downloadUrl, {}, remote);
    const authorizedFile = await fetchApp(downloadUrl, {
      headers: { 'X-Demo-Access': REMOTE_ACCESS },
    }, remote);

    expect(grant.status).toBe(200);
    expect(noAccessFile.status).toBe(401);
    expect(authorizedFile.status).toBe(200);
  });
});
