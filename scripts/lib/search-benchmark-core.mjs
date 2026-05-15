const QUALITY_COMPARISON_FIELDS = [
  ['expectedTop3', 1],
  ['expectedCoverageTop3', 1],
  ['expectedTop5', 1],
  ['preferredTop3', 1],
  ['mrrPreferred', 1],
  ['demotedTop3', -1],
  ['uniqueHostsTop5', 1],
  ['uniqueSourceFamiliesTop5', 1],
];

const QUALITY_SIGNAL_FIELDS = [
  ['expectedTop3', 'expectedTop3'],
  ['expectedCoverageTop3', 'expectedCoverageTop3'],
  ['expectedTop5', 'expectedTop5'],
  ['preferredTop3', 'preferredTop3'],
  ['mrrPreferred', 'mrrPreferred'],
  ['demotedTop3', 'demotedTop3'],
  ['uniqueHostsTop5', 'uniqueHostsTop5'],
  ['uniqueSourceFamiliesTop5', 'uniqueSourceFamiliesTop5'],
];

export function nowIsoCompact() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function hashSeed(input) {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function parseDelimitedSelection(input, availableNames, defaultNames, label) {
  if (!input || input.trim().length === 0) {
    return [...defaultNames];
  }
  const requested = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const selected = [];
  for (const name of requested) {
    if (!availableNames.includes(name)) {
      throw new Error(`Unknown benchmark ${label} "${name}". Available ${label}s: ${availableNames.join(', ')}`);
    }
    if (!selected.includes(name)) {
      selected.push(name);
    }
  }
  return selected;
}

export function parsePackSelection(input, availablePackNames, defaultPackNames) {
  return parseDelimitedSelection(input, availablePackNames, defaultPackNames, 'pack');
}

export function parseLayerSelection(input, availableLayerNames, defaultLayerNames) {
  return parseDelimitedSelection(input, availableLayerNames, defaultLayerNames, 'layer');
}

export function parseSurfaceSelection(input, availableSurfaceNames, defaultSurfaceNames) {
  return parseDelimitedSelection(input, availableSurfaceNames, defaultSurfaceNames, 'surface');
}

export function expandSurfaceLayerNames(selectedSurfaceNames, surfaces) {
  const selected = [];
  for (const surfaceName of selectedSurfaceNames) {
    const surface = surfaces.find((item) => item.name === surfaceName);
    if (!surface) continue;
    for (const layerName of surface.layerNames || []) {
      if (!selected.includes(layerName)) {
        selected.push(layerName);
      }
    }
  }
  return selected;
}

export function parsePositiveInt(input) {
  if (!input) return null;
  const value = Number.parseInt(input, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Expected a positive integer, got "${input}"`);
  }
  return value;
}

export function parseVersionSelection(input, supportedVersions, defaultVersions = supportedVersions) {
  if (!input || input.trim().length === 0) {
    return [...defaultVersions];
  }
  const requested = input
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  const selected = [];
  for (const version of requested) {
    if (!supportedVersions.includes(version)) {
      throw new Error(`Unknown rerank version "${version}". Available versions: ${supportedVersions.join(', ')}`);
    }
    if (!selected.includes(version)) {
      selected.push(version);
    }
  }
  return selected;
}

export function parseCandidateMode(input) {
  const value = (input || 'live-retrieval').trim().toLowerCase();
  if (value === 'live-retrieval' || value === 'shared-union') {
    return value;
  }
  throw new Error(`Unknown benchmark candidate mode "${input}". Available modes: live-retrieval, shared-union`);
}

function sharedCandidateKey(result) {
  const url = normalizeText(result.url || '');
  if (url) return `url:${url}`;
  return `fallback:${normalizeText(result.host)}|${normalizeText(result.path)}|${normalizeText(result.title)}`;
}

export function buildSharedCandidatePool(retrievalEntries, { sourceVersions = [] } = {}) {
  const candidateMap = new Map();
  const suggestions = new Set();
  const unresponsiveEngines = new Set();
  const orderedSourceVersions = sourceVersions.length > 0
    ? sourceVersions
    : retrievalEntries.map((entry) => entry.version);

  let fallbackRank = 0;
  for (const sourceVersion of orderedSourceVersions) {
    const entry = retrievalEntries.find((item) => item.version === sourceVersion);
    if (!entry) continue;
    for (const suggestion of entry.retrieved?.merged?.suggestions || []) {
      suggestions.add(suggestion);
    }
    for (const engine of entry.retrieved?.merged?.unresponsiveEngines || []) {
      unresponsiveEngines.add(engine);
    }
    for (const result of entry.retrieved?.merged?.results || []) {
      fallbackRank += 1;
      const key = sharedCandidateKey(result);
      const existing = candidateMap.get(key);
      if (!existing) {
        candidateMap.set(key, {
          ...result,
          categories: Array.isArray(result.categories) ? [...result.categories] : [],
          originalRank: Number.isFinite(result.originalRank) ? result.originalRank : fallbackRank,
          rank: Number.isFinite(result.rank) ? result.rank : fallbackRank,
          score: typeof result.score === 'number' ? result.score : 0,
        });
        continue;
      }
      existing.categories = [...new Set([...(existing.categories || []), ...(result.categories || [])])];
      existing.originalRank = Math.min(
        Number.isFinite(existing.originalRank) ? existing.originalRank : fallbackRank,
        Number.isFinite(result.originalRank) ? result.originalRank : fallbackRank,
      );
      existing.rank = Math.min(
        Number.isFinite(existing.rank) ? existing.rank : fallbackRank,
        Number.isFinite(result.rank) ? result.rank : fallbackRank,
      );
      if ((typeof result.score === 'number' ? result.score : 0) > (typeof existing.score === 'number' ? existing.score : 0)) {
        existing.score = result.score;
        existing.snippet = result.snippet || existing.snippet;
        existing.engine = result.engine || existing.engine;
        existing.publishedDate = result.publishedDate || existing.publishedDate;
      }
    }
  }

  const results = [...candidateMap.values()]
    .sort((a, b) =>
      (a.originalRank ?? 999) - (b.originalRank ?? 999) ||
      (b.score ?? 0) - (a.score ?? 0) ||
      normalizeText(a.host).localeCompare(normalizeText(b.host)) ||
      normalizeText(a.title).localeCompare(normalizeText(b.title))
    )
    .map((result, index) => ({
      ...result,
      rank: index + 1,
      originalRank: Number.isFinite(result.originalRank) ? result.originalRank : index + 1,
    }));

  return {
    merged: {
      results,
      suggestions: [...suggestions],
      unresponsiveEngines: [...unresponsiveEngines],
    },
    sourceVersions: orderedSourceVersions.filter((version) => retrievalEntries.some((entry) => entry.version === version)),
    fetchLatencyMs: Number(retrievalEntries.reduce((sum, entry) => sum + (entry.fetchLatencyMs || 0), 0).toFixed(1)),
  };
}

export function buildSelectedCases({ casePools, selectedPackNames = null, selectedLayerNames = null, seedText, caseLimit = null }) {
  const rng = createRng(hashSeed(seedText));
  const selected = casePools
    .filter((testCase) => {
      if (Array.isArray(selectedPackNames) && selectedPackNames.length > 0) {
        return testCase.packNames?.some((packName) => selectedPackNames.includes(packName));
      }
      if (Array.isArray(selectedLayerNames) && selectedLayerNames.length > 0) {
        return testCase.layerNames?.some((layerName) => selectedLayerNames.includes(layerName));
      }
      return true;
    })
    .map((testCase) => {
      const queryIndex = Math.floor(rng() * testCase.queries.length) % testCase.queries.length;
      return {
        ...testCase,
        query: testCase.queries[queryIndex],
        queryIndex,
      };
    });

  if (caseLimit == null || caseLimit >= selected.length) {
    return selected;
  }

  return selected.slice(0, caseLimit);
}

export function normalizeText(value) {
  return String(value || '').normalize('NFKC').toLowerCase();
}

export function hostMatches(host, suffix) {
  return host === suffix || host.endsWith(`.${suffix}`);
}

export function countMatchingHosts(results, hosts, topK) {
  if (!Array.isArray(hosts) || hosts.length === 0) return 0;
  return results.slice(0, topK).filter((item) => hosts.some((host) => hostMatches(item.host || '', host))).length;
}

export function firstMatchingRank(results, hosts) {
  if (!Array.isArray(hosts) || hosts.length === 0) return null;
  for (const item of results) {
    if (hosts.some((host) => hostMatches(item.host || '', host))) {
      return item.rank || null;
    }
  }
  return null;
}

export function resultText(item) {
  return normalizeText([item.title, item.snippet, item.url].filter(Boolean).join(' '));
}

export function countMatchingTerms(results, terms, topK) {
  if (!Array.isArray(terms) || terms.length === 0) return 0;
  return results.slice(0, topK).filter((item) => {
    const text = resultText(item);
    return terms.some((term) => text.includes(normalizeText(term)));
  }).length;
}

export function averageCoverage(results, terms, topK) {
  if (!Array.isArray(terms) || terms.length === 0) return 0;
  const sample = results.slice(0, topK);
  if (sample.length === 0) return 0;
  const coverages = sample.map((item) => {
    const text = resultText(item);
    const hits = terms.filter((term) => text.includes(normalizeText(term))).length;
    return hits / terms.length;
  });
  return Number((coverages.reduce((sum, value) => sum + value, 0) / coverages.length).toFixed(4));
}

export function uniqueHosts(results, topK) {
  return new Set(results.slice(0, topK).map((item) => item.host).filter(Boolean)).size;
}

export function sourceFamilyForResult(item) {
  const host = normalizeText(item?.host || '');
  if (!host) return 'unknown';
  if (hostMatches(host, 'github.com') || hostMatches(host, 'raw.githubusercontent.com')) return 'github';
  if (hostMatches(host, 'huggingface.co') || hostMatches(host, 'hf-mirror.com')) return 'huggingface';
  if (hostMatches(host, 'modelscope.cn') || hostMatches(host, 'modelscope.com')) return 'modelscope';
  if (hostMatches(host, 'npmjs.com') || hostMatches(host, 'pypi.org')) return 'package-registry';
  if (host.startsWith('docs.') || host.startsWith('developer.') || host.startsWith('developers.')) return 'official-docs';
  if (hostMatches(host, 'readthedocs.io')) return 'docs-mirror';
  return host;
}

export function uniqueSourceFamilies(results, topK) {
  return new Set(results.slice(0, topK).map((item) => sourceFamilyForResult(item)).filter(Boolean)).size;
}

export function qualityMetrics(results, testCase) {
  const firstPreferredRank = firstMatchingRank(results, testCase.preferHosts);
  return {
    top1Preferred: Boolean(
      results[0] &&
      Array.isArray(testCase.preferHosts) &&
      testCase.preferHosts.some((host) => hostMatches(results[0].host || '', host))
    ),
    preferredTop3: countMatchingHosts(results, testCase.preferHosts, 3),
    preferredTop5: countMatchingHosts(results, testCase.preferHosts, 5),
    demotedTop3: countMatchingHosts(results, testCase.demoteHosts, 3),
    demotedTop5: countMatchingHosts(results, testCase.demoteHosts, 5),
    firstPreferredRank,
    mrrPreferred: firstPreferredRank ? Number((1 / firstPreferredRank).toFixed(4)) : 0,
    expectedTop1: countMatchingTerms(results, testCase.expectTerms, 1),
    expectedTop3: countMatchingTerms(results, testCase.expectTerms, 3),
    expectedTop5: countMatchingTerms(results, testCase.expectTerms, 5),
    expectedCoverageTop3: averageCoverage(results, testCase.expectTerms, 3),
    uniqueHostsTop5: uniqueHosts(results, 5),
    uniqueSourceFamiliesTop5: uniqueSourceFamilies(results, 5),
  };
}

export function formatResultList(results, topK = 5) {
  return results.slice(0, topK).map((item) => {
    const bits = [
      `${item.rank}. ${item.title || item.url}`,
      `host=${item.host || 'n/a'}`,
      item.engine ? `engine=${item.engine}` : null,
      typeof item.score === 'number' ? `score=${item.score}` : null,
      typeof item.embeddingSimilarity === 'number' ? `embed=${item.embeddingSimilarity}` : null,
      typeof item.semanticScore === 'number' ? `semantic=${item.semanticScore}` : null,
      typeof item.heuristicPrior === 'number' ? `prior=${item.heuristicPrior}` : null,
    ].filter(Boolean);
    return `- ${bits.join(' | ')}\n  - ${item.url}`;
  }).join('\n');
}

export function average(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function aggregateVersionMetrics(rawCases, version) {
  const metrics = rawCases.map((item) => item.versions[version].quality);
  const latencies = rawCases.map((item) => item.versions[version].latencyMs);
  const guardedCases = rawCases.filter((item) => Array.isArray(item.testCase.preferHosts) && item.testCase.preferHosts.length > 0);
  return {
    version,
    meanLatencyMs: Number(average(latencies).toFixed(1)),
    meanExpectedTop3: Number(average(metrics.map((item) => item.expectedTop3)).toFixed(3)),
    meanExpectedTop5: Number(average(metrics.map((item) => item.expectedTop5)).toFixed(3)),
    meanExpectedCoverageTop3: Number(average(metrics.map((item) => item.expectedCoverageTop3)).toFixed(4)),
    meanUniqueHostsTop5: Number(average(metrics.map((item) => item.uniqueHostsTop5)).toFixed(3)),
    meanUniqueSourceFamiliesTop5: Number(average(metrics.map((item) => item.uniqueSourceFamiliesTop5 ?? 0)).toFixed(3)),
    preferredCaseCount: guardedCases.length,
    meanPreferredTop3: Number(average(guardedCases.map((item) => item.versions[version].quality.preferredTop3)).toFixed(3)),
    meanPreferredTop5: Number(average(guardedCases.map((item) => item.versions[version].quality.preferredTop5)).toFixed(3)),
    meanDemotedTop3: Number(average(guardedCases.map((item) => item.versions[version].quality.demotedTop3)).toFixed(3)),
    meanDemotedTop5: Number(average(guardedCases.map((item) => item.versions[version].quality.demotedTop5)).toFixed(3)),
    meanMrrPreferred: Number(average(guardedCases.map((item) => item.versions[version].quality.mrrPreferred)).toFixed(4)),
    top1PreferredRate: Number(average(guardedCases.map((item) => item.versions[version].quality.top1Preferred ? 1 : 0)).toFixed(3)),
  };
}

export function aggregatePackMetrics(rawCases, versions, packNames) {
  return packNames.map((packName) => {
    const scopedCases = rawCases.filter((item) => item.testCase.packNames.includes(packName));
    return {
      packName,
      caseCount: scopedCases.length,
      aggregates: versions.map((version) => aggregateVersionMetrics(scopedCases, version)),
    };
  }).filter((item) => item.caseCount > 0);
}

export function compareCaseQuality(left, right) {
  for (const [field, direction] of QUALITY_COMPARISON_FIELDS) {
    const diff = (left[field] ?? 0) - (right[field] ?? 0);
    if (Math.abs(diff) > 0.00001) {
      return diff * direction;
    }
  }
  return 0;
}

export function summarizeDiff(current, previous) {
  return {
    latencyDeltaMs: Number((current.meanLatencyMs - previous.meanLatencyMs).toFixed(1)),
    latencyDeltaPct: Number((((current.meanLatencyMs / previous.meanLatencyMs) - 1) * 100).toFixed(1)),
    expectedTop3Delta: Number((current.meanExpectedTop3 - previous.meanExpectedTop3).toFixed(3)),
    expectedCoverageTop3Delta: Number((current.meanExpectedCoverageTop3 - previous.meanExpectedCoverageTop3).toFixed(4)),
    uniqueHostsTop5Delta: Number((current.meanUniqueHostsTop5 - previous.meanUniqueHostsTop5).toFixed(3)),
    uniqueSourceFamiliesTop5Delta: Number((current.meanUniqueSourceFamiliesTop5 - previous.meanUniqueSourceFamiliesTop5).toFixed(3)),
    preferredTop3Delta: Number((current.meanPreferredTop3 - previous.meanPreferredTop3).toFixed(3)),
    mrrDelta: Number((current.meanMrrPreferred - previous.meanMrrPreferred).toFixed(4)),
    demotedTop3Delta: Number((current.meanDemotedTop3 - previous.meanDemotedTop3).toFixed(3)),
  };
}

export function summarizeQualityDelta(currentQuality, baselineQuality) {
  return {
    expectedTop3Delta: Number(((currentQuality?.expectedTop3 ?? 0) - (baselineQuality?.expectedTop3 ?? 0)).toFixed(3)),
    expectedCoverageTop3Delta: Number(((currentQuality?.expectedCoverageTop3 ?? 0) - (baselineQuality?.expectedCoverageTop3 ?? 0)).toFixed(4)),
    expectedTop5Delta: Number(((currentQuality?.expectedTop5 ?? 0) - (baselineQuality?.expectedTop5 ?? 0)).toFixed(3)),
    preferredTop3Delta: Number(((currentQuality?.preferredTop3 ?? 0) - (baselineQuality?.preferredTop3 ?? 0)).toFixed(3)),
    demotedTop3Delta: Number(((currentQuality?.demotedTop3 ?? 0) - (baselineQuality?.demotedTop3 ?? 0)).toFixed(3)),
    uniqueHostsTop5Delta: Number(((currentQuality?.uniqueHostsTop5 ?? 0) - (baselineQuality?.uniqueHostsTop5 ?? 0)).toFixed(3)),
    uniqueSourceFamiliesTop5Delta: Number(((currentQuality?.uniqueSourceFamiliesTop5 ?? 0) - (baselineQuality?.uniqueSourceFamiliesTop5 ?? 0)).toFixed(3)),
    mrrPreferredDelta: Number(((currentQuality?.mrrPreferred ?? 0) - (baselineQuality?.mrrPreferred ?? 0)).toFixed(4)),
  };
}

function summarizeBucketOrPackBreakdown(caseSummaries, key) {
  const counts = new Map();
  for (const item of caseSummaries) {
    const values = Array.isArray(item[key]) ? item[key] : [item[key]];
    for (const value of values.filter(Boolean)) {
      const current = counts.get(value) ?? { name: value, wins: 0, regressions: 0, ties: 0 };
      if (item.outcome === 'win') current.wins += 1;
      if (item.outcome === 'regression') current.regressions += 1;
      if (item.outcome === 'tie') current.ties += 1;
      counts.set(value, current);
    }
  }
  return [...counts.values()].sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.regressions !== left.regressions) return right.regressions - left.regressions;
    return left.name.localeCompare(right.name);
  });
}

function primarySignal(leftQuality, rightQuality) {
  for (const [field, label] of QUALITY_SIGNAL_FIELDS) {
    const delta = Number(((leftQuality[field] ?? 0) - (rightQuality[field] ?? 0)).toFixed(4));
    if (Math.abs(delta) > 0.00001) {
      return {
        metric: label,
        delta,
      };
    }
  }
  return {
    metric: 'tie',
    delta: 0,
  };
}

export function summarizePairwiseComparison(rawCases, leftVersion, rightVersion, aggregateMap) {
  const caseSummaries = rawCases.map((item) => {
    const leftQuality = item.versions[leftVersion].quality;
    const rightQuality = item.versions[rightVersion].quality;
    const score = compareCaseQuality(leftQuality, rightQuality);
    return {
      name: item.testCase.name,
      bucket: item.testCase.bucket,
      packs: item.testCase.packNames,
      layers: item.testCase.layerNames ?? [],
      qualityFocus: item.testCase.qualityFocus,
      query: item.testCase.query,
      outcome: score > 0 ? 'win' : score < 0 ? 'regression' : 'tie',
      score: Number(score.toFixed(4)),
      signal: primarySignal(leftQuality, rightQuality),
      latencyDeltaMs: Number((item.versions[leftVersion].latencyMs - item.versions[rightVersion].latencyMs).toFixed(1)),
    };
  });

  const wins = caseSummaries.filter((item) => item.outcome === 'win');
  const regressions = caseSummaries.filter((item) => item.outcome === 'regression');
  const ties = caseSummaries.filter((item) => item.outcome === 'tie');

  return {
    leftVersion,
    rightVersion,
    label: `${leftVersion} vs ${rightVersion}`,
    aggregateDiff: summarizeDiff(aggregateMap[leftVersion], aggregateMap[rightVersion]),
    winCount: wins.length,
    regressionCount: regressions.length,
    tieCount: ties.length,
    wins,
    regressions,
    ties,
    bucketBreakdown: summarizeBucketOrPackBreakdown(caseSummaries, 'bucket'),
    packBreakdown: summarizeBucketOrPackBreakdown(caseSummaries, 'packs'),
    layerBreakdown: summarizeBucketOrPackBreakdown(caseSummaries, 'layers'),
  };
}

export function buildComparisonPairs({ versions, focusVersion, liveDefaultVersion, historicalAnchorVersions = ['v1.1', 'v1.3'] }) {
  const pairs = [];
  const seen = new Set();

  function addPair(leftVersion, rightVersion, rationale) {
    if (!leftVersion || !rightVersion || leftVersion === rightVersion) return;
    if (!versions.includes(leftVersion) || !versions.includes(rightVersion)) return;
    const key = `${leftVersion}::${rightVersion}`;
    if (seen.has(key)) return;
    seen.add(key);
    pairs.push({
      leftVersion,
      rightVersion,
      label: `${leftVersion} vs ${rightVersion}`,
      rationale,
    });
  }

  for (let index = 1; index < versions.length; index += 1) {
    addPair(versions[index], versions[index - 1], 'sequential-adjacent');
  }

  if (focusVersion && versions.includes(focusVersion)) {
    const focusIndex = versions.indexOf(focusVersion);
    if (focusIndex > 0) {
      addPair(focusVersion, versions[focusIndex - 1], 'focus-vs-previous');
    }
    addPair(focusVersion, liveDefaultVersion, 'focus-vs-live-default');
    for (const anchorVersion of historicalAnchorVersions) {
      addPair(focusVersion, anchorVersion, 'focus-vs-historical-anchor');
    }
  }

  return pairs;
}

function lookupBreakdownEntry(entries, name) {
  return entries.find((item) => item.name === name) ?? { name, wins: 0, regressions: 0, ties: 0 };
}

export function summarizePromotionOutcome(pairwiseSummary, focusVersion, liveDefaultVersion, options = {}) {
  const {
    layerDefinitions = [],
    layerBreakdown = pairwiseSummary?.layerBreakdown,
  } = options;

  if (focusVersion === liveDefaultVersion) {
    return {
      focusVersion,
      liveDefaultVersion,
      status: 'monitor-live-default',
      recommendation: 'monitor',
      overall: pairwiseSummary
        ? {
          wins: pairwiseSummary.winCount,
          regressions: pairwiseSummary.regressionCount,
          ties: pairwiseSummary.tieCount,
          aggregateDiff: pairwiseSummary.aggregateDiff,
        }
        : undefined,
      reasons: ['Focus version matches the live default, so this run is for monitoring rather than promotion gating.'],
    };
  }

  if (!pairwiseSummary || !focusVersion || !liveDefaultVersion) {
    return {
      focusVersion,
      liveDefaultVersion,
      status: 'not-applicable',
      recommendation: 'monitor',
      reasons: ['Focus/live comparison was not available in this run.'],
    };
  }

  const breakdownEntries = Array.isArray(layerBreakdown) && layerBreakdown.length > 0
    ? layerBreakdown
    : pairwiseSummary.packBreakdown;
  const canaryLayers = layerDefinitions.filter((layer) => layer.gateRole === 'canary').map((layer) => layer.name);
  const productCriticalLayers = layerDefinitions.filter((layer) => layer.gateRole === 'product-critical').map((layer) => layer.name);
  const breadthLayers = layerDefinitions.filter((layer) => layer.gateRole === 'breadth').map((layer) => layer.name);

  const reasons = [];
  let recommendation = 'consider-promotion';
  let status = 'candidate';

  const canaryReadout = canaryLayers.map((name) => lookupBreakdownEntry(breakdownEntries, name));
  const productCriticalReadout = productCriticalLayers.map((name) => lookupBreakdownEntry(breakdownEntries, name));
  const breadthReadout = breadthLayers.map((name) => lookupBreakdownEntry(breakdownEntries, name));

  if (canaryReadout.some((entry) => entry.regressions > 0)) {
    recommendation = 'hold';
    status = 'blocked';
    reasons.push('Regression canary layer has at least one regression.');
  }

  if (productCriticalReadout.some((entry) => entry.regressions > 0)) {
    recommendation = 'hold';
    status = 'blocked';
    reasons.push('Operator daily lens has at least one regression.');
  }

  if (
    pairwiseSummary.aggregateDiff.expectedTop3Delta < 0 ||
    pairwiseSummary.aggregateDiff.expectedCoverageTop3Delta < 0
  ) {
    recommendation = 'hold';
    status = 'blocked';
    reasons.push('Overall relevance proxies regressed versus the live default.');
  }

  if (
    recommendation !== 'hold' &&
    pairwiseSummary.aggregateDiff.latencyDeltaPct > 25 &&
    pairwiseSummary.aggregateDiff.latencyDeltaMs > 0
  ) {
    recommendation = 'monitor';
    status = 'candidate-with-latency-watch';
    reasons.push('Latency increased by more than 25% versus the live default.');
  }

  if (reasons.length === 0) {
    reasons.push('No canary or operator-daily regressions detected, and aggregate relevance stayed at or above the live default.');
  }

  return {
    focusVersion,
    liveDefaultVersion,
    status,
    recommendation,
    overall: {
      wins: pairwiseSummary.winCount,
      regressions: pairwiseSummary.regressionCount,
      ties: pairwiseSummary.tieCount,
      aggregateDiff: pairwiseSummary.aggregateDiff,
    },
    layerReadout: Object.fromEntries(
      layerDefinitions.map((layer) => [layer.name, lookupBreakdownEntry(breakdownEntries, layer.name)]),
    ),
    breadthReadout,
    reasons,
  };
}
