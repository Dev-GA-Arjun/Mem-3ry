# Token saving and multi-agent workflow

Agents in use: Google Antigravity, GitHub Copilot, and other free tiers. Limits will run out, so progress must live in files, not chats.

## Token saving
- SPEC.md is the single source of truth. Agents read it instead of rediscovering context.
- Small, file-scoped tasks (see docs/PROMPTS.md). Never ask for the whole app at once.
- Fresh chat per task. Long chats burn tokens re-reading history.
- Attach only the files needed.
- Paste only the last 10 to 15 relevant lines of an error.
- Commit after every working step so a bad edit is a one-command revert.
- Use cheap tools for small jobs: inline completion for boilerplate, agent mode for multi-file tasks.
- Keep the stack tiny. Every extra library costs tokens and debugging time.

## Rotation
1. Work with agent A until it warns about limits or starts looping.
2. Ask it: update HANDOVER.md now. Commit.
3. Open agent B, paste the handover prompt from docs/PROMPTS.md.
4. Repeat. If all limits are hit, write the remaining small pieces by hand using HANDOVER.md as the checklist.

## Shared rules
AGENTS.md is the master rules file. .github/copilot-instructions.md points to it. If Antigravity supports a rules file in your version, point it at AGENTS.md too, or paste the first lines of AGENTS.md at the start of a session.

## Dev machine constraint
Laptop has 8 GB RAM and no dedicated GPU. Do not run models locally. Use Gemma 4 through the Gemini API. AirLLM and local Ollama models are out of scope.
