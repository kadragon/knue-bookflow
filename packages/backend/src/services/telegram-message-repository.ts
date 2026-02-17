/**
 * Repository for telegram_message_notes mapping table
 * Maps Telegram message_id -> note_id for reply-based note correction
 */

export class TelegramMessageRepository {
  constructor(private db: D1Database) {}

  async save(telegramMessageId: number, noteId: number): Promise<void> {
    await this.db
      .prepare(
        'INSERT OR REPLACE INTO telegram_message_notes (telegram_message_id, note_id) VALUES (?, ?)',
      )
      .bind(telegramMessageId, noteId)
      .run();
  }

  async findNoteIdByMessageId(
    telegramMessageId: number,
  ): Promise<number | null> {
    const row = await this.db
      .prepare(
        'SELECT note_id FROM telegram_message_notes WHERE telegram_message_id = ?',
      )
      .bind(telegramMessageId)
      .first<{ note_id: number }>();

    return row?.note_id ?? null;
  }
}

export function createTelegramMessageRepository(
  db: D1Database,
): TelegramMessageRepository {
  return new TelegramMessageRepository(db);
}
