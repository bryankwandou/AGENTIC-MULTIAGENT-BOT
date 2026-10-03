"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import type { PersonaId, ViewId } from "@/lib/catalog";
import { onSendEnd, useSender as useSenderState } from "@/lib/chat-sender";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";
import { decideApproval } from "@/lib/team/client";
import { useTeam } from "@/lib/team/store";
import { LEAD } from "@/lib/team/types";

type Action = { label: string; onClick: () => void; primary?: boolean };
type Toast = { id: string; bot: PersonaId; tone: "signal" | "warn" | "danger"; title: string; body?: string; actions: Action[]; sticky?: boolean };

const LIFETIME = 7000;
const clip = (s: string, n: number) => {
  const t = s.replace(/[#*_`>]/g, "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

/**
 * Finished jobs and pending approvals, surfaced on whatever view the operator is on.
 * Chat and Team show their own results, and the Floor has its own banner, so those views stay quiet.
 */
export function Toaster() {
  const view = useStation((s) => s.view);
  const viewRef = useRef<ViewId>(view);
  viewRef.current = view;
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const timers = new Map<string, number>();
    const drop = (id: string) => {
      window.clearTimeout(timers.get(id));
      timers.delete(id);
      setToasts((all) => all.filter((t) => t.id !== id));
    };
    const push = (t: Toast) => {
      setToasts((all) => [t, ...all.filter((x) => x.id !== t.id)].slice(0, 4));
      window.clearTimeout(timers.get(t.id));
      if (!t.sticky) timers.set(t.id, window.setTimeout(() => drop(t.id), LIFETIME));
    };
    const go = (v: ViewId, id: string) => () => {
      useStation.getState().setView(v);
      drop(id);
    };
    const idUi = () => useStation.getState().language !== "en";

    const offSend = onSendEnd((r) => {
      const v = viewRef.current;
      if (r.outcome === "stopped" || v === "chat" || v === "floor") return;
      const p = PERSONA_BY_ID[r.persona];
      const id = `solo-${Date.now()}`;
      const s = useStation.getState();
      const last = s.sessions.find((x) => x.id === s.activeSessionId)?.messages.at(-1)?.content ?? "";
      push(
        r.outcome === "done"
          ? {
              id,
              bot: r.persona,
              tone: "signal",
              title: idUi() ? `${p.bot} selesai · ${(r.ms / 1000).toFixed(1)}s` : `${p.bot} shipped · ${(r.ms / 1000).toFixed(1)}s`,
              body: clip(last, 140),
              actions: [{ label: idUi() ? "Buka" : "Open", onClick: go("chat", id), primary: true }],
            }
          : {
              id,
              bot: r.persona,
              tone: "danger",
              title: idUi() ? `${p.bot} gagal` : `${p.bot} hit an error`,
              body: clip(r.error ?? "", 160),
              actions: [{ label: idUi() ? "Buka" : "Open", onClick: go("chat", id) }],
            },
      );
    });

    const offTeam = useTeam.subscribe((s, prev) => {
      const run = s.current;
      // A decision made anywhere retires the approval toast.
      if (run && run.approval && run.approval.decision !== "pending") {
        setToasts((all) => all.filter((t) => t.id !== `approval-${run.id}`));
      }
      if (!prev.running || s.running || !run) return;
      const v = viewRef.current;
      if (v === "team" || v === "floor") return;
      if (run.approval?.decision === "pending") {
        const id = `approval-${run.id}`;
        push({
          id,
          bot: LEAD,
          tone: "warn",
          sticky: true,
          title: idUi() ? `${PERSONA_BY_ID[LEAD].bot} butuh persetujuan Anda` : `${PERSONA_BY_ID[LEAD].bot} needs your approval`,
          body: run.approval.action,
          actions: [
            { label: idUi() ? "Setujui" : "Approve", onClick: () => decideApproval(run.id, true), primary: true },
            { label: idUi() ? "Tolak" : "Reject", onClick: () => decideApproval(run.id, false) },
            { label: idUi() ? "Tinjau" : "Review", onClick: go("team", id) },
          ],
        });
        return;
      }
      if (run.status !== "done" && run.status !== "error") return;
      const id = `run-${run.id}`;
      push({
        id,
        bot: LEAD,
        tone: run.status === "done" ? "signal" : "danger",
        title:
          run.status === "done"
            ? idUi()
              ? `Run tim selesai · ${run.lanes.length + 1} bot`
              : `Team run shipped · ${run.lanes.length + 1} bots`
            : idUi()
              ? "Run tim gagal"
              : "Team run failed",
        body: clip(run.status === "done" ? run.final.text || run.job : (run.error ?? run.final.error ?? run.job), 150),
        actions: [{ label: idUi() ? "Buka" : "Open", onClick: go("team", id), primary: run.status === "done" }],
      });
    });

    return () => {
      offSend();
      offTeam();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  if (!toasts.length) return null;
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto animate-rise rounded-xl border bg-surface/95 px-3.5 py-3 shadow-[var(--shadow-pop)] backdrop-blur",
            t.tone === "warn" ? "border-warn/50" : t.tone === "danger" ? "border-danger/40" : "border-line-strong",
          )}
        >
          <div className="flex items-start gap-2.5">
            <BotAvatar id={t.bot} size={26} live={t.sticky} />
            <div className="min-w-0 flex-1">
              <p className={cn("text-[13px] font-medium", t.tone === "warn" ? "text-warn" : t.tone === "danger" ? "text-danger" : "text-fg")}>{t.title}</p>
              {t.body ? <p className="mt-0.5 line-clamp-2 text-[12px] text-muted">{t.body}</p> : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {t.actions.map((a) => (
                  <button
                    key={a.label}
                    type="button"
                    onClick={a.onClick}
                    className={cn("h-7 rounded-md px-2.5 text-[11.5px]", a.primary ? "bg-accent font-medium text-accent-fg" : "border border-line text-fg hover:bg-elevated")}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))} className="text-subtle hover:text-fg" aria-label="Dismiss">
              <X className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Header pill: who is working right now, on any view. Click to watch them on the floor. */
export function WorkingPill() {
  const sender = useSenderState();
  const running = useTeam((s) => s.running);
  const current = useTeam((s) => s.current);
  const language = useStation((s) => s.language);
  const view = useStation((s) => s.view);
  const setView = useStation((s) => s.setView);
  const idUi = language !== "en";
  const bots = new Set<PersonaId>();
  if (sender.busy && sender.persona) bots.add(sender.persona);
  if (running && current) {
    bots.add(LEAD);
    for (const l of current.lanes) if (l.status === "working" || l.status === "queued") bots.add(l.bot);
  }
  const approval = current?.approval?.decision === "pending";
  if (!bots.size && !approval) return null;
  const list = [...bots];
  return (
    <button
      type="button"
      onClick={() => setView("floor")}
      disabled={view === "floor"}
      className={cn(
        "mr-1 flex h-8 animate-fade items-center gap-2 rounded-full border pr-3 pl-1 font-mono text-[10px] tracking-wider uppercase disabled:cursor-default",
        approval ? "border-warn/50 bg-warn/10 text-warn" : "border-signal/30 bg-signal/5 text-signal",
      )}
      title={idUi ? "Lihat di lantai" : "Watch on the floor"}
    >
      <span className="flex -space-x-1.5">
        {(list.length ? list : [LEAD]).slice(0, 4).map((b) => (
          <BotAvatar key={b} id={b} size={22} className="ring-2 ring-bg" />
        ))}
      </span>
      <span className="hidden sm:inline">{approval ? (idUi ? "butuh persetujuan" : "approval needed") : `${list.length} ${idUi ? "bekerja" : "working"}`}</span>
    </button>
  );
}
