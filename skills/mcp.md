# Agent Searchkit — MCP Server Skill

## Purpose

Expose agent-searchkit as an MCP stdio server for MCP-compatible clients such as Claude Desktop, Cursor, Continue, LM Studio, and OpenClaw MCP plugin setups.

For the full installation guide, see [README MCP Setup](../README.md#mcp-setup) or [中文 MCP 配置](../README.zh-CN.md#mcp-配置).

## Prerequisites

- [Node.js 18+](https://nodejs.org/)
- SearXNG JSON API at `http://127.0.0.1:8888`
- Verify SearXNG with:
  ```bash
  curl "http://127.0.0.1:8888/search?q=openclaw&format=json"
  ```

## Recommended Config

Use the standard `npx --package` form. It does not require global installation:

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

For reproducibility, pin a version:

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

## Alternatives

Global install:

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

Windows local checkout fallback:

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

## Tools

| Tool | Purpose |
|---|---|
| `web_searchkit_search` | Search SearXNG and return normalized retrieval candidates |
| `web_searchkit_research` | Save a checkpointed research run |
| `web_searchkit_extract` | Extract readable page content |
| `web_searchkit_status` | Check local stack health |

## Output Contract

Treat returned results as retrieval candidates, not final answer order. The calling LLM should perform final semantic filtering and reranking.

When `citations=true`, each result includes a citation object:

```json
{
  "citation": {
    "ref": "[1]",
    "formatted": "[1] Page Title. https://example.com/page (accessed 2026-05-19)",
    "inline": "(example.com, 2026)"
  }
}
```

Recommended final answer format:

```markdown
Short answer with claims grounded in selected sources [1].

References:
[1] Page Title. https://example.com/page
```

Prefer standard Markdown links in tool output and skills:

```markdown
See [Agent Searchkit MCP setup](../README.md#mcp-setup).
```

## Troubleshooting

- No MCP tools appear: check the command path and restart the MCP client.
- JSON search returns 403: SearXNG has not enabled `search.formats: [json]`.
- Bridge startup timeout: use `agent-searchkit >= 0.3.20`.
- Chinese results look wrong: use `agent-searchkit >= 0.3.24`; CJK news-like queries extract the core entity before calling SearXNG.
