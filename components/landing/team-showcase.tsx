"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import { RunTimeline } from "@/components/team/run-timeline";
import type { PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import type { LaneStatus, TeamRun } from "@/lib/team/store";
import { LEAD } from "@/lib/team/types";

/** A scripted team run on a loop, in ms from its start. Same shape as a real run, so the real timeline draws it. */
const JOB = "Plan, build and announce the AXIOM Floor launch — then publish the note.";
const LANES: { bot: PersonaId; task: string; handoff: number; first: number; end: number; chars: number }[] = [
  { bot: "researcher", task: "Find the crux: who the launch is for and what would change the plan.", handoff: 3200, first: 5600, end: 11800, chars: 1840 },
  { bot: "coder", task: "Smallest complete build path, with the core code and one test.", handoff: 3600, first: 7400, end: 15400, chars: 2610 },
  { bot: "writer", task: "One tight launch note a busy reader finishes.", handoff: 4000, first: 6400, end: 13200, chars: 1220 },
];
const PLAN_END = 2900;
const SYNTH_START = 16000;
const SYNTH_END = 21500;
const APPROVAL = 21800;
const LOOP = 28000;

function runAt(t: number, base: number): TeamRun {
  const at = (ms: number) => base + ms;
  const lanes = LANES.filter((l) => t >= l.handoff).map((l) => {
    const status: LaneStatus = t >= l.end ? "done" : "working";
    return {
      bot: l.bot,
      task: l.task,
      text: "",
      status,
      handoffAt: at(l.handoff),
      startedAt: at(l.handoff + 150),
      firstTokenAt: t >= l.first ? at(l.first) : undefined,
      ms: status === "done" ? l.end - l.handoff - 150 : undefined,
      chars: status === "done" ? l.chars : Math.max(0, Math.round(((t - l.first) / (l.end - l.first)) * l.chars)),
    };
  });
  const done = t >= SYNTH_END;
  return {
    id: "showcase",
    job: JOB,
    bots: LANES.map((l) => l.bot),
    createdAt: base,
    endedAt: t >= APPROVAL ? at(APPROVAL) : undefined,
    status: t < PLAN_END ? "planning" : t < SYNTH_START ? "working" : done ? "done" : "synthesizing",
    demo: true,
    plan: t >= PLAN_END ? LANES.map((l) => ({ bot: l.bot, task: l.task })) : null,
    planAt: t >= PLAN_END ? at(PLAN_END) : undefined,
    handoffs: [],
    lanes,
    wait: t >= 4200 && t < SYNTH_START ? { reason: "", pending: 3, at: at(4200) } : null,
    final: t >= SYNTH_START ? { status: done ? "done" : "working", text: "", startedAt: at(SYNTH_START), ms: done ? SYNTH_END - SYNTH_START : undefined } : { status: "idle", text: "" },
    approval: t >= APPROVAL ? { action: "Publish the launch note to the blog", decision: "pending", at: at(APPROVAL) } : null,
  };
}

export function TeamShowcase() {
  const base = useRef(0);
  const [t, setT] = useState(0);
  // Time-driven: render only in the browser so the static HTML never disagrees with the first frame.
  const [mounted, setMounted] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const visible = useRef(true);

  useEffect(() => {
    base.current = Date.now();
    setMounted(true);
    const io = new IntersectionObserver(([e]) => {
      visible.current = Boolean(e?.isIntersecting);
    });
    if (box.current) io.observe(box.current);
    const tick = window.setInterval(() => {
      if (!visible.current) return;
      let el = Date.now() - base.current;
      if (el > LOOP) {
        base.current = Date.now();
        el = 0;
      }
      setT(el);
    }, 200);
    return () => {
      window.clearInterval(tick);
      io.disconnect();
    };
  }, []);

  if (!mounted) return <div ref={box} className="min-h-[430px] rounded-2xl border border-line bg-bg/40" />;
  const run = runAt(t, base.current);
  const leadLine =
    t < PLAN_END
      ? "planning the job"
      : t < 4200
        ? "handing off the parts"
        : t < SYNTH_START
          ? "coffee — waiting on teammates"
          : t < SYNTH_END
            ? "merging the lanes"
            : "needs your approval";

  return (
    <div ref={box} className="grid gap-4 lg:grid-cols-[1fr_1.25fr]">
      <div className="min-w-0 space-y-2 rounded-2xl border border-line bg-bg/60 p-4">
        <p className="rounded-xl rounded-tr-sm border border-line bg-elevated px-3 py-2 text-[13px] leading-relaxed">{JOB}</p>
        <Row id={LEAD} live={t < 4200 || (t >= SYNTH_START && t < SYNTH_END)} label="lead" line={leadLine} tone={t >= APPROVAL ? "warn" : undefined} />
        {LANES.map((l) => {
          const state = t < l.handoff ? "queued" : t >= l.end ? "done" : t >= l.first ? "writing" : "thinking";
          return <Row key={l.bot} id={l.bot} live={state === "writing" || state === "thinking"} label={state} line={l.task} dim={state === "queued"} />;
        })}
        <div
          className={cn(
            "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[12.5px] transition-opacity duration-500",
            t >= APPROVAL ? "border-warn/50 bg-warn/10 opacity-100" : "border-line opacity-30",
          )}
        >
          <ShieldAlert className="size-4 shrink-0 text-warn" />
          <span className="min-w-0 flex-1">
            <span className="text-warn">Atlas asks first:</span> publish the launch note to the blog
          </span>
          <span className="rounded-md bg-accent px-2 py-1 text-[11px] font-medium text-accent-fg">Approve</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <RunTimeline run={run} idUi={false} />
        <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-line bg-line text-center">
          {[
            ["Plan", "Atlas splits the job into one part per teammate."],
            ["Parallel", "Each bot works on its own kernel and memory."],
            ["Merge + approve", "Atlas merges; risky actions wait for you."],
          ].map(([k, v]) => (
            <div key={k} className="bg-bg px-3 py-3">
              <p className="font-mono text-[10px] tracking-[0.14em] text-signal uppercase">{k}</p>
              <p className="mt-1 text-[12px] leading-snug text-muted">{v}</p>
            </div>
          ))}
        </div>
        <p className="flex items-center gap-2 font-mono text-[10.5px] text-subtle">
          <Lamp live className="size-1.5" /> scripted loop · in the station every bar is a real engine call
          <ArrowRight className="size-3" />
        </p>
      </div>
    </div>
  );
}

function Row({ id, live, label, line, dim, tone }: { id: PersonaId; live: boolean; label: string; line: string; dim?: boolean; tone?: "warn" }) {
  const p = PERSONA_BY_ID[id];
  return (
    <div className={cn("flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 transition-opacity duration-500", dim && "opacity-40")}>
      <BotAvatar id={id} size={26} live={live} />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-2 text-[12.5px]">
          {p.bot}
          <span className="font-mono text-[9.5px] text-subtle uppercase">{p.name}</span>
          <span className={cn("ml-auto font-mono text-[9.5px] uppercase", tone === "warn" ? "text-warn" : live ? "text-signal" : "text-subtle")}>{label}</span>
        </p>
        <p className="truncate text-[11.5px] text-muted">{line}</p>
      </div>
    </div>
  );
}
