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

  async deleteByLibraryBiblioIds(libraryBiblioIds: number[]): Promise<number> {
    if (libraryBiblioIds.length === 0) {
      return 0;
    }

    const placeholders = libraryBiblioIds.map(() => '?').join(', ');
    const result = await this.db
      .prepare(
        `DELETE FROM planned_loans WHERE library_biblio_id IN (${placeholders})`,
      )
      .bind(...libraryBiblioIds)
      .run();

    return result.meta.changes;
  }
}

export function createPlannedLoanRepository(
  db: D1Database,
): PlannedLoanRepository {
  return new PlannedLoanRepository(db);
}
