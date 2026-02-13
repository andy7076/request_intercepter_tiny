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

function generateRuleNameFromUrl(url) {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) { return urlObj.hostname.replace('www.', '').split('.')[0]; }
    const ignoreParts = ['api', 'v1', 'v2', 'v3', 'v4', 'rest', 'ajax', 'json', 'data', 'service', 'services'];
    const meaningfulParts = pathParts.filter(part => {
      const lowerPart = part.toLowerCase();
      if (/^v\d+(\.\d+)?$/i.test(part)) return false;
      if (ignoreParts.includes(lowerPart)) return false;
      if (/^\d+$/.test(part)) return false;
      return true;
    });
    let nameParts;
    if (meaningfulParts.length >= 2) { nameParts = meaningfulParts.slice(-2); }
    else if (meaningfulParts.length === 1) { nameParts = meaningfulParts; }
    else { nameParts = [pathParts[pathParts.length - 1]]; }
    const formattedParts = nameParts.map(part => {
      return part.replace(/\.\w+$/, '').replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, c => c.toUpperCase()).trim();
    });
    let name = formattedParts.join(' ').trim();
    if (!name) { return urlObj.hostname.replace('www.', '').split('.')[0]; }
    return name;
  } catch { return 'API Rule'; }
}

function generateUrlPattern(url) {
  try {
    const urlObj = new URL(url);
    return `*://${urlObj.host}${urlObj.pathname}*`;
  } catch { return url; }
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
