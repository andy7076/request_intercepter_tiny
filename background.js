// 存储规则的键名
const RULES_STORAGE_KEY = 'interceptRules';
const LOGS_STORAGE_KEY = 'requestLogs';
const MAX_LOGS = 100; // 最大日志条数

// 初始化规则
chrome.runtime.onInstalled.addListener(async () => {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY);
  if (!result[RULES_STORAGE_KEY]) {
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });
  }
  console.log('Request Interceptor 扩展已安装');
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_RULES') {
    getRules().then(sendResponse);
    return true;
  }
  
  if (message.type === 'ADD_RULE') {
    addRule(message.rule).then(sendResponse);
    return true;
  }
  
  if (message.type === 'UPDATE_RULE') {
    updateRule(message.ruleId, message.rule).then(sendResponse);
    return true;
  }
  
  if (message.type === 'DELETE_RULE') {
    deleteRule(message.ruleId).then(sendResponse);
    return true;
  }
  
  if (message.type === 'TOGGLE_RULE') {
    toggleRule(message.ruleId).then(sendResponse);
    return true;
  }
  
  if (message.type === 'GET_LOGS') {
    getLogs().then(sendResponse);
    return true;
  }
  
  if (message.type === 'CLEAR_LOGS') {
    clearLogs().then(sendResponse);
    return true;
  }
});

// 获取所有规则
async function getRules() {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY);
  return result[RULES_STORAGE_KEY] || [];
}

// 添加规则
async function addRule(rule) {
  const rules = await getRules();
  const newRule = {
    id: Date.now().toString(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...rule
  };
  rules.push(newRule);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
  await applyRules();
  return newRule;
}

// 更新规则
async function updateRule(ruleId, updatedRule) {
  const rules = await getRules();
  const index = rules.findIndex(r => r.id === ruleId);
  if (index !== -1) {
    rules[index] = { ...rules[index], ...updatedRule };
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
    await applyRules();
    return rules[index];
  }
  return null;
}

// 删除规则
async function deleteRule(ruleId) {
  const rules = await getRules();
  const filteredRules = rules.filter(r => r.id !== ruleId);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: filteredRules });
  await applyRules();
  return true;
}

// 切换规则启用状态
async function toggleRule(ruleId) {
  const rules = await getRules();
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = !rule.enabled;
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
    await applyRules();
    return rule;
  }
  return null;
}

// 应用规则到declarativeNetRequest
async function applyRules() {
  const rules = await getRules();
  const enabledRules = rules.filter(r => r.enabled);
  
  // 获取现有的动态规则
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(r => r.id);
  
  // 移除所有现有规则
  if (existingRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds
    });
  }
  
  // 构建新规则
  const netRequestRules = [];
  
  enabledRules.forEach((rule, index) => {
    const ruleId = index + 1;
    
    // 处理header修改规则
    if (rule.type === 'modifyHeaders' && rule.headerModifications) {
      const requestHeaders = [];
      const responseHeaders = [];
      
      rule.headerModifications.forEach(mod => {
        const headerAction = {
          header: mod.name,
          operation: mod.operation || 'set',
          value: mod.operation !== 'remove' ? mod.value : undefined
        };
        
        if (mod.target === 'request') {
          requestHeaders.push(headerAction);
        } else {
          responseHeaders.push(headerAction);
        }
      });
      
      const action = { type: 'modifyHeaders' };
      if (requestHeaders.length > 0) {
        action.requestHeaders = requestHeaders;
      }
      if (responseHeaders.length > 0) {
        action.responseHeaders = responseHeaders;
      }
      
      netRequestRules.push({
        id: ruleId,
        priority: rule.priority || 1,
        action: action,
        condition: {
          urlFilter: rule.urlPattern,
          resourceTypes: rule.resourceTypes || ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'object', 'ping', 'csp_report', 'media', 'websocket', 'other']
        }
      });
    }
    
    // 处理redirect规则
    if (rule.type === 'redirect' && rule.redirectUrl) {
      netRequestRules.push({
        id: ruleId,
        priority: rule.priority || 1,
        action: {
          type: 'redirect',
          redirect: { url: rule.redirectUrl }
        },
        condition: {
          urlFilter: rule.urlPattern,
          resourceTypes: rule.resourceTypes || ['main_frame', 'sub_frame', 'xmlhttprequest']
        }
      });
    }
    
    // 处理block规则
    if (rule.type === 'block') {
      netRequestRules.push({
        id: ruleId,
        priority: rule.priority || 1,
        action: { type: 'block' },
        condition: {
          urlFilter: rule.urlPattern,
          resourceTypes: rule.resourceTypes || ['main_frame', 'sub_frame', 'xmlhttprequest', 'script', 'stylesheet', 'image', 'font', 'object', 'ping', 'csp_report', 'media', 'websocket', 'other']
        }
      });
    }
    
    // 处理mockResponse规则 - 使用data URL重定向实现
    if (rule.type === 'mockResponse' && rule.responseBody) {
      const contentType = rule.contentType || 'application/json';
      const body = rule.responseBody;
      // 将内容编码为base64用于data URL
      const base64Body = btoa(unescape(encodeURIComponent(body)));
      const dataUrl = `data:${contentType};base64,${base64Body}`;
      
      netRequestRules.push({
        id: ruleId,
        priority: rule.priority || 1,
        action: {
          type: 'redirect',
          redirect: { url: dataUrl }
        },
        condition: {
          urlFilter: rule.urlPattern,
          resourceTypes: rule.resourceTypes || ['xmlhttprequest', 'script', 'stylesheet', 'other']
        }
      });
    }
  });
  
  // 添加新规则
  if (netRequestRules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: netRequestRules
    });
  }
  
  console.log('已应用规则:', netRequestRules.length);
}

// 启动时应用规则
applyRules();

// 获取日志
async function getLogs() {
  const result = await chrome.storage.local.get(LOGS_STORAGE_KEY);
  return result[LOGS_STORAGE_KEY] || [];
}

// 清空日志
async function clearLogs() {
  await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: [] });
  return true;
}

// 添加日志
async function addLog(logEntry) {
  const logs = await getLogs();
  logs.unshift({
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    ...logEntry
  });
  
  // 保持日志数量不超过最大值
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  
  await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: logs });
}

// 监听规则匹配事件 - 使用onRuleMatchedDebug记录日志
try {
  chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(async (info) => {
    const rules = await getRules();
    const ruleIndex = info.rule.ruleId - 1;
    const enabledRules = rules.filter(r => r.enabled);
    const matchedRule = enabledRules[ruleIndex];
    
    if (matchedRule) {
      await addLog({
        ruleName: matchedRule.name,
        ruleType: matchedRule.type,
        url: info.request.url,
        method: info.request.method,
        tabId: info.request.tabId,
        frameId: info.request.frameId
      });
    }
  });
  console.log('Request logging enabled');
} catch (e) {
  // onRuleMatchedDebug 只在开发模式下可用
  console.log('Request logging not available (requires developer mode)');
}
