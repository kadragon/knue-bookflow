/// <reference types="node" />

/**
 * Test helper: a D1Database backed by node:sqlite with the real migrations.
 * node:sqlite enforces foreign keys by default, like D1.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

const MIGRATIONS_DIR = new URL('../../../migrations/', import.meta.url);

export function listMigrations(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort();
}

/** Apply migration files in order, each atomically as D1 does. */
export function applyMigrations(
  db: DatabaseSync,
  files: string[] = listMigrations(),
): void {
  for (const name of files) {
    const sql = readFileSync(new URL(name, MIGRATIONS_DIR), 'utf8');
    db.exec('BEGIN');
    try {
      db.exec(sql);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${name} failed: ${String(error)}`);
    }
  }
}

export function createMigratedDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  applyMigrations(db);
  return db;
}

interface SqliteStatement {
  bind(...values: unknown[]): SqliteStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: true; meta: object }>;
  run(): Promise<{ success: true; meta: { changes: number } }>;
}

export function createSqliteD1(db: DatabaseSync): D1Database {
  const statement = (sql: string, params: unknown[] = []): SqliteStatement => {
    const values = params as SQLInputValue[];
    return {
      bind: (...next: unknown[]) => statement(sql, next),
      first: async <T>() => (db.prepare(sql).get(...values) ?? null) as T,
      all: async <T>() => ({
        results: db.prepare(sql).all(...values) as T[],
        success: true as const,
        meta: {},
      }),
      run: async () => ({
        success: true as const,
        meta: { changes: Number(db.prepare(sql).run(...values).changes) },
      }),
    };
  };

  return {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: SqliteStatement[]) => {
      const results = [];
      for (const stmt of statements) {
        results.push(await stmt.run());
      }
      return results;
    },
  } as unknown as D1Database;
}
