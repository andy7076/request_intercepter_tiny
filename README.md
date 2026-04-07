# Request Interceptor Tiny

**English | [中文](./README_CN.md)**

**Easy-to-use API Mock Tool**

Request Interceptor Tiny is a Chrome extension designed for developers, providing simple and efficient API mocking capabilities. It intercepts browser Fetch and XHR requests and replaces responses with custom content, helping frontend developers work and debug when backend APIs are not ready or when specific test scenarios are needed.

## ✨ Key Features

- **🔌 API Mocking (Mock Response)**  
  Intercept browser Fetch/XHR requests and return your custom response data. Supports wildcard `*` for URL matching.

  > **Note:** The browser Network tab will still show the original request/response (transparent interception), but your application will receive the mocked data.

  > **Scope:** Only applies to Fetch/XHR requests. Page navigation requests such as opening a page directly, link navigation, and iframe `src` are not supported.

- **🛠️ Powerful Response Editor**  
  Built-in professional editor (based on CodeMirror) with support for:
  - **Flexible Content**: Supports text, JSON, HTML, XML, and more.
  - **Smart Assistance**: Real-time JSON syntax validation, syntax highlighting, code folding/expanding, and line numbers.
  - **Enhanced Search & Replace**: Precise regex matching, real-time highlighting, and smart cursor tracking for a seamless editing flow.
  - **Immersive Editing**: Supports in-panel fullscreen mode and independent Tab mode with responsive layout, perfect for large response bodies.

- **🖥️ Side Panel Mode**
  Utilizes Chrome Side Panel API to provide a persistent interface that doesn't disrupt your browsing experience, eliminating the need for separate pop-up windows.

- **🌍 Internationalization Support**
  Native support for English and Chinese interfaces, automatically adapting to your browser language or manual setting.

- **📊 Request Log Monitoring**  
  Real-time logging of matched Fetch/XHR request details. Supports viewing response bodies and comparing original vs mock data (Diff View), giving you clear visibility into the mocking results.

- **🔁 Rule Management**
  - Quick creation, editing, deletion, and one-click enable/disable of rules.
  - **Advanced Settings**: Configure request method, match mode, priority, response status, response delay, and response headers for each rule.
  - **Plugin Switch**: Disable the plugin globally to stop injecting interception scripts into newly opened pages.
  - **Import/Export**: Export rules to JSON files for team sharing, or import existing rules from files.

- **⚡ Quick cURL Import**  
  Copy a request's cURL command from browser DevTools and parse it with one click to create a rule. Automatically fetches the real response to use as a Mock data template.

- **🎨 Minimalist Modern UI**  
  Supports three theme modes — **System**, **Light**, and **Dark** — with smooth switching transitions. Glassmorphism design style with refined interface and fluid interactions.

- **🚀 Lightweight & Secure**  
  Built on Chrome Manifest V3 specification, pure native JavaScript implementation with no additional dependencies, zero performance overhead.

## 📥 Installation Guide

> **Recommended:** [Install from Chrome Web Store](https://chromewebstore.google.com/detail/request-interceptor-tiny/nhofohmjmciklmcompcjoemkbahdipco)

### Manual Installation

1. **Get the Source Code**  
   Clone or download this project to your local machine.

2. **Load the Extension**
   - Enter `chrome://extensions/` in Chrome's address bar and press Enter.
   - Enable **"Developer mode"** toggle in the top right corner.
   - Click the **"Load unpacked"** button in the top left corner.
   - Select the root directory of this project.

3. **Start Using**  
   After installation, click the extension icon in the browser toolbar to start using it.

## 📖 Usage Instructions

1. **Add Interception Rules**
   - Click the extension icon to open the interface.
   - Switch to the **"Add Rule"** tab.
   - **Option 1: Manual Entry**
     - **Rule Name**: Give your rule an easily identifiable name.
     - **URL Match Pattern**: Enter the request address to intercept, supports `*` wildcard (e.g., `*://api.example.com/v1/users*`).
     - **Response Content**: Enter the response content you want to return. Supports text, JSON, HTML, XML, and more.
     - **Advanced Settings**:
       Set these when you need more precise matching or a more realistic mock response.
     - **Request Method**: Limit the rule to a specific method such as `GET`, `POST`, or `DELETE`. Leave it as `All` when the same mock should apply to every method.
     - **Match Mode**:
       `Contains` is suitable for most quick matches, `Wildcard` works well with patterns containing `*`, and `Exact` requires the full URL to match exactly.
     - **Priority**:
       Higher-priority rules are matched first. Use this when multiple rules may match the same request and you need one rule to win consistently.
     - **Response Status**:
       Set the mock HTTP status code, such as `200`, `404`, or `500`, to simulate success, business errors, or server failures.
     - **Response Delay**:
       Add a delay in milliseconds before returning the mock response. Useful for testing loading states, slow interfaces, and timeout handling.
     - **Response Headers**:
       Add headers one row at a time, such as `Content-Type` or `Cache-Control`. This is useful when you want the browser or application to treat the mocked response as HTML, XML, JSON, plain text, downloadable content, or custom-cached data.
   - **Option 2: Import from cURL**
     - In browser DevTools Network panel, right-click a request → "Copy as cURL".
     - Click the **"Import from cURL"** button, paste the command and click parse.
     - The extension will automatically fetch the real response and fill in the rule name, URL pattern, and response content.
   - Click **"Save Rule"**.

2. **Verify Results**
   - Open or refresh the target webpage.
   - When the page makes a matching Fetch/XHR request, the extension will automatically intercept and return your configured data.
   - You can view interception records in the extension's **"Request Logs"** panel.

3. **Manage Rules**
   - In the **"Rules List"** panel, you can enable/disable specific rules at any time, or edit and delete them.
   - Click the **Import/Export** button in the top right corner for rule backup and migration.
   - In **Settings**, you can use the **Plugin Switch** to globally enable or disable the extension. After toggling it, refresh already opened target pages to fully apply the change.

## 🛠️ Tech Stack

- **Core**: HTML5, CSS3, Vanilla JavaScript
- **Platform**: Chrome Extension Manifest V3
- **Icons**: Google Fonts (Inter, Outfit), Lucide Icons (SVG)

## 📄 License

Summary: This project is licensed under the [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) License.
