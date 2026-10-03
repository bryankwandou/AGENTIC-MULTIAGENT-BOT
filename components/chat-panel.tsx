"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BookmarkPlus, Check, Copy, RotateCcw, Square } from "lucide-react";
import { AxiomAvatar, Lamp } from "@/components/axiom-mark";
import { BotAvatar, PERSONA_BY_ID } from "@/components/bot-avatar";
import { Markdown } from "@/components/markdown";
import { PERSONAS, PLAYBOOKS, SLASH_COMMANDS, type PersonaId } from "@/lib/catalog";
import { cn } from "@/lib/cn";
import { abortSend, regenerateLast, sendJob, useSender } from "@/lib/chat-sender";
import { emitFloor } from "@/lib/floor-bus";
import { useStation, type ChatMessage } from "@/lib/store";

export function ChatPanel({ engineReady, kernelChars }: { engineReady: boolean | null; kernelChars: number }) {
  const sessions = useStation((s) => s.sessions);
  const activeSessionId = useStation((s) => s.activeSessionId);
  const language = useStation((s) => s.language);
  const compileMode = useStation((s) => s.compileMode);
  const temperature = useStation((s) => s.temperature);
  const maxTokens = useStation((s) => s.maxTokens);
  const setPersona = useStation((s) => s.setPersona);
  const addVault = useStation((s) => s.addVault);
  const pendingDraft = useStation((s) => s.pendingDraft);
  const setPendingDraft = useStation((s) => s.setPendingDraft);
  const session = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const persona = PERSONAS.find((p) => p.id === session?.persona) ?? PERSONAS[0];
  const [draft, setDraft] = useState("");
  const { busy, phase, error } = useSender();
  const [slashIndex, setSlashIndex] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const idUi = language !== "en";

  useEffect(() => {
    if (pendingDraft) {
      setDraft(pendingDraft);
      setPendingDraft("");
      input.current?.focus();
    }
  }, [pendingDraft, setPendingDraft]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
    if (nearBottom || !busy) el.scrollTop = el.scrollHeight;
  }, [session?.messages, busy]);

  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abortSend();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const slashHint = useMemo(() => {
    const t = draft.trimStart();
    if (!t.startsWith("/") || /\s/.test(t)) return [];
    const q = t.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(q)).slice(0, 7);
  }, [draft]);

  useEffect(() => setSlashIndex(0), [slashHint.length]);

  function send(text: string) {
    if (!text.trim() || busy) return;
    setDraft("");
    void sendJob(text);
  }

  function regenerate() {
    regenerateLast();
  }

  const messages = session?.messages ?? [];
  const empty = messages.length === 0;
  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-line px-3 py-2 md:px-5">
        {PERSONAS.map((p) => {
          const on = session?.persona === p.id;
          return (
            <button
              key={p.id}
              type="button"
              title={p.blurb}
              onClick={() => setPersona(p.id)}
              className={cn(
                "flex h-8 shrink-0 items-center gap-1.5 rounded-full border pr-3 pl-1 text-xs transition-colors",
                on ? "border-line-strong bg-elevated text-fg" : "border-transparent text-muted hover:bg-elevated/60 hover:text-fg",
              )}
            >
              <BotAvatar id={p.id} size={22} className={cn(!on && "opacity-70")} />
              <span className={cn(on && "font-medium")}>{p.bot}</span>
              <span className={cn("hidden text-[11px] md:inline", on ? "text-muted" : "text-subtle")}>{idUi ? p.nameId : p.name}</span>
            </button>
          );
        })}
        <span className="ml-auto hidden shrink-0 pl-3 text-[11px] text-subtle italic 2xl:block">{persona.blurb}</span>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-8 md:px-10">
        {empty ? (
          <EmptyState
            idUi={idUi}
            personaId={persona.id}
            personaName={idUi ? persona.nameId : persona.name}
            personaBlurb={persona.blurb}
            kernelChars={kernelChars}
            temperature={temperature}
            maxTokens={maxTokens}
            compileMode={compileMode}
            onSlash={(cmd) => {
              setDraft(`${cmd} `);
              input.current?.focus();
            }}
            onSeed={(seed) => {
              setDraft(seed);
              input.current?.focus();
            }}
          />
        ) : (
          <div className="mx-auto max-w-[46rem] space-y-9">
            {messages.map((m) => (
              <Message
                key={m.id}
                m={m}
                idUi={idUi}
                fallbackBot={persona.id}
                live={busy && m.id === lastAssistantId}
                phase={phase}
                isLast={m.id === lastAssistantId}
                onRegenerate={regenerate}
                onSave={(t) => {
                  addVault(t.slice(0, 480));
                  emitFloor({ type: "vault", text: t });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="relative px-3 pt-2 pb-3 md:px-6 md:pb-5">
        {slashHint.length > 0 ? (
          <div className="absolute inset-x-3 bottom-full mx-auto mb-1 max-w-[46rem] animate-fade overflow-hidden rounded-xl border border-line-strong bg-surface shadow-[var(--shadow-pop)] md:inset-x-6">
            {slashHint.map((s, i) => (
              <button
                key={s.cmd}
                type="button"
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => {
                  setDraft(`${s.cmd} `);
                  input.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-3 py-2 text-left",
                  i === slashIndex ? "bg-elevated" : "",
                )}
              >
                <span className="w-20 font-mono text-xs text-signal">{s.cmd}</span>
                <span className="text-xs text-muted">{idUi ? s.hintId : s.hint}</span>
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="mx-auto mb-2 max-w-[46rem] text-xs text-danger">{error}</p> : null}
        <form
          className="mx-auto max-w-[46rem] rounded-2xl border border-line bg-surface p-2 transition-colors focus-within:border-line-strong"
          onSubmit={(e) => {
            e.preventDefault();
            void send(draft);
          }}
        >
          <div className="flex items-end gap-2">
            <textarea
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (slashHint.length) {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    const d = e.key === "ArrowDown" ? 1 : -1;
                    setSlashIndex((i) => (i + d + slashHint.length) % slashHint.length);
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    setDraft(`${slashHint[slashIndex]?.cmd ?? draft} `);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
              rows={1}
              placeholder={idUi ? "Tulis job. Ketik / untuk perintah…" : "Write a job. Type / for commands…"}
              className="min-h-11 flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] text-fg outline-none placeholder:text-subtle"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abortSend()}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-fg hover:bg-line-strong"
                aria-label="Stop"
                title="Stop (Esc)"
              >
                <Square className="size-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim()}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-opacity disabled:opacity-30"
                aria-label={idUi ? "Kirim" : "Send"}
              >
                <ArrowUp className="size-4" strokeWidth={2.2} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 px-2 pt-1 pb-0.5 font-mono text-[10px] text-subtle">
            <span className="flex items-center gap-1.5">
              <Lamp live={busy} tone={engineReady === false ? "warn" : "signal"} className="size-1.5" />
              {persona.bot} · {idUi ? persona.nameId : persona.name}
            </span>
            <span>kernel {compileMode} · {(kernelChars / 1000).toFixed(1)}k</span>
            <span className="hidden sm:inline">temp {temperature.toFixed(1)}</span>
            <span className="ml-auto hidden items-center gap-1 sm:flex">
              <span className="kbd">⌘K</span> {idUi ? "perintah" : "commands"}
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}

function Message({
  m,
  idUi,
  fallbackBot,
  live,
  phase,
  isLast,
  onRegenerate,
  onSave,
}: {
  m: ChatMessage;
  idUi: boolean;
  /** Replies from before bots signed their messages show the session's bot. */
  fallbackBot: PersonaId;
  live: boolean;
  phase: "compile" | "stream";
  isLast: boolean;
  onRegenerate: () => void;
  onSave: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const who = PERSONA_BY_ID[m.meta?.persona ?? fallbackBot];

  if (m.role === "user") {
    return (
      <article className="flex animate-rise justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-tr-md border border-line bg-elevated px-4 py-2.5">
          <p className="text-[15px] leading-relaxed whitespace-pre-wrap text-fg">{m.content}</p>
        </div>
      </article>
    );
  }

  return (
    <article className="group flex animate-rise gap-4">
      <BotAvatar id={who.id} size={30} live={live} className="mt-0.5 hidden sm:inline-flex" />
      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
          <BotAvatar id={who.id} size={16} className="sm:hidden" />
          <span style={{ color: who.color }}>{who.bot}</span>
          <span>· {idUi ? who.nameId : who.name}</span>
          {m.meta?.model ? <span>· {m.meta.model}</span> : null}
          {m.meta?.ms ? <span className="tabular-nums">· {(m.meta.ms / 1000).toFixed(1)}s</span> : null}
        </div>
        {m.content ? (
          <div className={cn(m.meta?.error && "text-danger")}>
            <Markdown text={m.content} />
            {live ? <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-0.5 animate-caret bg-signal" /> : null}
          </div>
        ) : (
          <p className="flex items-center gap-2 font-mono text-xs text-muted">
            <Lamp live />
            {phase === "compile"
              ? idUi
                ? "mengompilasi kernel…"
                : "compiling kernel…"
              : idUi
                ? "menyusun…"
                : "composing…"}
          </p>
        )}
        {!live && m.content ? (
          <div className="mt-3 flex items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
            <ActionButton
              label={copied ? (idUi ? "Tersalin" : "Copied") : idUi ? "Salin" : "Copy"}
              onClick={() => {
                void navigator.clipboard.writeText(m.content);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }}
            >
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </ActionButton>
            {isLast ? (
              <ActionButton label={idUi ? "Ulangi" : "Regenerate"} onClick={onRegenerate}>
                <RotateCcw className="size-3.5" />
              </ActionButton>
            ) : null}
            <ActionButton
              label={saved ? (idUi ? "Masuk vault" : "In vault") : idUi ? "Simpan ke vault" : "Save to vault"}
              onClick={() => {
                onSave(m.content);
                setSaved(true);
              }}
            >
              {saved ? <Check className="size-3.5" /> : <BookmarkPlus className="size-3.5" />}
            </ActionButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] text-subtle hover:bg-elevated hover:text-fg"
    >
      {children}
      {label}
    </button>
  );
}

function EmptyState({
  idUi,
  personaId,
  personaName,
  personaBlurb,
  kernelChars,
  temperature,
  maxTokens,
  compileMode,
  onSlash,
  onSeed,
}: {
  idUi: boolean;
  personaId: PersonaId;
  personaName: string;
  personaBlurb: string;
  kernelChars: number;
  temperature: number;
  maxTokens: number;
  compileMode: string;
  onSlash: (cmd: string) => void;
  onSeed: (seed: string) => void;
}) {
  return (
    <div className="mx-auto flex max-w-[46rem] animate-rise flex-col pt-[6vh]">
      <div className="flex items-center gap-3">
        <AxiomAvatar size={52} live />
        <BotAvatar id={personaId} size={40} className="-ml-5 ring-4 ring-bg" />
        <p className="font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">
          {PERSONA_BY_ID[personaId].bot} · {personaName}
        </p>
      </div>
      <h1 className="mt-6 font-display text-5xl leading-[1.02] font-semibold tracking-tight text-balance md:text-6xl">
        {idUi ? "Stasiun siap." : "Station ready."}
        <br />
        <span className="text-muted italic">{idUi ? "Apa job-nya?" : "What's the job?"}</span>
      </h1>
      <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted text-pretty">
        {idUi
          ? `${PERSONA_BY_ID[personaId].bot} memegang job ini sebagai ${personaName}: ${personaBlurb.toLowerCase()} Kernel dikompilasi dari megaprompt setiap giliran. Ganti bot di atas.`
          : `${PERSONA_BY_ID[personaId].bot} takes this job as the ${personaName}: ${personaBlurb.toLowerCase()} The kernel is compiled from the megaprompt every turn. Switch bots above.`}
      </p>
      <p className="eyebrow mt-8">
        kernel {compileMode} · {kernelChars.toLocaleString()}c · temp {temperature} · {maxTokens} tok
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {SLASH_COMMANDS.slice(0, 6).map((c) => (
          <button
            key={c.cmd}
            type="button"
            onClick={() => onSlash(c.cmd)}
            className="group rounded-xl border border-line bg-surface/60 px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface"
          >
            <span className="font-mono text-xs text-signal">{c.cmd}</span>
            <span className="mt-1 block text-xs text-muted group-hover:text-fg">{idUi ? c.hintId : c.hint}</span>
          </button>
        ))}
      </div>
      <p className="eyebrow mt-8">{idUi ? "Atau mulai dari playbook" : "Or start from a playbook"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PLAYBOOKS.slice(0, 4).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSeed(idUi ? p.seedId : p.seed)}
            className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {idUi ? p.titleId : p.title} →
          </button>
        ))}
      </div>
    </div>
  );
}
