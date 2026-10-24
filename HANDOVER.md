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
- POST /api/upload accepts one JPEG, PNG, or WebP image up to 8 MB, verifies its signature, extracts and persists the item with a generated upload filename and repository-relative image_path
- MCP add_item and HTTP uploads share extraction, validation, and item persistence in mcp/item-service.js
- server/test-upload.js covers valid upload, unsupported MIME type, invalid image signature, oversized upload, extraction failure cleanup, and image_path persistence with a mock Gemini client
- Task 4b changed HANDOVER.md, mcp/server.js, mcp/item-service.js, server/index.js, and server/test-upload.js
- Task 4b validation passed: node --test server/test-upload.js (8/8), syntax checks for server/index.js, server/agent.js, mcp/server.js, mcp/item-service.js, and server/test-upload.js, plus mcp/test-search.js; data/items.json hash remained unchanged
- Task 5 React/Vite UI is implemented in web/: screenshot upload uses POST /api/upload, saved cards use GET /api/items, chat uses POST /api/chat, and the live tool feed consumes GET /api/events
- README.md documents starting the backend and Vite frontend in separate terminals
- Task 5 changed README.md, HANDOVER.md, and web/package.json, web/package-lock.json, web/vite.config.js, web/index.html, web/src/main.jsx, web/src/App.jsx, and web/src/styles.css
- Task 5 verification passed: npm run build --prefix web, node --test server/test-upload.js (8/8), and git diff --check
- Browser verification passed: GET /api/items returned four saved items, the tool feed connected, the chat search and MCP event were verified, and a mocked multipart image upload updated the UI without writing to saved data
- Responsive checks passed at 320, 376, 415, 768, and 1280 CSS pixels with no horizontal overflow or wrapped clickable labels; visible text contrast checks passed
- Existing changes to data/items.json and untracked data/items.backup.json were preserved
- Task 6 adds POST /api/plan through the existing MCP plan_day tool, with planner loading, empty and error states and an ordered timeline in the existing UI
- Task 6 adds accessible loading, error, empty and duplicate-submission handling for upload, saved items, chat and planning, while retaining the existing visual design
- README.md now documents the repository URL, Node and npm setup, environment configuration, development commands and backend test command
- Task 6 changed README.md, HANDOVER.md, server/agent.js, server/index.js, server/test-plan.js, web/src/App.jsx and web/src/styles.css
- Task 6 backend tests passed: node --test server/test-upload.js server/test-plan.js (12/12); web production build, changed-file syntax checks and git diff --check passed
- Browser verification passed for a real screenshot upload through the UI to isolated temporary storage, saved-card rendering, real planner output and SSE tool events; mocked upload, item-load, chat and planner failure states and empty states rendered correctly
- Responsive checks passed at 320, 376, 415, 768 and 1280 CSS pixels without horizontal overflow; visible focus styling was confirmed, but automated Tab advancement could not be verified in the browser harness
- Planner output contained two items because only two suitable categories were available in the saved data
- A real chat request produced a completed search_items event but Gemini returned HTTP 503 twice; the UI showed the friendly error, and a successful live chat response remains unverified
- The five saved records and pre-existing data/uploads/fcae04fd-6d0e-47f4-bc04-290ba3296683.jpg remain untouched; all upload-flow browser testing used isolated temporary storage

## In progress
- None

## Next (ordered)
1. Feature freeze at 2:45 PM.
2. Prepare the demo video and MLH submission.

## How to run
npm install
node --env-file=.env mcp/test-add.js
node --env-file=.env mcp/test-search.js
node --env-file=.env server/index.js
node --env-file=.env server/test-chat.js
node --test server/test-upload.js
node --test server/test-plan.js
cd web
npm install
npm run dev

## Gotchas
- Gemma 4 model id: gemma-4-26b-a4b-it (Gemini API model name is models/gemma-4-26b-a4b-it)
- Function calling supported on Gemini API: yes
- Fallback strategy: not needed for this model; JSON fallback remains available if a future model does not support function calls
- Rate limits: not hit during the successful smoke test and MCP validation
- Current live chat verification returned Gemini HTTP 503 after the search_items tool completed; try again when the model service is available
- mcp/test-add.js clears data/items.json before processing samples/
- mcp/test-search.js only reads data/items.json and verifies that its contents do not change
- Start the API with node --env-file=.env server/index.js; it listens on PORT or 3000
- API routes: POST /api/chat, GET /api/items, GET /api/events, and POST /api/upload
- POST /api/plan returns a timeline from the existing plan_day MCP tool
- Upload field is image; JPEG, PNG, and WebP are supported up to 8 MB, with content signature checks
- Run the backend from the repository root and the Vite app from web/ in separate terminals; Vite proxies /api to port 3000
- Gemini calls retry once; rate-limit and timeout failures return friendly messages
- Dev laptop has 8 GB RAM and no GPU, so do not run models locally.

## Do not touch
- data/items.json has a pre-existing uncommitted modification; preserve it
