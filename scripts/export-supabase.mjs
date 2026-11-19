#!/usr/bin/env node
/**
 * One-shot migration: Supabase → the embedded SQLite database.
 *
 * Fetches a single student's rows from the Supabase REST API (service-role
 * key) and inserts them into `data/freedemy.db`, preserving the original
 * uuids so every foreign key keeps pointing at the same row. The local
 * `users` row is created here too — Supabase Auth does not exist locally, so
 * the account gets its credentials from the flags below (hashed with the
 * app's own `lib/auth/crypto.ts`, not a reimplementation).
 *
 *   node scripts/export-supabase.mjs --dry-run
 *   MIGRATE_PASSWORD=... MIGRATE_QUESTION=... MIGRATE_ANSWER=... \
 *     node scripts/export-supabase.mjs
 *
 * Requirements in .env.local: NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and
 * SUPABASE_SERVICE_ROLE_KEY. A pre-migration backup is written next to the
 * database (VACUUM INTO) before any insert; rows are INSERT OR IGNORE, so
 * re-running is safe.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DB_PATH = process.env.FREEDEMY_DB_PATH?.trim() || path.join(ROOT, "data", "freedemy.db");
const SCHEMA_PATH = path.join(ROOT, "schema.sqlite.sql");

/** QA account from the hosted days — never migrated. */
const EXCLUDED_PROFILE_IDS = new Set(["68cfe573-a374-4f88-bf01-ee6694635f16"]);

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

// --- environment -----------------------------------------------------------
function loadEnvLocal() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = value;
  }
}
loadEnvLocal();

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

// --- Supabase REST ---------------------------------------------------------
async function rest(table, query = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=*&${query}`;
  const res = await fetch(url, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

/** PostgREST caps a page at 1000 rows — page until short. */
async function fetchAll(table, filter = "") {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const batch = await rest(table, `limit=${pageSize}&offset=${offset}${filter ? `&${filter}` : ""}`);
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

// --- SQLite ----------------------------------------------------------------
const Database = require("better-sqlite3");

function openDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.exec(readFileSync(SCHEMA_PATH, "utf8"));
  return db;
}

function backup(db) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(path.dirname(DB_PATH), `backup-pre-migration-${stamp}.db`);
  // Forward slashes keep this valid SQL on every platform.
  db.exec(`VACUUM INTO '${target.split(path.sep).join("/")}'`);
  return target;
}

function targetColumns(db, table) {
  return new Set(db.pragma(`table_info(${table})`).map((c) => c.name));
}

/** Supabase JSON → SQLite: booleans → 0/1, objects/arrays → JSON text. */
function convert(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return value;
}

function makeInserter(db, table) {
  const cols = targetColumns(db, table);
  let stmt = null;
  let keys = [];
  return (row) => {
    const rowKeys = Object.keys(row).filter((k) => cols.has(k));
    if (!stmt || rowKeys.join(",") !== keys.join(",")) {
      keys = rowKeys;
      const placeholders = keys.map(() => "?").join(", ");
      stmt = db.prepare(`insert or ignore into ${table} (${keys.join(", ")}) values (${placeholders})`);
    }
    stmt.run(...keys.map((k) => convert(row[k])));
  };
}

// --- migration plan --------------------------------------------------------
// Foreign-key order: parents before children.
const PLAN = [
  { table: "courses", filter: (u) => `user_id=eq.${u.id}` },
  { table: "course_videos", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "modules", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "lessons", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "exercises", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "submissions", filter: (u) => `user_id=eq.${u.id}` },
  { table: "lesson_progress", filter: (u) => `user_id=eq.${u.id}` },
  { table: "course_projects", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "project_submissions", filter: (u) => `user_id=eq.${u.id}` },
  { table: "tutor_messages", filter: (u) => `user_id=eq.${u.id}` },
  { table: "tutor_summaries", filter: (u) => `user_id=eq.${u.id}` },
  { table: "chapter_quizzes", filter: (u, c) => `course_id=in.(${c.join(",")})` },
  { table: "ai_usage", filter: (u) => `user_id=eq.${u.id}` },
];

async function main() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (set them in .env.local).");
    process.exitCode = 1; return;
  }

  // --- pick the account to migrate ---------------------------------------
  const profiles = (await fetchAll("profiles")).filter((p) => !EXCLUDED_PROFILE_IDS.has(p.id));
  const wanted = flag("--user");
  let profile;
  if (wanted) {
    profile = profiles.find((p) => p.id === wanted || p.full_name === wanted);
    if (!profile) {
      console.error(`No profile matching "${wanted}". Available: ${profiles.map((p) => p.full_name || p.id).join(", ")}`);
      process.exitCode = 1; return;
    }
  } else if (profiles.length === 1) {
    profile = profiles[0];
  } else {
    console.error(`Pass --user <name-or-id>; candidates: ${profiles.map((p) => p.full_name || p.id).join(", ")}`);
    process.exitCode = 1; return;
  }

  const name = profile.full_name || "Student";
  console.log(`Migrating "${name}" (${profile.id})${DRY_RUN ? " — DRY RUN, nothing will be written" : ""}\n`);

  // --- fetch ---------------------------------------------------------------
  const fetched = [];
  const courses = await fetchAll("courses", `user_id=eq.${profile.id}`);
  fetched.push(["courses", courses]);
  const courseIds = courses.map((c) => c.id);
  for (const step of PLAN.slice(1)) {
    // No courses → the course-scoped filters would be "in.()" (a syntax error).
    const filter = step.filter(profile, courseIds);
    if (filter.includes("in.()")) {
      fetched.push([step.table, []]);
      continue;
    }
    fetched.push([step.table, await fetchAll(step.table, filter)]);
  }

  console.log("Rows fetched from Supabase:");
  for (const [table, rows] of fetched) console.log(`  ${table.padEnd(22)} ${rows.length}`);
  console.log("");

  if (DRY_RUN) {
    console.log("Dry run — no database writes performed.");
    return;
  }

  // --- credentials ---------------------------------------------------------
  const password = process.env.MIGRATE_PASSWORD || flag("--password");
  const question = process.env.MIGRATE_QUESTION || flag("--question");
  const answer = process.env.MIGRATE_ANSWER || flag("--answer");
  if (!password || !question || !answer) {
    console.error(
      "Missing credentials for the local account.\n" +
        "  Set MIGRATE_PASSWORD, MIGRATE_QUESTION, MIGRATE_ANSWER (or --password/--question/--answer).\n" +
        "  They are hashed with lib/auth/crypto.ts and never stored in plain text.",
    );
    process.exitCode = 1; return;
  }
  // The app's own hashing — imported as source (Node strips the types), so a
  // migrated password verifies exactly like one chosen at sign-up.
  const { hashSecret, normalizeAnswer } = await import(
    pathToFileURL(path.join(ROOT, "lib", "auth", "crypto.ts")).href
  );

  // --- write ---------------------------------------------------------------
  const db = openDb();
  const stamp = backup(db);
  console.log(`Backup written: ${path.relative(ROOT, stamp)}\n`);

  const write = db.transaction(() => {
    // The local account: same uuid as the Supabase profile, local credentials.
    const insertUser = makeInserter(db, "users");
    insertUser({
      id: profile.id,
      display_name: name,
      password_hash: hashSecret(password),
      security_question: question,
      security_answer_hash: hashSecret(normalizeAnswer(answer)),
      created_at: profile.created_at,
    });

    let total = 0;
    for (const [table, rows] of fetched) {
      const insert = makeInserter(db, table);
      for (const row of rows) insert(row);
      const landed = db.prepare(`select count(*) as n from ${table}`).get().n;
      total += rows.length;
      console.log(`  ${table.padEnd(22)} ${String(rows.length).padStart(5)} fetched → ${landed} in db`);
    }
    return total;
  });
  const total = write();
  db.close();

  console.log(`\nDone — ${total} rows migrated into ${path.relative(ROOT, DB_PATH)}.`);
  console.log(`Sign in as "${name}" with the password you just provided.`);
}

main().catch((error) => {
  console.error(`\nMigration failed: ${error.message}`);
  process.exitCode = 1; return;
});
