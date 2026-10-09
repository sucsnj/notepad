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

export type OutboxKind = "create" | "update" | "delete";

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  noteId: number;
  title?: string;
  content?: string;
  createdAt: string;
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
  outbox: {
    key: string;
    value: OutboxOp;
  };
}

const DB_NAME = "notepad";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<NotepadDB>> | null = null;

export function getDB(): Promise<IDBPDatabase<NotepadDB>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB indisponível neste ambiente"));
  }

  if (!dbPromise) {
    dbPromise = openDB<NotepadDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("notes")) {
          db.createObjectStore("notes", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id" });
        }
      },
    });
  }

  return dbPromise;
}
