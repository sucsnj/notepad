"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Note, NoteSummary, SaveStatus } from "@/lib/types";
import { cacheSummaries, listCachedSummaries } from "@/lib/store/notesStore";
import {
  createNote as createNoteRecord,
  getNote as getNoteRecord,
  markPending,
  mergeSummaries,
  removeNote as removeNoteRecord,
  saveNote,
} from "@/lib/store/notesRepository";
import { cn } from "@/lib/cn";
import NoteList from "./NoteList";
import NoteEditor, { type EditorChange } from "./NoteEditor";
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

  const draftRef = useRef<EditorChange | null>(null);
  const lastSavedRef = useRef("");
  const activeIdRef = useRef<number | null>(null);
  const queryRef = useRef(query);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const fetchNotes = useCallback(async (search: string) => {
    let cached: NoteSummary[] = [];
    try {
      cached = await listCachedSummaries(search);
      setNotes(await markPending(cached));
    } catch {
      // cache indisponível; segue para a rede
    }

    if (cached.length === 0) setLoadingList(true);

    try {
      const response = await fetch(`/api/notes?q=${encodeURIComponent(search)}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Não foi possível carregar as anotações");
      const data = (await response.json()) as { notes: NoteSummary[] };
      setNotes(await mergeSummaries(data.notes, cached));
      setError(null);
      setOffline(false);
      void cacheSummaries(data.notes);
    } catch (err) {
      setOffline(true);
      if (cached.length === 0) {
        setError(err instanceof Error ? err.message : "Erro ao carregar");
      }
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      void fetchNotes(query);
    }, query ? 250 : 0);

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
      void fetchNotes(queryRef.current);
    } catch {
      setStatus("error");
    }
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
      void fetchNotes(queryRef.current);
    };
    const handleOffline = () => setOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [fetchNotes]);

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
    </div>
  );
}
