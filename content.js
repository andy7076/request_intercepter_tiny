// Content Script - 拦截和修改网络请求响应
// 依赖 shared/rule-normalize.js（由 background 注册时排在本文件之前）

const {
  DEFAULT_MATCH_MODE,
  DEFAULT_METHOD,
  DEFAULT_STATUS,
  DEFAULT_DELAY_MS,
  DEFAULT_CONTENT_TYPE,
  normalizeMethod,
  normalizeMatchMode,
  extractMockRules: baseExtractMockRules
} = RuleNormalize;

const PENDING_LOG_TIMEOUT_MS = 8000;

// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// ========== 日志控制 ==========
let consoleLogsEnabled = false;
let interceptorEnabled = true;

function log(...args) {
  if (consoleLogsEnabled) {
    console.log(...args);
  }
}

// 惰性版本：接受一个返回数组的工厂函数，只有在开关开启时才求值
// 用在热路径里，避免 mockRules.map(...) 这类昂贵参数被白算
function logLazy(factory) {
  if (consoleLogsEnabled) {
    const args = factory();
    console.log(...(Array.isArray(args) ? args : [args]));
  }
}

// 存储 mock 规则（已经预编译好匹配器）
let mockRules = [];
let isInitialized = false;

// 等待 originalBody 到来的日志条目：requestId -> { payload, timeoutId }
const pendingMockLogs = new Map();

function syncRulesCountToInjected() {
  window.postMessage({
    type: 'REQUEST_INTERCEPTOR_RULES_UPDATED',
    rulesCount: interceptorEnabled ? mockRules.length : 0
  }, '*');
}

function applyInterceptorEnabledState(enabled) {
  interceptorEnabled = enabled !== false;

  if (!interceptorEnabled) {
    mockRules = [];
    flushAllPendingLogs();
  }

  syncRulesCountToInjected();
}

function getStatusText(status) {
  const statusMap = {
    200: 'OK',
    201: 'Created',
    202: 'Accepted',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout'
  };

  return statusMap[status] || 'Mocked';
}

// ========== 匹配器预编译 ==========
// 热路径上不再每次 new RegExp / toLowerCase，而是在规则加载时预编译一次。
function buildMatcher(pattern, matchMode) {
  const normalizedPattern = String(pattern || '');
  const normalizedMode = normalizeMatchMode(matchMode);

  if (normalizedMode === 'exact') {
    const target = normalizedPattern.toLowerCase();
    return (url) => url.toLowerCase() === target;
  }

  if (normalizedMode === 'contains' || !normalizedPattern.includes('*')) {
    const needle = normalizedPattern.toLowerCase();
    return (url) => url.toLowerCase().includes(needle);
  }

  // 通配符模式：预编译 RegExp
  const startsWithWildcard = normalizedPattern.startsWith('*');
  const endsWithWildcard = normalizedPattern.endsWith('*');
  let regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');

  if (!startsWithWildcard) {
    regexPattern = '^' + regexPattern;
  }
  if (!endsWithWildcard) {
    regexPattern = regexPattern + '(\\?.*|#.*)?$';
  }

  let regex;
  try {
    regex = new RegExp(regexPattern, 'i');
  } catch (e) {
    console.warn('[Request Interceptor Tiny]', 'URL match regex error:', e.message);
    return () => false;
  }
  return (url) => regex.test(url);
}

function attachMatcher(rule) {
  rule._matcher = buildMatcher(rule.urlPattern, rule.matchMode);
  return rule;
}

function extractMockRules(allRules) {
  return baseExtractMockRules(allRules).map(attachMatcher);
}

// 从 storage 直接获取规则（不依赖 background）
function loadMockRules() {
  if (!isExtensionContextValid()) return Promise.resolve([]);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get(['interceptRules', 'interceptorEnabled'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('[Request Interceptor Tiny]', 'Failed to load rules:', chrome.runtime.lastError.message);
          resolve([]);
          return;
        }
        interceptorEnabled = result.interceptorEnabled !== false;
        if (!interceptorEnabled) {
          mockRules = [];
          isInitialized = true;
          syncRulesCountToInjected();
          resolve(mockRules);
          return;
        }
        const allRules = result.interceptRules || [];
        mockRules = extractMockRules(allRules);
        log('[Request Interceptor Tiny] ✅', 'Mock rules loaded:', mockRules.length);
        if (mockRules.length > 0) {
          logLazy(() => ['[Request Interceptor Tiny] 📋', 'Rules list:', mockRules.map(r => ({
            name: r.name,
            pattern: r.urlPattern
          }))]);
        }
        isInitialized = true;
        syncRulesCountToInjected();
        resolve(mockRules);
      });
    } catch (e) {
      resolve([]);
    }
  });
}

// 加载设置
function loadSettings() {
  if (!isExtensionContextValid()) return;
  try {
    chrome.storage.local.get(['consoleLogs'], (result) => {
      if (chrome.runtime.lastError) return;
      consoleLogsEnabled = result.consoleLogs || false;
      window.postMessage({
        type: 'CONSOLE_LOGS_UPDATED',
        enabled: consoleLogsEnabled
      }, '*');
    });
  } catch (e) {
    // 忽略错误
  }
}

// 初始化加载规则和设置
log('[Request Interceptor Tiny] 🚀', 'Initializing content script...');
loadMockRules().then(() => {
  log('[Request Interceptor Tiny] ✨', 'Initialization complete');
  syncRulesCountToInjected();
});
loadSettings();

// 监听 storage 变化 - 规则更新时自动重新加载
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!isExtensionContextValid()) return;

  if (areaName === 'local' && changes['interceptRules']) {
    if (!interceptorEnabled) {
      return;
    }
    const allRules = changes['interceptRules'].newValue || [];
    mockRules = extractMockRules(allRules);
    log('[Request Interceptor Tiny]', 'Rules updated via storage.onChanged, count:', mockRules.length);
    syncRulesCountToInjected();
  }

  if (areaName === 'local' && changes['interceptorEnabled']) {
    const enabled = changes['interceptorEnabled'].newValue !== false;
    if (interceptorEnabled === enabled) return;

    applyInterceptorEnabledState(enabled);
    if (enabled) {
      loadMockRules();
    }
  }

  if (areaName === 'local' && changes['consoleLogs']) {
    const enabled = changes['consoleLogs'].newValue;
    if (consoleLogsEnabled === enabled) return;

    consoleLogsEnabled = enabled;
    window.postMessage({
      type: 'CONSOLE_LOGS_UPDATED',
      enabled: enabled
    }, '*');
  }
});

// 监听 runtime 消息（仅保留开关通知 / 控制台日志通知；
// 规则更新完全由 storage.onChanged 驱动，不再广播 MOCK_RULES_UPDATED）。
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'CONSOLE_LOGS_UPDATED') {
    const enabled = message.enabled;
    if (consoleLogsEnabled === enabled) return;
    consoleLogsEnabled = enabled;
    window.postMessage({
      type: 'CONSOLE_LOGS_UPDATED',
      enabled: enabled
    }, '*');
  } else if (message.type === 'INTERCEPTOR_ENABLED_UPDATED') {
    const enabled = message.enabled !== false;
    if (interceptorEnabled === enabled) return;
    applyInterceptorEnabledState(enabled);
    if (enabled) {
      loadMockRules();
    }
  }
});

// ========== 规则匹配 ==========
function findMockRule(url, method) {
  if (!interceptorEnabled) {
    return null;
  }

  const normalizedMethod = normalizeMethod(method);
  for (const rule of mockRules) {
    if (!rule.enabled) continue;
    const methodMatched = rule.method === DEFAULT_METHOD || rule.method === normalizedMethod;
    if (methodMatched && rule._matcher(url)) {
      return rule;
    }
  }
  return null;
}

// ========== 日志合并提交 ==========
// 之前的实现会写两次 storage：第一次 LOG_MOCK_REQUEST（mockedBody）、
// 第二次 UPDATE_LOG_ORIGINAL_BODY（originalBody）。改成等到 originalBody
// 到齐（或者超时）再一次性提交，避免双倍 O(n) 读写。
function submitMockLog(payload) {
  if (!isExtensionContextValid()) return;
  try {
    chrome.runtime.sendMessage(payload).catch(() => {});
  } catch (e) {
    // 扩展上下文失效，忽略
  }
}

function flushPendingLog(requestId, originalBody) {
  const pending = pendingMockLogs.get(requestId);
  if (!pending) return;
  pendingMockLogs.delete(requestId);
  clearTimeout(pending.timeoutId);
  const payload = { ...pending.payload };
  if (originalBody) {
    payload.originalBody = originalBody;
  }
  submitMockLog(payload);
}

function flushAllPendingLogs() {
  for (const [requestId, pending] of pendingMockLogs) {
    clearTimeout(pending.timeoutId);
    submitMockLog(pending.payload);
    pendingMockLogs.delete(requestId);
  }
}

function queueMockLog(requestId, payload) {
  const timeoutId = setTimeout(() => {
    const pending = pendingMockLogs.get(requestId);
    if (!pending) return;
    pendingMockLogs.delete(requestId);
    submitMockLog(pending.payload);
  }, PENDING_LOG_TIMEOUT_MS);
  pendingMockLogs.set(requestId, { payload, timeoutId });
}

// ========== 监听注入脚本事件 ==========
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'REQUEST_INTERCEPTOR_CHECK') {
    const { url, method, requestId } = data;

    log('[Request Interceptor Tiny]', 'Checking URL:', url, '| Rules count:', mockRules.length);

    if (!isExtensionContextValid()) {
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
      return;
    }

    const mockRule = findMockRule(url, method);
    log('[Request Interceptor Tiny]', 'Match result:', mockRule ? `Matched: ${mockRule.name}` : 'No match');

    if (mockRule) {
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_MOCK',
        requestId: requestId,
        mockResponse: {
          body: mockRule.responseBody,
          contentType: mockRule.contentType || DEFAULT_CONTENT_TYPE,
          headers: mockRule.responseHeaders || {},
          status: mockRule.responseStatus || DEFAULT_STATUS,
          statusText: getStatusText(mockRule.responseStatus || DEFAULT_STATUS),
          delayMs: mockRule.responseDelayMs || DEFAULT_DELAY_MS
        },
        logRequestId: requestId
      }, '*');

      try {
        queueMockLog(requestId, {
          type: 'LOG_MOCK_REQUEST',
          ruleId: mockRule.id,
          ruleName: mockRule.name,
          ruleType: mockRule.type,
          url: url,
          method: method || 'GET',
          matchMode: mockRule.matchMode,
          priority: mockRule.priority,
          status: mockRule.responseStatus || DEFAULT_STATUS,
          mockedBody: mockRule.responseBody
        });
      } catch (e) {
        // 忽略
      }
    } else {
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
    }
    return;
  }

  if (data.type === 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE') {
    const { logRequestId, originalBody } = data;
    if (!isExtensionContextValid()) return;
    flushPendingLog(logRequestId, originalBody);
  }
});

// 注意：injected.js 现在由 manifest.json 直接注入到 MAIN world，无需动态注入
console.log('[Request Interceptor Tiny] 📦', 'Content script ready');
