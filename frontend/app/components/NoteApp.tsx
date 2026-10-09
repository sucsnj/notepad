"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteSummary, SaveStatus } from "@/lib/types";
import { cacheSummaries, listCachedSummaries } from "@/lib/store/notesStore";
import {
  createNote as createNoteRecord,
  getNote as getNoteRecord,
  markPending,
  mergeSummaries,
  pendingNoteIdSet,
  removeNote as removeNoteRecord,
  resolveConflict,
  saveNote,
  type ConflictChoice,
} from "@/lib/store/notesRepository";
import { flushOutbox } from "@/lib/store/sync";
import { listConflicts } from "@/lib/store/conflicts";
import type { ConflictRecord } from "@/lib/store/db";
import { cn } from "@/lib/cn";
import NoteList from "./NoteList";
import NoteEditor, { type EditorChange } from "./NoteEditor";
import ConflictDialog from "./ConflictDialog";
import { NoteIcon } from "./Icons";

type MobileView = "list" | "editor";

const AUTO_SAVE_DELAY = 800;

export default function NoteApp() {
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [query, setQuery] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [activeNote, setActiveNote] = useState<Note | null>(null);
  const [loadingNote, setLoadingNote] = useState(false);
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<MobileView>("list");
  const [offline, setOffline] = useState(false);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [resolving, setResolving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const draftRef = useRef<EditorChange | null>(null);
  const lastSavedRef = useRef("");
  const activeIdRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 5000);
  }, []);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const fetchNotes = useCallback(
    async (search: string) => {
      let cached: NoteSummary[] = [];
      try {
        cached = await listCachedSummaries(search);
      } catch {
        // sem cache; segue direto para a rede
      }
      if (cached.length) setNotes(await markPending(cached));

      try {
        const response = await fetch(
          `/api/notes${search ? `?q=${encodeURIComponent(search)}` : ""}`,
          { cache: "no-store" },
        );
        if (!response.ok) throw new Error("Não foi possível carregar as anotações");
        const data = (await response.json()) as { notes: NoteSummary[] };

        const pendingIds = await pendingNoteIdSet();
        void cacheSummaries(
          data.notes.filter((item) => !pendingIds.has(item.id)),
        );

        const cachedMap = new Map(cached.map((item) => [item.id, item]));
        const remoteChanged = data.notes.filter((item) => {
          if (pendingIds.has(item.id)) return false;
          const local = cachedMap.get(item.id);
          return (
            !!local?.serverUpdatedAt && local.serverUpdatedAt !== item.updatedAt
          );
        }).length;
        if (remoteChanged > 0) {
          showNotice(`${remoteChanged} anotação(ões) atualizada(s) no servidor`);
        }

        setNotes(await mergeSummaries(data.notes, cached));
        setError(null);
        setOffline(false);
      } catch {
        setOffline(true);
        setNotes(await markPending(cached));
      } finally {
        setLoadingList(false);
      }
    },
    [showNotice],
  );

  const syncNow = useCallback(async () => {
    try {
      const result = await flushOutbox();
      const currentId = activeIdRef.current;
      if (currentId !== null && result.reconciled.has(currentId)) {
        const realId = result.reconciled.get(currentId) as number;
        setActiveId(realId);
        activeIdRef.current = realId;
      }
    } catch {
      // ignora; os gatilhos tentam de novo
    }
    setConflicts(await listConflicts());
    void fetchNotes(queryRef.current);
  }, [fetchNotes]);

  const applyNote = useCallback((note: Note) => {
    setActiveNote(note);
    draftRef.current = {
      title: note.title,
      content: note.content,
      textContent: "",
    };
    lastSavedRef.current = JSON.stringify({
      title: note.title,
      content: note.content,
    });
    setStatus("idle");
  }, []);

  const handleResolve = useCallback(
    async (choice: ConflictChoice) => {
      const current = conflicts[0];
      if (!current) return;
      setResolving(true);
      let ok = false;
      try {
        ok = await resolveConflict(current.noteId, choice);
      } catch {
        ok = false;
      }
      if (!ok) {
        setError("Não foi possível resolver agora — verifique a conexão");
      } else if (activeIdRef.current === current.noteId) {
        try {
          const reloaded = await getNoteRecord(current.noteId);
          if (reloaded) applyNote(reloaded.note);
        } catch {
          // mantém o conteúdo atual; a lista já foi recarregada
        }
      }
      setResolving(false);
      setConflicts(await listConflicts());
      void fetchNotes(queryRef.current);
    },
    [applyNote, conflicts, fetchNotes],
  );

  useEffect(() => {
    const handle = setTimeout(
      () => {
        void fetchNotes(query);
      },
      query ? 250 : 0,
    );

    return () => clearTimeout(handle);
  }, [query, fetchNotes]);

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const id = activeIdRef.current;
    const draft = draftRef.current;
    if (id === null || !draft) return;

    const snapshot = JSON.stringify({ title: draft.title, content: draft.content });
    if (snapshot === lastSavedRef.current) {
      setStatus((current) => (current === "pending" ? "saved" : current));
      return;
    }

    setStatus("saving");
    try {
      const outcome = await saveNote(id, {
        title: draft.title,
        content: draft.content,
      });
      lastSavedRef.current = snapshot;
      setStatus(outcome.queued ? "queued" : "saved");
      void syncNow();
    } catch {
      setStatus("error");
    }
  }, [syncNow]);

  const openNote = useCallback(
    async (id: number) => {
      await flushSave();

      setActiveId(id);
      activeIdRef.current = id;
      setLoadingNote(true);
      setMobileView("editor");

      try {
        const result = await getNoteRecord(id);
        if (result) {
          applyNote(result.note);
          setError(null);
          setOffline(result.offline);
        } else {
          setOffline(true);
          setError("Sem conexão — esta anotação ainda não está disponível offline");
        }
      } catch {
        setError("Não foi possível abrir a anotação");
      } finally {
        setLoadingNote(false);
      }
    },
    [flushSave, applyNote],
  );

  useEffect(() => {
    const handleOnline = () => {
      void syncNow();
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncNow]);

  useEffect(() => {
    void syncNow();
    const interval = setInterval(() => {
      void syncNow();
    }, 30000);
    const handleFocus = () => {
      void syncNow();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, [syncNow]);

  const handleChange = useCallback(
    (change: EditorChange) => {
      draftRef.current = change;
      setStatus("pending");

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void flushSave();
      }, AUTO_SAVE_DELAY);
    },
    [flushSave],
  );

  const createNote = useCallback(async () => {
    const emptyNote = notes.find(
      (item) =>
        !item.title.trim() && !item.preview.trim() && item.attachmentCount === 0,
    );

    if (emptyNote) {
      void openNote(emptyNote.id);
      return;
    }

    await flushSave();

    try {
      const { note, queued } = await createNoteRecord();

      if (query) {
        setQuery("");
      } else {
        void fetchNotes("");
      }

      setActiveNote(note);
      setActiveId(note.id);
      activeIdRef.current = note.id;
      draftRef.current = { title: "", content: "", textContent: "" };
      lastSavedRef.current = JSON.stringify({ title: "", content: "" });
      setStatus(queued ? "queued" : "idle");
      setMobileView("editor");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao criar");
    }
  }, [notes, openNote, flushSave, query, fetchNotes]);

  const deleteActiveNote = useCallback(async () => {
    const id = activeIdRef.current;
    if (id === null) return;
    if (!window.confirm("Excluir esta anotação? Esta ação não pode ser desfeita.")) {
      return;
    }

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    try {
      await removeNoteRecord(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao excluir");
      return;
    }

    draftRef.current = null;
    lastSavedRef.current = "";
    setActiveNote(null);
    setActiveId(null);
    activeIdRef.current = null;
    setStatus("idle");
    setMobileView("list");
    void fetchNotes(queryRef.current);
  }, [fetchNotes]);

  const goBackToList = useCallback(() => {
    void flushSave();
    setMobileView("list");
  }, [flushSave]);

  return (
    <div className="relative flex h-dvh w-full overflow-hidden">
      <div
        className={cn(
          "h-full w-full md:flex md:w-80 md:shrink-0",
          mobileView === "editor" ? "hidden" : "block",
        )}
      >
        <NoteList
          notes={notes}
          query={query}
          onQueryChange={setQuery}
          onSelect={openNote}
          onCreate={createNote}
          activeId={activeId}
          loading={loadingList}
          offline={offline}
        />
      </div>

      <main
        className={cn(
          "h-full min-w-0 flex-1",
          mobileView === "list" ? "hidden md:flex md:flex-col" : "flex flex-col",
        )}
      >
        {activeNote ? (
          <NoteEditor
            key={activeNote.id}
            note={activeNote}
            status={status}
            onChange={handleChange}
            onDelete={deleteActiveNote}
            onBack={goBackToList}
          />
        ) : loadingNote ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Carregando…
          </div>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center gap-3 text-muted-foreground md:flex">
            <NoteIcon width={40} height={40} />
            <p className="text-sm">Selecione ou crie uma anotação</p>
          </div>
        )}
      </main>

      {notice && (
        <div className="pointer-events-none fixed inset-x-0 top-3 z-40 flex justify-center px-4">
          <div className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-card-foreground shadow-md">
            {notice}
          </div>
        </div>
      )}

      {error && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center p-2">
          <button
            type="button"
            onClick={() => setError(null)}
            className="pointer-events-auto rounded-lg bg-danger px-3 py-1.5 text-xs text-white shadow-lg"
          >
            {error} · toque para fechar
          </button>
        </div>
      )}

      {conflicts.length > 0 && (
        <ConflictDialog
          conflict={conflicts[0]}
          total={conflicts.length}
          busy={resolving}
          onResolve={handleResolve}
        />
      )}
    </div>
  );
}
