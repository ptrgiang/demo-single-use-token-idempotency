import { env } from 'cloudflare:test';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import legacyMigration from '../migrations/0001_legacy.sql?raw';
import singleUseMigration from '../migrations/0002_single_use.sql?raw';
import { createApp } from '../src';
import { FIXTURE_KEY, FIXTURE_TEXT, TOKENS } from './fixtures';

const BASE_NOW = Date.UTC(2040, 5, 1, 12, 0, 0);
const LOOPBACK_ORIGIN = 'http://localhost';
const MIGRATION_TOKEN = 'f60718293a4b5c6d7e8f901a2b3c4d5e';
const IDEM_A = '7b1e4b21-6ab0-4e73-9fb0-3a1c0de45001';
const IDEM_B = '7b1e4b21-6ab0-4e73-9fb0-3a1c0de45002';

type DemoState = {
  used_at: string | null;
  idempotency_key: string | null;
  policy_version: number;
  expires_at: string;
};

type GrantBody = { downloadUrl: string };

let now = BASE_NOW;
const app = createApp({ now: () => now });

function makeRequest(pathOrUrl: string, init: RequestInit = {}): Request {
  const url = pathOrUrl.startsWith('http')
    ? pathOrUrl
    : new URL(pathOrUrl, LOOPBACK_ORIGIN).toString();
  return new Request(url, init);
}

async function fetchApp(pathOrUrl: string, init: RequestInit = {}): Promise<Response> {
  return await app.fetch(makeRequest(pathOrUrl, init), env);
}

async function resetFixtures(): Promise<void> {
  const response = await fetchApp('/api/demo/reset', { method: 'POST' });
  expect(response.status).toBe(200);
}

async function readState(token: string): Promise<DemoState> {
  const response = await fetchApp(`/api/demo/state/${token}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<DemoState>;
}

function grantPath(token: string, idempotencyKey?: string): string {
  const path = `/api/download/${token}`;
  return idempotencyKey === undefined
    ? path
    : `${path}?idem=${encodeURIComponent(idempotencyKey)}`;
}

function requestGrant(
  token: string,
  idempotencyKey?: string,
  headers: HeadersInit = { Accept: 'application/json' },
): Promise<Response> {
  return fetchApp(grantPath(token, idempotencyKey), { headers });
}

async function getDownloadUrl(token: string, idempotencyKey: string): Promise<string> {
  const response = await requestGrant(token, idempotencyKey);
  expect(response.status).toBe(200);
  const body = await response.json() as GrantBody;
  expect(body.downloadUrl).toMatch(/^http:\/\/localhost\/api\/file\?/);
  return body.downloadUrl;
}

function uuidFor(index: number): string {
  return `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function applyRawMigration(sql: string): Promise<void> {
  const statements = sql.split(';').map((statement) => statement.trim()).filter(Boolean);
  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

beforeAll(async () => {
  // Create an old-format grant before applying the additive single-use migration.
  await applyRawMigration(legacyMigration);
  await env.DB.prepare('INSERT INTO products (id, file_key) VALUES (?, ?)')
    .bind(90, FIXTURE_KEY)
    .run();
  await env.DB.prepare('INSERT INTO orders (id, product_id, status) VALUES (?, ?, ?)')
    .bind(90, 90, 'paid')
    .run();
  await env.DB.prepare('INSERT INTO downloads (id, order_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .bind(90, 90, MIGRATION_TOKEN, '2040-06-02 12:00:00')
    .run();
  await applyRawMigration(singleUseMigration);
});

describe('D1 migration compatibility', () => {
  it('preserves existing download rows at grandfathered policy version 0', async () => {
    const state = await readState(MIGRATION_TOKEN);
    expect(state).toEqual({
      used_at: null,
      idempotency_key: null,
      policy_version: 0,
      expires_at: '2040-06-02 12:00:00',
    });
  });
});

describe('single-use demo grants', () => {
  beforeEach(async () => {
    now = BASE_NOW;
    await resetFixtures();
  });

  it('stores the first grant and exposes the raw D1 state', async () => {
    const before = await readState(TOKENS.fresh);
    expect(before.used_at).toBeNull();
    expect(before.idempotency_key).toBeNull();
    expect(before.policy_version).toBe(1);
    expect(before.expires_at).toBe('2040-06-02 12:00:00');

    await getDownloadUrl(TOKENS.fresh, IDEM_A);

    const after = await readState(TOKENS.fresh);
    expect(after.used_at).toBe('2040-06-01 12:00:00');
    expect(after.idempotency_key).toBe(IDEM_A);
    expect(after.policy_version).toBe(1);
  });

  it('allows a same-key retry within 59 seconds and keeps the original used_at', async () => {
    await getDownloadUrl(TOKENS.fresh, IDEM_A);
    const usedAt = (await readState(TOKENS.fresh)).used_at;

    now += 59_000;
    const retry = await requestGrant(TOKENS.fresh, IDEM_A);

    expect(retry.status).toBe(200);
    expect((await readState(TOKENS.fresh)).used_at).toBe(usedAt);
  });

  it('closes the same-key retry window at exactly 60 seconds and remains closed at 61', async () => {
    await getDownloadUrl(TOKENS.fresh, IDEM_A);
    const usedAt = (await readState(TOKENS.fresh)).used_at;

    now += 59_000;
    expect((await requestGrant(TOKENS.fresh, IDEM_A)).status).toBe(200);
    now += 1_000;
    expect((await requestGrant(TOKENS.fresh, IDEM_A)).status).toBe(403);
    now += 1_000;
    expect((await requestGrant(TOKENS.fresh, IDEM_A)).status).toBe(403);
    expect((await readState(TOKENS.fresh)).used_at).toBe(usedAt);
  });

  it('rejects a different idempotency key without changing the original grant', async () => {
    await getDownloadUrl(TOKENS.fresh, IDEM_A);
    const before = await readState(TOKENS.fresh);

    expect((await requestGrant(TOKENS.fresh, IDEM_B)).status).toBe(403);
    expect(await readState(TOKENS.fresh)).toEqual(before);
  });

  it('rechecks expiry when the clock crosses it after preflight but before consume', async () => {
    let clockReads = 0;
    const delayedApp = createApp({
      now: () => ++clockReads === 1 ? BASE_NOW : BASE_NOW + 24 * 60 * 60 * 1000 + 1_000,
    });
    const response = await delayedApp.fetch(makeRequest(grantPath(TOKENS.fresh, IDEM_A), {
      headers: { Accept: 'application/json' },
    }), env);
    expect(response.status).toBe(404);
    expect((await readState(TOKENS.fresh)).used_at).toBeNull();
  });

  it('rechecks payment when an order is revoked during file preflight', async () => {
    const files = new Proxy(env.FILES, {
      get(target, property) {
        if (property === 'head') {
          return async (key: string) => {
            await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = 1").run();
            return target.head(key);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const response = await app.fetch(makeRequest(grantPath(TOKENS.fresh, IDEM_A), {
      headers: { Accept: 'application/json' },
    }), { ...env, FILES: files });
    expect(response.status).toBe(404);
    expect((await readState(TOKENS.fresh)).used_at).toBeNull();
  });

  it('validates token shape and requires one UUIDv4 for policy version 1', async () => {
    const malformedToken = await requestGrant('not-a-token', IDEM_A);
    const unknownToken = await requestGrant('ffffffffffffffffffffffffffffffff', IDEM_A);
    const missingKey = await requestGrant(TOKENS.fresh);
    const duplicateKey = await fetchApp(
      `${grantPath(TOKENS.fresh, IDEM_A)}&idem=${IDEM_B}`,
      { headers: { Accept: 'application/json' } },
    );
    const invalidUuid = await requestGrant(TOKENS.fresh, '7b1e4b21-6ab0-1e73-9fb0-3a1c0de45003');

    expect(malformedToken.status).toBe(400);
    expect(unknownToken.status).toBe(404);
    expect(missingKey.status).toBe(400);
    expect(duplicateKey.status).toBe(400);
    expect(invalidUuid.status).toBe(400);
    expect((await readState(TOKENS.fresh)).used_at).toBeNull();
  });

  it('does not consume a grant for HEAD or a prefetch request', async () => {
    const head = await fetchApp(grantPath(TOKENS.fresh, IDEM_A), {
      method: 'HEAD',
      headers: { Accept: 'application/json' },
    });
    const prefetch = await requestGrant(TOKENS.fresh, IDEM_A, {
      Accept: 'application/json',
      Purpose: 'prefetch',
    });

    expect(head.status).toBe(405);
    expect(prefetch.status).toBe(403);
    expect((await readState(TOKENS.fresh)).used_at).toBeNull();
  });

  it('does not consume missing, expired, unpaid, or missing-file fixtures', async () => {
    for (const token of [TOKENS.expired, TOKENS.unpaid, TOKENS.missing]) {
      expect((await requestGrant(token, IDEM_A)).status).toBe(404);
      expect((await readState(token)).used_at).toBeNull();
    }

    expect((await requestGrant('ffffffffffffffffffffffffffffffff', IDEM_A)).status).toBe(404);
    expect((await readState(TOKENS.fresh)).used_at).toBeNull();
  });

  it('keeps policy version 0 grants redeemable without an idempotency key', async () => {
    const response = await requestGrant(TOKENS.legacy);

    expect(response.status).toBe(200);
    expect((await requestGrant(TOKENS.legacy)).status).toBe(200);
    expect((await response.json() as GrantBody).downloadUrl).toMatch(/^http:\/\/localhost\/api\/file\?/);
    expect(await readState(TOKENS.legacy)).toMatchObject({
      used_at: null,
      idempotency_key: null,
      policy_version: 0,
    });
  });

  it('demonstrates why unnormalized legacy ISO timestamps need a separate data audit', async () => {
    const result = await env.DB.prepare(`
      SELECT
        '2040-06-01 11:59:59' > '2040-06-01 12:00:00' AS normalized_expired,
        '2040-06-01T11:59:59Z' > '2040-06-01 12:00:00' AS iso_expired
    `).first<{ normalized_expired: number; iso_expired: number }>();
    expect(result).toEqual({ normalized_expired: 0, iso_expired: 1 });
  });

  it('redirects browser-style requests to the signed file URL', async () => {
    const response = await requestGrant(TOKENS.fresh, IDEM_A, {});

    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toMatch(/^http:\/\/localhost\/api\/file\?/);
    expect((await readState(TOKENS.fresh)).idempotency_key).toBe(IDEM_A);
  });

  it('returns the real R2 fixture bytes with a matching SHA-256 digest', async () => {
    const downloadUrl = await getDownloadUrl(TOKENS.fresh, IDEM_A);
    const response = await fetchApp(downloadUrl);
    const actualBytes = new Uint8Array(await response.arrayBuffer());
    const expectedBytes = new TextEncoder().encode(FIXTURE_TEXT);

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Disposition')).toContain('sample-notes.txt');
    expect(actualBytes).toEqual(expectedBytes);
    expect(await sha256Hex(actualBytes)).toBe(await sha256Hex(expectedBytes));
  });

  it('rejects a tampered HMAC and an expired signed file URL', async () => {
    const downloadUrl = await getDownloadUrl(TOKENS.fresh, IDEM_A);
    const tampered = new URL(downloadUrl);
    const signature = tampered.searchParams.get('sig');
    expect(signature).not.toBeNull();
    tampered.searchParams.set('sig', `${signature![0] === '0' ? '1' : '0'}${signature!.slice(1)}`);
    expect((await fetchApp(tampered.toString())).status).toBe(403);

    const expiresAt = Number(new URL(downloadUrl).searchParams.get('exp'));
    now = expiresAt * 1_000;
    expect((await fetchApp(downloadUrl)).status).toBe(403);
  });

  it('keeps an already-issued URL usable until expiry after the order is revoked', async () => {
    const downloadUrl = await getDownloadUrl(TOKENS.fresh, IDEM_A);
    await env.DB.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").bind(1).run();

    expect((await requestGrant(TOKENS.fresh, IDEM_A)).status).toBe(404);
    const alreadyIssued = await fetchApp(downloadUrl);
    expect(alreadyIssued.status).toBe(200);
    expect(await alreadyIssued.text()).toBe(FIXTURE_TEXT);
  });

  it('allows three concurrent requests with one key and records only that key', async () => {
    const responses = await Promise.all(
      Array.from({ length: 3 }, () => requestGrant(TOKENS.fresh, IDEM_A)),
    );

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200]);
    expect(await readState(TOKENS.fresh)).toMatchObject({ idempotency_key: IDEM_A });
  });

  it('allows only one winner among 100 concurrent requests with distinct keys', async () => {
    const keys = Array.from({ length: 100 }, (_, index) => uuidFor(index));
    const responses = await Promise.all(keys.map((key) => requestGrant(TOKENS.fresh, key)));
    const winners = responses.flatMap((response, index) => response.status === 200 ? [index] : []);
    const forbidden = responses.filter((response) => response.status === 403);
    const state = await readState(TOKENS.fresh);

    expect(winners).toHaveLength(1);
    expect(forbidden).toHaveLength(99);
    expect(state.idempotency_key).toBe(keys[winners[0]]);
    expect(state.used_at).not.toBeNull();
  });
});
