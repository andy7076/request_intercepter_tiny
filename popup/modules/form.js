/**
 * 表单处理模块
 * 管理规则表单的提交、重置和脏检查
 */

// 处理表单提交
async function handleFormSubmit(e) {
  e.preventDefault();

  const { sendMessage } = window.App.utils;
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const editingRuleId = window.App.rules.getEditingRuleId();

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
  window.App.rules.loadRules();
  window.App.tabs.switchTab('rules');
}

// 重置表单
function resetForm() {
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const ruleForm = document.getElementById('rule-form');
  const { hideInputError } = window.App.validation;

  window.App.rules.setEditingRuleId(null);
  window.App.rules.setCurrentEditingRuleData(null);
  ruleForm.reset();
  document.getElementById('response-body').value = '';

  // 清空 CodeMirror 编辑器
  if (formCodeMirror) {
    formCodeMirror.setValue('');
  }

  // 恢复 Tab UI
  const addTabBtn = document.querySelector('.tab-btn[data-tab="add"]');
  if (addTabBtn) {
    const iconContainer = addTabBtn.querySelector('span:nth-child(1)');
    iconContainer.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    addTabBtn.querySelector('span:nth-child(2)').textContent = window.i18n.t('tabAddRule');
    addTabBtn.querySelector('span:nth-child(2)').setAttribute('data-i18n', 'tabAddRule');
  }

  // 重置验证状态
  const inputs = document.querySelectorAll('#rule-form input[required]');
  inputs.forEach(input => {
    input.setCustomValidity('');
    hideInputError(input);
  });

  // 重置 JSON 验证状态
  window.App.editor.validateJsonRealtime();
}

// 检查表单是否有修改
function checkFormDirty() {
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const editingRuleId = window.App.rules.getEditingRuleId();
  const currentEditingRuleData = window.App.rules.getCurrentEditingRuleData();

  const currentName = document.getElementById('rule-name').value.trim();
  const currentUrl = document.getElementById('url-pattern').value.trim();
  const currentResponse = formCodeMirror ? formCodeMirror.getValue() : document.getElementById('response-body').value;

  if (editingRuleId && currentEditingRuleData) {
    const isNameChanged = currentName !== currentEditingRuleData.name;
    const isUrlChanged = currentUrl !== currentEditingRuleData.urlPattern;
    const isResponseChanged = currentResponse !== (currentEditingRuleData.responseBody || '');
    return isNameChanged || isUrlChanged || isResponseChanged;
  } else {
    return currentName !== '' || currentUrl !== '' || currentResponse !== '';
  }
}

// 导出到全局
window.App = window.App || {};
window.App.form = {
  handleFormSubmit,
  resetForm,
  checkFormDirty
};
