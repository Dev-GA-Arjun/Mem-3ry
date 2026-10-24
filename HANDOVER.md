# Handover

Updated: 24 Oct 2026, by Arjun

## Goal
Mem<3ry: screenshot of a saved reel to card, search (English and Tanglish), weekend planner, live tool feed. Gemma 4 via Gemini API. Due 3:30 PM on 24 Oct 2026.

## Done
- Idea, name, spec and docs decided (see SPEC.md and docs/DECISIONS.md)
- Smoke test passed against the live Gemini API using the Gemma 4 model and function calling
- MCP stdio server with add_item is implemented in mcp/server.js and validated with a caption input
- add_item now handles recipe text extraction, topic-only tags, creator handles in source_note, and confidence; sample test resets data/items.json and passed on all five sample images

## In progress
- Task 2 is complete; next work is search_items and plan_day

## Next (ordered)
1. Implement search_items and plan_day.
2. Express agent loop, POST /api/chat, SSE /api/events for the tool feed.
3. React mobile upload and chat UI with tool feed panel.
4. Feature freeze at 2:45 PM. Then README polish, demo video, MLH submission.

## How to run
npm install
node --env-file=.env mcp/test-add.js

## Gotchas
- Gemma 4 model id: gemma-4-26b-a4b-it (Gemini API model name is models/gemma-4-26b-a4b-it)
- Function calling supported on Gemini API: yes
- Fallback strategy: not needed for this model; JSON fallback remains available if a future model does not support function calls
- Rate limits: not hit during the successful smoke test and MCP validation
- mcp/test-add.js clears data/items.json before processing samples/
- Dev laptop has 8 GB RAM and no GPU, so do not run models locally.

## Do not touch
- (none yet)
