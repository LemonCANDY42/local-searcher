# Changelog

## 0.4.0 (2026-05-17)

### Renamed

- **Renamed** from `local-searcher` to `agent-searchkit`

### Features

- **Citation mode** — pass `citations=true` to `web_searchkit_search` to get numbered references `[1], [2], ...` with formatted citation text for each result
- **Search query optimization guide** — `docs/query-optimization.md` with keyword extraction, operator reference, and reformulation strategies for agents
- **Agent skills** — ready-to-use integration guides for OpenClaw, MCP, LangChain, CrewAI, and standalone CLI (`skills/`)

## 0.3.0 (2026-05-15)

### 🎉 Initial public release

- **Renamed** from `search-info` to `agent-searchkit`
- **Extracted** as standalone repository (previously embedded in OpenClaw workspace)

### Features

- `web_searchkit_search` — SearXNG search with 7-version reranking pipeline (v1.0–v2.0)
- `web_searchkit_research` — Checkpointed research runs with `search.json` + `report.md`
- `web_searchkit_extract` — Page extraction with fetch + Playwright fallback
- `web_searchkit_status` — Stack health check

### Reranking

- v1.0 — Raw SearXNG order
- v1.1 — Heuristic hybrid (lexical + domain priors)
- v1.2 — + Snippet embedding similarity
- v1.3 — Adaptive hybrid (query-bucket weighting)
- v1.4 — **Default** — retrieval-first + adaptive rerank
- v1.5 — + exact-fit refinement
- v2.0 — Entity-aware + page-role overlay

### Infrastructure

- Docker Compose for SearXNG + ntfy
- Smoke test suite
- Benchmark framework with pairwise version comparison
- Promotion gate evaluation scripts
