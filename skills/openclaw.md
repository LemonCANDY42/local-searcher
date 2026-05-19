# Agent Searchkit — OpenClaw Plugin Skill

## Purpose

Route OpenClaw's built-in `web_search` through local SearXNG via agent-searchkit.

For full setup, see [README OpenClaw Setup](../README.md#openclaw-setup) or [中文 OpenClaw 配置](../README.zh-CN.md#openclaw-配置).

## Install

```bash
openclaw plugins install clawhub:agent-searchkit --dangerously-force-unsafe-install
openclaw config set plugins.entries.agent-searchkit.enabled true
openclaw config set plugins.entries.agent-searchkit.config.searxngBaseUrl "http://127.0.0.1:8888"
openclaw config set tools.web.search.provider agent-searchkit
openclaw config validate
openclaw gateway restart
```

OpenClaw may require `--dangerously-force-unsafe-install` because optional page extraction and diagnostics use Node process-spawn APIs. Review the source before installing from an untrusted fork.

## Verify

```bash
openclaw config get tools.web.search.provider
cd /path/to/agent-searchkit/services
./manage.sh test
```

## Tools

| Tool | Purpose |
|---|---|
| `web_searchkit_search` | Search and return normalized candidates |
| `web_searchkit_research` | Save checkpointed research runs |
| `web_searchkit_extract` | Extract page content |
| `web_searchkit_status` | Check stack health |

## Output Guidance

agent-searchkit returns retrieval candidates. Final semantic filtering and reranking should happen in the calling LLM.

Use citations when the final answer needs sources:

```json
{
  "query": "OpenClaw web_search provider",
  "citations": true
}
```

Then answer with Markdown references:

```markdown
OpenClaw can route built-in `web_search` through agent-searchkit [1].

References:
[1] Agent Searchkit README. https://github.com/LemonCANDY42/agent-searchkit
```

## Configuration

Set under `plugins.entries.agent-searchkit.config`:

| Key | Default | Description |
|---|---|---|
| `searxngBaseUrl` | `http://127.0.0.1:8888` | SearXNG instance URL |
| `defaultLanguage` | `zh-CN` | Default search language |
| `defaultEngines` | `["bing", "bing news", "wikipedia"]` | SearXNG engines |
| `defaultLimit` | `8` | Results per query |
| `rerankEnabled` | `true` | Enable heuristic reranking for non-CJK queries |
| `defaultRerankVersion` | `v1.4` | Rerank version |
| `defaultMode` | `auto` | Search mode |

## Troubleshooting

- SearXNG not responding: run `./manage.sh up` from [services](../services).
- JSON search returns 403: use the bundled [SearXNG settings](../services/searxng/settings.yml).
- Chinese search quality issue: use `agent-searchkit >= 0.3.24`.
