# Request Interceptor

一个强大的Chrome扩展，用于拦截请求、修改Headers和Response内容。

## ✨ 功能特性

- 🔧 **修改Headers** - 设置、追加或删除Request/Response Headers
- 📝 **Mock Response** - 返回自定义的JSON/文本响应内容
- 🔄 **重定向** - 将匹配的URL重定向到其他地址
- 🚫 **阻止请求** - 拦截并阻止特定请求
- 💾 **导入/导出** - 支持规则的备份和恢复
- 🎨 **暗色主题** - 现代化的UI设计

## 📦 安装

1. 打开Chrome浏览器，访问 `chrome://extensions/`
2. 开启右上角的 **"开发者模式"**
3. 点击 **"加载已解压的扩展程序"**
4. 选择本扩展文件夹

## 🔧 使用方法

### 添加规则

1. 点击浏览器工具栏中的扩展图标
2. 点击"添加规则"标签
3. 填写规则信息：
   - **规则名称**：便于识别的名称
   - **URL匹配模式**：支持通配符 `*`
   - **规则类型**：选择要执行的操作
4. 根据规则类型配置相应选项
5. 点击"保存规则"

### URL匹配模式示例

| 模式                           | 说明                      |
| ------------------------------ | ------------------------- |
| `*://example.com/*`            | 匹配example.com的所有请求 |
| `*://api.example.com/user/*`   | 匹配特定路径              |
| `*://*.example.com/*`          | 匹配所有子域名            |
| `https://example.com/api/v1/*` | 仅匹配HTTPS请求           |

### 规则类型

#### 1. 修改Headers

设置、追加或删除HTTP头信息。

**示例：添加CORS头**

- URL匹配：`*://api.example.com/*`
- Response Header：`Access-Control-Allow-Origin` = `*`

#### 2. Mock Response

返回自定义的响应内容，用于API模拟和测试。

**示例：模拟用户接口**

```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "测试用户",
    "email": "test@example.com"
  }
}
```

#### 3. 重定向

将请求重定向到另一个URL。

**示例：**

- 源URL：`*://old-api.com/*`
- 目标URL：`https://new-api.com/path`

#### 4. 阻止请求

完全阻止匹配的请求。

**示例：阻止广告追踪**

- URL匹配：`*://analytics.google.com/*`

## 💾 导入/导出

### 导出规则

点击"导出规则"按钮，将当前所有规则保存为JSON文件。

### 导入规则

点击"导入规则"按钮，选择之前导出的JSON文件恢复规则。

## ⚠️ 注意事项

1. **Manifest V3限制**：由于Chrome Manifest V3的安全限制，Mock Response功能通过重定向到data URL实现
2. **优先级**：数值越大优先级越高，当多个规则匹配同一请求时，高优先级规则优先执行
3. **规则开关**：可以随时启用/禁用单条规则，无需删除

## 📁 项目结构

```
├── manifest.json      # 扩展配置文件
├── background.js      # 后台服务脚本
├── popup/
│   ├── popup.html     # 弹出页面
│   ├── popup.css      # 样式文件
│   └── popup.js       # 交互逻辑
├── icons/             # 扩展图标
└── README.md          # 说明文档
```

## 🔒 权限说明

- `storage` - 存储规则配置
- `declarativeNetRequest` - 拦截和修改网络请求
- `<all_urls>` - 需要访问所有URL以应用规则

## 📝 更新日志

### v1.0.0

- 初始版本
- 支持修改Headers、Mock Response、重定向、阻止请求
- 支持规则的导入/导出
- 暗色主题UI
