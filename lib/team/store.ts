import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { PersonaId } from "@/lib/catalog";
import { MEMORY_MAX_CHARS, MEMORY_MAX_NOTES, type TeamStep } from "./types";

export type LaneStatus = "queued" | "working" | "done" | "error" | "stopped";

export type TeamLane = {
  bot: PersonaId;
  task: string;
  text: string;
  status: LaneStatus;
  handoffAt?: number;
  startedAt?: number;
  firstTokenAt?: number;
  ms?: number;
  chars?: number;
  model?: string;
  kernelChars?: number;
  error?: string;
};

export type TeamFinal = {
  status: "idle" | "working" | "done" | "error" | "stopped";
  text: string;
  startedAt?: number;
  ms?: number;
  model?: string;
  error?: string;
};

export type TeamApproval = { action: string; decision: "pending" | "approved" | "rejected"; at: number; decidedAt?: number };

export type RunStatus = "planning" | "working" | "synthesizing" | "done" | "error" | "stopped";

export type TeamRun = {
  id: string;
  job: string;
  /** Non-lead participants the run was started with. */
  bots: PersonaId[];
  createdAt: number;
  endedAt?: number;
  status: RunStatus;
  demo: boolean;
  plan: TeamStep[] | null;
  planModel?: string;
  planFallback?: boolean;
  planAt?: number;
  handoffs: { to: PersonaId; text: string; at: number }[];
  lanes: TeamLane[];
  wait: { reason: string; pending: number; at: number } | null;
  final: TeamFinal;
  approval: TeamApproval | null;
  error?: string;
  routineId?: string;
  routineName?: string;
};

export type RoutineEvery = 0 | 15 | 30 | 60;

export type Routine = {
  id: string;
  name: string;
  job: string;
  bots: PersonaId[];
  /** Minutes between runs while the station tab is open; 0 = manual only. */
  every: RoutineEvery;
  createdAt: number;
  lastRunAt?: number;
  nextAt?: number;
};

type TeamState = {
  hydrated: boolean;
  running: boolean;
  /** The run on screen: the live one, or a past run opened from history. */
  current: TeamRun | null;
  history: TeamRun[];
  memory: Partial<Record<PersonaId, string[]>>;
  routines: Routine[];
  /** Teammates selected for the next run (the lead is implicit). Not persisted. */
  roster: PersonaId[];
  toggleBot: (id: PersonaId) => void;
  setRoster: (ids: PersonaId[]) => void;
  addMemory: (bot: PersonaId, text: string) => void;
  removeMemory: (bot: PersonaId, index: number) => void;
  beginRun: (run: TeamRun) => void;
  patchRun: (id: string, fn: (run: TeamRun) => TeamRun) => void;
  endRun: (id: string) => void;
  openRun: (id: string) => void;
  closeRun: () => void;
  clearHistory: () => void;
  decide: (runId: string, ok: boolean) => TeamApproval | null;
  addRoutine: (r: Omit<Routine, "id" | "createdAt" | "every">) => void;
  removeRoutine: (id: string) => void;
  setRoutineEvery: (id: string, every: RoutineEvery) => void;
  markRoutineRun: (id: string, at: number) => void;
};

const HISTORY_MAX = 10;

/** Keeps localStorage small: long lane bodies and finals are clipped in the persisted copy only. */
function slim(run: TeamRun): TeamRun {
  return {
    ...run,
    lanes: run.lanes.map((l) => (l.text.length > 8000 ? { ...l, text: `${l.text.slice(0, 8000)}\n\n_…clipped_` } : l)),
    final: run.final.text.length > 16_000 ? { ...run.final, text: `${run.final.text.slice(0, 16_000)}\n\n_…clipped_` } : run.final,
  };
}

export const useTeam = create<TeamState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      running: false,
      current: null,
      history: [],
      memory: {},
      routines: [],
      roster: ["researcher", "coder", "writer"],
      toggleBot: (id) => {
        if (id === "operator") return;
        const cur = get().roster;
        set({ roster: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
      },
      setRoster: (ids) => set({ roster: [...new Set(ids.filter((x) => x !== "operator"))] }),
      addMemory: (bot, text) => {
        const t = text.trim().slice(0, MEMORY_MAX_CHARS);
        if (!t) return;
        const cur = get().memory[bot] ?? [];
        if (cur.length >= MEMORY_MAX_NOTES) return;
        set({ memory: { ...get().memory, [bot]: [...cur, t] } });
      },
      removeMemory: (bot, index) => {
        const cur = get().memory[bot] ?? [];
        set({ memory: { ...get().memory, [bot]: cur.filter((_, i) => i !== index) } });
      },
      beginRun: (run) => set({ current: run, running: true }),
      patchRun: (id, fn) => {
        const cur = get().current;
        if (cur?.id === id) set({ current: fn(cur) });
      },
      endRun: (id) => {
        const cur = get().current;
        if (!cur || cur.id !== id) {
          set({ running: false });
          return;
        }
        const done = { ...cur, endedAt: cur.endedAt ?? Date.now() };
        set({
          running: false,
          current: done,
          history: [done, ...get().history.filter((r) => r.id !== id)].slice(0, HISTORY_MAX),
        });
      },
      openRun: (id) => {
        if (get().running) return;
        const run = get().history.find((r) => r.id === id);
        if (run) set({ current: run });
      },
      closeRun: () => {
        if (!get().running) set({ current: null });
      },
      clearHistory: () => set({ history: [] }),
      decide: (runId, ok) => {
        const apply = (r: TeamRun): TeamRun =>
          r.id === runId && r.approval?.decision === "pending"
            ? { ...r, approval: { ...r.approval, decision: ok ? "approved" : "rejected", decidedAt: Date.now() } }
            : r;
        const cur = get().current;
        const before = cur?.id === runId ? cur.approval : get().history.find((r) => r.id === runId)?.approval;
        if (before?.decision !== "pending") return null;
        set({ current: cur ? apply(cur) : cur, history: get().history.map(apply) });
        return (get().current?.id === runId ? get().current?.approval : get().history.find((r) => r.id === runId)?.approval) ?? null;
      },
      addRoutine: (r) => {
        const routine: Routine = { ...r, id: crypto.randomUUID(), createdAt: Date.now(), every: 0 };
        set({ routines: [routine, ...get().routines].slice(0, 20) });
      },
      removeRoutine: (id) => set({ routines: get().routines.filter((r) => r.id !== id) }),
      setRoutineEvery: (id, every) =>
        set({
          routines: get().routines.map((r) =>
            r.id === id ? { ...r, every, nextAt: every ? Date.now() + every * 60_000 : undefined } : r,
          ),
        }),
      markRoutineRun: (id, at) =>
        set({
          routines: get().routines.map((r) =>
            r.id === id ? { ...r, lastRunAt: at, nextAt: r.every ? at + r.every * 60_000 : undefined } : r,
          ),
        }),
    }),
    {
      name: "axiom-team-v1",
      skipHydration: true,
      partialize: (s) => ({ memory: s.memory, routines: s.routines, history: s.history.map(slim) }),
    },
  ),
);

let hydrating: Promise<void> | null = null;

/** Loads memory, routines and past runs from localStorage once per page (client only). */
export function hydrateTeam(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (!hydrating) {
    hydrating = Promise.resolve(useTeam.persist.rehydrate()).then(() => {
      // Intervals only tick while the tab is open; an overdue routine gets a minute's grace after load.
      const now = Date.now();
      useTeam.setState((s) => ({
        hydrated: true,
        routines: s.routines.map((r) => (r.every && (r.nextAt ?? 0) < now + 60_000 ? { ...r, nextAt: now + 60_000 } : r)),
      }));
    });
  }
  return hydrating;
}
