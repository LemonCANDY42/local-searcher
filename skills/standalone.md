# Agent Searchkit — Standalone CLI Skill

## What this does

Use agent-searchkit directly from the command line without any agent framework.

## Prerequisites

- Docker (for SearXNG)
- Node.js 18+ (for CLI scripts)

## Quick start

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit/services
cp .env.example .env.local
./manage.sh up
```

## CLI tools

### agent-searchkit-search

Direct local SearXNG search smoke test. For reranked OpenClaw or MCP search, use the OpenClaw provider or `agent-searchkit-mcp`.

```bash
# Simple search
./bin/agent-searchkit-search "Python 3.14 new features"

# With options
./bin/agent-searchkit-search -c news -n 5 "AI regulation 2026"
./bin/agent-searchkit-search -l zh-CN "量子计算 最新突破"
./bin/agent-searchkit-search --json "rust async runtime"
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-c CATEGORY` | Search category (general, news, it, images, videos) | general |
| `-n LIMIT` | Number of results | 8 |
| `-l LANG` | Language (en-US, zh-CN, ja, etc.) | en-US |
| `--json` | Output as JSON | false |

### agent-searchkit-research

Checkpointed deep research — writes results to `runs/` directory.

```bash
# Basic research
./bin/agent-searchkit-research "local LLM inference benchmarks 2026"

# With options
./bin/agent-searchkit-research -c it -n 10 "React vs Vue performance"
```

Output: `runs/<timestamp>-<slug>/search.json` + `report.md`

### ntfy-send

Send a notification to the local ntfy bus.

```bash
./bin/ntfy-send dev "build finished"
./bin/ntfy-send alert "disk space low"
```

## Docker Compose management

```bash
cd services/

# Start stack
./manage.sh up

# Check status
./manage.sh ps

# View logs
./manage.sh logs

# Stop stack
./manage.sh down

# Run tests
./manage.sh test
```

## Service URLs

- SearXNG: http://127.0.0.1:8888
- ntfy: http://127.0.0.1:18082

## Search engine tips

See [docs/query-optimization.md](../docs/query-optimization.md) for query construction best practices.
