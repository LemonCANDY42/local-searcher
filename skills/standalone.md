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

### searx-search

Basic search with reranking.

```bash
# Simple search
./bin/searx-search "Python 3.14 new features"

# With options
./bin/searx-search -c news -n 5 "AI regulation 2026"
./bin/searx-search -l zh-CN "量子计算 最新突破"
./bin/searx-search -m github "react hooks library"
./bin/searx-search --json "rust async runtime"
```

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-c CATEGORY` | Search category (general, news, it, images, videos) | general |
| `-n LIMIT` | Number of results | 8 |
| `-l LANG` | Language (en-US, zh-CN, ja, etc.) | en-US |
| `-m MODE` | Search mode (auto, general, official-docs, github, models, packages) | auto |
| `-r VERSION` | Rerank version (v1.0–v2.0) | v1.4 |
| `--json` | Output as JSON | false |
| `--no-rerank` | Disable reranking | false |

### research-run

Checkpointed deep research — writes results to `runs/` directory.

```bash
# Basic research
./bin/research-run "local LLM inference benchmarks 2026"

# With options
./bin/research-run -c it -n 10 "React vs Vue performance"
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
