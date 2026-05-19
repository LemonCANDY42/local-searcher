# Agent Searchkit — Standalone CLI Skill

## Purpose

Use agent-searchkit from the command line without an agent framework.

For full setup, see [README CLI Usage](../README.md#cli-usage) or [中文 CLI 使用](../README.zh-CN.md#cli-使用).

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) for SearXNG
- [Node.js 18+](https://nodejs.org/) for CLI commands

## Start SearXNG

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

Verify:

```bash
curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
```

## CLI Tools

### agent-searchkit-search

Direct local SearXNG smoke search. For MCP/OpenClaw candidate output, use `agent-searchkit-mcp` or the OpenClaw provider.

```bash
agent-searchkit-search "Python 3.14 new features"
agent-searchkit-search -c news -n 5 "AI regulation 2026"
agent-searchkit-search -l zh-CN "马斯克 最近 动向 新闻"
agent-searchkit-search --json "rust async runtime"
```

| Flag | Description | Default |
|---|---|---|
| `-c CATEGORY` | Search category: general, news, it, images, videos | `general` |
| `-n LIMIT` | Number of results | `8` |
| `-l LANG` | Language | `zh-CN` |
| `--json` | Output JSON | `false` |

### agent-searchkit-research

Checkpointed deep research. It writes `runs/<timestamp>-<slug>/search.json` and `report.md`.

```bash
agent-searchkit-research "local LLM inference benchmarks 2026"
agent-searchkit-research -c it -n 10 "React vs Vue performance"
```

## Service Management

```bash
cd services
./manage.sh up
./manage.sh ps
./manage.sh logs
./manage.sh test
./manage.sh down
```

Windows uses `.\manage.ps1` with the same subcommands.

## Output Guidance

When using JSON output downstream, preserve URLs as Markdown links where possible:

```markdown
- [Result title](https://example.com/page): short note from snippet
```

For final answers, treat CLI/MCP results as retrieval candidates and let the LLM choose the final ordering.
