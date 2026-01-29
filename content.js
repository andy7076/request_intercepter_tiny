// Content Script - 拦截和修改网络请求响应

// 存储 mock 规则
let mockRules = [];
let isInitialized = false;

// 从 storage 直接获取规则（不依赖 background）
function loadMockRules() {
  return new Promise((resolve) => {
    chrome.storage.local.get('interceptRules', (result) => {
      if (chrome.runtime.lastError) {
        console.error('[Request Interceptor Tiny] 读取规则失败:', chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      const allRules = result.interceptRules || [];
      // 过滤出启用的规则
      mockRules = allRules.filter(r => r.enabled);
      console.log('[Request Interceptor Tiny] ✅ 已加载 mock 规则:', mockRules.length);
      if (mockRules.length > 0) {
        console.log('[Request Interceptor Tiny] 📋 规则列表:', mockRules.map(r => ({
          name: r.name,
          pattern: r.urlPattern
        })));
      }
      isInitialized = true;
      resolve(mockRules);
    });
  });
}

// 初始化加载规则
console.log('[Request Interceptor Tiny] 🚀 Content Script 开始初始化...');
loadMockRules().then(() => {
  console.log('[Request Interceptor Tiny] ✨ 初始化完成,准备拦截请求');
});

// 监听 storage 变化 - 规则更新时自动重新加载
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes['interceptRules']) {
    const allRules = changes['interceptRules'].newValue || [];
    // 过滤出启用的规则
    mockRules = allRules.filter(r => r.enabled);
    console.log('[Request Interceptor Tiny] 规则已更新:', mockRules.length);
    console.log('[Request Interceptor Tiny] 当前启用的规则:', mockRules.map(r => r.name));
    
    // 通知页面规则已更新
    window.postMessage({
      type: 'REQUEST_INTERCEPTOR_RULES_UPDATED',
      rulesCount: mockRules.length
    }, '*');
  }
});

// 监听规则更新消息（作为额外保障）
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'MOCK_RULES_UPDATED') {
    mockRules = message.rules || [];
    console.log('[Request Interceptor Tiny] 收到规则更新消息:', mockRules.length);
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
    console.warn('[Request Interceptor Tiny] URL匹配正则错误:', e.message);
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

// 检查扩展上下文是否有效
function isContextValid() {
  try {
    // 尝试访问 chrome.runtime.id，如果上下文失效会抛出异常
    return !!chrome.runtime?.id;
  } catch (e) {
    return false;
  }
}

// 监听来自注入脚本的消息
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  if (event.data.type === 'REQUEST_INTERCEPTOR_CHECK') {
    const { url, requestId } = event.data;
    
    console.log('[Request Interceptor Tiny] 检查URL:', url);
    console.log('[Request Interceptor Tiny] 当前规则数量:', mockRules.length);
    
    // 检查扩展上下文是否有效
    if (!isContextValid()) {
      // 上下文失效，让请求正常通过
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_PASSTHROUGH',
        requestId: requestId
      }, '*');
      return;
    }
    
    const mockRule = findMockRule(url);
    console.log('[Request Interceptor Tiny] 匹配结果:', mockRule ? `匹配到规则: ${mockRule.name}` : '无匹配规则');
    
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
console.log('[Request Interceptor Tiny] 📦 Content script 就绪，等待来自 injected.js 的消息');

