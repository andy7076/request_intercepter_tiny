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

const BADGE_BACKGROUND_COLOR = '#16a34a';
const DEFAULT_MATCH_MODE = 'contains';
const DEFAULT_METHOD = 'ALL';
const DEFAULT_PRIORITY = 0;
const DEFAULT_STATUS = 200;
const DEFAULT_DELAY_MS = 0;
const DEFAULT_CONTENT_TYPE = 'application/json';

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

function getRuleContentType(rule) {
  const headers = normalizeResponseHeaders(rule.responseHeaders);
  const contentTypeHeader = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
  return contentTypeHeader ? headers[contentTypeHeader] : (rule.contentType || DEFAULT_CONTENT_TYPE);
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

async function updateActionBadge(rules) {
  const currentRules = Array.isArray(rules) ? rules : await getRules();
  const enabledRuleCount = currentRules.filter(rule => rule.enabled).length;
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
  await chrome.action.setBadgeText({ text: enabledRuleCount > 0 ? String(enabledRuleCount) : '' });
}

// 初始化规则
chrome.runtime.onInstalled.addListener(async (details) => {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY);
  if (!result[RULES_STORAGE_KEY]) {
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });
  }
  
  // Set flag for update banner
  if (details.reason === 'install' || details.reason === 'update') {
    await chrome.storage.local.set({ justUpdated: true });
  }

  await updateActionBadge(result[RULES_STORAGE_KEY] || []);

  console.log('[Request Interceptor Tiny]', `Extension ${details.reason} action triggered`);
});

// 点击扩展图标时打开 Side Panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

updateActionBadge();

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[RULES_STORAGE_KEY]) {
    return;
  }

  updateActionBadge(changes[RULES_STORAGE_KEY].newValue || []);
});

// 监听来自 side panel 和 content script 的消息
// 使用 handler map 替代 if-else 链
const messageHandlers = {
  GET_RULES: () => getRules(),
  ADD_RULE: (msg) => addRule(msg.rule),
  UPDATE_RULE: (msg) => updateRule(msg.ruleId, msg.rule),
  DELETE_RULE: (msg) => deleteRule(msg.ruleId),
  TOGGLE_RULE: (msg) => toggleRule(msg.ruleId),
  GET_LOGS: () => getLogs(),
  CLEAR_LOGS: () => clearLogs(),
  CLEAR_ALL_RULES: () => clearAllRules(),
  DISABLE_ALL_RULES: () => disableAllRules(),
  GET_MOCK_RULES: () => getMockRules(),
  LOG_MOCK_REQUEST: (msg, sender) => {
    addLog({
      ruleId: msg.ruleId || '',
      ruleName: msg.ruleName,
      ruleType: msg.ruleType,
      url: msg.url,
      method: normalizeMethod(msg.method || 'GET'),
      matchMode: normalizeMatchMode(msg.matchMode),
      priority: normalizePriority(msg.priority),
      status: normalizeStatus(msg.status),
      mockedBody: msg.mockedBody || '',
      logTimestamp: msg.logTimestamp || '',
      tabId: sender.tab?.id,
      frameId: sender.frameId
    });
    return { success: true };
  },
  UPDATE_LOG_ORIGINAL_BODY: (msg) => {
    updateLogOriginalBody(msg.logTimestamp, msg.originalBody);
    return { success: true };
  },
  FETCH_URL: (msg) => executeFetch(msg.request)
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    Promise.resolve(handler(message, sender))
      .then(sendResponse)
      .catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

// 执行 fetch 请求
async function executeFetch(requestConfig) {
  const { url, method = 'GET', headers = {}, body } = requestConfig;
  
  try {
    const fetchOptions = {
      method,
      headers,
    };
    
    // 只有非 GET/HEAD 请求才添加 body
    if (body && method !== 'GET' && method !== 'HEAD') {
      fetchOptions.body = body;
    }
    
    const response = await fetch(url, fetchOptions);
    
    // 获取响应内容
    const contentType = response.headers.get('content-type') || '';
    let responseBody;
    
    if (contentType.includes('application/json')) {
      try {
        const jsonData = await response.json();
        responseBody = JSON.stringify(jsonData, null, 2);
      } catch {
        responseBody = await response.text();
      }
    } else {
      responseBody = await response.text();
      // 尝试解析为 JSON 并格式化
      try {
        const jsonData = JSON.parse(responseBody);
        responseBody = JSON.stringify(jsonData, null, 2);
      } catch {
        // 不是 JSON，保持原样
      }
    }
    
    return {
      success: true,
      status: response.status,
      statusText: response.statusText,
      contentType,
      body: responseBody
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}


// 获取所有规则
async function getRules() {
  const result = await chrome.storage.local.get(RULES_STORAGE_KEY);
  const rules = result[RULES_STORAGE_KEY] || [];
  return rules.map(normalizeRule);
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
    console.error('[Request Interceptor Tiny]', 'Failed to notify tabs:', e);
  }
}

// 添加规则
async function addRule(rule) {
  const rules = await getRules();
  const newRule = {
    id: crypto.randomUUID(),
    enabled: true,
    createdAt: new Date().toISOString(),
    ...normalizeRule(rule)
  };
  rules.unshift(newRule);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });

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
    rules[index] = normalizeRule({ ...rules[index], ...updatedRule });
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });

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

  // 如果删除的是 mock 规则，通知 content scripts
  if (deletedRule && deletedRule.type === 'mockResponse') {
    await notifyMockRulesUpdated();
  }
  return true;
}


// 清空所有规则
async function clearAllRules() {
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });

  await notifyMockRulesUpdated();
  return true;
}

// 关闭所有规则
async function disableAllRules() {
  const rules = await getRules();
  const updatedRules = rules.map(rule => ({ ...rule, enabled: false }));
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: updatedRules });

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

    // 如果是 mock 规则，通知 content scripts
    if (rule.type === 'mockResponse') {
      await notifyMockRulesUpdated();
    }
    return rule;
  }
  return null;
}



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
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...logEntry
  });
  
  // 保持日志数量不超过最大值
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }
  
  await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: logs });
}

// 更新日志的原始响应体
async function updateLogOriginalBody(logTimestamp, originalBody) {
  if (!logTimestamp || !originalBody) return;
  
  const logs = await getLogs();
  const log = logs.find(l => l.logTimestamp === logTimestamp);
  if (log) {
    log.originalBody = originalBody;
    await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: logs });
  }
}
