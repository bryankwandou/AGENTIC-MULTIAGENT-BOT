"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Cpu, Eye, EyeOff, ExternalLink, KeyRound, Laptop, RefreshCw, Search, Server, X } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { corsHint, isLocalSite, modelsInBrowser, openInBrowser, transportOf } from "@/lib/engine/client";
import { serverProxiesLocal } from "@/lib/engine-status";
import { GROUPS, PROVIDERS, detectProvider, getProvider, type ProviderId } from "@/lib/engine/providers";
import type { EngineStatus } from "@/lib/engine-status";
import { cn } from "@/lib/cn";
import { engineHeaders, useStation, type EngineSettings } from "@/lib/store";

export type EngineSummary = { live: boolean; label: string; detail: string; source: "byok" | "server" | "demo"; local?: boolean };

export function engineSummary(settings: EngineSettings, status: EngineStatus | null): EngineSummary {
  const p = settings.provider === "server" ? undefined : getProvider(settings.provider);
  if (p && (settings.key || p.local)) {
    return { live: true, label: p.name, detail: `${settings.model || p.models[0] || "model?"}${p.local ? " · local" : ""}`, source: "byok", local: p.local };
  }
  if (status?.engine) return { live: true, label: status.engine.name, detail: status.engine.models[0] ?? "", source: "server" };
  return { live: false, label: "Demo mode", detail: "scripted replies", source: "demo" };
}

type TestResult = { ok: boolean; error?: string; model?: string; ms?: number; reply?: string; name?: string };

export function EngineDialog({ status }: { status: EngineStatus | null }) {
  const open = useStation((s) => s.engineOpen);
  const setOpen = useStation((s) => s.setEngineOpen);
  const saved = useStation((s) => s.engine);
  const setEngine = useStation((s) => s.setEngine);
  const language = useStation((s) => s.language);
  const idUi = language !== "en";
  const [draft, setDraft] = useState<EngineSettings>(saved);
  const [show, setShow] = useState(false);
  const [query, setQuery] = useState("");
  const [detected, setDetected] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [models, setModels] = useState<{ list: string[]; error?: string; loading: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(saved);
    setResult(null);
    setModels(null);
    setQuery("");
    setDetected(detectProvider(saved.key));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saved, setOpen]);

  const p = draft.provider === "server" ? undefined : getProvider(draft.provider);
  const transport = p?.local ? transportOf(draft) : "server";
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? PROVIDERS.filter((x) => `${x.name} ${x.id} ${x.models.join(" ")}`.toLowerCase().includes(q)) : PROVIDERS;
  }, [query]);

  return <EngineDialogBody {...{ open, status, idUi, draft, setDraft, show, setShow, query, setQuery, detected, setDetected, testing, setTesting, result, setResult, models, setModels, copied, setCopied, p, transport, filtered, saved, setEngine, setOpen }} />;
}

type BodyProps = {
  open: boolean;
  status: EngineStatus | null;
  idUi: boolean;
  draft: EngineSettings;
  setDraft: React.Dispatch<React.SetStateAction<EngineSettings>>;
  show: boolean;
  setShow: (v: boolean) => void;
  query: string;
  setQuery: (v: string) => void;
  detected: ProviderId | null;
  setDetected: (v: ProviderId | null) => void;
  testing: boolean;
  setTesting: (v: boolean) => void;
  result: TestResult | null;
  setResult: (v: TestResult | null) => void;
  models: { list: string[]; error?: string; loading: boolean } | null;
  setModels: (v: { list: string[]; error?: string; loading: boolean } | null) => void;
  copied: boolean;
  setCopied: (v: boolean) => void;
  p: ReturnType<typeof getProvider>;
  transport: "server" | "browser";
  filtered: typeof PROVIDERS;
  saved: EngineSettings;
  setEngine: (v: EngineSettings) => void;
  setOpen: (v: boolean) => void;
};

function EngineDialogBody(props: BodyProps) {
  const { open, status, idUi, draft, setDraft, show, setShow, query, setQuery, detected, setDetected, testing, setTesting, result, setResult, models, setModels, copied, setCopied, p, transport, filtered, saved, setEngine, setOpen } = props;
  // Local runtimes: list what is actually installed as soon as one is picked.
  const localKey = p?.local ? `${p.id}|${draft.baseUrl ?? ""}|${transport}` : "";
  useEffect(() => {
    if (!open || !localKey) return;
    const t = window.setTimeout(() => void fetchModels(), 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, localKey]);
  if (!open) return null;

  const patch = (d: Partial<EngineSettings>) => {
    setDraft((cur) => ({ ...cur, ...d }));
    setResult(null);
  };
  const pick = (id: ProviderId | "server") => {
    const np = id === "server" ? undefined : getProvider(id);
    setDraft((cur) => ({ ...cur, provider: id, model: "", baseUrl: np?.local ? (cur.provider === id ? cur.baseUrl : np.baseUrl) : undefined, key: np?.local ? "" : cur.key }));
    setResult(null);
    setModels(null);
  };
  const onKeyChange = (v: string) => {
    patch({ key: v });
    const d = detectProvider(v);
    setDetected(d);
    if (d && d !== draft.provider) {
      setDraft((cur) => ({ ...cur, key: v, provider: d, model: "", baseUrl: undefined }));
      setModels(null);
    }
  };

  const clean: EngineSettings = { ...draft, key: draft.key.trim(), model: draft.model.trim(), baseUrl: draft.baseUrl?.trim() };
  const canUse = draft.provider === "server" || Boolean(p?.local) || clean.key.length > 8;

  async function test() {
    setTesting(true);
    setResult(null);
    const t0 = performance.now();
    try {
      if (p?.local && transport === "browser") {
        const ctrl = new AbortController();
        const timer = window.setTimeout(() => ctrl.abort(), 120_000);
        const { model, tokens } = await openInBrowser(clean, {
          system: "You are a connection check. Reply with exactly: AXIOM ONLINE",
          messages: [{ role: "user", content: "Status?" }],
          temperature: 0,
          maxTokens: 24,
          signal: ctrl.signal,
        });
        let reply = "";
        for await (const t of tokens) {
          reply += t;
          if (reply.length > 80) break;
        }
        window.clearTimeout(timer);
        setResult({ ok: true, name: p.name, model, ms: Math.round(performance.now() - t0), reply: reply.trim().slice(0, 80) });
      } else {
        const res = await fetch("/api/engine/test", { method: "POST", headers: engineHeaders(clean) });
        setResult((await res.json()) as TestResult);
      }
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Request failed." });
    } finally {
      setTesting(false);
    }
  }

  async function fetchModels() {
    setModels({ list: [], loading: true });
    try {
      let list: string[];
      if (p?.local && transport === "browser") list = await modelsInBrowser(clean, AbortSignal.timeout(15_000));
      else {
        const res = await fetch("/api/engine/models", { headers: engineHeaders(clean) });
        const j = (await res.json()) as { ok: boolean; models?: string[]; error?: string };
        if (!j.ok) throw new Error(j.error ?? "Could not list models.");
        list = j.models ?? [];
      }
      setModels({ list, loading: false });
      if (!clean.model && list[0]) patch({ model: list[0] });
    } catch (err) {
      setModels({ list: [], loading: false, error: err instanceof Error ? err.message : "Could not list models." });
    }
  }

  const cors = p?.local ? corsHint(clean) : null;
  // A local runtime's own list is the truth; the catalogue names are only a hint before it answers.
  const fetched = models && !models.loading && !models.error && models.list.length > 0;
  const suggestions = fetched && p?.local ? models.list : [...new Set([...(models?.list ?? []), ...(p?.models ?? [])])];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/75 p-3 pt-[4vh] backdrop-blur-sm animate-fade" onClick={() => setOpen(false)}>
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow-pop)] animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Engine</p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight">{idUi ? "Pakai model apa pun." : "Bring any model."}</p>
            <p className="mt-1 text-sm text-muted">
              {idUi
                ? "Cloud API, cloud model open, atau model di komputer Anda sendiri (Ollama, LM Studio, vLLM, llama.cpp…). Semua bot dan Team memakai engine yang sama."
                : "Cloud APIs, open-model clouds, or open weights on your own machine (Ollama, LM Studio, vLLM, llama.cpp…). Every bot and Team run uses the same engine."}
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-elevated" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 md:grid-cols-[17rem_1fr]">
          {/* Provider list */}
          <div className="min-h-0 overflow-y-auto border-b border-line md:border-r md:border-b-0">
            <div className="sticky top-0 z-10 border-b border-line bg-surface p-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-line bg-inset px-2.5">
                <Search className="size-3.5 text-subtle" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={idUi ? "Cari penyedia atau model…" : "Search providers or models…"}
                  className="h-8 min-w-0 flex-1 bg-transparent text-xs text-fg outline-none placeholder:text-subtle"
                />
              </div>
            </div>
            <div className="p-2">
              <ProviderRow
                on={draft.provider === "server"}
                name={status?.engine ? (idUi ? "Bawaan server" : "Server default") : idUi ? "Mode demo" : "Demo mode"}
                hint={status?.engine ? status.engine.name : idUi ? "balasan berskrip" : "scripted replies"}
                icon={<Server className="size-3.5" />}
                onClick={() => pick("server")}
              />
              {GROUPS.map((g) => {
                const items = filtered.filter((x) => x.group === g.id);
                if (!items.length) return null;
                return (
                  <div key={g.id} className="mt-3">
                    <p className="eyebrow px-2">{idUi ? g.labelId : g.label}</p>
                    <p className="mb-1 px-2 text-[10.5px] text-subtle">{idUi ? g.hintId : g.hint}</p>
                    {items.map((x) => (
                      <ProviderRow
                        key={x.id}
                        on={draft.provider === x.id}
                        name={x.name}
                        hint={x.local ? x.baseUrl.replace(/^https?:\/\//, "") : x.prefixes[0] ? `${x.prefixes[0]}…` : idUi ? "pilih manual" : "pick manually"}
                        icon={x.local ? <Laptop className="size-3.5" /> : <Cpu className="size-3.5" />}
                        onClick={() => pick(x.id)}
                        saved={saved.provider === x.id}
                      />
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details */}
          <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
            {!p ? (
              <div className="rounded-xl border border-line bg-inset px-4 py-4 text-sm text-muted">
                {status?.engine
                  ? idUi
                    ? `Deployment ini menjalankan ${status.engine.name} (${status.engine.models[0]}) dengan key-nya sendiri.`
                    : `This deployment runs ${status.engine.name} (${status.engine.models[0]}) with its own key.`
                  : idUi
                    ? "Belum ada key di server, jadi stasiun menjawab dalam mode demo. Pilih penyedia di kiri — atau tempel key di bawah, penyedianya terdeteksi otomatis."
                    : "No server key is configured, so the station answers in demo mode. Pick a provider on the left — or paste a key below and it is detected."}
              </div>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-2xl font-semibold">{p.name}</p>
                  <p className="mt-0.5 font-mono text-[10px] text-subtle uppercase">
                    {GROUPS.find((g) => g.id === p.group)?.label} · {p.kind === "anthropic" ? "Anthropic SDK" : "OpenAI-compatible"}
                  </p>
                </div>
                <a href={p.keyUrl} target="_blank" rel="noreferrer noopener" className="flex shrink-0 items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 font-mono text-[10px] text-muted hover:text-fg">
                  {p.local ? (idUi ? "unduh / dokumentasi" : "download / docs") : idUi ? "ambil key" : "get a key"} <ExternalLink className="size-3" />
                </a>
              </div>
            )}

            {p?.local ? (
              <>
                <Field label={idUi ? "Base URL" : "Base URL"}>
                  <input
                    value={draft.baseUrl ?? p.baseUrl}
                    onChange={(e) => patch({ baseUrl: e.target.value })}
                    spellCheck={false}
                    className="h-10 w-full rounded-xl border border-line bg-inset px-3 font-mono text-sm text-fg outline-none focus:border-line-strong"
                  />
                </Field>
                <Field label={idUi ? "Jalur" : "Route"}>
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-inset p-1">
                    {(["auto", "browser", "server"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => patch({ transport: t })}
                        className={cn(
                          "h-8 rounded-lg font-mono text-[10.5px] uppercase",
                          (draft.transport ?? "auto") === t ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
                        )}
                      >
                        {t === "auto" ? "auto" : t === "browser" ? (idUi ? "dari browser" : "from browser") : idUi ? "lewat server" : "via server"}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
                    {transport === "browser"
                      ? idUi
                        ? "Tab ini memanggil runtime di komputer Anda langsung. Izinkan situs ini di CORS:"
                        : "This tab calls the runtime on your machine directly. Allow this site in its CORS settings:"
                      : serverProxiesLocal() ?? isLocalSite()
                        ? idUi
                          ? "Server AXIOM ini yang memanggil runtime Anda — tanpa pengaturan CORS."
                          : "This AXIOM server calls your runtime for you — no CORS setup needed."
                        : idUi
                          ? "Server ini tidak boleh menjangkau runtime lokal (set ALLOW_LOCAL_ENGINES=true bila runtime ada di mesin yang sama). Pakai “dari browser”."
                          : "This server may not reach local runtimes (set ALLOW_LOCAL_ENGINES=true when the runtime sits next to it). Use “from browser”."}
                  </p>
                  {transport === "browser" && cors ? (
                    <div className="mt-2 flex items-start gap-2 rounded-xl border border-line bg-inset px-3 py-2.5">
                      <code className="min-w-0 flex-1 font-mono text-[11px] leading-relaxed break-all text-accent">{cors}</code>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(cors);
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1200);
                        }}
                        className="shrink-0 text-subtle hover:text-fg"
                        aria-label="Copy"
                      >
                        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                      </button>
                    </div>
                  ) : null}
                </Field>
              </>
            ) : null}

            {p?.local || draft.provider === "server" || !p ? (
              <Field label={p?.local ? (idUi ? "API key (opsional)" : "API key (optional)") : idUi ? "Atau tempel key apa pun" : "Or paste any key"}>
                <KeyInput
                  value={draft.key}
                  onChange={onKeyChange}
                  show={show}
                  setShow={setShow}
                  placeholder={p?.local ? (idUi ? "kosongkan kecuali server Anda meminta key" : "leave empty unless your server asks for one") : undefined}
                />
              </Field>
            ) : (
              <Field label="API key">
                <KeyInput value={draft.key} onChange={onKeyChange} show={show} setShow={setShow} placeholder={p?.prefixes[0] ? `${p.prefixes[0]}…` : undefined} />
                <p className="mt-1.5 h-4 font-mono text-[10px] text-subtle">
                  {detected ? (
                    <>
                      {idUi ? "terdeteksi" : "detected"} <span className="text-signal">{getProvider(detected)?.name}</span> {idUi ? "dari awalan key" : "from the key prefix"}
                    </>
                  ) : idUi ? (
                    "tersimpan hanya di browser ini · diteruskan per request · tidak pernah dicatat di server"
                  ) : (
                    "stored only in this browser · proxied per request · never logged or saved on the server"
                  )}
                </p>
              </Field>
            )}

            {p ? (
              <Field
                label="Model"
                action={
                  <button type="button" onClick={() => void fetchModels()} disabled={models?.loading} className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-fg disabled:opacity-50">
                    <RefreshCw className={cn("size-3", models?.loading && "animate-spin")} /> {idUi ? "ambil model" : "fetch models"}
                  </button>
                }
              >
                <input
                  value={draft.model}
                  onChange={(e) => patch({ model: e.target.value })}
                  placeholder={p.models[0] ? `${p.models[0]} (default)` : idUi ? "ambil daftar atau ketik id model" : "fetch the list or type a model id"}
                  spellCheck={false}
                  className="h-10 w-full rounded-xl border border-line bg-inset px-3 font-mono text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
                />
                {models?.error ? <p className="mt-1.5 text-[11px] text-danger">{models.error}</p> : null}
                {models && !models.loading && !models.error ? (
                  <p className="mt-1.5 font-mono text-[10px] text-signal">
                    {models.list.length} {idUi ? "model ditemukan" : "models found"}
                  </p>
                ) : null}
                {suggestions.length ? (
                  <div className="mt-2 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                    {suggestions.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => patch({ model: m })}
                        className={cn(
                          "rounded-md px-2 py-1 font-mono text-[10.5px]",
                          (draft.model || p.models[0]) === m ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                        )}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                ) : null}
                {p.note && !(p.local && fetched) ? <p className="mt-2 text-[11px] text-muted">{p.note}</p> : null}
              </Field>
            ) : null}

            {result ? (
              <div className={cn("flex items-start gap-3 rounded-xl border px-3 py-3", result.ok ? "border-signal/40 bg-signal/5" : "border-danger/40 bg-danger/5")}>
                <Lamp tone={result.ok ? "signal" : "danger"} className="mt-1.5" />
                <div className="min-w-0 font-mono text-xs">
                  {result.ok ? (
                    <>
                      <p className="text-fg">
                        {idUi ? "Tersambung" : "Connected"} · {result.name} · {result.model} · {result.ms}ms
                      </p>
                      <p className="mt-1 text-muted">reply: “{result.reply || "(empty)"}”</p>
                    </>
                  ) : (
                    <p className="break-words text-danger">{result.error}</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          {saved.provider !== "server" ? (
            <button
              type="button"
              onClick={() => {
                setEngine({ provider: "server", key: "", model: "" });
                setOpen(false);
              }}
              className="h-10 rounded-lg px-3 text-xs text-muted hover:text-danger"
            >
              {idUi ? "Kembali ke bawaan" : "Back to default"}
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canUse || testing || draft.provider === "server"}
            onClick={() => void test()}
            className="ml-auto h-10 rounded-lg border border-line-strong px-4 text-sm text-fg hover:bg-elevated disabled:opacity-40"
          >
            {testing ? (idUi ? "Mengetes…" : "Testing…") : idUi ? "Tes koneksi" : "Test connection"}
          </button>
          <button
            type="button"
            disabled={!canUse}
            onClick={() => {
              setEngine(draft.provider === "server" ? { provider: "server", key: "", model: "" } : clean);
              setOpen(false);
            }}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {idUi ? "Pakai engine ini" : "Use this engine"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, action, children }: { label: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="eyebrow">{label}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

function KeyInput({
  value,
  onChange,
  show,
  setShow,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  setShow: (v: boolean) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-line bg-inset px-3 focus-within:border-line-strong">
      <KeyRound className="size-4 shrink-0 text-subtle" />
      <input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "xai-…  gsk_…  hf_…  AIza…  sk-ant-…  sk-…  fw_…"}
        autoComplete="off"
        spellCheck={false}
        className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-fg outline-none placeholder:text-subtle"
      />
      <button type="button" onClick={() => setShow(!show)} className="text-subtle hover:text-fg" aria-label={show ? "Hide key" : "Show key"}>
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function ProviderRow({ on, name, hint, icon, onClick, saved }: { on: boolean; name: string; hint: string; icon: React.ReactNode; onClick: () => void; saved?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors", on ? "bg-elevated" : "hover:bg-elevated/50")}
    >
      <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", on ? "bg-accent text-accent-fg" : "bg-inset text-subtle")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-fg">{name}</span>
        <span className="block truncate font-mono text-[9.5px] text-subtle">{hint}</span>
      </span>
      {saved ? <Lamp className="size-1.5" /> : null}
    </button>
  );
}
