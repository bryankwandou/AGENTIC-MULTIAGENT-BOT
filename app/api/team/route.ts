import { MODULES, PERSONAS, type CompileMode, type LanguagePin, type PersonaId } from "@/lib/catalog";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { requestEngine } from "@/lib/server/engine";
import { demoOpener } from "@/lib/team/demo";
import { engineOpener } from "@/lib/team/engine-opener";
import { HOSTED_PACE, LOCAL_PACE, orchestrate, type TeamInput } from "@/lib/team/orchestrator";
import { LEAD, MEMORY_MAX_CHARS, MEMORY_MAX_NOTES, type TeamEvent } from "@/lib/team/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PERSONA_IDS = new Set<PersonaId>(PERSONAS.map((p) => p.id));
const MODULE_IDS = new Set(MODULES.map((m) => m.id));
const MODES = new Set<CompileMode>(["lite", "core", "full"]);
const LANGS = new Set<LanguagePin>(["auto", "id", "en"]);

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request));
  if (!limit.ok) {
    return Response.json(
      { error: `Rate limit — try again in ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!raw || typeof raw !== "object") return Response.json({ error: "Invalid request." }, { status: 400 });

  const job = String(raw.job ?? "").trim().slice(0, 4000);
  if (!job) return Response.json({ error: "Empty job." }, { status: 400 });

  const bots = [
    ...new Set(
      (Array.isArray(raw.bots) ? raw.bots : []).filter(
        (b): b is PersonaId => typeof b === "string" && PERSONA_IDS.has(b as PersonaId) && b !== LEAD,
      ),
    ),
  ];
  if (!bots.length) return Response.json({ error: "Pick at least one teammate besides the lead." }, { status: 400 });

  const compileMode = MODES.has(raw.compileMode as CompileMode) ? (raw.compileMode as CompileMode) : "core";
  const language = LANGS.has(raw.language as LanguagePin) ? (raw.language as LanguagePin) : "auto";
  const enabledModules = (Array.isArray(raw.enabledModules) ? raw.enabledModules : []).filter(
    (id): id is string => typeof id === "string" && MODULE_IDS.has(id),
  );
  const vault = (Array.isArray(raw.vault) ? raw.vault : []).slice(0, 40).map((v) => String(v).slice(0, 500));
  const addendum = String(raw.addendum ?? "").slice(0, 4000);
  const temperature = clamp(Number(raw.temperature ?? 0.6), 0, 1.2, 0.6);
  const maxTokens = Math.round(clamp(Number(raw.maxTokens ?? 1800), 256, 4096, 1800));

  const botMemory: TeamInput["botMemory"] = {};
  const memRaw = raw.botMemory;
  if (memRaw && typeof memRaw === "object" && !Array.isArray(memRaw)) {
    for (const id of PERSONA_IDS) {
      const notes = (memRaw as Record<string, unknown>)[id];
      if (!Array.isArray(notes)) continue;
      const clean = notes
        .filter((n): n is string => typeof n === "string" && n.trim().length > 0)
        .slice(0, MEMORY_MAX_NOTES)
        .map((n) => n.trim().slice(0, MEMORY_MAX_CHARS));
      if (clean.length) botMemory[id] = clean;
    }
  }

  const input: TeamInput = { job, bots, language, compileMode, enabledModules, vault, addendum, temperature, maxTokens, botMemory };

  const { engine, error } = requestEngine(request);
  if (error) return Response.json({ error }, { status: 400 });
  const open = engine ? engineOpener(engine) : demoOpener(input);

  const encoder = new TextEncoder();
  const sse = (obj: TeamEvent) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  // One signal for the whole run: the client hanging up (request abort or stream cancel) stops every bot.
  const stop = new AbortController();
  const onAbort = () => stop.abort();
  if (request.signal.aborted) stop.abort();
  else request.signal.addEventListener("abort", onAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit = (e: TeamEvent) => {
        if (closed || stop.signal.aborted) return;
        try {
          controller.enqueue(sse(e));
        } catch {
          closed = true;
        }
      };
      try {
        // A local runtime is only proxied where it runs next to this server — no serverless clock there.
        await orchestrate(input, open, emit, stop.signal, !engine, engine?.local ? LOCAL_PACE : HOSTED_PACE);
      } catch (err) {
        if (!stop.signal.aborted) {
          emit({ type: "error", bot: LEAD, message: err instanceof Error ? err.message : "Team run failed." });
          emit({ type: "end" });
        }
      } finally {
        closed = true;
        request.signal.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
    cancel() {
      stop.abort();
    },
  });

  return new Response(stream, { headers });
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
