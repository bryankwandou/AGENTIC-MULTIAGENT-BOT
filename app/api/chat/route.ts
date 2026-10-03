import { compileKernel, type CompiledKernel } from "@/lib/megaprompt";
import { MODULES, PERSONAS, type CompileMode, type LanguagePin, type PersonaId } from "@/lib/catalog";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { EngineError, openEngineStream, requestEngine } from "@/lib/server/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type InMessage = { role: "user" | "assistant"; content: string };

const PERSONA_IDS = new Set<PersonaId>(PERSONAS.map((p) => p.id));
const MODULE_IDS = new Set(MODULES.map((m) => m.id));
const MODES = new Set<CompileMode>(["lite", "core", "full"]);
const LANGS = new Set<LanguagePin>(["auto", "id", "en"]);

export async function POST(request: Request) {
  const limit = rateLimit(clientKey(request));
  if (!limit.ok) {
    return Response.json(
      { error: `Rate limit — try again in ${limit.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages: InMessage[] = (Array.isArray(raw.messages) ? raw.messages : [])
    .filter(
      (m): m is InMessage =>
        !!m && typeof m === "object" && ((m as InMessage).role === "user" || (m as InMessage).role === "assistant") && typeof (m as InMessage).content === "string",
    )
    .slice(-16)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 12_000) }));
  if (!messages.length || messages[messages.length - 1]?.role !== "user") {
    return Response.json({ error: "Empty thread." }, { status: 400 });
  }

  const persona = PERSONA_IDS.has(raw.persona as PersonaId) ? (raw.persona as PersonaId) : "operator";
  const mode = MODES.has(raw.compileMode as CompileMode) ? (raw.compileMode as CompileMode) : "core";
  const language = LANGS.has(raw.language as LanguagePin) ? (raw.language as LanguagePin) : "auto";
  const enabledIds = (Array.isArray(raw.enabledModules) ? raw.enabledModules : []).filter(
    (id): id is string => typeof id === "string" && MODULE_IDS.has(id),
  );
  const vault = (Array.isArray(raw.vault) ? raw.vault : []).slice(0, 40).map((v) => String(v).slice(0, 500));
  const addendum = String(raw.addendum ?? "").slice(0, 4000);
  const temperature = clamp(Number(raw.temperature ?? 0.6), 0, 1.2, 0.6);
  const maxTokens = Math.round(clamp(Number(raw.maxTokens ?? 1800), 256, 4096, 1800));

  const kernel = compileKernel({ mode, enabledIds, persona, language, vault, addendum });

  const encoder = new TextEncoder();
  const sse = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  const headers = {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  };

  const { engine, error } = requestEngine(request);
  if (error) return Response.json({ error }, { status: 400 });
  if (!engine) {
    return new Response(demoStream(messages[messages.length - 1]!.content, kernel, language, persona, sse), { headers });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const started = Date.now();
      try {
        const { model, tokens } = await openEngineStream(engine, {
          system: kernel.text.slice(0, 100_000),
          messages,
          temperature,
          maxTokens,
          signal: request.signal,
        });
        controller.enqueue(
          sse({
            meta: { model, provider: engine.provider, source: engine.source, kernelChars: kernel.chars, sections: kernel.used.length, truncated: kernel.truncated },
          }),
        );
        let chars = 0;
        for await (const token of tokens) {
          chars += token.length;
          controller.enqueue(sse({ token }));
        }
        controller.enqueue(sse({ done: true, ms: Date.now() - started, chars }));
      } catch (err) {
        if (!request.signal.aborted) {
          const message = err instanceof EngineError || err instanceof Error ? err.message : "Engine failed.";
          controller.enqueue(sse({ error: message }));
        }
      } finally {
        try {
          controller.close();
        } catch {
          // already closed by a client disconnect
        }
      }
    },
  });

  return new Response(stream, { headers });
}

function clamp(n: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------------ */
/* Demo mode — scripted, in AXIOM's voice, so a pitch never hits a wall */
/* ------------------------------------------------------------------ */

function demoStream(
  question: string,
  kernel: CompiledKernel,
  language: LanguagePin,
  persona: PersonaId,
  sse: (o: unknown) => Uint8Array,
) {
  const id = language === "id" || (language === "auto" && /\b(saya|aku|apa|yang|untuk|bagaimana|gimana|dan|ini|itu|tolong|buat)\b/i.test(question));
  const text = demoReply(question, kernel, id, persona);
  const tokens = text.match(/\S+\s*|\s+/g) ?? [text];
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      await sleep(380);
      controller.enqueue(sse({ meta: { model: "demo", kernelChars: kernel.chars, sections: kernel.used.length, truncated: kernel.truncated } }));
      for (const t of tokens) {
        controller.enqueue(sse({ token: t }));
        await sleep(12 + Math.random() * 22);
      }
      controller.enqueue(sse({ done: true }));
      controller.close();
    },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function demoReply(q: string, kernel: CompiledKernel, id: boolean, persona: PersonaId) {
  const cmd = /^\/(\w+)/.exec(q.trim())?.[1]?.toLowerCase();
  const job = q.replace(/^\/\w+\s*/, "").replace(/\s+/g, " ").trim().slice(0, 140) || (id ? "(kosong)" : "(empty)");
  const footer = id
    ? `\n\n---\n_Mode demo · kernel ${kernel.chars.toLocaleString()}c dari ${kernel.used.length} seksi · persona ${persona}. Hubungkan key apa pun (xAI, Groq, Gemini, OpenAI, Claude, …) lewat **Engine** di inspector agar engine menjawab langsung._`
    : `\n\n---\n_Demo mode · kernel ${kernel.chars.toLocaleString()}c from ${kernel.used.length} sections · persona ${persona}. Connect any key (xAI, Groq, Gemini, OpenAI, Claude, …) under **Engine** in the inspector to go live._`;

  const en: Record<string, string> = {
    decide: `**Call:** pick the option you can reverse cheaply, ship it, and set a date to re-check.\n\n| Option | Upside | Cost | Reversible |\n|---|---|---|---|\n| A — simplest path | ships today | ceiling later | yes |\n| B — durable path | scales | a week of plumbing | partly |\n\n**Sacrifice:** B's headroom, for now.\n**Kill-criterion:** if the simple path breaks twice in a month, migrate.\n\nJob read as: _${job}_`,
    brief: `**Spec — ${job}**\n\n1. **Outcome:** one sentence a stranger could test.\n2. **User:** who sits in the chair, and what they do first.\n3. **Must:** the three behaviors that make it real.\n4. **Won't:** what is explicitly out, so scope can't creep.\n5. **Done when:** an observable check, not a feeling.\n\nOne question before building: who is the first user who'd be upset if this vanished?`,
    debug: `**Expected vs actual** first, guesses second.\n\n- **Expected:** _${job}_ works the same on server and client.\n- **Likely cause:** something non-deterministic in render — time, random, locale, or storage read before hydration.\n- **Probe:** render a stable placeholder on the server; move the volatile value into an effect.\n\n\`\`\`tsx\nconst [now, setNow] = useState<string | null>(null);\nuseEffect(() => setNow(new Date().toLocaleTimeString()), []);\n\`\`\`\n\nIf that doesn't kill it, send the exact error and the component — not a summary of it.`,
    steelman: `**Strongest case for it:** _${job}_ maximizes consistency — one source of truth, no drift between what's written and what's sent.\n\n**Where it actually breaks:**\n- cost and latency scale with every turn;\n- most of the text is irrelevant to most jobs, which dilutes attention;\n- the model can't tell which rule matters *now*.\n\n**Better:** compile a kernel — locked constitution + the modules this job needs — and keep the full text for the Studio.`,
    teach: `**Objective:** write a prompt that behaves like a program.\n\n**Model:** _role → input → constraints → output schema → failure behavior._\n\n**Worked example:**\n\`\`\`text\nRole: senior reviewer.\nInput: the diff below.\nConstraints: verdict first, max 5 findings, no style nits.\nOutput: VERDICT / FINDINGS (file:line — issue — fix).\nIf unsure: say what evidence would settle it.\n\`\`\`\n\n**Drill (5 min):** rewrite your last vague prompt in that shape.\n**Common miss:** describing the vibe instead of the output.`,
  };
  const idr: Record<string, string> = {
    decide: `**Keputusan:** ambil opsi yang paling murah untuk dibatalkan, jalankan, lalu pasang tanggal evaluasi.\n\n| Opsi | Untung | Biaya | Bisa dibalik |\n|---|---|---|---|\n| A — jalur paling sederhana | jalan hari ini | ada batas nanti | ya |\n| B — jalur tahan lama | skalabel | seminggu pipa-pipa | sebagian |\n\n**Pengorbanan:** ruang tumbuh B, untuk sekarang.\n**Kriteria berhenti:** kalau jalur sederhana rusak dua kali dalam sebulan, migrasi.\n\nJob terbaca: _${job}_`,
    brief: `**Spek — ${job}**\n\n1. **Hasil:** satu kalimat yang bisa diuji orang asing.\n2. **Pengguna:** siapa yang duduk di kursi, dan apa yang dia lakukan pertama.\n3. **Wajib:** tiga perilaku yang membuatnya nyata.\n4. **Tidak:** yang sengaja di luar, supaya scope tidak merayap.\n5. **Selesai bila:** cek yang bisa diamati, bukan perasaan.\n\nSatu pertanyaan sebelum membangun: siapa pengguna pertama yang akan kecewa kalau ini hilang?`,
    debug: `**Harapan vs kenyataan** dulu, tebakan belakangan.\n\n- **Harapan:** _${job}_ sama di server dan client.\n- **Penyebab paling mungkin:** ada yang tidak deterministik saat render — waktu, random, locale, atau storage dibaca sebelum hydration.\n- **Uji:** render placeholder stabil di server; pindahkan nilai yang berubah ke effect.\n\n\`\`\`tsx\nconst [now, setNow] = useState<string | null>(null);\nuseEffect(() => setNow(new Date().toLocaleTimeString()), []);\n\`\`\`\n\nKalau belum hilang, kirim error persis dan komponennya — bukan ringkasannya.`,
    steelman: `**Argumen terkuat untuknya:** _${job}_ memaksimalkan konsistensi — satu sumber kebenaran, tidak ada selisih antara yang ditulis dan yang dikirim.\n\n**Di mana sebenarnya patah:**\n- biaya dan latensi naik setiap giliran;\n- sebagian besar teks tidak relevan untuk sebagian besar job, perhatian model jadi encer;\n- model tidak tahu aturan mana yang penting *sekarang*.\n\n**Lebih baik:** kompilasi kernel — konstitusi terkunci + modul yang dibutuhkan job ini — dan simpan teks penuh di Studio.`,
    teach: `**Tujuan:** menulis prompt yang berperilaku seperti program.\n\n**Model:** _peran → input → batasan → skema output → perilaku saat gagal._\n\n**Contoh:**\n\`\`\`text\nPeran: reviewer senior.\nInput: diff di bawah.\nBatasan: vonis dulu, maks 5 temuan, tanpa nit gaya.\nOutput: VONIS / TEMUAN (file:baris — masalah — perbaikan).\nKalau ragu: sebut bukti apa yang bisa memutuskan.\n\`\`\`\n\n**Latihan (5 menit):** tulis ulang prompt kabur terakhirmu dalam bentuk itu.\n**Kesalahan umum:** menggambarkan suasana, bukan output.`,
  };

  const bank = id ? idr : en;
  if (cmd && bank[cmd]) return bank[cmd] + footer;
  return (
    (id
      ? `Job diterima: **${job}**\n\nCara AXIOM akan mengerjakannya:\n\n1. **Baca maksud** — apa yang sebenarnya ingin kamu putuskan atau hasilkan.\n2. **Pilih metode** dari Reasoning OS yang cocok, bukan yang paling panjang.\n3. **Jawab dulu**, lalu tunjukkan kerja secukupnya.\n4. **Kalibrasi** — tandai mana fakta, mana tebakan.\n\nCoba juga \`/decide\`, \`/brief\`, \`/debug\`, \`/steelman\`, atau \`/teach\` untuk melihat bentuk jawaban yang berbeda.`
      : `Job received: **${job}**\n\nHow AXIOM will work it:\n\n1. **Read intent** — what you actually need decided or produced.\n2. **Pick a method** from the Reasoning OS that fits, not the longest one.\n3. **Answer first**, then show just enough work.\n4. **Calibrate** — mark what's known versus guessed.\n\nTry \`/decide\`, \`/brief\`, \`/debug\`, \`/steelman\`, or \`/teach\` to see different answer shapes.`) + footer
  );
}
