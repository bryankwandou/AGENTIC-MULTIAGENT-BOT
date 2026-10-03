import { PERSONAS, type CompileMode, type LanguagePin, type PersonaId } from "@/lib/catalog";
import { compileKernel, type CompiledKernel } from "@/lib/megaprompt";
import { EngineError } from "@/lib/engine/compat";
import { LEAD, type TeamEvent, type TeamStep } from "./types";

/**
 * Team orchestration: the lead (Atlas, persona "operator") plans, its teammates work the steps
 * in parallel — each on its own compiled kernel and memory — and the lead streams the merged
 * deliverable. Everything is emitted as TeamEvents; the route frames them as SSE.
 */

export type TeamInput = {
  job: string;
  /** Non-lead participants, validated and unique. */
  bots: PersonaId[];
  language: LanguagePin;
  compileMode: CompileMode;
  enabledModules: string[];
  vault: string[];
  addendum: string;
  temperature: number;
  maxTokens: number;
  botMemory: Partial<Record<PersonaId, string[]>>;
};

export type StreamRequest = {
  phase: "plan" | "work" | "final";
  bot: PersonaId;
  /** Position of the step in the plan (0 for the lead's own calls). */
  index: number;
  system: string;
  user: string;
  temperature: number;
  maxTokens: number;
  signal: AbortSignal;
  steps: TeamStep[];
};

/** Opens one streamed completion. The live opener calls the engine; demo mode scripts it. */
export type Opener = (req: StreamRequest) => Promise<{ model: string; tokens: AsyncGenerator<string> }>;
export type Emit = (e: TeamEvent) => void;

/** Handoffs are staggered slightly so each one is readable (and walkable on the Floor). */
const STAGGER_MS = 350;

/** Time budget for one run, in ms from its start: planning, then the workers, then the whole run. */
export type Pace = { plan: number; workers: number; run: number };
/** Hosted engines inside a 60s serverless window: workers still talking at 38s are cut so the lead can merge. */
export const HOSTED_PACE: Pace = { plan: 20_000, workers: 38_000, run: 57_000 };
/**
 * A model on the operator's own machine reads the kernel on a CPU or small GPU and usually serves one
 * call at a time, so the lanes queue. No serverless clock applies there; give it minutes, not seconds.
 */
export const LOCAL_PACE: Pace = { plan: 180_000, workers: 600_000, run: 780_000 };
const MAX_STEPS = 4;
const WORKER_MAX_TOKENS = 1400;
const OUTPUT_CAP = 6000;

const BY_ID = new Map(PERSONAS.map((p) => [p.id, p]));

function persona(id: PersonaId) {
  return BY_ID.get(id) ?? PERSONAS[0]!;
}

export async function orchestrate(input: TeamInput, open: Opener, emit: Emit, signal: AbortSignal, demo: boolean, pace: Pace = HOSTED_PACE) {
  const t0 = Date.now();
  const lang = replyLanguage(input);
  const leadKernel = kernelFor(LEAD, input);
  emit({ type: "meta", demo, lead: LEAD, bots: input.bots, kernelChars: leadKernel.chars });

  /* a. Plan ------------------------------------------------------------ */
  const planWindow = deadline(signal, pace.plan);
  let raw = "";
  let planModel = "";
  try {
    const { model, tokens } = await open({
      phase: "plan",
      bot: LEAD,
      index: 0,
      system: leadKernel.text,
      user: planPrompt(input, lang),
      temperature: Math.min(input.temperature, 0.4),
      maxTokens: 700,
      signal: planWindow.signal,
      steps: [],
    });
    planModel = model;
    for await (const t of tokens) raw += t;
  } catch (err) {
    if (signal.aborted) return;
    // A slow plan falls back to one step per teammate; a real engine failure ends the run.
    if (!planWindow.timedOut()) {
      emit({ type: "error", bot: LEAD, message: readable(err) });
      emit({ type: "end" });
      return;
    }
  } finally {
    planWindow.dispose();
  }

  const parsed = parsePlan(raw, input.bots);
  const steps: TeamStep[] = parsed ?? input.bots.map((bot) => ({ bot, task: input.job.slice(0, 600) }));
  emit({ type: "plan", steps, model: planModel || "—", ...(parsed ? {} : { fallback: true }) });

  /* b. Parallel work --------------------------------------------------- */
  const outputs = new Map<PersonaId, Output>();
  const workWindow = deadline(signal, pace.workers - (Date.now() - t0));
  let pending = steps.length;
  const waitTimer = setTimeout(
    () => {
      if (pending > 0 && !signal.aborted) {
        emit({ type: "wait", bot: LEAD, reason: `waiting on ${pending} teammate${pending === 1 ? "" : "s"}`, pending });
      }
    },
    (steps.length - 1) * STAGGER_MS + 1200,
  );

  const work = async (step: TeamStep, i: number) => {
    let text = "";
    try {
      if (i) await sleep(i * STAGGER_MS, workWindow.signal);
      emit({ type: "handoff", from: LEAD, to: step.bot, text: step.task });
      const kernel = kernelFor(step.bot, input);
      emit({ type: "start", bot: step.bot, task: step.task, kernelChars: kernel.chars });
      const started = Date.now();
      const { model, tokens } = await open({
        phase: "work",
        bot: step.bot,
        index: i,
        system: kernel.text,
        user: workerPrompt(input, step, steps, lang),
        temperature: input.temperature,
        maxTokens: Math.min(input.maxTokens, WORKER_MAX_TOKENS),
        signal: workWindow.signal,
        steps,
      });
      for await (const t of tokens) {
        text += t;
        emit({ type: "token", bot: step.bot, text: t });
      }
      outputs.set(step.bot, { text, model });
      emit({ type: "done", bot: step.bot, ms: Date.now() - started, chars: text.length, model });
    } catch (err) {
      if (signal.aborted) return;
      const cut = workWindow.timedOut();
      const message = cut
        ? text
          ? "Cut at the team deadline — partial work kept."
          : "No answer before the team deadline."
        : readable(err);
      outputs.set(step.bot, { text, model: "", error: message, partial: cut && Boolean(text) });
      emit({ type: "error", bot: step.bot, message });
    } finally {
      pending -= 1;
    }
  };

  try {
    await Promise.all(steps.map((step, i) => work(step, i)));
  } finally {
    clearTimeout(waitTimer);
    workWindow.dispose();
  }
  if (signal.aborted) return;

  /* c. Synthesis -------------------------------------------------------- */
  if (!steps.some((s) => outputs.get(s.bot)?.text.trim())) {
    emit({ type: "error", bot: LEAD, message: "No teammate delivered anything to merge." });
    emit({ type: "end" });
    return;
  }

  const sensitive = needsApproval(input.job, steps);
  emit({ type: "final-start" });
  const finalWindow = deadline(signal, pace.run - (Date.now() - t0));
  const started = Date.now();
  let final = "";
  let finalOk = false;
  try {
    const { model, tokens } = await open({
      phase: "final",
      bot: LEAD,
      index: 0,
      system: leadKernel.text,
      user: synthesisPrompt(input, steps, outputs, lang, sensitive),
      temperature: input.temperature,
      maxTokens: input.maxTokens,
      signal: finalWindow.signal,
      steps,
    });
    for await (const t of tokens) {
      final += t;
      emit({ type: "final-token", text: t });
    }
    emit({ type: "final-done", ms: Date.now() - started, model, chars: final.length });
    finalOk = true;
  } catch (err) {
    if (signal.aborted) return;
    emit({
      type: "error",
      bot: LEAD,
      message: finalWindow.timedOut()
        ? final
          ? "Synthesis cut at the time limit — partial deliverable kept."
          : "Synthesis ran out of time."
        : readable(err),
    });
  } finally {
    finalWindow.dispose();
  }

  /* d. Approval --------------------------------------------------------- */
  if (finalOk && sensitive) {
    emit({ type: "approval", bot: LEAD, action: approvalAction(final, input.job, lang === "Indonesian") });
  }

  /* e. End -------------------------------------------------------------- */
  emit({ type: "end" });
}

type Output = { text: string; model: string; error?: string; partial?: boolean };

/* ------------------------------------------------------------------ */
/* Kernels and prompts                                                  */
/* ------------------------------------------------------------------ */

/** The bot's own kernel: its persona overlay, the shared vault, and its private memory appended. */
function kernelFor(bot: PersonaId, input: TeamInput): CompiledKernel {
  const p = persona(bot);
  const memory = (input.botMemory[bot] ?? []).map((m) => `${p.bot} (${p.name}) remembers: ${m}`);
  const compile = (vault: string[]) =>
    compileKernel({
      mode: input.compileMode,
      enabledIds: input.enabledModules,
      persona: bot,
      language: input.language,
      vault,
      addendum: input.addendum,
    });
  let kernel = compile([...input.vault, ...memory]);
  if (!memory.length || kernel.text.includes("<<<VAULT>>>")) return kernel;
  // The compiler drops an oversized vault block whole; keep the bot's memory and as much vault as fits.
  let notes = [...memory, ...input.vault];
  while (notes.length > memory.length && !kernel.text.includes("<<<VAULT>>>")) {
    notes = notes.slice(0, Math.max(memory.length, Math.floor(notes.length * 0.6)));
    kernel = compile(notes);
  }
  return kernel;
}

type Lang = "Indonesian" | "English" | "the language of the job";

function replyLanguage(input: TeamInput): Lang {
  if (input.language === "en") return "English";
  return speaksIndonesian(input) ? "Indonesian" : "the language of the job";
}

const ID_WORDS =
  /\b(saya|aku|kami|kita|apa|yang|untuk|bagaimana|gimana|dan|ini|itu|tolong|buat|buatkan|bikin|dengan|tidak|nggak|gak|dari|jadi|kirim|hapus|bayar|rencana|tim)\b/i;

export function speaksIndonesian(input: Pick<TeamInput, "language" | "job">) {
  return input.language === "id" || (input.language === "auto" && ID_WORDS.test(input.job));
}

const fence = (s: string) => `"""\n${s}\n"""`;

function who(id: PersonaId) {
  const p = persona(id);
  return `${p.bot} (${p.name})`;
}

function planPrompt(input: TeamInput, lang: Lang) {
  const max = Math.min(MAX_STEPS, input.bots.length);
  const min = Math.min(2, max);
  const roster = input.bots.map((id) => {
    const p = persona(id);
    return `- "${p.id}" — ${p.bot}, ${p.name}: ${p.blurb}`;
  });
  const lead = persona(LEAD);
  return [
    `TEAM MODE — PLAN. You are ${lead.bot}, the lead (${lead.name}) of an AXIOM bot team. Teammates work in parallel and cannot see each other's work; you merge their results afterwards.`,
    "",
    "The operator's job:",
    fence(input.job),
    "",
    "Teammates you may assign (use these exact ids):",
    ...roster,
    "",
    `Split the job into ${min === max ? max : `${min}–${max}`} parallel step${max === 1 ? "" : "s"}. One step per teammate, each teammate at most once, each given to the teammate whose role fits it best. Each task is one or two sentences: concrete, self-contained, naming the artifact to deliver. Write tasks in ${lang}.`,
    "",
    "Return ONLY this JSON — no prose, no code fence:",
    '{"steps":[{"bot":"researcher","task":"..."}]}',
  ].join("\n");
}

function workerPrompt(input: TeamInput, step: TeamStep, steps: TeamStep[], lang: Lang) {
  const p = persona(step.bot);
  const lead = persona(LEAD);
  const others = steps.filter((s) => s.bot !== step.bot).map((s) => `- ${who(s.bot)}: ${s.task}`);
  return [
    `TEAM MODE — ASSIGNMENT. You are ${p.bot}, the ${p.name} on an AXIOM bot team led by ${lead.bot} (${lead.name}). You work in parallel with your teammates; ${lead.bot} merges the results.`,
    "",
    "The operator's job:",
    fence(input.job),
    "",
    `Your assignment from ${lead.bot}:`,
    fence(step.task),
    ...(others.length ? ["", "Teammates covering the other parts (do not do their work):", ...others] : []),
    "",
    "Deliver your part now: the artifact itself, not a plan to make it. Lead with the result. Stay under ~250 words unless code or a table is the deliverable. Mark any assumption in one line. No greeting, no sign-off, no talk about the team.",
    "No external action is executed by anyone on this team: if your part involves sending, posting, paying, deleting or deploying, prepare it and note that it awaits the operator's approval.",
    `Reply in ${lang}.`,
  ].join("\n");
}

function synthesisPrompt(input: TeamInput, steps: TeamStep[], outputs: Map<PersonaId, Output>, lang: Lang, sensitive: boolean) {
  const lead = persona(LEAD);
  const blocks = steps.map((s) => {
    const out = outputs.get(s.bot);
    const head = `### ${who(s.bot)} — assignment: ${s.task}`;
    if (!out?.text.trim()) return `${head}\n(failed: ${out?.error ?? "no output"})`;
    const body = out.text.length > OUTPUT_CAP ? `${out.text.slice(0, OUTPUT_CAP)}\n[…trimmed]` : out.text;
    const note = out.partial ? "\n(partial — cut at the deadline)" : out.error ? `\n(incomplete — ${out.error})` : "";
    return `${head}${note}\n${body}`;
  });
  return [
    `TEAM MODE — SYNTHESIS. You are ${lead.bot}, the lead (${lead.name}). Your teammates finished their parts in parallel. Merge them into the one deliverable the operator asked for.`,
    "",
    "The operator's job:",
    fence(input.job),
    "",
    "Teammate outputs:",
    "",
    blocks.join("\n\n"),
    "",
    "Write the final deliverable: answer first; keep the strongest concrete material; remove overlap; where teammates disagree, pick one and say why in a line; fill a gap yourself only if it is small, and say so. No process narration. End with one short line crediting who contributed what (e.g. \"Team: Iris — evidence; Kai — code.\").",
    ...(sensitive
      ? [
          'The job involves an external action. Nothing has been executed and no external systems are connected: prepare it fully, do not claim it happened, and make the very last line exactly "Needs approval: <one line — what would be executed, and to whom or where>".',
        ]
      : []),
    `Reply in ${lang}.`,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Plan parsing                                                         */
/* ------------------------------------------------------------------ */

function resolveBot(v: unknown): PersonaId | null {
  if (typeof v !== "string") return null;
  const k = v.trim().toLowerCase();
  const p = PERSONAS.find(
    (x) => x.id === k || x.bot.toLowerCase() === k || x.name.toLowerCase() === k || x.nameId.toLowerCase() === k,
  );
  return p?.id ?? null;
}

/** First balanced `open…close` span, string-aware, so prose or a trailing note around the JSON is ignored. */
function firstBalanced(s: string, open: "{" | "[", close: "}" | "]"): string | null {
  const start = s.indexOf(open);
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth += 1;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/** Robust plan parse: strips code fences, takes the first JSON object (or array), keeps valid teammates only. */
export function parsePlan(raw: string, participants: PersonaId[]): TeamStep[] | null {
  const text = raw.replace(/```[a-zA-Z]*\s*/g, "").replace(/```/g, "");
  const candidates = [firstBalanced(text, "{", "}"), firstBalanced(text, "[", "]"), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  let list: unknown[] | null = null;
  for (const c of candidates) {
    if (!c) continue;
    try {
      const j = JSON.parse(c) as unknown;
      if (Array.isArray(j)) list = j;
      else if (j && typeof j === "object" && Array.isArray((j as { steps?: unknown }).steps)) list = (j as { steps: unknown[] }).steps;
    } catch {
      // try the next candidate
    }
    if (list) break;
  }
  if (!list) return null;

  const allowed = new Set(participants.filter((p) => p !== LEAD));
  const merged = new Map<PersonaId, string[]>();
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const bot = resolveBot(r.bot ?? r.id ?? r.teammate ?? r.agent ?? r.persona);
    const task = typeof r.task === "string" ? r.task : typeof r.text === "string" ? r.text : "";
    if (!bot || !allowed.has(bot) || !task.trim()) continue;
    merged.set(bot, [...(merged.get(bot) ?? []), task.trim().replace(/\s+/g, " ")]);
  }
  const steps = [...merged]
    .slice(0, MAX_STEPS)
    .map(([bot, tasks]) => ({ bot, task: tasks.join(" Also: ").slice(0, 600) }));
  return steps.length ? steps : null;
}

/* ------------------------------------------------------------------ */
/* Approval                                                             */
/* ------------------------------------------------------------------ */

export type ActionKind = "send" | "publish" | "delete" | "pay" | "deploy";

const ACTION_RES: [ActionKind, RegExp][] = [
  ["pay", /\b(?:pay(?:s|ing)?(?!\s+attention)|payment|payout|refund(?:s|ed)?|transfer\w*\s+(?:\$|rp\.?|usd|idr|eur|\d|funds|money|uang|dana|the\s+(?:money|funds))|mentransfer|bayar(?:kan)?|membayar|pembayaran)\b/i],
  ["deploy", /\b(?:deploy(?:s|ed|ing|ment)?|push\s+to\s+prod(?:uction)?|go\s+live|rilis(?:kan)?|merilis)\b/i],
  ["delete", /\b(?:delete(?:s|d)?|deleting|wipe|purge|hapus(?:kan)?|menghapus)\b/i],
  ["publish", /\b(?:publish(?:es|ed|ing)?|post(?:ed|ing)?\s+(?:it|this|that|them|to|on)|tweet(?:s|ed|ing)?|publikasi(?:kan)?|mempublikasikan|terbitkan|menerbitkan|unggah(?:kan)?|mengunggah|postingkan|memposting)\b/i],
  ["send", /\b(?:send(?:s|ing)?(?!\s+(?:me|us)\b)|e-?mail(?:ed|ing)?\s+(?:it|this|that|them|the|all|everyone|my|our)|kirim(?:kan|in)?|mengirim(?:kan)?|kirimi)\b/i],
];

export function actionKind(text: string): ActionKind | null {
  return ACTION_RES.find(([, re]) => re.test(text))?.[0] ?? null;
}

/** Sensitive external action implied by the job or the plan (send / post / publish / delete / pay / transfer / deploy, EN + ID). */
export function needsApproval(job: string, steps: TeamStep[]) {
  return Boolean(actionKind(job) || steps.some((s) => actionKind(s.task)));
}

const ACTION_TEXT: Record<ActionKind, [string, string]> = {
  send: ["Send the drafted message to its recipients", "Kirim pesan yang sudah disusun ke penerimanya"],
  publish: ["Publish the final draft to the named channel", "Publikasikan draf final ke kanal yang disebut"],
  delete: ["Delete the items named in the job", "Hapus item yang disebut di job"],
  pay: ["Execute the payment / transfer as specified", "Jalankan pembayaran / transfer sesuai rincian"],
  deploy: ["Deploy the change to production", "Deploy perubahan ke produksi"],
};

export function snippet(s: string, n: number) {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
}

export function approvalTemplate(job: string, id: boolean) {
  const kind = actionKind(job) ?? "send";
  return `${ACTION_TEXT[kind][id ? 1 : 0]} — “${snippet(job, 64)}”`;
}

/** The lead's own "Needs approval:" line when it wrote one, else a template from the job's verb. */
function approvalAction(final: string, job: string, id: boolean) {
  const lines = [...final.matchAll(/(?:needs approval|perlu persetujuan)\s*\**\s*[:：]\s*(.+)/gi)];
  const own = lines.at(-1)?.[1]?.replace(/[*_`]/g, "").trim();
  return own ? snippet(own, 180) : approvalTemplate(job, id);
}

/* ------------------------------------------------------------------ */
/* Utilities                                                            */
/* ------------------------------------------------------------------ */

function readable(err: unknown) {
  return err instanceof EngineError || err instanceof Error ? err.message : "Engine failed.";
}

/** A child signal that aborts with its parent or after `ms`; `timedOut` tells the two apart. */
function deadline(parent: AbortSignal, ms: number) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  if (parent.aborted) ctrl.abort();
  else parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(), Math.max(0, ms));
  return {
    signal: ctrl.signal,
    timedOut: () => ctrl.signal.aborted && !parent.aborted,
    dispose: () => {
      clearTimeout(timer);
      parent.removeEventListener("abort", onAbort);
    },
  };
}

export function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
