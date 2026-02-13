/**
 * CodeMirror 编辑器模块
 * 管理表单编辑器和全屏模态框编辑器
 */

// 编辑器实例
let formCodeMirror = null;
let modalCodeMirror = null;
let formEditorSearch = null;
let modalEditorSearch = null;

// 模态框状态
let modalMode = 'form'; // 'form' | 'direct'
let modalTargetRuleId = null;

// 获取编辑器实例（供其他模块调用）
function getFormCodeMirror() {
  return formCodeMirror;
}

function getModalCodeMirror() {
  return modalCodeMirror;
}

function getModalMode() {
  return modalMode;
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
    value: textarea.value || ''
  });

  // 同步内容到隐藏的 textarea
  formCodeMirror.on('change', (cm) => {
    textarea.value = cm.getValue();
    if (window.App && window.App.editor) {
      window.App.editor.validateJsonRealtime();
    }
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
      }
    }
  });

  // Initialize Search
  try {
    modalEditorSearch = new EditorSearch(cm, wrapper);
  } catch (e) {
    console.error('Failed to initialize EditorSearch for modal:', e);
  }

  // 同步内容到隐藏的 textarea 和表单
  cm.on('change', (editor) => {
    const value = editor.getValue();
    modalTextarea.value = value;

    // 仅在 form 模式下同步到表单编辑器
    if (modalMode === 'form') {
      const responseBody = document.getElementById('response-body');
      if (responseBody) {
        responseBody.value = value;
      }

      // 同步到表单的 CodeMirror
      if (formCodeMirror && formCodeMirror.getValue() !== value) {
        formCodeMirror.setValue(value);
      }
    }

    if (window.App && window.App.editor) {
      window.App.editor.validateJsonRealtime();
    }
  });

  return cm;
}

// 实时验证 JSON 格式
function validateJsonRealtime() {
  const mainIndicator = document.getElementById('json-status-indicator');
  const mainStatusText = document.getElementById('json-status-text');
  const modalIndicator = document.getElementById('modal-json-status-indicator');
  const modalStatusText = document.getElementById('modal-json-status-text');
  const responseBody = document.getElementById('response-body');
  const modalTextarea = document.getElementById('modal-textarea');

  // 根据模式确定验证目标和内容源
  let targets = [];
  let rawValue = '';
  let editorsToMark = [];
  let editorsToClear = [];

  if (modalMode === 'direct') {
    // Direct 模式：只验证模态框内容
    if (modalIndicator && modalStatusText) targets.push({ indicator: modalIndicator, text: modalStatusText });
    rawValue = modalCodeMirror ? modalCodeMirror.getValue() : modalTextarea.value;
    if (modalCodeMirror) {
      editorsToMark.push(modalCodeMirror);
      editorsToClear.push(modalCodeMirror);
    }
  } else {
    // Form 模式：验证表单内容（模态框内容应已同步）
    if (mainIndicator && mainStatusText) targets.push({ indicator: mainIndicator, text: mainStatusText });
    if (modalIndicator && modalStatusText) targets.push({ indicator: modalIndicator, text: modalStatusText });

    rawValue = formCodeMirror ? formCodeMirror.getValue() : responseBody.value;
    if (formCodeMirror) {
      editorsToMark.push(formCodeMirror);
      editorsToClear.push(formCodeMirror);
    }
    if (modalCodeMirror) {
      editorsToMark.push(modalCodeMirror);
      editorsToClear.push(modalCodeMirror);
    }
  }

  const trimmedValue = rawValue.trim();

  if (!trimmedValue) {
    // 空内容时重置为默认状态
    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator';
      text.className = 'hint';
      text.textContent = window.i18n.t('responseContentHint');
    });
    return false;
  }

  try {
    const parsed = JSON.parse(rawValue);
    // 检查是否为对象或数组（API 响应通常是这两种格式）
    if (typeof parsed !== 'object' || parsed === null) {
      targets.forEach(({ indicator, text }) => {
        indicator.className = 'json-status-indicator invalid';
        text.className = 'hint invalid';
        text.textContent = window.i18n.t('needJsonObjectOrArray');
      });
      return false;
    }

    // 清除错误标记
    editorsToClear.forEach(cm => cm.getAllMarks().forEach(mark => mark.clear()));

    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator valid';
      text.className = 'hint valid';
      text.textContent = window.i18n.t('jsonValid');
    });
    return true;
  } catch (err) {
    // 提取错误位置信息
    const match = err.message.match(/position (\d+)/);
    let errorMsg = window.i18n.t('jsonError');
    let errorLine = -1;
    let errorCol = -1;

    if (match) {
      const position = parseInt(match[1], 10);
      // 计算行号和列号
      const lines = rawValue.substring(0, position).split('\n');
      errorLine = lines.length;
      errorCol = lines[lines.length - 1].length + 1;

      errorMsg = window.i18n.t('jsonErrorDetailed', errorLine, errorCol);
    } else if (err.message.match(/Unexpected end of JSON input/)) {
      // JSON 意外结束（通常在最后）
      if (editorsToMark.length > 0) {
        // Use the first editor to calculate position (assuming sync)
        const pos = editorsToMark[0].posFromIndex(rawValue.length);
        errorLine = pos.line + 1;
        errorCol = pos.ch + 1;
      } else {
        const lines = rawValue.split('\n');
        errorLine = lines.length;
        errorCol = lines[lines.length - 1].length + 1;
      }
      errorMsg = window.i18n.t('jsonErrorDetailed', errorLine, errorCol);
    }

    // 在 CodeMirror 中标记错误
    if (errorLine > 0) {
      const markError = (cm) => {
        // 清除旧标记
        cm.getAllMarks().forEach(mark => mark.clear());

        const lineIndex = errorLine - 1;
        const colIndex = errorCol - 1;

        // 标记精确字符
        let from = { line: lineIndex, ch: colIndex };
        let to = { line: lineIndex, ch: colIndex + 1 };

        // 处理行尾/文件尾情况
        const lineContent = cm.getLine(lineIndex) || "";
        if (colIndex >= lineContent.length) {
          if (lineContent.length > 0) {
            // 如果在行尾，标记最后一个字符
            from.ch = lineContent.length - 1;
            to.ch = lineContent.length;
          } else {
            // 空行的情况，标记开头即可
            from.ch = 0;
            to.ch = 1;
          }
        }

        cm.markText(from, to, { className: "cm-json-error" });
      };

      editorsToMark.forEach(cm => markError(cm));
    }

    targets.forEach(({ indicator, text }) => {
      indicator.className = 'json-status-indicator invalid';
      text.className = 'hint invalid';
      text.textContent = errorMsg;
    });
    return false;
  }
}

// 打开全屏编辑器
function openEditorModal(mode = 'form', content = null, ruleId = null) {
  // Check if mode is an event object (clicked directly)
  if (typeof mode === 'object') {
    mode = 'form';
  }

  const editorModal = document.getElementById('editor-modal');
  const modalTextarea = document.getElementById('modal-textarea');
  const modalSaveBtn = document.getElementById('modal-save-btn');
  const responseBody = document.getElementById('response-body');

  modalMode = mode;
  modalTargetRuleId = ruleId;

  // 获取当前内容
  let currentValue = '';
  if (mode === 'form') {
    currentValue = formCodeMirror ? formCodeMirror.getValue() : responseBody.value;
    if (modalSaveBtn) modalSaveBtn.style.display = 'none';
  } else {
    currentValue = content || '';
    if (modalSaveBtn) modalSaveBtn.style.display = 'block';
  }

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
}

// 关闭全屏编辑器
function closeEditorModal() {
  const editorModal = document.getElementById('editor-modal');
  const responseBody = document.getElementById('response-body');
  const modalTextarea = document.getElementById('modal-textarea');

  // 获取模态框编辑器内容
  const modalValue = modalCodeMirror ? modalCodeMirror.getValue() : modalTextarea.value;

  // 同步内容回表单编辑器 (仅在表单模式下)
  if (modalMode === 'form') {
    if (formCodeMirror) {
      formCodeMirror.setValue(modalValue);
    }
    responseBody.value = modalValue;
  }

  // Reset search state if active
  if (modalEditorSearch) {
    modalEditorSearch.reset();
  }

  editorModal.classList.remove('active');

  // 验证 JSON 格式 (仅在表单模式下)
  if (modalMode === 'form') {
    validateJsonRealtime();
  }
}

// 处理直接编辑保存
async function handleModalSave() {
  if (modalMode !== 'direct' || !modalTargetRuleId) return;

  const { sendMessage } = window.App.utils;
  const modalTextarea = document.getElementById('modal-textarea');

  const content = modalCodeMirror ? modalCodeMirror.getValue() : modalTextarea.value;

  // 验证 JSON
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed !== 'object' || parsed === null) {
      showToast(window.i18n.t('needJsonObjectOrArray'), true);
      return;
    }
  } catch (e) {
    showToast(window.i18n.t('jsonError'), true);
    return;
  }

  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === modalTargetRuleId);
  if (rule) {
    rule.responseBody = content;
    await sendMessage({ type: 'UPDATE_RULE', ruleId: modalTargetRuleId, rule });
    showToast(window.i18n.t('ruleUpdated'));
    if (window.App && window.App.rules) {
      window.App.rules.loadRules();
    }
    closeEditorModal();
  }
}

// 处理直接编辑响应内容
async function handleDirectEdit(ruleId) {
  const { sendMessage } = window.App.utils;
  const rules = await sendMessage({ type: 'GET_RULES' });
  const rule = rules.find(r => r.id === ruleId);

  if (!rule || !rule.responseBody) return;

  openEditorModal('direct', rule.responseBody, ruleId);
}

// 获取模态框编辑器搜索实例
function getModalEditorSearch() {
  return modalEditorSearch;
}

// 导出到全局
window.App = window.App || {};
window.App.editor = {
  initCodeMirrorEditors,
  getFormCodeMirror,
  getModalCodeMirror,
  getModalMode,
  getModalEditorSearch,
  validateJsonRealtime,
  openEditorModal,
  closeEditorModal,
  handleModalSave,
  handleDirectEdit
};
