# Architecture

## Overview

agent-searchkit is a layered search infrastructure:

```
Agent Layer (OpenClaw / MCP / any framework)
    ↓
Tool Layer (search / research / extract / status)
    ↓
Rerank Pipeline (v1.0 → v2.0)
    ↓
SearXNG (meta-search: Google + Bing + DDG + Qwant)
```

## Components

### SearXNG

Open-source meta-search engine. Aggregates results from multiple search engines. agent-searchkit uses its JSON API (`format=json`).

### Rerank Pipeline

Progressive ranking system that improves result quality:

1. **Heuristic layer** — lexical matching, domain priors, source trust
2. **Semantic layer** — embedding similarity (optional, requires model)
3. **Adaptive layer** — query-intent-aware weighting between heuristic and semantic
4. **Entity layer** — page-role and entity-aware adjustments (v2.0)

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

Local notification bus for research-run progress updates. Not required for core functionality.

## Data Flow

1. Agent calls `web_searchkit_search` with query + options
2. Query is classified into an intent bucket (official-docs, github, models, etc.)
3. SearXNG returns raw results from multiple engines
4. Rerank pipeline scores and reorders results
5. Normalized results returned to agent

For research runs, steps 1-5 repeat with query variations, and all results are checkpointed to disk.
