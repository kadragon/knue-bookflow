/**
 * Book Request Repository
 * Data access for the local 희망도서 신청 목록 (books the library does not hold).
 * Every query is scoped by user_id.
 */

import type { BookRequestRecord } from '../types';

export class BookRequestRepository {
  constructor(private db: D1Database) {}

  async findAll(userId: number): Promise<BookRequestRecord[]> {
    const result = await this.db
      .prepare(
        'SELECT * FROM book_requests WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      )
      .bind(userId)
      .all<BookRequestRecord>();

    return result.results;
  }

  async findByIsbn13(
    userId: number,
    isbn13: string,
  ): Promise<BookRequestRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM book_requests WHERE user_id = ? AND isbn13 = ?')
      .bind(userId, isbn13)
      .first<BookRequestRecord>();

    return result || null;
  }

  async create(
    userId: number,
    record: Omit<
      BookRequestRecord,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >,
  ): Promise<BookRequestRecord> {
    const now = new Date().toISOString();

    let created: BookRequestRecord | null;
    try {
      created = await this.db
        .prepare(
          `INSERT INTO book_requests (
          user_id, isbn13, isbn, title, author, publisher, pub_date,
          cover_url, aladin_link, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
        )
        .bind(
          userId,
          record.isbn13,
          record.isbn,
          record.title,
          record.author,
          record.publisher,
          record.pub_date,
          record.cover_url,
          record.aladin_link,
          now,
          now,
        )
        .first<BookRequestRecord>();
    } catch (error) {
      // A concurrent insert of the same (user_id, isbn13) loses the UNIQUE
      // race here (the findByIsbn13 pre-check passed for both). Tag it so the
      // handler returns 409 instead of a generic 500.
      if (error instanceof Error && /UNIQUE constraint/i.test(error.message)) {
        throw Object.assign(new Error('Book request already exists'), {
          code: 'DUPLICATE_BOOK_REQUEST',
        });
      }
      throw error;
    }

    if (!created) {
      throw new Error('Failed to create book request');
    }

    return created;
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM book_requests WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    return result.meta.changes > 0;
  }
}

export function createBookRequestRepository(
  db: D1Database,
): BookRequestRepository {
  return new BookRequestRepository(db);
}
