"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useStation } from "@/lib/store";

export function VaultPanel() {
  const language = useStation((s) => s.language);
  const vault = useStation((s) => s.vault);
  const addVault = useStation((s) => s.addVault);
  const removeVault = useStation((s) => s.removeVault);
  const [text, setText] = useState("");
  const idUi = language !== "en";

  return (
    <div className="mx-auto h-full max-w-2xl overflow-y-auto px-4 py-8">
      <p className="eyebrow">{vault.length}/40 {idUi ? "catatan · disuntik tiap giliran" : "notes · injected every turn"}</p>
      <p className="mt-2 font-display text-4xl font-semibold tracking-tight">
        {idUi ? "Vault memori" : "Memory vault"}
      </p>
      <p className="mt-2 text-sm leading-relaxed text-muted text-pretty">
        {idUi
          ? "Catatan di sini disuntik ke kernel setiap giliran. Preferensi, fakta proyek, anti-preferensi. Bukan rahasia produksi."
          : "Notes here are injected into the kernel each turn. Preferences, project facts, anti-preferences. Not production secrets."}
      </p>
      <form
        className="mt-6"
        onSubmit={(e) => {
          e.preventDefault();
          addVault(text);
          setText("");
        }}
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder={idUi ? "Satu fakta yang harus tetap benar…" : "One fact that should stay true…"}
          className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-sm text-fg outline-none placeholder:text-subtle focus:border-line-strong"
        />
        <button
          type="submit"
          className="mt-2 h-11 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          {idUi ? "Simpan ke vault" : "Save to vault"}
        </button>
      </form>
      <ul className="mt-8 space-y-2">
        {vault.length === 0 ? (
          <li className="text-sm text-muted">{idUi ? "Vault kosong." : "Vault is empty."}</li>
        ) : (
          vault.map((n) => (
            <li
              key={n.id}
              className="flex animate-rise items-start gap-3 rounded-xl border border-line bg-surface px-3 py-3"
            >
              <span className="mt-0.5 font-mono text-[10px] text-signal">◆</span>
              <p className="min-w-0 flex-1 text-sm leading-relaxed whitespace-pre-wrap text-fg">{n.text}</p>
              <button
                type="button"
                className="flex size-10 shrink-0 items-center justify-center text-muted"
                onClick={() => removeVault(n.id)}
                aria-label={idUi ? "Hapus" : "Delete"}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
