// Content Script - 拦截和修改网络请求响应



// 检查扩展上下文是否有效
function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// ========== 日志控制 ==========
// 日志控制
let consoleLogsEnabled = false;
let interceptorEnabled = true;
const DEFAULT_MATCH_MODE = 'contains';
const DEFAULT_METHOD = 'ALL';
const DEFAULT_PRIORITY = 0;
const DEFAULT_STATUS = 200;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_CONTENT_TYPE = 'text/plain; charset=utf-8';

function log(...args) {
  if (consoleLogsEnabled) {
    console.log(...args);
  }
}

// 存储 mock 规则
let mockRules = [];
let isInitialized = false;

// 存储待关联的日志，用于将原始响应体与日志关联
const pendingLogs = new Map();

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
    pendingLogs.clear();
  }

  syncRulesCountToInjected();
}

function normalizeMethod(method) {
  const normalized = String(method || DEFAULT_METHOD).toUpperCase();
  return normalized || DEFAULT_METHOD;
}

function normalizeMatchMode(matchMode) {
  const allowedModes = new Set(['exact', 'wildcard', 'contains']);
  return allowedModes.has(matchMode) ? matchMode : DEFAULT_MATCH_MODE;
}

function inferMatchMode(matchMode, urlPattern) {
  if (matchMode) {
    return normalizeMatchMode(matchMode);
  }
  return String(urlPattern || '').includes('*') ? 'wildcard' : DEFAULT_MATCH_MODE;
}

function normalizePriority(priority) {
  const value = Number(priority);
  if (!Number.isFinite(value)) {
    return DEFAULT_PRIORITY;
  }
  return Math.trunc(value);
}

function normalizeStatus(status) {
  const value = Number(status);
  if (!Number.isInteger(value) || value < 100 || value > 599) {
    return DEFAULT_STATUS;
  }
  return value;
}

function normalizeDelayMs(delayMs) {
  const value = Number(delayMs);
  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_DELAY_MS;
  }
  return Math.trunc(value);
}

function normalizeResponseHeaders(headers) {
  if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    const headerName = String(key || '').trim();
    if (!headerName) continue;
    normalized[headerName] = String(value ?? '');
  }
  return normalized;
}

function isLikelyJsonContent(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch (err) {
    return false;
  }
}

function getRuleContentType(rule) {
  const headers = normalizeResponseHeaders(rule.responseHeaders);
  const headerKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
  if (headerKey) {
    return headers[headerKey];
  }
  if (rule.contentType) {
    return rule.contentType;
  }
  return isLikelyJsonContent(rule.responseBody) ? 'application/json' : DEFAULT_CONTENT_TYPE;
}

function sortMockRules(rules) {
  return rules
    .map((rule, index) => ({ rule, index }))
    .sort((a, b) => {
      const priorityDiff = normalizePriority(b.rule.priority) - normalizePriority(a.rule.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.index - b.index;
    })
    .map(item => item.rule);
}

function normalizeRule(rule) {
  const normalized = {
    ...rule,
    method: normalizeMethod(rule.method),
    matchMode: inferMatchMode(rule.matchMode, rule.urlPattern),
    priority: normalizePriority(rule.priority),
    responseStatus: normalizeStatus(rule.responseStatus),
    responseDelayMs: normalizeDelayMs(rule.responseDelayMs),
    responseHeaders: normalizeResponseHeaders(rule.responseHeaders)
  };
  normalized.contentType = getRuleContentType(normalized);
  return normalized;
}

function extractMockRules(allRules) {
  return sortMockRules(
    (allRules || [])
      .filter(rule => rule.enabled && rule.type === 'mockResponse')
      .map(normalizeRule)
  );
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
        log('[Request Interceptor Tiny] 📋', 'Rules list:', mockRules.map(r => ({
          name: r.name,
          pattern: r.urlPattern
        })));
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
    // 更新本地状态
    consoleLogsEnabled = result.consoleLogs || false;
    
    // 通知注入脚本
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
  // 如果扩展上下文失效，提前返回
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
    // 防止重复通知
    if (consoleLogsEnabled === enabled) return;
    
    // 更新本地状态
    consoleLogsEnabled = enabled;
    
    window.postMessage({
      type: 'CONSOLE_LOGS_UPDATED',
      enabled: enabled
    }, '*');
  }
});

// 监听规则更新消息（作为额外保障）
// 监听消息（规则更新或设置更新）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MOCK_RULES_UPDATED') {
    if (!interceptorEnabled) {
      mockRules = [];
      syncRulesCountToInjected();
      return;
    }
    mockRules = extractMockRules(message.rules || []);
    log('[Request Interceptor Tiny]', 'Received MOCK_RULES_UPDATED message, count:', mockRules.length);
    syncRulesCountToInjected();
  } else if (message.type === 'CONSOLE_LOGS_UPDATED') {
    const enabled = message.enabled;
    // 防止重复通知
    if (consoleLogsEnabled === enabled) return;
    
    consoleLogsEnabled = enabled;
    
    // 通知注入脚本
    window.postMessage({
      type: 'CONSOLE_LOGS_UPDATED',
      enabled: enabled
    }, '*');
    
    // Removed redundant console.log to avoid duplicates
  } else if (message.type === 'INTERCEPTOR_ENABLED_UPDATED') {
    const enabled = message.enabled !== false;
    if (interceptorEnabled === enabled) return;
    applyInterceptorEnabledState(enabled);
    if (enabled) {
      loadMockRules();
    }
  }
});

// URL 匹配函数 - 支持通配符
function matchUrl(pattern, url, matchMode = DEFAULT_MATCH_MODE) {
  const normalizedPattern = String(pattern || '');
  const normalizedMode = normalizeMatchMode(matchMode);

  if (normalizedMode === 'exact') {
    return url.toLowerCase() === normalizedPattern.toLowerCase();
  }

  if (normalizedMode === 'contains' || !normalizedPattern.includes('*')) {
    // 直接检查 URL 是否包含该模式（忽略大小写）
    return url.toLowerCase().includes(normalizedPattern.toLowerCase());
  }
  
  // 检查pattern的开头和结尾是否有通配符
  const startsWithWildcard = normalizedPattern.startsWith('*');
  const endsWithWildcard = normalizedPattern.endsWith('*');
  
  // 将通配符模式转换为正则表达式
  const regexPattern = normalizedPattern
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
    .replace(/\*/g, '.*'); // 将 * 转换为 .*
  
  try {
    // 智能锚定策略：
    // - 如果pattern以*开头，则不锚定开头（允许URL前面有任意内容）
    // - 如果pattern以*结尾，则不锚定结尾（允许URL后面有任意内容，如查询参数）
    // - 如果pattern中间有*但两端没有，则锚定两端进行完全匹配
    let finalPattern = regexPattern;
    
    // 只有当pattern不以*开头时才锚定开头
    if (!startsWithWildcard) {
      finalPattern = '^' + finalPattern;
    }
    
    // 只有当pattern不以*结尾时才锚定结尾
    // 但为了兼容性，即使不以*结尾也允许末尾有查询参数
    if (!endsWithWildcard) {
      // 允许末尾有可选的查询参数(?...)或hash(#...)
      finalPattern = finalPattern + '(\\?.*|#.*)?$';
    }
    
    const regex = new RegExp(finalPattern, 'i');
    return regex.test(url);
  } catch (e) {
    console.warn('[Request Interceptor Tiny]', 'URL match regex error:', e.message);
    return false;
  }
}

// 查找匹配的 mock 规则
function findMockRule(url, method) {
  if (!interceptorEnabled) {
    return null;
  }

  const normalizedMethod = normalizeMethod(method);
  for (const rule of mockRules) {
    const methodMatched = rule.method === DEFAULT_METHOD || rule.method === normalizedMethod;
    if (rule.enabled && methodMatched && matchUrl(rule.urlPattern, url, rule.matchMode)) {
      return rule;
    }
  }
  return null;
}

// 监听来自注入脚本的消息
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'REQUEST_INTERCEPTOR_CHECK') {
    const { url, method, requestId } = event.data;
    
    log('[Request Interceptor Tiny]', 'Checking URL:', url, '| Rules count:', mockRules.length);
    
    // 检查扩展上下文是否有效
    if (!isExtensionContextValid()) {
      // 上下文失效，让请求正常通过
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
      return;
    }
    
    const mockRule = findMockRule(url, method);
    log('[Request Interceptor Tiny]', 'Match result:', mockRule ? `Matched: ${mockRule.name}` : 'No match');
    
    if (mockRule) {
      // 发送 mock 响应
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
      
      // 记录日志（包裹在 try-catch 中防止崩溃）
      try {
        const logTimestamp = Date.now().toString();
        // 使用 requestId 作为 key，避免同 URL 并发请求时碰撞
        pendingLogs.set(requestId, logTimestamp);
        // 5秒后清理，避免内存泄漏
        setTimeout(() => pendingLogs.delete(requestId), 5000);
        
        chrome.runtime.sendMessage({
          type: 'LOG_MOCK_REQUEST',
          ruleId: mockRule.id,
          ruleName: mockRule.name,
          ruleType: mockRule.type,
          url: url,
          method: method || 'GET',
          matchMode: mockRule.matchMode,
          priority: mockRule.priority,
          status: mockRule.responseStatus || DEFAULT_STATUS,
          mockedBody: mockRule.responseBody,
          logTimestamp: logTimestamp
        });
      } catch (e) {
        // 上下文失效，忽略日志记录错误
      }
    } else {
      // 没有匹配的规则，让请求正常进行
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
    }
  }
});

// 监听原始响应体消息（用于关联到日志）
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE') {
    const { logRequestId, originalBody } = event.data;
    
    if (!isExtensionContextValid()) return;
    
    const logTimestamp = pendingLogs.get(logRequestId);
    if (logTimestamp) {
      pendingLogs.delete(logRequestId);
      try {
        chrome.runtime.sendMessage({
          type: 'UPDATE_LOG_ORIGINAL_BODY',
          logTimestamp: logTimestamp,
          originalBody: originalBody
        });
      } catch (e) {
        // 忽略错误
      }
    }
  }
});

// 注意：injected.js 现在由 manifest.json 直接注入到 MAIN world，无需动态注入
console.log('[Request Interceptor Tiny] 📦', 'Content script ready');
