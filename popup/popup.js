// DOM元素
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');
const rulesList = document.getElementById('rules-list');
const ruleCount = document.getElementById('rules-count-text');
const ruleForm = document.getElementById('rule-form');
const resetBtn = document.getElementById('reset-btn');
const cancelBtn = document.getElementById('cancel-btn');
const importBtn = document.getElementById('import-btn');
const exportBtn = document.getElementById('export-btn');
const importFile = document.getElementById('import-file');
const logsList = document.getElementById('logs-list');
const logCount = document.getElementById('logs-count-text');
const clearLogsBtn = document.getElementById('clear-logs-btn');
const clearRulesBtn = document.getElementById('clear-rules-btn');
const disableRulesBtn = document.getElementById('disable-rules-btn');
const rulesSearchInput = document.getElementById('rules-search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');

// 搜索状态
let searchQuery = '';
let allRules = []; // 缓存所有规则用于搜索

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

// CodeMirror 编辑器实例
let formCodeMirror = null;
let modalCodeMirror = null;

let editingRuleId = null;
let currentEditingRuleData = null; // Store original data for restore

// Settings elements
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsClose = document.getElementById('settings-close');
const settingConsoleLog = document.getElementById('setting-console-log');

// Init
document.addEventListener('DOMContentLoaded', async () => {
  // Initialize i18n first
  if (window.i18n && window.i18n.init) {
    await window.i18n.init();
  }
  
  loadRules();
  loadLogs();
  loadSettings();
  setupEventListeners();
  initGlobalTooltip();
  initLanguageSelector();
  initCodeMirrorEditors(); // 初始化 CodeMirror 编辑器
  checkViewMode();
});

// Check if running in full tab mode and hide button
function checkViewMode() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('type') === 'tab') {
    const openInTabBtn = document.getElementById('open-in-tab-btn');
    if (openInTabBtn) {
      openInTabBtn.style.display = 'none';
      
      // Add a class to body for specific tab styling if needed
      document.body.classList.add('full-tab-view');
    }
  }
}

// Initialize language selector
function initLanguageSelector() {
  const languageSelect = document.getElementById('setting-language');
  if (languageSelect && window.i18n) {
    // Set current language
    languageSelect.value = window.i18n.getCurrentLanguage();
    
    // Handle language change
    languageSelect.addEventListener('change', async (e) => {
      await window.i18n.setLanguage(e.target.value);
      // Reload rules list to apply translations to dynamically generated content
      loadRules();
      loadLogs();
    });
  }
}

// 初始化 CodeMirror 编辑器
function initCodeMirrorEditors() {
  // 检查 CodeMirror 是否加载成功
  if (typeof CodeMirror === 'undefined') {
    console.warn('[Request Interceptor Tiny]', 'CodeMirror not loaded, falling back to textarea');
    return;
  }

  // CodeMirror 通用配置
  const commonConfig = {
    mode: { name: 'javascript', json: true },
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: {
      'Tab': (cm) => {
        cm.replaceSelection('  ', 'end');
      }
    }
  };

  // 初始化表单内的 CodeMirror 编辑器
  initFormCodeMirror(commonConfig);
}

// 初始化表单内的 CodeMirror
function initFormCodeMirror(config) {
  const textarea = document.getElementById('response-body');
  if (!textarea || formCodeMirror) return;

  // 创建包装容器
  const wrapper = document.createElement('div');
  wrapper.className = 'codemirror-wrapper';
  textarea.parentNode.insertBefore(wrapper, textarea);
  
  // 隐藏原始 textarea
  textarea.classList.add('cm-hidden');
  
  // 初始化 CodeMirror
  formCodeMirror = CodeMirror(wrapper, {
    ...config,
    value: textarea.value || '',
    placeholder: textarea.placeholder
  });

  // 同步内容到隐藏的 textarea
  formCodeMirror.on('change', (cm) => {
    textarea.value = cm.getValue();
    validateJsonRealtime();
  });
}

// 初始化全屏模态框的 CodeMirror
function initModalCodeMirror() {
  if (typeof CodeMirror === 'undefined') return null;

  const modalContent = document.getElementById('editor-modal-content');
  const modalTextarea = document.getElementById('modal-textarea');
  if (!modalContent || !modalTextarea) return null;

  // 创建包装容器
  const wrapper = document.createElement('div');
  wrapper.className = 'codemirror-wrapper';
  wrapper.id = 'modal-codemirror-wrapper';
  
  // 将包装容器插入到搜索组件之后、textarea 之前
  modalContent.insertBefore(wrapper, modalTextarea);
  
  // 隐藏原始 textarea
  modalTextarea.classList.add('cm-hidden');

  // 初始化 CodeMirror
  const cm = CodeMirror(wrapper, {
    mode: { name: 'javascript', json: true },
    lineNumbers: true,
    lineWrapping: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    foldGutter: true,
    gutters: ['CodeMirror-linenumbers', 'CodeMirror-foldgutter'],
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    value: '',
    extraKeys: {
      'Tab': (cm) => {
        cm.replaceSelection('  ', 'end');
      },
      'Ctrl-F': () => {
        // 打开搜索替换
        if (editorSearchReplace) {
          editorSearchReplace.show();
        }
      },
      'Cmd-F': () => {
        // Mac 支持
        if (editorSearchReplace) {
          editorSearchReplace.show();
        }
      }
    }
  });

  // 同步内容到隐藏的 textarea 和表单
  cm.on('change', (editor) => {
    const value = editor.getValue();
    modalTextarea.value = value;
    
    // 同步到表单编辑器
    const responseBody = document.getElementById('response-body');
    if (responseBody) {
      responseBody.value = value;
    }
    
    // 同步到表单的 CodeMirror
    if (formCodeMirror && formCodeMirror.getValue() !== value) {
      formCodeMirror.setValue(value);
    }
    
    validateJsonRealtime();
  });

  return cm;
}

// 初始化全局悬浮提示
function initGlobalTooltip() {
  // 创建提示元素
  let tooltip = document.getElementById('global-tooltip');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.id = 'global-tooltip';
    tooltip.className = 'global-tooltip';
    document.body.appendChild(tooltip);
  }

  // 事件委托处理鼠标悬停
  document.body.addEventListener('mouseover', (e) => {
    // 查找最近的带有 title 或 data-tooltip 的目标元素
    // 同时必须是指定的按钮类型
    const target = e.target.closest('.btn-icon, .btn-icon-small, .btn-open-tab, .rule-toggle');
    
    if (!target) return;

    // 处理 title 属性（防止原生提示并获取内容）
    let text = target.getAttribute('data-tooltip');
    if (!text && target.hasAttribute('title')) {
      text = target.getAttribute('title');
      target.setAttribute('data-tooltip', text);
      target.removeAttribute('title');
    }

    if (text) {
      const rect = target.getBoundingClientRect();
      
      tooltip.textContent = text;
      
      // Determine position (default top, switch to bottom if too close to top edge)
      const spaceAbove = rect.top;
      const isTooCloseToTop = spaceAbove < 40; // Threshold for switching direction
      
      if (isTooCloseToTop) {
        tooltip.classList.add('bottom');
        // Position below
        const left = rect.left + rect.width / 2;
        const top = rect.bottom;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      } else {
        tooltip.classList.remove('bottom');
        // Position above
        const left = rect.left + rect.width / 2;
        const top = rect.top;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
      }
      
      tooltip.classList.add('visible');
    }
  });

  // 鼠标移出时隐藏
  document.body.addEventListener('mouseout', (e) => {
    const target = e.target.closest('.btn-icon, .btn-icon-small, .btn-open-tab, .rule-toggle');
    if (target) {
      tooltip.classList.remove('visible');
    }
  });
  
  // 滚动时隐藏，防止位置错乱
  document.addEventListener('scroll', () => {
    tooltip.classList.remove('visible');
  }, true);
}

// 设置事件监听
function setupEventListeners() {
  // Tab切换
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      
      // 获取当前激活的 Tab
      const currentActiveBtn = document.querySelector('.tab-btn.active');
      const currentTab = currentActiveBtn ? currentActiveBtn.dataset.tab : 'rules';

      // 如果点击的是当前 Tab，不做任何操作
      if (targetTab === currentTab) return;

      // 如果当前是在"添加/编辑"页面，检查是否有未保存的修改
      if (currentTab === 'add') {
        const isDirty = checkFormDirty();
        
        if (isDirty) {
          // 有修改，弹出确认
          if (!confirm(window.i18n.t('confirmDiscardChanges'))) {
            // 用户选择取消，停留在当前页面
            return;
          }
        }
        
        // 用户确认放弃，或者没有修改 -> 重置表单
        resetForm();
      }
      
      // 切换到目标 Tab
      switchTab(targetTab);
    });
  });

  // 表单提交
  ruleForm.addEventListener('submit', handleFormSubmit);

  // 取消按钮
  cancelBtn.addEventListener('click', () => {
    resetForm();
    switchTab('rules');
  });

  // 重置按钮
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // 智能重置：如果是编辑模式，恢复原值；如果是新建模式，清空
      if (editingRuleId && currentEditingRuleData) {
        document.getElementById('rule-name').value = currentEditingRuleData.name;
        document.getElementById('url-pattern').value = currentEditingRuleData.urlPattern;
        document.getElementById('response-body').value = currentEditingRuleData.responseBody || '';
        // 同步到 CodeMirror 编辑器
        if (formCodeMirror) {
          formCodeMirror.setValue(currentEditingRuleData.responseBody || '');
        }
        validateJsonRealtime();
        showToast(window.i18n.t('resetDone'));
      } else {
        resetForm();
        showToast(window.i18n.t('resetDone'));
      }
    });
  }
  
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

  // 关闭所有规则按钮
  if (disableRulesBtn) {
    disableRulesBtn.addEventListener('click', handleDisableRules);
  }
  
  // 搜索功能
  if (rulesSearchInput) {
    rulesSearchInput.addEventListener('input', handleSearchInput);
    rulesSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        clearSearch();
      }
    });
  }
  
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', clearSearch);
  }
  
  // JSON 实时验证（CodeMirror 有自己的 change 事件处理，这里作为回退）
  responseBody.addEventListener('input', validateJsonRealtime);
  modalTextarea.addEventListener('input', () => {
    // 同步到主输入框并验证（如果没有使用 CodeMirror）
    if (!modalCodeMirror) {
      responseBody.value = modalTextarea.value;
      if (formCodeMirror) {
        formCodeMirror.setValue(modalTextarea.value);
      }
    }
    validateJsonRealtime();
  });
  
  // 处理 Tab 键输入缩进（CodeMirror 有自己的 Tab 处理，这里作为回退）
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
      // 检查是否有未保存的修改
      const currentActiveBtn = document.querySelector('.tab-btn.active');
      const currentTab = currentActiveBtn ? currentActiveBtn.dataset.tab : 'rules';
      
      if (currentTab === 'add' && checkFormDirty()) {
        if (!confirm(window.i18n.t('confirmDiscardChanges'))) {
          return;
        }
      }

      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?type=tab') });
      window.close(); // Close the popup
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
        showToast(enabled ? window.i18n.t('consoleLogsEnabled') : window.i18n.t('consoleLogsDisabled'));
        
        // Directly notify the content script in the active tab to ensure immediate update
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'CONSOLE_LOGS_UPDATED',
              enabled: enabled
            }).catch(() => {
              // Ignore errors (e.g., if content script context is invalid or script not present)
            });
          }
        });
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
  
  // 优先从 CodeMirror 获取内容
  const value = (formCodeMirror ? formCodeMirror.getValue() : responseBody.value).trim();
  
  if (!value) {
    // 空内容时重置为默认状态
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator';
      text.className = 'hint';
      text.textContent = window.i18n.t('responseContentHint');
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
        text.textContent = window.i18n.t('needJsonObjectOrArray');
      });
      return false;
    }
    
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator valid';
      text.className = 'hint valid';
      text.textContent = window.i18n.t('jsonValid');
    });
    return true;
  } catch (err) {
    // 提取错误位置信息
    const match = err.message.match(/position (\d+)/);
    const errorMsg = match ? window.i18n.t('jsonErrorAtPosition', match[1]) : window.i18n.t('jsonError');
    
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
  // 获取当前表单内容
  const currentValue = formCodeMirror ? formCodeMirror.getValue() : responseBody.value;
  
  // 初始化模态框的 CodeMirror（如果还没有初始化）
  if (!modalCodeMirror) {
    modalCodeMirror = initModalCodeMirror();
  }
  
  // 设置模态框编辑器内容
  if (modalCodeMirror) {
    modalCodeMirror.setValue(currentValue);
    editorModal.classList.add('active');
    // 延迟刷新和聚焦，确保模态框显示后再操作
    setTimeout(() => {
      modalCodeMirror.refresh();
      modalCodeMirror.focus();
    }, 100);
  } else {
    // 回退到 textarea 方式
    modalTextarea.value = currentValue;
    editorModal.classList.add('active');
    modalTextarea.focus();
  }
  
  // 初始化搜索替换功能（如果使用 textarea）
  if (!modalCodeMirror && !editorSearchReplace && window.EditorSearchReplace) {
    editorSearchReplace = new EditorSearchReplace('modal-textarea', 'editor-modal-content');
  }
}

// 关闭全屏编辑器
function closeEditorModal() {
  // 先隐藏搜索替换组件（并重置内容）
  if (editorSearchReplace) {
    editorSearchReplace.hide();
  }
  
  // 获取模态框编辑器内容
  const modalValue = modalCodeMirror ? modalCodeMirror.getValue() : modalTextarea.value;
  
  // 同步内容回表单编辑器
  if (formCodeMirror) {
    formCodeMirror.setValue(modalValue);
  }
  responseBody.value = modalValue;
  
  editorModal.classList.remove('active');
  
  // 验证 JSON 格式
  validateJsonRealtime();
}

// 加载规则列表
async function loadRules() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  allRules = rules; // 缓存规则
  filterAndRenderRules();
}

// 根据搜索过滤并渲染规则
function filterAndRenderRules() {
  if (!searchQuery) {
    renderRules(allRules);
    return;
  }
  
  const query = searchQuery.toLowerCase();
  const filteredRules = allRules.filter(rule => {
    const nameMatch = rule.name.toLowerCase().includes(query);
    const urlMatch = rule.urlPattern.toLowerCase().includes(query);
    return nameMatch || urlMatch;
  });
  
  renderRules(filteredRules, searchQuery);
}

// 处理搜索输入
function handleSearchInput(e) {
  searchQuery = e.target.value.trim();
  
  // 显示/隐藏清除按钮
  if (clearSearchBtn) {
    clearSearchBtn.classList.toggle('visible', searchQuery.length > 0);
  }
  
  filterAndRenderRules();
}

// 清除搜索
function clearSearch() {
  searchQuery = '';
  if (rulesSearchInput) {
    rulesSearchInput.value = '';
  }
  if (clearSearchBtn) {
    clearSearchBtn.classList.remove('visible');
  }
  filterAndRenderRules();
}

// 渲染规则列表
function renderRules(rules, highlightQuery = '') {
  ruleCount.textContent = window.i18n.t('rulesCount', rules.length);
  
  
  if (rules.length === 0) {
    // 区分是搜索无结果还是真的没有规则
    if (highlightQuery && allRules.length > 0) {
      rulesList.innerHTML = `
        <div class="no-search-results">
          <span class="empty-icon">🔍</span>
          <p>${window.i18n.t('noSearchResults')}</p>
          <p>${window.i18n.t('searchFor')} <span class="search-query">"${escapeHtml(highlightQuery)}"</span></p>
        </div>
      `;
    } else {
      rulesList.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">📂</span>
          <p>${window.i18n.t('noRulesYet')}</p>
          <p class="hint">${window.i18n.t('noRulesAdvancedHint')}</p>
        </div>
      `;
    }
    return;
  }
  
  rulesList.innerHTML = rules.map(rule => `
    <div class="rule-card ${rule.enabled ? '' : 'disabled'}" data-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-toggle ${rule.enabled ? 'active' : ''}" data-id="${rule.id}"></div>
        <span class="rule-name">${highlightText(escapeHtml(rule.name), highlightQuery)}</span>
        <button class="btn-icon-small btn-export-icon" data-id="${rule.id}" title="${window.i18n.t('exportRule')}">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
            <polyline points="16 6 12 2 8 6"></polyline>
            <line x1="12" y1="2" x2="12" y2="15"></line>
          </svg>
        </button>
      </div>
      <div class="rule-url">${highlightText(escapeHtml(rule.urlPattern), highlightQuery)}</div>
      ${renderRuleDetails(rule)}
      <div class="rule-actions">
        <button class="btn-edit" data-id="${rule.id}">${window.i18n.t('edit')}</button>
        <button class="btn-delete" data-id="${rule.id}">${window.i18n.t('delete')}</button>
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
  
  // 初始化 renderjson 渲染每个规则的 JSON
  rules.forEach(rule => {
    if (rule.responseBody) {
      initRenderjson(rule);
    }
  });
}

// 渲染规则详情
function renderRuleDetails(rule) {
  if (rule.responseBody) {
    return `
      <div class="rule-details response-preview" data-rule-id="${rule.id}">
        <div class="response-header">
          <span class="content-type-label">application/json</span>
        </div>
        <div class="response-content" data-content-id="${rule.id}">
          <div class="renderjson-container" data-json-id="${rule.id}"></div>
        </div>
      </div>
    `;
  }
  
  return '';
}

// 初始化 renderjson 渲染
function initRenderjson(rule) {
  const container = document.querySelector(`.renderjson-container[data-json-id="${rule.id}"]`);
  if (!container) return;
  
  try {
    const jsonData = JSON.parse(rule.responseBody);
    // 配置 renderjson
    renderjson.set_show_to_level(1); // 默认展开第一层
    renderjson.set_max_string_length(100); // 长字符串截断
    renderjson.set_sort_objects(false);
    
    const rendered = renderjson(jsonData);
    container.appendChild(rendered);
  } catch (e) {
    // JSON 解析失败，显示纯文本
    container.innerHTML = `<pre class="json-error-fallback">${escapeHtml(rule.responseBody)}</pre>`;
  }
}



// 处理开关切换
async function handleToggle(ruleId) {
  await sendMessage({ type: 'TOGGLE_RULE', ruleId });
  loadRules();
  showToast(window.i18n.t('ruleStatusUpdated'));
}

// 处理编辑
async function handleEdit(ruleId) {
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  
  if (!rule) return;
  
  editingRuleId = ruleId;
  currentEditingRuleData = JSON.parse(JSON.stringify(rule)); // Deep copy
  
  // 填充表单
  document.getElementById('rule-name').value = rule.name;
  document.getElementById('url-pattern').value = rule.urlPattern;
  document.getElementById('response-body').value = rule.responseBody || '';
  
  // 同步到 CodeMirror 编辑器
  if (formCodeMirror) {
    formCodeMirror.setValue(rule.responseBody || '');
  }
  
  // 更新 Tab UI
  const addTabBtn = document.querySelector('.tab-btn[data-tab="add"]');
  if (addTabBtn) {
    // 更改图标和文本
    addTabBtn.querySelector('span:nth-child(1)').textContent = '✏️';
    addTabBtn.querySelector('span:nth-child(2)').textContent = window.i18n.t('tabEditRule');
  }
  
  // 验证 JSON 格式
  validateJsonRealtime();
  
  switchTab('add');
}

// 处理删除
async function handleDelete(ruleId) {
  if (!confirm(window.i18n.t('confirmDeleteRule'))) return;
  
  // 如果正在编辑这条规则，先重置表单
  if (editingRuleId === ruleId) {
    resetForm();
    switchTab('rules');
  }
  
  await sendMessage({ type: 'DELETE_RULE', ruleId });
  loadRules();
  showToast(window.i18n.t('ruleDeleted'));
}

// 处理表单提交
async function handleFormSubmit(e) {
  e.preventDefault();
  
  // 优先从 CodeMirror 获取内容
  const responseBodyValue = formCodeMirror ? formCodeMirror.getValue() : document.getElementById('response-body').value;
  
  // 验证 JSON 格式（必须是对象或数组）
  try {
    const parsed = JSON.parse(responseBodyValue);
    if (typeof parsed !== 'object' || parsed === null) {
      showToast(window.i18n.t('needJsonObjectOrArray'), true);
      return;
    }
  } catch (err) {
    showToast(window.i18n.t('pleaseEnterValidJson'), true);
    return;
  }
  
  const rule = {
    name: document.getElementById('rule-name').value.trim(),
    urlPattern: document.getElementById('url-pattern').value.trim(),
    type: 'mockResponse',
    contentType: 'application/json',
    responseBody: responseBodyValue
  };
  
  if (!rule.responseBody) {
    showToast(window.i18n.t('pleaseEnterResponseContent'), true);
    return;
  }
  
  if (editingRuleId) {
    await sendMessage({ type: 'UPDATE_RULE', ruleId: editingRuleId, rule });
    showToast(window.i18n.t('ruleUpdated'));
  } else {
    await sendMessage({ type: 'ADD_RULE', rule });
    showToast(window.i18n.t('ruleAdded'));
  }
  
  resetForm();
  loadRules();
  switchTab('rules');
}

// 重置表单
function resetForm() {
  editingRuleId = null;
  currentEditingRuleData = null;
  ruleForm.reset();
  document.getElementById('response-body').value = '';
  
  // 清空 CodeMirror 编辑器
  if (formCodeMirror) {
    formCodeMirror.setValue('');
  }
  
  // 恢复 Tab UI
  const addTabBtn = document.querySelector('.tab-btn[data-tab="add"]');
  if (addTabBtn) {
    addTabBtn.querySelector('span:nth-child(1)').textContent = '➕';
    addTabBtn.querySelector('span:nth-child(2)').textContent = window.i18n.t('tabAddRule');
  }
  
  // 重置 JSON 验证状态
  validateJsonRealtime();
}

// 检查表单是否有修改
function checkFormDirty() {
  const currentName = document.getElementById('rule-name').value.trim();
  const currentUrl = document.getElementById('url-pattern').value.trim();
  // 优先从 CodeMirror 获取内容
  const currentResponse = formCodeMirror ? formCodeMirror.getValue() : document.getElementById('response-body').value;
  
  if (editingRuleId && currentEditingRuleData) {
    // 编辑模式：对比原始数据
    const isNameChanged = currentName !== currentEditingRuleData.name;
    const isUrlChanged = currentUrl !== currentEditingRuleData.urlPattern;
    const isResponseChanged = currentResponse !== (currentEditingRuleData.responseBody || '');
    
    return isNameChanged || isUrlChanged || isResponseChanged;
  } else {
    // 新建模式：检查是否有任何输入
    return currentName !== '' || currentUrl !== '' || currentResponse !== '';
  }
}

// 发送消息给background
function sendMessage(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.error('[Request Interceptor Tiny]', 'Communication failed:', chrome.runtime.lastError.message);
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
      console.error('[Request Interceptor Tiny]', 'Send message error:', e);
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

// 高亮搜索匹配文本
function highlightText(text, query) {
  if (!query) return text;
  
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<span class="highlight">$1</span>');
}


// 导出规则
async function handleExport() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  
  if (rules.length === 0) {
    showToast(window.i18n.t('noRulesToExport'), true);
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
  showToast(window.i18n.t('exportedRules', rules.length));
}

// 导出单条规则
async function handleExportRule(ruleId) {
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  
  if (!rule) {
    showToast(window.i18n.t('ruleNotExist'), true);
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
  showToast(window.i18n.t('exportedRule', rule.name));
}

// 导入规则
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    
    if (!data.rules || !Array.isArray(data.rules)) {
      throw new Error(window.i18n.t('invalidRuleFileFormat'));
    }
    
    const confirmMsg = window.i18n.t('confirmImportRules', data.rules.length);
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
    showToast(window.i18n.t('importedRules', imported));
  } catch (error) {
    console.error('[Request Interceptor Tiny]', 'Import error:', error);
    showToast(window.i18n.t('importFailed', error.message), true);
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
  logCount.textContent = window.i18n.t('recentMatchRecords', logs.length);
  
  if (logs.length === 0) {
    logsList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon">📉</span>
        <p>${window.i18n.t('noNetworkLogs')}</p>
        <p class="hint">${window.i18n.t('noNetworkLogsHint')}</p>
      </div>
    `;
    return;
  }
  
  logsList.innerHTML = logs.map(log => {
    const locale = window.i18n && window.i18n.getCurrentLanguage() === 'zh_CN' ? 'zh-CN' : 'en-US';
    const time = new Date(log.timestamp).toLocaleString(locale, {
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
  if (!confirm(window.i18n.t('confirmClearLogs'))) return;
  
  await sendMessage({ type: 'CLEAR_LOGS' });
  loadLogs();
  showToast(window.i18n.t('logsCleared'));
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
    showToast(window.i18n.t('noRulesToClear'), true);
    return;
  }
  
  if (!confirm(window.i18n.t('confirmClearAllRules'))) return;
  
  await sendMessage({ type: 'CLEAR_ALL_RULES' });
  loadRules();
  showToast(window.i18n.t('allRulesCleared'));
}

// 关闭所有规则
async function handleDisableRules() {
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) {
    showToast(window.i18n.t('noRulesAvailable'), true);
    return;
  }
  
  const hasEnabled = rules.some(r => r.enabled);
  if (!hasEnabled) {
    showToast(window.i18n.t('allRulesAlreadyDisabled'), true);
    return;
  }

  if (!confirm(window.i18n.t('confirmDisableAllRules'))) return;
  
  await sendMessage({ type: 'DISABLE_ALL_RULES' });
  loadRules();
  showToast(window.i18n.t('allRulesDisabled'));
}
