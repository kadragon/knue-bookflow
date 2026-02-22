/**
 * Planned Loan Repository
 * Data access for planned (borrow-later) items
 *
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-043
 */

import type { PlannedLoanRecord } from '../types';

export class PlannedLoanRepository {
  constructor(private db: D1Database) {}

  async findAll(): Promise<PlannedLoanRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM planned_loans ORDER BY created_at DESC, id DESC')
      .all<PlannedLoanRecord>();

    return result.results;
  }

  async findByLibraryBiblioId(
    libraryBiblioId: number,
  ): Promise<PlannedLoanRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM planned_loans WHERE library_biblio_id = ?')
      .bind(libraryBiblioId)
      .first<PlannedLoanRecord>();

    return result || null;
  }

  async findById(id: number): Promise<PlannedLoanRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM planned_loans WHERE id = ?')
      .bind(id)
      .first<PlannedLoanRecord>();

    return result || null;
  }

  async findAllLibraryBiblioIds(): Promise<number[]> {
    const result = await this.db
      .prepare('SELECT library_biblio_id FROM planned_loans')
      .all<{ library_biblio_id: number }>();

    return result.results.map((row) => row.library_biblio_id);
  }

  async create(
    record: Omit<PlannedLoanRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<PlannedLoanRecord> {
    const now = new Date().toISOString();

    const created = await this.db
      .prepare(
        `INSERT INTO planned_loans (
          library_biblio_id, source, title, author, publisher, year, isbn,
          cover_url, material_type, branch_volumes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
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

  async deleteById(id: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM planned_loans WHERE id = ?')
      .bind(id)
      .run();

    return result.meta.changes > 0;
  }

  async deleteByLibraryBiblioId(libraryBiblioId: number): Promise<boolean> {
    const result = await this.db
      .prepare('DELETE FROM planned_loans WHERE library_biblio_id = ?')
      .bind(libraryBiblioId)
      .run();

    return result.meta.changes > 0;
  }

  /**
   * Delete planned loans matching any of the given library biblio IDs.
   * Chunks the IDs into batches of 999 to stay under D1's 1000-parameter limit,
   * executing all batches in a single db.batch() call.
   * @param libraryBiblioIds - IDs to delete; returns 0 immediately if empty
   * @returns Total number of rows deleted
   */
  async deleteByLibraryBiblioIds(libraryBiblioIds: number[]): Promise<number> {
    if (libraryBiblioIds.length === 0) {
      return 0;
    }

    const BATCH_SIZE = 999; // D1 parameter limit is 1000
    const statements: D1PreparedStatement[] = [];

    for (let i = 0; i < libraryBiblioIds.length; i += BATCH_SIZE) {
      const chunk = libraryBiblioIds.slice(i, i + BATCH_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      statements.push(
        this.db
          .prepare(
            `DELETE FROM planned_loans WHERE library_biblio_id IN (${placeholders})`,
          )
          .bind(...chunk),
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
