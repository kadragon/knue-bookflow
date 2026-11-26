/**
 * Book Repository
 * Data access layer for D1 database operations. Every books query is scoped
 * by user_id; renewal_logs rows are read through the user's books.
 *
 * Trace: spec_id: SPEC-storage-001, SPEC-return-001, task_id: TASK-006, TASK-034, TASK-082
 */

import type {
  BookInfo,
  BookRecord,
  Charge,
  ChargeHistory,
  ReadStatus,
  RenewalLog,
} from '../types';
import {
  getTodayString,
  normalizeDateString,
  normalizeKstDate,
} from '../utils/date';
import { fromReadStatus } from '../utils/read-status';

/** Thrown when a write would leave two on-loan manual books with one ISBN */
export class DuplicateManualBookError extends Error {
  readonly code = 'DUPLICATE_MANUAL_BOOK';

  constructor() {
    super('An on-loan manual book with this ISBN already exists');
    this.name = 'DuplicateManualBookError';
  }
}

const ON_LOAN_MANUAL_ISBN_CONFLICT =
  /UNIQUE constraint failed: books\.user_id, books\.isbn/;

async function rejectManualIsbnConflict<T>(write: Promise<T>): Promise<T> {
  try {
    return await write;
  } catch (error) {
    if (
      error instanceof Error &&
      ON_LOAN_MANUAL_ISBN_CONFLICT.test(error.message)
    ) {
      throw new DuplicateManualBookError();
    }
    throw error;
  }
}

export class BookRepository {
  constructor(private db: D1Database) {}

  /**
   * Save or update a book record
   * @param record - Book record to save
   * @param existingRecord - Pre-fetched row to avoid a duplicate DB read.
   *   - `undefined` (omitted): performs a `findByChargeId` lookup internally
   *   - `null`: caller confirms the row does not exist → INSERT path
   *   - `BookRecord`: caller supplies the existing row → UPDATE path
   */
  async saveBook(
    userId: number,
    record: BookRecord,
    existingRecord?: BookRecord | null,
  ): Promise<void> {
    const now = new Date().toISOString();

    // Reuse pre-fetched record when available to avoid duplicate read.
    const existing =
      existingRecord === undefined
        ? await this.findByChargeId(userId, record.charge_id)
        : existingRecord;

    if (existing) {
      // Update existing record
      await this.db
        .prepare(
          `UPDATE books SET
            due_date = ?,
            discharge_date = COALESCE(?, discharge_date),
            renew_count = ?,
            is_renewable = ?,
            is_read = COALESCE(?, is_read),
            cover_url = COALESCE(?, cover_url),
            description = COALESCE(?, description),
            updated_at = ?
          WHERE user_id = ? AND charge_id = ?`,
        )
        .bind(
          record.due_date,
          record.discharge_date ?? null,
          record.renew_count,
          record.is_renewable ?? null,
          record.is_read ?? null,
          record.cover_url ?? null,
          record.description ?? null,
          now,
          userId,
          record.charge_id,
        )
        .run();

      console.log(`[BookRepository] Updated book: ${record.title}`);
    } else {
      // Insert new record
      const insert = this.db
        .prepare(
          `INSERT INTO books (
            user_id, charge_id, isbn, isbn13, title, author, publisher,
            cover_url, description, pub_date, charge_date, due_date,
            discharge_date, renew_count, is_renewable, is_read, source,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          userId,
          record.charge_id,
          record.isbn,
          record.isbn13,
          record.title,
          record.author,
          record.publisher,
          record.cover_url,
          record.description,
          record.pub_date,
          record.charge_date,
          record.due_date,
          record.discharge_date ?? null,
          record.renew_count,
          record.is_renewable ?? null,
          record.is_read ?? 0,
          record.source ?? 'library',
          now,
          now,
        )
        .run();
      await rejectManualIsbnConflict(insert);

      console.log(`[BookRepository] Saved new book: ${record.title}`);
    }
  }

  /**
   * Update the read status of a book. A manual book has no library return, so
   * finishing or abandoning it discharges it (keeping an earlier discharge
   * date) and marking it unread puts it back on loan. Library books keep the
   * discharge_date the library sync wrote.
   * @param userId - Owner of the book
   * @param id - Database ID of the book
   * @param readStatus - New read status
   * @param manualDischargeDate - Discharge date (YYYY-MM-DD) for a manual book
   * @returns false when the user has no book with this id
   */
  async updateReadStatus(
    userId: number,
    id: number,
    readStatus: ReadStatus,
    manualDischargeDate: string = getTodayString(),
  ): Promise<boolean> {
    const now = new Date().toISOString();
    const value = fromReadStatus(readStatus);
    const update = this.db
      .prepare(
        `UPDATE books SET
          is_read = ?,
          discharge_date = CASE
            WHEN source <> 'manual' THEN discharge_date
            WHEN ? = 0 THEN NULL
            ELSE COALESCE(discharge_date, ?)
          END,
          updated_at = ?
        WHERE id = ? AND user_id = ?`,
      )
      .bind(value, value, manualDischargeDate, now, id, userId)
      .run();
    const result = await rejectManualIsbnConflict(update);

    const updated = result.meta.changes > 0;
    if (updated) {
      console.log(
        `[BookRepository] Updated read status for book ${id}: ${readStatus}`,
      );
    }
    return updated;
  }

  /**
   * Find a book record by charge ID
   * @param chargeId - Charge ID to search for
   */
  async findByChargeId(
    userId: number,
    chargeId: string,
  ): Promise<BookRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM books WHERE user_id = ? AND charge_id = ?')
      .bind(userId, chargeId)
      .first<BookRecord>();

    return result ?? null;
  }

  /**
   * Find a book record by ISBN
   * @param isbn - ISBN to search for
   */
  async findByIsbn(
    userId: number,
    isbn: string,
    limit = 10,
  ): Promise<BookRecord[]> {
    // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-076
    const result = await this.db
      .prepare(
        'SELECT * FROM books WHERE user_id = ? AND isbn = ? ORDER BY charge_date DESC LIMIT ?',
      )
      .bind(userId, isbn, limit)
      .all<BookRecord>();

    return result.results;
  }

  /**
   * Find an on-loan manual book by ISBN, to refuse a duplicate registration
   * @param isbn - ISBN the manual book was registered with
   */
  async findOnLoanManualBookByIsbn(
    userId: number,
    isbn: string,
  ): Promise<BookRecord | null> {
    const result = await this.db
      .prepare(
        "SELECT * FROM books WHERE user_id = ? AND source = 'manual' AND discharge_date IS NULL AND isbn = ? LIMIT 1",
      )
      .bind(userId, isbn)
      .first<BookRecord>();

    return result ?? null;
  }

  /**
   * Find a library book record by ISBN and charge date. Manual books are
   * excluded so library return history never matches them.
   * @param isbn - ISBN to search for
   * @param chargeDate - Charge date to match
   */
  async findByIsbnAndChargeDate(
    userId: number,
    isbn: string,
    chargeDate: string,
  ): Promise<BookRecord | null> {
    const result = await this.db
      .prepare(
        "SELECT * FROM books WHERE user_id = ? AND source = 'library' AND isbn = ? AND charge_date = ? LIMIT 1",
      )
      .bind(userId, isbn, chargeDate)
      .first<BookRecord>();

    return result ?? null;
  }

  /**
   * Find library books currently on loan that are due within the given date
   * range (inclusive). Manual books have no library due date.
   * @param fromDate - Start date in YYYY-MM-DD format (usually today)
   * @param toDate - End date in YYYY-MM-DD format
   */
  async findDueSoonBooks(
    userId: number,
    fromDate: string,
    toDate: string,
  ): Promise<BookRecord[]> {
    const result = await this.db
      .prepare(
        "SELECT * FROM books WHERE user_id = ? AND source = 'library' AND discharge_date IS NULL AND due_date >= ? AND due_date <= ? ORDER BY due_date ASC",
      )
      .bind(userId, fromDate, toDate)
      .all<BookRecord>();

    return result.results;
  }

  async findLoansDueForReturn(
    userId: number,
    renewalLimit: number,
  ): Promise<{ dueDate: string; title: string }[]> {
    const result = await this.db
      .prepare(
        `SELECT due_date, title
         FROM books
         WHERE user_id = ?
           AND source = 'library'
           AND discharge_date IS NULL
           AND typeof(due_date) = 'text'
           AND (is_renewable = 0 OR renew_count >= ?)
         ORDER BY title`,
      )
      .bind(userId, renewalLimit)
      .all<{ due_date: string; title: string }>();

    return result.results.map(({ due_date, title }) => ({
      dueDate: due_date,
      title,
    }));
  }

  /**
   * Get all book records
   */
  async findAll(userId: number): Promise<BookRecord[]> {
    const result = await this.db
      .prepare(
        'SELECT * FROM books WHERE user_id = ? ORDER BY charge_date DESC',
      )
      .bind(userId)
      .all<BookRecord>();

    return result.results;
  }

  /**
   * Find a book record by database ID
   * @param id - Database ID to search for
   */
  async findById(userId: number, id: number): Promise<BookRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM books WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .first<BookRecord>();

    return result ?? null;
  }

  /**
   * Log a renewal action. renewal_logs carries no user_id: its rows come from
   * the owner's library account only and are read through books.
   * @param log - Renewal log entry
   */
  async logRenewal(log: RenewalLog): Promise<void> {
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `INSERT INTO renewal_logs (
          charge_id, action, status, message, created_at
        ) VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(log.charge_id, log.action, log.status, log.message, now)
      .run();

    console.log(
      `[BookRepository] Logged renewal: ${log.action} - ${log.status}`,
    );
  }

  /**
   * Get renewal logs for a charge
   * @param chargeId - Charge ID to get logs for
   */
  async getRenewalLogs(
    userId: number,
    chargeId: string,
  ): Promise<RenewalLog[]> {
    const result = await this.db
      .prepare(
        `SELECT r.* FROM renewal_logs r
         WHERE r.charge_id = ?
           AND EXISTS (
             SELECT 1 FROM books b WHERE b.user_id = ? AND b.charge_id = r.charge_id
           )
         ORDER BY r.created_at DESC`,
      )
      .bind(chargeId, userId)
      .all<RenewalLog>();

    return result.results;
  }
}

/**
 * Convert charge and book info to a book record
 * @param charge - Library charge data
 * @param bookInfo - Optional Aladin book info
 */
export function createBookRecord(
  charge: Charge | ChargeHistory,
  bookInfo?: BookInfo | null,
): BookRecord {
  const normalizedChargeDate = normalizeDateString(charge.chargeDate);
  const normalizedDueDate = normalizeKstDate(charge.dueDate) ?? '';
  const isRenewable = 'isRenewable' in charge ? charge.isRenewable : undefined;
  return {
    charge_id: String(charge.id),
    isbn: charge.biblio.isbn || bookInfo?.isbn || '',
    isbn13: bookInfo?.isbn13 || null,
    title: bookInfo?.title || charge.biblio.titleStatement,
    author: bookInfo?.author || '',
    publisher: bookInfo?.publisher || null,
    cover_url: bookInfo?.coverUrl || null,
    description: bookInfo?.description || null,
    pub_date: bookInfo?.pubDate || null,
    charge_date: normalizedChargeDate,
    due_date: normalizedDueDate,
    discharge_date:
      'dischargeDate' in charge ? (charge.dischargeDate ?? null) : null,
    renew_count: charge.renewCnt ?? 0,
    is_renewable: isRenewable === true ? 1 : isRenewable === false ? 0 : null,
  };
}

/**
 * Create a book repository instance
 * @param db - D1 database binding
 */
export function createBookRepository(db: D1Database): BookRepository {
  return new BookRepository(db);
}
