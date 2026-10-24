import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');
const serverScript = path.resolve(webDir, 'server.js');
const indexHtmlPath = path.resolve(webDir, 'dist', 'index.html');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

function terminateChild(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    const killTimer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2000);
    killTimer.unref();
  });
}

async function waitForServerReady(baseUrl, child, deadlineMs = 10000) {
  const start = Date.now();
  let lastError;

  while (Date.now() - start < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status === 200) {
        return;
      }
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  throw new Error(`Server failed to start within ${deadlineMs}ms: ${lastError?.message || 'timeout'}`);
}

describe('Production Server Characterization', () => {
  let child;
  let baseUrl;
  let indexHtml;

  before(async () => {
    indexHtml = readFileSync(indexHtmlPath, 'utf8');
    const port = await getFreePort();
    baseUrl = `http://127.0.0.1:${port}`;

    child = spawn(process.execPath, [serverScript], {
      cwd: webDir,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    await waitForServerReady(baseUrl, child);
  });

  after(async () => {
    if (child) {
      await terminateChild(child);
    }
  });

  test('serves_root_and_deep_links_as_same_spa', async () => {
    const paths = ['/', '/user', '/faculty', '/unknown/deep-link'];

    for (const p of paths) {
      const res = await fetch(`${baseUrl}${p}`);
      assert.equal(res.status, 200, `Expected 200 for ${p}`);

      const contentType = res.headers.get('content-type') || '';
      assert.match(contentType, /text\/html/, `Expected text/html for ${p}`);

      const body = await res.text();
      assert.equal(body, indexHtml, `Expected response for ${p} to match built index.html`);
    }
  });

  test('serves_referenced_assets_with_correct_content_types', async () => {
    const scriptMatches = [...indexHtml.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
    const linkMatches = [...indexHtml.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

    const assetPaths = [...scriptMatches, ...linkMatches].filter(
      (url) => url.startsWith('/assets/') || url.startsWith('assets/')
    );

    assert.ok(assetPaths.length > 0, 'Expected at least one referenced asset in dist/index.html');

    for (const assetPath of assetPaths) {
      const fullUrl = assetPath.startsWith('/') ? `${baseUrl}${assetPath}` : `${baseUrl}/${assetPath}`;
      const res = await fetch(fullUrl);
      assert.equal(res.status, 200, `Expected 200 for asset ${assetPath}`);

      const contentType = res.headers.get('content-type') || '';
      if (assetPath.endsWith('.js')) {
        assert.match(contentType, /javascript/, `Expected javascript content-type for ${assetPath}`);
      } else if (assetPath.endsWith('.css')) {
        assert.match(contentType, /css/, `Expected css content-type for ${assetPath}`);
      }

      const body = await res.text();
      assert.ok(body.length > 0, `Expected non-empty body for asset ${assetPath}`);
      assert.notEqual(body, indexHtml, `Asset ${assetPath} should not return SPA index.html`);
    }
  });
});
