/**
 * Planned Loan Dismissal Repository
 * Stores request_book planned loans explicitly removed by user
 */

export class PlannedLoanDismissalRepository {
  constructor(private db: D1Database) {}

  async markDismissed(libraryBiblioId: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT OR IGNORE INTO planned_loan_dismissals (
          library_biblio_id
        ) VALUES (?)`,
      )
      .bind(libraryBiblioId)
      .run();
  }

  async findAllLibraryBiblioIds(): Promise<number[]> {
    const result = await this.db
      .prepare('SELECT library_biblio_id FROM planned_loan_dismissals')
      .all<{ library_biblio_id: number }>();

    return result.results.map((row) => row.library_biblio_id);
  }
}

export function createPlannedLoanDismissalRepository(
  db: D1Database,
): PlannedLoanDismissalRepository {
  return new PlannedLoanDismissalRepository(db);
}
