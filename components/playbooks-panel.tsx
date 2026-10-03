"use client";

import { PLAYBOOKS } from "@/lib/catalog";
import { useStation } from "@/lib/store";

export function PlaybooksPanel() {
  const language = useStation((s) => s.language);
  const setView = useStation((s) => s.setView);
  const newChat = useStation((s) => s.newChat);
  const setPendingDraft = useStation((s) => s.setPendingDraft);
  const idUi = language !== "en";

  function run(seed: string) {
    newChat();
    setPendingDraft(seed);
    setView("chat");
  }

  return (
    <div className="mx-auto h-full max-w-3xl overflow-y-auto px-4 py-8">
      <p className="eyebrow">{PLAYBOOKS.length} {idUi ? "pintasan · 40 prosedur di megaprompt" : "shortcuts · 40 procedures in the megaprompt"}</p>
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
        {idUi ? "Playbook" : "Playbooks"}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
        {idUi
          ? "Pintasan ke prosedur di megaprompt. Memilih salah satu membuka sesi baru dengan seed. Kirim sendiri."
          : "Shortcuts into megaprompt procedures. Picking one opens a new session with a seed. You send it."}
      </p>
      <div className="mt-6 grid gap-2 sm:grid-cols-2">
        {PLAYBOOKS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => run(idUi ? p.seedId : p.seed)}
            className="group rounded-xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong hover:bg-elevated/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] text-signal">{p.seed.split(" ")[0]}</span>
              <span className="text-xs text-subtle transition-transform group-hover:translate-x-0.5">→</span>
            </div>
            <p className="mt-2 font-display text-xl font-semibold tracking-tight">{idUi ? p.titleId : p.title}</p>
            <p className="mt-2 font-mono text-[11px] leading-relaxed text-muted">{idUi ? p.seedId : p.seed}</p>
          </button>
        ))}
      </div>
      <p className="mt-8 text-xs text-subtle">
        {idUi
          ? "Tidak ada panggilan model sampai kamu menekan kirim."
          : "Nothing is sent until you press send — model calls stay user-initiated."}
      </p>
    </div>
  );
}
