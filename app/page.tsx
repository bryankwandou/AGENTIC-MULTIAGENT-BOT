import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Command, Cpu, Database, FileText, Layers, ScanEye, Sparkles } from "lucide-react";
import { AxiomAvatar, AxiomGlyph, Lamp } from "@/components/axiom-mark";
import { FloorShowcase } from "@/components/landing/floor-showcase";
import { SpineShowcase } from "@/components/landing/spine-showcase";
import { CORE_MODULE_IDS, MODULES, PERSONAS, SLASH_COMMANDS } from "@/lib/catalog";
import { GROUPS, PROVIDERS } from "@/lib/engine/providers";
import { compileKernel, megapromptSpine, megapromptStats, parseSections } from "@/lib/megaprompt";

export const dynamic = "force-static";

function kernelFor(mode: "lite" | "core" | "full") {
  const k = compileKernel({ mode, enabledIds: [...CORE_MODULE_IDS], persona: "operator", language: "auto", vault: [], addendum: "" });
  return { chars: k.chars, sections: k.used.length, usedPrefixes: k.usedPrefixes };
}

function identity() {
  const sec = parseSections().find((s) => s.headingPrefix === "01.");
  const pick = (key: string) => sec?.lines.find((l) => l.startsWith(`${key}:`))?.slice(key.length + 1).trim() ?? "";
  return {
    role: pick("Role"),
    allegiance: pick("Allegiance"),
    temperament: pick("Temperament"),
    posture: pick("Default posture"),
    forbidden: pick("Forbidden posture"),
  };
}

function directives() {
  const sec = parseSections().find((s) => s.headingPrefix === "02.");
  return (sec?.lines ?? [])
    .filter((l) => /^D\d\. /.test(l))
    .map((l) => {
      const [code, ...rest] = l.split(". ");
      return { code: code!, text: rest.join(". ").replace(/\.$/, "") };
    });
}

function maxims() {
  const sec = parseSections().find((s) => s.headingPrefix === "39.");
  return (sec?.lines ?? []).filter((l) => /^M\d{2}\. /.test(l)).map((l) => l.replace(/^M\d{2}\. /, ""));
}

export default function Landing() {
  const stats = megapromptStats();
  const bands = megapromptSpine();
  const modes = { lite: kernelFor("lite"), core: kernelFor("core"), full: kernelFor("full") };
  const who = identity();
  const laws = directives();
  const lines = maxims();

  const numbers = [
    { n: stats.lines.toLocaleString(), l: "lines of megaprompt" },
    { n: String(stats.sections), l: "sections" },
    { n: String(MODULES.length), l: "toggleable modules" },
    { n: String(PERSONAS.length), l: "personas" },
    { n: String(SLASH_COMMANDS.length), l: "slash commands" },
  ];

  return (
    <main className="bg-bg text-fg">
      {/* NAV */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-white/5 bg-bg/55 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 md:px-6">
          <Link href="/" className="flex items-center gap-2.5 text-accent">
            <AxiomGlyph className="size-5" />
            <span className="font-display text-lg font-semibold tracking-[0.2em]">AXIOM</span>
          </Link>
          <nav className="hidden items-center gap-6 text-[13px] text-muted md:flex">
            <a href="#spine" className="hover:text-fg">Compiler</a>
            <a href="#mind" className="hover:text-fg">The mind</a>
            <a href="#personas" className="hover:text-fg">Personas</a>
            <a href="#station" className="hover:text-fg">Station</a>
            <a href="#floor" className="hover:text-fg">Floor</a>
          </nav>
          <Link
            href="/station"
            className="ml-auto flex h-9 items-center gap-2 rounded-full bg-accent px-4 text-[13px] font-medium text-accent-fg transition-opacity hover:opacity-90"
          >
            Enter station <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="relative aspect-[4/3] max-h-[94vh] w-full overflow-hidden sm:aspect-[16/9]">
          <Image src="/hero.jpg" alt="AXIOM — first principles" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgb(10_11_12/0.75)_100%)]" />
          <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg to-transparent" />
          <div className="absolute inset-x-0 bottom-[7%] flex flex-col items-center gap-5 px-4 text-center">
            <p className="eyebrow animate-rise text-muted!">Operator station · personal Grok-class mind</p>
            <div className="flex animate-rise flex-wrap justify-center gap-3 [animation-delay:150ms]">
              <Link
                href="/station"
                className="flex h-11 items-center gap-2 rounded-full bg-accent px-6 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02]"
              >
                Enter the station <ArrowRight className="size-4" />
              </Link>
              <a
                href="#spine"
                className="flex h-11 items-center rounded-full border border-white/15 bg-bg/40 px-6 text-sm text-fg backdrop-blur hover:border-white/30"
              >
                See the compiler
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* THESIS */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:px-6 md:pt-24">
        <p className="eyebrow">The thesis</p>
        <h1 className="mt-4 max-w-4xl font-display text-[2.6rem] leading-[1.02] font-semibold tracking-tight text-balance md:text-7xl">
          A mind that runs on a <em className="text-signal">constitution</em>, not a vibe.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted text-pretty">
          AXIOM is a {stats.lines.toLocaleString()}-line operating contract for a Grok-class model — identity, laws,
          reasoning methods, craft, and a catalog of its own failure modes. Every turn, a compiler cuts it down to the
          kernel this job needs and hands it to the engine. You can read every line it was given.
        </p>
        <div className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-5">
          {numbers.map((x) => (
            <div key={x.l} className="bg-bg px-5 py-6">
              <p className="font-display text-4xl font-semibold tabular-nums md:text-5xl">{x.n}</p>
              <p className="mt-1 font-mono text-[10px] tracking-[0.14em] text-subtle uppercase">{x.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MAXIMS MARQUEE */}
      <section className="overflow-hidden border-y border-line bg-surface/50 py-4" aria-label="Maxims">
        <div className="flex w-max animate-marquee gap-10 whitespace-nowrap">
          {[...lines, ...lines].map((m, i) => (
            <span key={i} className="flex items-center gap-10 font-display text-xl text-muted italic">
              {m}
              <span className="text-signal not-italic">◆</span>
            </span>
          ))}
        </div>
      </section>

      {/* COMPILER / SPINE */}
      <section id="spine" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 md:px-6">
        <div className="grid gap-10 md:grid-cols-[1fr_1.1fr] md:items-end">
          <div>
            <p className="eyebrow">01 — The kernel compiler</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">
              {stats.lines.toLocaleString()} lines in the library.
              <br />
              <span className="text-muted">Only the working set reaches the engine.</span>
            </h2>
          </div>
          <p className="text-base leading-relaxed text-muted text-pretty">
            Below is the real megaprompt, drawn as a spine — one band per section, sized by line count. Lit bands are what
            the compiler packs into the system prompt. The constitution is locked on; everything else is the operator&apos;s call.
          </p>
        </div>
        <div className="mt-10">
          <SpineShowcase bands={bands} modes={modes} />
        </div>

        <div className="mt-16 grid gap-px overflow-hidden rounded-2xl border border-line bg-line md:grid-cols-4">
          {[
            { icon: FileText, t: "Megaprompt", d: `${stats.lines.toLocaleString()} lines · ${stats.sections} sections · ID + EN.` },
            { icon: Layers, t: "Compiler", d: "Locked constitution + enabled modules + persona overlay + vault + addendum." },
            { icon: Cpu, t: "Kernel", d: `≈${(modes.core.chars / 1000).toFixed(0)}k chars in core mode. Viewable, copyable, auditable.` },
            { icon: Sparkles, t: "Engine", d: "Any key or local model — Grok, Claude, Gemini, Groq, Hugging Face, Ollama, LM Studio — streamed, with model fallback." },
          ].map((s, i) => (
            <div key={s.t} className="relative bg-bg p-6">
              <span className="font-mono text-[10px] text-subtle">0{i + 1}</span>
              <s.icon className="mt-4 size-5 text-signal" strokeWidth={1.5} />
              <p className="mt-3 font-display text-2xl font-semibold">{s.t}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              {i < 3 ? <ArrowRight className="absolute top-6 right-5 hidden size-4 text-line-strong md:block" /> : null}
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-line bg-surface/40 px-6 py-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="eyebrow">Model-agnostic</p>
              <p className="mt-1 font-display text-2xl font-semibold">Bring any model — cloud or your own GPU.</p>
            </div>
            <p className="font-mono text-[11px] text-subtle">{PROVIDERS.length} engines · key prefix auto-detect · model fallback</p>
          </div>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {GROUPS.map((g) => (
              <div key={g.id}>
                <p className="font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">{g.label}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {PROVIDERS.filter((p) => p.group === g.id && p.id !== "custom").map((p) => (
                    <span
                      key={p.id}
                      className={`rounded-full border px-3 py-1 text-xs ${p.local ? "border-signal/30 text-fg" : "border-line text-muted"}`}
                    >
                      {p.name}
                    </span>
                  ))}
                  {g.id === "local" ? (
                    <span className="rounded-full border border-dashed border-line px-3 py-1 text-xs text-subtle">any OpenAI-compatible URL</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* THE MIND / BOT */}
      <section id="mind" className="scroll-mt-20 border-t border-line bg-surface/30">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-24 md:grid-cols-2 md:px-6">
          <div>
            <p className="eyebrow">02 — The mind</p>
            <h2 className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">
              Calm, precise, slightly dry. <span className="text-muted">Never needy.</span>
            </h2>
            <div className="mt-8 overflow-hidden rounded-2xl border border-line bg-bg">
              <div className="flex items-center gap-4 border-b border-line p-5">
                <AxiomAvatar size={52} live />
                <div>
                  <p className="font-display text-2xl font-semibold tracking-[0.14em]">AXIOM</p>
                  <p className="font-mono text-[10px] tracking-[0.16em] text-subtle uppercase">Voice card · identity §01</p>
                </div>
              </div>
              <dl className="divide-y divide-line text-sm">
                {[
                  ["Role", who.role],
                  ["Allegiance", who.allegiance],
                  ["Temperament", who.temperament],
                  ["Posture", who.posture],
                  ["Never", who.forbidden],
                ].map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7rem_1fr] gap-4 px-5 py-3">
                    <dt className="font-mono text-[11px] tracking-wider text-subtle uppercase">{k}</dt>
                    <dd className="text-fg/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div>
            <p className="eyebrow">Prime directives — ordered; earlier wins</p>
            <ol className="mt-5 space-y-2">
              {laws.map((d) => (
                <li key={d.code} className="flex gap-4 rounded-xl border border-line bg-bg px-4 py-3.5">
                  <span className="font-mono text-xs text-signal">{d.code}</span>
                  <span className="text-sm font-medium tracking-wide">{d.text}</span>
                </li>
              ))}
            </ol>

            <div className="mt-8 rounded-2xl border border-line bg-bg p-5">
              <p className="eyebrow mb-4">Sample turn</p>
              <div className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-tr-md border border-line bg-elevated px-4 py-2.5 text-sm">
                  /decide Inject all {stats.lines.toLocaleString()} lines every turn?
                </p>
              </div>
              <div className="mt-4 flex gap-3">
                <AxiomAvatar size={28} />
                <div className="text-sm leading-relaxed">
                  <p>
                    <strong className="text-white">No.</strong> Compile a kernel. The file is the library; the kernel is the
                    working set.
                  </p>
                  <p className="mt-2 text-muted">
                    <span className="text-fg">Sacrifice:</span> completeness per turn.{" "}
                    <span className="text-fg">Kill-criterion:</span> a missed rule shows up twice in a week.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PERSONAS */}
      <section id="personas" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 md:px-6">
        <p className="eyebrow">03 — Personas</p>
        <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">
          One constitution. Six ways to sit in the chair.
        </h2>
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PERSONAS.map((p, i) => (
            <div key={p.id} className="group rounded-2xl border border-line bg-surface/40 p-6 transition-colors hover:border-line-strong hover:bg-surface">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-subtle">P{String(i + 1).padStart(2, "0")}</span>
                <Lamp tone="signal" className="size-1.5 opacity-40 transition-opacity group-hover:opacity-100" />
              </div>
              <p className="mt-6 font-display text-3xl font-semibold">{p.name}</p>
              <p className="mt-2 text-sm text-muted">{p.blurb}</p>
              <div className="mt-5 flex flex-wrap gap-1">
                {p.modules.map((m) => (
                  <span key={m} className="rounded-md bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-muted">
                    {m}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* STATION */}
      <section id="station" className="scroll-mt-20 border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6">
          <p className="eyebrow">04 — The workstation</p>
          <h2 className="mt-4 max-w-3xl font-display text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">
            Built like an instrument, not a toy.
          </h2>
          <div className="mt-10 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-[var(--shadow-pop)]">
            <div className="flex items-center gap-2 border-b border-line px-4 py-3">
              <span className="size-2.5 rounded-full bg-line-strong" />
              <span className="size-2.5 rounded-full bg-line-strong" />
              <span className="size-2.5 rounded-full bg-line-strong" />
              <span className="ml-3 font-mono text-[11px] text-subtle">axiom / station</span>
            </div>
            <Image
              src="/station.png"
              alt="AXIOM workstation: sessions, chat with the bot, and the kernel inspector"
              width={1440}
              height={900}
              sizes="(min-width: 1152px) 1152px, 100vw"
              className="h-auto w-full"
            />
          </div>
          <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              { icon: Command, t: "Command palette", d: "⌘K for every view, persona, compile mode, language pin and playbook." },
              { icon: ScanEye, t: "Kernel viewer", d: "See and copy the exact system prompt the engine receives. No black box." },
              { icon: Layers, t: "Live inspector", d: "Toggle modules, watch the spine and budget react, tune temperature." },
              { icon: FileText, t: "Megaprompt studio", d: "All sections, searchable, line-numbered, with an operator addendum." },
              { icon: Database, t: "Memory vault", d: "Facts that should stay true, injected after the kernel on every turn." },
              { icon: Sparkles, t: "Any engine", d: "Paste an xAI, Groq, Gemini, OpenAI or Claude key; provider auto-detected. No key? Demo mode." },
            ].map((f) => (
              <div key={f.t} className="flex gap-4">
                <f.icon className="mt-0.5 size-5 shrink-0 text-signal" strokeWidth={1.5} />
                <div>
                  <p className="font-medium">{f.t}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{f.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FLOOR */}
      <section id="floor" className="scroll-mt-20 border-t border-line bg-surface/30">
        <div className="mx-auto max-w-6xl px-4 py-24 md:px-6">
          <div className="grid gap-8 md:grid-cols-[1.1fr_1fr] md:items-end">
            <div>
              <p className="eyebrow">05 — The floor</p>
              <h2 className="mt-4 font-display text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">
                Six bots. One office. <span className="text-muted">Working in parallel.</span>
              </h2>
            </div>
            <p className="text-base leading-relaxed text-muted text-pretty">
              Every bot&apos;s body follows its real response phase: thinking sends it to the meeting room, a slow engine
              sends it for coffee, streaming tokens bring it back to the desk to type, a handoff walks it to a teammate,
              an error sends it to the kernel room. Below, the floor runs on its own; in the station it is driven by your jobs.
            </p>
          </div>
          <div className="mt-10">
            <FloorShowcase maxims={lines.slice(0, 16)} />
          </div>
          <div className="mt-6 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-6">
            {[
              ["Thinking", "meeting room"],
              ["Waiting", "coffee bar"],
              ["Writing", "desk, typing"],
              ["Handoff", "teammate's desk"],
              ["Error", "kernel room"],
              ["Approval", "hand raised"],
            ].map(([k, v]) => (
              <div key={k} className="bg-bg px-4 py-3">
                <p className="font-mono text-[10px] tracking-[0.14em] text-signal uppercase">{k}</p>
                <p className="mt-1 text-sm text-muted">{v}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden border-t border-line">
        <Image src="/desk.jpg" alt="" fill sizes="100vw" className="object-cover opacity-35" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg via-bg/60 to-bg" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-4 py-32 text-center">
          <Lamp live className="size-2.5" />
          <h2 className="mt-8 font-display text-5xl leading-[1.02] font-semibold tracking-tight md:text-7xl">AXIOM waits for the job.</h2>
          <p className="mt-5 max-w-xl text-muted">Truth over comfort. Usefulness over theater. Keep the glass clean.</p>
          <Link
            href="/station"
            className="mt-10 flex h-12 items-center gap-2 rounded-full bg-accent px-7 text-sm font-medium text-accent-fg transition-transform hover:scale-[1.02]"
          >
            Enter the station <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 font-mono text-[11px] text-subtle md:flex-row md:items-center md:justify-between md:px-6">
          <span className="flex items-center gap-2">
            <AxiomGlyph className="size-4 text-muted" /> AXIOM operator station
          </span>
          <span>Independent project. Not affiliated with xAI or any model provider. Bring your own key.</span>
        </div>
      </footer>
    </main>
  );
}
