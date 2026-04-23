// 冒烟测试：加载未打包扩展 → 操作 chrome.storage 写入规则 →
// 验证 fetch / XHR / SSE 在各种场景下的拦截/透传行为。
//
// 运行：
//   npm install && npm run smoke:install    # 首次
//   npm run smoke

const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const { test, expect, chromium } = require('@playwright/test');

const EXT_ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES_DIR = path.join(__dirname, 'fixtures');

// ---------- Fixture HTTP server ----------
// 提供一组原始端点用于区分 "mock" 与 "真实" 响应。
function startFixtureServer() {
  const server = http.createServer((req, res) => {
    const url = req.url;

    if (url === '/target.html' || url === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(fs.readFileSync(path.join(FIXTURES_DIR, 'target.html')));
      return;
    }

    if (url === '/api/user') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ name: 'original', mocked: false }));
      return;
    }

    if (url.startsWith('/api/v1/item/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ source: 'real', path: url }));
      return;
    }

    if (url === '/api/exact') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('real-exact');
      return;
    }

    if (url === '/api/method') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('real-' + req.method);
      return;
    }

    if (url === '/api/sse') {
      // 一个会持续推送的 SSE 端点 —— 如果 injected.js 真的 await text()
      // 会一直挂住；shouldSkipBodyCapture 必须在 fetch 阶段就跳过。
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive'
      });
      let i = 0;
      const timer = setInterval(() => {
        res.write(`data: tick-${++i}\n\n`);
      }, 100);
      req.on('close', () => clearInterval(timer));
      return;
    }

    if (url === '/api/big') {
      // > 512KB，触发 shouldSkipBodyCapture 的 content-length 分支
      const body = 'x'.repeat(600 * 1024);
      res.writeHead(200, {
        'content-type': 'text/plain',
        'content-length': Buffer.byteLength(body)
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

// ---------- Chromium + 扩展 ----------
async function launchWithExtension(userDataDir) {
  return chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      `--disable-extensions-except=${EXT_ROOT}`,
      `--load-extension=${EXT_ROOT}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]
  });
}

async function getServiceWorker(context) {
  let [sw] = context.serviceWorkers();
  if (!sw) {
    sw = await context.waitForEvent('serviceworker', { timeout: 10_000 });
  }
  // 等 background.js 跑完 syncContentScriptRegistration，否则
  // 后续 page.goto 在 document_start 注入不到 content.js，
  // 整条拦截链路会静默失败。
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const count = await sw.evaluate(async () => {
      try {
        const list = await chrome.scripting.getRegisteredContentScripts();
        return list.length;
      } catch {
        return 0;
      }
    });
    if (count >= 2) break; // MAIN world + ISOLATED world 两条
    await new Promise((r) => setTimeout(r, 100));
  }
  return sw;
}

async function seedRules(sw, rules, enabled = true) {
  await sw.evaluate(async ({ rules, enabled }) => {
    await chrome.storage.local.set({
      interceptRules: rules,
      interceptorEnabled: enabled
    });
  }, { rules, enabled });
}

// 把所有通用 fixture 打包，用 Playwright fixtures 注入。
const it = test.extend({
  env: async ({}, use, testInfo) => {
    const { server, origin } = await startFixtureServer();
    const context = await launchWithExtension(testInfo.outputPath('user-data'));
    const sw = await getServiceWorker(context);
    const page = await context.newPage();

    // 所有测试前都访问一次，确保 content script 已就位
    async function gotoTarget() {
      await page.goto(`${origin}/target.html`);
      // 等 content.js 收到 storage.onChanged 并 sync 到 injected.js
      await page.waitForTimeout(300);
    }

    try {
      await use({ context, sw, page, origin, gotoTarget });
    } finally {
      await context.close();
      server.close();
    }
  }
});

// 统一构造合法 rule，避免每个用例都抄一遍。
function makeRule(overrides = {}) {
  return {
    id: overrides.id || ('rule-' + Math.random().toString(36).slice(2, 8)),
    enabled: true,
    type: 'mockResponse',
    name: 'smoke',
    urlPattern: '/api/user',
    matchMode: 'contains',
    method: 'ALL',
    priority: 0,
    responseStatus: 200,
    responseDelayMs: 0,
    responseBody: '{"mocked":true}',
    responseHeaders: { 'content-type': 'application/json' },
    ...overrides
  };
}

// ==================== 用例 ====================

it('fetch + XHR 的 contains 匹配都会被 mock', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    matchMode: 'contains',
    responseBody: JSON.stringify({ name: 'mocked', mocked: true })
  })]);
  await env.gotoTarget();

  const f = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(f.status).toBe(200);
  expect(f.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(JSON.parse(f.body).mocked).toBe(true);

  const x = await env.page.evaluate((u) => window.__runXhr(u), `${env.origin}/api/user`);
  expect(x.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(JSON.parse(x.body).mocked).toBe(true);
});

it('关闭总开关后请求恢复原样', async ({ env }) => {
  await seedRules(env.sw, [makeRule()], /* enabled */ false);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(r.mockedBy).toBeNull();
  expect(JSON.parse(r.body).mocked).toBe(false);
});

it('wildcard 模式 (*) 走 RegExp 分支', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    // 前置 * 让 buildMatcher 不加 ^ 锚点，从而能匹配完整 URL
    urlPattern: '*/api/v1/item/*',
    matchMode: 'wildcard',
    responseBody: JSON.stringify({ source: 'mock' })
  })]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/v1/item/42?x=1`);
  expect(r.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(JSON.parse(r.body).source).toBe('mock');
});

it('exact 模式 —— 完全相等才命中', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: `http://127.0.0.1/api/exact`, // 故意写错 origin，让它不等
    matchMode: 'exact',
    responseBody: 'mocked-exact'
  })]);
  await env.gotoTarget();

  // 不命中：应当走原始端点
  const miss = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/exact`);
  expect(miss.mockedBy).toBeNull();
  expect(miss.body).toBe('real-exact');

  // 改成完整正确 URL 命中
  await seedRules(env.sw, [makeRule({
    urlPattern: `${env.origin}/api/exact`,
    matchMode: 'exact',
    responseBody: 'mocked-exact'
  })]);
  await env.page.waitForTimeout(200);
  const hit = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/exact`);
  expect(hit.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(hit.body).toBe('mocked-exact');
});

it('method 过滤：规则限定 POST 时 GET 应透传', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/method',
    method: 'POST',
    responseBody: 'mocked-post'
  })]);
  await env.gotoTarget();

  // GET 不命中
  const g = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/method`);
  expect(g.mockedBy).toBeNull();
  expect(g.body).toBe('real-GET');

  // POST 命中
  const p = await env.page.evaluate((u) => window.__runFetch(u, { method: 'POST' }), `${env.origin}/api/method`);
  expect(p.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(p.body).toBe('mocked-post');
});

it('多规则命中时 priority 高的优先', async ({ env }) => {
  await seedRules(env.sw, [
    makeRule({ id: 'low',  urlPattern: '/api/user', priority: 1,  responseBody: '"low"' }),
    makeRule({ id: 'high', urlPattern: '/api/user', priority: 99, responseBody: '"high"' })
  ]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(r.body).toBe('"high"');
});

it('responseDelayMs 生效', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    responseDelayMs: 500,
    responseBody: '{"delayed":true}'
  })]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(r.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(r.durationMs).toBeGreaterThanOrEqual(450); // 留一点误差
});

it('自定义 status / headers 能被读到', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    responseStatus: 404,
    responseBody: 'not found',
    responseHeaders: { 'content-type': 'text/plain', 'X-Foo': 'bar' }
  })]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(r.status).toBe(404);
  expect(r.xFoo).toBe('bar');
  expect(r.body).toBe('not found');
});

it('XHR responseType=json 返回解析后的对象', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    responseBody: JSON.stringify({ kind: 'parsed' })
  })]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runXhrJson(u), `${env.origin}/api/user`);
  expect(r.mockedBy).toBe('Request-Interceptor-Tiny');
  expect(typeof r.response).toBe('object');
  expect(r.response.kind).toBe('parsed');
});

it('disabled 规则不生效', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    enabled: false,
    responseBody: '{"mocked":true}'
  })]);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(r.mockedBy).toBeNull();
  expect(JSON.parse(r.body).mocked).toBe(false);
});

it('SSE 端点不挂起、不误 mock', async ({ env }) => {
  // 不写任何规则，只是验证 shouldSkipBodyCapture 对 text/event-stream
  // 不会死锁页面。若拦截器错误处理 SSE，页面会 hang 住或报错。
  await seedRules(env.sw, []);
  await env.gotoTarget();

  const r = await env.page.evaluate((u) => window.__runSse(u, 600), `${env.origin}/api/sse`);
  expect(r.count).toBeGreaterThanOrEqual(3); // 600ms / 100ms tick
});

it('规则热更新：后续请求使用新规则', async ({ env }) => {
  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    responseBody: '"v1"'
  })]);
  await env.gotoTarget();

  const first = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(first.body).toBe('"v1"');

  await seedRules(env.sw, [makeRule({
    urlPattern: '/api/user',
    responseBody: '"v2"'
  })]);
  await env.page.waitForTimeout(200); // 让 storage.onChanged 传到 content.js

  const second = await env.page.evaluate((u) => window.__runFetch(u), `${env.origin}/api/user`);
  expect(second.body).toBe('"v2"');
});
