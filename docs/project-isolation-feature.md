# 项目级别隔离功能设计文档

## 背景

### 问题描述

当前 Playwright MCP 在多实例运行时存在以下问题：

1. **默认模式（持久化）**：多个实例使用相同的用户数据目录会发生冲突，导致启动失败
2. **--isolated 模式**：每次重启后用户数据丢失，无法保持登录状态等持久化信息
3. **配置复杂**：现有方案需要用户手动配置不同的参数，在实际MCP使用场景中难以实现

### 核心挑战

经过深入调研发现，基于 `process.cwd()` 的方案在MCP客户端环境中无法生效，因为：
- MCP服务器的工作目录是客户端（如 Claude Desktop）的安装目录
- 无法通过环境变量传递项目信息（MCP配置不支持自定义环境变量）
- 无法修改MCP客户端配置文件（用户无法控制）

### 需求

需要一个能够：
- 自动为每个项目生成独立的用户数据目录
- 保持数据持久化（登录状态、cookies、本地存储等）
- 支持多实例并发运行而不冲突
- 无需修改MCP客户端配置，用户使用简单
- 在项目目录内管理会话数据，便于版本控制忽略

## 解决方案

### 设计思路

通过工具参数传递项目信息的方案：

1. **入口工具识别**：识别所有可能触发浏览器初始化的MCP工具
2. **参数扩展**：为这些工具添加可选的项目信息参数
3. **本地存储**：在项目目录下创建 `.user-session-data-directory` 文件夹
4. **延迟初始化**：利用浏览器上下文的懒加载特性，在获得项目信息后再创建

### 技术原理

**时序优势**：
- MCP服务器启动时不创建浏览器上下文
- 客户端调用工具时传递项目信息
- 工具调用 `context.ensureTab()` 时才创建浏览器上下文
- 此时已获得项目信息，可以创建项目特定的用户数据目录

**目录结构**：
```
/path/to/user/project/
├── src/
├── package.json
├── .gitignore                           # 用户需要添加 .user-session-data-directory/
└── .user-session-data-directory/       # 新创建的会话数据目录
    ├── Default/                         # Chromium用户数据
    ├── Local State
    └── ...其他浏览器数据文件
```

## 实现计划

### 1. 识别入口工具

需要添加项目参数的工具（所有可能触发浏览器初始化的工具）：

**核心入口工具**：
- `browser_navigate` - 导航到URL（最常见入口）
- `browser_snapshot` - 获取页面快照
- `browser_tab_list` - 列出标签页
- `browser_tab_new` - 创建新标签页
- `browser_close` - 关闭浏览器
- `browser_resize` - 调整窗口大小
- `browser_wait_for` - 等待条件
- `browser_install` - 安装浏览器

### 2. 新增项目隔离模块

创建 `src/projectIsolation.ts` 文件，包含：

```typescript
/**
 * 项目隔离功能模块
 * 处理基于项目路径的用户数据目录创建和管理
 */

export interface ProjectInfo {
  projectDrive?: string;    // 项目所在盘符 (如 "C:", "/")
  projectPath?: string;     // 项目绝对路径
}

export class ProjectIsolationManager {
  /**
   * 根据项目信息创建用户数据目录路径
   */
  static createUserDataDir(projectInfo: ProjectInfo): string | undefined;
  
  /**
   * 确保项目数据目录存在
   */
  static ensureProjectDataDir(userDataDir: string): Promise<void>;
  
  /**
   * 验证项目路径的有效性
   */
  static validateProjectPath(projectPath: string): boolean;
  
  /**
   * 生成 .gitignore 提示信息
   */
  static getGitignoreHint(): string;
}
```

### 3. 扩展工具参数 Schema

为入口工具添加统一的项目信息参数：

```typescript
// 在 src/projectIsolation.ts 中定义
export const projectIsolationSchema = z.object({
  projectDrive: z.string().describe('Project drive letter or root (e.g., "C:", "/") for session isolation'),
  projectPath: z.string().describe('Absolute path to project root directory for session isolation')
});
```

在各个工具中使用：
```typescript
// 例如在 src/tools/navigate.ts 中
const navigate = defineTool({
  schema: {
    name: 'browser_navigate',
    inputSchema: z.object({
      url: z.string().describe('The URL to navigate to'),
    }).merge(projectIsolationSchema), // 合并项目隔离参数
  },
  // ...
});
```

### 4. 修改 Context 类

在 `src/context.ts` 中添加项目信息存储：

```typescript
export class Context {
  // 新增属性
  private _projectInfo?: ProjectInfo;
  
  // 新增方法
  setProjectInfo(projectInfo: ProjectInfo): void {
    if (!this._projectInfo && (projectInfo.projectDrive || projectInfo.projectPath)) {
      this._projectInfo = projectInfo;
    }
  }
  
  getProjectInfo(): ProjectInfo | undefined {
    return this._projectInfo;
  }
  
  // 修改现有方法，传递项目信息给 BrowserContextFactory
  private async _setupBrowserContext(): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    // ... 现有逻辑
    const result = await this._browserContextFactory.createContext(
      this.clientVersion!, 
      this._projectInfo  // 传递项目信息
    );
    // ...
  }
}
```

### 5. 修改 BrowserContextFactory

更新 `src/browserContextFactory.ts` 中的接口和实现：

```typescript
export interface BrowserContextFactory {
  createContext(
    clientVersion?: { name: string; version: string }, 
    projectInfo?: ProjectInfo  // 新增参数
  ): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }>;
}

class PersistentContextFactory implements BrowserContextFactory {
  async createContext(
    clientVersion?: { name: string; version: string }, 
    projectInfo?: ProjectInfo
  ): Promise<{ browserContext: playwright.BrowserContext, close: () => Promise<void> }> {
    await injectCdpPort(this.browserConfig);
    testDebug('create browser context (persistent)');
    
    // 使用项目信息创建用户数据目录
    const userDataDir = this.browserConfig.userDataDir ?? 
      await this._createUserDataDir(projectInfo);
    
    // ... 其余逻辑保持不变
  }
  
  private async _createUserDataDir(projectInfo?: ProjectInfo): Promise<string> {
    // 如果提供了项目信息，使用项目隔离管理器
    if (projectInfo?.projectPath && projectInfo?.projectDrive) {
      const projectUserDataDir = ProjectIsolationManager.createUserDataDir(projectInfo);
      if (projectUserDataDir) {
        await ProjectIsolationManager.ensureProjectDataDir(projectUserDataDir);
        return projectUserDataDir;
      }
    }
    
    // 否则使用默认逻辑
    return this._defaultCreateUserDataDir();
  }
}
```

### 6. 工具处理逻辑

在每个入口工具中添加项目信息处理：

```typescript
// 例如在 src/tools/navigate.ts 中
const navigate = defineTool({
  handle: async (context, params, response) => {
    // 处理项目信息（仅在首次调用时）
    if (params.projectDrive && params.projectPath) {
      context.setProjectInfo({
        projectDrive: params.projectDrive,
        projectPath: params.projectPath
      });
    }
    
    // 原有逻辑
    const tab = await context.ensureTab(); // 此时会创建浏览器上下文
    await tab.navigate(params.url);
    
    response.setIncludeSnapshot();
    response.addCode(`await page.goto('${params.url}');`);
  },
});
```

## 用户使用方式

### 基本使用（无隔离）

```javascript
// 现有用法保持不变
await client.callTool('browser_navigate', {
  url: 'https://example.com'
});
```

### 项目隔离使用

```javascript
// 第一次调用时提供项目信息
await client.callTool('browser_navigate', {
  url: 'https://example.com',
  projectDrive: 'C:',  // Windows: "C:", "D:" 等；Unix: "/"
  projectPath: 'C:\\Users\\user\\projects\\my-frontend'  // 项目绝对路径
});

// 后续调用无需再提供项目信息
await client.callTool('browser_snapshot', {});
await client.callTool('browser_click', { element: 'button', ref: 'ref123' });
```

### 客户端集成示例

AI客户端（如 Claude Desktop）可以自动传递项目信息：

```javascript
// 客户端可以自动检测当前项目路径并传递
const currentProjectPath = getCurrentWorkspaceFolder(); // 获取当前项目路径
const projectDrive = path.parse(currentProjectPath).root; 

await client.callTool('browser_navigate', {
  url: 'https://example.com',
  projectDrive: projectDrive,
  projectPath: currentProjectPath
});
```

## 目录结构和 Git 管理

### 创建的目录结构

```
项目根目录/
├── .user-session-data-directory/     # 浏览器会话数据（需要忽略）
│   ├── Default/                      # 用户配置文件
│   ├── Local State                   # 本地状态
│   ├── Cookies                       # Cookie数据
│   └── ...                          # 其他浏览器数据
├── .gitignore                        # 需要添加忽略规则
├── src/
└── package.json
```

### Git 忽略配置

用户需要在项目的 `.gitignore` 文件中添加：

```gitignore
# Playwright MCP session data (auto-generated)
.user-session-data-directory/
```

### 自动提示机制

当检测到项目目录下创建了会话数据目录，但 `.gitignore` 文件中没有对应规则时，在控制台输出提示信息：

```
📌 Playwright MCP Notice:
   Session data directory created at: .user-session-data-directory/
   Please add the following line to your .gitignore file:
   
   .user-session-data-directory/
   
   This will prevent browser session data from being committed to your repository.
```

## 兼容性和向后兼容

### 参数优先级

1. **现有参数优先**：`--user-data-dir` 和 `--isolated` 参数仍然有最高优先级
2. **工具参数**：项目信息参数仅在没有明确指定用户数据目录时生效
3. **默认行为**：如果既没有命令行参数也没有工具参数，使用原有的默认行为

### 向后兼容性

- **100% 向后兼容**：所有现有的工具调用方式保持不变
- **可选参数**：项目信息参数都是可选的，不影响现有用户
- **渐进增强**：用户可以选择性地在需要隔离的项目中使用新参数

## 实现时间线

### 第一阶段：核心功能实现
1. 创建 `src/projectIsolation.ts` 模块
2. 定义项目信息接口和工具Schema扩展
3. 实现 `ProjectIsolationManager` 类

### 第二阶段：工具参数扩展  
1. 识别并更新所有入口工具的参数Schema
2. 添加项目信息处理逻辑到工具Handler中
3. 确保参数验证和错误处理

### 第三阶段：浏览器上下文集成
1. 修改 `Context` 类添加项目信息存储
2. 更新 `BrowserContextFactory` 接口和实现
3. 集成项目隔离逻辑到用户数据目录创建流程

### 第四阶段：用户体验优化
1. 添加 `.gitignore` 提示功能
2. 实现目录创建和权限处理
3. 添加详细的错误信息和调试日志

### 第五阶段：测试和文档
1. 编写单元测试和集成测试
2. 更新README和使用文档
3. 添加示例和最佳实践指南

## 风险评估和缓解措施

### 潜在风险

1. **路径安全性**：恶意路径注入攻击
   - **缓解措施**：严格的路径验证和规范化
   - **实现**：使用 `path.resolve()` 和路径模式验证

2. **权限问题**：项目目录无写入权限
   - **缓解措施**：权限检查和友好的错误提示
   - **实现**：创建目录前检查写入权限

3. **磁盘空间**：每个项目都创建独立的会话数据
   - **缓解措施**：在文档中说明并提供清理指南
   - **实现**：考虑添加清理工具或过期策略

4. **路径长度限制**：Windows系统的路径长度限制
   - **缓解措施**：路径长度检查和警告
   - **实现**：在Windows上检查260字符限制

### 错误处理策略

1. **参数验证错误**：清晰的错误消息指导用户修正
2. **权限错误**：提供具体的解决步骤
3. **路径错误**：验证路径存在性和有效性
4. **创建失败**：回退到默认的用户数据目录创建逻辑

## 测试计划

### 单元测试
1. `ProjectIsolationManager` 的所有公共方法
2. 项目路径验证和规范化逻辑
3. 用户数据目录路径生成算法
4. 参数Schema验证逻辑

### 集成测试
1. 多个项目同时运行的隔离测试
2. 项目信息参数在不同工具中的传递
3. 浏览器上下文创建和用户数据目录使用
4. 与现有命令行参数的优先级测试

### 端到端测试
1. 完整的项目隔离流程测试
2. 不同操作系统下的路径处理
3. 权限问题和错误恢复测试
4. 长期使用的数据持久化测试

## 文档更新计划

### 用户文档
1. **README.md**：添加项目隔离功能说明
2. **使用指南**：详细的配置和使用步骤
3. **最佳实践**：推荐的项目结构和Git配置
4. **故障排除**：常见问题和解决方案

### 开发者文档
1. **API文档**：新增接口和参数说明
2. **架构文档**：项目隔离的技术实现细节
3. **贡献指南**：如何为项目隔离功能贡献代码
4. **测试文档**：测试用例编写和执行指南

## 总结

本方案通过工具参数传递项目信息的创新方式，巧妙地解决了MCP环境中项目隔离的技术难题。主要优势包括：

1. **技术可行性高**：利用浏览器上下文懒加载特性，在正确的时机获取项目信息
2. **用户体验优秀**：无需修改MCP配置，AI客户端可以自动传递项目信息
3. **兼容性完美**：100%向后兼容，不影响现有用户的使用
4. **实现复杂度低**：通过新增模块和最小化修改现有代码，降低维护成本
5. **扩展性良好**：为未来的功能扩展（如项目级配置）奠定了基础

该方案不仅解决了多实例运行冲突和数据持久化的核心问题，还为Playwright MCP在企业级多项目环境中的应用提供了强有力的支持。 