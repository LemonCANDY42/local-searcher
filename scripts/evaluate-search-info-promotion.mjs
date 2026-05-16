#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serviceRoot = path.resolve(__dirname, '..');
const runsRoot = path.join(serviceRoot, 'runs');

async function findLatestBenchmarkJson() {
  const entries = await fs.readdir(runsRoot, { withFileTypes: true }).catch(() => []);
  const runDirSuffixes = ['-agent-searchkit-benchmark', '-agent-searchkit-v14-benchmark'];
  const dirs = entries
    .filter((entry) => entry.isDirectory() && runDirSuffixes.some((suffix) => entry.name.endsWith(suffix)))
    .map((entry) => path.join(runsRoot, entry.name));

  let latest = null;
  let latestMtime = -1;
  for (const dir of dirs) {
    const benchmarkPath = path.join(dir, 'benchmark.json');
    try {
      const stat = await fs.stat(benchmarkPath);
      if (stat.mtimeMs > latestMtime) {
        latest = benchmarkPath;
        latestMtime = stat.mtimeMs;
      }
    } catch {}
  }
  return latest;
}

function parseArgs(argv) {
  const args = { json: false, input: process.env.SEARCH_INFO_PROMOTION_BENCHMARK_JSON || null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      args.json = true;
    } else if (arg === '--input') {
      args.input = argv[index + 1] || null;
      index += 1;
    } else if (!args.input && !arg.startsWith('-')) {
      args.input = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function buildExitCode(summary) {
  switch (summary?.recommendation) {
    case 'hold':
      return 2;
    case 'monitor':
      return 0;
    case 'consider-promotion':
      return 0;
    default:
      return 1;
  }
}

function renderText(result) {
  const lines = [
    `runId: ${result.runId}`,
    `input: ${result.input}`,
    `focus: ${result.focusVersion}`,
    `liveDefault: ${result.liveDefaultVersion}`,
    `status: ${result.status}`,
    `recommendation: ${result.recommendation}`,
  ];

  if (result.overall) {
    lines.push(
      `overall: ${result.overall.wins}W/${result.overall.regressions}R/${result.overall.ties}T | expectedTop3 ${result.overall.aggregateDiff.expectedTop3Delta >= 0 ? '+' : ''}${result.overall.aggregateDiff.expectedTop3Delta} | expectedCoverageTop3 ${result.overall.aggregateDiff.expectedCoverageTop3Delta >= 0 ? '+' : ''}${result.overall.aggregateDiff.expectedCoverageTop3Delta} | latency ${result.overall.aggregateDiff.latencyDeltaMs >= 0 ? '+' : ''}${result.overall.aggregateDiff.latencyDeltaMs} ms (${result.overall.aggregateDiff.latencyDeltaPct >= 0 ? '+' : ''}${result.overall.aggregateDiff.latencyDeltaPct}%)`,
    );
  }

  if (result.packReadout) {
    lines.push(
      `packs: core=${result.packReadout.coreRegression.wins}W/${result.packReadout.coreRegression.regressions}R/${result.packReadout.coreRegression.ties}T; broad=${result.packReadout.broadMixed.wins}W/${result.packReadout.broadMixed.regressions}R/${result.packReadout.broadMixed.ties}T; daily=${result.packReadout.operatorDaily.wins}W/${result.packReadout.operatorDaily.regressions}R/${result.packReadout.operatorDaily.ties}T`,
    );
  }

  lines.push(`reasons: ${Array.isArray(result.reasons) ? result.reasons.join(' ') : 'none'}`);
  lines.push(`exitCode: ${result.exitCode}`);
  return lines.join('\n');
}

const args = parseArgs(process.argv.slice(2));
const input = args.input ? path.resolve(args.input) : await findLatestBenchmarkJson();

if (!input) {
  console.error('No benchmark.json found. Pass --input <path> or generate a benchmark run first.');
  process.exit(1);
}

const raw = JSON.parse(await fs.readFile(input, 'utf8'));
const summary = raw.promotionSummary || {};
const result = {
  input,
  runId: raw.runId || path.basename(path.dirname(input)),
  focusVersion: raw.focusVersion || summary.focusVersion || null,
  liveDefaultVersion: raw.liveDefaultVersion || summary.liveDefaultVersion || null,
  status: summary.status || 'unknown',
  recommendation: summary.recommendation || 'unknown',
  reasons: Array.isArray(summary.reasons) ? summary.reasons : [],
  overall: summary.overall || null,
  packReadout: summary.packReadout || null,
};
result.exitCode = buildExitCode(summary);

if (args.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(renderText(result));
}

process.exit(result.exitCode);
