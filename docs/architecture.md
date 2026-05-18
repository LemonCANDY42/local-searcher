# Architecture

## Overview

agent-searchkit is a layered search infrastructure:

```
Agent Layer (OpenClaw / MCP / any framework)
    ↓
Tool Layer (search / research / extract / status)
    ↓
Rerank Strategy Version (one of v1.0 → v2.0 per search)
    ↓
SearXNG (meta-search: Google + Bing + DDG + Qwant)
```

## Components

### SearXNG

Open-source meta-search engine. Aggregates results from multiple search engines. agent-searchkit uses its JSON API (`format=json`).

### Rerank Strategy Versions

A selectable ranking system with mutually exclusive strategy versions. A search uses one effective version: either the requested `rerankVersion`, the configured `defaultRerankVersion`, or `v1.0` when reranking is disabled.

The versions build on the same concepts, but they are evaluated as alternatives rather than executed as a single serial pipeline:

1. **v1.0** — raw SearXNG order
2. **v1.1** — heuristic hybrid: lexical matching, domain priors, source trust
3. **v1.2** — adds snippet embedding similarity when available
4. **v1.3 / v1.4** — adaptive weighting by query intent; `v1.4` is the default
5. **v1.5 / v2.0** — exact-fit, page-role, entity-aware, and source-family controls for higher-risk research cases

### Research Runs

Checkpointed search sessions that persist results as artifacts:

```
runs/
  20260515T120000Z-python-314/
    search.json    # raw + reranked results
    report.md      # human-readable summary
```

Runs are resumable — re-running the same query skips already-fetched results.

### ntfy (optional)

Local notification bus for research run progress updates. Not required for core functionality.

## Data Flow

1. Agent calls `web_searchkit_search` with query + options
2. Query is classified into an intent bucket (official-docs, github, models, etc.)
3. SearXNG returns raw results from multiple engines
4. The selected rerank strategy version scores and reorders results
5. Normalized results returned to agent

For research runs, steps 1-5 repeat with query variations, and all results are saved to disk.
