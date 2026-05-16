import test from "node:test";
import assert from "node:assert/strict";
import manifest from "./openclaw.plugin.json" with { type: "json" };

import { __test } from "./index.ts";

function makeResult(overrides = {}) {
  return {
    title: "Example Result",
    url: "https://example.com/article",
    snippet: "Example snippet",
    host: "example.com",
    path: "/article",
    originalRank: 1,
    categories: ["general"],
    score: 0.5,
    rank: 1,
    ...overrides,
  };
}

function makeBroadPlanner() {
  return {
    branch: "broad-discovery",
    precisionDial: "broad",
    rationale: ["test fixture"],
    expectedNextStep: "fetch",
    flags: {
      verifySensitive: false,
      extractionImportant: false,
      exactEntityLikely: false,
      solutionIntentLikely: false,
    },
    queryProfile: {
      tokenCount: 5,
      hasQuotedEntity: false,
      hasErrorLikePattern: false,
      hasOfficialHint: false,
      hasComparisonHint: true,
      hasHowToHint: false,
      hasSimilarityHint: true,
      hasExtractionHint: false,
    },
  };
}

test("planner picks broad discovery for exploratory alternatives queries", () => {
  const intent = __test.detectQueryIntent("open source alternatives to perplexity for local agents", "auto");
  const planner = __test.buildPlannerOutput("open source alternatives to perplexity for local agents", intent);

  assert.equal(planner.branch, "broad-discovery");
  assert.equal(planner.precisionDial, "broad");
  assert.equal(planner.flags.solutionIntentLikely, false);
});

test("planner picks solution hunt for troubleshooting queries", () => {
  const query = "how to fix searxng docker timeout";
  const intent = __test.detectQueryIntent(query, "auto");
  const planner = __test.buildPlannerOutput(query, intent);

  assert.equal(planner.branch, "solution-hunt");
  assert.equal(planner.flags.solutionIntentLikely, true);
  assert.equal(planner.expectedNextStep, "fetch");
});

test("planner keeps exact docs lookups on the precision path", () => {
  const query = "OpenAI Responses API docs";
  const intent = __test.detectQueryIntent(query, "auto");
  const planner = __test.buildPlannerOutput(query, intent);

  assert.equal(planner.branch, "precision-lookup");
  assert.equal(planner.precisionDial, "precise");
});

test("agent-aware contract can force official-doc and model intent with small structured fields", () => {
  const releaseIntent = __test.detectQueryIntent(
    "OpenClaw latest notes",
    "auto",
    "general",
    { taskMode: "extract", targetKind: "release-artifact", sourceTrust: "official-first" },
  );
  const modelIntent = __test.detectQueryIntent(
    "best qwen choice for local coding",
    "auto",
    "general",
    { taskMode: "compare", targetKind: "model-choice", sourceTrust: "balanced" },
  );

  assert.equal(releaseIntent.mode, "official-docs");
  assert.equal(releaseIntent.officialLike, true);
  assert.deepEqual(releaseIntent.agentContract, {
    taskMode: "extract",
    targetKind: "release-artifact",
    sourceTrust: "official-first",
  });
  assert.equal(modelIntent.mode, "models");
  assert.equal(modelIntent.modelLike, true);
});

test("result typing distinguishes docs, repos, and issue threads", () => {
  assert.equal(
    __test.classifyResultType(
      makeResult({
        title: "OpenAI Responses API reference",
        host: "platform.openai.com",
        url: "https://platform.openai.com/docs/api-reference/responses",
        path: "/docs/api-reference/responses",
      }),
    ).resultType,
    "official-docs",
  );

  assert.equal(
    __test.classifyResultType(
      makeResult({
        title: "react-native-sqlite-storage",
        host: "github.com",
        url: "https://github.com/andpor/react-native-sqlite-storage",
        path: "/andpor/react-native-sqlite-storage",
      }),
    ).resultType,
    "repo",
  );

  assert.equal(
    __test.classifyResultType(
      makeResult({
        title: "Timeout issue · searxng/searxng",
        host: "github.com",
        url: "https://github.com/searxng/searxng/issues/1234",
        path: "/searxng/searxng/issues/1234",
      }),
    ).resultType,
    "issue-thread",
  );
});

test("v1.5 planner adjustment promotes practical artifacts for solution hunt", () => {
  const query = "React Native sqlite solution example github";
  const intent = __test.detectQueryIntent(query, "auto");
  const planner = __test.buildPlannerOutput(query, intent);
  const ranked = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "Best SQLite options for React Native in 2026",
        url: "https://example.com/blog/react-native-sqlite-options",
        host: "example.com",
        path: "/blog/react-native-sqlite-options",
        score: 0.62,
      }),
      makeResult({
        title: "react-native-sqlite-storage",
        url: "https://github.com/andpor/react-native-sqlite-storage",
        host: "github.com",
        path: "/andpor/react-native-sqlite-storage",
        snippet: "SQLite storage implementation for React Native with examples.",
        originalRank: 2,
        score: 0.54,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  assert.equal(planner.branch, "solution-hunt");
  assert.equal(ranked[0].host, "github.com");
  assert.equal(ranked[0].resultType, "repo");
  assert.ok((ranked[0].plannerAdjustment ?? 0) > (ranked[1].plannerAdjustment ?? 0));
});

test("v1.5 guarded adjustment protects canonical docs in github/source-seeking queries", () => {
  const query = "OpenClaw agent-searchkit plugin github code";
  const intent = __test.detectQueryIntent(query, "github");
  const planner = __test.buildPlannerOutput(query, intent);
  const ranked = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "openclaw · GitHub",
        url: "https://github.com/openclaw",
        host: "github.com",
        path: "/openclaw",
        score: 0.97,
      }),
      makeResult({
        title: "OpenClaw GitHub Repository: What's Inside, How to Fork, and More",
        url: "https://macaron.im/blog/openclaw-github",
        host: "macaron.im",
        path: "/blog/openclaw-github",
        score: 0.77,
      }),
      makeResult({
        title: "Plugins | Docs | OpenClaw",
        url: "https://openclaws.io/docs/tools/plugin",
        host: "openclaws.io",
        path: "/docs/tools/plugin",
        score: 0.63,
      }),
      makeResult({
        title: "Plugins - OpenClaw",
        url: "https://docs.openclaw.ai/tools/plugin",
        host: "docs.openclaw.ai",
        path: "/tools/plugin",
        score: 0.59,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, applyGuardedAdjustment: true, debug: true },
  );

  assert.equal(planner.branch, "solution-hunt");
  assert.equal(ranked[0].host, "github.com");
  assert.deepEqual(ranked.slice(0, 3).map((result) => result.host), ["github.com", "macaron.im", "docs.openclaw.ai"]);
  assert.ok((ranked[2].guardedAdjustment ?? 0) > (ranked[3].guardedAdjustment ?? 0));
  assert.ok((ranked[2].sourceFitScore ?? 0) > (ranked[3].sourceFitScore ?? 0));
});

test("v1.5 rerank lifts deep docs pages above generic docs hubs", () => {
  const query = "OpenAI Responses API audio input docs";
  const intent = __test.detectQueryIntent(query, "official-docs");
  const planner = __test.buildPlannerOutput(query, intent);
  const annotated = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "OpenAI API Platform Documentation",
        url: "https://developers.openai.com/api/docs",
        host: "developers.openai.com",
        path: "/api/docs",
        score: 0.92,
      }),
      makeResult({
        title: "Audio and speech | OpenAI API",
        url: "https://developers.openai.com/api/docs/guides/audio",
        host: "developers.openai.com",
        path: "/api/docs/guides/audio",
        originalRank: 2,
        score: 0.83,
      }),
      makeResult({
        title: "OpenAI Responses API developer guide",
        url: "https://www.datacamp.com/tutorial/openai-responses-api",
        host: "datacamp.com",
        path: "/tutorial/openai-responses-api",
        originalRank: 3,
        score: 0.81,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
  );

  const reranked = __test.rerankResultsV15(annotated, intent, planner, 3, true);

  assert.equal(reranked[0].path, "/api/docs/guides/audio");
  assert.ok((reranked[0].pageSpecificity ?? 0) > (reranked[1].pageSpecificity ?? 0));
});

test("broad decontamination removes low-confidence demoted hosts without docker intent", () => {
  const query = "open source coding assistant landscape aider continue openhands";
  const intent = __test.detectQueryIntent(query, "general", "it");
  const cleaned = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "datastax/astra-assistants",
        url: "https://hub.docker.com/r/datastax/astra-assistants",
        host: "hub.docker.com",
        path: "/r/datastax/astra-assistants",
        score: 0.59,
        engine: "docker hub",
      }),
      makeResult({
        title: "Aider vs. Continue vs. OpenHands Comparison - SourceForge",
        url: "https://sourceforge.net/software/compare/Aider-AI-vs-Continue-vs-OpenHands/",
        host: "sourceforge.net",
        path: "/software/compare/Aider-AI-vs-Continue-vs-OpenHands/",
        score: 0.84,
        originalRank: 2,
        rank: 2,
      }),
    ],
    intent,
    "it",
    true,
  );

  assert.equal(cleaned.summary.removedCount, 1);
  assert.deepEqual(cleaned.results.map((result) => result.host), ["sourceforge.net"]);
  assert.equal(cleaned.summary.reasonCounts["demoted-host-low-confidence"], 1);
});

test("v1.5 exact docs lookups do not apply diversity slate by default", () => {
  const query = "python venv docs";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "venv — Creation of virtual environments — Python 3.12 docs",
          url: "https://docs.python.org/3/library/venv.html",
          host: "docs.python.org",
          path: "/3/library/venv.html",
          score: 0.91,
        }),
        makeResult({
          title: "venv - Python 3.12.1 documentation",
          url: "https://getdocs.org/Python/docs/3.12/library/venv",
          host: "getdocs.org",
          path: "/Python/docs/3.12/library/venv",
          score: 0.83,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Python 3.12 docs - venv",
          url: "https://devdocs.io/python~3.12/library/venv",
          host: "devdocs.io",
          path: "/python~3.12/library/venv",
          score: 0.78,
          originalRank: 3,
          rank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    3,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.ok(reranked.every((result) => !(result.signals ?? []).some((signal) => signal.startsWith("v1.5-slate:"))));
});

test("v1.5 keeps package registry results ahead of github repos for npm package queries", () => {
  const query = "react native sqlite bindings npm package";
  const intent = __test.detectQueryIntent(query, "packages");
  const planner = __test.buildPlannerOutput(query, intent);
  const ranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "react-native-sqlite-2 - npm",
          url: "https://www.npmjs.com/package/react-native-sqlite-2",
          host: "npmjs.com",
          path: "/package/react-native-sqlite-2",
          score: 0.9349,
        }),
        makeResult({
          title: "react-native-sqlite-storage - npm",
          url: "https://www.npmjs.com/package/react-native-sqlite-storage",
          host: "npmjs.com",
          path: "/package/react-native-sqlite-storage",
          score: 0.8556,
          originalRank: 2,
        }),
        makeResult({
          title: "GitHub - almost/react-native-sqlite: SQLite3 bindings for React Native",
          url: "https://github.com/almost/react-native-sqlite",
          host: "github.com",
          path: "/almost/react-native-sqlite",
          score: 0.7848,
          originalRank: 6,
        }),
        makeResult({
          title: "@mendix/react-native-sqlite-storage 7.1.0 on npm - Libraries.io",
          url: "https://libraries.io/npm/@mendix%2Freact-native-sqlite-storage",
          host: "libraries.io",
          path: "/npm/@mendix%2Freact-native-sqlite-storage",
          score: 0.6173,
          originalRank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "solution-hunt");
  assert.deepEqual(ranked.slice(0, 3).map((result) => result.host), ["npmjs.com", "npmjs.com", "libraries.io"]);
  assert.ok((ranked[2].guardedAdjustment ?? 0) >= (ranked[3].guardedAdjustment ?? 0));
});

test("v1.5 keeps exact technical issue threads above partial-match foreign docs", () => {
  const query = "node-llama-cpp package missing install fix";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Troubleshooting | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/troubleshooting",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/troubleshooting",
          score: 0.8489,
        }),
        makeResult({
          title: "Getting Started | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/getting-started",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/getting-started",
          score: 0.8142,
          originalRank: 2,
        }),
        makeResult({
          title: "Regression: node-llama-cpp missing after upgrade to 2026.3.12",
          url: "https://github.com/withcatai/node-llama-cpp/issues/123",
          host: "github.com",
          path: "/withcatai/node-llama-cpp/issues/123",
          score: 0.8044,
          originalRank: 3,
        }),
        makeResult({
          title: "llama.cpp - Qwen - Read the Docs",
          url: "https://qwen.readthedocs.io/en/latest/llama.cpp.html",
          host: "qwen.readthedocs.io",
          path: "/en/latest/llama.cpp.html",
          score: 0.7908,
          originalRank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.equal(reranked[0].host, "node-llama-cpp.withcat.ai");
  const githubIndex = reranked.findIndex((result) => result.host === "github.com");
  const qwenIndex = reranked.findIndex((result) => result.host === "qwen.readthedocs.io");
  assert.ok(githubIndex >= 0);
  assert.ok(qwenIndex >= 0);
  assert.ok(githubIndex < reranked.length);
  assert.ok((reranked[githubIndex].entityMatchStrength ?? 0) > (reranked[qwenIndex].entityMatchStrength ?? 0));
  assert.ok((reranked[githubIndex].pageSpecificity ?? 0) > (reranked[qwenIndex].pageSpecificity ?? 0));
});

test("official-docs troubleshooting rewrites favor guide-style retrieval over generic api-reference expansion", () => {
  const query = "node-llama-cpp package missing install fix";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const plan = __test.buildRetrievalPlanV14(query, intent, "it", "en-US");

  assert.equal(plan.strategy, "retrieval-first-v1.4");
  assert.equal(plan.variants.length, 2);
  assert.equal(plan.variants[1].rationale.at(-1), "troubleshooting-guide");
  assert.match(plan.variants[1].query, /troubleshooting/);
  assert.match(plan.variants[1].query, /guide/);
  assert.doesNotMatch(plan.variants[1].query, /api reference/);
});

test("v1.5 precision docs penalize generic homepages with no exact entity fit", () => {
  const query = "node-llama-cpp package missing install fix";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "关于本文档 | Node.js v24 文档",
          url: "https://nodejs.cn/api/documentation.html",
          host: "nodejs.cn",
          path: "/api/documentation.html",
          score: 0.95,
        }),
        makeResult({
          title: "Troubleshooting | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/troubleshooting",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/troubleshooting",
          score: 0.84,
          originalRank: 2,
        }),
        makeResult({
          title: "Getting Started | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/",
          score: 0.82,
          originalRank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.equal(reranked[0].host, "node-llama-cpp.withcat.ai");
  const genericDocsResult = reranked.find((result) => result.host === "nodejs.cn");
  assert.ok(genericDocsResult);
  assert.ok((genericDocsResult?.guardedAdjustment ?? 0) < 0);
});

test("v1.5 extract-heavy slate prefers distinct source families before duplicate docs mirrors", () => {
  const query = "OpenClaw release notes latest";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "OpenClaw - OpenClaw",
          url: "https://docs.openclaw.ai/",
          host: "docs.openclaw.ai",
          path: "/",
          score: 0.92,
        }),
        makeResult({
          title: "OpenClaw - OpenClaw",
          url: "https://docs.openclaw.ai/releases",
          host: "docs.openclaw.ai",
          path: "/releases",
          score: 0.88,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Releases · openclaw/openclaw - GitHub",
          url: "https://github.com/openclaw/openclaw/releases",
          host: "github.com",
          path: "/openclaw/openclaw/releases",
          score: 0.79,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "Openclaw Release Notes - March 2026 Latest Updates - Releasebot",
          url: "https://releasebot.io/openclaw",
          host: "releasebot.io",
          path: "/openclaw",
          score: 0.73,
          originalRank: 4,
          rank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.flags.extractionImportant, true);
  assert.deepEqual(reranked.slice(0, 3).map((result) => result.host), ["github.com", "docs.openclaw.ai", "releasebot.io"]);
  assert.ok((reranked[3].signals ?? []).includes("v1.5-slate:family-backfill"));
});

test("v1.5 model slate introduces a third source family before same-family backfill", () => {
  const query = "Qwen GGUF modelscope huggingface";
  const intent = __test.detectQueryIntent(query, "models", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Qwen3.5合集详情-来自Qwen · ModelScope",
          url: "https://www.modelscope.cn/models/qwen-35",
          host: "modelscope.cn",
          path: "/models/qwen-35",
          score: 0.88,
        }),
        makeResult({
          title: "Qwen/Qwen3-VL-8B-Instruct · Hugging Face",
          url: "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct",
          host: "huggingface.co",
          path: "/Qwen/Qwen3-VL-8B-Instruct",
          score: 0.84,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Qwen/Qwen2.5-7B-Instruct-GGUF · Hugging Face",
          url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF",
          host: "huggingface.co",
          path: "/Qwen/Qwen2.5-7B-Instruct-GGUF",
          score: 0.785,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "Qwen2-7B-Instruct-GGUF · Models",
          url: "https://www.modelscope.cn/models/qwen2-7B-Instruct-GGUF",
          host: "modelscope.cn",
          path: "/models/qwen2-7B-Instruct-GGUF",
          score: 0.784,
          originalRank: 4,
          rank: 4,
        }),
        makeResult({
          title: "GitHub - huggingface/Qwen2.5-Coder",
          url: "https://github.com/huggingface/Qwen2.5-Coder",
          host: "github.com",
          path: "/huggingface/Qwen2.5-Coder",
          score: 0.6966,
          originalRank: 5,
          rank: 5,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.deepEqual(reranked.slice(0, 3).map((result) => result.host), ["modelscope.cn", "huggingface.co", "github.com"]);
  assert.ok((reranked[3].signals ?? []).includes("v1.5-slate:family-backfill"));
});

test("v1.5 favors official release-note artifacts over generic release trackers", () => {
  const query = "Node.js 22 changelog release notes";
  const intent = __test.detectQueryIntent(query, "official-docs", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Release Notes for Node.js 22 | Red Hat build of Node.js | 22 ...",
          url: "https://docs.redhat.com/nodejs22/release-notes",
          host: "docs.redhat.com",
          path: "/nodejs22/release-notes",
          score: 0.9837,
        }),
        makeResult({
          title: "node/CHANGELOG.md at main · nodejs/node · GitHub",
          url: "https://github.com/nodejs/node/blob/main/CHANGELOG.md",
          host: "github.com",
          path: "/nodejs/node/blob/main/CHANGELOG.md",
          score: 0.6415,
          originalRank: 2,
        }),
        makeResult({
          title: "Node.js 22: List Releases, Release Date, End of Life - VersionLog",
          url: "https://versionlog.com/nodejs/22",
          host: "versionlog.com",
          path: "/nodejs/22",
          score: 0.5898,
          originalRank: 3,
        }),
        makeResult({
          title: "Node.js 22 is now available!",
          url: "https://nodejs.org/en/blog/announcements/v22-release-announce",
          host: "nodejs.org",
          path: "/en/blog/announcements/v22-release-announce",
          score: 0.5945,
          originalRank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.ok(reranked.findIndex((result) => result.host === "nodejs.org") < reranked.findIndex((result) => result.host === "versionlog.com"));
  assert.ok(reranked.findIndex((result) => result.host === "nodejs.org") <= 1);
});

test("v1.5 broad discovery favors workflow templates over generic repos", () => {
  const query = "pm interview loop workflow rubric";
  const intent = __test.detectQueryIntent(query, "general", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Amazon PM-T Final Loop: How technical do my interview stories ...",
          url: "https://teamblind.com/post/pm-loop",
          host: "teamblind.com",
          path: "/post/pm-loop",
          score: 0.892,
        }),
        makeResult({
          title: "Interviewing product managers: a playbook for PM leaders",
          url: "https://rocketblocks.me/blog/pm-playbook",
          host: "rocketblocks.me",
          path: "/blog/pm-playbook",
          score: 0.838,
          originalRank: 2,
        }),
        makeResult({
          title: "PM Interview Template | IdeaPlan",
          url: "https://ideaplan.io/templates/pm-interview",
          host: "ideaplan.io",
          path: "/templates/pm-interview",
          score: 0.8286,
          originalRank: 3,
        }),
        makeResult({
          title: "GitHub - isumitsoni/ai-pm-interview-kit: Interview prep for ...",
          url: "https://github.com/isumitsoni/ai-pm-interview-kit",
          host: "github.com",
          path: "/isumitsoni/ai-pm-interview-kit",
          score: 0.7939,
          originalRank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "broad-discovery");
  assert.deepEqual(reranked.slice(0, 3).map((result) => result.host), ["teamblind.com", "rocketblocks.me", "ideaplan.io"]);
  assert.equal(reranked[1].resultType, "tutorial");
  assert.equal(reranked[2].resultType, "tutorial");
});

test("v1.5 broad discovery downranks platform-only meta results on mixed-intent creator queries", () => {
  const query = "广州 探店 up主 bilibili";
  const intent = __test.detectQueryIntent(query, "general", "videos");
  const planner = __test.buildPlannerOutput(query, intent, "videos");
  const reranked = __test.rerankResultsV15(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "BILIBILI 2024 UP100 百大UP主盛典 全程回顾（上）",
          url: "https://www.bilibili.com/video/up100-1",
          host: "bilibili.com",
          path: "/video/up100-1",
          score: 0.9107,
        }),
        makeResult({
          title: "BILIBILI 2024 UP100 百大UP主盛典 全程回顾（下）",
          url: "https://www.bilibili.com/video/up100-2",
          host: "bilibili.com",
          path: "/video/up100-2",
          score: 0.8664,
          originalRank: 2,
        }),
        makeResult({
          title: "【探店】广州也有F1主题店？",
          url: "https://www.bilibili.com/video/f1gz",
          host: "bilibili.com",
          path: "/video/f1gz",
          score: 0.4302,
          originalRank: 3,
        }),
        makeResult({
          title: "【豚豚探店】广州｜本地老饕才知道的顶级街头美食‼️这期一定要收藏好‼️",
          url: "https://www.bilibili.com/video/streetfood",
          host: "bilibili.com",
          path: "/video/streetfood",
          score: 0.771,
          originalRank: 4,
        }),
        makeResult({
          title: "超详细!动漫星城东区和周边商店和饮食攻略!路盲必备的攻略!#二次元 #探店 #周末去哪玩 #广州动漫星城",
          url: "https://www.douyin.com/video/gzfood",
          host: "douyin.com",
          path: "/video/gzfood",
          score: 0.6967,
          originalRank: 5,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, applyGuardedAdjustment: false, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.equal(planner.branch, "broad-discovery");
  assert.deepEqual(reranked.slice(0, 2).map((result) => result.host), ["bilibili.com", "douyin.com"]);
  assert.match(reranked[0].title, /探店|广州/);
  assert.ok(reranked[2].title.includes('UP100'));
});

test("structured token matching handles hyphenated tool names across spacing variants", () => {
  assert.equal(
    __test.countTokenMatches("Search Info Plugin Overview", ["agent-searchkit", "plugin"]),
    2,
  );
  assert.equal(
    __test.textIncludesQueryPhrase("OpenClaw Search Info Plugin", "agent-searchkit plugin"),
    true,
  );
});

test("structured entity matching promotes punctuation-variant docs results", () => {
  const query = "agent-searchkit plugin docs";
  const intent = __test.detectQueryIntent(query, "official-docs");
  const planner = __test.buildPlannerOutput(query, intent);
  const ranked = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "Search plugin docs overview",
        url: "https://readthedocs.io/projects/search-plugin/overview",
        host: "readthedocs.io",
        path: "/projects/search-plugin/overview",
        originalRank: 1,
        score: 0.6,
      }),
      makeResult({
        title: "Search Info Plugin docs overview",
        url: "https://readthedocs.io/projects/plugin/overview",
        host: "readthedocs.io",
        path: "/projects/plugin/overview",
        originalRank: 2,
        score: 0.6,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.equal(ranked[0].title, "Search Info Plugin docs overview");
  assert.ok((ranked[0].entityMatchStrength ?? 0) > (ranked[1].entityMatchStrength ?? 0));
});

test("v1.4 decontamination keeps strong landing candidates when precision guard is disabled", () => {
  const query = "OpenAI Responses API docs";
  const intent = __test.detectQueryIntent(query, "auto");
  const decontaminated = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "Docker Hub Search",
        url: "https://hub.docker.com/search?q=openai",
        host: "hub.docker.com",
        path: "/search?q=openai",
        snippet: "Find trusted content on Docker Hub for OpenAI-related images.",
      }),
      makeResult({
        title: "OpenAI API Platform",
        url: "https://openai.com/",
        host: "openai.com",
        path: "/",
        originalRank: 2,
        snippet: "OpenAI API platform for developers.",
      }),
      makeResult({
        title: "Responses API reference",
        url: "https://platform.openai.com/docs/api-reference/responses",
        host: "platform.openai.com",
        path: "/docs/api-reference/responses",
        originalRank: 3,
        snippet: "Reference for the Responses API.",
      }),
    ],
    intent,
    undefined,
    true,
  );

  assert.deepEqual(
    decontaminated.results.map((result) => result.host),
    ["hub.docker.com", "openai.com", "platform.openai.com"],
  );
  assert.equal(decontaminated.summary.reasonCounts["off-intent-technical-landing"], undefined);
});

test("v1.5 decontamination removes off-intent landing noise for precise docs lookup", () => {
  const query = "OpenAI Responses API docs";
  const intent = __test.detectQueryIntent(query, "auto");
  const decontaminated = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "Docker Hub Search",
        url: "https://hub.docker.com/search?q=openai",
        host: "hub.docker.com",
        path: "/search?q=openai",
        snippet: "Find trusted content on Docker Hub for OpenAI-related images.",
      }),
      makeResult({
        title: "OpenAI API Platform",
        url: "https://openai.com/",
        host: "openai.com",
        path: "/",
        originalRank: 2,
        snippet: "OpenAI API platform for developers.",
      }),
      makeResult({
        title: "Responses API reference",
        url: "https://platform.openai.com/docs/api-reference/responses",
        host: "platform.openai.com",
        path: "/docs/api-reference/responses",
        originalRank: 3,
        snippet: "Reference for the Responses API.",
      }),
    ],
    intent,
    undefined,
    true,
    { enablePrecisionLandingGuard: true },
  );

  assert.deepEqual(
    decontaminated.results.map((result) => result.host),
    ["platform.openai.com"],
  );
  assert.equal(decontaminated.summary.reasonCounts["off-intent-technical-landing"], 2);
});

test("v2.0 decontamination preserves entity-aligned docs families for navigational docs queries", () => {
  const query = "docs.openclaw.ai plugin guide";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const decontaminated = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "Plugins - OpenClaw",
        url: "https://docs.openclaw.ai/tools/plugin",
        host: "docs.openclaw.ai",
        path: "/tools/plugin",
        snippet: "Official OpenClaw plugin guide.",
      }),
      makeResult({
        title: "Home | OpenClaw Docs",
        url: "https://clawdocs.org/",
        host: "clawdocs.org",
        path: "/",
        originalRank: 2,
        rank: 2,
        snippet: "OpenClaw documentation home.",
      }),
      makeResult({
        title: "OpenClaw | Openclaw Docs",
        url: "https://openclaw.im/",
        host: "openclaw.im",
        path: "/",
        originalRank: 3,
        rank: 3,
        snippet: "OpenClaw docs home.",
      }),
      makeResult({
        title: "Tencent Docs",
        url: "https://docs.qq.com/",
        host: "docs.qq.com",
        path: "/",
        originalRank: 4,
        rank: 4,
        snippet: "Online docs and collaboration.",
      }),
    ],
    intent,
    "it",
    true,
    { enablePrecisionLandingGuard: true },
  );

  assert.deepEqual(
    decontaminated.results.map((result) => result.host),
    ["docs.openclaw.ai", "clawdocs.org", "openclaw.im"],
  );
  assert.equal(decontaminated.summary.reasonCounts["off-intent-technical-landing"], 1);
});

test("v1.4 decontamination keeps homepage candidates for official-site queries", () => {
  const query = "OpenAI official site";
  const intent = __test.detectQueryIntent(query, "auto");
  const decontaminated = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "OpenAI",
        url: "https://openai.com/",
        host: "openai.com",
        path: "/",
        snippet: "Official OpenAI website.",
      }),
      makeResult({
        title: "OpenAI API reference",
        url: "https://platform.openai.com/docs/api-reference/introduction",
        host: "platform.openai.com",
        path: "/docs/api-reference/introduction",
        originalRank: 2,
        snippet: "Official API documentation.",
      }),
    ],
    intent,
    undefined,
    true,
  );

  assert.deepEqual(
    decontaminated.results.map((result) => result.host),
    ["openai.com", "platform.openai.com"],
  );
  assert.equal(decontaminated.summary.removedCount, 0);
});

test("v1.4 decontamination keeps Docker Hub pages when docker intent is explicit", () => {
  const query = "openai docker image";
  const intent = __test.detectQueryIntent(query, "auto");
  const decontaminated = __test.decontaminateResultsV14(
    [
      makeResult({
        title: "Docker Hub Search",
        url: "https://hub.docker.com/search?q=openai",
        host: "hub.docker.com",
        path: "/search?q=openai",
        snippet: "Find OpenAI images on Docker Hub.",
      }),
      makeResult({
        title: "OpenAI docs",
        url: "https://platform.openai.com/docs/overview",
        host: "platform.openai.com",
        path: "/docs/overview",
        originalRank: 2,
        snippet: "OpenAI developer docs.",
      }),
    ],
    intent,
    undefined,
    true,
  );

  assert.equal(decontaminated.summary.removedCount, 0);
  assert.deepEqual(
    decontaminated.results.map((result) => result.host),
    ["hub.docker.com", "platform.openai.com"],
  );
});

test("v2.0 lexical guard keeps MCP explainer results above partial-match noise", () => {
  const query = "what is model context protocol MCP explained";
  const intent = __test.detectQueryIntent(query, "general", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Introduction - Model Context Protocol",
          url: "https://modelcontextprotocol.io/introduction",
          host: "modelcontextprotocol.io",
          path: "/introduction",
          snippet: "Model Context Protocol introduction, transport, client and server concepts.",
          score: 0.79,
        }),
        makeResult({
          title: "Model Context Protocol (MCP) overview | Cloudflare Docs",
          url: "https://developers.cloudflare.com/agents/model-context-protocol/",
          host: "developers.cloudflare.com",
          path: "/agents/model-context-protocol/",
          snippet: "MCP server and client overview for AI agents and tools.",
          score: 0.74,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "MCP Overview for Agents",
          url: "https://docs.anthropic.com/en/docs/agents-and-tools/mcp",
          host: "docs.anthropic.com",
          path: "/en/docs/agents-and-tools/mcp",
          snippet: "Model Context Protocol for agents and tools.",
          score: 0.76,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "DIY: Model 3 12V Battery Replacement - Full Walkthrough",
          url: "https://teslamotorsclub.com/tmc/threads/model-3-12v-battery-replacement.302091/",
          host: "teslamotorsclub.com",
          path: "/tmc/threads/model-3-12v-battery-replacement.302091/",
          snippet: "Model 3 battery replacement walkthrough.",
          score: 0.9,
          originalRank: 4,
          rank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(reranked[0].host, "developers.cloudflare.com");
  assert.ok(reranked.slice(0, 3).some((result) => result.host === "docs.anthropic.com"));
  assert.notEqual(reranked[0].host, "teslamotorsclub.com");
});

test("v2.0 explainer controller lifts aspect-rich MCP explainers over lower-coverage docs", () => {
  const query = "model context protocol how it works client server tools";
  const intent = __test.detectQueryIntent(query, "general", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "What Is the Model Context Protocol (MCP) and How It Works",
          url: "https://www.descope.com/learn/post/mcp",
          host: "descope.com",
          path: "/learn/post/mcp",
          snippet: "MCP explained with client, server, and tools concepts.",
          score: 0.7887,
        }),
        makeResult({
          title: "The Complete Guide to Model Context Protocol",
          url: "https://machinelearningmastery.com/the-complete-guide-to-model-context-protocol/",
          host: "machinelearningmastery.com",
          path: "/the-complete-guide-to-model-context-protocol/",
          snippet: "Guide to the protocol and tools ecosystem.",
          score: 0.654,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Model Context Protocol architecture patterns for multi-agent systems",
          url: "https://developer.ibm.com/articles/mcp-architecture-patterns-ai-systems/",
          host: "developer.ibm.com",
          path: "/articles/mcp-architecture-patterns-ai-systems/",
          snippet: "Architecture patterns with MCP client and server coordination.",
          score: 0.6725,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "MCP (Model Context Protocol): What It Is, Why It Matters, and How to Use It",
          url: "https://dev.to/example/mcp-model-context-protocol-what-it-is-why-it-matters-and-how-to-use-it",
          host: "dev.to",
          path: "/example/mcp-model-context-protocol-what-it-is-why-it-matters-and-how-to-use-it",
          snippet: "Explains MCP with client, server, and tools examples for agents.",
          score: 0.7226,
          originalRank: 4,
          rank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(reranked[0].host, "descope.com");
  assert.ok(reranked.findIndex((result) => result.host === "dev.to") < reranked.findIndex((result) => result.host === "machinelearningmastery.com"));
});

test("v2.0 guarded controller keeps unrelated docker results behind node-llama troubleshooting sources", () => {
  const query = "node-llama-cpp optional dependency missing";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Troubleshooting | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/troubleshooting",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/troubleshooting",
          snippet: "Troubleshooting install, native dependencies, and missing optional packages.",
          score: 0.88,
        }),
        makeResult({
          title: "node-llama-cpp silently fails to install on Apple Silicon",
          url: "https://github.com/openclaw/openclaw/issues/29548",
          host: "github.com",
          path: "/openclaw/openclaw/issues/29548",
          snippet: "node-llama-cpp install fails, optional dependency missing.",
          score: 0.73,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "dependencytrack/apiserver",
          url: "https://hub.docker.com/r/dependencytrack/apiserver",
          host: "hub.docker.com",
          path: "/r/dependencytrack/apiserver",
          snippet: "Docker image for API server.",
          score: 0.79,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "openclaw update fails with node-llama-cpp cmake error",
          url: "https://github.com/openclaw/openclaw/issues/32025",
          host: "github.com",
          path: "/openclaw/openclaw/issues/32025",
          snippet: "Optional dependency install failure and cmake issue.",
          score: 0.76,
          originalRank: 4,
          rank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(reranked[0].host, "node-llama-cpp.withcat.ai");
  assert.ok(reranked.findIndex((result) => result.host === "hub.docker.com") > reranked.findIndex((result) => result.url.includes('/issues/32025')));
  assert.ok(reranked.slice(0, 3).every((result) => result.host !== "hub.docker.com"));
});

test("v2.0 comparison controller recognizes compare-intent and protects comparison pages", () => {
  const query = "compare netbird headscale tailscale self hosted remote access";
  const intent = __test.detectQueryIntent(query, "general", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "NetBird vs Tailscale: Self-Hosted Mesh VPN",
          url: "https://selfhosting.sh/netbird-vs-tailscale-self-hosted-mesh-vpn",
          host: "selfhosting.sh",
          path: "/netbird-vs-tailscale-self-hosted-mesh-vpn",
          snippet: "NetBird versus Tailscale for self-hosted mesh VPN deployments.",
          score: 0.82,
        }),
        makeResult({
          title: "TailScale or NetBird : r/selfhosted",
          url: "https://www.reddit.com/r/selfhosted/comments/abc123/tailscale_or_netbird/",
          host: "reddit.com",
          path: "/r/selfhosted/comments/abc123/tailscale_or_netbird/",
          snippet: "Community discussion about Tailscale or NetBird.",
          score: 0.81,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Headscale vs. NetBird vs. Tailscale Comparison - SourceForge",
          url: "https://sourceforge.net/software/compare/Headscale-vs-NetBird-vs-Tailscale/",
          host: "sourceforge.net",
          path: "/software/compare/Headscale-vs-NetBird-vs-Tailscale/",
          snippet: "Compare Headscale, NetBird and Tailscale for self-hosted remote access.",
          score: 0.79,
          originalRank: 3,
          rank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    3,
    true,
  );

  assert.equal(planner.queryProfile.hasComparisonHint, true);
  assert.ok(reranked.some((result) => result.host === "selfhosting.sh"));
  assert.ok(reranked.some((result) => result.host === "sourceforge.net"));
  assert.ok(reranked.slice(0, 2).some((result) => result.host === "selfhosting.sh"));
});

test("v2.0 comparison controller keeps demoted docker hosts out of top3 for exact tool comparisons", () => {
  const query = "NetBird Headscale compare self hosted remote access";
  const intent = __test.detectQueryIntent(query, "general", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Netbird Koolshare 梅林 插件项目-asus华硕无线路由器及 ...",
          url: "https://www.right.com.cn/forum/thread-8427058-1-1.html",
          host: "right.com.cn",
          path: "/forum/thread-8427058-1-1.html",
          snippet: "Netbird discussion and plugin notes for remote access.",
          score: 0.8335,
        }),
        makeResult({
          title: "Share an alternative to TailScale and Zerotier remote control ...",
          url: "https://www.right.com.cn/forum/thread-8306894-1-1.html",
          host: "right.com.cn",
          path: "/forum/thread-8306894-1-1.html",
          snippet: "Alternative to TailScale and Zerotier remote control with NetBird.",
          score: 0.7239,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Tailscale remote networking connection speed is very slow ...",
          url: "https://www.right.com.cn/forum/thread-8372119-1-1.html",
          host: "right.com.cn",
          path: "/forum/thread-8372119-1-1.html",
          snippet: "Tailscale remote networking speed discussion.",
          score: 0.6088,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "ddosify/selfhosted_hammer",
          url: "https://hub.docker.com/r/ddosify/selfhosted_hammer",
          host: "hub.docker.com",
          path: "/r/ddosify/selfhosted_hammer",
          snippet: "Selfhosted hammer image.",
          score: 0.3545,
          originalRank: 4,
          rank: 4,
        }),
        makeResult({
          title: "ddosify/selfhosted_backend",
          url: "https://hub.docker.com/r/ddosify/selfhosted_backend",
          host: "hub.docker.com",
          path: "/r/ddosify/selfhosted_backend",
          snippet: "Selfhosted backend image.",
          score: 0.345,
          originalRank: 5,
          rank: 5,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.ok(reranked.slice(0, 3).every((result) => result.host !== "hub.docker.com"));
  assert.ok(reranked.every((result) => (result.signals ?? []).includes("v2.0-controller:precision-locked")));
});

test("v2.0 guarded github controller keeps top repo anchors ahead of non-github setup guides", () => {
  const query = "OpenClaw Browser Relay github";
  const intent = __test.detectQueryIntent(query, "github", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "OpenClaw Browser Relay — Chrome Extension - GitHub",
          url: "https://github.com/chengyixu/openclaw-browser-relay",
          host: "github.com",
          path: "/chengyixu/openclaw-browser-relay",
          snippet: "Chrome extension for OpenClaw Browser Relay.",
          score: 0.9728,
        }),
        makeResult({
          title: "OpenClaw Browser Relay Setup Guide [2026]: Configure ...",
          url: "https://www.cloudvyn.com/blog/openclaw-browser-relay-setup-guide",
          host: "cloudvyn.com",
          path: "/blog/openclaw-browser-relay-setup-guide",
          snippet: "Guide to set up and use OpenClaw Browser Relay.",
          score: 0.4577,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "GitHub - ben4claw/openclaw-tutorial: 从零开始玩转OpenClaw： …",
          url: "https://github.com/ben4claw/openclaw-tutorial",
          host: "github.com",
          path: "/ben4claw/openclaw-tutorial",
          snippet: "OpenClaw tutorial repository.",
          score: 0.7333,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "OpenClaw — Personal AI Assistant - GitHub",
          url: "https://github.com/openclaw/openclaw",
          host: "github.com",
          path: "/openclaw/openclaw",
          snippet: "Main OpenClaw repository.",
          score: 0.6981,
          originalRank: 4,
          rank: 4,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    4,
    true,
  );

  assert.equal(planner.branch, "solution-hunt");
  assert.deepEqual(reranked.slice(0, 3).map((result) => result.host), ["github.com", "github.com", "github.com"]);
  assert.ok(reranked.findIndex((result) => result.host === "cloudvyn.com") >= 3);
});

test("v2.0 risk-locked controller preserves stronger CLI news anchors", () => {
  const query = "OpenAI Codex CLI launch news";
  const intent = __test.detectQueryIntent(query, "general", "news");
  const planner = __test.buildPlannerOutput(query, intent, "news");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "OpenAI launches Codex CLI for developers in terminal coding workflow",
          url: "https://neowin.net/news/openai-launches-codex-cli-for-developers/",
          host: "neowin.net",
          path: "/news/openai-launches-codex-cli-for-developers/",
          snippet: "OpenAI launches Codex CLI developer tool for coding in the terminal.",
          score: 0.76,
          category: "news",
        }),
        makeResult({
          title: "OpenAI launches Codex desktop app for macOS to run coding agents",
          url: "https://venturebeat.com/ai/openai-launches-codex-desktop-app/",
          host: "venturebeat.com",
          path: "/ai/openai-launches-codex-desktop-app/",
          snippet: "OpenAI launches Codex desktop app for coding agents.",
          score: 0.88,
          category: "news",
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "OpenAI Codex CLI open source coding tool arrives for developers",
          url: "https://techrepublic.com/article/openai-codex-cli-open-source-coding-tool/",
          host: "techrepublic.com",
          path: "/article/openai-codex-cli-open-source-coding-tool/",
          snippet: "OpenAI Codex CLI coding tool for developers.",
          score: 0.74,
          category: "news",
          originalRank: 3,
          rank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    3,
    true,
  );

  assert.equal(planner.flags.verifySensitive, true);
  assert.equal(reranked[0].host, "neowin.net");
  assert.ok(reranked.slice(0, 2).some((result) => result.host === "techrepublic.com"));
  assert.ok(reranked.findIndex((result) => result.host === "venturebeat.com") > 0);
});

test("v2.0 risk-locked controller protects direct funding news over softer analysis", () => {
  const query = "OpenAI valuation funding amount latest";
  const intent = __test.detectQueryIntent(query, "general", "news");
  const planner = __test.buildPlannerOutput(query, intent, "news");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "OpenAI announces $110 billion funding round with investor details",
          url: "https://msn.com/en-us/money/companies/openai-announces-110-billion-funding-round/ar-AA1",
          host: "msn.com",
          path: "/en-us/money/companies/openai-announces-110-billion-funding-round/ar-AA1",
          snippet: "OpenAI funding round amount, valuation and investors.",
          score: 0.77,
          category: "news",
        }),
        makeResult({
          title: "What OpenAI's funding round says about the AI bubble",
          url: "https://fastcompany.com/openai-funding-round-ai-bubble",
          host: "fastcompany.com",
          path: "/openai-funding-round-ai-bubble",
          snippet: "Analysis of what OpenAI funding means for AI markets.",
          score: 0.87,
          category: "news",
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "OpenAI raises at $730B valuation in massive funding round",
          url: "https://eweek.com/news/openai-valuation-funding-round/",
          host: "eweek.com",
          path: "/news/openai-valuation-funding-round/",
          snippet: "OpenAI valuation, funding amount and investors.",
          score: 0.75,
          category: "news",
          originalRank: 3,
          rank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    3,
    true,
  );

  assert.equal(planner.flags.verifySensitive, true);
  assert.equal(reranked[0].host, "eweek.com");
  assert.notEqual(reranked[0].host, "fastcompany.com");
  assert.ok(reranked.some((result) => result.host === "msn.com"));
});

test("v2.0 model slate preserves top model-hub depth before third-family backfill", () => {
  const query = "Qwen GGUF modelscope huggingface";
  const intent = __test.detectQueryIntent(query, "models", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Qwen2.5-3B-Instruct-GGUF · Models - modelscope.cn",
          url: "https://www.modelscope.cn/models/qwen2.5-3b-instruct-gguf",
          host: "modelscope.cn",
          path: "/models/qwen2.5-3b-instruct-gguf",
          score: 0.89,
        }),
        makeResult({
          title: "Qwen/Qwen3-VL-8B-Instruct · Hugging Face",
          url: "https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct",
          host: "huggingface.co",
          path: "/Qwen/Qwen3-VL-8B-Instruct",
          score: 0.87,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Qwen/Qwen2.5-7B-Instruct-GGUF · Hugging Face",
          url: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct-GGUF",
          host: "huggingface.co",
          path: "/Qwen/Qwen2.5-7B-Instruct-GGUF",
          score: 0.865,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "Qwen2-7B-Instruct-GGUF · Models",
          url: "https://www.modelscope.cn/models/qwen2-7B-Instruct-GGUF",
          host: "modelscope.cn",
          path: "/models/qwen2-7B-Instruct-GGUF",
          score: 0.86,
          originalRank: 4,
          rank: 4,
        }),
        makeResult({
          title: "GitHub - huggingface/Qwen2.5-Coder",
          url: "https://github.com/huggingface/Qwen2.5-Coder",
          host: "github.com",
          path: "/huggingface/Qwen2.5-Coder",
          score: 0.74,
          originalRank: 5,
          rank: 5,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.deepEqual(reranked.slice(0, 2).map((result) => result.host), ["modelscope.cn", "huggingface.co"]);
  assert.ok(reranked.slice(0, 3).every((result) => ["modelscope.cn", "huggingface.co"].includes(result.host)));
  assert.ok((reranked[3].signals ?? []).includes("v1.5-slate:diverse-pass"));
});

test("v2.0 guarded docs slate preserves top3 canonical docs while restoring third host family in top5", () => {
  const query = "OpenAI Responses API conversation state docs";
  const intent = __test.detectQueryIntent(query, "official-docs", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Conversation state | OpenAI API",
          url: "https://developers.openai.com/api/docs/guides/conversation-state",
          host: "developers.openai.com",
          path: "/api/docs/guides/conversation-state",
          snippet: "Learn how to preserve conversation state with the Responses API.",
          score: 0.9856,
        }),
        makeResult({
          title: "Migrate to the Responses API | OpenAI API",
          url: "https://developers.openai.com/api/docs/guides/migrate-to-responses",
          host: "developers.openai.com",
          path: "/api/docs/guides/migrate-to-responses",
          snippet: "Migration guide for the Responses API.",
          score: 0.9216,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "Responses | OpenAI API Reference",
          url: "https://platform.openai.com/docs/api-reference/responses/object?lang=python",
          host: "platform.openai.com",
          path: "/docs/api-reference/responses/object?lang=python",
          snippet: "Reference for the Responses API object.",
          score: 0.8261,
          originalRank: 3,
          rank: 3,
        }),
        makeResult({
          title: "Responses Overview | OpenAI API Reference",
          url: "https://developers.openai.com/api/reference/responses/overview",
          host: "developers.openai.com",
          path: "/api/reference/responses/overview",
          snippet: "Overview of the Responses API.",
          score: 0.8007,
          originalRank: 4,
          rank: 4,
        }),
        makeResult({
          title: "Create a model response | OpenAI API Reference",
          url: "https://developers.openai.com/api/reference/resources/responses/methods/create",
          host: "developers.openai.com",
          path: "/api/reference/resources/responses/methods/create",
          snippet: "Create a model response.",
          score: 0.7967,
          originalRank: 5,
          rank: 5,
        }),
        makeResult({
          title: "OpenAI Responses API: a comprehensive guide",
          url: "https://medium.com/@odhitom09/openai-responses-api-a-comprehensive-guide-ad546132b2ed",
          host: "medium.com",
          path: "/@odhitom09/openai-responses-api-a-comprehensive-guide-ad546132b2ed",
          snippet: "Third-party guide to the OpenAI Responses API.",
          score: 0.745,
          originalRank: 6,
          rank: 6,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.equal(planner.branch, "precision-lookup");
  assert.deepEqual(
    reranked.slice(0, 3).map((result) => result.host),
    ["developers.openai.com", "developers.openai.com", "platform.openai.com"],
  );
  assert.equal(reranked.slice(0, 5).some((result) => result.host === "medium.com"), true);
  assert.ok((reranked.find((result) => result.host === "medium.com")?.signals ?? []).some((signal) => signal.startsWith("v1.5-slate:")));
});

test("runtime and manifest stay aligned on supported rerank versions", () => {
  const manifestEnum = manifest.configSchema?.properties?.defaultRerankVersion?.enum;
  const manifestDefault = manifest.configSchema?.properties?.defaultRerankVersion?.default;

  assert.deepEqual(manifestEnum, __test.SUPPORTED_RERANK_VERSIONS);
  assert.equal(__test.SUPPORTED_RERANK_VERSIONS.includes("v1.5"), true);
  assert.equal(__test.SUPPORTED_RERANK_VERSIONS.includes("v2.0"), true);
  assert.equal(manifestDefault, __test.DEFAULT_RERANK_VERSION);
  assert.equal(__test.DEFAULT_RERANK_VERSION, "v1.4");
  assert.equal(__test.isSupportedRerankVersion(__test.DEFAULT_RERANK_VERSION), true);
  assert.equal(__test.isRetrievalFirstRerankVersion("v1.4"), true);
  assert.equal(__test.isRetrievalFirstRerankVersion("v1.5"), true);
  assert.equal(__test.isRetrievalFirstRerankVersion("v2.0"), true);
  assert.equal(__test.isPlannerCandidateRerankVersion("v1.4"), false);
  assert.equal(__test.isPlannerCandidateRerankVersion("v1.5"), true);
  assert.equal(__test.isPlannerCandidateRerankVersion("v2.0"), true);
  assert.equal(__test.isSupportedRerankVersion("v9.9"), false);
});

test("broad discovery preserves host diversity before same-host backfill", () => {
  const planner = makeBroadPlanner();
  const diversified = __test.selectCandidateSet(
    [
      makeResult({
        title: "OpenClaw local research guide",
        host: "docs.openclaw.ai",
        url: "https://docs.openclaw.ai/guides/local-research",
        path: "/guides/local-research",
        score: 0.93,
      }),
      makeResult({
        title: "OpenClaw search plugin reference",
        host: "docs.openclaw.ai",
        url: "https://docs.openclaw.ai/reference/search-plugin",
        path: "/reference/search-plugin",
        score: 0.92,
      }),
      makeResult({
        title: "SearXNG overview",
        host: "docs.searxng.org",
        url: "https://docs.searxng.org/",
        path: "/",
        score: 0.89,
      }),
      makeResult({
        title: "NetBird docs",
        host: "docs.netbird.io",
        url: "https://docs.netbird.io/about",
        path: "/about",
        score: 0.88,
      }),
      makeResult({
        title: "Immich documentation",
        host: "immich.app",
        url: "https://immich.app/docs/overview/introduction",
        path: "/docs/overview/introduction",
        score: 0.87,
      }),
    ],
    planner,
    4,
    true,
  );

  assert.deepEqual(
    diversified.map((result) => result.host),
    ["docs.openclaw.ai", "docs.searxng.org", "docs.netbird.io", "immich.app"],
  );
});

test("same-host near duplicates are suppressed in broad discovery candidate selection", () => {
  const planner = makeBroadPlanner();
  const diversified = __test.selectCandidateSet(
    [
      makeResult({
        title: "OpenAI Responses API guide",
        host: "platform.openai.com",
        url: "https://platform.openai.com/docs/guides/responses-api",
        path: "/docs/guides/responses-api",
        score: 0.94,
      }),
      makeResult({
        title: "OpenAI Responses API Guide",
        host: "platform.openai.com",
        url: "https://platform.openai.com/docs/guides/responses-api?ref=nav",
        path: "/docs/guides/responses-api?ref=nav",
        score: 0.93,
      }),
      makeResult({
        title: "Anthropic API docs",
        host: "docs.anthropic.com",
        url: "https://docs.anthropic.com/en/api/overview",
        path: "/en/api/overview",
        score: 0.88,
      }),
      makeResult({
        title: "Google GenAI docs",
        host: "ai.google.dev",
        url: "https://ai.google.dev/gemini-api/docs",
        path: "/gemini-api/docs",
        score: 0.87,
      }),
    ],
    planner,
    4,
    true,
  );

  assert.equal(
    diversified.filter((result) => result.host === "platform.openai.com").length,
    1,
  );
  assert.deepEqual(
    diversified.map((result) => result.host),
    ["platform.openai.com", "docs.anthropic.com", "ai.google.dev"],
  );
});

test("near duplicate detector catches same-host title/path variants", () => {
  assert.equal(
    __test.areNearDuplicateResults(
      makeResult({
        title: "OpenAI Responses API Guide",
        host: "platform.openai.com",
        url: "https://platform.openai.com/docs/guides/responses-api",
        path: "/docs/guides/responses-api",
      }),
      makeResult({
        title: "OpenAI Responses API guide",
        host: "platform.openai.com",
        url: "https://platform.openai.com/docs/guides/responses-api?ref=nav",
        path: "/docs/guides/responses-api?ref=nav",
      }),
    ),
    true,
  );
});

test("v2.0 exact docs controller keeps entity-aligned docs ahead of adjacent framework docs", () => {
  const query = "python virtual environment docs official";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const annotated = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "venv — Creation of virtual environments — Python 3.14 docs",
        url: "https://docs.python.org/3/library/venv.html",
        host: "docs.python.org",
        path: "/3/library/venv.html",
        snippet: "Official Python venv documentation.",
        score: 0.82,
      }),
      makeResult({
        title: "Virtual Environments - FastAPI",
        url: "https://fastapi.tiangolo.com/virtual-environments/",
        host: "fastapi.tiangolo.com",
        path: "/virtual-environments/",
        snippet: "FastAPI development environment setup.",
        originalRank: 2,
        score: 0.86,
      }),
      makeResult({
        title: "venv — Creation of virtual environments — Python documentation",
        url: "https://getdocs.org/Python/docs/3.12/library/venv",
        host: "getdocs.org",
        path: "/Python/docs/3.12/library/venv",
        snippet: "Mirror of Python venv docs.",
        originalRank: 3,
        score: 0.78,
      }),
      makeResult({
        title: "Python environments in VS Code",
        url: "https://code.visualstudio.com/docs/python/environments",
        host: "code.visualstudio.com",
        path: "/docs/python/environments",
        snippet: "Managing Python environments in VS Code.",
        originalRank: 4,
        score: 0.8,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  const reranked = __test.rerankResultsV20(annotated, intent, planner, 4, true);

  assert.equal(reranked[0].host, "docs.python.org");
  assert.ok(reranked.findIndex((result) => result.host === "getdocs.org") < reranked.findIndex((result) => result.host === "fastapi.tiangolo.com"));
  assert.ok(reranked.findIndex((result) => result.host === "fastapi.tiangolo.com") > 1);
});

test("v2.0 artifact-aware controller prefers official release artifacts over third-party rebuild docs", () => {
  const query = "Node.js v22 release notes";
  const intent = __test.detectQueryIntent(query, "official-docs", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const annotated = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "Release Notes for Node.js 22 | Red Hat build of Node.js",
        url: "https://docs.redhat.com/nodejs22/release-notes",
        host: "docs.redhat.com",
        path: "/nodejs22/release-notes",
        snippet: "Red Hat build release notes for Node.js 22.",
        score: 0.92,
      }),
      makeResult({
        title: "Node.js 22 is now available!",
        url: "https://nodejs.org/en/blog/announcements/v22-release-announce",
        host: "nodejs.org",
        path: "/en/blog/announcements/v22-release-announce",
        snippet: "Official Node.js release announcement for v22.",
        originalRank: 2,
        score: 0.76,
      }),
      makeResult({
        title: "node/doc/changelogs/CHANGELOG_V22.md at main · nodejs/node",
        url: "https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V22.md",
        host: "github.com",
        path: "/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V22.md",
        snippet: "Official Node.js changelog source for v22.",
        originalRank: 3,
        score: 0.74,
      }),
      makeResult({
        title: "Node.js v22 (Custom) Release Notes | HeroDevs Docs",
        url: "https://docs.herodevs.com/nodejs/v22-release-notes",
        host: "docs.herodevs.com",
        path: "/nodejs/v22-release-notes",
        snippet: "HeroDevs custom Node.js 22 release notes.",
        originalRank: 4,
        score: 0.9,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  const reranked = __test.rerankResultsV20(annotated, intent, planner, 4, true);

  assert.ok(reranked.findIndex((result) => result.host === "nodejs.org") < reranked.findIndex((result) => result.host === "docs.redhat.com"));
  assert.ok(reranked.findIndex((result) => result.host === "nodejs.org") < reranked.findIndex((result) => result.host === "docs.herodevs.com"));
  assert.ok(reranked.slice(0, 2).some((result) => result.host === "nodejs.org"));
});

test("v2.0 exact artifact docs slate keeps canonical OpenClaw release surfaces in top three", () => {
  const query = "OpenClaw changelog latest version notes";
  const intent = __test.detectQueryIntent(query, "official-docs", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const annotated = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "OpenClaw - OpenClaw",
        url: "https://docs.openclaw.ai/zh-CN",
        host: "docs.openclaw.ai",
        path: "/zh-cn",
        snippet: "Official OpenClaw docs home.",
        score: 0.97,
      }),
      makeResult({
        title: "GitHub - ben4claw/openclaw-tutorial: 从零开始玩转OpenClaw： …",
        url: "https://github.com/ben4claw/openclaw-tutorial",
        host: "github.com",
        path: "/ben4claw/openclaw-tutorial",
        snippet: "OpenClaw tutorial repo with setup and usage notes.",
        originalRank: 2,
        rank: 2,
        score: 0.84,
      }),
      makeResult({
        title: "OpenClaw — Personal AI Assistant - GitHub",
        url: "https://github.com/openclaw/openclaw",
        host: "github.com",
        path: "/openclaw/openclaw",
        snippet: "Official OpenClaw repository.",
        originalRank: 3,
        rank: 3,
        score: 0.82,
      }),
      makeResult({
        title: "OpenClaw — Personal AI Assistant",
        url: "https://openclaw.ai/",
        host: "openclaw.ai",
        path: "/",
        snippet: "OpenClaw landing page.",
        originalRank: 4,
        rank: 4,
        score: 0.8,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  const reranked = __test.rerankResultsV20(annotated, intent, planner, 4, true);

  assert.equal(planner.branch, "precision-lookup");
  assert.equal(reranked[0].host, "docs.openclaw.ai");
  assert.deepEqual(reranked.slice(0, 3).map((result) => result.host), ["docs.openclaw.ai", "github.com", "github.com"]);
  assert.equal(reranked[2].path, "/openclaw/openclaw");
  assert.ok(reranked.findIndex((result) => result.host === "openclaw.ai") > 2);
});

test("agent-aware contract lifts official OpenClaw release surfaces on ambiguous latest-notes queries", () => {
  const query = "OpenClaw latest notes";
  const baselineIntent = __test.detectQueryIntent(query, "auto", "general");
  const baselinePlanner = __test.buildPlannerOutput(query, baselineIntent, "general");
  const contractIntent = __test.detectQueryIntent(
    query,
    "auto",
    "general",
    { taskMode: "extract", targetKind: "release-artifact", sourceTrust: "official-first" },
  );
  const contractPlanner = __test.buildPlannerOutput(query, contractIntent, "general");
  const candidates = [
    makeResult({
      title: "OpenClaw - OpenClaw",
      url: "https://docs.openclaw.ai/zh-CN",
      host: "docs.openclaw.ai",
      path: "/zh-cn",
      snippet: "Official OpenClaw docs home.",
      score: 0.94,
    }),
    makeResult({
      title: "GitHub - ben4claw/openclaw-tutorial: 从零开始玩转OpenClaw： …",
      url: "https://github.com/ben4claw/openclaw-tutorial",
      host: "github.com",
      path: "/ben4claw/openclaw-tutorial",
      snippet: "OpenClaw tutorial repo with setup and usage notes.",
      originalRank: 2,
      rank: 2,
      score: 0.83,
    }),
      makeResult({
        title: "OpenClaw — Personal AI Assistant - GitHub",
        url: "https://github.com/openclaw/openclaw",
        host: "github.com",
        path: "/openclaw/openclaw",
        snippet: "Official OpenClaw repository.",
        originalRank: 3,
        rank: 3,
        score: 0.71,
      }),
      makeResult({
        title: "快速开始 | OpenClaw 中国社区",
        url: "https://open-claw.org.cn/guide/getting-started",
        host: "open-claw.org.cn",
        path: "/guide/getting-started",
        snippet: "Community getting-started guide for OpenClaw.",
        originalRank: 4,
        rank: 4,
        score: 0.86,
      }),
  ];

  const contractReranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(candidates, contractIntent, contractPlanner, { applyBranchAdjustment: true, debug: true }),
    contractIntent,
    contractPlanner,
    4,
    true,
  );

  assert.notEqual(baselineIntent.mode, "official-docs");
  assert.equal(contractIntent.mode, "official-docs");
  assert.equal(contractReranked[2].host, "github.com");
  assert.equal(contractReranked[2].path, "/openclaw/openclaw");
});

test("agent-aware contract rescues official what's-new docs on ambiguous what's-new queries", () => {
  const query = "Python 3.12 what's new";
  const baselineIntent = __test.detectQueryIntent(query, "auto", "general");
  const baselinePlanner = __test.buildPlannerOutput(query, baselineIntent, "general");
  const contractIntent = __test.detectQueryIntent(
    query,
    "auto",
    "general",
    { taskMode: "extract", targetKind: "whats-new", sourceTrust: "official-first" },
  );
  const contractPlanner = __test.buildPlannerOutput(query, contractIntent, "general");
  const candidates = [
      makeResult({
        title: "What is the 'new' keyword in JavaScript? - Stack Overflow",
        url: "https://stackoverflow.com/questions/1646698/what-is-the-new-keyword-in-javascript",
        host: "stackoverflow.com",
        path: "/questions/1646698/what-is-the-new-keyword-in-javascript",
        snippet: "The new keyword in JavaScript can be confusing.",
        score: 0.88,
      }),
      makeResult({
        title: "new operator - What is new without type in C#? - Stack Overflow",
        url: "https://stackoverflow.com/questions/177846/what-is-new-without-type-in-c-sharp",
        host: "stackoverflow.com",
        path: "/questions/177846/what-is-new-without-type-in-c-sharp",
        snippet: "Another generic new-keyword result.",
        originalRank: 2,
        rank: 2,
        score: 0.84,
      }),
      makeResult({
        title: "What's New In Python 3.12 — Python 3.12.12 documentation",
        url: "https://docs.python.org/3.12/whatsnew/3.12.html",
        host: "docs.python.org",
        path: "/3.12/whatsnew/3.12.html",
        snippet: "Official Python 3.12 what's new documentation.",
        originalRank: 3,
        rank: 3,
        score: 0.62,
      }),
      makeResult({
        title: "Python 3.12 Release Notes",
        url: "https://www.python.org/downloads/release/python-3120/",
        host: "python.org",
        path: "/downloads/release/python-3120/",
        snippet: "Official Python 3.12 release page.",
        originalRank: 4,
        rank: 4,
        score: 0.6,
      }),
  ];

  const contractReranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(candidates, contractIntent, contractPlanner, { applyBranchAdjustment: true, debug: true }),
    contractIntent,
    contractPlanner,
    3,
    true,
  );

  assert.notEqual(baselineIntent.mode, "official-docs");
  assert.equal(contractIntent.mode, "official-docs");
  assert.equal(contractReranked[0].host, "docs.python.org");
  assert.ok(contractReranked.slice(0, 2).some((result) => result.host === "python.org"));
});

test("v2.0 artifact guard keeps versioned docs snapshots behind actual release-note artifacts", () => {
  const query = "Node.js 22 changelog release notes";
  const intent = __test.detectQueryIntent(query, "official-docs", "general");
  const planner = __test.buildPlannerOutput(query, intent, "general");
  const annotated = __test.annotateResultDiagnostics(
    [
      makeResult({
        title: "About this documentation | Node.js v22.12.0 Documentation",
        url: "https://nodejs.org/download/release/v22.12.0/docs/api/documentation.html",
        host: "nodejs.org",
        path: "/download/release/v22.12.0/docs/api/documentation.html",
        snippet: "Welcome to the official API reference documentation for Node.js.",
        score: 0.9,
      }),
      makeResult({
        title: "node/doc/changelogs/CHANGELOG_V22.md at main · nodejs/node",
        url: "https://github.com/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V22.md",
        host: "github.com",
        path: "/nodejs/node/blob/main/doc/changelogs/CHANGELOG_V22.md",
        snippet: "Official Node.js changelog source for v22.",
        originalRank: 2,
        rank: 2,
        score: 0.78,
      }),
      makeResult({
        title: "Node.js 22 is now available!",
        url: "https://nodejs.org/en/blog/announcements/v22-release-announce",
        host: "nodejs.org",
        path: "/en/blog/announcements/v22-release-announce",
        snippet: "Official Node.js release announcement for v22.",
        originalRank: 3,
        rank: 3,
        score: 0.76,
      }),
    ],
    intent,
    planner,
    { applyBranchAdjustment: true, debug: true },
  );

  const reranked = __test.rerankResultsV20(annotated, intent, planner, 3, true);

  assert.notEqual(reranked[0].path, "/download/release/v22.12.0/docs/api/documentation.html");
  assert.ok(reranked.slice(0, 2).some((result) => result.path.includes("CHANGELOG_V22.md")));
});

test("v2.0 guarded precision lock keeps canonical troubleshooting docs ahead of issue spillover", () => {
  const query = "node-llama-cpp package missing install fix";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Troubleshooting | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/troubleshooting",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/troubleshooting",
          snippet: "Troubleshooting install, native dependencies, and missing optional packages.",
          score: 0.82,
        }),
        makeResult({
          title: "Regression: node-llama-cpp missing after upgrade to 2026.3.12",
          url: "https://github.com/openclaw/openclaw/issues/29548",
          host: "github.com",
          path: "/openclaw/openclaw/issues/29548",
          snippet: "node-llama-cpp install fails, optional dependency missing.",
          score: 0.8,
          originalRank: 2,
          rank: 2,
        }),
        makeResult({
          title: "node-llama-cpp - npm",
          url: "https://www.npmjs.com/package/node-llama-cpp",
          host: "npmjs.com",
          path: "/package/node-llama-cpp",
          snippet: "npm package for node-llama-cpp.",
          score: 0.79,
          originalRank: 3,
          rank: 3,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    3,
    true,
  );

  assert.equal(reranked[0].host, "node-llama-cpp.withcat.ai");
  assert.ok(reranked.findIndex((result) => result.host === "github.com") > 0);
  assert.ok(reranked.findIndex((result) => result.host === "npmjs.com") > 0);
});

test("v2.0 troubleshooting precision lock protects canonical docs against issue-heavy candidate pools", () => {
  const query = "node-llama-cpp package missing install fix";
  const intent = __test.detectQueryIntent(query, "official-docs", "it");
  const planner = __test.buildPlannerOutput(query, intent, "it");
  const reranked = __test.rerankResultsV20(
    __test.annotateResultDiagnostics(
      [
        makeResult({
          title: "Troubleshooting | node-llama-cpp",
          url: "https://node-llama-cpp.withcat.ai/guide/troubleshooting",
          host: "node-llama-cpp.withcat.ai",
          path: "/guide/troubleshooting",
          snippet: "Troubleshooting install, native dependencies, and missing optional packages.",
          score: 0.8489,
        }),
        makeResult({
          title: "Regression: node-llama-cpp missing after upgrade to 2026.3.12",
          url: "https://github.com/openclaw/openclaw/issues/46569",
          host: "github.com",
          path: "/openclaw/openclaw/issues/46569",
          snippet: "node-llama-cpp install fails, optional dependency missing.",
          originalRank: 2,
          rank: 2,
          score: 0.8044,
        }),
        makeResult({
          title: "node-llama-cpp silently fails to install on Apple Silicon",
          url: "https://github.com/openclaw/openclaw/issues/29548",
          host: "github.com",
          path: "/openclaw/openclaw/issues/29548",
          snippet: "node-llama-cpp install fails, optional dependency missing.",
          originalRank: 3,
          rank: 3,
          score: 0.778,
        }),
        makeResult({
          title: "Installation & Setup | withcatai/node-llama-cpp | DeepWiki",
          url: "https://deepwiki.com/withcatai/node-llama-cpp/1.1-installation-and-setup",
          host: "deepwiki.com",
          path: "/withcatai/node-llama-cpp/1.1-installation-and-setup",
          snippet: "Setup and installation instructions for node-llama-cpp.",
          originalRank: 4,
          rank: 4,
          score: 0.6655,
        }),
        makeResult({
          title: "node-llama-cpp - npm",
          url: "https://www.npmjs.com/package/node-llama-cpp",
          host: "npmjs.com",
          path: "/package/node-llama-cpp",
          snippet: "npm package for node-llama-cpp.",
          originalRank: 5,
          rank: 5,
          score: 0.6228,
        }),
      ],
      intent,
      planner,
      { applyBranchAdjustment: true, debug: true },
    ),
    intent,
    planner,
    5,
    true,
  );

  assert.equal(reranked[0].host, "node-llama-cpp.withcat.ai");
  assert.ok(reranked.findIndex((result) => result.host === "github.com") > 0);
  assert.ok(reranked.findIndex((result) => result.host === "deepwiki.com") > 0);
  assert.ok((reranked[0].sourceFitScore ?? 0) > (reranked[1].sourceFitScore ?? 0));
});
