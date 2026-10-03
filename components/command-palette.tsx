"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";
import { PERSONAS, PLAYBOOKS, type CompileMode, type LanguagePin, type ViewId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { useStation } from "@/lib/store";

type Item = { id: string; group: string; label: string; hint?: string; run: () => void };

export function CommandPalette({ onExport }: { onExport: () => void }) {
  const open = useStation((s) => s.paletteOpen);
  const setOpen = useStation((s) => s.setPaletteOpen);
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useStation.getState().paletteOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setOpen]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const st = useStation.getState;
    const close = () => setOpen(false);
    const view = (v: ViewId) => () => {
      st().setView(v);
      close();
    };
    const list: Item[] = [
      { id: "new", group: "Session", label: "New session", hint: "fresh thread", run: () => (st().newChat(), close()) },
      { id: "engine", group: "Session", label: "Connect engine / API key", hint: "xAI, Groq, Gemini, OpenAI, Claude…", run: () => (st().setEngineOpen(true), close()) },
      { id: "kernel", group: "Session", label: "View compiled kernel", hint: "what the engine receives", run: () => (st().setKernelOpen(true), close()) },
      { id: "export", group: "Session", label: "Export session as Markdown", run: () => (onExport(), close()) },
      { id: "insp", group: "Session", label: "Toggle inspector", run: () => (st().setInspectorOpen(!st().inspectorOpen), close()) },
      { id: "v-chat", group: "Go to", label: "Chat", run: view("chat") },
      { id: "v-studio", group: "Go to", label: "Megaprompt studio", run: view("studio") },
      { id: "v-vault", group: "Go to", label: "Memory vault", run: view("vault") },
      { id: "v-pb", group: "Go to", label: "Playbooks", run: view("playbooks") },
      ...PERSONAS.map((p) => ({
        id: `p-${p.id}`,
        group: "Persona",
        label: p.name,
        hint: p.blurb,
        run: () => (st().setPersona(p.id), st().setView("chat"), close()),
      })),
      ...(["lite", "core", "full"] as CompileMode[]).map((m) => ({
        id: `c-${m}`,
        group: "Compiler",
        label: `Compile ${m}`,
        run: () => (st().setCompileMode(m), close()),
      })),
      ...(["auto", "id", "en"] as LanguagePin[]).map((l) => ({
        id: `l-${l}`,
        group: "Language",
        label: `Language pin: ${l.toUpperCase()}`,
        run: () => (st().setLanguage(l), close()),
      })),
      ...PLAYBOOKS.map((p) => ({
        id: `pb-${p.id}`,
        group: "Playbook",
        label: p.title,
        hint: p.seed.split(" ")[0],
        run: () => {
          const s = st();
          s.newChat();
          s.setPendingDraft(s.language === "en" ? p.seed : p.seedId);
          s.setView("chat");
          close();
        },
      })),
    ];
    return list;
  }, [setOpen, onExport]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return items;
    return items.filter((i) => `${i.group} ${i.label} ${i.hint ?? ""}`.toLowerCase().includes(t));
  }, [items, q]);

  useEffect(() => setIndex(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-bg/70 px-3 pt-[12vh] backdrop-blur-sm animate-fade" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow-pop)] animate-rise"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search className="size-4 text-subtle" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, filtered.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                filtered[index]?.run();
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            placeholder="Type a command, persona, playbook…"
            className="h-14 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
          />
          <span className="kbd">esc</span>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {filtered.length === 0 ? <p className="px-3 py-6 text-center text-sm text-muted">No match.</p> : null}
          {filtered.map((item, i) => {
            const header = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {header ? <p className="eyebrow px-3 pt-3 pb-1.5">{item.group}</p> : null}
                <button
                  type="button"
                  data-i={i}
                  onMouseMove={() => setIndex(i)}
                  onClick={item.run}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left",
                    i === index ? "bg-elevated" : "",
                  )}
                >
                  <span className="text-sm text-fg">{item.label}</span>
                  {item.hint ? <span className="truncate text-xs text-subtle">{item.hint}</span> : null}
                  {i === index ? <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-subtle" /> : null}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
