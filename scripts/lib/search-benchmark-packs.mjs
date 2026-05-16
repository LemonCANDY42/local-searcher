// Benchmark 2.0 metadata keeps legacy packs for continuity, but layers/surfaces are the primary structure.
export const BENCHMARK_PACKS = [
  {
    "name": "core-regression",
    "description": "Legacy pack: stable guarded precision and troubleshooting cases that should rarely regress.",
    "legacy": true
  },
  {
    "name": "broad-mixed",
    "description": "Legacy pack: mixed discovery and synthesis coverage across broad web behavior.",
    "legacy": true
  },
  {
    "name": "operator-daily",
    "description": "Legacy pack: Kenny/operator-facing day-to-day usage lens.",
    "legacy": true
  }
];

export const DEFAULT_BENCHMARK_PACK_NAMES = [
  "core-regression",
  "broad-mixed",
  "operator-daily"
];

export const BENCHMARK_LAYERS = [
  {
    "name": "regression-canary",
    "description": "High-stability canaries for guarded/source-seeking, exact technical lookup, extract-heavy docs, and core troubleshooting.",
    "gateRole": "canary",
    "evaluationPriority": "primary"
  },
  {
    "name": "intent-coverage",
    "description": "Representative current-capability intent families: informational, navigational, comparison, troubleshooting, local, extract-heavy, workflow, and current-events.",
    "gateRole": "breadth",
    "evaluationPriority": "primary"
  },
  {
    "name": "open-world",
    "description": "Long-tail/open-web behavior for broader mixed-intent, culture, commercial, rumor, and exploratory discovery.",
    "gateRole": "open-world",
    "evaluationPriority": "secondary"
  },
  {
    "name": "operator-daily-lens",
    "description": "Representative high-frequency operator/Kenny buckets mapped to stable query families rather than bespoke exact queries.",
    "gateRole": "product-critical",
    "evaluationPriority": "primary"
  }
];

export const DEFAULT_BENCHMARK_LAYER_NAMES = [
  "regression-canary",
  "intent-coverage",
  "open-world",
  "operator-daily-lens"
];

export const BENCHMARK_SURFACES = [
  {
    "name": "benchmark-2.0-default",
    "description": "Full Benchmark 2.0 surface: canaries + intent coverage + open-world + operator daily lens.",
    "layerNames": [
      "regression-canary",
      "intent-coverage",
      "open-world",
      "operator-daily-lens"
    ],
    "recommendedCandidateModes": [
      "live-retrieval",
      "shared-union"
    ]
  },
  {
    "name": "benchmark-2.0-gating",
    "description": "Promotion-oriented gate: canaries + intent coverage + operator daily lens.",
    "layerNames": [
      "regression-canary",
      "intent-coverage",
      "operator-daily-lens"
    ],
    "recommendedCandidateModes": [
      "live-retrieval",
      "shared-union"
    ]
  },
  {
    "name": "benchmark-2.0-open-world",
    "description": "Long-tail/open-world probe for exploratory and mixed-intent stability.",
    "layerNames": [
      "open-world"
    ],
    "recommendedCandidateModes": [
      "live-retrieval",
      "shared-union"
    ]
  }
];

export const DEFAULT_BENCHMARK_SURFACE_NAMES = [
  "benchmark-2.0-default"
];

export const BENCHMARK_TRACKS = [
  {
    "name": "live-end-to-end",
    "candidateMode": "live-retrieval",
    "description": "Full end-to-end view including real retrieval variance."
  },
  {
    "name": "shared-candidate",
    "candidateMode": "shared-union",
    "description": "Rerank-isolation view on a shared retrieval pool."
  }
];

export const CASE_POOLS = [
  {
    "name": "docs-openai-responses",
    "packNames": [
      "core-regression"
    ],
    "bucket": "guarded-docs",
    "qualityFocus": "guarded",
    "queries": [
      "OpenAI Responses API audio input docs",
      "OpenAI Responses API tools docs",
      "OpenAI Responses API conversation state docs"
    ],
    "category": "general",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "platform.openai.com",
      "developers.openai.com",
      "openai.com",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "openai",
      "responses api",
      "audio",
      "tools",
      "conversation"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "canonical-docs",
    "representationTags": []
  },
  {
    "name": "docs-python-venv",
    "packNames": [
      "core-regression"
    ],
    "bucket": "guarded-docs",
    "qualityFocus": "guarded",
    "queries": [
      "python venv docs",
      "python virtual environment docs official",
      "python venv module docs"
    ],
    "category": "it",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "docs.python.org",
      "python.org",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "python",
      "venv",
      "virtual environment",
      "docs"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "canonical-docs",
    "representationTags": []
  },
  {
    "name": "github-openclaw-relay",
    "packNames": [
      "core-regression",
      "operator-daily"
    ],
    "bucket": "guarded-github",
    "qualityFocus": "guarded",
    "queries": [
      "OpenClaw Browser Relay github",
      "OpenClaw agent-searchkit plugin github code",
      "OpenClaw browser control github repository"
    ],
    "category": "it",
    "mode": "github",
    "language": "en-US",
    "preferHosts": [
      "github.com",
      "docs.openclaw.ai"
    ],
    "demoteHosts": [
      "hub.docker.com",
      "sourceforge.net"
    ],
    "expectTerms": [
      "openclaw",
      "browser relay",
      "agent-searchkit",
      "github"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "repo-source",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "models-qwen-gguf",
    "packNames": [
      "core-regression"
    ],
    "bucket": "guarded-models",
    "qualityFocus": "guarded",
    "queries": [
      "Qwen2.5 Omni GGUF models",
      "Qwen2.5 VL GGUF huggingface",
      "Qwen GGUF modelscope huggingface"
    ],
    "category": "it",
    "mode": "models",
    "language": "en-US",
    "preferHosts": [
      "huggingface.co",
      "hf-mirror.com",
      "modelscope.cn",
      "modelscope.com",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "qwen",
      "gguf",
      "model",
      "huggingface",
      "modelscope"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "model-hub",
    "representationTags": []
  },
  {
    "name": "packages-react-native-sqlite",
    "packNames": [
      "core-regression"
    ],
    "bucket": "guarded-packages",
    "qualityFocus": "guarded",
    "queries": [
      "react native sqlite package",
      "react native sqlite npm github",
      "react native sqlite bindings npm package"
    ],
    "category": "it",
    "mode": "packages",
    "language": "en-US",
    "preferHosts": [
      "npmjs.com",
      "github.com",
      "pypi.org"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "react native",
      "sqlite",
      "package",
      "npm",
      "github"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "package-registry",
    "representationTags": []
  },
  {
    "name": "science-aurora",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "science-knowledge",
    "qualityFocus": "breadth",
    "queries": [
      "why do auroras happen science explanation",
      "aurora borealis how does it work",
      "what causes northern lights physics"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "aurora",
      "northern lights",
      "charged particles",
      "magnetic field",
      "solar wind"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world"
    ],
    "intentFamily": "informational-explainer",
    "sourceRoleFamily": "explanatory-multi-source",
    "representationTags": []
  },
  {
    "name": "compare-open-source-ai-coding-assistants",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "compare-landscape",
    "qualityFocus": "breadth",
    "queries": [
      "open source AI coding assistant aider continue openhands comparison",
      "compare aider continue openhands open source coding assistant",
      "open source coding assistant landscape aider continue openhands"
    ],
    "category": "it",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "open source",
      "coding assistant",
      "aider",
      "continue",
      "openhands"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world",
      "operator-daily-lens"
    ],
    "intentFamily": "comparison-investigation",
    "sourceRoleFamily": "multi-source-compare",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "tech-news-codex-cli",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "tech-news",
    "qualityFocus": "breadth",
    "queries": [
      "OpenAI Codex CLI launch news",
      "OpenAI Codex CLI developer tool news",
      "Codex CLI open source terminal coding assistant news"
    ],
    "category": "news",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "codex cli",
      "openai",
      "developer",
      "tool",
      "coding"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "current-events-fact",
    "sourceRoleFamily": "news-reporting",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "finance-openai-valuation",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "finance-amount",
    "qualityFocus": "breadth",
    "queries": [
      "OpenAI valuation funding amount latest",
      "OpenAI latest valuation financing amount",
      "OpenAI funding round valuation amount"
    ],
    "category": "news",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "openai",
      "valuation",
      "funding",
      "amount",
      "investors"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world"
    ],
    "intentFamily": "current-events-fact",
    "sourceRoleFamily": "news-reporting",
    "representationTags": []
  },
  {
    "name": "world-news-ukraine-ceasefire",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "world-news",
    "qualityFocus": "breadth",
    "queries": [
      "latest Ukraine Russia ceasefire talks Reuters AP",
      "Ukraine Russia ceasefire talks latest news",
      "current Ukraine Russia peace talks update"
    ],
    "category": "news",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "ukraine",
      "russia",
      "ceasefire",
      "talks",
      "peace"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world"
    ],
    "intentFamily": "current-events-fact",
    "sourceRoleFamily": "news-reporting",
    "representationTags": []
  },
  {
    "name": "meme-let-him-cook",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "meme-cultural-reference",
    "qualityFocus": "breadth",
    "queries": [
      "let him cook meme meaning",
      "let him cook meme origin meaning",
      "what does let him cook meme mean"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "let him cook",
      "meme",
      "meaning",
      "origin",
      "slang"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "culture-reference",
    "sourceRoleFamily": "culture-community",
    "representationTags": []
  },
  {
    "name": "entertainment-white-lotus-gossip",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "entertainment-gossip",
    "qualityFocus": "breadth",
    "queries": [
      "White Lotus season 3 gossip cast rumor",
      "White Lotus season 3 cast rumor gossip",
      "White Lotus season 3 entertainment rumor"
    ],
    "category": "news",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "white lotus",
      "season 3",
      "cast",
      "rumor",
      "entertainment"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": []
  },
  {
    "name": "rumor-gta6-delay",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "uncertain-rumor",
    "qualityFocus": "breadth",
    "queries": [
      "GTA 6 delay rumor",
      "Grand Theft Auto 6 delay rumor report",
      "is GTA 6 delayed rumor"
    ],
    "category": "news",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "gta 6",
      "delay",
      "rumor",
      "report",
      "rockstar"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "current-events-fact",
    "sourceRoleFamily": "news-reporting",
    "representationTags": []
  },
  {
    "name": "extract-nodejs-release-notes",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "extract-heavy",
    "qualityFocus": "mixed",
    "queries": [
      "Node.js v22 release notes",
      "Node.js 22 changelog release notes",
      "Node.js v22 blog release notes"
    ],
    "category": "general",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "nodejs.org",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "node.js",
      "v22",
      "release notes",
      "changelog",
      "blog"
    ],
    "layerNames": [
      "intent-coverage"
    ],
    "intentFamily": "extract-heavy-document",
    "sourceRoleFamily": "official-artifact",
    "representationTags": []
  },
  {
    "name": "extract-python-whats-new",
    "packNames": [
      "core-regression",
      "broad-mixed"
    ],
    "bucket": "extract-heavy",
    "qualityFocus": "mixed",
    "queries": [
      "Python 3.12 what's new docs",
      "Python 3.12 release notes docs",
      "What is new in Python 3.12 official docs"
    ],
    "category": "it",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "docs.python.org",
      "python.org",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "python",
      "3.12",
      "what's new",
      "release notes",
      "docs"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage"
    ],
    "intentFamily": "extract-heavy-document",
    "sourceRoleFamily": "official-artifact",
    "representationTags": []
  },
  {
    "name": "compare-self-hosted-remote-access",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "compare-infra-tools",
    "qualityFocus": "breadth",
    "queries": [
      "NetBird Headscale compare self hosted remote access",
      "compare netbird headscale tailscale self hosted remote access",
      "self hosted remote access alternatives netbird headscale"
    ],
    "category": "it",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "netbird",
      "headscale",
      "self hosted",
      "remote access",
      "compare"
    ],
    "layerNames": [
      "open-world",
      "operator-daily-lens"
    ],
    "intentFamily": "comparison-investigation",
    "sourceRoleFamily": "multi-source-compare",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "tv-severance-cold-harbor",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "tv-film-anime-game",
    "qualityFocus": "breadth",
    "queries": [
      "Severance Cold Harbor explained",
      "Severance Cold Harbor meaning explained",
      "what is Cold Harbor in Severance"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "severance",
      "cold harbor",
      "explained",
      "episode",
      "meaning"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": []
  },
  {
    "name": "work-product-manager-interview",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "work-company-job-tooling",
    "qualityFocus": "breadth",
    "queries": [
      "product manager interview loop rubric",
      "product manager interview process hiring rubric",
      "pm interview loop workflow rubric"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "product manager",
      "interview",
      "loop",
      "rubric",
      "process"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "workflow-incident-postmortem-template",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "workflow-template",
    "qualityFocus": "breadth",
    "queries": [
      "incident postmortem template checklist",
      "engineering incident review template playbook",
      "postmortem template timeline checklist"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "incident",
      "postmortem",
      "template",
      "checklist",
      "timeline"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "workflow-playbook",
    "sourceRoleFamily": "workflow-practical",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "local-discovery-shanghai-coffee",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "local-discovery",
    "qualityFocus": "breadth",
    "queries": [
      "上海 徐汇 咖啡店 推荐 小红书 大众点评",
      "上海 咖啡店 探店 小红书 大众点评",
      "徐汇 咖啡馆 推荐 大众点评 小红书"
    ],
    "category": "general",
    "mode": "general",
    "language": "zh-CN",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "上海",
      "徐汇",
      "咖啡",
      "推荐",
      "探店"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world",
      "operator-daily-lens"
    ],
    "intentFamily": "local-discovery",
    "sourceRoleFamily": "local-listing-ugc",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "growth-xiaohongshu-content-strategy",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "growth-strategy",
    "qualityFocus": "breadth",
    "queries": [
      "小红书 内容 增长 策略 案例",
      "小红书 增长 运营 内容 策略",
      "小红书 爆文 内容 策略 案例"
    ],
    "category": "general",
    "mode": "general",
    "language": "zh-CN",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "小红书",
      "内容",
      "增长",
      "策略",
      "案例"
    ],
    "layerNames": [
      "open-world",
      "operator-daily-lens"
    ],
    "intentFamily": "community-growth-ugc",
    "sourceRoleFamily": "community-ugc",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "informational-mcp-explainer",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "informational-explainer",
    "qualityFocus": "breadth",
    "queries": [
      "what is model context protocol MCP explained",
      "model context protocol how it works client server tools",
      "MCP protocol tutorial for agents and tools"
    ],
    "category": "it",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "model context protocol",
      "mcp",
      "client",
      "server",
      "tools"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "informational-explainer",
    "sourceRoleFamily": "multi-source-explainer",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "navigational-openclaw-plugin-docs",
    "packNames": [
      "core-regression",
      "operator-daily"
    ],
    "bucket": "navigational-source-seeking",
    "qualityFocus": "guarded",
    "queries": [
      "OpenClaw plugin docs",
      "docs.openclaw.ai plugin guide",
      "OpenClaw tools plugin documentation"
    ],
    "category": "it",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "docs.openclaw.ai",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "openclaw",
      "plugin",
      "docs",
      "tools",
      "guide"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "exact-source-seeking",
    "sourceRoleFamily": "canonical-docs",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "commercial-ai-coding-assistant-pricing",
    "packNames": [
      "broad-mixed"
    ],
    "bucket": "commercial-investigation",
    "qualityFocus": "breadth",
    "queries": [
      "cursor vs copilot pricing comparison teams",
      "ai coding assistant pricing comparison 2026",
      "best coding assistant paid plan comparison"
    ],
    "category": "general",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "cursor",
      "copilot",
      "pricing",
      "comparison",
      "team"
    ],
    "layerNames": [
      "intent-coverage",
      "open-world",
      "operator-daily-lens"
    ],
    "intentFamily": "comparison-investigation",
    "sourceRoleFamily": "commercial-compare",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "local-visit-shanghai-hotpot-open-now",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "local-visit-intent",
    "qualityFocus": "breadth",
    "queries": [
      "上海 徐汇 火锅 现在营业 推荐",
      "徐汇 附近 火锅 营业时间 大众点评",
      "Shanghai Xuhui hotpot open now recommendations"
    ],
    "category": "general",
    "mode": "general",
    "language": "zh-CN",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "上海",
      "徐汇",
      "火锅",
      "营业",
      "推荐"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "extract-openclaw-release-notes",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "extract-heavy-docs",
    "qualityFocus": "mixed",
    "queries": [
      "OpenClaw release notes latest",
      "OpenClaw changelog latest version notes",
      "OpenClaw update notes docs"
    ],
    "category": "general",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "docs.openclaw.ai",
      "github.com"
    ],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "openclaw",
      "release notes",
      "changelog",
      "version",
      "update"
    ],
    "layerNames": [
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "troubleshooting-node-llama",
    "packNames": [
      "core-regression",
      "operator-daily"
    ],
    "bucket": "troubleshooting",
    "qualityFocus": "mixed",
    "queries": [
      "node-llama-cpp optional dependency missing",
      "node-llama-cpp install failed optional dependency",
      "node-llama-cpp package missing install fix"
    ],
    "category": "it",
    "mode": "official-docs",
    "language": "en-US",
    "preferHosts": [
      "github.com",
      "node-llama-cpp.withcat.ai"
    ],
    "demoteHosts": [
      "hub.docker.com",
      "sourceforge.net"
    ],
    "expectTerms": [
      "node-llama-cpp",
      "optional dependency",
      "install failed",
      "fix",
      "missing"
    ],
    "layerNames": [
      "regression-canary",
      "intent-coverage",
      "operator-daily-lens"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": [
      "operator-high-frequency-representative"
    ]
  },
  {
    "name": "creator-video-playwright-demo",
    "packNames": [
      "broad-mixed",
      "operator-daily"
    ],
    "bucket": "creator-video",
    "evaluationTier": "observational",
    "qualityFocus": "breadth",
    "queries": [
      "Playwright browser automation demo video",
      "Playwright MCP demo video",
      "Playwright tutorial video browser automation"
    ],
    "category": "videos",
    "mode": "general",
    "language": "en-US",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "playwright",
      "demo",
      "video",
      "tutorial",
      "browser"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "community-growth-ugc",
    "sourceRoleFamily": "video-platform-observational",
    "representationTags": [
      "future-capability-signal"
    ]
  },
  {
    "name": "creator-video-guangzhou-food",
    "packNames": [
      "operator-daily"
    ],
    "bucket": "creator-video-cn",
    "evaluationTier": "observational",
    "qualityFocus": "breadth",
    "queries": [
      "广州 探店 up主 bilibili",
      "广州 美食 探店 B站 博主",
      "隋坡 广州 探店 B站"
    ],
    "category": "videos",
    "mode": "general",
    "language": "zh-CN",
    "preferHosts": [],
    "demoteHosts": [
      "hub.docker.com"
    ],
    "expectTerms": [
      "广州",
      "探店",
      "美食",
      "bilibili",
      "up主"
    ],
    "layerNames": [
      "open-world"
    ],
    "intentFamily": "general-mixed",
    "sourceRoleFamily": "general-web",
    "representationTags": [
      "future-capability-signal"
    ]
  }
];
