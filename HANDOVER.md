# Handover

Updated: 24 Oct 2026, by Arjun

## Goal
Mem<3ry: screenshot of a saved reel to card, search (English and Tanglish), weekend planner, live tool feed. Gemma 4 via Gemini API. Due 3:30 PM on 24 Oct 2026.

## Done
- Idea, name, spec and docs decided (see SPEC.md and docs/DECISIONS.md)
- Smoke test passed against the live Gemini API using the Gemma 4 model and function calling

## In progress
- Ready to move to Task 2: MCP server with add_item

## Next (ordered)
1. MCP server with add_item (image or caption to structured JSON in data/items.json). Test on samples/.
2. search_items and plan_day.
3. Express agent loop, POST /api/chat, SSE /api/events for the tool feed.
4. React mobile upload and chat UI with tool feed panel.
5. Feature freeze at 2:45 PM. Then README polish, demo video, MLH submission.

## How to run
npm install && npm run smoke

## Gotchas
- Gemma 4 model id: gemma-4-26b-a4b-it (Gemini API model name is models/gemma-4-26b-a4b-it)
- Function calling supported on Gemini API: yes
- Fallback strategy: not needed for this model; JSON fallback remains available if a future model does not support function calls
- Rate limits: not hit during the successful smoke test
- Dev laptop has 8 GB RAM and no GPU, so do not run models locally.

## Do not touch
- (none yet)
