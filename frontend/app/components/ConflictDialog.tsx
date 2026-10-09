"use client";

import { htmlToText } from "@/lib/store/notesStore";
import type { ConflictRecord } from "@/lib/store/db";
import type { ConflictChoice } from "@/lib/store/notesRepository";

interface ConflictDialogProps {
  conflict: ConflictRecord;
  total: number;
  busy: boolean;
  onResolve: (choice: ConflictChoice) => void;
}

function preview(html: string): string {
  const text = htmlToText(html);
  if (!text) return "(vazio)";
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

export default function ConflictDialog({
  conflict,
  total,
  busy,
  onResolve,
}: ConflictDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl">
        <h2 className="text-base font-semibold">Conflito de sincronização</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Esta anotação foi alterada no servidor enquanto você a editava offline.
          {total > 1 ? ` Há mais ${total - 1} conflito(s) na fila.` : ""}
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <section className="rounded-md border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Sua versão
            </h3>
            <p className="mt-1 truncate text-sm font-medium">
              {conflict.localTitle || "Sem título"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {preview(conflict.localContent)}
            </p>
          </section>
          <section className="rounded-md border border-border p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Versão do servidor
            </h3>
            <p className="mt-1 truncate text-sm font-medium">
              {conflict.serverTitle || "Sem título"}
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {preview(conflict.serverContent)}
            </p>
          </section>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("server")}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Usar a do servidor
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("both")}
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            Manter ambas
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onResolve("local")}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >
            Manter minha versão
          </button>
        </div>
      </div>
    </div>
  );
}
