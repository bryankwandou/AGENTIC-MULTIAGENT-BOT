import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { EngineError, listCompatModels, openCompat, type ChatMsg, type OpenOpts } from "@/lib/engine/compat";
import { PROVIDERS, cleanBaseUrl, cleanModel, detectProvider, getProvider, isPrivateHost, type ProviderId } from "@/lib/engine/providers";

export { EngineError };
export type { ChatMsg };

export type Engine = {
  provider: ProviderId;
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  key: string;
  models: string[];
  source: "byok" | "server";
  local?: boolean;
};

function envList(v: string | undefined): string[] | null {
  const list = (v ?? "")
    .split(",")
    .map((m) => cleanModel(m))
    .filter(Boolean);
  return list.length ? list : null;
}

/**
 * Local runtimes (Ollama, LM Studio, vLLM…) can be proxied by this server only when it runs next to them:
 * always in development, in production only with ALLOW_LOCAL_ENGINES=true. On a public deployment the
 * browser talks to the operator's local runtime directly instead.
 */
export function localEnginesAllowed() {
  if (process.env.ALLOW_LOCAL_ENGINES) return process.env.ALLOW_LOCAL_ENGINES === "true";
  return process.env.NODE_ENV !== "production" && !process.env.VERCEL;
}

/**
 * Engine configured on the server, first match wins:
 *  1. LLM_PROVIDER / LLM_API_KEY / LLM_BASE_URL / LLM_MODELS — any provider, local runtimes included
 *  2. a provider-specific key (XAI_API_KEY, GROQ_API_KEY, HF_TOKEN, …)
 *  3. a local runtime URL (OLLAMA_BASE_URL, LMSTUDIO_BASE_URL, VLLM_BASE_URL, …)
 */
export function serverEngine(): Engine | null {
  const generic = process.env.LLM_API_KEY?.trim() ?? "";
  const base = cleanBaseUrl(process.env.LLM_BASE_URL);
  const named = getProvider(process.env.LLM_PROVIDER?.trim().toLowerCase());
  if (generic || base || named) {
    const p = named ?? getProvider(detectProvider(generic)) ?? (base ? getProvider("custom") : undefined);
    if (p) {
      return {
        provider: p.id,
        name: process.env.LLM_NAME?.trim() || p.name,
        kind: p.kind,
        baseUrl: base ?? p.baseUrl,
        key: generic,
        models: envList(process.env.LLM_MODELS) ?? p.models,
        source: "server",
        local: p.local,
      };
    }
  }
  for (const p of PROVIDERS) {
    if (p.local) continue;
    const key = process.env[p.envKey]?.trim() || (p.id === "gemini" ? process.env.GOOGLE_API_KEY?.trim() : p.id === "huggingface" ? process.env.HUGGINGFACE_API_KEY?.trim() : "");
    if (!key) continue;
    const prefix = p.envKey.replace(/_API_KEY$|_TOKEN$/, "");
    const models = envList(process.env[`${prefix}_MODELS`]) ?? (p.id === "xai" ? envList(process.env.XAI_MODEL) : null) ?? p.models;
    return { ...fromProvider(p.id, key, "server"), models };
  }
  for (const p of PROVIDERS) {
    if (!p.local || p.id === "custom") continue;
    const url = cleanBaseUrl(process.env[p.envKey]);
    if (!url) continue;
    const prefix = p.envKey.replace(/_BASE_URL$/, "");
    return { ...fromProvider(p.id, process.env[`${prefix}_API_KEY`]?.trim() ?? "", "server"), baseUrl: url, models: envList(process.env[`${prefix}_MODELS`]) ?? p.models };
  }
  return null;
}

function fromProvider(id: ProviderId, key: string, source: Engine["source"]): Engine {
  const p = getProvider(id)!;
  return { provider: p.id, name: p.name, kind: p.kind, baseUrl: p.baseUrl, key, models: p.models, source, local: p.local };
}

/**
 * Engine for this request. An operator's own settings (headers — never stored or logged) win over the
 * server's. Cloud keys only reach known provider hosts; local runtime URLs only when localEnginesAllowed().
 */
export function requestEngine(req: Request): { engine: Engine | null; error?: string } {
  const key = req.headers.get("x-axiom-key")?.trim() ?? "";
  const pid = req.headers.get("x-axiom-provider");
  const p = getProvider(pid) ?? (key ? getProvider(detectProvider(key)) : undefined);
  const wantsOwn = Boolean(key) || Boolean(p?.local);
  if (!wantsOwn || process.env.ALLOW_BYOK === "false") return { engine: serverEngine() };
  if (key.length > 512 || /\s/.test(key)) return { engine: null, error: "That does not look like an API key." };
  if (!p) return { engine: null, error: "Unknown provider for this key — pick one in Engine settings." };
  const model = cleanModel(req.headers.get("x-axiom-model"));
  const engine = fromProvider(p.id, key, "byok");
  if (p.local) {
    if (!localEnginesAllowed()) {
      return {
        engine: null,
        error: `${p.name} runs on your machine, which this deployment cannot reach. Use browser mode (the default on deployed sites) or run AXIOM locally.`,
      };
    }
    const url = cleanBaseUrl(req.headers.get("x-axiom-base"), p.baseUrl);
    if (!url) return { engine: null, error: "That base URL is not valid." };
    if (!isPrivateHost(url) && process.env.ALLOW_LOCAL_ENGINES !== "true") {
      return { engine: null, error: "Only localhost / private-network URLs can be proxied here." };
    }
    engine.baseUrl = url;
  } else if (!key) {
    return { engine: null, error: `${p.name} needs an API key.` };
  }
  engine.models = model ? [model, ...p.models.filter((m) => m !== model)] : p.models;
  return { engine };
}

export function describeEngine(e: Engine | null) {
  return e ? { provider: e.provider, name: e.name, models: e.models, source: e.source, local: Boolean(e.local) } : null;
}

/** Opens a streaming completion on any engine. Throws EngineError with an operator-readable message. */
export async function openEngineStream(engine: Engine, opts: OpenOpts): Promise<{ model: string; tokens: AsyncGenerator<string> }> {
  if (engine.kind === "anthropic") return openAnthropic(engine, opts);
  return openCompat(
    {
      name: engine.name,
      baseUrl: engine.baseUrl,
      key: engine.key || undefined,
      models: engine.models,
      headers: engine.provider === "openrouter" ? { "X-Title": "AXIOM Operator Station" } : undefined,
    },
    opts,
    engine.local ? 300_000 : 30_000,
  );
}

/** Model ids the engine reports (`GET /models`); Anthropic returns the curated list. */
export async function listEngineModels(engine: Engine, signal?: AbortSignal): Promise<string[]> {
  if (engine.kind === "anthropic") return getProvider("anthropic")!.models;
  return listCompatModels({ name: engine.name, baseUrl: engine.baseUrl, key: engine.key || undefined }, signal);
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

