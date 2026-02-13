/**
 * Request Interceptor Tiny - 主入口
 * 
 * 模块加载顺序（在 popup.html 中按此顺序引入）：
 * 1. modules/utils.js      - 工具函数（无依赖）
 * 2. modules/toast.js      - Toast/Alert 通知（无依赖）
 * 3. modules/theme.js      - 主题管理（无依赖，包含早期初始化）
 * 4. modules/tooltip.js    - 全局悬浮提示（无依赖）
 * 5. modules/validation.js - 表单验证（无依赖）
 * 6. modules/tabs.js       - Tab 切换（依赖 editor）
 * 7. modules/editor.js     - CodeMirror 编辑器（依赖 utils, rules）
 * 8. modules/rules.js      - 规则管理（依赖 utils, editor, form, tabs）
 * 9. modules/form.js       - 表单处理（依赖 utils, editor, rules, tabs, validation）
 * 10. modules/logs.js      - 日志管理（依赖 utils）
 * 11. modules/curl.js      - cURL 导入（依赖 utils, editor, validation）
 * 12. popup.js             - 主入口（协调所有模块）
 */

// Update platform-specific keyboard shortcut hints
function updatePlatformShortcutHints() {
  const isMac = /Mac/.test(navigator.platform);
  const modalSearchKbd = document.getElementById('modal-search-kbd');
  if (modalSearchKbd) {
    modalSearchKbd.textContent = isMac ? '⌘+F' : 'Ctrl+F';
  }
}

// Update CodeMirror placeholders after language change
function updateCodeMirrorPlaceholders() {
  // Placeholder removed - no longer needed
}

// Check if running in full tab mode and hide button
function checkViewMode() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('type') === 'tab') {
    const openInTabBtn = document.getElementById('open-in-tab-btn');
    if (openInTabBtn) {
      openInTabBtn.style.display = 'none';
      document.body.classList.add('full-tab-view');
    }
  }
}

// Initialize language selector
function initLanguageSelector() {
  const languageSelect = document.getElementById('setting-language');
  if (languageSelect && window.i18n) {
    languageSelect.value = window.i18n.getCurrentLanguage();
    languageSelect.addEventListener('change', async (e) => {
      await window.i18n.setLanguage(e.target.value);
      window.App.rules.loadRules();
      window.App.logs.loadLogs();
      window.App.editor.validateJsonRealtime();
      document.querySelectorAll('#rule-form input[required]').forEach(input => input.setCustomValidity(''));
      updatePlatformShortcutHints();
      updateCodeMirrorPlaceholders();
    });
  }
}

// 设置事件监听
function setupEventListeners() {
  const { switchTab } = window.App.tabs;
  const { resetForm, checkFormDirty, handleFormSubmit } = window.App.form;
  const { loadRules, handleExport, handleImport, handleSearchInput, clearSearch,
          handleClearRules, handleDisableRules,
          getEditingRuleId, getCurrentEditingRuleData } = window.App.rules;
  const { handleClearLogs } = window.App.logs;
  const { openEditorModal, closeEditorModal, handleModalSave, getModalEditorSearch,
          validateJsonRealtime, getFormCodeMirror } = window.App.editor;
  const { applyTheme } = window.App.theme;

  const tabBtns = document.querySelectorAll('.tab-btn');
  const ruleForm = document.getElementById('rule-form');
  const cancelBtn = document.getElementById('cancel-btn');
  const resetBtn = document.getElementById('reset-btn');
  const importBtn = document.getElementById('import-btn');
  const exportBtn = document.getElementById('export-btn');
  const importFile = document.getElementById('import-file');
  const clearLogsBtn = document.getElementById('clear-logs-btn');
  const clearRulesBtn = document.getElementById('clear-rules-btn');
  const disableRulesBtn = document.getElementById('disable-rules-btn');
  const rulesSearchInput = document.getElementById('rules-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const responseBody = document.getElementById('response-body');
  const modalTextarea = document.getElementById('modal-textarea');
  const expandEditor = document.getElementById('expand-editor');
  const editorModal = document.getElementById('editor-modal');
  const modalClose = document.getElementById('modal-close');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsModal = document.getElementById('settings-modal');
  const settingsClose = document.getElementById('settings-close');
  const settingConsoleLog = document.getElementById('setting-console-log');

  // Tab 切换
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      const currentActiveBtn = document.querySelector('.tab-btn.active');
      const currentTab = currentActiveBtn ? currentActiveBtn.dataset.tab : 'rules';
      if (targetTab === currentTab) return;

      if (currentTab === 'add') {
        const isDirty = checkFormDirty();
        if (isDirty) {
          if (!confirm(window.i18n.t('confirmDiscardChanges'))) return;
        }
        resetForm();
      }
      switchTab(targetTab);
    });
  });

  // 表单提交
  ruleForm.addEventListener('submit', handleFormSubmit);

  // 取消按钮
  cancelBtn.addEventListener('click', () => { resetForm(); switchTab('rules'); });

  // 重置按钮
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const editingRuleId = getEditingRuleId();
      const currentEditingRuleData = getCurrentEditingRuleData();
      if (editingRuleId && currentEditingRuleData) {
        document.getElementById('rule-name').value = currentEditingRuleData.name;
        document.getElementById('url-pattern').value = currentEditingRuleData.urlPattern;
        document.getElementById('response-body').value = currentEditingRuleData.responseBody || '';
        const formCM = getFormCodeMirror();
        if (formCM) { formCM.setValue(currentEditingRuleData.responseBody || ''); }
        validateJsonRealtime();
        showToast(window.i18n.t('resetDone'));
      } else {
        resetForm();
        showToast(window.i18n.t('resetDone'));
      }
    });
  }

  // 导入导出
  importBtn.addEventListener('click', () => importFile.click());
  exportBtn.addEventListener('click', handleExport);
  importFile.addEventListener('change', handleImport);

  // 清空日志
  clearLogsBtn.addEventListener('click', handleClearLogs);

  // 清空规则
  if (clearRulesBtn) { clearRulesBtn.addEventListener('click', handleClearRules); }
  if (disableRulesBtn) { disableRulesBtn.addEventListener('click', handleDisableRules); }

  // 搜索
  if (rulesSearchInput) {
    rulesSearchInput.addEventListener('input', handleSearchInput);
    rulesSearchInput.addEventListener('keydown', (e) => { if (e.key === 'Escape') { clearSearch(); } });
  }
  if (clearSearchBtn) { clearSearchBtn.addEventListener('click', clearSearch); }

  // JSON 实时验证（回退）
  responseBody.addEventListener('input', validateJsonRealtime);
  modalTextarea.addEventListener('input', () => {
    const modalCM = window.App.editor.getModalCodeMirror();
    if (!modalCM) {
      responseBody.value = modalTextarea.value;
      const formCM = getFormCodeMirror();
      if (formCM) { formCM.setValue(modalTextarea.value); }
    }
    validateJsonRealtime();
  });

  // Tab 键缩进（回退）
  const handleTabKey = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = e.target.selectionStart;
      const end = e.target.selectionEnd;
      e.target.value = e.target.value.substring(0, start) + '  ' + e.target.value.substring(end);
      e.target.selectionStart = e.target.selectionEnd = start + 2;
      e.target.dispatchEvent(new Event('input'));
    }
  };
  responseBody.addEventListener('keydown', handleTabKey);
  modalTextarea.addEventListener('keydown', handleTabKey);

  // 放大编辑器
  expandEditor.addEventListener('click', () => openEditorModal('form'));

  // 模态框搜索按钮
  const modalSearchBtn = document.getElementById('modal-search-btn');
  if (modalSearchBtn) {
    modalSearchBtn.addEventListener('click', () => {
      const modalES = getModalEditorSearch();
      if (modalES) modalES.togglePanel();
    });
  }

  modalClose.addEventListener('click', closeEditorModal);
  if (modalSaveBtn) { modalSaveBtn.addEventListener('click', handleModalSave); }

  // ESC 关闭编辑器模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editorModal.classList.contains('active')) { closeEditorModal(); }
  });

  // 在新标签页打开
  const openInTabBtn = document.getElementById('open-in-tab-btn');
  if (openInTabBtn) {
    openInTabBtn.addEventListener('click', () => {
      const currentActiveBtn = document.querySelector('.tab-btn.active');
      const currentTab = currentActiveBtn ? currentActiveBtn.dataset.tab : 'rules';
      if (currentTab === 'add' && checkFormDirty()) {
        if (!confirm(window.i18n.t('confirmDiscardChanges'))) return;
      }
      chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html?type=tab') });
      window.close();
    });
  }

  // Settings Modal
  if (settingsBtn) { settingsBtn.addEventListener('click', () => { settingsModal.classList.add('active'); }); }
  if (settingsClose) {
    settingsClose.addEventListener('click', () => {
      settingsModal.classList.remove('active');
      if (document.activeElement === settingsBtn) { settingsBtn.blur(); }
    });
  }
  if (settingsModal) {
    settingsModal.addEventListener('click', (e) => { if (e.target === settingsModal) { settingsModal.classList.remove('active'); } });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && settingsModal.classList.contains('active')) {
        settingsModal.classList.remove('active');
        if (document.activeElement) { document.activeElement.blur(); }
      }
    });
  }

  // Console Log Toggle
  if (settingConsoleLog) {
    settingConsoleLog.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      chrome.storage.local.set({ consoleLogs: enabled }, () => {
        showToast(enabled ? window.i18n.t('consoleLogsEnabled') : window.i18n.t('consoleLogsDisabled'));
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'CONSOLE_LOGS_UPDATED', enabled }).catch(() => {});
          }
        });
      });
    });
  }

  // Theme Select
  const themeSelect = document.getElementById('setting-theme');
  if (themeSelect) {
    themeSelect.addEventListener('change', (e) => {
      const newPref = e.target.value;
      chrome.storage.local.set({ theme: newPref });
      applyTheme(newPref, true);
    });
  }
}

// ==================== 应用初始化 ====================

document.addEventListener('DOMContentLoaded', async () => {
  // 1. 初始化 i18n
  if (window.i18n && window.i18n.init) {
    await window.i18n.init();
  }

  // 2. 更新平台特定提示
  updatePlatformShortcutHints();

  // 3. 加载数据
  window.App.rules.loadRules();
  window.App.logs.loadLogs();
  window.App.settings.loadSettings();

  // 4. 设置 UI
  setupEventListeners();
  window.App.tooltip.initGlobalTooltip();
  initLanguageSelector();
  window.App.editor.initCodeMirrorEditors();
  window.App.validation.setupFormValidation();
  window.App.logs.initDiffModal();
  checkViewMode();

  // 5. 延迟初始化 cURL 导入
  setTimeout(() => { window.App.curl.initCurlImport(); }, 100);
});
