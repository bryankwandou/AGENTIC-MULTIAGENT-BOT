# AXIOM — Agentic Multi-Bot Operator Station

A team of named AI bots that runs on a 5,269-line constitution, works in parallel, and shows its work on a live office floor. Next.js app, ready for Vercel. Bring any model key.

## What's inside

- **`/`**: presentation landing page. Thesis, live kernel compiler ("spine"), the bot's voice card and prime directives, personas, the workstation, and a self-running office floor.
- **`/station`**: the workstation.
  - **Floor**: an isometric office where the six bots (Atlas, Iris, Kai, Wren, Sol, Theo) work at their desks. Each bot's body follows its *real* response phase:

    | Bot phase | On the floor |
    |---|---|
    | job received, model thinking | walks to the meeting room and thinks |
    | still no tokens (background wait) | goes for coffee |
    | tokens streaming | back at the desk typing; the reply streams in a bubble |
    | done | leans back, "shipped" |
    | error | inspects the racks in the kernel room |
    | handoff | walks to a teammate's desk |
    | needs approval | stands with a hand raised |
    | vault save | files the note at the shelves |

    Idle bots keep an ambient routine. The camera follows whoever is busy (scroll to zoom, drag to pan, double-click to reset). The left panel shows live counts, honest work bars and the ship-log.
  - **Team**: multi-bot runs. The lead plans, teammates work in parallel, there are handoffs and synthesis, plus approval for sensitive actions, per-bot memory and routines.
  - **Chat** with any bot, **kernel inspector** (lite / core / full, module toggles, spine), **kernel viewer**, **megaprompt studio**, **memory vault**, **playbooks**, **⌘K palette**.
- **Any engine**: xAI, Groq, Gemini, OpenAI, Anthropic, OpenRouter, DeepSeek, Mistral, Cerebras, or any OpenAI-compatible URL. Paste a key in the station (the provider is detected from its prefix) or set one on the server. With no key at all, the station runs in **demo mode**. In demo mode `/research` deliberately thinks long, to show the coffee wait.

## Architecture

```
prompts/axiom-megaprompt.md     5,269-line source of truth
lib/megaprompt.ts               section parser + kernel compiler
lib/catalog.ts                  bots/personas, modules, slash commands, playbooks
lib/chat-sender.ts              the one chat pipeline (shared by Chat and Floor)
lib/floor-bus.ts                event bus: job/compiled/token/done/error/handoff/wait/approval → Floor + ship-log
components/floor/world.ts       the office: map, A* paths, bot behaviour, canvas renderer, camera
lib/engine/providers.ts         provider registry + key auto-detection
lib/server/engine.ts            OpenAI-compatible adapter + Anthropic SDK adapter, model fallback, readable errors
app/api/chat                    validates input, compiles the kernel server-side, streams SSE
app/api/team                    multi-bot orchestration (plan → parallel work → synthesis → approval)
app/api/engine/test             one-line connection check for a key
app/api/status                  server engine, mode, megaprompt stats
```

Keys never reach the browser unless the operator pastes their own. In that case the key stays in the operator's browser and is proxied per request to known provider hosts only.

## Run locally
```bash
npm install
cp .env.example .env.local   # optional: add a key (see the comments inside)
npm run dev                  # http://localhost:3000
```

## Deploy to Vercel
1. Import this repo at https://vercel.com/new (Next.js is auto-detected).
2. Optional: add one key, e.g. `XAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. You can also skip it; visitors can paste their own key in the station.
3. Deploy.

Independent project; not affiliated with xAI or any model provider.
