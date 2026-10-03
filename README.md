# AXIOM — Agentic Multi-Bot Operator Station

A team of named AI bots that runs on a 5,269-line constitution, works in parallel, and shows its work on a live office floor. Next.js app, ready for Vercel. Bring any model key.

## What's inside

- **`/`**: presentation landing page. Thesis, live kernel compiler ("spine"), the bot's voice card and prime directives, personas, the workstation, and a self-running office floor.
- **`/station`**: the workstation.
  - **Floor**: an isometric campus where the six bots (Atlas, Iris, Kai, Wren, Sol, Theo) work in parallel. Rooms:
    - **Back row:** data center (three rack rows, cooling units), server room (the kernel console), vault (round vault door, lockers, gold, safe, memory shelves), warehouse (pallet racking and a forklift robot), security (a live CCTV wall that shows where every bot is, and a Sentry robot that patrols).
    - **Middle:** meeting room, boardroom with a kernel TV, open office (14 desks), the lead's office, a huddle room with a coffee corner, and a game room (ping-pong, arcades, TV with beanbags).
    - **Front:** reception (turnstiles, concierge robot, entrance), canteen (kitchen line, fridge, vending machines, 8 tables), focus booths and the library.

    Each bot's body follows its *real* response phase:

    | Bot phase | On the floor |
    |---|---|
    | job received, model thinking | walks to the nearest meeting room / huddle table and thinks |
    | still no tokens (background wait) | goes for coffee at the nearest coffee point |
    | tokens streaming | back at the desk typing; the reply streams in a bubble |
    | done | leans back, "shipped" |
    | error | inspects the racks in the server room / data center |
    | handoff | walks to a teammate's desk |
    | needs approval | stands with a hand raised |
    | vault save | files the note in the vault |

    Idle bots keep an ambient routine: eating in the canteen, ping-pong in pairs, arcades, fetching boxes from the warehouse, calls in the booths, reading, chatting with security. Bots on a job walk briskly. The camera follows whoever is busy (scroll to zoom, drag to pan, double-click to reset, or use the room chips to jump). The left panel shows the crew (phase, elapsed time, honest progress), where everyone is, and the ship-log.

    Workflow on the floor:
    - **Solo / Team composer**: give one bot a job, or switch to Team, pick teammates, and Atlas plans while they work in parallel.
    - **Live drawer**: the reply streams in as it is written. For a team run it shows the plan, every lane, the deliverable and the approval.
    - **Bot profile**: click any bot (on the floor or in the crew list) for its status, skill modules, memory and recent work. From there you can assign it the next job, follow it with the camera, chat with it, or add it to the team.
    - **Approvals**: a banner above the floor, a header pill and a toast on any other view, each with Approve / Reject.
    - **▶ Showcase**: a guided tour. First a solo `/research` job (meeting room → coffee → desk), then a team run that ends with an approval.
  - **Team**: multi-bot runs. The lead plans, teammates work in parallel, there are handoffs and synthesis, plus approval for sensitive actions, per-bot memory and routines.
  - **Chat** with any bot, **kernel inspector** (lite / core / full, module toggles, spine), **kernel viewer**, **megaprompt studio**, **memory vault**, **playbooks**, **⌘K palette**.
- **Any engine**, 25 providers in three groups:
  - **Frontier APIs**: xAI Grok, OpenAI, Anthropic Claude, Google Gemini, Mistral, DeepSeek.
  - **Open-model clouds**: Groq, Cerebras, OpenRouter, Hugging Face (Inference Providers), Together, Fireworks, DeepInfra, SambaNova, Novita, Hyperbolic.
  - **Run it yourself** (open weights, no key): Ollama, LM Studio, vLLM, llama.cpp server, LocalAI, Jan, text-generation-webui, KoboldCpp, plus any OpenAI-compatible server (TGI, SGLang, LiteLLM, TabbyAPI, MLX-LM…).

  Paste a key in the station (the provider is detected from its prefix), pick a local runtime (its model list is fetched automatically), or set an engine on the server. With nothing configured, the station runs in **demo mode**. In demo mode `/research` deliberately thinks long, to show the coffee wait.

### Local models (Ollama, LM Studio, vLLM, llama.cpp…)
- **Running AXIOM on your own machine** (`npm run dev`): pick the runtime in Engine. The server proxies it, so no CORS setup is needed.
- **On a deployed site** (e.g. Vercel): the server cannot reach `localhost` on your laptop, so the station calls your runtime **from the browser**. Allow the site's origin in the runtime once. The Engine panel shows the exact command, e.g. `OLLAMA_ORIGINS="https://your-app.vercel.app" ollama serve`, or "Enable CORS" in LM Studio. Chat and Team runs both work this way: in browser mode the Team orchestrator runs in the tab.
- **A self-hosted server next to its runtime**: set `OLLAMA_BASE_URL` (or `LMSTUDIO_BASE_URL`, `VLLM_BASE_URL`, …) and every visitor uses it. Set `ALLOW_LOCAL_ENGINES=true` only on a server you alone use.

## Architecture

```
prompts/axiom-megaprompt.md     5,269-line source of truth
lib/megaprompt.ts               section parser + kernel compiler
lib/catalog.ts                  bots/personas, modules, slash commands, playbooks
lib/chat-sender.ts              the one chat pipeline (shared by Chat and Floor)
lib/floor-bus.ts                event bus: job/compiled/token/done/error/handoff/wait/approval → Floor + ship-log
components/floor/world.ts       the office: map, A* paths, bot behaviour, canvas renderer, camera
lib/engine/providers.ts         provider registry (cloud, open-model clouds, local runtimes) + key auto-detection
lib/engine/compat.ts            OpenAI-compatible streaming + model listing, shared by server and browser
lib/engine/client.ts            browser transport for runtimes on the operator's machine
lib/server/engine.ts            server engine resolution, Anthropic SDK adapter, model fallback, readable errors
app/api/chat                    validates input, compiles the kernel server-side, streams SSE
app/api/team                    multi-bot orchestration (plan → parallel work → synthesis → approval)
app/api/engine/test             one-line connection check for a key
app/api/engine/models           lists the models an engine serves
app/api/status                  server engine, mode, megaprompt stats
```

Keys never reach the browser unless the operator pastes their own. In that case the key stays in the operator's browser and is proxied per request to known provider hosts only. Local runtime URLs are proxied only in development (or with `ALLOW_LOCAL_ENGINES=true`) and only to localhost / private-network addresses.

## Run locally
```bash
npm install
cp .env.example .env.local   # optional: add a key (see the comments inside)
npm run dev                  # http://localhost:3000
```

## Deploy to Vercel
1. Import this repo at https://vercel.com/new (Next.js is auto-detected).
2. Optional: add one key, e.g. `XAI_API_KEY`, `GROQ_API_KEY`, `HF_TOKEN`, `GEMINI_API_KEY`, `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. You can also skip it; visitors can paste their own key or point the station at their own Ollama / LM Studio.
3. Deploy.

Independent project; not affiliated with xAI or any model provider.
