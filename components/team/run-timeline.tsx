"use client";

import { useEffect, useState } from "react";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import type { PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import type { TeamRun } from "@/lib/team/store";
import { LEAD } from "@/lib/team/types";

type Seg = { from: number; to: number; kind: "plan" | "think" | "write" | "synth" | "error" | "stopped"; live?: boolean };
type Row = { bot: PersonaId; segs: Seg[]; marks: { at: number; kind: "handoff" | "approval" }[] };

function useClock(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

/** Rows of time spans for one run, in ms since it started. */
function rowsFor(run: TeamRun, now: number): { rows: Row[]; total: number } {
  const t0 = run.createdAt;
  const live = !run.endedAt && !["done", "error", "stopped"].includes(run.status);
  const end = run.endedAt ?? now;
  const rel = (t: number) => Math.max(0, t - t0);

  const lead: Row = { bot: LEAD, segs: [], marks: [] };
  lead.segs.push({ from: 0, to: rel(run.planAt ?? (live ? now : end)), kind: "plan", live: live && !run.planAt });
  if (run.final.startedAt) {
    const to = run.final.ms !== undefined ? run.final.startedAt + run.final.ms : run.final.status === "working" ? now : end;
    lead.segs.push({ from: rel(run.final.startedAt), to: rel(to), kind: run.final.status === "error" ? "error" : "synth", live: run.final.status === "working" });
  }
  if (run.approval) lead.marks.push({ at: rel(run.approval.at), kind: "approval" });

  const rows: Row[] = [lead];
  for (const l of run.lanes) {
    const row: Row = { bot: l.bot, segs: [], marks: [] };
    if (l.handoffAt) row.marks.push({ at: rel(l.handoffAt), kind: "handoff" });
    if (l.startedAt) {
      const working = l.status === "working";
      const stop = l.ms !== undefined ? l.startedAt + l.ms : working ? now : end;
      const first = l.firstTokenAt && l.firstTokenAt < stop ? l.firstTokenAt : null;
      const tail = l.status === "error" ? "error" : l.status === "stopped" ? "stopped" : "write";
      if (first) {
        row.segs.push({ from: rel(l.startedAt), to: rel(first), kind: "think" });
        row.segs.push({ from: rel(first), to: rel(stop), kind: tail, live: working });
      } else {
        row.segs.push({ from: rel(l.startedAt), to: rel(stop), kind: working ? "think" : tail, live: working });
      }
    }
    rows.push(row);
  }
  const total = Math.max(1000, rel(end), ...rows.flatMap((r) => [...r.segs.map((s) => s.to), ...r.marks.map((m) => m.at)]));
  return { rows, total };
}

function ticks(total: number) {
  const steps = [1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000];
  const step = steps.find((s) => total / s <= 6) ?? 600_000;
  const out: number[] = [];
  for (let t = 0; t <= total; t += step) out.push(t);
  return out;
}

const fmt = (ms: number) => (ms >= 60_000 ? `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000) ? `${Math.round((ms % 60_000) / 1000)}s` : ""}` : `${Math.round(ms / 1000)}s`);

/**
 * The run as a picture: who worked when. Overlapping bars are the parallelism; the lighter head of a
 * lane is the bot thinking (no token yet), the solid part is it writing.
 */
export function RunTimeline({ run, idUi, compact = false }: { run: TeamRun; idUi: boolean; compact?: boolean }) {
  const live = !run.endedAt && !["done", "error", "stopped"].includes(run.status);
  const now = useClock(live);
  const { rows, total } = rowsFor(run, now);
  const pct = (ms: number) => `${Math.min(100, (ms / total) * 100)}%`;
  const parallel = run.lanes.filter((l) => l.startedAt).length;
  const laneTime = run.lanes.reduce((sum, l) => sum + (l.ms ?? (l.startedAt && l.status === "working" ? now - l.startedAt : 0)), 0);
  const wall = run.lanes.length ? Math.max(1, Math.max(...run.lanes.map((l) => (l.startedAt ? (l.ms !== undefined ? l.startedAt + l.ms : now) : 0))) - Math.min(...run.lanes.map((l) => l.startedAt ?? Infinity))) : 0;
  const speedup = parallel > 1 && wall > 0 && Number.isFinite(wall) ? laneTime / wall : 0;

  return (
    <section className={cn("rounded-xl border border-line bg-bg/40", compact ? "px-3 py-2.5" : "px-4 py-3.5")}>
      <div className="mb-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <p className="eyebrow">{idUi ? "Linimasa" : "Timeline"}</p>
        <span className="font-mono text-[10px] text-subtle tabular-nums">{fmt(total)}</span>
        {speedup > 1.15 ? (
          <span className="font-mono text-[10px] text-signal tabular-nums" title={idUi ? "Total waktu kerja jalur dibagi waktu dinding" : "Summed lane time over wall-clock time"}>
            {speedup.toFixed(1)}× {idUi ? "paralel" : "parallel"}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3 font-mono text-[9.5px] text-subtle">
          <span className="flex items-center gap-1">
            <i className="inline-block h-1.5 w-3 rounded-full bg-fg/25" /> {idUi ? "berpikir" : "thinking"}
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-1.5 w-3 rounded-full bg-signal" /> {idUi ? "menulis" : "writing"}
          </span>
        </span>
      </div>

      <div className="space-y-1.5">
        {rows.map((r) => {
          const p = PERSONA_BY_ID[r.bot];
          return (
            <div key={r.bot} className="flex items-center gap-2">
              <span className={cn("flex shrink-0 items-center gap-1.5", compact ? "w-16" : "w-20")}>
                <BotAvatar id={r.bot} size={compact ? 16 : 18} />
                <span className="truncate text-[11px] text-muted">{p.bot}</span>
              </span>
              <div className="relative h-4 min-w-0 flex-1 rounded-full bg-line/40">
                {r.segs.map((s, i) => (
                  <span
                    key={i}
                    className={cn(
                      "absolute top-0.5 bottom-0.5 rounded-full",
                      s.kind === "think" && "opacity-35",
                      s.kind === "plan" && "opacity-60",
                      s.live && "animate-pulse",
                    )}
                    style={{
                      left: pct(s.from),
                      width: `max(3px, ${pct(Math.max(0, s.to - s.from))})`,
                      background: s.kind === "error" ? "var(--color-danger)" : s.kind === "stopped" ? "var(--color-line-strong)" : p.color,
                    }}
                    title={`${s.kind} · ${fmt(s.from)} → ${fmt(s.to)}`}
                  />
                ))}
                {r.marks.map((m, i) => (
                  <span
                    key={`m${i}`}
                    className={cn("absolute -top-0.5 -bottom-0.5 w-0.5 rounded-full", m.kind === "approval" ? "bg-warn" : "bg-fg/70")}
                    style={{ left: pct(m.at) }}
                    title={m.kind === "approval" ? (idUi ? "persetujuan diminta" : "approval requested") : idUi ? "serah tugas" : "handoff"}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={cn("relative mt-1.5 h-3 font-mono text-[9px] text-subtle tabular-nums", compact ? "ml-[4.5rem]" : "ml-[5.5rem]")}>
        {ticks(total).map((t) => (
          <span key={t} className="absolute -translate-x-1/2" style={{ left: pct(t) }}>
            {fmt(t)}
          </span>
        ))}
      </div>
    </section>
  );
}
