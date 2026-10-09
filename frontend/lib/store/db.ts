import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Attachment, AttachmentKind } from "@/lib/types";

export interface CachedNote {
  id: number;
  title: string;
  content: string | null;
  preview: string;
  attachmentCount: number;
  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;
  // Última versão conhecida vinda do servidor (base para detectar conflitos).
  serverUpdatedAt: string | null;
  full: boolean;
}

export type OutboxKind =
  | "create"
  | "update"
  | "delete"
  | "upload"
  | "detach";

export interface OutboxOp {
  id: string;
  kind: OutboxKind;
  noteId: number;
  title?: string;
  content?: string;
  // Anexos (upload/detach): id local do anexo ou id no servidor.
  attachmentId?: number;
  filename?: string;
  mimeType?: string;
  size?: number;
  createdAt: string;
}

// Arquivo anexado enquanto offline, guardado no IndexedDB até o upload.
export interface StoredBlob {
  id: number;
  noteId: number;
  filename: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  createdAt: string;
  blob: Blob;
}

export interface ConflictRecord {
  noteId: number;
  localTitle: string;
  localContent: string;
  serverTitle: string;
  serverContent: string;
  localUpdatedAt: string;
  serverUpdatedAt: string;
  detectedAt: string;
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
  conflicts: {
    key: number;
    value: ConflictRecord;
  };
  blobs: {
    key: number;
    value: StoredBlob;
  };
}

const DB_NAME = "notepad";
const DB_VERSION = 4;

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
        if (!db.objectStoreNames.contains("conflicts")) {
          db.createObjectStore("conflicts", { keyPath: "noteId" });
        }
        if (!db.objectStoreNames.contains("blobs")) {
          db.createObjectStore("blobs", { keyPath: "id" });
        }
      },
    });
  }

  return dbPromise;
}
