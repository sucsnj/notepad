import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const databaseFile = path.resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  process.env.DATABASE_PATH ?? path.join("data", "notepad.db"),
);

export const uploadDir = path.resolve(
  /* turbopackIgnore: true */
  process.cwd(),
  process.env.UPLOAD_DIR ?? path.join("public", "uploads"),
);

export const maxUploadBytes =
  Number(process.env.MAX_UPLOAD_SIZE_MB ?? 20) * 1024 * 1024;

declare global {
  var __notepadDb: DatabaseSync | undefined;
}

function createDatabase(): DatabaseSync {
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const database = new DatabaseSync(databaseFile);
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      text_content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      web_path TEXT NOT NULL,
      size INTEGER NOT NULL DEFAULT 0,
      kind TEXT NOT NULL DEFAULT 'file',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_files_note_id ON files(note_id);
  `);

  return database;
}

export function getDb(): DatabaseSync {
  if (!globalThis.__notepadDb) {
    globalThis.__notepadDb = createDatabase();
  }
  return globalThis.__notepadDb;
}