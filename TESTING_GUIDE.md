# 规则实时生效测试指南

## 问题说明

之前修改规则后,需要刷新页面才能生效。现在已经添加了实时应用规则的功能。

## 新功能

### 1. 自动规则更新监听

- `content.js` 会自动监听 `chrome.storage` 的变化
- 当你在 popup 中修改、添加或删除规则时,规则会自动更新
- 控制台会显示详细的调试日志

### 2. 手动应用规则按钮

在规则列表顶部添加了一个**刷新图标按钮**(蓝色),点击后可以手动触发当前页面重新加载规则。

## 测试步骤

### 方法一:使用自动更新(推荐)

1. **打开测试页面**
   - 打开任意网页(例如: https://jsonplaceholder.typicode.com/)
   - 打开浏览器控制台(F12)

2. **添加一个 Mock 规则**
   - 打开扩展的 Side Panel
   - 添加规则:
     - 规则名称: `测试规则`
     - URL 模式: `*://jsonplaceholder.typicode.com/posts/1*`
     - 规则类型: `Mock Response`
     - 响应内容: `{"test": "规则已生效", "timestamp": "2026-01-28"}`

3. **查看控制台日志**
   - 保存规则后,控制台应该显示:
     ```
     [Request Interceptor Pro] 🔄 规则已更新! 当前启用规则数: 1
     [Request Interceptor Pro] 💡 新的请求将使用更新后的规则
     ```

4. **测试请求**
   - 在控制台执行:
     ```javascript
     fetch("https://jsonplaceholder.typicode.com/posts/1")
       .then((r) => r.json())
       .then(console.log);
     ```
   - 应该看到你的 mock 响应:`{test: "规则已生效", timestamp: "2026-01-28"}`

5. **修改规则**
   - 编辑规则,修改响应内容为: `{"test": "规则已更新", "version": 2}`
   - 保存后,控制台应该再次显示更新通知
   - 重新执行 fetch 请求,应该看到新的响应

### 方法二:使用手动应用按钮

如果自动更新没有生效,可以使用手动应用功能:

1. 在规则列表顶部,点击**蓝色的刷新图标按钮**
2. 应该看到提示: `✅ 规则已应用! (X 条规则)`
3. 控制台会显示: `[Request Interceptor Pro] ✅ 规则重载完成`

## 调试日志说明

### Content Script 日志

```
[Request Interceptor Pro] 🚀 Content Script 开始初始化...
[Request Interceptor Pro] ✅ 已加载 mock 规则: 1
[Request Interceptor Pro] 📋 规则列表: [{name: "测试规则", pattern: "*://..."}]
[Request Interceptor Pro] ✨ 初始化完成,准备拦截请求
```

### 规则更新日志

```
[Request Interceptor Pro] 规则已更新: 1
[Request Interceptor Pro] 当前启用的规则: ["测试规则"]
```

### 请求拦截日志

```
[Request Interceptor Pro] 检查URL: https://jsonplaceholder.typicode.com/posts/1
[Request Interceptor Pro] 当前规则数量: 1
[Request Interceptor Pro] 匹配结果: 匹配到规则: 测试规则
```

## 常见问题

### Q: 修改规则后还是没有效果?

**A:** 尝试以下步骤:

1. 点击"应用规则到当前页面"按钮(蓝色刷新图标)
2. 检查控制台是否有错误信息
3. 确认规则的 URL 模式是否正确匹配
4. 如果还是不行,刷新页面

### Q: 控制台没有显示日志?

**A:**

1. 确保控制台的日志级别包含 "Info" 和 "Log"
2. 检查是否有过滤器隐藏了日志
3. 尝试刷新页面重新加载 content script

### Q: "应用规则"按钮点击后没反应?

**A:**

1. 检查是否在 Chrome 内部页面(chrome://)
2. 查看控制台是否有错误信息
3. 确认扩展有权限访问当前页面

## 技术实现

### 规则更新流程

1. 用户在 popup 中修改规则
2. `background.js` 更新 `chrome.storage.local`
3. `content.js` 的 `chrome.storage.onChanged` 监听器被触发
4. `content.js` 更新内存中的 `mockRules` 数组
5. `content.js` 向页面发送 `REQUEST_INTERCEPTOR_RULES_UPDATED` 消息
6. `injected.js` 接收消息并在控制台显示通知
7. 下一个匹配的请求会使用新规则

### 手动应用流程

1. 用户点击"应用规则"按钮
2. `popup.js` 获取当前活动标签页
3. 向标签页发送 `RELOAD_RULES` 消息
4. `content.js` 接收消息并重新从 storage 加载规则
5. 返回成功响应并显示 toast 提示

## 下一步优化建议

如果还有问题,可以考虑:

1. 添加规则版本号,确保规则同步
2. 实现规则变更的 diff 对比
3. 添加规则预览功能
4. 支持规则的热重载通知
