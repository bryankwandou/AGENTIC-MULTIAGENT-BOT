"use client";

import { useSyncExternalStore } from "react";
import { emitFloor } from "./floor-bus";
import { engineHeaders, useStation, type MessageMeta } from "./store";

/**
 * One chat pipeline shared by every view (Chat, Floor). Module-level so a reply keeps
 * streaming — and the Floor keeps animating it — when the operator switches views mid-turn.
 */
type SenderState = { busy: boolean; phase: "compile" | "stream"; error: string | null };

let state: SenderState = { busy: false, phase: "compile", error: null };
let controller: AbortController | null = null;
const subs = new Set<() => void>();

function set(patch: Partial<SenderState>) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
}

const SERVER_STATE: SenderState = { busy: false, phase: "compile", error: null };

export function useSender(): SenderState {
  return useSyncExternalStore(
    (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    () => state,
    () => SERVER_STATE,
  );
}

export function abortSend() {
  controller?.abort();
}

export function clearSendError() {
  set({ error: null });
}

export async function sendJob(text: string) {
  const content = text.trim();
  if (!content || state.busy) return;
  const st = useStation.getState();
  const idUi = st.language !== "en";
  set({ busy: true, phase: "compile", error: null });

  st.appendMessage({ id: crypto.randomUUID(), role: "user", content, createdAt: Date.now() });
  st.appendMessage({ id: crypto.randomUUID(), role: "assistant", content: "", createdAt: Date.now() });

  const latest = useStation.getState();
  const sess = latest.sessions.find((s) => s.id === latest.activeSessionId);
  const persona = sess?.persona ?? "operator";
  const history = (sess?.messages ?? [])
    .slice(0, -1)
    .filter((m) => m.content.length > 0 && !m.meta?.error)
    .map((m) => ({ role: m.role, content: m.content }));

  emitFloor({ type: "job", persona, text: content });
  const ctrl = new AbortController();
  controller = ctrl;
  const started = performance.now();
  const meta: MessageMeta = {};
  let acc = "";
  let lastEmit = 0;

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...engineHeaders(latest.engine) },
      signal: ctrl.signal,
      body: JSON.stringify({
        messages: history,
        persona,
        language: latest.language,
        compileMode: latest.compileMode,
        enabledModules: latest.enabledModules,
        vault: latest.vault.map((v) => v.text),
        addendum: latest.addendum,
        temperature: latest.temperature,
        maxTokens: latest.maxTokens,
      }),
    });
    if (!res.ok || !res.body) {
      const j = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(j?.error ?? `HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split("\n");
      buf = parts.pop() ?? "";
      for (const line of parts) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;
        let json: { token?: string; error?: string; meta?: { model?: string; kernelChars?: number } };
        try {
          json = JSON.parse(data);
        } catch {
          continue;
        }
        if (json.error) throw new Error(json.error);
        if (json.meta) {
          meta.model = json.meta.model;
          meta.kernelChars = json.meta.kernelChars;
          emitFloor({ type: "compiled", persona, chars: json.meta.kernelChars ?? 0, model: json.meta.model });
        }
        if (json.token) {
          if (!acc) set({ phase: "stream" });
          acc += json.token;
          useStation.getState().patchLastAssistant(acc);
          const now = performance.now();
          if (now - lastEmit > 90) {
            lastEmit = now;
            emitFloor({ type: "token", persona, text: acc });
          }
        }
      }
    }
    meta.ms = Math.round(performance.now() - started);
    useStation
      .getState()
      .patchLastAssistant(
        acc || (idUi ? "Engine tidak mengembalikan teks. Coba lagi dengan job yang lebih kecil." : "Engine returned no text. Try again with a smaller job."),
        meta,
      );
    emitFloor({ type: "done", persona, ms: meta.ms, model: meta.model, chars: acc.length });
  } catch (err) {
    meta.ms = Math.round(performance.now() - started);
    if ((err as { name?: string }).name === "AbortError") {
      useStation
        .getState()
        .patchLastAssistant(acc ? `${acc}\n\n_${idUi ? "(dihentikan)" : "(stopped)"}_` : idUi ? "_(dihentikan)_" : "_(stopped)_", meta);
      emitFloor({ type: "stopped", persona });
    } else {
      const msg = err instanceof Error ? err.message : "Engine failed.";
      set({ error: msg });
      useStation.getState().patchLastAssistant(`⚠ ${msg}`, { ...meta, error: true });
      emitFloor({ type: "error", persona, message: msg });
    }
  } finally {
    controller = null;
    set({ busy: false });
  }
}

export function regenerateLast() {
  if (state.busy) return;
  const prompt = useStation.getState().dropLastExchange();
  if (prompt) void sendJob(prompt);
}
