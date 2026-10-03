"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ArrowUp, PanelRightOpen, Play, ShieldAlert, Square, User, Users } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import type { EngineSummary } from "@/components/engine-dialog";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { abortSend, sendJob, useSender } from "@/lib/chat-sender";
import { cn } from "@/lib/cn";
import { floorLog, floorStats, onFloorLog, type LogEntry } from "@/lib/floor-bus";
import { useStation } from "@/lib/store";
import { abortTeam, decideApproval, runTeam } from "@/lib/team/client";
import { useTeam } from "@/lib/team/store";
import { LEAD } from "@/lib/team/types";
import { FloorDrawer, type DrawerTab, type FloorMode } from "./floor-drawer";
import { OfficeFloor } from "./office-floor";
import { PHASE_META, fmtElapsed, isBusy } from "./phase";
import type { AgentSnapshot, FloorSnapshot } from "./world";

function useFloorLog(): readonly LogEntry[] {
  const [, force] = useState(0);
  useEffect(() => onFloorLog(() => force((n) => n + 1)), []);
  return floorLog();
}

const EMPTY: FloorSnapshot = { agents: [], counts: { desk: 0, walking: 0, meeting: 0, coffee: 0, other: 0 } };

const SHOWCASE = {
  solo: ["/research What makes a multi-agent team fast without losing quality?", "/research Apa yang membuat tim multi-agen cepat tanpa kehilangan kualitas?"],
  team: ["Draft a launch note for AXIOM Floor and publish it to the blog.", "Susun catatan peluncuran AXIOM Floor lalu publikasikan ke blog."],
};

export function FloorPanel({ summary }: { summary: EngineSummary }) {
  const [snap, setSnap] = useState<FloorSnapshot>(EMPTY);
  const [draft, setDraft] = useState("");
  const [mode, setMode] = useState<FloorMode>("solo");
  const [drawer, setDrawer] = useState<DrawerTab | null>(null);
  const [focusBot, setFocusBot] = useState<PersonaId>("operator");
  const [pinned, setPinned] = useState<PersonaId | null>(null);
  const [touring, setTouring] = useState(false);
  const tourStop = useRef(false);
  const log = useFloorLog();
  const { busy } = useSender();
  const running = useTeam((s) => s.running);
  const current = useTeam((s) => s.current);
  const roster = useTeam((s) => s.roster);
  const toggleBot = useTeam((s) => s.toggleBot);
  const setRoster = useTeam((s) => s.setRoster);
  const language = useStation((s) => s.language);
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const setPersona = useStation((s) => s.setPersona);
  const setEngineOpen = useStation((s) => s.setEngineOpen);
  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const persona = PERSONA_BY_ID[session?.persona ?? "operator"];
  const idUi = language !== "en";
  const clock = useSyncExternalStore(
    (fn) => {
      const t = window.setInterval(fn, 1000);
      return () => window.clearInterval(t);
    },
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );

  const agents: AgentSnapshot[] = snap.agents.length
    ? snap.agents
    : PERSONAS.map((p) => ({ id: p.id, bot: p.bot, role: p.name, color: p.color, status: "…", phase: "idle", where: "desk", progress: 0, since: 0 }));
  const working = agents.filter((a) => isBusy(a.phase));
  const pending = current?.approval?.decision === "pending" ? current : null;
  const modeBusy = mode === "team" ? running : busy;
  const teammates = roster.filter((b) => b !== LEAD);
  const canSend = Boolean(draft.trim()) && !modeBusy && (mode === "solo" || teammates.length > 0);

  const openBot = (id: PersonaId) => {
    setFocusBot(id);
    setDrawer("bot");
  };

  const submit = () => {
    if (!canSend) return;
    const text = draft;
    setDraft("");
    setDrawer("live");
    if (mode === "team") void runTeam(text, teammates);
    else void sendJob(text);
  };

  const stop = () => {
    tourStop.current = true;
    if (mode === "team") abortTeam();
    else abortSend();
  };

  const showcase = async () => {
    if (busy || running) return;
    tourStop.current = false;
    setTouring(true);
    setDrawer("live");
    try {
      // 1 · solo: Iris thinks in the meeting room, waits on coffee, then writes at her desk.
      setMode("solo");
      setPersona("researcher");
      setPinned(null);
      await sendJob(SHOWCASE.solo[idUi ? 1 : 0]!);
      if (tourStop.current) return;
      // 2 · team: Atlas plans, hands off, three bots work in parallel, then asks to publish.
      const crew: PersonaId[] = ["researcher", "coder", "writer"];
      setRoster(crew);
      setMode("team");
      await runTeam(SHOWCASE.team[idUi ? 1 : 0]!, crew);
    } finally {
      setTouring(false);
    }
  };

  const counts = snap.counts;
  const tiles = [
    { k: idUi ? "di meja" : "at desks", v: counts.desk },
    { k: idUi ? "rapat" : "meeting", v: counts.meeting },
    { k: idUi ? "kantin" : "canteen", v: counts.coffee },
    { k: idUi ? "jalan" : "walking", v: counts.walking },
    { k: idUi ? "lainnya" : "elsewhere", v: counts.other },
    { k: idUi ? "job" : "jobs", v: floorStats.jobs },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="order-2 max-h-[42vh] shrink-0 overflow-y-auto border-t border-line bg-surface/40 lg:order-1 lg:max-h-none lg:w-[19rem] lg:border-t-0 lg:border-r">
        <section className="border-b border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">Engine</p>
            <button type="button" onClick={() => setEngineOpen(true)} className="font-mono text-[10px] text-muted hover:text-fg">
              {idUi ? "ganti" : "change"}
            </button>
          </div>
          <button type="button" onClick={() => setEngineOpen(true)} className="mt-2 flex w-full items-center gap-2.5 text-left">
            <Lamp tone={summary.live ? "signal" : "warn"} live={busy || running} />
            <span className="min-w-0">
              <span className="block truncate font-mono text-[12px] text-fg">{summary.label}</span>
              <span className="block truncate font-mono text-[10px] text-subtle">
                {summary.detail}
                {floorStats.lastMs ? ` · last ${(floorStats.lastMs / 1000).toFixed(1)}s` : ""}
              </span>
            </span>
          </button>
        </section>

        <section className="border-b border-line px-3 py-3">
          <div className="flex items-baseline justify-between px-1">
            <p className="eyebrow">{idUi ? "Kru" : "Crew"}</p>
            <p className={cn("font-mono text-[10px] tabular-nums", working.length ? "text-signal" : "text-subtle")}>
              {working.length ? `${working.length} ${idUi ? "bekerja" : "working"}` : idUi ? "semua santai" : "all idle"}
            </p>
          </div>
          <ul className="mt-2 space-y-0.5">
            {agents.map((a) => {
              const m = PHASE_META[a.phase];
              const sel = drawer === "bot" && focusBot === a.id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => openBot(a.id)}
                    className={cn("w-full rounded-lg px-2 py-2 text-left transition-colors", sel ? "bg-elevated" : "hover:bg-elevated/50")}
                    title={idUi ? "Buka profil" : "Open profile"}
                  >
                    <div className="flex items-center gap-2.5">
                      <BotAvatar id={a.id} size={26} live={isBusy(a.phase)} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[12.5px] font-medium text-fg">{a.bot}</span>
                          <span className="truncate font-mono text-[9.5px] text-subtle">{idUi ? PERSONA_BY_ID[a.id].nameId : PERSONA_BY_ID[a.id].name}</span>
                          {persona.id === a.id && mode === "solo" ? <span className="ml-auto shrink-0 font-mono text-[9px] text-signal uppercase">{idUi ? "job berikut" : "next job"}</span> : null}
                          {mode === "team" && (a.id === LEAD || roster.includes(a.id)) ? <span className="ml-auto shrink-0 font-mono text-[9px] text-signal uppercase">{a.id === LEAD ? "lead" : idUi ? "tim" : "team"}</span> : null}
                        </div>
                        <p className="truncate text-[11px] text-muted">{a.status}</p>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 pl-[36px]">
                      <span className={cn("shrink-0 rounded-full border px-1.5 py-px font-mono text-[9px] uppercase", m.chip)}>{idUi ? m.labelId : m.label}</span>
                      <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
                        <div className={cn("h-full rounded-full transition-[width] duration-500", m.bg)} style={{ width: `${Math.max(a.progress ? 4 : 0, a.progress * 100)}%` }} />
                      </div>
                      <span className="w-12 shrink-0 text-right font-mono text-[9.5px] text-subtle tabular-nums">{a.since ? fmtElapsed(a.since) : ""}</span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="border-b border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">{idUi ? "Di mana semua orang" : "Where everyone is"}</p>
            <p className="font-mono text-[10px] text-subtle tabular-nums">{clock ? new Date(clock * 1000).toLocaleTimeString() : ""}</p>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
            {tiles.map((t) => (
              <div key={t.k} className="bg-bg px-2.5 py-2">
                <p className="font-mono text-lg leading-none text-fg tabular-nums">{t.v}</p>
                <p className="mt-1 font-mono text-[9px] tracking-wider text-subtle uppercase">{t.k}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 font-mono text-[10px] text-subtle tabular-nums">
            {floorStats.chars.toLocaleString()} {idUi ? "karakter dikirim" : "chars shipped"}
            {floorStats.lastModel ? ` · ${floorStats.lastModel}` : ""}
          </p>
        </section>

        <section className="px-4 py-3">
          <p className="eyebrow">Ship-log</p>
          <ul className="mt-2 space-y-1 font-mono text-[10.5px] leading-snug">
            {log.length === 0 ? <li className="text-subtle">{idUi ? "Belum ada aktivitas. Beri lantai sebuah job." : "Quiet. Give the floor a job."}</li> : null}
            {log.slice(0, 40).map((e) => (
              <li key={e.id} className="flex animate-fade gap-2">
                <span className="shrink-0 text-subtle tabular-nums">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className={cn("shrink-0", e.tone === "signal" ? "text-signal" : e.tone === "warn" ? "text-warn" : e.tone === "danger" ? "text-danger" : "text-accent")}>{e.tag}</span>
                <span className="min-w-0 text-muted">{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
        {pending?.approval ? (
          <div className="flex animate-fade flex-wrap items-center gap-x-3 gap-y-2 border-b border-warn/40 bg-warn/10 px-4 py-2.5">
            <ShieldAlert className="size-4 shrink-0 text-warn" />
            <p className="min-w-0 flex-1 text-[13px]">
              <span className="font-medium text-warn">{idUi ? `${PERSONA_BY_ID[LEAD].bot} butuh persetujuan:` : `${PERSONA_BY_ID[LEAD].bot} needs your approval:`}</span> <span className="text-fg">{pending.approval.action}</span>
            </p>
            <div className="flex shrink-0 gap-1.5">
              <button type="button" onClick={() => decideApproval(pending.id, true)} className="h-8 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg">
                {idUi ? "Setujui" : "Approve"}
              </button>
              <button type="button" onClick={() => decideApproval(pending.id, false)} className="h-8 rounded-lg border border-line-strong px-3 text-xs hover:bg-elevated">
                {idUi ? "Tolak" : "Reject"}
              </button>
              <button type="button" onClick={() => setDrawer("live")} className="h-8 rounded-lg px-2 text-xs text-muted hover:text-fg">
                {idUi ? "Tinjau" : "Review"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1">
          <div className="relative min-h-[300px] min-w-0 flex-1">
            <OfficeFloor
              className="absolute inset-0 bg-bg"
              roomNav
              onSnapshot={setSnap}
              onPick={openBot}
              pickHint={idUi ? "klik untuk profil" : "click for profile"}
              selected={drawer === "bot" ? focusBot : null}
              pinned={pinned}
              onPinChange={setPinned}
              lang={idUi ? "id" : "en"}
            />
            <div className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface/80 p-1 backdrop-blur">
              <button
                type="button"
                onClick={() => void showcase()}
                disabled={busy || running}
                className={cn("flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[10px] uppercase", touring ? "bg-signal/15 text-signal" : "text-fg hover:bg-elevated disabled:opacity-40")}
                title={idUi ? "Tur: job solo lalu run tim dengan persetujuan" : "Tour: a solo job, then a team run with an approval"}
              >
                <Play className="size-3 fill-current" />
                {touring ? (idUi ? "tur berjalan" : "touring") : idUi ? "tur demo" : "showcase"}
              </button>
              {drawer === null ? (
                <button type="button" onClick={() => setDrawer("live")} className="flex h-7 items-center gap-1.5 rounded-lg px-2.5 font-mono text-[10px] text-muted uppercase hover:bg-elevated hover:text-fg">
                  <PanelRightOpen className="size-3.5" /> {idUi ? "langsung" : "live"}
                </button>
              ) : null}
            </div>
          </div>
          {drawer ? (
            <FloorDrawer
              tab={drawer}
              onTab={setDrawer}
              bot={focusBot}
              agent={agents.find((a) => a.id === focusBot)}
              mode={mode}
              pinned={pinned}
              onPin={setPinned}
              onAssign={(id) => {
                setPersona(id);
                setMode("solo");
              }}
              onClose={() => setDrawer(null)}
              idUi={idUi}
            />
          ) : null}
        </div>

        <div className="border-t border-line bg-surface/50 px-3 py-2.5 md:px-5">
          <div className="mb-2 flex min-w-0 items-center gap-2">
            <div className="flex shrink-0 rounded-lg bg-inset p-0.5">
              {(["solo", "team"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn("flex h-7 items-center gap-1.5 rounded-md px-2.5 font-mono text-[10px] tracking-wider uppercase", mode === m ? "bg-elevated text-fg" : "text-subtle hover:text-fg")}
                >
                  {m === "solo" ? <User className="size-3" /> : <Users className="size-3" />}
                  {m === "solo" ? "solo" : idUi ? "tim" : "team"}
                </button>
              ))}
            </div>
            <div className="flex min-w-0 items-center gap-1 overflow-x-auto py-0.5">
              {PERSONAS.map((p) => {
                const on = mode === "solo" ? persona.id === p.id : p.id === LEAD || roster.includes(p.id);
                const lead = mode === "team" && p.id === LEAD;
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={lead}
                    onClick={() => (mode === "solo" ? setPersona(p.id) : toggleBot(p.id))}
                    title={lead ? (idUi ? "Atlas memimpin setiap run tim" : "Atlas leads every team run") : mode === "solo" ? `${p.bot} · ${p.name}` : `${on ? (idUi ? "Keluarkan" : "Remove") : idUi ? "Tambahkan" : "Add"} ${p.bot}`}
                    className={cn(
                      "flex h-7 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-0.5 text-[11.5px] transition-colors",
                      on ? "border-line-strong bg-elevated text-fg" : "border-transparent text-subtle opacity-60 hover:opacity-100",
                    )}
                  >
                    <BotAvatar id={p.id} size={22} />
                    {p.bot}
                    {lead ? <span className="font-mono text-[8.5px] text-signal uppercase">lead</span> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <form
            className="flex items-center gap-2 rounded-xl border border-line bg-bg p-1.5 focus-within:border-line-strong"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                mode === "team"
                  ? teammates.length
                    ? idUi
                      ? `Job untuk tim — Atlas merencanakan, ${teammates.map((b) => PERSONA_BY_ID[b].bot).join(", ")} bekerja paralel…`
                      : `A job for the team — Atlas plans, ${teammates.map((b) => PERSONA_BY_ID[b].bot).join(", ")} work in parallel…`
                    : idUi
                      ? "Pilih minimal satu rekan di atas"
                      : "Pick at least one teammate above"
                  : idUi
                    ? `Beri ${persona.bot} sebuah job… coba /research atau /plan`
                    : `Give ${persona.bot} a job… try /research or /plan`
              }
              className="h-9 min-w-0 flex-1 bg-transparent px-2 text-sm text-fg outline-none placeholder:text-subtle"
            />
            {modeBusy ? (
              <button type="button" onClick={stop} className="flex size-9 items-center justify-center rounded-lg bg-elevated text-fg" aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!canSend} className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-fg disabled:opacity-30" aria-label={idUi ? "Kirim" : "Send"}>
                <ArrowUp className="size-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
