"use client";

import type { NoteSummary } from "@/lib/types";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { PaperclipIcon, PlusIcon, SearchIcon } from "./Icons";
import ThemeToggle from "./ThemeToggle";

export interface NoteListProps {
  notes: NoteSummary[];
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: number) => void;
  onCreate: () => void;
  activeId: number | null;
  loading: boolean;
}

export default function NoteList({
  notes,
  query,
  onQueryChange,
  onSelect,
  onCreate,
  activeId,
  loading,
}: NoteListProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 p-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Buscar por título ou conteúdo"
            className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-2 text-sm outline-none transition focus:border-foreground/30"
          />
        </div>
        <ThemeToggle />
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="mx-3 mb-2 flex items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
      >
        <PlusIcon />
        Nova anotação
      </button>

      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading && notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            Carregando…
          </p>
        ) : notes.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {query ? "Nenhuma nota encontrada." : "Nenhuma nota ainda. Crie a primeira."}
          </p>
        ) : (
          notes.map((note) => {
            const isActive = note.id === activeId;
            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelect(note.id)}
                className={cn(
                  "mb-1 w-full rounded-lg border px-3 py-2 text-left transition",
                  isActive
                    ? "border-foreground/20 bg-muted"
                    : "border-transparent hover:bg-muted",
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {note.title.trim() || "Sem título"}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {formatRelative(note.updatedAt)}
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                  {note.preview.trim() || "Sem conteúdo"}
                </p>
                {note.attachmentCount > 0 && (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                    <PaperclipIcon width={12} height={12} />
                    {note.attachmentCount}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
