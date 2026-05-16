<p align="center">
  <img src="https://img.shields.io/badge/🔍-agent--searchkit-blueviolet?style=for-the-badge&labelColor=0d1117&color=58a6ff" alt="agent-searchkit">
</p>

<h1 align="center">agent-searchkit</h1>

<p align="center">
  <strong>为 AI Agent 打造的本地搜索基础设施</strong><br>
  多引擎聚合 · 7 级 reranking · 断点续传研究 · 数据不出本机
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

- 🔍 **四大搜索工具** — search / research / extract / status
- 📊 **7 级 Reranking** — 从原始排序到实体感知，渐进优化
- 🔄 **断点续传研究** — 长任务自动 checkpoint，不怕中断
- 📎 **引用注释** — 可选输出 `[1] [2] ...` 标准引用格式
- 🌐 **四引擎聚合** — Google + Bing + DuckDuckGo + Qwant 同时搜
- 🔒 **完全本地** — 查询永不出本机，零遥测，无需 API Key
- 🔌 **即插即用** — 原生支持 OpenClaw / MCP / LangChain / CrewAI

---

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/)（用于运行 SearXNG 搜索引擎）
- [Node.js](https://nodejs.org/) 18+（用于 CLI 工具和插件）

---

## ⚡ Quickstart

### 1️⃣ 启动 SearXNG

```bash
docker run -d --name searxng -p 8888:8080 searxng/searxng
```

### 2️⃣ 安装

**OpenClaw（推荐）：**

```bash
# 安装插件
openclaw plugins install clawhub:agent-searchkit
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"

# 设为默认 web search（可选）
openclaw config set tools.web.search.provider agent-searchkit

# 重启
openclaw gateway restart
```

设置 `tools.web.search.provider` 后，Agent 调用内置 `web_search` 会自动走 SearXNG + reranking。

**其他框架 / 独立使用：**

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit/services && cp .env.example .env.local && ./manage.sh up
```

### 3️⃣ 搜索

```bash
./bin/searx-search "Python 3.14 new features"
./bin/searx-search -c news -n 5 "AI regulation 2026"
./bin/searx-search -l zh-CN "量子计算 最新突破"
```

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
  <td>✅ 永久免费</td>
  <td>2K/月后 $3/千次</td>
  <td>100次/天</td>
  <td>免费但限速</td>
</tr>
<tr>
  <td>🌐 <b>多引擎聚合</b></td>
  <td>✅ 4 引擎同时搜</td>
  <td>❌ 仅 Brave</td>
  <td>❌ 仅 Google</td>
  <td>❌ 仅 DDG</td>
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
  <td>✅ 断点续传</td>
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
| `web_searchkit_research` | 断点续传式深度研究 | 长任务自动 checkpoint |
| `web_searchkit_extract` | 网页提取 (fetch + Playwright) | 支持 JS 渲染页面 |
| `web_searchkit_status` | 健康检查 | 栈状态检查 |

### 📊 7 级 Reranking 流水线

从原始排序到实体感知，渐进式提升搜索质量：

```
v1.0  原始 SearXNG 排序 ─────────────────────── 基线
v1.1  启发式混合 (词法 + 域名先验) ──────────── 快、无依赖
v1.2  + 片段嵌入相似度 ───────────────────────── 语义匹配
v1.3  自适应混合 (查询桶加权) ────────────────── 意图感知
v1.4  ★ 默认 ── 检索优先 + 自适应 rerank ──── 通用最优
v1.5  + 精确拟合优化 (结构化查询) ──────────── 文档/包/API
v2.0  实体感知 + 页面角色覆盖 ──────────────── 高级研究
```

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
openclaw plugins install clawhub:agent-searchkit
openclaw config set tools.web.search.provider agent-searchkit
openclaw gateway restart
# Agent 调用 web_search 时自动走 agent-searchkit
```

### MCP Server

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "node",
      "args": ["path/to/agent-searchkit/src/index.ts"],
      "env": { "SEARXNG_BASE_URL": "http://127.0.0.1:8888" }
    }
  }
}
```

### Python / LangChain

```python
import subprocess, json
from langchain.tools import Tool

def local_search(query: str, limit: int = 8) -> list[dict]:
    result = subprocess.run(
        ["./bin/searx-search", "--json", "-n", str(limit), query],
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
    description = "Search the web locally with reranking"

    def _run(self, query: str) -> str:
        result = subprocess.run(
            ["./bin/searx-search", "--json", "-n", "8", query],
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
            │   │ search       │  │   ← 7 级 rerank
            │   │ research     │  │   ← 断点续传
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
            │   Rerank Pipeline   │
            │   v1.0 ──▶ v2.0    │
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
# 测试
node src/index.test.mjs
./services/manage.sh test
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
