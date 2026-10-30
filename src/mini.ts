import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { Hono } from 'hono';
import miniPage from '../mini.html';
import { FIXTURE_KEY, FIXTURE_TEXT } from './fixtures';
import type { AppEnv, Env } from './types';

const SESSION_HEADER = 'X-Mini-Session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SESSION_SECRET = /^[a-f0-9]{64}$/i;
const DOWNLOAD_TOKEN = /^[a-f0-9]{32}$/i;

type MiniOrderRow = {
  id: number;
  title: string;
  price: number;
  status: string;
  token: string;
};

type MiniStateRow = {
  used_at: string | null;
  idempotency_key: string | null;
  policy_version: number;
  expires_at: string;
};

function toSqlUtc(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 19).replace('T', ' ');
}

function randomHex(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function randomSqlId(): number {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let value = 0;
  for (const byte of bytes) value = value * 256 + byte;
  return 1_000_000_000_000 + value;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sessionHashFromRequest(
  request: Request,
  env: Env,
  currentTime: string,
): Promise<string | null> {
  const session = request.headers.get(SESSION_HEADER) ?? '';
  if (!SESSION_SECRET.test(session)) return null;

  const sessionHash = await sha256Hex(session);
  const active = await env.DB.prepare(`
    SELECT 1 AS active
    FROM mini_sessions
    WHERE session_hash = ? AND expires_at > ?
  `).bind(sessionHash, currentTime).first<{ active: number }>();
  return active ? sessionHash : null;
}

function addTrace(c: Context<AppEnv>, stage: string, detail: string): void {
  c.get('trace').push({ stage, detail });
}

function miniJson(
  c: Context<AppEnv>,
  body: Record<string, unknown>,
  status: ContentfulStatusCode = 200,
) {
  return c.json({ ...body, requestId: c.get('requestId'), _trace: c.get('trace') }, status);
}

async function activeSession(
  c: Context<AppEnv>,
  now: () => number,
): Promise<{ hash: string; currentTime: string } | null> {
  const currentTime = toSqlUtc(now());
  const hash = await sessionHashFromRequest(c.req.raw, c.env, currentTime);
  if (hash) {
    addTrace(c, 'session_validation', 'Verified an active mini-session capability.');
    return { hash, currentTime };
  }
  addTrace(c, 'session_validation', 'Rejected a missing, unknown, or expired mini-session capability.');
  return null;
}

async function loadReusableGrant(
  env: Env,
  orderId: number,
  sessionHash: string,
  currentTime: string,
): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT d.token
    FROM downloads d
    JOIN orders o ON o.id = d.order_id
    WHERE o.id = ?
      AND o.session_hash = ?
      AND o.status = 'paid'
      AND d.policy_version = 1
      AND d.used_at IS NULL
      AND d.expires_at > ?
    ORDER BY d.id DESC
    LIMIT 1
  `).bind(orderId, sessionHash, currentTime).first<{ token: string }>();
  return row?.token ?? null;
}

export function registerMiniRoutes(app: Hono<AppEnv>, now: () => number): void {
  app.get('/mini', (c) => c.html(miniPage));
  app.get('/mini/', (c) => c.html(miniPage));

  app.get('/api/mini/config', (c) => {
    const remote = c.env.DEMO_REMOTE === 'true';
    addTrace(c, 'config_read', 'Returned the public local or remote API mode.');
    return miniJson(c, { remote, accessRequired: remote });
  });

  app.post('/api/mini/session', async (c) => {
    const createdAtMilliseconds = now();
    const createdAt = toSqlUtc(createdAtMilliseconds);
    const expiresAt = toSqlUtc(createdAtMilliseconds + SESSION_TTL_MS);
    const session = randomHex(32);
    const sessionHash = await sha256Hex(session);
    const productId = randomSqlId();
    const paidOrderId = randomSqlId();
    let freeOrderId = randomSqlId();
    while (freeOrderId === paidOrderId) freeOrderId = randomSqlId();
    const paidDownloadId = randomSqlId();
    let freeDownloadId = randomSqlId();
    while (freeDownloadId === paidDownloadId) freeDownloadId = randomSqlId();
    const paidToken = randomHex(16);
    const freeToken = randomHex(16);
    addTrace(c, 'session_create', 'Generated a new random mini-session capability.');

    await c.env.FILES.put(FIXTURE_KEY, FIXTURE_TEXT, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });

    await c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO mini_sessions (session_hash, created_at, expires_at)
        VALUES (?, ?, ?)
      `).bind(sessionHash, createdAt, expiresAt),
      c.env.DB.prepare('INSERT INTO products (id, file_key) VALUES (?, ?)')
        .bind(productId, FIXTURE_KEY),
      c.env.DB.prepare(`
        INSERT INTO orders (id, product_id, status, session_hash, title, price)
        VALUES (?, ?, 'paid', ?, ?, ?), (?, ?, 'paid', ?, ?, ?)
      `).bind(
        paidOrderId, productId, sessionHash, 'Bộ tài liệu thiết kế giao diện', 49_000,
        freeOrderId, productId, sessionHash, 'Tài liệu khởi động dự án', 0,
      ),
      c.env.DB.prepare(`
        INSERT INTO downloads (id, order_id, token, expires_at, policy_version, created_at)
        VALUES (?, ?, ?, ?, 1, ?), (?, ?, ?, ?, 1, ?)
      `).bind(
        paidDownloadId, paidOrderId, paidToken, expiresAt, createdAt,
        freeDownloadId, freeOrderId, freeToken, expiresAt, createdAt,
      ),
    ]);
    addTrace(c, 'order_batch', 'Stored one paid sample order and one zero-price sample order with separate links.');

    const orders: MiniOrderRow[] = [
      { id: paidOrderId, title: 'Bộ tài liệu thiết kế giao diện', price: 49_000, status: 'paid', token: paidToken },
      { id: freeOrderId, title: 'Tài liệu khởi động dự án', price: 0, status: 'paid', token: freeToken },
    ];

    return miniJson(c, {
      session,
      orders,
      expectedSha256: await sha256Hex(FIXTURE_TEXT),
    }, 201);
  });

  app.get('/api/mini/orders', async (c) => {
    const session = await activeSession(c, now);
    if (!session) return miniJson(c, { error: 'Mini session is missing or expired.' }, 401);

    const result = await c.env.DB.prepare(`
      SELECT o.id, o.title, o.price, o.status, d.token
      FROM orders o
      JOIN downloads d ON d.id = (
        SELECT latest.id
        FROM downloads latest
        WHERE latest.order_id = o.id
        ORDER BY latest.created_at DESC, latest.id DESC
        LIMIT 1
      )
      WHERE o.session_hash = ?
      ORDER BY o.price DESC, o.id
    `).bind(session.hash).all<MiniOrderRow>();
    addTrace(c, 'orders_read', `Returned ${result.results.length} order(s) owned by the active session.`);
    return miniJson(c, {
      orders: result.results,
      expectedSha256: await sha256Hex(FIXTURE_TEXT),
    });
  });

  app.post('/api/mini/orders/:id/renew', async (c) => {
    const currentMilliseconds = now();
    const currentTime = toSqlUtc(currentMilliseconds);
    const session = await activeSession(c, now);
    if (!session) return miniJson(c, { error: 'Mini session is missing or expired.' }, 401);

    const idText = c.req.param('id');
    if (!/^\d+$/.test(idText)) {
      addTrace(c, 'order_id_validation', 'Rejected a non-numeric mini order id.');
      return miniJson(c, { error: 'Invalid mini order id.' }, 400);
    }
    const orderId = Number(idText);
    if (!Number.isSafeInteger(orderId)) {
      addTrace(c, 'order_id_validation', 'Rejected a mini order id outside the safe integer range.');
      return miniJson(c, { error: 'Invalid mini order id.' }, 400);
    }
    addTrace(c, 'order_id_validation', 'Accepted a safe integer mini order id.');

    const order = await c.env.DB.prepare(`
      SELECT id
      FROM orders
      WHERE id = ? AND session_hash = ? AND status = 'paid'
    `).bind(orderId, session.hash).first<{ id: number }>();
    if (!order) {
      addTrace(c, 'order_ownership', 'No paid order with this id belongs to the active session.');
      return miniJson(c, { error: 'Paid mini order not found.' }, 404);
    }
    addTrace(c, 'order_ownership', 'Confirmed the paid order belongs to the active session.');

    const reusableToken = await loadReusableGrant(c.env, orderId, session.hash, currentTime);
    if (reusableToken) {
      addTrace(c, 'grant_renewal', 'Reused an unconsumed active policy version 1 token.');
      return miniJson(c, { token: reusableToken, reused: true });
    }

    const token = randomHex(16);
    const downloadId = randomSqlId();
    const expiresAt = toSqlUtc(currentMilliseconds + SESSION_TTL_MS);
    const inserted = await c.env.DB.prepare(`
      INSERT INTO downloads (id, order_id, token, expires_at, policy_version, created_at)
      SELECT ?, o.id, ?, ?, 1, ?
      FROM orders o
      WHERE o.id = ?
        AND o.session_hash = ?
        AND o.status = 'paid'
        AND EXISTS (
          SELECT 1 FROM mini_sessions s
          WHERE s.session_hash = o.session_hash AND s.expires_at > ?
        )
        AND NOT EXISTS (
          SELECT 1 FROM downloads d
          WHERE d.order_id = o.id
            AND d.policy_version = 1
            AND d.used_at IS NULL
            AND d.expires_at > ?
        )
    `).bind(downloadId, token, expiresAt, currentTime, orderId, session.hash, currentTime, currentTime).run();

    if (inserted.meta.changes > 0) {
      addTrace(c, 'grant_renewal', 'Atomically created a new token because no active unused token remained.');
      return miniJson(c, { token, reused: false });
    }

    const racedToken = await loadReusableGrant(c.env, orderId, session.hash, currentTime);
    if (racedToken) {
      addTrace(c, 'grant_renewal', 'Reused the active token created by a concurrent renewal request.');
      return miniJson(c, { token: racedToken, reused: true });
    }
    addTrace(c, 'grant_renewal', 'The paid order or session expired before the token could be inserted.');
    return miniJson(c, { error: 'Paid mini order is no longer available.' }, 404);
  });

  app.get('/api/mini/state/:token', async (c) => {
    const session = await activeSession(c, now);
    if (!session) return miniJson(c, { error: 'Mini session is missing or expired.' }, 401);

    const token = c.req.param('token');
    if (!DOWNLOAD_TOKEN.test(token)) {
      addTrace(c, 'token_validation', 'Rejected a token with an invalid format.');
      return miniJson(c, { error: 'Invalid token format.' }, 400);
    }
    addTrace(c, 'token_validation', 'Token format is valid.');

    const state = await c.env.DB.prepare(`
      SELECT d.used_at, d.idempotency_key, d.policy_version, d.expires_at
      FROM downloads d
      JOIN orders o ON o.id = d.order_id
      WHERE d.token = ? AND o.session_hash = ?
    `).bind(token, session.hash).first<MiniStateRow>();
    if (!state) {
      addTrace(c, 'token_ownership', 'No token with this value belongs to the active session.');
      return miniJson(c, { error: 'Unknown mini token.' }, 404);
    }
    addTrace(c, 'token_ownership', 'Returned the token state after confirming session ownership.');
    return miniJson(c, state);
  });
}
