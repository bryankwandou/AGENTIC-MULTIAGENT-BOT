import { PERSONAS, type PersonaId } from "./catalog";

const who = (id: PersonaId) => PERSONAS.find((p) => p.id === id)?.bot ?? id;

/** What happens on the station, as the Floor animation and its ship-log see it. */
export type FloorEvent =
  /** A bot received work. It walks to the meeting room to think until its first token. */
  | { type: "job"; persona: PersonaId; text: string; source?: "chat" | "team" }
  | { type: "compiled"; persona: PersonaId; chars: number; model?: string }
  | { type: "token"; persona: PersonaId; text: string }
  | { type: "done"; persona: PersonaId; ms: number; model?: string; chars: number }
  | { type: "error"; persona: PersonaId; message: string }
  | { type: "stopped"; persona: PersonaId }
  /** Bot hands work to a teammate — it walks over to their desk. */
  | { type: "handoff"; from: PersonaId; to: PersonaId; text: string }
  /** Bot is blocked on background work (teammates, a slow engine) — it goes for coffee. */
  | { type: "wait"; persona: PersonaId; reason: string }
  /** Bot needs the operator's approval for a sensitive action. */
  | { type: "approval"; persona: PersonaId; action: string }
  | { type: "approved"; persona: PersonaId; action: string; ok: boolean }
  | { type: "vault"; text: string }
  | { type: "ambient"; tag: string; text: string };

export type LogEntry = { id: number; t: number; tag: string; text: string; tone?: "signal" | "warn" | "danger" };

export const floorStats = { jobs: 0, chars: 0, lastMs: 0, lastModel: "" };

const listeners = new Set<(e: FloorEvent) => void>();
const logListeners = new Set<() => void>();
const log: LogEntry[] = [];
let seq = 0;

function push(tag: string, text: string, tone?: LogEntry["tone"]) {
  log.unshift({ id: ++seq, t: Date.now(), tag, text, tone });
  if (log.length > 60) log.length = 60;
  logListeners.forEach((fn) => fn());
}

export function emitFloor(e: FloorEvent) {
  switch (e.type) {
    case "job":
      floorStats.jobs += 1;
      push("Job", `${who(e.persona)} took "${e.text.replace(/\s+/g, " ").slice(0, 64)}"`);
      break;
    case "compiled":
      push("Kernel", `compiled ${e.chars.toLocaleString()}c for ${who(e.persona)}${e.model ? ` → ${e.model}` : ""}`, "signal");
      break;
    case "done":
      floorStats.chars += e.chars;
      floorStats.lastMs = e.ms;
      floorStats.lastModel = e.model ?? "";
      push("Ship", `${who(e.persona)} shipped ${e.chars.toLocaleString()} chars in ${(e.ms / 1000).toFixed(1)}s`, "signal");
      break;
    case "error":
      push("Error", `${who(e.persona)}: ${e.message.slice(0, 90)}`, "danger");
      break;
    case "stopped":
      push("Stop", `${who(e.persona)} was told to stop`, "warn");
      break;
    case "handoff":
      push("Handoff", `${who(e.from)} → ${who(e.to)}: ${e.text.replace(/\s+/g, " ").slice(0, 60)}`);
      break;
    case "wait":
      push("Wait", `${who(e.persona)} waiting — ${e.reason}`);
      break;
    case "approval":
      push("Approval", `${who(e.persona)} needs approval: ${e.action.slice(0, 70)}`, "warn");
      break;
    case "approved":
      push("Approval", `${e.ok ? "approved" : "rejected"}: ${e.action.slice(0, 70)}`, e.ok ? "signal" : "danger");
      break;
    case "vault":
      push("Vault", `note filed: "${e.text.slice(0, 56)}"`);
      break;
    case "ambient":
      push(e.tag, e.text);
      break;
  }
  listeners.forEach((fn) => fn(e));
}

export function onFloor(fn: (e: FloorEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function floorLog(): readonly LogEntry[] {
  return log;
}

export function onFloorLog(fn: () => void) {
  logListeners.add(fn);
  return () => {
    logListeners.delete(fn);
  };
}
