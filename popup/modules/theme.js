/**
 * 主题管理模块
 * 处理主题切换和系统主题监听
 */

// 主题初始化（尽早执行避免闪烁）
(function initThemeEarly() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['theme'], (result) => {
      const pref = result.theme || 'system';
      if (pref === 'system') {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
      } else {
        document.documentElement.setAttribute('data-theme', pref);
      }
    });
  }
})();

// 应用主题
function applyTheme(pref, withTransition) {
  let resolvedTheme;
  if (pref === 'system') {
    const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    resolvedTheme = isDark ? 'dark' : 'light';
  } else {
    resolvedTheme = pref;
  }

  if (withTransition) {
    document.documentElement.setAttribute('data-theme-transition', '');
    setTimeout(() => {
      document.documentElement.removeAttribute('data-theme-transition');
    }, 400);
  }

  document.documentElement.setAttribute('data-theme', resolvedTheme);
}

// 监听系统主题切换（仅在 system 模式下生效）
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  chrome.storage.local.get(['theme'], (result) => {
    const pref = result.theme || 'system';
    if (pref === 'system') {
      applyTheme('system', true);
    }
  });
});

// 导出到全局
window.App = window.App || {};
window.App.theme = {
  applyTheme
};
