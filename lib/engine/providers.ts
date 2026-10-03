/**
 * Every engine AXIOM can drive. All but Anthropic speak the OpenAI-style
 * `/chat/completions` stream; Anthropic goes through its official SDK.
 * Safe to import on the client: no secrets here.
 */
export type ProviderId =
  // Frontier APIs
  | "xai"
  | "openai"
  | "anthropic"
  | "gemini"
  | "mistral"
  | "deepseek"
  // Open-model clouds
  | "groq"
  | "cerebras"
  | "openrouter"
  | "huggingface"
  | "together"
  | "fireworks"
  | "deepinfra"
  | "sambanova"
  | "novita"
  | "hyperbolic"
  // Run it yourself
  | "ollama"
  | "lmstudio"
  | "vllm"
  | "llamacpp"
  | "localai"
  | "jan"
  | "textgen"
  | "koboldcpp"
  | "custom";

export type ProviderGroup = "frontier" | "open" | "local";

export type Provider = {
  id: ProviderId;
  name: string;
  group: ProviderGroup;
  kind: "openai" | "anthropic";
  /** Default endpoint. Local runtimes let the operator change it. */
  baseUrl: string;
  /** Key prefixes used for auto-detection, most specific first. */
  prefixes: string[];
  /** Fallback chain, first = preferred. The operator can type any other model, or fetch the list. */
  models: string[];
  keyUrl: string;
  envKey: string;
  /** Runs on the operator's own machine/server: editable URL, key optional. */
  local?: boolean;
  /** How to let a browser tab talk to it directly (CORS). `{origin}` is replaced with this site's origin. */
  cors?: string;
  note?: string;
};

export const PROVIDERS: Provider[] = [
  /* ---------- frontier APIs */
  { id: "xai", name: "xAI Grok", group: "frontier", kind: "openai", baseUrl: "https://api.x.ai/v1", prefixes: ["xai-"], models: ["grok-4.5", "grok-4", "grok-3"], keyUrl: "https://console.x.ai", envKey: "XAI_API_KEY" },
  { id: "openai", name: "OpenAI", group: "frontier", kind: "openai", baseUrl: "https://api.openai.com/v1", prefixes: ["sk-proj-", "sk-svcacct-", "sk-"], models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"], keyUrl: "https://platform.openai.com/api-keys", envKey: "OPENAI_API_KEY" },
  { id: "anthropic", name: "Anthropic Claude", group: "frontier", kind: "anthropic", baseUrl: "https://api.anthropic.com", prefixes: ["sk-ant-"], models: ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-4-5"], keyUrl: "https://platform.claude.com/settings/keys", envKey: "ANTHROPIC_API_KEY" },
  { id: "gemini", name: "Google Gemini", group: "frontier", kind: "openai", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", prefixes: ["AIza"], models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"], keyUrl: "https://aistudio.google.com/apikey", envKey: "GEMINI_API_KEY" },
  { id: "mistral", name: "Mistral", group: "frontier", kind: "openai", baseUrl: "https://api.mistral.ai/v1", prefixes: [], models: ["mistral-large-latest", "mistral-small-latest"], keyUrl: "https://console.mistral.ai/api-keys", envKey: "MISTRAL_API_KEY" },
  { id: "deepseek", name: "DeepSeek", group: "frontier", kind: "openai", baseUrl: "https://api.deepseek.com/v1", prefixes: [], models: ["deepseek-chat", "deepseek-reasoner"], keyUrl: "https://platform.deepseek.com/api_keys", envKey: "DEEPSEEK_API_KEY", note: "DeepSeek keys look like OpenAI keys (sk-…) — pick DeepSeek manually." },

  /* ---------- open-model clouds (Llama, Qwen, DeepSeek, Mistral, gpt-oss … hosted for you) */
  { id: "groq", name: "Groq", group: "open", kind: "openai", baseUrl: "https://api.groq.com/openai/v1", prefixes: ["gsk_"], models: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"], keyUrl: "https://console.groq.com/keys", envKey: "GROQ_API_KEY", note: "Free tier has a low tokens-per-minute cap — use the lite compiler if a request is too large." },
  { id: "cerebras", name: "Cerebras", group: "open", kind: "openai", baseUrl: "https://api.cerebras.ai/v1", prefixes: ["csk-"], models: ["gpt-oss-120b", "llama-3.3-70b", "qwen-3-32b"], keyUrl: "https://cloud.cerebras.ai", envKey: "CEREBRAS_API_KEY" },
  { id: "openrouter", name: "OpenRouter", group: "open", kind: "openai", baseUrl: "https://openrouter.ai/api/v1", prefixes: ["sk-or-"], models: ["meta-llama/llama-3.3-70b-instruct", "qwen/qwen-2.5-72b-instruct", "x-ai/grok-4"], keyUrl: "https://openrouter.ai/keys", envKey: "OPENROUTER_API_KEY" },
  { id: "huggingface", name: "Hugging Face", group: "open", kind: "openai", baseUrl: "https://router.huggingface.co/v1", prefixes: ["hf_"], models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"], keyUrl: "https://huggingface.co/settings/tokens", envKey: "HF_TOKEN", note: "Uses Hugging Face Inference Providers. Any chat model id from the Hub works; append :provider to pin one." },
  { id: "together", name: "Together AI", group: "open", kind: "openai", baseUrl: "https://api.together.xyz/v1", prefixes: [], models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo", "deepseek-ai/DeepSeek-V3"], keyUrl: "https://api.together.ai/settings/api-keys", envKey: "TOGETHER_API_KEY" },
  { id: "fireworks", name: "Fireworks", group: "open", kind: "openai", baseUrl: "https://api.fireworks.ai/inference/v1", prefixes: ["fw_"], models: ["accounts/fireworks/models/llama-v3p3-70b-instruct", "accounts/fireworks/models/qwen2p5-72b-instruct", "accounts/fireworks/models/deepseek-v3"], keyUrl: "https://fireworks.ai/account/api-keys", envKey: "FIREWORKS_API_KEY" },
  { id: "deepinfra", name: "DeepInfra", group: "open", kind: "openai", baseUrl: "https://api.deepinfra.com/v1/openai", prefixes: [], models: ["meta-llama/Llama-3.3-70B-Instruct", "Qwen/Qwen2.5-72B-Instruct", "deepseek-ai/DeepSeek-V3"], keyUrl: "https://deepinfra.com/dash/api_keys", envKey: "DEEPINFRA_API_KEY" },
  { id: "sambanova", name: "SambaNova", group: "open", kind: "openai", baseUrl: "https://api.sambanova.ai/v1", prefixes: [], models: ["Meta-Llama-3.3-70B-Instruct", "DeepSeek-V3-0324", "Qwen3-32B"], keyUrl: "https://cloud.sambanova.ai/apis", envKey: "SAMBANOVA_API_KEY" },
  { id: "novita", name: "Novita", group: "open", kind: "openai", baseUrl: "https://api.novita.ai/v3/openai", prefixes: [], models: ["meta-llama/llama-3.3-70b-instruct", "deepseek/deepseek-v3", "qwen/qwen-2.5-72b-instruct"], keyUrl: "https://novita.ai/settings/key-management", envKey: "NOVITA_API_KEY" },
  { id: "hyperbolic", name: "Hyperbolic", group: "open", kind: "openai", baseUrl: "https://api.hyperbolic.xyz/v1", prefixes: [], models: ["meta-llama/Llama-3.3-70B-Instruct", "deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"], keyUrl: "https://app.hyperbolic.xyz/settings", envKey: "HYPERBOLIC_API_KEY" },

  /* ---------- run it yourself (open weights on your machine or server) */
  { id: "ollama", name: "Ollama", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:11434/v1", prefixes: [], models: ["llama3.2", "qwen2.5", "mistral"], keyUrl: "https://ollama.com/download", envKey: "OLLAMA_BASE_URL", cors: 'OLLAMA_ORIGINS="{origin}" ollama serve   (macOS app: launchctl setenv OLLAMA_ORIGINS "{origin}", then restart Ollama)', note: "Pull a model first: ollama pull llama3.2" },
  { id: "lmstudio", name: "LM Studio", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:1234/v1", prefixes: [], models: [], keyUrl: "https://lmstudio.ai", envKey: "LMSTUDIO_BASE_URL", cors: "LM Studio → Developer → Start server, and switch on “Enable CORS” in Server Settings.", note: "Load a model in LM Studio, then fetch the list here." },
  { id: "vllm", name: "vLLM", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:8000/v1", prefixes: [], models: [], keyUrl: "https://docs.vllm.ai", envKey: "VLLM_BASE_URL", cors: "vllm serve <model> --allowed-origins '[\"{origin}\"]'" },
  { id: "llamacpp", name: "llama.cpp server", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:8080/v1", prefixes: [], models: [], keyUrl: "https://github.com/ggml-org/llama.cpp", envKey: "LLAMACPP_BASE_URL", cors: "llama-server -m model.gguf --port 8080   (CORS is open by default)" },
  { id: "localai", name: "LocalAI", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:8080/v1", prefixes: [], models: [], keyUrl: "https://localai.io", envKey: "LOCALAI_BASE_URL", cors: "Start LocalAI with CORS=true (and CORS_ALLOW_ORIGINS={origin})." },
  { id: "jan", name: "Jan", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:1337/v1", prefixes: [], models: [], keyUrl: "https://jan.ai", envKey: "JAN_BASE_URL", cors: "Jan → Settings → Local API Server: start it and allow {origin} under CORS." },
  { id: "textgen", name: "text-generation-webui", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:5000/v1", prefixes: [], models: [], keyUrl: "https://github.com/oobabooga/text-generation-webui", envKey: "TEXTGEN_BASE_URL", cors: "python server.py --api   (the OpenAI-compatible API listens on :5000)" },
  { id: "koboldcpp", name: "KoboldCpp", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:5001/v1", prefixes: [], models: [], keyUrl: "https://github.com/LostRuins/koboldcpp", envKey: "KOBOLDCPP_BASE_URL", cors: "koboldcpp --model model.gguf   (OpenAI-compatible API on :5001/v1)" },
  { id: "custom", name: "Any OpenAI-compatible", group: "local", kind: "openai", local: true, baseUrl: "http://localhost:8000/v1", prefixes: [], models: [], keyUrl: "https://platform.openai.com/docs/api-reference/chat", envKey: "LLM_BASE_URL", cors: "Allow {origin} in the server's CORS settings.", note: "Any server that speaks /v1/chat/completions: TGI, SGLang, Aphrodite, TabbyAPI, MLX-LM, LiteLLM proxy…" },
];

export const PROVIDER_IDS = new Set<ProviderId>(PROVIDERS.map((p) => p.id));

export const GROUPS: { id: ProviderGroup; label: string; labelId: string; hint: string; hintId: string }[] = [
  { id: "local", label: "Run it yourself", labelId: "Jalankan sendiri", hint: "Open weights on your machine — no key, no cloud.", hintId: "Model open di komputer Anda — tanpa key, tanpa cloud." },
  { id: "open", label: "Open-model clouds", labelId: "Cloud model open", hint: "Llama, Qwen, DeepSeek, gpt-oss — hosted for you.", hintId: "Llama, Qwen, DeepSeek, gpt-oss — di-host untuk Anda." },
  { id: "frontier", label: "Frontier APIs", labelId: "API frontier", hint: "Grok, GPT, Claude, Gemini and more.", hintId: "Grok, GPT, Claude, Gemini, dan lainnya." },
];

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
    .slice(0, 160)
    .replace(/[^\w.:/@+-]/g, "");
}

/** Normalise an operator-typed base URL ("localhost:11434" → "http://localhost:11434/v1"). */
export function cleanBaseUrl(raw: string | null | undefined, fallback?: string): string | null {
  let u = String(raw ?? "").trim() || fallback || "";
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  try {
    const url = new URL(u);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const path = url.pathname.replace(/\/+$/, "") || "/v1";
    return `${url.protocol}//${url.host}${path}`;
  } catch {
    return null;
  }
}

/** Loopback and private-network hosts: a local runtime, not a cloud API. */
export function isPrivateHost(baseUrl: string): boolean {
  try {
    const h = new URL(baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return (
      h === "localhost" ||
      h.endsWith(".localhost") ||
      h === "host.docker.internal" ||
      h === "::1" ||
      /^127\./.test(h) ||
      /^10\./.test(h) ||
      /^192\.168\./.test(h) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
      h.endsWith(".local")
    );
  } catch {
    return false;
  }
}
