# Handover

Updated: 24 Oct 2026, by Arjun

## Goal
Mem<3ry: screenshot of a saved reel to card, search (English and Tanglish), weekend planner, live tool feed. Gemma 4 via Gemini API. Due 3:30 PM on 24 Oct 2026.

## Done
- Idea, name, spec and docs decided (see SPEC.md and docs/DECISIONS.md)
- Smoke test scaffold created in server/smoke.js and package.json to list available Gemini models and test function calling vs JSON fallback

## In progress
- Smoke test awaits a valid GEMINI_API_KEY in .env; currently blocked because the repo has only a placeholder value.

## Next (ordered)
1. Smoke test: server/smoke.js calls Gemma 4 via Gemini API with a dummy tool. Find the right model id. Record whether function calling works. If not, use JSON fallback.
2. MCP server with add_item (image or caption to structured JSON in data/items.json). Test on samples/.
3. search_items and plan_day.
4. Express agent loop, POST /api/chat, SSE /api/events for the tool feed.
5. React mobile upload and chat UI with tool feed panel.
6. Feature freeze at 2:45 PM. Then README polish, demo video, MLH submission.

## How to run
1. Put a real GEMINI_API_KEY in .env
2. npm install
3. node server/smoke.js

## Gotchas
- Gemma 4 model id: pending actual API validation
- Function calling supported on Gemini API: pending actual API validation
- Fallback strategy: JSON parsing of model output when function calling is unavailable
- Rate limits: unknown until the live smoke test can run
- Dev laptop has 8 GB RAM and no GPU, so do not run models locally.

## Do not touch
- (none yet)
