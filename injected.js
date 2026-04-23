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

  // 超过此大小的响应体不再 clone 读取，避免把一整份大 body 留在内存里
  // 仅用于日志展示，超过阈值时截断即可。
  const ORIGINAL_BODY_MAX_BYTES = 512 * 1024; // 512KB
  // 这些 content-type 要么是流式（无法 await text()），要么对原始 body 无意义
  const NON_CAPTURABLE_CONTENT_TYPES = [
    'text/event-stream',
    'application/octet-stream',
    'video/',
    'audio/',
    'image/'
  ];

  function shouldSkipBodyCapture(response) {
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (NON_CAPTURABLE_CONTENT_TYPES.some(t => contentType.includes(t))) {
      return true;
    }
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader) {
      const length = Number(lengthHeader);
      if (Number.isFinite(length) && length > ORIGINAL_BODY_MAX_BYTES) {
        return true;
      }
    }
    return false;
  }

  function captureOriginalFetchResponse(fetchPromise, logRequestId) {
    fetchPromise
      .then(async (realResponse) => {
        if (shouldSkipBodyCapture(realResponse)) {
          return;
        }
        try {
          const originalBody = await realResponse.clone().text();
          const truncated = originalBody.length > ORIGINAL_BODY_MAX_BYTES
            ? originalBody.slice(0, ORIGINAL_BODY_MAX_BYTES) + '\n/* …truncated by Request Interceptor Tiny */'
            : originalBody;
          window.postMessage({
            type: 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE',
            logRequestId,
            originalBody: truncated
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
    // 快路径：没有启用任何规则时直接透传，避免 toAbsoluteUrl / 跨 world
    // postMessage 等额外开销。
    if (activeRulesCount === 0) {
      return originalFetch.apply(this, arguments);
    }

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

    // 快路径：
    //   1. 没有 URL 的异常情况
    //   2. 同步请求（无法异步检查规则）
    //   3. 没有启用任何规则时，绝不要把 send 异步化——这会改变 XHR
    //      原本的同步调度语义，破坏依赖它的老代码。
    if (!rawUrl || !this._interceptorAsync || activeRulesCount === 0) {
      return originalXHRSend.apply(this, arguments);
    }

    // 将相对URL转换为绝对URL，以便与用户配置的完整URL匹配
    const url = toAbsoluteUrl(rawUrl);

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
            // responseType 非 '' / 'text' 时访问 responseText 会抛 InvalidStateError
            const canReadText = xhr.responseType === '' || xhr.responseType === 'text';
            const originalXHRBody = canReadText ? xhr.responseText : '';
            if (originalXHRBody) {
              const truncated = originalXHRBody.length > ORIGINAL_BODY_MAX_BYTES
                ? originalXHRBody.slice(0, ORIGINAL_BODY_MAX_BYTES) + '\n/* …truncated by Request Interceptor Tiny */'
                : originalXHRBody;
              window.postMessage({
                type: 'REQUEST_INTERCEPTOR_ORIGINAL_RESPONSE',
                logRequestId: logRequestId,
                originalBody: truncated
              }, '*');
            }
          } catch (bodyErr) {
            log('[Request Interceptor Tiny] ⚠️ Failed to read original XHR response body:', bodyErr);
          }

          // 把四个属性的覆盖分开做，避免前面一个失败后后面几个被整体跳过。
          // 任何一个 critical property（responseText/response）失败都直接报错，
          // 否则页面会以为 mock 生效，但读到的却是原始响应体。
          const defineMockProp = (name, descriptor) => {
            try {
              Object.defineProperty(xhr, name, descriptor);
              return true;
            } catch (err) {
              console.error(
                '[Request Interceptor Tiny] Mock degraded: failed to override XHR.' + name +
                ' for ' + url + ':',
                err
              );
              return false;
            }
          };

          defineMockProp('responseText', {
            get: () => mock.body,
            configurable: true
          });
          defineMockProp('response', {
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
          defineMockProp('status', {
            get: () => mock.status || 200,
            configurable: true
          });
          defineMockProp('statusText', {
            get: () => mock.statusText || 'Mocked',
            configurable: true
          });

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
