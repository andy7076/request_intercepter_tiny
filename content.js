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

function log(...args) {
  if (consoleLogsEnabled) {
    console.log(...args);
  }
}

// 存储 mock 规则
let mockRules = [];
let isInitialized = false;

// 从 storage 直接获取规则（不依赖 background）
function loadMockRules() {
  if (!isExtensionContextValid()) return Promise.resolve([]);
  return new Promise((resolve) => {
    try {
      chrome.storage.local.get('interceptRules', (result) => {
        if (chrome.runtime.lastError) {
        console.error('[Request Interceptor Tiny]', 'Failed to load rules:', chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      const allRules = result.interceptRules || [];
      // 过滤出启用的 mockResponse 类型规则
      mockRules = allRules.filter(r => r.enabled && r.type === 'mockResponse');
      log('[Request Interceptor Tiny] ✅', 'Mock rules loaded:', mockRules.length);
      if (mockRules.length > 0) {
        log('[Request Interceptor Tiny] 📋', 'Rules list:', mockRules.map(r => ({
          name: r.name,
          pattern: r.urlPattern
        })));
      }
      isInitialized = true;
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
});
loadSettings();

// 监听 storage 变化 - 规则更新时自动重新加载
chrome.storage.onChanged.addListener((changes, areaName) => {
  // 如果扩展上下文失效，提前返回
  if (!isExtensionContextValid()) return;
  
  if (areaName === 'local' && changes['interceptRules']) {
    const allRules = changes['interceptRules'].newValue || [];
    // 过滤出启用的 mockResponse 类型规则
    mockRules = allRules.filter(r => r.enabled && r.type === 'mockResponse');
    console.log('[Request Interceptor Tiny]', 'Rules updated via storage.onChanged, count:', mockRules.length);
    
    // 通知页面规则已更新
    window.postMessage({
      type: 'REQUEST_INTERCEPTOR_RULES_UPDATED',
      rulesCount: mockRules.length
    }, '*');
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
    mockRules = message.rules || [];
    console.log('[Request Interceptor Tiny]', 'Received MOCK_RULES_UPDATED message, count:', mockRules.length);
    
    // 通知 injected.js 规则已更新
    window.postMessage({
      type: 'REQUEST_INTERCEPTOR_RULES_UPDATED',
      rulesCount: mockRules.length
    }, '*');
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
  }
});

// URL 匹配函数 - 支持通配符
function matchUrl(pattern, url) {
  // 如果模式不包含通配符 *，使用包含匹配
  if (!pattern.includes('*')) {
    // 直接检查 URL 是否包含该模式（忽略大小写）
    return url.toLowerCase().includes(pattern.toLowerCase());
  }
  
  // 检查pattern的开头和结尾是否有通配符
  const startsWithWildcard = pattern.startsWith('*');
  const endsWithWildcard = pattern.endsWith('*');
  
  // 将通配符模式转换为正则表达式
  const regexPattern = pattern
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
function findMockRule(url) {
  for (const rule of mockRules) {
    if (rule.enabled && matchUrl(rule.urlPattern, url)) {
      return rule;
    }
  }
  return null;
}

// 监听来自注入脚本的消息
window.addEventListener('message', async (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'REQUEST_INTERCEPTOR_CHECK') {
    const { url, requestId } = event.data;
    
    log('[Request Interceptor Tiny]', 'Checking URL:', url);
    
    // 检查扩展上下文是否有效
    if (!isExtensionContextValid()) {
      // 上下文失效，让请求正常通过
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
      return;
    }
    
    // 每次检查时从 storage 加载最新规则，确保规则是最新的
    try {
      const result = await chrome.storage.local.get('interceptRules');
      const allRules = result.interceptRules || [];
      const previousCount = mockRules.length;
      mockRules = allRules.filter(r => r.enabled && r.type === 'mockResponse');
      // 如果规则数量变化，输出日志
      if (previousCount !== mockRules.length) {
        console.log('[Request Interceptor Tiny]', `Rules reloaded from storage: ${previousCount} -> ${mockRules.length}`);
      }
    } catch (e) {
      // 如果加载失败，使用缓存的规则
      console.warn('[Request Interceptor Tiny]', 'Failed to reload rules from storage:', e.message);
    }
    
    log('[Request Interceptor Tiny]', 'Checking URL:', url, '| Rules count:', mockRules.length);
    
    const mockRule = findMockRule(url);
    log('[Request Interceptor Tiny]', 'Match result:', mockRule ? `Matched: ${mockRule.name}` : 'No match');
    
    if (mockRule) {
      // 发送 mock 响应
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_MOCK',
        requestId: requestId,
        mockResponse: {
          body: mockRule.responseBody,
          contentType: mockRule.contentType || 'application/json',
          status: 200,
          statusText: 'OK (Mocked)'
        }
      }, '*');
      
      // 记录日志（包裹在 try-catch 中防止崩溃）
      try {
        chrome.runtime.sendMessage({
          type: 'LOG_MOCK_REQUEST',
          ruleName: mockRule.name,
          ruleType: mockRule.type,
          url: url
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

// 注意：injected.js 现在由 manifest.json 直接注入到 MAIN world，无需动态注入
console.log('[Request Interceptor Tiny] 📦', 'Content script ready');

