# Mem<3ry

Your saved reels, finally remembered.

[GitHub repository](https://github.com/Dev-GA-Arjun/Mem-3ry)

Mem<3ry turns the reels you screenshot while scrolling into a searchable, actionable memory. Drop a screenshot, and an open-weight model (Gemma 4) extracts the details. Then ask questions in English or Tanglish, or ask it to plan your weekend from what you saved.

Built for otaku.dev'26, a Hacktoberfest Hack Day by Commit Culture (Vels University, Chennai, 24 Oct 2026).

## Problem
Students save hundreds of reels and never open them again.

## What it does
- Screenshot to card: Gemma 4 reads a reel screenshot and extracts title, category, place, area, key points and tags.
- Ask naturally: "cafes near Velachery?", "leg day reels", in English or Tanglish.
- Weekend planner: builds a simple timed plan from your saved items.
- Live tool feed: a panel shows every MCP tool call the agent makes, in real time.

## How it works
React page (phone friendly) -> Express backend with agent loop -> Gemma 4 (Gemini API, function calling) -> MCP client -> MCP server (add_item, search_items, plan_day) -> data/items.json.

See docs/ARCHITECTURE.md.

## Open-source and open-weight
- Model: Gemma 4 (open-weight), accessed through the Gemini API. 
- Tools: a custom MCP server written for this project.
- Code: open source under the MIT license.

## Run locally

Requirements: Node.js 20 or newer and npm.

```
npm install
```

Create `.env` in the repository root from `.env.example`, then add your `GEMINI_API_KEY`. In PowerShell use `Copy-Item .env.example .env`; in macOS, Linux, or Git Bash use `cp .env.example .env`. Keep the key in the backend environment and never put it in frontend code.

Start the backend in the repository root:
```
node --env-file=.env server/index.js
```

In a second terminal, start the mobile-friendly Vite app:
```
cd web
npm install
npm run dev
```

Open the Vite URL shown in the terminal (usually http://localhost:5173). The Vite development server proxies `/api` to the backend on port 3000. To use it on a phone, run `npm run dev -- --host 0.0.0.0` from `web/`, then open the laptop's Vite address on the same Wi-Fi.

Run the backend tests from the repository root:
```
node --test server/test-upload.js server/test-plan.js
```

## Why screenshots?
Instagram does not give apps access to saved reels, and scraping breaks its terms. A one-second screenshot keeps Mem<3ry safe, simple and account-risk free.

## Status
Hack day build. See HANDOVER.md for current progress.

## License
MIT (see [LICENSE](./LICENSE)).
