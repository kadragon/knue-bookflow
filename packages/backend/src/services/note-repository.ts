/**
 * Note Repository
 * Data access layer for note CRUD operations. Notes carry no user_id; every
 * query is scoped through the owning book's user_id.
 *
 * Trace: spec_id: SPEC-notes-002, task_id: TASK-023
 */

import type { NoteRecord } from '../types';

const OWNED_BY_USER = 'book_id IN (SELECT id FROM books WHERE user_id = ?)';

export class NoteRepository {
  constructor(private db: D1Database) {}

  /**
   * Find all notes for one of the user's books, sorted by page number
   * @param userId - Owner of the book
   * @param bookId - Book ID to get notes for
   */
  async findByBookId(userId: number, bookId: number): Promise<NoteRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT * FROM notes WHERE book_id = ? AND ${OWNED_BY_USER} ORDER BY page_number ASC`,
      )
      .bind(bookId, userId)
      .all<NoteRecord>();

    return result.results;
  }

  /**
   * Find one of the user's notes by ID
   * @param userId - Owner of the note's book
   * @param id - Note ID
   */
  async findById(userId: number, id: number): Promise<NoteRecord | null> {
    const result = await this.db
      .prepare(`SELECT * FROM notes WHERE id = ? AND ${OWNED_BY_USER}`)
      .bind(id, userId)
      .first<NoteRecord>();

    return result || null;
  }

  /**
   * Create a new note on one of the user's books
   * @param userId - Owner of the book
   * @param note - Note data (without id)
   * @returns Created note with id, or null when the user does not own the book
   */
  async create(
    userId: number,
    note: Omit<NoteRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<NoteRecord | null> {
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `INSERT INTO notes (book_id, page_number, content, created_at, updated_at)
         SELECT ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM books WHERE id = ? AND user_id = ?)
         RETURNING *`,
      )
      .bind(
        note.book_id,
        note.page_number,
        note.content,
        now,
        now,
        note.book_id,
        userId,
      )
      .first<NoteRecord>();

    if (result) {
      console.log(
        `[NoteRepository] Created note for book ${note.book_id}, page ${note.page_number}`,
      );
    }

    return result || null;
  }

  /**
   * Update one of the user's notes
   * @param userId - Owner of the note's book
   * @param id - Note ID
   * @param updates - Fields to update
   * @returns Updated note, or null when the user has no such note
   */
  async update(
    userId: number,
    id: number,
    updates: Partial<Pick<NoteRecord, 'page_number' | 'content'>>,
  ): Promise<NoteRecord | null> {
    const now = new Date().toISOString();

    // Build dynamic update query
    const fields: string[] = ['updated_at = ?'];
    const values: (string | number)[] = [now];

    if (updates.page_number !== undefined) {
      fields.push('page_number = ?');
      values.push(updates.page_number);
    }

    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }

    values.push(id, userId);

    const result = await this.db
      .prepare(
        `UPDATE notes SET ${fields.join(', ')} WHERE id = ? AND ${OWNED_BY_USER} RETURNING *`,
      )
      .bind(...values)
      .first<NoteRecord>();

    if (result) {
      console.log(`[NoteRepository] Updated note ${id}`);
    }

    return result || null;
  }

  /**
   * Delete one of the user's notes
   * @param userId - Owner of the note's book
   * @param id - Note ID
   * @returns true if deleted, false if the user has no such note
   */
  async delete(userId: number, id: number): Promise<boolean> {
    const result = await this.db
      .prepare(`DELETE FROM notes WHERE id = ? AND ${OWNED_BY_USER}`)
      .bind(id, userId)
      .run();

    const deleted = result.meta.changes > 0;

    if (deleted) {
      console.log(`[NoteRepository] Deleted note ${id}`);
    }

    return deleted;
  }

  /**
   * Count notes for one of the user's books
   * @param userId - Owner of the book
   * @param bookId - Book ID
   */
  async countByBookId(userId: number, bookId: number): Promise<number> {
    const result = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM notes WHERE book_id = ? AND ${OWNED_BY_USER}`,
      )
      .bind(bookId, userId)
      .first<{ count: number }>();

    return result?.count || 0;
  }

  /**
   * Count notes for several of the user's books in a single query
   * @param userId - Owner of the books
   * @param bookIds - Array of book IDs
   * @returns Map of book ID to note count
   */
  async countNotesForBookIds(
    userId: number,
    bookIds: number[],
  ): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (bookIds.length === 0) {
      return counts;
    }

    // Count across all of the user's books with one bound parameter (D1
    // limits bound parameters per query), then keep the requested ids.
    const result = await this.db
      .prepare(
        `SELECT book_id, COUNT(*) as count
         FROM notes
         WHERE ${OWNED_BY_USER}
         GROUP BY book_id`,
      )
      .bind(userId)
      .all<{ book_id: number; count: number }>();

    const requested = new Set(bookIds);
    for (const row of result.results) {
      if (requested.has(row.book_id)) {
        counts.set(row.book_id, row.count);
      }
    }

    return counts;
  }
}

/**
 * Create a note repository instance
 * @param db - D1 database binding
 */
export function createNoteRepository(db: D1Database): NoteRepository {
  return new NoteRepository(db);
}
