"use client";

import { Lamp } from "@/components/axiom-mark";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";

export type Persona = (typeof PERSONAS)[number];
export const PERSONA_BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<PersonaId, Persona>;

/** Readable initial on a bot's signature color. */
export function ink(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  return lum > 0.5 ? "#0a0b0c" : "#ecece8";
}

export function BotAvatar({ id, size = 28, live = false, className }: { id: PersonaId; size?: number; live?: boolean; className?: string }) {
  const p = PERSONA_BY_ID[id];
  return (
    <span
      aria-hidden
      className={cn("relative inline-flex shrink-0 items-center justify-center rounded-full font-display leading-none font-semibold select-none", className)}
      style={{ width: size, height: size, background: p.color, color: ink(p.color), fontSize: Math.round(size * 0.5) }}
    >
      {p.bot.charAt(0)}
      {live ? <Lamp live className="absolute -right-0.5 -bottom-0.5 size-2 ring-2 ring-bg" /> : null}
    </span>
  );
}

export function AvatarStack({ bots, size = 18 }: { bots: PersonaId[]; size?: number }) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {bots.map((b) => (
        <BotAvatar key={b} id={b} size={size} className="ring-2 ring-surface" />
      ))}
    </span>
  );
}
