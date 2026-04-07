/**
 * 设置管理模块
 * 加载和应用用户设置
 */

function updateInterceptorStateUI(enabled) {
  const banner = document.getElementById('plugin-disabled-banner');
  if (!banner) {
    return;
  }

  banner.classList.toggle('hidden', enabled);
}

// 加载设置
function loadSettings() {
  const { applyTheme } = window.App.theme;
  const settingConsoleLog = document.getElementById('setting-console-log');
  const settingInterceptorEnabled = document.getElementById('setting-interceptor-enabled');

  chrome.storage.local.get(['consoleLogs', 'theme', 'interceptorEnabled'], (result) => {
    const interceptorEnabled = result.interceptorEnabled !== false;

    if (settingInterceptorEnabled) {
      settingInterceptorEnabled.checked = interceptorEnabled;
    }
    if (settingConsoleLog) {
      settingConsoleLog.checked = result.consoleLogs || false;
    }
    // 加载主题设置
    const themePref = result.theme || 'system';
    const themeSelect = document.getElementById('setting-theme');
    if (themeSelect) {
      themeSelect.value = themePref;
    }
    applyTheme(themePref, false);
    updateInterceptorStateUI(interceptorEnabled);
  });
}

// 导出到全局
window.App = window.App || {};
window.App.settings = {
  loadSettings,
  updateInterceptorStateUI
};
