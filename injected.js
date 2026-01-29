// 注入到页面中的脚本 - 拦截 fetch 和 XMLHttpRequest
// 让请求正常发出，在响应返回后替换内容

(function() {
  'use strict';
  
  // 生成唯一 ID
  let requestIdCounter = 0;
  function generateRequestId() {
    return `req_${Date.now()}_${++requestIdCounter}`;
  }
  
  // 存储待处理的请求
  const pendingRequests = new Map();
  
  // 监听来自 content script 的响应
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    
    if (event.data.type === 'REQUEST_INTERCEPTOR_MOCK') {
      const { requestId, mockResponse } = event.data;
      const pending = pendingRequests.get(requestId);
      if (pending) {
        pending.resolve(mockResponse);
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
      console.log(`[Request Interceptor Tiny] 🔄 规则已更新! 当前启用规则数: ${event.data.rulesCount}`);
      console.log('[Request Interceptor Tiny] 💡 新的请求将使用更新后的规则');
    }
  });
  
  // 检查 URL 是否需要被 mock
  function checkMockRule(url) {
    return new Promise((resolve) => {
      const requestId = generateRequestId();
      
      // 设置超时，避免请求卡住
      // 增加超时时间以确保在系统繁忙时也能成功拦截
      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve(null);
      }, 2000);
      
      pendingRequests.set(requestId, {
        resolve: (result) => {
          clearTimeout(timeout);
          resolve(result);
        }
      });
      
      window.postMessage({
        type: 'REQUEST_INTERCEPTOR_CHECK',
        url: url,
        requestId: requestId
      }, '*');
    });
  }

  // ========== 拦截 Fetch ==========
  const originalFetch = window.fetch;
  
  window.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    
    try {
      // 检查是否有匹配的 mock 规则
      const mockResponse = await checkMockRule(url);
      
      if (mockResponse) {
        console.log('[Request Interceptor Tiny] 🎭 Will mock fetch response:', url);
        
        // 发出真实请求（Network 面板显示原始请求和响应）
        const realResponse = await originalFetch.apply(this, arguments);
        
        // 创建一个伪装的 Response 对象，它保留原始响应的属性，但返回 mock 的内容
        // 这样 Network 面板显示的是真实的原始响应，但代码读取的是 mock 数据
        const mockedResponse = new Response(mockResponse.body, {
          status: realResponse.status, // 保留原始状态码（Network 显示一致）
          statusText: realResponse.statusText,
          headers: realResponse.headers // 保留原始头部
        });
        
        // 复制原始响应的只读属性
        Object.defineProperties(mockedResponse, {
          url: { value: realResponse.url },
          redirected: { value: realResponse.redirected },
          type: { value: realResponse.type }
        });
        
        console.log('[Request Interceptor Tiny] ✅ Response mocked for:', url);
        
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
    const url = this._interceptorUrl;
    
    if (!url) {
      return originalXHRSend.apply(this, arguments);
    }
    
    // 对于同步请求，不进行拦截（因为无法异步检查规则）
    if (!this._interceptorAsync) {
      return originalXHRSend.apply(this, arguments);
    }
    
    // 异步检查 mock 规则
    checkMockRule(url).then(mockResponse => {
      if (mockResponse) {
        console.log('[Request Interceptor Tiny] 🎭 Will mock XHR response:', url);
        
        // 保存原始的事件处理器
        const originalOnReadyStateChange = xhr.onreadystatechange;
        const originalOnLoad = xhr.onload;
        const originalOnLoadEnd = xhr.onloadend;
        
        // 标记需要 mock
        xhr._mockResponse = mockResponse;
        
        // 重写 onreadystatechange
        xhr.onreadystatechange = function() {
          if (xhr.readyState === 4 && xhr._mockResponse) {
            // 在请求完成后，覆盖响应属性（Network 面板显示原始响应，代码读取 mock 数据）
            console.log('[Request Interceptor Tiny] ✅ Response mocked for XHR:', url);
            const mock = xhr._mockResponse;
            
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
                get: () => mock.statusText || 'OK (Mocked)',
                configurable: true
              });
            } catch (e) {
              console.warn('[Request Interceptor Tiny] Failed to override XHR properties:', e);
            }
            
            // 覆盖 getResponseHeader
            const originalGetResponseHeader = xhr.getResponseHeader.bind(xhr);
            xhr.getResponseHeader = function(header) {
              if (header.toLowerCase() === 'content-type') {
                return mock.contentType || 'application/json';
              }
              if (header.toLowerCase() === 'x-mocked-by') {
                return 'Request-Interceptor-Pro';
              }
              return originalGetResponseHeader(header);
            };
          }
          
          if (typeof originalOnReadyStateChange === 'function') {
            originalOnReadyStateChange.apply(xhr, arguments);
          }
        };
        
        // 重写 onload
        xhr.onload = function(event) {
          if (typeof originalOnLoad === 'function') {
            originalOnLoad.apply(xhr, arguments);
          }
        };
        
        // 重写 onloadend
        xhr.onloadend = function(event) {
          if (typeof originalOnLoadEnd === 'function') {
            originalOnLoadEnd.apply(xhr, arguments);
          }
        };
        
        // 正常发送请求（这样 Network 面板能看到）
        originalXHRSend.call(xhr, body);
      } else {
        // 正常发送请求
        originalXHRSend.call(xhr, body);
      }
    }).catch(() => {
      // 出错时正常发送请求
      originalXHRSend.call(xhr, body);
    });
  };
  
  console.log('[Request Interceptor Tiny] 🚀 Injected script loaded - Network shows original responses, page displays mocked content');
})();
