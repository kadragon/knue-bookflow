/**
 * Planned Loan Repository
 * Data access for planned (borrow-later) items. Every query is scoped by
 * user_id.
 *
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import type { PlannedLoanRecord } from '../types';

export class PlannedLoanRepository {
  constructor(private db: D1Database) {}

  async findAll(userId: number): Promise<PlannedLoanRecord[]> {
    const result = await this.db
      .prepare(
        'SELECT * FROM planned_loans WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      )
      .bind(userId)
      .all<PlannedLoanRecord>();

    return result.results;
  }

  async findByLibraryBiblioId(
    userId: number,
    libraryBiblioId: number,
  ): Promise<PlannedLoanRecord | null> {
    const result = await this.db
      .prepare(
        'SELECT * FROM planned_loans WHERE user_id = ? AND library_biblio_id = ?',
      )
      .bind(userId, libraryBiblioId)
      .first<PlannedLoanRecord>();

    return result || null;
  }

  async findById(
    userId: number,
    id: number,
  ): Promise<PlannedLoanRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM planned_loans WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<PlannedLoanRecord>();

    return result || null;
  }

  async findAllLibraryBiblioIds(userId: number): Promise<number[]> {
    const result = await this.db
      .prepare('SELECT library_biblio_id FROM planned_loans WHERE user_id = ?')
      .bind(userId)
      .all<{ library_biblio_id: number }>();

    return result.results.map((row) => row.library_biblio_id);
  }

  async create(
    userId: number,
    record: Omit<
      PlannedLoanRecord,
      'id' | 'user_id' | 'created_at' | 'updated_at'
    >,
  ): Promise<PlannedLoanRecord> {
    const now = new Date().toISOString();

    const created = await this.db
      .prepare(
        `INSERT INTO planned_loans (
          user_id, library_biblio_id, source, title, author, publisher, year, isbn,
          cover_url, material_type, branch_volumes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        userId,
        record.library_biblio_id,
        record.source,
        record.title,
        record.author,
        record.publisher,
        record.year,
        record.isbn,
        record.cover_url,
        record.material_type,
        record.branch_volumes,
        now,
        now,
      )
      .first<PlannedLoanRecord>();

    if (!created) {
      throw new Error('Failed to create planned loan');
    }

    return created;
  }

  async deleteById(userId: number, id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM planned_loans WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    return result.meta.changes > 0;
  }

  async deleteByLibraryBiblioId(
    userId: number,
    libraryBiblioId: number,
  ): Promise<boolean> {
    const result = await this.db
      .prepare(
        'DELETE FROM planned_loans WHERE user_id = ? AND library_biblio_id = ?',
      )
      .bind(userId, libraryBiblioId)
      .run();

    return result.meta.changes > 0;
  }

  /**
   * Delete the user's planned loans matching any of the given library biblio IDs.
   * Chunks the IDs so each statement stays under D1's bound-parameter limit,
   * executing all batches in a single db.batch() call.
   * @param userId - Owner of the planned loans
   * @param libraryBiblioIds - IDs to delete; returns 0 immediately if empty
   * @returns Total number of rows deleted
   */
  async deleteByLibraryBiblioIds(
    userId: number,
    libraryBiblioIds: number[],
  ): Promise<number> {
    if (libraryBiblioIds.length === 0) {
      return 0;
    }

    const BATCH_SIZE = 99; // D1 allows 100 bound parameters per query; one is user_id
    const statements: D1PreparedStatement[] = [];

    for (let i = 0; i < libraryBiblioIds.length; i += BATCH_SIZE) {
      const chunk = libraryBiblioIds.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      statements.push(
        this.db
          .prepare(
            `DELETE FROM planned_loans WHERE user_id = ? AND library_biblio_id IN (${placeholders})`,
          )
          .bind(userId, ...chunk),
      );
    }

    const results = await this.db.batch(statements);
    return results.reduce((sum, r) => sum + (r.meta.changes ?? 0), 0);
  }
}

export function createPlannedLoanRepository(
  db: D1Database,
): PlannedLoanRepository {
  return new PlannedLoanRepository(db);
}
