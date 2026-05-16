import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, "../../..");
const pluginDir = path.join(workspaceDir, ".openclaw", "extensions", "web-searcher");

const [{ default: plugin, __test }, manifest] = await Promise.all([
  import(pathToFileURL(path.join(pluginDir, "index.ts")).href),
  fs.readFile(path.join(pluginDir, "openclaw.plugin.json"), "utf8").then((raw) => JSON.parse(raw)),
]);

const runtimeVersions = [...__test.SUPPORTED_RERANK_VERSIONS];
const runtimeDefault = __test.DEFAULT_RERANK_VERSION;
const manifestVersionConfig = manifest?.configSchema?.properties?.defaultRerankVersion ?? {};
const manifestVersions = Array.isArray(manifestVersionConfig.enum) ? manifestVersionConfig.enum : [];
const manifestDefault = manifestVersionConfig.default;

assert.deepEqual(
  manifestVersions,
  runtimeVersions,
  `Manifest versions drift from runtime: manifest=${JSON.stringify(manifestVersions)} runtime=${JSON.stringify(runtimeVersions)}`,
);
assert.equal(
  manifestDefault,
  runtimeDefault,
  `Manifest default rerank version drifted: manifest=${manifestDefault} runtime=${runtimeDefault}`,
);

const openclawConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
const openclawConfig = JSON.parse(await fs.readFile(openclawConfigPath, "utf8"));
const pluginConfig = openclawConfig?.plugins?.entries?.["web-searcher"]?.config ?? {};
const configuredDefault = pluginConfig.defaultRerankVersion ?? runtimeDefault;

assert.equal(
  __test.isSupportedRerankVersion(configuredDefault),
  true,
  `Configured default rerank version is unsupported: ${configuredDefault}`,
);

const tools = new Map();
plugin.register({
  config: openclawConfig,
  pluginConfig,
  registerTool(tool) {
    tools.set(tool.name, tool);
  },
});

const statusTool = tools.get("web_searcher_status");
assert.ok(statusTool, "web_searcher_status tool was not registered");

const status = await statusTool.execute();
const statusRerank = status?.structuredContent?.rerank ?? {};

assert.deepEqual(
  statusRerank.availableVersions,
  runtimeVersions,
  `web_searcher_status availableVersions drifted: ${JSON.stringify(statusRerank.availableVersions)}`,
);
assert.equal(
  statusRerank.defaultRerankVersion,
  configuredDefault,
  `web_searcher_status defaultRerankVersion drifted: status=${statusRerank.defaultRerankVersion} config=${configuredDefault}`,
);

console.log("web-searcher rollout contract ok");
console.log(`versions: ${runtimeVersions.join(", ")}`);
console.log(`default: ${configuredDefault}`);
