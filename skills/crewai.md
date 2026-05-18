# Agent Searchkit — CrewAI Integration Skill

## What this does

Integrates agent-searchkit as a CrewAI Tool, giving your CrewAI agents local search capabilities.

## Prerequisites

- Python 3.10+
- SearXNG running locally
- agent-searchkit CLI scripts available

## Setup

### 1. Clone agent-searchkit

```bash
git clone https://github.com/LemonCANDY42/agent-searchkit.git
cd agent-searchkit
```

### 2. Create CrewAI tools

```python
import subprocess
import json
from crewai.tools import BaseTool
from pydantic import BaseModel, Field

WEB_SEARCHER_PATH = "/path/to/agent-searchkit"

class SearchInput(BaseModel):
    query: str = Field(description="Search query")

class ResearchInput(BaseModel):
    query: str = Field(description="Research query")

class WebSearchTool(BaseTool):
    name: str = "web_search"
    description: str = "Search the web locally through SearXNG. Returns titles, URLs, and snippets."
    args_schema: type[BaseModel] = SearchInput

    def _run(self, query: str) -> str:
        result = subprocess.run(
            [f"{WEB_SEARCHER_PATH}/bin/agent-searchkit-search", "--json", "-n", "8", query],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode != 0:
            return f"Search failed: {result.stderr}"
        results = json.loads(result.stdout)
        return "\n".join(
            f"[{i}] {r['title']}\n    {r['url']}\n    {r.get('content', '')}"
            for i, r in enumerate(results.get("results", []), 1)
        )

class WebResearchTool(BaseTool):
    name: str = "web_research"
    description: str = "Run a deep research session. Returns a markdown report."
    args_schema: type[BaseModel] = ResearchInput

    def _run(self, query: str) -> str:
        result = subprocess.run(
            [f"{WEB_SEARCHER_PATH}/bin/agent-searchkit-research", "-n", "12", query],
            capture_output=True, text=True, timeout=120,
        )
        return result.stdout.strip()
```

### 3. Use in a CrewAI crew

```python
from crewai import Agent, Task, Crew

researcher = Agent(
    role="Research Analyst",
    goal="Find accurate, up-to-date information on technical topics",
    tools=[WebSearchTool(), WebResearchTool()],
    verbose=True,
)

task = Task(
    description="Compare the top 3 Python web frameworks in 2026",
    expected_output="A comparison table with pros, cons, and recommendations",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()
```

## Tips

- The CLI integration above is a direct SearXNG wrapper; use the MCP server when the agent needs rerank modes, citation metadata, or `rerankVersion` control.
- For Chinese queries, add `-l zh-CN` to the subprocess command or expose language as a tool argument.
