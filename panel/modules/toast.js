/**
 * Toast / Alert 通知模块
 * 提供轻量提示和主题化弹窗
 */

// 显示 Toast 提示
function showToast(message, isError = false) {
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

// 显示主题化 Alert 弹窗
function showAlert(message, title) {
  return new Promise((resolve) => {
    const alertModal = document.getElementById('alert-modal');
    const alertMessage = document.getElementById('alert-message');
    const alertTitle = document.getElementById('alert-title');
    const alertConfirmBtn = document.getElementById('alert-confirm-btn');
    const alertCloseBtn = document.getElementById('alert-modal-close');

    if (!alertModal || !alertMessage) {
      // 如果没有找到 alert modal，回退到原生 alert
      alert(message);
      resolve();
      return;
    }

    // 设置消息内容
    alertMessage.textContent = message;

    // 设置标题（如果提供）
    if (alertTitle) {
      alertTitle.textContent = title || window.i18n.t('alertTitle') || 'Alert';
    }

    // 显示模态框
    alertModal.classList.add('active');

    // 关闭函数
    const closeAlert = () => {
      alertModal.classList.remove('active');
      alertConfirmBtn.removeEventListener('click', closeAlert);
      alertCloseBtn.removeEventListener('click', closeAlert);
      document.removeEventListener('keydown', handleEsc);
      resolve();
    };

    // ESC 键关闭
    const handleEsc = (e) => {
      if (e.key === 'Escape') {
        closeAlert();
      }
    };

    // 绑定事件
    alertConfirmBtn.addEventListener('click', closeAlert);
    alertCloseBtn.addEventListener('click', closeAlert);
    document.addEventListener('keydown', handleEsc);

    // 点击背景关闭
    alertModal.addEventListener('click', (e) => {
      if (e.target === alertModal) {
        closeAlert();
      }
    }, { once: true });

    // 聚焦确认按钮
    alertConfirmBtn.focus();
  });
}

// 导出到全局
window.showToast = showToast;
window.showAlert = showAlert;

window.App = window.App || {};
window.App.toast = {
  showToast,
  showAlert
};
