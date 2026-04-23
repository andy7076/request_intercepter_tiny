// Unit tests for shared/rule-normalize.js
// Run with: node --test tests/rule-normalize.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');

// 通过一个 sandbox 把 UMD/IIFE 模块加载进来
function loadRuleNormalize() {
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'shared', 'rule-normalize.js'),
    'utf8'
  );
  const sandbox = { globalThis: {} };
  sandbox.self = sandbox.globalThis;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.globalThis.RuleNormalize;
}

const RN = loadRuleNormalize();

test('normalizeMethod: 默认值与大小写', () => {
  assert.equal(RN.normalizeMethod(), 'ALL');
  assert.equal(RN.normalizeMethod(''), 'ALL');
  assert.equal(RN.normalizeMethod('get'), 'GET');
  assert.equal(RN.normalizeMethod('Post'), 'POST');
});

test('normalizeMatchMode: 合法值 / 非法值', () => {
  assert.equal(RN.normalizeMatchMode('exact'), 'exact');
  assert.equal(RN.normalizeMatchMode('wildcard'), 'wildcard');
  assert.equal(RN.normalizeMatchMode('contains'), 'contains');
  assert.equal(RN.normalizeMatchMode('bogus'), 'contains');
  assert.equal(RN.normalizeMatchMode(undefined), 'contains');
});

test('inferMatchMode: 根据 * 推断', () => {
  assert.equal(RN.inferMatchMode(undefined, '/api/user/*'), 'wildcard');
  assert.equal(RN.inferMatchMode(undefined, '/api/user'), 'contains');
  assert.equal(RN.inferMatchMode('exact', '/api/*'), 'exact'); // 显式值优先
});

test('normalizePriority: 截断非法 / 非整数', () => {
  assert.equal(RN.normalizePriority(), 0);
  assert.equal(RN.normalizePriority('abc'), 0);
  assert.equal(RN.normalizePriority(1.9), 1);
  assert.equal(RN.normalizePriority(-3.2), -3);
  assert.equal(RN.normalizePriority(Infinity), 0);
});

test('normalizeStatus: HTTP 范围 [100,599]', () => {
  assert.equal(RN.normalizeStatus(), 200);
  assert.equal(RN.normalizeStatus(99), 200);
  assert.equal(RN.normalizeStatus(600), 200);
  assert.equal(RN.normalizeStatus(404), 404);
  assert.equal(RN.normalizeStatus('500'), 500);
  assert.equal(RN.normalizeStatus(200.5), 200);
});

test('normalizeDelayMs: 非负整数', () => {
  assert.equal(RN.normalizeDelayMs(), 0);
  assert.equal(RN.normalizeDelayMs(-5), 0);
  assert.equal(RN.normalizeDelayMs(1000.8), 1000);
  assert.equal(RN.normalizeDelayMs('300'), 300);
});

test('normalizeResponseHeaders: 过滤空 key / 强制字符串值', () => {
  // 跨 realm 的对象 prototype 不同，deepStrictEqual 会挂；用 entries 比对
  assert.deepEqual(Object.entries(RN.normalizeResponseHeaders()), []);
  assert.deepEqual(Object.entries(RN.normalizeResponseHeaders(null)), []);
  assert.deepEqual(Object.entries(RN.normalizeResponseHeaders([])), []);
  assert.deepEqual(
    Object.entries(RN.normalizeResponseHeaders({ 'X-A': 1, '  ': 'skip', 'X-B': null })),
    [['X-A', '1'], ['X-B', '']]
  );
});

test('isLikelyJsonContent', () => {
  assert.equal(RN.isLikelyJsonContent('{"a":1}'), true);
  assert.equal(RN.isLikelyJsonContent('[1,2]'), true);
  assert.equal(RN.isLikelyJsonContent('null'), true); // JSON.parse 认可
  assert.equal(RN.isLikelyJsonContent('not json'), false);
  assert.equal(RN.isLikelyJsonContent(''), false);
});

test('getRuleContentType: header > rule.contentType > 自动推断', () => {
  // header 优先
  assert.equal(
    RN.getRuleContentType({
      responseHeaders: { 'Content-Type': 'application/xml' },
      contentType: 'application/json',
      responseBody: '{"a":1}'
    }),
    'application/xml'
  );
  // header 不区分大小写
  assert.equal(
    RN.getRuleContentType({
      responseHeaders: { 'content-type': 'text/css' }
    }),
    'text/css'
  );
  // 落到 rule.contentType
  assert.equal(
    RN.getRuleContentType({
      responseHeaders: {},
      contentType: 'text/custom'
    }),
    'text/custom'
  );
  // 自动推断 JSON
  assert.equal(
    RN.getRuleContentType({ responseBody: '{"x":1}' }),
    'application/json'
  );
  // 自动推断 plain text
  assert.equal(
    RN.getRuleContentType({ responseBody: 'hi' }),
    'text/plain; charset=utf-8'
  );
});

test('normalizeRule: 幂等', () => {
  const raw = {
    id: 'r1',
    enabled: true,
    type: 'mockResponse',
    urlPattern: '/api/user/*',
    method: 'post',
    responseStatus: '201',
    responseDelayMs: '150',
    responseHeaders: { 'X-A': 1 },
    responseBody: '{"ok":true}'
  };
  const first = RN.normalizeRule(raw);
  const second = RN.normalizeRule(first);
  assert.deepEqual(first, second, 'normalizeRule 应当幂等');
  assert.equal(first.method, 'POST');
  assert.equal(first.matchMode, 'wildcard');
  assert.equal(first.priority, 0);
  assert.equal(first.responseStatus, 201);
  assert.equal(first.responseDelayMs, 150);
  assert.equal(first.contentType, 'application/json');
});

test('sortMockRules: 稳定、按 priority 降序', () => {
  const rules = [
    { id: 'a', priority: 0 },
    { id: 'b', priority: 10 },
    { id: 'c', priority: 10 },
    { id: 'd', priority: 5 }
  ];
  const sorted = RN.sortMockRules(rules);
  assert.deepEqual(sorted.map(r => r.id), ['b', 'c', 'd', 'a']);
});

test('extractMockRules: 仅保留 enabled + mockResponse + 排序', () => {
  const rules = [
    { id: '1', enabled: true, type: 'mockResponse', priority: 1, urlPattern: '/a' },
    { id: '2', enabled: false, type: 'mockResponse', priority: 99, urlPattern: '/b' },
    { id: '3', enabled: true, type: 'redirect', priority: 5, urlPattern: '/c' },
    { id: '4', enabled: true, type: 'mockResponse', priority: 10, urlPattern: '/d' }
  ];
  const extracted = RN.extractMockRules(rules);
  assert.deepEqual(extracted.map(r => r.id), ['4', '1']);
});

test('extractMockRules: 空输入', () => {
  assert.equal(RN.extractMockRules().length, 0);
  assert.equal(RN.extractMockRules(null).length, 0);
  assert.equal(RN.extractMockRules([]).length, 0);
});
