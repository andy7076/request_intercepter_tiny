// DOM元素
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');
const rulesList = document.getElementById('rules-list');
const ruleCount = document.getElementById('rule-count');
const ruleForm = document.getElementById('rule-form');
const ruleTypeSelect = document.getElementById('rule-type');
const headersConfig = document.getElementById('headers-config');
const redirectConfig = document.getElementById('redirect-config');
const mockConfig = document.getElementById('mock-config');
const headersList = document.getElementById('headers-list');
const addHeaderBtn = document.getElementById('add-header-btn');
const headerTemplate = document.getElementById('header-template');
const cancelBtn = document.getElementById('cancel-btn');
const applyRulesBtn = document.getElementById('apply-rules-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');
const logsList = document.getElementById('logs-list');
const logCount = document.getElementById('log-count');
const clearLogsBtn = document.getElementById('clear-logs-btn');

// 响应内容编辑器相关
const responseBody = document.getElementById('response-body');
const expandEditor = document.getElementById('expand-editor');

// 全屏编辑器模态框
const editorModal = document.getElementById('editor-modal');
const modalTextarea = document.getElementById('modal-textarea');
const modalClose = document.getElementById('modal-close');

let editingRuleId = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadRules();
  loadLogs();
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

  // 规则类型切换
  ruleTypeSelect.addEventListener('change', handleRuleTypeChange);

  // 添加Header按钮
  addHeaderBtn.addEventListener('click', addHeaderItem);

  // 表单提交
  ruleForm.addEventListener('submit', handleFormSubmit);

  // 取消按钮
  cancelBtn.addEventListener('click', () => {
    resetForm();
    switchTab('rules');
  });
  
  // 应用规则按钮
  applyRulesBtn.addEventListener('click', handleApplyRules);
  
  // 导入导出按钮
  importBtn.addEventListener('click', () => importFile.click());
  exportBtn.addEventListener('click', handleExport);
  importFile.addEventListener('change', handleImport);
  
  // 清空日志按钮
  clearLogsBtn.addEventListener('click', handleClearLogs);
  
  // 放大编辑器
  expandEditor.addEventListener('click', openEditorModal);
  modalClose.addEventListener('click', closeEditorModal);
  
  // ESC关闭模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorModal.classList.contains('active')) {
      closeEditorModal();
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

  if (tab === 'add') {
    // 初始化规则类型配置显示
    handleRuleTypeChange();
  }
}

// 处理规则类型切换
function handleRuleTypeChange() {
  const type = ruleTypeSelect.value;
  headersConfig.classList.toggle('hidden', type !== 'modifyHeaders');
  redirectConfig.classList.toggle('hidden', type !== 'redirect');
  mockConfig.classList.toggle('hidden', type !== 'mockResponse');
  
  // 如果是 modifyHeaders 类型且没有 header 项，添加一个
  if (type === 'modifyHeaders' && headersList.children.length === 0) {
    addHeaderItem();
  }
}

// 打开全屏编辑器
function openEditorModal() {
  modalTextarea.value = responseBody.value;
  editorModal.classList.add('active');
  modalTextarea.focus();
}

// 关闭全屏编辑器
function closeEditorModal() {
  // 同步内容回原来的输入框
  responseBody.value = modalTextarea.value;
  editorModal.classList.remove('active');
}

// 添加Header配置项
function addHeaderItem() {
  const clone = headerTemplate.content.cloneNode(true);
  const item = clone.querySelector('.header-item');
  
  // 删除按钮
  item.querySelector('.btn-remove').addEventListener('click', () => {
    item.remove();
  });
  
  // 操作类型变化时处理value输入框
  const operationSelect = item.querySelector('.header-operation');
  const valueInput = item.querySelector('.header-value');
  operationSelect.addEventListener('change', () => {
    valueInput.disabled = operationSelect.value === 'remove';
    if (operationSelect.value === 'remove') {
      valueInput.value = '';
      valueInput.placeholder = '删除操作不需要值';
    } else {
      valueInput.placeholder = 'Header值';
    }
  });
  
  headersList.appendChild(clone);
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
        <span class="rule-type ${rule.type}">${getRuleTypeLabel(rule.type)}</span>
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
}

// 渲染规则详情
function renderRuleDetails(rule) {
  if (rule.type === 'modifyHeaders' && rule.headerModifications) {
    return `
      <div class="rule-details" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
        ${rule.headerModifications.map(h => 
          `<div>• ${h.target === 'request' ? '请求' : '响应'} ${h.operation}: ${escapeHtml(h.name)}${h.value ? ' = ' + escapeHtml(h.value) : ''}</div>`
        ).join('')}
      </div>
    `;
  }
  
  if (rule.type === 'redirect' && rule.redirectUrl) {
    return `
      <div class="rule-details" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
        → ${escapeHtml(rule.redirectUrl)}
      </div>
    `;
  }
  
  if (rule.type === 'mockResponse' && rule.responseBody) {
    const preview = rule.responseBody.length > 100 
      ? rule.responseBody.substring(0, 100) + '...' 
      : rule.responseBody;
    return `
      <div class="rule-details" style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">
        <div>Content-Type: ${escapeHtml(rule.contentType || 'application/json')}</div>
        <div style="margin-top: 4px; padding: 4px 6px; background: var(--bg-input); border-radius: 4px; font-family: Monaco, Consolas, monospace; white-space: pre-wrap; word-break: break-all;">${escapeHtml(preview)}</div>
      </div>
    `;
  }
  
  return '';
}

// 获取规则类型标签
function getRuleTypeLabel(type) {
  const labels = {
    modifyHeaders: '✨ Headers',
    mockResponse: '🎯 Mock',
    redirect: '🔀 重定向',
    block: '🚫 阻止'
  };
  return labels[type] || type;
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
  document.getElementById('rule-type').value = rule.type;
  document.getElementById('priority').value = rule.priority || 1;
  
  handleRuleTypeChange();
  
  // 填充Header配置
  if (rule.type === 'modifyHeaders' && rule.headerModifications) {
    headersList.innerHTML = '';
    rule.headerModifications.forEach(mod => {
      addHeaderItem();
      const item = headersList.lastElementChild;
      item.querySelector('.header-target').value = mod.target;
      item.querySelector('.header-operation').value = mod.operation;
      item.querySelector('.header-name').value = mod.name;
      item.querySelector('.header-value').value = mod.value || '';
    });
  }
  
  // 填充重定向URL
  if (rule.type === 'redirect') {
    document.getElementById('redirect-url').value = rule.redirectUrl || '';
  }
  
  // 填充Mock Response配置
  if (rule.type === 'mockResponse') {
    document.getElementById('content-type').value = rule.contentType || 'application/json';
    document.getElementById('response-body').value = rule.responseBody || '';
  }
  
  // 填充资源类型
  document.querySelectorAll('input[name="resourceType"]').forEach(cb => {
    cb.checked = rule.resourceTypes && rule.resourceTypes.includes(cb.value);
  });
  
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
  
  const rule = {
    name: document.getElementById('rule-name').value.trim(),
    urlPattern: document.getElementById('url-pattern').value.trim(),
    type: document.getElementById('rule-type').value,
    priority: parseInt(document.getElementById('priority').value) || 1
  };
  
  // 收集Header配置
  if (rule.type === 'modifyHeaders') {
    const headerItems = headersList.querySelectorAll('.header-item');
    rule.headerModifications = Array.from(headerItems).map(item => ({
      target: item.querySelector('.header-target').value,
      operation: item.querySelector('.header-operation').value,
      name: item.querySelector('.header-name').value.trim(),
      value: item.querySelector('.header-value').value.trim()
    })).filter(h => h.name);
    
    if (rule.headerModifications.length === 0) {
      showToast('请至少添加一个Header配置', true);
      return;
    }
  }
  
  // 收集重定向URL
  if (rule.type === 'redirect') {
    rule.redirectUrl = document.getElementById('redirect-url').value.trim();
    if (!rule.redirectUrl) {
      showToast('请输入重定向URL', true);
      return;
    }
  }
  
  // 收集Mock Response配置
  if (rule.type === 'mockResponse') {
    rule.contentType = document.getElementById('content-type').value;
    rule.responseBody = document.getElementById('response-body').value;
    if (!rule.responseBody) {
      showToast('请输入响应内容', true);
      return;
    }
  }
  
  // 收集资源类型
  const resourceTypeCheckboxes = document.querySelectorAll('input[name="resourceType"]:checked');
  if (resourceTypeCheckboxes.length > 0) {
    rule.resourceTypes = Array.from(resourceTypeCheckboxes).map(cb => cb.value);
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
  headersList.innerHTML = '';
  document.getElementById('rule-type').value = 'mockResponse';
  document.getElementById('response-body').value = '';
  // 清空资源类型复选框
  document.querySelectorAll('input[name="resourceType"]').forEach(cb => {
    cb.checked = false;
  });
  handleRuleTypeChange();
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

// 应用规则到当前页面
async function handleApplyRules() {
  try {
    // 获取当前活动标签页
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab || !tab.id) {
      showToast('无法获取当前标签页', true);
      return;
    }
    
    // 检查是否是受限页面
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      showToast('无法在Chrome内部页面应用规则', true);
      return;
    }
    
    // 向标签页发送重载规则的消息
    chrome.tabs.sendMessage(tab.id, { type: 'RELOAD_RULES' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('发送消息失败:', chrome.runtime.lastError.message);
        showToast('应用失败,请刷新页面后重试', true);
      } else if (response && response.success) {
        showToast(`✅ 规则已应用! (${response.rulesCount} 条规则)`);
        console.log('[Request Interceptor Pro] 规则已成功应用到当前页面');
      } else {
        showToast('应用失败,请刷新页面后重试', true);
      }
    });
  } catch (error) {
    console.error('应用规则失败:', error);
    showToast('应用失败: ' + error.message, true);
  }
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
            <span class="log-type ${log.ruleType}">${getRuleTypeLabel(log.ruleType)}</span>
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
