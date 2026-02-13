/**
 * 日志管理模块
 * 日志加载、渲染和 Diff 查看器
 */

// 缓存日志数据用于 diff 查看
let cachedLogs = [];
let currentDiffLog = null;

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

  cachedLogs = logs;
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

  logsList.innerHTML = logs.map((log, index) => {
    const locale = window.i18n && window.i18n.getCurrentLanguage() === 'zh_CN' ? 'zh-CN' : 'en-US';
    const time = new Date(log.timestamp).toLocaleString(locale, {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const hasDiffData = log.mockedBody || log.originalBody;
    const clickableClass = hasDiffData ? 'log-item-clickable' : '';
    const titleAttr = hasDiffData ? `title="${window.i18n.t('clickToViewDiff')}"` : '';

    return `
      <div class="log-item ${clickableClass}" data-log-index="${index}" ${titleAttr}>
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



  // 优化：使用事件委托处理点击事件
  // 移除旧的事件监听（如果有）可以避免重复，但这里是重新渲染 innerHTML，旧的元素已经被销毁，所以不需要手动移除旧元素的监听器
  // 但是需要在 logsList 上绑定一次监听器。为了避免多次绑定，可以先检查或在 init 时绑定。
  // 简单起见，这里我们确保 logsList 的点击事件只处理 .log-item-clickable
  if (!logsList._hasClickListener) {
    logsList.addEventListener('click', (e) => {
      const item = e.target.closest('.log-item-clickable');
      if (item) {
        const index = parseInt(item.dataset.logIndex);
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

function renderDiffContent(diff) {
  const { escapeHtml } = window.App.utils;
  if (diff.length === 0) { return `<div class="diff-empty">${window.i18n.t('diffEmpty')}</div>`; }
  let html = '<div class="diff-lines">';
  let lineNum = 0;
  diff.forEach(item => {
    lineNum++;
    const escapedContent = escapeHtml(item.content);
    if (item.type === 'equal') {
      html += `<div class="diff-line diff-equal"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">&nbsp;</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    } else if (item.type === 'remove') {
      html += `<div class="diff-line diff-remove"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">−</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    } else if (item.type === 'add') {
      html += `<div class="diff-line diff-add"><span class="diff-line-num">${lineNum}</span><span class="diff-line-marker">+</span><span class="diff-line-content">${escapedContent || '&nbsp;'}</span></div>`;
    }
  });
  html += '</div>';
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
