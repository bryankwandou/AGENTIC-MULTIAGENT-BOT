/**
 * Every engine AXIOM can drive. All but Anthropic speak the OpenAI-style
 * `/chat/completions` stream; Anthropic goes through its official SDK.
 * Safe to import on the client: no secrets here.
 */
export type ProviderId =
  | "xai"
  | "groq"
  | "gemini"
  | "openai"
  | "anthropic"
  | "openrouter"
  | "deepseek"
  | "mistral"
  | "cerebras";

export type Provider = {
  id: ProviderId;
  name: string;
  kind: "openai" | "anthropic";
  baseUrl: string;
  /** Key prefixes used for auto-detection, most specific first. */
  prefixes: string[];
  /** Fallback chain, first = preferred. The operator can type any other model. */
  models: string[];
  keyUrl: string;
  envKey: string;
  note?: string;
};

export const PROVIDERS: Provider[] = [
  {
    id: "xai",
    name: "xAI Grok",
    kind: "openai",
    baseUrl: "https://api.x.ai/v1",
    prefixes: ["xai-"],
    models: ["grok-4.5", "grok-4", "grok-3"],
    keyUrl: "https://console.x.ai",
    envKey: "XAI_API_KEY",
  },
  {
    id: "groq",
    name: "Groq",
    kind: "openai",
    baseUrl: "https://api.groq.com/openai/v1",
    prefixes: ["gsk_"],
    models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"],
    keyUrl: "https://console.groq.com/keys",
    envKey: "GROQ_API_KEY",
    note: "Free tier has a low tokens-per-minute cap — use the lite compiler if a request is too large.",
  },
  {
    id: "gemini",
    name: "Google Gemini",
    kind: "openai",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    prefixes: ["AIza"],
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    keyUrl: "https://aistudio.google.com/apikey",
    envKey: "GEMINI_API_KEY",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude",
    kind: "anthropic",
    baseUrl: "https://api.anthropic.com",
    prefixes: ["sk-ant-"],
    models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"],
    keyUrl: "https://platform.claude.com/settings/keys",
    envKey: "ANTHROPIC_API_KEY",
  },
  {
    id: "openai",
    name: "OpenAI",
    kind: "openai",
    baseUrl: "https://api.openai.com/v1",
    prefixes: ["sk-proj-", "sk-svcacct-", "sk-"],
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
    keyUrl: "https://platform.openai.com/api-keys",
    envKey: "OPENAI_API_KEY",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    kind: "openai",
    baseUrl: "https://openrouter.ai/api/v1",
    prefixes: ["sk-or-"],
    models: ["x-ai/grok-4", "google/gemini-2.5-flash", "meta-llama/llama-3.3-70b-instruct"],
    keyUrl: "https://openrouter.ai/keys",
    envKey: "OPENROUTER_API_KEY",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    kind: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    prefixes: [],
    models: ["deepseek-chat", "deepseek-reasoner"],
    keyUrl: "https://platform.deepseek.com/api_keys",
    envKey: "DEEPSEEK_API_KEY",
    note: "DeepSeek keys look like OpenAI keys (sk-…) — pick DeepSeek manually.",
  },
  {
    id: "mistral",
    name: "Mistral",
    kind: "openai",
    baseUrl: "https://api.mistral.ai/v1",
    prefixes: [],
    models: ["mistral-large-latest", "mistral-small-latest"],
    keyUrl: "https://console.mistral.ai/api-keys",
    envKey: "MISTRAL_API_KEY",
  },
  {
    id: "cerebras",
    name: "Cerebras",
    kind: "openai",
    baseUrl: "https://api.cerebras.ai/v1",
    prefixes: ["csk-"],
    models: ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"],
    keyUrl: "https://cloud.cerebras.ai",
    envKey: "CEREBRAS_API_KEY",
  },
];

export const PROVIDER_IDS = new Set<ProviderId>(PROVIDERS.map((p) => p.id));

export function getProvider(id: string | null | undefined): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Guess the provider from the key's shape. Longest matching prefix wins. */
export function detectProvider(key: string): ProviderId | null {
  const k = key.trim();
  if (!k) return null;
  let best: { id: ProviderId; len: number } | null = null;
  for (const p of PROVIDERS) {
    for (const prefix of p.prefixes) {
      if (k.startsWith(prefix) && (!best || prefix.length > best.len)) best = { id: p.id, len: prefix.length };
    }
  }
  return best?.id ?? null;
}

/** Model names are free text from the operator — keep them to a safe charset. */
export function cleanModel(model: string | null | undefined): string {
  return String(model ?? "")
    .trim()
    .slice(0, 120)
    .replace(/[^\w.:/@+-]/g, "");
}
