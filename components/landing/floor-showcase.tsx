"use client";

import { useCallback, useState } from "react";
import { OfficeFloor } from "@/components/floor/office-floor";
import { cn } from "@/lib/cn";

type Entry = { id: number; t: number; tag: string; text: string; tone?: "signal" | "warn" | "danger" };

/** Landing-page floor: the bots run simulated jobs on their own so visitors see the office live. */
export function FloorShowcase({ maxims }: { maxims: string[] }) {
  const [log, setLog] = useState<Entry[]>([]);
  const onLog = useCallback((tag: string, text: string, tone?: Entry["tone"]) => {
    setLog((l) => [{ id: Date.now() + Math.random(), t: Date.now(), tag, text, tone }, ...l].slice(0, 7));
  }, []);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line-strong bg-bg shadow-[var(--shadow-pop)]">
      <OfficeFloor simulate maxims={maxims} onLog={onLog} className="h-[62vh] min-h-[420px]" />
      <div className="pointer-events-none absolute bottom-3 left-3 hidden w-[22rem] rounded-xl border border-line bg-bg/80 p-3 backdrop-blur md:block">
        <p className="eyebrow">Ship-log · live</p>
        <ul className="mt-2 space-y-1 font-mono text-[10.5px] leading-snug">
          {log.length === 0 ? <li className="text-subtle">The floor is warming up…</li> : null}
          {log.map((e) => (
            <li key={e.id} className="flex gap-2 animate-fade">
              <span className="shrink-0 text-subtle tabular-nums">{new Date(e.t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
              <span className={cn("shrink-0", e.tone === "signal" ? "text-signal" : e.tone === "danger" ? "text-danger" : "text-accent")}>{e.tag}</span>
              <span className="min-w-0 truncate text-muted">{e.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
