export const SUPPORTED_RERANK_VERSIONS = ["v1.0", "v1.1", "v1.2", "v1.3", "v1.4", "v1.5", "v2.0"] as const;

export type RerankVersion = (typeof SUPPORTED_RERANK_VERSIONS)[number];

export const DEFAULT_RERANK_VERSION: RerankVersion = "v1.4";

export function isSupportedRerankVersion(value: unknown): value is RerankVersion {
  return typeof value === "string" && SUPPORTED_RERANK_VERSIONS.includes(value as RerankVersion);
}
