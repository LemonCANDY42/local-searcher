# Agent Searchkit — MCP Server Skill

## What this does

Exposes agent-searchkit as an MCP (Model Context Protocol) server, usable by any MCP-compatible agent (Claude Desktop, Cursor, Continue, etc.).

## Prerequisites

- Node.js 18+
- SearXNG running locally (default: `http://127.0.0.1:8888`)

## Setup

### 1. Choose an install path

Standard MCP use does not require a prior global install:

```bash
npx -y --package agent-searchkit@latest agent-searchkit-mcp --help
```

For reproducible deployments, pin `agent-searchkit@latest` to a concrete version such as `agent-searchkit@0.3.18`.

If npm/npx bin shims are unreliable on Windows, either install globally:

```powershell
npm install -g agent-searchkit@latest
agent-searchkit-mcp --help
```

or use a local checkout:

```powershell
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
node .\bin\agent-searchkit-mcp --help
```

### 2. Configure your MCP client

Add to your MCP client config (e.g., `claude_desktop_config.json`, `.cursor/mcp.json`, or LM Studio's `mcp.json`). Standard config:

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

Global install alternative:

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

Windows local checkout fallback:

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

If reusing OpenClaw's local SearXNG, set `SEARXNG_BASE_URL` to `http://127.0.0.1:18080`.

### 3. Verify

Restart your MCP client. The following tools should appear:

| Tool | Description |
|------|-------------|
| `web_searchkit_search` | Search with rerank strategy versions and optional citations |

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_BASE_URL` | `http://127.0.0.1:8888` | SearXNG URL |
| `DEFAULT_LANGUAGE` | `en-US` | Search language |
| `DEFAULT_LIMIT` | `8` | Results per query |

## Usage examples

Once configured, your agent can call:

```
web_searchkit_search(query="TypeScript 5.5 new features", mode="official-docs")
web_searchkit_search(query="Redis vs Valkey benchmark", category="it")
```

## Troubleshooting

- **No tools appear:** Check the path in your MCP config is correct
- **SearXNG errors:** Ensure SearXNG is running: `curl http://127.0.0.1:8888/search?q=test&format=json`
- **Timeout:** Increase `fetchTimeoutMs` in the tool call parameters
