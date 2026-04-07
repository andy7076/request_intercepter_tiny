/**
 * cURL 导入模块
 * 解析 cURL 命令并填充表单
 */

// cURL 模态框相关元素（延迟获取）
let curlModal, curlInput, curlModalClose, curlCancelBtn, curlParseBtn, curlError, importCurlBtn;

function initCurlElements() {
  curlModal = document.getElementById('curl-modal');
  curlInput = document.getElementById('curl-input');
  curlModalClose = document.getElementById('curl-modal-close');
  curlCancelBtn = document.getElementById('curl-cancel-btn');
  curlParseBtn = document.getElementById('curl-parse-btn');
  curlError = document.getElementById('curl-error');
  importCurlBtn = document.getElementById('import-curl-btn');
}

function initCurlImport() {
  initCurlElements();
  if (!importCurlBtn || !curlModal) return;

  importCurlBtn.addEventListener('click', openCurlModal);
  if (curlModalClose) { curlModalClose.addEventListener('click', closeCurlModal); }
  if (curlCancelBtn) { curlCancelBtn.addEventListener('click', closeCurlModal); }
  if (curlModal) {
    curlModal.addEventListener('click', (e) => { if (e.target === curlModal) { closeCurlModal(); } });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && curlModal.classList.contains('active')) { closeCurlModal(); }
  });
  if (curlParseBtn) { curlParseBtn.addEventListener('click', parseAndFillCurl); }
}

function openCurlModal() {
  if (curlModal) {
    curlModal.classList.add('active');
    if (curlInput) { curlInput.value = ''; curlInput.focus(); }
    hideCurlError();
  }
}

function closeCurlModal() {
  if (curlModal) {
    curlModal.classList.remove('active');
    if (curlInput) { curlInput.value = ''; }
    if (curlParseBtn) { curlParseBtn.disabled = false; curlParseBtn.textContent = window.i18n.t('parseAndFill'); }
    hideCurlError();
  }
}

function showCurlError(message) {
  if (curlError) { curlError.textContent = message; curlError.classList.add('visible'); }
}

function hideCurlError() {
  if (curlError) { curlError.textContent = ''; curlError.classList.remove('visible'); }
}

function parseCurlCommand(curlCommand) {
  if (!curlCommand || typeof curlCommand !== 'string') {
    throw new Error(window.i18n.t('curlParseErrorEmpty'));
  }
  const trimmed = curlCommand.trim();
  if (!trimmed.toLowerCase().startsWith('curl')) {
    throw new Error(window.i18n.t('curlParseErrorInvalid'));
  }

  const result = { url: '', method: 'GET', headers: {}, data: '' };
  let normalized = trimmed.replace(/\\\r?\n/g, ' ').replace(/\s+/g, ' ').trim();

  let urlMatch = normalized.match(/curl\s+(?:(?:-[A-Za-z]+\s+(?:'[^']*'|"[^"]*"|\S+)\s+)*)?['"]?(https?:\/\/[^'">\s]+)['"]?/i);
  if (!urlMatch) { urlMatch = normalized.match(/['"]?(https?:\/\/[^'">\s]+)['"]?/); }
  if (urlMatch) { result.url = urlMatch[1].replace(/['"]$/, ''); }
  else { throw new Error(window.i18n.t('curlParseErrorNoUrl')); }

  const methodMatch = normalized.match(/(?:-X|--request)\s+['"]?(\w+)['"]?/i);
  if (methodMatch) { result.method = methodMatch[1].toUpperCase(); }

  const headerRegex = /(?:-H|--header)\s+['"]([^'"]+)['"]/g;
  let headerMatch;
  while ((headerMatch = headerRegex.exec(normalized)) !== null) {
    const headerStr = headerMatch[1];
    const colonIndex = headerStr.indexOf(':');
    if (colonIndex > 0) {
      result.headers[headerStr.substring(0, colonIndex).trim()] = headerStr.substring(colonIndex + 1).trim();
    }
  }

  const dataMatch = normalized.match(/(?:-d|--data|--data-raw|--data-binary)\s+\$?'([^']+)'/);
  if (dataMatch) { result.data = dataMatch[1]; }
  else {
    const dataMatchDouble = normalized.match(/(?:-d|--data|--data-raw|--data-binary)\s+"([^"]+)"/);
    if (dataMatchDouble) { result.data = dataMatchDouble[1].replace(/\\"/g, '"'); }
  }

  if (result.data && result.method === 'GET') { result.method = 'POST'; }
  return result;
}

function normalizeNamePart(value) {
  return value
    .replace(/\.\w+$/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase(value) {
  return value
    .split(' ')
    .filter(Boolean)
    .map(token => {
      if (/^[A-Z0-9]{2,}$/.test(token)) {
        return token;
      }
      return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    })
    .join(' ');
}

function getHostLabel(hostname) {
  const ignoredLabels = new Set(['www', 'api', 'm', 'open', 'rest', 'gateway', 'com', 'cn', 'net', 'org', 'io', 'co', 'uk', 'dev', 'app']);
  const labels = hostname.split('.').filter(Boolean);

  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i].toLowerCase();
    if (!ignoredLabels.has(label)) {
      return labels[i];
    }
  }

  return labels[0] || 'API';
}

function isIgnoredPathPart(part) {
  const lowerPart = part.toLowerCase();
  const ignoredParts = new Set(['api', 'rest', 'ajax', 'json', 'data', 'service', 'services', 'openapi', 'gateway', 'internal']);

  if (!lowerPart) { return true; }
  if (/^v\d+(\.\d+)?$/i.test(lowerPart)) { return true; }
  if (/^\d+$/.test(lowerPart)) { return true; }
  if (/^[0-9a-f]{8,}$/i.test(lowerPart)) { return true; }
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(lowerPart)) { return true; }
  if (ignoredParts.has(lowerPart)) { return true; }

  return false;
}

function generateRuleNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname
      .split('/')
      .filter(Boolean)
      .map(part => {
        try {
          return decodeURIComponent(part);
        } catch {
          return part;
        }
      });
    const meaningfulParts = pathParts.filter(part => !isIgnoredPathPart(part));

    let coreName = '';
    if (meaningfulParts.length > 0) {
      coreName = meaningfulParts[meaningfulParts.length - 1];
    } else if (urlObj.searchParams.size > 0) {
      coreName = Array.from(urlObj.searchParams.keys()).find(key => key && !isIgnoredPathPart(key)) || 'Request';
    } else if (pathParts.length > 0) {
      coreName = pathParts[pathParts.length - 1];
    } else {
      coreName = 'Request';
    }

    const formattedName = toTitleCase(normalizeNamePart(coreName));
    return formattedName || 'API Rule';
  } catch {
    return 'API Rule';
  }
}

function generateUrlPattern(url) {
  return url;
}

async function parseAndFillCurl() {
  if (!curlInput) return;
  const command = curlInput.value.trim();
  if (!command) { showCurlError(window.i18n.t('curlParseErrorEmpty')); return; }

  let parsed;
  try { parsed = parseCurlCommand(command); }
  catch (error) { showCurlError(error.message); return; }

  if (curlParseBtn) { curlParseBtn.disabled = true; curlParseBtn.textContent = window.i18n.t('curlFetching'); }
  hideCurlError();

  const { sendMessage } = window.App.utils;
  const { hideInputError } = window.App.validation;

  try {
    const response = await sendMessage({
      type: 'FETCH_URL',
      request: { url: parsed.url, method: parsed.method, headers: parsed.headers, body: parsed.data }
    });

    if (!response || !response.success) {
      const errorMessage = response && response.error
        ? window.i18n.t('curlFetchFailed', response.error)
        : window.i18n.t('curlFetchFailed', 'Unknown error');
      if (curlParseBtn) { curlParseBtn.disabled = false; curlParseBtn.textContent = window.i18n.t('parseAndFill'); }
      await showAlert(errorMessage, window.i18n.t('curlFetchErrorTitle') || window.i18n.t('alertTitle'));
      return;
    }

    const ruleNameInput = document.getElementById('rule-name');
    if (ruleNameInput) { ruleNameInput.value = generateRuleNameFromUrl(parsed.url); ruleNameInput.setCustomValidity(''); hideInputError(ruleNameInput); }

    const urlPatternInput = document.getElementById('url-pattern');
    if (urlPatternInput) { urlPatternInput.value = generateUrlPattern(parsed.url); urlPatternInput.setCustomValidity(''); hideInputError(urlPatternInput); }

    const methodSelect = document.getElementById('rule-method');
    if (methodSelect) { methodSelect.value = parsed.method || 'GET'; }

    const matchModeSelect = document.getElementById('rule-match-mode');
    if (matchModeSelect) { matchModeSelect.value = 'exact'; }

    const statusInput = document.getElementById('response-status');
    if (statusInput) { statusInput.value = String(response.status || 200); }

    const delayInput = document.getElementById('response-delay');
    if (delayInput) { delayInput.value = '0'; }

    if (window.App.form && window.App.form.setResponseHeaders) {
      window.App.form.setResponseHeaders(
        response.contentType ? { 'Content-Type': response.contentType } : {}
      );
    }

    const formCodeMirror = window.App.editor.getFormCodeMirror();
    if (formCodeMirror) { formCodeMirror.setValue(response.body); }
    const responseBodyInput = document.getElementById('response-body');
    if (responseBodyInput) { responseBodyInput.value = response.body; }

    window.App.editor.validateJsonRealtime();
    closeCurlModal();
    showToast(window.i18n.t('curlParsedWithResponse', response.status));
  } catch (error) {
    if (curlParseBtn) { curlParseBtn.disabled = false; curlParseBtn.textContent = window.i18n.t('parseAndFill'); }
    await showAlert(error.message, window.i18n.t('curlFetchErrorTitle') || window.i18n.t('alertTitle'));
  } finally {
    if (curlParseBtn && curlParseBtn.disabled) { curlParseBtn.disabled = false; curlParseBtn.textContent = window.i18n.t('parseAndFill'); }
  }
}

// 导出到全局
window.App = window.App || {};
window.App.curl = {
  initCurlImport
};
