/**
 * A Supabase-shaped query builder over SQLite.
 *
 * Call sites keep their familiar `db.from("courses").select("*").eq(...).maybeSingle()`
 * chains — what changes is what happens underneath:
 *
 * - **Scoping replaces RLS.** A user-bound client automatically adds
 *   `WHERE user_id = ?` (direct tables) or an ownership subquery
 *   `WHERE course_id IN (SELECT id FROM courses WHERE user_id = ?)`
 *   (course-owned tables) to every select/update/delete, and verifies
 *   ownership on insert. Cross-account reads are impossible by construction.
 *   The admin client is
 *   unscoped and server-only (generation jobs, auth, usage logging).
 * - **Types round-trip.** Booleans are stored as 0/1 and handed back as real
 *   booleans; JSON columns are stored as text and handed back parsed — the app
 *   sees the same values Supabase returned.
 * - **Errors keep their shape**: `{ data, error, count }`, with `error.code`
 *   preserving the PostgREST codes call sites already check (23505 …).
 */

import type { Database } from "better-sqlite3";

import {
  BOOLEAN_COLUMNS,
  JSON_COLUMNS,
  TOUCHES_UPDATED_AT,
  getTableMeta,
  newId,
  nowIso,
  toStorageError,
  type StorageError,
  type TableMeta,
} from "./driver";

// This layer mirrors supabase-js's untyped response shape on purpose: rows are
// consumed by the 98 existing call sites without generated database types, so
// `any` here is what lets them compile unchanged.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Row = Record<string, any>;

export type QueryResult = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  error: StorageError | null;
  count: number | null;
};

/**
 * Who the client speaks for. `admin` trusts server code; `user` enforces the
 * scope rules below and refuses the auth-only tables.
 */
export type Scope = { kind: "admin" } | { kind: "user"; userId: string | null };

/** Tables carrying their own `user_id`: filtered straight on that column. */
const DIRECT_USER_TABLES = new Set([
  "courses",
  "submissions",
  "lesson_progress",
  "tutor_messages",
  "tutor_summaries",
  "chapter_quizzes",
  "project_submissions",
  "user_settings",
]);

/** Tables owned through their course: filtered by course ownership. */
const COURSE_OWNED_TABLES = new Set([
  "modules",
  "lessons",
  "course_videos",
  "exercises",
  "course_projects",
]);

/** Auth and observability: reachable only through the admin client. */
const ADMIN_ONLY_TABLES = new Set(["users", "ai_usage"]);

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Unsafe identifier: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

function parseColumns(spec: string): string[] {
  if (spec.trim() === "*") return ["*"];
  return spec
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .map(ident);
}

/** Everything SQLite can bind, with the JS types PostgREST used to absorb. */
function toBind(value: unknown): string | number | bigint | null | Uint8Array {
  if (value === undefined || value === null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return value;
  }
  if (value instanceof Uint8Array) return value;
  // Objects/arrays reaching a non-JSON column are a caller bug; JSON columns
  // are stringified before this runs.
  return JSON.stringify(value);
}

type PreparedRow = Record<string, string | number | bigint | null | Uint8Array>;

/** Drop undefined, fill the uuid, stringify JSON columns, coerce scalars. */
function prepareRow(meta: TableMeta, row: Row): PreparedRow {
  const json = JSON_COLUMNS[meta.name];
  const out: PreparedRow = {};
  for (const [column, raw] of Object.entries(row)) {
    if (raw === undefined) continue;
    if (!meta.columns.has(column)) {
      // Let SQLite produce the same "no such column" failure PostgREST did.
      throw new Error(`table ${meta.name} has no column named ${column}`);
    }
    if (json?.has(column) && raw !== null && typeof raw === "object") {
      out[column] = JSON.stringify(raw);
    } else {
      out[column] = toBind(raw);
    }
  }
  if (meta.idPk && !("id" in out)) out.id = newId();
  return out;
}

/** The read side of the type round-trip: 0/1 → boolean, JSON text → value. */
function mapRow(table: string, row: Row): Row {
  const json = JSON_COLUMNS[table];
  const bool = BOOLEAN_COLUMNS[table];
  if (!json && !bool) return row;

  const out: Row = { ...row };
  if (json) {
    for (const column of json) {
      const value = out[column];
      if (typeof value === "string") {
        try {
          out[column] = JSON.parse(value);
        } catch {
          // Leave malformed legacy text as-is rather than dropping data.
        }
      }
    }
  }
  if (bool) {
    for (const column of bool) {
      if (out[column] === 1) out[column] = true;
      else if (out[column] === 0) out[column] = false;
    }
  }
  return out;
}

type Filter = { sql: string; params: unknown[] };

type Op = "select" | "insert" | "update" | "delete" | "upsert";

export class QueryBuilder implements PromiseLike<QueryResult> {
  private op: Op = "select";
  private values: Row[] = [];
  private updates: Row | null = null;
  /** Columns for `insert(...).select(...)` / `upsert(...).select(...)`. */
  private returning: string | null = null;
  private projections: string[] = ["*"];
  private filters: Filter[] = [];
  private orders: string[] = [];
  private limitValue: number | null = null;
  private terminal: "many" | "single" | "maybe" = "many";
  private countExact = false;
  private headOnly = false;
  private onConflict: string[] | null = null;
  private ignoreDuplicates = false;
  private result: QueryResult | null = null;

  constructor(
    private readonly db: Database,
    private readonly scope: Scope,
    private readonly table: string,
  ) {}

  // -- chainable surface (mirrors the subset Supabase call sites use) -------

  select(columns = "*", options?: { count?: "exact"; head?: boolean }): this {
    // PostgREST's `RETURNING` form: `.insert(...).select("id")` and friends.
    // Must never turn a pending write back into a plain select.
    if (this.op !== "select") {
      this.returning = columns;
      return this;
    }
    this.projections = parseColumns(columns);
    if (options?.count === "exact") {
      this.countExact = true;
      this.headOnly = Boolean(options.head);
    }
    return this;
  }

  insert(values: Row | Row[]): this {
    this.op = "insert";
    this.values = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(
    values: Row | Row[],
    options?: { onConflict?: string; ignoreDuplicates?: boolean },
  ): this {
    this.op = "upsert";
    this.values = Array.isArray(values) ? values : [values];
    this.onConflict = options?.onConflict
      ? options.onConflict.split(",").map((column) => column.trim())
      : null;
    this.ignoreDuplicates = Boolean(options?.ignoreDuplicates);
    return this;
  }

  update(values: Row): this {
    this.op = "update";
    this.updates = values;
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ sql: `${ident(column)} = ?`, params: [toBind(value)] });
    return this;
  }

  in(column: string, values: unknown[]): this {
    if (values.length === 0) {
      this.filters.push({ sql: "0 = 1", params: [] });
      return this;
    }
    this.filters.push({
      sql: `${ident(column)} in (${values.map(() => "?").join(", ")})`,
      params: values.map(toBind),
    });
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push({ sql: `${ident(column)} > ?`, params: [toBind(value)] });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orders.push(`${ident(column)} ${options?.ascending === false ? "desc" : "asc"}`);
    return this;
  }

  limit(count: number): this {
    this.limitValue = Math.max(0, Math.floor(count));
    return this;
  }

  single(): this {
    this.terminal = "single";
    return this;
  }

  maybeSingle(): this {
    this.terminal = "maybe";
    return this;
  }

  // -- execution ------------------------------------------------------------

  then<T1 = QueryResult, T2 = never>(
    onfulfilled?: ((value: QueryResult) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<QueryResult> {
    if (this.result) return this.result;
    try {
      this.result = this.execute();
    } catch (error) {
      this.result = { data: null, error: toStorageError(error), count: null };
    }
    return this.result;
  }

  private execute(): QueryResult {
    const meta = getTableMeta(this.table);
    if (!meta) {
      return fail(`Could not find the table '${this.table}' in the public schema.`, "PGRST205");
    }
    if (this.scope.kind === "user" && ADMIN_ONLY_TABLES.has(this.table)) {
      return fail(`The ${this.table} table is only available to the server.`, "42501");
    }

    switch (this.op) {
      case "select":
        return this.executeSelect();
      case "insert":
        return this.executeInsert();
      case "update":
        return this.executeUpdate();
      case "delete":
        return this.executeDelete();
      case "upsert":
        return this.executeUpsert();
    }
  }

  /**
   * RLS, translated: session users get their rows and nothing else; an anon
   * client matches zero rows (the old policies had no anon SELECT grant).
   */
  private whereClauses(): Filter[] {
    const clauses = [...this.filters];
    if (this.scope.kind === "admin") return clauses;

    const userId = this.scope.userId;
    if (userId === null) {
      clauses.push({ sql: "0 = 1", params: [] });
      return clauses;
    }
    if (DIRECT_USER_TABLES.has(this.table)) {
      clauses.push({ sql: "user_id = ?", params: [userId] });
    } else if (COURSE_OWNED_TABLES.has(this.table)) {
      clauses.push({
        sql: "course_id in (select id from courses where user_id = ?)",
        params: [userId],
      });
    }
    return clauses;
  }

  private whereSql(clauses: Filter[]): string {
    return clauses.length > 0
      ? ` where ${clauses.map((clause) => clause.sql).join(" and ")}`
      : "";
  }

  private paramsOf(clauses: Filter[]): unknown[] {
    return clauses.flatMap((clause) => clause.params);
  }

  private shape(rows: Row[]): { data: QueryResult["data"]; error: StorageError | null } {
    const mapped = rows.map((row) => mapRow(this.table, row));
    if (this.terminal === "many") return { data: mapped, error: null };
    if (mapped.length > 1) {
      return {
        data: null,
        error: {
          message: "Requested a single row, but the query returned multiple rows.",
          code: "PGRST116",
        },
      };
    }
    if (mapped.length === 0 && this.terminal === "single") {
      return { data: null, error: { message: "No rows returned.", code: "PGRST116" } };
    }
    return { data: mapped[0] ?? null, error: null };
  }

  private executeSelect(): QueryResult {
    const clauses = this.whereClauses();
    const where = this.whereSql(clauses);
    const params = this.paramsOf(clauses);

    if (this.countExact) {
      const row = this.db
        .prepare(`select count(*) as c from ${ident(this.table)}${where}`)
        .get(...(params)) as { c: number };
      const count = row.c;
      if (this.headOnly) return { data: null, error: null, count };
      const order = this.orders.length > 0 ? ` order by ${this.orders.join(", ")}` : "";
      const limit = this.limitValue !== null ? ` limit ${this.limitValue}` : "";
      const rows = this.db
        .prepare(`select ${this.projections.join(", ")} from ${ident(this.table)}${where}${order}${limit}`)
        .all(...(params)) as Row[];
      const shaped = this.shape(rows);
      return { data: shaped.data, error: shaped.error, count };
    }

    const order = this.orders.length > 0 ? ` order by ${this.orders.join(", ")}` : "";
    const limit = this.limitValue !== null ? ` limit ${this.limitValue}` : "";
    const rows = this.db
      .prepare(`select ${this.projections.join(", ")} from ${ident(this.table)}${where}${order}${limit}`)
      .all(...(params)) as Row[];
    const shaped = this.shape(rows);
    return { data: shaped.data, error: shaped.error, count: null };
  }

  /**
   * Inserts go through an ownership check first (the WITH CHECK of the old
   * policies): direct rows must belong to the session user, course-owned rows
   * must reference one of their courses.
   */
  private guardWrites(): StorageError | null {
    if (this.scope.kind === "admin") return null;
    const userId = this.scope.userId;
    if (userId === null) return { message: "Not signed in.", code: "401" };

    for (const row of this.values) {
      if (DIRECT_USER_TABLES.has(this.table)) {
        const existing = row.user_id;
        if (existing !== undefined && existing !== null && existing !== userId) {
          return { message: "This row belongs to another account.", code: "42501" };
        }
      } else if (COURSE_OWNED_TABLES.has(this.table)) {
        const courseId = row.course_id;
        if (typeof courseId === "string") {
          const owned = this.db
            .prepare("select 1 as ok from courses where id = ? and user_id = ?")
            .get(courseId, userId) as { ok: number } | undefined;
          if (!owned) return { message: "This course belongs to another account.", code: "42501" };
        }
      }
    }
    return null;
  }

  private writeRows(): PreparedRow[] {
    return this.values.map((row) => {
      const prepared = prepareRow(getTableMeta(this.table)!, row);
      if (this.scope.kind === "user" && DIRECT_USER_TABLES.has(this.table)) {
        prepared.user_id = this.scope.userId!;
      }
      return prepared;
    });
  }

  /**
   * Bulk inserts often differ per row (an mcq carries `options`, a short
   * answer does not). One INSERT with the union of columns would bind NULL
   * explicitly and defeat `not null default …` — so each distinct column set
   * becomes its own statement.
   */
  private groups(): { columns: string[]; rows: PreparedRow[] }[] {
    const prepared = this.writeRows();
    const groups = new Map<string, { columns: string[]; rows: PreparedRow[] }>();
    for (const row of prepared) {
      const columns = Object.keys(row).sort();
      const key = columns.join("\u0000");
      let group = groups.get(key);
      if (!group) {
        group = { columns, rows: [] };
        groups.set(key, group);
      }
      group.rows.push(row);
    }
    return [...groups.values()];
  }

  private returningSql(): string {
    return this.returning !== null ? ` returning ${parseColumns(this.returning).join(", ")}` : "";
  }

  /** Bind params for one group: every row shares the group's column list. */
  private groupParams(group: { columns: string[]; rows: PreparedRow[] }): unknown[] {
    return group.rows.flatMap((row) => group.columns.map((column) => row[column]));
  }

  private executeInsert(): QueryResult {
    const denied = this.guardWrites();
    if (denied) return { data: null, error: denied, count: null };
    if (this.values.length === 0) return { data: null, error: null, count: null };

    const returning = this.returningSql();
    const out: Row[] = [];
    for (const group of this.groups()) {
      const placeholders = group.rows
        .map(() => `(${group.columns.map(() => "?").join(", ")})`)
        .join(", ");
      const sql = `insert into ${ident(this.table)} (${group.columns.join(", ")}) values ${placeholders}${returning}`;
      const params = this.groupParams(group);
      if (returning === "") {
        this.db.prepare(sql).run(...(params));
      } else {
        out.push(...(this.db.prepare(sql).all(...(params)) as Row[]));
      }
    }
    if (returning === "") return { data: null, error: null, count: null };
    const shaped = this.shape(out);
    return { data: shaped.data, error: shaped.error, count: null };
  }

  private executeUpdate(): QueryResult {
    if (this.filters.length === 0) {
      return fail("Update requires at least one filter.", "PGRST120");
    }
    const values = { ...(this.updates ?? {}) };
    if (TOUCHES_UPDATED_AT.has(this.table) && !("updated_at" in values)) {
      values.updated_at = nowIso();
    }

    const meta = getTableMeta(this.table)!;
    const prepared: PreparedRow = {};
    for (const [column, raw] of Object.entries(values)) {
      if (raw === undefined) continue;
      if (!meta.columns.has(column)) {
        return fail(`table ${this.table} has no column named ${column}`, "PGRST205");
      }
      if (JSON_COLUMNS[meta.name]?.has(column) && raw !== null && typeof raw === "object") {
        prepared[column] = JSON.stringify(raw);
      } else {
        prepared[column] = toBind(raw);
      }
    }
    if (Object.keys(prepared).length === 0) {
      return { data: null, error: null, count: null };
    }

    const clauses = this.whereClauses();
    const setSql = Object.keys(prepared).map((column) => `${ident(column)} = ?`).join(", ");
    const params = [...Object.values(prepared), ...this.paramsOf(clauses)];
    const sql = `update ${ident(this.table)} set ${setSql}${this.whereSql(clauses)}${this.returningSql()}`;
    if (this.returning !== null) {
      const out = this.db.prepare(sql).all(...(params)) as Row[];
      const shaped = this.shape(out);
      return { data: shaped.data, error: shaped.error, count: null };
    }
    const info = this.db.prepare(sql).run(...(params));
    return { data: null, error: null, count: info.changes };
  }

  private executeDelete(): QueryResult {
    if (this.filters.length === 0) {
      return fail("Delete requires at least one filter.", "PGRST120");
    }
    const clauses = this.whereClauses();
    const sql = `delete from ${ident(this.table)}${this.whereSql(clauses)}${this.returningSql()}`;
    const params = this.paramsOf(clauses);
    if (this.returning !== null) {
      const out = this.db.prepare(sql).all(...(params)) as Row[];
      const shaped = this.shape(out);
      return { data: shaped.data, error: shaped.error, count: null };
    }
    const info = this.db.prepare(sql).run(...(params));
    return { data: null, error: null, count: info.changes };
  }

  private executeUpsert(): QueryResult {
    const denied = this.guardWrites();
    if (denied) return { data: null, error: denied, count: null };
    if (this.values.length === 0) return { data: null, error: null, count: null };

    const meta = getTableMeta(this.table)!;
    const conflict = this.onConflict ?? meta.pkColumns;
    if (conflict.length === 0) {
      return fail(`Upsert on ${this.table} needs an onConflict target.`, "PGRST205");
    }

    // `do update set` never mentions updated_at unless the row carries it, so
    // fill it here — mirroring the trigger the Postgres schema relied on.
    if (TOUCHES_UPDATED_AT.has(this.table)) {
      for (const row of this.values) {
        if (row.updated_at === undefined) row.updated_at = nowIso();
      }
    }

    const returning = this.returningSql();
    const out: Row[] = [];
    for (const group of this.groups()) {
      const updatable = group.columns.filter((column) => !conflict.includes(column));
      const action =
        this.ignoreDuplicates || updatable.length === 0
          ? "do nothing"
          : `do update set ${updatable
              .map((column) => `${ident(column)} = excluded.${ident(column)}`)
              .join(", ")}`;
      const sql =
        `insert into ${ident(this.table)} (${group.columns.join(", ")}) values ` +
        `${group.rows.map(() => `(${group.columns.map(() => "?").join(", ")})`).join(", ")}` +
        ` on conflict (${conflict.map(ident).join(", ")}) ${action}${returning}`;
      const params = this.groupParams(group);
      if (returning === "") {
        this.db.prepare(sql).run(...(params));
      } else {
        out.push(...(this.db.prepare(sql).all(...(params)) as Row[]));
      }
    }
    if (returning === "") return { data: null, error: null, count: null };
    const shaped = this.shape(out);
    return { data: shaped.data, error: shaped.error, count: null };
  }
}

function fail(message: string, code: string): QueryResult {
  return { data: null, error: { message, code }, count: null };
}
