import { Hono } from 'hono';
import { FIXTURE_KEY, FIXTURE_TEXT, MISSING_FIXTURE_KEY, TOKENS } from './fixtures';
import type { Env } from './types';

type GrantRow = {
  file_key: string;
  policy_version: number;
};

type CurrentGrantRow = {
  used_at: string | null;
  idempotency_key: string | null;
  retry_window_open: number;
};

const DOWNLOAD_TOKEN = /^[a-f0-9]{32}$/i;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const SIGNED_URL_SECONDS = 300;

function toSqlUtc(milliseconds: number): string {
  const date = new Date(milliseconds);
  if (!Number.isFinite(milliseconds) || Number.isNaN(date.getTime())) {
    throw new RangeError('The demo clock must return a valid millisecond timestamp.');
  }
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function isPrefetchRequest(request: Request): boolean {
  return ['Purpose', 'Sec-Purpose'].some((header) =>
    /\bprefetch\b/i.test(request.headers.get(header) ?? ''),
  );
}

function requestsJson(request: Request): boolean {
  return (request.headers.get('Accept') ?? '').split(',').some((mediaRange) =>
    mediaRange.split(';', 1)[0].trim().toLowerCase() === 'application/json',
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function signedFileMessage(key: string, expiresAt: number): string {
  return `demo-file-v1\n${key}\n${expiresAt}`;
}

async function hmac(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)));
}

async function makeFileUrl(
  requestUrl: string,
  signingKey: string,
  key: string,
  nowMilliseconds: number,
): Promise<string> {
  const expiresAt = Math.floor(nowMilliseconds / 1000) + SIGNED_URL_SECONDS;
  const signature = bytesToHex(await hmac(signingKey, signedFileMessage(key, expiresAt)));
  const url = new URL('/api/file', requestUrl);
  url.searchParams.set('key', key);
  url.searchParams.set('exp', String(expiresAt));
  url.searchParams.set('sig', signature);
  return url.toString();
}

async function isValidFileSignature(
  signingKey: string,
  key: string,
  expiresAt: number,
  signature: string,
): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    hexToBytes(signature),
    new TextEncoder().encode(signedFileMessage(key, expiresAt)),
  );
}

function getSingleQueryValue(requestUrl: string, name: string): string | null {
  const values = new URL(requestUrl).searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
}

export function createApp(options: { now?: () => number } = {}): Hono<{ Bindings: Env }> {
  const now = options.now ?? Date.now;
  const app = new Hono<{ Bindings: Env }>();

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });

  app.use('*', async (c, next) => {
    const hostname = new URL(c.req.url).hostname.toLowerCase();
    if (!LOOPBACK_HOSTS.has(hostname)) {
      return c.json({ error: 'This demo only accepts loopback requests.' }, 403);
    }
    await next();
  });

  app.get('/', (c) => c.text(
    'Single-use token demo\n\n' +
    'The visual simulation is in the repository root index.html.\n' +
    'Reset fixtures with POST /api/demo/reset.\n' +
    'Inspect a token with GET /api/demo/state/<32-hex-token>.\n' +
    'Redeem with GET /api/download/<token>?idem=<UUIDv4>.\n',
  ));

  app.post('/api/demo/reset', async (c) => {
    const nowMilliseconds = now();
    const futureExpiry = toSqlUtc(nowMilliseconds + 24 * 60 * 60 * 1000);
    const pastExpiry = toSqlUtc(nowMilliseconds - 60 * 1000);

    await c.env.FILES.put(FIXTURE_KEY, FIXTURE_TEXT, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
    await c.env.FILES.delete(MISSING_FIXTURE_KEY);

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM downloads'),
      c.env.DB.prepare('DELETE FROM orders'),
      c.env.DB.prepare('DELETE FROM products'),
      c.env.DB.prepare('INSERT INTO products (id, file_key) VALUES (?, ?), (?, ?)')
        .bind(1, FIXTURE_KEY, 2, MISSING_FIXTURE_KEY),
      c.env.DB.prepare('INSERT INTO orders (id, product_id, status) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?), (?, ?, ?)')
        .bind(1, 1, 'paid', 2, 1, 'paid', 3, 1, 'paid', 4, 1, 'pending'),
      c.env.DB.prepare(`
        INSERT INTO orders (id, product_id, status) VALUES (?, ?, ?)
      `).bind(5, 2, 'paid'),
      c.env.DB.prepare(`
        INSERT INTO downloads (id, order_id, token, expires_at, policy_version)
        VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
      `).bind(
        1, 1, TOKENS.fresh, futureExpiry, 1,
        2, 2, TOKENS.legacy, futureExpiry, 0,
        3, 3, TOKENS.expired, pastExpiry, 1,
        4, 4, TOKENS.unpaid, futureExpiry, 1,
        5, 5, TOKENS.missing, futureExpiry, 1,
      ),
    ]);

    return c.json({ tokens: TOKENS, fixtureText: FIXTURE_TEXT });
  });

  app.get('/api/demo/state/:token', async (c) => {
    const token = c.req.param('token');
    if (!DOWNLOAD_TOKEN.test(token)) return c.json({ error: 'Invalid token format.' }, 400);

    const state = await c.env.DB.prepare(`
      SELECT used_at, idempotency_key, policy_version, expires_at
      FROM downloads
      WHERE token = ?
    `).bind(token).first<{
      used_at: string | null;
      idempotency_key: string | null;
      policy_version: number;
      expires_at: string;
    }>();

    if (!state) return c.json({ error: 'Unknown demo token.' }, 404);
    return c.json(state);
  });

  app.on('HEAD', '/api/download/:token', (c) => c.body(null, 405));

  app.get('/api/download/:token', async (c) => {
    if (c.req.method === 'HEAD') return c.body(null, 405);
    if (isPrefetchRequest(c.req.raw)) {
      return c.json({ error: 'Prefetch requests cannot redeem demo links.' }, 403);
    }

    const token = c.req.param('token');
    if (!DOWNLOAD_TOKEN.test(token)) return c.json({ error: 'Invalid token format.' }, 400);

    const nowMilliseconds = now();
    const currentTime = toSqlUtc(nowMilliseconds);
    const row = await c.env.DB.prepare(`
      SELECT p.file_key, d.policy_version
      FROM downloads d
      JOIN orders o ON o.id = d.order_id
      JOIN products p ON p.id = o.product_id
      WHERE d.token = ?
        AND d.expires_at > ?
        AND o.status = 'paid'
    `).bind(token, currentTime).first<GrantRow>();

    if (!row) return c.json({ error: 'Invalid or expired demo link.' }, 404);

    let idempotencyKey = '';
    if (row.policy_version > 0) {
      idempotencyKey = getSingleQueryValue(c.req.url, 'idem') ?? '';
      if (!UUID_V4.test(idempotencyKey)) {
        return c.json({ error: 'Provide exactly one valid UUIDv4 idempotency key.' }, 400);
      }
    }

    if (!await c.env.FILES.head(row.file_key)) {
      return c.json({ error: 'Demo file is not available.' }, 404);
    }

    const downloadUrl = await makeFileUrl(
      c.req.url,
      c.env.DEMO_SIGNING_KEY,
      row.file_key,
      nowMilliseconds,
    );
    const respondWithUrl = () => requestsJson(c.req.raw)
      ? c.json({ downloadUrl }, 200)
      : c.redirect(downloadUrl, 302);

    if (row.policy_version === 0) return respondWithUrl();

    const mutationTime = toSqlUtc(now());
    const consumed = await c.env.DB.prepare(`
      UPDATE downloads
      SET used_at = COALESCE(used_at, ?),
          idempotency_key = COALESCE(idempotency_key, ?)
      WHERE token = ?
        AND policy_version > 0
        AND expires_at > ?
        AND EXISTS (
          SELECT 1 FROM orders o
          WHERE o.id = downloads.order_id AND o.status = 'paid'
        )
        AND (
          (used_at IS NULL AND idempotency_key IS NULL)
          OR (
            used_at IS NOT NULL
            AND idempotency_key = ?
            AND used_at > datetime(?, '-60 seconds')
          )
        )
    `).bind(mutationTime, idempotencyKey, token, mutationTime, idempotencyKey, mutationTime).run();

    if (consumed.meta.changes > 0) return respondWithUrl();

    const currentTimeForRetry = toSqlUtc(now());
    const current = await c.env.DB.prepare(`
      SELECT d.used_at, d.idempotency_key,
             CASE WHEN d.used_at > datetime(?, '-60 seconds') THEN 1 ELSE 0 END AS retry_window_open
      FROM downloads d
      JOIN orders o ON o.id = d.order_id
      WHERE d.token = ?
        AND d.expires_at > ?
        AND o.status = 'paid'
    `).bind(currentTimeForRetry, token, currentTimeForRetry).first<CurrentGrantRow>();

    if (!current) return c.json({ error: 'Invalid or expired demo link.' }, 404);
    if (
      current.used_at !== null &&
      current.idempotency_key === idempotencyKey &&
      current.retry_window_open === 1
    ) {
      return respondWithUrl();
    }
    return c.json({ error: 'Demo grant already used.' }, 403);
  });

  app.get('/api/file', async (c) => {
    const key = getSingleQueryValue(c.req.url, 'key');
    const expiresText = getSingleQueryValue(c.req.url, 'exp');
    const signature = getSingleQueryValue(c.req.url, 'sig');
    if (
      key !== FIXTURE_KEY ||
      expiresText === null ||
      !/^\d+$/.test(expiresText) ||
      signature === null
    ) {
      return c.text('Invalid demo file link.', 403);
    }

    const expiresAt = Number(expiresText);
    if (!Number.isSafeInteger(expiresAt) || Math.floor(now() / 1000) >= expiresAt) {
      return c.text('Demo file link expired.', 403);
    }

    if (!await isValidFileSignature(c.env.DEMO_SIGNING_KEY, key, expiresAt, signature)) {
      return c.text('Invalid demo file signature.', 403);
    }

    const object = await c.env.FILES.get(key);
    if (!object) return c.text('Demo file is not available.', 404);
    return new Response(object.body, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': 'attachment; filename="sample-notes.txt"',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  });

  return app;
}

export default createApp();
