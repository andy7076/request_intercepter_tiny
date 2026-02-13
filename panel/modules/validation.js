/**
 * 表单验证模块
 * 处理表单输入验证和错误提示
 */

// 初始化表单验证
function setupFormValidation() {
  const inputs = document.querySelectorAll('#rule-form input[required]');
  inputs.forEach(input => {
    // 当验证失败时（提交表单时），显示自定义错误消息
    input.addEventListener('invalid', (e) => {
      e.preventDefault(); // 阻止原生提示框
      
      // 只有当 validity.valueMissing 为 true 时才认为是必填错误
      if (e.target.validity.valueMissing) {
        showInputError(e.target, window.i18n.t('requiredFieldMessage'), 'requiredFieldMessage');
      }
    });

    // 当用户输入时，清除自定义错误消息
    input.addEventListener('input', (e) => {
      e.target.setCustomValidity('');
      hideInputError(e.target);
    });
  });
}

// 显示输入框错误提示
function showInputError(input, message, i18nKey) {
  // 检查是否已存在错误提示
  const parent = input.parentElement;
  let errorEl = parent.querySelector('.input-error-msg');
  
  // 添加错误状态样式
  input.classList.add('error');

  if (!errorEl) {
    errorEl = document.createElement('div');
    errorEl.className = 'input-error-msg';
    
    // SVG icon
    const icon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    `;
    
    errorEl.innerHTML = icon;
    
    const span = document.createElement('span');
    span.textContent = message;
    if (i18nKey) {
      span.setAttribute('data-i18n', i18nKey);
    }
    errorEl.appendChild(span);
    
    parent.appendChild(errorEl);
  } else {
    // 更新消息
    const span = errorEl.querySelector('span');
    if (span) {
      span.textContent = message;
      if (i18nKey) {
        span.setAttribute('data-i18n', i18nKey);
      } else {
        span.removeAttribute('data-i18n');
      }
    }
  }
}

// 隐藏输入框错误提示
function hideInputError(input) {
  const parent = input.parentElement;
  const errorEl = parent.querySelector('.input-error-msg');
  
  input.classList.remove('error');
  
  if (errorEl) {
    errorEl.remove();
  }
}

// 导出到全局
window.App = window.App || {};
window.App.validation = {
  setupFormValidation,
  showInputError,
  hideInputError
};
