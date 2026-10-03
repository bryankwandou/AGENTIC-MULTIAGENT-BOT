import { PERSONAS, type PersonaId } from "./catalog";

const who = (id: PersonaId) => PERSONAS.find((p) => p.id === id)?.bot ?? id;

/** Ship-log lines follow the station's UI language at the moment they are written (the shell keeps it in sync). */
let indonesian = false;
export function setFloorLanguage(language: string) {
  indonesian = language !== "en";
}
const idUi = () => indonesian;

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
  /** Bot is blocked on background work (teammates, a slow engine) — it goes for coffee. `pending` = teammates still working. */
  | { type: "wait"; persona: PersonaId; reason: string; pending?: number }
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
  const id = idUi();
  switch (e.type) {
    case "job": {
      floorStats.jobs += 1;
      const job = e.text.replace(/\s+/g, " ").slice(0, 64);
      push("Job", id ? `${who(e.persona)} menerima "${job}"` : `${who(e.persona)} took "${job}"`);
      break;
    }
    case "compiled":
      push(
        "Kernel",
        `${id ? "kompilasi" : "compiled"} ${e.chars.toLocaleString()}c ${id ? "untuk" : "for"} ${who(e.persona)}${e.model ? ` → ${e.model}` : ""}`,
        "signal",
      );
      break;
    case "done": {
      floorStats.chars += e.chars;
      floorStats.lastMs = e.ms;
      floorStats.lastModel = e.model ?? "";
      const n = e.chars.toLocaleString();
      const s = (e.ms / 1000).toFixed(1);
      push(id ? "Kirim" : "Ship", id ? `${who(e.persona)} mengirim ${n} karakter dalam ${s} dtk` : `${who(e.persona)} shipped ${n} chars in ${s}s`, "signal");
      break;
    }
    case "error":
      push(id ? "Galat" : "Error", `${who(e.persona)}: ${e.message.slice(0, 90)}`, "danger");
      break;
    case "stopped":
      push("Stop", id ? `${who(e.persona)} diminta berhenti` : `${who(e.persona)} was told to stop`, "warn");
      break;
    case "handoff":
      push(id ? "Serah" : "Handoff", `${who(e.from)} → ${who(e.to)}: ${e.text.replace(/\s+/g, " ").slice(0, 60)}`);
      break;
    case "wait": {
      const reason = e.pending !== undefined ? (id ? `menunggu ${e.pending} rekan` : `waiting on ${e.pending} teammate${e.pending === 1 ? "" : "s"}`) : e.reason;
      push(id ? "Tunggu" : "Wait", id ? `${who(e.persona)} ${reason}` : `${who(e.persona)} ${e.pending !== undefined ? reason : `waiting — ${reason}`}`);
      break;
    }
    case "approval":
      push(id ? "Persetujuan" : "Approval", id ? `${who(e.persona)} butuh persetujuan: ${e.action.slice(0, 70)}` : `${who(e.persona)} needs approval: ${e.action.slice(0, 70)}`, "warn");
      break;
    case "approved":
      push(
        id ? "Persetujuan" : "Approval",
        `${e.ok ? (id ? "disetujui" : "approved") : id ? "ditolak" : "rejected"}: ${e.action.slice(0, 70)}`,
        e.ok ? "signal" : "danger",
      );
      break;
    case "vault":
      push("Vault", id ? `catatan disimpan: "${e.text.slice(0, 56)}"` : `note filed: "${e.text.slice(0, 56)}"`);
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
