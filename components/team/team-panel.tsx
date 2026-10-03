"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Brain,
  Check,
  ChevronDown,
  Coffee,
  Copy,
  History,
  Play,
  Plus,
  Repeat,
  RotateCcw,
  ShieldAlert,
  Square,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Lamp } from "@/components/axiom-mark";
import { Markdown } from "@/components/markdown";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";
import { abortTeam, decideApproval, runRoutine, runTeam, startRoutineClock } from "@/lib/team/client";
import { hydrateTeam, useTeam, type Routine, type RoutineEvery, type TeamLane, type TeamRun } from "@/lib/team/store";
import { LEAD, MEMORY_MAX_CHARS, MEMORY_MAX_NOTES } from "@/lib/team/types";

type Persona = (typeof PERSONAS)[number];
const BY_ID = Object.fromEntries(PERSONAS.map((p) => [p.id, p])) as Record<PersonaId, Persona>;
const EVERY: RoutineEvery[] = [0, 15, 30, 60];

/** Readable initial on a bot's signature color. */
function ink(hex: string) {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lum = (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255;
  return lum > 0.5 ? "#0a0b0c" : "#ecece8";
}

function role(p: Persona, idUi: boolean) {
  return idUi ? p.nameId : p.name;
}

function useNow(active: boolean, ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [active, ms]);
  return now;
}

function ago(t: number, now: number, idUi: boolean) {
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return idUi ? "baru saja" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return idUi ? `${m} mnt lalu` : `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return idUi ? `${h} jam lalu` : `${h} h ago`;
  return new Date(t).toLocaleDateString(idUi ? "id-ID" : "en-US", { month: "short", day: "numeric" });
}

const SEEDS: { title: [string, string]; text: [string, string]; bots: PersonaId[] }[] = [
  {
    title: ["Launch plan", "Rencana peluncuran"],
    text: [
      "Plan the launch of a small bilingual newsletter: positioning, a first-issue outline, and a one-week schedule.",
      "Rencanakan peluncuran newsletter dwibahasa kecil: positioning, outline edisi pertama, dan jadwal satu minggu.",
    ],
    bots: ["researcher", "writer", "strategist"],
  },
  {
    title: ["Idea review", "Review ide"],
    text: [
      "Review my idea for a habit-tracker app: the crux, the smallest build, and landing-page copy.",
      "Review ide aplikasi pelacak kebiasaan saya: inti masalah, build terkecil, dan teks landing page.",
    ],
    bots: ["researcher", "coder", "writer"],
  },
  {
    title: ["Needs approval", "Perlu persetujuan"],
    text: [
      "Draft a product update for our beta users and send it to the beta list by email.",
      "Buat update produk untuk pengguna beta dan kirim ke daftar beta lewat email.",
    ],
    bots: ["writer", "strategist"],
  },
];

/* ------------------------------------------------------------------ */
/* Panel                                                                */
/* ------------------------------------------------------------------ */

export function TeamPanel() {
  const idUi = useStation((s) => s.language) !== "en";
  const compileMode = useStation((s) => s.compileMode);
  const roster = useTeam((s) => s.roster);
  const running = useTeam((s) => s.running);
  const current = useTeam((s) => s.current);
  const routines = useTeam((s) => s.routines);
  const history = useTeam((s) => s.history);
  const setRoster = useTeam((s) => s.setRoster);
  const closeRun = useTeam((s) => s.closeRun);
  const [draft, setDraft] = useState("");
  const [memOpen, setMemOpen] = useState<PersonaId | null>(null);
  const [showRoutines, setShowRoutines] = useState<boolean | null>(null);
  const [showPast, setShowPast] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    void hydrateTeam();
    startRoutineClock();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useTeam.getState().running) abortTeam();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A new run on screen: jump to it and follow it while it streams.
  useEffect(() => {
    stick.current = true;
    const el = scroller.current;
    if (el && current) el.scrollTop = el.scrollHeight;
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = scroller.current;
    if (el && running && stick.current) el.scrollTop = el.scrollHeight;
  }, [current, running]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [draft]);

  function start() {
    const job = draft.trim();
    if (!job || running || !roster.length) return;
    setDraft("");
    void runTeam(job, roster);
  }

  const routinesOpen = showRoutines ?? routines.length > 0;
  const scheduled = routines.filter((r) => r.every > 0).length;
  const team = [LEAD, ...roster];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 160;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8"
      >
        <div className="@container mx-auto max-w-[64rem]">
          <p className="eyebrow">
            {idUi ? "Tim" : "Team"} · {PERSONAS.length} bot · lead {BY_ID[LEAD].bot}
          </p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
            {idUi ? "Rekan kerja AXIOM" : "AXIOM teammates"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted text-pretty">
            {idUi
              ? "Atlas memecah job, rekan tim mengerjakan bagiannya secara paralel — masing-masing dengan kernel dan memorinya sendiri — lalu Atlas menyatukan hasilnya. Aksi sensitif menunggu persetujuanmu."
              : "Atlas splits the job, teammates work their parts in parallel — each on its own kernel and memory — and Atlas merges the result. Sensitive actions wait for your approval."}
          </p>

          <Roster idUi={idUi} running={running} memOpen={memOpen} setMemOpen={setMemOpen} />
          {memOpen ? <MemoryEditor key={memOpen} bot={memOpen} idUi={idUi} onClose={() => setMemOpen(null)} /> : null}

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <SectionToggle
              open={routinesOpen}
              onClick={() => setShowRoutines(!routinesOpen)}
              icon={<Repeat className="size-3.5" />}
              label={idUi ? "Routine" : "Routines"}
              count={routines.length}
              badge={scheduled ? `${scheduled} ${idUi ? "terjadwal" : "scheduled"}` : null}
            />
            <SectionToggle
              open={showPast}
              onClick={() => setShowPast(!showPast)}
              icon={<History className="size-3.5" />}
              label={idUi ? "Run sebelumnya" : "Past runs"}
              count={history.length}
            />
            {current && !running ? (
              <button
                type="button"
                onClick={() => {
                  closeRun();
                  input.current?.focus();
                }}
                className="ml-auto flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs text-muted hover:bg-elevated hover:text-fg"
              >
                <Plus className="size-3.5" />
                {idUi ? "Job baru" : "New job"}
              </button>
            ) : null}
          </div>
          {routinesOpen ? <RoutinesPanel idUi={idUi} running={running} /> : null}
          {showPast ? <PastRuns idUi={idUi} running={running} /> : null}

          <div className="mt-8 border-t border-line pt-8">
            {current ? (
              <RunView run={current} idUi={idUi} live={running} />
            ) : (
              <EmptyState
                idUi={idUi}
                onSeed={(text, bots) => {
                  setRoster(bots);
                  setDraft(text);
                  input.current?.focus();
                }}
              />
            )}
          </div>
        </div>
      </div>

      <div className="px-3 pt-2 pb-3 md:px-6 md:pb-5">
        <form
          className="mx-auto max-w-[64rem] rounded-2xl border border-line bg-surface p-2 transition-colors focus-within:border-line-strong"
          onSubmit={(e) => {
            e.preventDefault();
            start();
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  start();
                }
              }}
              rows={1}
              placeholder={idUi ? "Beri tim sebuah job…" : "Give the team a job…"}
              className="min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-fg outline-none placeholder:text-subtle"
            />
            {running ? (
              <button
                type="button"
                onClick={() => abortTeam()}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-elevated px-3.5 text-sm text-fg hover:bg-line-strong"
                title={idUi ? "Hentikan (Esc)" : "Stop (Esc)"}
              >
                <Square className="size-3 fill-current" />
                {idUi ? "Hentikan" : "Stop"}
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() || !roster.length}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-accent px-3.5 text-sm font-medium text-accent-fg transition-opacity disabled:opacity-30"
              >
                <Users className="size-4" strokeWidth={2} />
                {idUi ? "Jalankan tim" : "Run team"}
              </button>
            )}
          </div>
          <div className="flex min-w-0 items-center gap-3 px-2 pt-1 pb-0.5 font-mono text-[10px] text-subtle">
            <span className="flex min-w-0 items-center gap-1.5">
              <Lamp live={running} tone={roster.length ? "signal" : "warn"} className="size-1.5 shrink-0" />
              <span className="truncate">
                {roster.length
                  ? team.map((id) => BY_ID[id].bot).join(" · ")
                  : idUi
                    ? "Pilih minimal satu rekan tim."
                    : "Pick at least one teammate."}
              </span>
            </span>
            <span className="hidden shrink-0 sm:inline">kernel {compileMode}</span>
            <span className="ml-auto hidden shrink-0 items-center gap-1 sm:flex">
              {running ? (
                <>
                  <span className="kbd">Esc</span> stop
                </>
              ) : (
                <>
                  <span className="kbd">Enter</span> {idUi ? "jalankan" : "run"}
                </>
              )}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roster and memory                                                    */
/* ------------------------------------------------------------------ */

function BotAvatar({ id, size = 28, live = false, className }: { id: PersonaId; size?: number; live?: boolean; className?: string }) {
  const p = BY_ID[id];
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

function AvatarStack({ bots, size = 18 }: { bots: PersonaId[]; size?: number }) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {bots.map((b) => (
        <BotAvatar key={b} id={b} size={size} className="ring-2 ring-surface" />
      ))}
    </span>
  );
}

function Roster({
  idUi,
  running,
  memOpen,
  setMemOpen,
}: {
  idUi: boolean;
  running: boolean;
  memOpen: PersonaId | null;
  setMemOpen: (id: PersonaId | null) => void;
}) {
  const roster = useTeam((s) => s.roster);
  const memory = useTeam((s) => s.memory);
  const toggleBot = useTeam((s) => s.toggleBot);

  return (
    <div className="mt-6 grid grid-cols-2 gap-2 @lg:grid-cols-3 @4xl:grid-cols-6">
      {PERSONAS.map((p) => {
        const lead = p.id === LEAD;
        const on = lead || roster.includes(p.id);
        const notes = memory[p.id]?.length ?? 0;
        return (
          <div
            key={p.id}
            className={cn(
              "min-w-0 rounded-xl border transition-colors",
              on ? "border-line-strong bg-elevated/70" : "border-line bg-surface/50",
              memOpen === p.id && "border-accent/50",
            )}
          >
            <button
              type="button"
              title={p.blurb}
              aria-pressed={on}
              disabled={lead || running}
              onClick={() => toggleBot(p.id)}
              className={cn("flex w-full min-w-0 items-center gap-2.5 px-3 pt-2.5 pb-1.5 text-left", !on && "opacity-60 hover:opacity-100")}
            >
              <BotAvatar id={p.id} size={30} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{p.bot}</span>
                <span className="block truncate font-mono text-[9.5px] tracking-[0.14em] text-subtle uppercase">{role(p, idUi)}</span>
              </span>
              {lead ? (
                <span className="shrink-0 rounded-full border border-line-strong px-1.5 py-px font-mono text-[9px] tracking-wider text-muted uppercase">
                  lead
                </span>
              ) : (
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-full border",
                    on ? "border-signal bg-signal text-accent-fg" : "border-line-strong",
                  )}
                >
                  {on ? <Check className="size-2.5" strokeWidth={3.5} /> : null}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMemOpen(memOpen === p.id ? null : p.id)}
              aria-expanded={memOpen === p.id}
              className="flex w-full items-center gap-1.5 px-3 pb-2 font-mono text-[10px] text-subtle hover:text-fg"
            >
              <Brain className="size-3" />
              {notes} {idUi ? "memori" : notes === 1 ? "note" : "notes"}
              <ChevronDown className={cn("ml-auto size-3 transition-transform", memOpen === p.id && "rotate-180")} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MemoryEditor({ bot, idUi, onClose }: { bot: PersonaId; idUi: boolean; onClose: () => void }) {
  const notes = useTeam((s) => s.memory[bot]) ?? [];
  const addMemory = useTeam((s) => s.addMemory);
  const removeMemory = useTeam((s) => s.removeMemory);
  const [text, setText] = useState("");
  const p = BY_ID[bot];
  const full = notes.length >= MEMORY_MAX_NOTES;

  return (
    <div className="mt-3 animate-fade rounded-xl border border-line bg-surface p-3 md:p-4">
      <div className="flex items-center gap-2.5">
        <BotAvatar id={bot} size={24} />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{idUi ? `Memori ${p.bot}` : `${p.bot}'s memory`}</p>
        <span className="font-mono text-[10px] text-subtle tabular-nums">
          {notes.length}/{MEMORY_MAX_NOTES}
        </span>
        <button type="button" onClick={onClose} className="flex size-8 items-center justify-center rounded-md text-muted hover:text-fg" aria-label={idUi ? "Tutup" : "Close"}>
          <X className="size-4" />
        </button>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted">
        {idUi
          ? `Disuntik hanya ke kernel ${p.bot}, di setiap run tim. Preferensi, fakta, cara kerja.`
          : `Injected into ${p.bot}'s kernel only, on every team run. Preferences, facts, how it should work.`}
      </p>
      {notes.length ? (
        <ul className="mt-3 space-y-1.5">
          {notes.map((n, i) => (
            <li key={`${i}-${n}`} className="flex items-start gap-2.5 rounded-lg border border-line bg-inset px-2.5 py-2">
              <span className="mt-0.5 font-mono text-[10px] text-signal">◆</span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed [overflow-wrap:anywhere] text-fg">{n}</p>
              <button
                type="button"
                onClick={() => removeMemory(bot, i)}
                className="flex size-7 shrink-0 items-center justify-center rounded-md text-subtle hover:text-danger"
                aria-label={idUi ? "Hapus" : "Remove"}
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addMemory(bot, text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MEMORY_MAX_CHARS}
          disabled={full}
          placeholder={
            full
              ? idUi
                ? "Memori penuh — hapus satu dulu."
                : "Memory full — remove one first."
              : idUi
                ? `Satu hal yang harus diingat ${p.bot}…`
                : `One thing ${p.bot} should remember…`
          }
          className="h-10 min-w-0 flex-1 rounded-lg border border-line bg-inset px-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
        />
        <button type="submit" disabled={!text.trim() || full} className="h-10 shrink-0 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg disabled:opacity-30">
          {idUi ? "Tambah" : "Add"}
        </button>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Routines and past runs                                               */
/* ------------------------------------------------------------------ */

function SectionToggle({
  open,
  onClick,
  icon,
  label,
  count,
  badge,
}: {
  open: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  badge?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
        open ? "border-line-strong bg-elevated text-fg" : "border-line text-muted hover:border-line-strong hover:text-fg",
      )}
    >
      {icon}
      {label}
      <span className="font-mono text-[10px] text-subtle tabular-nums">{count}</span>
      {badge ? <span className="rounded-full bg-signal/15 px-1.5 font-mono text-[9.5px] text-signal">{badge}</span> : null}
      <ChevronDown className={cn("size-3 text-subtle transition-transform", open && "rotate-180")} />
    </button>
  );
}

function RoutinesPanel({ idUi, running }: { idUi: boolean; running: boolean }) {
  const routines = useTeam((s) => s.routines);
  const now = useNow(true, 20_000);

  return (
    <section className="mt-3 animate-fade rounded-xl border border-line bg-surface/60 p-3 md:p-4">
      <p className="text-xs leading-relaxed text-muted">
        {idUi
          ? "Routine menjalankan ulang job yang sama dengan tim yang sama. Interval hanya berjalan selama tab stasiun ini terbuka."
          : "A routine re-runs the same job with the same team. Intervals only fire while this station tab is open."}
      </p>
      {routines.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">
          {idUi ? "Belum ada routine. Simpan run yang selesai sebagai routine." : "No routines yet. Save a finished run as a routine."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {routines.map((r) => (
            <RoutineRow key={r.id} r={r} idUi={idUi} running={running} now={now} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RoutineRow({ r, idUi, running, now }: { r: Routine; idUi: boolean; running: boolean; now: number }) {
  const setRoutineEvery = useTeam((s) => s.setRoutineEvery);
  const removeRoutine = useTeam((s) => s.removeRoutine);
  const nextMin = r.every && r.nextAt ? Math.max(0, Math.ceil((r.nextAt - now) / 60_000)) : null;

  return (
    <li className="rounded-xl border border-line bg-surface px-3 py-3">
      <div className="flex items-start gap-3">
        <Repeat className="mt-0.5 size-4 shrink-0 text-signal" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{r.name}</p>
          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed [overflow-wrap:anywhere] text-muted">{r.job}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <AvatarStack bots={[LEAD, ...r.bots]} />
            <label className="flex items-center gap-1.5 font-mono text-[10px] text-subtle">
              {idUi ? "ulang" : "every"}
              <select
                value={r.every}
                onChange={(e) => setRoutineEvery(r.id, Number(e.target.value) as RoutineEvery)}
                className="h-7 rounded-md border border-line bg-inset px-1.5 font-mono text-[11px] text-fg outline-none focus:border-line-strong"
              >
                {EVERY.map((m) => (
                  <option key={m} value={m}>
                    {m === 0 ? (idUi ? "mati" : "off") : `${m} min`}
                  </option>
                ))}
              </select>
            </label>
            <span className="font-mono text-[10px] text-subtle">
              {idUi ? "terakhir" : "last"} {r.lastRunAt ? ago(r.lastRunAt, now, idUi) : "—"}
              {nextMin !== null ? ` · ${idUi ? "berikutnya" : "next"} ${nextMin <= 0 ? (idUi ? "segera" : "soon") : `${nextMin} min`}` : ""}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => runRoutine(r.id)}
            disabled={running}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line-strong px-2.5 text-xs text-fg hover:bg-elevated disabled:opacity-30"
          >
            <Play className="size-3 fill-current" />
            <span className="hidden sm:inline">{idUi ? "Jalankan" : "Run now"}</span>
          </button>
          <button
            type="button"
            onClick={() => removeRoutine(r.id)}
            className="flex size-8 items-center justify-center rounded-lg text-subtle hover:text-danger"
            aria-label={idUi ? "Hapus routine" : "Delete routine"}
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </div>
    </li>
  );
}

function PastRuns({ idUi, running }: { idUi: boolean; running: boolean }) {
  const history = useTeam((s) => s.history);
  const currentId = useTeam((s) => s.current?.id);
  const openRun = useTeam((s) => s.openRun);
  const clearHistory = useTeam((s) => s.clearHistory);
  const now = useNow(true, 30_000);

  return (
    <section className="mt-3 animate-fade rounded-xl border border-line bg-surface/60 p-2">
      {history.length === 0 ? (
        <p className="px-2 py-2 text-sm text-subtle">{idUi ? "Belum ada run." : "No runs yet."}</p>
      ) : (
        <>
          <ul>
            {history.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => openRun(r.id)}
                  disabled={running}
                  className={cn(
                    "flex w-full min-w-0 items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-elevated/60 disabled:opacity-50",
                    r.id === currentId && "bg-elevated",
                  )}
                >
                  <Lamp tone={r.status === "done" ? "signal" : r.status === "stopped" ? "off" : "danger"} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{r.job}</span>
                    <span className="block truncate font-mono text-[10px] text-subtle">
                      {ago(r.createdAt, now, idUi)} · {r.lanes.length} {idUi ? "jalur" : r.lanes.length === 1 ? "lane" : "lanes"} · {statusLabel(r, idUi)}
                      {r.approval ? ` · ${approvalLabel(r.approval.decision, idUi)}` : ""}
                      {r.routineName ? ` · ${r.routineName}` : ""}
                      {r.demo ? " · demo" : ""}
                    </span>
                  </span>
                  <span className="hidden sm:flex">
                    <AvatarStack bots={[LEAD, ...r.bots]} size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={clearHistory}
            disabled={running}
            className="mt-1 flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] text-subtle hover:text-danger disabled:opacity-30"
          >
            <Trash2 className="size-3" />
            {idUi ? "Bersihkan riwayat" : "Clear history"}
          </button>
        </>
      )}
    </section>
  );
}

function statusLabel(r: TeamRun, idUi: boolean) {
  const map: Record<TeamRun["status"], [string, string]> = {
    planning: ["planning", "merencanakan"],
    working: ["working", "bekerja"],
    synthesizing: ["merging", "menyatukan"],
    done: ["done", "selesai"],
    error: ["error", "gagal"],
    stopped: ["stopped", "dihentikan"],
  };
  return map[r.status][idUi ? 1 : 0];
}

function approvalLabel(d: "pending" | "approved" | "rejected", idUi: boolean) {
  if (d === "pending") return idUi ? "menunggu persetujuan" : "approval pending";
  if (d === "approved") return idUi ? "disetujui" : "approved";
  return idUi ? "ditolak" : "rejected";
}

/* ------------------------------------------------------------------ */
/* Transcript                                                           */
/* ------------------------------------------------------------------ */

function EmptyState({ idUi, onSeed }: { idUi: boolean; onSeed: (text: string, bots: PersonaId[]) => void }) {
  const k = idUi ? 1 : 0;
  return (
    <div className="animate-rise">
      <AvatarStack bots={PERSONAS.map((p) => p.id)} size={30} />
      <p className="mt-5 font-display text-3xl leading-[1.05] font-semibold tracking-tight text-balance md:text-4xl">
        {idUi ? "Tim sudah di meja." : "The team is at their desks."}{" "}
        <span className="text-muted italic">{idUi ? "Apa job-nya?" : "What's the job?"}</span>
      </p>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted text-pretty">
        {idUi
          ? "Pilih rekan tim di atas, tulis job di bawah. Kamu akan melihat rencana Atlas, serah terima ke tiap bot, jalur kerja paralel yang mengalir langsung, lalu hasil gabungannya."
          : "Pick teammates above, write the job below. You'll see Atlas's plan, the handoff to each bot, parallel lanes streaming live, then the merged deliverable."}
      </p>
      <p className="eyebrow mt-7">{idUi ? "Coba job ini" : "Try a job"}</p>
      <div className="mt-3 grid gap-2 @2xl:grid-cols-3">
        {SEEDS.map((s) => (
          <button
            key={s.title[0]}
            type="button"
            onClick={() => onSeed(s.text[k], s.bots)}
            className="group flex min-w-0 flex-col rounded-xl border border-line bg-surface/60 p-3.5 text-left transition-colors hover:border-line-strong hover:bg-surface"
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-display text-lg font-semibold tracking-tight">{s.title[k]}</span>
              <AvatarStack bots={[LEAD, ...s.bots]} size={16} />
            </span>
            <span className="mt-1.5 text-xs leading-relaxed text-muted group-hover:text-fg">{s.text[k]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RunView({ run, idUi, live }: { run: TeamRun; idUi: boolean; live: boolean }) {
  const setEngineOpen = useStation((s) => s.setEngineOpen);
  const working = run.lanes.filter((l) => l.status === "working" || l.status === "queued").length;
  const finished = !live || run.status === "done" || run.status === "error" || run.status === "stopped";
  const lanes = run.lanes.length;

  return (
    <div className="space-y-6">
      <JobMessage run={run} idUi={idUi} />

      {run.demo ? (
        <div className="flex animate-fade items-center gap-2.5 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2 text-xs text-warn">
          <Lamp tone="warn" className="shrink-0" />
          <span className="min-w-0 flex-1">
            {idUi ? "Mode demo — hubungkan key di Engine untuk live." : "Demo mode — connect a key under Engine to go live."}
          </span>
          <button type="button" onClick={() => setEngineOpen(true)} className="shrink-0 font-mono text-[10px] tracking-wider uppercase underline underline-offset-2">
            Engine
          </button>
        </div>
      ) : null}

      <PlanCard run={run} idUi={idUi} live={live} />

      {run.handoffs.length ? (
        <div className="space-y-1 sm:pl-[42px]">
          {run.handoffs.map((h) => (
            <p key={`${h.to}-${h.at}`} className="flex min-w-0 animate-fade items-center gap-2 font-mono text-[11px] text-subtle">
              <span className="shrink-0 text-muted">{BY_ID[LEAD].bot}</span>
              <ArrowRight className="size-3 shrink-0 text-signal" />
              <span className="shrink-0" style={{ color: BY_ID[h.to].color }}>
                {BY_ID[h.to].bot}
              </span>
              <span className="min-w-0 truncate">· {h.text}</span>
              <span className="ml-auto shrink-0 tabular-nums">+{((h.at - run.createdAt) / 1000).toFixed(1)}s</span>
            </p>
          ))}
        </div>
      ) : null}

      {lanes ? (
        <section>
          <p className="eyebrow mb-2.5 flex items-center gap-2">
            {idUi ? "Jalur paralel" : "Parallel lanes"} · {lanes}
            {live && working ? (
              <span className="text-signal normal-case tracking-normal">
                · {working} {idUi ? "bekerja" : "working"}
              </span>
            ) : null}
          </p>
          <div
            className={cn(
              "grid items-start gap-3",
              lanes > 1 && "@xl:grid-cols-2",
              (lanes === 3 || lanes >= 5) && "@4xl:grid-cols-3",
            )}
          >
            {run.lanes.map((l) => (
              <LaneCard key={l.bot} lane={l} idUi={idUi} />
            ))}
          </div>
        </section>
      ) : null}

      {run.wait ? <WaitLine idUi={idUi} live={live} working={working} /> : null}

      {run.final.status !== "idle" ? <FinalCard run={run} idUi={idUi} /> : null}

      {run.error && run.final.status !== "error" ? (
        <p className="animate-fade rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger sm:ml-[42px]">⚠ {run.error}</p>
      ) : null}

      {run.approval ? <ApprovalCard run={run} idUi={idUi} /> : null}

      {finished ? <RunFooter run={run} idUi={idUi} disabled={live} /> : null}
    </div>
  );
}

function JobMessage({ run, idUi }: { run: TeamRun; idUi: boolean }) {
  return (
    <article className="flex animate-rise justify-end">
      <div className="max-w-[85%] min-w-0 rounded-2xl rounded-tr-md border border-line bg-elevated px-4 py-2.5">
        <p className="text-[15px] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] text-fg">{run.job}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-[10px] text-subtle">
          <AvatarStack bots={[LEAD, ...run.bots]} size={16} />
          <span>
            {BY_ID[LEAD].bot} + {run.bots.map((b) => BY_ID[b].bot).join(", ")}
          </span>
          {run.routineName ? (
            <span className="flex items-center gap-1 text-signal">
              <Repeat className="size-3" />
              {run.routineName}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function BotMeta({ id, tag, extra, idUi }: { id: PersonaId; tag: string; extra?: React.ReactNode; idUi: boolean }) {
  const p = BY_ID[id];
  return (
    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
      <span className="text-muted">{p.bot}</span>
      <span>· {role(p, idUi)}</span>
      <span className="text-signal">· {tag}</span>
      {extra}
    </div>
  );
}

function PlanCard({ run, idUi, live }: { run: TeamRun; idUi: boolean; live: boolean }) {
  const planning = live && !run.plan && !run.error;
  return (
    <article className="flex animate-rise gap-3">
      <BotAvatar id={LEAD} size={30} live={planning} className="mt-0.5 hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <BotMeta
          id={LEAD}
          tag={idUi ? "rencana" : "plan"}
          idUi={idUi}
          extra={
            <>
              {run.planModel ? <span className="normal-case tracking-normal">· {run.planModel}</span> : null}
              {run.planAt ? <span className="tabular-nums">· {((run.planAt - run.createdAt) / 1000).toFixed(1)}s</span> : null}
            </>
          }
        />
        {run.plan ? (
          <div className="overflow-hidden rounded-xl border border-line bg-surface">
            <p className="px-3.5 pt-3 pb-1 text-sm text-muted">
              {idUi
                ? `Dibagi jadi ${run.plan.length} jalur paralel.`
                : `Split into ${run.plan.length} parallel lane${run.plan.length === 1 ? "" : "s"}.`}
              {run.planFallback ? (
                <span className="ml-1.5 font-mono text-[10px] text-warn">
                  {idUi ? "(rencana cadangan — job utuh ke tiap bot)" : "(fallback plan — whole job to each bot)"}
                </span>
              ) : null}
            </p>
            <ol className="divide-y divide-line">
              {run.plan.map((s, i) => (
                <li key={s.bot} className="flex min-w-0 gap-3 px-3.5 py-2.5">
                  <span className="mt-0.5 w-3 shrink-0 font-mono text-[11px] text-subtle tabular-nums">{i + 1}</span>
                  <BotAvatar id={s.bot} size={20} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      <span className="font-medium text-fg">{BY_ID[s.bot].bot}</span>{" "}
                      <span className="font-mono text-[10px] tracking-[0.12em] text-subtle uppercase">{role(BY_ID[s.bot], idUi)}</span>
                    </p>
                    <p className="mt-0.5 text-sm leading-relaxed [overflow-wrap:anywhere] text-muted">{s.task}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        ) : planning ? (
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <Lamp live />
            {idUi ? "Atlas memecah job jadi langkah paralel…" : "Atlas is splitting the job into parallel steps…"}
          </p>
        ) : (
          <p className="font-mono text-xs text-subtle">{idUi ? "Tidak ada rencana." : "No plan."}</p>
        )}
      </div>
    </article>
  );
}

function Elapsed({ from, to, live }: { from?: number; to?: number; live: boolean }) {
  const now = useNow(live, 100);
  if (!from) return null;
  const end = to ?? (live ? now : from);
  return <span className="shrink-0 font-mono text-[10px] text-subtle tabular-nums">{(Math.max(0, end - from) / 1000).toFixed(1)}s</span>;
}

function LaneCard({ lane, idUi }: { lane: TeamLane; idUi: boolean }) {
  const p = BY_ID[lane.bot];
  const working = lane.status === "working";
  const silent = working && !lane.text;
  const now = useNow(silent, 500);
  const stalled = silent && lane.startedAt !== undefined && now - lane.startedAt > 5500;
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = body.current;
    if (el && working) el.scrollTop = el.scrollHeight;
  }, [lane.text, working]);

  const tone = lane.status === "error" ? "danger" : lane.status === "done" || working ? (stalled ? "warn" : "signal") : "off";
  const status =
    lane.status === "queued"
      ? idUi
        ? "menunggu serah terima"
        : "awaiting handoff"
      : lane.status === "working"
        ? lane.text
          ? `${idUi ? "menulis" : "writing"} · ${lane.text.length.toLocaleString()}c`
          : stalled
            ? idUi
              ? "menunggu engine…"
              : "waiting on the engine…"
            : idUi
              ? "berpikir…"
              : "thinking…"
        : lane.status === "done"
          ? `${idUi ? "selesai" : "done"} · ${(lane.chars ?? lane.text.length).toLocaleString()}c${lane.model ? ` · ${lane.model}` : ""}`
          : lane.status === "error"
            ? idUi
              ? "gagal"
              : "error"
            : idUi
              ? "dihentikan"
              : "stopped";

  return (
    <article
      className={cn(
        "flex min-w-0 animate-rise flex-col overflow-hidden rounded-xl border bg-surface",
        lane.status === "error" ? "border-danger/40" : working ? "border-line-strong" : "border-line",
      )}
    >
      <div className="h-0.5 w-full" style={{ background: p.color, opacity: working ? 0.9 : 0.35 }} />
      <header className="flex min-w-0 items-center gap-2.5 border-b border-line px-3 py-2.5">
        <BotAvatar id={lane.bot} size={26} />
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-medium">
            <span className="truncate">{p.bot}</span>
            <span className="truncate font-mono text-[9.5px] font-normal tracking-[0.14em] text-subtle uppercase">{role(p, idUi)}</span>
          </p>
          <p className="truncate font-mono text-[10px] text-subtle">{status}</p>
        </div>
        <Lamp live={working} tone={tone} className="shrink-0" />
        <Elapsed from={lane.startedAt} to={lane.ms !== undefined && lane.startedAt ? lane.startedAt + lane.ms : undefined} live={working} />
      </header>
      <p className="px-3 pt-2.5 text-xs leading-relaxed [overflow-wrap:anywhere] text-muted">
        <span className="font-mono text-[10px] tracking-wider text-subtle uppercase">{idUi ? "Tugas" : "Task"} · </span>
        {lane.task}
      </p>
      <div ref={body} className={cn("min-w-0 px-3 pt-2 pb-3", !expanded && "max-h-80 overflow-y-auto")}>
        {lane.text ? (
          <div>
            <Markdown text={lane.text} className="text-[13.5px] leading-[1.65]" />
            {working ? <span className="ml-0.5 inline-block h-3.5 w-[6px] translate-y-0.5 animate-caret bg-signal" /> : null}
          </div>
        ) : working || lane.status === "queued" ? (
          <p className="flex items-center gap-2 py-1 font-mono text-[11px] text-subtle">
            {stalled ? <Coffee className="size-3.5 text-warn" /> : <Lamp live={working} tone={working ? "signal" : "off"} className="size-1.5" />}
            {lane.status === "queued"
              ? idUi
                ? "belum mulai"
                : "not started"
              : stalled
                ? idUi
                  ? "engine lambat — tetap menunggu"
                  : "slow engine — still waiting"
                : idUi
                  ? "membaca tugas…"
                  : "reading the task…"}
          </p>
        ) : null}
        {lane.error ? <p className="mt-2 text-xs text-danger">⚠ {lane.error}</p> : null}
      </div>
      {!working && lane.text ? (
        <footer className="flex items-center gap-1 border-t border-line px-2 py-1">
          <SmallButton
            onClick={() => {
              void navigator.clipboard.writeText(lane.text);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? (idUi ? "Tersalin" : "Copied") : idUi ? "Salin" : "Copy"}
          </SmallButton>
          <SmallButton onClick={() => setExpanded(!expanded)}>
            <ChevronDown className={cn("size-3 transition-transform", expanded && "rotate-180")} />
            {expanded ? (idUi ? "Ringkas" : "Collapse") : idUi ? "Buka penuh" : "Expand"}
          </SmallButton>
        </footer>
      ) : null}
    </article>
  );
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-subtle hover:bg-elevated hover:text-fg">
      {children}
    </button>
  );
}

function WaitLine({ idUi, live, working }: { idUi: boolean; live: boolean; working: number }) {
  const waiting = live && working > 0;
  const lead = BY_ID[LEAD].bot;
  return (
    <p className="flex min-w-0 animate-fade items-center gap-2 font-mono text-[11px] text-subtle sm:pl-[42px]">
      <Coffee className={cn("size-3.5 shrink-0", waiting ? "text-warn" : "text-subtle")} />
      {waiting ? <Lamp live tone="warn" className="size-1.5 shrink-0" /> : null}
      <span className="min-w-0 truncate">
        {waiting
          ? idUi
            ? `${lead} menunggu ${working} rekan tim`
            : `${lead} is waiting on ${working} teammate${working === 1 ? "" : "s"}`
          : idUi
            ? `${lead} menunggu tim, lalu menyatukan`
            : `${lead} waited on the team, then merged`}
      </span>
    </p>
  );
}

function FinalCard({ run, idUi }: { run: TeamRun; idUi: boolean }) {
  const f = run.final;
  const working = f.status === "working";
  const [copied, setCopied] = useState(false);
  return (
    <article className="flex animate-rise gap-3">
      <BotAvatar id={LEAD} size={30} live={working} className="mt-0.5 hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <BotMeta
          id={LEAD}
          tag={idUi ? "hasil akhir" : "synthesis"}
          idUi={idUi}
          extra={
            <>
              {f.model ? <span className="normal-case tracking-normal">· {f.model}</span> : null}
              {f.ms ? <span className="tabular-nums">· {(f.ms / 1000).toFixed(1)}s</span> : null}
            </>
          }
        />
        <div className="rounded-xl border border-line-strong bg-surface px-4 py-3.5">
          {f.text ? (
            <div>
              <Markdown text={f.text} />
              {working ? <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-caret bg-signal" /> : null}
            </div>
          ) : working ? (
            <p className="flex items-center gap-2 font-mono text-xs text-muted">
              <Lamp live />
              {idUi ? "Atlas menyatukan hasil tim…" : "Atlas is merging the team's work…"}
            </p>
          ) : null}
          {f.status === "error" ? <p className="mt-2 text-sm text-danger">⚠ {f.error ?? run.error}</p> : null}
          {f.status === "stopped" ? <p className="mt-2 font-mono text-xs text-subtle">{idUi ? "(dihentikan)" : "(stopped)"}</p> : null}
        </div>
        {!working && f.text ? (
          <div className="mt-2 flex items-center gap-1">
            <SmallButton
              onClick={() => {
                void navigator.clipboard.writeText(f.text);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
              {copied ? (idUi ? "Tersalin" : "Copied") : idUi ? "Salin hasil" : "Copy deliverable"}
            </SmallButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ApprovalCard({ run, idUi }: { run: TeamRun; idUi: boolean }) {
  const a = run.approval!;
  return (
    <article className="animate-rise rounded-xl border border-warn/40 bg-warn/5 p-4 sm:ml-[42px]">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warn" />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[10px] tracking-[0.2em] text-warn uppercase">
            {BY_ID[LEAD].bot} · {idUi ? "perlu persetujuan" : "needs approval"}
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed [overflow-wrap:anywhere] text-fg">{a.action}</p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {idUi
              ? "Disimulasikan — tidak ada sistem eksternal yang terhubung. Menyetujui hanya mencatat keputusan; tidak ada yang keluar dari stasiun ini."
              : "Simulated — no external systems are connected. Approving records the decision; nothing leaves this station."}
          </p>
          {a.decision === "pending" ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => decideApproval(run.id, true)}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg"
              >
                <Check className="size-4" strokeWidth={2.2} />
                {idUi ? "Setujui" : "Approve"}
              </button>
              <button
                type="button"
                onClick={() => decideApproval(run.id, false)}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-line-strong px-3.5 text-sm text-fg hover:bg-elevated"
              >
                <X className="size-4" />
                {idUi ? "Tolak" : "Reject"}
              </button>
            </div>
          ) : a.decision === "approved" ? (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-signal">
              <Check className="mt-0.5 size-4 shrink-0" />
              {idUi
                ? "Disetujui — dieksekusi (simulasi: tidak ada sistem eksternal yang terhubung)."
                : "Approved — executed (simulated: no external systems connected)."}
            </p>
          ) : (
            <p className="mt-3 flex items-start gap-1.5 text-sm text-danger">
              <X className="mt-0.5 size-4 shrink-0" />
              {idUi ? "Ditolak — tidak ada yang dieksekusi." : "Rejected — nothing executed."}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

function RunFooter({ run, idUi, disabled }: { run: TeamRun; idUi: boolean; disabled: boolean }) {
  const addRoutine = useTeam((s) => s.addRoutine);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [name, setName] = useState("");
  const total = run.endedAt ? ((run.endedAt - run.createdAt) / 1000).toFixed(1) : null;

  return (
    <div className="space-y-3 sm:pl-[42px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">
          <Lamp tone={run.status === "done" ? "signal" : run.status === "stopped" ? "off" : "danger"} className="size-1.5" />
          {statusLabel(run, idUi)}
          {total ? <span className="tabular-nums">· {total}s</span> : null}
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => void runTeam(run.job, run.bots, { routineId: run.routineId, routineName: run.routineName })}
          className="ml-auto flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:border-line-strong hover:text-fg disabled:opacity-30"
        >
          <RotateCcw className="size-3.5" />
          {idUi ? "Jalankan lagi" : "Run again"}
        </button>
        {!run.routineId && !saved ? (
          <button
            type="button"
            onClick={() => {
              setName(run.job.replace(/\s+/g, " ").trim().slice(0, 48));
              setSaving(!saving);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-xs text-muted hover:border-line-strong hover:text-fg"
          >
            <Repeat className="size-3.5" />
            {idUi ? "Simpan sebagai routine" : "Save as routine"}
          </button>
        ) : saved ? (
          <span className="flex h-8 items-center gap-1.5 px-1 text-xs text-signal">
            <Check className="size-3.5" />
            {idUi ? "Routine tersimpan" : "Routine saved"}
          </span>
        ) : null}
      </div>
      {saving && !saved ? (
        <form
          className="flex animate-fade flex-wrap gap-2 rounded-xl border border-line bg-surface p-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            const n = name.trim() || run.job.slice(0, 48);
            addRoutine({ name: n, job: run.job, bots: run.bots });
            setSaved(true);
            setSaving(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder={idUi ? "Nama routine" : "Routine name"}
            className="h-9 min-w-0 flex-1 basis-48 rounded-lg border border-line bg-inset px-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
          />
          <button type="submit" className="h-9 rounded-lg bg-accent px-3.5 text-sm font-medium text-accent-fg">
            {idUi ? "Simpan" : "Save"}
          </button>
          <button type="button" onClick={() => setSaving(false)} className="h-9 rounded-lg px-3 text-sm text-muted hover:text-fg">
            {idUi ? "Batal" : "Cancel"}
          </button>
          <p className="w-full px-1 font-mono text-[10px] text-subtle">
            {idUi
              ? `Job yang sama, tim yang sama (${[LEAD, ...run.bots].map((b) => BY_ID[b].bot).join(", ")}). Atur interval di daftar Routine.`
              : `Same job, same team (${[LEAD, ...run.bots].map((b) => BY_ID[b].bot).join(", ")}). Set an interval in the Routines list.`}
          </p>
        </form>
      ) : null}
    </div>
  );
}
