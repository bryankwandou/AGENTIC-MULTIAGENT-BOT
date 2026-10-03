"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, ExternalLink, KeyRound, X } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { PROVIDERS, detectProvider, getProvider, type ProviderId } from "@/lib/engine/providers";
import type { EngineStatus } from "@/lib/engine-status";
import { cn } from "@/lib/cn";
import { engineHeaders, useStation, type EngineSettings } from "@/lib/store";

export type EngineSummary = { live: boolean; label: string; detail: string; source: "byok" | "server" | "demo" };

export function engineSummary(settings: EngineSettings, status: EngineStatus | null): EngineSummary {
  if (settings.provider !== "server" && settings.key) {
    const p = getProvider(settings.provider);
    return { live: true, label: p?.name ?? settings.provider, detail: settings.model || p?.models[0] || "", source: "byok" };
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
  const [provider, setProvider] = useState<ProviderId | "server">(saved.provider);
  const [key, setKey] = useState(saved.key);
  const [model, setModel] = useState(saved.model);
  const [show, setShow] = useState(false);
  const [detected, setDetected] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    if (!open) return;
    setProvider(saved.provider);
    setKey(saved.key);
    setModel(saved.model);
    setResult(null);
    setDetected(detectProvider(saved.key));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, saved, setOpen]);

  if (!open) return null;

  const p = provider === "server" ? undefined : getProvider(provider);
  const draft: EngineSettings = { provider, key: provider === "server" ? "" : key.trim(), model: model.trim() };

  function onKeyChange(v: string) {
    setKey(v);
    setResult(null);
    const d = detectProvider(v);
    setDetected(d);
    if (d && d !== provider) {
      setProvider(d);
      setModel("");
    }
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/engine/test", { method: "POST", headers: engineHeaders(draft) });
      setResult((await res.json()) as TestResult);
    } catch (err) {
      setResult({ ok: false, error: err instanceof Error ? err.message : "Request failed." });
    } finally {
      setTesting(false);
    }
  }

  const canUse = provider === "server" || key.trim().length > 8;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-bg/75 p-3 pt-[6vh] backdrop-blur-sm animate-fade" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow-pop)] animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Engine</p>
            <p className="mt-1 font-display text-3xl font-semibold tracking-tight">Bring any key.</p>
            <p className="mt-1 text-sm text-muted">
              AXIOM is model-agnostic. Paste a key — the provider is detected from its shape — test it, and the station runs on it.
            </p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-elevated" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-5 px-5 py-5">
          <div>
            <label className="eyebrow" htmlFor="engine-key">API key</label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-line bg-inset px-3 focus-within:border-line-strong">
              <KeyRound className="size-4 shrink-0 text-subtle" />
              <input
                id="engine-key"
                type={show ? "text" : "password"}
                value={key}
                onChange={(e) => onKeyChange(e.target.value)}
                placeholder="xai-…  gsk_…  AIza…  sk-ant-…  sk-…  sk-or-…  csk-…"
                autoComplete="off"
                spellCheck={false}
                className="h-11 min-w-0 flex-1 bg-transparent font-mono text-sm text-fg outline-none placeholder:text-subtle"
              />
              <button type="button" onClick={() => setShow(!show)} className="text-subtle hover:text-fg" aria-label={show ? "Hide key" : "Show key"}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <p className="mt-1.5 h-4 font-mono text-[10px] text-subtle">
              {detected ? (
                <>
                  detected <span className="text-signal">{getProvider(detected)?.name}</span> from key prefix
                </>
              ) : key.trim() ? (
                "prefix not recognized — pick the provider below"
              ) : (
                "stored only in this browser · proxied per request · never logged or saved on the server"
              )}
            </p>
          </div>

          <div>
            <p className="eyebrow">Provider</p>
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
              <ProviderTile
                on={provider === "server"}
                name={status?.engine ? "Server" : "Demo"}
                hint={status?.engine ? status.engine.name : "no key"}
                onClick={() => {
                  setProvider("server");
                  setResult(null);
                }}
              />
              {PROVIDERS.map((x) => (
                <ProviderTile
                  key={x.id}
                  on={provider === x.id}
                  name={x.name.replace(/^(xAI|Google|Anthropic) /, "")}
                  hint={x.prefixes[0] ?? "manual"}
                  onClick={() => {
                    setProvider(x.id);
                    setModel("");
                    setResult(null);
                  }}
                />
              ))}
            </div>
          </div>

          {p ? (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="eyebrow" htmlFor="engine-model">Model</label>
                <a href={p.keyUrl} target="_blank" rel="noreferrer noopener" className="flex items-center gap-1 font-mono text-[10px] text-muted hover:text-fg">
                  get a {p.name} key <ExternalLink className="size-3" />
                </a>
              </div>
              <input
                id="engine-model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={`${p.models[0]} (default)`}
                spellCheck={false}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-inset px-3 font-mono text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {p.models.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setModel(m)}
                    className={cn(
                      "rounded-md px-2 py-1 font-mono text-[10.5px]",
                      (model || p.models[0]) === m ? "bg-accent text-accent-fg" : "bg-elevated text-muted hover:text-fg",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {p.note ? <p className="mt-2 text-[11px] text-warn">{p.note}</p> : null}
              <p className="mt-2 font-mono text-[10px] text-subtle">If a model is unavailable, the station falls back down this list automatically.</p>
            </div>
          ) : (
            <p className="rounded-xl border border-line bg-inset px-3 py-3 text-sm text-muted">
              {status?.engine
                ? `This deployment runs ${status.engine.name} (${status.engine.models[0]}) with its own key.`
                : "No server key is configured, so the station answers in demo mode. Paste a key above to go live."}
            </p>
          )}

          {result ? (
            <div className={cn("flex items-start gap-3 rounded-xl border px-3 py-3", result.ok ? "border-signal/40 bg-signal/5" : "border-danger/40 bg-danger/5")}>
              <Lamp tone={result.ok ? "signal" : "danger"} className="mt-1.5" />
              <div className="min-w-0 font-mono text-xs">
                {result.ok ? (
                  <>
                    <p className="text-fg">
                      Connected · {result.name} · {result.model} · {result.ms}ms
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

        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-4">
          {saved.key ? (
            <button
              type="button"
              onClick={() => {
                setEngine({ provider: "server", key: "", model: "" });
                setOpen(false);
              }}
              className="h-10 rounded-lg px-3 text-xs text-muted hover:text-danger"
            >
              Forget saved key
            </button>
          ) : null}
          <button
            type="button"
            disabled={!canUse || testing}
            onClick={() => void test()}
            className="ml-auto h-10 rounded-lg border border-line-strong px-4 text-sm text-fg hover:bg-elevated disabled:opacity-40"
          >
            {testing ? "Testing…" : "Test connection"}
          </button>
          <button
            type="button"
            disabled={!canUse}
            onClick={() => {
              setEngine(draft);
              setOpen(false);
            }}
            className="h-10 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            Use this engine
          </button>
        </div>
      </div>
    </div>
  );
}

function ProviderTile({ on, name, hint, onClick }: { on: boolean; name: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border px-2.5 py-2 text-left transition-colors",
        on ? "border-accent bg-accent/10" : "border-line hover:border-line-strong",
      )}
    >
      <span className="block truncate text-[12.5px] text-fg">{name}</span>
      <span className="block truncate font-mono text-[10px] text-subtle">{hint}</span>
    </button>
  );
}
