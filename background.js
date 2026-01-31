// ========== i18n 模块（使用 Chrome 内置 API）==========
// 获取翻译文本
function t(key) {
  try {
    // 直接使用 Chrome i18n API
    const msg = chrome.i18n.getMessage(key);
    return msg || key;
  } catch (e) {
    return key;
  }
}

// ========== 规则存储 ==========
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
  console.log('[Request Interceptor Tiny]', t('logExtensionInstalled'));
});

// 点击扩展图标时打开 Side Panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

// 监听来自popup和content script的消息
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
  
  if (message.type === 'CLEAR_ALL_RULES') {
    clearAllRules().then(sendResponse);
    return true;
  }

  if (message.type === 'DISABLE_ALL_RULES') {
    disableAllRules().then(sendResponse);
    return true;
  }
  
  // Content Script 请求获取 mock 规则
  if (message.type === 'GET_MOCK_RULES') {
    getMockRules().then(sendResponse);
    return true;
  }
  
  // Content Script 记录 mock 请求日志
  if (message.type === 'LOG_MOCK_REQUEST') {
    addLog({
      ruleName: message.ruleName,
      ruleType: message.ruleType,
      url: message.url,
      method: 'GET',
      tabId: sender.tab?.id,
      frameId: sender.frameId
    });
    sendResponse({ success: true });
    return true;
  }
});

// 获取所有规则
async function getRules() {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY);
  return result[RULES_STORAGE_KEY] || [];
}

// 获取所有启用的 mock 规则
async function getMockRules() {
  const rules = await getRules();
  return rules.filter(r => r.enabled && r.type === 'mockResponse');
}

// 通知所有 content scripts mock 规则已更新
async function notifyMockRulesUpdated() {
  const mockRules = await getMockRules();
  
  // 获取所有标签页并发送消息
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: 'MOCK_RULES_UPDATED',
            rules: mockRules
          });
        } catch (e) {
          // 忽略无法发送消息的标签页（可能是 chrome:// 或其他受保护页面）
        }
      }
    }
  } catch (e) {
    console.error('[Request Interceptor Tiny]', t('logFailedToNotifyTabs'), e);
  }
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
  rules.unshift(newRule);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
  await applyRules();
  // 如果是 mock 规则，通知 content scripts
  if (rule.type === 'mockResponse') {
    await notifyMockRulesUpdated();
  }
  return newRule;
}

// 更新规则
async function updateRule(ruleId, updatedRule) {
  const rules = await getRules();
  const index = rules.findIndex(r => r.id === ruleId);
  if (index !== -1) {
    const oldType = rules[index].type;
    rules[index] = { ...rules[index], ...updatedRule };
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
    await applyRules();
    // 如果涉及 mock 规则，通知 content scripts
    if (oldType === 'mockResponse' || updatedRule.type === 'mockResponse') {
      await notifyMockRulesUpdated();
    }
    return rules[index];
  }
  return null;
}

// 删除规则
async function deleteRule(ruleId) {
  const rules = await getRules();
  const deletedRule = rules.find(r => r.id === ruleId);
  const filteredRules = rules.filter(r => r.id !== ruleId);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: filteredRules });
  await applyRules();
  // 如果删除的是 mock 规则，通知 content scripts
  if (deletedRule && deletedRule.type === 'mockResponse') {
    await notifyMockRulesUpdated();
  }
  return true;
}


// 清空所有规则
async function clearAllRules() {
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });
  await applyRules();
  await notifyMockRulesUpdated();
  return true;
}

// 关闭所有规则
async function disableAllRules() {
  const rules = await getRules();
  const updatedRules = rules.map(rule => ({ ...rule, enabled: false }));
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: updatedRules });
  await applyRules();
  await notifyMockRulesUpdated();
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
    // 如果是 mock 规则，通知 content scripts
    if (rule.type === 'mockResponse') {
      await notifyMockRulesUpdated();
    }
    return rule;
  }
  return null;
}

// 应用规则到declarativeNetRequest
// 注意：mockResponse (JSON) 规则由 content script 处理，这里主要是清理旧规则
async function applyRules() {
  // 获取现有的动态规则
  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const existingRuleIds = existingRules.map(r => r.id);
  
  // 移除所有现有规则（清理可能存在的旧规则）
  if (existingRuleIds.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds
    });
  }
  
  // mockResponse 规则由 content script 处理，不需要添加 declarativeNetRequest 规则
  console.log('[Request Interceptor Tiny]', t('logRulesCleanedUp'));
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
  console.log('[Request Interceptor Tiny]', t('logRequestLoggingEnabled'));
} catch (e) {
  // onRuleMatchedDebug 只在开发模式下可用
  console.log('[Request Interceptor Tiny]', t('logRequestLoggingNotAvailable'));
}
