/**
 * Book Request Repository
 * Data access for the local 희망도서 신청 목록 (books the library does not hold).
 */

import type { BookRequestRecord } from '../types';

export class BookRequestRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<BookRequestRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM book_requests ORDER BY created_at DESC, id DESC')
      .all<BookRequestRecord>();

    return result.results;
  }

  async findByIsbn13(isbn13: string): Promise<BookRequestRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM book_requests WHERE isbn13 = ?')
      .bind(isbn13)
      .first<BookRequestRecord>();

    return result || null;
  }

  async create(
    record: Omit<BookRequestRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<BookRequestRecord> {
    const now = new Date().toISOString();

    const created = await this.db
      .prepare(
        `INSERT INTO book_requests (
          isbn13, isbn, title, author, publisher, pub_date,
          cover_url, aladin_link, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
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

    if (!created) {
      throw new Error('Failed to create book request');
    }

    return created;
  }

  async deleteById(id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM book_requests WHERE id = ?')
      .bind(id)
      .run();

    return result.meta.changes > 0;
  }
}

export function createBookRequestRepository(
  db: D1Database,
): BookRequestRepository {
  return new BookRequestRepository(db);
}
