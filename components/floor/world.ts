import type { PersonaId } from "@/lib/catalog";
import type { FloorEvent } from "@/lib/floor-bus";

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
  | "print";
type Phase = "idle" | "thinking" | "waiting" | "writing" | "done" | "error" | "approval";

type Spot = { x: number; y: number; face: Face; seat?: boolean; taken?: PersonaId | null; chair?: string };

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
  lookAt: PersonaId | null;
  visitOf: PersonaId | null;
  typingHeat: number;
};

type Item = { x0: number; y0: number; x1: number; y1: number; h: number; draw: (c: CanvasRenderingContext2D) => void };

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
};

export type FloorSnapshot = {
  agents: AgentSnapshot[];
  counts: { desk: number; walking: number; meeting: number; coffee: number; other: number };
};

const HW = 16;
const HH = 8;
export const GW = 26;
export const GH = 20;
const WALL_H = 84;
/** How long a bot thinks in the meeting room before treating the wait as background work (coffee). */
const THINK_PATIENCE = 4000;

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

const SMALL_TALK = [
  "Artifact first.",
  "Truth over comfort.",
  "Did the kernel fit the budget?",
  "Coffee's fresh.",
  "Shipping in five.",
  "Who touched the vault?",
  "Short is a courtesy.",
  "The boring version ships.",
  "Names are promises.",
  "Keep the glass clean.",
];

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
  private kernelFlash = -1e9;
  private particles: Particle[] = [];
  private roomba = { x: 12.5, y: 15.5, path: [] as { x: number; y: number }[], face: "E" as Face, wait: 0 };
  private cache: { canvas: HTMLCanvasElement; key: string } | null = null;
  private view = { s: 1, ox: 0, oy: 0, dpr: 1 };
  /** Camera: z = zoom over "fit", (x, y) = centre in iso px. Follows the busy bots unless the operator takes over. */
  private cam = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
  private user = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
  follow = true;
  private focus: { ids: Set<PersonaId>; until: number } = { ids: new Set(), until: 0 };
  private dt = 0.016;
  private lastPersona: PersonaId = "operator";
  private simulate: boolean;
  private simNext = 0;
  private maxims: string[];
  private skyline: { x: number; h: number; w: number }[] = [];

  constructor(bots: BotInfo[], opts: { simulate?: boolean; maxims?: string[] } = {}) {
    this.simulate = Boolean(opts.simulate);
    this.maxims = opts.maxims?.length ? opts.maxims : SMALL_TALK;
    this.buildMap();
    const desks = this.deskSeats();
    bots.slice(0, 6).forEach((b, i) => {
      const desk = desks[i]!;
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
        lookAt: null,
        visitOf: null,
        typingHeat: 0.3,
      });
    });
    for (let i = 0; i < 14; i++) this.skyline.push({ x: i * 0.42 + hash(i) * 0.2, h: 14 + hash(i + 40) * 34, w: 0.3 + hash(i + 7) * 0.25 });
  }

  /* -------------------------------------------------------------- map */

  private deskSeats(): Spot[] {
    // Three pods of two facing desks. Seat A behind the far desk faces the camera; seat B faces away.
    const seats: Spot[] = [];
    for (const x0 of [4, 11, 18]) {
      seats.push({ x: x0 + 1, y: 8.5, face: "S", seat: true, chair: "#2c3036" });
      seats.push({ x: x0 + 1, y: 11.5, face: "N", seat: true, chair: "#2c3036" });
    }
    return seats;
  }

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

  private buildMap() {
    // Partitions: glass along y=7 (doors at x 3-4, 12-13, 21-22), and along x=8 / x=17 behind it.
    const doors = new Set([3, 4, 12, 13, 21, 22]);
    for (let x = 0; x < GW; x++) if (!doors.has(x)) this.wallEdge(x, 6, x, 7);
    for (let y = 0; y < 7; y++) {
      this.wallEdge(7, y, 8, y);
      this.wallEdge(16, y, 17, y);
    }
    for (let x = 0; x < GW; x++) {
      if (doors.has(x)) continue;
      this.items.push(this.glass(x, 7, "x"));
    }
    this.items.push(this.doorPosts(3, 7), this.doorPosts(12, 7), this.doorPosts(21, 7));
    for (let y = 0; y < 7; y++) {
      this.items.push(this.glass(8, y, "y"), this.glass(17, y, "y"));
    }

    // Desks
    for (const x0 of [4, 11, 18]) {
      this.items.push(this.desk(x0, 9, "far"), this.desk(x0, 10, "near"));
      this.block(x0, 9, x0 + 2, 11);
    }

    // Kernel room: racks along both back walls + the console.
    for (let i = 0; i < 6; i++) this.items.push(this.rack(0.7 + i * 1.05, 0.15, "y", i));
    for (let i = 0; i < 4; i++) this.items.push(this.rack(0.15, 1.6 + i * 1.05, "x", i + 6));
    this.block(0, 0, 7, 1.1);
    this.block(0, 1.5, 1.1, 5.9);
    this.items.push(this.console(3, 3.4));
    this.block(3, 3.4, 4.6, 4.2);
    this.serverSpots.push({ x: 3.8, y: 4.95, face: "N" }, { x: 2.4, y: 2.2, face: "N" }, { x: 5.4, y: 2.1, face: "N" });

    // Conference: table + 8 chairs + TV on the back wall (drawn with the wall).
    this.items.push(this.table(10, 2.6, 4, 1.9));
    this.block(10, 2.6, 14, 4.5);
    for (let i = 0; i < 4; i++) {
      this.meeting.push({ x: 10.5 + i, y: 1.95, face: "S", seat: true, chair: "#3a3f47" });
      this.meeting.push({ x: 10.5 + i, y: 5.15, face: "N", seat: true, chair: "#3a3f47" });
    }

    // Vault: shelves along the back wall, a safe, a reading chair.
    for (let i = 0; i < 7; i++) this.items.push(this.shelf(18 + i, 0.15, i));
    this.block(18, 0, 25, 0.9);
    this.items.push(this.safe(24, 3.6));
    this.block(24, 3.6, 25.1, 4.6);
    this.items.push(this.armchair(19.2, 4.2));
    this.block(19.2, 4.2, 20.2, 5.1);
    for (let i = 0; i < 4; i++) this.vaultSpots.push({ x: 19.5 + i * 1.4, y: 1.55, face: "N" });

    // Lounge: coffee counter, sofa, coffee table.
    this.items.push(this.counter(21, 14));
    this.block(21, 14, 24, 15);
    for (let i = 0; i < 3; i++) this.coffee.push({ x: 21.6 + i * 0.95, y: 15.6, face: "N" });
    this.items.push(this.sofa3(21, 18.6));
    this.block(21, 18.6, 24, 19.6);
    for (let i = 0; i < 3; i++) this.sofa.push({ x: 21.55 + i * 0.95, y: 18.35, face: "N", seat: true });
    this.items.push(this.lowTable(21.7, 16.7, 1.7, 0.8));
    this.block(21.7, 16.7, 23.4, 17.5);

    // Misc: water cooler, printer, reception, plants.
    this.items.push(this.cooler(15.9, 13.2));
    this.block(15.9, 13.2, 16.6, 13.9);
    this.misc.cooler.push({ x: 16.25, y: 14.45, face: "N" });
    this.items.push(this.printer(8.6, 13.4));
    this.block(8.6, 13.4, 9.7, 14.2);
    this.misc.printer.push({ x: 9.15, y: 14.75, face: "N" });
    this.misc.window.push({ x: 0.9, y: 10.2, face: "W" }, { x: 0.9, y: 12.4, face: "W" });
    this.items.push(this.reception(1.4, 15.2));
    this.block(1.4, 15.2, 5.4, 16.2);
    for (const [px, py, s] of [
      [0.25, 7.4, 1],
      [7.2, 7.55, 0.8],
      [25.2, 7.45, 1.1],
      [25.1, 13.3, 1],
      [25.2, 19.1, 1.2],
      [6.1, 15.3, 0.9],
      [15.4, 7.6, 0.8],
      [7.3, 0.4, 1],
      [16.3, 0.4, 0.9],
    ] as const) {
      this.items.push(this.plant(px, py, s));
      this.block(px - 0.1, py - 0.1, px + 0.6, py + 0.6);
    }
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
        a.note = `${e.chars.toLocaleString()} chars · ${(e.ms / 1000).toFixed(1)}s${e.model ? ` · ${e.model}` : ""}`;
        this.say(a, `✓ Shipped · ${a.note}`, "ok", 5200);
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
        this.say(a, "Stopped.", "warn", 2200);
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
        this.say(a, `Waiting — ${short(e.reason, 36)} ☕`, "think", 60000);
        break;
      }
      case "approval": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "approval";
        a.phaseAt = now;
        this.home(a, "approval");
        this.say(a, `Needs approval: ${short(e.action, 44)}`, "warn", 120000);
        break;
      }
      case "approved": {
        const a = this.agent(e.persona);
        if (!a) return;
        a.phase = "idle";
        this.say(a, e.ok ? "Approved — executing." : "Rejected — standing down.", e.ok ? "ok" : "err", 3600);
        this.home(a, "desk");
        break;
      }
      case "vault": {
        const a = this.agent(this.lastPersona) ?? this.agents[0];
        if (!a) return;
        this.go(a, this.freeSpot(this.vaultSpots, a), "vault", 4200);
        this.say(a, "Filing that in the vault.", "say", 3600);
        break;
      }
      case "ambient":
        break;
    }
  }

  private ambient(a: Agent) {
    const r = hash(this.now * 0.001 + a.seed);
    const others = this.agents.filter((o) => o !== a && o.phase === "idle" && o.spot === o.desk);
    if (r < 0.24) {
      this.go(a, this.freeSpot(this.coffee, a), "coffee", 5000 + r * 9000);
      if (r < 0.1) this.say(a, "Coffee run.", "say", 2200);
      this.log("Break", `${a.bot} went for coffee`);
    } else if (r < 0.36) {
      this.go(a, this.freeSpot(this.misc.cooler, a), "cooler", 4000);
    } else if (r < 0.46) {
      this.go(a, this.freeSpot(this.misc.window, a), "window", 6000);
    } else if (r < 0.6 && others.length) {
      const host = others[Math.floor(r * 97) % others.length]!;
      const side: Spot = {
        x: host.desk.x + (host.desk.face === "S" ? 0.95 : -0.95),
        y: host.desk.face === "S" ? host.desk.y - 0.2 : host.desk.y + 0.25,
        face: host.desk.face === "S" ? "W" : "E",
      };
      a.visitOf = host.id;
      this.go(a, side, "visit", 4500);
      this.say(a, this.maxims[Math.floor(r * 1000) % this.maxims.length]!, "say", 3400);
    } else if (r < 0.7) {
      this.go(a, this.freeSpot(this.vaultSpots, a), "vault", 5000);
      this.log("Vault", `${a.bot} is reading in the vault`);
    } else if (r < 0.78) {
      this.go(a, this.freeSpot(this.sofa, a), "sofa", 7000);
    } else if (r < 0.86) {
      this.go(a, this.freeSpot(this.misc.printer, a), "print", 3500);
    } else {
      this.go(a, this.freeSpot(this.serverSpots, a), "server", 4500);
      this.log("Kernel", `${a.bot} checked the racks`);
    }
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
      const text =
        e.type === "job"
          ? `${e.persona} took "${e.text}"`
          : e.type === "done"
            ? `${e.persona} shipped in ${(e.ms / 1000).toFixed(1)}s`
            : e.type === "handoff"
              ? `${e.from} → ${e.to}: ${e.text}`
              : e.type === "wait"
                ? `${e.persona} waiting — ${e.reason}`
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
        this.say(a, "Engine is still thinking — coffee ☕", "think", 60000);
        this.log("Wait", `${a.bot} is waiting on the engine — coffee`);
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
        const step = a.speed * dt * accel;
        a.moving = true;
        a.walkPhase += dt * a.speed * 7.5;
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
        const tx = 1 + Math.floor(hash(this.now + tries) * 22);
        const ty = 12 + Math.floor(hash(this.now + tries + 50) * 7);
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
    const agents = this.agents.map((a) => {
      const walking = Boolean(a.goal);
      const where = walking
        ? "walking"
        : a.spot === a.desk
          ? "desk"
          : a.act === "think"
            ? "meeting room"
            : a.act === "coffee"
              ? "coffee bar"
              : a.act === "server"
                ? "kernel room"
                : a.act === "vault"
                  ? "vault"
                  : a.act === "visit"
                    ? "a teammate's desk"
                    : a.act === "sofa"
                      ? "lounge"
                      : a.act === "window"
                        ? "the window"
                        : a.act === "cooler"
                          ? "water cooler"
                          : a.act === "print"
                            ? "printer"
                            : "floor";
      if (walking) counts.walking++;
      else if (where === "desk") counts.desk++;
      else if (where === "meeting room") counts.meeting++;
      else if (where === "coffee bar") counts.coffee++;
      else counts.other++;
      const goingTo = a.goal
        ? { think: "meeting room", coffee: "coffee", typing: "desk", desk: "desk", lean: "desk", server: "kernel room", vault: "vault", visit: "a teammate", approval: "desk", cooler: "water cooler", window: "window", sofa: "lounge", shrug: "", print: "printer" }[a.goal.act]
        : "";
      const status =
        a.phase === "thinking"
          ? a.goal
            ? "heading to think"
            : "thinking in the meeting room"
          : a.phase === "waiting"
            ? "waiting on background work — coffee"
            : a.phase === "writing"
              ? a.goal
                ? "rushing back to write"
                : "writing at the desk"
              : a.phase === "done"
                ? `shipped · ${a.note}`
                : a.phase === "error"
                  ? "inspecting the kernel room"
                  : a.phase === "approval"
                    ? "waiting for your approval"
                    : walking
                      ? `walking to ${goingTo}`
                      : a.act === "visit"
                        ? "talking to a teammate"
                        : where === "desk"
                          ? "working at the desk"
                          : `at ${where}`;
      const elapsed = this.now - a.phaseAt;
      const progress =
        a.phase === "writing" ? Math.min(0.95, 0.15 + a.stream.length / 1600) : a.phase === "thinking" ? Math.min(0.5, elapsed / 12000) : a.phase === "waiting" ? 0.45 : a.phase === "done" ? 1 : 0;
      return { id: a.id, bot: a.bot, role: a.role, color: a.color, status, phase: a.phase, where, progress };
    });
    return { agents, counts };
  }

  hit(px: number, py: number): PersonaId | null {
    const v = this.view;
    const wx = (px - v.ox) / v.s;
    const wy = (py - v.oy) / v.s;
    let best: { id: PersonaId; d: number } | null = null;
    for (const a of this.agents) {
      const [sx, sy] = iso(a.x, a.y);
      if (wx > sx - 9 && wx < sx + 9 && wy > sy - 38 && wy < sy + 4) {
        const d = Math.abs(wx - sx) + Math.abs(wy - (sy - 18));
        if (!best || d < best.d) best = { id: a.id, d };
      }
    }
    return best?.id ?? null;
  }

  /** Screen position (CSS px) of a bot's head, for DOM tooltips. */
  headAt(id: PersonaId): [number, number] | null {
    const a = this.agent(id);
    if (!a) return null;
    const [sx, sy] = iso(a.x, a.y, 40);
    return [sx * this.view.s + this.view.ox, sy * this.view.s + this.view.oy];
  }

  /* -------------------------------------------------------------- render */

  /** Operator camera input (CSS px). */
  zoomAt(px: number, py: number, factor: number) {
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
    if (this.follow) {
      this.user = { ...this.cam };
      this.follow = false;
    }
    this.user.x -= dxPx / this.view.s;
    this.user.y -= dyPx / this.view.s;
  }

  resetCamera() {
    this.user = { z: 1, x: (GW - GH) * HW * 0.5, y: ((GW + GH) * HH - WALL_H) * 0.5 };
    this.follow = true;
  }

  private cameraTarget(fit: number, w: number, h: number) {
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
    const cx = (maxX - minX) / 2 < halfW ? (minX + maxX) / 2 : Math.min(maxX - halfW, Math.max(minX + halfW, this.cam.x));
    const cy = (maxY - minY) / 2 < halfH ? (minY + maxY) / 2 : Math.min(maxY - halfH, Math.max(minY + halfH, this.cam.y));
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
    const k = Math.min(4.5, fit * dpr * bucket);
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

    // Depth-sorted scene: furniture, partitions, empty chairs, bots, the robot vacuum.
    const list: Item[] = [...this.items];
    const seated = new Set<Spot>();
    for (const a of this.agents) {
      if (a.spot && !a.goal && a.spot.seat) seated.add(a.spot);
      list.push({ x0: a.x - 0.22, y0: a.y - 0.22, x1: a.x + 0.22, y1: a.y + 0.22, h: 40, draw: (c) => this.drawAgent(c, a) });
    }
    for (const sp of [...this.agents.map((a) => a.desk), ...this.meeting]) {
      if (seated.has(sp)) continue;
      const pull = sp.face === "S" ? -0.12 : 0.12;
      list.push({ x0: sp.x - 0.3, y0: sp.y + pull - 0.3, x1: sp.x + 0.3, y1: sp.y + pull + 0.3, h: 22, draw: (c) => this.drawChair(c, sp.x, sp.y + pull, sp.face, sp.chair ?? "#2c3036", "all") });
    }
    const r = this.roomba;
    list.push({ x0: r.x - 0.25, y0: r.y - 0.25, x1: r.x + 0.25, y1: r.y + 0.25, h: 4, draw: (c) => this.drawRoomba(c) });
    for (const it of sortItems(list)) it.draw(ctx);

    this.drawGlow(ctx);
    this.drawParticles(ctx);

    // Vignette + night grade in screen space.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

    // Carpet with fibre noise.
    const noise = document.createElement("canvas");
    noise.width = noise.height = 96;
    const nc = noise.getContext("2d")!;
    const img = nc.createImageData(96, 96);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 46 + Math.floor(hash(i * 0.37) * 14);
      img.data[i] = v;
      img.data[i + 1] = v + 3;
      img.data[i + 2] = v + 8;
      img.data[i + 3] = 255;
    }
    nc.putImageData(img, 0, 0);
    const carpet = c.createPattern(noise, "repeat")!;
    rect(0, 0, GW, GH, carpet);
    c.globalAlpha = 0.5;
    rect(0, 7, GW, GH, "#2c3036");
    c.globalAlpha = 1;
    // Carpet tile seams.
    c.strokeStyle = "rgba(255,255,255,0.035)";
    c.lineWidth = 0.6;
    for (let x = 0; x <= GW; x += 2) {
      c.beginPath();
      c.moveTo(...iso(x, 7));
      c.lineTo(...iso(x, GH));
      c.stroke();
    }
    for (let y = 7; y <= GH; y += 2) {
      c.beginPath();
      c.moveTo(...iso(0, y));
      c.lineTo(...iso(GW, y));
      c.stroke();
    }

    // Kernel room: raised access floor.
    rect(0, 0, 8, 7, "#1b1e22");
    for (let x = 0; x < 8; x++)
      for (let y = 0; y < 7; y++) {
        poly(c, [iso(x + 0.04, y + 0.04), iso(x + 0.96, y + 0.04), iso(x + 0.96, y + 0.96), iso(x + 0.04, y + 0.96)], (x + y) % 3 === 0 ? "#22262b" : "#1f2327");
        if ((x * 7 + y) % 5 === 0) {
          c.fillStyle = "rgba(143,179,155,0.10)";
          for (let k = 0; k < 9; k++) {
            const [px, py] = iso(x + 0.25 + (k % 3) * 0.25, y + 0.25 + Math.floor(k / 3) * 0.25);
            c.fillRect(px - 0.4, py - 0.3, 0.8, 0.6);
          }
        }
      }

    // Conference + vault: wood planks.
    const planks = (x0: number, x1: number, base: string) => {
      rect(x0, 0, x1, 7, base);
      for (let y = 0; y < 7; y += 0.34) {
        c.strokeStyle = "rgba(0,0,0,0.22)";
        c.lineWidth = 0.5;
        c.beginPath();
        c.moveTo(...iso(x0, y));
        c.lineTo(...iso(x1, y));
        c.stroke();
        const j = x0 + ((hash(y * 13 + x0) * 3) % (x1 - x0));
        c.beginPath();
        c.moveTo(...iso(j, y));
        c.lineTo(...iso(j, y + 0.34));
        c.stroke();
      }
      const g = c.createLinearGradient(...iso(x0, 0), ...iso(x1, 7));
      g.addColorStop(0, "rgba(255,240,220,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0.12)");
      rect(x0, 0, x1, 7, g);
    };
    planks(8, 17, "#4b3a2b");
    planks(17, GW, "#3b2f25");
    // Vault rug.
    rect(18.6, 2.3, 23.4, 5.6, "#5a2f2a");
    rect(18.85, 2.55, 23.15, 5.35, "#6d3a31");
    rect(19.2, 2.9, 22.8, 5.0, "#5a2f2a");

    // Lounge: checker tiles.
    for (let x = 19; x < GW; x++)
      for (let y = 13; y < GH; y++) {
        for (let i = 0; i < 2; i++)
          for (let j = 0; j < 2; j++)
            poly(c, [iso(x + i / 2, y + j / 2), iso(x + (i + 1) / 2, y + j / 2), iso(x + (i + 1) / 2, y + (j + 1) / 2), iso(x + i / 2, y + (j + 1) / 2)], (i + j) % 2 ? "#3a362f" : "#2d2a25");
      }
    // Reception: polished stone with soft reflections.
    rect(0, 14, 7, GH, "#34322e");
    for (let i = 0; i < 6; i++) {
      const g = c.createLinearGradient(...iso(i * 1.2, 14), ...iso(i * 1.2 + 0.8, 20));
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.025)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      rect(i * 1.2, 14, i * 1.2 + 0.6, GH, g);
    }
    rect(0, 16.6, 1.3, 19.4, "#1c1b19");

    // Ambient occlusion where floor meets the back walls.
    const ao = (from: [number, number], to: [number, number], pts: [number, number][]) => {
      const g = c.createLinearGradient(from[0], from[1], to[0], to[1]);
      g.addColorStop(0, "rgba(0,0,0,0.45)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      poly(c, pts, g);
    };
    ao(iso(6, 0), iso(6, 1.2), [iso(0, 0), iso(GW, 0), iso(GW, 1.2), iso(0, 1.2)]);
    ao(iso(0, 6), iso(1.2, 6), [iso(0, 0), iso(1.2, 0), iso(1.2, GH), iso(0, GH)]);

    // Back walls.
    const wallY = (x0: number, x1: number, col: string) => {
      const g = c.createLinearGradient(0, iso(x0, 0, WALL_H)[1], 0, iso(x0, 0, 0)[1]);
      g.addColorStop(0, shade(col, 1.08));
      g.addColorStop(1, shade(col, 0.82));
      poly(c, [iso(x0, 0, 0), iso(x1, 0, 0), iso(x1, 0, WALL_H), iso(x0, 0, WALL_H)], g);
    };
    const wallX = (y0: number, y1: number, col: string) => {
      const g = c.createLinearGradient(0, iso(0, y0, WALL_H)[1], 0, iso(0, y0, 0)[1]);
      g.addColorStop(0, shade(col, 1.0));
      g.addColorStop(1, shade(col, 0.74));
      poly(c, [iso(0, y0, 0), iso(0, y1, 0), iso(0, y1, WALL_H), iso(0, y0, WALL_H)], g);
    };
    wallY(0, 8, "#2e3236");
    wallY(8, 17, "#4a443b");
    wallY(17, GW, "#3d362e");
    wallX(0, 7, "#2a2e32");
    wallX(7, GH, "#433e36");
    // Wall caps and skirting.
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

    // Windows on the left wall (open floor): sky by local time, skyline, mullions, reflections.
    const day = hour >= 7 && hour < 17.5;
    const dusk = (hour >= 17.5 && hour < 19.5) || (hour >= 5.5 && hour < 7);
    onYFace(c, 0, 13.6, 0, () => {
      const W = (13.6 - 8.2) * 17.9;
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
      // Skyline.
      for (const b of this.skyline) {
        const bx = b.x * W * 0.18;
        c.fillStyle = day ? "rgba(90,105,115,0.75)" : "#0a0d14";
        c.fillRect(bx, bot - b.h, b.w * 40, b.h);
        if (!day)
          for (let k = 0; k < 10; k++) {
            if (hash(b.x * 50 + k) > 0.55) continue;
            c.fillStyle = "rgba(255,214,140,0.8)";
            c.fillRect(bx + 2 + (k % 3) * 3.5, bot - b.h + 3 + Math.floor(k / 3) * 5, 1.4, 1.8);
          }
      }
      // Reflection streaks.
      c.fillStyle = "rgba(255,255,255,0.07)";
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.moveTo(i * 24 + 8, top);
        c.lineTo(i * 24 + 18, top);
        c.lineTo(i * 24 + 2, bot);
        c.lineTo(i * 24 - 8, bot);
        c.closePath();
        c.fill();
      }
      // Frame + mullions.
      c.strokeStyle = "#1c1d1f";
      c.lineWidth = 2.2;
      c.strokeRect(0, top, W, bot - top);
      for (let i = 1; i < 4; i++) {
        c.beginPath();
        c.moveTo((W / 4) * i, top);
        c.lineTo((W / 4) * i, bot);
        c.stroke();
      }
      c.fillStyle = "#58534a";
      c.fillRect(-2, bot, W + 4, 2.4);
    });

    // Entrance door + sign.
    onYFace(c, 0, 18.9, 0, () => {
      const W = 1.8 * 17.9;
      c.fillStyle = "#26231f";
      c.fillRect(0, -54, W, 54);
      c.fillStyle = "rgba(143,179,155,0.18)";
      c.fillRect(4, -48, W - 8, 22);
      c.fillStyle = "#c9c2b0";
      c.fillRect(W - 6, -26, 2, 6);
      c.fillStyle = "#13261b";
      c.fillRect(W / 2 - 9, -64, 18, 7);
      c.fillStyle = "#8fb39b";
      c.font = "600 5px IBM Plex Mono, monospace";
      c.textAlign = "center";
      c.fillText("ENTRANCE", W / 2, -58.8);
    });

    // AXIOM wordmark behind reception.
    onYFace(c, 0, 16.8, 0, () => {
      c.fillStyle = "#d6d3c8";
      c.font = "600 15px Cormorant Garamond, Georgia, serif";
      c.textAlign = "left";
      c.fillText("A X I O M", 4, -44);
      c.fillStyle = "#8fb39b";
      c.fillRect(4, -40, 66, 1.2);
      c.fillStyle = "rgba(214,211,200,0.55)";
      c.font = "500 4.2px IBM Plex Mono, monospace";
      c.fillText("OPERATOR  STATION", 6, -33);
    });

    // Room signs on the back wall.
    const sign = (x: number, text: string) =>
      onXFace(c, x, 0, 0, () => {
        c.fillStyle = "rgba(0,0,0,0.35)";
        rr(c, 0, -78, text.length * 4.6 + 10, 9, 2);
        c.fill();
        c.fillStyle = "#d6d3c8";
        c.font = "600 5.4px IBM Plex Mono, monospace";
        c.textAlign = "left";
        c.fillText(text, 5, -71.6);
      });
    sign(1.2, "KERNEL ROOM");
    sign(9.0, "CONFERENCE");
    sign(18.5, "VAULT");

    // Whiteboard in the conference room.
    onXFace(c, 8.6, 0, 0, () => {
      c.fillStyle = "#e8e6df";
      c.fillRect(0, -60, 22, 26);
      c.strokeStyle = "#8a8f88";
      c.lineWidth = 1;
      c.strokeRect(0, -60, 22, 26);
      c.strokeStyle = "#5b6b8c";
      c.lineWidth = 0.6;
      c.beginPath();
      c.moveTo(3, -54);
      c.lineTo(12, -54);
      c.moveTo(3, -50);
      c.lineTo(17, -50);
      c.moveTo(3, -46);
      c.lineTo(9, -46);
      c.stroke();
      c.strokeStyle = "#b8735f";
      c.beginPath();
      c.arc(15, -42, 3, 0, Math.PI * 2);
      c.stroke();
    });

    // Floor labels (pills), like a floor plan.
    const label = (x: number, y: number, text: string) => {
      const [sx, sy] = iso(x, y);
      c.font = "600 5.2px IBM Plex Mono, monospace";
      const tw = c.measureText(text).width;
      c.fillStyle = "rgba(10,11,12,0.72)";
      rr(c, sx - tw / 2 - 4, sy - 4.5, tw + 8, 9, 4.5);
      c.fill();
      c.fillStyle = "rgba(214,211,200,0.8)";
      c.textAlign = "center";
      c.fillText(text, sx, sy + 1.9);
    };
    label(5.5, 6.2, "KERNEL");
    label(15.2, 6.2, "MEETING");
    label(24.4, 6.2, "VAULT");
    label(24.5, 12.6, "COFFEE BAR");
    label(5.6, 18.8, "RECEPTION");
    label(12.6, 7.8, "OPEN FLOOR");
  }

  /* ---------- live wall details: TV, clock, rack LEDs glow */

  private drawWallLive(c: CanvasRenderingContext2D, hour: number) {
    const t = this.now / 1000;
    // Conference TV showing the kernel spine compiling.
    onXFace(c, 10.4, 0, 0, () => {
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
      c.fillStyle = "rgba(143,179,155,0.9)";
      c.fillText(`${(27800 + Math.floor(Math.sin(t * 0.4) * 300)).toLocaleString()}c`, W - 22, -53);
    });
    // Wall clock (real time).
    onXFace(c, 15.4, 0, 0, () => {
      const d = new Date();
      const cx = 7;
      const cy = -64;
      c.fillStyle = "#e8e6df";
      c.beginPath();
      c.arc(cx, cy, 6, 0, Math.PI * 2);
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
      hand(((d.getHours() % 12) + d.getMinutes() / 60) * (Math.PI / 6), 3.2, 1);
      hand(d.getMinutes() * (Math.PI / 30), 4.6, 0.6);
      c.strokeStyle = "#b8735f";
      hand(d.getSeconds() * (Math.PI / 30), 4.8, 0.3);
    });
    void hour;
  }

  private drawLightPools(c: CanvasRenderingContext2D, hour: number) {
    const night = hour < 7 || hour >= 18;
    c.save();
    c.globalCompositeOperation = "screen";
    const pools: [number, number, number][] = [
      [5, 10, 1],
      [12, 10, 1],
      [19, 10, 1],
      [6, 16, 0.8],
      [13, 16.5, 0.8],
      [22.5, 16.5, 0.9],
      [3.8, 3.5, 0.6],
      [12, 3.5, 0.9],
      [21.5, 3.5, 0.8],
    ];
    for (const [x, y, k] of pools) {
      const [sx, sy] = iso(x, y);
      const flick = 0.96 + Math.sin(this.now / 900 + x) * 0.02;
      c.save();
      c.translate(sx, sy);
      c.scale(1, 0.5);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 70);
      const a = (night ? 0.2 : 0.13) * k * flick;
      g.addColorStop(0, `rgba(255,236,205,${a})`);
      g.addColorStop(1, "rgba(255,236,205,0)");
      c.fillStyle = g;
      c.fillRect(-70, -70, 140, 140);
      c.restore();
    }
    // Daylight through the windows.
    if (!night) {
      const g = c.createLinearGradient(...iso(0, 11), ...iso(6, 13));
      g.addColorStop(0, "rgba(220,235,240,0.12)");
      g.addColorStop(1, "rgba(220,235,240,0)");
      poly(c, [iso(0, 8.2), iso(0, 13.6), iso(6, 15.6), iso(6, 10.2)], g);
    }
    // Kernel flash on compile.
    const k = Math.max(0, 1 - (this.now - this.kernelFlash) / 900);
    if (k > 0) {
      const [sx, sy] = iso(3.8, 3.8);
      c.save();
      c.translate(sx, sy);
      c.scale(1, 0.55);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 90);
      g.addColorStop(0, `rgba(143,179,155,${0.45 * k})`);
      g.addColorStop(1, "rgba(143,179,155,0)");
      c.fillStyle = g;
      c.fillRect(-90, -90, 180, 180);
      c.restore();
    }
    c.restore();
  }

  private drawGlow(c: CanvasRenderingContext2D) {
    c.save();
    c.globalCompositeOperation = "screen";
    for (const a of this.agents) {
      if (a.spot !== a.desk || a.goal) continue;
      const mx = a.desk.x;
      const my = a.desk.face === "S" ? 9.85 : 10.15;
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
    const order = [...this.agents].sort((p, q) => p.x + p.y - (q.x + q.y));
    for (const a of order) {
      const [wx, wy] = iso(a.x, a.y, 40 - a.sit * 4.5);
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
    const tag = { say: "", think: a.phase === "waiting" ? " · WAITING" : " · THINKING", stream: " · WRITING", ok: " · SHIPPED", err: " · ERROR", warn: a.phase === "approval" ? " · APPROVAL" : "" }[b.kind];
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
    const t = this.now / 1000;
    const [sx, sy] = iso(a.x, a.y);
    const [fx, fy] = FACE_VEC[a.face];
    const front = a.face === "E" || a.face === "S";
    const sit = a.sit;
    const L = a.look;
    const seatChair = a.spot?.seat && !a.goal ? a.spot.chair ?? (a.act === "sofa" ? null : "#2c3036") : null;
    const breathe = Math.sin(t * 1.7 + a.seed) * 0.35;
    const bob = a.moving ? Math.abs(Math.sin(a.walkPhase)) * 1.3 : breathe;
    const hip = 13.5 - sit * 5;
    const hipY = sy - hip - bob * 0.5;
    const shoulderY = hipY - 12.5 + (a.act === "shrug" ? -1.2 : 0);
    const lean = a.act === "typing" ? 1.4 : a.act === "lean" ? -1.6 : 0;
    const topX = sx + fx * lean;
    const topY = shoulderY + fy * lean;

    // Contact shadow.
    c.fillStyle = "rgba(0,0,0,0.32)";
    c.beginPath();
    c.ellipse(sx, sy, 7.5, 3.4, 0, 0, Math.PI * 2);
    c.fill();

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
      switch (a.goal ? "walk" : a.act) {
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

  private desk(x0: number, y0: number, kind: "far" | "near"): Item {
    const owner = () => this.agents.find((a) => a.desk.x === x0 + 1 && a.desk.y === (kind === "far" ? 8.5 : 11.5));
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
