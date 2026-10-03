import type { Phase } from "./world";

/** How each floor phase is labelled and colored across the floor UI. */
export const PHASE_META: Record<Phase, { label: string; labelId: string; text: string; bg: string; chip: string }> = {
  writing: { label: "Writing", labelId: "Menulis", text: "text-signal", bg: "bg-signal", chip: "border-signal/40 bg-signal/10 text-signal" },
  thinking: { label: "Thinking", labelId: "Berpikir", text: "text-accent", bg: "bg-accent", chip: "border-accent/40 bg-accent/10 text-accent" },
  waiting: { label: "Coffee · waiting", labelId: "Ngopi · menunggu", text: "text-warn", bg: "bg-warn", chip: "border-warn/40 bg-warn/10 text-warn" },
  approval: { label: "Needs approval", labelId: "Butuh persetujuan", text: "text-warn", bg: "bg-warn", chip: "border-warn/50 bg-warn/15 text-warn" },
  done: { label: "Shipped", labelId: "Terkirim", text: "text-signal", bg: "bg-signal", chip: "border-signal/30 bg-transparent text-signal" },
  error: { label: "Error", labelId: "Galat", text: "text-danger", bg: "bg-danger", chip: "border-danger/40 bg-danger/10 text-danger" },
  idle: { label: "Idle", labelId: "Santai", text: "text-subtle", bg: "bg-line-strong", chip: "border-line bg-transparent text-subtle" },
};

export function isBusy(phase: Phase) {
  return phase === "writing" || phase === "thinking" || phase === "waiting" || phase === "approval";
}

/** 4s, 1m 12s, 1h 3m. */
export function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
