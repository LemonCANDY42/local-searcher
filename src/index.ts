import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { DEFAULT_RERANK_VERSION, isSupportedRerankVersion, SUPPORTED_RERANK_VERSIONS, type RerankVersion } from "./rerank-versions.ts";

type SearchMode = "auto" | "general" | "official-docs" | "github" | "models" | "packages";
type SearchCategory = "general" | "news" | "it" | "images" | "videos";
type AgentTaskMode = "lookup" | "extract" | "compare";
type AgentTargetKind = "general" | "official-doc" | "release-artifact" | "whats-new" | "model-choice" | "product-eval";
type AgentSourceTrust = "balanced" | "official-first";
type AgentSearchContract = {
  taskMode?: AgentTaskMode;
  targetKind?: AgentTargetKind;
  sourceTrust?: AgentSourceTrust;
};
type AdaptiveBucket =
  | "guarded-official-docs"
  | "guarded-github"
  | "guarded-models"
  | "guarded-packages"
  | "troubleshooting"
  | "local-discovery"
  | "media-creator"
  | "news-current"
  | "work-company-tooling"
  | "finance-amount"
  | "science-knowledge"
  | "culture-entertainment"
  | "broad-technical"
  | "ambiguous-short"
  | "broad-general";

type AdaptiveHybridProfile = {
  bucket: AdaptiveBucket;
  semanticWeight: number;
  heuristicWeight: number;
  priorStrength: number;
  rationale: string[];
};

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
  engine?: string;
  category?: string;
  publishedDate?: string;
  host: string;
  path: string;
  originalRank: number;
  originalCategory?: string;
  categories: string[];
  rank?: number;
  score?: number;
  signals?: string[];
  embeddingSimilarity?: number;
  semanticScore?: number;
  heuristicPrior?: number;
  resultType?: ResultType;
  solutionLikelihood?: number;
  entityMatchStrength?: number;
  extractionLikelihood?: number;
  diversityValue?: number;
  sourceFitScore?: number;
  pageSpecificity?: number;
  pageRole?: PageRole;
  plannerAdjustment?: number;
  guardedAdjustment?: number;
  hybridAdjustment?: number;
  why?: string[];
};

type SearchIntent = {
  mode: Exclude<SearchMode, "auto">;
  tokens: string[];
  normalizedQuery: string;
  docsLike: boolean;
  githubLike: boolean;
  modelLike: boolean;
  packageLike: boolean;
  dockerLike: boolean;
  officialLike: boolean;
  sourceMentions: string[];
  agentContract: AgentSearchContract | null;
};

type RetrievalVariant = {
  query: string;
  categories: SearchCategory[];
  rationale: string[];
};

type RetrievalPlan = {
  strategy: "baseline" | "retrieval-first-v1.4" | "retrieval-first-v1.5" | "retrieval-first-v2.0";
  categoriesQueried: SearchCategory[];
  variants: RetrievalVariant[];
};

type RetrievalBranch = "broad-discovery" | "precision-lookup" | "solution-hunt" | "extract-heavy";
type PrecisionDial = "broad" | "balanced" | "precise";
type ResultType =
  | "official-docs"
  | "repo"
  | "package"
  | "issue-thread"
  | "tutorial"
  | "news"
  | "blog"
  | "directory"
  | "landing"
  | "unknown";

type PageRole =
  | "canonical-doc"
  | "official-artifact"
  | "repository"
  | "registry"
  | "discussion"
  | "deep-content"
  | "meta-listing"
  | "landing"
  | "unknown";

type PlannerOutput = {
  branch: RetrievalBranch;
  precisionDial: PrecisionDial;
  rationale: string[];
  expectedNextStep: "answer" | "fetch" | "extract" | "browser-fallback";
  flags: {
    verifySensitive: boolean;
    extractionImportant: boolean;
    exactEntityLikely: boolean;
    solutionIntentLikely: boolean;
  };
  queryProfile: {
    tokenCount: number;
    hasQuotedEntity: boolean;
    hasErrorLikePattern: boolean;
    hasOfficialHint: boolean;
    hasComparisonHint: boolean;
    hasHowToHint: boolean;
    hasSimilarityHint: boolean;
    hasExtractionHint: boolean;
    agentContractApplied: boolean;
  };
};

type ResultDiagnostics = {
  resultType: ResultType;
  solutionLikelihood: number;
  entityMatchStrength: number;
  extractionLikelihood: number;
  diversityValue: number;
  sourceFitScore: number;
  pageSpecificity: number;
  pageRole: PageRole;
  branchAdjustment: number;
  why: string[];
};

type DecontaminationSummary = {
  inputCandidates: number;
  removedCount: number;
  outputCandidates: number;
  reasonCounts: Record<string, number>;
  removedSamples?: Array<{ host: string; title: string; reason: string }>;
};

const DEFAULTS = {
  searxngBaseUrl: "http://127.0.0.1:18080",
  ntfyBaseUrl: "http://127.0.0.1:18082",
  defaultLanguage: "en-US",
  defaultLimit: 8,
  defaultSafeSearch: 1,
  maxTextChars: 12000,
  maxLinks: 24,
  fetchTimeoutMs: 20000,
  browserTimeoutMs: 45000,
  rerankEnabled: true,
  defaultMode: "auto" as SearchMode,
  defaultRerankVersion: DEFAULT_RERANK_VERSION,
};

const MAX_QUERY_CATEGORIES = 2;
const RETRIEVAL_FIRST_RERANK_VERSIONS = new Set<RerankVersion>(["v1.4", "v1.5", "v2.0"]);
const PLANNER_CANDIDATE_RERANK_VERSIONS = new Set<RerankVersion>(["v1.5", "v2.0"]);
const DOC_HOST_HINTS = [
  "platform.openai.com",
  "docs.openai.com",
  "readthedocs.io",
  "developer.mozilla.org",
  "docs.python.org",
  "docs.github.com",
  "huggingface.co",
  "hf-mirror.com",
  "modelscope.cn",
  "modelscope.com",
];
const DOC_PATH_HINTS = ["/docs", "/doc", "/guide", "/guides", "/api", "/reference", "/manual", "/readme"];
const MODEL_HOST_HINTS = ["huggingface.co", "hf-mirror.com", "modelscope.cn", "modelscope.com"];
const PACKAGE_HOST_HINTS = ["pypi.org", "npmjs.com", "github.com"];
const DEMOTED_HOSTS = ["hub.docker.com", "docker.com", "dockerhub.com"];
const SEO_HOST_HINTS = ["stackoverflow.ai", "libhunt.com", "sourceforge.net"];
const LOW_SIGNAL_QUERY_TOKENS = new Set([
  "a",
  "an",
  "and",
  "api",
  "best",
  "current",
  "demo",
  "docs",
  "documentation",
  "for",
  "guide",
  "how",
  "is",
  "latest",
  "manual",
  "me",
  "near",
  "news",
  "official",
  "on",
  "or",
  "reference",
  "the",
  "this",
  "today",
  "tutorial",
  "update",
  "what",
  "where",
  "why",
  "with",
  "推荐",
  "官方",
  "攻略",
  "教程",
  "最新",
  "视频",
]);
const AGENT_TASK_MODES = ["lookup", "extract", "compare"] as const;
const AGENT_TARGET_KINDS = ["general", "official-doc", "release-artifact", "whats-new", "model-choice", "product-eval"] as const;
const AGENT_SOURCE_TRUST_LEVELS = ["balanced", "official-first"] as const;
const ARTIFACT_QUERY_TOKENS = new Set([
  "release",
  "released",
  "releases",
  "notes",
  "changelog",
  "announcement",
  "announcements",
  "announce",
  "blog",
  "blogs",
  "template",
  "playbook",
  "rubric",
  "checklist",
  "postmortem",
  "summary",
  "summarize",
  "extract",
  "extraction",
  "parse",
  "whats",
  "what's",
  "new",
]);
const BRAND_OFFICIAL_HOSTS: Array<{ token: string; preferredHosts: string[]; strict?: boolean }> = [
  {
    token: "openclaw",
    preferredHosts: ["docs.openclaw.ai", "openclaw.ai", "github.com"],
    strict: true,
  },
  {
    token: "openai",
    preferredHosts: ["platform.openai.com", "developers.openai.com", "openai.com", "github.com"],
    strict: true,
  },
  {
    token: "huggingface",
    preferredHosts: ["huggingface.co", "hf-mirror.com", "github.com"],
  },
  {
    token: "modelscope",
    preferredHosts: ["modelscope.cn", "modelscope.com", "github.com"],
  },
];

function isAgentTaskMode(value: unknown): value is AgentTaskMode {
  return typeof value === "string" && AGENT_TASK_MODES.includes(value as AgentTaskMode);
}

function isAgentTargetKind(value: unknown): value is AgentTargetKind {
  return typeof value === "string" && AGENT_TARGET_KINDS.includes(value as AgentTargetKind);
}

function isAgentSourceTrust(value: unknown): value is AgentSourceTrust {
  return typeof value === "string" && AGENT_SOURCE_TRUST_LEVELS.includes(value as AgentSourceTrust);
}

function normalizeAgentSearchContract(value: unknown): AgentSearchContract | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const taskMode = isAgentTaskMode(raw.taskMode) ? raw.taskMode : undefined;
  const targetKind = isAgentTargetKind(raw.targetKind) ? raw.targetKind : undefined;
  const sourceTrust = isAgentSourceTrust(raw.sourceTrust) ? raw.sourceTrust : undefined;

  if (!taskMode && !targetKind && !sourceTrust) {
    return null;
  }

  return {
    taskMode,
    targetKind,
    sourceTrust: sourceTrust ?? "balanced",
  };
}

function agentContractHasTargetKind(intent: SearchIntent, ...kinds: AgentTargetKind[]) {
  return Boolean(intent.agentContract?.targetKind && kinds.includes(intent.agentContract.targetKind));
}

function agentContractPrefersOfficialSources(intent: SearchIntent) {
  return intent.agentContract?.sourceTrust === "official-first";
}
const V12_EMBEDDING_WEIGHT = 0.75;
const V12_HEURISTIC_PRIOR_WEIGHT = 0.25;
const V13_PROFILE_PRESETS: Record<AdaptiveBucket, Omit<AdaptiveHybridProfile, "bucket">> = {
  "guarded-official-docs": {
    semanticWeight: 0.28,
    heuristicWeight: 0.72,
    priorStrength: 0.96,
    rationale: ["guarded-source-intent", "official-docs"],
  },
  "guarded-github": {
    semanticWeight: 0.32,
    heuristicWeight: 0.68,
    priorStrength: 0.92,
    rationale: ["guarded-source-intent", "github"],
  },
  "guarded-models": {
    semanticWeight: 0.4,
    heuristicWeight: 0.6,
    priorStrength: 0.84,
    rationale: ["guarded-source-intent", "models"],
  },
  "guarded-packages": {
    semanticWeight: 0.36,
    heuristicWeight: 0.64,
    priorStrength: 0.88,
    rationale: ["guarded-source-intent", "packages"],
  },
  troubleshooting: {
    semanticWeight: 0.48,
    heuristicWeight: 0.52,
    priorStrength: 0.66,
    rationale: ["problem-solving", "keep-technical-priors-light"],
  },
  "local-discovery": {
    semanticWeight: 0.8,
    heuristicWeight: 0.2,
    priorStrength: 0.24,
    rationale: ["broad-discovery", "location-and-lifestyle-query"],
  },
  "media-creator": {
    semanticWeight: 0.82,
    heuristicWeight: 0.18,
    priorStrength: 0.18,
    rationale: ["media-or-creator-query", "semantic-led"],
  },
  "news-current": {
    semanticWeight: 0.68,
    heuristicWeight: 0.32,
    priorStrength: 0.36,
    rationale: ["freshness-and-breadth", "current-events"],
  },
  "work-company-tooling": {
    semanticWeight: 0.6,
    heuristicWeight: 0.4,
    priorStrength: 0.46,
    rationale: ["workflow-or-company-query", "mixed-source-intent"],
  },
  "finance-amount": {
    semanticWeight: 0.58,
    heuristicWeight: 0.42,
    priorStrength: 0.44,
    rationale: ["amount-or-market-query", "mixed-authority"],
  },
  "science-knowledge": {
    semanticWeight: 0.68,
    heuristicWeight: 0.32,
    priorStrength: 0.34,
    rationale: ["general-knowledge", "relevance-first"],
  },
  "culture-entertainment": {
    semanticWeight: 0.76,
    heuristicWeight: 0.24,
    priorStrength: 0.24,
    rationale: ["culture-entertainment-or-rumor", "semantic-led"],
  },
  "broad-technical": {
    semanticWeight: 0.58,
    heuristicWeight: 0.42,
    priorStrength: 0.56,
    rationale: ["technical-but-not-source-locked"],
  },
  "ambiguous-short": {
    semanticWeight: 0.58,
    heuristicWeight: 0.42,
    priorStrength: 0.34,
    rationale: ["short-or-ambiguous-query", "hedged-balance"],
  },
  "broad-general": {
    semanticWeight: 0.72,
    heuristicWeight: 0.28,
    priorStrength: 0.22,
    rationale: ["general-broad-query", "semantic-led"],
  },
};
const DEFAULT_LOCAL_EMBEDDING_MODEL_REF = "hf:ggml-org/embeddinggemma-300m-qat-q8_0-GGUF/embeddinggemma-300m-qat-Q8_0.gguf";
const DEFAULT_LOCAL_EMBEDDING_MODEL_PATH = path.join(os.homedir(), ".cache", "openclaw-memory-models", "embeddinggemma-300m-qat-Q8_0.gguf");
const FALLBACK_SEMANTIC_VECTOR_SIZE = 384;

let localEmbeddingProviderPromise: Promise<{
  provider: { id: string; model: string; embedQuery: (text: string) => Promise<number[]>; embedBatch: (texts: string[]) => Promise<number[][]> };
  modulePath: string;
} | null> | null = null;

function jsonResult(payload: Record<string, unknown>) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function nowIsoCompact() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "query";
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function stripHtml(html: string) {
  return decodeHtmlEntities(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function excerpt(text: string, maxChars = 320) {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

function normalizeBaseUrl(input: string) {
  const url = new URL(input);
  if (url.pathname.endsWith("/search")) {
    url.pathname = url.pathname.replace(/\/search$/, "") || "/";
  }
  return url.toString();
}

function ensureWithinLimit<T>(items: T[], limit: number) {
  return Array.isArray(items) ? items.slice(0, limit) : [];
}

function uniqueStrings(items: string[]) {
  return [...new Set(items.filter(Boolean))];
}

function canonicalizeUrl(input: string) {
  try {
    const url = new URL(input);
    url.hash = "";
    if (url.pathname !== "/" && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.replace(/\/+$/, "");
    }
    return url.toString();
  } catch {
    return input.trim();
  }
}

function safeHostname(input: string) {
  try {
    return new URL(input).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

function safePath(input: string) {
  try {
    const url = new URL(input);
    return `${url.pathname}${url.search}`.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeText(input: string) {
  return input.normalize("NFKC").toLowerCase();
}

function normalizeComparableText(input: string) {
  return normalizeText(input)
    .replace(/[._/:+-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(input: string) {
  const text = normalizeText(input);
  const matches = text.match(/[\p{L}\p{N}_./:+-]{2,}/gu) ?? [];
  return uniqueStrings(matches);
}

function salientTokens(tokens: string[]) {
  return tokens.filter((token) => !LOW_SIGNAL_QUERY_TOKENS.has(token) && token.length >= 3);
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function countTokenMatches(text: string, tokens: string[]) {
  if (!text || tokens.length === 0) {
    return 0;
  }
  return tokens.reduce((sum, token) => sum + (tokenMatchesText(text, token) ? 1 : 0), 0);
}

function structuredTokenFragments(token: string) {
  return uniqueStrings(
    normalizeText(token)
      .split(/[._/:+-]+/g)
      .map((fragment) => fragment.trim())
      .filter((fragment) => fragment.length >= 2 && !/^\d+$/.test(fragment) && fragment !== token),
  );
}

function tokenMatchesText(text: string, token: string) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) {
    return false;
  }

  const normalizedText = normalizeText(text);
  if (normalizedText.includes(normalizedToken)) {
    return true;
  }

  const fragments = structuredTokenFragments(normalizedToken);
  if (fragments.length < 2) {
    return false;
  }

  const comparableText = normalizeComparableText(text);
  const matchedFragments = fragments.filter((fragment) => comparableText.includes(fragment)).length;
  return matchedFragments >= Math.min(2, fragments.length);
}

function strictStructuredTokenMatch(text: string, token: string) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) {
    return false;
  }

  if (normalizeText(text).includes(normalizedToken)) {
    return true;
  }

  const fragments = structuredTokenFragments(normalizedToken);
  if (fragments.length < 3) {
    return false;
  }

  const comparableText = normalizeComparableText(text);
  const matchedFragments = fragments.filter((fragment) => comparableText.includes(fragment)).length;
  return matchedFragments >= Math.min(3, fragments.length);
}

function textIncludesQueryPhrase(text: string, query: string) {
  const normalizedQuery = normalizeText(query).trim();
  if (!normalizedQuery) {
    return false;
  }

  if (normalizeText(text).includes(normalizedQuery)) {
    return true;
  }

  const comparableQuery = normalizeComparableText(query);
  return comparableQuery.length >= 4 && normalizeComparableText(text).includes(comparableQuery);
}

function isSourceLikeQueryToken(token: string) {
  const normalized = normalizeText(token);
  return [
    "github",
    "gitlab",
    "npm",
    "pypi",
    "huggingface",
    "modelscope",
    "bilibili",
    "youtube",
    "youtu",
    "douyin",
    "xhs",
    "xiaohongshu",
    "zhihu",
    "docs",
    "documentation",
    "official",
    "api",
    "up主",
    "up",
  ].includes(normalized);
}

function contentLikeQueryTokens(tokens: string[]) {
  return tokens.filter((token) => !isSourceLikeQueryToken(token));
}

function appendMissingFragments(query: string, fragments: string[]) {
  const normalized = normalizeText(query);
  const missing = fragments
    .map((fragment) => fragment.trim())
    .filter(Boolean)
    .filter((fragment) => !normalized.includes(normalizeText(fragment)));
  if (missing.length === 0) {
    return query.trim();
  }
  return `${query.trim()} ${missing.join(" ")}`.trim();
}

function hostMatches(host: string, suffix: string) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

function isGitHubHost(host: string) {
  return hostMatches(host, "github.com") || hostMatches(host, "raw.githubusercontent.com");
}

function isModelHost(host: string) {
  return MODEL_HOST_HINTS.some((hint) => hostMatches(host, hint));
}

function isPackageHost(host: string) {
  return PACKAGE_HOST_HINTS.some((hint) => hostMatches(host, hint));
}

function isPackageRegistryHost(host: string) {
  return hostMatches(host, "pypi.org") || hostMatches(host, "npmjs.com");
}

function looksLikePackagePage(pagePath: string, title: string) {
  const normalizedTitle = normalizeText(title);
  return pagePath.includes("/package/") ||
    pagePath.includes("/npm/") ||
    pagePath.includes("/pypi/") ||
    hasAny(normalizedTitle, [" on npm", " on pypi", " npm package", " pypi package"]);
}

function isDemotedHost(host: string) {
  return DEMOTED_HOSTS.some((hint) => hostMatches(host, hint));
}

function isSeoLikeHost(host: string) {
  return SEO_HOST_HINTS.some((hint) => hostMatches(host, hint));
}

function brandOfficialSignals(intent: SearchIntent, host: string) {
  const signals: Array<{ label: string; score: number }> = [];
  for (const rule of BRAND_OFFICIAL_HOSTS) {
    if (!intent.normalizedQuery.includes(rule.token)) {
      continue;
    }
    const preferred = rule.preferredHosts.some((candidate) => hostMatches(host, candidate));
    if (preferred) {
      signals.push({ label: `brand-${rule.token}-preferred`, score: 3.8 });
      continue;
    }
    if (rule.strict) {
      const hostContainsToken = host.includes(rule.token);
      if (hostContainsToken) {
        signals.push({ label: `brand-${rule.token}-lookalike`, score: -4.2 });
      } else {
        signals.push({ label: `brand-${rule.token}-nonpreferred`, score: -1.8 });
      }
    }
  }
  return signals;
}

function hasDocsHostPrefix(host: string) {
  return host.startsWith("docs.") || host.startsWith("developer.") || host.startsWith("developers.");
}

function looksLikeOfficialDocs(host: string, pagePath: string, title: string) {
  const normalizedTitle = normalizeText(title);
  return DOC_HOST_HINTS.some((hint) => hostMatches(host, hint)) ||
    hasDocsHostPrefix(host) ||
    DOC_PATH_HINTS.some((hint) => pagePath.includes(hint)) ||
    hasAny(normalizedTitle, ["documentation", "docs", "guide", "reference", "api"]);
}

function clampScore(value: number) {
  return Number(clamp01(value).toFixed(4));
}

function hasUrlLikeText(input: string) {
  return /https?:\/\/\S+/i.test(input);
}

function isShallowPath(pagePath: string) {
  return pagePath === "/" || pagePath.split("/").filter(Boolean).length <= 1;
}

function hasArtifactCue(...parts: string[]) {
  const combined = normalizeText(parts.join(" "));
  const explicitArtifactCue = hasAny(combined, [
    "release notes",
    "changelog",
    "what's new",
    "whats new",
    "now available",
    "release announce",
    "release announcement",
    "announcement",
    "announcements",
    "template",
    "playbook",
    "rubric",
    "checklist",
    "postmortem",
  ]) ||
    hasAny(combined, [
      "/changelog",
      "/release",
      "/releases",
      "/announcements/",
      "/announcement/",
      "/template",
      "/playbook",
      "/checklist",
      "/postmortem",
      "/whatsnew",
      "/what's-new",
      "/what-is-new",
      "/blog/announcements",
    ]);

  if (!explicitArtifactCue) {
    return false;
  }

  const looksLikeVersionedDocsSnapshot =
    combined.includes("/download/release/") &&
    (combined.includes("/docs/") || combined.includes(" documentation") || combined.includes("api reference")) &&
    !hasAny(combined, [
      "release notes",
      "changelog",
      "what's new",
      "whats new",
      "now available",
      "release announce",
      "release announcement",
      "announcement",
      "announcements",
    ]);
  if (looksLikeVersionedDocsSnapshot) {
    return false;
  }

  return true;
}

function focusEntityTokensV20(intent: SearchIntent) {
  return contentLikeQueryTokens(salientTokens(intent.tokens)).filter((token) => {
    const normalized = normalizeText(token);
    return !ARTIFACT_QUERY_TOKENS.has(normalized) && !/^v?\d+(?:\.\d+){0,3}$/.test(normalized);
  });
}

function precisionAnchorTokensV20(intent: SearchIntent) {
  return uniqueStrings(
    focusEntityTokensV20(intent).filter((token) => {
      const normalized = normalizeText(token);
      return normalized.length >= 3;
    }),
  );
}

function criticalAnchorTokensV20(intent: SearchIntent) {
  return precisionAnchorTokensV20(intent).filter((token) => {
    const normalized = normalizeText(token);
    return normalized.length <= 4 || /\d/.test(normalized) || /[._/:+-]/.test(normalized);
  });
}

function artifactAnchorTokensV20(intent: SearchIntent) {
  return uniqueStrings(
    salientTokens(intent.tokens).filter((token) => ARTIFACT_QUERY_TOKENS.has(normalizeText(token))),
  );
}

function hasArtifactIntentV20(intent: SearchIntent) {
  return artifactAnchorTokensV20(intent).length > 0;
}

function looksLikeVersionedDocsSnapshotV20(result: SearchResult) {
  const pagePath = normalizeText(result.path);
  const title = normalizeText(result.title);
  const hasVersionedDocsPath =
    pagePath.includes("/download/release/v") ||
    (pagePath.includes("/docs/") && /\/v?\d+(?:\.\d+){1,3}\//.test(pagePath));
  const genericDocsSnapshot =
    hasAny(title, ["about this documentation", "documentation"]) &&
    hasAny(pagePath, ["/documentation.html", "/docs/api/", "/docs/"]);
  return hasVersionedDocsPath && genericDocsSnapshot;
}

function resultLexicalAnchorCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = precisionAnchorTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }

  const anchorText = `${result.title} ${result.path} ${result.host}`;
  const lexicalMatches = countTokenMatches(anchorText, tokens);
  const coverage = lexicalMatches / tokens.length;
  const structuredTokens = tokens.filter((token) => /[._/:+-]/.test(token));
  const structuredMatches = structuredTokens.filter((token) => strictStructuredTokenMatch(anchorText, token)).length;
  const structuredCoverage = structuredTokens.length > 0 ? structuredMatches / structuredTokens.length : 0;

  return clampScore((coverage * 0.72) + (structuredCoverage * 0.28));
}

function resultCriticalAnchorCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = criticalAnchorTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(`${result.title} ${result.path} ${result.host}`, tokens) / tokens.length;
}

function resultArtifactAnchorCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = artifactAnchorTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(`${result.title} ${result.path} ${result.snippet}`, tokens) / tokens.length;
}

function hasAnalysisCommentaryCueV20(result: SearchResult) {
  const combined = normalizeText(`${result.title} ${result.snippet} ${result.path}`);
  return hasAny(combined, [
    ' analysis',
    ' what ',
    ' says about',
    ' should ',
    ' means ',
    ' opinion',
    ' editorial',
    ' column',
    ' bubble',
    ' benefit',
    ' outlook',
  ]);
}

function hasTroubleshootingCueV20(result: SearchResult) {
  const combined = normalizeText(`${result.title} ${result.snippet} ${result.path}`);
  return hasAny(combined, [
    "troubleshooting",
    "troubleshoot",
    "install",
    "installation",
    "getting started",
    "missing",
    "optional dependency",
    "dependency",
    "fix",
    "workaround",
    "cmake error",
    "failed",
  ]);
}

const EXPLAINER_QUERY_TOKENS_V20 = new Set([
  "what",
  "how",
  "works",
  "work",
  "explained",
  "explain",
  "intro",
  "introduction",
  "overview",
  "guide",
  "tutorial",
  "client",
  "server",
  "tools",
  "tool",
  "agent",
  "agents",
  "architecture",
  "concept",
  "concepts",
]);

function explainerAspectTokensV20(intent: SearchIntent) {
  return uniqueStrings(
    salientTokens(intent.tokens).filter((token) => EXPLAINER_QUERY_TOKENS_V20.has(normalizeText(token))),
  );
}

function hasExplainerIntentV20(intent: SearchIntent, planner: PlannerOutput) {
  if (intent.mode !== "general" || planner.flags.exactEntityLikely) {
    return false;
  }
  const aspectTokens = explainerAspectTokensV20(intent);
  return aspectTokens.length >= 2 || intent.normalizedQuery.includes("what is") || intent.normalizedQuery.includes("how it works");
}

function resultExplainerAspectCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = explainerAspectTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(`${result.title} ${result.snippet} ${result.path}`, tokens) / tokens.length;
}

function hasExplainerCueV20(result: SearchResult) {
  const combined = normalizeText(`${result.title} ${result.snippet} ${result.path}`);
  return hasAny(combined, [
    "what is",
    "how it works",
    "introduction",
    "intro",
    "overview",
    "explained",
    "why it matters",
    "client",
    "server",
    "tools",
    "agents and tools",
  ]);
}

function resultEntityCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = focusEntityTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(`${result.title} ${result.path}`, tokens) / tokens.length;
}

function resultHostCoverageV20(result: SearchResult, intent: SearchIntent) {
  const tokens = focusEntityTokensV20(intent);
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(result.host, tokens) / tokens.length;
}

function titleTokenCoverage(text: string, tokens: string[]) {
  if (tokens.length === 0) {
    return 0;
  }
  return countTokenMatches(text, tokens) / tokens.length;
}

function isStructuredLookupResultType(resultType: ResultType) {
  return resultType === "official-docs" ||
    resultType === "package" ||
    resultType === "repo" ||
    resultType === "issue-thread" ||
    resultType === "tutorial";
}

function isRetrievalFirstRerankVersion(version: RerankVersion) {
  return RETRIEVAL_FIRST_RERANK_VERSIONS.has(version);
}

function isPlannerCandidateRerankVersion(version: RerankVersion) {
  return PLANNER_CANDIDATE_RERANK_VERSIONS.has(version);
}

function buildPlannerOutput(query: string, intent: SearchIntent, requestedCategory?: SearchCategory): PlannerOutput {
  const normalizedQuery = intent.normalizedQuery;
  const tokenCount = intent.tokens.length;
  const hasQuotedEntity = /["“”'`][^"'“”`]{2,}["“”'`]/.test(query);
  const contractExtract = intent.agentContract?.taskMode === "extract";
  const contractCompare = intent.agentContract?.taskMode === "compare";
  const contractOfficialLookup =
    agentContractPrefersOfficialSources(intent) ||
    agentContractHasTargetKind(intent, "official-doc", "release-artifact", "whats-new");
  const hasErrorLikePattern = hasAny(normalizedQuery, [
    " error",
    " exception",
    " traceback",
    " stack trace",
    " typeerror",
    " referenceerror",
    " syntaxerror",
    " failed",
    " failure",
    " not working",
    " broken",
    " timeout",
    " 报错",
    " 失败",
    " 无法",
    " 异常",
  ]);
  const hasOfficialHint = intent.docsLike || intent.officialLike || contractOfficialLookup || hasAny(normalizedQuery, [" official", " docs", " documentation", " api", " reference", " manual", " 官方"]);
  const hasComparisonHint = contractCompare || /^compare\s/.test(normalizedQuery) || hasAny(normalizedQuery, [" compare", "compare ", " comparison", " versus", " vs ", " alternatives", " alternative", " landscape", " 对比", " 比较"]);
  const hasSimilarityHint = hasAny(normalizedQuery, [" similar", " like ", " alternatives", " alternative", " 推荐", " 类似", " 有哪些", " 有什么", " 选择"]);
  const hasHowToHint = hasAny(normalizedQuery, [
    " how to",
    " tutorial",
    " guide",
    " walkthrough",
    " setup",
    " install",
    " fix",
    " workaround",
    " template",
    " starter",
    " example",
    " solution",
    " 现成",
    " 教程",
    " 指南",
    " 修复",
    " 解决",
    " 示例",
    " 模板",
    " 怎么做",
  ]);
  const hasExtractionHint =
    contractExtract ||
    agentContractHasTargetKind(intent, "release-artifact", "whats-new") ||
    hasUrlLikeText(query) ||
    hasAny(normalizedQuery, [
      " extract",
      " extraction",
      " parse",
      " scrape",
      " summarize these",
      " summarize this page",
      " page content",
      " article body",
      " 网页",
      " 页面",
      " 正文",
      " 提取",
      " 抓取",
      " 总结这篇",
    ]);
  const hasVersionLikePattern = /\bv?\d+(?:\.\d+){1,3}\b/.test(normalizedQuery);
  const verifySensitive = requestedCategory === "news" || hasAny(normalizedQuery, [
    " latest",
    " today",
    " this week",
    " rumor",
    " rumors",
    " valuation",
    " market cap",
    " released",
    " release",
    " is it true",
    " true or false",
    " policy",
    " funding",
    " 融资",
    " 市值",
    " 谣言",
    " 最新",
    " 真的假的",
    " 是否发布",
  ]);
  const exactEntityLikely =
    hasQuotedEntity ||
    hasOfficialHint ||
    contractOfficialLookup ||
    hasVersionLikePattern ||
    intent.sourceMentions.length > 0 ||
    intent.mode === "official-docs" ||
    intent.mode === "models" ||
    hasErrorLikePattern;
  const solutionIntentLikely =
    hasHowToHint ||
    hasErrorLikePattern ||
    intent.mode === "github" ||
    hasAny(normalizedQuery, [" repo", " repository", " package", " sdk", " tool", " issue", " plugin", " github", " npm", " pypi"]);
  const extractionImportant = hasExtractionHint || hasAny(normalizedQuery, [" summarize", " article", " blog", " docs page", " release notes", " changelog", " template", " playbook", " rubric", " checklist", " 页面内容", " 正文提取", " 模板", " 清单"]);

  let branch: RetrievalBranch = "broad-discovery";
  const rationale: string[] = [];
  if (hasExtractionHint) {
    branch = "extract-heavy";
    rationale.push("page-centric extraction cues detected");
  } else if (exactEntityLikely && hasOfficialHint && !hasHowToHint && !hasErrorLikePattern) {
    branch = "precision-lookup";
    rationale.push("official/canonical lookup cues detected");
  } else if (solutionIntentLikely) {
    branch = "solution-hunt";
    rationale.push("solution/implementation intent detected");
  } else if (exactEntityLikely || intent.mode !== "general") {
    branch = "precision-lookup";
    rationale.push("exact-entity or source-specific lookup detected");
  } else if (hasComparisonHint || hasSimilarityHint || tokenCount <= 2) {
    branch = "broad-discovery";
    rationale.push("exploratory or ambiguous query detected");
  } else {
    rationale.push("default general baseline path");
  }

  if (intent.mode === "github" && branch !== "extract-heavy") {
    branch = "solution-hunt";
    rationale.push("github mode leans toward practical artifacts");
  } else if ((intent.mode === "official-docs" || intent.mode === "models") && branch !== "extract-heavy") {
    branch = "precision-lookup";
    rationale.push("source-specific mode tightens lookup intent");
  }

  let precisionDial: PrecisionDial = "balanced";
  if (branch === "broad-discovery" || (verifySensitive && !exactEntityLikely)) {
    precisionDial = "broad";
  } else if (
    branch === "precision-lookup" ||
    hasQuotedEntity ||
    hasVersionLikePattern ||
    (hasOfficialHint && !hasComparisonHint)
  ) {
    precisionDial = "precise";
  }

  let expectedNextStep: PlannerOutput["expectedNextStep"] = "fetch";
  if (branch === "extract-heavy") {
    expectedNextStep = hasAny(normalizedQuery, [" screenshot", " render", " dynamic", " js-heavy", " javascript"]) ? "browser-fallback" : "extract";
  } else if (branch === "precision-lookup" && precisionDial === "precise") {
    expectedNextStep = "answer";
  }

  return {
    branch,
    precisionDial,
    rationale: uniqueStrings(rationale),
    expectedNextStep,
    flags: {
      verifySensitive,
      extractionImportant,
      exactEntityLikely,
      solutionIntentLikely,
    },
    queryProfile: {
      tokenCount,
      hasQuotedEntity,
      hasErrorLikePattern,
      hasOfficialHint,
      hasComparisonHint,
      hasHowToHint,
      hasSimilarityHint,
      hasExtractionHint,
      agentContractApplied: Boolean(intent.agentContract),
    },
  };
}

function classifyResultType(result: SearchResult): { resultType: ResultType; why: string[] } {
  const host = result.host;
  const pagePath = result.path;
  const title = normalizeText(result.title);
  const snippet = normalizeText(result.snippet);
  const why: string[] = [];

  if (looksLikeOfficialDocs(host, pagePath, result.title)) {
    why.push("official docs host/path");
    return { resultType: "official-docs", why };
  }
  if (isGitHubHost(host)) {
    if (pagePath.includes("/issues/") || pagePath.includes("/pull/") || pagePath.includes("/discussions/")) {
      why.push("github issue/discussion path");
      return { resultType: "issue-thread", why };
    }
    if (/^\/[^/]+\/[^/]+/.test(pagePath)) {
      why.push("github repository path");
      return { resultType: "repo", why };
    }
  }
  if (hostMatches(host, "pypi.org") || hostMatches(host, "npmjs.com") || looksLikePackagePage(pagePath, result.title)) {
    why.push("package page cue");
    return { resultType: "package", why };
  }
  if (hasAny(title, ["how to", "tutorial", "guide", "walkthrough", "getting started", "quickstart", "template", "playbook", "rubric", "checklist", "教程", "指南", "入门", "模板", "清单"])) {
    why.push("tutorial/guide/artifact cue");
    return { resultType: "tutorial", why };
  }
  if (
    result.category === "news" ||
    hasAny(host, ["reuters.com", "apnews.com", "bloomberg.com", "ft.com", "nytimes.com", "theverge.com", "techcrunch.com"]) ||
    pagePath.includes("/news/")
  ) {
    why.push("news source/path");
    return { resultType: "news", why };
  }
  if (
    pagePath.includes("/blog") ||
    pagePath.includes("/post") ||
    pagePath.includes("/article") ||
    hasAny(host, ["medium.com", "substack.com", "dev.to", "hashnode.dev"])
  ) {
    why.push("blog/article path");
    return { resultType: "blog", why };
  }
  if (
    isSeoLikeHost(host) ||
    hasAny(title, ["alternatives", "top ", "best ", "directory", "list of", "list releases", "release date", "end of life", "排名", "合集"]) ||
    pagePath.includes("/search") ||
    pagePath.includes("/tag/") ||
    pagePath.includes("/category/")
  ) {
    why.push("directory/listing shape");
    return { resultType: "directory", why };
  }
  const shallowPath = isShallowPath(pagePath);
  if (shallowPath && !snippet.includes("guide") && !snippet.includes("documentation") && !snippet.includes("tutorial")) {
    why.push("thin landing path");
    return { resultType: "landing", why };
  }
  return { resultType: "unknown", why: why.length > 0 ? why : ["no strong type cues"] };
}

function classifyPageRole(result: SearchResult, resultType: ResultType, why: string[]) {
  if (resultType === "package") {
    why.push("registry/package page role");
    return "registry" satisfies PageRole;
  }
  if (resultType === "repo") {
    why.push("repository page role");
    return "repository" satisfies PageRole;
  }
  if (resultType === "issue-thread") {
    why.push("discussion page role");
    return "discussion" satisfies PageRole;
  }
  if (resultType === "directory") {
    why.push("meta listing page role");
    return "meta-listing" satisfies PageRole;
  }
  if (resultType === "landing") {
    why.push("landing page role");
    return "landing" satisfies PageRole;
  }
  if (hasArtifactCue(result.title, result.path, result.snippet)) {
    why.push("artifact page role");
    return "official-artifact" satisfies PageRole;
  }
  if (resultType === "official-docs") {
    why.push("canonical docs page role");
    return "canonical-doc" satisfies PageRole;
  }
  if (resultType === "tutorial" || resultType === "blog" || resultType === "news") {
    why.push("deep content page role");
    return "deep-content" satisfies PageRole;
  }
  return "unknown" satisfies PageRole;
}

function scoreSolutionLikelihood(result: SearchResult, resultType: ResultType, intent: SearchIntent, why: string[]) {
  const combined = normalizeText(`${result.title} ${result.snippet} ${result.path}`);
  const baseScores: Record<ResultType, number> = {
    "official-docs": 0.72,
    repo: 0.94,
    package: 0.88,
    "issue-thread": 0.8,
    tutorial: 0.86,
    news: 0.18,
    blog: 0.48,
    directory: 0.28,
    landing: 0.14,
    unknown: 0.38,
  };
  let score = baseScores[resultType];
  if (hasAny(combined, ["how to", "fix", "install", "setup", "starter", "template", "workaround", "solution", "example", "guide", "教程", "修复", "解决", "示例"])) {
    score += 0.12;
    why.push("implementation/how-to cue");
  }
  if (intent.mode === "github" && resultType === "repo") {
    score += 0.06;
    why.push("github intent + repo fit");
  }
  if (intent.docsLike && resultType === "official-docs") {
    score += 0.05;
    why.push("docs intent + canonical docs");
  }
  if (resultType === "landing" || resultType === "news") {
    score -= 0.04;
  }
  return clampScore(score);
}

function scoreEntityMatchStrength(result: SearchResult, intent: SearchIntent, why: string[]) {
  const focusTokens = salientTokens(intent.tokens);
  const tokens = focusTokens.length > 0 ? focusTokens : intent.tokens;
  if (tokens.length === 0) {
    return 0;
  }

  const title = normalizeText(result.title);
  const pagePath = normalizeText(result.path);
  const host = normalizeText(result.host);
  let score = 0;

  if (intent.normalizedQuery && textIncludesQueryPhrase(title, intent.normalizedQuery)) {
    score += 0.42;
    why.push("exact query phrase in title");
  } else if (intent.normalizedQuery && textIncludesQueryPhrase(pagePath, intent.normalizedQuery)) {
    score += 0.24;
    why.push("exact query phrase in path");
  }

  const titleCoverage = titleTokenCoverage(title, tokens);
  const pathCoverage = titleTokenCoverage(pagePath, tokens);
  const hostCoverage = titleTokenCoverage(host, tokens);
  score += Math.min(0.34, titleCoverage * 0.34);
  score += Math.min(0.16, pathCoverage * 0.16);
  score += Math.min(0.12, hostCoverage * 0.12);

  const structuredTokens = tokens.filter((token) => /[._/:+-]/.test(token));
  const structuredAnchorMatches = structuredTokens.filter((token) => strictStructuredTokenMatch(`${host} ${pagePath}`, token)).length;
  if (structuredAnchorMatches > 0) {
    score += Math.min(0.18, structuredAnchorMatches * 0.12);
    why.push("structured entity host/path match");
  }

  if (titleCoverage >= 0.66) {
    why.push("strong title token match");
  }
  if (pathCoverage >= 0.5) {
    why.push("strong path token match");
  }

  for (const signal of brandOfficialSignals(intent, result.host)) {
    if (signal.score > 0) {
      score += 0.08;
      why.push("brand/host consistency");
      break;
    }
  }

  return clampScore(score);
}

function scoreSourceFit(result: SearchResult, resultType: ResultType, intent: SearchIntent, pageRole: PageRole, why: string[]) {
  const host = normalizeText(result.host);
  const pagePath = normalizeText(result.path);
  const docsHost = looksLikeOfficialDocs(host, pagePath, result.title);
  const githubHost = isGitHubHost(host);
  const modelHost = isModelHost(host);
  const packageHost = isPackageHost(host);
  const entityCoverage = resultEntityCoverageV20(result, intent);
  const hostCoverage = resultHostCoverageV20(result, intent);
  const exactPhrase = Boolean(intent.normalizedQuery) && (
    textIncludesQueryPhrase(result.title, intent.normalizedQuery) ||
    textIncludesQueryPhrase(result.path, intent.normalizedQuery)
  );
  const hostAligned = hostCoverage >= 0.25;
  const contentAligned = entityCoverage >= 0.62 || exactPhrase;
  let score = 0.12;

  if (intent.sourceMentions.includes("github") && githubHost) {
    score = Math.max(score, 0.98);
    why.push("explicit github source fit");
  }
  if (
    (
      intent.sourceMentions.includes("huggingface") && hostMatches(host, "huggingface.co")
    ) ||
    (
      intent.sourceMentions.includes("hf-mirror") && hostMatches(host, "hf-mirror.com")
    ) ||
    (
      intent.sourceMentions.includes("modelscope") &&
      (hostMatches(host, "modelscope.cn") || hostMatches(host, "modelscope.com"))
    )
  ) {
    score = Math.max(score, 0.98);
    why.push("explicit model source fit");
  }
  if (intent.sourceMentions.includes("pypi") && hostMatches(host, "pypi.org")) {
    score = Math.max(score, 0.98);
    why.push("explicit pypi source fit");
  }
  if (intent.sourceMentions.includes("npm") && hostMatches(host, "npmjs.com")) {
    score = Math.max(score, 0.98);
    why.push("explicit npm source fit");
  }

  switch (intent.mode) {
    case "official-docs":
      if (docsHost && resultType === "official-docs") {
        score = Math.max(score, 0.56);
        if (pageRole === "canonical-doc" && hostAligned && (entityCoverage >= 0.26 || exactPhrase)) {
          score = Math.max(score, 1);
          why.push("entity-aligned canonical docs fit");
        } else if (pageRole === "official-artifact" && hostAligned && (entityCoverage >= 0.2 || exactPhrase)) {
          score = Math.max(score, 0.96);
          why.push("entity-aligned docs artifact fit");
        } else if (pageRole === "canonical-doc" && contentAligned) {
          score = Math.max(score, 0.74);
          why.push("entity-aligned docs mirror fit");
        } else if (pageRole === "official-artifact" && entityCoverage >= 0.5) {
          score = Math.max(score, 0.66);
          why.push("artifact page with entity overlap");
        } else {
          score = Math.max(score, 0.5);
          why.push("generic docs host fit");
        }
      } else if (pageRole === "official-artifact" && hostAligned && (entityCoverage >= 0.2 || exactPhrase)) {
        score = Math.max(score, 0.96);
        why.push("entity-aligned official artifact source fit");
      } else if (pageRole === "official-artifact" && entityCoverage >= 0.62) {
        score = Math.max(score, 0.68);
        why.push("artifact page with strong entity overlap");
      } else if (githubHost && resultType === "repo") {
        score = Math.max(score, 0.44);
      } else {
        score = Math.max(score, 0.18);
      }
      break;
    case "github":
      if (githubHost && (resultType === "repo" || resultType === "issue-thread")) {
        score = Math.max(score, 1);
        why.push("github source fit");
      } else if (githubHost) {
        score = Math.max(score, 0.88);
        why.push("github host fit");
      } else if (docsHost && hasDocsHostPrefix(host)) {
        score = Math.max(score, 0.56);
        why.push("adjacent official docs fit");
      } else if (docsHost) {
        score = Math.max(score, 0.32);
      }
      break;
    case "models":
      if (modelHost) {
        score = Math.max(score, 1);
        why.push("model-host fit");
      } else if (githubHost && resultType === "issue-thread") {
        score = Math.max(score, 0.7);
      } else if (githubHost) {
        score = Math.max(score, 0.58);
      }
      break;
    case "packages":
      if (isPackageRegistryHost(host)) {
        score = Math.max(score, 1);
        why.push("package registry fit");
      } else if (resultType === "package") {
        score = Math.max(score, 0.8);
        why.push("package metadata fit");
      } else if (githubHost && (resultType === "repo" || resultType === "issue-thread")) {
        score = Math.max(score, 0.74);
        why.push("package-adjacent repo fit");
      } else if (githubHost) {
        score = Math.max(score, 0.62);
      } else if (packageHost) {
        score = Math.max(score, 0.72);
      }
      break;
    default:
      if (docsHost && intent.docsLike) {
        score = Math.max(score, hostAligned || contentAligned ? 0.8 : 0.64);
      }
      if (pageRole === "official-artifact" && (hostAligned || entityCoverage >= 0.62) && intent.docsLike) {
        score = Math.max(score, 0.82);
      }
      if (githubHost && intent.githubLike) {
        score = Math.max(score, 0.78);
      }
      if (modelHost && intent.modelLike) {
        score = Math.max(score, 0.82);
      }
      if (packageHost && intent.packageLike) {
        score = Math.max(score, 0.82);
      }
      break;
  }

  return clampScore(score);
}
function scorePageSpecificity(result: SearchResult, resultType: ResultType, intent: SearchIntent, why: string[]) {
  const title = normalizeText(result.title);
  const pagePath = normalizeText(result.path);
  const tokens = (() => {
    const focusTokens = salientTokens(intent.tokens);
    return focusTokens.length > 0 ? focusTokens : intent.tokens;
  })();
  const titleCoverage = titleTokenCoverage(title, tokens);
  const pathCoverage = titleTokenCoverage(pagePath, tokens);
  let score = (titleCoverage * 0.44) + (pathCoverage * 0.28);

  if (intent.normalizedQuery && textIncludesQueryPhrase(title, intent.normalizedQuery)) {
    score += 0.16;
    why.push("page-specific exact title fit");
  } else if (intent.normalizedQuery && textIncludesQueryPhrase(pagePath, intent.normalizedQuery)) {
    score += 0.1;
    why.push("page-specific exact path fit");
  }

  if (hasAny(pagePath, ["/issues/", "/pull/", "/discussions/", "/api-reference/", "/reference/", "/guides/", "/guide/", "/manual/", "/readme", "/changelog"])) {
    score += 0.08;
    why.push("deep structured page");
  }
  if (hasAny(title, ["release notes", "changelog", "what's new", "now available", "template", "playbook", "rubric", "checklist"])) {
    score += 0.08;
    why.push("artifact/title specificity cue");
  }
  if (hasAny(pagePath, ["/collections/", "/search", "/tag/", "/category/"])) {
    score -= 0.14;
    why.push("collection/listing path");
  }
  if (
    resultType === "official-docs" &&
    (pagePath === "/docs" || pagePath === "/api/docs" || pagePath === "/reference" || pagePath === "/api/reference")
  ) {
    score -= 0.14;
    why.push("generic docs hub");
  }
  if (resultType === "landing" || resultType === "directory") {
    score -= 0.18;
  }
  if (isShallowPath(pagePath) && resultType !== "repo" && resultType !== "package") {
    score -= 0.08;
  }

  return clampScore(score);
}

function scoreExtractionLikelihood(result: SearchResult, resultType: ResultType, why: string[]) {
  const pagePath = normalizeText(result.path);
  const combined = normalizeText(`${result.title} ${result.snippet}`);
  const baseScores: Record<ResultType, number> = {
    "official-docs": 0.82,
    repo: 0.56,
    package: 0.58,
    "issue-thread": 0.62,
    tutorial: 0.84,
    news: 0.74,
    blog: 0.78,
    directory: 0.22,
    landing: 0.12,
    unknown: 0.46,
  };
  let score = baseScores[resultType];
  const shallowPath = isShallowPath(pagePath);

  if (hasAny(pagePath, ["/docs", "/guide", "/reference", "/manual", "/blog", "/article", "/post", "/news/", "/changelog"])) {
    score += 0.08;
    why.push("body-page path pattern");
  }
  if (hasAny(combined, ["release notes", "changelog", "template", "playbook", "rubric", "checklist"])) {
    score += 0.1;
    why.push("extractable artifact cue");
  }
  if (hasAny(pagePath, ["/tag/", "/tags/", "/category/", "/topics/", "/search"])) {
    score -= 0.16;
    why.push("hub/listing path");
  }
  if (shallowPath && resultType !== "official-docs") {
    score -= 0.14;
    why.push("thin root/landing path");
  }
  if (combined.length < 80) {
    score -= 0.06;
  }
  if (isSeoLikeHost(result.host)) {
    score -= 0.12;
    why.push("aggregator/seo host");
  }

  return clampScore(score);
}

function scoreDiversityValue(
  result: SearchResult,
  resultType: ResultType,
  hostCounts: Map<string, number>,
  typeCounts: Map<ResultType, number>,
) {
  const hostFrequency = hostCounts.get(result.host) ?? 1;
  const typeFrequency = typeCounts.get(resultType) ?? 1;
  const uniqueHostScore = hostFrequency <= 1 ? 1 : hostFrequency === 2 ? 0.55 : 0.25;
  const uniqueTypeScore = typeFrequency <= 1 ? 1 : typeFrequency === 2 ? 0.65 : 0.35;
  return clampScore((uniqueHostScore * 0.65) + (uniqueTypeScore * 0.35));
}

function plannerAdjustmentForResult(result: SearchResult, diagnostics: ResultDiagnostics, intent: SearchIntent, planner: PlannerOutput) {
  const canonicalBoost =
    diagnostics.resultType === "official-docs" || diagnostics.resultType === "package" || diagnostics.resultType === "repo"
      ? 0.04
      : 0;
  const practicalBoost =
    diagnostics.resultType === "repo" || diagnostics.resultType === "package" || diagnostics.resultType === "issue-thread" || diagnostics.resultType === "tutorial"
      ? 0.05
      : 0;
  const extractableBoost =
    diagnostics.resultType === "official-docs" || diagnostics.resultType === "tutorial" || diagnostics.resultType === "blog" || diagnostics.resultType === "news"
      ? 0.04
      : 0;
  const genericPenalty =
    diagnostics.resultType === "directory" || diagnostics.resultType === "landing"
      ? -0.06
      : diagnostics.resultType === "news" && planner.branch === "solution-hunt"
        ? -0.05
        : 0;

  let adjustment = 0;
  switch (planner.branch) {
    case "broad-discovery": {
      adjustment += (diagnostics.diversityValue * 0.12) + (diagnostics.extractionLikelihood * 0.04);
      if (planner.precisionDial === "broad") {
        adjustment += diagnostics.diversityValue * 0.03;
      }
      if (
        diagnostics.resultType === "repo" &&
        !planner.flags.exactEntityLikely &&
        !planner.queryProfile.hasOfficialHint &&
        !planner.queryProfile.hasComparisonHint &&
        !planner.queryProfile.hasSimilarityHint
      ) {
        adjustment -= 0.04;
      }
      const contentTokens = contentLikeQueryTokens(intent.tokens);
      if (contentTokens.length > 0) {
        const sourceTokens = intent.tokens.filter((token) => isSourceLikeQueryToken(token));
        const combined = `${result.title} ${result.path}`;
        const contentCoverage = countTokenMatches(combined, contentTokens) / contentTokens.length;
        const sourceCoverage = sourceTokens.length > 0 ? countTokenMatches(combined, sourceTokens) / sourceTokens.length : 0;
        if (sourceCoverage >= 0.5 && contentCoverage === 0) {
          adjustment -= 0.14;
        } else if (contentCoverage >= 0.5 && sourceCoverage < 0.5) {
          adjustment += 0.06;
        }
      }
      adjustment += genericPenalty * 0.5;
      break;
    }
    case "precision-lookup":
      adjustment += (diagnostics.entityMatchStrength * 0.18) + canonicalBoost + genericPenalty;
      if (planner.precisionDial === "precise") {
        adjustment += diagnostics.entityMatchStrength * 0.04;
      }
      break;
    case "solution-hunt":
      adjustment += (diagnostics.solutionLikelihood * 0.2) + practicalBoost + (genericPenalty * 0.85);
      if (planner.flags.solutionIntentLikely) {
        adjustment += 0.02;
      }
      break;
    case "extract-heavy":
      adjustment += (diagnostics.extractionLikelihood * 0.18) + extractableBoost + genericPenalty;
      break;
  }

  if (planner.flags.verifySensitive && diagnostics.resultType === "landing") {
    adjustment -= 0.03;
  }

  return Number(adjustment.toFixed(4));
}

function shouldApplyV15GuardedLayer(intent: SearchIntent, planner: PlannerOutput) {
  if (planner.branch === "precision-lookup") {
    return true;
  }
  if (intent.mode === "official-docs" || intent.mode === "github" || intent.mode === "models" || intent.mode === "packages") {
    return true;
  }
  if (
    planner.branch === "solution-hunt" &&
    (intent.docsLike || intent.githubLike || intent.modelLike || intent.packageLike || intent.sourceMentions.length > 0)
  ) {
    return true;
  }
  return false;
}

function guardedAdjustmentForResult(result: SearchResult, diagnostics: ResultDiagnostics, intent: SearchIntent, planner: PlannerOutput) {
  if (!shouldApplyV15GuardedLayer(intent, planner)) {
    return 0;
  }

  const hostCoverage = resultHostCoverageV20(result, intent);
  let adjustment =
    (diagnostics.sourceFitScore * 0.16) +
    (diagnostics.pageSpecificity * 0.12) +
    (diagnostics.entityMatchStrength * (planner.branch === "precision-lookup" ? 0.08 : 0.04));

  if ((diagnostics.resultType === "landing" || diagnostics.resultType === "directory") && diagnostics.sourceFitScore < 0.85) {
    adjustment -= 0.08;
  }
  if (diagnostics.resultType === "blog" && planner.branch === "precision-lookup" && diagnostics.sourceFitScore < 0.4) {
    adjustment -= 0.05;
  }
  if (diagnostics.resultType === "official-docs" && diagnostics.pageSpecificity < 0.28) {
    adjustment -= 0.08;
  }
  if (planner.branch === "precision-lookup" && diagnostics.resultType === "official-docs" && diagnostics.entityMatchStrength < 0.16) {
    adjustment -= 0.08;
  }
  if (
    planner.branch === "precision-lookup" &&
    planner.flags.exactEntityLikely &&
    diagnostics.resultType === "official-docs" &&
    diagnostics.entityMatchStrength < 0.08 &&
    diagnostics.pageSpecificity < 0.12
  ) {
    adjustment -= 0.18;
  }
  if (
    planner.branch === "precision-lookup" &&
    intent.mode === "official-docs" &&
    diagnostics.resultType === "official-docs" &&
    diagnostics.sourceFitScore < 0.8 &&
    diagnostics.entityMatchStrength < 0.36
  ) {
    adjustment -= 0.12;
  }
  if (planner.branch === "extract-heavy" && diagnostics.pageRole === "official-artifact") {
    adjustment += diagnostics.extractionLikelihood * 0.06;
    if (diagnostics.sourceFitScore >= 0.9 && hostCoverage >= 0.25) {
      adjustment += 0.24;
    } else if (diagnostics.sourceFitScore < 0.75 && hostCoverage < 0.25) {
      adjustment -= 0.08;
    }
  }
  if (intent.mode === "github" && diagnostics.resultType === "official-docs" && diagnostics.sourceFitScore >= 0.5) {
    adjustment += 0.08;
  }
  if (intent.mode === "packages") {
    const explicitGithub = intent.sourceMentions.includes("github") || intent.normalizedQuery.includes(" github");
    if (diagnostics.resultType === "package" && diagnostics.sourceFitScore >= 0.95) {
      adjustment += 0.08;
    } else if (diagnostics.resultType === "package" && diagnostics.sourceFitScore >= 0.75) {
      adjustment += 0.04;
    } else if (!explicitGithub && diagnostics.resultType === "repo") {
      adjustment -= 0.14;
    }
  }

  return Number(adjustment.toFixed(4));
}

function annotateResultDiagnostics(
  results: SearchResult[],
  intent: SearchIntent,
  planner: PlannerOutput,
  options: { applyBranchAdjustment: boolean; applyGuardedAdjustment?: boolean; debug: boolean },
) {
  const typed = results.map((result) => {
    const { resultType, why: typeWhy } = classifyResultType(result);
    const why = [...typeWhy];
    const pageRole = classifyPageRole(result, resultType, why);
    const solutionLikelihood = scoreSolutionLikelihood(result, resultType, intent, why);
    const entityMatchStrength = scoreEntityMatchStrength(result, intent, why);
    const extractionLikelihood = scoreExtractionLikelihood(result, resultType, why);
    const sourceFitScore = scoreSourceFit(result, resultType, intent, pageRole, why);
    const pageSpecificity = scorePageSpecificity(result, resultType, intent, why);
    return {
      result,
      diagnostics: {
        resultType,
        solutionLikelihood,
        entityMatchStrength,
        extractionLikelihood,
        diversityValue: 0,
        sourceFitScore,
        pageSpecificity,
        pageRole,
        branchAdjustment: 0,
        why: uniqueStrings(why),
      } satisfies ResultDiagnostics,
    };
  });

  const hostCounts = new Map<string, number>();
  const typeCounts = new Map<ResultType, number>();
  for (const item of typed) {
    hostCounts.set(item.result.host, (hostCounts.get(item.result.host) ?? 0) + 1);
    typeCounts.set(item.diagnostics.resultType, (typeCounts.get(item.diagnostics.resultType) ?? 0) + 1);
  }

  const enriched = typed
    .map(({ result, diagnostics }) => {
      const diversityValue =
        planner.branch === "broad-discovery"
          ? scoreDiversityValue(result, diagnostics.resultType, hostCounts, typeCounts)
          : 0;
      const branchAdjustment = options.applyBranchAdjustment
        ? plannerAdjustmentForResult(result, { ...diagnostics, diversityValue }, intent, planner)
        : 0;
      const guardedAdjustment = options.applyGuardedAdjustment
        ? guardedAdjustmentForResult(result, { ...diagnostics, diversityValue, branchAdjustment }, intent, planner)
        : 0;
      const totalAdjustment = Number((branchAdjustment + guardedAdjustment).toFixed(4));
      const score = typeof result.score === "number"
        ? Number((result.score + totalAdjustment).toFixed(4))
        : totalAdjustment;
      const signals = options.debug
        ? [
            ...(result.signals ?? []),
            `planner-branch:${planner.branch}`,
            `planner-precision:${planner.precisionDial}`,
            `result-type:${diagnostics.resultType}`,
            `solution-likelihood:${diagnostics.solutionLikelihood.toFixed(2)}`,
            `entity-match:${diagnostics.entityMatchStrength.toFixed(2)}`,
            `extraction-likelihood:${diagnostics.extractionLikelihood.toFixed(2)}`,
            `source-fit:${diagnostics.sourceFitScore.toFixed(2)}`,
            `page-specificity:${diagnostics.pageSpecificity.toFixed(2)}`,
            `page-role:${diagnostics.pageRole}`,
            `diversity-value:${diversityValue.toFixed(2)}`,
            `planner-adjustment:${branchAdjustment.toFixed(4)}`,
            `guarded-adjustment:${guardedAdjustment.toFixed(4)}`,
          ]
        : result.signals;

      return {
        ...result,
        score,
        signals,
        resultType: diagnostics.resultType,
        solutionLikelihood: diagnostics.solutionLikelihood,
        entityMatchStrength: diagnostics.entityMatchStrength,
        extractionLikelihood: diagnostics.extractionLikelihood,
        diversityValue,
        sourceFitScore: diagnostics.sourceFitScore,
        pageSpecificity: diagnostics.pageSpecificity,
        pageRole: diagnostics.pageRole,
        plannerAdjustment: totalAdjustment,
        guardedAdjustment,
        why: options.debug ? diagnostics.why : undefined,
      } satisfies SearchResult;
    });

  if (!options.applyBranchAdjustment) {
    return enriched.map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
  }

  return enriched
    .sort((a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      (planner.branch === "precision-lookup"
        ? (b.entityMatchStrength ?? 0) - (a.entityMatchStrength ?? 0)
        : planner.branch === "solution-hunt"
          ? (b.solutionLikelihood ?? 0) - (a.solutionLikelihood ?? 0)
          : planner.branch === "extract-heavy"
            ? (b.extractionLikelihood ?? 0) - (a.extractionLikelihood ?? 0)
            : (b.diversityValue ?? 0) - (a.diversityValue ?? 0)) ||
      (b.heuristicPrior ?? 0) - (a.heuristicPrior ?? 0) ||
      (a.rank ?? 999) - (b.rank ?? 999) ||
      a.originalRank - b.originalRank,
    )
    .map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
}

function tokenSetJaccard(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }
  const union = new Set([...leftSet, ...rightSet]).size;
  return union > 0 ? intersection / union : 0;
}

function comparableResultTokens(result: SearchResult) {
  return salientTokens(
    tokenize(`${normalizeComparableText(result.title)} ${normalizeComparableText(result.path)}`),
  );
}

function areNearDuplicateResults(left: SearchResult, right: SearchResult) {
  if (canonicalizeUrl(left.url) === canonicalizeUrl(right.url)) {
    return true;
  }

  if (left.host !== right.host) {
    return false;
  }

  const leftTitle = normalizeComparableText(left.title);
  const rightTitle = normalizeComparableText(right.title);
  if (leftTitle && rightTitle && (leftTitle === rightTitle || leftTitle.includes(rightTitle) || rightTitle.includes(leftTitle))) {
    return true;
  }

  const titleSimilarity = tokenSetJaccard(
    salientTokens(tokenize(left.title)),
    salientTokens(tokenize(right.title)),
  );
  const pathSimilarity = tokenSetJaccard(
    salientTokens(tokenize(left.path)),
    salientTokens(tokenize(right.path)),
  );
  const combinedSimilarity = tokenSetJaccard(
    comparableResultTokens(left),
    comparableResultTokens(right),
  );

  return combinedSimilarity >= 0.84 || (titleSimilarity >= 0.72 && pathSimilarity >= 0.5);
}

function selectCandidateSet(
  results: SearchResult[],
  planner: PlannerOutput,
  limit: number,
  debug: boolean,
) {
  if (limit <= 0 || results.length < limit || planner.branch !== "broad-discovery") {
    return ensureWithinLimit(results, limit).map((result, index) => ({
      ...result,
      rank: index + 1,
    }));
  }

  const uniqueHostTarget = Math.min(limit, 4);
  const minimumDiverseFloor = Math.min(limit, 3);
  const selected: SearchResult[] = [];
  const deferredHostBackfill: SearchResult[] = [];

  for (const candidate of results) {
    if (selected.some((existing) => areNearDuplicateResults(existing, candidate))) {
      continue;
    }

    const hostAlreadySelected = selected.some((existing) => existing.host === candidate.host);
    if (hostAlreadySelected && selected.length < uniqueHostTarget) {
      deferredHostBackfill.push(candidate);
      continue;
    }

    selected.push({
      ...candidate,
      signals: debug ? [...(candidate.signals ?? []), `candidate-set:${hostAlreadySelected ? "host-backfill" : "diverse-pass"}`] : candidate.signals,
    });
    if (selected.length >= limit) {
      break;
    }
  }

  if (selected.length < minimumDiverseFloor) {
    for (const candidate of deferredHostBackfill) {
      if (selected.length >= minimumDiverseFloor) {
        break;
      }
      if (selected.some((existing) => areNearDuplicateResults(existing, candidate))) {
        continue;
      }
      selected.push({
        ...candidate,
        signals: debug ? [...(candidate.signals ?? []), "candidate-set:host-backfill"] : candidate.signals,
      });
    }
  }

  return selected.map((result, index) => ({
    ...result,
    rank: index + 1,
  }));
}

function normalizeSearchResults(raw: any, limit: number, category: string, offset = 0) {
  const results = Array.isArray(raw?.results) ? raw.results : [];
  return ensureWithinLimit(results, limit).map((item: any, index: number) => {
    const url = typeof item?.url === "string" ? item.url : "";
    return {
      title: typeof item?.title === "string" ? item.title : "",
      url,
      snippet:
        typeof item?.content === "string"
          ? item.content
          : typeof item?.snippet === "string"
            ? item.snippet
            : "",
      engine: typeof item?.engine === "string" ? item.engine : undefined,
      category: typeof item?.category === "string" ? item.category : undefined,
      publishedDate:
        typeof item?.publishedDate === "string"
          ? item.publishedDate
          : typeof item?.published === "string"
            ? item.published
            : undefined,
      host: safeHostname(url),
      path: safePath(url),
      originalRank: offset + index + 1,
      originalCategory: category,
      categories: [category],
    } satisfies SearchResult;
  });
}

function detectQueryIntent(
  query: string,
  requestedMode: SearchMode | undefined,
  requestedCategory?: string,
  agentContractInput?: unknown,
): SearchIntent {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);
  const agentContract = normalizeAgentSearchContract(agentContractInput);
  const contractOfficialDocs = Boolean(agentContract?.targetKind && ["official-doc", "release-artifact", "whats-new"].includes(agentContract.targetKind));
  const contractModelChoice = agentContract?.targetKind === "model-choice";
  const docsLike = contractOfficialDocs || hasAny(normalizedQuery, [" docs", " documentation", " api", " reference", " guide", " schema", " manual", " readme "]) || normalizedQuery.startsWith("docs ") || normalizedQuery.includes("docs/");
  const githubLike = hasAny(normalizedQuery, ["github", "repo", "repository", "pull request", "issue", "commit", "branch", "source code", "readme"]);
  const modelLike = contractModelChoice || hasAny(normalizedQuery, ["huggingface", "hf-mirror", "modelscope", "checkpoint", "weights", "model card", "safetensors", "gguf", "onnx", "mlx", "int8", "8bit", "4bit", "quant", "quantized"]);
  const packageLike = hasAny(normalizedQuery, ["pypi", "npm", "package", "library", "sdk", "module", "plugin", "crate"]);
  const dockerLike = hasAny(normalizedQuery, ["docker", "container", "image", "helm"]);
  const officialLike = contractOfficialDocs || agentContract?.sourceTrust === "official-first" || hasAny(normalizedQuery, ["official", "upstream", "vendor", "maintainer"]);
  const sourceMentions = uniqueStrings([
    normalizedQuery.includes("huggingface") ? "huggingface" : "",
    normalizedQuery.includes("hf-mirror") ? "hf-mirror" : "",
    normalizedQuery.includes("modelscope") ? "modelscope" : "",
    normalizedQuery.includes("github") ? "github" : "",
    normalizedQuery.includes("pypi") ? "pypi" : "",
    normalizedQuery.includes("npm") ? "npm" : "",
  ]);

  let mode: Exclude<SearchMode, "auto"> = "general";
  if (requestedMode && requestedMode !== "auto") {
    mode = requestedMode;
  } else if (contractModelChoice) {
    mode = "models";
  } else if (contractOfficialDocs) {
    mode = "official-docs";
  } else if (modelLike || sourceMentions.some((item) => ["huggingface", "hf-mirror", "modelscope"].includes(item))) {
    mode = "models";
  } else if (githubLike || sourceMentions.includes("github")) {
    mode = "github";
  } else if (docsLike || officialLike) {
    mode = "official-docs";
  } else if (packageLike || requestedCategory === "it") {
    mode = "packages";
  }

  return {
    mode,
    tokens,
    normalizedQuery,
    docsLike,
    githubLike,
    modelLike,
    packageLike,
    dockerLike,
    officialLike,
    sourceMentions,
    agentContract,
  };
}

function selectAdaptiveHybridProfile(intent: SearchIntent, requestedCategory?: SearchCategory): AdaptiveHybridProfile {
  const query = intent.normalizedQuery;
  const mediaLike = requestedCategory === "videos" || requestedCategory === "images" || hasAny(query, [" video", " videos", " youtube", " youtu", " bilibili", " up主", " 博主", " creator", " stream", " tutorial", " demo"]);
  const localLike = hasAny(query, [" near me", " nearby", " where to", " best ", " recommendation", " recommend", " cafe", " coffee", " restaurant", " hotel", " neighborhood", " map", " xiaohongshu", " dianping", " amap", " 探店", " 推荐", " 附近", " 咖啡", " 咖啡店", " 餐厅", " 酒店", " 攻略", " 大众点评", " 小红书"]);
  const troubleshootingLike = hasAny(query, [" error", " failed", " failing", " fix", " issue", " bug", " missing", " stack trace", " exception", " install failed", " troubleshooting", " can’t", " cannot", " not working", " 怎么办", " 报错", " 失败", " 缺少", " 无法", " 修复"]);
  const newsLike = requestedCategory === "news" || hasAny(query, [" breaking", " latest", " today", " this week", " march ", " april ", " reuters", " ap news", " headline", " news", " update", " market wrap", " 快讯", " 头条", " 最新"]);
  const financeLike = hasAny(query, [" market cap", " valuation", " revenue", " profit", " earnings", " stock", " stocks", " bond", " bonds", " fed", " ecb", " boj", " tariff", " tariffs", " oil", " salary", " worth", " financing", " amount", " 多少钱", " 市值", " 营收", " 融资", " 工资", " 薪资"]);
  const scienceLike = hasAny(query, [" why does", " how does", " explain", " science", " physics", " biology", " chemistry", " climate", " nasa", " aurora", " vaccine", " genome", " space", " 科普", " 原理", " 为什么", " 怎么"]);
  const entertainmentLike = hasAny(query, [" meme", " meaning", " rumor", " gossip", " celebrity", " anime", " manga", " movie", " film", " tv", " series", " episode", " cast", " soundtrack", " game", " gaming", " ending", " explained", " 剧", " 电影", " 综艺", " 八卦", " 绯闻", " 动漫", " 游戏", " 番剧", " 演员"]);
  const workLike = hasAny(query, [" interview", " recruiter", " job", " workflow", " process", " company", " team", " product manager", " design doc", " tool stack", " ats", " resume", " interview loop", " jd", " 面试", " 招聘", " 公司", " 团队", " 工作流", " 简历"]);

  const choose = (bucket: AdaptiveBucket) => ({
    bucket,
    ...V13_PROFILE_PRESETS[bucket],
  });

  switch (intent.mode) {
    case "official-docs":
      return choose("guarded-official-docs");
    case "github":
      return choose("guarded-github");
    case "models":
      return choose("guarded-models");
    case "packages":
      return choose("guarded-packages");
    default:
      break;
  }

  if (troubleshootingLike) return choose("troubleshooting");
  if (localLike) return choose("local-discovery");
  if (mediaLike) return choose("media-creator");
  if (newsLike) return choose("news-current");
  if (workLike) return choose("work-company-tooling");
  if (financeLike) return choose("finance-amount");
  if (scienceLike) return choose("science-knowledge");
  if (entertainmentLike) return choose("culture-entertainment");
  if (intent.docsLike || intent.githubLike || intent.modelLike || intent.packageLike) return choose("broad-technical");
  if (intent.tokens.length <= 3 || intent.sourceMentions.length === 0) return choose("ambiguous-short");
  return choose("broad-general");
}

function resolveQueryCategories(requestedCategory: SearchCategory | undefined, intent: SearchIntent) {
  if (requestedCategory === "images" || requestedCategory === "videos" || requestedCategory === "news") {
    return [requestedCategory];
  }
  if (requestedCategory === "general") {
    return ["general"];
  }
  if (intent.mode === "models") {
    return uniqueStrings([requestedCategory ?? "it", "general"]).slice(0, MAX_QUERY_CATEGORIES) as SearchCategory[];
  }
  if (intent.mode === "github" || intent.mode === "packages") {
    return uniqueStrings([requestedCategory ?? "it", "general"]).slice(0, MAX_QUERY_CATEGORIES) as SearchCategory[];
  }
  if (requestedCategory) {
    return [requestedCategory];
  }
  return ["general"];
}

function resolveQueryCategoriesV14(intent: SearchIntent, requestedCategory: SearchCategory | undefined, profile: AdaptiveHybridProfile) {
  if (requestedCategory === "images" || requestedCategory === "videos" || requestedCategory === "news") {
    return [requestedCategory];
  }
  if (requestedCategory === "it") {
    return ["it", "general"];
  }
  if (requestedCategory === "general" || !requestedCategory) {
    switch (profile.bucket) {
      case "guarded-official-docs":
      case "guarded-github":
      case "guarded-models":
      case "guarded-packages":
      case "troubleshooting":
      case "broad-technical":
        return ["it", "general"];
      case "news-current":
      case "finance-amount":
        return ["news", "general"];
      case "media-creator":
        return ["videos", "general"];
      default:
        return ["general"];
    }
  }
  return [requestedCategory];
}

function buildRetrievalPlanV14(
  query: string,
  intent: SearchIntent,
  requestedCategory: SearchCategory | undefined,
  language: string,
): RetrievalPlan {
  const profile = selectAdaptiveHybridProfile(intent, requestedCategory);
  const categoriesQueried = resolveQueryCategoriesV14(intent, requestedCategory, profile).slice(0, MAX_QUERY_CATEGORIES) as SearchCategory[];
  const variants: RetrievalVariant[] = [
    {
      query: query.trim(),
      categories: categoriesQueried,
      rationale: ["original-query"],
    },
  ];
  const addVariant = (fragments: string[], rationale: string[]) => {
    const rewritten = appendMissingFragments(query, fragments);
    if (!rewritten || normalizeText(rewritten) === normalizeText(query)) {
      return;
    }
    variants.push({
      query: rewritten,
      categories: categoriesQueried,
      rationale,
    });
  };
  const zhLike = language.toLowerCase().startsWith("zh");
  const docsTroubleshootingLike =
    profile.bucket === "guarded-official-docs" &&
    hasAny(intent.normalizedQuery, [
      " error",
      " failed",
      " failure",
      " fix",
      " install",
      " setup",
      " missing",
      " workaround",
      " troubleshooting",
      " issue",
      " 报错",
      " 失败",
      " 修复",
      " 安装",
      " 缺失",
      " 故障",
    ]);

  switch (profile.bucket) {
    case "guarded-official-docs":
      addVariant(
        docsTroubleshootingLike
          ? (zhLike ? ["故障排查", "安装", "指南"] : ["troubleshooting", "install", "guide"])
          : (zhLike ? ["官方", "文档", "API"] : ["official docs", "api reference"]),
        docsTroubleshootingLike
          ? ["docs-rewrite", "troubleshooting-guide"]
          : ["docs-rewrite", "official-docs"],
      );
      break;
    case "guarded-github":
      addVariant(zhLike ? ["GitHub", "仓库", "README"] : ["github repository", "readme"], ["github-rewrite", "code-source"]);
      break;
    case "guarded-models":
      addVariant(
        zhLike ? ["模型卡", "下载"] : ["model card", "download"],
        ["models-rewrite", "model-artifact-discovery"],
      );
      break;
    case "guarded-packages":
      addVariant(
        zhLike ? ["官方", "包", "npm", "github"] : ["official package", "npm", "github"],
        ["packages-rewrite", "registry-and-source"],
      );
      break;
    case "troubleshooting":
      addVariant(
        zhLike ? ["报错", "修复", "官方文档"] : ["error fix", "official docs"],
        ["troubleshooting-rewrite", "fix-oriented"],
      );
      break;
    case "news-current":
      addVariant(
        zhLike ? ["最新", "进展", "新闻"] : ["latest update", "news"],
        ["news-rewrite", "freshness"],
      );
      break;
    case "finance-amount":
      addVariant(
        zhLike ? ["最新", "估值", "融资金额"] : ["latest valuation", "funding amount"],
        ["finance-rewrite", "amount-and-freshness"],
      );
      break;
    case "science-knowledge":
      addVariant(
        zhLike ? ["科普", "原理", "解释"] : ["science explanation"],
        ["science-rewrite", "explanatory"],
      );
      break;
    case "media-creator":
      addVariant(
        zhLike ? ["视频", "教程", "演示", "B站"] : ["video tutorial", "demo"],
        ["media-rewrite", "video-discovery"],
      );
      break;
    case "local-discovery":
      addVariant(
        zhLike ? ["推荐", "攻略", "地图"] : ["reviews", "recommendations", "map"],
        ["local-rewrite", "discovery-breadth"],
      );
      break;
    default:
      break;
  }

  const deduped = [] as RetrievalVariant[];
  const seen = new Set<string>();
  for (const variant of variants) {
    const key = `${normalizeText(variant.query)}::${variant.categories.join(",")}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(variant);
  }

  return {
    strategy: "retrieval-first-v1.4",
    categoriesQueried,
    variants: deduped.slice(0, 2),
  };
}

function decontaminateResultsV14(
  results: SearchResult[],
  intent: SearchIntent,
  requestedCategory: SearchCategory | undefined,
  debug = false,
  options: { enablePrecisionLandingGuard?: boolean } = {},
) {
  const profile = selectAdaptiveHybridProfile(intent, requestedCategory);
  const planner = buildPlannerOutput(intent.normalizedQuery, intent, requestedCategory);
  const reasons = new Map<string, number>();
  const removedSamples: Array<{ host: string; title: string; reason: string }> = [];
  const focusTokens = salientTokens(intent.tokens);
  const matchTokens = focusTokens.length > 0 ? focusTokens : intent.tokens;
  const explicitHostLikeQuery = /(?:^|[\s(])(?:[a-z0-9-]+\.)+[a-z]{2,}(?:$|[\s)/])/i.test(intent.normalizedQuery);
  const pageSeekingIntent =
    intent.docsLike ||
    intent.githubLike ||
    intent.modelLike ||
    intent.packageLike ||
    intent.sourceMentions.length > 0;
  const precisionLandingGuard = Boolean(options.enablePrecisionLandingGuard) &&
    planner.branch === "precision-lookup" &&
    pageSeekingIntent;

  const inspected = results.map((result) => {
    const host = result.host;
    const pagePath = result.path;
    const title = normalizeText(result.title);
    const snippet = normalizeText(result.snippet);
    const engine = normalizeText(result.engine ?? "");
    const combined = `${title} ${snippet} ${host} ${pagePath}`;
    const focusMatchCount = countTokenMatches(combined, focusTokens);
    const broadMatchCount = countTokenMatches(combined, intent.tokens);
    const { resultType } = classifyResultType(result);
    const pageRole = classifyPageRole(result, resultType, []);
    const entityMatchStrength = scoreEntityMatchStrength(result, intent, []);
    const titleCoverage = titleTokenCoverage(title, matchTokens);
    const pathCoverage = titleTokenCoverage(pagePath, matchTokens);
    const sourceFitScore = scoreSourceFit(result, resultType, intent, pageRole, []);
    const dockerNoise = (isDemotedHost(host) || engine.includes("docker")) && !intent.dockerLike;
    const seoNoise = isSeoLikeHost(host) && focusMatchCount === 0;
    const technicalHost =
      isGitHubHost(host) ||
      isModelHost(host) ||
      isPackageHost(host) ||
      looksLikeOfficialDocs(host, pagePath, result.title);
    const landingLike =
      resultType === "landing" ||
      resultType === "directory" ||
      (
        isShallowPath(pagePath) &&
        resultType !== "repo" &&
        resultType !== "package" &&
        resultType !== "issue-thread"
      );
    const explicitSourceFit =
      (intent.sourceMentions.includes("github") && isGitHubHost(host)) ||
      (intent.sourceMentions.includes("huggingface") && hostMatches(host, "huggingface.co")) ||
      (intent.sourceMentions.includes("hf-mirror") && hostMatches(host, "hf-mirror.com")) ||
      (intent.sourceMentions.includes("modelscope") && (hostMatches(host, "modelscope.cn") || hostMatches(host, "modelscope.com"))) ||
      (intent.sourceMentions.includes("pypi") && hostMatches(host, "pypi.org")) ||
      (intent.sourceMentions.includes("npm") && hostMatches(host, "npmjs.com"));
    const clearlyRelevant =
      explicitSourceFit ||
      textIncludesQueryPhrase(result.title, intent.normalizedQuery) ||
      textIncludesQueryPhrase(result.path, intent.normalizedQuery) ||
      entityMatchStrength >= 0.58 ||
      titleCoverage >= 0.72 ||
      pathCoverage >= 0.55 ||
      focusMatchCount >= Math.max(2, Math.min(matchTokens.length, 3));

    return {
      result,
      focusMatchCount,
      broadMatchCount,
      resultType,
      entityMatchStrength,
      titleCoverage,
      pathCoverage,
      dockerNoise,
      seoNoise,
      technicalHost,
      landingLike,
      explicitSourceFit,
      clearlyRelevant,
    };
  });

  const strongPageCandidateExists = precisionLandingGuard && inspected.some((item) =>
    !item.landingLike &&
    item.entityMatchStrength >= 0.38 &&
    (
      isStructuredLookupResultType(item.resultType) ||
      item.titleCoverage >= 0.55 ||
      item.pathCoverage >= 0.34 ||
      item.focusMatchCount >= Math.max(1, Math.min(matchTokens.length, 2))
    )
  );

  const preserveEntityAlignedDocsLanding = (item: typeof inspected[number]) =>
    precisionLandingGuard &&
    intent.mode === "official-docs" &&
    explicitHostLikeQuery &&
    item.landingLike &&
    item.resultType === "official-docs" &&
    item.entityMatchStrength >= 0.16 &&
    (
      item.focusMatchCount >= 1 ||
      item.titleCoverage >= 0.34 ||
      item.pathCoverage >= 0.22
    );

  const cleaned = inspected.filter((item) => {
    let reason = "";
    if (item.dockerNoise && item.focusMatchCount === 0) {
      reason = "docker-noise";
    } else if (item.seoNoise && profile.bucket !== "culture-entertainment") {
      reason = "seo-noise";
    } else if (
      (profile.bucket === "news-current" || profile.bucket === "finance-amount" || profile.bucket === "local-discovery" || profile.bucket === "media-creator") &&
      item.technicalHost &&
      item.broadMatchCount <= 1
    ) {
      reason = "off-vertical-technical";
    } else if (
      !intent.dockerLike &&
      isDemotedHost(item.result.host) &&
      planner.branch === "broad-discovery" &&
      item.entityMatchStrength < 0.18 &&
      item.titleCoverage < 0.34 &&
      item.pathCoverage < 0.24
    ) {
      reason = "demoted-host-low-confidence";
    } else if (
      precisionLandingGuard &&
      strongPageCandidateExists &&
      item.landingLike &&
      !preserveEntityAlignedDocsLanding(item) &&
      !item.explicitSourceFit &&
      !item.clearlyRelevant &&
      (item.technicalHost || item.dockerNoise || isShallowPath(item.result.path)) &&
      item.focusMatchCount <= 1 &&
      (item.resultType === "directory" || item.pathCoverage < 0.34)
    ) {
      reason = "off-intent-technical-landing";
    }

    if (!reason) {
      return true;
    }
    reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
    if (debug && removedSamples.length < 6) {
      removedSamples.push({
        host: item.result.host,
        title: item.result.title,
        reason,
      });
    }
    return false;
  }).map((item) => item.result);

  const reasonCounts = Object.fromEntries([...reasons.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  return {
    results: cleaned,
    summary: {
      inputCandidates: results.length,
      removedCount: results.length - cleaned.length,
      outputCandidates: cleaned.length,
      reasonCounts,
      removedSamples: debug ? removedSamples : undefined,
    } satisfies DecontaminationSummary,
  };
}

async function collectSearchCandidates(
  cfg: any,
  params: {
    query: string;
    category?: SearchCategory;
    language: string;
    safeSearch: number;
    limit: number;
    mode?: SearchMode;
    rerankVersion: RerankVersion;
    debug?: boolean;
    agentContract?: AgentSearchContract | null;
  },
) {
  const requestedCategory = params.category;
  const requestedMode = typeof params.mode === "string" ? params.mode : cfg.defaultMode;
  const intent = detectQueryIntent(params.query, requestedMode, requestedCategory, params.agentContract);
  const baselineCategories = resolveQueryCategories(requestedCategory, intent);
  const perCategoryLimit = Math.max(params.limit * 2, 10);

  if (!isRetrievalFirstRerankVersion(params.rerankVersion)) {
    const groups = [] as Array<{ category: SearchCategory; raw: any; results: SearchResult[] }>;
    for (const category of baselineCategories) {
      groups.push(await fetchSearxngCategory(cfg, {
        query: params.query,
        category,
        language: params.language,
        safeSearch: params.safeSearch,
        perCategoryLimit,
      }));
    }
    return {
      intent,
      categoriesQueried: baselineCategories,
      retrievalPlan: {
        strategy: "baseline",
        categoriesQueried: baselineCategories,
        variants: [
          {
            query: params.query,
            categories: baselineCategories,
            rationale: ["original-query"],
          },
        ],
      } satisfies RetrievalPlan,
      merged: mergeSearchResults(groups),
      decontamination: undefined,
    };
  }

  const retrievalPlanBase = buildRetrievalPlanV14(params.query, intent, requestedCategory, params.language);
  const retrievalPlan =
    params.rerankVersion === "v1.5"
      ? { ...retrievalPlanBase, strategy: "retrieval-first-v1.5" as const }
      : params.rerankVersion === "v2.0"
        ? { ...retrievalPlanBase, strategy: "retrieval-first-v2.0" as const }
        : retrievalPlanBase;
  const fetchPlan = [] as Array<{ query: string; category: SearchCategory; rationale: string[] }>;
  for (const variant of retrievalPlan.variants) {
    for (const category of variant.categories) {
      fetchPlan.push({
        query: variant.query,
        category,
        rationale: variant.rationale,
      });
    }
  }
  const groups = await Promise.all(
    fetchPlan.map((entry) => fetchSearxngCategory(cfg, {
      query: entry.query,
      category: entry.category,
      language: params.language,
      safeSearch: params.safeSearch,
      perCategoryLimit: Math.max(params.limit + 4, 8),
    })),
  );
  const merged = mergeSearchResults(groups);
  const decontaminated = decontaminateResultsV14(
    merged.results,
    intent,
    requestedCategory,
    Boolean(params.debug),
    {
      enablePrecisionLandingGuard: isPlannerCandidateRerankVersion(params.rerankVersion),
    },
  );
  return {
    intent,
    categoriesQueried: retrievalPlan.categoriesQueried,
    retrievalPlan,
    merged: {
      ...merged,
      results: decontaminated.results,
    },
    decontamination: decontaminated.summary,
  };
}

async function fetchWithTimeout(url: string, opts: { timeoutMs?: number; headers?: Record<string, string> } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULTS.fetchTimeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent": "OpenClaw web-searcher plugin",
        ...(opts.headers ?? {}),
      },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSearxngCategory(cfg: any, params: { query: string; category: SearchCategory; language: string; safeSearch: number; perCategoryLimit: number; }) {
  const endpoint = new URL("/search", cfg.searxngBaseUrl.endsWith("/") ? cfg.searxngBaseUrl : `${cfg.searxngBaseUrl}/`);
  endpoint.searchParams.set("q", params.query);
  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("language", params.language);
  endpoint.searchParams.set("pageno", "1");
  endpoint.searchParams.set("safesearch", String(params.safeSearch));
  endpoint.searchParams.set("categories", params.category);

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetchWithTimeout(endpoint.toString(), { timeoutMs: cfg.fetchTimeoutMs });
      if (!res.ok) {
        throw new Error(`SearXNG returned ${res.status} ${res.statusText}`);
      }
      const raw = await res.json();
      return {
        category: params.category,
        raw,
        results: normalizeSearchResults(raw, params.perCategoryLimit, params.category),
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`SearXNG search failed for ${params.category}`);
}

function mergeSearchResults(groups: Array<{ category: SearchCategory; raw: any; results: SearchResult[] }>) {
  const merged = new Map<string, SearchResult>();
  const unresponsive = new Set<string>();
  const suggestions = new Set<string>();
  let runningRank = 0;

  for (const group of groups) {
    for (const item of Array.isArray(group.raw?.unresponsive_engines) ? group.raw.unresponsive_engines : []) {
      if (typeof item === "string") {
        unresponsive.add(item);
      }
    }
    for (const suggestion of Array.isArray(group.raw?.suggestions) ? group.raw.suggestions : []) {
      if (typeof suggestion === "string") {
        suggestions.add(suggestion);
      }
    }

    for (const result of group.results) {
      runningRank += 1;
      const key = canonicalizeUrl(result.url) || `${group.category}:${result.title}:${runningRank}`;
      if (!merged.has(key)) {
        merged.set(key, {
          ...result,
          originalRank: runningRank,
          categories: uniqueStrings(result.categories),
        });
        continue;
      }
      const existing = merged.get(key)!;
      existing.categories = uniqueStrings([...existing.categories, ...result.categories]);
      if (!existing.snippet && result.snippet) {
        existing.snippet = result.snippet;
      }
      if (!existing.title && result.title) {
        existing.title = result.title;
      }
      if (!existing.engine && result.engine) {
        existing.engine = result.engine;
      }
      if (!existing.publishedDate && result.publishedDate) {
        existing.publishedDate = result.publishedDate;
      }
      existing.originalRank = Math.min(existing.originalRank, runningRank);
    }
  }

  return {
    results: [...merged.values()],
    unresponsiveEngines: [...unresponsive],
    suggestions: [...suggestions],
  };
}

function pushSignal(signals: string[], label: string, score: number) {
  if (score !== 0) {
    signals.push(`${label}:${score > 0 ? "+" : ""}${score.toFixed(2)}`);
  }
}

function scoreResult(result: SearchResult, intent: SearchIntent) {
  const signals: string[] = [];
  const title = normalizeText(result.title);
  const snippet = normalizeText(result.snippet);
  const host = result.host;
  const pagePath = result.path;
  const engine = normalizeText(result.engine ?? "");
  const query = intent.normalizedQuery;

  let score = 0;
  const add = (value: number, label: string) => {
    score += value;
    pushSignal(signals, label, value);
  };

  if (query && textIncludesQueryPhrase(title, query)) {
    add(7.5, "title-phrase");
  } else if (query && textIncludesQueryPhrase(snippet, query)) {
    add(3.0, "snippet-phrase");
  }

  const titleMatches = countTokenMatches(title, intent.tokens);
  const snippetMatches = countTokenMatches(snippet, intent.tokens);
  const hostMatchesCount = countTokenMatches(host, intent.tokens);
  const pathMatches = countTokenMatches(pagePath, intent.tokens);

  add(Math.min(6, titleMatches * 1.8), "title-tokens");
  add(Math.min(3, snippetMatches * 0.7), "snippet-tokens");
  add(Math.min(2.5, hostMatchesCount * 1.2), "host-tokens");
  add(Math.min(2.5, pathMatches * 0.9), "path-tokens");
  add(Math.max(0, 2.2 - (result.originalRank - 1) * 0.12), "base-rank");

  const githubHost = isGitHubHost(host);
  const modelHost = isModelHost(host);
  const packageHost = isPackageHost(host);
  const docsHost = looksLikeOfficialDocs(host, pagePath, result.title);
  const dockerHost = isDemotedHost(host);
  const seoHost = isSeoLikeHost(host);

  if (dockerHost && !intent.dockerLike) {
    add(-7, "demote-docker");
  }
  if (seoHost) {
    add(-2.5, "demote-seo");
  }
  if (hostMatches(host, "wikipedia.org") && intent.mode !== "general") {
    add(-1.5, "demote-wikipedia");
  }

  if (intent.sourceMentions.includes("github") && githubHost) {
    add(5.5, "explicit-github");
  }
  if (intent.sourceMentions.includes("huggingface") && hostMatches(host, "huggingface.co")) {
    add(6.5, "explicit-hf");
  }
  if (intent.sourceMentions.includes("hf-mirror") && hostMatches(host, "hf-mirror.com")) {
    add(6.5, "explicit-hf-mirror");
  }
  if (intent.sourceMentions.includes("modelscope") && (hostMatches(host, "modelscope.cn") || hostMatches(host, "modelscope.com"))) {
    add(6.5, "explicit-modelscope");
  }
  if (intent.sourceMentions.includes("pypi") && hostMatches(host, "pypi.org")) {
    add(5.0, "explicit-pypi");
  }
  if (intent.sourceMentions.includes("npm") && hostMatches(host, "npmjs.com")) {
    add(5.0, "explicit-npm");
  }

  for (const signal of brandOfficialSignals(intent, host)) {
    add(signal.score, signal.label);
  }

  switch (intent.mode) {
    case "models":
      if (modelHost) add(7.0, "mode-models-domain");
      if (githubHost) add(2.4, "mode-models-github");
      if (packageHost) add(1.2, "mode-models-package");
      if (hasAny(title + " " + snippet + " " + pagePath, ["8bit", "4bit", "int8", "mlx", "quant", "quantized", "checkpoint", "model card", "safetensors", "onnx"])) {
        add(2.0, "mode-models-keywords");
      }
      break;
    case "github":
      if (githubHost) add(8.0, "mode-github-domain");
      if (engine.includes("github")) add(2.5, "mode-github-engine");
      if (pagePath.includes("/blob/") || pagePath.includes("/tree/") || pagePath.includes("/issues/") || pagePath.includes("/pull/")) {
        add(1.8, "mode-github-path");
      }
      break;
    case "packages":
      if (hostMatches(host, "pypi.org") || hostMatches(host, "npmjs.com")) add(6.5, "mode-packages-domain");
      if (githubHost) add(2.0, "mode-packages-github");
      if (engine.includes("pypi") || engine.includes("npm")) add(2.0, "mode-packages-engine");
      if (engine.includes("docker") && !intent.dockerLike) add(-3.5, "mode-packages-docker");
      break;
    case "official-docs":
      if (docsHost) add(6.5, "mode-docs-domain");
      if (!docsHost && !githubHost) add(-2.0, "mode-docs-nondoc");
      if (githubHost && pagePath.includes("readme")) add(2.0, "mode-docs-readme");
      if (intent.officialLike && docsHost) add(1.5, "mode-docs-official");
      break;
    case "general":
      if (docsHost && intent.docsLike) add(2.0, "general-docs-hint");
      if (githubHost && intent.githubLike) add(2.0, "general-github-hint");
      if (modelHost && intent.modelLike) add(2.5, "general-model-hint");
      break;
  }

  return {
    score,
    signals,
  };
}

function rerankResultsV11(results: SearchResult[], intent: SearchIntent, debug = false) {
  return results
    .map((result) => {
      const { score, signals } = scoreResult(result, intent);
      return {
        ...result,
        score: Number(score.toFixed(3)),
        signals,
      };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.originalRank - b.originalRank)
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      signals: debug ? result.signals : undefined,
    }));
}

function rerankResults(results: SearchResult[], intent: SearchIntent, limit: number, debug = false) {
  return ensureWithinLimit(rerankResultsV11(results, intent, debug), limit);
}

function rerankStrategyLabel(version: RerankVersion) {
  switch (version) {
    case "v1.0":
      return "raw-searxng-v1.0";
    case "v1.2":
      return "heuristic-hybrid+snippet-embedding-v1.2";
    case "v1.3":
      return "adaptive-hybrid-v1.3";
    case "v1.4":
      return "retrieval-first-adaptive-v1.4";
    case "v1.5":
      return "retrieval-first-planner-v1.5";
    case "v2.0":
      return "baseline-preserving-hybrid-v2.0";
    case "v1.1":
    default:
      return "heuristic-hybrid-v1.1";
  }
}

function resolveRequestedRerankVersion(value: unknown): RerankVersion | undefined {
  return isSupportedRerankVersion(value) ? value : undefined;
}

function resolveEffectiveRerankVersion(cfg: any, params: { rerank?: boolean; rerankVersion?: unknown }) {
  const explicitVersion = resolveRequestedRerankVersion(params.rerankVersion);
  if (explicitVersion) {
    return explicitVersion;
  }
  if (typeof params.rerank === "boolean") {
    return params.rerank ? cfg.defaultRerankVersion : "v1.0";
  }
  return cfg.rerankEnabled ? cfg.defaultRerankVersion : "v1.0";
}

function dotProduct(a: number[], b: number[]) {
  const size = Math.min(a.length, b.length);
  let sum = 0;
  for (let index = 0; index < size; index += 1) {
    sum += a[index] * b[index];
  }
  return sum;
}

function cosineSimilarity(a: number[], b: number[]) {
  let normA = 0;
  let normB = 0;
  const size = Math.min(a.length, b.length);
  for (let index = 0; index < size; index += 1) {
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  if (normA > 0 && normB > 0) {
    return dotProduct(a, b) / (Math.sqrt(normA) * Math.sqrt(normB));
  }
  return dotProduct(a, b);
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function compressPriorTowardNeutral(value: number, strength: number) {
  const clampedValue = clamp01(value);
  const clampedStrength = clamp01(strength);
  return Number((0.5 + ((clampedValue - 0.5) * clampedStrength)).toFixed(4));
}

function resolveOpenClawPackageRoot() {
  const candidate = path.resolve(process.execPath, "..", "..", "lib", "node_modules", "openclaw");
  return candidate;
}

async function ensureThreadBindingsExportModule() {
  const packageRoot = resolveOpenClawPackageRoot();
  const pluginSdkDir = path.join(packageRoot, "dist", "plugin-sdk");
  const dependencyRoot = path.join(packageRoot, "node_modules");
  const entries = await fs.readdir(pluginSdkDir);
  const threadBindingsFile = entries.find((entry) => /^thread-bindings-.*\.js$/.test(entry));
  if (!threadBindingsFile) {
    throw new Error(`Unable to locate thread-bindings chunk under ${pluginSdkDir}`);
  }

  const sourcePath = path.join(pluginSdkDir, threadBindingsFile);
  const exportDir = path.join(os.tmpdir(), "openclaw-web-searcher-plugin-sdk");
  const exportPath = path.join(exportDir, `${threadBindingsFile.replace(/\.js$/, "")}-embedding-export.mjs`);

  let shouldWrite = true;
  try {
    const [sourceStat, exportStat] = await Promise.all([fs.stat(sourcePath), fs.stat(exportPath)]);
    shouldWrite = sourceStat.mtimeMs > exportStat.mtimeMs;
    if (!shouldWrite) {
      const existing = await fs.readFile(exportPath, "utf8");
      shouldWrite = !existing.includes("web-searcher-cpu-embed");
    }
  } catch {
    shouldWrite = true;
  }

  await fs.mkdir(exportDir, { recursive: true });
  try {
    await fs.symlink(dependencyRoot, path.join(exportDir, "node_modules"), "dir");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
      throw error;
    }
  }

  if (shouldWrite) {
    const pluginSdkUrl = new URL(`${pluginSdkDir.replace(/\/$/, "")}/`, `file://`);
    let source = await fs.readFile(sourcePath, "utf8");
    source = source
      .replace(/from\s+"\.\//g, `from \"${pluginSdkUrl.href}`)
      .replace(/from\s+'\.\//g, `from '${pluginSdkUrl.href}`)
      .replace(/import\(\s*"\.\//g, `import(\"${pluginSdkUrl.href}`)
      .replace(/import\(\s*'\.\//g, `import('${pluginSdkUrl.href}`)
      .replace(
        "if (!llama) llama = await getLlama({ logLevel: LlamaLogLevel.error });",
        "if (!llama) llama = await getLlama({ logLevel: LlamaLogLevel.error, gpu: false });",
      );
    source += "\n// web-searcher-cpu-embed\nexport { createEmbeddingProvider };\n";
    await fs.writeFile(exportPath, source, "utf8");
  }

  return exportPath;
}

function resolveLocalEmbeddingModelPath(cfg: any) {
  if (typeof cfg.embeddingModelPath === "string" && cfg.embeddingModelPath.trim()) {
    return cfg.embeddingModelPath;
  }
  return DEFAULT_LOCAL_EMBEDDING_MODEL_PATH;
}

async function getLocalEmbeddingProvider(cfg: any) {
  if (!localEmbeddingProviderPromise) {
    localEmbeddingProviderPromise = (async () => {
      const modelPath = resolveLocalEmbeddingModelPath(cfg);
      const nodeLlamaIndexPath = path.join(path.dirname(resolveOpenClawPackageRoot()), "node-llama-cpp", "dist", "index.js");
      let mod: any;
      try {
        mod = await import(`${pathToFileURL(nodeLlamaIndexPath).href}?mtime=${Date.now()}`);
      } catch {
        return null;
      }

      const { getLlama, resolveModelFile, LlamaLogLevel } = mod;
      let llama: any = null;
      let embeddingModel: any = null;
      let embeddingContext: any = null;
      let initPromise: Promise<any> | null = null;
      let initError: Error | null = null;

      const sanitizeAndNormalizeEmbedding = (vector: number[]) => {
        const cleaned = vector.map((value) => Number.isFinite(value) ? value : 0);
        const norm = Math.sqrt(cleaned.reduce((sum, value) => sum + (value * value), 0));
        if (norm > 0) {
          return cleaned.map((value) => Number((value / norm).toFixed(8)));
        }
        return cleaned;
      };

      const ensureContext = async () => {
        if (embeddingContext) {
          return embeddingContext;
        }
        if (initError) {
          throw initError;
        }
        if (initPromise) {
          return initPromise;
        }
        initPromise = (async () => {
          try {
            if (!llama) {
              llama = await getLlama({ logLevel: LlamaLogLevel.error, gpu: false });
            }
            if (!embeddingModel) {
              const resolvedModelPath = await resolveModelFile(modelPath || DEFAULT_LOCAL_EMBEDDING_MODEL_REF);
              embeddingModel = await llama.loadModel({ modelPath: resolvedModelPath });
            }
            if (!embeddingContext) {
              embeddingContext = await embeddingModel.createEmbeddingContext();
            }
            return embeddingContext;
          } catch (error) {
            initPromise = null;
            initError = error instanceof Error ? error : new Error(String(error));
            throw initError;
          }
        })();
        return initPromise;
      };

      return {
        provider: {
          id: "local",
          model: modelPath,
          embedQuery: async (text: string) => {
            const embedding = await (await ensureContext()).getEmbeddingFor(text);
            return sanitizeAndNormalizeEmbedding(Array.from(embedding.vector));
          },
          embedBatch: async (texts: string[]) => {
            const context = await ensureContext();
            const vectors = await Promise.all(texts.map(async (text) => {
              const embedding = await context.getEmbeddingFor(text);
              return sanitizeAndNormalizeEmbedding(Array.from(embedding.vector));
            }));
            return vectors;
          },
        },
        modulePath: nodeLlamaIndexPath,
      };
    })();
  }
  return await localEmbeddingProviderPromise;
}

function snippetTextForEmbedding(result: SearchResult) {
  const snippet = result.snippet?.trim();
  if (snippet) {
    return snippet;
  }
  const title = result.title?.trim();
  if (title) {
    return title;
  }
  return result.url;
}

function adaptiveTextForEmbedding(result: SearchResult) {
  const title = result.title?.trim();
  const snippet = result.snippet?.trim();
  if (title && snippet) {
    return `${title}. ${snippet}`;
  }
  return snippet || title || result.url;
}

function minMaxNormalize(values: number[]) {
  if (values.length === 0) {
    return [];
  }
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = Math.max(0.0001, maxValue - minValue);
  return values.map((value) => Number(((value - minValue) / range).toFixed(4)));
}

function hashSemanticFeature(input: string) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashedSemanticVector(text: string, size = FALLBACK_SEMANTIC_VECTOR_SIZE) {
  const normalized = normalizeText(text).replace(/\s+/g, " ").trim();
  const vector = new Array(size).fill(0);
  const compact = normalized.replace(/\s+/g, " ");
  const tokenFeatures = tokenize(normalized);
  for (const token of tokenFeatures) {
    const hash = hashSemanticFeature(`tok:${token}`);
    const sign = (hashSemanticFeature(`sign:${token}`) & 1) === 0 ? -1 : 1;
    const weight = token.length >= 8 ? 1.35 : token.length >= 5 ? 1.15 : 1;
    vector[hash % size] += sign * weight;
  }
  for (let index = 0; index < compact.length - 2; index += 1) {
    const ngram = compact.slice(index, index + 3);
    if (!ngram.trim()) {
      continue;
    }
    const hash = hashSemanticFeature(`tri:${ngram}`);
    const sign = (hashSemanticFeature(`trisign:${ngram}`) & 1) === 0 ? -1 : 1;
    vector[hash % size] += sign * 0.28;
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + (value * value), 0));
  if (norm > 0) {
    return vector.map((value) => Number((value / norm).toFixed(8)));
  }
  return vector;
}

function buildFallbackSemanticEmbeddings(
  query: string,
  texts: string[],
  reason: string,
  providerEntry?: { provider: { model: string }; modulePath: string } | null,
) {
  return {
    queryVec: hashedSemanticVector(query),
    snippetVecs: texts.map((text) => hashedSemanticVector(text)),
    embedding: {
      attempted: true,
      applied: true,
      fallback: "hashed-ngram",
      reason,
      model: providerEntry?.provider?.model ?? "fallback-hashed-ngram",
      modulePath: providerEntry?.modulePath,
    },
  };
}

async function rerankResultsV12(cfg: any, results: SearchResult[], intent: SearchIntent, debug = false) {
  const v11 = rerankResultsV11(results, intent, true);
  const providerEntry = await getLocalEmbeddingProvider(cfg);
  const texts = v11.map((result) => snippetTextForEmbedding(result));
  let queryVec: number[];
  let snippetVecs: number[][];
  let embeddingInfo: Record<string, unknown>;
  if (!providerEntry?.provider) {
    const fallback = buildFallbackSemanticEmbeddings(intent.normalizedQuery, texts, "Local embedding provider unavailable");
    queryVec = fallback.queryVec;
    snippetVecs = fallback.snippetVecs;
    embeddingInfo = fallback.embedding;
  } else {
    try {
      queryVec = await providerEntry.provider.embedQuery(intent.normalizedQuery);
      snippetVecs = await providerEntry.provider.embedBatch(texts);
      embeddingInfo = {
        attempted: true,
        applied: true,
        model: providerEntry.provider.model,
        modulePath: providerEntry.modulePath,
      };
    } catch (error) {
      const fallback = buildFallbackSemanticEmbeddings(
        intent.normalizedQuery,
        texts,
        error instanceof Error ? error.message : String(error),
        providerEntry,
      );
      queryVec = fallback.queryVec;
      snippetVecs = fallback.snippetVecs;
      embeddingInfo = fallback.embedding;
    }
  }

  try {
    const v11Scores = v11.map((result) => typeof result.score === "number" ? result.score : 0);
    const maxV11Score = Math.max(...v11Scores);
    const minV11Score = Math.min(...v11Scores);
    const v11ScoreRange = Math.max(0.0001, maxV11Score - minV11Score);

    const reranked = v11
      .map((result, index) => {
        const embeddingSimilarity = Number(cosineSimilarity(queryVec, snippetVecs[index]).toFixed(4));
        const heuristicPrior = Number((((typeof result.score === "number" ? result.score : minV11Score) - minV11Score) / v11ScoreRange).toFixed(4));
        const score = Number(((embeddingSimilarity * V12_EMBEDDING_WEIGHT) + (heuristicPrior * V12_HEURISTIC_PRIOR_WEIGHT)).toFixed(4));
        const signals = debug
          ? [
              ...(result.signals ?? []),
              `snippet-embedding:${embeddingSimilarity.toFixed(4)}`,
              `v1.1-normalized-prior:${heuristicPrior.toFixed(4)}`,
              `v1.2-score:${score.toFixed(4)}`,
            ]
          : undefined;
        return {
          ...result,
          score,
          signals,
          embeddingSimilarity,
        };
      })
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || (b.embeddingSimilarity ?? 0) - (a.embeddingSimilarity ?? 0) || (a.rank ?? 999) - (b.rank ?? 999) || a.originalRank - b.originalRank)
      .map((result, index) => ({
        ...result,
        rank: index + 1,
        signals: debug ? result.signals : undefined,
      }));

    return {
      results: reranked,
      embedding: embeddingInfo,
    };
  } catch (error) {
    return {
      results: v11.map((result) => ({
        ...result,
        signals: debug ? result.signals : undefined,
      })),
      embedding: {
        attempted: true,
        applied: false,
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

async function rerankResultsV13(
  cfg: any,
  results: SearchResult[],
  intent: SearchIntent,
  requestedCategory?: SearchCategory,
  debug = false,
) {
  const v11 = rerankResultsV11(results, intent, true);
  const providerEntry = await getLocalEmbeddingProvider(cfg);
  const profile = selectAdaptiveHybridProfile(intent, requestedCategory);
  const texts = v11.map((result) => adaptiveTextForEmbedding(result));
  let queryVec: number[];
  let snippetVecs: number[][];
  let embeddingInfo: Record<string, unknown>;
  if (!providerEntry?.provider) {
    const fallback = buildFallbackSemanticEmbeddings(intent.normalizedQuery, texts, "Local embedding provider unavailable");
    queryVec = fallback.queryVec;
    snippetVecs = fallback.snippetVecs;
    embeddingInfo = { ...fallback.embedding, profile };
  } else {
    try {
      queryVec = await providerEntry.provider.embedQuery(intent.normalizedQuery);
      snippetVecs = await providerEntry.provider.embedBatch(texts);
      embeddingInfo = {
        attempted: true,
        applied: true,
        model: providerEntry.provider.model,
        modulePath: providerEntry.modulePath,
        profile,
      };
    } catch (error) {
      const fallback = buildFallbackSemanticEmbeddings(
        intent.normalizedQuery,
        texts,
        error instanceof Error ? error.message : String(error),
        providerEntry,
      );
      queryVec = fallback.queryVec;
      snippetVecs = fallback.snippetVecs;
      embeddingInfo = { ...fallback.embedding, profile };
    }
  }

  try {
    const v11Scores = v11.map((result) => typeof result.score === "number" ? result.score : 0);
    const heuristicPriors = minMaxNormalize(v11Scores);
    const semanticRaw = snippetVecs.map((vector) => Number(cosineSimilarity(queryVec, vector).toFixed(4)));
    const semanticScores = minMaxNormalize(semanticRaw);

    const guardedProfile = profile.bucket.startsWith("guarded-") || profile.bucket === "troubleshooting";
    const reranked = v11
      .map((result, index) => {
        const rawHeuristicPrior = heuristicPriors[index];
        const heuristicPrior = compressPriorTowardNeutral(rawHeuristicPrior, profile.priorStrength);
        const embeddingSimilarity = semanticRaw[index];
        const semanticScore = semanticScores[index];
        const score = Number(((semanticScore * profile.semanticWeight) + (heuristicPrior * profile.heuristicWeight)).toFixed(4));
        const signals = debug
          ? [
              ...(result.signals ?? []),
              `v1.3-bucket:${profile.bucket}`,
              `v1.3-semantic-weight:${profile.semanticWeight.toFixed(2)}`,
              `v1.3-heuristic-weight:${profile.heuristicWeight.toFixed(2)}`,
              `v1.3-prior-strength:${profile.priorStrength.toFixed(2)}`,
              `adaptive-embedding:${embeddingSimilarity.toFixed(4)}`,
              `adaptive-semantic-score:${semanticScore.toFixed(4)}`,
              `adaptive-raw-prior:${rawHeuristicPrior.toFixed(4)}`,
              `adaptive-prior:${heuristicPrior.toFixed(4)}`,
              `v1.3-score:${score.toFixed(4)}`,
            ]
          : undefined;
        return {
          ...result,
          score,
          signals,
          embeddingSimilarity,
          semanticScore,
          heuristicPrior,
        };
      })
      .sort((a, b) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        (guardedProfile ? (b.heuristicPrior ?? 0) - (a.heuristicPrior ?? 0) : (b.semanticScore ?? 0) - (a.semanticScore ?? 0)) ||
        (a.rank ?? 999) - (b.rank ?? 999) ||
        a.originalRank - b.originalRank,
      )
      .map((result, index) => ({
        ...result,
        rank: index + 1,
        signals: debug ? result.signals : undefined,
      }));

    return {
      results: reranked,
      embedding: embeddingInfo,
      profile,
    };
  } catch (error) {
    return {
      results: v11.map((result) => ({
        ...result,
        signals: debug ? result.signals : undefined,
      })),
      embedding: {
        attempted: true,
        applied: false,
        error: error instanceof Error ? error.message : String(error),
        profile,
      },
      profile,
    };
  }
}

function resultSourceAspectFamilyV15(result: SearchResult, mode: SearchIntent["mode"]) {
  const host = normalizeText(result.host);
  if (isGitHubHost(host)) {
    return "github";
  }
  if (hostMatches(host, "huggingface.co") || hostMatches(host, "hf-mirror.com")) {
    return "huggingface";
  }
  if (hostMatches(host, "modelscope.cn") || hostMatches(host, "modelscope.com")) {
    return "modelscope";
  }
  if (hostMatches(host, "npmjs.com") || hostMatches(host, "pypi.org")) {
    return "package-registry";
  }
  if (hostMatches(host, "libraries.io") || hostMatches(host, "reactnative.directory")) {
    return "package-index";
  }
  if (hostMatches(host, "devdocs.io") || hostMatches(host, "getdocs.org")) {
    return "docs-aggregator";
  }
  const docsSurfaceLike =
    DOC_HOST_HINTS.some((hint) => hostMatches(host, hint)) ||
    hasDocsHostPrefix(host) ||
    DOC_PATH_HINTS.some((hint) => result.path.includes(hint));
  if (docsSurfaceLike) {
    return mode === "official-docs" ? "official-docs" : `docs:${host}`;
  }
  return host;
}

function rebalanceMultiSourceSlateV15(
  results: SearchResult[],
  limit: number,
  debug = false,
  options: { preserveTopN?: number; preferDistinctFamily?: boolean; preserveDuplicateFamiliesWithinTopN?: boolean; preserveDuplicateHostsWithinTopN?: boolean; mode?: SearchIntent["mode"] } = {},
) {
  if (limit <= 0 || results.length <= 2) {
    return ensureWithinLimit(results, limit).map((result, index) => ({ ...result, rank: index + 1 }));
  }

  const uniqueHostTarget = Math.min(limit, 4);
  const preserveTopN = Math.max(0, Math.min(limit, options.preserveTopN ?? 0));
  const selected: SearchResult[] = [];
  const deferred: Array<{ candidate: SearchResult; reason: string }> = [];
  const familyFor = (candidate: SearchResult) => resultSourceAspectFamilyV15(candidate, options.mode ?? "general");
  const hasHost = (candidate: SearchResult) => selected.some((item) => item.host === candidate.host);
  const hasFamily = (candidate: SearchResult) =>
    options.preferDistinctFamily ? selected.some((item) => familyFor(item) === familyFor(candidate)) : false;

  for (const candidate of results.slice(0, preserveTopN)) {
    const hostAlreadySelected = hasHost(candidate);
    const familyAlreadySelected = hasFamily(candidate);
    if ((((hostAlreadySelected && !options.preserveDuplicateHostsWithinTopN) || (familyAlreadySelected && !options.preserveDuplicateFamiliesWithinTopN))) && selected.length < uniqueHostTarget) {
      deferred.push({ candidate, reason: familyAlreadySelected ? "family-backfill" : "host-backfill" });
      continue;
    }
    selected.push({
      ...candidate,
      signals: debug ? [...(candidate.signals ?? []), 'v1.5-slate:preserved-top'] : candidate.signals,
    });
  }

  for (const candidate of results.slice(preserveTopN)) {
    const hostAlreadySelected = hasHost(candidate);
    const familyAlreadySelected = hasFamily(candidate);
    if ((hostAlreadySelected || familyAlreadySelected) && selected.length < uniqueHostTarget) {
      deferred.push({ candidate, reason: familyAlreadySelected ? "family-backfill" : "host-backfill" });
      continue;
    }
    selected.push({
      ...candidate,
      signals: debug
        ? [...(candidate.signals ?? []), `v1.5-slate:${familyAlreadySelected ? "family-backfill" : hostAlreadySelected ? "host-backfill" : "diverse-pass"}`]
        : candidate.signals,
    });
    if (selected.length >= limit) {
      break;
    }
  }

  for (const { candidate, reason } of deferred) {
    if (selected.length >= limit) {
      break;
    }
    selected.push({
      ...candidate,
      signals: debug ? [...(candidate.signals ?? []), `v1.5-slate:${reason}`] : candidate.signals,
    });
  }

  return selected.map((result, index) => ({ ...result, rank: index + 1 }));
}

function resultDiagnosticsSnapshotV15(result: SearchResult): ResultDiagnostics {
  return {
    resultType: result.resultType ?? "unknown",
    solutionLikelihood: result.solutionLikelihood ?? 0,
    entityMatchStrength: result.entityMatchStrength ?? 0,
    extractionLikelihood: result.extractionLikelihood ?? 0,
    diversityValue: result.diversityValue ?? 0,
    sourceFitScore: result.sourceFitScore ?? 0,
    pageSpecificity: result.pageSpecificity ?? 0,
    pageRole: result.pageRole ?? "unknown",
    branchAdjustment: result.plannerAdjustment ?? 0,
    why: result.why ?? [],
  } satisfies ResultDiagnostics;
}

function resultEvidenceConfidenceV15(
  result: SearchResult,
  diagnostics: ResultDiagnostics,
  intent: SearchIntent,
  planner: PlannerOutput,
) {
  let confidence =
    (diagnostics.entityMatchStrength * 0.34) +
    (diagnostics.sourceFitScore * 0.3) +
    (diagnostics.pageSpecificity * 0.16) +
    (diagnostics.extractionLikelihood * (planner.flags.extractionImportant ? 0.1 : 0.05)) +
    (diagnostics.solutionLikelihood * (planner.branch === "solution-hunt" ? 0.12 : 0.04));

  if (intent.mode === "github" && (diagnostics.resultType === "repo" || diagnostics.resultType === "issue-thread")) {
    confidence += 0.12;
  } else if (intent.mode === "packages" && diagnostics.resultType === "package") {
    confidence += 0.08;
  } else if (intent.mode === "models" && diagnostics.sourceFitScore >= 0.95) {
    confidence += 0.08;
  } else if (intent.mode === "official-docs" && diagnostics.resultType === "official-docs") {
    confidence += 0.06;
  }

  if (isDemotedHost(result.host) && !intent.dockerLike && diagnostics.pageSpecificity < 0.18) {
    confidence -= 0.08;
  }

  return Number(clamp01(confidence).toFixed(4));
}

function stabilityProfileV15(intent: SearchIntent, planner: PlannerOutput) {
  const guarded =
    intent.mode !== "general" ||
    planner.branch === "precision-lookup" ||
    planner.flags.exactEntityLikely ||
    planner.flags.solutionIntentLikely;

  return {
    enabled: guarded || planner.branch === "broad-discovery",
    guarded,
    anchorStrongTopN: guarded
      ? ((intent.mode === "github" || intent.mode === "packages" || intent.mode === "models") ? 2 : 1)
      : 0,
    anchoredConfidence: guarded ? 0.56 : 0.62,
    minPromotionConfidence: guarded ? 0.48 : 0.46,
    minScoreDelta: guarded ? 0.12 : 0.14,
    minConfidenceDelta: guarded ? 0.07 : 0.08,
    overrideScoreDelta: guarded ? 0.18 : 0.2,
    overrideConfidenceDelta: guarded ? 0.12 : 0.14,
  };
}

function canPromoteCandidateOverV15(
  candidate: SearchResult,
  previous: SearchResult,
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof stabilityProfileV15>,
) {
  const candidateDiagnostics = resultDiagnosticsSnapshotV15(candidate);
  const previousDiagnostics = resultDiagnosticsSnapshotV15(previous);
  const candidateConfidence = resultEvidenceConfidenceV15(candidate, candidateDiagnostics, intent, planner);
  const previousConfidence = resultEvidenceConfidenceV15(previous, previousDiagnostics, intent, planner);
  const scoreDelta = (candidate.score ?? 0) - (previous.score ?? 0);
  const confidenceDelta = candidateConfidence - previousConfidence;
  const previousBaselineRank = previous.rank ?? previous.originalRank;

  if (isDemotedHost(candidate.host) && !intent.dockerLike && candidateConfidence < Math.max(profile.minPromotionConfidence, 0.52)) {
    return false;
  }
  if (
    profile.guarded &&
    (candidateDiagnostics.resultType === "issue-thread" || candidateDiagnostics.resultType === "repo" || candidateDiagnostics.resultType === "package") &&
    candidateDiagnostics.entityMatchStrength >= previousDiagnostics.entityMatchStrength + 0.12 &&
    candidateDiagnostics.pageSpecificity >= previousDiagnostics.pageSpecificity + 0.08
  ) {
    return true;
  }
  if (
    profile.guarded &&
    (candidateDiagnostics.sourceFitScore + 0.16) < previousDiagnostics.sourceFitScore &&
    scoreDelta < profile.overrideScoreDelta
  ) {
    return false;
  }
  if (
    previousBaselineRank <= profile.anchorStrongTopN &&
    previousConfidence >= profile.anchoredConfidence
  ) {
    return scoreDelta >= profile.overrideScoreDelta && confidenceDelta >= profile.overrideConfidenceDelta;
  }
  if (candidateConfidence < profile.minPromotionConfidence && previousConfidence >= candidateConfidence - 0.01) {
    return false;
  }
  if (
    profile.guarded &&
    candidateDiagnostics.resultType === "unknown" &&
    previousDiagnostics.resultType !== "unknown" &&
    confidenceDelta < profile.overrideConfidenceDelta
  ) {
    return false;
  }

  return scoreDelta >= profile.minScoreDelta || confidenceDelta >= profile.minConfidenceDelta;
}

function stabilizeRankedResultsV15(
  results: SearchResult[],
  intent: SearchIntent,
  planner: PlannerOutput,
  limit: number,
  debug = false,
) {
  const profile = stabilityProfileV15(intent, planner);
  const windowSize = Math.min(results.length, Math.max(limit + 6, limit));
  if (!profile.enabled || results.length <= 1) {
    return ensureWithinLimit(results, windowSize).map((result) => ({
      ...result,
      signals: debug ? result.signals : result.signals,
    }));
  }

  const desired = results.slice(0, windowSize);
  const working = results
    .slice(0, windowSize)
    .sort((a, b) =>
      a.originalRank - b.originalRank ||
      (a.rank ?? 999) - (b.rank ?? 999) ||
      a.originalRank - b.originalRank,
    );

  for (const desiredCandidate of desired) {
    let candidateIndex = working.findIndex((item) => item.url === desiredCandidate.url);
    while (candidateIndex > 0) {
      const previous = working[candidateIndex - 1];
      const candidate = working[candidateIndex];
      if (!canPromoteCandidateOverV15(candidate, previous, intent, planner, profile)) {
        break;
      }
      working[candidateIndex - 1] = candidate;
      working[candidateIndex] = previous;
      candidateIndex -= 1;
    }
  }

  return working.map((result) => ({
    ...result,
    signals: debug ? [...(result.signals ?? []), `v1.5-stability:${profile.guarded ? "guarded" : "broad"}`] : result.signals,
  }));
}

function shouldApplyMultiSourceSlateV15(intent: SearchIntent, planner: PlannerOutput) {
  return (
    planner.branch === 'broad-discovery' ||
    planner.flags.extractionImportant ||
    intent.mode === "models" ||
    intent.mode === "packages"
  );
}

function multiSourceSlateOptionsV15(intent: SearchIntent, planner: PlannerOutput) {
  let preserveTopN = 0;
  if (planner.flags.extractionImportant && intent.mode === "official-docs") {
    preserveTopN = 2;
  } else if (intent.mode === "models" || intent.mode === "packages") {
    preserveTopN = 2;
  }
  return {
    preserveTopN,
    preferDistinctFamily: planner.flags.extractionImportant || intent.mode === "models" || intent.mode === "packages",
    preserveDuplicateFamiliesWithinTopN: intent.mode === "packages",
    preserveDuplicateHostsWithinTopN: intent.mode === "packages",
    mode: intent.mode,
  };
}

function rerankResultsV15(
  results: SearchResult[],
  intent: SearchIntent,
  planner: PlannerOutput,
  limit: number,
  debug = false,
) {
  const applyGuardedLayer = shouldApplyV15GuardedLayer(intent, planner);
  const adjusted = results.map((result) => {
    const diagnostics = {
      resultType: result.resultType ?? "unknown",
      solutionLikelihood: result.solutionLikelihood ?? 0,
      entityMatchStrength: result.entityMatchStrength ?? 0,
      extractionLikelihood: result.extractionLikelihood ?? 0,
      diversityValue: result.diversityValue ?? 0,
      sourceFitScore: result.sourceFitScore ?? 0,
      pageSpecificity: result.pageSpecificity ?? 0,
      pageRole: result.pageRole ?? "unknown",
      branchAdjustment: result.plannerAdjustment ?? 0,
      why: result.why ?? [],
    } satisfies ResultDiagnostics;
    const guardedAdjustment = applyGuardedLayer
      ? guardedAdjustmentForResult(result, diagnostics, intent, planner)
      : 0;
    const score = Number((((typeof result.score === "number" ? result.score : 0) + guardedAdjustment)).toFixed(4));
    const signals = debug
      ? [
          ...(result.signals ?? []),
          `v1.5-guarded-layer:${applyGuardedLayer ? "on" : "off"}`,
          `source-fit:${diagnostics.sourceFitScore.toFixed(2)}`,
          `page-specificity:${diagnostics.pageSpecificity.toFixed(2)}`,
          `guarded-adjustment:${guardedAdjustment.toFixed(4)}`,
        ]
      : result.signals;
    return {
      ...result,
      score,
      guardedAdjustment,
      signals,
    } satisfies SearchResult;
  });

  if (!applyGuardedLayer) {
    if (planner.branch === "broad-discovery") {
      return selectCandidateSet(adjusted, planner, limit, debug);
    }
    const stabilized = stabilizeRankedResultsV15(adjusted, intent, planner, limit, debug);
    if (shouldApplyMultiSourceSlateV15(intent, planner)) {
      return rebalanceMultiSourceSlateV15(stabilized, limit, debug, multiSourceSlateOptionsV15(intent, planner));
    }
    return ensureWithinLimit(stabilized, limit).map((result, index) => ({
      ...result,
      rank: index + 1,
      signals: debug ? result.signals : undefined,
    }));
  }

  const sorted = adjusted
    .sort((a, b) =>
      (b.score ?? 0) - (a.score ?? 0) ||
      (b.sourceFitScore ?? 0) - (a.sourceFitScore ?? 0) ||
      (b.pageSpecificity ?? 0) - (a.pageSpecificity ?? 0) ||
      (b.entityMatchStrength ?? 0) - (a.entityMatchStrength ?? 0) ||
      (b.heuristicPrior ?? 0) - (a.heuristicPrior ?? 0) ||
      (a.rank ?? 999) - (b.rank ?? 999) ||
      a.originalRank - b.originalRank
    );

  const stabilized = stabilizeRankedResultsV15(sorted, intent, planner, limit, debug);

  if (shouldApplyMultiSourceSlateV15(intent, planner)) {
    return rebalanceMultiSourceSlateV15(stabilized, limit, debug, multiSourceSlateOptionsV15(intent, planner));
  }

  return ensureWithinLimit(stabilized, limit).map((result, index) => ({
    ...result,
    rank: index + 1,
    signals: debug ? result.signals : undefined,
  }));
}


function resultDiagnosticsSnapshotV20(result: SearchResult): ResultDiagnostics {
  return {
    resultType: result.resultType ?? "unknown",
    solutionLikelihood: result.solutionLikelihood ?? 0,
    entityMatchStrength: result.entityMatchStrength ?? 0,
    extractionLikelihood: result.extractionLikelihood ?? 0,
    diversityValue: result.diversityValue ?? 0,
    sourceFitScore: result.sourceFitScore ?? 0,
    pageSpecificity: result.pageSpecificity ?? 0,
    pageRole: result.pageRole ?? "unknown",
    branchAdjustment: result.plannerAdjustment ?? 0,
    why: result.why ?? [],
  } satisfies ResultDiagnostics;
}

function hybridControllerProfileV20(intent: SearchIntent, planner: PlannerOutput) {
  const exactComparisonLock =
    planner.queryProfile.hasComparisonHint &&
    !planner.queryProfile.hasSimilarityHint &&
    !intent.normalizedQuery.includes(" landscape") &&
    precisionAnchorTokensV20(intent).length >= 3;
  const lexicalGuard =
    planner.branch === "precision-lookup" ||
    planner.branch === "solution-hunt" ||
    planner.flags.exactEntityLikely ||
    planner.queryProfile.hasErrorLikePattern ||
    precisionAnchorTokensV20(intent).length >= 3 ||
    (planner.queryProfile.hasComparisonHint && precisionAnchorTokensV20(intent).length >= 2);
  const riskSensitive = planner.flags.verifySensitive && intent.mode === "general";
  const strictPrecision =
    planner.branch === "precision-lookup" ||
    intent.mode !== "general" ||
    planner.flags.exactEntityLikely ||
    exactComparisonLock;
  const artifactAware = planner.branch === "extract-heavy" || planner.flags.extractionImportant;
  const comparisonAware = planner.queryProfile.hasComparisonHint;
  const mode = riskSensitive
    ? "risk-locked"
    : strictPrecision
      ? "precision-locked"
      : artifactAware
        ? "artifact-aware"
        : planner.branch === "broad-discovery"
          ? "broad"
          : "balanced";
  return {
    mode,
    strictPrecision,
    artifactAware,
    lexicalGuard,
    comparisonAware,
    riskSensitive,
    anchorStrongTopN: riskSensitive
      ? 3
      : strictPrecision
        ? ((intent.mode === "github" || intent.mode === "packages" || intent.mode === "models") ? 2 : 1)
        : comparisonAware ? 1 : artifactAware ? 1 : 0,
    anchoredConfidence: riskSensitive ? 0.42 : strictPrecision ? 0.64 : lexicalGuard ? 0.6 : artifactAware ? 0.56 : 0.52,
    minPromotionConfidence: riskSensitive ? 0.6 : strictPrecision ? 0.58 : lexicalGuard ? 0.54 : artifactAware ? 0.5 : 0.46,
    minScoreDelta: riskSensitive ? 0.18 : strictPrecision ? 0.15 : lexicalGuard ? 0.14 : artifactAware ? 0.12 : 0.11,
    minConfidenceDelta: riskSensitive ? 0.12 : strictPrecision ? 0.11 : lexicalGuard ? 0.09 : artifactAware ? 0.08 : 0.07,
    overrideScoreDelta: riskSensitive ? 0.26 : strictPrecision ? 0.22 : lexicalGuard ? 0.18 : artifactAware ? 0.17 : 0.15,
    overrideConfidenceDelta: riskSensitive ? 0.18 : strictPrecision ? 0.16 : lexicalGuard ? 0.12 : artifactAware ? 0.11 : 0.09,
  };
}

function hasAgentArtifactPriorityV20(intent: SearchIntent) {
  return agentContractPrefersOfficialSources(intent) && agentContractHasTargetKind(intent, "release-artifact", "whats-new");
}

function hasAgentComparePriorityV20(intent: SearchIntent) {
  return intent.agentContract?.taskMode === "compare" || agentContractHasTargetKind(intent, "model-choice", "product-eval");
}

function hybridOverlayAdjustmentV20(
  result: SearchResult,
  diagnostics: ResultDiagnostics,
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const hostCoverage = resultHostCoverageV20(result, intent);
  const lexicalCoverage = resultLexicalAnchorCoverageV20(result, intent);
  const criticalCoverage = resultCriticalAnchorCoverageV20(result, intent);
  const artifactCoverage = resultArtifactAnchorCoverageV20(result, intent);
  const artifactIntent = hasArtifactIntentV20(intent);
  const agentArtifactPriority = hasAgentArtifactPriorityV20(intent);
  const explainerIntent = hasExplainerIntentV20(intent, planner);
  const explainerAspectCoverage = resultExplainerAspectCoverageV20(result, intent);
  let adjustment = 0;
  adjustment += diagnostics.sourceFitScore * (profile.riskSensitive ? 0.1 : profile.strictPrecision ? 0.18 : profile.artifactAware ? 0.1 : 0.08);
  adjustment += diagnostics.entityMatchStrength * (profile.riskSensitive ? 0.08 : profile.strictPrecision ? 0.12 : 0.06);
  adjustment += lexicalCoverage * (profile.riskSensitive ? 0.36 : profile.lexicalGuard ? 0.28 : 0.08);
  adjustment += diagnostics.pageSpecificity * (profile.riskSensitive ? 0.04 : profile.strictPrecision ? 0.08 : profile.artifactAware ? 0.1 : 0.05);
  adjustment += diagnostics.extractionLikelihood * (profile.artifactAware ? 0.16 : planner.branch === "broad-discovery" ? 0.04 : 0.03);
  adjustment += diagnostics.solutionLikelihood * (profile.riskSensitive ? 0.01 : planner.branch === "solution-hunt" ? 0.08 : 0.02);
  adjustment += artifactCoverage * (profile.artifactAware ? 0.12 : 0.03);

  if (diagnostics.pageRole === "official-artifact" && profile.artifactAware) {
    adjustment += 0.2;
    if (hostCoverage >= 0.25) {
      adjustment += 0.18;
    } else if (diagnostics.sourceFitScore < 0.75) {
      adjustment -= 0.08;
    }
  }
  if (diagnostics.pageRole === "canonical-doc" && profile.strictPrecision) {
    adjustment += 0.06;
    if (hostCoverage >= 0.25) {
      adjustment += 0.08;
    }
  }
  if (profile.lexicalGuard && (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "landing") && lexicalCoverage >= 0.58) {
    adjustment += 0.08;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    (diagnostics.pageRole === "official-artifact" || diagnostics.pageRole === "repository") &&
    artifactCoverage >= 0.45
  ) {
    adjustment += 0.14;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "official-artifact" || diagnostics.pageRole === "landing") &&
    artifactCoverage < 0.35 &&
    diagnostics.pageSpecificity < 0.3
  ) {
    adjustment -= 0.22;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "official-artifact"
  ) {
    if (hostCoverage >= 0.25) {
      adjustment += 0.14;
    } else if (!isGitHubHost(result.host) && diagnostics.sourceFitScore < 0.9) {
      adjustment -= 0.14;
    }
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "canonical-doc" &&
    artifactCoverage < 0.35
  ) {
    adjustment -= looksLikeVersionedDocsSnapshotV20(result) ? 0.34 : 0.16;
  }
  if ((diagnostics.pageRole === "repository" || diagnostics.pageRole === "registry" || diagnostics.pageRole === "discussion") && intent.mode !== "official-docs") {
    adjustment += 0.04;
  }
  if (diagnostics.pageRole === "meta-listing" || diagnostics.pageRole === "landing") {
    adjustment -= profile.riskSensitive
      ? 0.16
      : (profile.comparisonAware || (profile.lexicalGuard && lexicalCoverage >= 0.58)) ? 0.04 : 0.12;
  }
  if (profile.comparisonAware && diagnostics.pageRole === "unknown") {
    adjustment -= 0.12;
  }
  if (profile.riskSensitive && diagnostics.resultType !== "news") {
    adjustment -= 0.18;
  }
  if (profile.riskSensitive && diagnostics.resultType === "news" && lexicalCoverage >= 0.55) {
    adjustment += 0.08;
  }
  if (profile.riskSensitive && criticalCoverage > 0) {
    adjustment += criticalCoverage * 0.24;
  } else if (profile.riskSensitive && criticalAnchorTokensV20(intent).length > 0) {
    adjustment -= 0.2;
  }
  if (profile.riskSensitive && hasAnalysisCommentaryCueV20(result)) {
    adjustment -= 0.18;
  }
  if (profile.comparisonAware && diagnostics.pageRole === "discussion") {
    adjustment -= 0.08;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    diagnostics.resultType === "official-docs" &&
    diagnostics.sourceFitScore < 0.8 &&
    diagnostics.entityMatchStrength < 0.36
  ) {
    adjustment -= 0.18;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    diagnostics.pageRole === "canonical-doc" &&
    diagnostics.sourceFitScore >= 0.5
  ) {
    adjustment += hasTroubleshootingCueV20(result) ? 0.34 : 0.16;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    diagnostics.pageRole === "discussion" &&
    diagnostics.sourceFitScore < 0.3 &&
    !hasTroubleshootingCueV20(result)
  ) {
    adjustment -= 0.08;
  }
  if (profile.strictPrecision && diagnostics.pageRole === "deep-content" && diagnostics.sourceFitScore < 0.55) {
    adjustment -= 0.08;
  }
  if (
    explainerIntent &&
    (planner.branch === "solution-hunt" || planner.branch === "broad-discovery") &&
    (diagnostics.pageRole === "deep-content" || diagnostics.pageRole === "canonical-doc")
  ) {
    adjustment += explainerAspectCoverage * (diagnostics.pageRole === "deep-content" ? 0.22 : 0.16);
    if (hasExplainerCueV20(result)) {
      adjustment += diagnostics.pageRole === "deep-content" ? 0.12 : 0.08;
    }
    if (diagnostics.pageRole === "canonical-doc" && explainerAspectCoverage < 0.45) {
      adjustment -= 0.08;
    }
  }
  if (profile.lexicalGuard && diagnostics.pageRole === "deep-content" && lexicalCoverage < 0.4) {
    adjustment -= 0.18;
  }
  if (profile.comparisonAware && lexicalCoverage >= 0.58) {
    adjustment += 0.12;
  } else if (profile.comparisonAware && lexicalCoverage < 0.5) {
    adjustment -= 0.06;
  }
  if (profile.riskSensitive && lexicalCoverage < 0.55) {
    adjustment -= 0.18;
  }
  if (profile.lexicalGuard && lexicalCoverage < 0.45) {
    adjustment -= 0.28;
  }
  if (profile.lexicalGuard && planner.branch === "solution-hunt" && lexicalCoverage < 0.58) {
    adjustment -= 0.08;
  }
  if (isDemotedHost(result.host) && !intent.dockerLike && diagnostics.pageSpecificity < 0.18) {
    adjustment -= 0.08;
  }
  if (profile.lexicalGuard && isDemotedHost(result.host) && lexicalCoverage < 0.6) {
    adjustment -= 0.14;
  }
  if (
    agentArtifactPriority &&
    intent.mode === "official-docs" &&
    (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "official-artifact") &&
    diagnostics.sourceFitScore >= 0.82
  ) {
    adjustment += diagnostics.pageRole === "canonical-doc" ? 0.18 : 0.22;
  }
  if (
    agentArtifactPriority &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "repository" &&
    isGitHubHost(result.host) &&
    (artifactCoverage >= 0.34 || diagnostics.sourceFitScore >= 0.4)
  ) {
    adjustment += 0.16;
  }
  if (
    agentArtifactPriority &&
    (diagnostics.pageRole === "landing" || diagnostics.pageRole === "deep-content" || diagnostics.pageRole === "meta-listing") &&
    !isGitHubHost(result.host) &&
    diagnostics.sourceFitScore < 0.5 &&
    hostCoverage < 0.25
  ) {
    adjustment -= 0.18;
  }
  if (
    hasAgentComparePriorityV20(intent) &&
    profile.comparisonAware &&
    lexicalCoverage >= 0.5
  ) {
    adjustment += 0.04;
  }
  if (profile.riskSensitive) {
    adjustment *= 0.72;
  }

  return Number(adjustment.toFixed(4));
}

function resultEvidenceConfidenceV20(
  result: SearchResult,
  diagnostics: ResultDiagnostics,
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const hostCoverage = resultHostCoverageV20(result, intent);
  const lexicalCoverage = resultLexicalAnchorCoverageV20(result, intent);
  const criticalCoverage = resultCriticalAnchorCoverageV20(result, intent);
  const artifactCoverage = resultArtifactAnchorCoverageV20(result, intent);
  const artifactIntent = hasArtifactIntentV20(intent);
  const agentArtifactPriority = hasAgentArtifactPriorityV20(intent);
  const explainerIntent = hasExplainerIntentV20(intent, planner);
  const explainerAspectCoverage = resultExplainerAspectCoverageV20(result, intent);
  let confidence =
    (diagnostics.sourceFitScore * (profile.riskSensitive ? 0.28 : 0.34)) +
    (diagnostics.entityMatchStrength * (profile.riskSensitive ? 0.24 : 0.28)) +
    (lexicalCoverage * (profile.riskSensitive ? 0.42 : profile.lexicalGuard ? 0.34 : 0.1)) +
    (diagnostics.pageSpecificity * (profile.riskSensitive ? 0.12 : 0.16)) +
    (diagnostics.extractionLikelihood * (profile.artifactAware ? 0.14 : 0.06)) +
    (diagnostics.solutionLikelihood * (profile.riskSensitive ? 0.01 : planner.branch === "solution-hunt" ? 0.1 : 0.03)) +
    (artifactCoverage * (profile.artifactAware ? 0.08 : 0.02));

  if (profile.strictPrecision && (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "repository" || diagnostics.pageRole === "registry" || diagnostics.pageRole === "discussion")) {
    confidence += 0.06;
    if (hostCoverage >= 0.25) {
      confidence += 0.06;
    }
  }
  if (profile.lexicalGuard && (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "landing") && lexicalCoverage >= 0.58) {
    confidence += 0.08;
  }
  if (profile.artifactAware && diagnostics.pageRole === "official-artifact") {
    confidence += 0.08;
    if (hostCoverage >= 0.25) {
      confidence += 0.08;
    }
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    (diagnostics.pageRole === "official-artifact" || diagnostics.pageRole === "repository") &&
    artifactCoverage >= 0.45
  ) {
    confidence += 0.08;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "official-artifact"
  ) {
    if (hostCoverage >= 0.25) {
      confidence += 0.08;
    } else if (!isGitHubHost(result.host) && diagnostics.sourceFitScore < 0.9) {
      confidence -= 0.08;
    }
  }
  if (diagnostics.pageRole === "meta-listing" || diagnostics.pageRole === "landing") {
    confidence -= profile.riskSensitive
      ? 0.14
      : (profile.comparisonAware || (profile.lexicalGuard && lexicalCoverage >= 0.58)) ? 0.02 : 0.08;
  }
  if (profile.comparisonAware && diagnostics.pageRole === "unknown") {
    confidence -= 0.08;
  }
  if (profile.riskSensitive && diagnostics.resultType !== "news") {
    confidence -= 0.14;
  }
  if (profile.riskSensitive && diagnostics.resultType === "news" && lexicalCoverage >= 0.55) {
    confidence += 0.08;
  }
  if (profile.riskSensitive && criticalCoverage > 0) {
    confidence += criticalCoverage * 0.16;
  } else if (profile.riskSensitive && criticalAnchorTokensV20(intent).length > 0) {
    confidence -= 0.14;
  }
  if (profile.riskSensitive && hasAnalysisCommentaryCueV20(result)) {
    confidence -= 0.12;
  }
  if (profile.comparisonAware && diagnostics.pageRole === "discussion") {
    confidence -= 0.05;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    diagnostics.resultType === "official-docs" &&
    diagnostics.sourceFitScore < 0.8 &&
    diagnostics.entityMatchStrength < 0.36
  ) {
    confidence -= 0.12;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    diagnostics.pageRole === "canonical-doc" &&
    diagnostics.sourceFitScore >= 0.5
  ) {
    confidence += hasTroubleshootingCueV20(result) ? 0.16 : 0.08;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    diagnostics.pageRole === "discussion" &&
    diagnostics.sourceFitScore < 0.3 &&
    !hasTroubleshootingCueV20(result)
  ) {
    confidence -= 0.05;
  }
  if (profile.artifactAware && diagnostics.pageRole === "official-artifact" && diagnostics.sourceFitScore < 0.75 && hostCoverage < 0.25) {
    confidence -= 0.06;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "official-artifact" || diagnostics.pageRole === "landing") &&
    artifactCoverage < 0.35 &&
    diagnostics.pageSpecificity < 0.3
  ) {
    confidence -= 0.16;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "canonical-doc" &&
    artifactCoverage < 0.35
  ) {
    confidence -= looksLikeVersionedDocsSnapshotV20(result) ? 0.24 : 0.1;
  }
  if (profile.lexicalGuard && diagnostics.pageRole === "deep-content" && lexicalCoverage < 0.4) {
    confidence -= 0.14;
  }
  if (
    explainerIntent &&
    (planner.branch === "solution-hunt" || planner.branch === "broad-discovery") &&
    (diagnostics.pageRole === "deep-content" || diagnostics.pageRole === "canonical-doc")
  ) {
    confidence += explainerAspectCoverage * (diagnostics.pageRole === "deep-content" ? 0.12 : 0.08);
    if (hasExplainerCueV20(result)) {
      confidence += diagnostics.pageRole === "deep-content" ? 0.08 : 0.05;
    }
    if (diagnostics.pageRole === "canonical-doc" && explainerAspectCoverage < 0.45) {
      confidence -= 0.05;
    }
  }
  if (profile.comparisonAware && lexicalCoverage >= 0.58) {
    confidence += 0.08;
  } else if (profile.comparisonAware && lexicalCoverage < 0.5) {
    confidence -= 0.04;
  }
  if (profile.riskSensitive && lexicalCoverage < 0.55) {
    confidence -= 0.16;
  }
  if (profile.lexicalGuard && lexicalCoverage < 0.45) {
    confidence -= 0.22;
  }
  if (isDemotedHost(result.host) && !intent.dockerLike && diagnostics.pageSpecificity < 0.18) {
    confidence -= 0.08;
  }
  if (profile.lexicalGuard && isDemotedHost(result.host) && lexicalCoverage < 0.6) {
    confidence -= 0.1;
  }
  if (
    agentArtifactPriority &&
    intent.mode === "official-docs" &&
    (diagnostics.pageRole === "canonical-doc" || diagnostics.pageRole === "official-artifact") &&
    diagnostics.sourceFitScore >= 0.82
  ) {
    confidence += diagnostics.pageRole === "canonical-doc" ? 0.08 : 0.12;
  }
  if (
    agentArtifactPriority &&
    intent.mode === "official-docs" &&
    diagnostics.pageRole === "repository" &&
    isGitHubHost(result.host) &&
    (artifactCoverage >= 0.34 || diagnostics.sourceFitScore >= 0.4)
  ) {
    confidence += 0.08;
  }
  if (
    agentArtifactPriority &&
    (diagnostics.pageRole === "landing" || diagnostics.pageRole === "deep-content" || diagnostics.pageRole === "meta-listing") &&
    !isGitHubHost(result.host) &&
    diagnostics.sourceFitScore < 0.5 &&
    hostCoverage < 0.25
  ) {
    confidence -= 0.12;
  }

  return Number(clamp01(confidence).toFixed(4));
}

function canPromoteCandidateOverV20(
  candidate: SearchResult,
  previous: SearchResult,
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const candidateDiagnostics = resultDiagnosticsSnapshotV20(candidate);
  const previousDiagnostics = resultDiagnosticsSnapshotV20(previous);
  const candidateLexicalCoverage = resultLexicalAnchorCoverageV20(candidate, intent);
  const previousLexicalCoverage = resultLexicalAnchorCoverageV20(previous, intent);
  const candidateCriticalCoverage = resultCriticalAnchorCoverageV20(candidate, intent);
  const previousCriticalCoverage = resultCriticalAnchorCoverageV20(previous, intent);
  const candidateArtifactCoverage = resultArtifactAnchorCoverageV20(candidate, intent);
  const previousArtifactCoverage = resultArtifactAnchorCoverageV20(previous, intent);
  const candidateHostCoverage = resultHostCoverageV20(candidate, intent);
  const previousHostCoverage = resultHostCoverageV20(previous, intent);
  const candidateConfidence = resultEvidenceConfidenceV20(candidate, candidateDiagnostics, intent, planner, profile);
  const previousConfidence = resultEvidenceConfidenceV20(previous, previousDiagnostics, intent, planner, profile);
  const scoreDelta = (candidate.score ?? 0) - (previous.score ?? 0);
  const confidenceDelta = candidateConfidence - previousConfidence;
  const previousBaselineRank = previous.originalRank;
  const artifactIntent = hasArtifactIntentV20(intent);
  const explainerIntent = hasExplainerIntentV20(intent, planner);
  const protectedBaselineWindow = Math.max(
    profile.anchorStrongTopN,
    profile.artifactAware ? 3 : profile.strictPrecision ? 2 : 1,
  );

  if (isDemotedHost(candidate.host) && !intent.dockerLike && candidateConfidence < Math.max(profile.minPromotionConfidence, 0.52)) {
    return false;
  }
  if (
    profile.riskSensitive &&
    previousDiagnostics.resultType === "news" &&
    candidateDiagnostics.resultType !== "news" &&
    previousBaselineRank <= profile.anchorStrongTopN
  ) {
    return false;
  }
  if (
    profile.riskSensitive &&
    previousDiagnostics.resultType === "news" &&
    candidateDiagnostics.resultType === "news" &&
    previousBaselineRank <= profile.anchorStrongTopN &&
    candidateCriticalCoverage < previousCriticalCoverage + 0.08 &&
    !(
      hasAnalysisCommentaryCueV20(previous) &&
      !hasAnalysisCommentaryCueV20(candidate)
    )
  ) {
    if (
      previousCriticalCoverage < 0.5 &&
      candidateCriticalCoverage < 0.5 &&
      candidateLexicalCoverage < previousLexicalCoverage + 0.22
    ) {
      return false;
    }
    return (
      scoreDelta >= (profile.overrideScoreDelta + 0.06) &&
      confidenceDelta >= (profile.overrideConfidenceDelta + 0.06) &&
      candidateLexicalCoverage >= previousLexicalCoverage + 0.1
    );
  }
  if (
    !profile.strictPrecision &&
    !profile.riskSensitive &&
    previousBaselineRank <= protectedBaselineWindow &&
    candidateConfidence < 0.62 &&
    confidenceDelta < 0.08 &&
    candidateLexicalCoverage <= previousLexicalCoverage + 0.06
  ) {
    return false;
  }
  if (
    profile.artifactAware &&
    previousBaselineRank <= protectedBaselineWindow &&
    previousArtifactCoverage >= 0.45 &&
    candidateArtifactCoverage + 0.14 < previousArtifactCoverage &&
    previousConfidence >= candidateConfidence - 0.04
  ) {
    return false;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "github" &&
    previousDiagnostics.pageRole === "repository" &&
    previousDiagnostics.sourceFitScore >= 0.9 &&
    candidate.host !== "github.com" &&
    candidateDiagnostics.pageRole !== "repository" &&
    candidateDiagnostics.pageRole !== "discussion" &&
    candidateDiagnostics.resultType !== "repo" &&
    candidateDiagnostics.resultType !== "issue-thread" &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.18 &&
    previousConfidence >= candidateConfidence - 0.06
  ) {
    return false;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "github" &&
    candidateDiagnostics.pageRole === "repository" &&
    candidateDiagnostics.sourceFitScore >= 0.9 &&
    candidate.host === "github.com" &&
    previous.host !== "github.com" &&
    previousDiagnostics.pageRole !== "repository" &&
    previousDiagnostics.pageRole !== "discussion" &&
    previousDiagnostics.resultType !== "repo" &&
    previousDiagnostics.resultType !== "issue-thread" &&
    candidateDiagnostics.sourceFitScore >= previousDiagnostics.sourceFitScore + 0.18
  ) {
    return true;
  }
  if (
    profile.strictPrecision &&
    previousBaselineRank <= protectedBaselineWindow &&
    (previousDiagnostics.pageRole === "canonical-doc" || previousDiagnostics.pageRole === "official-artifact") &&
    previousHostCoverage >= candidateHostCoverage + 0.12 &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.14
  ) {
    return false;
  }
  if (
    profile.strictPrecision &&
    previousBaselineRank <= protectedBaselineWindow &&
    (previousDiagnostics.pageRole === "canonical-doc" || previousDiagnostics.pageRole === "official-artifact") &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.14 &&
    previousArtifactCoverage >= candidateArtifactCoverage - 0.04 &&
    previousLexicalCoverage >= candidateLexicalCoverage - 0.08 &&
    previousConfidence >= candidateConfidence - 0.06
  ) {
    return false;
  }
  if (
    profile.strictPrecision &&
    previousBaselineRank <= protectedBaselineWindow &&
    (previousDiagnostics.pageRole === "canonical-doc" || previousDiagnostics.pageRole === "official-artifact") &&
    candidateDiagnostics.pageRole !== "canonical-doc" &&
    candidateDiagnostics.pageRole !== "official-artifact" &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.18
  ) {
    return false;
  }
  if (
    profile.lexicalGuard &&
    candidateLexicalCoverage + 0.18 < previousLexicalCoverage &&
    candidateConfidence < previousConfidence + 0.08
  ) {
    return false;
  }
  if (
    profile.riskSensitive &&
    previousBaselineRank <= profile.anchorStrongTopN &&
    previousLexicalCoverage >= candidateLexicalCoverage - 0.02 &&
    previousConfidence >= candidateConfidence - 0.04
  ) {
    return scoreDelta >= (profile.overrideScoreDelta + 0.04) && confidenceDelta >= (profile.overrideConfidenceDelta + 0.04);
  }
  if (
    profile.lexicalGuard &&
    previousLexicalCoverage >= 0.62 &&
    candidateLexicalCoverage < previousLexicalCoverage - 0.14 &&
    scoreDelta < profile.overrideScoreDelta
  ) {
    return false;
  }
  if (
    profile.lexicalGuard &&
    isDemotedHost(candidate.host) &&
    !intent.dockerLike &&
    candidateLexicalCoverage < Math.max(0.6, previousLexicalCoverage - 0.04)
  ) {
    return false;
  }
  if (
    explainerIntent &&
    (planner.branch === "solution-hunt" || planner.branch === "broad-discovery") &&
    (candidateDiagnostics.pageRole === "deep-content" || candidateDiagnostics.pageRole === "canonical-doc") &&
    (previousDiagnostics.pageRole === "deep-content" || previousDiagnostics.pageRole === "canonical-doc")
  ) {
    const candidateExplainerCoverage = resultExplainerAspectCoverageV20(candidate, intent);
    const previousExplainerCoverage = resultExplainerAspectCoverageV20(previous, intent);
    if (
      candidateExplainerCoverage >= previousExplainerCoverage + 0.25 &&
      candidateDiagnostics.pageSpecificity >= previousDiagnostics.pageSpecificity - 0.06 &&
      candidateConfidence >= previousConfidence - 0.08
    ) {
      return true;
    }
    if (
      previousExplainerCoverage >= candidateExplainerCoverage + 0.25 &&
      previousConfidence >= candidateConfidence - 0.04
    ) {
      return false;
    }
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    candidateDiagnostics.pageRole === "canonical-doc" &&
    previousDiagnostics.pageRole === "discussion" &&
    hasTroubleshootingCueV20(candidate) &&
    candidateDiagnostics.sourceFitScore >= previousDiagnostics.sourceFitScore + 0.28 &&
    candidateDiagnostics.solutionLikelihood >= previousDiagnostics.solutionLikelihood - 0.12 &&
    candidateConfidence >= previousConfidence - 0.08
  ) {
    return true;
  }
  if (
    profile.strictPrecision &&
    intent.mode === "official-docs" &&
    planner.flags.solutionIntentLikely &&
    previousDiagnostics.pageRole === "canonical-doc" &&
    candidateDiagnostics.pageRole === "discussion" &&
    hasTroubleshootingCueV20(previous) &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.28 &&
    previousDiagnostics.solutionLikelihood >= candidateDiagnostics.solutionLikelihood - 0.12
  ) {
    return false;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    previousDiagnostics.pageRole === "official-artifact" &&
    previousHostCoverage >= 0.25 &&
    candidateDiagnostics.pageRole === "official-artifact" &&
    candidateHostCoverage < 0.25 &&
    !isGitHubHost(candidate.host) &&
    previousArtifactCoverage >= candidateArtifactCoverage - 0.08 &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.12
  ) {
    return false;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    candidateDiagnostics.pageRole === "official-artifact" &&
    previousDiagnostics.pageRole === "official-artifact" &&
    candidateHostCoverage >= 0.25 &&
    previousHostCoverage < 0.25 &&
    candidateArtifactCoverage >= previousArtifactCoverage - 0.08 &&
    candidateDiagnostics.sourceFitScore >= previousDiagnostics.sourceFitScore + 0.18 &&
    candidateConfidence >= previousConfidence - 0.04
  ) {
    return true;
  }
  if (
    profile.artifactAware &&
    artifactIntent &&
    intent.mode === "official-docs" &&
    candidateDiagnostics.pageRole === "official-artifact" &&
    previousDiagnostics.pageRole === "canonical-doc" &&
    previousArtifactCoverage < 0.35 &&
    looksLikeVersionedDocsSnapshotV20(previous) &&
    candidateArtifactCoverage >= previousArtifactCoverage + 0.45 &&
    candidateConfidence >= previousConfidence - 0.12
  ) {
    return true;
  }
  if (
    profile.artifactAware &&
    candidateDiagnostics.pageRole === "official-artifact" &&
    previousDiagnostics.pageRole !== "official-artifact" &&
    candidateDiagnostics.extractionLikelihood >= previousDiagnostics.extractionLikelihood + 0.08 &&
    candidateDiagnostics.sourceFitScore >= previousDiagnostics.sourceFitScore - 0.06 &&
    candidateConfidence >= previousConfidence + 0.02
  ) {
    return true;
  }
  if (
    profile.artifactAware &&
    candidateDiagnostics.pageRole === "official-artifact" &&
    candidateHostCoverage >= 0.25 &&
    candidateDiagnostics.sourceFitScore >= previousDiagnostics.sourceFitScore + 0.18 &&
    candidateConfidence >= previousConfidence - 0.02
  ) {
    return true;
  }
  if (
    profile.strictPrecision &&
    (previousDiagnostics.pageRole === "canonical-doc" || previousDiagnostics.pageRole === "repository" || previousDiagnostics.pageRole === "registry" || previousDiagnostics.pageRole === "discussion") &&
    previousDiagnostics.sourceFitScore >= candidateDiagnostics.sourceFitScore + 0.08 &&
    previousConfidence >= candidateConfidence - 0.02 &&
    previousLexicalCoverage >= candidateLexicalCoverage - 0.04
  ) {
    return false;
  }
  if (
    profile.strictPrecision &&
    (candidateDiagnostics.pageRole === "meta-listing" || candidateDiagnostics.pageRole === "landing") &&
    previousDiagnostics.pageRole !== "meta-listing" &&
    previousDiagnostics.pageRole !== "landing"
  ) {
    return false;
  }
  if (previousBaselineRank <= profile.anchorStrongTopN && previousConfidence >= profile.anchoredConfidence) {
    return scoreDelta >= profile.overrideScoreDelta && confidenceDelta >= profile.overrideConfidenceDelta;
  }
  if (candidateConfidence < profile.minPromotionConfidence && previousConfidence >= candidateConfidence - 0.01) {
    return false;
  }
  return scoreDelta >= profile.minScoreDelta || confidenceDelta >= profile.minConfidenceDelta;
}

function isPrecisionLockedArtifactAnchorV20(result: SearchResult, intent: SearchIntent) {
  if (intent.mode !== "official-docs" || !hasArtifactIntentV20(intent)) {
    return false;
  }
  const diagnostics = resultDiagnosticsSnapshotV20(result);
  if (diagnostics.pageRole !== "official-artifact") {
    return false;
  }
  const hostCoverage = resultHostCoverageV20(result, intent);
  const artifactCoverage = resultArtifactAnchorCoverageV20(result, intent);
  return hostCoverage >= 0.25 && artifactCoverage >= 0.45 && diagnostics.sourceFitScore >= 0.9;
}

function stabilizeRankedResultsV20(
  results: SearchResult[],
  intent: SearchIntent,
  planner: PlannerOutput,
  limit: number,
  debug = false,
) {
  const profile = hybridControllerProfileV20(intent, planner);
  const windowSize = Math.min(results.length, Math.max(limit + 6, limit));
  if (results.length <= 1) {
    return ensureWithinLimit(results, windowSize);
  }

  const desired = results.slice(0, windowSize);
  const working = results
    .slice(0, windowSize)
    .sort((a, b) =>
      (a.rank ?? 999) - (b.rank ?? 999) ||
      a.originalRank - b.originalRank,
    );

  if (profile.artifactAware && intent.mode === "official-docs" && hasArtifactIntentV20(intent)) {
    const lockedAnchor = desired.find((candidate) => isPrecisionLockedArtifactAnchorV20(candidate, intent));
    if (lockedAnchor) {
      let lockedIndex = working.findIndex((item) => item.url === lockedAnchor.url);
      while (lockedIndex > 0) {
        const previous = working[lockedIndex - 1];
        working[lockedIndex - 1] = working[lockedIndex];
        working[lockedIndex] = previous;
        lockedIndex -= 1;
      }
    }
  }

  for (const desiredCandidate of desired) {
    let candidateIndex = working.findIndex((item) => item.url === desiredCandidate.url);
    while (candidateIndex > 0) {
      const previous = working[candidateIndex - 1];
      const candidate = working[candidateIndex];
      if (!canPromoteCandidateOverV20(candidate, previous, intent, planner, profile)) {
        break;
      }
      working[candidateIndex - 1] = candidate;
      working[candidateIndex] = previous;
      candidateIndex -= 1;
    }
  }

  return working.map((result) => ({
    ...result,
    signals: debug ? [...(result.signals ?? []), `v2.0-controller:${profile.mode}`] : result.signals,
  }));
}

function shouldApplyMultiSourceSlateV20(
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const guardedDocsBackfill =
    intent.mode === "official-docs" &&
    profile.strictPrecision &&
    !profile.artifactAware &&
    planner.branch === "precision-lookup";
  if (profile.riskSensitive) {
    return false;
  }
  if (
    profile.strictPrecision &&
    !profile.artifactAware &&
    intent.mode !== "models" &&
    intent.mode !== "packages" &&
    !guardedDocsBackfill
  ) {
    return false;
  }
  return (
    guardedDocsBackfill ||
    planner.branch === "broad-discovery" ||
    profile.artifactAware ||
    intent.mode === "models" ||
    intent.mode === "packages"
  );
}

function shouldPreserveExactArtifactTop3V20(
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const latestArtifactCue = hasAny(intent.normalizedQuery, [" latest", " latest version", " newest", " current version"]);
  return (
    intent.mode === "official-docs" &&
    profile.artifactAware &&
    planner.branch === "precision-lookup" &&
    planner.flags.exactEntityLikely &&
    hasArtifactIntentV20(intent) &&
    (latestArtifactCue || hasAgentArtifactPriorityV20(intent))
  );
}

function multiSourceSlateOptionsV20(
  intent: SearchIntent,
  planner: PlannerOutput,
  profile: ReturnType<typeof hybridControllerProfileV20>,
) {
  const exactArtifactTop3 = shouldPreserveExactArtifactTop3V20(intent, planner, profile);
  const guardedDocsBackfill =
    intent.mode === "official-docs" &&
    profile.strictPrecision &&
    !profile.artifactAware &&
    planner.branch === "precision-lookup";
  let preserveTopN = 0;
  if (exactArtifactTop3) {
    preserveTopN = 3;
  } else if (profile.artifactAware && intent.mode === "official-docs") {
    preserveTopN = 2;
  } else if (guardedDocsBackfill) {
    preserveTopN = 3;
  } else if (intent.mode === "models" && planner.branch === "precision-lookup") {
    preserveTopN = 3;
  } else if (intent.mode === "models" || intent.mode === "packages") {
    preserveTopN = 2;
  }
  return {
    preserveTopN,
    preferDistinctFamily:
      exactArtifactTop3 ||
      guardedDocsBackfill ||
      profile.artifactAware ||
      planner.branch === "broad-discovery" ||
      intent.mode === "models" ||
      intent.mode === "packages",
    preserveDuplicateFamiliesWithinTopN:
      exactArtifactTop3 ||
      guardedDocsBackfill ||
      intent.mode === "packages" ||
      (intent.mode === "models" && planner.branch === "precision-lookup"),
    preserveDuplicateHostsWithinTopN:
      exactArtifactTop3 ||
      guardedDocsBackfill ||
      intent.mode === "packages" ||
      (intent.mode === "models" && planner.branch === "precision-lookup"),
    mode: intent.mode,
  };
}

function rerankResultsV20(
  results: SearchResult[],
  intent: SearchIntent,
  planner: PlannerOutput,
  limit: number,
  debug = false,
) {
  const profile = hybridControllerProfileV20(intent, planner);
  const adjusted = results.map((result) => {
    const diagnostics = resultDiagnosticsSnapshotV20(result);
    const hybridAdjustment = hybridOverlayAdjustmentV20(result, diagnostics, intent, planner, profile);
    const score = Number((((typeof result.score === "number" ? result.score : 0) + hybridAdjustment)).toFixed(4));
    const signals = debug
      ? [
          ...(result.signals ?? []),
          `v2.0-mode:${profile.mode}`,
          `v2.0-hybrid-adjustment:${hybridAdjustment.toFixed(4)}`,
        ]
      : result.signals;
    return {
      ...result,
      score,
      hybridAdjustment,
      signals,
    } satisfies SearchResult;
  });

  const desired = adjusted.sort((a, b) =>
    (b.score ?? 0) - (a.score ?? 0) ||
    (b.sourceFitScore ?? 0) - (a.sourceFitScore ?? 0) ||
    (b.pageSpecificity ?? 0) - (a.pageSpecificity ?? 0) ||
    (b.entityMatchStrength ?? 0) - (a.entityMatchStrength ?? 0) ||
    (b.heuristicPrior ?? 0) - (a.heuristicPrior ?? 0) ||
    (a.rank ?? 999) - (b.rank ?? 999) ||
    a.originalRank - b.originalRank,
  );

  const stabilized = stabilizeRankedResultsV20(desired, intent, planner, limit, debug);
  if (shouldApplyMultiSourceSlateV20(intent, planner, profile)) {
    return rebalanceMultiSourceSlateV15(stabilized, limit, debug, multiSourceSlateOptionsV20(intent, planner, profile));
  }
  return ensureWithinLimit(stabilized, limit).map((result, index) => ({
    ...result,
    rank: index + 1,
    signals: debug ? result.signals : undefined,
  }));
}
async function rankMergedSearchResults(
  cfg: any,
  merged: { results: SearchResult[]; unresponsiveEngines: string[]; suggestions: string[] },
  params: {
    query: string;
    category?: SearchCategory;
    mode?: SearchMode;
    limit: number;
    debug?: boolean;
    rerankVersion: RerankVersion;
    agentContract?: AgentSearchContract | null;
  },
) {
  const debug = Boolean(params.debug);
  const requestedCategory = params.category;
  const requestedMode = typeof params.mode === "string" ? params.mode : cfg.defaultMode;
  const intent = detectQueryIntent(params.query, requestedMode, requestedCategory, params.agentContract);
  const planner = buildPlannerOutput(params.query, intent, requestedCategory);
  const baseline = ensureWithinLimit(
    merged.results
      .slice()
      .sort((a, b) => a.originalRank - b.originalRank)
      .map((result, index) => ({
        ...result,
        rank: index + 1,
      })),
    params.limit,
  );

  let finalResults = baseline;
  let embeddingInfo: Record<string, unknown> | undefined;
  let adaptiveProfile: AdaptiveHybridProfile | undefined;

  if (params.rerankVersion === "v1.1") {
    finalResults = ensureWithinLimit(rerankResultsV11(merged.results, intent, debug), params.limit);
  } else if (params.rerankVersion === "v1.2") {
    const v12 = await rerankResultsV12(cfg, merged.results, intent, debug);
    finalResults = ensureWithinLimit(v12.results, params.limit);
    embeddingInfo = v12.embedding;
  } else if (
    params.rerankVersion === "v1.3" ||
    params.rerankVersion === "v1.4" ||
    params.rerankVersion === "v1.5" ||
    params.rerankVersion === "v2.0"
  ) {
    const v13 = await rerankResultsV13(cfg, merged.results, intent, requestedCategory, debug);
    finalResults =
      params.rerankVersion === "v2.0"
        ? rerankResultsV20(
            annotateResultDiagnostics(v13.results, intent, planner, {
              applyBranchAdjustment: true,
              applyGuardedAdjustment: false,
              debug,
            }),
            intent,
            planner,
            params.limit,
            debug,
          )
        : isPlannerCandidateRerankVersion(params.rerankVersion)
          ? rerankResultsV15(
              annotateResultDiagnostics(v13.results, intent, planner, {
                applyBranchAdjustment: true,
                applyGuardedAdjustment: false,
                debug,
              }),
              intent,
              planner,
              params.limit,
              debug,
            )
          : ensureWithinLimit(v13.results, params.limit);
    embeddingInfo = v13.embedding;
    adaptiveProfile = v13.profile;
  }

  const embeddingFallback = (
    params.rerankVersion === "v1.2" ||
    params.rerankVersion === "v1.3" ||
    params.rerankVersion === "v1.4" ||
    params.rerankVersion === "v1.5" ||
    params.rerankVersion === "v2.0"
  ) && embeddingInfo?.applied === false;
  const effectiveRerankVersion = embeddingFallback ? "v1.1" : params.rerankVersion;
  if (embeddingFallback) {
    finalResults = ensureWithinLimit(rerankResultsV11(merged.results, intent, debug), params.limit);
  }

  if (debug && !isPlannerCandidateRerankVersion(params.rerankVersion)) {
    finalResults = annotateResultDiagnostics(finalResults, intent, planner, {
      applyBranchAdjustment: false,
      applyGuardedAdjustment: false,
      debug: true,
    });
  }

  return {
    requestedMode,
    requestedCategory,
    intent,
    planner,
    baseline,
    finalResults,
    embeddingInfo,
    adaptiveProfile,
    effectiveRerankVersion,
  };
}

async function searchSearxng(cfg: any, params: {
  query: string;
  category?: SearchCategory;
  language?: string;
  limit?: number;
  safeSearch?: number;
  mode?: SearchMode;
  rerank?: boolean;
  rerankVersion?: RerankVersion;
  debug?: boolean;
  agentContract?: AgentSearchContract | null;
}) {
  const limit =
    typeof params.limit === "number" && params.limit > 0
      ? Math.min(20, Math.max(1, Math.floor(params.limit)))
      : cfg.defaultLimit;
  const language = typeof params.language === "string" && params.language.trim()
    ? params.language
    : cfg.defaultLanguage;
  const safeSearch =
    typeof params.safeSearch === "number" && Number.isFinite(params.safeSearch)
      ? Math.min(2, Math.max(0, Math.floor(params.safeSearch)))
      : DEFAULTS.defaultSafeSearch;
  const debug = Boolean(params.debug);
  const requestedCategory = params.category;
  const requestedMode = typeof params.mode === "string" ? params.mode : cfg.defaultMode;
  const rerankVersion = resolveEffectiveRerankVersion(cfg, params);
  const retrieved = await collectSearchCandidates(cfg, {
    query: params.query,
    category: requestedCategory,
    language,
    safeSearch,
    limit,
    mode: requestedMode,
    rerankVersion,
    debug,
    agentContract: params.agentContract,
  });
  const intent = retrieved.intent;
  const categoriesQueried = retrieved.categoriesQueried;
  const merged = retrieved.merged;
  const ranked = await rankMergedSearchResults(cfg, merged, {
    query: params.query,
    category: requestedCategory,
    mode: requestedMode,
    limit,
    debug,
    rerankVersion,
    agentContract: params.agentContract,
  });
  const finalResults = ranked.finalResults;
  const effectiveRerankVersion = ranked.effectiveRerankVersion;
  const embeddingInfo = ranked.embeddingInfo;
  const adaptiveProfile = ranked.adaptiveProfile;
  const planner = ranked.planner;

  return {
    query: params.query,
    requestedCategory: requestedCategory ?? null,
    categoriesQueried,
    language,
    safeSearch,
    mode: intent.mode,
    rerankApplied: effectiveRerankVersion !== "v1.0",
    rerankVersion: effectiveRerankVersion,
    requestedRerankVersion: resolveRequestedRerankVersion(params.rerankVersion) ?? null,
    rerankStrategy: rerankStrategyLabel(effectiveRerankVersion),
    queryIntent: {
      docsLike: intent.docsLike,
      githubLike: intent.githubLike,
      modelLike: intent.modelLike,
      packageLike: intent.packageLike,
      dockerLike: intent.dockerLike,
      officialLike: intent.officialLike,
      sourceMentions: intent.sourceMentions,
      agentContract: intent.agentContract,
      adaptiveBucket: adaptiveProfile?.bucket ?? null,
    },
    planner: debug
      ? {
          branch: planner.branch,
          precisionDial: planner.precisionDial,
          expectedNextStep: planner.expectedNextStep,
          flags: planner.flags,
          queryProfile: planner.queryProfile,
          rationale: planner.rationale,
        }
      : undefined,
    retrieval: {
      strategy: retrieved.retrievalPlan.strategy,
      variantCount: retrieved.retrievalPlan.variants.length,
      categoriesQueried,
      queryVariants: debug
        ? retrieved.retrievalPlan.variants.map((variant) => ({
            query: variant.query,
            categories: variant.categories,
            rationale: variant.rationale,
          }))
        : undefined,
      decontamination: retrieved.decontamination,
    },
    resultCount: finalResults.length,
    totalCandidates: merged.results.length,
    results: finalResults.map((result) => ({
      rank: result.rank,
      originalRank: result.originalRank,
      title: result.title,
      url: result.url,
      snippet: result.snippet,
      engine: result.engine,
      category: result.category,
      categories: result.categories,
      publishedDate: result.publishedDate,
      host: result.host,
      score: result.score,
      embeddingSimilarity: result.embeddingSimilarity,
      semanticScore: result.semanticScore,
      signals: result.signals,
      resultType: debug ? result.resultType : undefined,
      solutionLikelihood: debug ? result.solutionLikelihood : undefined,
      entityMatchStrength: debug ? result.entityMatchStrength : undefined,
      extractionLikelihood: debug ? result.extractionLikelihood : undefined,
      diversityValue: debug ? result.diversityValue : undefined,
      sourceFitScore: debug ? result.sourceFitScore : undefined,
      pageSpecificity: debug ? result.pageSpecificity : undefined,
      pageRole: debug ? result.pageRole : undefined,
      plannerAdjustment: debug ? result.plannerAdjustment : undefined,
      guardedAdjustment: debug ? result.guardedAdjustment : undefined,
      hybridAdjustment: debug ? result.hybridAdjustment : undefined,
      why: debug ? result.why : undefined,
    })),
    baseline: debug
      ? ranked.baseline.map((result) => ({
          rank: result.rank,
          originalRank: result.originalRank,
          title: result.title,
          url: result.url,
          host: result.host,
          engine: result.engine,
          categories: result.categories,
        }))
      : undefined,
    embedding: debug ? embeddingInfo : undefined,
    adaptiveHybrid: debug && adaptiveProfile
      ? {
          bucket: adaptiveProfile.bucket,
          semanticWeight: adaptiveProfile.semanticWeight,
          heuristicWeight: adaptiveProfile.heuristicWeight,
          priorStrength: adaptiveProfile.priorStrength,
          rationale: adaptiveProfile.rationale,
        }
      : undefined,
    unresponsiveEngines: merged.unresponsiveEngines,
    suggestions: merged.suggestions,
  };
}

function renderResearchReport(params: {
  query: string;
  mode: string;
  categoriesQueried: string[];
  language: string;
  note?: string;
  runId: string;
  createdAt: string;
  results: Array<Record<string, unknown>>;
  unresponsiveEngines: string[];
  retrieval?: Record<string, unknown>;
}) {
  const lines = [
    `# Research Run: ${params.query}`,
    "",
    `- Run ID: \`${params.runId}\``,
    `- Created: ${params.createdAt}`,
    `- Mode: \`${params.mode}\``,
    `- Categories queried: ${params.categoriesQueried.map((item) => `\`${item}\``).join(", ")}`,
    `- Language: \`${params.language}\``,
    `- Result count: ${params.results.length}`,
  ];

  if (params.note?.trim()) {
    lines.push(`- Note: ${params.note.trim()}`);
  }

  if (params.unresponsiveEngines.length > 0) {
    lines.push(`- Unresponsive engines: ${params.unresponsiveEngines.join(", ")}`);
  }
  if (params.retrieval && typeof params.retrieval.strategy === "string") {
    lines.push(`- Retrieval: \`${String(params.retrieval.strategy)}\``);
    if (typeof params.retrieval.variantCount === "number") {
      lines.push(`- Retrieval variants: ${params.retrieval.variantCount}`);
    }
    const decontamination = params.retrieval.decontamination;
    if (decontamination && typeof decontamination === "object" && typeof (decontamination as Record<string, unknown>).removedCount === "number") {
      lines.push(`- Candidate decontamination removed: ${(decontamination as Record<string, unknown>).removedCount}`);
    }
  }

  lines.push("", "## Results", "");

  for (const item of params.results) {
    const title = String(item.title ?? "");
    const url = String(item.url ?? "");
    const rank = String(item.rank ?? "?");
    const host = item.host ? `host=${String(item.host)}` : undefined;
    const engine = item.engine ? `engine=${String(item.engine)}` : undefined;
    const categories = Array.isArray(item.categories) && item.categories.length > 0 ? `categories=${item.categories.join("/")}` : undefined;
    const score = typeof item.score === "number" ? `score=${item.score}` : undefined;
    const published = item.publishedDate ? `published=${String(item.publishedDate)}` : undefined;
    const meta = [host, engine, categories, score, published].filter(Boolean).join(" | ");
    lines.push(`${rank}. [${title || url}](${url})`);
    if (meta) {
      lines.push(`   - ${meta}`);
    }
    if (item.snippet) {
      lines.push(`   - ${String(item.snippet)}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim() + "\n";
}

function resolveWorkspaceDir(api: any) {
  const configured = api?.config?.agents?.defaults?.workspace;
  if (typeof configured === "string" && configured.trim()) {
    return configured;
  }
  return path.join(os.homedir(), ".openclaw", "workspace");
}

function resolvePluginCfg(api: any) {
  const cfg = api?.pluginConfig ?? {};
  const workspaceDir = resolveWorkspaceDir(api);
  const serviceRoot =
    typeof cfg.serviceRoot === "string" && cfg.serviceRoot.trim()
      ? cfg.serviceRoot
      : path.join(workspaceDir, "services", "web-searcher");
  return {
    workspaceDir,
    serviceRoot,
    runsDir:
      typeof cfg.runsDir === "string" && cfg.runsDir.trim()
        ? cfg.runsDir
        : path.join(serviceRoot, "runs"),
    extractRoot:
      typeof cfg.extractRoot === "string" && cfg.extractRoot.trim()
        ? cfg.extractRoot
        : path.join(serviceRoot, "playwright-fallback"),
    searxngBaseUrl:
      typeof cfg.searxngBaseUrl === "string" && cfg.searxngBaseUrl.trim()
        ? normalizeBaseUrl(cfg.searxngBaseUrl)
        : DEFAULTS.searxngBaseUrl,
    ntfyBaseUrl:
      typeof cfg.ntfyBaseUrl === "string" && cfg.ntfyBaseUrl.trim()
        ? cfg.ntfyBaseUrl
        : DEFAULTS.ntfyBaseUrl,
    defaultLanguage:
      typeof cfg.defaultLanguage === "string" && cfg.defaultLanguage.trim()
        ? cfg.defaultLanguage
        : DEFAULTS.defaultLanguage,
    defaultLimit:
      typeof cfg.defaultLimit === "number" && cfg.defaultLimit > 0
        ? Math.min(20, Math.max(1, Math.floor(cfg.defaultLimit)))
        : DEFAULTS.defaultLimit,
    fetchTimeoutMs:
      typeof cfg.fetchTimeoutMs === "number" && cfg.fetchTimeoutMs > 0
        ? cfg.fetchTimeoutMs
        : DEFAULTS.fetchTimeoutMs,
    browserTimeoutMs:
      typeof cfg.browserTimeoutMs === "number" && cfg.browserTimeoutMs > 0
        ? cfg.browserTimeoutMs
        : DEFAULTS.browserTimeoutMs,
    maxTextChars:
      typeof cfg.maxTextChars === "number" && cfg.maxTextChars > 0
        ? cfg.maxTextChars
        : DEFAULTS.maxTextChars,
    maxLinks:
      typeof cfg.maxLinks === "number" && cfg.maxLinks > 0
        ? cfg.maxLinks
        : DEFAULTS.maxLinks,
    rerankEnabled:
      typeof cfg.rerankEnabled === "boolean"
        ? cfg.rerankEnabled
        : DEFAULTS.rerankEnabled,
    defaultMode:
      typeof cfg.defaultMode === "string"
        ? cfg.defaultMode
        : DEFAULTS.defaultMode,
    defaultRerankVersion:
      isSupportedRerankVersion(cfg.defaultRerankVersion)
        ? cfg.defaultRerankVersion
        : DEFAULTS.defaultRerankVersion,
    embeddingModelPath:
      typeof cfg.embeddingModelPath === "string" && cfg.embeddingModelPath.trim()
        ? cfg.embeddingModelPath
        : DEFAULT_LOCAL_EMBEDDING_MODEL_PATH,
  };
}

async function runCommand(command: string, args: string[], opts: { cwd?: string; timeoutMs?: number } = {}) {
  return await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let finished = false;
    const timer = setTimeout(() => {
      if (!finished) {
        child.kill("SIGTERM");
      }
    }, opts.timeoutMs ?? DEFAULTS.browserTimeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finished = true;
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finished = true;
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr.trim() || stdout.trim() || `${command} exited with code ${code}`));
      }
    });
  });
}

async function basicFetchExtract(cfg: any, url: string) {
  const res = await fetchWithTimeout(url, {
    timeoutMs: cfg.fetchTimeoutMs,
    headers: { accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8" },
  });
  if (!res.ok) {
    throw new Error(`Fetch returned ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  const html = await res.text();
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? stripHtml(titleMatch[1] ?? "") : "";
  const text = stripHtml(html);
  const links = extractLinksFromHtml(html, cfg.maxLinks);
  return {
    method: "fetch",
    finalUrl: res.url || url,
    title,
    contentType,
    text: text.slice(0, cfg.maxTextChars),
    excerpt: excerpt(text, 400),
    links,
    screenshotPath: undefined,
  };
}

function extractLinksFromHtml(html: string, maxLinks: number) {
  const links: Array<{ url: string; text: string }> = [];
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) && links.length < maxLinks) {
    const href = (match[1] ?? "").trim();
    if (!href || href.startsWith("javascript:")) {
      continue;
    }
    const text = stripHtml(match[2] ?? "");
    links.push({ url: href, text: excerpt(text, 140) });
  }
  return links;
}

async function browserExtract(cfg: any, url: string, screenshot: boolean) {
  const scriptPath = path.join(cfg.extractRoot, "scripts", "extract.mjs");
  await fs.access(scriptPath);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-web-searcher-"));
  const outJson = path.join(tmpDir, "page.json");
  const outShot = screenshot ? path.join(tmpDir, "page.png") : undefined;
  const args = [scriptPath, url, outJson];
  if (outShot) {
    args.push(outShot);
  }
  await runCommand(process.execPath, args, {
    cwd: cfg.extractRoot,
    timeoutMs: cfg.browserTimeoutMs,
  });
  const raw = JSON.parse(await fs.readFile(outJson, "utf8"));
  const text = typeof raw?.text === "string" ? raw.text.slice(0, cfg.maxTextChars) : "";
  return {
    method: "browser",
    finalUrl: typeof raw?.url === "string" ? raw.url : url,
    title: typeof raw?.title === "string" ? raw.title : "",
    excerpt: typeof raw?.excerpt === "string" ? raw.excerpt : excerpt(text, 400),
    text,
    links: Array.isArray(raw?.links) ? ensureWithinLimit(raw.links, cfg.maxLinks) : [],
    screenshotPath: outShot,
  };
}

async function detectLegacyContainers() {
  try {
    const { stdout } = await runCommand("docker", ["ps", "-a", "--format", "{{.Names}}"]);
    const names = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    return names.filter((name) => ["oc-miniflux", "oc-miniflux-db", "oc-memos"].includes(name));
  } catch {
    return [];
  }
}

const plugin = {
  id: "web-searcher",
  name: "Web Searcher",
  description: "Local-first research tools for SearXNG search, checkpointed research runs, and page extraction.",
  configSchema: {
    type: "object",
    additionalProperties: false,
    properties: {
      searxngBaseUrl: { type: "string", default: DEFAULTS.searxngBaseUrl },
      ntfyBaseUrl: { type: "string", default: DEFAULTS.ntfyBaseUrl },
      serviceRoot: { type: "string" },
      runsDir: { type: "string" },
      extractRoot: { type: "string" },
      defaultLanguage: { type: "string", default: DEFAULTS.defaultLanguage },
      defaultLimit: { type: "number", minimum: 1, maximum: 20, default: DEFAULTS.defaultLimit },
      fetchTimeoutMs: { type: "number", minimum: 1000, default: DEFAULTS.fetchTimeoutMs },
      browserTimeoutMs: { type: "number", minimum: 1000, default: DEFAULTS.browserTimeoutMs },
      maxTextChars: { type: "number", minimum: 1000, default: DEFAULTS.maxTextChars },
      maxLinks: { type: "number", minimum: 1, maximum: 100, default: DEFAULTS.maxLinks },
      rerankEnabled: { type: "boolean", default: DEFAULTS.rerankEnabled },
      defaultMode: { type: "string", enum: ["auto", "general", "official-docs", "github", "models", "packages"], default: DEFAULTS.defaultMode },
      defaultRerankVersion: { type: "string", enum: [...SUPPORTED_RERANK_VERSIONS], default: DEFAULTS.defaultRerankVersion },
      embeddingModelPath: { type: "string", default: DEFAULT_LOCAL_EMBEDDING_MODEL_PATH },
    }
  },
  register(api: any) {
    api.registerTool({
      name: "web_searcher_status",
      description: "Check local Web Searcher stack health, artifact paths, and whether legacy Miniflux/Memos containers are still present.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
      async execute() {
        const cfg = resolvePluginCfg(api);
        const status: Record<string, unknown> = {
          pluginId: plugin.id,
          workspaceDir: cfg.workspaceDir,
          serviceRoot: cfg.serviceRoot,
          runsDir: cfg.runsDir,
          components: {},
          legacyContainers: await detectLegacyContainers(),
          rerank: {
            enabled: cfg.rerankEnabled,
            defaultMode: cfg.defaultMode,
            defaultRerankVersion: cfg.defaultRerankVersion,
            availableVersions: [...SUPPORTED_RERANK_VERSIONS],
            strategies: Object.fromEntries(
              SUPPORTED_RERANK_VERSIONS.map((version) => [version, rerankStrategyLabel(version)]),
            ),
            embeddingModelPath: resolveLocalEmbeddingModelPath(cfg),
          },
        };

        try {
          const res = await fetchWithTimeout(`${cfg.searxngBaseUrl.replace(/\/$/, "")}/search?q=openclaw&format=json&language=${encodeURIComponent(cfg.defaultLanguage)}`, {
            timeoutMs: cfg.fetchTimeoutMs,
          });
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          const json = await res.json();
          status.components = {
            ...(status.components as Record<string, unknown>),
            searxng: {
              ok: true,
              resultCount: Array.isArray(json?.results) ? json.results.length : 0,
              unresponsiveEngines: Array.isArray(json?.unresponsive_engines) ? json.unresponsive_engines.length : 0,
            },
          };
        } catch (error) {
          status.components = {
            ...(status.components as Record<string, unknown>),
            searxng: { ok: false, error: error instanceof Error ? error.message : String(error) },
          };
        }

        try {
          const res = await fetchWithTimeout(`${cfg.ntfyBaseUrl.replace(/\/$/, "")}/v1/health`, {
            timeoutMs: cfg.fetchTimeoutMs,
          });
          if (!res.ok) {
            throw new Error(`${res.status} ${res.statusText}`);
          }
          const json = await res.json();
          status.components = {
            ...(status.components as Record<string, unknown>),
            ntfy: { ok: Boolean(json?.healthy), response: json },
          };
        } catch (error) {
          status.components = {
            ...(status.components as Record<string, unknown>),
            ntfy: { ok: false, error: error instanceof Error ? error.message : String(error) },
          };
        }

        try {
          const entries = await fs.readdir(cfg.runsDir, { withFileTypes: true });
          status.artifacts = {
            runCount: entries.filter((entry) => entry.isDirectory()).length,
          };
        } catch (error) {
          status.artifacts = {
            runCount: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }

        return jsonResult(status);
      },
    });

    api.registerTool({
      name: "web_searcher_search",
      description: "Search the local SearXNG research stack and return normalized web results with engine-health hints plus mode-aware reranking.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1 },
          category: { type: "string", enum: ["general", "news", "it", "images", "videos"] },
          language: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 20 },
          safeSearch: { type: "number", minimum: 0, maximum: 2 },
          mode: { type: "string", enum: ["auto", "general", "official-docs", "github", "models", "packages"] },
          rerank: { type: "boolean" },
          rerankVersion: { type: "string", enum: [...SUPPORTED_RERANK_VERSIONS] },
          debug: { type: "boolean" },
          agentContract: {
            type: "object",
            additionalProperties: false,
            properties: {
              taskMode: { type: "string", enum: [...AGENT_TASK_MODES] },
              targetKind: { type: "string", enum: [...AGENT_TARGET_KINDS] },
              sourceTrust: { type: "string", enum: [...AGENT_SOURCE_TRUST_LEVELS] },
            },
          },
        },
        required: ["query"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const cfg = resolvePluginCfg(api);
        const result = await searchSearxng(cfg, {
          query: String(params.query ?? ""),
          category: typeof params.category === "string" ? params.category as SearchCategory : undefined,
          language: typeof params.language === "string" ? params.language : undefined,
          limit: typeof params.limit === "number" ? params.limit : undefined,
          safeSearch: typeof params.safeSearch === "number" ? params.safeSearch : undefined,
          mode: typeof params.mode === "string" ? params.mode as SearchMode : undefined,
          rerank: typeof params.rerank === "boolean" ? params.rerank : undefined,
          rerankVersion: resolveRequestedRerankVersion(params.rerankVersion),
          debug: Boolean(params.debug),
          agentContract: normalizeAgentSearchContract(params.agentContract),
        });
        return jsonResult(result);
      },
    });

    api.registerTool({
      name: "web_searcher_research",
      description: "Run a checkpointed local research search and save search.json + report.md under services/web-searcher/runs/.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1 },
          category: { type: "string", enum: ["general", "news", "it", "images", "videos"] },
          language: { type: "string" },
          limit: { type: "number", minimum: 1, maximum: 20 },
          note: { type: "string" },
          safeSearch: { type: "number", minimum: 0, maximum: 2 },
          mode: { type: "string", enum: ["auto", "general", "official-docs", "github", "models", "packages"] },
          rerank: { type: "boolean" },
          rerankVersion: { type: "string", enum: [...SUPPORTED_RERANK_VERSIONS] },
          debug: { type: "boolean" },
          agentContract: {
            type: "object",
            additionalProperties: false,
            properties: {
              taskMode: { type: "string", enum: [...AGENT_TASK_MODES] },
              targetKind: { type: "string", enum: [...AGENT_TARGET_KINDS] },
              sourceTrust: { type: "string", enum: [...AGENT_SOURCE_TRUST_LEVELS] },
            },
          },
        },
        required: ["query"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const cfg = resolvePluginCfg(api);
        const query = String(params.query ?? "").trim();
        const result = await searchSearxng(cfg, {
          query,
          category: typeof params.category === "string" ? params.category as SearchCategory : undefined,
          language: typeof params.language === "string" ? params.language : undefined,
          limit: typeof params.limit === "number" ? params.limit : undefined,
          safeSearch: typeof params.safeSearch === "number" ? params.safeSearch : undefined,
          mode: typeof params.mode === "string" ? params.mode as SearchMode : undefined,
          rerank: typeof params.rerank === "boolean" ? params.rerank : undefined,
          rerankVersion: resolveRequestedRerankVersion(params.rerankVersion),
          debug: Boolean(params.debug),
          agentContract: normalizeAgentSearchContract(params.agentContract),
        });

        const runId = `${nowIsoCompact()}-${slugify(query)}`;
        const runDir = path.join(cfg.runsDir, runId);
        await fs.mkdir(runDir, { recursive: true });

        const payload = {
          runId,
          createdAt: new Date().toISOString(),
          query,
          requestedCategory: result.requestedCategory,
          categoriesQueried: result.categoriesQueried,
          language: result.language,
          note: typeof params.note === "string" ? params.note : undefined,
          mode: result.mode,
          rerankApplied: result.rerankApplied,
          rerankStrategy: result.rerankStrategy,
          queryIntent: result.queryIntent,
          retrieval: result.retrieval,
          resultCount: result.resultCount,
          totalCandidates: result.totalCandidates,
          unresponsiveEngines: result.unresponsiveEngines,
          results: result.results,
          baseline: result.baseline,
        };

        const searchPath = path.join(runDir, "search.json");
        const reportPath = path.join(runDir, "report.md");
        await fs.writeFile(searchPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
        await fs.writeFile(
          reportPath,
          renderResearchReport({
            query,
            mode: result.mode,
            categoriesQueried: result.categoriesQueried,
            language: result.language,
            note: typeof params.note === "string" ? params.note : undefined,
            runId,
            createdAt: payload.createdAt,
            retrieval: result.retrieval,
            results: result.results,
            unresponsiveEngines: result.unresponsiveEngines,
          }),
          "utf8",
        );

        return jsonResult({
          ...payload,
          runDir,
          artifacts: {
            searchPath,
            reportPath,
          },
        });
      },
    });

    api.registerTool({
      name: "web_searcher_extract",
      description: "Extract readable page content from a URL using local fetch or the Playwright fallback. Can optionally create a screenshot.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: { type: "string", minLength: 1 },
          mode: { type: "string", enum: ["auto", "fetch", "browser"] },
          screenshot: { type: "boolean" },
        },
        required: ["url"],
      },
      async execute(_id: string, params: Record<string, unknown>) {
        const cfg = resolvePluginCfg(api);
        const url = String(params.url ?? "").trim();
        const mode = typeof params.mode === "string" ? params.mode : "auto";
        const screenshot = Boolean(params.screenshot);

        let result: Record<string, unknown>;
        if (mode === "fetch") {
          result = await basicFetchExtract(cfg, url);
        } else if (mode === "browser") {
          result = await browserExtract(cfg, url, screenshot);
        } else {
          const fetched = await basicFetchExtract(cfg, url);
          const fetchedText = typeof fetched.text === "string" ? fetched.text : "";
          if (screenshot || fetchedText.length < 1200) {
            try {
              result = await browserExtract(cfg, url, screenshot);
            } catch {
              result = fetched;
            }
          } else {
            result = fetched;
          }
        }

        return jsonResult(result);
      },
    });
  },
};

export const __test = {
  SUPPORTED_RERANK_VERSIONS,
  DEFAULT_RERANK_VERSION,
  isSupportedRerankVersion,
  areNearDuplicateResults,
  selectCandidateSet,
  searchSearxng,
  fetchSearxngCategory,
  mergeSearchResults,
  countTokenMatches,
  textIncludesQueryPhrase,
  detectQueryIntent,
  buildPlannerOutput,
  resolveQueryCategories,
  resolveQueryCategoriesV14,
  buildRetrievalPlanV14,
  collectSearchCandidates,
  decontaminateResultsV14,
  selectAdaptiveHybridProfile,
  classifyResultType,
  annotateResultDiagnostics,
  rankMergedSearchResults,
  rerankResults,
  rerankResultsV11,
  rerankResultsV12,
  rerankResultsV13,
  rerankResultsV15,
  rerankResultsV20,
  resolveRequestedRerankVersion,
  resolveEffectiveRerankVersion,
  isRetrievalFirstRerankVersion,
  isPlannerCandidateRerankVersion,
};

export default plugin;
