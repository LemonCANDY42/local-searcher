# Changelog

## 0.3.28 (2026-05-19)

### Fixed

- Extract core entities from romanized Chinese-name news queries such as `Zhang Xuefeng recent news activities 2025`, avoiding SearXNG/Bing fallback to single-token `zhang` matches.

## 0.3.27 (2026-05-19)

### Changed

- Restore the project-homepage README structure from the earlier 4f5e40e layout while keeping English as the default and adding a matching Chinese page.

## 0.3.26 (2026-05-19)

### Changed

- Rewrite the default README in English, add a full Chinese counterpart, clarify installation paths, and update skills to prefer Markdown links/citations and LLM-side final reranking.

## 0.3.25 (2026-05-19)

### Changed

- Clarify in tool output and docs that `agent-searchkit` returns retrieval candidates, while the calling LLM should perform final semantic filtering and reranking before answering.

## 0.3.24 (2026-05-19)

### Fixed

- For Chinese news-like multi-keyword queries, send the extracted core entity to SearXNG instead of the full modifier-heavy phrase, avoiding Bing/SearXNG fallback to single-character matches such as `马`.

## 0.3.23 (2026-05-19)

### Changed

- Adopt SearXNG request-shaping lessons from LangChain-SearXNG: default to `zh-CN`, explicitly pass curated engines, and compact whitespace-fragmented Chinese queries before sending them to SearXNG.

## 0.3.22 (2026-05-19)

### Changed

- Preserve native SearXNG result order for Chinese/CJK queries instead of applying agent-searchkit's independent reranking layer.

## 0.3.21 (2026-05-19)

### Fixed

- Add CJK entity-first retrieval seeds and a CJK core-entity rerank guard so spaced Chinese news queries such as `马斯克 最近 动向 新闻` do not drift into single-character matches like `马`.

## 0.3.20 (2026-05-19)

### Fixed

- Make the MCP stdio server tolerate JSON-lines initialize frames in addition to standard `Content-Length` MCP frames, improving compatibility with bridge implementations that do not frame stdio exactly like the reference SDK.
- Document that LM Studio / OpenClaw bridge startup timeouts with healthy SearXNG are fixed by using `agent-searchkit >= 0.3.20`.

## 0.3.19 (2026-05-19)

### Changed

- Clarify the standard MCP JSON config as `npx --package agent-searchkit@latest agent-searchkit-mcp`, with global-install and local-node alternatives for Windows.

## 0.3.18 (2026-05-19)

### Changed

- Document the Windows MCP setup path as local `node ...\\bin\\agent-searchkit-mcp` instead of relying on npm/npx bin shims that may not be visible to GUI-launched clients.

## 0.3.17 (2026-05-19)

### Fixed

- Send local proxy IP headers to SearXNG requests so local MCP searches do not trigger noisy botdetection logs about missing `X-Forwarded-For` / `X-Real-IP`.

## 0.3.16 (2026-05-19)

### Fixed

- Remove DuckDuckGo-backed engines from the default SearXNG quickstart profile because containerized local traffic can trigger CAPTCHA and produce scary startup/search logs.

## 0.3.15 (2026-05-19)

### Fixed

- Make the SearXNG settings file mount writable to avoid startup `chown` warnings from current SearXNG images.
- Trim the default SearXNG engine set to avoid common local-Docker failures from blocked or network-sensitive engines during MCP quickstart searches.

## 0.3.14 (2026-05-19)

### Fixed

- Make service helpers ignore inherited `COMPOSE_PROFILES=extras` for default startup, keeping Valkey and ntfy out of the MCP quickstart unless users explicitly run `up-extras`.

## 0.3.13 (2026-05-19)

### Fixed

- Make the default service bootstrap start only SearXNG so MCP setup does not depend on pulling optional Valkey or ntfy images.
- Move Valkey and ntfy behind the optional Docker Compose `extras` profile and keep readiness checks focused on the SearXNG JSON API.

## 0.3.12 (2026-05-19)

### Fixed

- Replace the SearXNG quickstart `docker run` example with repository-managed Docker Compose flows for macOS/Linux and Windows PowerShell.
- Mount the bundled SearXNG `settings.yml` directly so JSON search output is enabled reliably for MCP clients.
- Add a Windows `services/manage.ps1` helper and document JSON API verification as the readiness check, not just Web UI availability.
- Keep the bundled SearXNG engine list curated for MCP web search instead of relying on the noisy default engine set.

## 0.3.11 (2026-05-18)

### Fixed

- Expose `agent-searchkit` as the default npm bin so plain `npx -y agent-searchkit@latest` starts the MCP server.
- Accept LF-only MCP stdio headers in addition to CRLF headers for more tolerant GUI client handshakes.
- Simplify MCP setup docs to the package-name `npx` command.

## 0.3.10 (2026-05-18)

### Fixed

- Unify MCP setup guidance around npm/npx commands instead of OS-specific command wrappers.
- Lazy-load the heavy search bundle after MCP initialization so LM Studio can complete the stdio handshake before search code is loaded.

## 0.3.9 (2026-05-18)

### Fixed

- Add LM Studio-specific MCP setup guidance that uses the same npm/npx command shape as other MCP clients.
- Report the MCP server version from `package.json` instead of a hard-coded value.

## 0.3.8 (2026-05-18)

### Fixed

- Fix npx-based MCP install examples for packages with multiple bin entries by using `--package agent-searchkit@latest agent-searchkit-mcp`.
- Normalize npm package metadata so future publishes do not rely on npm auto-corrections.

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
