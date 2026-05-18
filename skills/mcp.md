# Agent Searchkit — MCP Server Skill

## What this does

Exposes agent-searchkit as an MCP (Model Context Protocol) server, usable by any MCP-compatible agent (Claude Desktop, Cursor, Continue, etc.).

## Prerequisites

- Node.js 18+
- SearXNG running locally (default: `http://127.0.0.1:8888`)

## Setup

### 1. Choose an install path

For normal MCP client use, prefer npm:

```bash
npm install -g agent-searchkit
agent-searchkit-mcp --help
```

For local development:

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
npm install
npm run build
```

### 2. Configure your MCP client

Add to your MCP client config (e.g., `claude_desktop_config.json` or `.cursor/mcp.json`). macOS/Linux can use `npx`:

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "npx",
      "args": ["-y", "--package", "agent-searchkit@latest", "agent-searchkit-mcp"],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

On Windows, use `"command": "cmd"` and `"args": ["/c", "npx", "-y", "--package", "agent-searchkit@latest", "agent-searchkit-mcp"]`.

For LM Studio or other GUI clients, prefer a global install and an absolute command path to avoid PATH inheritance and first-run npx timeout issues.

Windows:

```bat
npm install -g agent-searchkit@latest
where agent-searchkit-mcp
agent-searchkit-mcp --help
```

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "C:\\Users\\YOUR_USER\\AppData\\Roaming\\npm\\agent-searchkit-mcp.cmd",
      "args": [],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

macOS / Linux:

```bash
npm install -g agent-searchkit@latest
which agent-searchkit-mcp
agent-searchkit-mcp --help
```

```json
{
  "mcpServers": {
    "agent-searchkit": {
      "command": "/opt/homebrew/bin/agent-searchkit-mcp",
      "args": [],
      "env": {
        "SEARXNG_BASE_URL": "http://127.0.0.1:8888"
      }
    }
  }
}
```

If reusing OpenClaw's local SearXNG, set `SEARXNG_BASE_URL` to `http://127.0.0.1:18080`.

For a local checkout, set `command` to `/absolute/path/to/agent-searchkit/bin/agent-searchkit-mcp` after running `npm run build`.

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
