# Agent Searchkit — LangChain Integration Skill

## What this does

Integrates agent-searchkit as a LangChain Tool, giving your LangChain agent local SearXNG search capabilities.

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

### 2. Create a LangChain tool

```python
import subprocess
import json
from langchain.tools import Tool

WEB_SEARCHER_PATH = "/path/to/agent-searchkit"

def local_search(query: str, limit: int = 8) -> list[dict]:
    """Search using agent-searchkit CLI."""
    result = subprocess.run(
        [
            f"{WEB_SEARCHER_PATH}/bin/agent-searchkit-search",
            "--json",
            "-n", str(limit),
            query,
        ],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if result.returncode != 0:
        return [{"error": result.stderr.strip()}]
    return json.loads(result.stdout)

def local_research(query: str, limit: int = 12) -> str:
    """Run a research session and save results to disk."""
    result = subprocess.run(
        [
            f"{WEB_SEARCHER_PATH}/bin/agent-searchkit-research",
            "-n", str(limit),
            query,
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return result.stdout.strip()

# Create tools
search_tool = Tool(
    name="local_search",
    func=local_search,
    description=(
        "Search the web locally through SearXNG. "
        "Input: search query string. "
        "Returns retrieval candidates; the LLM should select and rerank final sources. "
        "Prefer Markdown links like [title](url) when citing results."
    ),
)

research_tool = Tool(
    name="local_research",
    func=local_research,
    description=(
        "Run a deep research session and save results to disk. "
        "Input: research query string. "
        "Returns: markdown report."
    ),
)
```

### 3. Use in an agent

```python
from langchain.agents import initialize_agent, AgentType
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o")
tools = [search_tool, research_tool]

agent = initialize_agent(
    tools,
    llm,
    agent=AgentType.OPENAI_FUNCTIONS,
    verbose=True,
)

agent.run("What are the main differences between Redis and Valkey?")
```

## Usage with LangGraph

```python
from langgraph.prebuilt import create_react_agent

agent = create_react_agent(llm, tools)
result = agent.invoke({"messages": [("user", "Find the latest Python 3.14 release notes")]})
```

## Tool parameters

### local_search

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| query | str | required | Search query |
| limit | int | 8 | Max results |

### local_research

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| query | str | required | Research query |
| limit | int | 12 | Max results per sub-query |

## Output guidance

Treat search output as retrieval candidates, not final answer order. For final answers, choose the most relevant candidates and cite them with standard Markdown links:

```markdown
The current behavior is documented in [agent-searchkit README](../README.md#output-and-citations).
```
