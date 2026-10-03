import type { PersonaId } from "@/lib/catalog";
import type { FloorEvent } from "@/lib/floor-bus";
import { floorText, npcName, roomName, type Doing, type FloorLang } from "./i18n";

const HW = 16;
const HH = 8;
export const GW = 44;
export const GH = 34;
const WALL_H = 84;

/**
 * AXIOM Floor — an isometric office where every bot is a teammate at a desk.
 * Pure TypeScript + Canvas 2D: no React here. The React wrapper feeds it events and frames.
 *
 * Behaviour follows the bot's real response phases:
 *   job → walk to the meeting room and think · no token for a while → coffee while waiting
 *   tokens → back to the desk, typing, the reply streaming in a bubble · done → lean back
 *   error → kernel room to inspect the racks · handoff → walk to a teammate's desk
 *   approval → stand at the desk with a hand up · vault → file a note at the shelves
 */

export type BotInfo = { id: PersonaId; bot: string; role: string; color: string };

type Face = "E" | "S" | "W" | "N";
type Act =
  | "desk"
  | "typing"
  | "lean"
  | "think"
  | "coffee"
  | "server"
  | "vault"
  | "visit"
  | "cooler"
  | "window"
  | "sofa"
  | "approval"
  | "shrug"
  | "print"
  | "eat"
  | "pingpong"
  | "arcade"
  | "tv"
  | "warehouse"
  | "security"
  | "booth"
  | "read";
export type Phase = "idle" | "thinking" | "waiting" | "writing" | "done" | "error" | "approval";

/** chair: office-chair colour, or "stool" / "beanbag"; null = sits on the furniture itself (sofa). */
type Spot = { x: number; y: number; face: Face; seat?: boolean; taken?: PersonaId | null; chair?: string | null };

type Bubble = { text: string; kind: "say" | "think" | "stream" | "ok" | "err" | "warn"; until: number; born: number };

type Look = {
  skin: string;
  hair: string;
  style: "short" | "bun" | "messy" | "long" | "slick" | "curly";
  pants: string;
  acc: "lanyard" | "glasses" | "headphones" | "scarf" | "blazer" | "cardigan";
};

type Agent = BotInfo & {
  look: Look;
  seed: number;
  x: number;
  y: number;
  face: Face;
  path: { x: number; y: number }[];
  speed: number;
  moving: boolean;
  walkPhase: number;
  sit: number;
  desk: Spot;
  spot: Spot | null;
  goal: { spot: Spot; act: Act; until?: number } | null;
  act: Act;
  actAt: number;
  until: number;
  phase: Phase;
  phaseAt: number;
  jobText: string;
  stream: string;
  note: string;
  bubble: Bubble | null;
  talkUntil: number;
  blinkAt: number;
  nextAmbient: number;
  cup: boolean;
  carry: "box" | "book" | null;
  lookAt: PersonaId | null;
  visitOf: PersonaId | null;
  typingHeat: number;
};

type Item = { x0: number; y0: number; x1: number; y1: number; h: number; draw: (c: CanvasRenderingContext2D) => void };

type Box4 = readonly [number, number, number, number];

type Npc = {
  kind: "sentry" | "concierge" | "forklift";
  name: string;
  x: number;
  y: number;
  face: Face;
  home: Spot;
  path: { x: number; y: number }[];
  route: { x: number; y: number }[];
  next: number;
  speed: number;
  moving: boolean;
  walkPhase: number;
  carry: boolean;
};

type FloorKind =
  | "raised"
  | "raisedDark"
  | "vault"
  | "concrete"
  | "rubber"
  | "corridor"
  | "wood"
  | "carpet"
  | "execWood"
  | "warmCarpet"
  | "game"
  | "stone"
  | "terrazzo"
  | "library";

type Room = { id: string; name: string; x0: number; y0: number; x1: number; y1: number; floor: FloorKind; label?: [number, number]; light: string };

/** The campus. x grows down-right on screen, y down-left; the back walls are x=0 and y=0. */
const ROOMS: Room[] = [
  { id: "hall-a", name: "Corridor", x0: 0, y0: 9, x1: GW, y1: 11, floor: "corridor", light: "255,236,205" },
  { id: "hall-b", name: "Corridor", x0: 0, y0: 22, x1: GW, y1: 24, floor: "corridor", light: "255,236,205" },
  { id: "datacenter", name: "Data center", x0: 0, y0: 0, x1: 12, y1: 9, floor: "raised", label: [6, 9.62], light: "150,190,255" },
  { id: "server", name: "Server room", x0: 12, y0: 0, x1: 18, y1: 9, floor: "raisedDark", label: [15, 9.62], light: "143,179,155" },
  { id: "vault", name: "Vault", x0: 18, y0: 0, x1: 24, y1: 9, floor: "vault", label: [21, 9.62], light: "235,200,130" },
  { id: "warehouse", name: "Warehouse", x0: 24, y0: 0, x1: 34, y1: 9, floor: "concrete", label: [29, 9.62], light: "255,240,215" },
  { id: "security", name: "Security", x0: 34, y0: 0, x1: GW, y1: 9, floor: "rubber", label: [39, 9.62], light: "255,200,150" },
  { id: "meeting", name: "Meeting room", x0: 0, y0: 11, x1: 8, y1: 16, floor: "wood", label: [4, 15.55], light: "255,236,205" },
  { id: "boardroom", name: "Boardroom", x0: 0, y0: 16, x1: 8, y1: 22, floor: "wood", label: [4, 21.55], light: "255,236,205" },
  { id: "office", name: "Open office", x0: 8, y0: 11, x1: 31, y1: 22, floor: "carpet", label: [19.5, 21.55], light: "255,240,220" },
  { id: "lead", name: "Lead's office", x0: 31, y0: 11, x1: 37, y1: 17, floor: "execWood", label: [34, 16.55], light: "255,226,190" },
  { id: "lounge", name: "Huddle room", x0: 31, y0: 17, x1: 37, y1: 22, floor: "warmCarpet", label: [34, 22.4], light: "255,220,180" },
  { id: "game", name: "Game room", x0: 37, y0: 11, x1: GW, y1: 22, floor: "game", label: [40.5, 21.55], light: "190,130,255" },
  { id: "lobby", name: "Reception", x0: 0, y0: 24, x1: 12, y1: GH, floor: "stone", label: [6, 33.55], light: "255,236,205" },
  { id: "canteen", name: "Canteen", x0: 12, y0: 24, x1: 30, y1: GH, floor: "terrazzo", label: [21, 33.55], light: "255,214,160" },
  { id: "booths", name: "Focus booths", x0: 30, y0: 24, x1: 37, y1: GH, floor: "carpet", label: [33.5, 33.55], light: "255,236,205" },
  { id: "library", name: "Library", x0: 37, y0: 24, x1: GW, y1: GH, floor: "library", label: [40.5, 33.55], light: "255,214,170" },
];

function roomAt(x: number, y: number): Room | undefined {
  return ROOMS.find((r) => !r.id.startsWith("hall") && x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) ?? ROOMS.find((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
}

/** Each bot's own desk: the lead has an office; the rest sit in the open-office pods. */
const BOT_DESKS: Record<PersonaId, [number, number]> = {
  operator: [34.2, 12.35],
  researcher: [11, 12.5],
  coder: [16, 15.5],
  writer: [21, 12.5],
  strategist: [18, 17.5],
  tutor: [23, 20.5],
};

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number };

export type AgentSnapshot = {
  id: PersonaId;
  bot: string;
  role: string;
  color: string;
  status: string;
  phase: Phase;
  where: string;
  progress: number;
  /** ms in the current phase (0 when idle). */
  since: number;
};

export type FloorSnapshot = {
  agents: AgentSnapshot[];
  counts: { desk: number; walking: number; meeting: number; coffee: number; other: number };
};

/** How long a bot thinks in the meeting room before treating the wait as background work (coffee). */
const THINK_PATIENCE = 4000;
/** People are drawn slightly larger than furniture scale so they read at a glance. */
const CHAR = 1.14;

const FACE_VEC: Record<Face, [number, number]> = {
  E: [0.894, 0.447],
  S: [-0.894, 0.447],
  W: [-0.894, -0.447],
  N: [0.894, -0.447],
};

const LOOKS: Record<PersonaId, Look> = {
  operator: { skin: "#e1b48e", hair: "#3a2a1f", style: "short", pants: "#2b2f37", acc: "lanyard" },
  researcher: { skin: "#f0caa8", hair: "#8b3f22", style: "bun", pants: "#373c47", acc: "glasses" },
  coder: { skin: "#c58b5f", hair: "#151414", style: "messy", pants: "#24272c", acc: "headphones" },
  writer: { skin: "#f3d0b1", hair: "#d6ae66", style: "long", pants: "#473933", acc: "scarf" },
  strategist: { skin: "#8a5839", hair: "#a3a3a0", style: "slick", pants: "#242a36", acc: "blazer" },
  tutor: { skin: "#69432f", hair: "#1d1612", style: "curly", pants: "#3d3932", acc: "cardigan" },
};

/* ---------------------------------------------------------------- geometry & color */

function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * HW, (x + y) * HH - z];
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function shade(c: string, f: number): string {
  const [r, g, b] = hex(c);
  const t = (v: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f)));
  return `rgb(${t(r)},${t(g)},${t(b)})`;
}

function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

function poly(c: CanvasRenderingContext2D, pts: [number, number][], fill: string | CanvasGradient | CanvasPattern, stroke?: string) {
  c.beginPath();
  c.moveTo(pts[0]![0], pts[0]![1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i]![0], pts[i]![1]);
  c.closePath();
  c.fillStyle = fill;
  c.fill();
  if (stroke) {
    c.strokeStyle = stroke;
    c.lineWidth = 0.6;
    c.stroke();
  }
}

/** Axis-aligned box in world space: top + the two faces the camera sees (+y "left", +x "right"). */
function box(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  d: number,
  h: number,
  color: string,
  z = 0,
  opts: { top?: string; left?: string; right?: string; edge?: boolean } = {},
) {
  const A = iso(x, y, z + h);
  const B = iso(x + w, y, z + h);
  const C = iso(x + w, y + d, z + h);
  const D = iso(x, y + d, z + h);
  const C0 = iso(x + w, y + d, z);
  const D0 = iso(x, y + d, z);
  const B0 = iso(x + w, y, z);
  poly(c, [D, C, C0, D0], opts.left ?? shade(color, 0.82));
  poly(c, [C, B, B0, C0], opts.right ?? shade(color, 0.64));
  poly(c, [A, B, C, D], opts.top ?? color);
  if (opts.edge !== false) {
    c.strokeStyle = "rgba(255,255,255,0.06)";
    c.lineWidth = 0.5;
    c.beginPath();
    c.moveTo(D[0], D[1]);
    c.lineTo(C[0], C[1]);
    c.lineTo(B[0], B[1]);
    c.stroke();
  }
}

/** Draw in the plane of a face that runs along x at constant y (u = screen px along it, v = px down). */
function onXFace(c: CanvasRenderingContext2D, x: number, y: number, z: number, fn: () => void) {
  const [sx, sy] = iso(x, y, z);
  c.save();
  c.transform(1, 0.5, 0, 1, sx, sy);
  fn();
  c.restore();
}

/** Same for faces running along y at constant x (u grows toward smaller y, i.e. screen-right). */
function onYFace(c: CanvasRenderingContext2D, x: number, y: number, z: number, fn: () => void) {
  const [sx, sy] = iso(x, y, z);
  c.save();
  c.transform(1, -0.5, 0, 1, sx, sy);
  fn();
  c.restore();
}

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function hash(n: number) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ---------------------------------------------------------------- the world */

export class FloorWorld {
  agents: Agent[] = [];
  onLog?: (tag: string, text: string, tone?: "signal" | "warn" | "danger") => void;

  private now = 0;
  private last = 0;
  private items: Item[] = [];
  private blocked = new Uint8Array(GW * GH);
  private walls = new Set<string>();
  private meeting: Spot[] = [];
  private coffee: Spot[] = [];
  private vaultSpots: Spot[] = [];
  private serverSpots: Spot[] = [];
  private misc: Record<"cooler" | "window" | "printer", Spot[]> = { cooler: [], window: [], printer: [] };
  private sofa: Spot[] = [];
  private deskSpots: Spot[] = [];
  private canteenSeats: Spot[] = [];
  private libSeats: Spot[] = [];
  private librarySpots: Spot[] = [];
  private boothSpots: Spot[] = [];
  private pong: Spot[] = [];
  private arcadeSpots: Spot[] = [];
  private tvSpots: Spot[] = [];
  private warehouseSpots: Spot[] = [];
  private securitySpots: Spot[] = [];
  private npcs: Npc[] = [];
  private staticBoxes: Box4[] = [];
  private staticBehind: number[][] = [];
  private kernelFlash = -1e9;
  private particles: Particle[] = [];
  private roomba = { x: 14.5, y: 16.5, path: [] as { x: number; y: number }[], face: "E" as Face, wait: 0 };
  private cache: { canvas: HTMLCanvasElement; key: string } | null = null;
  private view = { s: 1, ox: 0, oy: 0, dpr: 1 };
  /** Camera: z = zoom over "fit", (x, y) = centre in iso px. Follows the busy bots unless the operator takes over. */
  private cam = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
  private user = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
  follow = true;
  /** Bot the operator picked (ring on the floor); the camera can pin to it. */
  selected: PersonaId | null = null;
  hovered: PersonaId | null = null;
  private pinned: PersonaId | null = null;
  private ol: { body: HTMLCanvasElement; sil: HTMLCanvasElement } | null = null;
  private focus: { ids: Set<PersonaId>; until: number } = { ids: new Set(), until: 0 };
  private dt = 0.016;
  private lastPersona: PersonaId = "operator";
  private simulate: boolean;
  private simNext = 0;
  /** Explicit lines (landing page); otherwise the language's small talk. */
  private maxims: string[] | null;
  /** UI language for bubbles, statuses, logs and room names. */
  private lang: FloorLang = "en";
  private skyline: { x: number; h: number; w: number }[] = [];

  constructor(bots: BotInfo[], opts: { simulate?: boolean; maxims?: string[] } = {}) {
    this.simulate = Boolean(opts.simulate);
    this.maxims = opts.maxims?.length ? opts.maxims : null;
    this.buildMap();
    bots.slice(0, 6).forEach((b, i) => {
      const [dx, dy] = BOT_DESKS[b.id];
      const desk = this.deskSpots.find((d) => d.x === dx && d.y === dy)!;
      desk.taken = b.id;
      this.agents.push({
        ...b,
        look: LOOKS[b.id],
        seed: i * 1.7 + 0.3,
        x: desk.x,
        y: desk.y,
        face: desk.face,
        path: [],
        speed: 1.55 + hash(i) * 0.35,
        moving: false,
        walkPhase: 0,
        sit: 1,
        desk,
        spot: desk,
        goal: null,
        act: "desk",
        actAt: 0,
        until: 0,
        phase: "idle",
        phaseAt: 0,
        jobText: "",
        stream: "",
        note: "",
        bubble: null,
        talkUntil: 0,
        blinkAt: 2000 + hash(i + 9) * 3000,
        nextAmbient: 9000 + hash(i + 3) * 40000,
        cup: false,
        carry: null,
        lookAt: null,
        visitOf: null,
        typingHeat: 0.3,
      });
    });
    this.prepareSort();
    for (let i = 0; i < 14; i++) this.skyline.push({ x: i * 0.42 + hash(i) * 0.2, h: 14 + hash(i + 40) * 34, w: 0.3 + hash(i + 7) * 0.25 });
  }

  /* -------------------------------------------------------------- map */

  private block(x0: number, y0: number, x1: number, y1: number) {
    for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
        const ox = Math.min(x1, x + 1) - Math.max(x0, x);
        const oy = Math.min(y1, y + 1) - Math.max(y0, y);
        if (ox * oy > 0.3 && x >= 0 && y >= 0 && x < GW && y < GH) this.blocked[y * GW + x] = 1;
      }
  }

  private wallEdge(ax: number, ay: number, bx: number, by: number) {
    this.walls.add(`${ax},${ay}|${bx},${by}`);
    this.walls.add(`${bx},${by}|${ax},${ay}`);
  }

  /** A wall along one tile edge line, with door gaps. axis "x" runs along x at y=at; axis "y" runs along y at x=at. */
  private wallLine(axis: "x" | "y", at: number, from: number, to: number, kind: "glass" | "solid", doors: number[]) {
    const gaps = new Set(doors);
    for (let t = from; t < to; t++) {
      if (gaps.has(t)) continue;
      if (axis === "x") {
        this.wallEdge(t, at - 1, t, at);
        this.items.push(kind === "glass" ? this.glass(t, at, "x") : this.lowWall(t, at, "x"));
      } else {
        this.wallEdge(at - 1, t, at, t);
        this.items.push(kind === "glass" ? this.glass(at, t, "y") : this.lowWall(at, t, "y"));
      }
    }
    const ds = doors.filter((d) => d >= from && d < to).sort((p, q) => p - q);
    for (let i = 0; i < ds.length; ) {
      let j = i;
      while (j + 1 < ds.length && ds[j + 1] === ds[j]! + 1) j++;
      this.items.push(this.doorFrame(axis, at, ds[i]!, ds[j]! + 1, kind === "glass" ? 46 : 24));
      i = j + 1;
    }
  }

  private buildMap() {
    /* ---- walls */
    for (const at of [12, 18, 24, 34]) this.wallLine("y", at, 0, 9, "solid", []);
    this.wallLine("x", 9, 0, GW, "solid", [5, 6, 14, 15, 20, 21, 28, 29, 30, 38, 39]);
    this.wallLine("x", 11, 0, 8, "glass", [3, 4]);
    this.wallLine("y", 8, 11, 22, "glass", [18, 19]);
    this.wallLine("x", 16, 0, 8, "glass", []);
    this.wallLine("x", 22, 0, 8, "glass", [3, 4]);
    this.wallLine("y", 31, 11, 17, "glass", [13, 14]);
    this.wallLine("x", 11, 31, 37, "glass", []);
    this.wallLine("x", 17, 31, 37, "glass", []);
    this.wallLine("y", 37, 11, 22, "glass", [19, 20]);
    this.wallLine("x", 11, 37, GW, "glass", [38, 39]);
    this.wallLine("y", 12, 24, GH, "glass", [28, 29]);
    this.wallLine("y", 30, 24, GH, "glass", [28, 29]);
    this.wallLine("y", 37, 24, GH, "glass", [27, 28]);

    /* ---- data center: three rows of racks, cooling units on the back wall */
    let rk = 0;
    for (const ry of [1.3, 4.1, 6.9]) {
      for (let i = 0; i < 9; i++) this.items.push(this.rack(1.6 + i * 0.98, ry, "y", rk++));
      this.block(1.6, ry, 1.6 + 9 * 0.98, ry + 0.85);
    }
    this.items.push(this.crac(0.15, 2.3), this.crac(0.15, 5.0));
    this.block(0, 2.3, 1.1, 3.8);
    this.block(0, 5.0, 1.1, 6.5);
    this.serverSpots.push({ x: 6.1, y: 3.25, face: "N" }, { x: 8.2, y: 5.85, face: "N" }, { x: 3.6, y: 3.25, face: "N" });

    /* ---- server room: the kernel console */
    for (let i = 0; i < 5; i++) this.items.push(this.rack(12.5 + i * 1.02, 0.15, "y", 40 + i));
    this.block(12.5, 0, 17.6, 1.05);
    this.items.push(this.console(14, 3.6));
    this.block(14, 3.6, 15.6, 4.4);
    this.items.push(this.ups(16.75, 5.4));
    this.block(16.75, 5.4, 17.65, 6.9);
    this.serverSpots.push({ x: 14.8, y: 5.15, face: "N" }, { x: 13.2, y: 2.3, face: "N" }, { x: 16.2, y: 2.3, face: "N" });

    /* ---- vault: round door on the back wall, lockers, gold, a safe, memory shelves */
    this.items.push(this.shelf(18.35, 0.15, 3), this.shelf(22.7, 0.15, 4));
    this.block(18.35, 0, 19.3, 0.9);
    this.block(22.7, 0, 23.65, 0.9);
    this.items.push(this.lockers(18.15, 1.8, 4.8));
    this.block(18.15, 1.8, 18.85, 6.6);
    this.items.push(this.goldStack(21.3, 4.5));
    this.block(21.3, 4.5, 22.5, 5.3);
    this.items.push(this.safe(22.55, 6.9));
    this.block(22.55, 6.9, 23.65, 7.9);
    this.vaultSpots.push({ x: 21, y: 2.0, face: "N" }, { x: 19.45, y: 3.2, face: "W" }, { x: 19.45, y: 5.6, face: "W" }, { x: 20.4, y: 4.9, face: "E" });

    /* ---- warehouse: pallet racking, floor pallets; the forklift lives here */
    this.items.push(this.palletRack(25, 1.25, 8, 0), this.palletRack(25, 4.65, 8, 1));
    this.block(25, 1.25, 33, 2.25);
    this.block(25, 4.65, 33, 5.65);
    this.items.push(this.pallet(30.7, 7.05, 0), this.pallet(25.3, 7.15, 1));
    this.block(30.7, 7.05, 31.9, 8.05);
    this.block(25.3, 7.15, 26.5, 8.15);
    this.warehouseSpots.push({ x: 27.5, y: 3.45, face: "N" }, { x: 30.5, y: 3.45, face: "N" }, { x: 28.6, y: 6.35, face: "N" });

    /* ---- security: the CCTV wall (drawn live on the back wall), the guard's desk */
    this.items.push(this.secDesk(36, 3.4, 4.4));
    this.block(36, 3.4, 40.4, 4.5);
    this.items.push(this.rack(42.7, 6.1, "x", 50));
    this.block(42.7, 6.1, 43.6, 7.1);
    this.items.push(this.plant(34.45, 8.1, 0.9));
    this.block(34.4, 8.0, 35, 8.7);
    this.securitySpots.push({ x: 40.95, y: 5.6, face: "W" }, { x: 35.45, y: 5.9, face: "E" });

    /* ---- meeting room + boardroom */
    this.items.push(this.table(2, 12.7, 4, 1.6));
    this.block(2, 12.7, 6, 14.3);
    for (let i = 0; i < 4; i++) {
      this.meeting.push({ x: 2.5 + i, y: 12.1, face: "S", seat: true, chair: "#3a3f47" });
      this.meeting.push({ x: 2.5 + i, y: 14.9, face: "N", seat: true, chair: "#3a3f47" });
    }
    this.items.push(this.table(1.4, 17.9, 5, 2.2));
    this.block(1.4, 17.9, 6.4, 20.1);
    for (let i = 0; i < 5; i++) {
      this.meeting.push({ x: 1.9 + i, y: 17.3, face: "S", seat: true, chair: "#4b3f36" });
      this.meeting.push({ x: 1.9 + i, y: 20.7, face: "N", seat: true, chair: "#4b3f36" });
    }
    this.items.push(this.plant(7.25, 15.25, 0.9), this.plant(7.25, 21.25, 1));
    this.block(7.2, 15.2, 7.9, 15.9);
    this.block(7.2, 21.2, 7.9, 21.9);

    /* ---- open office: seven pods of two facing desks */
    for (const [x0, y0] of [
      [10, 13],
      [15, 13],
      [20, 13],
      [25, 13],
      [12, 18],
      [17, 18],
      [22, 18],
    ] as const) {
      const far: Spot = { x: x0 + 1, y: y0 - 0.5, face: "S", seat: true, chair: "#2c3036" };
      const near: Spot = { x: x0 + 1, y: y0 + 2.5, face: "N", seat: true, chair: "#2c3036" };
      this.deskSpots.push(far, near);
      this.items.push(this.desk(x0, y0, "far", far), this.desk(x0, y0 + 1, "near", near));
      this.block(x0, y0, x0 + 2, y0 + 2);
    }
    this.items.push(this.coffeeStation(8.2, 16.2));
    this.block(8.2, 16.2, 9.2, 16.8);
    this.coffee.push({ x: 8.7, y: 17.35, face: "N" });
    this.items.push(this.printer(29.2, 11.6));
    this.block(29.2, 11.6, 30.3, 12.4);
    this.misc.printer.push({ x: 29.75, y: 12.95, face: "N" });
    this.items.push(this.cooler(29.7, 19.3));
    this.block(29.7, 19.3, 30.4, 20);
    this.misc.cooler.push({ x: 30.05, y: 20.55, face: "N" });
    for (const [px, py, sc] of [
      [8.3, 11.25, 1],
      [30.4, 16.2, 1.2],
      [8.3, 21.3, 0.9],
      [19.6, 21.35, 1],
    ] as const) {
      this.items.push(this.plant(px, py, sc));
      this.block(px - 0.1, py - 0.1, px + 0.6, py + 0.6);
    }

    /* ---- lead's office (Atlas) */
    this.items.push(this.execDesk(32.7, 12.9));
    this.block(32.7, 12.9, 35.7, 13.9);
    this.items.push(this.credenza(32.8, 11.15));
    this.block(32.8, 11.15, 35.6, 11.65);
    this.deskSpots.push({ x: 34.2, y: 12.35, face: "S", seat: true, chair: "#1d1f23" });
    this.items.push(this.staticChair(33.6, 14.75, "N", "#6b5444"), this.staticChair(35.1, 14.75, "N", "#6b5444"));
    this.block(33.3, 14.45, 33.9, 15.05);
    this.block(34.8, 14.45, 35.4, 15.05);
    this.items.push(this.plant(36.3, 16.25, 1));
    this.block(36.2, 16.15, 36.9, 16.85);

    /* ---- lounge */
    this.items.push(this.sofa3(32, 20.6));
    this.block(32, 20.6, 35, 21.6);
    for (let i = 0; i < 3; i++) this.sofa.push({ x: 32.55 + i * 0.95, y: 20.35, face: "N", seat: true, chair: null });
    // Huddle table: the meeting spot on the east side, close to the lead's office.
    this.items.push(this.huddleTable(32.6, 17.9));
    this.block(32.6, 17.9, 34.2, 19.3);
    this.meeting.push(
      { x: 32.1, y: 18.6, face: "E", seat: true, chair: "#3a3f47" },
      { x: 34.7, y: 18.6, face: "W", seat: true, chair: "#3a3f47" },
      { x: 33.4, y: 17.45, face: "S", seat: true, chair: "#3a3f47" },
      { x: 33.4, y: 19.75, face: "N", seat: true, chair: "#3a3f47" },
    );
    this.items.push(this.coffeeStation(35.6, 17.25));
    this.block(35.6, 17.25, 36.6, 17.85);
    this.coffee.push({ x: 36.1, y: 18.35, face: "N" });
    this.items.push(this.plant(36.3, 21.3, 1.1));
    this.block(36.2, 21.2, 36.9, 21.9);

    /* ---- game room */
    this.items.push(this.pingPong(39, 13.4));
    this.block(39, 13.4, 42, 15);
    this.pong.push({ x: 38.4, y: 14.2, face: "E" }, { x: 42.6, y: 14.2, face: "W" });
    this.items.push(this.arcade(41.3, 11.15, 0), this.arcade(42.4, 11.15, 1));
    this.block(41.3, 11.15, 43.35, 11.95);
    this.arcadeSpots.push({ x: 41.75, y: 12.5, face: "N" }, { x: 42.85, y: 12.5, face: "N" });
    this.items.push(this.tvStand(39.4, 17));
    this.block(39.4, 17, 41.8, 17.6);
    this.tvSpots.push({ x: 39.7, y: 19.4, face: "N", seat: true, chair: "beanbag" }, { x: 41.2, y: 19.6, face: "N", seat: true, chair: "beanbag" });
    this.items.push(this.plant(43.3, 21.3, 1));
    this.block(43.2, 21.2, 43.9, 21.9);

    /* ---- reception: desk + concierge, turnstiles, waiting sofa, entrance on the left wall */
    this.items.push(this.reception(2.6, 26.8));
    this.block(2.6, 26.8, 6.6, 27.8);
    this.items.push(this.turnstile(8.6, 26.7), this.turnstile(9.7, 26.7), this.turnstile(10.8, 26.7));
    this.items.push(this.sofa3(1.3, 32.6));
    this.block(1.3, 32.6, 4.3, 33.6);
    this.items.push(this.plant(11.3, 33.2, 1.1), this.plant(5.6, 33.2, 0.9), this.plant(0.3, 24.3, 1));
    this.block(11.2, 33.1, 11.9, 33.8);
    this.block(5.5, 33.1, 6.2, 33.8);
    this.block(0.2, 24.2, 0.9, 24.9);
    this.misc.window.push({ x: 0.95, y: 26.1, face: "W" }, { x: 0.95, y: 13.6, face: "W" });

    /* ---- canteen: kitchen line, fridge, vending, eight tables */
    this.items.push(this.kitchen(13, 24.25, 8));
    this.block(13, 24.25, 21, 25.25);
    this.coffee.push({ x: 13.8, y: 25.85, face: "N" }, { x: 14.8, y: 25.85, face: "N" }, { x: 15.8, y: 25.85, face: "N" });
    this.items.push(this.fridge(21.3, 24.2));
    this.block(21.3, 24.2, 22.3, 25.1);
    this.items.push(this.vending(22.6, 24.2, 0), this.vending(23.75, 24.2, 1));
    this.block(22.6, 24.2, 24.85, 25);
    this.coffee.push({ x: 23.1, y: 25.6, face: "N" }, { x: 24.25, y: 25.6, face: "N" });
    for (const tx of [14.5, 18.5, 22.5, 26.5])
      for (const ty of [27.6, 31]) {
        this.items.push(this.diningTable(tx, ty));
        this.block(tx, ty, tx + 2, ty + 1);
        this.canteenSeats.push(
          { x: tx + 0.5, y: ty - 0.42, face: "S", seat: true, chair: "stool" },
          { x: tx + 1.5, y: ty - 0.42, face: "S", seat: true, chair: "stool" },
          { x: tx + 0.5, y: ty + 1.42, face: "N", seat: true, chair: "stool" },
          { x: tx + 1.5, y: ty + 1.42, face: "N", seat: true, chair: "stool" },
        );
      }
    this.items.push(this.plant(12.4, 33.25, 1), this.plant(29.3, 33.25, 1.1));
    this.block(12.3, 33.15, 13, 33.85);
    this.block(29.2, 33.15, 29.9, 33.85);

    /* ---- focus booths + print corner */
    for (const bx of [31, 33, 35]) {
      this.booth(bx, 25);
      this.boothSpots.push({ x: bx + 0.5, y: 25.5, face: "S", seat: true, chair: "stool" });
    }
    this.items.push(this.printer(32.2, 30.4));
    this.block(32.2, 30.4, 33.3, 31.2);
    this.misc.printer.push({ x: 32.75, y: 31.75, face: "N" });
    this.items.push(this.plant(30.4, 33.25, 0.9), this.plant(36.3, 33.25, 1));
    this.block(30.3, 33.15, 31, 33.85);
    this.block(36.2, 33.15, 36.9, 33.85);

    /* ---- library */
    for (let i = 0; i < 6; i++) this.items.push(this.shelf(37.8 + i, 24.2, 60 + i));
    this.block(37.8, 24.2, 43.75, 24.92);
    this.librarySpots.push({ x: 38.8, y: 25.6, face: "N" }, { x: 40.8, y: 25.6, face: "N" }, { x: 42.8, y: 25.6, face: "N" });
    this.items.push(this.table(39.4, 30.4, 3, 1.2));
    this.block(39.4, 30.4, 42.4, 31.6);
    this.libSeats.push(
      { x: 39.9, y: 29.85, face: "S", seat: true, chair: "#5b4a3c" },
      { x: 41.4, y: 29.85, face: "S", seat: true, chair: "#5b4a3c" },
      { x: 39.9, y: 32.15, face: "N", seat: true, chair: "#5b4a3c" },
      { x: 41.4, y: 32.15, face: "N", seat: true, chair: "#5b4a3c" },
    );
    this.items.push(this.armchair(37.6, 27.4));
    this.block(37.6, 27.4, 38.6, 28.3);
    this.items.push(this.plant(43.3, 33.2, 1.1));
    this.block(43.2, 33.1, 43.9, 33.8);

    /* ---- staff robots */
    const mk = (kind: Npc["kind"], name: string, home: Spot, speed: number): Npc => ({
      kind,
      name,
      x: home.x,
      y: home.y,
      face: home.face,
      home,
      path: [],
      route: [],
      next: 12000 + hash(home.x) * 20000,
      speed,
      moving: false,
      walkPhase: 0,
      carry: false,
    });
    this.npcs.push(
      mk("sentry", "Sentry", { x: 38.2, y: 5.25, face: "N", seat: true }, 1.4),
      mk("concierge", "Concierge", { x: 4.6, y: 26.25, face: "S" }, 0),
      mk("forklift", "Lift-01", { x: 32.4, y: 3.45, face: "W" }, 1.2),
    );
  }

  /* -------------------------------------------------------------- path finding */

  private free(x: number, y: number) {
    return x >= 0 && y >= 0 && x < GW && y < GH && !this.blocked[y * GW + x];
  }

  private edgeOk(ax: number, ay: number, bx: number, by: number) {
    return !this.walls.has(`${ax},${ay}|${bx},${by}`);
  }

  private step(ax: number, ay: number, bx: number, by: number) {
    if (!this.free(bx, by)) return false;
    if (ax !== bx && ay !== by) {
      return (
        this.free(bx, ay) &&
        this.free(ax, by) &&
        this.edgeOk(ax, ay, bx, ay) &&
        this.edgeOk(bx, ay, bx, by) &&
        this.edgeOk(ax, ay, ax, by) &&
        this.edgeOk(ax, by, bx, by)
      );
    }
    return this.edgeOk(ax, ay, bx, by);
  }

  private astar(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] | null {
    const s = sy * GW + sx;
    const goal = ty * GW + tx;
    const g = new Float32Array(GW * GH).fill(Infinity);
    const came = new Int32Array(GW * GH).fill(-1);
    const closed = new Uint8Array(GW * GH);
    const open: number[] = [s];
    g[s] = 0;
    const h = (i: number) => {
      const dx = Math.abs((i % GW) - tx);
      const dy = Math.abs(Math.floor(i / GW) - ty);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (g[open[i]!]! + h(open[i]!) < g[open[bi]!]! + h(open[bi]!)) bi = i;
      const cur = open.splice(bi, 1)[0]!;
      if (cur === goal) {
        const out: { x: number; y: number }[] = [];
        for (let i = cur; i !== -1; i = came[i]!) out.unshift({ x: (i % GW) + 0.5, y: Math.floor(i / GW) + 0.5 });
        return out;
      }
      closed[cur] = 1;
      const cx = cur % GW;
      const cy = Math.floor(cur / GW);
      for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = ny * GW + nx;
          if (nx < 0 || ny < 0 || nx >= GW || ny >= GH || closed[ni]) continue;
          if (ni !== goal && !this.step(cx, cy, nx, ny)) continue;
          if (ni === goal && !(this.edgeOk(cx, cy, nx, ny) || (dx && dy))) continue;
          const ng = g[cur]! + (dx && dy ? 1.414 : 1);
          if (ng < g[ni]!) {
            g[ni] = ng;
            came[ni] = cur;
            if (!open.includes(ni)) open.push(ni);
          }
        }
    }
    return null;
  }

  /** Straight walk possible? Samples the segment against tiles and walls. */
  private clear(a: { x: number; y: number }, b: { x: number; y: number }) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) * 5);
    let px = Math.floor(a.x);
    let py = Math.floor(a.y);
    for (let i = 1; i <= n; i++) {
      const x = Math.floor(a.x + ((b.x - a.x) * i) / n);
      const y = Math.floor(a.y + ((b.y - a.y) * i) / n);
      if (x !== px || y !== py) {
        if (!this.step(px, py, x, y)) return false;
        px = x;
        py = y;
      }
    }
    return true;
  }

  private route(a: Agent, to: Spot) {
    const sx = Math.min(GW - 1, Math.max(0, Math.floor(a.x)));
    const sy = Math.min(GH - 1, Math.max(0, Math.floor(a.y)));
    const tx = Math.floor(to.x);
    const ty = Math.floor(to.y);
    const raw = this.astar(sx, sy, tx, ty) ?? [];
    const pts = [{ x: a.x, y: a.y }, ...raw.slice(1, -1), { x: to.x, y: to.y }];
    // String-pull: keep only the corners the straight line cannot skip.
    const out: { x: number; y: number }[] = [];
    let i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.clear(pts[i]!, pts[j]!)) j--;
      out.push(pts[j]!);
      i = j;
    }
    return out;
  }

  /* -------------------------------------------------------------- behaviour */

  private agent(id: PersonaId) {
    return this.agents.find((a) => a.id === id);
  }

  private say(a: Agent, text: string, kind: Bubble["kind"], ms: number) {
    a.bubble = { text, kind, until: this.now + ms, born: a.bubble && a.bubble.kind === kind ? a.bubble.born : this.now };
    if (kind === "say" || kind === "stream") a.talkUntil = this.now + Math.min(ms, 2200);
  }

  private freeSpot(list: Spot[], a: Agent) {
    const mine = list.find((s) => s.taken === a.id);
    if (mine) return mine;
    const open = list.filter((s) => !s.taken);
    if (!open.length) return list[Math.floor(hash(this.now) * list.length)]!;
    open.sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y));
    return open[0]!;
  }

  private go(a: Agent, spot: Spot, act: Act, holdMs?: number) {
    if (a.spot && a.spot !== spot && a.spot.taken === a.id && a.spot !== a.desk) a.spot.taken = null;
    if (spot !== a.desk) spot.taken = a.id;
    a.goal = { spot, act, until: holdMs };
    a.lookAt = null;
    if (a.spot === spot && Math.hypot(a.x - spot.x, a.y - spot.y) < 0.05) {
      this.arrive(a);
      return;
    }
    a.path = this.route(a, spot);
    a.spot = null;
  }

  private arrive(a: Agent) {
    const g = a.goal;
    if (!g) return;
    a.goal = null;
    a.path = [];
    a.moving = false;
    a.x = g.spot.x;
    a.y = g.spot.y;
    a.face = g.spot.face;
    a.spot = g.spot;
    a.act = g.act;
    a.actAt = this.now;
    a.until = g.until ? this.now + g.until : 0;
    if (g.act === "coffee") a.cup = true;
    if (g.spot === a.desk) a.carry = null;
    if (g.act === "visit" && a.visitOf) {
      const host = this.agent(a.visitOf);
      if (host) host.lookAt = a.id;
    }
  }

  private home(a: Agent, act: Act = "desk") {
    this.go(a, a.desk, act);
  }

  handle(e: FloorEvent) {
    const now = this.now;
    const touch = (...ids: PersonaId[]) => {
      ids.forEach((id) => this.focus.ids.add(id));
      this.focus.until = now + 9000;
    };
    if ("persona" in e && e.type !== "approved") touch(e.persona);
    if (e.type === "handoff") touch(e.from, e.to);
    const short = (t: string, n: number) => {
      const s = t.replace(/\s+/g, " ").trim();
      return s.length > n ? `${s.slice(0, n - 1)}…` : s;
    };
    switch (e.type) {
      case "job": {
        const a = this.agent(e.persona);
        if (!a) return;
        this.lastPersona = e.persona;
        a.phase = "thinking";
        a.phaseAt = now;
        a.jobText = e.text;
        a.stream = "";
        a.note = "";
        a.cup = false;
        this.go(a, this.freeSpot(this.meeting, a), "think");
        this.say(a, short(e.text, 90), "think", 60000);
        break;
      }
      case "compiled": {
        this.kernelFlash = now;
        const a = this.agent(e.persona);
        if (a && e.model) a.note = e.model;
        break;
      }
      case "token": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.stream = e.text;
        a.typingHeat = 1;
        if (a.phase !== "writing") {
          a.phase = "writing";
          a.phaseAt = now;
          a.cup = a.act === "coffee" ? a.cup : false;
          this.home(a, "typing");
        }
        this.say(a, e.text, "stream", 60000);
        break;
      }
      case "done": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "done";
        a.phaseAt = now;
        a.note = `${e.chars.toLocaleString()} ${this.t.chars} · ${(e.ms / 1000).toFixed(1)}s${e.model ? ` · ${e.model}` : ""}`;
        this.say(a, this.t.shipped(a.note), "ok", 5200);
        if (a.spot === a.desk && !a.goal) {
          a.act = "lean";
          a.actAt = now;
        } else this.home(a, "lean");
        break;
      }
      case "error": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "error";
        a.phaseAt = now;
        this.say(a, `⚠ ${short(e.message, 70)}`, "err", 8000);
        this.go(a, this.freeSpot(this.serverSpots, a), "server", 6500);
        break;
      }
      case "stopped": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "idle";
        a.path = [];
        a.goal = null;
        a.moving = false;
        a.act = "shrug";
        a.actAt = now;
        a.until = now + 1700;
        this.say(a, this.t.stopped, "warn", 2200);
        break;
      }
      case "handoff": {
        const from = this.agent(e.from);
        const to = this.agent(e.to);
        if (!from || !to) return;
        const side: Spot = {
          x: to.desk.x + (to.desk.face === "S" ? 0.95 : -0.95),
          y: to.desk.face === "S" ? to.desk.y - 0.2 : to.desk.y + 0.25,
          face: to.desk.face === "S" ? "W" : "E",
        };
        from.visitOf = to.id;
        this.go(from, side, "visit", 2600);
        this.say(from, `→ ${to.bot}: ${short(e.text, 40)}`, "say", 4200);
        break;
      }
      case "wait": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "waiting";
        a.phaseAt = now;
        this.go(a, this.freeSpot(this.coffee, a), "coffee");
        this.say(a, this.t.waiting(short(e.pending !== undefined ? this.t.teammates(e.pending) : e.reason, 36)), "think", 60000);
        break;
      }
      case "approval": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "approval";
        a.phaseAt = now;
        this.home(a, "approval");
        this.say(a, this.t.needsApproval(short(e.action, 44)), "warn", 120000);
        break;
      }
      case "approved": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "idle";
        this.say(a, e.ok ? this.t.approved : this.t.rejected, e.ok ? "ok" : "err", 3600);
        this.home(a, "desk");
        break;
      }
      case "vault": {
        const a = this.agent(this.lastPersona) ?? this.agents[0];
        if (!a) return;
        this.go(a, this.freeSpot(this.vaultSpots, a), "vault", 4200);
        this.say(a, this.t.vaultNote, "say", 3600);
        break;
      }
      case "ambient":
        break;
    }
  }

  /** What an idle bot does between jobs. Weighted like a real office day. */
  private ambient(a: Agent) {
    const r = hash(this.now * 0.001 + a.seed);
    const idleAtDesk = this.agents.filter((o) => o !== a && o.phase === "idle" && o.spot === o.desk && !o.goal);
    const pick = <T,>(list: T[]) => list[Math.floor(hash(this.now + a.seed * 7) * list.length) % list.length]!;
    if (r < 0.15) {
      this.go(a, this.freeSpot(this.coffee, a), "coffee", 5000 + r * 30000);
      this.log(this.room("canteen"), this.t.log.coffee(a.bot));
    } else if (r < 0.27) {
      this.go(a, this.freeSpot(this.canteenSeats, a), "eat", 11000 + r * 20000);
      this.say(a, this.t.lunch, "say", 1800);
      this.log(this.room("canteen"), this.t.log.eat(a.bot));
    } else if (r < 0.37 && idleAtDesk.length && !this.pong.some((p) => p.taken)) {
      const mate = pick(idleAtDesk);
      this.go(a, this.pong[0]!, "pingpong", 16000);
      this.go(mate, this.pong[1]!, "pingpong", 16000);
      mate.nextAmbient = this.now + 30000;
      this.say(a, this.t.pingpong(mate.bot), "say", 2600);
      this.log(this.room("game"), this.t.log.pingpong(a.bot, mate.bot));
    } else if (r < 0.43) {
      this.go(a, this.freeSpot(this.arcadeSpots, a), "arcade", 9000);
      this.log(this.room("game"), this.t.log.arcade(a.bot));
    } else if (r < 0.47) {
      this.go(a, this.freeSpot(this.tvSpots, a), "tv", 10000);
    } else if (r < 0.56 && idleAtDesk.length) {
      const host = pick(idleAtDesk);
      a.visitOf = host.id;
      this.go(a, this.besideDesk(host), "visit", 4500);
      const talk = this.maxims ?? this.t.smallTalk;
      this.say(a, talk[Math.floor(r * 1000) % talk.length]!, "say", 3400);
    } else if (r < 0.62) {
      this.go(a, this.freeSpot(this.warehouseSpots, a), "warehouse", 4200);
      this.log(this.room("warehouse"), this.t.log.box(a.bot));
    } else if (r < 0.66) {
      this.go(a, this.freeSpot(this.securitySpots, a), "security", 5000);
      this.say(a, this.t.cameras, "say", 2600);
    } else if (r < 0.71) {
      this.go(a, this.freeSpot(this.boothSpots, a), "booth", 9000);
      this.log(this.room("booths"), this.t.log.booth(a.bot));
    } else if (r < 0.77) {
      this.go(a, this.freeSpot(hash(this.now) < 0.5 ? this.librarySpots : this.libSeats, a), "read", 9000);
      this.log(this.room("library"), this.t.log.read(a.bot));
    } else if (r < 0.81) {
      this.go(a, this.freeSpot(this.vaultSpots, a), "vault", 5000);
      this.log(this.room("vault"), this.t.log.vault(a.bot));
    } else if (r < 0.86) {
      this.go(a, this.freeSpot(this.sofa, a), "sofa", 8000);
    } else if (r < 0.89) {
      this.go(a, this.freeSpot(this.misc.window, a), "window", 6000);
    } else if (r < 0.93) {
      this.go(a, this.freeSpot(this.misc.printer, a), "print", 3500);
    } else if (r < 0.96) {
      this.go(a, this.freeSpot(this.misc.cooler, a), "cooler", 4000);
    } else {
      this.go(a, this.freeSpot(this.serverSpots, a), "server", 4500);
      this.log(this.room("datacenter"), this.t.log.server(a.bot));
    }
  }

  /** Standing spot beside a bot's desk, facing them. */
  private besideDesk(host: Agent): Spot {
    const s = host.desk;
    return s.face === "S" ? { x: s.x + 0.95, y: s.y - 0.15, face: "W" } : { x: s.x - 0.95, y: s.y + 0.2, face: "E" };
  }

  private room(id: string) {
    const r = ROOMS.find((x) => x.id === id);
    return r ? roomName(r, this.lang) : id;
  }

  private log(tag: string, text: string, tone?: "signal" | "warn" | "danger") {
    this.onLog?.(tag, text, tone);
  }

  /* -------------------------------------------------------------- simulation (landing page) */

  private simulateTick() {
    if (!this.simulate || this.now < this.simNext) return;
    const idle = this.agents.filter((a) => a.phase === "idle");
    if (!idle.length) {
      this.simNext = this.now + 2000;
      return;
    }
    const jobs = [
      "Brief the launch plan for the station",
      "Decide: database or localStorage",
      "Debug the hydration mismatch",
      "Draft the investor update",
      "Teach promptcraft in 20 minutes",
      "Steelman full-file injection",
    ];
    const replies = [
      "Call: compile a kernel. The file is the library; the kernel is the working set. Sacrifice: completeness per turn.",
      "Expected vs actual first. The server renders a timestamp the client re-renders — move it into an effect.",
      "Spec: one sentence a stranger can test, three musts, explicit won'ts, and an observable done-check.",
      "Objective, model, worked example, one drill, the common miss. Twenty minutes is enough for one move.",
    ];
    const team = hash(this.now) < 0.3 && idle.some((a) => a.id === "operator") && idle.length >= 3;
    if (team) {
      const lead = this.agent("operator")!;
      const workers = idle.filter((a) => a.id !== "operator").slice(0, 2);
      const job = jobs[Math.floor(hash(this.now + 1) * jobs.length)]!;
      this.fake({ type: "job", persona: "operator", text: job, source: "team" }, 0);
      workers.forEach((w, i) => {
        this.fake({ type: "handoff", from: "operator", to: w.id, text: `take the ${["research", "draft"][i]} part` }, 2600 + i * 3200);
        this.fakeReply(w.id, `Part ${i + 1}: ${job.toLowerCase()}`, replies[i % replies.length]!, 3400 + i * 3200, 2600 + i * 1800);
      });
      this.fake({ type: "wait", persona: "operator", reason: "waiting on 2 teammates" }, 2600 + workers.length * 3200 + 600);
      this.fakeReply(lead.id, "", "Merged both parts into one deliverable. Shipping.", 15000, 0, true);
      this.simNext = this.now + 26000;
      return;
    }
    const a = idle[Math.floor(hash(this.now + 2) * idle.length)]!;
    const think = 2200 + hash(this.now + 3) * 9500;
    this.fakeReply(a.id, jobs[Math.floor(hash(this.now + 4) * jobs.length)]!, replies[Math.floor(hash(this.now + 5) * replies.length)]!, 0, think);
    if (hash(this.now + 6) < 0.15) this.fake({ type: "vault", text: "Kernel budgets stay explicit." }, think + 7000);
    this.simNext = this.now + 7000 + hash(this.now + 7) * 6000;
  }

  private fake(e: FloorEvent, delay: number) {
    window.setTimeout(() => {
      this.handle(e);
      const tag = e.type === "job" ? "Job" : e.type === "done" ? "Ship" : e.type === "handoff" ? "Handoff" : e.type === "wait" ? "Wait" : e.type === "vault" ? "Vault" : "";
      if (!tag) return;
      const nm = (id: PersonaId) => this.agent(id)?.bot ?? id;
      const text =
        e.type === "job"
          ? `${nm(e.persona)} took "${e.text}"`
          : e.type === "done"
            ? `${nm(e.persona)} shipped in ${(e.ms / 1000).toFixed(1)}s`
            : e.type === "handoff"
              ? `${nm(e.from)} → ${nm(e.to)}: ${e.text}`
              : e.type === "wait"
                ? `${nm(e.persona)} waiting — ${e.reason}`
                : "note filed";
      this.log(tag, text, e.type === "done" ? "signal" : undefined);
    }, delay);
  }

  private fakeReply(id: PersonaId, job: string, reply: string, at: number, think: number, skipJob = false) {
    if (!skipJob) this.fake({ type: "job", persona: id, text: job }, at);
    const words = reply.split(" ");
    const start = at + think;
    words.forEach((_, i) => this.fake({ type: "token", persona: id, text: words.slice(0, i + 1).join(" ") }, start + i * 170));
    this.fake({ type: "done", persona: id, ms: think + words.length * 170, chars: reply.length, model: "demo" }, start + words.length * 170 + 200);
  }

  /* -------------------------------------------------------------- update */

  tick(nowMs: number) {
    const dt = Math.min(0.05, this.last ? (nowMs - this.last) / 1000 : 0.016);
    this.last = nowMs;
    this.now = nowMs;
    this.dt = dt;
    this.simulateTick();

    for (const a of this.agents) {
      // Patience runs out while thinking → background wait → coffee.
      if (a.phase === "thinking" && a.act === "think" && !a.goal && this.now - a.actAt > THINK_PATIENCE) {
        a.phase = "waiting";
        a.phaseAt = this.now;
        this.go(a, this.freeSpot(this.coffee, a), "coffee");
        this.say(a, this.t.engineCoffee, "think", 60000);
        this.log(this.t.log.waitTag, this.t.log.engineWait(a.bot));
      }
      if (a.phase === "done" && this.now - a.phaseAt > 6000) {
        a.phase = "idle";
        a.nextAmbient = this.now + 6000 + hash(this.now + a.seed) * 12000;
      }
      if (a.phase === "error" && this.now - a.phaseAt > 7000) {
        a.phase = "idle";
        if (!a.goal) this.home(a);
      }

      // Timed activities end → back to the desk.
      if (a.until && this.now > a.until && !a.goal) {
        a.until = 0;
        a.visitOf = null;
        a.cup = a.act === "coffee" ? hash(this.now) < 0.6 : a.cup;
        if (a.act === "warehouse") a.carry = "box";
        if (a.act === "read" && hash(this.now + 1) < 0.6) a.carry = "book";
        if (a.phase === "idle" || a.phase === "done") this.home(a);
        else if (a.act === "shrug") this.home(a);
      }
      if (a.act === "lean" && this.now - a.actAt > 2600 && !a.goal) a.act = "desk";

      // Ambient life for idle bots at their desks.
      if (a.phase === "idle" && a.spot === a.desk && !a.goal && this.now > a.nextAmbient) {
        this.ambient(a);
        a.nextAmbient = this.now + 14000 + hash(this.now + a.seed * 3) * 22000;
      }

      // Stand up before walking; sit down on arrival at a seat.
      const wantSit = !a.goal && a.spot?.seat && a.act !== "approval" && a.act !== "shrug" ? 1 : 0;
      if (a.goal && a.sit > 0.02) {
        a.sit = Math.max(0, a.sit - dt * 3.2);
      } else if (a.goal && a.path.length) {
        const p = a.path[0]!;
        const dx = p.x - a.x;
        const dy = p.y - a.y;
        const dist = Math.hypot(dx, dy);
        const accel = a.moving ? 1 : 0.5;
        const urgent = a.phase === "thinking" || a.phase === "writing" || a.phase === "waiting" || a.phase === "error" || a.phase === "approval";
        const pace = a.speed * (urgent ? 1.75 : 1);
        const step = pace * dt * accel;
        a.moving = true;
        a.walkPhase += dt * pace * 6.5;
        if (Math.abs(dx) > 0.001 || Math.abs(dy) > 0.001) {
          a.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
        }
        if (dist <= step) {
          a.x = p.x;
          a.y = p.y;
          a.path.shift();
          if (!a.path.length) this.arrive(a);
        } else {
          a.x += (dx / dist) * step;
          a.y += (dy / dist) * step;
        }
      } else if (a.goal && !a.path.length) {
        this.arrive(a);
      } else {
        a.moving = false;
        a.sit += (wantSit - a.sit) * Math.min(1, dt * 5);
      }

      if (a.lookAt && a.spot === a.desk) {
        const o = this.agent(a.lookAt);
        if (o && o.act === "visit") {
          const dx = o.x - a.x;
          const dy = o.y - a.y;
          a.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
        } else {
          a.lookAt = null;
          a.face = a.desk.face;
        }
      }

      if (this.now > a.blinkAt + 140) a.blinkAt = this.now + 2200 + hash(this.now + a.seed) * 3800;
      if (a.bubble && this.now > a.bubble.until) a.bubble = null;
      a.typingHeat += ((a.act === "typing" && a.phase === "writing" ? 1 : a.spot === a.desk ? 0.25 : 0) - a.typingHeat) * Math.min(1, dt * 2);
      if (a.phase === "writing" && a.spot === a.desk && !a.goal && a.act !== "typing") a.act = "typing";
      if (a.cup && hash(this.now * 0.01 + a.seed) < dt * 3) this.puff(a.x, a.y, 20);
    }

    // Coffee machine steam while someone waits there.
    if (this.agents.some((a) => a.act === "coffee" && !a.goal) && hash(this.now * 0.02) < dt * 9) this.puff(21.7, 14.4, 27);

    for (const p of this.particles) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx += (hash(p.life * 9 + p.r) - 0.5) * dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life < p.max);

    this.tickRoomba(dt);
    this.tickNpcs(dt);
  }

  private puff(wx: number, wy: number, z: number) {
    const [sx, sy] = iso(wx, wy, z);
    this.particles.push({ x: sx + (hash(this.now) - 0.5) * 2, y: sy, vx: (hash(this.now + 1) - 0.5) * 3, vy: -9 - hash(this.now + 2) * 6, life: 0, max: 1.6 + hash(this.now + 3), r: 1.2 + hash(this.now + 4) * 1.4 });
  }

  private tickRoomba(dt: number) {
    const r = this.roomba;
    if (!r.path.length) {
      r.wait -= dt;
      if (r.wait > 0) return;
      for (let tries = 0; tries < 20; tries++) {
        const tx = 9 + Math.floor(hash(this.now + tries) * 21);
        const ty = 11 + Math.floor(hash(this.now + tries + 50) * 10);
        if (!this.free(tx, ty)) continue;
        const p = this.astar(Math.floor(r.x), Math.floor(r.y), tx, ty);
        if (p) {
          r.path = p.slice(1);
          break;
        }
      }
      r.wait = 3 + hash(this.now) * 6;
      return;
    }
    const p = r.path[0]!;
    const dx = p.x - r.x;
    const dy = p.y - r.y;
    const d = Math.hypot(dx, dy);
    const s = dt * 0.9;
    if (d < s) {
      r.x = p.x;
      r.y = p.y;
      r.path.shift();
    } else {
      r.x += (dx / d) * s;
      r.y += (dy / d) * s;
      r.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
    }
  }

  /* -------------------------------------------------------------- read-outs */

  snapshot(): FloorSnapshot {
    const counts = { desk: 0, walking: 0, meeting: 0, coffee: 0, other: 0 };
    const T = this.t;
    const name = (r: Room | undefined, fallback: string) => (r ? roomName(r, this.lang) : fallback).toLowerCase();
    const agents = this.agents.map((a) => {
      const walking = Boolean(a.goal);
      const room = roomAt(a.x, a.y);
      const where = walking ? T.where.walking : a.spot === a.desk ? T.where.desk : name(room, T.where.floor);
      if (walking) counts.walking++;
      else if (a.spot === a.desk) counts.desk++;
      else if (room?.id === "meeting" || room?.id === "boardroom") counts.meeting++;
      else if (room?.id === "canteen") counts.coffee++;
      else counts.other++;
      const dest = a.goal ? name(roomAt(a.goal.spot.x, a.goal.spot.y), T.where.floor) : "";
      const doing = T.status.doing[a.act as Doing] as string | undefined;
      const status =
        a.phase === "thinking"
          ? a.goal
            ? T.status.toThink(dest)
            : T.status.thinkingIn(name(room, T.where.meeting))
          : a.phase === "waiting"
            ? a.goal
              ? T.status.bgWalk
              : T.status.bgCoffee
            : a.phase === "writing"
              ? a.goal
                ? T.status.rushing
                : T.status.writing
              : a.phase === "done"
                ? T.status.shipped(a.note)
                : a.phase === "error"
                  ? T.status.inspecting(name(room, T.where.serverRoom))
                  : a.phase === "approval"
                    ? T.status.approval
                    : walking
                      ? T.status.walkingTo(dest, a.carry === "box")
                      : a.spot === a.desk
                        ? T.status.atDesk
                        : (doing ?? T.status.inRoom(where));
      const elapsed = this.now - a.phaseAt;
      const progress =
        a.phase === "writing" ? Math.min(0.95, 0.15 + a.stream.length / 1600) : a.phase === "thinking" ? Math.min(0.5, elapsed / 12000) : a.phase === "waiting" ? 0.45 : a.phase === "done" ? 1 : 0;
      return { id: a.id, bot: a.bot, role: a.role, color: a.color, status, phase: a.phase, where, progress, since: a.phase === "idle" ? 0 : elapsed };
    });
    return { agents, counts };
  }

  /** Rooms for quick camera jumps. */
  rooms(): { id: string; name: string }[] {
    return ROOMS.filter((r) => !r.id.startsWith("hall")).map((r) => ({ id: r.id, name: roomName(r, this.lang) }));
  }

  focusRoom(id: string) {
    this.pinned = null;
    const r = ROOMS.find((x) => x.id === id);
    if (!r) return;
    const [cx, cy] = iso((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, 14);
    const span = Math.max(r.x1 - r.x0, r.y1 - r.y0);
    this.user = { z: Math.max(1.7, Math.min(2.6, 30 / span)), x: cx, y: cy };
    this.follow = false;
  }

  hit(px: number, py: number): PersonaId | null {
    const v = this.view;
    const wx = (px - v.ox) / v.s;
    const wy = (py - v.oy) / v.s;
    let best: { id: PersonaId; d: number } | null = null;
    for (const a of this.agents) {
      const [sx, sy] = iso(a.x, a.y);
      if (wx > sx - 11 && wx < sx + 11 && wy > sy - 44 && wy < sy + 5) {
        const d = Math.abs(wx - sx) + Math.abs(wy - (sy - 20));
        if (!best || d < best.d) best = { id: a.id, d };
      }
    }
    return best?.id ?? null;
  }

  /** Screen position (CSS px) of a bot's head, for DOM tooltips. */
  headAt(id: PersonaId): [number, number] | null {
    const a = this.agent(id);
    if (!a) return null;
    const [sx, sy] = iso(a.x, a.y, 45);
    return [sx * this.view.s + this.view.ox, sy * this.view.s + this.view.oy];
  }

  /* -------------------------------------------------------------- render */

  private drawRings(c: CanvasRenderingContext2D) {
    for (const a of this.agents) {
      const sel = a.id === this.selected;
      const hov = a.id === this.hovered;
      const busy = a.phase !== "idle" && a.phase !== "done";
      if (!sel && !hov && !busy) continue;
      const [sx, sy] = iso(a.x, a.y);
      const pulse = 0.5 + Math.sin(this.now / 260) * 0.5;
      c.save();
      c.translate(sx, sy);
      c.scale(1, 0.5);
      if (busy) {
        const g = c.createRadialGradient(0, 0, 4, 0, 0, 22);
        g.addColorStop(0, rgba(a.color, 0.28 + pulse * 0.12));
        g.addColorStop(1, rgba(a.color, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, 22, 0, Math.PI * 2);
        c.fill();
      }
      if (sel || hov) {
        c.strokeStyle = rgba(a.color, sel ? 0.75 + pulse * 0.25 : 0.55);
        c.lineWidth = sel ? 2.4 : 1.4;
        c.beginPath();
        c.arc(0, 0, 15 + (sel ? pulse * 2 : 0), 0, Math.PI * 2);
        c.stroke();
      }
      c.restore();
    }
  }

  setLang(lang: FloorLang) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.cache = null; // room names live in the cached static layer
  }

  private get t() {
    return floorText(this.lang);
  }

  /** Pin the camera to one bot (null to release). */
  pin(id: PersonaId | null) {
    this.pinned = id;
    this.follow = id !== null || this.follow;
  }

  get pinnedBot() {
    return this.pinned;
  }

  /** Operator camera input (CSS px). */
  zoomAt(px: number, py: number, factor: number) {
    this.pinned = null;
    const v = this.view;
    const wx = (px - v.ox) / v.s;
    const wy = (py - v.oy) / v.s;
    const z = Math.min(2.6, Math.max(1, this.user.z * factor));
    const k = z / this.user.z;
    this.user.x = wx - (wx - this.cam.x) / k;
    this.user.y = wy - (wy - this.cam.y) / k;
    this.user.z = z;
    this.follow = false;
  }

  panBy(dxPx: number, dyPx: number) {
    this.pinned = null;
    if (this.follow) {
      this.user = { ...this.cam };
      this.follow = false;
    }
    this.user.x -= dxPx / this.view.s;
    this.user.y -= dyPx / this.view.s;
  }

  resetCamera() {
    this.pinned = null;
    this.user = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
    this.follow = true;
  }

  private cameraTarget(fit: number, w: number, h: number) {
    if (this.pinned) {
      const a = this.agent(this.pinned);
      if (a) {
        const [px, py] = iso(a.x, a.y, 24);
        return { z: 2.3, x: px, y: py };
      }
    }
    if (!this.follow) return this.user;
    const active = this.agents.filter((a) => this.focus.ids.has(a.id) && (a.phase !== "idle" || this.now < this.focus.until));
    if (!active.length) {
      this.focus.ids.clear();
      return { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
    }
    // Frame every busy bot (and where they are heading).
    const pts = active.flatMap((a) => {
      const g = a.goal?.spot;
      return g ? [iso(a.x, a.y, 20), iso(g.x, g.y, 20)] : [iso(a.x, a.y, 20)];
    });
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const bw = Math.max(...xs) - Math.min(...xs) + 220;
    const bh = Math.max(...ys) - Math.min(...ys) + 160;
    const z = Math.max(1, Math.min(2.1, Math.min(w / (bw * fit), h / (bh * fit))));
    return { z, x: (Math.max(...xs) + Math.min(...xs)) / 2, y: (Math.max(...ys) + Math.min(...ys)) / 2 };
  }

  render(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
    const minX = -GH * HW - 14;
    const maxX = GW * HW + 14;
    const minY = -WALL_H - 18;
    const maxY = (GW + GH) * HH + 14;
    const fit = Math.min(w / (maxX - minX), h / (maxY - minY));
    const tgt = this.cameraTarget(fit, w, h);
    const ease = Math.min(1, this.dt * 2.2);
    this.cam.z += (tgt.z - this.cam.z) * ease;
    this.cam.x += (tgt.x - this.cam.x) * ease;
    this.cam.y += (tgt.y - this.cam.y) * ease;
    const s = fit * this.cam.z;
    // Keep the office on screen.
    const halfW = w / 2 / s;
    const halfH = h / 2 / s;
    // Keep the office on screen, but let the camera reach rooms at the edges.
    const mx = halfW * 0.55;
    const my = halfH * 0.55;
    const cx = (maxX - minX) / 2 < halfW ? (minX + maxX) / 2 : Math.min(maxX - mx, Math.max(minX + mx, this.cam.x));
    const cy = (maxY - minY) / 2 < halfH ? (minY + maxY) / 2 : Math.min(maxY - my, Math.max(minY + my, this.cam.y));
    if (!this.follow) {
      this.user.x = Math.min(maxX, Math.max(minX, this.user.x));
      this.user.y = Math.min(maxY, Math.max(minY, this.user.y));
    }
    const ox = w / 2 - cx * s;
    const oy = h / 2 - cy * s;
    this.view = { s, ox, oy, dpr };

    // Static layer is cached in world space at a resolution bucket that follows the zoom target.
    const hour = new Date().getHours() + new Date().getMinutes() / 60;
    const bucket = tgt.z > 1.6 ? 2 : tgt.z > 1.15 ? 1.5 : 1;
    const k = Math.min(3.2, fit * dpr * bucket);
    const key = `${Math.round(k * 100)}:${Math.floor(hour * 6)}`;
    if (!this.cache || this.cache.key !== key) {
      const cv = document.createElement("canvas");
      cv.width = Math.ceil((maxX - minX) * k);
      cv.height = Math.ceil((maxY - minY) * k);
      const cc = cv.getContext("2d")!;
      cc.setTransform(k, 0, 0, k, -minX * k, -minY * k);
      this.drawStatic(cc, hour);
      this.cache = { canvas: cv, key };
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0a0b0c";
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(this.cache.canvas, minX, minY, maxX - minX, maxY - minY);

    this.drawWallLive(ctx, hour);
    this.drawLightPools(ctx, hour);
    this.drawRings(ctx);

    // Depth-sorted scene: furniture, partitions, empty chairs, bots, the robot vacuum.
    const dyn: Item[] = [];
    const seated = new Set<Spot>();
    for (const a of this.agents) {
      if (a.spot && !a.goal && a.spot.seat) seated.add(a.spot);
      dyn.push({ x0: a.x - 0.22, y0: a.y - 0.22, x1: a.x + 0.22, y1: a.y + 0.22, h: 40, draw: (c) => this.drawAgent(c, a) });
    }
    const seats = [...this.deskSpots, ...this.meeting, ...this.canteenSeats, ...this.libSeats, ...this.boothSpots, ...this.tvSpots];
    for (const sp of seats) {
      if (seated.has(sp) || sp.chair === null) continue;
      const pull = sp.chair === "stool" || sp.chair === "beanbag" ? 0 : sp.face === "S" ? -0.12 : 0.12;
      dyn.push({ x0: sp.x - 0.3, y0: sp.y + pull - 0.3, x1: sp.x + 0.3, y1: sp.y + pull + 0.3, h: 22, draw: (c) => this.drawChair(c, sp.x, sp.y + pull, sp.face, sp.chair ?? "#2c3036", "all") });
    }
    for (const n of this.npcs)
      dyn.push({
        x0: n.x - 0.25,
        y0: n.y - 0.25,
        x1: n.x + 0.25,
        y1: n.y + 0.25,
        h: 36,
        draw: (c) => (n.kind === "forklift" ? this.drawNpc(c, n) : this.drawOutlined(c, ...iso(n.x, n.y), (cc) => this.drawNpc(cc, n))),
      });
    const r = this.roomba;
    dyn.push({ x0: r.x - 0.25, y0: r.y - 0.25, x1: r.x + 0.25, y1: r.y + 0.25, h: 4, draw: (c) => this.drawRoomba(c) });
    const ball = this.pongBall();
    if (ball) dyn.push({ x0: ball[0] - 0.05, y0: ball[1] - 0.05, x1: ball[0] + 0.05, y1: ball[1] + 0.05, h: 30, draw: (c) => this.drawBall(c, ball) });
    for (const it of this.sorted(dyn)) it.draw(ctx);

    this.drawGlow(ctx);
    this.drawParticles(ctx);

    // Night grade + vignette in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (hour < 6.5 || hour >= 19) {
      ctx.fillStyle = "rgba(12,20,48,0.16)";
      ctx.fillRect(0, 0, w, h);
    }
    const vg = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(5,6,7,0.32)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    this.drawOverlays(ctx);
  }

  /* ---------- static layer: floors, walls, windows, signs (re-rendered on resize and every 10 minutes) */

  private drawStatic(c: CanvasRenderingContext2D, hour: number) {
    const rect = (x0: number, y0: number, x1: number, y1: number, fill: string | CanvasGradient | CanvasPattern) =>
      poly(c, [iso(x0, y0), iso(x1, y0), iso(x1, y1), iso(x0, y1)], fill);
    const line = (ax: number, ay: number, bx: number, by: number, col: string, w = 0.6) => {
      c.strokeStyle = col;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(...iso(ax, ay));
      c.lineTo(...iso(bx, by));
      c.stroke();
    };

    // Fibre noise used for carpets and concrete.
    const noise = document.createElement("canvas");
    noise.width = noise.height = 96;
    const nc = noise.getContext("2d")!;
    const img = nc.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(hash(i * 0.37) * 255);
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 22;
    }
    nc.putImageData(img, 0, 0);
    const grain = c.createPattern(noise, "repeat")!;

    const planks = (r: Room, base: string) => {
      rect(r.x0, r.y0, r.x1, r.y1, base);
      for (let y = r.y0; y < r.y1; y += 0.34) {
        line(r.x0, y, r.x1, y, "rgba(0,0,0,0.22)", 0.5);
        const j = r.x0 + hash(y * 13 + r.x0) * (r.x1 - r.x0);
        line(j, y, j, Math.min(r.y1, y + 0.34), "rgba(0,0,0,0.22)", 0.5);
      }
    };
    const tiles = (r: Room, a: string, b: string, step: number) => {
      for (let x = r.x0; x < r.x1 - 1e-6; x += step)
        for (let y = r.y0; y < r.y1 - 1e-6; y += step)
          poly(c, [iso(x, y), iso(x + step, y), iso(x + step, y + step), iso(x, y + step)], Math.round((x - r.x0) / step + (y - r.y0) / step) % 2 ? a : b);
    };
    const rug = (x0: number, y0: number, x1: number, y1: number, a: string, b: string) => {
      rect(x0, y0, x1, y1, a);
      rect(x0 + 0.22, y0 + 0.22, x1 - 0.22, y1 - 0.22, b);
      rect(x0 + 0.5, y0 + 0.5, x1 - 0.5, y1 - 0.5, a);
    };

    for (const r of ROOMS) {
      switch (r.floor) {
        case "corridor":
          rect(r.x0, r.y0, r.x1, r.y1, "#3a3833");
          rect(r.x0, r.y0, r.x1, r.y1, grain);
          for (let x = r.x0; x < r.x1; x += 2) line(x, r.y0, x, r.y1, "rgba(255,255,255,0.04)");
          break;
        case "raised":
        case "raisedDark":
          for (let x = r.x0; x < r.x1; x++)
            for (let y = r.y0; y < r.y1; y++) {
              const base = r.floor === "raised" ? ((x + y) % 3 === 0 ? "#272c33" : "#232830") : (x + y) % 3 === 0 ? "#22262b" : "#1f2327";
              poly(c, [iso(x + 0.04, y + 0.04), iso(x + 0.96, y + 0.04), iso(x + 0.96, y + 0.96), iso(x + 0.04, y + 0.96)], base);
              if ((x * 7 + y) % 4 === 0) {
                c.fillStyle = r.floor === "raised" ? "rgba(150,190,255,0.10)" : "rgba(143,179,155,0.10)";
                for (let k = 0; k < 9; k++) {
                  const [px, py] = iso(x + 0.25 + (k % 3) * 0.25, y + 0.25 + Math.floor(k / 3) * 0.25);
                  c.fillRect(px - 0.4, py - 0.3, 0.8, 0.6);
                }
              }
            }
          break;
        case "vault":
          rect(r.x0, r.y0, r.x1, r.y1, "#26231f");
          tiles(r, "#2b2722", "#24211d", 1.5);
          for (let i = 0; i < 6; i++) line(r.x0 + hash(i) * 6, r.y0, r.x0 + hash(i + 9) * 6, r.y1, "rgba(255,255,255,0.03)", 0.4);
          rect(19.6, 2.7, 22.6, 6.3, "#3a2e1c");
          rect(19.8, 2.9, 22.4, 6.1, "#26231f");
          line(19.8, 2.9, 22.4, 2.9, "rgba(214,178,100,0.6)", 0.8);
          line(19.8, 6.1, 22.4, 6.1, "rgba(214,178,100,0.6)", 0.8);
          break;
        case "concrete":
          rect(r.x0, r.y0, r.x1, r.y1, "#3b3b39");
          rect(r.x0, r.y0, r.x1, r.y1, grain);
          // Safety lanes + bay markings.
          line(r.x0 + 0.4, 3.45, r.x1 - 0.4, 3.45, "rgba(214,178,60,0.55)", 1.2);
          line(r.x0 + 0.4, 6.4, r.x1 - 0.4, 6.4, "rgba(214,178,60,0.55)", 1.2);
          for (let x = 25; x < 33; x += 2) {
            line(x, 2.35, x, 2.75, "rgba(214,178,60,0.4)", 0.8);
            line(x, 5.75, x, 6.15, "rgba(214,178,60,0.4)", 0.8);
          }
          for (let i = 0; i < 5; i++) line(26 + hash(i) * 6, 7.2, 27 + hash(i + 3) * 6, 8.6, "rgba(0,0,0,0.18)", 1.6);
          break;
        case "rubber":
          tiles(r, "#262a2e", "#23272b", 0.5);
          break;
        case "wood":
          planks(r, "#4b3a2b");
          break;
        case "carpet":
          rect(r.x0, r.y0, r.x1, r.y1, "#2e3238");
          rect(r.x0, r.y0, r.x1, r.y1, grain);
          for (let x = r.x0; x <= r.x1; x += 2) line(x, r.y0, x, r.y1, "rgba(255,255,255,0.03)");
          for (let y = r.y0; y <= r.y1; y += 2) line(r.x0, y, r.x1, y, "rgba(255,255,255,0.03)");
          if (r.id === "office") {
            // Walkway runner through the pods.
            rect(r.x0 + 0.5, 16.1, r.x1 - 0.5, 16.9, "rgba(214,211,200,0.05)");
          }
          break;
        case "execWood":
          planks(r, "#3a2b20");
          rug(32.2, 13.9, 36.2, 16.4, "#5a2f2a", "#6d3a31");
          break;
        case "warmCarpet":
          rect(r.x0, r.y0, r.x1, r.y1, "#3a3129");
          rect(r.x0, r.y0, r.x1, r.y1, grain);
          rug(32, 18.4, 36.6, 21.8, "#4b5a6e", "#55667c");
          break;
        case "game":
          rect(r.x0, r.y0, r.x1, r.y1, "#231d2c");
          for (let x = r.x0; x < r.x1; x++)
            for (let y = r.y0; y < r.y1; y++) {
              if (hash(x * 31 + y) > 0.75) {
                const [px, py] = iso(x + 0.5, y + 0.5);
                c.fillStyle = hash(x + y * 3) > 0.5 ? "rgba(143,220,200,0.25)" : "rgba(200,140,255,0.25)";
                c.fillRect(px - 1, py - 0.5, 2, 1);
              }
            }
          rect(38.2, 12.6, 42.8, 15.8, "rgba(80,150,140,0.12)");
          break;
        case "stone":
          rect(r.x0, r.y0, r.x1, r.y1, "#36342f");
          for (let i = 0; i < 9; i++) {
            const g = c.createLinearGradient(...iso(i * 1.3, 24), ...iso(i * 1.3 + 0.8, GH));
            g.addColorStop(0, "rgba(255,255,255,0)");
            g.addColorStop(0.5, "rgba(255,255,255,0.03)");
            g.addColorStop(1, "rgba(255,255,255,0)");
            rect(i * 1.3, 24, i * 1.3 + 0.6, GH, g);
          }
          rect(0, 28.4, 1.4, 30.8, "#1c1b19");
          break;
        case "terrazzo":
          rect(r.x0, r.y0, r.x1, r.y1, "#3d3a35");
          for (let i = 0; i < 900; i++) {
            const [px, py] = iso(r.x0 + hash(i) * (r.x1 - r.x0), r.y0 + hash(i + 1000) * (r.y1 - r.y0));
            c.fillStyle = ["rgba(214,211,200,0.18)", "rgba(184,115,95,0.22)", "rgba(20,20,20,0.25)"][i % 3]!;
            c.fillRect(px, py, 0.8, 0.5);
          }
          break;
        case "library":
          planks(r, "#3b2f25");
          rug(38.6, 26.6, 43.2, 33.2, "#2f4a5c", "#36556a");
          break;
      }
    }

    // Soft contact shadows under furniture (light from the back-left, so they fall forward).
    for (const it of this.items) {
      const w = it.x1 - it.x0;
      const d = it.y1 - it.y0;
      if (w < 0.25 || d < 0.25 || it.h < 5) continue;
      const k = Math.min(0.5, 0.2 + it.h / 140);
      for (let i = 0; i < 4; i++) {
        const e = 0.04 + i * 0.08;
        const ox = 0.1 + i * 0.05;
        const oy = 0.07 + i * 0.035;
        poly(
          c,
          [iso(it.x0 - e + ox, it.y0 - e + oy), iso(it.x1 + e + ox, it.y0 - e + oy), iso(it.x1 + e + ox, it.y1 + e + oy), iso(it.x0 - e + ox, it.y1 + e + oy)],
          `rgba(0,0,0,${(k / 4).toFixed(3)})`,
        );
      }
    }

    // Ambient occlusion where floor meets the back walls.
    const ao = (from: [number, number], to: [number, number], pts: [number, number][]) => {
      const g = c.createLinearGradient(from[0], from[1], to[0], to[1]);
      g.addColorStop(0, "rgba(0,0,0,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      poly(c, pts, g);
    };
    ao(iso(6, 0), iso(6, 1.2), [iso(0, 0), iso(GW, 0), iso(GW, 1.2), iso(0, 1.2)]);
    ao(iso(0, 6), iso(1.2, 6), [iso(0, 0), iso(1.2, 0), iso(1.2, GH), iso(0, GH)]);

    // Back walls, toned per room.
    const wallY = (x0: number, x1: number, col: string) => {
      const g = c.createLinearGradient(0, iso(x0, 0, WALL_H)[1], 0, iso(x0, 0, 0)[1]);
      g.addColorStop(0, shade(col, 1.08));
      g.addColorStop(1, shade(col, 0.8));
      poly(c, [iso(x0, 0, 0), iso(x1, 0, 0), iso(x1, 0, WALL_H), iso(x0, 0, WALL_H)], g);
    };
    const wallX = (y0: number, y1: number, col: string) => {
      const g = c.createLinearGradient(0, iso(0, y0, WALL_H)[1], 0, iso(0, y0, 0)[1]);
      g.addColorStop(0, col);
      g.addColorStop(1, shade(col, 0.72));
      poly(c, [iso(0, y0, 0), iso(0, y1, 0), iso(0, y1, WALL_H), iso(0, y0, WALL_H)], g);
    };
    wallY(0, 12, "#2b3036");
    wallY(12, 18, "#2a2e33");
    wallY(18, 24, "#2e352f");
    wallY(24, 34, "#3a3c3e");
    wallY(34, GW, "#2c2f33");
    wallX(0, 9, "#272b30");
    wallX(9, 11, "#3f3a33");
    wallX(11, 22, "#463f36");
    wallX(22, 24, "#3f3a33");
    wallX(24, GH, "#433e36");
    c.strokeStyle = "#5a554c";
    c.lineWidth = 1.6;
    c.beginPath();
    c.moveTo(...iso(0, GH, WALL_H));
    c.lineTo(...iso(0, 0, WALL_H));
    c.lineTo(...iso(GW, 0, WALL_H));
    c.stroke();
    c.strokeStyle = "#1a1917";
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(...iso(0, GH, 1.2));
    c.lineTo(...iso(0, 0, 1.2));
    c.lineTo(...iso(GW, 0, 1.2));
    c.stroke();
    // Partition lines where back-row walls meet the back wall.
    for (const x of [12, 18, 24, 34]) {
      c.strokeStyle = "rgba(0,0,0,0.35)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(...iso(x, 0, 0));
      c.lineTo(...iso(x, 0, WALL_H));
      c.stroke();
    }

    /* ---- windows (left wall): meeting room + lobby, sky by local time */
    const day = hour >= 7 && hour < 17.5;
    const dusk = (hour >= 17.5 && hour < 19.5) || (hour >= 5.5 && hour < 7);
    const windowOnX = (y0: number, y1: number) =>
      onYFace(c, 0, y1, 0, () => {
        const W = (y1 - y0) * 17.9;
        const top = -70;
        const bot = -22;
        const sky = c.createLinearGradient(0, top, 0, bot);
        if (day) {
          sky.addColorStop(0, "#8fb2c8");
          sky.addColorStop(1, "#c9d6d8");
        } else if (dusk) {
          sky.addColorStop(0, "#3c4a6a");
          sky.addColorStop(1, "#d48a5a");
        } else {
          sky.addColorStop(0, "#0c1220");
          sky.addColorStop(1, "#1d2638");
        }
        c.fillStyle = sky;
        c.fillRect(0, top, W, bot - top);
        for (const b of this.skyline) {
          const bx = (b.x * W) / 6;
          if (bx > W - 6) continue;
          c.fillStyle = day ? "rgba(90,105,115,0.75)" : "#0a0d14";
          c.fillRect(bx, bot - b.h, Math.min(b.w * 30, W - bx), b.h);
          if (!day)
            for (let k = 0; k < 8; k++) {
              if (hash(b.x * 50 + k) > 0.55) continue;
              c.fillStyle = "rgba(255,214,140,0.8)";
              c.fillRect(bx + 2 + (k % 3) * 3.2, bot - b.h + 3 + Math.floor(k / 3) * 5, 1.3, 1.7);
            }
        }
        c.fillStyle = "rgba(255,255,255,0.07)";
        for (let i = 0; i < Math.floor(W / 24); i++) {
          c.beginPath();
          c.moveTo(i * 24 + 8, top);
          c.lineTo(i * 24 + 18, top);
          c.lineTo(i * 24 + 2, bot);
          c.lineTo(i * 24 - 8, bot);
          c.closePath();
          c.fill();
        }
        c.strokeStyle = "#1c1d1f";
        c.lineWidth = 2.2;
        c.strokeRect(0, top, W, bot - top);
        const panes = Math.max(2, Math.round(W / 20));
        for (let i = 1; i < panes; i++) {
          c.beginPath();
          c.moveTo((W / panes) * i, top);
          c.lineTo((W / panes) * i, bot);
          c.stroke();
        }
        c.fillStyle = "#58534a";
        c.fillRect(-2, bot, W + 4, 2.4);
      });
    windowOnX(11.6, 15.6);
    windowOnX(24.6, 27.9);

    // Entrance (lobby) + exit sign.
    onYFace(c, 0, 30.7, 0, () => {
      const W = 2.1 * 17.9;
      c.fillStyle = "#26231f";
      c.fillRect(0, -56, W, 56);
      c.fillStyle = "rgba(143,179,155,0.18)";
      c.fillRect(4, -50, W / 2 - 6, 44);
      c.fillRect(W / 2 + 2, -50, W / 2 - 6, 44);
      c.fillStyle = "#c9c2b0";
      c.fillRect(W / 2 - 3, -26, 1.6, 7);
      c.fillRect(W / 2 + 1.4, -26, 1.6, 7);
      c.fillStyle = "#13261b";
      c.fillRect(W / 2 - 11, -66, 22, 7);
      c.fillStyle = "#8fb39b";
      c.font = "600 5px IBM Plex Mono, monospace";
      c.textAlign = "center";
      c.fillText("ENTRANCE", W / 2, -60.8);
    });

    // AXIOM wordmark behind the waiting sofa.
    onYFace(c, 0, 33.7, 0, () => {
      c.fillStyle = "#d6d3c8";
      c.font = "600 15px Cormorant Garamond, Georgia, serif";
      c.textAlign = "left";
      c.fillText("A X I O M", 3, -46);
      c.fillStyle = "#8fb39b";
      c.fillRect(3, -42, 40, 1.2);
      c.fillStyle = "rgba(214,211,200,0.55)";
      c.font = "500 4px IBM Plex Mono, monospace";
      c.fillText("OPERATOR  STATION", 4, -35);
    });

    // Data-center cooling grilles on the left wall.
    onYFace(c, 0, 8.6, 0, () => {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = "#1f2328";
        c.fillRect(6 + i * 36, -72, 28, 14);
        c.strokeStyle = "rgba(255,255,255,0.06)";
        c.lineWidth = 0.6;
        for (let k = 0; k < 5; k++) {
          c.beginPath();
          c.moveTo(7 + i * 36, -70 + k * 2.6);
          c.lineTo(33 + i * 36, -70 + k * 2.6);
          c.stroke();
        }
      }
    });

    // Vault door: a round, gold-rimmed door on the back wall.
    onXFace(c, 19.55, 0, 0, () => {
      const cx = 1.45 * 17.9;
      const cy = -34;
      c.fillStyle = "#1b1d1f";
      c.beginPath();
      c.arc(cx, cy, 31, 0, Math.PI * 2);
      c.fill();
      const g = c.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, 28);
      g.addColorStop(0, "#9aa1a6");
      g.addColorStop(1, "#4d5357");
      c.fillStyle = g;
      c.beginPath();
      c.arc(cx, cy, 27, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#c4a574";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cy, 27, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = "#2b2f33";
      c.lineWidth = 1.6;
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2;
        c.beginPath();
        c.moveTo(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 4);
        c.lineTo(cx + Math.cos(ang) * 15, cy + Math.sin(ang) * 15);
        c.stroke();
      }
      c.fillStyle = "#c4a574";
      c.beginPath();
      c.arc(cx, cy, 4.2, 0, Math.PI * 2);
      c.fill();
      for (let i = 0; i < 16; i++) {
        const ang = (i / 16) * Math.PI * 2;
        c.fillStyle = "#3a3f43";
        c.beginPath();
        c.arc(cx + Math.cos(ang) * 23.5, cy + Math.sin(ang) * 23.5, 1.1, 0, Math.PI * 2);
        c.fill();
      }
    });

    // Warehouse roll-up door with hazard stripes.
    onXFace(c, 26.2, 0, 0, () => {
      const W = 5.4 * 17.9;
      c.fillStyle = "#4a4d50";
      c.fillRect(0, -60, W, 60);
      c.strokeStyle = "rgba(0,0,0,0.3)";
      c.lineWidth = 0.7;
      for (let y = -58; y < 0; y += 3) {
        c.beginPath();
        c.moveTo(0, y);
        c.lineTo(W, y);
        c.stroke();
      }
      for (let i = 0; i < W / 6; i++) {
        c.fillStyle = i % 2 ? "#d6b23c" : "#1e1e1e";
        c.fillRect(i * 6, -64, 6, 4);
      }
      c.fillStyle = "#c45c4a";
      c.fillRect(W + 4, -40, 3, 5);
      c.fillStyle = "#8fb39b";
      c.fillRect(W + 4, -33, 3, 5);
    });

    // Room signs on the back walls.
    const sign = (x: number, text: string) =>
      onXFace(c, x, 0, 0, () => {
        c.font = "600 5.4px IBM Plex Mono, monospace";
        const tw = c.measureText(text).width;
        c.fillStyle = "rgba(0,0,0,0.38)";
        rr(c, 0, -80, tw + 10, 9, 2);
        c.fill();
        c.fillStyle = "#d6d3c8";
        c.textAlign = "left";
        c.fillText(text, 5, -73.6);
      });
    const S = this.t.signs;
    sign(0.9, S.datacenter);
    sign(12.4, S.server);
    sign(18.4, S.vault);
    sign(24.4, S.warehouse);
    sign(34.4, S.security);

    // Floor labels (pills), like a floor plan.
    for (const r of ROOMS) {
      if (!r.label) continue;
      const [sx, sy] = iso(r.label[0], r.label[1]);
      const text = roomName(r, this.lang).toUpperCase();
      c.font = "600 5.6px IBM Plex Mono, monospace";
      const tw = c.measureText(text).width;
      c.fillStyle = "rgba(10,11,12,0.74)";
      rr(c, sx - tw / 2 - 4.5, sy - 4.8, tw + 9, 9.6, 4.8);
      c.fill();
      c.fillStyle = "rgba(214,211,200,0.85)";
      c.textAlign = "center";
      c.fillText(text, sx, sy + 2);
    }
  }

  /* ---------- live wall details: TV, clock, rack LEDs glow */

  private drawWallLive(c: CanvasRenderingContext2D, hour: number) {
    const t = this.now / 1000;

    // Boardroom TV (left wall) showing the kernel spine compiling.
    onYFace(c, 0, 20.6, 0, () => {
      const W = 3.2 * 17.9;
      c.fillStyle = "#0b0c0e";
      c.fillRect(-1.5, -62, W + 3, 30);
      c.fillStyle = "#101418";
      c.fillRect(0, -60.5, W, 27);
      const bars = 34;
      for (let i = 0; i < bars; i++) {
        const lit = (i + Math.floor(t * 3)) % bars < 12 || i < 4;
        c.fillStyle = lit ? (i < 4 ? "#d6d3c8" : "#8fb39b") : "#22282d";
        c.fillRect(2 + (i * (W - 4)) / bars, -48, (W - 4) / bars - 0.6, 10);
      }
      c.fillStyle = "rgba(214,211,200,0.75)";
      c.font = "600 4px IBM Plex Mono, monospace";
      c.textAlign = "left";
      c.fillText("KERNEL SPINE · LIVE", 2.5, -53);
    });

    // Wall clock in the corridor (real time).
    onYFace(c, 0, 10.6, 0, () => {
      const d = new Date();
      const cx = 10;
      const cy = -62;
      c.fillStyle = "#e8e6df";
      c.beginPath();
      c.arc(cx, cy, 6.5, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "#2b2b2b";
      c.lineWidth = 0.9;
      c.stroke();
      const hand = (ang: number, len: number, wdt: number) => {
        c.lineWidth = wdt;
        c.beginPath();
        c.moveTo(cx, cy);
        c.lineTo(cx + Math.sin(ang) * len, cy - Math.cos(ang) * len);
        c.stroke();
      };
      hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 3.4, 1);
      hand(d.getMinutes() * (Math.PI / 30), 5, 0.6);
      c.strokeStyle = "#b8735f";
      hand(d.getSeconds() * (Math.PI / 30), 5.2, 0.3);
    });

    // Security CCTV wall: 5 × 3 live feeds. Each feed shows a room and the bots inside it, right now.
    onXFace(c, 35.1, 0, 0, () => {
      const feeds = ["office", "meeting", "boardroom", "canteen", "lobby", "game", "lounge", "lead", "datacenter", "server", "vault", "warehouse", "booths", "library", "hall-b"];
      const cols = 5;
      const sw = 25;
      const sh = 13;
      c.fillStyle = "#0b0c0e";
      c.fillRect(-2, -70, cols * (sw + 2) + 2, 3 * (sh + 2) + 2);
      feeds.forEach((id, i) => {
        const r = ROOMS.find((x) => x.id === id)!;
        const fx = (i % cols) * (sw + 2);
        const fy = -68 + Math.floor(i / cols) * (sh + 2);
        c.fillStyle = "#121a16";
        c.fillRect(fx, fy, sw, sh);
        // Room outline + bots as dots.
        c.strokeStyle = "rgba(143,179,155,0.35)";
        c.lineWidth = 0.4;
        c.strokeRect(fx + 1.5, fy + 1.5, sw - 3, sh - 3);
        for (const a of this.agents) {
          if (a.x < r.x0 || a.x >= r.x1 || a.y < r.y0 || a.y >= r.y1) continue;
          const px = fx + 1.5 + ((a.x - r.x0) / (r.x1 - r.x0)) * (sw - 3);
          const py = fy + 1.5 + ((a.y - r.y0) / (r.y1 - r.y0)) * (sh - 3);
          c.fillStyle = a.color;
          c.fillRect(px - 0.8, py - 0.8, 1.6, 1.6);
        }
        for (const n of this.npcs) {
          if (n.x < r.x0 || n.x >= r.x1 || n.y < r.y0 || n.y >= r.y1) continue;
          c.fillStyle = "#c4a574";
          c.fillRect(fx + 1.5 + ((n.x - r.x0) / (r.x1 - r.x0)) * (sw - 3) - 0.6, fy + 1.5 + ((n.y - r.y0) / (r.y1 - r.y0)) * (sh - 3) - 0.6, 1.2, 1.2);
        }
        // Scanline + label + REC dot.
        c.fillStyle = "rgba(255,255,255,0.05)";
        c.fillRect(fx, fy + ((t * 6 + i * 3) % sh), sw, 0.8);
        c.fillStyle = "rgba(214,211,200,0.7)";
        c.font = "600 2.4px IBM Plex Mono, monospace";
        c.textAlign = "left";
        c.fillText(roomName(r, this.lang).toUpperCase().slice(0, 12), fx + 1.6, fy + sh - 1.2);
        if (Math.floor(t * 1.5 + i) % 2) {
          c.fillStyle = "#c45c4a";
          c.beginPath();
          c.arc(fx + sw - 2.2, fy + 2.2, 0.7, 0, Math.PI * 2);
          c.fill();
        }
      });
    });
    void hour;
  }

  private drawLightPools(c: CanvasRenderingContext2D, hour: number) {
    const night = hour < 7 || hour >= 18;
    c.save();
    c.globalCompositeOperation = "screen";
    const pool = (x: number, y: number, k: number, rgb: string, rad = 70) => {
      const [sx, sy] = iso(x, y);
      const flick = 0.96 + Math.sin(this.now / 900 + x * 1.7) * 0.02;
      c.save();
      c.translate(sx, sy);
      c.scale(1, 0.5);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, rad);
      const a = (night ? 0.2 : 0.13) * k * flick;
      g.addColorStop(0, `rgba(${rgb},${a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g;
      c.fillRect(-rad, -rad, rad * 2, rad * 2);
      c.restore();
    };
    for (const r of ROOMS) {
      const w = r.x1 - r.x0;
      const d = r.y1 - r.y0;
      const nx = Math.max(1, Math.round(w / 6));
      const ny = Math.max(1, Math.round(d / 6));
      for (let i = 0; i < nx; i++)
        for (let j = 0; j < ny; j++) pool(r.x0 + ((i + 0.5) * w) / nx, r.y0 + ((j + 0.5) * d) / ny, r.id.startsWith("hall") ? 0.55 : 0.9, r.light);
    }
    // Game-room neon.
    const neon = 0.5 + Math.sin(this.now / 700) * 0.15;
    pool(40.5, 14.2, neon * 1.6, "143,220,200", 60);
    pool(42.3, 12.2, neon * 1.4, "200,140,255", 50);
    // Vending machines + fridge glow.
    pool(23.6, 25.2, 1.1, "140,200,255", 36);
    // Daylight through the windows.
    if (!night) {
      const sun = (y0: number, y1: number) => {
        const g = c.createLinearGradient(...iso(0, (y0 + y1) / 2), ...iso(5, (y0 + y1) / 2 + 2));
        g.addColorStop(0, "rgba(220,235,240,0.12)");
        g.addColorStop(1, "rgba(220,235,240,0)");
        poly(c, [iso(0, y0), iso(0, y1), iso(5, y1 + 2), iso(5, y0 + 2)], g);
      };
      sun(11.6, 15.6);
      sun(24.6, 27.9);
    }
    // Compile flash: server console, then a wave down the data-center rows.
    const k = Math.max(0, 1 - (this.now - this.kernelFlash) / 900);
    if (k > 0) {
      pool(14.8, 4.2, 3.4 * k, "143,179,155", 90);
      pool(6, 4.5, 2.4 * k, "150,190,255", 120);
    }
    c.restore();
  }

  private drawGlow(c: CanvasRenderingContext2D) {
    c.save();
    c.globalCompositeOperation = "screen";
    for (const a of this.agents) {
      if (a.spot !== a.desk || a.goal) continue;
      const mx = a.desk.x;
      const my = a.desk.face === "S" ? a.desk.y + 1.37 : a.desk.y - 1.31;
      const [sx, sy] = iso(mx, my, 18);
      const k = 0.1 + a.typingHeat * 0.16;
      const g = c.createRadialGradient(sx, sy, 0, sx, sy, 26);
      g.addColorStop(0, `rgba(160,210,190,${k})`);
      g.addColorStop(1, "rgba(160,210,190,0)");
      c.fillStyle = g;
      c.fillRect(sx - 26, sy - 26, 52, 52);
    }
    c.restore();
  }

  private drawParticles(c: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const a = (1 - p.life / p.max) * 0.35;
      c.fillStyle = `rgba(235,235,230,${a})`;
      c.beginPath();
      c.arc(p.x, p.y, p.r * (1 + p.life * 0.8), 0, Math.PI * 2);
      c.fill();
    }
  }

  /* ---------- bubbles + name tags (drawn last, above everything) */

  private drawOverlays(c: CanvasRenderingContext2D) {
    // Screen space (CSS px): text stays the same readable size at any zoom.
    const v = this.view;
    this.drawNpcTags(c);
    const order = [...this.agents].sort((p, q) => p.x + p.y - (q.x + q.y));
    for (const a of order) {
      const [wx, wy] = iso(a.x, a.y, (40 - a.sit * 4.5) * CHAR);
      const sx = wx * v.s + v.ox;
      const sy = wy * v.s + v.oy;
      if (a.bubble) this.drawBubble(c, a, sx, sy - 3);
      else {
        c.font = "600 10.5px IBM Plex Sans, system-ui, sans-serif";
        const tw = c.measureText(a.bot).width;
        c.fillStyle = "rgba(10,11,12,0.7)";
        rr(c, sx - tw / 2 - 10, sy - 9, tw + 20, 16, 8);
        c.fill();
        c.fillStyle = a.color;
        c.beginPath();
        c.arc(sx - tw / 2 - 3.5, sy - 1, 2.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "rgba(236,236,232,0.95)";
        c.textAlign = "left";
        c.fillText(a.bot, sx - tw / 2 + 1.5, sy + 2.7);
      }
    }
  }

  private drawBubble(c: CanvasRenderingContext2D, a: Agent, sx: number, sy: number) {
    const b = a.bubble!;
    const age = this.now - b.born;
    const fade = Math.min(1, age / 180) * Math.min(1, (b.until - this.now) / 300);
    if (fade <= 0) return;
    let text = b.text.replace(/\s+/g, " ").trim();
    const maxW = 230;
    c.font = "500 11.5px IBM Plex Sans, system-ui, sans-serif";
    if (b.kind === "stream" && text.length > 140) text = `…${text.slice(-140)}`;
    const words = text.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const t = cur ? `${cur} ${w}` : w;
      if (c.measureText(t).width > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else cur = t;
    }
    if (cur) lines.push(cur);
    while (lines.length > 3) lines.shift();
    if (b.kind === "stream" && lines.length) lines[lines.length - 1] += Math.floor(this.now / 400) % 2 ? " ▍" : "";
    const tw = Math.max(...lines.map((l) => c.measureText(l).width), 30);
    const head = `${a.bot}`;
    c.font = "700 9px IBM Plex Mono, monospace";
    const hw = c.measureText(head.toUpperCase()).width;
    const bw = Math.max(tw, hw + 14) + 20;
    const bh = lines.length * 15 + 26;
    const bx = sx - bw / 2;
    const by = sy - bh - 10;
    const palette = {
      say: ["rgba(240,239,234,0.97)", "#16181b", "#5c615c"],
      think: ["rgba(214,211,200,0.96)", "#16181b", "#5c615c"],
      stream: ["rgba(16,18,21,0.95)", "#e3ebe6", "#8fb39b"],
      ok: ["rgba(143,179,155,0.97)", "#0d140f", "#1f3326"],
      err: ["rgba(196,92,74,0.97)", "#fff3ef", "#ffd9cf"],
      warn: ["rgba(214,178,120,0.98)", "#1b150c", "#5a4320"],
    }[b.kind];
    c.save();
    c.globalAlpha = fade;
    c.shadowColor = "rgba(0,0,0,0.5)";
    c.shadowBlur = 14;
    c.shadowOffsetY = 4;
    c.fillStyle = palette[0]!;
    rr(c, bx, by, bw, bh, 9);
    c.fill();
    c.shadowColor = "transparent";
    if (b.kind === "stream") {
      c.strokeStyle = "rgba(143,179,155,0.55)";
      c.lineWidth = 1;
      c.stroke();
    }
    c.fillStyle = palette[0]!;
    if (b.kind === "think") {
      c.beginPath();
      c.arc(sx + 4, by + bh + 5, 3.4, 0, Math.PI * 2);
      c.arc(sx + 1, by + bh + 11, 2, 0, Math.PI * 2);
      c.fill();
    } else {
      c.beginPath();
      c.moveTo(sx - 6, by + bh - 1);
      c.lineTo(sx + 6, by + bh - 1);
      c.lineTo(sx, by + bh + 8);
      c.closePath();
      c.fill();
    }
    // Header: who + what they are doing.
    c.fillStyle = a.color;
    c.beginPath();
    c.arc(bx + 12, by + 12, 3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = palette[2]!;
    c.font = "700 9px IBM Plex Mono, monospace";
    c.textAlign = "left";
    const T = this.t.tag;
    const tag = { say: "", think: a.phase === "waiting" ? T.wait : T.think, stream: T.write, ok: T.ok, err: T.err, warn: a.phase === "approval" ? T.approval : "" }[b.kind];
    c.fillText(`${head.toUpperCase()}${tag}`, bx + 19, by + 15);
    c.fillStyle = palette[1]!;
    c.font = "500 11.5px IBM Plex Sans, system-ui, sans-serif";
    lines.forEach((l, i) => c.fillText(l, bx + 10, by + 32 + i * 15));
    if (b.kind === "think" && a.phase === "thinking") {
      const n = Math.floor(this.now / 350) % 4;
      c.fillText(".".repeat(n), bx + 10 + c.measureText(lines[lines.length - 1] ?? "").width, by + 32 + (lines.length - 1) * 15);
    }
    c.restore();
  }

  /* ---------- the people */

  private drawChair(c: CanvasRenderingContext2D, x: number, y: number, face: Face, col: string, part: "all" | "back" | "seat") {
    const [sx, sy] = iso(x, y);
    const [dx, dy] = FACE_VEC[face];
    if (col === "stool") {
      if (part === "back") return;
      c.fillStyle = "#26282b";
      c.fillRect(sx - 0.6, sy - 7, 1.2, 7);
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.beginPath();
      c.ellipse(sx, sy, 3.2, 1.5, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#b8735f";
      c.beginPath();
      c.ellipse(sx, sy - 7.5, 4, 2, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#9c5f4e";
      c.beginPath();
      c.ellipse(sx, sy - 6.9, 4, 2, 0, 0, Math.PI);
      c.fill();
      return;
    }
    if (col === "beanbag") {
      if (part === "back") return;
      const g = c.createRadialGradient(sx - 2, sy - 6, 1, sx, sy - 3, 9);
      g.addColorStop(0, "#7a5bb0");
      g.addColorStop(1, "#43306a");
      c.fillStyle = g;
      c.beginPath();
      c.ellipse(sx, sy - 3, 8, 5, 0, 0, Math.PI * 2);
      c.fill();
      return;
    }
    if (part !== "back") {
      // Five-star base + gas lift + seat.
      c.strokeStyle = "#141518";
      c.lineWidth = 1.1;
      for (let i = 0; i < 5; i++) {
        const ang = (i / 5) * Math.PI * 2 + 0.3;
        c.beginPath();
        c.moveTo(sx, sy - 1);
        c.lineTo(sx + Math.cos(ang) * 5, sy - 1 + Math.sin(ang) * 2.4);
        c.stroke();
      }
      c.fillStyle = "#3b3f45";
      c.fillRect(sx - 0.7, sy - 7.5, 1.4, 6.5);
      c.fillStyle = shade(col, 1.15);
      c.beginPath();
      c.ellipse(sx, sy - 8, 6, 3, 0, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = shade(col, 0.8);
      c.beginPath();
      c.ellipse(sx, sy - 7.2, 6, 3, 0, 0, Math.PI);
      c.fill();
    }
    if (part !== "seat") {
      const bx = sx - dx * 4.4;
      const by = sy - dy * 4.4;
      c.fillStyle = shade(col, 0.95);
      rr(c, bx - 5, by - 22, 10, 13, 3);
      c.fill();
      c.fillStyle = "rgba(255,255,255,0.05)";
      rr(c, bx - 4, by - 21, 3, 11, 1.5);
      c.fill();
      c.fillStyle = "#2a2d31";
      c.fillRect(bx - 0.6, by - 9.5, 1.2, 3);
    }
  }

  private drawAgent(c: CanvasRenderingContext2D, a: Agent) {
    const [sx, sy] = iso(a.x, a.y);
    c.save();
    c.translate(sx, sy);
    c.scale(CHAR, CHAR);
    c.fillStyle = "rgba(0,0,0,0.34)";
    c.beginPath();
    c.ellipse(0, 0, 7.5, 3.4, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
    this.drawOutlined(c, sx, sy, (cc) => this.drawAgentBody(cc, a));
  }

  /** Renders a figure off-screen, then stamps a dark silhouette around it so it reads at any zoom. */
  private drawOutlined(c: CanvasRenderingContext2D, sx: number, sy: number, draw: (cc: CanvasRenderingContext2D) => void) {
    const { s, dpr } = this.view;
    const k = s * dpr * CHAR;
    const BW = 48;
    const BH = 66;
    const FOOT = 9;
    const pw = Math.max(1, Math.ceil(BW * k));
    const ph = Math.max(1, Math.ceil(BH * k));
    if (!this.ol) this.ol = { body: document.createElement("canvas"), sil: document.createElement("canvas") };
    const { body, sil } = this.ol;
    if (body.width !== pw || body.height !== ph) {
      body.width = sil.width = pw;
      body.height = sil.height = ph;
    }
    const bc = body.getContext("2d")!;
    bc.setTransform(1, 0, 0, 1, 0, 0);
    bc.clearRect(0, 0, pw, ph);
    bc.setTransform(k, 0, 0, k, (BW / 2 - sx) * k, (BH - FOOT - sy) * k);
    draw(bc);
    const sc = sil.getContext("2d")!;
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, pw, ph);
    sc.drawImage(body, 0, 0);
    sc.globalCompositeOperation = "source-in";
    sc.fillStyle = "rgba(6,7,8,0.9)";
    sc.fillRect(0, 0, pw, ph);
    sc.globalCompositeOperation = "source-over";
    c.save();
    c.translate(sx, sy);
    c.scale(CHAR, CHAR);
    c.translate(-sx, -sy);
    const x0 = sx - BW / 2;
    const y0 = sy - (BH - FOOT);
    const o = 0.6;
    for (const [dx, dy] of [
      [-o, 0],
      [o, 0],
      [0, -o],
      [0, o],
    ] as const)
      c.drawImage(sil, 0, 0, pw, ph, x0 + dx, y0 + dy, BW, BH);
    c.drawImage(body, 0, 0, pw, ph, x0, y0, BW, BH);
    c.restore();
  }

  private drawAgentBody(c: CanvasRenderingContext2D, a: Agent) {
    const t = this.now / 1000;
    const [sx, sy] = iso(a.x, a.y);
    const [fx, fy] = FACE_VEC[a.face];
    const front = a.face === "E" || a.face === "S";
    const sit = a.sit;
    const L = a.look;
    const seatChair = a.spot?.seat && !a.goal ? (a.spot.chair === undefined ? "#2c3036" : a.spot.chair) : null;
    const breathe = Math.sin(t * 1.7 + a.seed) * 0.35;
    const bob = a.moving ? Math.abs(Math.sin(a.walkPhase)) * 1.3 : breathe;
    const hip = 13.5 - sit * 5;
    const hipY = sy - hip - bob * 0.5;
    const shoulderY = hipY - 12.5 + (a.act === "shrug" ? -1.2 : 0);
    const lean = a.act === "typing" ? 1.4 : a.act === "lean" ? -1.6 : 0;
    const topX = sx + fx * lean;
    const topY = shoulderY + fy * lean;

    if (seatChair && front) this.drawChair(c, a.x, a.y, a.face, seatChair, "all");
    if (seatChair && !front) this.drawChair(c, a.x, a.y, a.face, seatChair, "seat");

    // Legs.
    c.lineCap = "round";
    c.strokeStyle = L.pants;
    c.lineWidth = 3.3;
    if (sit > 0.5) {
      for (const side of [-1, 1]) {
        const ox = side * 2;
        c.beginPath();
        c.moveTo(sx + ox, hipY + 1);
        const kx = sx + ox + fx * 6;
        const ky = hipY + 1 + fy * 6;
        c.lineTo(kx, ky);
        c.lineTo(kx + fx * 0.5, sy - 0.5 + fy * 4);
        c.stroke();
        this.shoe(c, kx + fx * 1.4, sy + fy * 4);
      }
    } else {
      const swing = a.moving ? Math.sin(a.walkPhase) : 0;
      for (const side of [-1, 1]) {
        const s = swing * side;
        const footX = sx + side * 1.9 + fx * s * 3.2;
        const footY = sy - 0.6 + fy * s * 3.2 - Math.max(0, s) * 1.2;
        c.beginPath();
        c.moveTo(sx + side * 2.1, hipY + 1);
        c.lineTo(footX, footY);
        c.stroke();
        this.shoe(c, footX + fx * 0.8, footY + 0.6);
      }
    }

    // Long hair hangs behind the body when seen from the front.
    if (L.style === "long" && front) {
      c.fillStyle = shade(L.hair, 0.85);
      rr(c, topX - 6.2, topY - 13, 12.4, 15, 5);
      c.fill();
    }

    // Torso with soft side lighting.
    const tw = 10.6;
    const g = c.createLinearGradient(topX - tw / 2, 0, topX + tw / 2, 0);
    g.addColorStop(0, shade(a.color, 1.12));
    g.addColorStop(1, shade(a.color, 0.72));
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(topX - tw / 2, topY + 1.5);
    c.quadraticCurveTo(topX - tw / 2, topY - 0.8, topX - tw / 2 + 2.5, topY - 0.8);
    c.lineTo(topX + tw / 2 - 2.5, topY - 0.8);
    c.quadraticCurveTo(topX + tw / 2, topY - 0.8, topX + tw / 2, topY + 1.5);
    c.lineTo(sx + 4.4, hipY + 1.6);
    c.lineTo(sx - 4.4, hipY + 1.6);
    c.closePath();
    c.fill();
    // Belt line.
    c.fillStyle = shade(L.pants, 0.7);
    c.fillRect(sx - 4.4, hipY + 0.6, 8.8, 1.2);
    this.accessoryBody(c, a, topX, topY, hipY, front);

    // Arms + hands per activity.
    const sh = (side: number): [number, number] => [topX + side * (tw / 2 - 0.4), topY + 1.6];
    const hand = (side: number): [number, number] => {
      const [ax, ay] = sh(side);
      const k = this.now - a.actAt;
      if (a.goal && a.carry === "box") return [ax + fx * 4.2 - side * 1.6, ay + 6.5 + fy * 4.2];
      if (a.goal && a.carry === "book" && side === 1) return [ax + fx * 2.5 - 1, ay + 5 + fy * 2.5];
      switch (a.goal ? "walk" : a.act) {
        case "eat": {
          const bite = Math.sin(t * 1.3 + a.seed) > 0.7;
          return side === 1 ? (bite ? [topX + fx * 1.8, topY - 2.4] : [ax + fx * 6, ay + 6 + fy * 6]) : [ax + fx * 5.5 + 1, ay + 6.5 + fy * 5.5];
        }
        case "pingpong":
          return side === 1 ? [ax + fx * 5 + Math.sin(t * 7 + a.seed) * 2.2, ay + 2 + fy * 5 + Math.cos(t * 7) * 1.4] : [ax + side * 0.5, ay + 9.5];
        case "arcade":
        case "tv":
          return [ax + fx * 5 - side * 1.2 + Math.sin(t * 16 + side) * 0.6, ay + 5 + fy * 5];
        case "warehouse":
          return [ax + fx * 4 - side * 1.2, ay - 5 + fy * 4 + Math.sin(t * 2.4 + side) * 1.2];
        case "booth":
          return side === 1 ? [topX + fx * 1 + 4.2, topY - 4] : [ax + fx * 4, ay + 7 + fy * 4];
        case "read":
          return [ax + fx * 3.5 - side * 1.4, ay + 5.5 + fy * 3.5];
        case "security":
          return side === 1 ? [ax + fx * 3 + Math.sin(t * 4) * 1.2, ay + 4 + fy * 3] : [ax + side * 0.4, ay + 10];
        case "walk": {
          const s = Math.sin(a.walkPhase) * -side;
          return [ax + fx * s * 3 + side * 0.6, ay + 9.5 + fy * s * 3];
        }
        case "typing":
        case "desk": {
          if (a.spot !== a.desk) return [ax + side * 0.4, ay + 10];
          const heat = a.typingHeat;
          const jig = Math.sin(t * (14 + side * 3) + a.seed * 5) * 0.9 * heat;
          return [ax + fx * 6.5 - side * 0.8, ay + 6.5 + fy * 6.5 + jig];
        }
        case "think":
          return side === 1 ? [topX + fx * 1.5 + 0.6, topY - 3.2] : [ax + fx * 3, ay + 7 + fy * 3];
        case "coffee":
        case "cooler": {
          if (side === 1) {
            const sip = Math.sin(t * 0.9 + a.seed) > 0.85;
            return sip ? [topX + fx * 2, topY - 2.6] : [ax + fx * 3.5, ay + 5.5 + fy * 3.5];
          }
          return [ax + side * 0.4, ay + 10];
        }
        case "lean":
          return k < 1500 ? [ax + side * 2.5, ay - 9] : [ax + side * 0.3 - fx * 2, ay + 8.5];
        case "approval":
          return side === 1 ? [ax + 1.2, ay - 11 + Math.sin(t * 5) * 0.8] : [ax + side * 0.4, ay + 10];
        case "shrug":
          return [ax + side * 4, ay - 1.5];
        case "vault":
        case "print":
          return side === 1 ? [ax + fx * 4, ay - 4 + fy * 4 + Math.sin(t * 2) * 1.5] : [ax + side * 0.4, ay + 10];
        case "visit":
          return side === 1 ? [ax + fx * 3 + Math.sin(t * 4) * 1.2, ay + 4 + fy * 3] : [ax + side * 0.4, ay + 10];
        case "server":
          return [ax + fx * 4.5 - side * 1.2, ay + 4 + fy * 4.5];
        default:
          return [ax + side * 0.4, ay + 10];
      }
    };
    const arm = (side: number) => {
      const [ax, ay] = sh(side);
      const [hx, hy] = hand(side);
      c.strokeStyle = shade(a.color, side === 1 ? 0.78 : 0.95);
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(ax, ay);
      const ex = (ax + hx) / 2 + side * 0.8;
      const ey = (ay + hy) / 2 + 0.6;
      c.quadraticCurveTo(ex, ey, hx, hy);
      c.stroke();
      c.fillStyle = L.skin;
      c.beginPath();
      c.arc(hx, hy, 1.35, 0, Math.PI * 2);
      c.fill();
      if (side === 1 && a.cup && (a.act === "coffee" || a.act === "cooler" || a.goal)) {
        c.fillStyle = "#e8e4da";
        c.fillRect(hx - 1.3, hy - 3.2, 2.6, 3.2);
        c.fillStyle = "#6b4a33";
        c.fillRect(hx - 1.3, hy - 3.2, 2.6, 0.7);
      }
    };
    arm(-1);
    arm(1);
    this.heldThing(c, a, hand(-1), hand(1));

    // Neck + head.
    const hx = topX;
    const hy = topY - 6.4 + (a.act === "think" ? 0.6 : 0);
    c.fillStyle = shade(L.skin, 0.85);
    c.fillRect(hx - 1.3, hy + 3, 2.6, 3.2);
    const hg = c.createRadialGradient(hx - 1.6, hy - 1.6, 0.5, hx, hy, 6.2);
    hg.addColorStop(0, shade(L.skin, 1.12));
    hg.addColorStop(1, shade(L.skin, 0.8));
    c.fillStyle = hg;
    c.beginPath();
    c.arc(hx, hy, 5.3, 0, Math.PI * 2);
    c.fill();
    this.hair(c, a, hx, hy, front);
    if (front) this.face(c, a, hx, hy);
    else this.hairBack(c, a, hx, hy);
    this.accessoryHead(c, a, hx, hy, front);

    if (seatChair && !front) this.drawChair(c, a.x, a.y, a.face, seatChair, "back");

    // Raised-hand marker for approvals.
    if (a.act === "approval" && !a.goal) {
      c.fillStyle = "#c4a574";
      c.beginPath();
      c.arc(hx + 9, hy - 14, 3.4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#1b150c";
      c.font = "700 5px IBM Plex Sans, sans-serif";
      c.textAlign = "center";
      c.fillText("!", hx + 9, hy - 12.2);
    }
  }

  private shoe(c: CanvasRenderingContext2D, x: number, y: number) {
    c.fillStyle = "#151515";
    c.beginPath();
    c.ellipse(x, y, 2, 1.1, 0, 0, Math.PI * 2);
    c.fill();
  }

  private face(c: CanvasRenderingContext2D, a: Agent, hx: number, hy: number) {
    const side = a.face === "E" ? 1 : -1;
    const cx = hx + side * 1.4;
    const blink = this.now > a.blinkAt && this.now < a.blinkAt + 140;
    c.fillStyle = "#1a1613";
    for (const ex of [-1.9, 1.9]) {
      c.beginPath();
      c.ellipse(cx + ex, hy + 0.3, 0.75, blink ? 0.12 : 0.95, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Brows.
    c.strokeStyle = shade(a.look.hair, 0.8);
    c.lineWidth = 0.45;
    const worry = a.phase === "error" ? 0.5 : a.act === "think" ? 0.3 : 0;
    for (const ex of [-1.9, 1.9]) {
      c.beginPath();
      c.moveTo(cx + ex - 0.9, hy - 1.6 + (ex < 0 ? worry : 0));
      c.lineTo(cx + ex + 0.9, hy - 1.6 + (ex > 0 ? worry : 0));
      c.stroke();
    }
    // Mouth: talks while a bubble is speaking/streaming.
    const talking = this.now < a.talkUntil || (a.bubble?.kind === "stream" && a.phase === "writing" && Math.floor(this.now / 160) % 3 === 0);
    c.fillStyle = "#6e3b33";
    if (talking && Math.floor(this.now / 120) % 2) {
      c.beginPath();
      c.ellipse(cx, hy + 3, 1, 0.8, 0, 0, Math.PI * 2);
      c.fill();
    } else {
      c.strokeStyle = "#6e3b33";
      c.lineWidth = 0.5;
      c.beginPath();
      c.arc(cx, hy + 2.1, 1.1, 0.2 * Math.PI, (a.phase === "error" ? 1.8 : 0.8) * Math.PI, a.phase === "error");
      c.stroke();
    }
    // Screen light on the face while typing.
    if (a.spot === a.desk && !a.goal && a.typingHeat > 0.4) {
      c.fillStyle = `rgba(160,220,195,${(a.typingHeat - 0.4) * 0.25})`;
      c.beginPath();
      c.arc(hx, hy, 5.3, 0, Math.PI * 2);
      c.fill();
    }
  }

  private hair(c: CanvasRenderingContext2D, a: Agent, hx: number, hy: number, front: boolean) {
    const L = a.look;
    c.fillStyle = L.hair;
    const side = a.face === "E" || a.face === "N" ? 1 : -1;
    switch (L.style) {
      case "short":
        c.beginPath();
        c.arc(hx, hy - 0.6, 5.6, Math.PI * 1.02, Math.PI * 1.98);
        c.quadraticCurveTo(hx + 5.6, hy - 2, hx + 4.5, hy - 1.2);
        c.lineTo(hx - 4.5, hy - 1.2);
        c.closePath();
        c.fill();
        break;
      case "bun":
        c.beginPath();
        c.arc(hx, hy - 0.4, 5.6, Math.PI, Math.PI * 2);
        c.closePath();
        c.fill();
        c.beginPath();
        c.arc(hx - side * 1.5, hy - 6.4, 2.6, 0, Math.PI * 2);
        c.fill();
        break;
      case "messy":
        c.beginPath();
        c.moveTo(hx - 5.8, hy - 0.5);
        for (let i = 0; i <= 8; i++) {
          const ang = Math.PI + (i / 8) * Math.PI;
          const r = i % 2 ? 7 : 5.8;
          c.lineTo(hx + Math.cos(ang) * r, hy - 0.8 + Math.sin(ang) * r);
        }
        c.closePath();
        c.fill();
        break;
      case "long":
        c.beginPath();
        c.arc(hx, hy - 0.5, 5.8, Math.PI * 0.95, Math.PI * 2.05);
        c.closePath();
        c.fill();
        break;
      case "slick":
        c.beginPath();
        c.arc(hx, hy - 0.8, 5.5, Math.PI * 1.05, Math.PI * 1.95);
        c.closePath();
        c.fill();
        c.strokeStyle = shade(L.hair, 1.15);
        c.lineWidth = 0.4;
        c.beginPath();
        c.moveTo(hx + side * 1.5, hy - 5.6);
        c.lineTo(hx + side * 3.6, hy - 3);
        c.stroke();
        break;
      case "curly":
        for (let i = 0; i < 9; i++) {
          const ang = Math.PI + (i / 8) * Math.PI;
          c.beginPath();
          c.arc(hx + Math.cos(ang) * 4.8, hy - 0.8 + Math.sin(ang) * 4.8, 2.2, 0, Math.PI * 2);
          c.fill();
        }
        break;
    }
    void front;
  }

  private hairBack(c: CanvasRenderingContext2D, a: Agent, hx: number, hy: number) {
    const L = a.look;
    c.fillStyle = L.hair;
    c.beginPath();
    if (L.style === "long") {
      rr(c, hx - 5.8, hy - 5.8, 11.6, 15, 5.5);
    } else if (L.style === "curly") {
      for (let i = 0; i < 12; i++) {
        const ang = (i / 12) * Math.PI * 2;
        c.moveTo(hx + Math.cos(ang) * 4.6 + 2.2, hy + Math.sin(ang) * 4.6 - 0.4);
        c.arc(hx + Math.cos(ang) * 4.6, hy + Math.sin(ang) * 4.6 - 0.4, 2.2, 0, Math.PI * 2);
      }
    } else {
      c.arc(hx, hy - 0.2, 5.6, Math.PI * 0.85, Math.PI * 2.15);
    }
    c.fill();
    if (L.style === "bun") {
      c.beginPath();
      c.arc(hx, hy - 5.2, 2.7, 0, Math.PI * 2);
      c.fill();
    }
  }

  private accessoryBody(c: CanvasRenderingContext2D, a: Agent, x: number, y: number, hipY: number, front: boolean) {
    switch (a.look.acc) {
      case "lanyard":
        if (!front) return;
        c.strokeStyle = "#8fb39b";
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(x - 2, y - 0.6);
        c.lineTo(x, y + 6);
        c.lineTo(x + 2, y - 0.6);
        c.stroke();
        c.fillStyle = "#f2f0ea";
        c.fillRect(x - 1.4, y + 6, 2.8, 3.4);
        break;
      case "blazer":
        if (!front) return;
        c.fillStyle = "#f2f0ea";
        c.beginPath();
        c.moveTo(x - 1.8, y - 0.8);
        c.lineTo(x, y + 5.5);
        c.lineTo(x + 1.8, y - 0.8);
        c.closePath();
        c.fill();
        c.strokeStyle = "#7a2f2a";
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(x, y + 0.6);
        c.lineTo(x, y + 5);
        c.stroke();
        break;
      case "cardigan":
        if (!front) return;
        c.fillStyle = "#e9e2d2";
        c.fillRect(x - 1.1, y - 0.6, 2.2, hipY - y + 1);
        break;
      case "scarf":
        c.fillStyle = "#e7d6b0";
        rr(c, x - 3.4, y - 1.6, 6.8, 2.6, 1.2);
        c.fill();
        if (front) {
          c.fillRect(x + 0.8, y + 0.6, 1.6, 4.5);
        }
        break;
      default:
        break;
    }
  }

  private accessoryHead(c: CanvasRenderingContext2D, a: Agent, hx: number, hy: number, front: boolean) {
    const side = a.face === "E" ? 1 : -1;
    if (a.look.acc === "glasses" && front) {
      c.strokeStyle = "#2b2420";
      c.lineWidth = 0.45;
      const cx = hx + side * 1.4;
      for (const ex of [-1.9, 1.9]) {
        c.beginPath();
        c.arc(cx + ex, hy + 0.3, 1.45, 0, Math.PI * 2);
        c.stroke();
      }
      c.beginPath();
      c.moveTo(cx - 0.5, hy + 0.2);
      c.lineTo(cx + 0.5, hy + 0.2);
      c.stroke();
    }
    if (a.look.acc === "headphones") {
      c.strokeStyle = "#1b1c1e";
      c.lineWidth = 1.2;
      c.beginPath();
      c.arc(hx, hy - 0.5, 6.1, Math.PI * 1.05, Math.PI * 1.95);
      c.stroke();
      c.fillStyle = "#2a2c30";
      for (const ex of [-5.6, 5.6]) {
        c.beginPath();
        c.ellipse(hx + ex, hy + 0.6, 1.5, 2.3, 0, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = "#8fb39b";
      c.fillRect(hx + 5.2, hy + 0.2, 0.8, 0.8);
    }
  }

  private drawRoomba(c: CanvasRenderingContext2D) {
    const r = this.roomba;
    const [sx, sy] = iso(r.x, r.y);
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(sx, sy + 0.5, 6, 3, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#1e2023";
    c.beginPath();
    c.ellipse(sx, sy - 1.6, 5.6, 2.8, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#2d3034";
    c.beginPath();
    c.ellipse(sx, sy - 2.6, 5.2, 2.5, 0, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = Math.floor(this.now / 600) % 2 ? "#8fb39b" : "#4d6a57";
    c.beginPath();
    c.arc(sx + FACE_VEC[r.face][0] * 3, sy - 2.8 + FACE_VEC[r.face][1] * 1.5, 0.7, 0, Math.PI * 2);
    c.fill();
  }

  /* ---------- furniture */

  private glass(x: number, y: number, axis: "x" | "y"): Item {
    const x1 = axis === "x" ? x + 1 : x + 0.05;
    const y1 = axis === "x" ? y + 0.05 : y + 1;
    return {
      x0: axis === "x" ? x : x - 0.05,
      y0: axis === "x" ? y - 0.05 : y,
      x1,
      y1,
      h: 46,
      draw: (c) => {
        const H = 46;
        const p0 = iso(x, y, 0);
        const p1 = axis === "x" ? iso(x + 1, y, 0) : iso(x, y + 1, 0);
        const q1 = axis === "x" ? iso(x + 1, y, H) : iso(x, y + 1, H);
        const q0 = iso(x, y, H);
        poly(c, [p0, p1, q1, q0], "rgba(170,205,195,0.085)");
        // Reflection streak.
        const m = 0.35 + hash(x * 3 + y) * 0.3;
        const r0 = axis === "x" ? iso(x + m, y, 4) : iso(x, y + m, 4);
        const r1 = axis === "x" ? iso(x + m + 0.12, y, H - 4) : iso(x, y + m + 0.12, H - 4);
        c.strokeStyle = "rgba(255,255,255,0.08)";
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(...r0);
        c.lineTo(...r1);
        c.stroke();
        c.strokeStyle = "#4f544f";
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(...q0);
        c.lineTo(...q1);
        c.moveTo(...iso(...(axis === "x" ? ([x, y] as const) : ([x, y] as const)), 2));
        c.lineTo(...(axis === "x" ? iso(x + 1, y, 2) : iso(x, y + 1, 2)));
        c.stroke();
        c.strokeStyle = "#3d413d";
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(...p0);
        c.lineTo(...q0);
        c.stroke();
      },
    };
  }

  private doorPosts(x: number, y: number): Item {
    return {
      x0: x,
      y0: y - 0.05,
      x1: x + 2,
      y1: y + 0.05,
      h: 46,
      draw: (c) => {
        c.strokeStyle = "#4f544f";
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(...iso(x, y, 0));
        c.lineTo(...iso(x, y, 46));
        c.lineTo(...iso(x + 2, y, 46));
        c.lineTo(...iso(x + 2, y, 0));
        c.stroke();
      },
    };
  }

  private desk(x0: number, y0: number, kind: "far" | "near", seat: Spot): Item {
    const owner = () => this.agents.find((a) => a.desk === seat);
    return {
      x0,
      y0,
      x1: x0 + 2,
      y1: y0 + 1,
      h: 24,
      draw: (c) => {
        const wood = "#7a5f46";
        // Legs / side panels.
        box(c, x0 + 0.05, y0 + 0.08, 0.08, 0.84, 11, "#2c2a27");
        box(c, x0 + 1.87, y0 + 0.08, 0.08, 0.84, 11, "#2c2a27");
        box(c, x0 + 0.1, kind === "far" ? y0 + 0.82 : y0 + 0.1, 1.8, 0.06, 7, "#33302c", 3);
        // Top.
        box(c, x0, y0, 2, 1, 1.3, wood, 11, { top: shade(wood, 1.05), left: shade(wood, 0.7), right: shade(wood, 0.55) });
        // Monitor at the far side from its seat.
        const my = kind === "far" ? y0 + 0.8 : y0 + 0.12;
        box(c, x0 + 0.92, my, 0.16, 0.06, 2.6, "#1d1e21", 12.3);
        box(c, x0 + 0.5, my, 1.0, 0.07, 8.6, "#141518", 14.8);
        const a = owner();
        if (kind === "near") {
          // Screen faces +y: visible. Content follows its owner's state.
          onXFace(c, x0 + 0.55, my + 0.07, 15.6, () => {
            const W = 0.9 * 16;
            const H = 7.2;
            const typing = a && a.spot === a.desk && !a.goal;
            c.fillStyle = typing ? "#0f1714" : "#0d0f11";
            c.fillRect(0, -H, W, H);
            if (typing) this.codeLines(c, W, H, a!);
            else {
              c.fillStyle = "rgba(143,179,155,0.35)";
              const p = (this.now / 3000 + x0) % 1;
              c.fillRect(p * (W - 3), -H / 2 - 1, 3, 2);
            }
          });
        } else {
          // Back of the monitor with a small status LED.
          onXFace(c, x0 + 0.55, my + 0.07, 15.6, () => {
            c.fillStyle = "#1a1b1e";
            c.fillRect(0, -7.2, 14.4, 7.2);
            c.fillStyle = a && a.phase === "writing" ? "#8fb39b" : "#3b4a40";
            c.fillRect(6.5, -3.2, 1.2, 1.2);
          });
        }
        // Keyboard near the seat, a mug, papers.
        const ky = kind === "far" ? y0 + 0.18 : y0 + 0.62;
        box(c, x0 + 0.55, ky, 0.9, 0.22, 0.6, "#2b2d31", 12.3, { top: "#3a3d42" });
        box(c, x0 + 1.55, ky - 0.05, 0.16, 0.16, 2.2, "#e2ddd2", 12.3);
        box(c, x0 + 0.12, ky - 0.05, 0.32, 0.4, 0.5, "#efece4", 12.3);
      },
    };
  }

  private codeLines(c: CanvasRenderingContext2D, W: number, H: number, a: Agent) {
    const rows = 6;
    const speed = a.phase === "writing" ? 6 : 1.2;
    const scroll = Math.floor(this.now / (1000 / speed));
    for (let i = 0; i < rows; i++) {
      const n = scroll + i;
      const len = 0.25 + hash(n * 1.3 + a.seed) * 0.65;
      const indent = (Math.floor(hash(n * 2.1) * 3) * W) / 12;
      c.fillStyle = hash(n * 3.7) > 0.7 ? "rgba(214,211,200,0.75)" : hash(n * 5.1) > 0.5 ? "rgba(143,179,155,0.85)" : "rgba(127,163,189,0.7)";
      c.fillRect(1 + indent, -H + 0.8 + i * 1.08, (W - 3 - indent) * len, 0.55);
    }
  }

  private rack(x: number, y: number, along: "x" | "y", i: number): Item {
    const w = along === "y" ? 0.95 : 0.85;
    const d = along === "y" ? 0.85 : 0.95;
    return {
      x0: x,
      y0: y,
      x1: x + w,
      y1: y + d,
      h: 56,
      draw: (c) => {
        box(c, x, y, w, d, 56, "#202327", 0, { top: "#2d3136" });
        const face = along === "y" ? onXFace : onYFace;
        const fx = along === "y" ? x : x + w;
        const fy = along === "y" ? y + d : y + d;
        face(c, fx, fy, 0, () => {
          const W = (along === "y" ? w : d) * 17.9 * (along === "y" ? 0.9 : 0.9);
          for (let r = 0; r < 9; r++) {
            c.fillStyle = r % 3 === 0 ? "#16181b" : "#1b1e21";
            c.fillRect(1, -52 + r * 5.6, W - 2, 4.6);
            for (let l = 0; l < 4; l++) {
              const on = hash(i * 100 + r * 10 + l + Math.floor(this.now / (180 + l * 70))) > 0.45;
              const flash = this.now - this.kernelFlash < 900;
              c.fillStyle = on ? (flash ? "#d6d3c8" : l === 3 ? "#c4a574" : "#8fb39b") : "#26302a";
              c.fillRect(2 + l * 2.2, -50.6 + r * 5.6, 1.1, 1.1);
            }
          }
        });
      },
    };
  }

  private console(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.6,
      y1: y + 0.8,
      h: 26,
      draw: (c) => {
        box(c, x, y, 1.6, 0.8, 16, "#25292d", 0, { top: "#30353a" });
        onXFace(c, x + 0.1, y + 0.8, 17, () => {
          const W = 1.4 * 16;
          c.fillStyle = "#0b100d";
          c.fillRect(0, -9, W, 9);
          const busy = this.now - this.kernelFlash < 2500;
          const p = busy ? Math.min(1, (this.now - this.kernelFlash) / 1200) : (this.now / 4000) % 1;
          c.fillStyle = "rgba(143,179,155,0.9)";
          c.fillRect(1.5, -3, (W - 3) * p, 1.4);
          c.fillStyle = "rgba(214,211,200,0.8)";
          c.font = "600 2.6px IBM Plex Mono, monospace";
          c.textAlign = "left";
          c.fillText(busy ? "COMPILING KERNEL" : "KERNEL READY", 1.5, -5.4);
        });
      },
    };
  }

  private table(x: number, y: number, w: number, d: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + w,
      y1: y + d,
      h: 12,
      draw: (c) => {
        box(c, x + 0.3, y + 0.3, 0.12, 0.12, 10, "#2a2522");
        box(c, x + w - 0.42, y + 0.3, 0.12, 0.12, 10, "#2a2522");
        box(c, x + 0.3, y + d - 0.42, 0.12, 0.12, 10, "#2a2522");
        box(c, x + w - 0.42, y + d - 0.42, 0.12, 0.12, 10, "#2a2522");
        box(c, x, y, w, d, 1.5, "#5d4636", 10, { top: "#6e5442" });
        // Laptops + notebooks.
        box(c, x + 0.6, y + 0.4, 0.5, 0.35, 0.3, "#c9c7c0", 11.5);
        box(c, x + 2.4, y + 1.1, 0.5, 0.35, 0.3, "#c9c7c0", 11.5);
        box(c, x + 1.5, y + 0.8, 0.9, 0.3, 0.2, "#efece4", 11.5);
        if (this.agents.some((a) => a.act === "think" && !a.goal)) {
          const [sx, sy] = iso(x + w / 2, y + d / 2, 13);
          c.fillStyle = "rgba(143,179,155,0.12)";
          c.beginPath();
          c.ellipse(sx, sy, 22, 9, 0, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  private shelf(x: number, y: number, i: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.95,
      y1: y + 0.72,
      h: 58,
      draw: (c) => {
        box(c, x, y, 0.95, 0.72, 58, "#4a3828", 0, { top: "#5a4532" });
        onXFace(c, x + 0.04, y + 0.72, 0, () => {
          const W = 0.87 * 17.9;
          for (let r = 0; r < 5; r++) {
            const by = -54 + r * 11;
            c.fillStyle = "#2a1f16";
            c.fillRect(0.5, by, W - 1, 9.5);
            let bx = 1;
            for (let k = 0; bx < W - 2; k++) {
              const bw = 1.2 + hash(i * 50 + r * 9 + k) * 1.6;
              const bh = 6 + hash(i * 31 + r * 7 + k) * 3;
              const hue = ["#7a3b2e", "#2f4a5c", "#5c6b3f", "#8a6f3a", "#3e3a52", "#d6d3c8"][Math.floor(hash(i + r + k * 1.3) * 6)]!;
              c.fillStyle = hue;
              c.fillRect(bx, by + 9.5 - bh, bw, bh);
              bx += bw + 0.25;
            }
          }
        });
      },
    };
  }

  private safe(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.1,
      y1: y + 1,
      h: 20,
      draw: (c) => {
        box(c, x, y, 1.1, 1, 20, "#3a3d41", 0, { top: "#4a4e53" });
        onXFace(c, x + 0.1, y + 1, 0, () => {
          c.strokeStyle = "#23262a";
          c.lineWidth = 0.8;
          c.strokeRect(1, -18, 15, 16);
          c.fillStyle = "#c4a574";
          c.beginPath();
          c.arc(8.5, -10, 2.6, 0, Math.PI * 2);
          c.fill();
          c.strokeStyle = "#3a3d41";
          c.beginPath();
          c.moveTo(8.5, -10);
          c.lineTo(8.5 + Math.cos(this.now / 2000) * 2, -10 + Math.sin(this.now / 2000) * 2);
          c.stroke();
        });
      },
    };
  }

  private armchair(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1,
      y1: y + 0.9,
      h: 14,
      draw: (c) => {
        box(c, x, y, 1, 0.9, 6, "#6d3a31");
        box(c, x, y, 1, 0.22, 14, "#7a4237");
        box(c, x, y, 0.18, 0.9, 10, "#7a4237");
        box(c, x + 0.82, y, 0.18, 0.9, 10, "#7a4237");
      },
    };
  }

  private counter(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 3,
      y1: y + 1,
      h: 28,
      draw: (c) => {
        box(c, x, y, 3, 1, 13, "#2f3236", 0, { top: "#d9d4c8", left: "#3a3d42", right: "#2a2d31" });
        onXFace(c, x, y + 1, 0, () => {
          for (let i = 0; i < 3; i++) {
            c.strokeStyle = "#24272b";
            c.lineWidth = 0.6;
            c.strokeRect(1 + i * 17.6, -12, 16.6, 10.5);
            c.fillStyle = "#8a8f88";
            c.fillRect(7 + i * 17.6, -9.5, 4, 0.8);
          }
        });
        // Espresso machine.
        box(c, x + 0.25, y + 0.15, 0.85, 0.6, 12, "#1b1c1e", 13, { top: "#2c2e31" });
        onXFace(c, x + 0.3, y + 0.75, 13, () => {
          c.fillStyle = "#3a3d42";
          c.fillRect(1, -10, 12, 3);
          c.fillStyle = this.agents.some((a) => a.act === "coffee" && !a.goal) ? "#8fb39b" : "#c45c4a";
          c.fillRect(10, -9.2, 1.2, 1.2);
          c.fillStyle = "#e8e4da";
          c.fillRect(5, -4, 3, 3.5);
        });
        // Cups + fruit bowl.
        for (let i = 0; i < 3; i++) box(c, x + 1.4 + i * 0.22, y + 0.3, 0.14, 0.14, 2.2, "#e8e4da", 13);
        const [bx, by] = iso(x + 2.5, y + 0.5, 15);
        c.fillStyle = "#c4a574";
        c.beginPath();
        c.ellipse(bx, by, 4, 1.8, 0, 0, Math.PI * 2);
        c.fill();
        for (const [ox, col] of [
          [-1.5, "#c45c4a"],
          [0.6, "#8fb39b"],
          [2, "#d9a441"],
        ] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.arc(bx + ox, by - 1.4, 1.3, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  private sofa3(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 3,
      y1: y + 1,
      h: 16,
      draw: (c) => {
        const col = "#4b5a6e";
        box(c, x, y, 3, 1, 6, col);
        for (let i = 0; i < 3; i++) box(c, x + 0.1 + i * 0.95, y + 0.05, 0.9, 0.6, 2, shade(col, 1.12), 6);
        box(c, x, y + 0.7, 3, 0.3, 15, shade(col, 0.95));
        box(c, x, y, 0.22, 1, 10, shade(col, 0.9));
        box(c, x + 2.78, y, 0.22, 1, 10, shade(col, 0.9));
      },
    };
  }

  private lowTable(x: number, y: number, w: number, d: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + w,
      y1: y + d,
      h: 6,
      draw: (c) => {
        box(c, x + 0.1, y + 0.1, w - 0.2, d - 0.2, 4.5, "#2a2724");
        box(c, x, y, w, d, 1, "#6e5442", 4.5, { top: "#7d6150" });
        box(c, x + 0.3, y + 0.25, 0.5, 0.35, 0.6, "#b8735f", 5.5);
      },
    };
  }

  private cooler(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.7,
      y1: y + 0.7,
      h: 30,
      draw: (c) => {
        box(c, x, y, 0.7, 0.7, 18, "#d9d6cf", 0, { left: "#c4c0b6", right: "#a9a59c" });
        const [sx, sy] = iso(x + 0.35, y + 0.35, 18);
        const g = c.createLinearGradient(sx - 4, 0, sx + 4, 0);
        g.addColorStop(0, "rgba(140,190,220,0.85)");
        g.addColorStop(1, "rgba(90,140,180,0.85)");
        c.fillStyle = g;
        rr(c, sx - 4, sy - 11, 8, 11, 3);
        c.fill();
        c.fillStyle = "rgba(255,255,255,0.35)";
        c.fillRect(sx - 2.6, sy - 9.5, 1, 7);
      },
    };
  }

  private printer(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.1,
      y1: y + 0.8,
      h: 14,
      draw: (c) => {
        box(c, x, y, 1.1, 0.8, 9, "#2e3135");
        box(c, x + 0.05, y + 0.05, 1, 0.7, 4, "#d9d6cf", 9, { left: "#c4c0b6", right: "#a9a59c" });
        box(c, x + 0.25, y + 0.5, 0.6, 0.35, 0.4, "#f4f2ec", 9.5);
        const busy = this.agents.some((a) => a.act === "print" && !a.goal);
        const [sx, sy] = iso(x + 0.9, y + 0.8, 11);
        c.fillStyle = busy ? "#8fb39b" : "#3b4a40";
        c.fillRect(sx - 0.6, sy - 0.6, 1.2, 1.2);
      },
    };
  }

  private reception(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 4,
      y1: y + 1,
      h: 16,
      draw: (c) => {
        box(c, x, y, 4, 1, 14, "#3a3631", 0, { top: "#d9d4c8", left: "#4a443b", right: "#2f2b26" });
        onXFace(c, x + 1.3, y + 1, 0, () => {
          c.fillStyle = "#d6d3c8";
          c.beginPath();
          c.moveTo(10, -11);
          c.lineTo(15, -2.5);
          c.lineTo(13, -2.5);
          c.lineTo(12, -4.3);
          c.lineTo(8, -4.3);
          c.lineTo(7, -2.5);
          c.lineTo(5, -2.5);
          c.closePath();
          c.fill();
          c.fillStyle = "#8fb39b";
          c.fillRect(5, -1.6, 10, 0.7);
        });
        box(c, x + 0.4, y + 0.3, 0.7, 0.3, 4, "#1d1e21", 14);
        const [bx, by] = iso(x + 3.2, y + 0.5, 14.5);
        c.fillStyle = "#c4a574";
        c.beginPath();
        c.ellipse(bx, by, 1.6, 0.9, 0, Math.PI, 0);
        c.fill();
      },
    };
  }

  private plant(x: number, y: number, s: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.5,
      y1: y + 0.5,
      h: 26 * s,
      draw: (c) => {
        box(c, x, y, 0.5, 0.5, 7 * s, "#5b4a3c", 0, { top: "#2a2017" });
        const [sx, sy] = iso(x + 0.25, y + 0.25, 7 * s);
        const t = this.now / 1000;
        for (let i = 0; i < 9; i++) {
          const ang = (i / 9) * Math.PI * 2 + hash(x + i) * 0.5;
          const len = (7 + hash(x * 7 + i) * 6) * s;
          const sway = Math.sin(t * 0.8 + i + x) * 0.6;
          c.fillStyle = i % 3 === 0 ? "#4f7a52" : i % 3 === 1 ? "#3f6a44" : "#5f8a5d";
          c.beginPath();
          c.ellipse(sx + Math.cos(ang) * len * 0.45 + sway, sy - len * 0.7 + Math.sin(ang) * 2, 2.2 * s, len * 0.45, Math.cos(ang) * 0.6, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  /* ---------- depth sorting: static-static order is computed once; only moving things are re-related per frame */

  private bbox(it: Item): Box4 {
    const a = iso(it.x0, it.y1)[0];
    const b = iso(it.x1, it.y0)[0];
    return [Math.min(a, b), iso(it.x0, it.y0, it.h)[1], Math.max(a, b), iso(it.x1, it.y1)[1]];
  }

  private prepareSort() {
    this.staticBoxes = this.items.map((it) => this.bbox(it));
    const n = this.items.length;
    this.staticBehind = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        const A = this.staticBoxes[i]!;
        const B = this.staticBoxes[j]!;
        if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
        const a = this.items[i]!;
        const b = this.items[j]!;
        if (behindOf(a, b)) this.staticBehind[j]!.push(i);
        else if (behindOf(b, a)) this.staticBehind[i]!.push(j);
      }
  }

  private sorted(dyn: Item[]): Item[] {
    const S = this.items.length;
    const all = this.items.concat(dyn);
    const boxes = this.staticBoxes.concat(dyn.map((d) => this.bbox(d)));
    const behind = this.staticBehind.map((l) => l.slice());
    for (let k = 0; k < dyn.length; k++) behind.push([]);
    for (let j = S; j < all.length; j++) {
      const B = boxes[j]!;
      const b = all[j]!;
      for (let i = 0; i < j; i++) {
        const A = boxes[i]!;
        if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
        const a = all[i]!;
        if (behindOf(a, b)) behind[j]!.push(i);
        else if (behindOf(b, a)) behind[i]!.push(j);
      }
    }
    const out: Item[] = [];
    const state = new Uint8Array(all.length);
    const visit = (i: number) => {
      if (state[i]) return;
      state[i] = 1;
      for (const k of behind[i]!) visit(k);
      out.push(all[i]!);
    };
    const order = all.map((_, i) => i).sort((p, q) => all[p]!.x0 + all[p]!.y0 - (all[q]!.x0 + all[q]!.y0));
    for (const i of order) visit(i);
    return out;
  }

  /* ---------- walls */

  private lowWall(x: number, y: number, axis: "x" | "y"): Item {
    const H = 24;
    const [x0, y0, w, d] = axis === "x" ? [x, y - 0.07, 1, 0.14] : [x - 0.07, y, 0.14, 1];
    return { x0, y0, x1: x0 + w, y1: y0 + d, h: H, draw: (c) => box(c, x0, y0, w, d, H, "#3a3732", 0, { top: "#5f5a51" }) };
  }

  private doorFrame(axis: "x" | "y", at: number, a: number, b: number, h: number): Item {
    const [x0, y0, x1, y1] = axis === "x" ? [a, at - 0.07, b, at + 0.07] : [at - 0.07, a, at + 0.07, b];
    const p = (u: number, z: number) => (axis === "x" ? iso(u, at, z) : iso(at, u, z));
    return {
      x0,
      y0,
      x1,
      y1,
      h,
      draw: (c) => {
        c.strokeStyle = h > 30 ? "#4f544f" : "#5f5a51";
        c.lineWidth = h > 30 ? 1.2 : 2.4;
        c.beginPath();
        c.moveTo(...p(a, 0));
        c.lineTo(...p(a, h));
        if (h > 30) c.lineTo(...p(b, h));
        else c.moveTo(...p(b, h));
        c.lineTo(...p(b, 0));
        c.stroke();
      },
    };
  }

  /* ---------- data center, server room, vault, warehouse, security */

  private crac(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.9,
      y1: y + 1.5,
      h: 44,
      draw: (c) => {
        box(c, x, y, 0.9, 1.5, 44, "#c9c7c0", 0, { left: "#b3b0a8", right: "#9e9b93" });
        onYFace(c, x + 0.9, y + 1.5, 0, () => {
          c.strokeStyle = "rgba(0,0,0,0.25)";
          c.lineWidth = 0.6;
          for (let k = 0; k < 9; k++) {
            c.beginPath();
            c.moveTo(3, -38 + k * 3);
            c.lineTo(24, -38 + k * 3);
            c.stroke();
          }
          c.fillStyle = "#8fb39b";
          c.fillRect(4, -42, 3, 1.4);
          c.fillStyle = "#16181b";
          c.fillRect(10, -42.6, 10, 2.6);
          c.fillStyle = "#8fb39b";
          c.font = "600 2px IBM Plex Mono, monospace";
          c.textAlign = "left";
          c.fillText("18.4°C", 10.6, -40.6);
        });
      },
    };
  }

  private ups(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.9,
      y1: y + 1.5,
      h: 30,
      draw: (c) => {
        box(c, x, y, 0.9, 1.5, 30, "#1f2226", 0, { top: "#2b2f34" });
        onYFace(c, x + 0.9, y + 1.5, 0, () => {
          c.fillStyle = "#0e1411";
          c.fillRect(4, -25, 16, 6);
          const lvl = 0.7 + Math.sin(this.now / 3000) * 0.05;
          c.fillStyle = "#8fb39b";
          c.fillRect(5, -23.5, 14 * lvl, 3);
          for (let k = 0; k < 4; k++) {
            c.fillStyle = k < 3 ? "#8fb39b" : "#3b4a40";
            c.fillRect(5 + k * 3.5, -16, 2, 1);
          }
        });
      },
    };
  }

  private lockers(x: number, y: number, len: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.7,
      y1: y + len,
      h: 48,
      draw: (c) => {
        box(c, x, y, 0.7, len, 48, "#4d5357", 0, { top: "#5c6368" });
        onYFace(c, x + 0.7, y + len, 0, () => {
          const W = len * 17.9;
          const cols = Math.floor(W / 9);
          for (let r = 0; r < 5; r++)
            for (let k = 0; k < cols; k++) {
              const lx = 1 + k * 9;
              const ly = -46 + r * 9;
              c.fillStyle = "#596065";
              c.fillRect(lx, ly, 8, 8);
              c.strokeStyle = "#3d4246";
              c.lineWidth = 0.4;
              c.strokeRect(lx, ly, 8, 8);
              c.fillStyle = "#c4a574";
              c.beginPath();
              c.arc(lx + 6.2, ly + 4, 0.6, 0, Math.PI * 2);
              c.fill();
            }
        });
      },
    };
  }

  private goldStack(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.2,
      y1: y + 0.8,
      h: 12,
      draw: (c) => {
        box(c, x, y, 1.2, 0.8, 2.2, "#7a5f40");
        const gold = { top: "#f0d27a", left: "#c9a443", right: "#a6852f" };
        for (let layer = 0; layer < 3; layer++)
          for (let i = 0; i < 3 - layer; i++)
            for (let j = 0; j < 2; j++) box(c, x + 0.08 + i * 0.36 + layer * 0.18, y + 0.08 + j * 0.34, 0.32, 0.3, 2.6, "#d9b14a", 2.2 + layer * 2.6, gold);
        const sh = Math.max(0, Math.sin(this.now / 900));
        if (sh > 0.9) {
          const [sx, sy] = iso(x + 0.6, y + 0.4, 10);
          c.fillStyle = `rgba(255,255,230,${(sh - 0.9) * 8})`;
          c.beginPath();
          c.arc(sx, sy, 1.6, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  private palletRack(x: number, y: number, len: number, seed: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + len,
      y1: y + 1,
      h: 54,
      draw: (c) => {
        const up = "#c46a2b";
        const beam = "#2f4a6c";
        for (let u = 0; u <= len; u += 2) box(c, x + u - 0.05, y, 0.1, 0.1, 54, up);
        for (const z of [16, 33, 50]) box(c, x, y, len, 0.08, 2, beam, z);
        for (let bay = 0; bay < len / 2; bay++)
          for (let lvl = 0; lvl < 3; lvl++) {
            const z = lvl === 0 ? 0 : lvl === 1 ? 18 : 35;
            const kind = hash(seed * 31 + bay * 7 + lvl);
            if (kind < 0.15) continue;
            box(c, x + bay * 2 + 0.15, y + 0.12, 1.7, 0.8, 1.6, "#8a6a45", z);
            if (kind > 0.7) box(c, x + bay * 2 + 0.25, y + 0.18, 1.5, 0.7, 12, "#d8d4cc", z + 1.6, { top: "#e6e2da", left: "#c9c5bd", right: "#b3afa7" });
            else
              for (let k = 0; k < 3; k++) {
                const hgt = 6 + hash(seed + bay + lvl + k) * 7;
                box(c, x + bay * 2 + 0.2 + k * 0.52, y + 0.2, 0.48, 0.64, hgt, "#a8835a", z + 1.6, { top: "#c29a6a" });
              }
          }
        for (let u = 0; u <= len; u += 2) box(c, x + u - 0.05, y + 0.9, 0.1, 0.1, 54, up);
        for (const z of [16, 33, 50]) box(c, x, y + 0.92, len, 0.08, 2, beam, z);
      },
    };
  }

  private pallet(x: number, y: number, seed: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.2,
      y1: y + 1,
      h: 20,
      draw: (c) => {
        box(c, x, y, 1.2, 1, 2.4, "#8a6a45");
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++) {
            const hgt = 7 + hash(seed * 9 + i * 3 + j) * 6;
            box(c, x + 0.06 + i * 0.56, y + 0.06 + j * 0.46, 0.52, 0.42, hgt, "#a8835a", 2.4, { top: "#c29a6a" });
          }
        box(c, x + 0.3, y + 0.25, 0.6, 0.5, 6, "#b48f62", 14, { top: "#cfa774" });
      },
    };
  }

  private secDesk(x: number, y: number, w: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + w,
      y1: y + 1.1,
      h: 26,
      draw: (c) => {
        box(c, x, y, w, 1.1, 12, "#24272b", 0, { top: "#33373c" });
        for (let i = 0; i < 3; i++) {
          const mx = x + 0.45 + i * 1.3;
          box(c, mx + 0.4, y + 0.2, 0.15, 0.05, 2.4, "#1d1e21", 12);
          box(c, mx, y + 0.18, 1.05, 0.06, 7.5, "#141518", 14.4);
          onXFace(c, mx + 0.05, y + 0.24, 15, () => {
            c.fillStyle = "#0d1410";
            c.fillRect(0, -6.4, 15.6, 6.4);
            for (let k = 0; k < 4; k++) {
              const on = hash(i * 9 + k + Math.floor(this.now / 1500)) > 0.3;
              c.fillStyle = on ? "rgba(143,179,155,0.55)" : "rgba(143,179,155,0.15)";
              c.fillRect(0.6 + (k % 2) * 7.6, -6 + Math.floor(k / 2) * 3, 7, 2.6);
            }
          });
        }
        box(c, x + 1.5, y + 0.75, 1.1, 0.25, 0.6, "#2b2d31", 12, { top: "#3a3d42" });
      },
    };
  }

  /* ---------- offices */

  private execDesk(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 3,
      y1: y + 1,
      h: 26,
      draw: (c) => {
        const wood = "#4a3424";
        box(c, x, y, 3, 1, 12, wood, 0, { top: "#5b4130", left: "#3d2b1e", right: "#33241a" });
        onXFace(c, x + 1, y + 1, 0, () => {
          c.fillStyle = "#c4a574";
          c.fillRect(2, -9, 13, 3.4);
          c.fillStyle = "#1b150c";
          c.font = "700 2.2px IBM Plex Mono, monospace";
          c.textAlign = "left";
          c.fillText("ATLAS · LEAD", 2.8, -6.7);
        });
        for (const mx of [x + 0.5, x + 1.6]) {
          box(c, mx + 0.4, y + 0.75, 0.15, 0.06, 2.6, "#1d1e21", 12);
          box(c, mx, y + 0.78, 1.0, 0.07, 8.6, "#141518", 14.6);
        }
        box(c, x + 2.55, y + 0.25, 0.14, 0.14, 7, "#2a2522", 12);
        const [lx, ly] = iso(x + 2.62, y + 0.32, 20);
        c.fillStyle = "#c4a574";
        c.beginPath();
        c.ellipse(lx, ly, 2.6, 1.2, 0, Math.PI, 0);
        c.fill();
        box(c, x + 0.4, y + 0.15, 0.9, 0.24, 0.6, "#2b2d31", 12, { top: "#3a3d42" });
      },
    };
  }

  private credenza(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 2.8,
      y1: y + 0.5,
      h: 22,
      draw: (c) => {
        box(c, x, y, 2.8, 0.5, 12, "#3d2b1e", 0, { top: "#4a3424" });
        box(c, x + 0.3, y + 0.12, 0.22, 0.22, 6, "#c4a574", 12, { top: "#e0c48a" });
        for (let i = 0; i < 5; i++) box(c, x + 1 + i * 0.12, y + 0.08, 0.1, 0.34, 6 + hash(i) * 2, ["#7a3b2e", "#2f4a5c", "#5c6b3f", "#8a6f3a", "#d6d3c8"][i]!, 12);
        box(c, x + 2.2, y + 0.1, 0.3, 0.3, 3, "#5b4a3c", 12);
      },
    };
  }

  private staticChair(x: number, y: number, face: Face, col: string): Item {
    return { x0: x - 0.3, y0: y - 0.3, x1: x + 0.3, y1: y + 0.3, h: 22, draw: (c) => this.drawChair(c, x, y, face, col, "all") };
  }

  /* ---------- game room */

  private pingPong(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 3,
      y1: y + 1.6,
      h: 14,
      draw: (c) => {
        for (const [lx, ly] of [
          [0.3, 0.3],
          [2.6, 0.3],
          [0.3, 1.2],
          [2.6, 1.2],
        ] as const)
          box(c, x + lx, y + ly, 0.1, 0.1, 9.5, "#1d1e21");
        box(c, x, y, 3, 1.6, 0.8, "#1f5a4a", 9.5, { top: "#23705b" });
        c.strokeStyle = "rgba(255,255,255,0.75)";
        c.lineWidth = 0.5;
        const z = 10.3;
        c.beginPath();
        c.moveTo(...iso(x + 0.05, y + 0.05, z));
        c.lineTo(...iso(x + 2.95, y + 0.05, z));
        c.lineTo(...iso(x + 2.95, y + 1.55, z));
        c.lineTo(...iso(x + 0.05, y + 1.55, z));
        c.closePath();
        c.moveTo(...iso(x + 0.05, y + 0.8, z));
        c.lineTo(...iso(x + 2.95, y + 0.8, z));
        c.stroke();
        poly(c, [iso(x + 1.5, y - 0.05, z), iso(x + 1.5, y + 1.65, z), iso(x + 1.5, y + 1.65, z + 3), iso(x + 1.5, y - 0.05, z + 3)], "rgba(230,230,225,0.55)");
      },
    };
  }

  private arcade(x: number, y: number, i: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.95,
      y1: y + 0.8,
      h: 36,
      draw: (c) => {
        const body = i ? "#2a2140" : "#1c2b2a";
        box(c, x, y, 0.95, 0.8, 34, body, 0, { top: shade(body, 1.2) });
        onXFace(c, x + 0.08, y + 0.8, 0, () => {
          const W = 0.8 * 16;
          c.fillStyle = i ? "#c88cff" : "#8fdcc8";
          c.fillRect(0, -34, W, 3.5);
          c.fillStyle = "#050607";
          c.fillRect(1, -29.5, W - 2, 10);
          const t = this.now / 1000;
          for (let k = 0; k < 6; k++) {
            c.fillStyle = k % 2 ? "#d6d3c8" : i ? "#c88cff" : "#8fdcc8";
            const px = 2 + ((t * (4 + k) * 3 + k * 7) % (W - 5));
            const py = -28 + ((k * 3 + Math.sin(t * 2 + k) * 2 + 8) % 8);
            c.fillRect(px, py, 1.2, 1.2);
          }
          c.fillStyle = "#151515";
          c.fillRect(0.5, -18.5, W - 1, 3);
          c.fillStyle = "#c45c4a";
          c.beginPath();
          c.arc(4, -17, 0.8, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#c4a574";
          c.beginPath();
          c.arc(8, -17, 0.6, 0, Math.PI * 2);
          c.arc(10, -17, 0.6, 0, Math.PI * 2);
          c.fill();
        });
      },
    };
  }

  private tvStand(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 2.4,
      y1: y + 0.6,
      h: 26,
      draw: (c) => {
        box(c, x, y, 2.4, 0.6, 7, "#2a2522", 0, { top: "#3a332e" });
        box(c, x + 0.15, y + 0.2, 2.1, 0.08, 15, "#0d0e10", 7.5);
        onXFace(c, x + 0.2, y + 0.28, 8.5, () => {
          const W = 2 * 16;
          const on = this.agents.some((a) => a.act === "tv" && !a.goal);
          const t = this.now / 1000;
          c.fillStyle = on ? "#1a2a3a" : "#0b0c0e";
          c.fillRect(0, -13.4, W, 13.4);
          if (on) {
            c.fillStyle = "#3a6a4a";
            c.fillRect(0, -4, W, 4);
            c.fillStyle = "#c45c4a";
            c.fillRect(6 + Math.sin(t * 2) * 4, -8, 2.4, 4);
            c.fillStyle = "#8fdcc8";
            c.fillRect(20 + Math.cos(t * 1.6) * 5, -8, 2.4, 4);
          }
        });
        box(c, x + 1.6, y + 0.15, 0.5, 0.35, 1.4, "#e8e6df", 7);
      },
    };
  }

  /* ---------- reception, canteen, booths */

  private turnstile(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 0.25,
      y1: y + 0.7,
      h: 16,
      draw: (c) => {
        box(c, x, y, 0.25, 0.7, 14, "#9ea3a6", 0, { top: "#c9cdd0" });
        const [sx, sy] = iso(x + 0.25, y + 0.35, 14.5);
        c.fillStyle = Math.floor(this.now / 900 + x) % 4 ? "#8fb39b" : "#c45c4a";
        c.fillRect(sx - 0.8, sy - 0.5, 1.6, 1);
        poly(c, [iso(x + 0.25, y + 0.1, 6), iso(x + 0.95, y + 0.1, 6), iso(x + 0.95, y + 0.1, 12), iso(x + 0.25, y + 0.1, 12)], "rgba(170,205,195,0.18)");
      },
    };
  }

  private kitchen(x: number, y: number, w: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + w,
      y1: y + 1,
      h: 28,
      draw: (c) => {
        box(c, x, y, w, 1, 13, "#e2ded4", 0, { top: "#d9d4c8", left: "#cfcac0", right: "#b9b4aa" });
        onXFace(c, x, y + 1, 0, () => {
          for (let i = 0; i < w * 1.2; i++) {
            c.strokeStyle = "rgba(0,0,0,0.12)";
            c.lineWidth = 0.5;
            c.strokeRect(1 + i * 14.9, -12, 14, 10.5);
            c.fillStyle = "#8a8f88";
            c.fillRect(5 + i * 14.9, -9.5, 5, 0.7);
          }
        });
        // Espresso machine, sink, microwave, cups, fruit.
        box(c, x + 0.2, y + 0.15, 0.85, 0.6, 12, "#1b1c1e", 13, { top: "#2c2e31" });
        onXFace(c, x + 0.25, y + 0.75, 13, () => {
          c.fillStyle = "#3a3d42";
          c.fillRect(1, -10, 12, 3);
          c.fillStyle = this.agents.some((a) => a.act === "coffee" && !a.goal) ? "#8fb39b" : "#c45c4a";
          c.fillRect(10, -9.2, 1.2, 1.2);
        });
        poly(c, [iso(x + 2.2, y + 0.2, 13.05), iso(x + 3.4, y + 0.2, 13.05), iso(x + 3.4, y + 0.8, 13.05), iso(x + 2.2, y + 0.8, 13.05)], "#9ea3a6");
        box(c, x + 5, y + 0.2, 0.8, 0.55, 6, "#2b2d31", 13, { top: "#3a3d42" });
        for (let i = 0; i < 4; i++) box(c, x + 1.3 + i * 0.2, y + 0.3, 0.14, 0.14, 2.2, "#e8e4da", 13);
        const [bx, by] = iso(x + 6.8, y + 0.5, 15);
        c.fillStyle = "#c4a574";
        c.beginPath();
        c.ellipse(bx, by, 4, 1.8, 0, 0, Math.PI * 2);
        c.fill();
        for (const [ox, col] of [
          [-1.5, "#c45c4a"],
          [0.6, "#8fb39b"],
          [2, "#d9a441"],
        ] as const) {
          c.fillStyle = col;
          c.beginPath();
          c.arc(bx + ox, by - 1.4, 1.3, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  private fridge(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1,
      y1: y + 0.9,
      h: 36,
      draw: (c) => {
        box(c, x, y, 1, 0.9, 36, "#c9ccd0", 0, { top: "#dadde0", left: "#b8bbbf", right: "#a3a6aa" });
        onXFace(c, x, y + 0.9, 0, () => {
          c.strokeStyle = "rgba(0,0,0,0.25)";
          c.lineWidth = 0.6;
          c.beginPath();
          c.moveTo(0, -22);
          c.lineTo(17.9, -22);
          c.stroke();
          c.fillStyle = "#8a8f88";
          c.fillRect(14, -32, 0.9, 7);
          c.fillRect(14, -19, 0.9, 9);
        });
      },
    };
  }

  private vending(x: number, y: number, i: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.1,
      y1: y + 0.8,
      h: 36,
      draw: (c) => {
        const body = i ? "#7a2f2a" : "#2f4a6c";
        box(c, x, y, 1.1, 0.8, 36, body, 0, { top: shade(body, 1.2) });
        onXFace(c, x + 0.08, y + 0.8, 0, () => {
          const W = 0.75 * 17.9;
          c.fillStyle = "rgba(200,230,255,0.85)";
          c.fillRect(0, -33, W, 24);
          for (let r = 0; r < 5; r++)
            for (let k = 0; k < 4; k++) {
              c.fillStyle = ["#c45c4a", "#d9a441", "#8fb39b", "#5b6b8c", "#e8e4da"][Math.floor(hash(i * 50 + r * 4 + k) * 5)]!;
              c.fillRect(1 + k * 3.2, -31.5 + r * 4.6, 2.4, 3.2);
            }
          c.fillStyle = "#e8e6df";
          c.font = "700 2.4px IBM Plex Mono, monospace";
          c.textAlign = "left";
          c.fillText(i ? "SNACKS" : "DRINKS", 1, -6);
          c.fillStyle = "#111";
          c.fillRect(W - 3.5, -8, 3, 5);
        });
      },
    };
  }

  private diningTable(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 2,
      y1: y + 1,
      h: 13,
      draw: (c) => {
        box(c, x + 0.9, y + 0.4, 0.2, 0.2, 10, "#2a2522");
        box(c, x, y, 2, 1, 1.2, "#b08a5f", 10, { top: "#c29b6c" });
        // Plates appear where bots are eating.
        for (const a of this.agents) {
          if (a.act !== "eat" || a.goal || !a.spot) continue;
          if (a.spot.x < x || a.spot.x > x + 2 || Math.abs(a.spot.y - (y + 0.5)) > 1.2) continue;
          const py = a.spot.face === "S" ? y + 0.3 : y + 0.7;
          const [sx, sy] = iso(a.spot.x, py, 11.3);
          c.fillStyle = "#f2f0ea";
          c.beginPath();
          c.ellipse(sx, sy, 3.4, 1.7, 0, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#b8735f";
          c.beginPath();
          c.ellipse(sx, sy - 0.3, 1.8, 0.9, 0, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  /** A one-person glass booth on tile (bx, by), open at the front (+y). */
  private booth(bx: number, by: number) {
    this.wallEdge(bx - 1, by, bx, by);
    this.wallEdge(bx, by, bx + 1, by);
    this.wallEdge(bx, by - 1, bx, by);
    this.items.push({ x0: bx, y0: by - 0.06, x1: bx + 1, y1: by + 0.06, h: 46, draw: (c) => box(c, bx, by - 0.06, 1, 0.12, 46, "#3b4a44", 0, { top: "#4d5d56" }) });
    this.items.push(this.glass(bx, by, "y"), this.glass(bx + 1, by, "y"));
    this.items.push({
      x0: bx,
      y0: by + 0.94,
      x1: bx + 1,
      y1: by + 1.06,
      h: 48,
      draw: (c) => {
        const busy = this.agents.some((a) => a.act === "booth" && !a.goal && Math.floor(a.x) === bx && Math.floor(a.y) === by);
        poly(c, [iso(bx, by, 47), iso(bx + 1, by, 47), iso(bx + 1, by + 1, 47), iso(bx, by + 1, 47)], "rgba(40,44,48,0.55)");
        c.strokeStyle = "#4f544f";
        c.lineWidth = 1.1;
        c.beginPath();
        c.moveTo(...iso(bx, by + 1, 0));
        c.lineTo(...iso(bx, by + 1, 47));
        c.lineTo(...iso(bx + 1, by + 1, 47));
        c.lineTo(...iso(bx + 1, by + 1, 0));
        c.stroke();
        const [lx, ly] = iso(bx + 0.5, by + 1, 44);
        c.fillStyle = busy ? "#c45c4a" : "#8fb39b";
        c.beginPath();
        c.arc(lx, ly, 1.1, 0, Math.PI * 2);
        c.fill();
      },
    });
  }

  /* ---------- things in hands, the ping-pong ball */

  private heldThing(c: CanvasRenderingContext2D, a: Agent, left: [number, number], right: [number, number]) {
    if (a.goal && a.carry === "box") {
      const cx = (left[0] + right[0]) / 2;
      const cy = (left[1] + right[1]) / 2;
      c.fillStyle = "#a8835a";
      c.fillRect(cx - 4.5, cy - 4.5, 9, 6);
      c.fillStyle = "#c29a6a";
      c.fillRect(cx - 4.5, cy - 5.6, 9, 1.4);
      c.fillStyle = "rgba(0,0,0,0.25)";
      c.fillRect(cx - 0.4, cy - 5.6, 0.8, 7);
      return;
    }
    if ((a.goal && a.carry === "book") || (!a.goal && a.act === "read")) {
      const [hx, hy] = right;
      c.fillStyle = "#2f4a5c";
      c.fillRect(hx - 2.6, hy - 3.4, 4.2, 3.2);
      c.fillStyle = "#e8e4da";
      c.fillRect(hx - 2.2, hy - 3.1, 3.4, 0.6);
      return;
    }
    if (a.goal) return;
    if (a.act === "pingpong") {
      const [hx, hy] = right;
      c.fillStyle = "#c45c4a";
      c.beginPath();
      c.ellipse(hx + 1.2, hy - 1.6, 2, 2.4, 0.4, 0, Math.PI * 2);
      c.fill();
    } else if (a.act === "booth") {
      const [hx, hy] = right;
      c.fillStyle = "#151617";
      c.fillRect(hx - 0.8, hy - 2.6, 1.6, 3.2);
    } else if (a.act === "arcade" || a.act === "tv") {
      const cx = (left[0] + right[0]) / 2;
      const cy = (left[1] + right[1]) / 2;
      c.fillStyle = "#26282b";
      rr(c, cx - 3, cy - 1.2, 6, 2.4, 1.2);
      c.fill();
    }
  }

  private pongBall(): [number, number, number] | null {
    const players = this.agents.filter((a) => a.act === "pingpong" && !a.goal);
    if (players.length < 2) return null;
    const p = (this.now / 650) % 2;
    const u = p < 1 ? p : 2 - p;
    const x = 39.15 + u * 2.7;
    const y = 14.2 + Math.sin(this.now / 410) * 0.25;
    const z = 10.5 + Math.sin(Math.PI * ((p % 1) * 2 > 1 ? (p % 1) * 2 - 1 : (p % 1) * 2)) * 9;
    return [x, y, z];
  }

  private drawBall(c: CanvasRenderingContext2D, b: [number, number, number]) {
    const [sx, sy] = iso(b[0], b[1], 10.4);
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.beginPath();
    c.ellipse(sx, sy, 1.4, 0.7, 0, 0, Math.PI * 2);
    c.fill();
    const [bx, by] = iso(b[0], b[1], b[2]);
    c.fillStyle = "#f6f2e8";
    c.beginPath();
    c.arc(bx, by, 1.1, 0, Math.PI * 2);
    c.fill();
  }

  /* ---------- staff robots */

  private npcPath(n: Npc, to: { x: number; y: number }) {
    const raw = this.astar(Math.floor(n.x), Math.floor(n.y), Math.floor(to.x), Math.floor(to.y)) ?? [];
    return [...raw.slice(1, -1), { x: to.x, y: to.y }];
  }

  private tickNpcs(dt: number) {
    for (const n of this.npcs) {
      if (n.kind === "concierge") {
        if (this.now > n.next) {
          n.face = n.face === "S" ? "E" : "S";
          n.next = this.now + 4000 + hash(this.now) * 6000;
        }
        continue;
      }
      if (!n.path.length) {
        if (n.route.length) {
          n.path = this.npcPath(n, n.route.shift()!);
        } else if (this.now > n.next) {
          if (n.kind === "sentry") {
            n.route = [
              { x: 38.5, y: 10 },
              { x: 30.5, y: 10 },
              { x: 30.5, y: 23 },
              { x: 6.5, y: 23 },
              { x: 6.5, y: 10 },
              { x: n.home.x, y: n.home.y },
            ];
            n.next = this.now + 70000 + hash(this.now) * 50000;
            this.log(this.room("security"), this.t.log.patrol(npcName(n.kind, n.name, this.lang)));
          } else {
            const pts = [
              { x: 26, y: 3.5 },
              { x: 32.4, y: 3.5 },
              { x: 27, y: 8.4 },
              { x: 32.2, y: 8.4 },
            ];
            n.route = [pts[Math.floor(hash(this.now) * pts.length)]!];
            n.carry = !n.carry;
            n.next = this.now + 5000 + hash(this.now + 1) * 7000;
          }
          continue;
        } else {
          n.moving = false;
          if (Math.hypot(n.x - n.home.x, n.y - n.home.y) < 0.05) n.face = n.home.face;
          continue;
        }
      }
      const p = n.path[0];
      if (!p) continue;
      const dx = p.x - n.x;
      const dy = p.y - n.y;
      const d = Math.hypot(dx, dy);
      const step = n.speed * dt;
      n.moving = true;
      n.walkPhase += dt * n.speed * 7;
      if (Math.abs(dx) > 1e-3 || Math.abs(dy) > 1e-3) n.face = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : dy > 0 ? "S" : "N";
      if (d <= step) {
        n.x = p.x;
        n.y = p.y;
        n.path.shift();
      } else {
        n.x += (dx / d) * step;
        n.y += (dy / d) * step;
      }
    }
  }

  private drawNpc(c: CanvasRenderingContext2D, n: Npc) {
    const [sx, sy] = iso(n.x, n.y);
    const t = this.now / 1000;
    if (n.kind === "forklift") {
      c.fillStyle = "rgba(0,0,0,0.3)";
      c.beginPath();
      c.ellipse(sx, sy, 10, 5, 0, 0, Math.PI * 2);
      c.fill();
      box(c, n.x - 0.42, n.y - 0.3, 0.84, 0.6, 9, "#d6b23c", 1.5, { top: "#e6c45a" });
      box(c, n.x - 0.2, n.y - 0.2, 0.4, 0.4, 8, "#2a2c30", 10.5);
      const [fx, fy] = FACE_VEC[n.face];
      const mx = n.x + (n.face === "E" ? 0.5 : n.face === "W" ? -0.5 : 0);
      const my = n.y + (n.face === "S" ? 0.4 : n.face === "N" ? -0.4 : 0);
      box(c, mx - 0.06, my - 0.06, 0.12, 0.12, 24, "#2a2c30");
      if (n.carry) box(c, mx - 0.25 + fx * 0.1, my - 0.2 + fy * 0.1, 0.5, 0.4, 6, "#a8835a", 4, { top: "#c29a6a" });
      const [bx, by] = iso(n.x, n.y, 19);
      c.fillStyle = Math.floor(this.now / 300) % 2 ? "#e8a43a" : "#7a5520";
      c.beginPath();
      c.arc(bx, by, 1.4, 0, Math.PI * 2);
      c.fill();
      for (const side of [-1, 1]) {
        const [wx, wy] = iso(n.x + side * 0.3, n.y + 0.3, 1.5);
        c.fillStyle = "#151515";
        c.beginPath();
        c.ellipse(wx, wy, 1.8, 1.4, 0, 0, Math.PI * 2);
        c.fill();
      }
      return;
    }
    const seated = n.kind === "sentry" && !n.path.length && Math.hypot(n.x - n.home.x, n.y - n.home.y) < 0.05;
    const front = n.face === "E" || n.face === "S";
    if (seated) this.drawChair(c, n.x, n.y, n.face, "#1d1f23", "seat");
    c.fillStyle = "rgba(0,0,0,0.3)";
    c.beginPath();
    c.ellipse(sx, sy, 6.5, 3, 0, 0, Math.PI * 2);
    c.fill();
    const lift = seated ? 5 : 0;
    const bob = n.moving ? Math.abs(Math.sin(n.walkPhase)) * 1 : Math.sin(t * 2 + n.x) * 0.3;
    const body = n.kind === "sentry" ? "#2a2d31" : "#e8e6df";
    // Wheel base.
    if (!seated) {
      c.fillStyle = "#151617";
      c.beginPath();
      c.ellipse(sx, sy - 1.6, 4.4, 2, 0, 0, Math.PI * 2);
      c.fill();
    }
    // Torso capsule.
    const top = sy - 26 + lift - bob;
    const g = c.createLinearGradient(sx - 5, 0, sx + 5, 0);
    g.addColorStop(0, shade(body, 1.12));
    g.addColorStop(1, shade(body, 0.75));
    c.fillStyle = g;
    rr(c, sx - 5, top + 7, 10, 16 - lift * 0.4, 4.5);
    c.fill();
    if (n.kind === "sentry") {
      c.fillStyle = "#c4a574";
      c.fillRect(sx - 5, top + 12, 10, 1.4);
    } else {
      c.fillStyle = "#8fb39b";
      c.fillRect(sx - 1, top + 10, 2, 2);
    }
    // Arms.
    c.strokeStyle = shade(body, 0.85);
    c.lineWidth = 2;
    c.lineCap = "round";
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(sx + side * 5, top + 10);
      c.lineTo(sx + side * 6.2, top + 18 + (n.moving ? Math.sin(n.walkPhase + side) * 1.5 : 0));
      c.stroke();
    }
    // Head with visor.
    c.fillStyle = shade(body, 1.05);
    rr(c, sx - 4.5, top - 1, 9, 7.5, 3.4);
    c.fill();
    if (front) {
      const vx = sx + (n.face === "E" ? 1 : -1) * 0.8;
      c.fillStyle = n.kind === "sentry" ? `rgba(232,164,58,${0.75 + Math.sin(t * 3) * 0.2})` : `rgba(143,220,200,${0.8 + Math.sin(t * 2) * 0.15})`;
      rr(c, vx - 3.2, top + 1.4, 6.4, 2.4, 1.2);
      c.fill();
    }
    c.strokeStyle = "#5c615c";
    c.lineWidth = 0.6;
    c.beginPath();
    c.moveTo(sx, top - 1);
    c.lineTo(sx, top - 4);
    c.stroke();
    c.fillStyle = n.kind === "sentry" ? "#e8a43a" : "#8fb39b";
    c.beginPath();
    c.arc(sx, top - 4.5, 0.9, 0, Math.PI * 2);
    c.fill();
    if (n.kind === "sentry" && !seated) {
      c.fillStyle = "#1b1c1e";
      rr(c, sx - 4.8, top - 2.6, 9.6, 2.4, 1);
      c.fill();
    }
    if (seated && !front) this.drawChair(c, n.x, n.y, n.face, "#1d1f23", "back");
  }

  private huddleTable(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1.6,
      y1: y + 1.4,
      h: 13,
      draw: (c) => {
        const [sx, sy] = iso(x + 0.8, y + 0.7, 0);
        c.fillStyle = "#26282b";
        c.fillRect(sx - 1, sy - 10.5, 2, 10.5);
        c.fillStyle = "rgba(0,0,0,0.3)";
        c.beginPath();
        c.ellipse(sx, sy, 7, 3.2, 0, 0, Math.PI * 2);
        c.fill();
        const [tx, ty] = iso(x + 0.8, y + 0.7, 11);
        c.fillStyle = "#5d4636";
        c.beginPath();
        c.ellipse(tx, ty + 1, 21, 10.5, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#6e5442";
        c.beginPath();
        c.ellipse(tx, ty, 21, 10.5, 0, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#efece4";
        c.fillRect(tx - 6, ty - 2, 5, 3);
        c.fillStyle = "#c9c7c0";
        c.fillRect(tx + 2, ty - 1, 6, 3.5);
        if (this.agents.some((a) => a.act === "think" && !a.goal && Math.abs(a.x - (x + 0.8)) < 2 && Math.abs(a.y - (y + 0.7)) < 2)) {
          c.fillStyle = "rgba(143,179,155,0.14)";
          c.beginPath();
          c.ellipse(tx, ty, 24, 12, 0, 0, Math.PI * 2);
          c.fill();
        }
      },
    };
  }

  private coffeeStation(x: number, y: number): Item {
    return {
      x0: x,
      y0: y,
      x1: x + 1,
      y1: y + 0.6,
      h: 26,
      draw: (c) => {
        box(c, x, y, 1, 0.6, 12, "#2f3236", 0, { top: "#d9d4c8" });
        box(c, x + 0.15, y + 0.08, 0.6, 0.45, 11, "#1b1c1e", 12, { top: "#2c2e31" });
        onXFace(c, x + 0.18, y + 0.53, 12, () => {
          c.fillStyle = "#3a3d42";
          c.fillRect(1, -9, 8, 2.4);
          const busy = this.agents.some((a) => a.act === "coffee" && !a.goal && Math.hypot(a.x - (x + 0.5), a.y - (y + 1.1)) < 1.2);
          c.fillStyle = busy ? "#8fb39b" : "#c45c4a";
          c.fillRect(7, -8.4, 1, 1);
        });
        box(c, x + 0.8, y + 0.2, 0.12, 0.12, 2, "#e8e4da", 12);
      },
    };
  }

  /** Small grey tags for staff robots (screen space). */
  private drawNpcTags(c: CanvasRenderingContext2D) {
    const v = this.view;
    for (const n of this.npcs) {
      const [wx, wy] = iso(n.x, n.y, n.kind === "forklift" ? 30 : 34);
      const sx = wx * v.s + v.ox;
      const sy = wy * v.s + v.oy;
      c.font = "600 9px IBM Plex Mono, monospace";
      const label = npcName(n.kind, n.name, this.lang);
      const tw = c.measureText(label).width;
      c.fillStyle = "rgba(10,11,12,0.55)";
      rr(c, sx - tw / 2 - 6, sy - 7.5, tw + 12, 13, 6.5);
      c.fill();
      c.fillStyle = "rgba(196,165,116,0.9)";
      c.textAlign = "center";
      c.fillText(label, sx, sy + 2.5);
    }
  }

}

/** A is fully behind B (smaller x or smaller y) and not the other way round. */
function behindOf(a: Item, b: Item) {
  return (a.x1 <= b.x0 + 1e-3 || a.y1 <= b.y0 + 1e-3) && !(b.x1 <= a.x0 + 1e-3 || b.y1 <= a.y0 + 1e-3);
}

/** Topological depth sort for axis-aligned footprints: draw A before B when A is fully behind B and they overlap on screen. */
function sortItems(items: Item[]): Item[] {
  const n = items.length;
  const sb = items.map((it) => {
    const xs = [iso(it.x0, it.y1)[0], iso(it.x1, it.y0)[0]];
    const top = iso(it.x0, it.y0, it.h)[1];
    const bottom = iso(it.x1, it.y1)[1];
    return [Math.min(...xs), top, Math.max(...xs), bottom] as const;
  });
  const behind: number[][] = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = items[i]!;
      const b = items[j]!;
      const A = sb[i]!;
      const B = sb[j]!;
      if (A[2] < B[0] || B[2] < A[0] || A[3] < B[1] || B[3] < A[1]) continue;
      if (a.x1 <= b.x0 + 1e-3 || a.y1 <= b.y0 + 1e-3) {
        if (!(b.x1 <= a.x0 + 1e-3 || b.y1 <= a.y0 + 1e-3)) behind[j]!.push(i);
      }
    }
  const out: Item[] = [];
  const state = new Uint8Array(n);
  const visit = (i: number) => {
    if (state[i]) return;
    state[i] = 1;
    for (const k of behind[i]!) visit(k);
    out.push(items[i]!);
  };
  const order = items.map((_, i) => i).sort((p, q) => items[p]!.x0 + items[p]!.y0 - (items[q]!.x0 + items[q]!.y0));
  for (const i of order) visit(i);
  return out;
}
