# Changelog

## 0.3.0 (2026-05-15)

### 🎉 Initial public release

- **Renamed** from `search-info` to `local-searcher`
- **Extracted** as standalone repository (previously embedded in OpenClaw workspace)

### Features

- `local_searcher_search` — SearXNG search with 7-version reranking pipeline (v1.0–v2.0)
- `local_searcher_research` — Checkpointed research runs with `search.json` + `report.md`
- `local_searcher_extract` — Page extraction with fetch + Playwright fallback
- `local_searcher_status` — Stack health check

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
