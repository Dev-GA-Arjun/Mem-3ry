# Architecture

```
Phone browser (React page)
   | upload screenshots, type questions
   v
Express backend (server/)
   | agent loop: user message + MCP tool list -> Gemma 4
   | executes tool calls through MCP client, returns results to Gemma
   | streams tool events to UI via SSE
   v
MCP server (mcp/, stdio child process)
   tools: add_item, search_items, plan_day
   v
data/items.json
```

## Endpoints
- POST /api/items: upload one or more images (and optional caption). Runs add_item through the agent or directly.
- POST /api/chat: { message } returns the final answer.
- GET /api/events: SSE stream of tool events { tool, args, status, summary }.
- GET /api/items: list saved items for the card grid.

## MCP tools
- add_item({ image_base64?, caption? }): calls Gemma 4 to extract the item schema, validates JSON, appends to data/items.json, returns the item.
- search_items({ query, category?, area? }): keyword scoring over title, tags, key_points, place, area. Gemma turns Tanglish or vague queries into good arguments.
- plan_day({ vibe?, area? }): selects 3 to 4 items across categories (food or cafe, workout or activity, movie or entertainment, place) and returns an ordered timeline. Gemma writes the friendly final text.

## Model usage
- Model: Gemma 4 via Gemini API (open-weight). Model id recorded in HANDOVER.md.
- Function calling preferred. Fallback: model returns JSON {"tool","args"}, backend parses and executes.
- Extraction prompt asks for JSON only, matching the item schema, and the backend strips code fences before parsing.

## Phone access
- Same Wi-Fi: http://<laptop-ip>:3000
- If blocked: phone hotspot, or Cloudflare Tunnel or ngrok.
- API key stays on the server only.
