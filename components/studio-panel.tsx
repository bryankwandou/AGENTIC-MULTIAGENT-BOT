"use client";

import { useMemo, useState } from "react";
import { KernelSpine } from "@/components/kernel-spine";
import { megapromptSpine, megapromptStats, megapromptText, parseSections } from "@/lib/megaprompt";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";

export function StudioPanel() {
  const language = useStation((s) => s.language);
  const studioQuery = useStation((s) => s.studioQuery);
  const setStudioQuery = useStation((s) => s.setStudioQuery);
  const studioSection = useStation((s) => s.studioSection);
  const setStudioSection = useStation((s) => s.setStudioSection);
  const addendum = useStation((s) => s.addendum);
  const setAddendum = useStation((s) => s.setAddendum);
  const [copied, setCopied] = useState<"full" | "section" | null>(null);
  const idUi = language !== "en";
  const stats = useMemo(() => megapromptStats(), []);
  const sections = useMemo(() => parseSections(), []);
  const q = studioQuery.trim().toLowerCase();
  const filtered = q
    ? sections.filter((s) => s.title.toLowerCase().includes(q) || s.body.toLowerCase().includes(q))
    : sections;
  const active = sections.find((s) => s.index === studioSection) ?? sections[0];
  const bands = useMemo(() => megapromptSpine(), []);
  const lit = useMemo(
    () => new Set(q ? filtered.map((s) => s.headingPrefix).filter(Boolean) : [active?.headingPrefix ?? ""]),
    [q, filtered, active],
  );

  async function copy(which: "full" | "section") {
    const text = which === "full" ? megapromptText() : (active?.body ?? "");
    await navigator.clipboard.writeText(text);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1400);
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="hidden w-64 shrink-0 flex-col border-r border-line md:flex">
        <div className="border-b border-line p-3">
          <input
            value={studioQuery}
            onChange={(e) => setStudioQuery(e.target.value)}
            placeholder={idUi ? "Cari seksi…" : "Search sections…"}
            className="h-10 w-full rounded-md border border-line bg-inset px-3 font-mono text-xs text-fg outline-none placeholder:text-subtle"
          />
          <p className="mt-2 font-mono text-[10px] text-subtle tabular-nums">
            {stats.lines.toLocaleString()} {idUi ? "baris" : "lines"} · {stats.sections} {idUi ? "seksi" : "sections"} ·{" "}
            {(stats.chars / 1000).toFixed(0)}k c
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {filtered.map((s) => (
            <button
              key={s.index}
              type="button"
              onClick={() => setStudioSection(s.index)}
              className={cn(
                "mb-0.5 block w-full rounded-md px-2 py-2 text-left",
                s.index === studioSection ? "bg-elevated" : "hover:bg-elevated/50",
              )}
            >
              <span className="line-clamp-2 text-[12px] leading-snug text-fg">{s.title}</span>
              <span className="mt-1 block font-mono text-[10px] text-subtle tabular-nums">
                L{s.startLine} · {s.lines.length} ln
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-line px-4 pt-3 pb-2">
          <KernelSpine bands={bands} lit={lit} thickness={22} onPick={(b) => setStudioSection(b.index)} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <select
            className="h-10 max-w-full rounded-md border border-line bg-surface px-2 font-mono text-[11px] text-fg md:hidden"
            value={studioSection}
            onChange={(e) => setStudioSection(Number(e.target.value))}
          >
            {sections.map((s) => (
              <option key={s.index} value={s.index}>
                {s.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void copy("section")}
            className="h-10 rounded-md border border-line px-3 text-xs text-muted"
          >
            {copied === "section" ? (idUi ? "Tersalin" : "Copied") : idUi ? "Salin seksi" : "Copy section"}
          </button>
          <button
            type="button"
            onClick={() => void copy("full")}
            className="h-10 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg"
          >
            {copied === "full" ? (idUi ? "Tersalin" : "Copied") : idUi ? "Salin 5000+ baris" : "Copy 5000+ lines"}
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-inset">
          <pre className="px-3 py-4 font-mono text-[11.5px] leading-[1.55] text-accent md:px-5">
            {active?.lines.map((line, i) => {
              const n = (active.startLine + i).toString();
              const hit = q && line.toLowerCase().includes(q);
              return (
                <div key={i} className={cn("flex gap-4", hit && "bg-signal/10", line.startsWith("## ") && "text-accent")}>
                  <span className="w-10 shrink-0 select-none text-right text-subtle tabular-nums">{n}</span>
                  <span
                    className={cn(
                      "min-w-0 whitespace-pre-wrap break-words",
                      line.startsWith("#") ? "font-medium text-accent" : line.startsWith("- ") ? "text-fg/90" : "text-fg/80",
                    )}
                  >
                    {line || " "}
                  </span>
                </div>
              );
            })}
          </pre>
        </div>
        <div className="border-t border-line p-3">
          <p className="mb-1 font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
            {idUi ? "Addendum operator" : "Operator addendum"}
          </p>
          <textarea
            value={addendum}
            onChange={(e) => setAddendum(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs text-fg outline-none"
          />
        </div>
      </div>
    </div>
  );
}
