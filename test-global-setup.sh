#!/bin/bash

# Playwright MCP Server 全局安装测试脚本
# 用于验证全局命令是否正确安装和配置

set -e

echo "🔍 测试 Playwright MCP Server 全局安装..."
echo ""

# 测试 1: 检查全局命令是否存在
echo "✅ 测试 1: 检查全局命令"
if command -v mcp-server-playwright &> /dev/null; then
    COMMAND_PATH=$(which mcp-server-playwright)
    echo "   ✓ 命令已找到: $COMMAND_PATH"
else
    echo "   ✗ 命令未找到"
    echo "   请运行: npm link"
    exit 1
fi
echo ""

# 测试 2: 检查帮助信息
echo "✅ 测试 2: 检查帮助信息"
if mcp-server-playwright --help &> /dev/null; then
    echo "   ✓ 帮助命令执行成功"
else
    echo "   ✗ 帮助命令执行失败"
    exit 1
fi
echo ""

# 测试 3: 检查配置文件是否存在
echo "✅ 测试 3: 检查配置文件"
CONFIG_FILE="$PWD/playwright-mcp-config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "   ✓ 配置文件存在: $CONFIG_FILE"
else
    echo "   ✗ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi
echo ""

# 测试 4: 检查扩展目录和文件
echo "✅ 测试 4: 检查扩展目录和文件"
EXTENSION_DIR="$PWD/extension"
if [ -d "$EXTENSION_DIR" ]; then
    echo "   ✓ 扩展目录存在: $EXTENSION_DIR"
    
    # 检查 manifest.json
    if [ -f "$EXTENSION_DIR/manifest.json" ]; then
        echo "   ✓ manifest.json 存在"
    else
        echo "   ✗ manifest.json 不存在"
        exit 1
    fi
    
    # 检查构建的 JS 文件
    if [ -d "$EXTENSION_DIR/lib" ] && [ -f "$EXTENSION_DIR/lib/background.js" ]; then
        echo "   ✓ 扩展已构建 (lib/background.js 存在)"
    else
        echo "   ⚠ 扩展未构建"
        echo "   请运行: cd extension && npm install && npm run build"
    fi
else
    echo "   ✗ 扩展目录不存在: $EXTENSION_DIR"
    exit 1
fi
echo ""

# 测试 5: 测试 MCP 服务器初始化
echo "✅ 测试 5: 测试 MCP 服务器初始化"
INIT_MESSAGE='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}'

RESPONSE=$(echo "$INIT_MESSAGE" | mcp-server-playwright --config "$CONFIG_FILE" --project-isolation 2>&1 | head -1)

if echo "$RESPONSE" | grep -q '"protocolVersion"'; then
    echo "   ✓ MCP 服务器初始化成功"
    echo "   响应: ${RESPONSE:0:80}..."
else
    echo "   ✗ MCP 服务器初始化失败"
    echo "   响应: $RESPONSE"
    exit 1
fi
echo ""

# 显示配置信息
echo "📋 配置摘要"
echo "────────────────────────────────────────"
echo "全局命令路径: $COMMAND_PATH"
echo "配置文件路径: $CONFIG_FILE"
echo "扩展目录路径: $EXTENSION_DIR"
echo "扩展状态: $([ -f "$EXTENSION_DIR/lib/background.js" ] && echo "已构建" || echo "未构建")"
echo ""

# 显示 Claude Desktop 配置建议
echo "🔧 Claude Desktop 配置"
echo "────────────────────────────────────────"
echo "配置文件位置:"
echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo ""
echo "建议配置内容:"
cat << EOF
{
  "mcpServers": {
    "playwright": {
      "command": "mcp-server-playwright",
      "args": [
        "--config",
        "$CONFIG_FILE",
        "--project-isolation"
      ]
    }
  }
}
EOF
echo ""

echo "✅ 所有测试通过！"
echo ""
echo "📚 下一步:"
echo "   1. 更新 Claude Desktop 配置文件"
echo "   2. 重启 Claude Desktop 应用"
echo "   3. 在 Claude 中测试 Playwright MCP 功能"
echo ""
echo "📖 详细文档: ./MCP-SETUP-GUIDE.md"

