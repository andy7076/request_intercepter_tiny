/**
 * 日志管理模块
 * 日志加载、渲染和 Diff 查看器
 */

// 缓存日志数据用于 diff 查看
let cachedLogs = [];
let currentDiffLog = null;
let hasDiffIndexResizeListener = false;
const expandedLogUrlKeys = new Set();

function getLogKey(log) {
  if (!log) return '';

  return [
    log.timestamp || '',
    log.method || '',
    log.url || '',
    log.ruleName || '',
    log.status || ''
  ].join('::');
}

function syncLogUrlToggleState(toggleButton, urlElement, expanded) {
  if (!toggleButton || !urlElement) return;

  urlElement.classList.toggle('expanded', expanded);
  urlElement.classList.toggle('has-toggle', !toggleButton.classList.contains('hidden'));
  toggleButton.dataset.expanded = expanded ? 'true' : 'false';
  toggleButton.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  toggleButton.textContent = window.i18n.t(expanded ? 'collapse' : 'expand');
}

function setupLogUrlToggles() {
  const urlBlocks = document.querySelectorAll('.log-url-block');

  urlBlocks.forEach((block) => {
    const urlElement = block.querySelector('.log-url');
    const urlTextElement = block.querySelector('.log-url-text');
    const toggleButton = block.querySelector('.log-url-toggle');
    const logKey = block.dataset.logKey || '';
    if (!urlElement || !urlTextElement || !toggleButton) return;

    const isOverflowing = urlTextElement.scrollHeight > urlTextElement.clientHeight + 1;
    toggleButton.classList.toggle('hidden', !isOverflowing);
    urlElement.classList.toggle('has-toggle', isOverflowing);
    const shouldExpand = isOverflowing && logKey && expandedLogUrlKeys.has(logKey);
    syncLogUrlToggleState(toggleButton, urlElement, shouldExpand);

    if (!isOverflowing) {
      if (logKey) {
        expandedLogUrlKeys.delete(logKey);
      }
      toggleButton.dataset.bound = 'false';
      return;
    }

    if (toggleButton.dataset.bound === 'true') {
      return;
    }

    toggleButton.dataset.bound = 'true';
    toggleButton.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    toggleButton.addEventListener('click', (e) => {
      e.stopPropagation();
      const nextExpanded = toggleButton.dataset.expanded !== 'true';
      syncLogUrlToggleState(toggleButton, urlElement, nextExpanded);
      if (logKey) {
        if (nextExpanded) expandedLogUrlKeys.add(logKey);
        else expandedLogUrlKeys.delete(logKey);
      }
    });
  });
}

// 加载日志
async function loadLogs() {
  const { sendMessage } = window.App.utils;
  const logs = await sendMessage({ type: 'GET_LOGS' });
  renderLogs(logs);
}

// 渲染日志列表
function renderLogs(logs) {
  const { escapeHtml } = window.App.utils;
  const logsList = document.getElementById('logs-list');
  const logCount = document.getElementById('logs-count-text');
  const currentLogKeys = new Set(logs.map(log => getLogKey(log)));

  cachedLogs = logs;
  logCount.textContent = window.i18n.t('recentMatchRecords', logs.length);
  expandedLogUrlKeys.forEach((key) => {
    if (!currentLogKeys.has(key)) {
      expandedLogUrlKeys.delete(key);
    }
  });

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

  logsList.innerHTML = logs.map((log, index) => {
    const locale = window.i18n && window.i18n.getCurrentLanguage() === 'zh_CN' ? 'zh-CN' : 'en-US';
    const time = new Date(log.timestamp).toLocaleString(locale, {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const hasDiffData = log.mockedBody || log.originalBody;
    const method = escapeHtml(log.method || 'GET');
    const status = escapeHtml(String(log.status || 200));
    const ruleName = escapeHtml(log.ruleName || window.i18n.t('unknownRule'));
    const logKey = escapeHtml(getLogKey(log));
    const detailsAction = hasDiffData
      ? `<button type="button" class="btn-view-log-details" data-log-index="${index}">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <span>${window.i18n.t('viewDetails')}</span>
        </button>`
      : '';

    return `
      <div class="log-item" data-log-index="${index}">
        <div class="log-header">
          <span>
            <span class="log-type mockResponse">🎯 Mock</span>
            <span class="log-rule">${ruleName}</span>
          </span>
          <span class="log-time">${time}</span>
        </div>
        <div class="log-meta-row">
          <span class="log-pill">${method}</span>
          <span class="log-pill">${window.i18n.t('statusShort', status)}</span>
        </div>
        <div class="log-url-block" data-log-key="${logKey}">
          <div class="log-url">
            <div class="log-url-text">${method} ${escapeHtml(log.url)}</div>
            <button type="button" class="log-url-toggle hidden" aria-expanded="false">${window.i18n.t('expand')}</button>
          </div>
        </div>
        ${detailsAction ? `<div class="log-footer">${detailsAction}</div>` : ''}
      </div>
    `;
  }).join('');

  setupLogUrlToggles();

  if (!logsList._hasClickListener) {
    logsList.addEventListener('click', (e) => {
      const detailButton = e.target.closest('.btn-view-log-details');
      if (detailButton) {
        const index = parseInt(detailButton.dataset.logIndex);
        const log = cachedLogs[index];
        if (log) { openDiffModal(log); }
      }
    });
    logsList._hasClickListener = true;
  }
}

// 清空日志
async function handleClearLogs() {
  const { sendMessage } = window.App.utils;
  if (!confirm(window.i18n.t('confirmClearLogs'))) return;
  await sendMessage({ type: 'CLEAR_LOGS' });
  loadLogs();
  showToast(window.i18n.t('logsCleared'));
}

// ==================== Diff 查看器 ====================

function formatJson(str) {
  if (!str) return '';
  try { return JSON.stringify(JSON.parse(str), null, 2); }
  catch { return str; }
}

function computeDiff(oldText, newText) {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const m = oldLines.length;
  const n = newLines.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) { dp[i][j] = dp[i - 1][j - 1] + 1; }
      else { dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); }
    }
  }
  const temp = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      temp.push({ type: 'equal', content: oldLines[i - 1], oldLine: i, newLine: j }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      temp.push({ type: 'add', content: newLines[j - 1], newLine: j }); j--;
    } else {
      temp.push({ type: 'remove', content: oldLines[i - 1], oldLine: i }); i--;
    }
  }
  return temp.reverse();
}

function buildDiffChangeIndex(diff) {
  const changes = [];
  let currentChange = null;

  diff.forEach((item, index) => {
    const lineNumber = index + 1;

    if (item.type === 'equal') {
      if (currentChange) {
        changes.push(currentChange);
        currentChange = null;
      }
      return;
    }

    if (!currentChange || currentChange.type !== item.type) {
      if (currentChange) {
        changes.push(currentChange);
      }

      currentChange = {
        startLine: lineNumber,
        endLine: lineNumber,
        type: item.type
      };
      return;
    }

    currentChange.endLine = lineNumber;
  });

  if (currentChange) {
    changes.push(currentChange);
  }

  return changes;
}

function renderDiffIndex(changes, totalLines) {
  if (changes.length === 0 || totalLines === 0) {
    return '';
  }

  let html = '<div class="diff-index"><div class="diff-index-track">';
  changes.forEach(change => {
    const lineSpan = change.endLine - change.startLine + 1;
    const centerLine = change.startLine + ((lineSpan - 1) / 2);
    const top = Math.min(Math.max((centerLine / totalLines) * 100, 0.5), 99.5);
    const height = Math.min(Math.max(lineSpan * 2, 4), 12);

    html += `<button type="button" class="diff-index-marker diff-index-marker-${change.type}" data-change-type="${change.type}" data-target-line="${change.startLine}" style="top: ${top}%; height: ${height}px;"></button>`;
  });
  html += '</div></div>';

  return html;
}

function renderDiffContent(diff) {
  const { escapeHtml } = window.App.utils;
  if (diff.length === 0) { return `<div class="diff-empty">${window.i18n.t('diffEmpty')}</div>`; }
  const changes = buildDiffChangeIndex(diff);
  let html = '<div class="diff-layout"><div class="diff-main"><div class="diff-lines">';
  let lineNum = 0;
  diff.forEach(item => {
    lineNum++;
    const escapedContent = escapeHtml(item.content);
    if (item.type === 'equal') {
      html += `<div class="diff-line diff-equal" data-diff-line="${lineNum}"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">&nbsp;</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    } else if (item.type === 'remove') {
      html += `<div class="diff-line diff-remove" data-diff-line="${lineNum}"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">−</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    } else if (item.type === 'add') {
      html += `<div class="diff-line diff-add" data-diff-line="${lineNum}"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">+</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    }
  });
  html += `</div></div>${renderDiffIndex(changes, lineNum)}</div>`;
  return html;
}

function renderJsonContent(text) {
  const { escapeHtml } = window.App.utils;
  if (!text) { return `<div class="diff-empty">${window.i18n.t('diffNoData')}</div>`; }
  const formatted = formatJson(text);
  const lines = formatted.split('\n');
  let html = '<div class="diff-lines">';
  lines.forEach((line, index) => {
    const escapedContent = escapeHtml(line);
    html += `<div class="diff-line diff-equal"><span class="diff-line-num">${index + 1}</span><span class="diff-line-marker">&nbsp;</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
  });
  html += '</div>';
  return html;
}

function getDiffIndexStatusLabel(type) {
  if (type === 'add') {
    return window.i18n.t('diffIndexStatusAdd');
  }
  if (type === 'remove') {
    return window.i18n.t('diffIndexStatusRemove');
  }
  return window.i18n.t('diffIndexStatusMixed');
}

function updateDiffIndexLayout() {
  const diffContent = document.getElementById('diff-content');
  const scrollContainer = diffContent ? diffContent.parentElement : null;
  const diffIndex = diffContent ? diffContent.querySelector('.diff-index') : null;

  if (!diffContent || !scrollContainer || !diffIndex) {
    return;
  }

  const indexHeight = Math.max(scrollContainer.clientHeight - 24, 160);
  diffContent.style.setProperty('--diff-index-height', `${indexHeight}px`);
}

function setActiveDiffIndexMarker(targetLine) {
  document.querySelectorAll('.diff-index-marker').forEach(marker => {
    marker.classList.toggle('active', marker.dataset.targetLine === String(targetLine));
  });
}

function scrollToDiffLine(targetLine) {
  const diffContent = document.getElementById('diff-content');
  const scrollContainer = diffContent ? diffContent.parentElement : null;
  const target = diffContent ? diffContent.querySelector(`[data-diff-line="${targetLine}"]`) : null;

  if (!diffContent || !scrollContainer || !target) {
    return;
  }

  const top = target.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top + scrollContainer.scrollTop - 12;
  scrollContainer.scrollTo({ top, behavior: 'smooth' });
  setActiveDiffIndexMarker(targetLine);
}

function bindDiffIndexNavigation() {
  const diffContent = document.getElementById('diff-content');
  const diffIndexMarkers = diffContent ? diffContent.querySelectorAll('.diff-index-marker') : [];

  if (!diffContent || diffIndexMarkers.length === 0) {
    return;
  }

  updateDiffIndexLayout();

  diffIndexMarkers.forEach(marker => {
    const targetLine = parseInt(marker.dataset.targetLine, 10);
    const label = window.i18n.t('diffIndexJumpTo', getDiffIndexStatusLabel(marker.dataset.changeType), String(targetLine));
    marker.title = label;
    marker.setAttribute('aria-label', label);
    marker.addEventListener('click', () => {
      scrollToDiffLine(targetLine);
    });
  });

  setActiveDiffIndexMarker(diffIndexMarkers[0].dataset.targetLine);
}

function openDiffModal(log) {
  currentDiffLog = log;
  const diffModal = document.getElementById('diff-modal');
  if (!diffModal) return;
  diffModal.classList.add('active');
  switchDiffTab('diff');
}

function closeDiffModal() {
  const diffModal = document.getElementById('diff-modal');
  if (diffModal) { diffModal.classList.remove('active'); }
  currentDiffLog = null;
}

function switchDiffTab(tab) {
  document.querySelectorAll('.diff-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diffTab === tab);
  });
  const diffContent = document.getElementById('diff-content');
  if (!diffContent || !currentDiffLog) return;
  const original = currentDiffLog.originalBody || '';
  const modified = currentDiffLog.mockedBody || '';

  if (tab === 'diff') {
    if (!original && !modified) {
      diffContent.innerHTML = `<div class="diff-empty">${window.i18n.t('diffNoData')}</div>`;
    } else if (!original) {
      diffContent.innerHTML = `<div class="diff-notice"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span data-i18n="diffNoOriginal">${window.i18n.t('diffNoOriginal')}</span></div>` + renderJsonContent(modified);
    } else {
      const diff = computeDiff(formatJson(original), formatJson(modified));
      diffContent.innerHTML = renderDiffContent(diff);
    }
  } else if (tab === 'original') {
    diffContent.innerHTML = renderJsonContent(original);
  } else if (tab === 'modified') {
    diffContent.innerHTML = renderJsonContent(modified);
  }

  bindDiffIndexNavigation();

  // 每次切换内容后重置滚动位置到顶部（可滚动容器是 .diff-modal-body）
  const scrollContainer = diffContent.parentElement;
  if (scrollContainer) { scrollContainer.scrollTop = 0; }
}

// 初始化 Diff 模态框事件
function initDiffModal() {
  const diffModal = document.getElementById('diff-modal');
  const diffCloseBtn = document.getElementById('diff-modal-close');
  if (diffCloseBtn) { diffCloseBtn.addEventListener('click', closeDiffModal); }
  if (diffModal) {
    diffModal.addEventListener('click', (e) => { if (e.target === diffModal) { closeDiffModal(); } });
  }
  document.querySelectorAll('.diff-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => { switchDiffTab(btn.dataset.diffTab); });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && diffModal && diffModal.classList.contains('active')) { closeDiffModal(); }
  });
  if (!hasDiffIndexResizeListener) {
    window.addEventListener('resize', updateDiffIndexLayout);
    hasDiffIndexResizeListener = true;
  }
}

// 定时刷新日志（在日志面板激活时）
setInterval(() => {
  const logsPanel = document.getElementById('logs-panel');
  if (logsPanel && logsPanel.classList.contains('active')) { loadLogs(); }
}, 3000);

// 导出到全局
window.App = window.App || {};
window.App.logs = {
  loadLogs,
  handleClearLogs,
  initDiffModal
};
