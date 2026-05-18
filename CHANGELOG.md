# Changelog

## 0.3.7 (2026-05-18)

### Changed

- Enhance the OpenClaw `web_search` provider adapter with citation-aware structured output, including `citation`, `sources`, `rank`, `publishedDate`, rerank metadata, and optional `mode` / `rerankVersion` controls.
- Clarify Quickstart setup for OpenClaw, MCP, and other agent/CLI integrations.
- Replace the misleading reranking-pipeline wording with mutually exclusive rerank strategy versions, and document how benchmark runs compare those versions.
- Replace old low-level CLI names with project-named commands (`agent-searchkit-search`, `agent-searchkit-research`) and clarify that CLI examples are direct SearXNG smoke tests rather than the OpenClaw provider path.
- Add a real `agent-searchkit-mcp` npm bin, MCP smoke test, CI workflow, and release-triggered npm publish workflow.

## 0.3.6 (2026-05-17)

### Fixed

- Implement the OpenClaw 2026.5.12 web-search provider runtime contract with provider-owned `createTool(...)` so `tools.web.search.provider = "agent-searchkit"` works at call time.

## 0.3.5 (2026-05-17)

### Fixed

- Move the OpenClaw web-search provider declaration to `contracts.webSearchProviders` so OpenClaw 2026.5.12+ can select `agent-searchkit` as `tools.web.search.provider`.

## 0.3.4 (2026-05-17)

### Changed

- Document OpenClaw 2026.5.12+ install behavior for `node:child_process` safety warnings and recommend `--dangerously-force-unsafe-install` only for trusted installs.
- Add `esbuild` as an explicit dev dependency so fresh checkouts can run `npm run build`.

### Fixed

- Fix the test manifest import path and align renamed `agent-searchkit` matching fixtures.

## 0.4.0 (2026-05-17)

### Renamed

- **Renamed** from `local-searcher` to `agent-searchkit`

### Features

- **OpenClaw web-search provider** — plugin registers as an OpenClaw web-search provider; set `tools.web.search.provider: "agent-searchkit"` to make `web_search` use SearXNG + reranking automatically
- **Citation mode** — pass `citations=true` to `web_searchkit_search` to get numbered references `[1], [2], ...` with formatted citation text for each result
- **Search query optimization guide** — `docs/query-optimization.md` with keyword extraction, operator reference, and reformulation strategies for agents
- **Agent skills** — ready-to-use integration guides for OpenClaw, MCP, LangChain, CrewAI, and standalone CLI (`skills/`)

## 0.3.0 (2026-05-15)

### 🎉 Initial public release

- **Renamed** from `search-info` to `agent-searchkit`
- **Extracted** as standalone repository (previously embedded in OpenClaw workspace)

### Features

- `web_searchkit_search` — SearXNG search with selectable rerank strategy versions (v1.0–v2.0)
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
