/**
 * User Repository
 * Data access for users authenticated through Cloudflare Access.
 */

import type { UserRecord } from '../types';

export class UserRepository {
  constructor(private db: D1Database) {}

  /**
   * Resolve the user id for a verified Access identity, creating the user on
   * first sign-in. `email` must already be normalized (trimmed, lowercased).
   */
  async findOrCreateByEmail(
    email: string,
    accessSub: string | null,
  ): Promise<number> {
    const existing = await this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<UserRecord>();

    if (existing) {
      if (accessSub && existing.access_sub !== accessSub) {
        await this.db
          .prepare(
            'UPDATE users SET access_sub = ?, updated_at = ? WHERE id = ?',
          )
          .bind(accessSub, new Date().toISOString(), existing.id)
          .run();
      }
      return existing.id;
    }

    const now = new Date().toISOString();
    // ON CONFLICT covers a concurrent first sign-in of the same email.
    const created = await this.db
      .prepare(
        `INSERT INTO users (email, access_sub, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(email) DO UPDATE SET updated_at = excluded.updated_at
         RETURNING id`,
      )
      .bind(email, accessSub, now, now)
      .first<{ id: number }>();

    if (!created) {
      throw new Error('Failed to resolve user');
    }

    console.log(`[UserRepository] Created user ${created.id}`);
    return created.id;
  }
}

export function createUserRepository(db: D1Database): UserRepository {
  return new UserRepository(db);
}
