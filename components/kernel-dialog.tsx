"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { CompiledKernel } from "@/lib/megaprompt";
import { useStation } from "@/lib/store";

export function KernelDialog({ kernel }: { kernel: CompiledKernel }) {
  const open = useStation((s) => s.kernelOpen);
  const setOpen = useStation((s) => s.setKernelOpen);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  const lines = kernel.text.split("\n");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/75 p-3 backdrop-blur-sm animate-fade" onClick={() => setOpen(false)}>
      <div
        className="flex h-[86vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow-pop)] animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="font-display text-2xl font-semibold tracking-tight">Compiled kernel</p>
            <p className="mt-0.5 font-mono text-[11px] text-subtle tabular-nums">
              {kernel.chars.toLocaleString()} chars · {lines.length.toLocaleString()} lines · {kernel.used.length} sections
              {kernel.truncated ? " · truncated by budget" : ""} — this is exactly what the engine receives as its system prompt.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(kernel.text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
            className="h-9 rounded-lg bg-accent px-3 text-xs font-medium text-accent-fg"
          >
            {copied ? "Copied" : "Copy kernel"}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-elevated" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1 border-b border-line px-5 py-3">
          {kernel.used.map((t) => (
            <span key={t} className="rounded-md bg-elevated px-2 py-0.5 font-mono text-[10px] text-muted">
              {t}
            </span>
          ))}
        </div>
        <pre className="min-h-0 flex-1 overflow-auto bg-inset py-4 font-mono text-[11.5px] leading-[1.6]">
          {lines.map((line, i) => (
            <div key={i} className="flex gap-4 px-5">
              <span className="w-10 shrink-0 text-right text-subtle select-none tabular-nums">{i + 1}</span>
              <span
                className={
                  line.startsWith("<<<")
                    ? "text-signal"
                    : line.startsWith("## ")
                      ? "font-medium text-accent"
                      : "whitespace-pre-wrap break-words text-fg/85"
                }
              >
                {line || " "}
              </span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}
