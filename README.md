# AXIOM — Operator Station

A personal Grok-class mind that runs on a 5,269-line constitution. Next.js app, ready for Vercel.

- **`/`**: presentation landing page. Hero, thesis, a live **kernel compiler** demo (the real megaprompt drawn as a "spine"), the bot's voice card and prime directives, personas, and a workstation preview.
- **`/station`**: the workstation.
  - **Chat**: streaming replies, 6 personas, 20 slash commands with autocomplete, copy / regenerate / save-to-vault on every answer, model and latency per reply
  - **Kernel inspector**: lite / core / full, module toggles, live budget bar and kernel spine
  - **Kernel viewer**: the exact system prompt the engine receives, copyable
  - **Megaprompt studio**: every section, searchable and line-numbered, plus an operator addendum
  - **Memory vault**: notes injected after the kernel on every turn
  - **Playbooks** and a **⌘K command palette**
  - Boot sequence, session export to Markdown, mobile drawer
- **Demo mode**: without `XAI_API_KEY` the station streams scripted replies in AXIOM's voice (EN/ID), so a live presentation never hits a wall.

## Architecture

```
prompts/axiom-megaprompt.md   5,269-line source of truth (bundled as a string)
lib/megaprompt.ts             section parser + kernel compiler (shared by client and server)
lib/catalog.ts                personas, modules, slash commands, playbooks
lib/store.ts                  zustand store, persisted to localStorage
lib/server/xai.ts             xAI client: model fallback chain, connect timeout, SSE token reader
lib/server/rate-limit.ts      per-IP sliding window
app/api/chat/route.ts         validates input, compiles the kernel server-side, streams SSE
app/api/status/route.ts       engine mode, model chain, megaprompt stats
```

The API key never leaves the server. The client sends settings; the server recompiles the kernel itself and clamps every input.

## Run locally
```bash
npm install
cp .env.example .env.local   # optional: fill XAI_API_KEY
npm run dev                  # http://localhost:3000
```

## Deploy to Vercel
1. Import the repo at https://vercel.com/new (Next.js is auto-detected)
2. Optional: add `XAI_API_KEY` (from https://console.x.ai), plus `XAI_MODELS` / `RATE_LIMIT_PER_MIN`
3. Deploy

Independent project; not affiliated with xAI.
