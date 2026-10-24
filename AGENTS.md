# Rules for all coding agents (Antigravity, GitHub Copilot, others)

Read SPEC.md and HANDOVER.md first. Update HANDOVER.md before you stop or when you are running low on limits.

## Project
Mem<3ry: screenshot of a saved reel to structured card, plus search, weekend planner and live tool feed. Open-weight model: Gemma 4 via Gemini API.

## Naming
- Display name: Mem<3ry (UI, README title, demo). In HTML write Mem&lt;3ry. In JSX write {"Mem<3ry"}.
- Repo: Mem-3ry
- npm package name (package.json): mem-3ry (must be lowercase)

## Stack and layout
- Node 20, Express, @modelcontextprotocol/sdk, @google/genai, React (Vite)
- server/  express app and agent loop, SSE tool feed
- mcp/     MCP server (stdio) with add_item, search_items, plan_day
- web/     React mobile friendly UI
- data/    items.json storage
- samples/ demo screenshots

## Working rules
- Keep it small. No auth, no database, no extra libraries unless truly needed.
- Do not add features outside SPEC.md.
- One task at a time. Touch only the files named in the task.
- Commit after each working step with a short message.
- Never put API keys in client code or commits. Key lives in .env only, read on the server.
- Gemma model id and function-calling status are recorded in HANDOVER.md Gotchas. Do not guess them; check there.
- No emojis and no em dashes in code comments, docs or UI text.
- Keep answers short. Show only changed code. No long explanations.

## Handover protocol
When your limit is close, or when asked to stop:
1. Finish or revert the current edit so the app runs.
2. Update HANDOVER.md: Done, In progress, Next (ordered), How to run, Gotchas.
3. Commit.

## Start prompt for a new agent
Read AGENTS.md, SPEC.md and HANDOVER.md. Continue from Next item 1. Before you stop or run low, update HANDOVER.md.
