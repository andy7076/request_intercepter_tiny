# Request Interceptor Tiny

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/request-interceptor-tiny/bdlpkfphbnijjdciolbnnbdchpbdkmik)

**[English](./README.md) | 中文**

**轻量级接口模拟工具**

Request Interceptor Tiny 是一款专为开发者设计的 Chrome 扩展，旨在提供简单、高效的接口数据模拟（Mock）功能。它可以拦截浏览器的 XHR 和 Fetch 请求，并将其响应替换为自定义的 JSON 数据，帮助前端开发者在后端接口未就绪或需要特定测试场景时进行开发和调试。

## ✨ 主要特性

- **🔌 接口模拟 (Mock Response)**  
  拦截任意 HTTP/HTTPS 请求，并返回您自定义的 JSON 响应数据。支持通配符 `*` 匹配 URL。

- **🛠️ 强大的 JSON 编辑器**  
  内置专业级编辑器（基于 CodeMirror），支持：
  - **智能辅助**：实时 JSON 语法校验、错误提示、代码折叠/展开、行号显示。
  - **增强型搜索替换**：全新的搜索体验，支持正则匹配、即时高亮、智能光标跟随，修改内容时互不干扰。
  - **沉浸式编辑**：支持弹窗内全屏编辑及独立标签页（New Tab）模式，自适应布局，轻松应对大型 JSON 数据。

- **🖥️ 侧边栏模式 (Side Panel)**
  利用 Chrome Side Panel API，提供不打扰浏览体验的持久化操作界面，无需反复打开弹窗。

- **🌍 多语言支持 (Internationalization)**
  原生支持中文和英文界面，自动跟随浏览器语言设置，无缝切换。

- **📊 请求日志监控**  
  实时记录所有被拦截的请求详情（URL、方法、时间），让您清楚地知道哪些请求已被成功 Mock。

- **🔁 规则管理**
  - 支持规则的快速创建、编辑、删除和一键启用/禁用。
  - **导入/导出**：支持将规则导出为 JSON 文件分享给团队成员，或从文件导入现有规则。

- **⚡ cURL 快速导入**  
  从浏览器 DevTools 复制请求的 cURL 命令，一键解析并创建规则。自动发起请求获取真实响应作为 Mock 数据模板。

- **🎨 极简现代化 UI**  
  采用深色模式（Dark Mode）设计，融合玻璃拟态风格，界面精致、交互流畅。

- **🚀 轻量安全**  
  基于 Chrome Manifest V3 规范开发，纯原生 JavaScript 实现，无需额外依赖，性能零损耗。

## 📥 安装指南

1. **从 Chrome 网上应用店安装**
   [点击此处前往 Chrome 网上应用店安装](https://chromewebstore.google.com/detail/request-interceptor-tiny/bdlpkfphbnijjdciolbnnbdchpbdkmik)

2. **手动安装 (用于开发)**
   - **获取源码**
     克隆或下载本项目到本地。
   - **加载扩展**
     - 在 Chrome 浏览器地址栏输入 `chrome://extensions/` 并回车。
     - 打开右上角的 **"开发者模式" (Developer mode)** 开关。
     - 点击左上角的 **"加载已解压的扩展程序" (Load unpacked)** 按钮。
     - 选择本项目的根目录。

3. **开始使用**
   安装完成后，点击浏览器工具栏的扩展图标即可使用。

## 📖 使用说明

1. **添加拦截规则**
   - 点击扩展图标打开界面。
   - 切换到 **"添加规则"** 标签页。
   - **方式一：手动填写**
     - **规则名称**：给规则起一个易于识别的名字。
     - **URL 匹配模式**：输入要拦截的接口地址，支持 `*` 通配符（例如：`*://api.example.com/v1/users*`）。
     - **响应内容**：输入您期望返回的 JSON 数据。编辑器会实时校验格式，输入正确时指示灯显示为绿色。
   - **方式二：从 cURL 导入**
     - 在浏览器 DevTools 的 Network 面板中，右键点击请求 → "Copy as cURL"。
     - 点击 **"从 cURL 导入"** 按钮，粘贴命令后点击解析。
     - 扩展会自动发起请求获取真实响应，并填充规则名称、URL 模式和响应内容。
   - 点击 **"保存规则"**。

2. **验证效果**
   - 打开或刷新目标网页。
   - 当网页发起匹配的请求时，扩展会自动拦截并返回您设置的数据。
   - 您可以在扩展的 **"请求日志"** 面板中查看拦截记录。

3. **管理规则**
   - 在 **"规则列表"** 面板中，您可以随时开启/关闭特定规则，或进行编辑和删除操作。
   - 点击右上角的 **导入/导出** 按钮可以进行规则的备份与迁移。

## 🛠️ 技术栈

- **Core**: HTML5, CSS3, Vanilla JavaScript
- **Platform**: Chrome Extension Manifest V3
- **Icons**: Google Fonts (Inter, Outfit), Lucide Icons (SVG)

## 📄 License

本项目采用 [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) 许可协议进行授权。
