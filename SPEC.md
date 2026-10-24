# Mem<3ry (repo: Mem-3ry, npm: mem-3ry)

Tagline: Your saved reels, finally remembered.

## Problem
Students save hundreds of reels and never open them again.

## Solution
Drop a screenshot of a saved reel. Gemma 4 extracts the details. Ask questions in plain language (English or Tanglish) and get a weekend plan built from your saved reels.

## Audience and judging
Evaluators are about third-year college students. The build must be instantly understandable, relatable and exciting. Prefer a visible, interactive demo over technical depth.

## Prize targets
1. Best Open-Source AI Project (open-weight model central, original project, open-source repo)
2. Best Use of Gemma 4 (multimodal input, focused tool, rapid prototype via Gemini API)

## Stack
- Node 20, Express
- @modelcontextprotocol/sdk (MCP server and client)
- @google/genai (Gemma 4 through Gemini API)
- React with Vite (mobile friendly)
- JSON file storage: data/items.json (no database, no login)

## Must-have features (build in this order)
1. add_item: image and/or caption in. Gemma returns structured JSON, saved to data/items.json.
2. search_items: natural language query (English or Tanglish) returns matching items.
3. plan_day: picks 3 to 4 saved items (food or cafe, workout or activity, movie or entertainment, place) and returns a simple timed plan.
4. Tool call feed: UI panel showing each tool call live (name, args, short result).

## Item schema
```
{
  "id": "string",
  "title": "string",
  "category": "cafe | food | recipe | workout | movie | travel | product | tip | other",
  "confidence": "high | medium | low",
  "place": "string or null",
  "area": "string or null",
  "key_points": ["string"],
  "tags": ["string"],
  "source_note": "string or null",
  "created_at": "ISO date"
}
```

For recipes, `key_points` includes all legible on-screen text, including ingredients and steps. Tags contain topics only, never account handles. Put a visible creator handle in `source_note`. Use low confidence when any detail is guessed.

## Nice-to-have (only if ahead at 1:30)
- Reel Roulette button: random saved item and "do this today"
- Audio transcription of screen recordings

## Out of scope
Instagram login or scraping, accounts, mobile app, database, payments.

## Input method
Phone is only the input device. User screenshots a reel while scrolling, later opens the web app in the phone browser and uploads screenshots from the gallery. The MCP server never touches Instagram.

## Risks and fallbacks
- Gemma 4 function calling via Gemini API may be unsupported or flaky: smoke test first. Fallback: prompt the model to return JSON {"tool","args"} and parse it.
- Rate limits on free tier: cache extraction results, keep prompts short.
- Phone cannot reach laptop on college Wi-Fi: use phone hotspot or a tunnel (Cloudflare Tunnel or ngrok).
- Extraction quality on blurry screenshots: prepare clean sample screenshots in advance.

## Definition of done
- 3 or more sample screenshots turn into correct cards
- Search and planner answer correctly in English and one Tanglish query
- Tool feed visible during demo
- Public repo with README, MIT license, demo video, MLH submission
