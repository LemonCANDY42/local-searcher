<p align="center">
  <img src="https://img.shields.io/badge/🔍-agent--searchkit-blueviolet?style=for-the-badge&labelColor=0d1117&color=58a6ff" alt="agent-searchkit">
</p>

<h1 align="center">agent-searchkit</h1>

<p align="center">
  <strong>为 AI Agent 打造的本地搜索基础设施</strong><br>
  多引擎聚合 · 7 种 rerank 策略版本 · 数据不出本机
</p>

<p align="center">
  <a href="https://github.com/LemonCANDY42/agent-searchkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-00d56b?style=flat-square&labelColor=0d1117" alt="License"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/stargazers"><img src="https://img.shields.io/github/stars/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ffd700" alt="Stars"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/issues"><img src="https://img.shields.io/github/issues/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ff6b6b" alt="Issues"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/network/members"><img src="https://img.shields.io/github/forks/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=8b949e" alt="Forks"></a>
</p>

<p align="center">
  <a href="#-quickstart">Quickstart</a> · <a href="#-features">Features</a> · <a href="#-comparison">Comparison</a> · <a href="#-integration">Integration</a> · <a href="#-architecture">Architecture</a>
</p>

---

## ✨ Highlights

- 📊 **7 种 Rerank 策略版本** — 从原始排序到实体感知，按场景选择一个有效版本
- 🌐 **四引擎聚合** — Google + Bing + DuckDuckGo + Qwant 同时搜
- 🔒 **完全本地** — 查询永不出本机，零遥测，无需 API Key
- 📎 **引用注释** — 可选输出 `[1] [2] ...` 标准引用格式
- 🔍 **搜索 + 提取 + 研究** — search / extract / research / status 四个工具
- 🔌 **即插即用** — 原生支持 OpenClaw / MCP / LangChain / CrewAI

---

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2（用于运行 SearXNG 搜索引擎）
- [Node.js](https://nodejs.org/) 18+（用于 CLI 工具和插件）

---

## ⚡ Quickstart

### 1️⃣ 启动 SearXNG

`agent-searchkit` 默认连接本机 SearXNG。仓库内置的服务脚本会用 Docker 启动一套本机 SearXNG，并显式开启 MCP 必需的 JSON 搜索输出。仅启动 SearXNG Web UI 不够；`/search?...format=json` 必须可用。

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

Manual verification:

```bash
curl -I http://127.0.0.1:8888/
curl 'http://127.0.0.1:8888/search?q=openclaw&format=json'
```

The second command must return JSON with fields such as `query` or `results`. If it returns `403 Forbidden`, your SearXNG config has not enabled JSON output. The bundled `services/searxng/settings.yml` includes:

```yaml
search:
  formats:
    - html
    - json
```

The bundled Docker Compose file mounts this file directly into the container:

```yaml
./searxng/settings.yml:/etc/searxng/settings.yml:rw
```

That direct file mount prevents SearXNG from silently generating a default `settings.yml` without JSON support. The mount is writable because current SearXNG images may `chown` the file during startup.

Do not replace the bundled file with a minimal `use_default_settings: true` config for MCP usage. The SearXNG default engine set includes engines such as `radio browser` that are unrelated to web search and can fail during startup on fresh Docker caches. The bundled settings keep the engine list focused on web/news/package search and avoid noisy engines that commonly fail from local Docker networks.

The default service bootstrap starts only SearXNG. Optional helper services such as Valkey and ntfy are behind explicit `up-extras` / `restart-extras` commands so the MCP quickstart does not fail because of unrelated image pulls. The scripts intentionally ignore an inherited `COMPOSE_PROFILES=extras` value for the default `up` command.

If you already have SearXNG, for example OpenClaw's local service at `http://127.0.0.1:18080`, you can reuse it as long as its JSON search endpoint passes the same verification command.

### 2️⃣ 接入 OpenClaw

OpenClaw 原生集成会把内置 `web_search` 路由到 `agent-searchkit`。这适合希望所有 Agent 默认使用本地 SearXNG + reranking 的用户。

```bash
# 安装插件。当前包包含可选浏览器提取/本地诊断能力，OpenClaw 会要求显式确认。
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install

# 启用插件，并告诉插件 SearXNG 在哪里。
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"

# 设为内置 web_search 的默认 provider。
openclaw config set tools.web.search.provider agent-searchkit

# 校验并重启。
openclaw config validate
openclaw gateway restart
```

设置 `tools.web.search.provider` 后，Agent 调用内置 `web_search` 会自动走 SearXNG + reranking。OpenClaw provider 路径返回轻量结构化结果：`title`、`url`、`snippet`、`host`、`publishedDate`、`citation`，并附带 `sources` 参考文献列表。

> Why the scary install flag?
>
> `agent-searchkit` includes an optional browser extraction fallback and local diagnostics. Those paths use Node's `child_process` API to run the bundled extraction script and inspect Docker container names. OpenClaw 2026.5.12+ blocks plugins with shell/process-spawn capability by default because that pattern can be dangerous in untrusted plugins.
>
> In this plugin, the process-spawn usage is scoped to local extraction/diagnostics, not arbitrary user-provided shell execution. Normal installation may therefore stop with a "dangerous code patterns" warning. Use `--dangerously-force-unsafe-install` only after reviewing the source and only on a machine where you trust the plugin.

### 3️⃣ 接入 MCP 或其他 Agent

对 MCP 客户端，推荐使用 npm 包入口，而不是手写 `path/to/.../src/index.ts`。安装后的 `agent-searchkit-mcp` 是 stdio MCP server，会调用包内 rerank 搜索逻辑；`SEARXNG_BASE_URL` 指向你的本地 SearXNG。

**推荐配置（统一用 npm/npx）：**

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": ["-y", "agent-searchkit@latest"],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

如果 GUI 客户端首次启动 `npx` 超时，可以先在同一台机器上预热 npm 缓存：

```bash
npx -y agent-searchkit@latest --help
```

如果你有自己的 SearXNG，保持 `SEARXNG_BASE_URL` 为它的地址；如果复用 OpenClaw 本地实例，通常改为 `http://127.0.0.1:18080`。

**本地源码开发：**

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
cd services && cp .env.example .env.local && ./manage.sh up && ./manage.sh test
```

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "/absolute/path/to/agent-searchkit/bin/agent-searchkit-mcp",
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

其他 Agent 框架有两种接入方式：

- 需要 reranking / citations / MCP 工具协议：接入 `agent-searchkit-mcp`，调用 `web_searchkit_search`。核心输入是 `query`，可选输入包括 `limit`、`language`、`mode`、`rerankVersion`、`citations`。
- 只想做本地 SearXNG 连通性检查或简单脚本集成：调用 `agent-searchkit-search` CLI。它直接打 SearXNG，不跑 rerank。

### 4️⃣ 本地 CLI smoke test

这一步用于确认 SearXNG 搜索入口能通，也方便非 OpenClaw Agent 直接拿 JSON 结果。它是直接查询 SearXNG 的轻量 CLI，不等同于 OpenClaw 内置 `web_search` provider 路径；OpenClaw 集成请以上面的 `tools.web.search.provider` 配置为准。

```bash
./bin/agent-searchkit-search "Python 3.14 new features"
./bin/agent-searchkit-search -c news -n 5 "AI regulation 2026"
./bin/agent-searchkit-search -l zh-CN "量子计算 最新突破"
./bin/agent-searchkit-search --json -n 3 "OpenClaw web_search provider"
```

安装为 npm 包时，会暴露 `agent-searchkit-search`、`agent-searchkit-research` 和 `agent-searchkit-mcp` 三个 bin。

---

## 🔍 Comparison

<table>
<tr>
  <th></th>
  <th>agent-searchkit</th>
  <th>Brave API</th>
  <th>Google CSE</th>
  <th>DuckDuckGo</th>
</tr>
<tr>
  <td>💰 <b>费用</b></td>
  <td>✅ 免费，无限制</td>
  <td>2K/月后 $3/千次</td>
  <td>100次/天</td>
  <td>免费但限速</td>
</tr>
<tr>
  <td>🌐 <b>多引擎聚合</b></td>
  <td>✅ 4 引擎同时搜</td>
  <td>仅 Brave</td>
  <td>仅 Google</td>
  <td>仅 DDG</td>
</tr>
<tr>
  <td>🔒 <b>数据隐私</b></td>
  <td>✅ 数据不出本机</td>
  <td>发送到 Brave</td>
  <td>发送到 Google</td>
  <td>有限</td>
</tr>
<tr>
  <td>🔑 <b>API Key</b></td>
  <td>✅ 不需要</td>
  <td>❌ 必需</td>
  <td>❌ 必需</td>
  <td>✅ 不需要</td>
</tr>
<tr>
  <td>📊 <b>Reranking</b></td>
  <td>✅ 7 个版本渐进优化</td>
  <td>❌</td>
  <td>❌</td>
  <td>❌</td>
</tr>
<tr>
  <td>📝 <b>研究流水线</b></td>
  <td>✅ 结果自动保存</td>
  <td>❌</td>
  <td>❌</td>
  <td>❌</td>
</tr>
</table>

---

## ✨ Features

### 🔍 四大工具

| Tool | 能力 | 说明 |
|------|------|------|
| `web_searchkit_search` | SearXNG 搜索 + 多版本 rerank | 核心搜索入口 |
| `web_searchkit_research` | 搜索并保存结果到本地 | 产出 search.json + report.md |
| `web_searchkit_extract` | 网页提取 (fetch + Playwright) | 支持 JS 渲染页面 |
| `web_searchkit_status` | 健康检查 | 栈状态检查 |

### 📊 Rerank 策略版本

从原始排序到实体感知，`agent-searchkit` 内置 7 个互斥的 rerank 策略版本。它们不是一条每次搜索都会完整跑完的多阶段流水线；每次搜索只会选择一个有效版本执行：

- 默认使用 `v1.4`，也就是当前通用推荐策略。
- OpenClaw provider 使用 `plugins.entries.agent-searchkit.config.defaultRerankVersion`。
- `web_searchkit_search` / `web_searchkit_research` 可通过 `rerankVersion` 临时覆盖。
- 如果请求的版本需要本地 embedding 但 embedding provider 不可用，系统会自动降级到无依赖的启发式路径，并在 debug 信息里说明。

```
v1.0  原始 SearXNG 排序 ─────────────────────── 基线
v1.1  启发式混合 (词法 + 域名先验) ──────────── 快、无依赖
v1.2  + 片段嵌入相似度 ───────────────────────── 语义匹配
v1.3  自适应混合 (查询桶加权) ────────────────── 意图感知
v1.4  ★ 默认 ── 检索优先 + 自适应 rerank ──── 通用推荐
v1.5  + 精确拟合优化 (结构化查询) ──────────── 文档/包/API
v2.0  实体感知 + 页面角色覆盖 ──────────────── 高级研究
```

### 📈 Benchmark 怎么用这些版本

项目 benchmark 的作用是比较这些互斥版本在同一组查询 case 上的表现，而不是模拟线上一次搜索串行跑完所有版本。

- `scripts/benchmark-search-v14.mjs` 可一次选择多个 `rerankVersion`，分别对同一批 case 评分。
- `shared-union` candidate mode 会共用候选池，便于隔离比较“排序策略”本身；`live-retrieval` 会让每个版本独立走检索 + rerank。
- 报告里的 `Versions` 是参与对比的版本集合，`Focus version` / `Live default` 是当前重点观察和线上默认版本。
- 当前默认版本是 `v1.4`；如果 benchmark 证明新版本更稳，再提升 `defaultRerankVersion`。

### 🎯 搜索模式

```typescript
mode: "auto" | "general" | "official-docs" | "github" | "models" | "packages"
```

Agent 只需传 query，模式自动检测。或者手动指定——查文档用 `official-docs`，找 repo 用 `github`，找模型用 `models`。

### 📎 引用注释 (Citations)

搜索时传入 `citations=true`，每条结果附带引用信息：

```json
{
  "citation": {
    "ref": "[1]",
    "formatted": "[1] Page Title. https://example.com/page (accessed 2026-05-15)",
    "inline": "(example.com, 2026)"
  }
}
```

- `ref` — 编号引用，用于行内标注 `[1]`
- `formatted` — 完整引用文本，适合参考文献列表
- `inline` — 简短括号形式，适合行内注明 `(来源, 年份)`

默认关闭。传入 `citations=true` 开启。

---

## 🔌 Integration

### OpenClaw（原生插件）

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set tools.web.search.provider agent-searchkit
openclaw gateway restart
# Agent 调用 web_search 时自动走 agent-searchkit
```

OpenClaw may warn that the plugin contains high-risk code patterns because the optional browser extraction and Docker diagnostics use `node:child_process`. That warning is expected for current releases; install with the force flag only if you trust this source.

### MCP Server

Use the npm entrypoint in MCP clients:

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": ["-y", "agent-searchkit@latest"],
      "env": { "SEARXNG_BASE_URL": "http://127.0.0.1:8888" }
    }
  }
}
```

If a GUI client times out on first launch, pre-warm the npm cache with `npx -y agent-searchkit@latest --help`, then restart the client.

### Python / LangChain

```python
import subprocess, json
from langchain.tools import Tool

def local_search(query: str, limit: int = 8) -> list[dict]:
    result = subprocess.run(
        ["./bin/agent-searchkit-search", "--json", "-n", str(limit), query],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

search_tool = Tool(name="local_search", func=local_search, description="Local web search")
```

### CrewAI

```python
from crewai.tools import BaseTool

class WebSearchTool(BaseTool):
    name = "web_search"
    description = "Search the web locally through SearXNG"

    def _run(self, query: str) -> str:
        result = subprocess.run(
            ["./bin/agent-searchkit-search", "--json", "-n", "8", query],
            capture_output=True, text=True, timeout=30,
        )
        return result.stdout
```

---

## 🏗️ Architecture

```
  ┌──────────────────────────────────────────────────┐
  │             AI Agent (任意框架)                    │
  │   OpenClaw · MCP · CrewAI · LangChain · 自研     │
  └────────────────────┬─────────────────────────────┘
                       │
            ┌──────────▼──────────┐
            │   agent-searchkit    │
            │   ┌──────────────┐  │
            │   │ search       │  │   ← 选择一个 rerank 版本
            │   │ research     │  │   ← 结果保存到本地
            │   │ extract      │  │   ← Playwright fallback
            │   │ status       │  │   ← 健康检查
            │   └──────────────┘  │
            └──────────┬──────────┘
                       │
            ┌──────────▼──────────┐
            │      SearXNG        │     ┌──────────┐
            │   (meta-search)     │────▶│  Google   │
            │   localhost:8888    │────▶│  Bing     │
            └──────────┬──────────┘────▶│  DuckDG   │
                       │                │  Qwant    │
            ┌──────────▼──────────┐     └──────────┐
            │ Rerank Strategy     │
            │ v1.0 / ... / v2.0  │
            └──────────┬──────────┘
                       │
            ┌──────────▼──────────┐
            │   Research Runs     │
            │   runs/<timestamp>/ │
            │   ├─ search.json    │
            │   └─ report.md      │
            └─────────────────────┘
```

---

## ⚙️ Configuration

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG 地址 |
| `defaultLanguage` | `en-US` | 默认搜索语言 |
| `defaultLimit` | `8` | 默认返回条数 |
| `rerankEnabled` | `true` | 启用 reranking |
| `defaultRerankVersion` | `v1.4` | 默认 rerank 版本 |
| `defaultMode` | `auto` | 默认搜索模式 |

---

## 🤝 Contributing

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
git checkout -b feat/your-feature

npm install
npm run build
npm test
npm run test:mcp
npm pack --dry-run

git push origin feat/your-feature
# 开 PR 🎉
```

---

## 📄 License

[MIT](LICENSE)

---

<p align="center">
  <sub>Built with 🧠 by <a href="https://github.com/LemonCANDY42">Kenny</a> · Powered by <a href="https://docs.searxng.org/">SearXNG</a></sub>
</p>
