"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, BookmarkPlus, Check, Coffee, Copy, Crosshair, MessageSquare, Plus, ShieldAlert, UserPlus, Users, X } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import { Markdown } from "@/components/markdown";
import type { PersonaId } from "@/lib/catalog";
import { useSender } from "@/lib/chat-sender";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";
import { decideApproval } from "@/lib/team/client";
import { useTeam, type LaneStatus, type TeamLane, type TeamRun } from "@/lib/team/store";
import { LEAD, MEMORY_MAX_CHARS, MEMORY_MAX_NOTES } from "@/lib/team/types";
import { PHASE_META, fmtElapsed } from "./phase";
import type { AgentSnapshot } from "./world";

export type DrawerTab = "live" | "bot";
export type FloorMode = "solo" | "team";

type Props = {
  tab: DrawerTab;
  onTab: (t: DrawerTab) => void;
  bot: PersonaId;
  agent?: AgentSnapshot;
  mode: FloorMode;
  pinned: PersonaId | null;
  onPin: (id: PersonaId | null) => void;
  onAssign: (id: PersonaId) => void;
  onClose: () => void;
  idUi: boolean;
};

export function FloorDrawer({ tab, onTab, bot, agent, mode, pinned, onPin, onAssign, onClose, idUi }: Props) {
  const p = PERSONA_BY_ID[bot];
  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-full max-w-[25rem] flex-col border-l border-line bg-surface/95 backdrop-blur animate-fade lg:static lg:w-[24rem] lg:max-w-none lg:bg-surface/60">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <TabButton on={tab === "live"} onClick={() => onTab("live")}>
          <Lamp live tone="signal" className="size-1.5" /> Live
        </TabButton>
        <TabButton on={tab === "bot"} onClick={() => onTab("bot")}>
          <span className="size-2 rounded-full" style={{ background: p.color }} /> {p.bot}
        </TabButton>
        <button type="button" onClick={onClose} className="ml-auto flex size-8 items-center justify-center rounded-md text-muted hover:bg-elevated hover:text-fg" aria-label={idUi ? "Tutup" : "Close"}>
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "live" ? <LiveTab mode={mode} idUi={idUi} /> : <BotTab bot={bot} agent={agent} pinned={pinned} onPin={onPin} onAssign={onAssign} idUi={idUi} />}
      </div>
    </aside>
  );
}

function TabButton({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex h-8 items-center gap-2 rounded-lg px-3 font-mono text-[11px] tracking-wider uppercase", on ? "bg-elevated text-fg" : "text-muted hover:text-fg")}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ live */

function LiveTab({ mode, idUi }: { mode: FloorMode; idUi: boolean }) {
  const running = useTeam((s) => s.running);
  const { busy } = useSender();
  // Whatever is actually running wins; otherwise follow the composer.
  const which: FloorMode = running ? "team" : busy ? "solo" : mode;
  return which === "team" ? <TeamLive idUi={idUi} /> : <SoloLive idUi={idUi} />;
}

function useAutoScroll(dep: unknown, active: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!active) return;
    const el = ref.current?.closest(".overflow-y-auto");
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep, active]);
  return ref;
}

function SoloLive({ idUi }: { idUi: boolean }) {
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const setView = useStation((s) => s.setView);
  const addVault = useStation((s) => s.addVault);
  const { busy, phase } = useSender();
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const msgs = session?.messages ?? [];
  let ai = -1;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]?.role === "assistant") {
      ai = i;
      break;
    }
  }
  const answer = ai >= 0 ? msgs[ai] : undefined;
  const ask = ai > 0 ? msgs[ai - 1] : undefined;
  const scroll = useAutoScroll(answer?.content.length, busy);

  if (!answer) {
    return (
      <Empty
        icon={<MessageSquare className="size-5" />}
        title={idUi ? "Belum ada job solo" : "No solo job yet"}
        text={idUi ? "Beri bot sebuah job di bawah, atau tekan ▶ Showcase untuk tur lengkap." : "Give a bot a job below, or press ▶ Showcase for the full tour."}
      />
    );
  }
  const who = PERSONA_BY_ID[answer.meta?.persona ?? session?.persona ?? "operator"];
  const live = busy;

  return (
    <div ref={scroll} className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2.5">
        <BotAvatar id={who.id} size={30} live={live} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {who.bot} <span className="font-normal text-muted">· {idUi ? who.nameId : who.name}</span>
          </p>
          <p className="font-mono text-[10px] text-subtle">
            {live ? (phase === "compile" ? (idUi ? "mengompilasi kernel · berpikir" : "compiling the kernel · thinking") : idUi ? "menulis…" : "writing…") : answer.meta?.error ? (idUi ? "gagal" : "failed") : idUi ? "selesai" : "shipped"}
          </p>
        </div>
        <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase", live ? PHASE_META[phase === "compile" ? "thinking" : "writing"].chip : answer.meta?.error ? PHASE_META.error.chip : PHASE_META.done.chip)}>
          {live ? (phase === "compile" ? (idUi ? "berpikir" : "thinking") : idUi ? "menulis" : "writing") : answer.meta?.error ? "error" : idUi ? "terkirim" : "shipped"}
        </span>
      </div>

      {ask ? <p className="rounded-xl rounded-tr-sm border border-line bg-elevated px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{ask.content}</p> : null}

      <div className="min-w-0 text-[13.5px]">
        {answer.content ? (
          <Markdown text={answer.content} />
        ) : (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Lamp live tone="signal" className="size-1.5" />
            {idUi ? `${who.bot} sedang berpikir di ruang rapat…` : `${who.bot} is thinking in the meeting room…`}
          </p>
        )}
        {live && answer.content ? <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-signal align-middle" /> : null}
      </div>

      {!live ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 font-mono text-[10px] text-subtle">
          {answer.meta?.model ? <span>{answer.meta.model}</span> : null}
          {answer.meta?.kernelChars ? <span>kernel {answer.meta.kernelChars.toLocaleString()}c</span> : null}
          {answer.meta?.ms ? <span>{(answer.meta.ms / 1000).toFixed(1)}s</span> : null}
          <span className="ml-auto flex items-center gap-1">
            <MiniButton
              onClick={() => {
                void navigator.clipboard.writeText(answer.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />} {copied ? (idUi ? "disalin" : "copied") : idUi ? "salin" : "copy"}
            </MiniButton>
            {!answer.meta?.error ? (
              <MiniButton
                onClick={() => {
                  addVault(answer.content.slice(0, 600));
                  setSaved(true);
                }}
              >
                {saved ? <Check className="size-3" /> : <BookmarkPlus className="size-3" />} vault
              </MiniButton>
            ) : null}
            <MiniButton onClick={() => setView("chat")}>
              <MessageSquare className="size-3" /> chat
            </MiniButton>
          </span>
        </div>
      ) : null}
    </div>
  );
}

const RUN_LABEL: Record<TeamRun["status"], [string, string, string]> = {
  planning: ["Planning", "Merencanakan", PHASE_META.thinking.chip],
  working: ["Working", "Bekerja", PHASE_META.writing.chip],
  synthesizing: ["Synthesizing", "Menyatukan", PHASE_META.writing.chip],
  done: ["Shipped", "Terkirim", PHASE_META.done.chip],
  error: ["Error", "Galat", PHASE_META.error.chip],
  stopped: ["Stopped", "Dihentikan", PHASE_META.idle.chip],
};

const LANE_LABEL: Record<LaneStatus, [string, string, string]> = {
  queued: ["queued", "antre", "text-subtle"],
  working: ["working", "bekerja", "text-signal"],
  done: ["done", "selesai", "text-signal"],
  error: ["error", "galat", "text-danger"],
  stopped: ["stopped", "berhenti", "text-subtle"],
};

function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

function TeamLive({ idUi }: { idUi: boolean }) {
  const run = useTeam((s) => s.current ?? s.history[0] ?? null);
  const running = useTeam((s) => s.running);
  const setView = useStation((s) => s.setView);
  const setEngineOpen = useStation((s) => s.setEngineOpen);
  const now = useTicker(running);
  const scroll = useAutoScroll(run?.final.text.length, running && run?.final.status === "working");

  if (!run) {
    return (
      <Empty
        icon={<Users className="size-5" />}
        title={idUi ? "Belum ada run tim" : "No team run yet"}
        text={
          idUi
            ? "Ganti composer ke Tim, pilih rekan, lalu beri Atlas sebuah job. Atlas merencanakan, rekan bekerja paralel, lalu Atlas menyatukan."
            : "Switch the composer to Team, pick teammates, and give Atlas a job. Atlas plans, teammates work in parallel, then Atlas synthesizes."
        }
      />
    );
  }

  const [label, labelId, chip] = RUN_LABEL[run.status];
  const live = running && !["done", "error", "stopped"].includes(run.status);
  const elapsed = (run.endedAt ?? now) - run.createdAt;
  const leadPhase = run.status === "planning" ? (idUi ? "merencanakan job" : "planning the job") : run.status === "synthesizing" ? (idUi ? "menyatukan hasil" : "synthesizing the lanes") : run.wait && live ? (idUi ? "ngopi — menunggu rekan" : "coffee — waiting on teammates") : run.final.status === "done" ? (idUi ? "deliverable terkirim" : "deliverable shipped") : idUi ? "memimpin run" : "leading the run";

  return (
    <div ref={scroll} className="space-y-4 px-4 py-4">
      <div>
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase", chip)}>{idUi ? labelId : label}</span>
          <span className="font-mono text-[10px] text-subtle tabular-nums">{fmtElapsed(elapsed)}</span>
          {run.routineName ? <span className="truncate font-mono text-[10px] text-signal">↻ {run.routineName}</span> : null}
          <button type="button" onClick={() => setView("team")} className="ml-auto flex items-center gap-1 font-mono text-[10px] text-muted hover:text-fg">
            {idUi ? "buka di Tim" : "open in Team"} <ArrowRight className="size-3" />
          </button>
        </div>
        <p className="mt-2 rounded-xl rounded-tr-sm border border-line bg-elevated px-3 py-2 text-[13px] leading-relaxed [overflow-wrap:anywhere]">{run.job}</p>
      </div>

      {run.demo ? (
        <button type="button" onClick={() => setEngineOpen(true)} className="flex w-full items-center gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-left text-[11.5px] text-warn">
          <Lamp tone="warn" className="shrink-0" />
          {idUi ? "Mode demo — sambungkan engine untuk run live." : "Demo mode — connect an engine for live runs."}
        </button>
      ) : null}

      <ul className="space-y-1.5">
        <li className="flex items-center gap-2.5 rounded-lg border border-line bg-bg/40 px-2.5 py-2">
          <BotAvatar id={LEAD} size={24} live={live && (run.status === "planning" || run.status === "synthesizing")} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px]">
              {PERSONA_BY_ID[LEAD].bot} <span className="text-subtle">· lead</span>
            </p>
            <p className="truncate text-[11px] text-muted">{leadPhase}</p>
          </div>
          {run.wait && live ? <Coffee className="size-3.5 text-warn" /> : null}
        </li>
        {run.lanes.length
          ? run.lanes.map((l) => <LaneRow key={l.bot} lane={l} idUi={idUi} now={now} />)
          : (run.plan ?? run.bots.map((b) => ({ bot: b, task: "" }))).map((s) => (
              <li key={s.bot} className="flex items-center gap-2.5 rounded-lg border border-dashed border-line px-2.5 py-2 opacity-70">
                <BotAvatar id={s.bot} size={24} />
                <p className="min-w-0 flex-1 truncate text-[12px] text-muted">{s.task || (idUi ? "menunggu rencana…" : "waiting for the plan…")}</p>
              </li>
            ))}
      </ul>

      {run.final.status !== "idle" ? (
        <section className="rounded-xl border border-line-strong bg-bg/50 px-3.5 py-3">
          <p className="eyebrow mb-2 flex items-center gap-2">
            {idUi ? "Deliverable" : "Deliverable"} · {PERSONA_BY_ID[LEAD].bot}
            {run.final.status === "working" ? <Lamp live className="size-1.5" /> : null}
          </p>
          {run.final.text ? <Markdown text={run.final.text} className="text-[13px]" /> : <p className="text-sm text-muted">{idUi ? "Menyatukan…" : "Synthesizing…"}</p>}
          {run.final.error ? <p className="mt-2 text-xs text-danger">⚠ {run.final.error}</p> : null}
        </section>
      ) : null}

      {run.error && run.final.status !== "error" ? <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger">⚠ {run.error}</p> : null}

      {run.approval ? <ApprovalBox run={run} idUi={idUi} /> : null}
    </div>
  );
}

function LaneRow({ lane, idUi, now }: { lane: TeamLane; idUi: boolean; now: number }) {
  const [open, setOpen] = useState(false);
  const p = PERSONA_BY_ID[lane.bot];
  const [l, lId, tone] = LANE_LABEL[lane.status];
  const working = lane.status === "working";
  const ms = lane.ms ?? (lane.startedAt ? now - lane.startedAt : 0);
  const tail = lane.text.replace(/\s+/g, " ").slice(-140);
  return (
    <li className={cn("rounded-lg border bg-bg/40", working ? "border-signal/30" : "border-line")}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-2.5 px-2.5 py-2 text-left">
        <BotAvatar id={lane.bot} size={24} live={working} className="mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline gap-2 text-[12.5px]">
            {p.bot}
            <span className={cn("font-mono text-[9.5px] uppercase", tone)}>{idUi ? lId : l}</span>
            <span className="ml-auto font-mono text-[10px] text-subtle tabular-nums">
              {ms ? fmtElapsed(ms) : ""}
              {lane.chars ? ` · ${lane.chars.toLocaleString()}c` : ""}
            </span>
          </p>
          <p className="line-clamp-2 text-[11px] text-muted">{lane.task}</p>
          {working && tail && !open ? <p className="mt-1 truncate font-mono text-[10.5px] text-fg/70">…{tail}</p> : null}
          {lane.error ? <p className="mt-1 text-[11px] text-danger">⚠ {lane.error}</p> : null}
        </div>
      </button>
      {open && lane.text ? (
        <div className="border-t border-line px-3 py-2.5">
          <Markdown text={lane.text} className="text-[12.5px]" />
        </div>
      ) : null}
    </li>
  );
}

export function ApprovalBox({ run, idUi, compact = false }: { run: TeamRun; idUi: boolean; compact?: boolean }) {
  const a = run.approval;
  if (!a) return null;
  const pending = a.decision === "pending";
  return (
    <section className={cn("rounded-xl border px-3.5 py-3", pending ? "border-warn/50 bg-warn/10" : a.decision === "approved" ? "border-signal/30 bg-signal/5" : "border-danger/30 bg-danger/5")}>
      <p className={cn("flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] uppercase", pending ? "text-warn" : a.decision === "approved" ? "text-signal" : "text-danger")}>
        <ShieldAlert className="size-3.5" />
        {pending ? (idUi ? `${PERSONA_BY_ID[LEAD].bot} butuh persetujuan Anda` : `${PERSONA_BY_ID[LEAD].bot} needs your approval`) : a.decision === "approved" ? (idUi ? "disetujui" : "approved") : idUi ? "ditolak" : "rejected"}
      </p>
      <p className={cn("mt-1.5 text-fg", compact ? "text-[13px]" : "text-sm")}>{a.action}</p>
      {pending ? (
        <div className="mt-2.5 flex gap-2">
          <button type="button" onClick={() => decideApproval(run.id, true)} className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg">
            {idUi ? "Setujui" : "Approve"}
          </button>
          <button type="button" onClick={() => decideApproval(run.id, false)} className="h-8 rounded-lg border border-line-strong px-3 text-xs text-fg hover:bg-elevated">
            {idUi ? "Tolak" : "Reject"}
          </button>
        </div>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-subtle">{idUi ? "Tidak ada yang dieksekusi otomatis — keputusan dicatat." : "Nothing runs automatically — the decision is recorded."}</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------- bot */

function ago(t: number, idUi: boolean) {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return idUi ? "baru saja" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

type Work = { key: string; t: number; text: string; kind: "solo" | "team"; where: string };

function BotTab({ bot, agent, pinned, onPin, onAssign, idUi }: { bot: PersonaId; agent?: AgentSnapshot; pinned: PersonaId | null; onPin: (id: PersonaId | null) => void; onAssign: (id: PersonaId) => void; idUi: boolean }) {
  const p = PERSONA_BY_ID[bot];
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const setView = useStation((s) => s.setView);
  const setPersona = useStation((s) => s.setPersona);
  const memory = useTeam((s) => s.memory[bot]);
  const roster = useTeam((s) => s.roster);
  const toggleBot = useTeam((s) => s.toggleBot);
  const addMemory = useTeam((s) => s.addMemory);
  const removeMemory = useTeam((s) => s.removeMemory);
  const current = useTeam((s) => s.current);
  const history = useTeam((s) => s.history);
  const [note, setNote] = useState("");
  const [openWork, setOpenWork] = useState<string | null>(null);
  const active = (sessions.find((s) => s.id === activeSessionId) ?? sessions[0])?.persona;
  const notes = memory ?? [];
  const phase = agent?.phase ?? "idle";
  const meta = PHASE_META[phase];

  const work = useMemo(() => {
    const out: Work[] = [];
    for (const s of sessions) {
      for (const m of s.messages) {
        if (m.role !== "assistant" || !m.content || m.meta?.error) continue;
        if ((m.meta?.persona ?? s.persona) !== bot) continue;
        out.push({ key: m.id, t: m.createdAt, text: m.content, kind: "solo", where: s.title });
      }
    }
    const runs = [current, ...history].filter((r, i, all): r is TeamRun => Boolean(r) && all.findIndex((x) => x?.id === r?.id) === i);
    for (const r of runs) {
      if (bot === LEAD) {
        if (r.final.text && r.final.status === "done") out.push({ key: `${r.id}-final`, t: r.endedAt ?? r.createdAt, text: r.final.text, kind: "team", where: r.job });
      } else {
        for (const l of r.lanes) if (l.bot === bot && l.text && l.status === "done") out.push({ key: `${r.id}-${l.bot}`, t: l.startedAt ?? r.createdAt, text: l.text, kind: "team", where: r.job });
      }
    }
    return out.sort((a, b) => b.t - a.t).slice(0, 5);
  }, [sessions, current, history, bot]);

  const following = pinned === bot;
  const onTeam = bot === LEAD || roster.includes(bot);

  return (
    <div className="space-y-5 px-4 py-4">
      <div className="flex items-start gap-3.5">
        <BotAvatar id={bot} size={52} live={phase !== "idle" && phase !== "done"} />
        <div className="min-w-0 flex-1">
          <p className="font-display text-2xl leading-none font-semibold">{p.bot}</p>
          <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
            {idUi ? p.nameId : p.name}
            {bot === LEAD ? " · lead" : ""}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{p.blurb}</p>
        </div>
      </div>

      <div className="rounded-xl border border-line bg-bg/40 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase", meta.chip)}>{idUi ? meta.labelId : meta.label}</span>
          {agent && agent.since > 0 ? <span className="font-mono text-[10px] text-subtle tabular-nums">{fmtElapsed(agent.since)}</span> : null}
          <span className="ml-auto font-mono text-[10px] text-subtle">{agent?.where ?? ""}</span>
        </div>
        <p className="mt-1.5 text-[12.5px] text-fg/90">{agent?.status ?? "…"}</p>
        {agent && agent.progress > 0 ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
            <div className={cn("h-full rounded-full transition-[width] duration-500", meta.bg)} style={{ width: `${Math.max(4, agent.progress * 100)}%` }} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <ActionButton primary={active !== bot} onClick={() => onAssign(bot)}>
          {active === bot ? <Check className="size-3.5" /> : <ArrowRight className="size-3.5" />}
          {active === bot ? (idUi ? "Job berikutnya" : "Takes next job") : idUi ? "Tugaskan" : "Assign next job"}
        </ActionButton>
        <ActionButton on={following} onClick={() => onPin(following ? null : bot)}>
          <Crosshair className="size-3.5" />
          {following ? (idUi ? "Diikuti" : "Following") : idUi ? "Ikuti kamera" : "Follow"}
        </ActionButton>
        <ActionButton
          onClick={() => {
            setPersona(bot);
            setView("chat");
          }}
        >
          <MessageSquare className="size-3.5" />
          {idUi ? "Chat" : "Chat"}
        </ActionButton>
        <ActionButton on={onTeam} disabled={bot === LEAD} onClick={() => toggleBot(bot)}>
          {onTeam ? <Users className="size-3.5" /> : <UserPlus className="size-3.5" />}
          {bot === LEAD ? (idUi ? "Memimpin tim" : "Leads teams") : onTeam ? (idUi ? "Di tim" : "On team") : idUi ? "Tambah ke tim" : "Add to team"}
        </ActionButton>
      </div>

      <section>
        <p className="eyebrow">{idUi ? "Modul keahlian" : "Skill modules"}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {p.modules.map((m) => (
            <span key={m} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted">
              {m}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <p className="eyebrow">{idUi ? "Memori" : "Memory"}</p>
          <span className="font-mono text-[10px] text-subtle">
            {notes.length}/{MEMORY_MAX_NOTES}
          </span>
        </div>
        <ul className="mt-2 space-y-1">
          {notes.length === 0 ? <li className="text-[12px] text-subtle">{idUi ? `${p.bot} belum mengingat apa pun. Catatan dibawa ke setiap run tim.` : `${p.bot} remembers nothing yet. Notes ride along on every team run.`}</li> : null}
          {notes.map((n, i) => (
            <li key={`${i}-${n}`} className="group flex items-start gap-2 rounded-md bg-elevated/50 px-2 py-1.5 text-[12px]">
              <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{n}</span>
              <button type="button" onClick={() => removeMemory(bot, i)} className="shrink-0 text-subtle opacity-0 group-hover:opacity-100 hover:text-danger" aria-label={idUi ? "Hapus" : "Remove"}>
                <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
        {notes.length < MEMORY_MAX_NOTES ? (
          <form
            className="mt-2 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!note.trim()) return;
              addMemory(bot, note);
              setNote("");
            }}
          >
            <input
              value={note}
              maxLength={MEMORY_MAX_CHARS}
              onChange={(e) => setNote(e.target.value)}
              placeholder={idUi ? `Ajari ${p.bot} sesuatu…` : `Teach ${p.bot} something…`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-inset px-2.5 text-[12px] outline-none placeholder:text-subtle focus:border-line-strong"
            />
            <button type="submit" disabled={!note.trim()} className="flex size-8 items-center justify-center rounded-lg bg-elevated text-fg disabled:opacity-30" aria-label={idUi ? "Tambah" : "Add"}>
              <Plus className="size-3.5" />
            </button>
          </form>
        ) : null}
      </section>

      <section>
        <p className="eyebrow">{idUi ? "Kerja terbaru" : "Recent work"}</p>
        <ul className="mt-2 space-y-1.5">
          {work.length === 0 ? <li className="text-[12px] text-subtle">{idUi ? "Belum ada output." : "Nothing shipped yet."}</li> : null}
          {work.map((w) => (
            <li key={w.key} className="rounded-lg border border-line bg-bg/40">
              <button type="button" onClick={() => setOpenWork(openWork === w.key ? null : w.key)} className="w-full px-2.5 py-2 text-left">
                <p className="flex items-center gap-2 font-mono text-[9.5px] text-subtle uppercase">
                  <span className={w.kind === "team" ? "text-signal" : "text-accent"}>{w.kind}</span>
                  <span className="min-w-0 flex-1 truncate normal-case">{w.where}</span>
                  <span>{ago(w.t, idUi)}</span>
                </p>
                {openWork !== w.key ? <p className="mt-1 line-clamp-2 text-[12px] text-muted">{w.text.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").slice(0, 220)}</p> : null}
              </button>
              {openWork === w.key ? (
                <div className="border-t border-line px-3 py-2.5">
                  <Markdown text={w.text} className="text-[12.5px]" />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ActionButton({ children, onClick, primary, on, disabled }: { children: React.ReactNode; onClick: () => void; primary?: boolean; on?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-[12px] transition-colors disabled:cursor-default",
        primary ? "bg-accent font-medium text-accent-fg hover:opacity-90" : on ? "border border-signal/40 bg-signal/10 text-signal" : "border border-line text-fg hover:bg-elevated",
        disabled && !on && "opacity-50",
      )}
    >
      {children}
    </button>
  );
}

function MiniButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-muted hover:bg-elevated hover:text-fg">
      {children}
    </button>
  );
}

function Empty({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex flex-col items-center px-8 py-14 text-center">
      <span className="flex size-11 items-center justify-center rounded-xl border border-line text-muted">{icon}</span>
      <p className="mt-4 font-display text-lg font-semibold">{title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}
