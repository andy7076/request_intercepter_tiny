/**
 * 设置管理模块
 * 加载和应用用户设置
 */

// 加载设置
function loadSettings() {
  const { applyTheme } = window.App.theme;
  const settingConsoleLog = document.getElementById('setting-console-log');
  const settingInterceptorEnabled = document.getElementById('setting-interceptor-enabled');

  chrome.storage.local.get(['consoleLogs', 'theme', 'interceptorEnabled'], (result) => {
    if (settingInterceptorEnabled) {
      settingInterceptorEnabled.checked = result.interceptorEnabled !== false;
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
  });
}

// 导出到全局
window.App = window.App || {};
window.App.settings = {
  loadSettings
};
