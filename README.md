<p align="center">
  <img src="https://img.shields.io/badge/🔍-local--searcher-blueviolet?style=for-the-badge&labelColor=0d1117&color=58a6ff" alt="web-searcher">
</p>

<h1 align="center">web-searcher</h1>

<p align="center">
  <strong>本地搜索 + reranking + 研究流水线</strong><br>
  <em>Local-first search + reranking + research pipelines for AI agents</em>
</p>

<p align="center">
  <a href="https://github.com/LemonCANDY42/web-searcher/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-00d56b?style=flat-square&labelColor=0d1117" alt="License"></a>
  <a href="https://github.com/LemonCANDY42/web-searcher/stargazers"><img src="https://img.shields.io/github/stars/LemonCANDY42/web-searcher?style=flat-square&labelColor=0d1117&color=ffd700" alt="Stars"></a>
  <a href="https://github.com/LemonCANDY42/web-searcher/issues"><img src="https://img.shields.io/github/issues/LemonCANDY42/web-searcher?style=flat-square&labelColor=0d1117&color=ff6b6b" alt="Issues"></a>
  <a href="https://github.com/LemonCANDY42/web-searcher/network/members"><img src="https://img.shields.io/github/forks/LemonCANDY42/web-searcher?style=flat-square&labelColor=0d1117&color=8b949e" alt="Forks"></a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> · <a href="#features">Features</a> · <a href="#为什么选择-web-searcher">Why</a> · <a href="#integration">Integration</a> · <a href="#api">API</a> · <a href="#architecture">Architecture</a>
</p>

---

## 🧠 这是什么

**web-searcher** 是一个本地搜索基础设施，为 AI Agent 提供搜索、reranking 和研究能力。

基于 SearXNG 聚合 Google、Bing、DuckDuckGo、Qwant，内置 7 级 reranking 流水线，支持断点续传式深度研究，所有数据不离开本机。无需 API Key。

```bash
docker run -d -p 8888:8080 searxng/searxng
```

## 🤔 为什么选择 web-searcher

<table>
<tr>
  <th></th>
  <th>web-searcher</th>
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
  <td>🔒 <b>隐私</b></td>
  <td>✅ 数据不出本机</td>
  <td>❌ 发送到 Brave</td>
  <td>❌ 发送到 Google</td>
  <td>⚠️ 有限</td>
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

## ⚡ Quickstart

### 1️⃣ 启动 SearXNG

```bash
docker run -d --name searxng -p 8888:8080 searxng/searxng
```

### 2️⃣ 安装插件

**OpenClaw 用户：**

```bash
openclaw plugins install clawhub:web-searcher
openclaw config set plugins.entries.web-searcher.enabled true
openclaw config set plugins.entries.web-searcher.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw gateway restart
```

**其他框架 / 独立使用：**

```bash
git clone https://github.com/LemonCANDY42/web-searcher.git
cd web-searcher/services && cp .env.example .env.local && ./manage.sh up
```

### 3️⃣ 开搜

```bash
./bin/searx-search "Python 3.14 new features"
./bin/searx-search -c news -n 5 "AI regulation 2026"
./bin/searx-search -l zh-CN "量子计算 最新突破"
```

---

## ✨ Features

### 🔍 四大工具

| Tool | 能力 | 一句话 |
|------|------|--------|
| `web_searcher_search` | SearXNG 搜索 + 多版本 rerank | 搜索 + rerank |
| `web_searcher_research` | 断点续传式深度研究 | 长任务可断点续传 |
| `web_searcher_extract` | 网页提取 (fetch + Playwright) | 支持 JS 渲染页面 |
| `web_searcher_status` | 健康检查 | 栈状态检查 |

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

---

## 🔌 Integration

### OpenClaw（原生插件）

```bash
openclaw plugins install clawhub:web-searcher
# 重启后自动注册 4 个工具，Agent 直接可用
```

### MCP Server

```json
{
  "mcpServers": {
    "web-searcher": {
      "command": "node",
      "args": ["path/to/web-searcher/src/index.ts"],
      "env": { "SEARXNG_BASE_URL": "http://127.0.0.1:8888" }
    }
  }
}
```

### Python / LangChain

```python
import subprocess, json

def local_search(query: str, limit: int = 8) -> list[dict]:
    """调用 web-searcher CLI 搜索"""
    result = subprocess.run(
        ["./bin/searx-search", "--json", "-n", str(limit), query],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

# 在 LangChain Tool 中使用
from langchain.tools import Tool
search_tool = Tool(name="local_search", func=local_search, description="Local web search")
```

### Docker Compose（完整栈）

```bash
cd services/
./manage.sh up    # 启动 SearXNG + ntfy
./manage.sh test  # 跑 smoke test
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
            │   web-searcher    │
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
            ┌──────────▼──────────┐     └──────────┘
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

## 🛡️ Security

- 🔒 所有服务仅绑定 `127.0.0.1`——不暴露公网
- 🚫 零遥测——查询永不出本机
- 🔑 无需 API Key——完全自托管
- 📁 凭据存 `.env.local`（已 gitignore）

---

## 🤝 Contributing

```bash
git clone https://github.com/LemonCANDY42/web-searcher.git
cd web-searcher
# 做你的事
git checkout -b feat/your-feature
# 测试
node src/index.test.mjs
./services/manage.sh test
# 提交
git push origin feat/your-feature
# 开 PR 🎉
```

---

## 📄 License

[MIT](LICENSE) — 随便用，不背锅。

---

<p align="center">
  <sub>Built with 🧠 by <a href="https://github.com/LemonCANDY42">Kenny</a> · Powered by <a href="https://docs.searxng.org/">SearXNG</a></sub>
</p>
