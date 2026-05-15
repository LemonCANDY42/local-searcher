import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { __test } from '../../../.openclaw/extensions/local-searcher/index.ts';
import {
  aggregatePackMetrics,
  aggregateVersionMetrics,
  buildComparisonPairs,
  buildSharedCandidatePool,
  buildSelectedCases,
  expandSurfaceLayerNames,
  formatResultList,
  nowIsoCompact,
  parseCandidateMode,
  parseLayerSelection,
  parsePackSelection,
  parsePositiveInt,
  parseSurfaceSelection,
  parseVersionSelection,
  qualityMetrics,
  summarizeQualityDelta,
  summarizePairwiseComparison,
  summarizePromotionOutcome,
} from './lib/search-benchmark-core.mjs';
import {
  BENCHMARK_LAYERS,
  BENCHMARK_PACKS,
  BENCHMARK_SURFACES,
  BENCHMARK_TRACKS,
  CASE_POOLS,
  DEFAULT_BENCHMARK_PACK_NAMES,
  DEFAULT_BENCHMARK_SURFACE_NAMES,
} from './lib/search-benchmark-packs.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, '..');
const runsRoot = path.join(serviceRoot, 'runs');

const DEFAULT_SEED = 'local-searcher-benchmark';
const DEFAULT_RESULT_LIMIT = 8;

const cfg = {
  searxngBaseUrl: 'http://127.0.0.1:18080',
  fetchTimeoutMs: 20000,
  defaultLanguage: 'en-US',
  defaultLimit: DEFAULT_RESULT_LIMIT,
  rerankEnabled: true,
  defaultMode: 'auto',
  defaultRerankVersion: __test.DEFAULT_RERANK_VERSION,
  embeddingModelPath: path.join(process.env.HOME || '', '.cache', 'openclaw-memory-models', 'embeddinggemma-300m-qat-Q8_0.gguf'),
};

function ensureSupportedVersion(version, supportedVersions, label) {
  if (!supportedVersions.includes(version)) {
    throw new Error(`${label} "${version}" is unsupported. Available versions: ${supportedVersions.join(', ')}`);
  }
  return version;
}

function formatSigned(value, digits = 3) {
  const rounded = Number(value.toFixed(digits));
  return `${rounded >= 0 ? '+' : ''}${rounded}`;
}

function formatPercentage(value) {
  const rounded = Number(value.toFixed(1));
  return `${rounded >= 0 ? '+' : ''}${rounded}%`;
}

function summarizeBreakdown(entries, key) {
  if (!Array.isArray(entries) || entries.length === 0) return 'none';
  return entries
    .slice(0, 5)
    .map((item) => `${item.name} (${key === 'wins' ? item.wins : item.regressions} ${key})`)
    .join(', ');
}

function summarizeCases(items) {
  if (!Array.isArray(items) || items.length === 0) return 'none';
  return items
    .slice(0, 6)
    .map((item) => `${item.name} [${item.signal.metric} ${formatSigned(item.signal.delta, 4)}; ${formatSigned(item.latencyDeltaMs, 1)} ms]`)
    .join(', ');
}

function summarizePackBreakdown(entries, selectedPackNames) {
  return selectedPackNames.map((packName) => {
    const item = entries.find((entry) => entry.name === packName);
    if (!item) return `${packName}: 0W/0R/0T`;
    return `${packName}: ${item.wins}W/${item.regressions}R/${item.ties}T`;
  }).join(', ');
}

function summarizeLayerBreakdown(entries, selectedLayerNames) {
  return selectedLayerNames.map((layerName) => {
    const item = entries.find((entry) => entry.name === layerName);
    if (!item) return `${layerName}: 0W/0R/0T`;
    return `${layerName}: ${item.wins}W/${item.regressions}R/${item.ties}T`;
  }).join(', ');
}

function summarizeScalarCoverage(cases, fieldName) {
  const counts = new Map();
  for (const testCase of cases) {
    const value = testCase[fieldName];
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, caseCount]) => ({ name, caseCount }))
    .sort((left, right) => right.caseCount - left.caseCount || left.name.localeCompare(right.name));
}

function summarizeArrayCoverage(cases, fieldName) {
  const counts = new Map();
  for (const testCase of cases) {
    for (const value of testCase[fieldName] || []) {
      counts.set(value, (counts.get(value) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, caseCount]) => ({ name, caseCount }))
    .sort((left, right) => right.caseCount - left.caseCount || left.name.localeCompare(right.name));
}

function formatCoverageTable(label, entries) {
  return [
    `| ${label} | Cases |`,
    '|---|---:|',
    ...entries.map((item) => `| ${item.name} | ${item.caseCount} |`),
  ];
}

function formatAggregateTable(aggregates) {
  return [
    '| Version | Mean latency ms | Mean expected top3 | Mean expected top5 | Mean expected coverage top3 | Mean unique hosts top5 | Mean unique source families top5 | Mean preferred top3* | Mean demoted top3* | Mean MRR preferred* | Top1 preferred rate* |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...aggregates.map((item) => `| ${item.version} | ${item.meanLatencyMs} | ${item.meanExpectedTop3} | ${item.meanExpectedTop5} | ${item.meanExpectedCoverageTop3} | ${item.meanUniqueHostsTop5} | ${item.meanUniqueSourceFamiliesTop5} | ${item.meanPreferredTop3} | ${item.meanDemotedTop3} | ${item.meanMrrPreferred} | ${item.top1PreferredRate} |`),
  ];
}

function parseBooleanFlag(input, defaultValue = false) {
  if (input == null || String(input).trim() === '') {
    return defaultValue;
  }
  const normalized = String(input).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Expected boolean-like env flag, got "${input}"`);
}

function normalizeQueryText(input) {
  return String(input || '').normalize('NFKC').toLowerCase();
}

function deriveBenchmarkAgentContract(testCase) {
  const query = normalizeQueryText(testCase.query);
  const compareLike = /^compare\s/.test(query) || [' compare', 'comparison', ' versus', ' vs ', ' alternatives', ' alternative', ' landscape', ' 对比', ' 比较'].some((cue) => query.includes(cue));
  const modelChoiceLike = compareLike && ['gguf', 'model', 'modelscope', 'huggingface', 'checkpoint', 'quant', 'coding assistant'].some((cue) => query.includes(cue));
  const releaseArtifactLike = testCase.mode === 'official-docs' && ['release notes', 'changelog'].some((cue) => query.includes(cue));
  const whatsNewLike = testCase.mode === 'official-docs' && ["what's new", 'what is new'].some((cue) => query.includes(cue));
  const exactOfficialDocLike = testCase.mode === 'official-docs' && !releaseArtifactLike && !whatsNewLike && [' official', ' docs', ' documentation', ' api ', ' reference', ' manual'].some((cue) => query.includes(cue));

  if (releaseArtifactLike) {
    return {
      taskMode: 'extract',
      targetKind: 'release-artifact',
      sourceTrust: 'official-first',
    };
  }
  if (whatsNewLike) {
    return {
      taskMode: 'extract',
      targetKind: 'whats-new',
      sourceTrust: 'official-first',
    };
  }
  if (exactOfficialDocLike) {
    return {
      taskMode: 'lookup',
      targetKind: 'official-doc',
      sourceTrust: 'official-first',
    };
  }
  if (modelChoiceLike) {
    return {
      taskMode: 'compare',
      targetKind: 'model-choice',
      sourceTrust: 'balanced',
    };
  }
  if (compareLike) {
    return {
      taskMode: 'compare',
      targetKind: 'product-eval',
      sourceTrust: 'balanced',
    };
  }
  return null;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function aggregateBaselineEntries(entries, label) {
  const filtered = entries.filter(Boolean);
  if (filtered.length === 0) return null;
  const qualities = filtered.map((item) => item.quality);
  const preferredEntries = filtered.filter((item) => Number.isFinite(item.quality?.preferredTop3));
  return {
    label,
    caseCount: filtered.length,
    meanLatencyMs: Number(average(filtered.map((item) => item.latencyMs ?? 0)).toFixed(1)),
    meanExpectedTop3: Number(average(qualities.map((item) => item?.expectedTop3 ?? 0)).toFixed(3)),
    meanExpectedTop5: Number(average(qualities.map((item) => item?.expectedTop5 ?? 0)).toFixed(3)),
    meanExpectedCoverageTop3: Number(average(qualities.map((item) => item?.expectedCoverageTop3 ?? 0)).toFixed(4)),
    meanUniqueHostsTop5: Number(average(qualities.map((item) => item?.uniqueHostsTop5 ?? 0)).toFixed(3)),
    meanUniqueSourceFamiliesTop5: Number(average(qualities.map((item) => item?.uniqueSourceFamiliesTop5 ?? 0)).toFixed(3)),
    meanPreferredTop3: Number(average(preferredEntries.map((item) => item.quality?.preferredTop3 ?? 0)).toFixed(3)),
    meanDemotedTop3: Number(average(preferredEntries.map((item) => item.quality?.demotedTop3 ?? 0)).toFixed(3)),
    meanMrrPreferred: Number(average(preferredEntries.map((item) => item.quality?.mrrPreferred ?? 0)).toFixed(4)),
  };
}

function aggregateQualityDeltas(deltas, label) {
  const filtered = deltas.filter(Boolean);
  if (filtered.length === 0) return null;
  return {
    label,
    caseCount: filtered.length,
    expectedTop3Delta: Number(average(filtered.map((item) => item.expectedTop3Delta ?? 0)).toFixed(3)),
    expectedCoverageTop3Delta: Number(average(filtered.map((item) => item.expectedCoverageTop3Delta ?? 0)).toFixed(4)),
    expectedTop5Delta: Number(average(filtered.map((item) => item.expectedTop5Delta ?? 0)).toFixed(3)),
    preferredTop3Delta: Number(average(filtered.map((item) => item.preferredTop3Delta ?? 0)).toFixed(3)),
    demotedTop3Delta: Number(average(filtered.map((item) => item.demotedTop3Delta ?? 0)).toFixed(3)),
    uniqueHostsTop5Delta: Number(average(filtered.map((item) => item.uniqueHostsTop5Delta ?? 0)).toFixed(3)),
    uniqueSourceFamiliesTop5Delta: Number(average(filtered.map((item) => item.uniqueSourceFamiliesTop5Delta ?? 0)).toFixed(3)),
    mrrPreferredDelta: Number(average(filtered.map((item) => item.mrrPreferredDelta ?? 0)).toFixed(4)),
  };
}

function formatStepDelta(delta) {
  if (!delta) return 'n/a';
  return [
    `top3 ${formatSigned(delta.expectedTop3Delta)}`,
    `coverage ${formatSigned(delta.expectedCoverageTop3Delta, 4)}`,
    `prefTop3 ${formatSigned(delta.preferredTop3Delta)}`,
    `hosts ${formatSigned(delta.uniqueHostsTop5Delta)}`,
    `families ${formatSigned(delta.uniqueSourceFamiliesTop5Delta)}`,
  ].join(', ');
}

const supportedVersions = [...__test.SUPPORTED_RERANK_VERSIONS];
const explicitPackSelection = process.env.SEARCH_INFO_BENCHMARK_PACKS?.trim() || '';
const explicitLayerSelection = process.env.SEARCH_INFO_BENCHMARK_LAYERS?.trim() || '';
const selectedSurfaceNames = parseSurfaceSelection(
  process.env.SEARCH_INFO_BENCHMARK_SURFACES,
  BENCHMARK_SURFACES.map((surface) => surface.name),
  DEFAULT_BENCHMARK_SURFACE_NAMES,
);
const surfaceDerivedLayerNames = expandSurfaceLayerNames(selectedSurfaceNames, BENCHMARK_SURFACES);
const selectedLayerNames = explicitPackSelection
  ? []
  : parseLayerSelection(
      explicitLayerSelection,
      BENCHMARK_LAYERS.map((layer) => layer.name),
      surfaceDerivedLayerNames,
    );
const explicitPackNames = explicitPackSelection
  ? parsePackSelection(
      explicitPackSelection,
      BENCHMARK_PACKS.map((pack) => pack.name),
      DEFAULT_BENCHMARK_PACK_NAMES,
    )
  : [];
const selectedSurfaces = BENCHMARK_SURFACES.filter((surface) => selectedSurfaceNames.includes(surface.name));
const versions = parseVersionSelection(process.env.SEARCH_INFO_BENCHMARK_VERSIONS, supportedVersions, supportedVersions);
const liveDefaultVersion = ensureSupportedVersion(
  process.env.SEARCH_INFO_BENCHMARK_LIVE_DEFAULT?.trim() || __test.DEFAULT_RERANK_VERSION,
  supportedVersions,
  'Live default version',
);
const defaultFocusVersion = versions.at(-1) && versions.at(-1) !== liveDefaultVersion
  ? versions.at(-1)
  : liveDefaultVersion;
const focusVersion = ensureSupportedVersion(
  process.env.SEARCH_INFO_BENCHMARK_FOCUS_VERSION?.trim() || defaultFocusVersion,
  versions,
  'Focus version',
);
const seed = process.env.SEARCH_INFO_BENCHMARK_SEED || DEFAULT_SEED;
const caseLimit = parsePositiveInt(process.env.SEARCH_INFO_BENCHMARK_CASE_LIMIT);
const resultLimit = parsePositiveInt(process.env.SEARCH_INFO_BENCHMARK_RESULT_LIMIT) ?? DEFAULT_RESULT_LIMIT;
const candidateMode = parseCandidateMode(process.env.SEARCH_INFO_BENCHMARK_CANDIDATE_MODE);
const includeRawSearxngBaseline = parseBooleanFlag(process.env.SEARCH_INFO_BENCHMARK_INCLUDE_RAW_SEARXNG, false);
const includeAgentContract = parseBooleanFlag(process.env.SEARCH_INFO_BENCHMARK_AGENT_CONTRACT, false);

cfg.defaultLimit = resultLimit;

const baselineRetrievalVersion = [...versions].reverse().find((version) => !__test.isRetrievalFirstRerankVersion(version)) ?? liveDefaultVersion;
const retrievalVersions = [...new Set(versions.map((version) => (__test.isRetrievalFirstRerankVersion(version) ? version : baselineRetrievalVersion)))];

function retrievalVersionFor(version) {
  return __test.isRetrievalFirstRerankVersion(version) ? version : baselineRetrievalVersion;
}

const cases = buildSelectedCases({
  casePools: CASE_POOLS,
  selectedPackNames: explicitPackNames.length > 0 ? explicitPackNames : null,
  selectedLayerNames: explicitPackNames.length === 0 ? selectedLayerNames : null,
  seedText: seed,
  caseLimit,
});

if (cases.length === 0) {
  if (explicitPackNames.length > 0) {
    throw new Error(`No benchmark cases matched selected packs: ${explicitPackNames.join(', ')}`);
  }
  throw new Error(`No benchmark cases matched selected layers: ${selectedLayerNames.join(', ')}`);
}

const selectedPackNames = (explicitPackNames.length > 0
  ? explicitPackNames
  : BENCHMARK_PACKS.map((pack) => pack.name).filter((packName) => cases.some((testCase) => testCase.packNames.includes(packName))));
const selectedPacks = BENCHMARK_PACKS.filter((pack) => selectedPackNames.includes(pack.name));
const effectiveLayerNames = (selectedLayerNames.length > 0
  ? selectedLayerNames
  : BENCHMARK_LAYERS.map((layer) => layer.name).filter((layerName) => cases.some((testCase) => (testCase.layerNames || []).includes(layerName))));
const selectedLayers = BENCHMARK_LAYERS.filter((layer) => effectiveLayerNames.includes(layer.name));
const layerCoverage = effectiveLayerNames.map((layerName) => {
  const layerCases = cases.filter((testCase) => (testCase.layerNames || []).includes(layerName));
  const layer = selectedLayers.find((item) => item.name === layerName);
  return {
    name: layerName,
    gateRole: layer?.gateRole ?? 'unknown',
    evaluationPriority: layer?.evaluationPriority ?? 'unknown',
    caseCount: layerCases.length,
    buckets: [...new Set(layerCases.map((testCase) => testCase.bucket))].sort(),
    intentFamilies: [...new Set(layerCases.map((testCase) => testCase.intentFamily).filter(Boolean))].sort(),
    sourceRoleFamilies: [...new Set(layerCases.map((testCase) => testCase.sourceRoleFamily).filter(Boolean))].sort(),
    operatorRepresentativeCount: layerCases.filter((testCase) => (testCase.representationTags || []).includes('operator-high-frequency-representative')).length,
    description: layer?.description ?? '',
  };
});
const coverageSummary = {
  intentFamilies: summarizeScalarCoverage(cases, 'intentFamily'),
  sourceRoleFamilies: summarizeScalarCoverage(cases, 'sourceRoleFamily'),
  representationTags: summarizeArrayCoverage(cases, 'representationTags'),
};
const evaluationTracks = BENCHMARK_TRACKS;
const runId = `${nowIsoCompact()}-local-searcher-benchmark`;
const runDir = path.join(runsRoot, runId);
await fs.mkdir(runDir, { recursive: true });

const raw = [];

for (const testCase of cases) {
  const agentContract = includeAgentContract ? deriveBenchmarkAgentContract(testCase) : null;
  const common = {
    query: testCase.query,
    category: testCase.category,
    mode: testCase.mode,
    language: testCase.language,
    limit: resultLimit,
    safeSearch: 0,
    debug: true,
    agentContract,
  };

  const baselineIntent = __test.detectQueryIntent(common.query, common.mode, common.category, common.agentContract);
  const rawBaselineCategories = __test.resolveQueryCategories(common.category, baselineIntent);
  let rawSearxngBaseline = null;
  if (includeRawSearxngBaseline) {
    const rawStart = performance.now();
    const rawGroups = [];
    for (const category of rawBaselineCategories) {
      rawGroups.push(await __test.fetchSearxngCategory(cfg, {
        query: common.query,
        category,
        language: common.language,
        safeSearch: common.safeSearch,
        perCategoryLimit: Math.max(common.limit * 2, 10),
      }));
    }
    const merged = __test.mergeSearchResults(rawGroups);
    const rawLatencyMs = Number((performance.now() - rawStart).toFixed(1));
    rawSearxngBaseline = {
      label: 'raw-searxng',
      categoriesQueried: rawBaselineCategories,
      fetchLatencyMs: rawLatencyMs,
      rerankLatencyMs: 0,
      latencyMs: rawLatencyMs,
      retrieval: {
        strategy: 'raw-searxng-baseline',
        categoriesQueried: rawBaselineCategories,
        variants: [
          {
            query: common.query,
            categories: rawBaselineCategories,
            rationale: ['raw-original-query'],
          },
        ],
      },
      decontamination: undefined,
      quality: qualityMetrics(merged.results, testCase),
      results: merged.results,
    };
  }

  const retrievalCache = new Map();
  for (const retrievalVersion of retrievalVersions) {
    const fetchStart = performance.now();
    const retrieved = await __test.collectSearchCandidates(cfg, {
      query: common.query,
      category: common.category,
      language: common.language,
      safeSearch: common.safeSearch,
      limit: common.limit,
      mode: common.mode,
      rerankVersion: retrievalVersion,
      debug: common.debug,
      agentContract: common.agentContract,
    });
    retrievalCache.set(retrievalVersion, {
      version: retrievalVersion,
      retrieved,
      fetchLatencyMs: Number((performance.now() - fetchStart).toFixed(1)),
    });
  }

  const sharedCandidatePool = candidateMode === 'shared-union'
    ? buildSharedCandidatePool(
        retrievalVersions.map((version) => retrievalCache.get(version)),
        { sourceVersions: retrievalVersions },
      )
    : null;

  const versionEntries = {};
  const retrievalOnlyEntries = {};
  for (const version of versions) {
    const retrievalVersion = retrievalVersionFor(version);
    const cached = retrievalCache.get(retrievalVersion);
    const candidatePool = sharedCandidatePool
      ? {
          merged: sharedCandidatePool.merged,
          retrievalPlan: {
            strategy: 'shared-candidate-union',
            sourceVersions: sharedCandidatePool.sourceVersions,
            variants: sharedCandidatePool.sourceVersions.map((sourceVersion) => retrievalCache.get(sourceVersion)?.retrieved?.retrievalPlan).filter(Boolean),
          },
          decontamination: {
            shared: true,
            sourceVersions: sharedCandidatePool.sourceVersions,
            combinedFetchLatencyMs: sharedCandidatePool.fetchLatencyMs,
          },
          fetchLatencyMs: 0,
          candidatePoolFetchLatencyMs: sharedCandidatePool.fetchLatencyMs,
        }
      : {
          merged: cached.retrieved.merged,
          retrievalPlan: cached.retrieved.retrievalPlan,
          decontamination: cached.retrieved.decontamination,
          fetchLatencyMs: cached.fetchLatencyMs,
          candidatePoolFetchLatencyMs: cached.fetchLatencyMs,
        };
    if (!retrievalOnlyEntries[retrievalVersion]) {
      retrievalOnlyEntries[retrievalVersion] = {
        label: `retrieval-only:${retrievalVersion}`,
        retrievalVersion: sharedCandidatePool
          ? `shared-union(${sharedCandidatePool.sourceVersions.join(',')})`
          : retrievalVersion,
        candidateMode,
        fetchLatencyMs: candidatePool.fetchLatencyMs,
        rerankLatencyMs: 0,
        latencyMs: candidatePool.fetchLatencyMs,
        retrieval: candidatePool.retrievalPlan,
        decontamination: candidatePool.decontamination,
        quality: qualityMetrics(candidatePool.merged.results, testCase),
        results: candidatePool.merged.results,
      };
    }
    const rankStart = performance.now();
    const ranked = await __test.rankMergedSearchResults(cfg, candidatePool.merged, {
      query: common.query,
      category: common.category,
      mode: common.mode,
      limit: common.limit,
      debug: common.debug,
      rerankVersion: version,
      agentContract: common.agentContract,
    });
    const rerankLatencyMs = Number((performance.now() - rankStart).toFixed(1));
    const fetchLatencyMs = candidatePool.fetchLatencyMs;
    versionEntries[version] = {
      fetchLatencyMs,
      candidatePoolFetchLatencyMs: candidatePool.candidatePoolFetchLatencyMs,
      rerankLatencyMs,
      latencyMs: Number((fetchLatencyMs + rerankLatencyMs).toFixed(1)),
      retrievalVersion: sharedCandidatePool
        ? `shared-union(${sharedCandidatePool.sourceVersions.join(',')})`
        : retrievalVersion,
      candidateMode,
      rerankVersion: ranked.effectiveRerankVersion,
      rerankStrategy: ranked.effectiveRerankVersion === version
        ? version
        : `${version} (fallback ${ranked.effectiveRerankVersion})`,
      embedding: ranked.embeddingInfo,
      adaptiveHybrid: ranked.adaptiveProfile,
      retrieval: candidatePool.retrievalPlan,
      decontamination: candidatePool.decontamination,
      quality: qualityMetrics(ranked.finalResults, testCase),
      results: ranked.finalResults,
    };
  }

  const stepComparisons = Object.fromEntries(versions.map((version) => {
    const retrievalVersion = retrievalVersionFor(version);
    const retrievalOnly = retrievalOnlyEntries[retrievalVersion];
    return [version, {
      retrievalOnly: retrievalOnly ? summarizeQualityDelta(versionEntries[version].quality, retrievalOnly.quality) : null,
      rawSearxng: rawSearxngBaseline ? summarizeQualityDelta(versionEntries[version].quality, rawSearxngBaseline.quality) : null,
    }];
  }));

  raw.push({
    testCase,
    agentContract,
    baselines: {
      rawSearxng: rawSearxngBaseline,
      retrievalOnly: retrievalOnlyEntries,
    },
    stepComparisons,
    versions: versionEntries,
  });
}

const aggregates = versions.map((version) => aggregateVersionMetrics(raw, version));
const aggregateMap = Object.fromEntries(aggregates.map((item) => [item.version, item]));
const retrievalBaselineAggregates = retrievalVersions
  .map((retrievalVersion) => aggregateBaselineEntries(raw.map((item) => item.baselines?.retrievalOnly?.[retrievalVersion]), `retrieval-only:${retrievalVersion}`))
  .filter(Boolean);
const rawSearxngAggregate = includeRawSearxngBaseline
  ? aggregateBaselineEntries(raw.map((item) => item.baselines?.rawSearxng), 'raw-searxng')
  : null;
const stepComparisonAggregates = versions.map((version) => ({
  version,
  retrievalVersion: retrievalVersionFor(version),
  retrievalOnlyLift: aggregateQualityDeltas(raw.map((item) => item.stepComparisons?.[version]?.retrievalOnly), `rerank-vs-retrieval-only:${version}`),
  rawSearxngLift: includeRawSearxngBaseline
    ? aggregateQualityDeltas(raw.map((item) => item.stepComparisons?.[version]?.rawSearxng), `rerank-vs-raw-searxng:${version}`)
    : null,
}));
const packAggregates = aggregatePackMetrics(raw, versions, selectedPackNames).map((item) => ({
  ...item,
  description: selectedPacks.find((pack) => pack.name === item.packName)?.description ?? '',
}));
const pairwiseComparisons = buildComparisonPairs({
  versions,
  focusVersion,
  liveDefaultVersion,
}).map((pair) => ({
  ...pair,
  ...summarizePairwiseComparison(raw, pair.leftVersion, pair.rightVersion, aggregateMap),
}));
const focusVsLivePair = pairwiseComparisons.find((item) => item.leftVersion === focusVersion && item.rightVersion === liveDefaultVersion) ?? null;
const promotionSummary = summarizePromotionOutcome(focusVsLivePair, focusVersion, liveDefaultVersion, {
  layerDefinitions: selectedLayers,
});
const fallbackUsage = raw.flatMap((item) => versions.flatMap((version) => {
  const embedding = item.versions[version].embedding;
  if (!embedding?.fallback) {
    return [];
  }
  return [{
    case: item.testCase.name,
    version,
    fallback: embedding.fallback,
    reason: embedding.reason || 'unknown',
  }];
}));

const packCoverage = selectedPacks.map((pack) => {
  const packCases = cases.filter((testCase) => testCase.packNames.includes(pack.name));
  return {
    name: pack.name,
    description: pack.description,
    caseCount: packCases.length,
    buckets: [...new Set(packCases.map((testCase) => testCase.bucket))].sort(),
  };
});

const caseMatrixHeader = [
  '| Case | Layers | Bucket | Query |',
  ...versions.map((version) => ` ${version} expected top3 | ${version} pref top3 | ${version} ms |`),
].join('');
const caseMatrixDivider = [
  '|---|---|---|---|',
  ...versions.map(() => '---:|---:|---:|'),
].join('');

const reportLines = [
  '# local-searcher benchmark / compare report',
  '',
  `- Run ID: \`${runId}\``,
  `- Seed: \`${seed}\``,
  `- Evaluation tracks: ${evaluationTracks.map((track) => `\`${track.name}\`→\`${track.candidateMode}\``).join(', ')}`,
  `- Surfaces: ${selectedSurfaceNames.map((name) => `\`${name}\``).join(', ')}`,
  `- Layers: ${effectiveLayerNames.map((name) => `\`${name}\``).join(', ')}`,
  `- Packs: ${selectedPackNames.map((name) => `\`${name}\``).join(', ')}`,
  `- Candidate mode: \`${candidateMode}\`${candidateMode === 'shared-union' ? ' (shared candidate pool; rerank-only per-version latency)' : ''}`,
  `- Cases: ${cases.length}`,
  `- Versions: ${versions.map((version) => `\`${version}\``).join(', ')}`,
  `- Focus version: \`${focusVersion}\``,
  `- Live default: \`${liveDefaultVersion}\``,
  `- Retrieval baseline version: \`${baselineRetrievalVersion}\``,
  `- Layered baselines: \`retrieval-only\` active, \`final-ranking\` active, \`raw-searxng\` ${includeRawSearxngBaseline ? 'enabled' : 'available via SEARCH_INFO_BENCHMARK_INCLUDE_RAW_SEARXNG=1'}`,
  `- Agent-aware contract: ${includeAgentContract ? '`enabled via SEARCH_INFO_BENCHMARK_AGENT_CONTRACT=1`' : '`disabled`'}`,
  `- Limit per query: ${resultLimit}`,
  `- Generated at: ${new Date().toISOString()}`,
  fallbackUsage.length > 0
    ? `- Semantic fallback: \`${fallbackUsage[0].fallback}\` used in this run because the local embedding backend was unavailable in the current sandbox/runtime.`
    : '- Semantic fallback: not used',
  '',
  '## Benchmark 2.0 structure',
  '',
  '| Surface | Layers | Description |',
  '|---|---|---|',
  ...selectedSurfaces.map((surface) => `| ${surface.name} | ${(surface.layerNames || []).join(', ')} | ${surface.description || ''} |`),
  '',
  '## Layer coverage',
  '',
  '| Layer | Gate role | Priority | Cases | Buckets | Intent families | Source-role families | Operator-representative cases | Description |',
  '|---|---|---|---:|---|---|---|---:|---|',
  ...layerCoverage.map((item) => `| ${item.name} | ${item.gateRole} | ${item.evaluationPriority} | ${item.caseCount} | ${item.buckets.join(', ')} | ${item.intentFamilies.join(', ')} | ${item.sourceRoleFamilies.join(', ')} | ${item.operatorRepresentativeCount} | ${item.description} |`),
  '',
  '## Coverage summary',
  '',
  ...formatCoverageTable('Intent family', coverageSummary.intentFamilies),
  '',
  ...formatCoverageTable('Source-role family', coverageSummary.sourceRoleFamilies),
  '',
  ...formatCoverageTable('Representation tag', coverageSummary.representationTags),
  '',
  '## Pack coverage',
  '',
  '| Pack | Cases | Buckets | Description |',
  '|---|---:|---|---|',
  ...packCoverage.map((item) => `| ${item.name} | ${item.caseCount} | ${item.buckets.join(', ')} | ${item.description} |`),
  '',
  '## Aggregate summary',
  '',
  ...formatAggregateTable(aggregates),
  '',
  '- `*` preferred/demoted source metrics are calculated only on cases that declare preferred hosts.',
  '',
  '## Layered baselines',
  '',
  '| Baseline | Cases | Mean latency ms | Mean expected top3 | Mean expected coverage top3 | Mean unique hosts top5 | Mean unique source families top5 | Mean preferred top3* |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...(rawSearxngAggregate
    ? [`| ${rawSearxngAggregate.label} | ${rawSearxngAggregate.caseCount} | ${rawSearxngAggregate.meanLatencyMs} | ${rawSearxngAggregate.meanExpectedTop3} | ${rawSearxngAggregate.meanExpectedCoverageTop3} | ${rawSearxngAggregate.meanUniqueHostsTop5} | ${rawSearxngAggregate.meanUniqueSourceFamiliesTop5} | ${rawSearxngAggregate.meanPreferredTop3} |`]
    : ['| raw-searxng | 0 | n/a | n/a | n/a | n/a | n/a | n/a |']),
  ...retrievalBaselineAggregates.map((item) => `| ${item.label} | ${item.caseCount} | ${item.meanLatencyMs} | ${item.meanExpectedTop3} | ${item.meanExpectedCoverageTop3} | ${item.meanUniqueHostsTop5} | ${item.meanUniqueSourceFamiliesTop5} | ${item.meanPreferredTop3} |`),
  '',
  '## Step-specific comparison summary',
  '',
  '| Version | Retrieval baseline | Rerank lift vs retrieval-only | Rerank lift vs raw SearXNG |',
  '|---|---|---|---|',
  ...stepComparisonAggregates.map((item) => `| ${item.version} | retrieval-only:${item.retrievalVersion} | ${formatStepDelta(item.retrievalOnlyLift)} | ${formatStepDelta(item.rawSearxngLift)} |`),
  '',
  '## Pack summary',
  '',
];

for (const pack of packAggregates) {
  reportLines.push(`### ${pack.packName}`);
  reportLines.push('');
  reportLines.push(`- Cases: ${pack.caseCount}`);
  if (pack.description) {
    reportLines.push(`- Description: ${pack.description}`);
  }
  reportLines.push('');
  reportLines.push(...formatAggregateTable(pack.aggregates));
  reportLines.push('');
}

reportLines.push('## Explicit cross-version comparisons');
reportLines.push('');

for (const pair of pairwiseComparisons) {
  reportLines.push(`### ${pair.label}`);
  reportLines.push('');
  reportLines.push(`- Rationale: \`${pair.rationale}\``);
  reportLines.push(`- Outcome counts: ${pair.winCount} wins / ${pair.regressionCount} regressions / ${pair.tieCount} ties`);
  reportLines.push(`- Aggregate diff: latency ${formatSigned(pair.aggregateDiff.latencyDeltaMs, 1)} ms (${formatPercentage(pair.aggregateDiff.latencyDeltaPct)}), expected top3 ${formatSigned(pair.aggregateDiff.expectedTop3Delta)}, expected coverage ${formatSigned(pair.aggregateDiff.expectedCoverageTop3Delta, 4)}, unique hosts top5 ${formatSigned(pair.aggregateDiff.uniqueHostsTop5Delta)}, unique source families top5 ${formatSigned(pair.aggregateDiff.uniqueSourceFamiliesTop5Delta)}, preferred top3 ${formatSigned(pair.aggregateDiff.preferredTop3Delta)}, demoted top3 ${formatSigned(pair.aggregateDiff.demotedTop3Delta)}, MRR ${formatSigned(pair.aggregateDiff.mrrDelta, 4)}.`);
  reportLines.push(`- Pack breakdown: ${summarizePackBreakdown(pair.packBreakdown, selectedPackNames)}`);
  reportLines.push(`- Layer breakdown: ${summarizeLayerBreakdown(pair.layerBreakdown, effectiveLayerNames)}`);
  reportLines.push(`- Bucket wins: ${summarizeBreakdown(pair.bucketBreakdown.filter((item) => item.wins > 0), 'wins')}`);
  reportLines.push(`- Bucket regressions: ${summarizeBreakdown(pair.bucketBreakdown.filter((item) => item.regressions > 0), 'regressions')}`);
  reportLines.push(`- Case wins: ${summarizeCases(pair.wins)}`);
  reportLines.push(`- Case regressions: ${summarizeCases(pair.regressions)}`);
  reportLines.push('');
}

reportLines.push('## Promotion lens');
reportLines.push('');
reportLines.push(`- Focus/live comparison: \`${focusVersion}\` vs \`${liveDefaultVersion}\``);
reportLines.push(`- Recommendation: \`${promotionSummary.recommendation}\``);
reportLines.push(`- Status: \`${promotionSummary.status}\``);
if (promotionSummary.overall) {
  reportLines.push(`- Overall: ${promotionSummary.overall.wins} wins / ${promotionSummary.overall.regressions} regressions / ${promotionSummary.overall.ties} ties; expected top3 ${formatSigned(promotionSummary.overall.aggregateDiff.expectedTop3Delta)}, expected coverage ${formatSigned(promotionSummary.overall.aggregateDiff.expectedCoverageTop3Delta, 4)}, latency ${formatSigned(promotionSummary.overall.aggregateDiff.latencyDeltaMs, 1)} ms (${formatPercentage(promotionSummary.overall.aggregateDiff.latencyDeltaPct)}).`);
}
if (promotionSummary.layerReadout) {
  reportLines.push(`- Layer gate readout: ${summarizeLayerBreakdown(Object.values(promotionSummary.layerReadout), effectiveLayerNames)}`);
}
reportLines.push(`- Reasons: ${promotionSummary.reasons.join(' ')}`);
reportLines.push('');
reportLines.push('## Case matrix');
reportLines.push('');
reportLines.push(caseMatrixHeader);
reportLines.push(caseMatrixDivider);
reportLines.push(...raw.map((item) => [
  `| ${item.testCase.name}`,
  ` ${(item.testCase.layerNames || []).join(', ')}`,
  ` ${item.testCase.bucket}`,
  ` ${item.testCase.query.replace(/\|/g, '/')}`,
  ...versions.flatMap((version) => [
    ` ${item.versions[version].quality.expectedTop3}`,
    ` ${item.versions[version].quality.preferredTop3}`,
    ` ${item.versions[version].latencyMs}`,
  ]),
].join(' |') + ' |'));
reportLines.push('');
reportLines.push('## Detailed results');
reportLines.push('');

for (const item of raw) {
  reportLines.push(`### ${item.testCase.name}`);
  reportLines.push('');
  reportLines.push(`- Packs: \`${item.testCase.packNames.join(', ')}\``);
  reportLines.push(`- Layers: \`${(item.testCase.layerNames || []).join(', ')}\``);
  reportLines.push(`- Bucket / focus: \`${item.testCase.bucket}\` / \`${item.testCase.qualityFocus}\``);
  if (item.testCase.intentFamily) {
    reportLines.push(`- Intent family: \`${item.testCase.intentFamily}\``);
  }
  if (item.testCase.sourceRoleFamily) {
    reportLines.push(`- Source-role family: \`${item.testCase.sourceRoleFamily}\``);
  }
  if ((item.testCase.representationTags || []).length > 0) {
    reportLines.push(`- Representation tags: \`${item.testCase.representationTags.join(', ')}\``);
  }
  reportLines.push(`- Query: \`${item.testCase.query}\``);
  reportLines.push(`- Mode/category/language: \`${item.testCase.mode}\` / \`${item.testCase.category}\` / \`${item.testCase.language}\``);
  if (item.agentContract) {
    reportLines.push(`- Agent contract: \`${JSON.stringify(item.agentContract)}\``);
  }
  reportLines.push(`- Expect terms: ${item.testCase.expectTerms.join(', ')}`);
  if (item.testCase.preferHosts.length > 0) {
    reportLines.push(`- Preferred hosts: ${item.testCase.preferHosts.join(', ')}`);
  }
  reportLines.push(`- Demoted hosts: ${item.testCase.demoteHosts.join(', ')}`);
  reportLines.push('');

  for (const version of versions) {
    const entry = item.versions[version];
    reportLines.push(`**${version} — ${entry.rerankStrategy}**`);
    reportLines.push(`- Retrieval candidate pass: \`${entry.retrievalVersion}\``);
    reportLines.push(`- Latency: fetch ${entry.fetchLatencyMs} ms + rerank ${entry.rerankLatencyMs} ms = ${entry.latencyMs} ms`);
    reportLines.push(`- Quality: expectedTop1=${entry.quality.expectedTop1}, expectedTop3=${entry.quality.expectedTop3}, expectedTop5=${entry.quality.expectedTop5}, expectedCoverageTop3=${entry.quality.expectedCoverageTop3}, uniqueHostsTop5=${entry.quality.uniqueHostsTop5}, uniqueSourceFamiliesTop5=${entry.quality.uniqueSourceFamiliesTop5}, preferredTop3=${entry.quality.preferredTop3}, demotedTop3=${entry.quality.demotedTop3}, MRR=${entry.quality.mrrPreferred}`);
    const retrievalOnlyBaseline = item.baselines?.retrievalOnly?.[retrievalVersionFor(version)];
    if (retrievalOnlyBaseline) {
      reportLines.push(`- Retrieval-only baseline: expectedTop3=${retrievalOnlyBaseline.quality.expectedTop3}, expectedCoverageTop3=${retrievalOnlyBaseline.quality.expectedCoverageTop3}, uniqueHostsTop5=${retrievalOnlyBaseline.quality.uniqueHostsTop5}, uniqueSourceFamiliesTop5=${retrievalOnlyBaseline.quality.uniqueSourceFamiliesTop5}, preferredTop3=${retrievalOnlyBaseline.quality.preferredTop3}`);
      reportLines.push(`- Step lift vs retrieval-only: ${formatStepDelta(item.stepComparisons?.[version]?.retrievalOnly)}`);
    }
    if (item.baselines?.rawSearxng) {
      reportLines.push(`- Raw SearXNG baseline: expectedTop3=${item.baselines.rawSearxng.quality.expectedTop3}, expectedCoverageTop3=${item.baselines.rawSearxng.quality.expectedCoverageTop3}, uniqueHostsTop5=${item.baselines.rawSearxng.quality.uniqueHostsTop5}, uniqueSourceFamiliesTop5=${item.baselines.rawSearxng.quality.uniqueSourceFamiliesTop5}, preferredTop3=${item.baselines.rawSearxng.quality.preferredTop3}`);
      reportLines.push(`- Step lift vs raw SearXNG: ${formatStepDelta(item.stepComparisons?.[version]?.rawSearxng)}`);
    }
    if (entry.embedding) {
      reportLines.push(`- Embedding: \`${JSON.stringify(entry.embedding)}\``);
    }
    if (entry.adaptiveHybrid) {
      reportLines.push(`- Adaptive hybrid: \`${JSON.stringify(entry.adaptiveHybrid)}\``);
    }
    if (entry.retrieval) {
      reportLines.push(`- Retrieval plan: \`${JSON.stringify(entry.retrieval)}\``);
    }
    if (entry.decontamination) {
      reportLines.push(`- Decontamination: \`${JSON.stringify(entry.decontamination)}\``);
    }
    reportLines.push(formatResultList(entry.results));
    reportLines.push('');
  }
}

const payload = {
  runId,
  runDir,
  generatedAt: new Date().toISOString(),
  seed,
  selectedSurfaceNames,
  selectedSurfaces,
  selectedLayerNames: effectiveLayerNames,
  selectedLayers,
  selectedPackNames,
  selectedPacks,
  versions,
  focusVersion,
  liveDefaultVersion,
  baselineRetrievalVersion,
  caseLimit,
  resultLimit,
  candidateMode,
  agentContractEnabled: includeAgentContract,
  config: cfg,
  layerCoverage,
  coverageSummary,
  evaluationTracks,
  packCoverage,
  cases,
  aggregates,
  baselineLayers: {
    rawSearxng: {
      enabled: includeRawSearxngBaseline,
      aggregate: rawSearxngAggregate,
    },
    retrievalOnly: retrievalBaselineAggregates,
    finalRanking: aggregates,
  },
  stepComparisonAggregates,
  packAggregates,
  pairwiseComparisons,
  promotionSummary,
  fallbackUsage,
  raw,
};

await fs.writeFile(path.join(runDir, 'benchmark.json'), JSON.stringify(payload, null, 2) + '\n', 'utf8');
await fs.writeFile(path.join(runDir, 'report.md'), reportLines.join('\n') + '\n', 'utf8');

console.log(JSON.stringify({
  runId,
  runDir,
  selectedSurfaceNames,
  selectedLayerNames: effectiveLayerNames,
  selectedPackNames,
  versions,
  focusVersion,
  liveDefaultVersion,
  candidateMode,
  baselineLayers: {
    rawSearxngEnabled: includeRawSearxngBaseline,
    retrievalOnly: retrievalVersions.map((version) => `retrieval-only:${version}`),
  },
  promotionSummary,
}, null, 2));
