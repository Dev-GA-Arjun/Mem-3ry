# Decisions and history

## Chosen
- Project: Mem<3ry, a saved-reels organizer powered by Gemma 4 and a custom MCP server
- Name: Mem<3ry (repo Mem-3ry, npm mem-3ry). Pronounced "memory".
- Model access: Gemma 4 via Gemini API (laptop cannot run models locally)
- Features picked: plain-language search including Tanglish, weekend planner, live tool call feed (plus the base screenshot to card step)
- Input method: user screenshots reels, uploads from phone browser
- Solo build

## Why this idea
- Judges are about third-year students: instantly relatable, easy to demo, can take part live
- Gemma 4 is central (vision plus tool calling), MCP server is original
- Existing MCP servers only wrap models (ollama-mcp, mcp-ollama-python, LM Studio) or manage notes (Obsidian MCP servers). A reels organizer is not an existing project.

## Rejected
- Plain "MCP server that wraps a local model": already exists, not original
- AirLLM: far too slow for agent loops, no tool-calling layer
- Running Gemma locally: 8 GB RAM, no GPU
- Scraping Instagram saved reels: no public API, breaks terms, account risk
- Tool-calling benchmark tester: good technically, weak demo for student judges
- Tamil bill explainer and other ideas: kept as backups only

## Optional idea
- Obsidian as storage: existing Obsidian MCP servers could store items as Markdown notes. Skipped for hack day to avoid setup risk. JSON file is the default.

## Open questions
- Does Gemma 4 on the Gemini API support function calling? (smoke test decides)
- Exact Gemma 4 model id (smoke test decides)
