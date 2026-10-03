import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  CORE_MODULE_IDS,
  DEFAULT_ADDENDUM,
  type CompileMode,
  type LanguagePin,
  type PersonaId,
  type ViewId,
} from "./catalog";
import { getProvider, type ProviderId } from "./engine/providers";

export type ChatRole = "user" | "assistant";

export type MessageMeta = {
  model?: string;
  ms?: number;
  kernelChars?: number;
  error?: boolean;
};

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  meta?: MessageMeta;
};

export type Session = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  persona: PersonaId;
  messages: ChatMessage[];
};

export type EngineSettings = {
  /** "server" = use whatever the deployment is configured with (or demo). */
  provider: ProviderId | "server";
  key: string;
  model: string;
  /** Local runtimes: where it listens (e.g. http://localhost:11434/v1). */
  baseUrl?: string;
  /** Local runtimes: proxied by this server, or called straight from the browser. "auto" picks by where the site runs. */
  transport?: "auto" | "server" | "browser";
};

export type VaultNote = {
  id: string;
  text: string;
  createdAt: number;
};

function nid() {
  return crypto.randomUUID();
}

function newSession(persona: PersonaId): Session {
  const t = Date.now();
  return {
    id: nid(),
    title: "Untitled session",
    createdAt: t,
    updatedAt: t,
    persona,
    messages: [],
  };
}

type State = {
  hydrated: boolean;
  view: ViewId;
  language: LanguagePin;
  compileMode: CompileMode;
  temperature: number;
  maxTokens: number;
  enabledModules: string[];
  addendum: string;
  vault: VaultNote[];
  sessions: Session[];
  activeSessionId: string;
  studioQuery: string;
  studioSection: number;
  inspectorOpen: boolean;
  pendingDraft: string;
  paletteOpen: boolean;
  kernelOpen: boolean;
  engineOpen: boolean;
  engine: EngineSettings;
  setHydrated: (v: boolean) => void;
  setView: (v: ViewId) => void;
  setLanguage: (v: LanguagePin) => void;
  setCompileMode: (v: CompileMode) => void;
  setTemperature: (v: number) => void;
  setMaxTokens: (v: number) => void;
  toggleModule: (id: string) => void;
  setAddendum: (v: string) => void;
  addVault: (text: string) => void;
  removeVault: (id: string) => void;
  newChat: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  setPersona: (p: PersonaId) => void;
  appendMessage: (msg: ChatMessage) => void;
  patchLastAssistant: (content: string, meta?: MessageMeta) => void;
  dropLastExchange: () => string | null;
  setPaletteOpen: (v: boolean) => void;
  setKernelOpen: (v: boolean) => void;
  setEngineOpen: (v: boolean) => void;
  setEngine: (v: EngineSettings) => void;
  renameActive: (title: string) => void;
  setStudioQuery: (q: string) => void;
  setStudioSection: (n: number) => void;
  setInspectorOpen: (v: boolean) => void;
  setPendingDraft: (v: string) => void;
};

const first = newSession("operator");

export const useStation = create<State>()(
  persist(
    (set, get) => ({
      hydrated: false,
      view: "chat",
      language: "auto",
      compileMode: "core",
      temperature: 0.6,
      maxTokens: 1800,
      enabledModules: [...CORE_MODULE_IDS],
      addendum: DEFAULT_ADDENDUM,
      vault: [],
      sessions: [first],
      activeSessionId: first.id,
      studioQuery: "",
      studioSection: 1,
      inspectorOpen: true,
      pendingDraft: "",
      paletteOpen: false,
      kernelOpen: false,
      engineOpen: false,
      engine: { provider: "server", key: "", model: "" },
      setHydrated: (v) => set({ hydrated: v }),
      setView: (view) => set({ view }),
      setLanguage: (language) => set({ language }),
      setCompileMode: (compileMode) => set({ compileMode }),
      setTemperature: (temperature) => set({ temperature }),
      setMaxTokens: (maxTokens) => set({ maxTokens }),
      toggleModule: (id) => {
        const locked = ["IDN", "DIR", "CON"];
        if (locked.includes(id)) return;
        const cur = get().enabledModules;
        set({
          enabledModules: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
        });
      },
      setAddendum: (addendum) => set({ addendum }),
      addVault: (text) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        set({
          vault: [{ id: nid(), text: trimmed, createdAt: Date.now() }, ...get().vault].slice(0, 40),
        });
      },
      removeVault: (id) => set({ vault: get().vault.filter((n) => n.id !== id) }),
      newChat: () => {
        const session = newSession(get().sessions.find((s) => s.id === get().activeSessionId)?.persona ?? "operator");
        set({ sessions: [session, ...get().sessions].slice(0, 40), activeSessionId: session.id, view: "chat" });
      },
      selectSession: (id) => set({ activeSessionId: id, view: "chat" }),
      deleteSession: (id) => {
        const rest = get().sessions.filter((s) => s.id !== id);
        const sessions = rest.length ? rest : [newSession("operator")];
        set({
          sessions,
          activeSessionId: get().activeSessionId === id ? sessions[0].id : get().activeSessionId,
        });
      },
      setPersona: (persona) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === get().activeSessionId ? { ...s, persona, updatedAt: Date.now() } : s,
          ),
        });
      },
      appendMessage: (msg) => {
        set({
          sessions: get().sessions.map((s) => {
            if (s.id !== get().activeSessionId) return s;
            const title =
              s.messages.length === 0 && msg.role === "user"
                ? msg.content.replace(/\s+/g, " ").slice(0, 48)
                : s.title;
            return { ...s, title, messages: [...s.messages, msg], updatedAt: Date.now() };
          }),
        });
      },
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      setKernelOpen: (kernelOpen) => set({ kernelOpen }),
      setEngineOpen: (engineOpen) => set({ engineOpen }),
      setEngine: (engine) => set({ engine }),
      dropLastExchange: () => {
        let prompt: string | null = null;
        set({
          sessions: get().sessions.map((s) => {
            if (s.id !== get().activeSessionId) return s;
            const messages = [...s.messages];
            while (messages.length && messages[messages.length - 1]?.role === "assistant") messages.pop();
            const last = messages[messages.length - 1];
            if (last?.role === "user") {
              prompt = last.content;
              messages.pop();
            }
            return { ...s, messages, updatedAt: Date.now() };
          }),
        });
        return prompt;
      },
      patchLastAssistant: (content, meta) => {
        set({
          sessions: get().sessions.map((s) => {
            if (s.id !== get().activeSessionId) return s;
            const messages = [...s.messages];
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]?.role === "assistant") {
                messages[i] = { ...messages[i], content, meta: meta ? { ...messages[i].meta, ...meta } : messages[i].meta };
                break;
              }
            }
            return { ...s, messages, updatedAt: Date.now() };
          }),
        });
      },
      renameActive: (title) => {
        set({
          sessions: get().sessions.map((s) =>
            s.id === get().activeSessionId ? { ...s, title, updatedAt: Date.now() } : s,
          ),
        });
      },
      setStudioQuery: (studioQuery) => set({ studioQuery }),
      setStudioSection: (studioSection) => set({ studioSection }),
      setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
      setPendingDraft: (pendingDraft) => set({ pendingDraft }),
    }),
    {
      name: "axiom-station-v1",
      skipHydration: true,
      partialize: (s) => ({
        language: s.language,
        compileMode: s.compileMode,
        temperature: s.temperature,
        maxTokens: s.maxTokens,
        enabledModules: s.enabledModules,
        addendum: s.addendum,
        vault: s.vault,
        sessions: s.sessions,
        activeSessionId: s.activeSessionId,
        inspectorOpen: s.inspectorOpen,
        engine: s.engine,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);

/** Headers that carry a browser-held key to this deployment's proxy. Empty when using the server engine. */
export function engineHeaders(e: EngineSettings): Record<string, string> {
  if (e.provider === "server") return {};
  const local = Boolean(getProvider(e.provider)?.local);
  if (!local && !e.key) return {};
  return {
    "x-axiom-provider": e.provider,
    ...(e.key ? { "x-axiom-key": e.key } : {}),
    ...(e.model ? { "x-axiom-model": e.model } : {}),
    ...(local && e.baseUrl ? { "x-axiom-base": e.baseUrl } : {}),
  };
}

export function activeSession() {
  const s = useStation.getState();
  return s.sessions.find((x) => x.id === s.activeSessionId) ?? s.sessions[0];
}
