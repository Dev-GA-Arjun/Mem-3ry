# Ready prompts for coding agents

Paste one at a time. Start each in a fresh chat.

## 1. Smoke test
Read AGENTS.md and SPEC.md. Task 1 only: create server/smoke.js that calls Gemma 4 through the Gemini API using @google/genai with one dummy tool get_time (function calling). First list available models to find the correct Gemma 4 model id. Print whether the model returned a function call. If function calling is not supported for Gemma 4, implement a fallback where the model returns JSON {"tool","args"} and we parse it. Record the working model id and approach in HANDOVER.md Gotchas. Do not build anything else.

## 2. MCP server: add_item
Task 2: in mcp/, build an MCP server (stdio) with one tool add_item. Input: base64 image or caption text. It calls Gemma 4 to extract {title, category, place, area, key_points[], tags[]} as JSON (see SPEC.md item schema) and appends to data/items.json with id and created_at. Add a test script that runs it on the images in samples/. Update HANDOVER.md.

## 3. Search and planner
Task 3: add search_items and plan_day to the MCP server per docs/ARCHITECTURE.md. search_items does keyword scoring over title, tags, key_points, place and area. plan_day returns 3 to 4 items as an ordered timeline. Add a quick test script. Update HANDOVER.md.

## 4. Agent loop and tool feed
Task 4: in server/, build the Express app with the agent loop: send the user message and MCP tool list to Gemma 4, execute tool calls through an MCP client (spawn mcp/ over stdio), return results to the model, return the final answer. Implement POST /api/chat, POST /api/items, GET /api/items and GET /api/events (SSE) emitting each tool call with name, args, status and a short result summary. Use the function-calling approach recorded in HANDOVER.md.

## 5. UI
Task 5: in web/, build a mobile friendly React (Vite) page: header Mem<3ry with tagline, multi-image upload (file input, camera roll), a card grid of saved items, a chat box, and a live tool feed panel fed by /api/events. Bold, clean design, large tap targets. Proxy /api to the Express server. Show Mem<3ry in the UI as {"Mem<3ry"}.

## 6. Polish and ship
Task 6: add loading states, error messages, an empty state with a hint to upload a screenshot, and the weekend planner button. Do not add new features. Then finalize README with the repo URL and screenshots, and confirm the MIT LICENSE file is present.

## Handover prompt (any new agent)
Read AGENTS.md, SPEC.md and HANDOVER.md. Continue from Next item 1. Before you stop or run low, update HANDOVER.md.
