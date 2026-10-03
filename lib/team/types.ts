import type { PersonaId } from "@/lib/catalog";

/** The lead of every team run. It plans, hands off, waits, and writes the final deliverable. */
export const LEAD: PersonaId = "operator";

export type TeamStep = { bot: PersonaId; task: string };

/**
 * One frame of the /api/team SSE stream (`data: {json}\n\n`).
 * Worker events carry `bot`; the lead's own planning / synthesis failures arrive as `error` with bot "operator".
 */
export type TeamEvent =
  /** First frame: whether this run is scripted (no engine), who is on it, and the lead's kernel size. */
  | { type: "meta"; demo: boolean; lead: PersonaId; bots: PersonaId[]; kernelChars: number }
  | { type: "plan"; steps: TeamStep[]; model: string; fallback?: boolean }
  | { type: "handoff"; from: PersonaId; to: PersonaId; text: string }
  | { type: "start"; bot: PersonaId; task: string; kernelChars?: number }
  | { type: "token"; bot: PersonaId; text: string }
  | { type: "done"; bot: PersonaId; ms: number; chars: number; model: string }
  | { type: "error"; bot: PersonaId; message: string }
  | { type: "wait"; bot: PersonaId; reason: string; pending?: number }
  | { type: "final-start" }
  | { type: "final-token"; text: string }
  | { type: "final-done"; ms: number; model: string; chars?: number }
  | { type: "approval"; bot: PersonaId; action: string }
  | { type: "end" };

/** Request body for POST /api/team. */
export type TeamRequest = {
  job: string;
  bots: PersonaId[];
  language: string;
  compileMode: string;
  enabledModules: string[];
  vault: string[];
  addendum: string;
  temperature: number;
  maxTokens: number;
  botMemory: Partial<Record<PersonaId, string[]>>;
};

export const MEMORY_MAX_NOTES = 12;
export const MEMORY_MAX_CHARS = 300;
