<p align="center">
  <h1 align="center">🔍 local-searcher</h1>
  <p align="center">
    <strong>Local-first search + reranking + research pipelines for AI agents</strong>
  </p>
  <p align="center">
    <a href="#quickstart">Quickstart</a> · <a href="#features">Features</a> · <a href="#integration">Integration</a> · <a href="#api">API</a> · <a href="#contributing">Contributing</a>
  </p>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  <a href="https://github.com/LemonCANDY42/local-searcher/issues"><img src="https://img.shields.io/github/issues/LemonCANDY42/local-searcher" alt="Issues"></a>
  <a href="https://github.com/LemonCANDY42/local-searcher/stargazers"><img src="https://img.shields.io/github/stars/LemonCANDY42/local-searcher" alt="Stars"></a>
</p>

---

**local-searcher** is a self-hosted, key-free search infrastructure for AI agents. It aggregates results from Google, Bing, DuckDuckGo, and Qwant via [SearXNG](https://docs.searxng.org/), applies multi-version reranking, and provides checkpointed research runs — all running on your machine.

> **Zero API keys. Zero data leaves your network. Unlimited queries.**

## Why local-searcher?

| | local-searcher | Brave Search API | Google CSE API |
|---|---|---|---|
| **Cost** | ✅ Free forever | Free 2K/mo, then $3/1K | Free 100/day |
| **Multi-engine** | ✅ Google + Bing + DDG + Qwant | ❌ Brave only | ❌ Google only |
| **Privacy** | ✅ Queries stay local | ❌ Sent to Brave | ❌ Sent to Google |
| **API Key** | ✅ Not needed | ❌ Required | ❌ Required |
| **Reranking** | ✅ 7 versions (v1.0–v2.0) | ❌ None | ❌ None |
| **Research runs** | ✅ Checkpointed + resumable | ❌ None | ❌ None |

## Quickstart

### 1. Start SearXNG

```bash
docker run -d --name searxng -p 8888:8080 searxng/searxng
```

### 2. Install the plugin (OpenClaw)

```bash
openclaw plugins install clawhub:local-searcher
```

Or copy `src/` into your OpenClaw extensions directory:

```bash
cp -r src/ ~/.openclaw/workspace/.openclaw/extensions/local-searcher/
```

### 3. Enable and configure

```bash
openclaw config set plugins.entries.local-searcher.enabled true
openclaw config set plugins.entries.local-searcher.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw gateway restart
```

### 4. Search

```bash
# Via OpenClaw tool
# The agent can now use local_searcher_search, local_searcher_research, etc.

# Via CLI fallback
./bin/searx-search "Python 3.14 new features"
./bin/searx-search -c news -n 5 "AI regulation"
./bin/searx-search -l zh-CN "量子计算 最新进展"
```

## Features

- **`local_searcher_search`** — Normalized SearXNG search with mode-aware reranking (7 versions: v1.0–v2.0)
- **`local_searcher_research`** — Checkpointed research runs that write `search.json` + `report.md`, resumable across sessions
- **`local_searcher_extract`** — Readable page extraction via fetch or Playwright fallback for JS-heavy pages
- **`local_searcher_status`** — Health check for the local stack (SearXNG, ntfy, artifacts)

### Reranking pipeline

local-searcher ships with a progressive reranking system:

| Version | Strategy | Use case |
|---------|----------|----------|
| v1.0 | Raw SearXNG order | Baseline |
| v1.1 | Heuristic hybrid (lexical + domain priors) | Fast, no dependencies |
| v1.2 | + Snippet embedding similarity | Better semantic matching |
| v1.3 | Adaptive hybrid (query-bucket weighting) | Intent-aware ranking |
| v1.4 | **Default** — retrieval-first + adaptive rerank | Best general-purpose |
| v1.5 | + exact-fit refinement for structured lookups | Docs / packages / APIs |
| v2.0 | Entity-aware + page-role overlay | Advanced research |

### Search modes

```typescript
mode: "auto" | "general" | "official-docs" | "github" | "models" | "packages"
```

- `auto` — automatically detects intent from query
- `official-docs` — biases toward official documentation
- `github` — prioritizes GitHub repositories
- `models` — optimized for ML model discovery
- `packages` — package registry awareness

## Integration

### OpenClaw (native plugin)

```bash
# Install
openclaw plugins install clawhub:local-searcher

# Configure
openclaw config set plugins.entries.local-searcher.enabled true
openclaw config set plugins.entries.local-searcher.config.searxngBaseUrl "http://127.0.0.1:8888"

# Restart
openclaw gateway restart
```

The plugin registers 4 tools automatically available to the agent.

### Standalone CLI

```bash
# Direct search
./bin/searx-search "query"
./bin/searx-search -c news -n 5 "AI regulation"
./bin/searx-search --json -c it "react native sqlite"

# Research run (checkpointed)
./bin/research-run -c general -n 8 "open source mobile app framework"
# Output: runs/<timestamp>-<slug>/search.json + report.md
```

### Docker Compose (full stack)

```bash
cd services/
cp .env.example .env.local  # edit as needed
./manage.sh up
```

This starts SearXNG + ntfy on localhost with health checks.

## Architecture

```
┌─────────────────────────────────────────┐
│           AI Agent (any framework)       │
│  OpenClaw · MCP · CrewAI · LangChain    │
└──────────────┬──────────────────────────┘
               │
    ┌──────────▼──────────┐
    │   local-searcher    │
    │   (plugin / CLI)    │
    ├─────────────────────┤
    │ • search            │
    │ • research          │
    │ • extract           │
    │ • status            │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐     ┌─────────────┐
    │      SearXNG        │────▶│   Google     │
    │  (meta-search)      │────▶│   Bing       │
    │  localhost:8888     │────▶│   DuckDuckGo │
    └──────────┬──────────┘     │   Qwant      │
               │                └─────────────┘
    ┌──────────▼──────────┐
    │   Rerank Pipeline   │
    │   v1.0 → v2.0       │
    └──────────┬──────────┘
               │
    ┌──────────▼──────────┐
    │   Research Runs     │
    │   runs/<timestamp>/ │
    │   • search.json     │
    │   • report.md       │
    └─────────────────────┘
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG instance URL |
| `ntfyBaseUrl` | `http://127.0.0.1:18082` | ntfy notification bus URL |
| `defaultLanguage` | `en-US` | Default search language |
| `defaultLimit` | `8` | Default result count |
| `rerankEnabled` | `true` | Enable reranking |
| `defaultRerankVersion` | `v1.4` | Default rerank strategy |
| `defaultMode` | `auto` | Default search mode |
| `fetchTimeoutMs` | `20000` | HTTP fetch timeout |
| `browserTimeoutMs` | `45000` | Playwright timeout |
| `maxTextChars` | `12000` | Max extracted text chars |
| `maxLinks` | `24` | Max links per result |

## API

### `local_searcher_search`

```typescript
{
  query: string;              // required
  category?: "general" | "news" | "it" | "images" | "videos";
  language?: string;          // e.g. "en-US", "zh-CN"
  limit?: number;             // 1-20
  mode?: "auto" | "general" | "official-docs" | "github" | "models" | "packages";
  rerank?: boolean;           // default: true
  rerankVersion?: "v1.0" | "v1.1" | "v1.2" | "v1.3" | "v1.4" | "v1.5" | "v2.0";
  debug?: boolean;            // include rerank signals in output
}
```

### `local_searcher_research`

```typescript
{
  query: string;
  category?: string;
  language?: string;
  limit?: number;             // default: 8
  mode?: string;
  runLabel?: string;          // custom label for the run
}
```

Writes checkpointed output to `runs/<timestamp>-<slug>/` with `search.json` and `report.md`.

### `local_searcher_extract`

```typescript
{
  url: string;                // required
  useBrowser?: boolean;       // force Playwright for JS-heavy pages
  maxChars?: number;          // truncate output
}
```

### `local_searcher_status`

No parameters. Returns stack health, artifact paths, and version info.

## CLI Reference

```bash
# Search
./bin/searx-search "query"
./bin/searx-search -c news -n 5 "AI regulation"
./bin/searx-search -l zh-CN "量子计算"
./bin/searx-search --json "query"

# Research run
./bin/research-run -c general -n 8 "query"
./bin/research-run -c it -n 5 "react native sqlite"

# Stack management
./services/manage.sh up       # start SearXNG + ntfy
./services/manage.sh down     # stop
./services/manage.sh status   # health check
./services/manage.sh test     # smoke test
```

## Benchmark

Run the built-in benchmark suite to compare rerank versions:

```bash
node scripts/benchmark-search-v14.mjs
```

Outputs a detailed report under `runs/<timestamp>-search-info-benchmark/` with:
- Pairwise version comparisons (wins/regressions/ties)
- Coverage metrics per intent bucket
- Latency breakdowns

## Security

- All services bind to **127.0.0.1 only** — no public exposure by default
- **Zero telemetry** — queries never leave your network
- **No API keys** — SearXNG is fully self-hosted
- Credentials live in `.env.local` (git-ignored)

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feat/my-feature`)
3. Make your changes
4. Run tests: `node src/index.test.mjs`
5. Run smoke test: `./services/manage.sh test`
6. Submit a PR

## License

[MIT](LICENSE)
