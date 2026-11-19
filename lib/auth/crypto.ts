/**
 * Local credential and session cryptography: scrypt password hashing and
 * HMAC-signed session cookies. No external service is involved — the whole
 * flow lives in this file plus the `users` table.
 *
 * Deliberately plain Node (no `server-only`): `proxy.ts` only imports the
 * cookie name, and standalone test scripts can exercise the hashing directly.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

/** The single cookie every session hangs off. */
export const SESSION_COOKIE = "freedemy_session";

/** Sessions last 30 days — long for a local app, short enough to expire. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

/** scrypt needs ~128 * N * r bytes; Node's 32MB default is too small. */
function maxmemFor(n: number, r: number): number {
  return Math.max(32 * 1024 * 1024, 128 * n * r * 2);
}

/** `scrypt$N$r$p$salt$hash` — self-describing so params can change later. */
export function hashSecret(plain: string): string {
  const salt = randomBytes(16).toString("base64");
  const hash = scryptSync(plain, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: maxmemFor(SCRYPT_N, SCRYPT_R),
  }).toString("base64");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifySecret(plain: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const [salt, expected] = [parts[4], parts[5]];
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  // Never let a malformed row ask for an unbounded allocation.
  if (n < 2 || n > 1 << 20 || r < 1 || r > 64 || p < 1 || p > 16) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(plain, salt, KEY_LEN, { N: n, r, p, maxmem: maxmemFor(n, r) });
  } catch {
    return false;
  }
  const expectedBuf = Buffer.from(expected, "base64");
  return actual.length === expectedBuf.length && timingSafeEqual(actual, expectedBuf);
}

/**
 * Security answers are compared case- and whitespace-insensitively: "7th
 * November", " 7th   november " and "7TH NOVEMBER" are the same answer.
 */
export function normalizeAnswer(answer: string): string {
  return answer.trim().toLowerCase().replace(/\s+/g, " ");
}

// -- session tokens ---------------------------------------------------------

/**
 * Signing secret: `FREEDEMY_SESSION_SECRET` when set, otherwise a random one
 * generated once into `data/session.secret` (next to the database) so cookies
 * survive restarts.
 */
let cachedSecret: Buffer | null = null;

function dataDir(): string {
  const dbPath = process.env.FREEDEMY_DB_PATH?.trim();
  if (dbPath) return path.dirname(dbPath);
  return path.join(process.cwd(), "data");
}

function sessionSecret(): Buffer {
  if (cachedSecret) return cachedSecret;

  const explicit = process.env.FREEDEMY_SESSION_SECRET?.trim();
  if (explicit) {
    cachedSecret = Buffer.from(explicit, "utf8");
    return cachedSecret;
  }

  const file = path.join(dataDir(), "session.secret");
  try {
    cachedSecret = Buffer.from(readFileSync(file, "utf8").trim(), "utf8");
  } catch {
    const secret = randomBytes(32);
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      // Exclusive create: the first process to reach this point owns the
      // secret. Without it, two dev workers racing at first boot would each
      // cache their own random secret, one file would win, and every session
      // signed by the loser would fail verification (an redirect loop).
      writeFileSync(file, secret.toString("base64"), { mode: 0o600, flag: "wx" });
      cachedSecret = secret;
    } catch {
      // Another process won the race — adopt the secret it wrote.
      cachedSecret = Buffer.from(readFileSync(file, "utf8").trim(), "utf8");
    }
  }
  return cachedSecret;
}

function hmac(payload: string): string {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

/** `<userId>.<expiresAtMs>.<hmac>` — userId is a uuid and contains no dots. */
export function signSession(userId: string): string {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

/** Returns the userId when the token is authentic and unexpired, else null. */
export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [userId, expiresRaw, signature] = parts;
  if (!userId || !expiresRaw) return null;

  const expected = hmac(`${userId}.${expiresRaw}`);
  const actualBuf = Buffer.from(signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    return null;
  }

  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return userId;
}
