import type { ProviderId } from "./engine/providers";

export type EngineStatus = {
  ready: boolean;
  models: string[];
  byok: boolean;
  /** The server can proxy local runtimes; otherwise the browser calls them directly. */
  localEngines: boolean;
  engine: { provider: ProviderId | "custom"; name: string; models: string[]; source: "server" } | null;
};

let localProxy: boolean | null = null;

/** What /api/status said about proxying local runtimes (null until it answers). */
export function serverProxiesLocal() {
  return localProxy;
}

export async function getEngineStatus(): Promise<EngineStatus> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const j = (await res.json()) as Partial<EngineStatus>;
    localProxy = j.localEngines === true;
    return { ready: Boolean(j.ready), models: j.models ?? [], byok: j.byok !== false, localEngines: localProxy, engine: j.engine ?? null };
  } catch {
    return { ready: false, models: [], byok: true, localEngines: false, engine: null };
  }
}
