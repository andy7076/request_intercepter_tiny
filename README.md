# Request Interceptor Tiny

**English | [中文](./README_CN.md)**

**Lightweight API Mocking Tool**

Request Interceptor Tiny is a Chrome extension designed for developers, providing simple and efficient API mocking capabilities. It intercepts browser XHR and Fetch requests and replaces responses with custom JSON data, helping frontend developers work and debug when backend APIs are not ready or when specific test scenarios are needed.

## ✨ Key Features

- **🔌 API Mocking (Mock Response)**  
  Intercept any HTTP/HTTPS request and return your custom JSON response data. Supports wildcard `*` for URL matching.

- **🛠️ Powerful JSON Editor**  
  Built-in professional editor (based on CodeMirror) with support for:
  - **Smart Assistance**: Real-time JSON syntax validation, error prompts, code folding/expanding, and line numbers.
  - **Search & Replace**: Supports keyword search, regex matching, and batch replacement within the editor.
  - **Fullscreen Mode**: Provides an immersive fullscreen editing experience, ideal for handling large JSON data.

- **🖥️ Side Panel Mode**
  Utilizes Chrome Side Panel API to provide a persistent interface that doesn't disrupt your browsing experience, eliminating the need to repeatedly open popups.

- **🌍 Internationalization Support**
  Native support for English and Chinese interfaces, automatically adapting to your browser language or manual setting.

- **📊 Request Log Monitoring**  
  Real-time logging of all intercepted request details (URL, method, timestamp), giving you clear visibility into which requests have been successfully mocked.

- **🔁 Rule Management**
  - Quick creation, editing, deletion, and one-click enable/disable of rules.
  - **Import/Export**: Export rules to JSON files for team sharing, or import existing rules from files.

- **🎨 Minimalist Modern UI**  
  Dark mode design with glassmorphism style, featuring a refined interface and smooth interactions.

- **🚀 Lightweight & Secure**  
  Built on Chrome Manifest V3 specification, pure native JavaScript implementation with no additional dependencies, zero performance overhead.

## 📥 Installation Guide

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
   - **Rule Name**: Give your rule an easily identifiable name.
   - **URL Match Pattern**: Enter the API address to intercept, supports `*` wildcard (e.g., `*://api.example.com/v1/users*`).
   - **Response Content**: Enter your expected JSON data. The editor validates format in real-time, showing green indicator when correct.
   - Click **"Save Rule"**.

2. **Verify Results**
   - Open or refresh the target webpage.
   - When the page makes a matching request, the extension will automatically intercept and return your configured data.
   - You can view interception records in the extension's **"Request Logs"** panel.

3. **Manage Rules**
   - In the **"Rules List"** panel, you can enable/disable specific rules at any time, or edit and delete them.
   - Click the **Import/Export** button in the top right corner for rule backup and migration.

## 🛠️ Tech Stack

- **Core**: HTML5, CSS3, Vanilla JavaScript
- **Platform**: Chrome Extension Manifest V3
- **Icons**: Google Fonts (Inter, Outfit), Lucide Icons (SVG)

## 📄 License

Summary: This project is licensed under the [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) License.
