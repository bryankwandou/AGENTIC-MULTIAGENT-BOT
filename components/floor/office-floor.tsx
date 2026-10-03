"use client";

import { useEffect, useRef, useState } from "react";
import { Crosshair, Minus, Plus, Scan } from "lucide-react";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { onFloor } from "@/lib/floor-bus";
import { FloorWorld, type FloorSnapshot } from "./world";

type Props = {
  /** Landing-page mode: the floor invents its own jobs instead of listening to the station. */
  simulate?: boolean;
  maxims?: string[];
  className?: string;
  onSnapshot?: (s: FloorSnapshot) => void;
  onLog?: (tag: string, text: string, tone?: "signal" | "warn" | "danger") => void;
  onPick?: (id: PersonaId) => void;
  /** Show room chips for quick camera jumps. */
  roomNav?: boolean;
  /** Bot drawn with a selection ring. */
  selected?: PersonaId | null;
  /** Bot the camera stays on (null releases it). Operator camera input releases it too, reported via onPinChange. */
  pinned?: PersonaId | null;
  onPinChange?: (id: PersonaId | null) => void;
  /** Hint under the hover card. */
  pickHint?: string;
};

const ROOM_CHIPS = [
  { id: "office", name: "Office" },
  { id: "meeting", name: "Meeting" },
  { id: "boardroom", name: "Boardroom" },
  { id: "lead", name: "Lead" },
  { id: "canteen", name: "Canteen" },
  { id: "game", name: "Game room" },
  { id: "lounge", name: "Lounge" },
  { id: "datacenter", name: "Data center" },
  { id: "server", name: "Server" },
  { id: "vault", name: "Vault" },
  { id: "warehouse", name: "Warehouse" },
  { id: "security", name: "Security" },
  { id: "lobby", name: "Reception" },
  { id: "booths", name: "Booths" },
  { id: "library", name: "Library" },
];

function CamButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className="flex size-7 items-center justify-center rounded-lg text-muted hover:bg-elevated hover:text-fg">
      {children}
    </button>
  );
}

function zoomCenter(w: FloorWorld, el: HTMLDivElement | null, f: number) {
  const r = el?.getBoundingClientRect();
  if (r) w.zoomAt(r.width / 2, r.height / 2, f);
}

export function OfficeFloor({ simulate = false, maxims, className, onSnapshot, onLog, onPick, roomNav = false, selected = null, pinned = null, onPinChange, pickHint }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<FloorWorld | null>(null);
  const cb = useRef({ onSnapshot, onLog, onPick, onPinChange });
  cb.current = { onSnapshot, onLog, onPick, onPinChange };
  const pinRef = useRef<PersonaId | null>(pinned);
  const selRef = useRef<PersonaId | null>(selected);
  selRef.current = selected;
  const [hover, setHover] = useState<{ id: PersonaId; x: number; y: number } | null>(null);
  const [follow, setFollow] = useState(true);
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  useEffect(() => {
    const el = canvas.current;
    const box = wrap.current;
    if (!el || !box) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const w = new FloorWorld(
      PERSONAS.map((p) => ({ id: p.id, bot: p.bot, role: p.name, color: p.color })),
      { simulate, maxims },
    );
    w.onLog = (tag, text, tone) => cb.current.onLog?.(tag, text, tone);
    world.current = w;
    w.selected = selRef.current;
    if (pinRef.current) w.pin(pinRef.current);
    const off = simulate ? () => {} : onFloor((e) => w.handle(e));

    let cssW = 0;
    let cssH = 0;
    let dpr = 1;
    const size = () => {
      const r = box.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cssW = Math.max(1, r.width);
      cssH = Math.max(1, r.height);
      el.width = Math.round(cssW * dpr);
      el.height = Math.round(cssH * dpr);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(box);

    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    });
    io.observe(box);

    let raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (!visible || document.hidden) return;
      w.tick(t);
      w.render(ctx, cssW, cssH, dpr);
    };
    raf = requestAnimationFrame(loop);
    const snap = window.setInterval(() => {
      cb.current.onSnapshot?.(w.snapshot());
      setFollow(w.follow);
      // Zoom / pan / room jumps release the pin inside the world; tell the owner.
      if (pinRef.current && w.pinnedBot !== pinRef.current) {
        pinRef.current = null;
        cb.current.onPinChange?.(null);
      }
    }, 400);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = box.getBoundingClientRect();
      w.zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
      setFollow(false);
    };
    box.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(snap);
      ro.disconnect();
      io.disconnect();
      box.removeEventListener("wheel", onWheel);
      off();
      world.current = null;
    };
  }, [simulate, maxims]);

  useEffect(() => {
    if (world.current) world.current.selected = selected;
  }, [selected]);

  useEffect(() => {
    pinRef.current = pinned;
    const w = world.current;
    if (!w || w.pinnedBot === pinned) return;
    w.pin(pinned);
    if (!pinned) w.follow = true;
    setFollow(w.follow);
  }, [pinned]);

  useEffect(() => {
    if (world.current) world.current.hovered = hover?.id ?? null;
  }, [hover?.id]);

  const pick = (e: React.PointerEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    const w = world.current;
    if (!r || !w) return null;
    return w.hit(e.clientX - r.left, e.clientY - r.top);
  };

  const hovered = hover ? PERSONAS.find((p) => p.id === hover.id) : null;
  const snap = hover ? world.current?.snapshot().agents.find((a) => a.id === hover.id) : null;

  return (
    <div
      ref={wrap}
      className={cn("relative overflow-hidden", className)}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
        (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (d) {
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          d.moved += Math.abs(dx) + Math.abs(dy);
          if (d.moved > 4) {
            world.current?.panBy(dx, dy);
            setFollow(false);
            setHover(null);
          }
          d.x = e.clientX;
          d.y = e.clientY;
          if (d.moved > 4) return;
        }
        const id = pick(e);
        const pos = id ? world.current?.headAt(id) : null;
        setHover(id && pos ? { id, x: pos[0], y: pos[1] } : null);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (d && d.moved <= 4) {
          const id = pick(e);
          if (id) cb.current.onPick?.(id);
        }
      }}
      onPointerLeave={() => setHover(null)}
      onDoubleClick={() => {
        world.current?.resetCamera();
        setFollow(true);
      }}
      style={{ cursor: drag.current && drag.current.moved > 4 ? "grabbing" : hover ? "pointer" : "grab", touchAction: "none" }}
    >
      <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label="AXIOM office floor: the bots at work" role="img" />
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-xl border border-line bg-surface/80 p-1 backdrop-blur" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={() => {
            if (!world.current) return;
            if (follow) {
              world.current.pin(null);
              world.current.follow = false;
            } else world.current.resetCamera();
            setFollow(!follow);
          }}
          className={cn("flex h-7 items-center gap-1.5 rounded-lg px-2 font-mono text-[10px] uppercase", follow ? "bg-accent text-accent-fg" : "text-muted hover:text-fg")}
          title="Camera follows the busy bots"
        >
          <Crosshair className="size-3.5" /> follow
        </button>
        <CamButton label="Zoom in" onClick={() => world.current && zoomCenter(world.current, wrap.current, 1.25)}>
          <Plus className="size-3.5" />
        </CamButton>
        <CamButton label="Zoom out" onClick={() => world.current && zoomCenter(world.current, wrap.current, 0.8)}>
          <Minus className="size-3.5" />
        </CamButton>
        <CamButton
          label="Overview"
          onClick={() => {
            world.current?.resetCamera();
            if (world.current) world.current.follow = false;
            setFollow(false);
          }}
        >
          <Scan className="size-3.5" />
        </CamButton>
      </div>
      {roomNav ? (
        <div
          className="absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] gap-1 overflow-x-auto rounded-xl border border-line bg-surface/80 p-1 backdrop-blur"
          onPointerDown={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {ROOM_CHIPS.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                world.current?.focusRoom(r.id);
                setFollow(false);
              }}
              className="h-7 shrink-0 rounded-lg px-2 font-mono text-[10px] text-muted uppercase hover:bg-elevated hover:text-fg"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}
      {hovered && hover ? (
        <div
          className="pointer-events-none absolute z-10 w-52 -translate-x-1/2 -translate-y-full rounded-xl border border-line-strong bg-surface/95 px-3 py-2 shadow-[var(--shadow-pop)] backdrop-blur animate-fade"
          style={{ left: hover.x, top: hover.y - 46 }}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <span className="size-2 rounded-full" style={{ background: hovered.color }} />
            {hovered.bot} <span className="font-normal text-muted">· {hovered.name}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted">{snap?.status ?? hovered.blurb}</p>
          {onPick ? <p className="mt-1 font-mono text-[10px] text-subtle">{pickHint ?? "click to assign the next job"}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
