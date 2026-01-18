/**
 * Book Repository
 * Data access layer for D1 database operations
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
import { normalizeDateString } from '../utils/date';
import { fromReadStatus } from '../utils/read-status';

export class BookRepository {
  constructor(private db: D1Database) {}

  /**
   * Save or update a book record
   * @param record - Book record to save
   */
  async saveBook(record: BookRecord): Promise<void> {
    const now = new Date().toISOString();

    // Check if record exists
    const existing = await this.findByChargeId(record.charge_id);

    if (existing) {
      // Update existing record
      await this.db
        .prepare(
          `UPDATE books SET
            due_date = ?,
            discharge_date = COALESCE(?, discharge_date),
            renew_count = ?,
            is_read = COALESCE(?, is_read),
            cover_url = COALESCE(?, cover_url),
            description = COALESCE(?, description),
            updated_at = ?
          WHERE charge_id = ?`,
        )
        .bind(
          record.due_date,
          record.discharge_date ?? null,
          record.renew_count,
          record.is_read ?? null,
          record.cover_url ?? null,
          record.description ?? null,
          now,
          record.charge_id,
        )
        .run();

      console.log(`[BookRepository] Updated book: ${record.title}`);
    } else {
      // Insert new record
      await this.db
        .prepare(
          `INSERT INTO books (
            charge_id, isbn, isbn13, title, author, publisher,
            cover_url, description, pub_date, charge_date, due_date,
            discharge_date, renew_count, is_read, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
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
          record.is_read ?? 0,
          now,
          now,
        )
        .run();

      console.log(`[BookRepository] Saved new book: ${record.title}`);
    }
  }

  /**
   * Update the read status of a book
   * @param id - Database ID of the book
   * @param readStatus - New read status
   */
  async updateReadStatus(id: number, readStatus: ReadStatus): Promise<void> {
    const now = new Date().toISOString();
    const value = fromReadStatus(readStatus);
    await this.db
      .prepare(
        `UPDATE books SET
          is_read = ?,
          updated_at = ?
        WHERE id = ?`,
      )
      .bind(value, now, id)
      .run();

    console.log(
      `[BookRepository] Updated read status for book ${id}: ${readStatus}`,
    );
  }

  /**
   * Find a book record by charge ID
   * @param chargeId - Charge ID to search for
   */
  async findByChargeId(chargeId: string): Promise<BookRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM books WHERE charge_id = ?')
      .bind(chargeId)
      .first<BookRecord>();

    return result || null;
  }

  /**
   * Find a book record by ISBN
   * @param isbn - ISBN to search for
   */
  async findByIsbn(isbn: string, limit = 10): Promise<BookRecord[]> {
    // Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-076
    const result = await this.db
      .prepare(
        'SELECT * FROM books WHERE isbn = ? ORDER BY charge_date DESC LIMIT ?',
      )
      .bind(isbn, limit)
      .all<BookRecord>();

    return result.results;
  }

  /**
   * Get all book records
   */
  async findAll(): Promise<BookRecord[]> {
    const result = await this.db
      .prepare('SELECT * FROM books ORDER BY charge_date DESC')
      .all<BookRecord>();

    return result.results;
  }

  /**
   * Find a book record by database ID
   * @param id - Database ID to search for
   */
  async findById(id: number): Promise<BookRecord | null> {
    const result = await this.db
      .prepare('SELECT * FROM books WHERE id = ?')
      .bind(id)
      .first<BookRecord>();

    return result || null;
  }

  /**
   * Log a renewal action
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
  async getRenewalLogs(chargeId: string): Promise<RenewalLog[]> {
    const result = await this.db
      .prepare(
        'SELECT * FROM renewal_logs WHERE charge_id = ? ORDER BY created_at DESC',
      )
      .bind(chargeId)
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
  const normalizedDueDate = normalizeDateString(charge.dueDate);
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
  };
}

/**
 * Create a book repository instance
 * @param db - D1 database binding
 */
export function createBookRepository(db: D1Database): BookRepository {
  return new BookRepository(db);
}
