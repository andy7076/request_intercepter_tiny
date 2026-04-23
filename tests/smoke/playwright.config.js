// Playwright 配置 —— 专为加载未打包的 Chrome 扩展设计
// MV3 扩展必须使用 "persistent context"（--headed or --headless=new）
// 本地跑：npm run smoke:install && npm run smoke
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: __dirname,
  testMatch: /.*\.spec\.js$/,
  timeout: 30_000,
  reporter: process.env.CI ? 'github' : 'list',
  workers: 1, // 扩展只能在单 context 下可靠加载
  use: {
    trace: 'retain-on-failure'
  }
});
