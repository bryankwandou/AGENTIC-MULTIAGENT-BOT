"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  BookOpen,
  Command,
  Download,
  MessageSquare,
  PanelRight,
  Plus,
  ScanEye,
  ScrollText,
  SquareTerminal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { AxiomGlyph, Lamp } from "@/components/axiom-mark";
import { getEngineStatus, type EngineStatus } from "@/lib/engine-status";
import { compileKernel, megapromptStats } from "@/lib/megaprompt";
import { PERSONAS, type ViewId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";
import { ChatPanel } from "./chat-panel";
import { CommandPalette } from "./command-palette";
import { EngineDialog, engineSummary } from "./engine-dialog";
import { FloorPanel } from "./floor/floor-panel";
import { Inspector } from "./inspector";
import { KernelDialog } from "./kernel-dialog";
import { PlaybooksPanel } from "./playbooks-panel";
import { StudioPanel } from "./studio-panel";
import { TeamPanel } from "./team/team-panel";
import { startRoutineClock } from "@/lib/team/client";
import { VaultPanel } from "./vault-panel";

const NAV: { id: ViewId; label: string; labelId: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Chat", labelId: "Chat", icon: MessageSquare },
  { id: "floor", label: "Floor", labelId: "Lantai", icon: Building2 },
  { id: "team", label: "Team", labelId: "Tim", icon: Users },
  { id: "studio", label: "Studio", labelId: "Studio", icon: ScrollText },
  { id: "vault", label: "Vault", labelId: "Vault", icon: BookOpen },
  { id: "playbooks", label: "Playbooks", labelId: "Playbook", icon: SquareTerminal },
];

export function StationShell() {
  const hydrated = useStation((s) => s.hydrated);
  const setHydrated = useStation((s) => s.setHydrated);
  const view = useStation((s) => s.view);
  const setView = useStation((s) => s.setView);
  const language = useStation((s) => s.language);
  const setLanguage = useStation((s) => s.setLanguage);
  const inspectorOpen = useStation((s) => s.inspectorOpen);
  const setInspectorOpen = useStation((s) => s.setInspectorOpen);
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const selectSession = useStation((s) => s.selectSession);
  const deleteSession = useStation((s) => s.deleteSession);
  const newChat = useStation((s) => s.newChat);
  const compileMode = useStation((s) => s.compileMode);
  const enabledModules = useStation((s) => s.enabledModules);
  const addendum = useStation((s) => s.addendum);
  const vault = useStation((s) => s.vault);
  const setPaletteOpen = useStation((s) => s.setPaletteOpen);
  const setKernelOpen = useStation((s) => s.setKernelOpen);
  const setEngineOpen = useStation((s) => s.setEngineOpen);
  const engineSettings = useStation((s) => s.engine);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [railOpen, setRailOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [booted, setBooted] = useState(false);

  useEffect(() => {
    void Promise.resolve(useStation.persist.rehydrate()).then(() => setHydrated(true));
    void getEngineStatus().then(setEngine);
    // Routine intervals tick while the station tab is open, whatever the view.
    startRoutineClock();
  }, [setHydrated]);

  const stats = useMemo(() => megapromptStats(), []);
  const summary = engineSummary(engineSettings, engine);
  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const kernel = useMemo(
    () =>
      compileKernel({
        mode: compileMode,
        enabledIds: enabledModules,
        persona: session?.persona ?? "operator",
        language,
        vault: vault.map((v) => v.text),
        addendum,
      }),
    [compileMode, enabledModules, session?.persona, language, vault, addendum],
  );

  const exportSession = useCallback(() => {
    const s = useStation.getState();
    const sess = s.sessions.find((x) => x.id === s.activeSessionId);
    if (!sess) return;
    const md = [
      `# ${sess.title}`,
      "",
      `_AXIOM operator station · persona ${sess.persona} · ${new Date(sess.updatedAt).toISOString()}_`,
      "",
      ...sess.messages.flatMap((m) => [`### ${m.role === "user" ? "Operator" : "AXIOM"}`, "", m.content, ""]),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `axiom-${sess.title.replace(/[^\w-]+/g, "-").slice(0, 40) || "session"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const id = language !== "en";

  if (!hydrated || !booted) {
    return <BootScreen ready={hydrated} engine={engine} summary={engine || engineSettings.key ? summary : null} lines={stats.lines} sections={stats.sections} kernelChars={kernel.chars} mode={compileMode} onDone={() => setBooted(true)} />;
  }

  const title =
    view === "chat"
      ? session?.title
      : view === "floor"
        ? id
          ? "Lantai kantor — bot bekerja paralel"
          : "The floor — bots at work, in parallel"
      : view === "team"
        ? id
          ? "Tim — rekan kerja paralel"
          : "Team — teammates in parallel"
      : view === "studio"
        ? id
          ? "Studio megaprompt"
          : "Megaprompt studio"
        : view === "vault"
          ? id
            ? "Vault memori"
            : "Memory vault"
          : id
            ? "Playbook"
            : "Playbooks";

  return (
    <div className="flex h-dvh animate-fade overflow-hidden bg-bg text-fg">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[17rem] flex-col border-r border-line bg-surface transition-transform duration-200 md:static md:translate-x-0",
          railOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
        )}
      >
        <Link href="/" className="flex items-center gap-3 px-4 pt-5 pb-4">
          <span className="flex size-9 items-center justify-center rounded-[10px] border border-line-strong bg-gradient-to-b from-elevated to-inset text-accent">
            <AxiomGlyph className="size-5" />
          </span>
          <span className="min-w-0">
            <span className="block font-display text-[19px] leading-none font-semibold tracking-[0.16em]">AXIOM</span>
            <span className="mt-1 block font-mono text-[9.5px] tracking-[0.2em] text-subtle uppercase">Operator station</span>
          </span>
        </Link>

        <button
          type="button"
          onClick={() => {
            newChat();
            setRailOpen(false);
          }}
          className="mx-3 mb-3 flex h-10 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-accent-fg transition-opacity hover:opacity-90"
        >
          <Plus className="size-4" strokeWidth={2} />
          {id ? "Sesi baru" : "New session"}
        </button>

        <nav className="grid grid-cols-3 gap-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const on = view === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setView(item.id);
                  setRailOpen(false);
                }}
                className={cn(
                  "flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-[9.5px] tracking-wider uppercase transition-colors",
                  on ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/50 hover:text-fg",
                )}
              >
                <Icon className="size-4" strokeWidth={1.6} />
                {id ? item.labelId : item.label}
              </button>
            );
          })}
        </nav>

        <p className="eyebrow mt-6 px-4">{id ? "Sesi" : "Sessions"}</p>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group mb-0.5 flex items-center rounded-lg",
                s.id === activeSessionId ? "bg-elevated" : "hover:bg-elevated/50",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  selectSession(s.id);
                  setRailOpen(false);
                }}
                className="flex min-w-0 flex-1 flex-col px-2.5 py-2 text-left"
              >
                <span className="truncate text-[13px] text-fg">{s.title}</span>
                <span className="mt-0.5 font-mono text-[10px] text-subtle">
                  {PERSONAS.find((p) => p.id === s.persona)?.name} · {s.messages.length} msg
                </span>
              </button>
              <button
                type="button"
                onClick={() => deleteSession(s.id)}
                className="mr-1 flex size-8 shrink-0 items-center justify-center rounded-md text-subtle opacity-0 group-hover:opacity-100 hover:text-danger"
                aria-label={id ? "Hapus sesi" : "Delete session"}
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2 border-t border-line px-4 py-3">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-line px-2.5 py-2 text-xs text-muted hover:border-line-strong hover:text-fg"
          >
            <Command className="size-3.5" />
            {id ? "Palet perintah" : "Command palette"}
            <span className="kbd ml-auto">⌘K</span>
          </button>
          <button
            type="button"
            onClick={() => setEngineOpen(true)}
            className="flex w-full items-center justify-between gap-2 rounded-md font-mono text-[10px] tracking-[0.12em] text-muted uppercase hover:text-fg"
            title={id ? "Ganti engine / API key" : "Switch engine / API key"}
          >
            <span className="flex min-w-0 items-center gap-2">
              <Lamp tone={summary.live ? "signal" : engine ? "warn" : "off"} live={!engine && !engineSettings.key} />
              <span className="truncate">{summary.live ? summary.label : engine ? "Demo mode" : "…"}</span>
            </span>
            <span className="shrink-0 text-subtle tabular-nums">{stats.lines.toLocaleString()} ln</span>
          </button>
        </div>
      </aside>

      {railOpen ? (
        <button type="button" aria-label="Close menu" className="fixed inset-0 z-30 bg-bg/60 md:hidden" onClick={() => setRailOpen(false)} />
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3 md:px-5">
          <button
            type="button"
            className="flex size-10 items-center justify-center rounded-md text-muted md:hidden"
            onClick={() => setRailOpen(true)}
            aria-label="Menu"
          >
            <Command className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium tracking-tight">{title}</p>
            <p className="truncate font-mono text-[10px] text-subtle tabular-nums">
              kernel {kernel.chars.toLocaleString()}c · {kernel.used.length} §{kernel.truncated ? " · truncated" : ""} · {compileMode}
            </p>
          </div>
          <div className="flex items-center gap-0.5">
            <div className="mr-1 hidden items-center rounded-lg bg-inset p-0.5 sm:flex">
              {(["auto", "id", "en"] as const).map((pin) => (
                <button
                  key={pin}
                  type="button"
                  onClick={() => setLanguage(pin)}
                  className={cn(
                    "h-7 rounded-md px-2 font-mono text-[10px] tracking-wider uppercase",
                    language === pin ? "bg-elevated text-fg" : "text-subtle hover:text-fg",
                  )}
                >
                  {pin}
                </button>
              ))}
            </div>
            <HeaderButton label={id ? "Lihat kernel" : "View kernel"} onClick={() => setKernelOpen(true)}>
              <ScanEye className="size-4" />
            </HeaderButton>
            <HeaderButton label={id ? "Ekspor sesi" : "Export session"} onClick={exportSession}>
              <Download className="size-4" />
            </HeaderButton>
            <HeaderButton
              label="Inspector"
              onClick={() => {
                if (window.matchMedia("(min-width: 1024px)").matches) setInspectorOpen(!inspectorOpen);
                else setDrawerOpen(true);
              }}
            >
              <PanelRight className="size-4" />
            </HeaderButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">
            {view === "chat" ? <ChatPanel engineReady={summary.live ? true : engine ? false : null} kernelChars={kernel.chars} /> : null}
            {view === "floor" ? <FloorPanel summary={summary} /> : null}
            {view === "team" ? <TeamPanel /> : null}
            {view === "studio" ? <StudioPanel /> : null}
            {view === "vault" ? <VaultPanel /> : null}
            {view === "playbooks" ? <PlaybooksPanel /> : null}
          </main>
          {inspectorOpen && view !== "floor" ? (
            <div className="hidden min-h-0 w-[20rem] shrink-0 border-l border-line bg-surface/40 lg:block">
              <Inspector summary={summary} kernel={kernel} stats={stats} />
            </div>
          ) : null}
        </div>
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Close" className="absolute inset-0 bg-bg/70 animate-fade" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[min(22rem,92vw)] flex-col border-l border-line bg-surface animate-fade">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <p className="eyebrow">Inspector</p>
              <button type="button" onClick={() => setDrawerOpen(false)} className="flex size-8 items-center justify-center rounded-md text-muted" aria-label="Close">
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Inspector summary={summary} kernel={kernel} stats={stats} />
            </div>
          </div>
        </div>
      ) : null}

      <CommandPalette onExport={exportSession} />
      <EngineDialog status={engine} />
      <KernelDialog kernel={kernel} />
    </div>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-elevated hover:text-fg"
    >
      {children}
    </button>
  );
}

const BOOT_KEY = "axiom-booted";

function BootScreen({
  ready,
  engine,
  summary,
  lines,
  sections,
  kernelChars,
  mode,
  onDone,
}: {
  ready: boolean;
  engine: EngineStatus | null;
  summary: { live: boolean; label: string; detail: string } | null;
  lines: number;
  sections: number;
  kernelChars: number;
  mode: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const rows: [string, string][] = [
    ["megaprompt", `${lines.toLocaleString()} lines`],
    ["sections", `${sections} parsed`],
    ["constitution", "locked"],
    ["kernel", `${mode} · ${kernelChars.toLocaleString()}c`],
    ["engine", summary ? (summary.live ? `${summary.label} · ${summary.detail}` : "demo mode") : engine ? "demo mode" : "probing…"],
    ["signal lamp", "on"],
  ];

  useEffect(() => {
    if (!ready) return;
    let seen = false;
    try {
      seen = sessionStorage.getItem(BOOT_KEY) === "1";
      sessionStorage.setItem(BOOT_KEY, "1");
    } catch {}
    if (seen) {
      onDone();
      return;
    }
    const timers = rows.map((_, i) => window.setTimeout(() => setStep(i + 1), 160 + i * 170));
    timers.push(window.setTimeout(onDone, 160 + rows.length * 170 + 450));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  return (
    <div className="grain flex min-h-dvh items-center justify-center bg-bg px-6" onClick={() => ready && onDone()}>
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 text-accent">
          <AxiomGlyph className="size-8" />
          <span className="font-display text-3xl font-semibold tracking-[0.2em]">AXIOM</span>
        </div>
        <div className="mt-8 space-y-1.5 font-mono text-[11px]">
          {rows.map(([k, v], i) => (
            <div key={k} className={cn("flex items-center gap-2 transition-opacity duration-200", i < step ? "opacity-100" : "opacity-0")}>
              <span className="text-signal">›</span>
              <span className="text-muted">{k}</span>
              <span className="flex-1 overflow-hidden text-line-strong">{".".repeat(40)}</span>
              <span className="text-fg">{v}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 h-px overflow-hidden bg-line">
          <div className="h-full bg-signal transition-[width] duration-200" style={{ width: `${(step / rows.length) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
