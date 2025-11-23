/**
 * Note Repository
 * Data access layer for note CRUD operations
 *
 * Trace: spec_id: SPEC-notes-002, task_id: TASK-023
 */

import type { NoteRecord } from '../types';

export class NoteRepository {
  constructor(private db: D1Database) {}

  /**
   * Find all notes for a book, sorted by page number
   * @param bookId - Book ID to get notes for
   */
  async findByBookId(bookId: number): Promise<NoteRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM notes WHERE book_id = ? ORDER BY page_number ASC')
      .bind(bookId)
      .all<NoteRecord>();

    return result.results;
  }

  /**
   * Find a note by ID
   * @param id - Note ID
   */
  async findById(id: number): Promise<NoteRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM notes WHERE id = ?')
      .bind(id)
      .first<NoteRecord>();

    return result || null;
  }

  /**
   * Create a new note
   * @param note - Note data (without id)
   * @returns Created note with id
   */
  async create(
    note: Omit<NoteRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<NoteRecord> {
    const now = new Date().toISOString();

    const result = await this.db
      .prepare(
        `INSERT INTO notes (book_id, page_number, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         RETURNING *`,
      )
      .bind(note.book_id, note.page_number, note.content, now, now)
      .first<NoteRecord>();

    if (!result) {
      throw new Error('Failed to create note');
    }

    console.log(
      `[NoteRepository] Created note for book ${note.book_id}, page ${note.page_number}`,
    );

    return result;
  }

  /**
   * Update an existing note
   * @param id - Note ID
   * @param updates - Fields to update
   * @returns Updated note
   */
  async update(
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

    values.push(id);

    const result = await this.db
      .prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ? RETURNING *`)
      .bind(...values)
      .first<NoteRecord>();

    if (result) {
      console.log(`[NoteRepository] Updated note ${id}`);
    }

    return result || null;
  }

  /**
   * Delete a note
   * @param id - Note ID
   * @returns true if deleted, false if not found
   */
  async delete(id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM notes WHERE id = ?')
      .bind(id)
      .run();

    const deleted = result.meta.changes > 0;

    if (deleted) {
      console.log(`[NoteRepository] Deleted note ${id}`);
    }

    return deleted;
  }

  /**
   * Count notes for a book
   * @param bookId - Book ID
   */
  async countByBookId(bookId: number): Promise<number> {
    const result = await this.db
      .prepare('SELECT COUNT(*) as count FROM notes WHERE book_id = ?')
      .bind(bookId)
      .first<{ count: number }>();

    return result?.count || 0;
  }

  /**
   * Count notes for multiple books in a single query
   * @param bookIds - Array of book IDs
   * @returns Map of book ID to note count
   */
  async countNotesForBookIds(bookIds: number[]): Promise<Map<number, number>> {
    const counts = new Map<number, number>();

    if (bookIds.length === 0) {
      return counts;
    }

    // Build placeholders for IN clause
    const placeholders = bookIds.map(() => '?').join(', ');
    const query = `
      SELECT book_id, COUNT(*) as count
      FROM notes
      WHERE book_id IN (${placeholders})
      GROUP BY book_id
    `;

    const result = await this.db
      .prepare(query)
      .bind(...bookIds)
      .all<{ book_id: number; count: number }>();

    for (const row of result.results) {
      counts.set(row.book_id, row.count);
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
