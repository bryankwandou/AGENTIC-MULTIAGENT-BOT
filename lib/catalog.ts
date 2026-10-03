export type PersonaId =
  | "operator"
  | "researcher"
  | "coder"
  | "writer"
  | "strategist"
  | "tutor";

export type ViewId = "chat" | "floor" | "studio" | "vault" | "playbooks";

export type CompileMode = "lite" | "core" | "full";

export type LanguagePin = "auto" | "id" | "en";

export type ModuleGroup = "constitution" | "mind" | "craft" | "library";

export type ModuleDef = {
  id: string;
  headingPrefix: string;
  label: string;
  group: ModuleGroup;
  locked?: boolean;
  hint: string;
};

export const PERSONAS: {
  id: PersonaId;
  /** The bot's own name — each persona is a named teammate on the floor. */
  bot: string;
  /** Signature color (clothing on the floor, accents in the team view). */
  color: string;
  name: string;
  nameId: string;
  blurb: string;
  modules: string[];
}[] = [
  {
    id: "operator",
    bot: "Atlas",
    color: "#d6d3c8",
    name: "Operator",
    nameId: "Operator",
    blurb: "General mind. Closes loops. Dry, useful.",
    modules: ["SWE", "DEC", "PLN"],
  },
  {
    id: "researcher",
    bot: "Iris",
    color: "#7fa3bd",
    name: "Researcher",
    nameId: "Peneliti",
    blurb: "Crux, ranks, what would change its mind.",
    modules: ["RSH", "ANL", "SCI", "DAT"],
  },
  {
    id: "coder",
    bot: "Kai",
    color: "#6f8f6a",
    name: "Coder",
    nameId: "Koder",
    blurb: "Diffs, invariants, complete code.",
    modules: ["SWE", "DBG", "REV", "SEC"],
  },
  {
    id: "writer",
    bot: "Wren",
    color: "#b8735f",
    name: "Writer",
    nameId: "Penulis",
    blurb: "Reader's pulse. Cuts ornament.",
    modules: ["WRI", "CRV", "BIL"],
  },
  {
    id: "strategist",
    bot: "Sol",
    color: "#5b6b8c",
    name: "Strategist",
    nameId: "Strateg",
    blurb: "Bets, tradeoffs, kill-criteria.",
    modules: ["DEC", "PLN", "PRD", "BIZ"],
  },
  {
    id: "tutor",
    bot: "Theo",
    color: "#c4a574",
    name: "Tutor",
    nameId: "Tutor",
    blurb: "Objective, example, drill.",
    modules: ["EDU", "WRI", "EX"],
  },
];

export const MODULES: ModuleDef[] = [
  { id: "IDN", headingPrefix: "01.", label: "Identity", group: "constitution", locked: true, hint: "Who AXIOM is" },
  { id: "DIR", headingPrefix: "02.", label: "Directives", group: "constitution", locked: true, hint: "Ordered laws of work" },
  { id: "CON", headingPrefix: "03.", label: "Constitution", group: "constitution", locked: true, hint: "Safety, locked" },
  { id: "TRU", headingPrefix: "04.", label: "Truth engine", group: "mind", hint: "Ranks of knowledge" },
  { id: "REA", headingPrefix: "05.", label: "Reasoning OS", group: "mind", hint: "Methods M1–M20" },
  { id: "COM", headingPrefix: "06.", label: "Communication", group: "mind", hint: "Voice and length" },
  { id: "LNG", headingPrefix: "07.", label: "Language", group: "mind", hint: "ID / EN protocol" },
  { id: "QST", headingPrefix: "08.", label: "Questioning", group: "mind", hint: "Ask once or assume" },
  { id: "UNC", headingPrefix: "09.", label: "Uncertainty", group: "mind", hint: "Calibration" },
  { id: "WS", headingPrefix: "10.", label: "Workstation", group: "mind", hint: "Runtime honesty" },
  { id: "MEM", headingPrefix: "11.", label: "Memory", group: "mind", hint: "Vault rules" },
  { id: "TOOL", headingPrefix: "12.", label: "Tool honesty", group: "mind", hint: "No fake logs" },
  { id: "SWE", headingPrefix: "13.", label: "Engineering", group: "craft", hint: "Software" },
  { id: "DBG", headingPrefix: "14.", label: "Debugging", group: "craft", hint: "Expected vs actual" },
  { id: "REV", headingPrefix: "15.", label: "Review", group: "craft", hint: "Verdict first" },
  { id: "RSH", headingPrefix: "16.", label: "Research", group: "craft", hint: "Crux and ranks" },
  { id: "WRI", headingPrefix: "17.", label: "Writing", group: "craft", hint: "Prose systems" },
  { id: "ANL", headingPrefix: "18.", label: "Analysis", group: "craft", hint: "Structure a pile" },
  { id: "DEC", headingPrefix: "19.", label: "Decision", group: "craft", hint: "Pick and sacrifice" },
  { id: "PLN", headingPrefix: "20.", label: "Planning", group: "craft", hint: "Now / next / later" },
  { id: "PRD", headingPrefix: "21.", label: "Product", group: "craft", hint: "Job to be done" },
  { id: "DSN", headingPrefix: "22.", label: "Business", group: "craft", hint: "Strategy and bets" },
  { id: "EDU", headingPrefix: "23.", label: "Education", group: "craft", hint: "Teach a move" },
  { id: "SCI", headingPrefix: "24.", label: "Science", group: "craft", hint: "Units and models" },
  { id: "DAT", headingPrefix: "25.", label: "Data", group: "craft", hint: "Charts for decisions" },
  { id: "SEC", headingPrefix: "26.", label: "Security", group: "craft", hint: "Defense only" },
  { id: "CRV", headingPrefix: "27.", label: "Creative", group: "craft", hint: "Constraint first" },
  { id: "PRM", headingPrefix: "28.", label: "Promptcraft", group: "craft", hint: "Prompts as programs" },
  { id: "SCH", headingPrefix: "29.", label: "Schemas", group: "craft", hint: "Output shapes" },
  { id: "PER", headingPrefix: "30.", label: "Personas", group: "mind", hint: "Overlays" },
  { id: "SLH", headingPrefix: "31.", label: "Slash catalog", group: "library", hint: "Commands" },
  { id: "PBK", headingPrefix: "32.", label: "Playbooks", group: "library", hint: "Procedures" },
  { id: "TPL", headingPrefix: "33.", label: "Templates", group: "library", hint: "Artifact fills" },
  { id: "DOM", headingPrefix: "34.", label: "Domains", group: "library", hint: "Domain modules" },
  { id: "AP", headingPrefix: "35.", label: "Anti-patterns", group: "library", hint: "Failure tells" },
  { id: "FAIL", headingPrefix: "36.", label: "Failure modes", group: "library", hint: "Miss catalog" },
  { id: "EVL", headingPrefix: "37.", label: "Evaluation", group: "library", hint: "Golden tasks" },
  { id: "RIT", headingPrefix: "38.", label: "Rituals", group: "library", hint: "Session hygiene" },
  { id: "MAX", headingPrefix: "39.", label: "Maxims", group: "library", hint: "Compressed laws" },
  { id: "EX", headingPrefix: "40.", label: "Examples", group: "library", hint: "Good vs bad" },
  { id: "BIL", headingPrefix: "41.", label: "Bilingual", group: "craft", hint: "ID/EN register" },
  { id: "OPS", headingPrefix: "42.", label: "Operator manual", group: "library", hint: "How to steer" },
  { id: "CPL", headingPrefix: "43.", label: "Compiler", group: "library", hint: "Kernel recipe" },
];

export const CORE_MODULE_IDS = MODULES.filter(
  (m) => m.group === "constitution" || m.group === "mind",
).map((m) => m.id);

export const LITE_MODULE_IDS = ["IDN", "DIR", "CON", "COM", "LNG", "WS", "TOOL", "PER"];

export const SLASH_COMMANDS: { cmd: string; hint: string; hintId: string }[] = [
  { cmd: "/brief", hint: "Messy ask → spec", hintId: "Ubah permintaan jadi spek" },
  { cmd: "/plan", hint: "Sequence, don't build", hintId: "Urutkan, jangan bangun" },
  { cmd: "/build", hint: "Smallest complete path", hintId: "Jalur lengkap terkecil" },
  { cmd: "/review", hint: "Verdict first", hintId: "Vonis dulu" },
  { cmd: "/debug", hint: "Expected vs actual", hintId: "Harapan vs kenyataan" },
  { cmd: "/research", hint: "Crux and unknowns", hintId: "Kru dan yang tak diketahui" },
  { cmd: "/steelman", hint: "Strongest opposing view", hintId: "Pandangan lawan terkuat" },
  { cmd: "/decide", hint: "Options, pick, sacrifice", hintId: "Opsi, pilih, pengorbanan" },
  { cmd: "/teach", hint: "Objective, example, drill", hintId: "Tujuan, contoh, latihan" },
  { cmd: "/rewrite", hint: "Same meaning, denser", hintId: "Makna sama, lebih padat" },
  { cmd: "/short", hint: "Cut the last answer", hintId: "Potong jawaban terakhir" },
  { cmd: "/long", hint: "Show the work", hintId: "Tunjukkan kerja" },
  { cmd: "/prompt", hint: "Write a task prompt", hintId: "Tulis prompt tugas" },
  { cmd: "/module", hint: "Draft a megaprompt module", hintId: "Draf modul megaprompt" },
  { cmd: "/id", hint: "Reply in Indonesian", hintId: "Jawab dalam bahasa Indonesia" },
  { cmd: "/en", hint: "Reply in English", hintId: "Jawab dalam bahasa Inggris" },
  { cmd: "/terse", hint: "Payload only", hintId: "Isi saja" },
  { cmd: "/blunt", hint: "Do not sand the verdict", hintId: "Jangan dihaluskan" },
  { cmd: "/save", hint: "Propose a vault note", hintId: "Usulkan catatan vault" },
  { cmd: "/status", hint: "Done, blocked, next", hintId: "Selesai, macet, berikutnya" },
];

export const PLAYBOOKS: {
  id: string;
  title: string;
  titleId: string;
  seed: string;
  seedId: string;
}[] = [
  {
    id: "brief",
    title: "Brief a messy idea",
    titleId: "Rapikan ide acak",
    seed: "/brief I want my own Grok-class workstation with a 5000-line megaprompt that actually steers the model.",
    seedId: "/brief Saya mau stasiun Grok versi sendiri, plus megaprompt 5000 baris yang benar-benar nge-steer model.",
  },
  {
    id: "kernel",
    title: "Compile a kernel",
    titleId: "Kompilasi kernel",
    seed: "/kernel For a weekend coding session on a React app. Which modules stay on?",
    seedId: "/kernel Untuk sesi ngoding React seminggu. Modul mana yang harus nyala?",
  },
  {
    id: "steelman",
    title: "Steelman a plan",
    titleId: "Steelman sebuah rencana",
    seed: "/steelman Plan: inject the entire 5000-line megaprompt on every chat turn.",
    seedId: "/steelman Rencana: inject seluruh megaprompt 5000 baris di setiap giliran chat.",
  },
  {
    id: "teach",
    title: "Learn promptcraft",
    titleId: "Belajar promptcraft",
    seed: "/teach How to write a task prompt that is a program, not a poem. I have 20 minutes.",
    seedId: "/teach Cara menulis task prompt yang seperti program, bukan puisi. Waktu saya 20 menit.",
  },
  {
    id: "decide",
    title: "Make a call",
    titleId: "Ambil keputusan",
    seed: "/decide Should this personal workstation store chats in localStorage or a database? Solo operator, browser only.",
    seedId: "/decide Stasiun personal ini: simpan chat di localStorage atau database? Operator solo, browser saja.",
  },
  {
    id: "rewrite",
    title: "Cut the fog",
    titleId: "Potong kabut",
    seed: "/rewrite Unleash your potential with a next-generation AI-powered seamless holistic productivity solution.",
    seedId: "/rewrite Unleash your potential with a next-generation AI-powered seamless holistic productivity solution.",
  },
  {
    id: "module",
    title: "Draft a module",
    titleId: "Draf modul",
    seed: "/module Interviewing backend engineers. House style. Testable rules, anti-patterns, one example of firing and one of refusing to overfire.",
    seedId: "/module Wawancara insinyur backend. Gaya AXIOM. Aturan yang bisa dites, anti-pola, satu contoh nyala dan satu contoh menahan diri.",
  },
  {
    id: "debug",
    title: "Debug a hydration miss",
    titleId: "Debug hydration",
    seed: "/debug Hydration failed because the initial UI does not match what was rendered on the server. Chat timestamps look wrong after refresh.",
    seedId: "/debug Hydration failed because the initial UI does not match what was rendered on the server. Timestamp chat aneh setelah refresh.",
  },
];

export const DEFAULT_ADDENDUM = `OPERATOR ADDENDUM
- Default language follows the operator. Pin overrides.
- This is a personal workstation. Prefer artifacts over atmosphere.
- When the operator writes in Indonesian, reply in adult Indonesian.`;
