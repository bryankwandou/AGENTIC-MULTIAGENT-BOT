"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUp, MessageSquare, Square } from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import type { EngineSummary } from "@/components/engine-dialog";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { abortSend, sendJob, useSender } from "@/lib/chat-sender";
import { cn } from "@/lib/cn";
import { floorLog, floorStats, onFloorLog, type LogEntry } from "@/lib/floor-bus";
import { useStation } from "@/lib/store";
import { OfficeFloor } from "./office-floor";
import type { FloorSnapshot } from "./world";

const PHASE_COLOR: Record<string, string> = {
  writing: "bg-signal",
  thinking: "bg-accent",
  waiting: "bg-warn",
  done: "bg-signal",
  error: "bg-danger",
  approval: "bg-warn",
  idle: "bg-line-strong",
};

function useFloorLog(): readonly LogEntry[] {
  const [, force] = useState(0);
  useEffect(() => onFloorLog(() => force((n) => n + 1)), []);
  return floorLog();
}

const EMPTY: FloorSnapshot = { agents: [], counts: { desk: 0, walking: 0, meeting: 0, coffee: 0, other: 0 } };

export function FloorPanel({ summary }: { summary: EngineSummary }) {
  const [snap, setSnap] = useState<FloorSnapshot>(EMPTY);
  const [draft, setDraft] = useState("");
  const log = useFloorLog();
  const { busy } = useSender();
  const language = useStation((s) => s.language);
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const setPersona = useStation((s) => s.setPersona);
  const setView = useStation((s) => s.setView);
  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const persona = PERSONAS.find((p) => p.id === session?.persona) ?? PERSONAS[0]!;
  const last = [...(session?.messages ?? [])].reverse().find((m) => m.role === "assistant");
  const idUi = language !== "en";
  const clock = useSyncExternalStore(
    (fn) => {
      const t = window.setInterval(fn, 1000);
      return () => window.clearInterval(t);
    },
    () => Math.floor(Date.now() / 1000),
    () => 0,
  );

  const counts = snap.counts;
  const tiles = [
    { k: idUi ? "bot di lantai" : "bots on floor", v: String(snap.agents.length || 6) },
    { k: idUi ? "di meja" : "at desks", v: String(counts.desk) },
    { k: idUi ? "rapat" : "meeting", v: String(counts.meeting) },
    { k: idUi ? "ngopi" : "coffee", v: String(counts.coffee) },
    { k: idUi ? "jalan" : "walking", v: String(counts.walking) },
    { k: "jobs", v: String(floorStats.jobs) },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="order-2 max-h-[46vh] shrink-0 overflow-y-auto border-t border-line bg-surface/40 lg:order-1 lg:max-h-none lg:w-[19rem] lg:border-t-0 lg:border-r">
        <section className="border-b border-line px-4 py-3">
          <p className="eyebrow">Engine</p>
          <div className="mt-2 flex items-center gap-2.5">
            <Lamp tone={summary.live ? "signal" : "warn"} live={busy} />
            <div className="min-w-0">
              <p className="truncate font-mono text-[12px] text-fg">{summary.label}</p>
              <p className="truncate font-mono text-[10px] text-subtle">
                {summary.detail}
                {floorStats.lastMs ? ` · last ${(floorStats.lastMs / 1000).toFixed(1)}s` : ""}
              </p>
            </div>
          </div>
        </section>

        <section className="border-b border-line px-4 py-3">
          <div className="flex items-baseline justify-between">
            <p className="eyebrow">{idUi ? "Hitungan" : "Counts"}</p>
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

        <section className="border-b border-line px-4 py-3">
          <p className="eyebrow">{idUi ? "Kerja — progres jujur" : "Work — honest bars"}</p>
          <ul className="mt-2 space-y-2.5">
            {(snap.agents.length ? snap.agents : PERSONAS.map((p) => ({ id: p.id, bot: p.bot, role: p.name, color: p.color, status: "…", phase: "idle", progress: 0 }))).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setPersona(a.id as PersonaId)}
                  className={cn("w-full text-left", persona.id === a.id && "opacity-100")}
                  title={idUi ? "Tugaskan job berikutnya" : "Assign the next job"}
                >
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: a.color }} />
                    <span className={cn("text-[12.5px]", persona.id === a.id ? "font-medium text-fg" : "text-fg/85")}>{a.bot}</span>
                    <span className="font-mono text-[10px] text-subtle">{a.role}</span>
                    {persona.id === a.id ? <span className="ml-auto font-mono text-[9px] text-signal uppercase">next job</span> : null}
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-line">
                    <div className={cn("h-full rounded-full transition-[width] duration-500", PHASE_COLOR[a.phase] ?? "bg-line-strong")} style={{ width: `${Math.max(4, a.progress * 100)}%` }} />
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted">{a.status}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="px-4 py-3">
          <p className="eyebrow">Ship-log</p>
          <ul className="mt-2 space-y-1 font-mono text-[10.5px] leading-snug">
            {log.length === 0 ? <li className="text-subtle">{idUi ? "Belum ada aktivitas. Beri lantai sebuah job." : "Quiet. Give the floor a job."}</li> : null}
            {log.slice(0, 40).map((e) => (
              <li key={e.id} className="flex gap-2">
                <span className="shrink-0 text-subtle tabular-nums">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                <span className={cn("shrink-0", e.tone === "signal" ? "text-signal" : e.tone === "warn" ? "text-warn" : e.tone === "danger" ? "text-danger" : "text-accent")}>{e.tag}</span>
                <span className="min-w-0 text-muted">{e.text}</span>
              </li>
            ))}
          </ul>
        </section>
      </aside>

      <div className="order-1 flex min-h-0 min-w-0 flex-1 flex-col lg:order-2">
        <OfficeFloor className="min-h-[300px] flex-1 bg-bg" roomNav onSnapshot={setSnap} onPick={(id) => setPersona(id)} />

        <div className="border-t border-line bg-surface/50 px-3 py-3 md:px-5">
          {last?.content ? (
            <button
              type="button"
              onClick={() => setView("chat")}
              className="mb-2 flex w-full min-w-0 items-center gap-2 text-left"
              title={idUi ? "Buka di chat" : "Open in chat"}
            >
              <MessageSquare className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate text-xs text-muted">
                <span className="text-fg">{persona.bot}:</span> {last.content.replace(/\s+/g, " ").slice(-160)}
              </span>
            </button>
          ) : null}
          <form
            className="flex items-center gap-2 rounded-xl border border-line bg-bg p-1.5 focus-within:border-line-strong"
            onSubmit={(e) => {
              e.preventDefault();
              if (!draft.trim() || busy) return;
              void sendJob(draft);
              setDraft("");
            }}
          >
            <span className="flex shrink-0 items-center gap-1.5 rounded-lg bg-elevated px-2 py-1.5 text-xs">
              <span className="size-2 rounded-full" style={{ background: persona.color }} />
              {persona.bot}
            </span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={idUi ? `Beri ${persona.bot} sebuah job… (klik bot di lantai untuk ganti)` : `Give ${persona.bot} a job… (click a bot on the floor to switch)`}
              className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-subtle"
            />
            {busy ? (
              <button type="button" onClick={abortSend} className="flex size-9 items-center justify-center rounded-lg bg-elevated text-fg" aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button type="submit" disabled={!draft.trim()} className="flex size-9 items-center justify-center rounded-lg bg-accent text-accent-fg disabled:opacity-30" aria-label={idUi ? "Kirim" : "Send"}>
                <ArrowUp className="size-4" />
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
