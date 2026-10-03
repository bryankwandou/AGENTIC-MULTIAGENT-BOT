"use client";

import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { emitFloor } from "@/lib/floor-bus";
import { openInBrowser, transportOf } from "@/lib/engine/client";
import { engineHeaders, useStation } from "@/lib/store";
import { LOCAL_PACE, orchestrate, type Opener, type TeamInput } from "./orchestrator";
import { hydrateTeam, useTeam, type TeamLane, type TeamRun } from "./store";
import {
  LEAD,
  MEMORY_MAX_CHARS,
  MEMORY_MAX_NOTES,
  type TeamEvent,
} from "./types";

/**
 * Team pipeline, module-level like the chat sender: a run keeps streaming — and the Floor keeps
 * animating it — when the operator switches views mid-run.
 */

let controller: AbortController | null = null;

const VALID = new Set<PersonaId>(PERSONAS.map((p) => p.id));
const FLUSH_MS = 60;
const FLOOR_TOKEN_MS = 100;

export function abortTeam() {
  controller?.abort();
}

export async function runTeam(
  job: string,
  bots: PersonaId[],
  opts: { routineId?: string; routineName?: string } = {},
) {
  const text = job.trim();
  const team = useTeam.getState();
  if (!text || team.running) return;
  const participants = [
    ...new Set(bots.filter((b) => VALID.has(b) && b !== LEAD)),
  ];
  if (!participants.length) return;

  const st = useStation.getState();
  const runId = crypto.randomUUID();
  const run: TeamRun = {
    id: runId,
    job: text,
    bots: participants,
    createdAt: Date.now(),
    status: "planning",
    demo: false,
    plan: null,
    handoffs: [],
    lanes: [],
    wait: null,
    final: { status: "idle", text: "" },
    approval: null,
    routineId: opts.routineId,
    routineName: opts.routineName,
  };
  team.beginRun(run);
  emitFloor({ type: "job", persona: LEAD, text, source: "team" });

  const patch = (fn: (r: TeamRun) => TeamRun) =>
    useTeam.getState().patchRun(runId, fn);
  const lane = (bot: PersonaId, fn: (l: TeamLane) => TeamLane) =>
    patch((r) => ({
      ...r,
      lanes: r.lanes.map((l) => (l.bot === bot ? fn(l) : l)),
    }));

  // Token text is buffered here and flushed to the store (and the Floor) at a steady cadence.
  const acc = new Map<PersonaId, string>();
  const firstAt = new Map<PersonaId, number>();
  const floorAt = new Map<PersonaId, number>();
  const floorSent = new Map<PersonaId, string>();
  let finalAcc = "";
  let dirty = false;
  let timer: number | null = null;
  let ended = false;

  const floorToken = (persona: PersonaId, value: string, force = false) => {
    const now = performance.now();
    if (!value || floorSent.get(persona) === value) return;
    if (!force && now - (floorAt.get(persona) ?? 0) < FLOOR_TOKEN_MS) return;
    floorAt.set(persona, now);
    floorSent.set(persona, value);
    emitFloor({ type: "token", persona, text: value });
  };

  const flush = () => {
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
    if (!dirty) return;
    dirty = false;
    patch((r) => ({
      ...r,
      lanes: r.lanes.map((l) => {
        const t = acc.get(l.bot);
        if (t === undefined || t === l.text) return l;
        return {
          ...l,
          text: t,
          firstTokenAt: l.firstTokenAt ?? firstAt.get(l.bot),
        };
      }),
      final:
        r.final.status === "working" && r.final.text !== finalAcc
          ? { ...r.final, text: finalAcc }
          : r.final,
    }));
    acc.forEach((t, bot) => floorToken(bot, t));
    if (finalAcc) floorToken(LEAD, finalAcc);
  };

  const schedule = () => {
    dirty = true;
    if (timer === null) timer = window.setTimeout(flush, FLUSH_MS);
  };

  const handle = (e: TeamEvent) => {
    switch (e.type) {
      case "meta":
        patch((r) => ({ ...r, demo: e.demo }));
        emitFloor({
          type: "compiled",
          persona: LEAD,
          chars: e.kernelChars,
          model: e.demo ? "demo" : undefined,
        });
        break;
      case "plan":
        patch((r) => ({
          ...r,
          status: "working",
          plan: e.steps,
          planModel: e.model,
          planFallback: e.fallback,
          planAt: Date.now(),
          lanes: e.steps.map((s) => ({
            bot: s.bot,
            task: s.task,
            text: "",
            status: "queued",
          })),
        }));
        emitFloor({
          type: "ambient",
          tag: "Plan",
          text: `${LEAD} split the job ${e.steps.length} way${e.steps.length === 1 ? "" : "s"}: ${e.steps.map((s) => s.bot).join(", ")}`,
        });
        break;
      case "handoff": {
        const at = Date.now();
        patch((r) => ({
          ...r,
          handoffs: [...r.handoffs, { to: e.to, text: e.text, at }],
          lanes: r.lanes.map((l) =>
            l.bot === e.to ? { ...l, handoffAt: at } : l,
          ),
        }));
        emitFloor({ type: "handoff", from: e.from, to: e.to, text: e.text });
        break;
      }
      case "start":
        acc.set(e.bot, "");
        lane(e.bot, (l) => ({
          ...l,
          task: e.task || l.task,
          status: "working",
          startedAt: Date.now(),
          kernelChars: e.kernelChars,
        }));
        emitFloor({
          type: "job",
          persona: e.bot,
          text: e.task,
          source: "team",
        });
        if (e.kernelChars)
          emitFloor({ type: "compiled", persona: e.bot, chars: e.kernelChars });
        break;
      case "token":
        if (!firstAt.has(e.bot)) firstAt.set(e.bot, Date.now());
        acc.set(e.bot, (acc.get(e.bot) ?? "") + e.text);
        schedule();
        break;
      case "done": {
        flush();
        const full = acc.get(e.bot) ?? "";
        lane(e.bot, (l) => ({
          ...l,
          text: full || l.text,
          status: "done",
          ms: e.ms,
          chars: e.chars,
          model: e.model,
        }));
        floorToken(e.bot, full, true);
        emitFloor({
          type: "done",
          persona: e.bot,
          ms: e.ms,
          chars: e.chars,
          model: e.model,
        });
        break;
      }
      case "error":
        flush();
        if (e.bot === LEAD) {
          patch((r) => ({
            ...r,
            error: e.message,
            final:
              r.final.status === "working"
                ? { ...r.final, status: "error", error: e.message }
                : r.final,
          }));
        } else {
          lane(e.bot, (l) => ({
            ...l,
            status: "error",
            error: e.message,
            ms: l.startedAt ? Date.now() - l.startedAt : undefined,
          }));
        }
        emitFloor({ type: "error", persona: e.bot, message: e.message });
        break;
      case "wait":
        patch((r) => ({
          ...r,
          wait: { reason: e.reason, pending: e.pending ?? 0, at: Date.now() },
        }));
        emitFloor({ type: "wait", persona: LEAD, reason: e.reason, pending: e.pending });
        break;
      case "final-start":
        finalAcc = "";
        patch((r) => ({
          ...r,
          status: "synthesizing",
          final: { status: "working", text: "", startedAt: Date.now() },
        }));
        break;
      case "final-token":
        finalAcc += e.text;
        schedule();
        break;
      case "final-done":
        flush();
        patch((r) => ({
          ...r,
          final: {
            ...r.final,
            text: finalAcc,
            status: "done",
            ms: e.ms,
            model: e.model,
          },
        }));
        floorToken(LEAD, finalAcc, true);
        emitFloor({
          type: "done",
          persona: LEAD,
          ms: e.ms,
          chars: e.chars ?? finalAcc.length,
          model: e.model,
        });
        break;
      case "approval":
        patch((r) => ({
          ...r,
          approval: { action: e.action, decision: "pending", at: Date.now() },
        }));
        emitFloor({ type: "approval", persona: LEAD, action: e.action });
        break;
      case "end":
        ended = true;
        break;
    }
  };

  const ctrl = new AbortController();
  controller = ctrl;
  const idUi = st.language !== "en";
  const memory = useTeam.getState().memory;

  try {
    if (transportOf(st.engine) === "browser") {
      // Local runtime on a deployed site: orchestrate in this tab, every call straight to the operator's machine.
      const botMemory: TeamInput["botMemory"] = {};
      for (const b of [LEAD, ...participants]) {
        const notes = (memory[b] ?? [])
          .filter((n) => n.trim())
          .slice(0, MEMORY_MAX_NOTES)
          .map((n) => n.trim().slice(0, MEMORY_MAX_CHARS));
        if (notes.length) botMemory[b] = notes;
      }
      const input: TeamInput = {
        job: text.slice(0, 4000),
        bots: participants,
        language: st.language,
        compileMode: st.compileMode,
        enabledModules: st.enabledModules,
        vault: st.vault.slice(0, 40).map((v) => v.text.slice(0, 500)),
        addendum: st.addendum.slice(0, 4000),
        temperature: Math.min(1.2, Math.max(0, st.temperature)),
        maxTokens: Math.round(Math.min(4096, Math.max(256, st.maxTokens))),
        botMemory,
      };
      const open: Opener = (req) =>
        openInBrowser(st.engine, {
          system: req.system.slice(0, 100_000),
          messages: [{ role: "user", content: req.user }],
          temperature: req.temperature,
          maxTokens: req.maxTokens,
          signal: req.signal,
        });
      try {
        await orchestrate(input, open, handle, ctrl.signal, false, LOCAL_PACE);
      } catch (err) {
        if (!ctrl.signal.aborted) {
          handle({
            type: "error",
            bot: LEAD,
            message: err instanceof Error ? err.message : "Team run failed.",
          });
          handle({ type: "end" });
        }
      }
    } else {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...engineHeaders(st.engine),
        },
        signal: ctrl.signal,
        body: JSON.stringify({
          job: text,
          bots: participants,
          language: st.language,
          compileMode: st.compileMode,
          enabledModules: st.enabledModules,
          vault: st.vault.map((v) => v.text),
          addendum: st.addendum,
          temperature: st.temperature,
          maxTokens: st.maxTokens,
          botMemory: Object.fromEntries(
            [LEAD, ...participants].map((b) => [b, memory[b] ?? []]),
          ),
        }),
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(j?.error ?? `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n");
        buf = parts.pop() ?? "";
        for (const line of parts) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (!data) continue;
          let event: TeamEvent;
          try {
            event = JSON.parse(data) as TeamEvent;
          } catch {
            continue;
          }
          handle(event);
        }
      }
    }
    // Some runtimes end the body cleanly instead of rejecting the read when the run is aborted.
    if (ctrl.signal.aborted) throw new DOMException("Aborted", "AbortError");
    flush();
    patch((r) => {
      const error =
        r.error ??
        (ended
          ? undefined
          : idUi
            ? "Koneksi terputus sebelum tim selesai."
            : "Connection closed before the team finished.");
      return {
        ...r,
        error,
        status: r.final.status === "done" ? "done" : "error",
        lanes: r.lanes.map((l) =>
          l.status === "working" || l.status === "queued" ? stopLane(l) : l,
        ),
        final:
          r.final.status === "working"
            ? { ...r.final, status: "error", error }
            : r.final,
      };
    });
    if (!ended)
      emitFloor({
        type: "error",
        persona: LEAD,
        message: "Team stream closed early.",
      });
  } catch (err) {
    flush();
    if ((err as { name?: string }).name === "AbortError") {
      const r = useTeam.getState().current;
      const still =
        r?.id === runId
          ? r.lanes.filter((l) => l.status === "working").map((l) => l.bot)
          : [];
      patch((x) => ({
        ...x,
        status: "stopped",
        lanes: x.lanes.map((l) =>
          l.status === "working" || l.status === "queued" ? stopLane(l) : l,
        ),
        final:
          x.final.status === "working"
            ? { ...x.final, status: "stopped" }
            : x.final,
      }));
      [LEAD, ...still].forEach((persona) =>
        emitFloor({ type: "stopped", persona }),
      );
    } else {
      const message = err instanceof Error ? err.message : "Team run failed.";
      patch((x) => ({
        ...x,
        status: "error",
        error: message,
        lanes: x.lanes.map((l) =>
          l.status === "working" || l.status === "queued" ? stopLane(l) : l,
        ),
        final:
          x.final.status === "working"
            ? { ...x.final, status: "error", error: message }
            : x.final,
      }));
      emitFloor({ type: "error", persona: LEAD, message });
    }
  } finally {
    if (timer !== null) window.clearTimeout(timer);
    if (controller === ctrl) controller = null;
    useTeam.getState().endRun(runId);
  }
}

function stopLane(l: TeamLane): TeamLane {
  return {
    ...l,
    status: "stopped",
    ms: l.startedAt ? Date.now() - l.startedAt : undefined,
  };
}

/** The operator's call on a pending approval. Nothing external exists to execute — the decision is recorded and shown. */
export function decideApproval(runId: string, ok: boolean) {
  const decided = useTeam.getState().decide(runId, ok);
  if (decided)
    emitFloor({ type: "approved", persona: LEAD, action: decided.action, ok });
}

export function runRoutine(id: string) {
  const team = useTeam.getState();
  const r = team.routines.find((x) => x.id === id);
  if (!r || team.running) return;
  team.markRoutineRun(id, Date.now());
  void runTeam(r.job, r.bots, { routineId: r.id, routineName: r.name });
}

let clock: number | null = null;

/** Starts the routine scheduler once per page. Intervals only fire while the station tab is open. */
export function startRoutineClock() {
  if (typeof window === "undefined" || clock !== null) return;
  void hydrateTeam();
  clock = window.setInterval(() => {
    const team = useTeam.getState();
    if (!team.hydrated || team.running || !useStation.getState().hydrated)
      return;
    const now = Date.now();
    const due = team.routines.find(
      (r) => r.every > 0 && r.nextAt !== undefined && r.nextAt <= now,
    );
    if (due) runRoutine(due.id);
  }, 15_000);
}
