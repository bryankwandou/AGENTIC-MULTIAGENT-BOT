import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PROVIDERS, cleanModel, detectProvider, getProvider, type ProviderId } from "@/lib/engine/providers";

export type Engine = {
  provider: ProviderId | "custom";
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  key: string;
  models: string[];
  source: "byok" | "server";
};

export type ChatMsg = { role: "user" | "assistant"; content: string };

export class EngineError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function envList(v: string | undefined): string[] | null {
  const list = (v ?? "")
    .split(",")
    .map((m) => cleanModel(m))
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * Engine configured on the server. Either the generic trio
 * LLM_API_KEY (+ LLM_PROVIDER | auto-detect | LLM_BASE_URL for any OpenAI-compatible host) + LLM_MODELS,
 * or the first provider-specific key found (XAI_API_KEY, GROQ_API_KEY, GEMINI_API_KEY, ...).
 */
export function serverEngine(): Engine | null {
  const generic = process.env.LLM_API_KEY?.trim();
  if (generic) {
    const custom = process.env.LLM_BASE_URL?.trim();
    const p = getProvider(process.env.LLM_PROVIDER) ?? getProvider(detectProvider(generic));
    if (custom) {
      return {
        provider: "custom",
        name: process.env.LLM_NAME?.trim() || "Custom endpoint",
        kind: "openai",
        baseUrl: custom.replace(/\/+$/, ""),
        key: generic,
        models: envList(process.env.LLM_MODELS) ?? p?.models ?? [],
        source: "server",
      };
    }
    if (p) return { ...fromProvider(p.id, generic, "server"), models: envList(process.env.LLM_MODELS) ?? p.models };
  }
  for (const p of PROVIDERS) {
    const key = process.env[p.envKey]?.trim() || (p.id === "gemini" ? process.env.GOOGLE_API_KEY?.trim() : "");
    if (!key) continue;
    const prefix = p.envKey.replace(/_API_KEY$/, "");
    const models = envList(process.env[`${prefix}_MODELS`]) ?? (p.id === "xai" ? envList(process.env.XAI_MODEL) : null) ?? p.models;
    return { ...fromProvider(p.id, key, "server"), models };
  }
  return null;
}

function fromProvider(id: ProviderId, key: string, source: Engine["source"]): Engine {
  const p = getProvider(id)!;
  return { provider: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, key, models: p.models, source };
}

/**
 * Engine for this request: a key the operator brought (headers, proxied — never stored or logged)
 * wins over the server's own. Only known provider hosts are reachable with a browser-supplied key.
 */
export function requestEngine(req: Request): { engine: Engine | null; error?: string } {
  const key = req.headers.get("x-axiom-key")?.trim();
  if (key && process.env.ALLOW_BYOK !== "false") {
    if (key.length > 512 || /\s/.test(key)) return { engine: null, error: "That does not look like an API key." };
    const p = getProvider(req.headers.get("x-axiom-provider")) ?? getProvider(detectProvider(key));
    if (!p) return { engine: null, error: "Unknown provider for this key — pick one in Engine settings." };
    const model = cleanModel(req.headers.get("x-axiom-model"));
    const engine = fromProvider(p.id, key, "byok");
    engine.models = model ? [model, ...p.models.filter((m) => m !== model)] : p.models;
    return { engine };
  }
  return { engine: serverEngine() };
}

export function describeEngine(e: Engine | null) {
  return e ? { provider: e.provider, name: e.name, models: e.models, source: e.source } : null;
}

type OpenOpts = {
  system: string;
  messages: ChatMsg[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
};

/** Opens a streaming completion on any engine. Throws EngineError with an operator-readable message. */
export async function openEngineStream(engine: Engine, opts: OpenOpts): Promise<{ model: string; tokens: AsyncGenerator<string> }> {
  if (!engine.models.length) throw new EngineError(400, `${engine.name}: no model configured (set LLM_MODELS).`);
  return engine.kind === "anthropic" ? openAnthropic(engine, opts) : openOpenAI(engine, opts);
}

/* ---------------- OpenAI-compatible (xAI, Groq, Gemini, OpenAI, OpenRouter, DeepSeek, Mistral, Cerebras, custom) */

// Models that answered 404 / "unknown model" are skipped for an hour on this instance.
const deadModels = new Map<string, number>();
const MODEL_GONE = /(model\S*\s.*(not found|does not exist|not exist|invalid|unknown|not supported|decommissioned|deprecated))|((not found|does not exist|unknown|invalid)\s.*model)/i;

async function openOpenAI(engine: Engine, opts: OpenOpts) {
  const now = Date.now();
  const alive = engine.models.filter((m) => (deadModels.get(`${engine.baseUrl}|${m}`) ?? 0) < now);
  const chain = alive.length ? alive : engine.models;
  let last: EngineError | null = null;

  for (const model of chain) {
    let withTemperature = true;
    let tokenParam: "max_tokens" | "max_completion_tokens" = "max_tokens";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await post(engine, opts.signal, {
        model,
        stream: true,
        ...(withTemperature ? { temperature: opts.temperature } : {}),
        [tokenParam]: opts.maxTokens,
        messages: [{ role: "system", content: opts.system }, ...opts.messages],
      });
      if (res.ok && res.body) return { model, tokens: readSSE(res.body) };

      const raw = await res.text().catch(() => "");
      const msg = errorMessage(raw);
      // Some models reject sampling knobs or the legacy token parameter — adapt and retry once each.
      if (res.status === 400 && withTemperature && /temperature/i.test(msg)) {
        withTemperature = false;
        continue;
      }
      if (res.status === 400 && tokenParam === "max_tokens" && /max_tokens/i.test(msg)) {
        tokenParam = "max_completion_tokens";
        continue;
      }
      if (res.status === 404 || (res.status === 400 && MODEL_GONE.test(msg))) {
        deadModels.set(`${engine.baseUrl}|${model}`, Date.now() + 3_600_000);
        last = new EngineError(404, `${engine.name}: model "${model}" is not available.`);
        break;
      }
      throw new EngineError(res.status, friendly(engine, res.status, msg));
    }
  }
  throw last ?? new EngineError(404, `${engine.name}: no model in the chain answered.`);
}

async function post(engine: Engine, signal: AbortSignal, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    return await fetch(`${engine.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${engine.key}`,
        ...(engine.provider === "openrouter" ? { "X-Title": "AXIOM Operator Station" } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new EngineError(504, ctrl.signal.aborted ? `${engine.name} did not respond in time.` : `Could not reach ${engine.name}.`);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Pulls `choices[0].delta.content` out of an OpenAI-style SSE body. */
async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const data = t.slice(5).trim();
        if (data === "[DONE]") return;
        let json: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error) throw new EngineError(502, json.error.message ?? "Engine stream error.");
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/* ---------------- Anthropic Claude, via the official SDK */

// Models that take effort + server-side fallbacks; older ones get a plain request.
const CLAUDE_MODERN = /^claude-(opus-5|sonnet-5-5|fable-5)/;

async function openAnthropic(engine: Engine, opts: OpenOpts) {
  const client = new Anthropic({ apiKey: engine.key, maxRetries: 1 });
  let last: EngineError | null = null;

  for (const model of engine.models) {
    const modern = CLAUDE_MODERN.test(model);
    const stream = client.beta.messages.stream(
      {
        model,
        // Thinking is on for current Claude models and counts toward max_tokens, so leave headroom.
        max_tokens: Math.max(opts.maxTokens * 4, 16_000),
        system: opts.system,
        messages: opts.messages,
        ...(modern
          ? { output_config: { effort: "medium" as const }, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const }
          : {}),
      },
      { signal: opts.signal },
    );
    const it = stream[Symbol.asyncIterator]();
    let first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>;
    try {
      first = await it.next(); // surfaces auth / model errors before we commit to streaming
    } catch (err) {
      if (err instanceof Anthropic.NotFoundError) {
        last = new EngineError(404, `${engine.name}: model "${model}" is not available.`);
        continue;
      }
      throw anthropicError(engine, err);
    }
    return { model, tokens: claudeTokens(first, it, stream) };
  }
  throw last ?? new EngineError(404, `${engine.name}: no model in the chain answered.`);
}

async function* claudeTokens(
  first: IteratorResult<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>,
  it: AsyncIterator<Anthropic.Beta.Messages.BetaRawMessageStreamEvent>,
  stream: { finalMessage: () => Promise<Anthropic.Beta.Messages.BetaMessage> },
): AsyncGenerator<string> {
  try {
    for (let r = first; !r.done; r = await it.next()) {
      const ev = r.value;
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") yield "\n\n_(Declined by the model's safety classifier.)_";
  } catch (err) {
    throw anthropicError({ name: "Anthropic Claude" } as Engine, err);
  }
}

function anthropicError(engine: Pick<Engine, "name">, err: unknown): EngineError {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new EngineError(err.status, `${engine.name} rejected the key (${err.status}). Check it in Engine settings.`);
  }
  if (err instanceof Anthropic.RateLimitError) return new EngineError(429, `${engine.name} rate limit hit — wait a moment and retry.`);
  if (err instanceof Anthropic.BadRequestError) return new EngineError(400, `${engine.name}: ${err.message}`);
  if (err instanceof Anthropic.APIConnectionError) return new EngineError(504, `Could not reach ${engine.name}.`);
  if (err instanceof Anthropic.APIError) return new EngineError(err.status ?? 502, `${engine.name} error ${err.status ?? ""}: ${err.message}`);
  return new EngineError(502, err instanceof Error ? err.message : "Engine failed.");
}

/* ---------------- shared */

function errorMessage(raw: string): string {
  try {
    const j = JSON.parse(raw) as unknown;
    const pick = (o: unknown): string | undefined => {
      if (!o || typeof o !== "object") return undefined;
      const r = o as Record<string, unknown>;
      if (typeof r.message === "string") return r.message;
      if (typeof r.error === "string") return r.error;
      return pick(r.error);
    };
    return (Array.isArray(j) ? pick(j[0]) : pick(j)) ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

function friendly(engine: Engine, status: number, msg: string): string {
  if (status === 401 || /api[ _-]?key|unauthori[sz]ed|authentication|invalid.*(key|token)/i.test(msg)) {
    return `${engine.name} rejected the key (${status}). Check it in Engine settings.`;
  }
  if (status === 403) return `${engine.name} refused access (403): ${msg.slice(0, 200)}`;
  if (status === 413 || /request too large|tokens per minute|context length|too many tokens|maximum context/i.test(msg)) {
    return `${engine.name}: ${msg} — switch the compiler to LITE or start a new session to send a smaller kernel.`;
  }
  if (status === 429) return `${engine.name} rate limit: ${msg}`;
  return `${engine.name} error ${status}: ${msg}`;
}
