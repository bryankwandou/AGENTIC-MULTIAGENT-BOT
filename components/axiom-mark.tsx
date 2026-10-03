import { cn } from "@/lib/cn";

/** The AXIOM glyph: a cut "A" standing on a sage baseline — the operator's axiom. */
export function AxiomGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={className}>
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M16 4 L28 26 H23 L20.6 21 H11.4 L9 26 H4 L16 4zm0 8.5 L12.6 19.5 h6.8 L16 12.5z"
      />
      <rect x="6" y="28" width="20" height="1.6" fill="var(--color-signal)" />
    </svg>
  );
}

/** Square avatar used for the bot. `live` lights the signal lamp while AXIOM is composing. */
export function AxiomAvatar({ size = 32, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-[9px] border border-line-strong bg-gradient-to-b from-elevated to-inset text-accent",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <AxiomGlyph className="size-[62%]" />
      <Lamp live={live} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-bg" />
    </span>
  );
}

/** Signal lamp — the bot's only "emotion". Steady when idle, breathing when working. */
export function Lamp({
  live = false,
  tone = "signal",
  className,
}: {
  live?: boolean;
  tone?: "signal" | "warn" | "danger" | "off";
  className?: string;
}) {
  const color =
    tone === "warn" ? "bg-warn" : tone === "danger" ? "bg-danger" : tone === "off" ? "bg-subtle" : "bg-signal";
  return <span className={cn("inline-block size-2 rounded-full", color, live && "animate-lamp", className)} />;
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display font-semibold tracking-[0.18em] uppercase", className)}>Axiom</span>
  );
}
