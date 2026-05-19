# agent-searchkit

**为 AI Agent 打造的本地优先 SearXNG 搜索基础设施。**

[English README](./README.md) | [MCP skill](./skills/mcp.md) | [OpenClaw skill](./skills/openclaw.md) | [Standalone CLI skill](./skills/standalone.md)

agent-searchkit 为 Agent 提供一套本地 SearXNG 搜索栈，包含标准化结果、引用、MCP 工具、OpenClaw 集成，以及可选启发式 rerank。它不应该被当作最终答案排序器：它返回的是检索候选，最终语义筛选和排序应该由调用方 LLM 完成。

## 目录

- [提供什么](#提供什么)
- [前置条件](#前置条件)
- [快速开始](#快速开始)
- [MCP 配置](#mcp-配置)
- [OpenClaw 配置](#openclaw-配置)
- [CLI 使用](#cli-使用)
- [输出与引用](#输出与引用)
- [中文搜索行为](#中文搜索行为)
- [配置项](#配置项)
- [故障排查](#故障排查)
- [开发](#开发)

## 提供什么

- 本地 SearXNG 搜索，并启用 JSON 输出。
- MCP stdio server：[agent-searchkit MCP skill](./skills/mcp.md)。
- OpenClaw web search provider：[OpenClaw skill](./skills/openclaw.md)。
- 独立 search / research CLI：[Standalone CLI skill](./skills/standalone.md)。
- 标准化结果字段：`title`、`url`、`snippet`、`host`、`publishedDate`、`rank`。
- 可选 citation 对象和 sources 列表，便于输出 Markdown 引用。
- 明确的最终排序边界：工具返回候选，LLM 做最终选择。

## 前置条件

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2，用于运行本地 SearXNG。
- [Node.js](https://nodejs.org/) 18+，用于 MCP 和 CLI 命令。

## 快速开始

### 1. 启动 SearXNG

macOS / Linux:

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit/services
cp .env.example .env.local
./manage.sh up
```

Windows PowerShell:

```powershell
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit\services
Copy-Item .env.example .env.local
.\manage.ps1 up
```

验证 Web UI 和 JSON API 都可用：

```bash
curl -I http://127.0.0.1:8888/
curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
```

第二条命令必须返回包含 `query` 或 `results` 等字段的 JSON。如果返回 `403 Forbidden`，通常说明 SearXNG 没有启用 JSON 输出。

仓库内置服务配置会把 [services/searxng/settings.yml](./services/searxng/settings.yml) 挂载进容器，并启用：

```yaml
search:
  formats:
    - html
    - json
```

默认管理脚本只启动 SearXNG。Valkey、ntfy 等可选服务放在 `up-extras` / `restart-extras` 后面，避免普通 MCP 安装被无关镜像拉取失败卡住。

### 2. 选择一条 Agent 接入路径

任选一种：

- MCP 客户端：看 [MCP 配置](#mcp-配置)。
- OpenClaw 内置 `web_search`：看 [OpenClaw 配置](#openclaw-配置)。
- 脚本和本地 smoke test：看 [CLI 使用](#cli-使用)。

## MCP 配置

适用于 Claude Desktop、Cursor、LM Studio、Continue、OpenClaw MCP plugin，以及其它 MCP 客户端。

标准配置，不需要提前全局安装：

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "agent-searchkit@latest",
        "agent-searchkit-mcp"
      ],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

需要可复现时固定版本：

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "agent-searchkit@0.3.26",
        "agent-searchkit-mcp"
      ],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

如果已经全局安装：

```bash
npm install -g agent-searchkit@latest
agent-searchkit-mcp --help
```

配置为：

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "agent-searchkit-mcp",
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

Windows GUI 客户端找不到 npm bin shim 时的兜底方案：

```powershell
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
node .\bin\agent-searchkit-mcp --help
```

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "node",
      "args": ["D:\\github\\agent-searchkit\\bin\\agent-searchkit-mcp"],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

MCP 暴露这些工具：

| Tool | 用途 |
|---|---|
| `web_searchkit_search` | 搜索 SearXNG 并返回标准化候选 |
| `web_searchkit_research` | 保存一次带 checkpoint 的 research run |
| `web_searchkit_extract` | 提取网页可读内容 |
| `web_searchkit_status` | 检查搜索栈状态 |

Agent 指令可链接到 [skills/mcp.md](./skills/mcp.md)。

## OpenClaw 配置

用于把 OpenClaw 内置 `web_search` 路由到 agent-searchkit。

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw config set tools.web.search.provider agent-searchkit
openclaw config validate
openclaw gateway restart
```

安装 flag 的原因：包里包含可选网页提取和本地诊断能力，会使用 Node process-spawn API。从不可信 fork 安装前请先审查源码。

OpenClaw 专用说明见 [skills/openclaw.md](./skills/openclaw.md)。

## CLI 使用

从 npm 安装：

```bash
npm install -g agent-searchkit@latest
```

或从源码运行：

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
```

直接搜索：

```bash
agent-searchkit-search "Python 3.14 new features"
agent-searchkit-search -c news -n 5 "AI regulation 2026"
agent-searchkit-search -l zh-CN "马斯克 最近 动向 新闻"
agent-searchkit-search --json -n 3 "OpenClaw web_search provider"
```

运行带 checkpoint 的 research：

```bash
agent-searchkit-research "local LLM inference benchmarks 2026"
```

CLI 详情见 [skills/standalone.md](./skills/standalone.md)。

## 输出与引用

`web_searchkit_search` 返回标准化检索候选。输出包含：

```json
{
  "query": "马斯克 最近 动向 新闻",
  "language": "zh-CN",
  "rerankVersion": "v1.0",
  "llmRerankHint": "Treat these as retrieval candidates...",
  "results": [
    {
      "rank": 1,
      "title": "埃隆·马斯克_百度百科",
      "url": "https://baike.baidu.com/item/...",
      "snippet": "...",
      "host": "baike.baidu.com"
    }
  ]
}
```

重要排序规则：

> `rank` 是检索候选顺序，不是最终答案顺序。调用方 LLM 应根据用户意图、`title`、`snippet`、`host`、`publishedDate`、`citation` 做最终筛选、分组和重排。

开启引用：

```json
{
  "query": "OpenClaw web_search provider",
  "citations": true
}
```

每条结果会包含：

```json
{
  "citation": {
    "ref": "[1]",
    "formatted": "[1] Page Title. https://example.com/page (accessed 2026-05-19)",
    "inline": "(example.com, 2026)"
  }
}
```

推荐 LLM 输出格式：

```markdown
当前 provider 路径通过 `tools.web.search.provider` 配置，并返回带 citation 元数据的标准化候选 [1]。

References:
[1] Page Title. https://example.com/page
```

写 skill 或 Agent prompt 时，优先使用标准 Markdown 链接：

```markdown
See [Agent Searchkit MCP setup](./skills/mcp.md).
Use [OpenClaw setup](./skills/openclaw.md) when routing built-in `web_search`.
```

## 中文搜索行为

SearXNG/Bing 对 `马斯克 最近 动向 新闻` 或 `马斯克最近动向新闻` 这类中文多关键词，可能退化到 `马` 这种单字结果。

agent-searchkit 对 CJK 查询会：

- 如果中文 query 被传成 `en-US`，自动改为 `zh-CN`；
- 对常见新闻修饰词抽核心实体，例如 `马斯克 最近 动向 新闻` -> `马斯克`；
- 显式传 curated engines：`bing,bing news,wikipedia`；
- 保留 SearXNG 候选顺序，把最终语义重排交给调用方 LLM。

这个行为是故意保守的：不假装本地 token 启发式可以理解所有中文语义。

## 配置项

| 字段 | 默认值 | 说明 |
|---|---|---|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG 地址 |
| `defaultLanguage` | `zh-CN` | 默认搜索语言 |
| `defaultEngines` | `["bing", "bing news", "wikipedia"]` | 显式传给 SearXNG 的 engines |
| `defaultLimit` | `8` | 每次查询结果数 |
| `rerankEnabled` | `true` | 非 CJK 查询启用启发式 rerank |
| `defaultRerankVersion` | `v1.4` | 默认启发式 rerank 版本 |
| `defaultMode` | `auto` | 默认搜索模式 |

支持的 `rerankVersion`：

| 版本 | 含义 |
|---|---|
| `v1.0` | SearXNG 原始候选顺序 |
| `v1.1` | 启发式 hybrid |
| `v1.2` | 启发式 + snippet embedding |
| `v1.3` | 自适应 hybrid |
| `v1.4` | 检索优先自适应，默认 |
| `v1.5` | planner-aware retrieval-first |
| `v2.0` | baseline-preserving hybrid |

CJK 查询即使请求了 rerank version，也可能报告 `v1.0`，因为最终语义排序应该由调用方 LLM 完成。

## 故障排查

### SearXNG JSON 返回 403

SearXNG 可能没有启用 JSON 输出。使用仓库内置服务，或确认配置包含：

```yaml
search:
  formats:
    - html
    - json
```

### MCP bridge timeout

使用 `agent-searchkit >= 0.3.20`。MCP server 已兼容标准 `Content-Length` frame 和 JSON-lines initialize frame。

### Windows npx 找不到 bin

先试标准 `--package` 写法：

```powershell
npx -y --package agent-searchkit@latest agent-searchkit-mcp --help
```

如果 GUI 启动的 MCP 客户端仍然找不到，使用 [MCP 配置](#mcp-配置) 里的全局安装或本地 `node ...\bin\agent-searchkit-mcp` 兜底方案。

### 中文结果仍然异常

检查客户端实际发送的 query。对新闻式中文短语，agent-searchkit 应该把核心实体发给 SearXNG。用 `debug=true` 检查 `retrieval.queryVariants` 和返回候选。

## 开发

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
npm test
npm run test:mcp
npm run test:rollout
```

发布前：

```bash
npm run build
npm test
npm run test:mcp
npm run test:rollout
git diff --check
npm publish
```

## License

[MIT](./LICENSE)
