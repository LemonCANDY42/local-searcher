import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregatePackMetrics,
  buildSharedCandidatePool,
  buildComparisonPairs,
  buildSelectedCases,
  expandSurfaceLayerNames,
  parseCandidateMode,
  parseLayerSelection,
  parsePackSelection,
  parseSurfaceSelection,
  parseVersionSelection,
  summarizePairwiseComparison,
  summarizePromotionOutcome,
  summarizeQualityDelta,
  uniqueSourceFamilies,
} from './search-benchmark-core.mjs';

test('parsePackSelection preserves order and de-duplicates', () => {
  assert.deepEqual(
    parsePackSelection('core-regression, broad-mixed, core-regression', ['core-regression', 'broad-mixed'], ['core-regression']),
    ['core-regression', 'broad-mixed'],
  );
});

test('parseLayerSelection validates requested layers', () => {
  assert.deepEqual(
    parseLayerSelection('regression-canary, intent-coverage, regression-canary', ['regression-canary', 'intent-coverage'], ['regression-canary']),
    ['regression-canary', 'intent-coverage'],
  );
  assert.throws(
    () => parseLayerSelection('unknown-layer', ['regression-canary'], ['regression-canary']),
    /Unknown benchmark layer/,
  );
});

test('parseSurfaceSelection validates requested surfaces', () => {
  assert.deepEqual(
    parseSurfaceSelection('benchmark-2.0-default, benchmark-2.0-gating', ['benchmark-2.0-default', 'benchmark-2.0-gating'], ['benchmark-2.0-default']),
    ['benchmark-2.0-default', 'benchmark-2.0-gating'],
  );
  assert.throws(
    () => parseSurfaceSelection('bad-surface', ['benchmark-2.0-default'], ['benchmark-2.0-default']),
    /Unknown benchmark surface/,
  );
});

test('expandSurfaceLayerNames preserves declaration order while de-duplicating', () => {
  const surfaces = [
    { name: 'benchmark-2.0-default', layerNames: ['regression-canary', 'intent-coverage', 'operator-daily-lens'] },
    { name: 'benchmark-2.0-open-world', layerNames: ['intent-coverage', 'open-world'] },
  ];

  assert.deepEqual(
    expandSurfaceLayerNames(['benchmark-2.0-default', 'benchmark-2.0-open-world'], surfaces),
    ['regression-canary', 'intent-coverage', 'operator-daily-lens', 'open-world'],
  );
});

test('parseVersionSelection validates requested versions', () => {
  assert.deepEqual(
    parseVersionSelection('v1.4,v1.3,v1.4', ['v1.0', 'v1.3', 'v1.4']),
    ['v1.4', 'v1.3'],
  );
  assert.throws(
    () => parseVersionSelection('v2.0', ['v1.0', 'v1.4']),
    /Unknown rerank version/,
  );
});

test('parseCandidateMode validates benchmark candidate modes', () => {
  assert.equal(parseCandidateMode('shared-union'), 'shared-union');
  assert.equal(parseCandidateMode(''), 'live-retrieval');
  assert.throws(
    () => parseCandidateMode('shared-anchor'),
    /Unknown benchmark candidate mode/,
  );
});

test('buildSelectedCases filters by pack membership and keeps seeded query choice', () => {
  const cases = buildSelectedCases({
    casePools: [
      {
        name: 'alpha',
        packNames: ['core-regression'],
        layerNames: ['regression-canary'],
        queries: ['one', 'two'],
      },
      {
        name: 'beta',
        packNames: ['broad-mixed'],
        layerNames: ['intent-coverage'],
        queries: ['three'],
      },
    ],
    selectedPackNames: ['core-regression'],
    seedText: 'seed-1',
  });

  assert.equal(cases.length, 1);
  assert.equal(cases[0].name, 'alpha');
  assert.ok(['one', 'two'].includes(cases[0].query));
});

test('buildSelectedCases can filter by layer membership', () => {
  const cases = buildSelectedCases({
    casePools: [
      {
        name: 'alpha',
        packNames: ['core-regression'],
        layerNames: ['regression-canary'],
        queries: ['one'],
      },
      {
        name: 'beta',
        packNames: ['broad-mixed'],
        layerNames: ['intent-coverage', 'operator-daily-lens'],
        queries: ['two'],
      },
    ],
    selectedLayerNames: ['operator-daily-lens'],
    seedText: 'seed-2',
  });

  assert.equal(cases.length, 1);
  assert.equal(cases[0].name, 'beta');
});

test('aggregatePackMetrics computes pack-scoped aggregates', () => {
  const raw = [
    {
      testCase: { packNames: ['core-regression'], preferHosts: ['github.com'] },
      versions: {
        'v1.3': { latencyMs: 100, quality: { expectedTop3: 2, expectedTop5: 3, expectedCoverageTop3: 0.6, uniqueHostsTop5: 2, preferredTop3: 1, preferredTop5: 1, demotedTop3: 0, demotedTop5: 0, mrrPreferred: 1, top1Preferred: true } },
      },
    },
    {
      testCase: { packNames: ['broad-mixed'], preferHosts: [] },
      versions: {
        'v1.3': { latencyMs: 120, quality: { expectedTop3: 1, expectedTop5: 2, expectedCoverageTop3: 0.4, uniqueHostsTop5: 3, preferredTop3: 0, preferredTop5: 0, demotedTop3: 0, demotedTop5: 0, mrrPreferred: 0, top1Preferred: false } },
      },
    },
  ];

  const summary = aggregatePackMetrics(raw, ['v1.3'], ['core-regression', 'broad-mixed']);
  assert.equal(summary.length, 2);
  assert.equal(summary[0].packName, 'core-regression');
  assert.equal(summary[0].aggregates[0].meanExpectedTop3, 2);
  assert.equal(summary[1].packName, 'broad-mixed');
  assert.equal(summary[1].aggregates[0].meanExpectedTop3, 1);
});

test('uniqueSourceFamilies groups related hosts into stable source families', () => {
  assert.equal(
    uniqueSourceFamilies([
      { host: 'developers.openai.com' },
      { host: 'platform.openai.com' },
      { host: 'github.com' },
      { host: 'docs.python.org' },
      { host: 'pypi.org' },
    ], 5),
    4,
  );
});

test('summarizeQualityDelta exposes rerank-vs-baseline step deltas', () => {
  assert.deepEqual(
    summarizeQualityDelta(
      { expectedTop3: 3, expectedCoverageTop3: 0.6, expectedTop5: 5, preferredTop3: 2, demotedTop3: 0, uniqueHostsTop5: 4, uniqueSourceFamiliesTop5: 3, mrrPreferred: 1 },
      { expectedTop3: 2, expectedCoverageTop3: 0.4, expectedTop5: 4, preferredTop3: 1, demotedTop3: 1, uniqueHostsTop5: 3, uniqueSourceFamiliesTop5: 2, mrrPreferred: 0.5 },
    ),
    {
      expectedTop3Delta: 1,
      expectedCoverageTop3Delta: 0.2,
      expectedTop5Delta: 1,
      preferredTop3Delta: 1,
      demotedTop3Delta: -1,
      uniqueHostsTop5Delta: 1,
      uniqueSourceFamiliesTop5Delta: 1,
      mrrPreferredDelta: 0.5,
    },
  );
});

test('buildComparisonPairs keeps sequential and focus comparisons explicit', () => {
  const pairs = buildComparisonPairs({
    versions: ['v1.0', 'v1.1', 'v1.2', 'v1.3', 'v1.4'],
    focusVersion: 'v1.4',
    liveDefaultVersion: 'v1.3',
  });

  assert.ok(pairs.some((item) => item.label === 'v1.4 vs v1.3' && item.rationale === 'sequential-adjacent'));
  assert.ok(pairs.some((item) => item.label === 'v1.4 vs v1.1'));
});

test('pairwise summary and promotion outcome flag regressions in gated layers', () => {
  const raw = [
    {
      testCase: {
        name: 'guarded-docs',
        bucket: 'guarded-docs',
        packNames: ['core-regression', 'operator-daily'],
        layerNames: ['regression-canary', 'operator-daily-lens'],
        qualityFocus: 'guarded',
        query: 'docs',
      },
      versions: {
        'v1.5': { latencyMs: 120, quality: { expectedTop3: 1, expectedCoverageTop3: 0.3, expectedTop5: 1, preferredTop3: 0, mrrPreferred: 0, demotedTop3: 0, uniqueHostsTop5: 1 } },
        'v1.4': { latencyMs: 100, quality: { expectedTop3: 2, expectedCoverageTop3: 0.7, expectedTop5: 2, preferredTop3: 1, mrrPreferred: 1, demotedTop3: 0, uniqueHostsTop5: 1 } },
      },
    },
    {
      testCase: {
        name: 'broad-case',
        bucket: 'compare-landscape',
        packNames: ['broad-mixed'],
        layerNames: ['intent-coverage'],
        qualityFocus: 'breadth',
        query: 'compare',
      },
      versions: {
        'v1.5': { latencyMs: 140, quality: { expectedTop3: 2, expectedCoverageTop3: 0.5, expectedTop5: 2, preferredTop3: 0, mrrPreferred: 0, demotedTop3: 0, uniqueHostsTop5: 2 } },
        'v1.4': { latencyMs: 110, quality: { expectedTop3: 1, expectedCoverageTop3: 0.3, expectedTop5: 1, preferredTop3: 0, mrrPreferred: 0, demotedTop3: 0, uniqueHostsTop5: 1 } },
      },
    },
  ];
  const aggregateMap = {
    'v1.5': {
      meanLatencyMs: 130,
      meanExpectedTop3: 1.5,
      meanExpectedTop5: 1.5,
      meanExpectedCoverageTop3: 0.4,
      meanUniqueHostsTop5: 1.5,
      meanPreferredTop3: 0,
      meanDemotedTop3: 0,
      meanMrrPreferred: 0,
      top1PreferredRate: 0,
    },
    'v1.4': {
      meanLatencyMs: 105,
      meanExpectedTop3: 1.5,
      meanExpectedTop5: 1.5,
      meanExpectedCoverageTop3: 0.5,
      meanUniqueHostsTop5: 1,
      meanPreferredTop3: 0.5,
      meanDemotedTop3: 0,
      meanMrrPreferred: 0.5,
      top1PreferredRate: 0.5,
    },
  };

  const pairwise = summarizePairwiseComparison(raw, 'v1.5', 'v1.4', aggregateMap);
  const promotion = summarizePromotionOutcome(pairwise, 'v1.5', 'v1.4', {
    layerDefinitions: [
      { name: 'regression-canary', gateRole: 'canary' },
      { name: 'intent-coverage', gateRole: 'breadth' },
      { name: 'operator-daily-lens', gateRole: 'product-critical' },
    ],
  });

  assert.equal(pairwise.regressionCount, 1);
  assert.equal(pairwise.winCount, 1);
  assert.equal(promotion.recommendation, 'hold');
  assert.match(promotion.reasons.join(' '), /Regression canary layer has at least one regression/);
  assert.equal(promotion.layerReadout['regression-canary'].regressions, 1);
  assert.equal(promotion.layerReadout['intent-coverage'].wins, 1);
});

test('buildSharedCandidatePool unions retrieval entries into one stable pool', () => {
  const pool = buildSharedCandidatePool([
    {
      version: 'v1.4',
      fetchLatencyMs: 100,
      retrieved: {
        merged: {
          results: [
            { title: 'Alpha', url: 'https://example.com/a', host: 'example.com', path: '/a', categories: ['general'], originalRank: 1, rank: 1, score: 0.6 },
            { title: 'Beta', url: 'https://docs.example.com/b', host: 'docs.example.com', path: '/b', categories: ['general'], originalRank: 2, rank: 2, score: 0.5 },
          ],
          suggestions: ['alpha'],
          unresponsiveEngines: ['bing'],
        },
      },
    },
    {
      version: 'v1.5',
      fetchLatencyMs: 120,
      retrieved: {
        merged: {
          results: [
            { title: 'Alpha duplicate', url: 'https://example.com/a', host: 'example.com', path: '/a', categories: ['it'], originalRank: 3, rank: 1, score: 0.9 },
            { title: 'Gamma', url: 'https://github.com/example/c', host: 'github.com', path: '/example/c', categories: ['it'], originalRank: 1, rank: 2, score: 0.7 },
          ],
          suggestions: ['gamma'],
          unresponsiveEngines: ['duckduckgo'],
        },
      },
    },
  ], { sourceVersions: ['v1.4', 'v1.5'] });

  assert.deepEqual(pool.sourceVersions, ['v1.4', 'v1.5']);
  assert.equal(pool.fetchLatencyMs, 220);
  assert.equal(pool.merged.results.length, 3);
  assert.deepEqual(pool.merged.results.map((item) => item.host), ['example.com', 'github.com', 'docs.example.com']);
  assert.deepEqual(pool.merged.results[0].categories.sort(), ['general', 'it']);
  assert.deepEqual(pool.merged.suggestions.sort(), ['alpha', 'gamma']);
  assert.deepEqual(pool.merged.unresponsiveEngines.sort(), ['bing', 'duckduckgo']);
});
