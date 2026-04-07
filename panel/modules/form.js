/**
 * 表单处理模块
 * 管理规则表单的提交、重置和脏检查
 */

const DEFAULT_RULE_METHOD = 'ALL';
const DEFAULT_MATCH_MODE = 'contains';
const DEFAULT_PRIORITY = 0;
const DEFAULT_RESPONSE_STATUS = 200;
const DEFAULT_RESPONSE_DELAY = 0;

function getAdvancedSettingsElements() {
  return {
    container: document.getElementById('advanced-settings'),
    toggle: document.getElementById('advanced-settings-toggle'),
    body: document.getElementById('advanced-settings-body'),
    summary: document.getElementById('advanced-settings-summary')
  };
}

function getResponseHeadersList() {
  return document.getElementById('response-headers-list');
}

function stringifyHeaderValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return typeof value === 'string' ? value : JSON.stringify(value);
}

function isLikelyJsonContent(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) {
    return false;
  }

  try {
    JSON.parse(trimmed);
    return true;
  } catch (err) {
    return false;
  }
}

function inferResponseContentType(responseBody, responseHeaders = {}) {
  const contentTypeHeader = Object.keys(responseHeaders || {}).find(key => key.toLowerCase() === 'content-type');
  if (contentTypeHeader) {
    return responseHeaders[contentTypeHeader];
  }

  return isLikelyJsonContent(responseBody)
    ? 'application/json'
    : 'text/plain; charset=utf-8';
}

function isHtmlLikeContentType(contentType) {
  const normalized = String(contentType || '').toLowerCase();
  return normalized.includes('text/html') || normalized.includes('application/xhtml+xml');
}

function isHtmlLikeBody(value) {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) {
    return false;
  }

  return trimmed.startsWith('<!doctype html')
    || trimmed.startsWith('<html')
    || trimmed.startsWith('<head')
    || trimmed.startsWith('<body');
}

function looksLikeNavigationUrl(urlPattern) {
  const raw = String(urlPattern || '').trim();
  if (!raw) {
    return false;
  }

  const normalized = raw.replace(/\*/g, '').replace(/[?#].*$/, '');
  if (!normalized) {
    return false;
  }

  let pathname = normalized;

  try {
    if (/^https?:\/\//i.test(normalized)) {
      pathname = new URL(normalized).pathname || '/';
    }
  } catch (err) {
    pathname = normalized;
  }

  const lowerPathname = String(pathname || '').toLowerCase();
  const segments = lowerPathname.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || '';

  if (!lastSegment) {
    return true;
  }

  if (/\.(html?|xhtml|shtml|php|asp|aspx|jsp|jspx)$/i.test(lastSegment)) {
    return true;
  }

  if (!lastSegment.includes('.') && !lowerPathname.includes('/api/') && !lowerPathname.includes('/graphql')) {
    return true;
  }

  return false;
}

function isLikelyNavigationRequestRule(formData) {
  const method = String(formData.method || DEFAULT_RULE_METHOD).toUpperCase();
  if (method !== 'GET' && method !== DEFAULT_RULE_METHOD) {
    return false;
  }

  const contentType = inferResponseContentType(formData.responseBody, formData.responseHeaders);
  const htmlLikeResponse = isHtmlLikeContentType(contentType) || isHtmlLikeBody(formData.responseBody);
  return htmlLikeResponse && looksLikeNavigationUrl(formData.urlPattern);
}

function updateNavigationRequestWarning(formData = null) {
  const warning = document.getElementById('navigation-request-warning');
  if (!warning) return;

  const snapshot = formData || getRuleFormSnapshot();
  warning.classList.toggle('hidden', !isLikelyNavigationRequestRule(snapshot));
}

function updateResponseHeaderRowI18n(row) {
  if (!row) return;

  const nameInput = row.querySelector('.response-header-name');
  const valueInput = row.querySelector('.response-header-value');
  const removeBtn = row.querySelector('.response-header-remove');

  if (nameInput) {
    nameInput.placeholder = window.i18n.t('responseHeaderNamePlaceholder');
  }
  if (valueInput) {
    valueInput.placeholder = window.i18n.t('responseHeaderValuePlaceholder');
  }
  if (removeBtn) {
    const label = window.i18n.t('removeResponseHeader');
    removeBtn.setAttribute('title', label);
    removeBtn.setAttribute('data-tooltip', label);
    removeBtn.setAttribute('aria-label', label);
  }
}

function createResponseHeaderRow(name = '', value = '') {
  const row = document.createElement('div');
  row.className = 'response-header-item';
  row.innerHTML = `
    <input type="text" class="response-header-name" />
    <input type="text" class="response-header-value" />
    <button type="button" class="response-header-remove btn-icon-small btn-delete tooltip-trigger">
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
    </button>
  `;

  row.querySelector('.response-header-name').value = name;
  row.querySelector('.response-header-value').value = value;
  updateResponseHeaderRowI18n(row);
  return row;
}

function ensureResponseHeadersEditorRow() {
  const list = getResponseHeadersList();
  if (!list) return;

  if (!list.children.length) {
    list.appendChild(createResponseHeaderRow());
  }
}

function clearResponseHeaderRows() {
  const list = getResponseHeadersList();
  if (!list) return;
  list.innerHTML = '';
}

function setResponseHeaders(responseHeaders = {}) {
  const list = getResponseHeadersList();
  if (!list) return;

  clearResponseHeaderRows();

  const entries = Object.entries(responseHeaders || {});
  if (!entries.length) {
    ensureResponseHeadersEditorRow();
    return;
  }

  entries.forEach(([name, value]) => {
    list.appendChild(createResponseHeaderRow(name, stringifyHeaderValue(value)));
  });
}

function getResponseHeadersState() {
  const list = getResponseHeadersList();
  const rows = list ? Array.from(list.querySelectorAll('.response-header-item')) : [];
  const headers = {};
  const seenNames = new Set();
  const signatureParts = [];
  let hasIncomplete = false;
  let duplicateName = '';
  let incompleteElement = null;
  let duplicateElement = null;

  rows.forEach((row) => {
    const nameInput = row.querySelector('.response-header-name');
    const valueInput = row.querySelector('.response-header-value');
    const name = nameInput.value.trim();
    const value = valueInput.value.trim();

    if (!name && !value) {
      return;
    }

    signatureParts.push(`${name}\u0000${value}`);

    if (!name || !value) {
      hasIncomplete = true;
      if (!incompleteElement) {
        incompleteElement = !name ? nameInput : valueInput;
      }
      return;
    }

    const normalizedName = name.toLowerCase();
    if (seenNames.has(normalizedName) && !duplicateName) {
      duplicateName = name;
      duplicateElement = nameInput;
      return;
    }

    seenNames.add(normalizedName);
    headers[name] = value;
  });

  return {
    headers,
    hasIncomplete,
    duplicateName,
    incompleteElement,
    duplicateElement,
    signature: signatureParts.join('\u0001')
  };
}

function getResponseHeadersSignatureFromObject(responseHeaders = {}) {
  return Object.entries(responseHeaders || {})
    .map(([name, value]) => `${name}\u0000${stringifyHeaderValue(value)}`)
    .join('\u0001');
}

function getDefaultMatchMode(matchMode, urlPattern = '') {
  if (matchMode) {
    return matchMode;
  }
  return String(urlPattern || '').includes('*') ? 'wildcard' : DEFAULT_MATCH_MODE;
}

function countNonEmptyResponseHeaders(headers = {}) {
  return Object.entries(headers || {}).filter(([name, value]) => {
    return String(name || '').trim() !== '' && String(value || '').trim() !== '';
  }).length;
}

function hasNonDefaultAdvancedSettings(formData = {}) {
  return (formData.method || DEFAULT_RULE_METHOD) !== DEFAULT_RULE_METHOD
    || (formData.matchMode || DEFAULT_MATCH_MODE) !== DEFAULT_MATCH_MODE
    || Number(formData.priority || DEFAULT_PRIORITY) !== DEFAULT_PRIORITY
    || Number(formData.responseStatus || DEFAULT_RESPONSE_STATUS) !== DEFAULT_RESPONSE_STATUS
    || Number(formData.responseDelayMs || DEFAULT_RESPONSE_DELAY) !== DEFAULT_RESPONSE_DELAY
    || countNonEmptyResponseHeaders(formData.responseHeaders) > 0;
}

function buildAdvancedSettingsSummary(formData = {}) {
  const parts = [];
  const method = formData.method || DEFAULT_RULE_METHOD;
  const matchMode = formData.matchMode || DEFAULT_MATCH_MODE;
  const priority = Number(formData.priority || DEFAULT_PRIORITY);
  const responseStatus = Number(formData.responseStatus || DEFAULT_RESPONSE_STATUS);
  const responseDelayMs = Number(formData.responseDelayMs || DEFAULT_RESPONSE_DELAY);
  const headerCount = countNonEmptyResponseHeaders(formData.responseHeaders);

  if (method !== DEFAULT_RULE_METHOD) {
    parts.push(method);
  }
  if (matchMode !== DEFAULT_MATCH_MODE) {
    parts.push(window.i18n.t(
      matchMode === 'wildcard' ? 'matchModeWildcard'
        : matchMode === 'exact' ? 'matchModeExact'
          : 'matchModeContains'
    ));
  }
  if (priority !== DEFAULT_PRIORITY) {
    parts.push(window.i18n.t('priorityShort', String(priority)));
  }
  if (responseStatus !== DEFAULT_RESPONSE_STATUS) {
    parts.push(window.i18n.t('statusShort', String(responseStatus)));
  }
  if (responseDelayMs !== DEFAULT_RESPONSE_DELAY) {
    parts.push(window.i18n.t('delayShort', String(responseDelayMs)));
  }
  if (headerCount > 0) {
    parts.push(window.i18n.t('headerCountShort', String(headerCount)));
  }

  return parts.length > 0
    ? parts.join(' · ')
    : window.i18n.t('advancedSettingsSummaryDefault');
}

function setAdvancedSettingsExpanded(expanded) {
  const { container, toggle, body } = getAdvancedSettingsElements();
  if (!container || !toggle || !body) return;

  container.classList.toggle('expanded', expanded);
  toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  body.classList.toggle('hidden', !expanded);
}

function syncAdvancedSettingsSummary(formData = null) {
  const { summary } = getAdvancedSettingsElements();
  if (!summary) return;

  const snapshot = formData || getRuleFormSnapshot();
  summary.textContent = buildAdvancedSettingsSummary(snapshot);
}

function ensureAdvancedSettingsVisible() {
  setAdvancedSettingsExpanded(true);
}

function refreshAdvancedSettingsUI({ expandIfNeeded = false } = {}) {
  const snapshot = getRuleFormSnapshot();
  syncAdvancedSettingsSummary(snapshot);

  if (expandIfNeeded && hasNonDefaultAdvancedSettings(snapshot)) {
    ensureAdvancedSettingsVisible();
  }
}

function getRuleFormSnapshot() {
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const responseHeadersState = getResponseHeadersState();

  return {
    name: document.getElementById('rule-name').value.trim(),
    urlPattern: document.getElementById('url-pattern').value.trim(),
    method: document.getElementById('rule-method').value || DEFAULT_RULE_METHOD,
    matchMode: document.getElementById('rule-match-mode').value || DEFAULT_MATCH_MODE,
    priority: Number(document.getElementById('rule-priority').value || DEFAULT_PRIORITY),
    responseStatus: Number(document.getElementById('response-status').value || DEFAULT_RESPONSE_STATUS),
    responseDelayMs: Number(document.getElementById('response-delay').value || DEFAULT_RESPONSE_DELAY),
    responseHeaders: responseHeadersState.headers,
    responseHeadersHasIncomplete: responseHeadersState.hasIncomplete,
    responseHeadersDuplicateName: responseHeadersState.duplicateName,
    responseHeadersIncompleteElement: responseHeadersState.incompleteElement,
    responseHeadersDuplicateElement: responseHeadersState.duplicateElement,
    responseHeadersSignature: responseHeadersState.signature,
    responseBody: formCodeMirror ? formCodeMirror.getValue() : document.getElementById('response-body').value
  };
}

function fillRuleForm(rule = {}) {
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const normalizedRule = {
    name: rule.name || '',
    urlPattern: rule.urlPattern || '',
    method: rule.method || DEFAULT_RULE_METHOD,
    matchMode: getDefaultMatchMode(rule.matchMode, rule.urlPattern),
    priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : DEFAULT_PRIORITY,
    responseStatus: Number.isFinite(Number(rule.responseStatus)) ? Number(rule.responseStatus) : DEFAULT_RESPONSE_STATUS,
    responseDelayMs: Number.isFinite(Number(rule.responseDelayMs)) ? Number(rule.responseDelayMs) : DEFAULT_RESPONSE_DELAY,
    responseHeaders: rule.responseHeaders || {},
    responseBody: rule.responseBody || ''
  };

  document.getElementById('rule-name').value = normalizedRule.name;
  document.getElementById('url-pattern').value = normalizedRule.urlPattern;
  document.getElementById('rule-method').value = normalizedRule.method;
  document.getElementById('rule-match-mode').value = normalizedRule.matchMode;
  document.getElementById('rule-priority').value = String(normalizedRule.priority);
  document.getElementById('response-status').value = String(normalizedRule.responseStatus);
  document.getElementById('response-delay').value = String(normalizedRule.responseDelayMs);
  setResponseHeaders(normalizedRule.responseHeaders);
  document.getElementById('response-body').value = normalizedRule.responseBody;

  setAdvancedSettingsExpanded(hasNonDefaultAdvancedSettings(normalizedRule));
  syncAdvancedSettingsSummary(normalizedRule);
  updateNavigationRequestWarning(normalizedRule);

  if (formCodeMirror) {
    formCodeMirror.setValue(normalizedRule.responseBody);
  }
}

// 处理表单提交
async function handleFormSubmit(e) {
  e.preventDefault();

  const { sendMessage } = window.App.utils;
  const { scrollFieldIntoView } = window.App.validation;
  const editingRuleId = window.App.rules.getEditingRuleId();
  const formData = getRuleFormSnapshot();
  const responseBodyValue = formData.responseBody;
  const responseBodyTrimmedValue = String(responseBodyValue || '').trim();
  const responseStatusInput = document.getElementById('response-status');
  const responseDelayInput = document.getElementById('response-delay');
  const formCodeMirror = window.App.editor.getFormCodeMirror();
  const responseBodyTarget = formCodeMirror && typeof formCodeMirror.getWrapperElement === 'function'
    ? formCodeMirror.getWrapperElement()
    : document.getElementById('response-body');

  if (!responseBodyTrimmedValue) {
    showToast(window.i18n.t('pleaseEnterResponseContent'), true);
    scrollFieldIntoView(responseBodyTarget);
    if (formCodeMirror && typeof formCodeMirror.focus === 'function') {
      requestAnimationFrame(() => {
        formCodeMirror.focus();
      });
    }
    return;
  }

  if (formData.responseHeadersHasIncomplete) {
    showToast(window.i18n.t('responseHeadersIncomplete'), true);
    ensureAdvancedSettingsVisible();
    scrollFieldIntoView(formData.responseHeadersIncompleteElement || getResponseHeadersList(), formData.responseHeadersIncompleteElement || null);
    return;
  }

  if (formData.responseHeadersDuplicateName) {
    showToast(window.i18n.t('responseHeadersDuplicate', formData.responseHeadersDuplicateName), true);
    ensureAdvancedSettingsVisible();
    scrollFieldIntoView(formData.responseHeadersDuplicateElement || getResponseHeadersList(), formData.responseHeadersDuplicateElement || null);
    return;
  }

  const responseHeaders = formData.responseHeaders;

  if (!Number.isInteger(formData.responseStatus) || formData.responseStatus < 100 || formData.responseStatus > 599) {
    showToast(window.i18n.t('responseStatusInvalid'), true);
    ensureAdvancedSettingsVisible();
    scrollFieldIntoView(responseStatusInput, responseStatusInput);
    return;
  }

  if (!Number.isFinite(formData.responseDelayMs) || formData.responseDelayMs < 0) {
    showToast(window.i18n.t('responseDelayInvalid'), true);
    ensureAdvancedSettingsVisible();
    scrollFieldIntoView(responseDelayInput, responseDelayInput);
    return;
  }

  if (isLikelyNavigationRequestRule(formData)) {
    const shouldContinue = confirm(window.i18n.t('navigationRequestConfirm'));
    if (!shouldContinue) {
      const urlPatternInput = document.getElementById('url-pattern');
      updateNavigationRequestWarning(formData);
      scrollFieldIntoView(urlPatternInput, urlPatternInput);
      return;
    }
  }

  const rule = {
    name: formData.name,
    urlPattern: formData.urlPattern,
    type: 'mockResponse',
    method: formData.method,
    matchMode: formData.matchMode,
    priority: formData.priority,
    responseStatus: formData.responseStatus,
    responseDelayMs: formData.responseDelayMs,
    responseHeaders,
    contentType: inferResponseContentType(responseBodyValue, responseHeaders),
    responseBody: responseBodyValue
  };

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
  const ruleForm = document.getElementById('rule-form');
  const { hideInputError } = window.App.validation;

  window.App.rules.setEditingRuleId(null);
  window.App.rules.setCurrentEditingRuleData(null);
  ruleForm.reset();
  fillRuleForm();

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
  updateNavigationRequestWarning();
}

// 检查表单是否有修改
function checkFormDirty() {
  const editingRuleId = window.App.rules.getEditingRuleId();
  const currentEditingRuleData = window.App.rules.getCurrentEditingRuleData();

  const currentName = document.getElementById('rule-name').value.trim();
  const currentSnapshot = getRuleFormSnapshot();

  if (editingRuleId && currentEditingRuleData) {
    const isNameChanged = currentName !== currentEditingRuleData.name;
    const isUrlChanged = currentSnapshot.urlPattern !== currentEditingRuleData.urlPattern;
    const isMethodChanged = currentSnapshot.method !== (currentEditingRuleData.method || DEFAULT_RULE_METHOD);
    const isMatchModeChanged = currentSnapshot.matchMode !== getDefaultMatchMode(currentEditingRuleData.matchMode, currentEditingRuleData.urlPattern);
    const isPriorityChanged = Number(currentSnapshot.priority) !== Number(currentEditingRuleData.priority || DEFAULT_PRIORITY);
    const isStatusChanged = Number(currentSnapshot.responseStatus) !== Number(currentEditingRuleData.responseStatus || DEFAULT_RESPONSE_STATUS);
    const isDelayChanged = Number(currentSnapshot.responseDelayMs) !== Number(currentEditingRuleData.responseDelayMs || DEFAULT_RESPONSE_DELAY);
    const originalHeadersSignature = getResponseHeadersSignatureFromObject(currentEditingRuleData.responseHeaders);
    const isHeadersChanged = currentSnapshot.responseHeadersSignature !== originalHeadersSignature;
    const isResponseChanged = currentSnapshot.responseBody !== (currentEditingRuleData.responseBody || '');
    return isNameChanged || isUrlChanged || isMethodChanged || isMatchModeChanged || isPriorityChanged || isStatusChanged || isDelayChanged || isHeadersChanged || isResponseChanged;
  } else {
    return currentName !== ''
      || currentSnapshot.urlPattern !== ''
      || currentSnapshot.method !== DEFAULT_RULE_METHOD
      || currentSnapshot.matchMode !== DEFAULT_MATCH_MODE
      || Number(currentSnapshot.priority) !== DEFAULT_PRIORITY
      || Number(currentSnapshot.responseStatus) !== DEFAULT_RESPONSE_STATUS
      || Number(currentSnapshot.responseDelayMs) !== DEFAULT_RESPONSE_DELAY
      || currentSnapshot.responseHeadersSignature !== ''
      || currentSnapshot.responseBody !== '';
  }
}

function initResponseHeadersEditor() {
  const list = getResponseHeadersList();
  const addButton = document.getElementById('add-response-header');

  if (!list || !addButton || list.dataset.initialized === 'true') {
    return;
  }

  list.dataset.initialized = 'true';
  ensureResponseHeadersEditorRow();
  updateNavigationRequestWarning();

  addButton.addEventListener('click', () => {
    const row = createResponseHeaderRow();
    list.appendChild(row);
    syncAdvancedSettingsSummary();
    updateNavigationRequestWarning();
    const nameInput = row.querySelector('.response-header-name');
    if (nameInput) {
      nameInput.focus();
    }
  });

  list.addEventListener('click', (e) => {
    const removeButton = e.target.closest('.response-header-remove');
    if (!removeButton) {
      return;
    }

    const row = removeButton.closest('.response-header-item');
    if (row) {
      row.remove();
    }

    ensureResponseHeadersEditorRow();
    syncAdvancedSettingsSummary();
    updateNavigationRequestWarning();
  });

  list.addEventListener('input', () => {
    syncAdvancedSettingsSummary();
    updateNavigationRequestWarning();
  });

  window.addEventListener('languageChanged', () => {
    list.querySelectorAll('.response-header-item').forEach(updateResponseHeaderRowI18n);
    syncAdvancedSettingsSummary();
    updateNavigationRequestWarning();
  });
}

function initAdvancedSettings() {
  const { toggle } = getAdvancedSettingsElements();
  if (!toggle || toggle.dataset.initialized === 'true') {
    return;
  }

  toggle.dataset.initialized = 'true';
  setAdvancedSettingsExpanded(false);
  syncAdvancedSettingsSummary();
  updateNavigationRequestWarning();

  toggle.addEventListener('click', () => {
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    setAdvancedSettingsExpanded(!isExpanded);
  });

  [
    'url-pattern',
    'rule-method',
    'rule-match-mode',
    'rule-priority',
    'response-status',
    'response-delay'
  ].forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener('input', () => {
      syncAdvancedSettingsSummary();
      updateNavigationRequestWarning();
    });
    field.addEventListener('change', () => {
      syncAdvancedSettingsSummary();
      updateNavigationRequestWarning();
    });
  });

  window.addEventListener('languageChanged', () => {
    syncAdvancedSettingsSummary();
    updateNavigationRequestWarning();
  });
}

// 导出到全局
window.App = window.App || {};
window.App.form = {
  handleFormSubmit,
  resetForm,
  checkFormDirty,
  fillRuleForm,
  updateNavigationRequestWarning,
  getRuleFormSnapshot,
  initResponseHeadersEditor,
  initAdvancedSettings,
  refreshAdvancedSettingsUI,
  setResponseHeaders,
  ensureAdvancedSettingsVisible
};
