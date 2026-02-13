/**
 * 规则管理模块
 * 规则 CRUD 操作、渲染和搜索
 */

// 搜索状态
let searchQuery = '';
let allRules = [];

// 编辑状态
let editingRuleId = null;
let currentEditingRuleData = null;

function getEditingRuleId() { return editingRuleId; }
function setEditingRuleId(id) { editingRuleId = id; }
function getCurrentEditingRuleData() { return currentEditingRuleData; }
function setCurrentEditingRuleData(data) { currentEditingRuleData = data; }

async function loadRules() {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  allRules = rules;
  filterAndRenderRules();
}

function filterAndRenderRules() {
  if (!searchQuery) { renderRules(allRules); return; }
  const query = searchQuery.toLowerCase();
  const filteredRules = allRules.filter(rule => {
    return rule.name.toLowerCase().includes(query) || rule.urlPattern.toLowerCase().includes(query);
  });
  renderRules(filteredRules, searchQuery);
}

const performSearch = window.App.utils.debounce(() => { filterAndRenderRules(); }, 300);

function handleSearchInput(e) {
  searchQuery = e.target.value.trim();
  const clearSearchBtn = document.getElementById('clear-search-btn');
  if (clearSearchBtn) { clearSearchBtn.classList.toggle('visible', searchQuery.length > 0); }
  performSearch();
}

function clearSearch() {
  const rulesSearchInput = document.getElementById('rules-search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  searchQuery = '';
  if (rulesSearchInput) { rulesSearchInput.value = ''; }
  if (clearSearchBtn) { clearSearchBtn.classList.remove('visible'); }
  filterAndRenderRules();
}

function renderRuleDetails(rule) {
  if (rule.responseBody) {
    return `<div class="rule-details response-preview" data-rule-id="${rule.id}">
        <div class="response-header clickable" data-toggle-id="${rule.id}">
          <div class="header-left">
             <span class="toggle-icon" style="transform: rotate(90deg)">▶</span>
             <span class="content-type-label">application/json</span>
          </div>
        </div>
        <div class="response-content" id="content-${rule.id}" data-content-id="${rule.id}">
          <div class="renderjson-container" data-json-id="${rule.id}"></div>
        </div>
      </div>`;
  }
  return '';
}

function initRenderjson(rule) {
  const { escapeHtml } = window.App.utils;
  const container = document.querySelector(`.renderjson-container[data-json-id="${rule.id}"]`);
  if (!container) return;
  try {
    const jsonData = JSON.parse(rule.responseBody);
    renderjson.set_show_to_level(1);
    renderjson.set_max_string_length(100);
    renderjson.set_sort_objects(false);
    container.appendChild(renderjson(jsonData));
  } catch (e) {
    container.innerHTML = `<pre class="json-error-fallback">${escapeHtml(rule.responseBody)}</pre>`;
  }
}

function renderRules(rules, highlightQuery = '') {
  const { escapeHtml, highlightText } = window.App.utils;
  const rulesList = document.getElementById('rules-list');
  const ruleCount = document.getElementById('rules-count-text');
  ruleCount.textContent = window.i18n.t('rulesCount', rules.length);

  if (rules.length === 0) {
    if (highlightQuery && allRules.length > 0) {
      rulesList.innerHTML = `<div class="no-search-results"><span class="empty-icon">🔍</span><p>${window.i18n.t('noSearchResults')}</p><p>${window.i18n.t('searchFor')} <span class="search-query">"${escapeHtml(highlightQuery)}"</span></p></div>`;
    } else {
      rulesList.innerHTML = `<div class="empty-state"><span class="empty-icon">📂</span><p>${window.i18n.t('noRulesYet')}</p><p class="hint">${window.i18n.t('noRulesAdvancedHint')}</p></div>`;
    }
    return;
  }

  rulesList.innerHTML = rules.map(rule => `
    <div class="rule-card ${rule.enabled ? '' : 'disabled'}" data-id="${rule.id}">
      <div class="rule-header">
        <div class="rule-info"><div class="rule-name-row"><span class="rule-name" title="${escapeHtml(rule.name)}">${highlightText(escapeHtml(rule.name), highlightQuery)}</span></div></div>
        <div class="rule-status"><div class="rule-toggle ${rule.enabled ? 'active' : ''}" data-id="${rule.id}" title="${rule.enabled ? window.i18n.t('clickToDisable') : window.i18n.t('clickToEnable')}"></div></div>
      </div>
      <div class="rule-url">${highlightText(escapeHtml(rule.urlPattern), highlightQuery)}</div>
      ${renderRuleDetails(rule)}
      <div class="rule-footer">
        <button class="btn-modify-response" data-id="${rule.id}">${window.i18n.t('editResponse')}</button>
        <div class="rule-actions-group">
          <button class="btn-icon-small btn-export-icon" data-id="${rule.id}" title="${window.i18n.t('exportRule')}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg></button>
          <button class="btn-icon-small btn-edit" data-id="${rule.id}" title="${window.i18n.t('edit')}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg></button>
          <button class="btn-icon-small btn-delete" data-id="${rule.id}" title="${window.i18n.t('delete')}"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg></button>
        </div>
      </div>
    </div>
  `).join('');

  // 绑定事件
  rulesList.querySelectorAll('.rule-toggle').forEach(t => { t.addEventListener('click', (e) => { e.stopPropagation(); handleToggle(t.dataset.id); }); });
  rulesList.querySelectorAll('.btn-edit').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); handleEdit(b.dataset.id); }); });
  rulesList.querySelectorAll('.btn-delete').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); handleDelete(b.dataset.id); }); });
  rulesList.querySelectorAll('.btn-export-icon').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); handleExportRule(b.dataset.id); }); });
  rulesList.querySelectorAll('.btn-modify-response').forEach(b => { b.addEventListener('click', (e) => { e.stopPropagation(); window.App.editor.handleDirectEdit(b.dataset.id); }); });

  rulesList.querySelectorAll('.response-header.clickable').forEach(header => {
    header.addEventListener('click', (e) => {
      e.stopPropagation();
      const ruleId = header.dataset.toggleId;
      const content = document.getElementById(`content-${ruleId}`);
      const icon = header.querySelector('.toggle-icon');
      if (content) {
        const isHidden = content.classList.contains('hidden');
        if (isHidden) { content.classList.remove('hidden'); if (icon) icon.style.transform = 'rotate(90deg)'; }
        else { content.classList.add('hidden'); if (icon) icon.style.transform = 'rotate(0deg)'; }
      }
    });
  });

  rules.forEach(rule => { if (rule.responseBody) { initRenderjson(rule); } });
}

async function handleToggle(ruleId) {
  const { sendMessage } = window.App.utils;
  await sendMessage({ type: 'TOGGLE_RULE', ruleId });
  loadRules();
  showToast(window.i18n.t('ruleStatusUpdated'));
}

async function handleEdit(ruleId) {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;

  editingRuleId = ruleId;
  currentEditingRuleData = JSON.parse(JSON.stringify(rule));

  const ruleNameInput = document.getElementById('rule-name');
  const urlPatternInput = document.getElementById('url-pattern');
  ruleNameInput.value = rule.name;
  urlPatternInput.value = rule.urlPattern;
  document.getElementById('response-body').value = rule.responseBody || '';
  ruleNameInput.setCustomValidity('');
  urlPatternInput.setCustomValidity('');

  const formCodeMirror = window.App.editor.getFormCodeMirror();
  if (formCodeMirror) { formCodeMirror.setValue(rule.responseBody || ''); }

  const addTabBtn = document.querySelector('.tab-btn[data-tab="add"]');
  if (addTabBtn) {
    const iconContainer = addTabBtn.querySelector('span:nth-child(1)');
    iconContainer.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`;
    addTabBtn.querySelector('span:nth-child(2)').textContent = window.i18n.t('tabEditRule');
    addTabBtn.querySelector('span:nth-child(2)').setAttribute('data-i18n', 'tabEditRule');
  }

  window.App.editor.validateJsonRealtime();
  window.App.tabs.switchTab('add');
}

async function handleDelete(ruleId) {
  const { sendMessage } = window.App.utils;
  if (!confirm(window.i18n.t('confirmDeleteRule'))) return;
  if (editingRuleId === ruleId) { window.App.form.resetForm(); window.App.tabs.switchTab('rules'); }
  await sendMessage({ type: 'DELETE_RULE', ruleId });
  loadRules();
  showToast(window.i18n.t('ruleDeleted'));
}

async function handleExport() {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) { showToast(window.i18n.t('noRulesToExport'), true); return; }
  const exportData = { version: '1.0.0', exportedAt: new Date().toISOString(), rules };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `request-interceptor-rules-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(window.i18n.t('exportedRules', rules.length));
}

async function handleExportRule(ruleId) {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) { showToast(window.i18n.t('ruleNotExist'), true); return; }
  const exportData = { version: '1.0.0', exportedAt: new Date().toISOString(), rules: [rule] };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = rule.name.replace(/[\\/:*?"<>|]/g, '_').substring(0, 30);
  a.download = `rule-${safeName}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast(window.i18n.t('exportedRule', rule.name));
}

async function handleImport(e) {
  const { sendMessage } = window.App.utils;
  const importFile = document.getElementById('import-file');
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data.rules || !Array.isArray(data.rules)) { throw new Error(window.i18n.t('invalidRuleFileFormat')); }
    const confirmMsg = window.i18n.t('confirmImportRules', data.rules.length);
    if (!confirm(confirmMsg)) { importFile.value = ''; return; }
    let imported = 0;
    for (const rule of data.rules) {
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
  importFile.value = '';
}

async function handleClearRules() {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) { showToast(window.i18n.t('noRulesToClear'), true); return; }
  if (!confirm(window.i18n.t('confirmClearAllRules'))) return;
  await sendMessage({ type: 'CLEAR_ALL_RULES' });
  loadRules();
  showToast(window.i18n.t('allRulesCleared'));
}

async function handleDisableRules() {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  if (rules.length === 0) { showToast(window.i18n.t('noRulesAvailable'), true); return; }
  const hasEnabled = rules.some(r => r.enabled);
  if (!hasEnabled) { showToast(window.i18n.t('allRulesAlreadyDisabled'), true); return; }
  if (!confirm(window.i18n.t('confirmDisableAllRules'))) return;
  await sendMessage({ type: 'DISABLE_ALL_RULES' });
  loadRules();
  showToast(window.i18n.t('allRulesDisabled'));
}

window.App = window.App || {};
window.App.rules = {
  loadRules, handleExport, handleImport, handleSearchInput, clearSearch,
  handleClearRules, handleDisableRules,
  getEditingRuleId, setEditingRuleId, getCurrentEditingRuleData, setCurrentEditingRuleData
};
