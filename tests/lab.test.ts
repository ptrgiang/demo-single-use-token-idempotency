import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src';

const app = createApp();

describe('lab page', () => {
  it('serves one shared project shell at the root and existing mini links', async () => {
    for (const path of ['/', '/index.html', '/mini', '/mini/']) {
      const response = await app.fetch(new Request(new URL(path, 'http://localhost')), env);
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toMatch(/^text\/html/i);
      expect(html).toContain('id="project1-frame"');
      expect(html).toContain('id="project2-frame"');
      expect(html).toContain('role="tablist"');
    }
  });

  it('serves both child interfaces separately from the shared shell', async () => {
    const lab = await app.fetch(new Request('http://localhost/lab.html?embed=1'), env);
    const mini = await app.fetch(new Request('http://localhost/mini.html?embed=1'), env);
    expect(lab.status).toBe(200);
    expect(mini.status).toBe(200);
    expect(await lab.text()).toContain('id="request-logs"');
    expect(await mini.text()).toContain('id="terminal-toggle"');
  });

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
