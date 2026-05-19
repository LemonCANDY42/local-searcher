<p align="center">
  <img src="https://img.shields.io/badge/🔍-agent--searchkit-blueviolet?style=for-the-badge&labelColor=0d1117&color=58a6ff" alt="agent-searchkit">
</p>

<h1 align="center">agent-searchkit</h1>

<p align="center">
  <strong>为 AI Agent 打造的本地搜索基础设施</strong><br>
  SearXNG · MCP · OpenClaw · 引用输出 · LLM 最终重排
</p>

<p align="center">
  <a href="./README.md">English</a> ·
  <a href="#-快速开始">快速开始</a> ·
  <a href="#-mcp-配置">MCP</a> ·
  <a href="#-openclaw-配置">OpenClaw</a> ·
  <a href="#-输出与引用">引用</a> ·
  <a href="#-配置项">配置项</a>
</p>

<p align="center">
  <a href="https://github.com/LemonCANDY42/agent-searchkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-00d56b?style=flat-square&labelColor=0d1117" alt="License"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/stargazers"><img src="https://img.shields.io/github/stars/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ffd700" alt="Stars"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/issues"><img src="https://img.shields.io/github/issues/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ff6b6b" alt="Issues"></a>
  <a href="https://www.npmjs.com/package/agent-searchkit"><img src="https://img.shields.io/npm/v/agent-searchkit?style=flat-square&labelColor=0d1117&color=58a6ff" alt="npm"></a>
</p>

---

## ✨ Highlights

- 🔍 **本地 SearXNG 搜索栈** — 仓库管理 Docker Compose，并启用 JSON 搜索输出。
- 🔌 **MCP-ready** — 支持 Claude Desktop、Cursor、LM Studio、Continue、OpenClaw MCP 等客户端。
- 🧭 **OpenClaw provider** — 可把内置 `web_search` 路由到本地 SearXNG。
- 📎 **引用优先输出** — 可选 `citation` 对象和 Markdown 友好的引用格式。
- 🧠 **LLM 最终重排边界** — agent-searchkit 返回检索候选，最终语义筛选和排序由调用方 LLM 完成。
- 🇨🇳 **CJK 请求整形** — 中文新闻式查询会先抽核心实体再请求 SearXNG。

---

## 📋 前置条件

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2，用于运行本地 SearXNG。
- [Node.js](https://nodejs.org/) 18+，用于 MCP 和 CLI 命令。

---

## ⚡ 快速开始

### 1️⃣ 启动 SearXNG

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

验证 Web UI 和 JSON API：

```bash
curl -I http://127.0.0.1:8888/
curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
```

第二条命令必须返回包含 `query` 或 `results` 等字段的 JSON。如果返回 `403 Forbidden`，说明 SearXNG 没有启用 JSON 输出。仓库内置 [services/searxng/settings.yml](./services/searxng/settings.yml) 已启用：

```yaml
search:
  formats:
    - html
    - json
```

默认管理脚本只启动 SearXNG。Valkey、ntfy 等可选服务放在 `up-extras` / `restart-extras` 后面，不会影响普通 MCP 安装。

### 2️⃣ 选择接入方式

- MCP 客户端：看 [MCP 配置](#-mcp-配置)。
- OpenClaw 内置 `web_search`：看 [OpenClaw 配置](#-openclaw-配置)。
- 本地脚本和 smoke test：看 [CLI 使用](#-cli-使用)。

---

## 🔌 MCP 配置

`agent-searchkit-mcp` 是 stdio MCP server。`SEARXNG_BASE_URL` 指向你的本地 SearXNG。

**标准配置，不需要提前全局安装：**

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

**固定版本配置：**

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "agent-searchkit@0.3.33",
        "agent-searchkit-mcp"
      ],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

**全局安装方案：**

```bash
npm install -g agent-searchkit@latest
agent-searchkit-mcp --help
```

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

**Windows 本地仓库兜底方案：**

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

Agent 指令可链接到 [skills/mcp.md](./skills/mcp.md)。

---

## 🧭 OpenClaw 配置

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw config set tools.web.search.provider agent-searchkit
openclaw config validate
openclaw gateway restart
```

OpenClaw 可能要求 `--dangerously-force-unsafe-install`，因为可选页面提取和本地诊断会使用 Node process-spawn API。从不可信 fork 安装前请审查源码。

OpenClaw 专用说明见 [skills/openclaw.md](./skills/openclaw.md)。

---

## 🖥️ CLI 使用

```bash
npm install -g agent-searchkit@latest
agent-searchkit-search "Python 3.14 new features"
agent-searchkit-search -c news -n 5 "AI regulation 2026"
agent-searchkit-search -l zh-CN "马斯克 最近 动向 新闻"
agent-searchkit-search --json -n 3 "OpenClaw web_search provider"
agent-searchkit-research "local LLM inference benchmarks 2026"
```

CLI 详情见 [skills/standalone.md](./skills/standalone.md)。

---

## 📎 输出与引用

`web_searchkit_search` 返回标准化检索候选：

```json
{
  "query": "Elon Musk recent news",
  "language": "en-US",
  "rerankVersion": "v1.4",
  "llmRerankHint": "Treat these as retrieval candidates...",
  "results": [
    {
      "rank": 1,
      "title": "Elon Musk latest news",
      "url": "https://example.com/...",
      "snippet": "...",
      "host": "baike.baidu.com"
    }
  ]
}
```

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

推荐最终回答格式：

```markdown
这个 provider 可以把内置 web search 路由到 agent-searchkit [1]。

References:
[1] Page Title. https://example.com/page
```

写 skill 或 Agent prompt 时，优先使用标准 Markdown 链接：

```markdown
See [Agent Searchkit MCP setup](./skills/mcp.md).
```

---

## 🌐 查询语言

SearXNG 的 Bing 后端并不等同于浏览器里的 `cn.bing.com` 交互式搜索。`张雪峰 最近动向` 这类中文自然语言 query，即使在 Bing 网页能正常工作，也可能在 SearXNG 后端退化。

MCP 使用时，所有非英文搜索请求都应先翻译成完整英文 query，再调用 `web_searchkit_search`。例如：

```json
{
  "query": "Zhang Xuefeng recent news",
  "category": "news",
  "language": "en-US"
}
```

agent-searchkit 随后使用正常的 `v1.4` retrieval/rerank 路径，并返回带 citation metadata 的候选结果。调用方 LLM 仍负责最终语义筛选和答案排序。

MCP 调用会在运行时强制执行这个约束：明显非英文的 query 或非英文 `language` hint 会被拒绝，并返回可重试的“先翻译成英文”指令。

疑似中文姓名的罗马拼音会在检索前做实体固化，把姓和名合并。例如 `Zhang Xuefeng recent news activities` 会以 `ZhangXuefeng recent news activities` 发给 SearXNG。

---

## ⚙️ 配置项

| 字段 | 默认值 | 说明 |
|---|---|---|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG 地址 |
| `defaultLanguage` | `zh-CN` | 默认搜索语言 |
| `defaultEngines` | `["google", "duckduckgo", "bing", "wikipedia", "wikidata", "google news", "duckduckgo news", "bing news", "qwant news", "yahoo news", "mojeek news", "github", "pypi", "docker hub", "npm"]` | 显式传给 SearXNG 的 engines |
| `defaultLimit` | `8` | 每次查询结果数 |
| `rerankEnabled` | `true` | 启用启发式 rerank |
| `defaultRerankVersion` | `v1.4` | 默认启发式 rerank 版本 |
| `defaultMode` | `auto` | 默认搜索模式 |

---

## 🧩 Skills

- [MCP server skill](./skills/mcp.md)
- [OpenClaw plugin skill](./skills/openclaw.md)
- [Standalone CLI skill](./skills/standalone.md)
- [LangChain integration skill](./skills/langchain.md)
- [CrewAI integration skill](./skills/crewai.md)

---

## 🛠️ 故障排查

### SearXNG JSON 返回 403

确认 SearXNG 启用了 JSON 输出：

```yaml
search:
  formats:
    - html
    - json
```

### MCP bridge timeout

使用 `agent-searchkit >= 0.3.20`。MCP server 已支持标准 `Content-Length` frame 和 JSON-lines initialize frame。

### Windows npx 找不到 bin

先试：

```powershell
npx -y --package agent-searchkit@latest agent-searchkit-mcp --help
```

如果 GUI 启动的 MCP 客户端仍然找不到，用 [MCP 配置](#-mcp-配置) 里的全局安装或本地 `node ...\bin\agent-searchkit-mcp` 兜底方案。

### 中文结果异常

使用 `agent-searchkit >= 0.3.24`，并通过 `debug=true` 检查实际发给 SearXNG 的 query。

---

## 🧪 开发

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

---

## 📄 License

[MIT](./LICENSE)
