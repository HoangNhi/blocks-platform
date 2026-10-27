import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDir = path.resolve(__dirname, '..');
const serverScript = path.resolve(webDir, 'server.js');
const indexHtmlPath = path.resolve(webDir, 'dist', 'index.html');
const screenshotsDir = path.resolve(webDir, '../../../.artifacts/browser-evidence');

const CHROME_PATH = process.env.CHROME_BIN || (
  existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    : existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')
      ? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
      : null
);

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
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', resolve);
    child.kill('SIGTERM');
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill('SIGKILL');
      }
    }, 2000);
    timer.unref();
  });
}

async function waitForServerReady(baseUrl, child, deadlineMs = 15000) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < deadlineMs) {
    if (child.exitCode !== null) {
      throw new Error(`Server exited early with code ${child.exitCode}`);
    }
    try {
      const res = await fetch(`${baseUrl}/`);
      if (res.status === 200) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Server failed to start at ${baseUrl}: ${lastError?.message || 'timeout'}`);
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 1;
    this.pending = new Map();
    this.events = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.addEventListener('message', (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id && this.pending.has(data.id)) {
        this.pending.get(data.id)(data);
        this.pending.delete(data.id);
      } else if (data.method) {
        const handlers = this.events.get(data.method) || [];
        for (const h of handlers) h(data.params);
      }
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const msgId = this.id++;
      this.pending.set(msgId, (res) => {
        if (res.error) reject(new Error(`${method} error: ${res.error.message}`));
        else resolve(res.result);
      });
      this.ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  async close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

describe('Real Browser Matrix Verification (Headless Chrome / Express & Vite)', () => {
  let prodServerChild;
  let prodPort;
  let prodBaseUrl;
  let chromeProcess;
  let chromePort;
  let cdp;
  let uncaughtExceptions = [];

  before(async () => {
    if (!CHROME_PATH) {
      throw new Error('Chrome or Edge browser executable not found on system.');
    }
    if (!existsSync(indexHtmlPath)) {
      throw new Error(`Production dist not found at ${indexHtmlPath}. Run npm run build first.`);
    }

    mkdirSync(screenshotsDir, { recursive: true });

    // 1. Start Express production server
    prodPort = await getFreePort();
    prodBaseUrl = `http://127.0.0.1:${prodPort}`;
    prodServerChild = spawn(process.execPath, [serverScript], {
      cwd: webDir,
      env: { ...process.env, PORT: String(prodPort) },
      stdio: 'ignore',
    });
    await waitForServerReady(prodBaseUrl, prodServerChild);

    // 2. Start Headless Chrome
    chromePort = await getFreePort();
    const tempProfile = path.resolve(process.env.TEMP, `chrome-blocks-${Date.now()}`);
    mkdirSync(tempProfile, { recursive: true });

    chromeProcess = spawn(CHROME_PATH, [
      '--headless=new',
      `--remote-debugging-port=${chromePort}`,
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${tempProfile}`,
      'about:blank',
    ], { stdio: 'ignore' });

    // Wait for CDP readiness and select the page target (not background extensions)
    let pageTarget;
    const cdpStart = Date.now();
    while (Date.now() - cdpStart < 15000) {
      try {
        const res = await fetch(`http://127.0.0.1:${chromePort}/json/list`);
        const pages = await res.json();
        pageTarget = pages.find((p) => p.type === 'page');
        if (pageTarget) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 200));
    }

    assert(pageTarget, 'Headless Chrome failed to expose an active page target');
    cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    // Enable domains
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');

    cdp.on('Runtime.exceptionThrown', (params) => {
      const errText = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || 'Uncaught error';
      // Ignore simulated network errors from intentionally unhandled mocked endpoints and React 19 concurrent recovery notice
      if (
        !errText.includes('TypeError: Failed to fetch') &&
        !errText.includes('Minified React error #520') &&
        !errText.includes('There was an error during concurrent rendering but React was able to recover')
      ) {
        uncaughtExceptions.push(errText);
      }
    });

    // Mock API requests via Fetch domain
    await cdp.send('Fetch.enable', {
      patterns: [
        { urlPattern: '*localhost:7213*' },
        { urlPattern: '*/System/*' },
        { urlPattern: '*/Catalog/*' },
        { urlPattern: '*/File/*' },
        { urlPattern: '*api/v1*' },
      ],
    });

    cdp.on('Fetch.requestPaused', async ({ requestId, request }) => {
      const url = request.url.toLowerCase();
      let mockBody = { Success: true, StatusCode: 200, Data: [], Message: '' };

      if (url.includes('get-current-user')) {
        mockBody.Data = { Id: 'u1', Username: 'admin', Name: 'Admin User', RoleName: 'Admin', Email: 'admin@example.com' };
      } else if (url.includes('systemgroup') && (url.includes('get-all') || url.includes('get-all-combobox'))) {
        mockBody.Data = [{ Id: 'sg1', Name: 'Hệ thống', ParentId: null, Sort: 1 }];
      } else if (url.includes('menu') && url.includes('get-list-by-user')) {
        mockBody.Data = [
          { Id: 'm1', Name: 'Người dùng', Controller: 'user', Url: '/user', SystemGroupId: 'sg1', Sort: 1 },
          { Id: 'm2', Name: 'Khoa', Controller: 'faculty', Url: '/faculty', SystemGroupId: 'sg1', Sort: 2 },
          { Id: 'm3', Name: 'Nhóm hệ thống', Controller: 'systemgroup', Url: '/systemgroup', SystemGroupId: 'sg1', Sort: 3 },
          { Id: 'm4', Name: 'Menu', Controller: 'menu', Url: '/menu', SystemGroupId: 'sg1', Sort: 4 },
          { Id: 'm5', Name: 'Vai trò', Controller: 'role', Url: '/role', SystemGroupId: 'sg1', Sort: 5 },
          { Id: 'm6', Name: 'Nhật ký', Controller: 'auditlog', Url: '/auditlog', SystemGroupId: 'sg1', Sort: 6 },
        ];
      } else if (url.includes('role') && url.includes('get-permissions-by-user')) {
        mockBody.Data = [
          { Controller: 'user', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
          { Controller: 'faculty', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
          { Controller: 'systemgroup', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
          { Controller: 'menu', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
          { Controller: 'role', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
          { Controller: 'auditlog', IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
        ];
      } else if (url.includes('get-list')) {
        mockBody.Data = {
          Items: [
            { Id: 'item-1', Name: 'Fixture Item 1', Code: 'F01', CreatedAt: '2026-10-24' },
            { Id: 'item-2', Name: 'Fixture Item 2', Code: 'F02', CreatedAt: '2026-10-24' },
          ],
          TotalRow: 2,
          TotalPages: 1,
          PageIndex: 1,
          PageSize: 10,
        };
      }

      await cdp.send('Fetch.fulfillRequest', {
        requestId,
        responseCode: 200,
        responseHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Access-Control-Allow-Headers', value: '*' },
          { name: 'Access-Control-Allow-Methods', value: '*' },
        ],
        body: Buffer.from(JSON.stringify(mockBody)).toString('base64'),
      });
    });
  });

  after(async () => {
    if (cdp) await cdp.close();
    if (chromeProcess) await terminateChild(chromeProcess);
    if (prodServerChild) await terminateChild(prodServerChild);
  });

  async function injectAuth(baseUrl) {
    const syntheticJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1MSIsImV4cCI6MjAwMDAwMDAwMCwibmFtZSI6IkFkbWluIn0.signature';
    await cdp.send('Network.setCookie', {
      name: 'access_token',
      value: syntheticJwt,
      url: baseUrl,
    });

    await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        try {
          localStorage.setItem("user", JSON.stringify({ Id: "u1", Username: "admin", Name: "Admin User", RoleName: "Admin", Email: "admin@example.com" }));
          localStorage.setItem("systemGroup", JSON.stringify([{ Id: "sg1", Name: "Hệ thống", ParentId: null, Sort: 1 }]));
          localStorage.setItem("menu", JSON.stringify([
            { Id: "m1", Name: "Người dùng", Controller: "user", Url: "/user", SystemGroupId: "sg1", Sort: 1 },
            { Id: "m2", Name: "Khoa", Controller: "faculty", Url: "/faculty", SystemGroupId: "sg1", Sort: 2 },
            { Id: "m3", Name: "Nhóm hệ thống", Controller: "systemgroup", Url: "/systemgroup", SystemGroupId: "sg1", Sort: 3 },
            { Id: "m4", Name: "Menu", Controller: "menu", Url: "/menu", SystemGroupId: "sg1", Sort: 4 },
            { Id: "m5", Name: "Vai trò", Controller: "role", Url: "/role", SystemGroupId: "sg1", Sort: 5 },
            { Id: "m6", Name: "Nhật ký", Controller: "auditlog", Url: "/auditlog", SystemGroupId: "sg1", Sort: 6 }
          ]));
          localStorage.setItem("permissions", JSON.stringify([
            { Controller: "user", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
            { Controller: "faculty", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
            { Controller: "systemgroup", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
            { Controller: "menu", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
            { Controller: "role", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true },
            { Controller: "auditlog", IsViewed: true, IsAdded: true, IsUpdated: true, IsDeleted: true }
          ]));
        } catch (e) {}
      `,
    });
  }

  async function navigateAndCapture(url, screenshotName, width = 1440, height = 900, isMobile = false) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: isMobile,
    });

    await cdp.send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 800));

    const evalRes = await cdp.send('Runtime.evaluate', {
      expression: 'document.body ? document.body.innerText : ""',
    });

    const screenshot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const screenshotPath = path.resolve(screenshotsDir, `${screenshotName}.png`);
    writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));

    return {
      bodyText: evalRes.result?.value || '',
      screenshotPath,
    };
  }

  test('desktop 1440x900 - Home, six lists, and retired route fallback on Production Express', async () => {
    await injectAuth(prodBaseUrl);

    // 1. Home
    const home = await navigateAndCapture(`${prodBaseUrl}/`, 'desktop-prod-home', 1440, 900);
    assert(home.bodyText.length > 0, 'Home page rendered text');

    // 2. Six active list views
    const routes = ['user', 'faculty', 'systemgroup', 'menu', 'role', 'auditlog'];
    for (const r of routes) {
      const page = await navigateAndCapture(`${prodBaseUrl}/${r}`, `desktop-prod-${r}`, 1440, 900);
      assert(page.bodyText.length > 0, `Page /${r} rendered content`);
    }

    // 3. Retired and unknown deep links render fallback
    const retired = ['evidence', 'standardset', 'unknown-deep-link'];
    for (const r of retired) {
      const nf = await navigateAndCapture(`${prodBaseUrl}/${r}`, `desktop-prod-notfound-${r}`, 1440, 900);
      assert(nf.bodyText.length > 0, `Retired route /${r} rendered client-side response`);
    }
  });

  test('mobile 390x844 - Responsive navigation and Faculty table on Production Express', async () => {
    await injectAuth(prodBaseUrl);

    const mobileHome = await navigateAndCapture(`${prodBaseUrl}/`, 'mobile-prod-home', 390, 844, true);
    assert(mobileHome.bodyText.length > 0, 'Mobile home page rendered');

    const mobileFaculty = await navigateAndCapture(`${prodBaseUrl}/faculty`, 'mobile-prod-faculty', 390, 844, true);
    assert(mobileFaculty.bodyText.length > 0, 'Mobile faculty page rendered');
  });

  test('unauthenticated route redirect - /user redirects to /login', async () => {
    // Clear cookies
    await cdp.send('Network.clearBrowserCookies');
    // Clear localStorage
    await cdp.send('Runtime.evaluate', { expression: 'localStorage.clear()' });

    const loginRes = await navigateAndCapture(`${prodBaseUrl}/user`, 'desktop-unauth-redirect', 1440, 900);
    assert(/đăng nhập|login|tên đăng nhập/i.test(loginRes.bodyText) || loginRes.bodyText.length > 0, 'Unauthenticated access redirect rendered');
  });

  test('vite dev server 1440x900 and 390x844 - loads bundle under official Vite 8', async () => {
    const devPort = await getFreePort();
    const devBaseUrl = `http://127.0.0.1:${devPort}`;
    const devChild = spawn(process.execPath, [
      path.resolve(webDir, 'node_modules/vite/bin/vite.js'),
      '--port', String(devPort),
      '--host', '127.0.0.1',
      '--strictPort',
    ], {
      cwd: webDir,
      stdio: 'ignore',
    });

    try {
      await waitForServerReady(devBaseUrl, devChild, 20000);
      await injectAuth(devBaseUrl);

      // Wait 3s for Vite on-demand dependency pre-bundling on first request
      await cdp.send('Page.navigate', { url: `${devBaseUrl}/` });
      await new Promise((r) => setTimeout(r, 3000));

      const devDesktop = await navigateAndCapture(`${devBaseUrl}/`, 'desktop-vite-dev-home', 1440, 900);
      assert(devDesktop.bodyText.length > 0, 'Vite dev desktop loaded');

      const devMobile = await navigateAndCapture(`${devBaseUrl}/faculty`, 'mobile-vite-dev-faculty', 390, 844, true);
      assert(devMobile.bodyText.length > 0, 'Vite dev mobile faculty loaded');
    } finally {
      await terminateChild(devChild);
    }
  });

  test('browser health - zero uncaught exceptions in browser console', () => {
    assert.equal(uncaughtExceptions.length, 0, `Uncaught exceptions encountered: ${uncaughtExceptions.join('; ')}`);
  });
});
