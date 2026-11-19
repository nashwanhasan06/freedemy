/**
 * The SQLite connection: one embedded `freedemy.db` per install, opened lazily
 * on first query, WAL mode on, foreign keys enforced, and `schema.sqlite.sql`
 * applied idempotently at open so first boot needs no setup step.
 *
 * No `server-only` import here — this module is deliberately plain Node so it
 * can be exercised by a standalone test script. The cookie-bound entry point
 * (`lib/storage/server.ts`) carries that marker.
 */

import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** Tables whose primary key is `id`: the builder fills a uuid when omitted. */
export const UUID_ID_TABLES = new Set([
  "users",
  "courses",
  "course_videos",
  "modules",
  "lessons",
  "exercises",
  "submissions",
  "course_projects",
  "project_submissions",
  "tutor_messages",
]);

/** Columns stored as JSON text but handed to the app as parsed values. */
export const JSON_COLUMNS: Record<string, Set<string>> = {
  lessons: new Set(["key_terms", "notes"]),
  exercises: new Set(["options", "keywords"]),
  submissions: new Set(["answer", "errors"]),
  course_projects: new Set(["requirements"]),
  project_submissions: new Set(["checks", "errors"]),
  chapter_quizzes: new Set(["questions"]),
};

/** Columns stored as 0/1 but handed back as real booleans. */
export const BOOLEAN_COLUMNS: Record<string, Set<string>> = {
  courses: new Set(["rigorous"]),
  submissions: new Set(["passed"]),
  lesson_progress: new Set(["completed"]),
  project_submissions: new Set(["passed"]),
  chapter_quizzes: new Set(["passed"]),
};

/** Tables whose `updated_at` is refreshed by the builder on update/upsert. */
export const TOUCHES_UPDATED_AT = new Set([
  "courses",
  "lesson_progress",
  "tutor_summaries",
  "chapter_quizzes",
  "user_settings",
]);

export type TableMeta = {
  name: string;
  columns: Set<string>;
  /** Single primary-key column named `id`, when the table has one. */
  idPk: boolean;
  /** Composite/other primary key columns (for upsert conflict defaults). */
  pkColumns: string[];
};

export type StorageError = { message: string; code?: string; details?: string };

const DB_PATH = () =>
  process.env.FREEDEMY_DB_PATH?.trim() || path.join(process.cwd(), "data", "freedemy.db");

const SCHEMA_PATH = () => path.join(process.cwd(), "schema.sqlite.sql");

type GlobalStore = { __freedemyDb?: Database.Database; __freedemyMeta?: Map<string, TableMeta> };

const globalStore = globalThis as unknown as GlobalStore;

/**
 * Columns added after a table first shipped. `create table if not exists`
 * never alters an existing table, so every new column needs a guarded ALTER
 * here — this is what upgrades an existing `data/freedemy.db` in place.
 */
const COLUMN_MIGRATIONS: { table: string; column: string; ddl: string }[] = [
  { table: "user_settings", column: "base_url", ddl: "alter table user_settings add column base_url text" },
];

function applySchema(db: Database.Database): void {
  let sql: string;
  try {
    sql = readFileSync(SCHEMA_PATH(), "utf8");
  } catch (error) {
    throw new Error(
      `Could not read schema.sqlite.sql at ${SCHEMA_PATH()} (${error instanceof Error ? error.message : String(error)}). Run the app from the project root.`,
    );
  }
  db.exec(sql);

  for (const { table, column, ddl } of COLUMN_MIGRATIONS) {
    const info = db.prepare(`pragma table_info(${JSON.stringify(table)})`).all() as { name: string }[];
    if (!info.some((existing) => existing.name === column)) db.exec(ddl);
  }
}

function readMeta(db: Database.Database): Map<string, TableMeta> {
  const meta = new Map<string, TableMeta>();
  const tables = db
    .prepare("select name from sqlite_master where type = 'table' and name not like 'sqlite_%'")
    .all() as { name: string }[];

  for (const { name } of tables) {
    const info = db.prepare(`pragma table_info(${JSON.stringify(name)})`).all() as {
      name: string;
      pk: number;
      type: string;
    }[];
    const pkColumns = info
      .filter((column) => column.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map((column) => column.name);
    const idColumn = info.find((column) => column.pk > 0);
    meta.set(name, {
      name,
      columns: new Set(info.map((column) => column.name)),
      // A uuid is only generated for `id text primary key`. `id integer
      // primary key` (ai_usage) is a rowid alias — SQLite must assign it.
      idPk:
        pkColumns.length === 1 &&
        pkColumns[0] === "id" &&
        (idColumn?.type ?? "").toUpperCase() !== "INTEGER",
      pkColumns,
    });
  }
  return meta;
}

/** Opens (and migrates) the database once per process; reused across hot reloads. */
export function getDb(): Database.Database {
  if (globalStore.__freedemyDb) return globalStore.__freedemyDb;

  const file = DB_PATH();
  mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  applySchema(db);

  globalStore.__freedemyDb = db;
  globalStore.__freedemyMeta = readMeta(db);
  return db;
}

export function getTableMeta(table: string): TableMeta | null {
  getDb();
  return globalStore.__freedemyMeta?.get(table) ?? null;
}

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Maps SQLite constraint failures onto the PostgREST codes call sites check. */
export function toStorageError(error: unknown): StorageError {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed") || message.includes("PRIMARY KEY constraint failed")) {
    return { message, code: "23505" };
  }
  if (message.includes("FOREIGN KEY constraint failed")) {
    return { message, code: "23503" };
  }
  if (message.includes("CHECK constraint failed")) {
    return { message, code: "23514" };
  }
  return { message };
}
