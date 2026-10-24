# Handover

Updated: 24 Oct 2026, by Arjun

## Goal
Mem<3ry: screenshot of a saved reel to card, search (English and Tanglish), weekend planner, live tool feed. Gemma 4 via Gemini API. Due 3:30 PM on 24 Oct 2026.

## Done
- Idea, name, spec and docs decided (see SPEC.md and docs/DECISIONS.md)
- Smoke test passed against the live Gemini API using the Gemma 4 model and function calling
- MCP stdio server with add_item is implemented in mcp/server.js and validated with a caption input
- add_item now handles recipe text extraction, topic-only tags, creator handles in source_note, and confidence; sample test resets data/items.json and passed on all five sample images
- MCP search_items and plan_day tools are implemented; mcp/test-search.js exercises Tanglish and English queries and verifies it leaves data/items.json unchanged
- server/agent.js runs Gemma 4 function calling through the MCP stdio client for up to five rounds, with retry handling and tool events
- server/index.js exposes POST /api/chat, GET /api/items, and GET /api/events
- server/test-chat.js exercises two searches and a day plan without changing data/items.json

## In progress
- Task 4a is complete; next work is the React mobile upload and chat UI with tool feed

## Next (ordered)
1. Build the React mobile chat UI and tool feed panel.
2. Add upload UI and connect it to item extraction.
3. Feature freeze at 2:45 PM. Then README polish, demo video, and MLH submission.

## How to run
npm install
node --env-file=.env mcp/test-add.js
node --env-file=.env mcp/test-search.js
node --env-file=.env server/index.js
node --env-file=.env server/test-chat.js

## Gotchas
- Gemma 4 model id: gemma-4-26b-a4b-it (Gemini API model name is models/gemma-4-26b-a4b-it)
- Function calling supported on Gemini API: yes
- Fallback strategy: not needed for this model; JSON fallback remains available if a future model does not support function calls
- Rate limits: not hit during the successful smoke test and MCP validation
- mcp/test-add.js clears data/items.json before processing samples/
- mcp/test-search.js only reads data/items.json and verifies that its contents do not change
- Start the API with node --env-file=.env server/index.js; it listens on PORT or 3000
- API routes: POST /api/chat, GET /api/items, and GET /api/events; uploads are not implemented in this step
- Gemini calls retry once; rate-limit and timeout failures return friendly messages
- Dev laptop has 8 GB RAM and no GPU, so do not run models locally.

## Do not touch
- data/items.json has a pre-existing uncommitted modification; preserve it
