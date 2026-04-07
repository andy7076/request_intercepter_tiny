// 注入到页面中的脚本 - 拦截 fetch 和 XMLHttpRequest
// 让请求正常发出，在响应返回后替换内容

(function() {
  'use strict';
  
  // 日志控制
  let consoleLogsEnabled = false;
  
  function log(...args) {
    if (consoleLogsEnabled) {
      console.log(...args);
    }
  }
  
  // 规则数量状态（默认为 1 以确保初始化期间不漏掉请求，直到收到准确数量）
  let activeRulesCount = 1;

  function wait(ms) {
    if (!ms || ms <= 0) {
      return Promise.resolve();
    }
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeMethod(method) {
    return String(method || 'GET').toUpperCase();
  }

  function normalizeHeaders(headers, contentType) {
    const normalized = new Headers();

    if (headers && typeof headers === 'object') {
      Object.entries(headers).forEach(([key, value]) => {
        if (!key) return;
        normalized.set(key, String(value ?? ''));
      });
    }

    if (contentType && !normalized.has('content-type')) {
      normalized.set('content-type', contentType);
    }

    normalized.set('x-mocked-by', 'Request-Interceptor-Tiny');
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

  function inferContentType(body, contentType) {
    if (contentType) {
      return contentType;
    }
    return isLikelyJsonContent(body) ? 'application/json' : 'text/plain; charset=utf-8';
  }

  function captureOriginalFetchResponse(fetchPromise, logRequestId) {
    fetchPromise
      .then(async (realResponse) => {
        try {
          const originalBody = await realResponse.clone().text();
          window.postMessage({
            type: 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE',
            logRequestId,
            originalBody
          }, '*');
        } catch (bodyErr) {
          log('[Request Interceptor Tiny] ⚠️ Failed to read original response body:', bodyErr);
        }
      })
      .catch((err) => {
        log('[Request Interceptor Tiny] ⚠️ Real request failed (likely blocked by CSP/Network):', err);
      });
  }

  // 生成唯一 ID
  let requestIdCounter = 0;
  function generateRequestId() {
    return `req_${Date.now()}_${++requestIdCounter}`;
  }
  
  // 将相对URL转换为绝对URL
  function toAbsoluteUrl(url) {
    if (!url) return url;
    
    // 确保 url 是字符串类型
    // 处理 Request 对象、URL 对象等情况
    if (typeof url !== 'string') {
      if (url instanceof Request) {
        url = url.url;
      } else if (url instanceof URL) {
        url = url.href;
      } else if (url.toString) {
        url = url.toString();
      } else {
        return url;
      }
    }
    
    // 如果已经是绝对URL，直接返回
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      // 处理 // 开头的协议相对URL
      if (url.startsWith('//')) {
        return window.location.protocol + url;
      }
      return url;
    }
    // 使用URL构造函数将相对路径转换为绝对路径
    try {
      return new URL(url, window.location.href).href;
    } catch (e) {
      return url;
    }
  }
  
  // 存储待处理的请求
  const pendingRequests = new Map();
  
  // 监听来自 content script 的响应
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'REQUEST_INTERCEPTOR_MOCK') {
      const { requestId, mockResponse, logRequestId } = event.data;
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.resolve({ mockResponse, logRequestId });
        pendingRequests.delete(requestId);
      }
    }
    
    if (event.data.type === 'REQUEST_INTERCEPTOR_PASSTHROUGH') {
      const { requestId } = event.data;
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(null); // null 表示不拦截
        pendingRequests.delete(requestId);
      }
    }
    
    // 监听规则更新通知
    if (event.data.type === 'REQUEST_INTERCEPTOR_RULES_UPDATED') {
      activeRulesCount = event.data.rulesCount;
      log(`[Request Interceptor Tiny] 🔄 Rules have been updated! Current enabled rules count: ${event.data.rulesCount}`);
      log('[Request Interceptor Tiny] 💡 New requests will use updated rules');
    }
    
    // 监听日志设置更新
    if (event.data.type === 'CONSOLE_LOGS_UPDATED') {
      consoleLogsEnabled = event.data.enabled;
      if (consoleLogsEnabled) {
        log('[Request Interceptor Tiny] 📝 Console logs enabled');
      } else {
        // 使用原生 console.log 确保这一条能显示出来，因为 log() 函数已被禁用
        console.log('[Request Interceptor Tiny] 📝 Console logs disabled');
      }
    }
  });
  
  // 检查 URL 是否需要被 mock
  function checkMockRule(url, method) {
    // 性能优化：如果没有启用任何规则，直接放行，不进行 postMessage通信
    if (activeRulesCount === 0) {
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      const requestId = generateRequestId();
      
      // 设置超时，避免请求卡住
      // 增加超时时间以确保在系统繁忙时或等待 storage 读取时也能成功拦截
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve(null);
      }, 5000);
      
      pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        }
      });
      
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_CHECK',
        url: url,
        method: normalizeMethod(method),
        requestId: requestId
      }, '*');
    });
  }

  // ========== 拦截 Fetch ==========
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    const rawUrl = typeof input === 'string' ? input : input.url;
    const method = normalizeMethod(init?.method || (typeof input !== 'string' ? input.method : '') || 'GET');
    // 将相对URL转换为绝对URL，以便与用户配置的完整URL匹配
    const url = toAbsoluteUrl(rawUrl);
    
    try {
      // 检查是否有匹配的 mock 规则
      const mockResult = await checkMockRule(url, method);
      
      if (mockResult) {
        const { mockResponse, logRequestId } = mockResult;
        log('[Request Interceptor Tiny] 🎭 Will mock fetch response:', url);

        const realRequestPromise = originalFetch.apply(this, arguments);
        captureOriginalFetchResponse(realRequestPromise, logRequestId);
        await wait(mockResponse.delayMs || 0);

        const mockedResponse = new Response(mockResponse.body, {
          status: mockResponse.status || 200,
          statusText: mockResponse.statusText || 'Mocked',
          headers: normalizeHeaders(mockResponse.headers, inferContentType(mockResponse.body, mockResponse.contentType))
        });

        Object.defineProperties(mockedResponse, {
          url: { value: url },
          redirected: { value: false },
          type: { value: 'basic' }
        });
        
        log('[Request Interceptor Tiny] ✅ Response mocked for:', url);
        
        return mockedResponse;
      }
    } catch (e) {
      console.error('[Request Interceptor Tiny] Error checking mock rule:', e);
    }
    
    // 正常执行请求
    return originalFetch.apply(this, arguments);
  };

  // ========== 拦截 XMLHttpRequest ==========
  const XHR = XMLHttpRequest;
  const originalXHROpen = XHR.prototype.open;
  const originalXHRSend = XHR.prototype.send;
  
  XHR.prototype.open = function(method, url, async, user, password) {
    this._interceptorUrl = url;
    this._interceptorMethod = method;
    this._interceptorAsync = async !== false;
    return originalXHROpen.apply(this, arguments);
  };
  
  XHR.prototype.send = function(body) {
    const xhr = this;
    const rawUrl = this._interceptorUrl;
    
    if (!rawUrl) {
      return originalXHRSend.apply(this, arguments);
    }
    
    // 将相对URL转换为绝对URL，以便与用户配置的完整URL匹配
    const url = toAbsoluteUrl(rawUrl);
    
    // 对于同步请求，不进行拦截（因为无法异步检查规则）
    if (!this._interceptorAsync) {
      return originalXHRSend.apply(this, arguments);
    }
    
    // 异步检查 mock 规则
    checkMockRule(url, this._interceptorMethod).then(mockResult => {
      if (mockResult) {
        const { mockResponse, logRequestId } = mockResult;
        log('[Request Interceptor Tiny] 🎭 Will mock XHR response:', url);
        
        // 保存原始的事件处理器
        const originalOnReadyStateChange = xhr.onreadystatechange;
        const originalOnLoad = xhr.onload;
        const originalOnLoadEnd = xhr.onloadend;
        
        // 标记需要 mock
        xhr._mockResponse = mockResponse;
        xhr._mockFinalized = false;

        const applyMockResponse = function() {
          if (xhr._mockFinalized || !xhr._mockResponse) {
            return;
          }

          xhr._mockFinalized = true;
          log('[Request Interceptor Tiny] ✅ Response mocked for XHR:', url);
          const mock = xhr._mockResponse;

          try {
            const originalXHRBody = xhr.responseText;
            if (originalXHRBody) {
              window.postMessage({
                type: 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE',
                logRequestId: logRequestId,
                originalBody: originalXHRBody
              }, '*');
            }
          } catch (bodyErr) {
            log('[Request Interceptor Tiny] ⚠️ Failed to read original XHR response body:', bodyErr);
          }

          try {
            Object.defineProperty(xhr, 'responseText', {
              get: () => mock.body,
              configurable: true
            });
            Object.defineProperty(xhr, 'response', {
              get: () => {
                if (xhr.responseType === '' || xhr.responseType === 'text') {
                  return mock.body;
                } else if (xhr.responseType === 'json') {
                  try {
                    return JSON.parse(mock.body);
                  } catch (e) {
                    return mock.body;
                  }
                }
                return mock.body;
              },
              configurable: true
            });
            Object.defineProperty(xhr, 'status', {
              get: () => mock.status || 200,
              configurable: true
            });
            Object.defineProperty(xhr, 'statusText', {
              get: () => mock.statusText || 'Mocked',
              configurable: true
            });
          } catch (e) {
            console.warn('[Request Interceptor Tiny] Failed to override XHR properties:', e);
          }

          const responseHeaders = normalizeHeaders(mock.headers, inferContentType(mock.body, mock.contentType));
          xhr.getResponseHeader = function(header) {
            if (!header) return null;
            return responseHeaders.get(header) || null;
          };
          xhr.getAllResponseHeaders = function() {
            let allHeaders = '';
            responseHeaders.forEach((value, key) => {
              allHeaders += `${key}: ${value}\r\n`;
            });
            return allHeaders;
          };
        };
        
        // 重写 onreadystatechange
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr._mockResponse) {
            applyMockResponse();
          }
          
          if (typeof originalOnReadyStateChange === 'function') {
            originalOnReadyStateChange.apply(xhr, arguments);
          }
        };
        
        // 重写 onload
        xhr.onload = function(event) {
          if (xhr.readyState === 4 && xhr._mockResponse) {
            applyMockResponse();
          }
          if (typeof originalOnLoad === 'function') {
            originalOnLoad.apply(xhr, arguments);
          }
        };
        
        // 重写 onloadend
        xhr.onloadend = function(event) {
          if (xhr.readyState === 4 && xhr._mockResponse) {
            applyMockResponse();
          }
          if (typeof originalOnLoadEnd === 'function') {
            originalOnLoadEnd.apply(xhr, arguments);
          }
        };
        
        // 正常发送请求（这样 Network 面板能看到）
        setTimeout(() => {
          originalXHRSend.call(xhr, body);
        }, mockResponse.delayMs || 0);
      } else {
        // 正常发送请求
        originalXHRSend.call(xhr, body);
      }
    }).catch(() => {
      // 出错时正常发送请求
      originalXHRSend.call(xhr, body);
    });
  };
  
  log('[Request Interceptor Tiny] 🚀 Injected script loaded - Network shows original responses, page displays mocked content');
})();
