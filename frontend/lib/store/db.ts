import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attachment } from "@/lib/types";

export interface CachedNote {
  id: number;
  title: string;
  content: string | null;
  preview: string;
  attachmentCount: number;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  full: boolean;
}

interface NotepadDB extends DBSchema {
  notes: {
    key: number;
    value: CachedNote;
  };
  meta: {
    key: string;
    value: unknown;
  };
}

const DB_NAME = "notepad";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<NotepadDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NotepadDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste ambiente"));
  }

  if (!dbPromise) {
    dbPromise = openDB<NotepadDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("notes", { keyPath: "id" });
        db.createObjectStore("meta");
      },
    });
  }

  return dbPromise;
}
