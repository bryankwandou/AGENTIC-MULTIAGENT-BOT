/**
 * OpenAI-compatible streaming, shared by the server proxy and the browser (local runtimes).
 * No secrets and no server-only imports here.
 */

export class EngineError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ChatMsg = { role: "user" | "assistant"; content: string };

export type CompatTarget = {
  name: string;
  baseUrl: string;
  key?: string;
  models: string[];
  headers?: Record<string, string>;
};

export type OpenOpts = {
  system: string;
  messages: ChatMsg[];
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
};

export type Opened = { model: string; tokens: AsyncGenerator<string> };

// Models that answered 404 / "unknown model" are skipped for an hour.
const deadModels = new Map<string, number>();
const MODEL_GONE = /(model\S*\s.*(not found|does not exist|not exist|invalid|unknown|not supported|decommissioned|deprecated|not loaded))|((not found|does not exist|unknown|invalid)\s.*model)/i;

export async function openCompat(t: CompatTarget, opts: OpenOpts, connectMs = 30_000): Promise<Opened> {
  if (!t.models.length) throw new EngineError(400, `${t.name}: no model selected — fetch the model list or type one.`);
  const now = Date.now();
  const alive = t.models.filter((m) => (deadModels.get(`${t.baseUrl}|${m}`) ?? 0) < now);
  const chain = alive.length ? alive : t.models;
  let last: EngineError | null = null;

  for (const model of chain) {
    let withTemperature = true;
    let tokenParam: "max_tokens" | "max_completion_tokens" = "max_tokens";
    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await post(t, opts.signal, connectMs, {
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
        deadModels.set(`${t.baseUrl}|${model}`, Date.now() + 3_600_000);
        last = new EngineError(404, `${t.name}: model "${model}" is not available.`);
        break;
      }
      throw new EngineError(res.status, friendly(t.name, res.status, msg));
    }
  }
  throw last ?? new EngineError(404, `${t.name}: no model in the chain answered.`);
}

async function post(t: CompatTarget, signal: AbortSignal, connectMs: number, body: unknown): Promise<Response> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), connectMs);
  try {
    return await fetch(`${t.baseUrl}/chat/completions`, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(t.key ? { Authorization: `Bearer ${t.key}` } : {}),
        ...(t.headers ?? {}),
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    if (signal.aborted) throw err;
    throw new EngineError(
      504,
      ctrl.signal.aborted ? `${t.name} did not respond in time.` : `Could not reach ${t.name} at ${t.baseUrl}. Is it running, and does it allow this site (CORS)?`,
    );
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/** Lists model ids from `GET {base}/models` (Ollama, LM Studio, vLLM, llama.cpp, OpenRouter, HF…). */
export async function listCompatModels(t: Pick<CompatTarget, "name" | "baseUrl" | "key" | "headers">, signal?: AbortSignal): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${t.baseUrl}/models`, {
      signal,
      headers: { ...(t.key ? { Authorization: `Bearer ${t.key}` } : {}), ...(t.headers ?? {}) },
    });
  } catch {
    throw new EngineError(504, `Could not reach ${t.name} at ${t.baseUrl}. Is it running, and does it allow this site (CORS)?`);
  }
  if (!res.ok) throw new EngineError(res.status, friendly(t.name, res.status, errorMessage(await res.text().catch(() => ""))));
  const j = (await res.json().catch(() => null)) as { data?: { id?: string }[]; models?: { id?: string; name?: string }[] } | null;
  const ids = [...(j?.data ?? []), ...(j?.models ?? [])].map((m) => m.id ?? (m as { name?: string }).name ?? "").filter(Boolean);
  return [...new Set(ids)].slice(0, 200);
}

/** Pulls `choices[0].delta.content` out of an OpenAI-style SSE body. */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
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
        let json: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } | string };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error) throw new EngineError(502, typeof json.error === "string" ? json.error : (json.error.message ?? "Engine stream error."));
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function errorMessage(raw: string): string {
  try {
    const j = JSON.parse(raw) as unknown;
    const pick = (o: unknown): string | undefined => {
      if (!o || typeof o !== "object") return undefined;
      const r = o as Record<string, unknown>;
      if (typeof r.message === "string") return r.message;
      if (typeof r.error === "string") return r.error;
      if (typeof r.detail === "string") return r.detail;
      return pick(r.error);
    };
    return (Array.isArray(j) ? pick(j[0]) : pick(j)) ?? raw.slice(0, 300);
  } catch {
    return raw.slice(0, 300);
  }
}

export function friendly(name: string, status: number, msg: string): string {
  if (status === 401 || /api[ _-]?key|unauthori[sz]ed|authentication|invalid.*(key|token)/i.test(msg)) {
    return `${name} rejected the key (${status}). Check it in Engine settings.`;
  }
  if (status === 403) return `${name} refused access (403): ${msg.slice(0, 200)}`;
  if (status === 413 || /request too large|tokens per minute|context length|too many tokens|maximum context|context window/i.test(msg)) {
    return `${name}: ${msg} — switch the compiler to LITE or start a new session to send a smaller kernel.`;
  }
  if (status === 429) return `${name} rate limit: ${msg}`;
  return `${name} error ${status}: ${msg}`;
}
