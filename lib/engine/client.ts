"use client";

import { openCompat, listCompatModels, type CompatTarget, type OpenOpts, type Opened } from "./compat";
import { cleanBaseUrl, getProvider } from "./providers";
import { serverProxiesLocal } from "@/lib/engine-status";
import type { EngineSettings } from "@/lib/store";

/**
 * Browser transport for runtimes on the operator's own machine (Ollama, LM Studio, vLLM, llama.cpp…).
 * A deployed site's server cannot reach `localhost` on the operator's laptop, so the tab calls it directly.
 */

export function isLocalSite() {
  return typeof window !== "undefined" && /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(window.location.hostname);
}

export type Transport = "server" | "browser";

/** Auto: the server proxies local runtimes when it says it can (no CORS setup); otherwise the tab calls them. */
export function transportOf(e: EngineSettings): Transport {
  const p = getProvider(e.provider);
  if (!p?.local) return "server";
  if (e.transport === "server" || e.transport === "browser") return e.transport;
  const proxy = serverProxiesLocal();
  return (proxy ?? isLocalSite()) ? "server" : "browser";
}

export function browserTarget(e: EngineSettings): CompatTarget | null {
  const p = getProvider(e.provider);
  if (!p) return null;
  const baseUrl = cleanBaseUrl(e.baseUrl, p.baseUrl);
  if (!baseUrl) return null;
  const model = e.model.trim();
  return {
    name: p.name,
    baseUrl,
    key: e.key.trim() || undefined,
    models: model ? [model, ...p.models.filter((m) => m !== model)] : p.models,
  };
}

export async function openInBrowser(e: EngineSettings, opts: OpenOpts): Promise<Opened> {
  const t = browserTarget(e);
  if (!t) throw new Error("That base URL is not valid.");
  // Local models can take a while to load into memory on the first call.
  return openCompat(t, opts, 120_000);
}

export async function modelsInBrowser(e: EngineSettings, signal?: AbortSignal): Promise<string[]> {
  const t = browserTarget(e);
  if (!t) throw new Error("That base URL is not valid.");
  return listCompatModels(t, signal);
}

export function corsHint(e: EngineSettings): string | null {
  const p = getProvider(e.provider);
  if (!p?.cors || typeof window === "undefined") return null;
  return p.cors.replaceAll("{origin}", window.location.origin);
}
