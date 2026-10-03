"use client";

import { useEffect, useMemo, useState } from "react";
import { KernelSpine } from "@/components/kernel-spine";
import { cn } from "@/lib/cn";
import type { SpineBand } from "@/lib/megaprompt";

type ModeData = { chars: number; sections: number; usedPrefixes: string[] };

const MODES = ["lite", "core", "full"] as const;
const NOTES: Record<(typeof MODES)[number], string> = {
  lite: "Voice, laws, language, honesty. For quick turns.",
  core: "The whole mind: truth engine, reasoning OS, calibration.",
  full: "Every craft and library module the budget can hold.",
};

/** Live compiler demo for the landing page: switch mode, watch the spine light up. */
export function SpineShowcase({ bands, modes }: { bands: SpineBand[]; modes: Record<(typeof MODES)[number], ModeData> }) {
  const [mode, setMode] = useState<(typeof MODES)[number]>("core");
  const [auto, setAuto] = useState(true);
  const data = modes[mode];
  const lit = useMemo(() => new Set(data.usedPrefixes), [data]);

  useEffect(() => {
    if (!auto) return;
    const t = window.setInterval(() => setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]!), 2600);
    return () => window.clearInterval(t);
  }, [auto]);

  return (
    <div className="rounded-2xl border border-line bg-surface/70 p-5 md:p-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex rounded-lg bg-inset p-1">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setAuto(false);
                setMode(m);
              }}
              className={cn(
                "h-9 rounded-md px-4 font-mono text-[11px] tracking-[0.14em] uppercase transition-colors",
                mode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <div className="flex gap-6 font-mono text-xs tabular-nums">
          <div>
            <p className="eyebrow">kernel</p>
            <p className="mt-1 text-lg text-fg">{data.chars.toLocaleString()}c</p>
          </div>
          <div>
            <p className="eyebrow">sections</p>
            <p className="mt-1 text-lg text-fg">{data.sections}</p>
          </div>
        </div>
      </div>
      <div className="mt-6">
        <KernelSpine bands={bands} lit={lit} thickness={76} onPick={() => setAuto(false)} />
      </div>
      <p className="mt-4 text-sm text-muted">
        <span className="font-mono text-xs text-signal uppercase">{mode}</span> — {NOTES[mode]}{" "}
        <span className="text-subtle">Hover any band to read the section.</span>
      </p>
    </div>
  );
}
