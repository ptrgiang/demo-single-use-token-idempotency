import { Hono } from 'hono';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import labPage from '../index.html';
import { FIXTURE_KEY, FIXTURE_TEXT, MISSING_FIXTURE_KEY, TOKENS } from './fixtures';
import { registerMiniRoutes } from './mini';
import type { AppEnv, Env } from './types';

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
const FIXTURE_SIGNING_KEY = 'public-demo-fixture-key-not-for-real-files';

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

export function createApp(options: { now?: () => number } = {}): Hono<AppEnv> {
  const now = options.now ?? Date.now;
  const app = new Hono<AppEnv>();

  const isRemote = (env: Env) => env.DEMO_REMOTE === 'true';
  const hasRemoteSecrets = (env: Env) => {
    const signingKey = env.DEMO_SIGNING_KEY;
    return typeof env.DEMO_ACCESS_TOKEN === 'string'
      && env.DEMO_ACCESS_TOKEN.length >= 32
      && typeof signingKey === 'string'
      && signingKey.length >= 32
      && signingKey !== FIXTURE_SIGNING_KEY
      && !/(?:fixture|not-for-real)/i.test(signingKey);
  };

  const addTrace = (c: Context<AppEnv>, stage: string, detail: string) => {
    c.get('trace').push({ stage, detail });
  };

  const isGrantRequest = (c: Context<AppEnv>) =>
    new URL(c.req.url).pathname.startsWith('/api/download/');
  const isTracedApi = (c: Context<AppEnv>) => {
    const pathname = new URL(c.req.url).pathname;
    return isGrantRequest(c) || pathname.startsWith('/api/mini/');
  };

  const jsonResponse = (
    c: Context<AppEnv>,
    body: Record<string, unknown>,
    status: ContentfulStatusCode,
  ) => isTracedApi(c)
    ? c.json({ ...body, requestId: c.get('requestId'), _trace: c.get('trace') }, status)
    : c.json(body, status);

  const denyGrant = (c: Context<AppEnv>, message: string, status: ContentfulStatusCode) =>
    jsonResponse(c, { error: message }, status);

  app.use('*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store');
    c.header('Referrer-Policy', 'no-referrer');
    const suppliedRequestId = c.req.header('X-Request-Id') ?? '';
    const requestId = /^[A-Za-z0-9._:-]{1,80}$/.test(suppliedRequestId)
      ? suppliedRequestId
      : crypto.randomUUID();
    c.set('requestId', requestId);
    c.set('trace', []);
    c.header('X-Request-Id', requestId);
    await next();
  });

  app.use('*', async (c, next) => {
    const hostname = new URL(c.req.url).hostname.toLowerCase();
    const pathname = new URL(c.req.url).pathname;
    if (!isRemote(c.env) && !LOOPBACK_HOSTS.has(hostname)) {
      addTrace(c, 'host_validation', 'Rejected a non-loopback request in local mode.');
      if (isGrantRequest(c)) return denyGrant(c, 'This demo only accepts loopback requests.', 403);
      return jsonResponse(c, { error: 'This demo only accepts loopback requests.' }, 403);
    }

    const publicRemotePaths = new Set(['/api/mini/config']);
    if (isRemote(c.env) && pathname.startsWith('/api/') && !publicRemotePaths.has(pathname)) {
      if (!hasRemoteSecrets(c.env)) {
        addTrace(c, 'remote_configuration', 'Remote API is closed because required secrets are missing or invalid.');
        return jsonResponse(c, { error: 'Remote demo APIs are not configured.' }, 503);
      }
      if (c.req.header('X-Demo-Access') !== c.env.DEMO_ACCESS_TOKEN) {
        addTrace(c, 'remote_access', 'Request did not provide the configured demo access token.');
        return jsonResponse(c, { error: 'A valid demo access token is required.' }, 401);
      }
      addTrace(c, 'remote_access', 'Configured demo access token validated.');
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

  app.get('/lab', (c) => c.html(labPage));
  app.get('/lab/', (c) => c.html(labPage));

  registerMiniRoutes(app, now);

  app.post('/api/demo/reset', async (c) => {
    if (isRemote(c.env)) return c.json({ error: 'Legacy demo fixtures are local-only.' }, 404);
    const nowMilliseconds = now();
    const futureExpiry = toSqlUtc(nowMilliseconds + 24 * 60 * 60 * 1000);
    const pastExpiry = toSqlUtc(nowMilliseconds - 60 * 1000);

    await c.env.FILES.put(FIXTURE_KEY, FIXTURE_TEXT, {
      httpMetadata: { contentType: 'text/plain; charset=utf-8' },
    });
    await c.env.FILES.delete(MISSING_FIXTURE_KEY);

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM downloads WHERE order_id < 1000'),
      c.env.DB.prepare('DELETE FROM orders WHERE id < 1000'),
      c.env.DB.prepare('DELETE FROM products WHERE id < 1000'),
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
    if (isRemote(c.env)) return c.json({ error: 'Legacy demo state is local-only.' }, 404);
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
    addTrace(c, 'request', 'Grant request reached the download handler.');
    const respondJson = (body: Record<string, unknown>, status: ContentfulStatusCode) =>
      jsonResponse(c, body, status);
    const deny = (message: string, status: ContentfulStatusCode) => denyGrant(c, message, status);

    if (c.req.method === 'HEAD') return c.body(null, 405);
    if (isPrefetchRequest(c.req.raw)) {
      addTrace(c, 'request_validation', 'Rejected a browser prefetch before grant lookup.');
      return deny('Prefetch requests cannot redeem demo links.', 403);
    }

    const token = c.req.param('token');
    if (!DOWNLOAD_TOKEN.test(token)) {
      addTrace(c, 'token_validation', 'Rejected a token with an invalid format.');
      return deny('Invalid token format.', 400);
    }
    addTrace(c, 'token_validation', 'Token format is valid.');

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

    if (!row) {
      addTrace(c, 'grant_lookup', 'No unexpired token for an eligible paid or mini free order was found.');
      return deny('Invalid or expired demo link.', 404);
    }
    addTrace(c, 'grant_lookup', 'Found an unexpired token for an eligible order.');

    let idempotencyKey = '';
    if (row.policy_version > 0) {
      idempotencyKey = getSingleQueryValue(c.req.url, 'idem') ?? '';
      if (!UUID_V4.test(idempotencyKey)) {
        addTrace(c, 'idempotency_validation', 'Rejected a missing, duplicate, or invalid UUIDv4 key.');
        return deny('Provide exactly one valid UUIDv4 idempotency key.', 400);
      }
      addTrace(c, 'idempotency_validation', 'Accepted exactly one valid UUIDv4 key.');
    } else {
      addTrace(c, 'idempotency_validation', 'Policy version 0 does not require an idempotency key.');
    }

    if (!await c.env.FILES.head(row.file_key)) {
      addTrace(c, 'file_preflight', 'The referenced R2 object is missing.');
      return deny('Demo file is not available.', 404);
    }
    addTrace(c, 'file_preflight', 'The referenced R2 object exists.');

    const downloadUrl = await makeFileUrl(
      c.req.url,
      c.env.DEMO_SIGNING_KEY,
      row.file_key,
      nowMilliseconds,
    );
    addTrace(c, 'signed_file_url', 'Created a short-lived demo HMAC-SHA-256 file URL.');
    const respondWithUrl = () => requestsJson(c.req.raw)
      ? respondJson({ downloadUrl }, 200)
      : c.redirect(downloadUrl, 302);

    if (row.policy_version === 0) {
      addTrace(c, 'grant_policy', 'Served a grandfathered policy version 0 link without consumption.');
      return respondWithUrl();
    }

    const mutationTime = toSqlUtc(now());
    const grantUpdate = await c.env.DB.prepare(`
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

    if (grantUpdate.meta.changes > 0) {
      addTrace(
        c,
        'grant_update',
        'The conditional update accepted a first grant or a same-key retry; compare before and after state to tell which.',
      );
      return respondWithUrl();
    }

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

    if (!current) {
      addTrace(c, 'grant_recheck', 'The order or token became unavailable during grant processing.');
      return deny('Invalid or expired demo link.', 404);
    }
    if (
      current.used_at !== null &&
      current.idempotency_key === idempotencyKey &&
      current.retry_window_open === 1
    ) {
      addTrace(c, 'grant_retry', 'Accepted the same idempotency key within the 60-second retry window.');
      return respondWithUrl();
    }
    addTrace(c, 'grant_denied', 'Denied because the grant was already used or the retry window closed.');
    return deny('Demo grant already used.', 403);
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
