"use client";

import { useMemo } from "react";
import { KeyRound, Lock, ScanEye } from "lucide-react";
import type { EngineSummary } from "@/components/engine-dialog";
import { KernelSpine } from "@/components/kernel-spine";
import { Lamp } from "@/components/axiom-mark";
import { CORE_MODULE_IDS, LITE_MODULE_IDS, MODULES, type CompileMode } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { megapromptSpine, type CompiledKernel, type MegapromptStats } from "@/lib/megaprompt";
import type { EngineStatus } from "@/lib/engine-status";
import { useStation } from "@/lib/store";

const GROUPS: { id: "constitution" | "mind" | "craft" | "library"; label: string; labelId: string }[] = [
  { id: "constitution", label: "Constitution", labelId: "Konstitusi" },
  { id: "mind", label: "Mind", labelId: "Mind" },
  { id: "craft", label: "Craft", labelId: "Craft" },
  { id: "library", label: "Library", labelId: "Pustaka" },
];

const MODE_NOTE: Record<CompileMode, string> = {
  lite: "≤12k base · voice + laws",
  core: "≤28k base · full mind",
  full: "≤100k · everything that fits",
};

export function Inspector({
  summary,
  kernel,
  stats,
}: {
  engine?: EngineStatus | null;
  summary: EngineSummary;
  kernel: CompiledKernel;
  stats: MegapromptStats;
}) {
  const language = useStation((s) => s.language);
  const compileMode = useStation((s) => s.compileMode);
  const setCompileMode = useStation((s) => s.setCompileMode);
  const enabledModules = useStation((s) => s.enabledModules);
  const toggleModule = useStation((s) => s.toggleModule);
  const temperature = useStation((s) => s.temperature);
  const setTemperature = useStation((s) => s.setTemperature);
  const maxTokens = useStation((s) => s.maxTokens);
  const setMaxTokens = useStation((s) => s.setMaxTokens);
  const setKernelOpen = useStation((s) => s.setKernelOpen);
  const setView = useStation((s) => s.setView);
  const setStudioSection = useStation((s) => s.setStudioSection);
  const setEngineOpen = useStation((s) => s.setEngineOpen);
  const idUi = language !== "en";
  const bands = useMemo(() => megapromptSpine(), []);
  const lit = useMemo(() => new Set(kernel.usedPrefixes), [kernel.usedPrefixes]);
  const budget = kernel.budget;
  const modeIds = useMemo(
    () => new Set<string>(compileMode === "lite" ? LITE_MODULE_IDS : compileMode === "core" ? CORE_MODULE_IDS : MODULES.map((m) => m.id)),
    [compileMode],
  );

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <section className="border-b border-line px-4 py-4">
        <p className="eyebrow">Engine</p>
        <button
          type="button"
          onClick={() => setEngineOpen(true)}
          className="mt-2 flex w-full items-center gap-3 rounded-xl border border-line bg-inset px-3 py-2.5 text-left transition-colors hover:border-line-strong"
        >
          <Lamp tone={summary.live ? "signal" : "warn"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] text-fg">{summary.label}</span>
            <span className="block truncate font-mono text-[10px] text-subtle">
              {summary.detail}
              {summary.source === "byok" ? " · your key" : summary.source === "server" ? " · server key" : ""}
            </span>
          </span>
          <span className="flex items-center gap-1 rounded-md bg-elevated px-2 py-1 font-mono text-[10px] text-muted">
            <KeyRound className="size-3" /> {summary.live ? (idUi ? "ganti" : "switch") : idUi ? "hubungkan" : "connect"}
          </span>
        </button>
      </section>

      <section className="border-b border-line px-4 py-4">
        <div className="flex items-center justify-between">
          <p className="eyebrow">Kernel compiler</p>
          <button
            type="button"
            onClick={() => setKernelOpen(true)}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10px] text-muted hover:bg-elevated hover:text-fg"
          >
            <ScanEye className="size-3.5" /> {idUi ? "lihat" : "view"}
          </button>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-inset p-1">
          {(["lite", "core", "full"] as CompileMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setCompileMode(m)}
              className={cn(
                "h-8 rounded-md font-mono text-[10px] tracking-wider uppercase transition-colors",
                compileMode === m ? "bg-accent text-accent-fg" : "text-muted hover:text-fg",
              )}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-2 font-mono text-[10px] text-subtle">{MODE_NOTE[compileMode]}</p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] text-subtle">
            <span>{idUi ? "anggaran" : "budget"}</span>
            <span className="tabular-nums">
              <span className="text-fg">{kernel.chars.toLocaleString()}</span> / {budget.toLocaleString()}c
            </span>
          </div>
          <div className="h-1 overflow-hidden rounded-full bg-line">
            <div
              className={cn("h-full rounded-full transition-[width] duration-500", kernel.truncated ? "bg-warn" : "bg-signal")}
              style={{ width: `${Math.min(100, (kernel.chars / budget) * 100)}%` }}
            />
          </div>
        </div>

        <p className="eyebrow mt-5 mb-2">Kernel spine</p>
        <KernelSpine
          bands={bands}
          lit={lit}
          thickness={34}
          onPick={(b) => {
            setStudioSection(b.index);
            setView("studio");
          }}
        />
        {kernel.truncated ? (
          <p className="mt-3 text-[11px] leading-relaxed text-warn">
            {idUi
              ? "Kernel terpotong oleh anggaran. Naikkan ke full atau matikan pustaka."
              : "Kernel truncated by budget. Switch to full or drop library modules."}
          </p>
        ) : null}

        <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[11px] text-muted">
          <dt>Megaprompt</dt>
          <dd className="text-right text-fg tabular-nums">{stats.lines.toLocaleString()} ln</dd>
          <dt>{idUi ? "Kata" : "Words"}</dt>
          <dd className="text-right text-fg tabular-nums">{stats.words.toLocaleString()}</dd>
        </dl>
      </section>

      <section className="border-b border-line px-4 py-4">
        <label className="flex items-center justify-between eyebrow">
          {idUi ? "temperatur" : "temperature"}
          <span className="text-fg tabular-nums">{temperature.toFixed(1)}</span>
        </label>
        <input
          type="range"
          min={0}
          max={1.2}
          step={0.1}
          value={temperature}
          onChange={(e) => setTemperature(Number(e.target.value))}
          className="mt-2 w-full"
        />
        <label className="mt-3 flex items-center justify-between eyebrow">
          max tokens
          <span className="text-fg tabular-nums">{maxTokens}</span>
        </label>
        <input
          type="range"
          min={256}
          max={4096}
          step={128}
          value={maxTokens}
          onChange={(e) => setMaxTokens(Number(e.target.value))}
          className="mt-2 w-full"
        />
      </section>

      <section className="px-4 py-4">
        <p className="eyebrow">{idUi ? "Modul" : "Modules"}</p>
        {GROUPS.map((g) => (
          <div key={g.id} className="mt-4">
            <p className="text-[11px] font-medium text-muted">{idUi ? g.labelId : g.label}</p>
            <ul className="mt-1.5 space-y-px">
              {MODULES.filter((m) => m.group === g.id).map((m) => {
                const byMode = !m.locked && modeIds.has(m.id);
                const on = m.locked || byMode || enabledModules.includes(m.id);
                const inKernel = lit.has(m.headingPrefix);
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      title={byMode ? `${m.hint} · included by ${compileMode}` : m.hint}
                      disabled={m.locked || byMode}
                      onClick={() => toggleModule(m.id)}
                      className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-elevated/60 disabled:hover:bg-transparent"
                    >
                      <span
                        className={cn(
                          "relative h-3.5 w-6 shrink-0 rounded-full transition-colors",
                          on ? (m.locked || byMode ? "bg-accent/45" : "bg-signal/80") : "bg-line-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-0.5 size-2.5 rounded-full bg-bg transition-[left]",
                            on ? "left-3" : "left-0.5",
                          )}
                        />
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate text-[12px]", on ? "text-fg" : "text-muted")}>{m.label}</span>
                      {m.locked ? <Lock className="size-3 text-subtle" /> : null}
                      {on && !inKernel ? <span className="font-mono text-[9px] text-warn">cut</span> : null}
                      <span className="w-8 text-right font-mono text-[10px] text-subtle">{m.id}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
