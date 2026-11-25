/**
 * Planned Loan Dismissal Repository
 * Stores request_book planned loans explicitly removed by a user
 */

export class PlannedLoanDismissalRepository {
  constructor(private db: D1Database) {}

  async markDismissed(userId: number, libraryBiblioId: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO planned_loan_dismissals (
          user_id, library_biblio_id
        ) VALUES (?, ?)`,
      )
      .bind(userId, libraryBiblioId)
      .run();
  }

  async findAllLibraryBiblioIds(userId: number): Promise<number[]> {
    const result = await this.db
      .prepare(
        'SELECT library_biblio_id FROM planned_loan_dismissals WHERE user_id = ?',
      )
      .bind(userId)
      .all<{ library_biblio_id: number }>();

    return result.results.map((row) => row.library_biblio_id);
  }
}

export function createPlannedLoanDismissalRepository(
  db: D1Database,
): PlannedLoanDismissalRepository {
  return new PlannedLoanDismissalRepository(db);
}
