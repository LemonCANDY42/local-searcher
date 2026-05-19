# agent-searchkit

**Local-first SearXNG search infrastructure for AI agents.**

[中文 README](./README.zh-CN.md) | [MCP skill](./skills/mcp.md) | [OpenClaw skill](./skills/openclaw.md) | [Standalone CLI skill](./skills/standalone.md)

agent-searchkit gives agents a local SearXNG-backed search stack with normalized results, citations, MCP tools, OpenClaw integration, and optional heuristic reranking. It is intentionally not a final-answer ranker: it returns retrieval candidates, and the calling LLM should do the final semantic filtering and ordering before answering.

## Contents

- [What It Provides](#what-it-provides)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [MCP Setup](#mcp-setup)
- [OpenClaw Setup](#openclaw-setup)
- [CLI Usage](#cli-usage)
- [Output And Citations](#output-and-citations)
- [Chinese Search Behavior](#chinese-search-behavior)
- [Configuration](#configuration)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

## What It Provides

- Local SearXNG search with JSON output enabled.
- MCP stdio server: [agent-searchkit MCP skill](./skills/mcp.md).
- OpenClaw web search provider: [OpenClaw skill](./skills/openclaw.md).
- Standalone search and research CLIs: [Standalone CLI skill](./skills/standalone.md).
- Normalized result fields: `title`, `url`, `snippet`, `host`, `publishedDate`, `rank`.
- Optional citation objects and source lists for Markdown-style references.
- A clear boundary for final ranking: the tool returns candidates; the LLM performs final selection.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) with Docker Compose v2, for local SearXNG.
- [Node.js](https://nodejs.org/) 18+, for MCP and CLI commands.

## Quickstart

### 1. Start SearXNG

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

Verify that both the Web UI and JSON API work:

```bash
curl -I http://127.0.0.1:8888/
curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
```

The second command must return JSON containing fields such as `query` or `results`. A plain `403 Forbidden` usually means JSON output is not enabled in SearXNG.

The bundled service config mounts [services/searxng/settings.yml](./services/searxng/settings.yml) into the container and enables:

```yaml
search:
  formats:
    - html
    - json
```

The default helper starts only SearXNG. Optional services such as Valkey and ntfy are behind `up-extras` / `restart-extras`, so normal MCP setup is not blocked by unrelated image pulls.

### 2. Configure One Agent Path

Choose one path:

- MCP clients: use [MCP Setup](#mcp-setup).
- OpenClaw built-in `web_search`: use [OpenClaw Setup](#openclaw-setup).
- Scripts and local smoke tests: use [CLI Usage](#cli-usage).

## MCP Setup

Use this for Claude Desktop, Cursor, LM Studio, Continue, OpenClaw MCP plugin installs, and other MCP-compatible clients.

Standard config, no global install required:

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

For reproducible setup, pin the package version:

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

If you installed globally:

```bash
npm install -g agent-searchkit@latest
agent-searchkit-mcp --help
```

Then configure:

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

Windows fallback when GUI-launched clients cannot see npm bin shims:

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

MCP exposes these tools:

| Tool | Purpose |
|---|---|
| `web_searchkit_search` | Search SearXNG and return normalized candidates |
| `web_searchkit_research` | Save a checkpointed research run |
| `web_searchkit_extract` | Extract readable page content |
| `web_searchkit_status` | Inspect stack health |

For agent instructions, link to [skills/mcp.md](./skills/mcp.md).

## OpenClaw Setup

Use this when you want OpenClaw's built-in `web_search` to route through agent-searchkit.

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw config set tools.web.search.provider agent-searchkit
openclaw config validate
openclaw gateway restart
```

Why the install flag exists: the package includes optional page extraction and local diagnostics that use Node process-spawn APIs. Review the source before installing from an untrusted fork.

For OpenClaw-specific usage, link to [skills/openclaw.md](./skills/openclaw.md).

## CLI Usage

Install from npm:

```bash
npm install -g agent-searchkit@latest
```

Or run from a checkout:

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
```

Search directly:

```bash
agent-searchkit-search "Python 3.14 new features"
agent-searchkit-search -c news -n 5 "AI regulation 2026"
agent-searchkit-search -l zh-CN "马斯克 最近 动向 新闻"
agent-searchkit-search --json -n 3 "OpenClaw web_search provider"
```

Run a checkpointed research pass:

```bash
agent-searchkit-research "local LLM inference benchmarks 2026"
```

For CLI details, link to [skills/standalone.md](./skills/standalone.md).

## Output And Citations

`web_searchkit_search` returns normalized retrieval candidates. The output includes:

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

Important ranking rule:

> `rank` is the retrieval candidate order, not the final answer order. The calling LLM should select, group, and reorder candidates using the user intent, `title`, `snippet`, `host`, `publishedDate`, and `citation`.

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

Recommended LLM answer style:

```markdown
The current provider path is configured through `tools.web.search.provider` and returns normalized candidates with citation metadata [1].

References:
[1] Page Title. https://example.com/page
```

When writing skills or agent prompts, prefer standard Markdown links:

```markdown
See [Agent Searchkit MCP setup](./skills/mcp.md).
Use [OpenClaw setup](./skills/openclaw.md) when routing built-in `web_search`.
```

## Chinese Search Behavior

SearXNG/Bing can degrade Chinese multi-keyword phrases such as `马斯克 最近 动向 新闻` or `马斯克最近动向新闻` into single-character matches like `马`.

agent-searchkit handles CJK queries by:

- forcing `zh-CN` when a Chinese query is sent with `en-US`;
- extracting the core entity for common news-like modifiers, for example `马斯克 最近 动向 新闻` -> `马斯克`;
- explicitly passing curated engines: `bing,bing news,wikipedia`;
- preserving SearXNG order for CJK candidates and leaving final semantic reranking to the calling LLM.

This behavior is intentionally conservative. It avoids pretending local token heuristics can understand all Chinese semantics.

## Configuration

| Field | Default | Description |
|---|---|---|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG base URL |
| `defaultLanguage` | `zh-CN` | Default search language |
| `defaultEngines` | `["bing", "bing news", "wikipedia"]` | SearXNG engines passed explicitly |
| `defaultLimit` | `8` | Results per query |
| `rerankEnabled` | `true` | Enable heuristic reranking for non-CJK queries |
| `defaultRerankVersion` | `v1.4` | Default heuristic rerank version |
| `defaultMode` | `auto` | Default search mode |

Supported `rerankVersion` values:

| Version | Meaning |
|---|---|
| `v1.0` | Raw SearXNG candidate order |
| `v1.1` | Heuristic hybrid |
| `v1.2` | Heuristic + snippet embedding |
| `v1.3` | Adaptive hybrid |
| `v1.4` | Retrieval-first adaptive, default |
| `v1.5` | Planner-aware retrieval-first |
| `v2.0` | Baseline-preserving hybrid |

CJK queries may report `v1.0` even when a rerank version is requested, because final semantic ranking should happen in the calling LLM.

## Troubleshooting

### SearXNG returns 403 for JSON

Your SearXNG config probably does not enable JSON output. Use the bundled service setup or make sure your SearXNG settings include:

```yaml
search:
  formats:
    - html
    - json
```

### MCP bridge times out

Use `agent-searchkit >= 0.3.20`. The MCP server supports both standard `Content-Length` frames and JSON-lines initialize frames.

### Windows npx cannot find the bin

Try the standard `--package` form first:

```powershell
npx -y --package agent-searchkit@latest agent-searchkit-mcp --help
```

If GUI-launched MCP clients still cannot find it, use the global install or local `node ...\bin\agent-searchkit-mcp` fallback from [MCP Setup](#mcp-setup).

### Chinese results still look wrong

Check what the client sends as the query. For news-like Chinese phrases, agent-searchkit should send the extracted core entity to SearXNG. Run with `debug=true` to inspect `retrieval.queryVariants` and returned candidates.

## Development

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

## License

[MIT](./LICENSE)
