# Chrome Extension Loading Status

## 问题诊断

### 症状
通过 Playwright MCP 启动的 Chromium 浏览器中，配置的 Chrome 扩展没有加载，`chrome://extensions` 页面显示为空。

### 调查过程

1. **配置验证** ✅
   - 配置文件 `playwright-mcp-config.json` 正确包含了扩展路径
   - 扩展目录存在且 manifest.json 有效
   - 扩展已经构建（lib/background.js 存在）

2. **代码逻辑验证** ✅
   - `enhanceLaunchOptionsWithExtensions` 函数逻辑正确
   - 扩展路径会被正确提取并转换为启动参数
   - 最终参数包含：`--disable-extensions-except` 和 `--load-extension`

3. **直接测试验证** ✅
   - 创建测试脚本 `verify-extension-loaded.js`
   - 使用相同的参数和用户数据目录
   - **结果：扩展成功加载！**

4. **MCP 服务器测试** ❌
   - 通过 MCP 工具启动的浏览器中扩展未加载
   - 多次重启浏览器会话仍然无效

### 根本原因

**MCP 配置使用的是 npm 上的 `@ai-coding-labs/playwright-mcp-plus@latest`，而该版本可能缓存了旧代码或npm包未正确发布最新的扩展加载修复。**

关键提交：
- `5010e7c`: 修复扩展加载问题，确保扩展在持久化上下文中正确加载
- `46420f1`: Chrome extension loading fix and session-level extension isolation

这些修复在本地代码中存在，但通过 `npx -y @ai-coding-labs/playwright-mcp-plus@latest` 安装的版本可能不包含。

## 解决方案

### 方案 1：使用本地代码（推荐用于开发）✅

修改 `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "playwright-plus": {
      "command": "node",
      "args": [
        "/Users/cc11001100/github/vibe-coding-labs/playwright-plus-mcp/cli.js",
        "--config",
        "/Users/cc11001100/github/vibe-coding-labs/playwright-plus-mcp/playwright-mcp-config.json",
        "--project-isolation"
      ]
    }
  }
}
```

**重要：修改后必须重启 Cursor 使配置生效。**

**注意：** 入口文件是 `cli.js`（根据 `package.json` 的 `bin` 字段），不是 `lib/index.js`（那是库文件）。

### 方案 2：发布新版本到 npm（推荐用于生产）

1. 确保本地代码已构建：
```bash
cd /Users/cc11001100/github/vibe-coding-labs/playwright-plus-mcp
npm run build
```

2. 发布新版本：
```bash
npm version patch
npm publish
```

3. 清除 npx 缓存（如果需要）：
```bash
rm -rf ~/.npm/_npx
```

4. 在 MCP 配置中继续使用 `@ai-coding-labs/playwright-mcp-plus@latest`

### 方案 3：指定具体版本号

如果 npm 上的版本已更新，可以强制使用新版本：

```json
{
  "mcpServers": {
    "playwright-plus": {
      "command": "npx",
      "args": [
        "-y",
        "@ai-coding-labs/playwright-mcp-plus@0.0.45",  // 使用新版本号
        "--config",
        "/Users/cc11001100/github/vibe-coding-labs/playwright-plus-mcp/playwright-mcp-config.json",
        "--project-isolation"
      ]
    }
  }
}
```

## 验证步骤

1. 确保配置已更新
2. 重启 Cursor
3. 通过 MCP 工具启动浏览器：
```javascript
mcp_playwright-plus_browser_navigate({
  url: "chrome://extensions",
  projectDrive: "/",
  projectPath: "/Users/cc11001100/github/vibe-coding-labs/playwright-plus-mcp"
})
```
4. 检查扩展是否出现在列表中

## 技术细节

### 扩展加载流程

1. MCP 配置文件 (`playwright-mcp-config.json`) 包含：
```json
{
  "browser": {
    "launchOptions": {
      "args": [
        "--load-extension=/path/to/extension"
      ]
    }
  }
}
```

2. `EnhancedPersistentContextFactory.createContext()` 调用：
   - `enhanceLaunchOptionsWithExtensions(launchOptions, userDataDir)`
   - 提取现有的 `--load-extension` 参数
   - 添加 MCP 管理的扩展路径（如果有）
   - 生成最终参数：
     - `--disable-extensions-except=<paths>`
     - `--load-extension=<paths>`

3. Playwright 使用增强后的选项启动浏览器：
```javascript
await chromium.launchPersistentContext(userDataDir, enhancedLaunchOptions)
```

### 关键文件

- `src/enhancedBrowserContextFactory.ts` (line 26-70): 扩展增强逻辑
- `lib/enhancedBrowserContextFactory.js` (line 26-70): 编译后的 JS
- `src/tools/extensions.ts` (line 347-357): `getInstalledExtensionPaths` 函数
- `playwright-mcp-config.json`: 用户配置
- `~/.cursor/mcp.json`: MCP 服务器配置

## 下一步行动

1. [ ] 重启 Cursor 以加载更新的 MCP 配置
2. [ ] 测试扩展是否正确加载
3. [ ] 如果测试成功，考虑发布新版本到 npm
4. [ ] 更新文档说明扩展加载的配置方法

## 参考

- `EXTENSION_LOADING_FIX.md`: 扩展加载修复的详细文档
- `verify-extension-loaded.js`: 独立测试脚本
- `debug-full-mcp-flow.js`: MCP 流程调试脚本

