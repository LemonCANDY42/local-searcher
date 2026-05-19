<p align="center">
  <img src="https://img.shields.io/badge/🔍-agent--searchkit-blueviolet?style=for-the-badge&labelColor=0d1117&color=58a6ff" alt="agent-searchkit">
</p>

<h1 align="center">agent-searchkit</h1>

<p align="center">
  <strong>Local-first search infrastructure for AI agents</strong><br>
  SearXNG · MCP · OpenClaw · citations · LLM-side final reranking
</p>

<p align="center">
  <a href="./README.zh-CN.md">中文</a> ·
  <a href="#-quickstart">Quickstart</a> ·
  <a href="#-mcp-setup">MCP</a> ·
  <a href="#-openclaw-setup">OpenClaw</a> ·
  <a href="#-output--citations">Citations</a> ·
  <a href="#-configuration">Configuration</a>
</p>

<p align="center">
  <a href="https://github.com/LemonCANDY42/agent-searchkit/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-00d56b?style=flat-square&labelColor=0d1117" alt="License"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/stargazers"><img src="https://img.shields.io/github/stars/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ffd700" alt="Stars"></a>
  <a href="https://github.com/LemonCANDY42/agent-searchkit/issues"><img src="https://img.shields.io/github/issues/LemonCANDY42/agent-searchkit?style=flat-square&labelColor=0d1117&color=ff6b6b" alt="Issues"></a>
  <a href="https://www.npmjs.com/package/agent-searchkit"><img src="https://img.shields.io/npm/v/agent-searchkit?style=flat-square&labelColor=0d1117&color=58a6ff" alt="npm"></a>
</p>

---

## ✨ Highlights

- 🔍 **Local SearXNG stack** — repository-managed Docker Compose with JSON search enabled.
- 🔌 **MCP-ready** — stdio MCP server for Claude Desktop, Cursor, LM Studio, Continue, OpenClaw MCP, and other clients.
- 🧭 **OpenClaw provider** — route built-in `web_search` through local SearXNG.
- 📎 **Citation-first output** — optional `citation` objects and Markdown-friendly references.
- 🧠 **LLM final reranking boundary** — agent-searchkit returns retrieval candidates; the calling LLM performs final semantic filtering and ordering.
- 🇨🇳 **CJK-aware request shaping** — Chinese news-like queries extract the core entity before hitting SearXNG.

---

## 📋 Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2, for local SearXNG.
- [Node.js](https://nodejs.org/) 18+, for MCP and CLI commands.

---

## ⚡ Quickstart

### 1️⃣ Start SearXNG

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

Verify both the Web UI and JSON API:

```bash
curl -I http://127.0.0.1:8888/
curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
```

The second command must return JSON with fields such as `query` or `results`. If it returns `403 Forbidden`, your SearXNG config has not enabled JSON output. The bundled [services/searxng/settings.yml](./services/searxng/settings.yml) enables:

```yaml
search:
  formats:
    - html
    - json
```

The default service helper starts only SearXNG. Optional helper services such as Valkey and ntfy are behind explicit `up-extras` / `restart-extras` commands.

### 2️⃣ Choose Your Integration

- MCP clients: follow [MCP Setup](#-mcp-setup).
- OpenClaw built-in `web_search`: follow [OpenClaw Setup](#-openclaw-setup).
- Local scripts or smoke tests: follow [CLI Usage](#-cli-usage).

---

## 🔌 MCP Setup

`agent-searchkit-mcp` is a stdio MCP server. `SEARXNG_BASE_URL` points to your local SearXNG.

**Standard config, no global install required:**

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

**Reproducible pinned config:**

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": [
        "-y",
        "--package",
        "agent-searchkit@0.3.28",
        "agent-searchkit-mcp"
      ],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

**Global install alternative:**

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

**Windows local checkout fallback:**

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

For agent-facing instructions, link to [skills/mcp.md](./skills/mcp.md).

---

## 🧭 OpenClaw Setup

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw config set tools.web.search.provider agent-searchkit
openclaw config validate
openclaw gateway restart
```

OpenClaw may require `--dangerously-force-unsafe-install` because optional page extraction and diagnostics use Node process-spawn APIs. Review source before installing from an untrusted fork.

For OpenClaw-specific guidance, link to [skills/openclaw.md](./skills/openclaw.md).

---

## 🖥️ CLI Usage

```bash
npm install -g agent-searchkit@latest
agent-searchkit-search "Python 3.14 new features"
agent-searchkit-search -c news -n 5 "AI regulation 2026"
agent-searchkit-search -l zh-CN "马斯克 最近 动向 新闻"
agent-searchkit-search --json -n 3 "OpenClaw web_search provider"
agent-searchkit-research "local LLM inference benchmarks 2026"
```

For CLI details, link to [skills/standalone.md](./skills/standalone.md).

---

## 📎 Output & Citations

`web_searchkit_search` returns normalized retrieval candidates:

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

> `rank` is retrieval candidate order, not final answer order. The calling LLM should select, group, and reorder candidates using the user intent, `title`, `snippet`, `host`, `publishedDate`, and `citation`.

Enable citations:

```json
{
  "query": "OpenClaw web_search provider",
  "citations": true
}
```

Each result then includes:

```json
{
  "citation": {
    "ref": "[1]",
    "formatted": "[1] Page Title. https://example.com/page (accessed 2026-05-19)",
    "inline": "(example.com, 2026)"
  }
}
```

Recommended final answer style:

```markdown
The provider can route built-in web search through agent-searchkit [1].

References:
[1] Page Title. https://example.com/page
```

When writing skills or agent prompts, prefer standard Markdown links:

```markdown
See [Agent Searchkit MCP setup](./skills/mcp.md).
```

---

## 🇨🇳 Chinese Search Behavior

SearXNG/Bing can degrade Chinese multi-keyword phrases such as `马斯克 最近 动向 新闻` or `马斯克最近动向新闻` into single-character matches like `马`.

agent-searchkit handles CJK queries by:

- forcing `zh-CN` when a Chinese query is sent with `en-US`;
- extracting the core entity for common news-like modifiers, for example `马斯克 最近 动向 新闻` -> `马斯克`;
- explicitly passing curated engines: `bing,bing news,wikipedia`;
- preserving SearXNG candidate order and leaving final semantic reranking to the calling LLM.

---

## ⚙️ Configuration

| Field | Default | Description |
|---|---|---|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG base URL |
| `defaultLanguage` | `zh-CN` | Default search language |
| `defaultEngines` | `["bing", "bing news", "wikipedia"]` | SearXNG engines passed explicitly |
| `defaultLimit` | `8` | Results per query |
| `rerankEnabled` | `true` | Enable heuristic reranking for non-CJK queries |
| `defaultRerankVersion` | `v1.4` | Default heuristic rerank version |
| `defaultMode` | `auto` | Default search mode |

---

## 🧩 Skills

- [MCP server skill](./skills/mcp.md)
- [OpenClaw plugin skill](./skills/openclaw.md)
- [Standalone CLI skill](./skills/standalone.md)
- [LangChain integration skill](./skills/langchain.md)
- [CrewAI integration skill](./skills/crewai.md)

---

## 🛠️ Troubleshooting

### SearXNG JSON returns 403

Make sure SearXNG enables JSON output:

```yaml
search:
  formats:
    - html
    - json
```

### MCP bridge timeout

Use `agent-searchkit >= 0.3.20`. The MCP server supports both standard `Content-Length` frames and JSON-lines initialize frames.

### Windows npx cannot find the bin

Try:

```powershell
npx -y --package agent-searchkit@latest agent-searchkit-mcp --help
```

If GUI-launched MCP clients still cannot find it, use the global install or local `node ...\bin\agent-searchkit-mcp` fallback from [MCP Setup](#-mcp-setup).

### Chinese results look wrong

Use `agent-searchkit >= 0.3.24` and run with `debug=true` to inspect the query sent to SearXNG.

---

## 🧪 Development

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
npm test
npm run test:mcp
npm run test:rollout
```

Before publishing:

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
