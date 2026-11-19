/**
 * Client constructors for the SQLite storage layer.
 *
 * - `adminDb()` — unscoped, trusted server paths only (background generation,
 *   auth, usage logging). Never reachable from a request that carries a user
 *   session decision.
 * - `userDb()` (in `./server`) — bound to the session user; every query is
 *   automatically scoped, replacing row-level security.
 */

import { QueryBuilder, type Scope } from "./builder";
import { getDb } from "./driver";

export type DbClient = {
  from: (table: string) => QueryBuilder;
};

function makeClient(scope: Scope): DbClient {
  return {
    from: (table: string) => new QueryBuilder(getDb(), scope, table),
  };
}

/** Server-side, unscoped access. Import only from server code. */
export function adminDb(): DbClient {
  return makeClient({ kind: "admin" });
}

/** Scoped access for a known user id (no cookie lookup). */
export function userDbFor(userId: string | null): DbClient {
  return makeClient({ kind: "user", userId });
}

export { QueryBuilder };
export type { QueryResult, Row, Scope } from "./builder";
