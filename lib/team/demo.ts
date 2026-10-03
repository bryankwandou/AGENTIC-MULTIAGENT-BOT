import "server-only";
import { PERSONAS, type PersonaId } from "@/lib/catalog";
import { approvalTemplate, needsApproval, sleep, snippet, speaksIndonesian, type Opener, type TeamInput } from "./orchestrator";
import { LEAD, type TeamStep } from "./types";

/**
 * Demo mode: no engine configured. The same orchestrator runs against a scripted opener, so the
 * plan → parallel lanes → synthesis → approval flow is real; only the words are canned.
 * Per-step timings differ on purpose so the parallelism (and one slow teammate) is visible.
 */

/** Seconds to first token, by plan position. Position 1 is the slow one (past the Floor's 5.5s patience). */
const FIRST_TOKEN = [1.2, 6.4, 0.7, 3.3, 2.2];
/** Seconds of streaming once a teammate starts writing, by plan position. */
const STREAM_SPAN = [3.9, 2.6, 5.8, 4.6, 3.1];

const NAME = new Map(PERSONAS.map((p) => [p.id, p.bot]));

export function demoOpener(input: TeamInput): Opener {
  const id = speaksIndonesian(input);
  return async (req) => {
    if (req.phase === "plan") {
      return { model: "demo", tokens: drip(JSON.stringify({ steps: demoPlan(input, id) }), 1500, 500, req.signal) };
    }
    if (req.phase === "work") {
      const solo = req.steps.length === 1;
      const i = req.index % FIRST_TOKEN.length;
      const first = solo ? 6.0 : clamp(FIRST_TOKEN[i]! + (Math.random() - 0.5) * 0.3, 0.6, 6.5);
      const span = clamp(STREAM_SPAN[i]! + (Math.random() - 0.5) * 0.4, 2, 6);
      return { model: "demo", tokens: drip(demoWork(req.bot, input.job, id), first * 1000, span * 1000, req.signal) };
    }
    return { model: "demo", tokens: drip(demoFinal(input, req.steps, id), 900, 4600, req.signal) };
  };
}

async function* drip(text: string, firstMs: number, spanMs: number, signal: AbortSignal): AsyncGenerator<string> {
  const parts = text.match(/\S+\s*|\s+/g) ?? [text];
  await sleep(firstMs, signal);
  const per = spanMs / Math.max(1, parts.length);
  for (const part of parts) {
    yield part;
    await sleep(per * (0.5 + Math.random()), signal);
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/* ------------------------------------------------------------------ */
/* Script                                                               */
/* ------------------------------------------------------------------ */

const TASKS: Record<Exclude<PersonaId, "operator">, [string, string]> = {
  researcher: [
    "Find the crux: what must be true, what is assumed, and what evidence would change the call.",
    "Cari inti masalah: apa yang harus benar, apa yang diasumsikan, dan bukti apa yang bisa mengubah keputusan.",
  ],
  coder: [
    "Sketch the smallest complete build path, with the core code and one test.",
    "Susun jalur build terkecil yang lengkap, dengan kode inti dan satu tes.",
  ],
  writer: [
    "Draft the reader-facing copy: one tight version a busy reader finishes.",
    "Tulis draf teks untuk pembaca: satu versi padat yang selesai dibaca orang sibuk.",
  ],
  strategist: [
    "Lay out the options, pick one, and name the sacrifice and the kill-criterion.",
    "Petakan opsi, pilih satu, sebut pengorbanan dan kriteria berhentinya.",
  ],
  tutor: [
    "Turn the approach into a short how-to the operator can repeat alone.",
    "Ubah pendekatannya jadi panduan singkat yang bisa diulang operator sendiri.",
  ],
};

function demoPlan(input: TeamInput, id: boolean): TeamStep[] {
  return input.bots
    .filter((b): b is Exclude<PersonaId, "operator"> => b !== LEAD)
    .slice(0, 4)
    .map((bot) => ({ bot, task: TASKS[bot][id ? 1 : 0] }));
}

function demoWork(bot: PersonaId, job: string, id: boolean): string {
  const q = snippet(job, 80);
  const en: Record<PersonaId, string> = {
    operator: "",
    researcher: `**Crux:** what has to be true for _${q}_ to land — and what would prove it wrong.\n\n- **Known:** the outcome is named; the audience is implied, not stated.\n- **Assumed:** the first reader is busy and reads two lines.\n- **Unknown:** which constraint actually binds — time, budget, or someone's sign-off.\n\n**Would change the call:** one real counter-example from the last attempt. Get it before building.`,
    coder: `**Smallest complete path** — one list, one owner per step, one check.\n\n\`\`\`ts\ntype Step = { id: string; owner: string; done: boolean };\n\n/** The next open step, or null when the job is finished. */\nexport function nextStep(steps: Step[]): Step | null {\n  return steps.find((s) => !s.done) ?? null;\n}\n\`\`\`\n\n- **Invariant:** every step has exactly one owner.\n- **Test:** empty list → \`null\`; all done → \`null\`.\n- **Not built:** scheduling, reminders — add them when a real miss demands it.`,
    writer: `**Draft** — the version a busy reader finishes.\n\n> **What changes:** one sentence, concrete, with a date.\n>\n> **Why it matters to you:** one sentence about the reader, not about us.\n>\n> **What to do:** a single ask, and where to do it.\n\n- **Cut:** adjectives that don't carry a fact.\n- **Kept:** the verb, the date, the ask.\n- **Length:** under 90 words, one link.`,
    strategist: `**Call:** do the reversible version first.\n\n| Option | Upside | Cost | Reversible |\n|---|---|---|---|\n| Lean — ship this week | real signal in days | rough edges | yes |\n| Full — build it all | polish | two weeks blind | partly |\n\n**Sacrifice:** polish, for now.\n**Kill-criterion:** no measurable signal in 14 days → stop and rethink.`,
    tutor: `**Objective:** anyone on the team can rerun _${q}_ without you in the room.\n\n1. **Model:** goal → owner → check.\n2. **Worked example:** "Ship the draft (goal) — Wren (owner) — a reader can state the ask in one line (check)."\n3. **Drill (5 min):** write the check for your next step in one sentence.\n\n**Common miss:** describing effort ("worked on it") instead of the result.`,
  };
  const idr: Record<PersonaId, string> = {
    operator: "",
    researcher: `**Inti masalah:** apa yang harus benar agar _${q}_ berhasil — dan apa yang membuktikannya salah.\n\n- **Diketahui:** hasilnya sudah disebut; audiensnya tersirat, belum tertulis.\n- **Diasumsikan:** pembaca pertama sibuk dan hanya membaca dua baris.\n- **Belum diketahui:** batasan mana yang benar-benar mengikat — waktu, biaya, atau persetujuan orang lain.\n\n**Yang bisa mengubah keputusan:** satu contoh tandingan nyata dari percobaan sebelumnya. Cari itu dulu sebelum membangun.`,
    coder: `**Jalur lengkap terkecil** — satu daftar, satu pemilik per langkah, satu cek.\n\n\`\`\`ts\ntype Step = { id: string; owner: string; done: boolean };\n\n/** Langkah terbuka berikutnya, atau null bila job selesai. */\nexport function nextStep(steps: Step[]): Step | null {\n  return steps.find((s) => !s.done) ?? null;\n}\n\`\`\`\n\n- **Invarian:** setiap langkah punya tepat satu pemilik.\n- **Tes:** daftar kosong → \`null\`; semua selesai → \`null\`.\n- **Belum dibangun:** penjadwalan, pengingat — tambahkan saat ada kegagalan nyata yang menuntutnya.`,
    writer: `**Draf** — versi yang selesai dibaca orang sibuk.\n\n> **Apa yang berubah:** satu kalimat, konkret, dengan tanggal.\n>\n> **Kenapa penting buatmu:** satu kalimat tentang pembaca, bukan tentang kita.\n>\n> **Yang perlu dilakukan:** satu permintaan, dan di mana melakukannya.\n\n- **Dipotong:** kata sifat yang tidak membawa fakta.\n- **Dipertahankan:** kata kerja, tanggal, permintaan.\n- **Panjang:** di bawah 90 kata, satu tautan.`,
    strategist: `**Keputusan:** kerjakan versi yang bisa dibatalkan dulu.\n\n| Opsi | Untung | Biaya | Bisa dibalik |\n|---|---|---|---|\n| Ramping — rilis minggu ini | sinyal nyata dalam hitungan hari | kasar di pinggir | ya |\n| Lengkap — bangun semua | rapi | dua minggu tanpa data | sebagian |\n\n**Pengorbanan:** kerapian, untuk sekarang.\n**Kriteria berhenti:** 14 hari tanpa sinyal terukur → berhenti dan pikir ulang.`,
    tutor: `**Tujuan:** siapa pun di tim bisa mengulang _${q}_ tanpa kamu di ruangan.\n\n1. **Model:** tujuan → pemilik → cek.\n2. **Contoh:** "Kirim draf (tujuan) — Wren (pemilik) — pembaca bisa menyebut permintaannya dalam satu baris (cek)."\n3. **Latihan (5 menit):** tulis cek untuk langkah berikutmu dalam satu kalimat.\n\n**Kesalahan umum:** menggambarkan usaha ("sudah dikerjakan") alih-alih hasilnya.`,
  };
  return (id ? idr : en)[bot];
}

function demoFinal(input: TeamInput, steps: TeamStep[], id: boolean): string {
  const q = snippet(input.job, 80);
  const line: Record<PersonaId, [string, string]> = {
    operator: ["", ""],
    researcher: [
      "**Crux** · Iris — the binding constraint isn't stated yet; confirm it before spending.",
      "**Inti** · Iris — batasan yang mengikat belum tertulis; pastikan dulu sebelum keluar biaya.",
    ],
    coder: [
      "**Build** · Kai — one `nextStep()` over owned steps, tested on the empty case.",
      "**Build** · Kai — satu `nextStep()` atas langkah yang punya pemilik, dites untuk kasus kosong.",
    ],
    writer: [
      "**Copy** · Wren — three lines: what changes, why it matters, the single ask.",
      "**Teks** · Wren — tiga baris: apa yang berubah, kenapa penting, satu permintaan.",
    ],
    strategist: [
      "**Call** · Sol — lean beats full; sacrifice polish; stop if there's no signal in 14 days.",
      "**Keputusan** · Sol — ramping mengalahkan lengkap; korbankan kerapian; berhenti bila 14 hari tanpa sinyal.",
    ],
    tutor: [
      "**Handover** · Theo — goal → owner → check, so anyone can rerun it.",
      "**Serah terima** · Theo — tujuan → pemilik → cek, supaya siapa pun bisa mengulang.",
    ],
  };
  const credit: Record<PersonaId, [string, string]> = {
    operator: ["", ""],
    researcher: ["crux", "inti"],
    coder: ["build", "build"],
    writer: ["copy", "teks"],
    strategist: ["call", "keputusan"],
    tutor: ["handover", "serah terima"],
  };
  const k = id ? 1 : 0;
  const bullets = steps.map((s) => line[s.bot][k]).filter(Boolean);
  const team = steps.map((s) => `${NAME.get(s.bot)} — ${credit[s.bot][k]}`).join("; ");
  const approval = needsApproval(input.job, steps)
    ? `\n\n${id ? "**Perlu persetujuan:**" : "**Needs approval:**"} ${approvalTemplate(input.job, id)}`
    : "";
  return id
    ? `**Hasil — ${q}**\n\n**Jawaban:** jalankan versi ramping yang bisa dibatalkan minggu ini; ukur satu angka; putuskan di hari ke-14.\n\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n**Berikutnya:** satu aksi, satu pemilik, hari ini.${approval}\n\n_Tim: ${team}._\n\n---\n_Mode demo — hubungkan key di Engine untuk live._`
    : `**Deliverable — ${q}**\n\n**Answer:** run the lean, reversible version this week; measure one number; decide on day 14.\n\n${bullets.map((b) => `- ${b}`).join("\n")}\n\n**Next:** one action, one owner, today.${approval}\n\n_Team: ${team}._\n\n---\n_Demo mode — connect a key under Engine to go live._`;
}
