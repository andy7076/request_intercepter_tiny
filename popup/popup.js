// DOM元素
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');
const rulesList = document.getElementById('rules-list');
const ruleCount = document.getElementById('rule-count');
const ruleForm = document.getElementById('rule-form');
const cancelBtn = document.getElementById('cancel-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');
const logsList = document.getElementById('logs-list');
const logCount = document.getElementById('log-count');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const clearRulesBtn = document.getElementById('clear-rules-btn');
const disableRulesBtn = document.getElementById('disable-rules-btn');

// 响应内容编辑器相关
const responseBody = document.getElementById('response-body');
const expandEditor = document.getElementById('expand-editor');

// 全屏编辑器模态框
const editorModal = document.getElementById('editor-modal');
const modalTextarea = document.getElementById('modal-textarea');
const modalClose = document.getElementById('modal-close');
const modalSearchBtn = document.getElementById('modal-search-btn');
const editorModalContent = document.getElementById('editor-modal-content');

// 搜索替换实例
let editorSearchReplace = null;

let editingRuleId = null;

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const settingConsoleLog = document.getElementById('setting-console-log');

// Init
document.addEventListener('DOMContentLoaded', () => {
  loadRules();
  loadLogs();
  loadSettings();
  setupEventListeners();
});

// 设置事件监听
function setupEventListeners() {
  // Tab切换
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });

  // 表单提交
  ruleForm.addEventListener('submit', handleFormSubmit);

  // 取消按钮
  cancelBtn.addEventListener('click', () => {
    resetForm();
    switchTab('rules');
  });
  
  // 导入导出按钮
  importBtn.addEventListener('click', () => importFile.click());
  exportBtn.addEventListener('click', handleExport);
  importFile.addEventListener('change', handleImport);
  
  // 清空日志按钮
  // 清空日志按钮
  clearLogsBtn.addEventListener('click', handleClearLogs);
  
  // 清空规则按钮
  if (clearRulesBtn) {
    clearRulesBtn.addEventListener('click', handleClearRules);
  }

  // 禁用所有规则按钮
  if (disableRulesBtn) {
    disableRulesBtn.addEventListener('click', handleDisableRules);
  }
  
  // JSON 实时验证
  responseBody.addEventListener('input', validateJsonRealtime);
  modalTextarea.addEventListener('input', () => {
    // 同步到主输入框并验证
    responseBody.value = modalTextarea.value;
    validateJsonRealtime();
  });
  
  // 处理 Tab 键输入缩进
  const handleTabKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      
      // 插入两个空格作为缩进
      e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(end);
      
      // 移动光标位置
      e.target.selectionStart = e.target.selectionEnd = start + 2;
      
      // 触发 input 事件以更新验证
      e.target.dispatchEvent(new Event('input'));
    }
  };

  responseBody.addEventListener('keydown', handleTabKey);
  modalTextarea.addEventListener('keydown', handleTabKey);
  
  // 放大编辑器
  expandEditor.addEventListener('click', openEditorModal);
  modalClose.addEventListener('click', closeEditorModal);
  
  // 搜索替换按钮
  if (modalSearchBtn) {
    modalSearchBtn.addEventListener('click', () => {
      if (editorSearchReplace) {
        editorSearchReplace.show();
      }
    });
  }
  
  // ESC关闭模态框（但不关闭搜索替换，由搜索替换组件自己处理）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorModal.classList.contains('active')) {
      // 如果搜索替换组件显示中，让它先关闭
      if (editorSearchReplace && editorSearchReplace.isVisible) {
        return; // 由搜索替换组件处理
      }
      closeEditorModal();
    }
  });
  
  // 在新标签页打开
  const openInTabBtn = document.getElementById('open-in-tab-btn');
  if (openInTabBtn) {
    openInTabBtn.addEventListener('click', () => {
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
    });
  }

  // Settings Modal
  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      settingsModal.classList.add('active');
    });
  }

  if (settingsClose) {
    settingsClose.addEventListener('click', () => {
      settingsModal.classList.remove('active');
    });
  }

  // Close modal when clicking outside
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
      if (e.target === settingsModal) {
        settingsModal.classList.remove('active');
      }
    });
  }

  // Console Log Toggle
  if (settingConsoleLog) {
    settingConsoleLog.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      chrome.storage.local.set({ consoleLogs: enabled }, () => {
        showToast(enabled ? '控制台日志已开启' : '控制台日志已关闭');
      });
    });
  }
}

// Load Settings
function loadSettings() {
  chrome.storage.local.get(['consoleLogs'], (result) => {
    if (settingConsoleLog) {
      settingConsoleLog.checked = result.consoleLogs || false;
    }
  });
}

// 切换Tab
function switchTab(tab) {
  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `${tab}-panel`);
  });
}

// 实时验证 JSON 格式
function validateJsonRealtime() {
  const mainIndicator = document.getElementById('json-status-indicator');
  const mainStatusText = document.getElementById('json-status-text');
  const modalIndicator = document.getElementById('modal-json-status-indicator');
  const modalStatusText = document.getElementById('modal-json-status-text');
  
  const targets = [];
  if (mainIndicator && mainStatusText) targets.push({ indicator: mainIndicator, text: mainStatusText });
  if (modalIndicator && modalStatusText) targets.push({ indicator: modalIndicator, text: modalStatusText });
  
  const value = responseBody.value.trim();
  
  if (!value) {
    // 空内容时重置为默认状态
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator';
      text.className = 'hint';
      text.textContent = '输入要返回的 JSON 响应内容';
    });
    return false;
  }
  
  try {
    const parsed = JSON.parse(value);
    // 检查是否为对象或数组（API 响应通常是这两种格式）
    if (typeof parsed !== 'object' || parsed === null) {
      targets.forEach(({ indicator, text }) => {
        indicator.className = 'json-status-indicator invalid';
        text.className = 'hint invalid';
        text.textContent = '✗ 需要 JSON 对象 {} 或数组 []';
      });
      return false;
    }
    
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator valid';
      text.className = 'hint valid';
      text.textContent = '✓ JSON 格式有效';
    });
    return true;
  } catch (err) {
    // 提取错误位置信息
    const match = err.message.match(/position (\d+)/);
    const errorMsg = match ? `✗ JSON 格式错误 (位置 ${match[1]})` : '✗ JSON 格式错误';
    
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator invalid';
      text.className = 'hint invalid';
      text.textContent = errorMsg;
    });
    return false;
  }
}

// 打开全屏编辑器
function openEditorModal() {
  modalTextarea.value = responseBody.value;
  editorModal.classList.add('active');
  modalTextarea.focus();
  
  // 初始化搜索替换功能
  if (!editorSearchReplace && window.EditorSearchReplace) {
    editorSearchReplace = new EditorSearchReplace('modal-textarea', 'editor-modal-content');
  }
}

// 关闭全屏编辑器
function closeEditorModal() {
  // 先隐藏搜索替换组件
  if (editorSearchReplace && editorSearchReplace.isVisible) {
    editorSearchReplace.hide();
  }
  // 同步内容回原来的输入框
  responseBody.value = modalTextarea.value;
  editorModal.classList.remove('active');
  // 验证 JSON 格式
  validateJsonRealtime();
}

// 加载规则列表
async function loadRules() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  renderRules(rules);
}

// 渲染规则列表
function renderRules(rules) {
  ruleCount.textContent = rules.length;
  
  if (rules.length === 0) {
    rulesList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📂</span>
        <p>暂无拦截规则</p>
        <p class="hint">点击下方或顶部的"添加规则"开启高效调试</p>
      </div>
    `;
    return;
  }
  
  rulesList.innerHTML = rules.map(rule => `
    <div class="rule-card ${rule.enabled ? '' : 'disabled'}" data-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-toggle ${rule.enabled ? 'active' : ''}" data-id="${rule.id}"></div>
        <span class="rule-name">${escapeHtml(rule.name)}</span>
        <button class="btn-icon-small btn-export-icon" data-id="${rule.id}" title="导出规则">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
        </button>
      </div>
      <div class="rule-url">${escapeHtml(rule.urlPattern)}</div>
      ${renderRuleDetails(rule)}
      <div class="rule-actions">
        <button class="btn-edit" data-id="${rule.id}">编辑</button>
        <button class="btn-delete" data-id="${rule.id}">删除</button>
      </div>
    </div>
  `).join('');
  
  // 绑定事件
  rulesList.querySelectorAll('.rule-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => handleToggle(toggle.dataset.id));
  });
  
  rulesList.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => handleEdit(btn.dataset.id));
  });
  
  rulesList.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id));
  });

  rulesList.querySelectorAll('.btn-export-icon').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent toggling rule when clicking export
      handleExportRule(btn.dataset.id);
    });
  });
  
  // 绑定展开/收起按钮事件
  rulesList.querySelectorAll('.btn-expand-preview').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = btn.dataset.ruleId;
      const content = document.querySelector(`.response-content[data-content-id="${ruleId}"]`);
      const icon = btn.querySelector('.expand-icon');
      const text = btn.querySelector('.expand-text');
      
      if (content) {
        const isCollapsed = content.classList.contains('collapsed');
        content.classList.toggle('collapsed', !isCollapsed);
        icon.textContent = isCollapsed ? '▼' : '▶';
        text.textContent = isCollapsed ? '收起' : '展开';
      }
    });
  });
}

// 渲染规则详情
function renderRuleDetails(rule) {
  if (rule.responseBody) {
    const preview = rule.responseBody.length > 60 
      ? rule.responseBody.substring(0, 60) + '...' 
      : rule.responseBody;
    const fullContent = rule.responseBody;
    const needsExpand = rule.responseBody.length > 60;
    
    return `
      <div class="rule-details response-preview" data-rule-id="${rule.id}">
        <div class="response-header">
          <span class="content-type-label">application/json</span>
          ${needsExpand ? `<button type="button" class="btn-expand-preview" data-rule-id="${rule.id}">
            <span class="expand-icon">▶</span>
            <span class="expand-text">展开</span>
          </button>` : ''}
        </div>
        <div class="response-content collapsed" data-content-id="${rule.id}">
          <div class="response-preview-text">${escapeHtml(preview)}</div>
          <div class="response-full-text">${escapeHtml(fullContent)}</div>
        </div>
      </div>
    `;
  }
  
  return '';
}



// 处理开关切换
async function handleToggle(ruleId) {
  await sendMessage({ type: 'TOGGLE_RULE', ruleId });
  loadRules();
  showToast('规则状态已更新');
}

// 处理编辑
async function handleEdit(ruleId) {
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  
  if (!rule) return;
  
  editingRuleId = ruleId;
  
  // 填充表单
  document.getElementById('rule-name').value = rule.name;
  document.getElementById('url-pattern').value = rule.urlPattern;
  document.getElementById('response-body').value = rule.responseBody || '';
  
  // 验证 JSON 格式
  validateJsonRealtime();
  
  switchTab('add');
}

// 处理删除
async function handleDelete(ruleId) {
  if (!confirm('确定要删除这条规则吗？')) return;
  
  await sendMessage({ type: 'DELETE_RULE', ruleId });
  loadRules();
  showToast('规则已删除');
}

// 处理表单提交
async function handleFormSubmit(e) {
  e.preventDefault();
  
  const responseBody = document.getElementById('response-body').value;
  
  // 验证 JSON 格式（必须是对象或数组）
  try {
    const parsed = JSON.parse(responseBody);
    if (typeof parsed !== 'object' || parsed === null) {
      showToast('需要 JSON 对象 {} 或数组 []', true);
      return;
    }
  } catch (err) {
    showToast('请输入有效的 JSON 格式', true);
    return;
  }
  
  const rule = {
    name: document.getElementById('rule-name').value.trim(),
    urlPattern: document.getElementById('url-pattern').value.trim(),
    type: 'mockResponse',
    contentType: 'application/json',
    responseBody: responseBody
  };
  
  if (!rule.responseBody) {
    showToast('请输入响应内容', true);
    return;
  }
  
  if (editingRuleId) {
    await sendMessage({ type: 'UPDATE_RULE', ruleId: editingRuleId, rule });
    showToast('规则已更新');
  } else {
    await sendMessage({ type: 'ADD_RULE', rule });
    showToast('规则已添加');
  }
  
  resetForm();
  loadRules();
  switchTab('rules');
}

// 重置表单
function resetForm() {
  editingRuleId = null;
  ruleForm.reset();
  document.getElementById('response-body').value = '';
  // 重置 JSON 验证状态
  validateJsonRealtime();
}

// 发送消息给background
function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('通信失败:', chrome.runtime.lastError.message);
          // 如果后台服务未响应，根据请求类型返回安全的默认值
          if (message.type && message.type.startsWith('GET_')) {
            resolve([]);
          } else {
            resolve(null);
          }
          // 不再显示Toast，避免在初始化时频繁弹出
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      console.error('发送消息异常:', e);
      if (message.type && message.type.startsWith('GET_')) {
        resolve([]);
      } else {
        resolve(null);
      }
    }
  });
}

// 显示Toast提示
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 2500);
}

// HTML转义
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// 导出规则
async function handleExport() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  
  if (rules.length === 0) {
    showToast('没有可导出的规则', true);
    return;
  }
  
  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules: rules
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `request-interceptor-rules-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast(`已导出 ${rules.length} 条规则`);
}

// 导出单条规则
async function handleExportRule(ruleId) {
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  
  if (!rule) {
    showToast('规则不存在', true);
    return;
  }
  
  // 保持与整体导出相同的格式，但只包含一条规则
  const exportData = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    rules: [rule]
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  // 文件名包含规则名称，对其进行清理以作为合法文件名
  const safeName = rule.name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
  a.download = `rule-${safeName}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  
  URL.revokeObjectURL(url);
  showToast(`已导出规则: ${rule.name}`);
}

// 导入规则
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.rules || !Array.isArray(data.rules)) {
      throw new Error('无效的规则文件格式');
    }
    
    const confirmMsg = `确定要导入 ${data.rules.length} 条规则吗？\n这将添加到现有规则中。`;
    if (!confirm(confirmMsg)) {
      importFile.value = '';
      return;
    }
    
    // 逐个添加规则
    let imported = 0;
    for (const rule of data.rules) {
      // 移除旧的id和时间戳，让系统生成新的
      const { id, createdAt, ...ruleData } = rule;
      await sendMessage({ type: 'ADD_RULE', rule: ruleData });
      imported++;
    }
    
    loadRules();
    showToast(`成功导入 ${imported} 条规则`);
  } catch (error) {
    console.error('Import error:', error);
    showToast(`导入失败: ${error.message}`, true);
  }
  
  // 重置文件输入
  importFile.value = '';
}

// 加载日志
async function loadLogs() {
  const logs = await sendMessage({ type: 'GET_LOGS' });
  renderLogs(logs);
}

// 渲染日志列表
function renderLogs(logs) {
  logCount.textContent = logs.length;
  
  if (logs.length === 0) {
    logsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📉</span>
        <p>暂无网络日志</p>
        <p class="hint">开启规则后，匹配到的请求将在此实时展示</p>
      </div>
    `;
    return;
  }
  
  logsList.innerHTML = logs.map(log => {
    const time = new Date(log.timestamp).toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return `
      <div class="log-item">
        <div class="log-header">
          <span>
            <span class="log-type mockResponse">🎯 Mock</span>
            <span class="log-rule">${escapeHtml(log.ruleName)}</span>
          </span>
          <span class="log-time">${time}</span>
        </div>
        <div class="log-url">${log.method || 'GET'} ${escapeHtml(log.url)}</div>
      </div>
    `;
  }).join('');
}

// 清空日志
async function handleClearLogs() {
  if (!confirm('确定要清空所有日志吗？')) return;
  
  await sendMessage({ type: 'CLEAR_LOGS' });
  loadLogs();
  showToast('日志已清空');
}

// 定时刷新日志（在日志面板激活时）
setInterval(() => {
  const logsPanel = document.getElementById('logs-panel');
  if (logsPanel && logsPanel.classList.contains('active')) {
    loadLogs();
  }
}, 3000);

// 清空所有规则
async function handleClearRules() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) {
    showToast('暂无规则可清空', true);
    return;
  }
  
  if (!confirm('确定要清空所有规则吗？此操作无法撤销。')) return;
  
  await sendMessage({ type: 'CLEAR_ALL_RULES' });
  loadRules();
  showToast('所有规则已清空');
}

// 禁用所有规则
async function handleDisableRules() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) {
    showToast('暂无规则', true);
    return;
  }
  
  const hasEnabled = rules.some(r => r.enabled);
  if (!hasEnabled) {
    showToast('所有规则已处于关闭状态', true);
    return;
  }

  if (!confirm('确定要关闭所有规则吗？')) return;
  
  await sendMessage({ type: 'DISABLE_ALL_RULES' });
  loadRules();
  showToast('所有规则已关闭');
}
