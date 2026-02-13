/**
 * Tab 切换模块
 * 管理面板的 Tab 切换逻辑
 */

// 切换 Tab
function switchTab(tab) {
  const tabBtns = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.panel');

  tabBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });

  panels.forEach(panel => {
    panel.classList.toggle('active', panel.id === `${tab}-panel`);
  });

  // 如果切换到添加/编辑页面，且 CodeMirror 已初始化，则刷新编辑器
  if (tab === 'add') {
    const formContent = document.querySelector('.form-content');
    if (formContent) {
      formContent.scrollTop = 0;
    }

    const formCodeMirror = window.App.editor.getFormCodeMirror();
    if (formCodeMirror) {
      setTimeout(() => {
        formCodeMirror.refresh();
      }, 50);
    }
  }
}

// 导出到全局
window.App = window.App || {};
window.App.tabs = {
  switchTab
};
