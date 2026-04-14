/**
 * Simple SQLite store for ClaudePacer user data.
 * Handles tier state, referral codes, and memory save history.
 * All Claude usage data itself comes directly from LiteLLM.
 */

import path from "path";
import { nanoid } from "nanoid";

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "data", "claudepacer.db");

// Lazy-load better-sqlite3 (only on Node.js, not edge runtime)
let _db: import("better-sqlite3").Database | null = null;

function getDb() {
  if (_db) return _db;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  _db = new Database(DB_PATH) as import("better-sqlite3").Database;
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

function migrate(db: import("better-sqlite3").Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      tier          TEXT NOT NULL DEFAULT 'free',    -- 'free' | 'paid'
      referral_code TEXT NOT NULL UNIQUE,
      credits_cents INTEGER NOT NULL DEFAULT 0       -- Stripe credits earned
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id            TEXT PRIMARY KEY,
      referrer_id   TEXT NOT NULL REFERENCES users(id),
      referred_id   TEXT REFERENCES users(id),
      code          TEXT NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      converted_at  INTEGER                           -- NULL until purchase
    );

    CREATE TABLE IF NOT EXISTS memory_saves (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL REFERENCES users(id),
      saved_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      tokens_before   INTEGER NOT NULL,
      tokens_after    INTEGER NOT NULL,
      tokens_saved    INTEGER NOT NULL,
      cost_saved_usd  REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_referrals_code ON referrals(code);
    CREATE INDEX IF NOT EXISTS idx_memory_saves_user ON memory_saves(user_id);
  `);
}

// ── User ─────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  tier: "free" | "paid";
  referralCode: string;
  creditsCents: number;
  createdAt: number;
}

export function getOrCreateUser(userId: string): User {
  const db = getDb();
  const existing = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(userId) as Record<string, unknown> | undefined;

  if (existing) {
    return rowToUser(existing);
  }

  const referralCode = nanoid(8).toUpperCase();
  db.prepare(
    "INSERT INTO users (id, referral_code) VALUES (?, ?)"
  ).run(userId, referralCode);

  return {
    id: userId,
    tier: "free",
    referralCode,
    creditsCents: 0,
    createdAt: Math.floor(Date.now() / 1000),
  };
}

export function upgradeToPaid(userId: string): void {
  const db = getDb();
  db.prepare("UPDATE users SET tier = 'paid' WHERE id = ?").run(userId);
}

export function addCredits(userId: string, cents: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE users SET credits_cents = credits_cents + ? WHERE id = ?"
  ).run(cents, userId);
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: row.id as string,
    tier: row.tier as "free" | "paid",
    referralCode: row.referral_code as string,
    creditsCents: row.credits_cents as number,
    createdAt: row.created_at as number,
  };
}

// ── Referrals ─────────────────────────────────────────────────────────────────

export function getReferrerByCode(code: string): User | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT u.* FROM users u
       WHERE u.referral_code = ?`
    )
    .get(code.toUpperCase()) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : null;
}

export function recordReferralConversion(
  referrerId: string,
  referredId: string,
  code: string
): void {
  const db = getDb();
  const id = nanoid();

  // Upsert the referral row
  const existing = db
    .prepare(
      "SELECT id FROM referrals WHERE referrer_id = ? AND referred_id = ?"
    )
    .get(referrerId, referredId);

  if (existing) return;

  db.prepare(
    `INSERT INTO referrals (id, referrer_id, referred_id, code, converted_at)
     VALUES (?, ?, ?, ?, unixepoch())`
  ).run(id, referrerId, referredId, code);

  // Give referrer $5 credit
  addCredits(referrerId, 500);
}

// ── Memory saves ──────────────────────────────────────────────────────────────

export interface MemorySave {
  id: string;
  userId: string;
  savedAt: number;
  tokensBefore: number;
  tokensAfter: number;
  tokensSaved: number;
  costSavedUsd: number;
}

export function recordMemorySave(
  userId: string,
  tokensBefore: number,
  tokensAfter: number,
  costSavedUsd: number
): MemorySave {
  const db = getDb();
  const id = nanoid();
  const tokensSaved = tokensBefore - tokensAfter;

  db.prepare(
    `INSERT INTO memory_saves
       (id, user_id, tokens_before, tokens_after, tokens_saved, cost_saved_usd)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, tokensBefore, tokensAfter, tokensSaved, costSavedUsd);

  return {
    id,
    userId,
    savedAt: Math.floor(Date.now() / 1000),
    tokensBefore,
    tokensAfter,
    tokensSaved,
    costSavedUsd,
  };
}

export function getTotalMemorySaved(userId: string): {
  tokensSaved: number;
  costSavedUsd: number;
  saveCount: number;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(tokens_saved), 0) AS tokens_saved,
         COALESCE(SUM(cost_saved_usd), 0) AS cost_saved_usd,
         COUNT(*) AS save_count
       FROM memory_saves WHERE user_id = ?`
    )
    .get(userId) as Record<string, number>;

  return {
    tokensSaved: row.tokens_saved,
    costSavedUsd: row.cost_saved_usd,
    saveCount: row.save_count,
  };
}
