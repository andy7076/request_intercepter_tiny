// 共享的规则归一化模块（同一份代码也被 content.js 通过注册脚本加载）
// 这样 service worker 与内容脚本不会因为复制-粘贴而出现行为漂移。
importScripts('shared/rule-normalize.js');

const {
  normalizeMethod,
  normalizeMatchMode,
  normalizePriority,
  normalizeStatus,
  normalizeRule
} = RuleNormalize;

// ========== 规则存储 ==========
// 存储规则的键名
const RULES_STORAGE_KEY = 'interceptRules';
const LOGS_STORAGE_KEY = 'requestLogs';
const INTERCEPTOR_ENABLED_KEY = 'interceptorEnabled';
const MAX_LOGS = 100; // 最大日志条数
const LOGS_FLUSH_DEBOUNCE_MS = 300;

const BADGE_BACKGROUND_COLOR = '#4ade80';
const BADGE_DISABLED_COLOR = '#94a3b8';
const ACTION_INDICATOR_SIZES = [16, 32, 48, 128];
const DEFAULT_ACTION_ICON_PATHS = {
  16: 'icons/icon16.png',
  32: 'icons/icon48.png',
  48: 'icons/icon48.png',
  128: 'icons/icon128.png'
};
const CONTENT_SCRIPT_IDS = ['request-interceptor-main', 'request-interceptor-content'];
const actionIconCache = new Map();

function getIndicatorColor(enabled) {
  return enabled ? BADGE_BACKGROUND_COLOR : BADGE_DISABLED_COLOR;
}

function getIndicatorMetrics(size) {
  if (size <= 16) {
    return { radius: 3.8, offsetX: -0.45, offsetY: -0.45, lineWidth: 1.3 };
  }
  if (size <= 32) {
    return { radius: 6.5, offsetX: 0.2, offsetY: 0.2, lineWidth: 1.9 };
  }
  if (size <= 48) {
    return { radius: 8.4, offsetX: 0.5, offsetY: 0.5, lineWidth: 2.3 };
  }
  return { radius: 19, offsetX: 3, offsetY: 3, lineWidth: 3.6 };
}

async function loadBaseActionIcon(size) {
  const cacheKey = `base:${size}`;
  if (actionIconCache.has(cacheKey)) {
    return actionIconCache.get(cacheKey);
  }

  const sourcePath = DEFAULT_ACTION_ICON_PATHS[size];
  const response = await fetch(chrome.runtime.getURL(sourcePath));
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, size, size);
  const imageData = ctx.getImageData(0, 0, size, size);
  actionIconCache.set(cacheKey, imageData);
  return imageData;
}

async function getIndicatorActionIcons(enabled) {
  const cacheKey = `indicator:${enabled}`;
  if (actionIconCache.has(cacheKey)) {
    return actionIconCache.get(cacheKey);
  }

  const color = getIndicatorColor(enabled);
  const iconEntries = await Promise.all(
    ACTION_INDICATOR_SIZES.map(async (size) => {
      const baseImageData = await loadBaseActionIcon(size);
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext('2d');
      ctx.putImageData(baseImageData, 0, 0);

      const { radius, offsetX, offsetY, lineWidth } = getIndicatorMetrics(size);
      const centerX = size - radius - offsetX;
      const centerY = size - radius - offsetY;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
      ctx.stroke();

      return [size, ctx.getImageData(0, 0, size, size)];
    })
  );

  const imageData = Object.fromEntries(iconEntries);
  actionIconCache.set(cacheKey, imageData);
  return imageData;
}

async function setActionIndicatorIcon(enabled) {
  const imageData = await getIndicatorActionIcons(enabled);
  await chrome.action.setIcon({ imageData });
}

async function restoreDefaultActionIcon() {
  await chrome.action.setIcon({ path: DEFAULT_ACTION_ICON_PATHS });
}

function getContentScriptDefinitions() {
  return [
    {
      id: 'request-interceptor-main',
      matches: ['<all_urls>'],
      js: ['injected.js'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true,
      world: 'MAIN'
    },
    {
      id: 'request-interceptor-content',
      matches: ['<all_urls>'],
      // 共享模块必须排在 content.js 之前，否则 content.js 里无法访问 RuleNormalize
      js: ['shared/rule-normalize.js', 'content.js'],
      runAt: 'document_start',
      allFrames: true,
      persistAcrossSessions: true
    }
  ];
}

async function isInterceptorEnabled() {
  const result = await chrome.storage.local.get(INTERCEPTOR_ENABLED_KEY);
  return result[INTERCEPTOR_ENABLED_KEY] !== false;
}

async function syncContentScriptRegistration(enabled = null) {
  const explicit = typeof enabled === 'boolean';
  const shouldEnable = explicit ? enabled : await isInterceptorEnabled();

  let existing = [];
  try {
    existing = await chrome.scripting.getRegisteredContentScripts({ ids: CONTENT_SCRIPT_IDS });
  } catch (err) {
    // 取不到就当成未注册，走下方的注册流程
  }

  // 隐式同步（SW 冷启动 / 定期唤醒）：如果已和期望状态一致就直接返回，
  // 避免每次唤醒都 unregister+register 导致的短暂漏注入窗口。
  if (!explicit) {
    if (shouldEnable && existing.length === CONTENT_SCRIPT_IDS.length) {
      return;
    }
    if (!shouldEnable && existing.length === 0) {
      return;
    }
  }

  if (existing.length > 0) {
    try {
      await chrome.scripting.unregisterContentScripts({ ids: CONTENT_SCRIPT_IDS });
    } catch (err) {
      // ignore when not registered
    }
  }

  if (!shouldEnable) {
    return;
  }

  await chrome.scripting.registerContentScripts(getContentScriptDefinitions());
}

async function broadcastInterceptorEnabled(enabled) {
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.allSettled(
      tabs
        .filter(tab => tab.id)
        .map(tab => chrome.tabs.sendMessage(tab.id, {
          type: 'INTERCEPTOR_ENABLED_UPDATED',
          enabled
        }))
    );
  } catch (err) {
    console.warn('[Request Interceptor Tiny]', 'Failed to broadcast interceptor enabled state:', err);
  }
}

async function setInterceptorEnabled(enabled) {
  const normalized = enabled !== false;
  await chrome.storage.local.set({ [INTERCEPTOR_ENABLED_KEY]: normalized });
  await syncContentScriptRegistration(normalized);
  await broadcastInterceptorEnabled(normalized);
  await updateActionBadge();
  return {
    success: true,
    enabled: normalized,
    refreshRequired: normalized
  };
}

// 缓存上一次渲染的 badge/icon 状态，storage.onChanged 频繁触发时可以跳过
// 不必要的 chrome.action API 调用（尤其是 setIcon，每次都要画 canvas）。
let lastBadgeState = null;

async function updateActionBadge(rules) {
  const interceptorEnabled = await isInterceptorEnabled();
  const currentRules = Array.isArray(rules) ? rules : await getRules();
  const enabledRuleCount = currentRules.filter(rule => rule.enabled).length;
  const indicatorColor = getIndicatorColor(interceptorEnabled);

  const nextState = {
    interceptorEnabled,
    enabledRuleCount,
    indicatorColor
  };
  if (
    lastBadgeState &&
    lastBadgeState.interceptorEnabled === nextState.interceptorEnabled &&
    lastBadgeState.enabledRuleCount === nextState.enabledRuleCount &&
    lastBadgeState.indicatorColor === nextState.indicatorColor
  ) {
    return;
  }
  lastBadgeState = nextState;

  if (enabledRuleCount === 0) {
    await chrome.action.setBadgeText({ text: '' });
    await setActionIndicatorIcon(interceptorEnabled);
    return;
  }

  await restoreDefaultActionIcon();
  await chrome.action.setBadgeBackgroundColor({ color: indicatorColor });
  await chrome.action.setBadgeText({ text: String(enabledRuleCount) });
}

// 初始化规则
chrome.runtime.onInstalled.addListener(async (details) => {
  const result = await chrome.storage.local.get([RULES_STORAGE_KEY, INTERCEPTOR_ENABLED_KEY]);
  if (!result[RULES_STORAGE_KEY]) {
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });
  }
  if (typeof result[INTERCEPTOR_ENABLED_KEY] !== 'boolean') {
    await chrome.storage.local.set({ [INTERCEPTOR_ENABLED_KEY]: true });
  }
  
  // Set flag for update banner
  if (details.reason === 'install' || details.reason === 'update') {
    await chrome.storage.local.set({ justUpdated: true });
  }

  await syncContentScriptRegistration(result[INTERCEPTOR_ENABLED_KEY] !== false);
  await updateActionBadge(result[RULES_STORAGE_KEY] || []);

  console.log('[Request Interceptor Tiny]', `Extension ${details.reason} action triggered`);
});

chrome.runtime.onStartup.addListener(() => {
  syncContentScriptRegistration().catch(err => {
    console.error('[Request Interceptor Tiny]', 'Failed to sync content scripts on startup:', err);
  });
  updateActionBadge().catch(err => {
    console.error('[Request Interceptor Tiny]', 'Failed to update badge on startup:', err);
  });
});

// 点击扩展图标时打开 Side Panel
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ tabId: tab.id });
});

updateActionBadge();

// 顶层做一次幂等的脚本注册确认，避免 SW 被杀后重启时
// registerContentScripts 中间态（unregister 已完成但 register 还在路上）
// 导致新打开的页面漏注入。
syncContentScriptRegistration().catch(err => {
  console.error('[Request Interceptor Tiny]', 'Failed to sync content scripts:', err);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes[RULES_STORAGE_KEY] || changes[INTERCEPTOR_ENABLED_KEY]) {
    updateActionBadge(
      changes[RULES_STORAGE_KEY]
        ? (changes[RULES_STORAGE_KEY].newValue || [])
        : undefined
    );
  }

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
  GET_INTERCEPTOR_ENABLED: () => isInterceptorEnabled(),
  SET_INTERCEPTOR_ENABLED: (msg) => setInterceptorEnabled(msg.enabled),
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
      originalBody: msg.originalBody || '',
      tabId: sender.tab?.id,
      frameId: sender.frameId
    });
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

// 说明：这里不再通过 chrome.tabs.sendMessage 广播规则更新。
// content.js 已经监听 chrome.storage.onChanged，只要 chrome.storage.local.set
// 完成就会同步触发 extractMockRules；双路径会导致同一次规则变更
// 在内容脚本中被重复解析两次。

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
  return newRule;
}

// 更新规则
async function updateRule(ruleId, updatedRule) {
  const rules = await getRules();
  const index = rules.findIndex(r => r.id === ruleId);
  if (index !== -1) {
    rules[index] = normalizeRule({ ...rules[index], ...updatedRule });
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
    return rules[index];
  }
  return null;
}

// 删除规则
async function deleteRule(ruleId) {
  const rules = await getRules();
  const filteredRules = rules.filter(r => r.id !== ruleId);
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: filteredRules });
  return true;
}


// 清空所有规则
async function clearAllRules() {
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: [] });
  return true;
}

// 关闭所有规则
async function disableAllRules() {
  const rules = await getRules();
  const updatedRules = rules.map(rule => ({ ...rule, enabled: false }));
  await chrome.storage.local.set({ [RULES_STORAGE_KEY]: updatedRules });
  return true;
}


// 切换规则启用状态
async function toggleRule(ruleId) {
  const rules = await getRules();
  const rule = rules.find(r => r.id === ruleId);
  if (rule) {
    rule.enabled = !rule.enabled;
    await chrome.storage.local.set({ [RULES_STORAGE_KEY]: rules });
    return rule;
  }
  return null;
}



// ========== 日志内存缓存 + 防抖落盘 ==========
// Mock 高频请求时日志写入会频繁触发 O(n) 的 read-modify-write；
// 先在 SW 内存里更新，再以短防抖合并写入 chrome.storage.local。
let cachedLogs = null;
let logsFlushTimer = null;
let logsFlushPending = Promise.resolve();

async function ensureLogsLoaded() {
  if (cachedLogs === null) {
    const result = await chrome.storage.local.get(LOGS_STORAGE_KEY);
    cachedLogs = Array.isArray(result[LOGS_STORAGE_KEY]) ? result[LOGS_STORAGE_KEY] : [];
  }
  return cachedLogs;
}

function scheduleLogsFlush() {
  if (logsFlushTimer) return;
  logsFlushTimer = setTimeout(() => {
    logsFlushTimer = null;
    logsFlushPending = (async () => {
      if (cachedLogs === null) return;
      try {
        await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: cachedLogs });
      } catch (err) {
        console.error('[Request Interceptor Tiny]', 'Failed to flush logs:', err);
      }
    })();
  }, LOGS_FLUSH_DEBOUNCE_MS);
}

async function flushLogsNow() {
  if (logsFlushTimer) {
    clearTimeout(logsFlushTimer);
    logsFlushTimer = null;
  }
  if (cachedLogs === null) {
    await logsFlushPending;
    return;
  }
  try {
    await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: cachedLogs });
  } catch (err) {
    console.error('[Request Interceptor Tiny]', 'Failed to flush logs:', err);
  }
}

// 获取日志
async function getLogs() {
  // 面板读取前先 flush，保证返回的是最新状态的完整快照。
  await flushLogsNow();
  return ensureLogsLoaded();
}

// 清空日志
async function clearLogs() {
  cachedLogs = [];
  if (logsFlushTimer) {
    clearTimeout(logsFlushTimer);
    logsFlushTimer = null;
  }
  await chrome.storage.local.set({ [LOGS_STORAGE_KEY]: [] });
  return true;
}

// 添加日志
async function addLog(logEntry) {
  const logs = await ensureLogsLoaded();
  logs.unshift({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    ...logEntry
  });

  // 保持日志数量不超过最大值
  if (logs.length > MAX_LOGS) {
    logs.length = MAX_LOGS;
  }

  scheduleLogsFlush();
}
