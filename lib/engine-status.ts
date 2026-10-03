import type { ProviderId } from "./engine/providers";

export type EngineStatus = {
  ready: boolean;
  models: string[];
  byok: boolean;
  engine: { provider: ProviderId | "custom"; name: string; models: string[]; source: "server" } | null;
};

export async function getEngineStatus(): Promise<EngineStatus> {
  try {
    const res = await fetch("/api/status", { cache: "no-store" });
    const j = (await res.json()) as Partial<EngineStatus>;
    return { ready: Boolean(j.ready), models: j.models ?? [], byok: j.byok !== false, engine: j.engine ?? null };
  } catch {
    return { ready: false, models: [], byok: true, engine: null };
  }
}
