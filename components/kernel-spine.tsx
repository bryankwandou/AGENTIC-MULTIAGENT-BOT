"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";
import type { SpineBand } from "@/lib/megaprompt";

/**
 * The megaprompt drawn as a spine: one band per section, sized by its line count.
 * Bands that made it into the compiled kernel are lit; the rest stay dark.
 */
export function KernelSpine({
  bands,
  lit,
  orientation = "horizontal",
  onPick,
  className,
  thickness,
}: {
  bands: SpineBand[];
  lit: Set<string>;
  orientation?: "horizontal" | "vertical";
  onPick?: (band: SpineBand) => void;
  className?: string;
  thickness?: number;
}) {
  const [hover, setHover] = useState<SpineBand | null>(null);
  const horizontal = orientation === "horizontal";
  const total = bands.reduce((a, b) => a + b.lines, 0);
  const litLines = bands.filter((b) => lit.has(b.prefix)).reduce((a, b) => a + b.lines, 0);

  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn("flex gap-px overflow-hidden rounded-md", horizontal ? "flex-row" : "flex-col")}
        style={horizontal ? { height: thickness ?? 28 } : { width: thickness ?? 28, height: "100%" }}
        onMouseLeave={() => setHover(null)}
      >
        {bands.map((b) => {
          const on = lit.has(b.prefix);
          return (
            <button
              key={b.prefix}
              type="button"
              tabIndex={onPick ? 0 : -1}
              aria-label={`${b.prefix} ${b.title}`}
              onMouseEnter={() => setHover(b)}
              onFocus={() => setHover(b)}
              onClick={() => onPick?.(b)}
              className={cn(
                "min-h-px min-w-px transition-colors duration-300",
                on ? (b.locked ? "bg-accent" : "bg-signal") : "bg-line",
                hover?.prefix === b.prefix && "bg-fg!",
                !onPick && "cursor-default",
              )}
              style={{ flexGrow: b.lines, flexBasis: 0 }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-3 font-mono text-[10px] text-subtle tabular-nums">
        <span className="truncate">
          {hover ? (
            <>
              <span className="text-fg">§{hover.prefix.replace(".", "")}</span> {hover.title}
              <span className="text-subtle"> · L{hover.startLine} · {hover.lines} ln</span>
            </>
          ) : (
            <>
              <span className="text-signal">{Math.round((litLines / total) * 100)}%</span> of {total.toLocaleString()} lines
              lit · {lit.size}/{bands.length} sections
            </>
          )}
        </span>
      </div>
    </div>
  );
}
