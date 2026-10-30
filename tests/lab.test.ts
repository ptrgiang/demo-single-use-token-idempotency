import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src';

const app = createApp();

describe('lab page', () => {
  it.each(['/lab', '/lab/'])('serves the HTML simulation at %s', async (path) => {
    const response = await app.fetch(new Request(new URL(path, 'http://localhost')), env);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toMatch(/^text\/html(?:;\s*charset=utf-8)?$/i);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    expect(html).toContain('Single-use Token Demo');
    expect(html).toContain('id="project2-panel"');
    expect(html).toContain('id="project1-panel"');
  });

  it('denies lab requests with a non-loopback host', async () => {
    const response = await app.fetch(new Request('https://example.com/lab'), env);

    expect(response.status).toBe(403);
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });
});
