import { describe, expect, it } from 'vitest';
import { deriveBookViewModel, sortBooks } from '../handlers/books-handler';
import type { BookRecord } from '../types';

describe('books-handler', () => {
  describe('sortBooks', () => {
    it('should sort unread books before read books', () => {
      const records: BookRecord[] = [
        {
          charge_id: '1',
          isbn: '123',
          title: 'Read Book',
          author: 'Author',
          publisher: 'Pub',
          cover_url: null,
          description: null,
          charge_date: '2023-01-01',
          due_date: '2023-01-14',
          renew_count: 0,
          is_read: 1,
        },
        {
          charge_id: '2',
          isbn: '456',
          title: 'Unread Book',
          author: 'Author',
          publisher: 'Pub',
          cover_url: null,
          description: null,
          charge_date: '2023-01-01',
          due_date: '2023-01-14',
          renew_count: 0,
          is_read: 0,
        },
      ];

      const sorted = sortBooks(records);
      expect(sorted[0].title).toBe('Unread Book');
      expect(sorted[1].title).toBe('Read Book');
    });

    it('should sort by charge date descending within same read status', () => {
      const records: BookRecord[] = [
        {
          charge_id: '1',
          isbn: '123',
          title: 'Old Unread',
          author: 'Author',
          publisher: 'Pub',
          cover_url: null,
          description: null,
          charge_date: '2023-01-01',
          due_date: '2023-01-14',
          renew_count: 0,
          is_read: 0,
        },
        {
          charge_id: '2',
          isbn: '456',
          title: 'New Unread',
          author: 'Author',
          publisher: 'Pub',
          cover_url: null,
          description: null,
          charge_date: '2023-01-02',
          due_date: '2023-01-15',
          renew_count: 0,
          is_read: 0,
        },
      ];

      const sorted = sortBooks(records);
      expect(sorted[0].title).toBe('New Unread');
      expect(sorted[1].title).toBe('Old Unread');
    });
  });

  describe('deriveBookViewModel', () => {
    it('should map is_read to isRead boolean', () => {
      const record: BookRecord = {
        charge_id: '1',
        isbn: '123',
        title: 'Book',
        author: 'Author',
        publisher: 'Pub',
        cover_url: null,
        description: null,
        charge_date: '2023-01-01',
        due_date: '2023-01-14',
        renew_count: 0,
        is_read: 1,
      };

      const viewModel = deriveBookViewModel(record);
      expect(viewModel.isRead).toBe(true);
    });

    it('should map is_read 0 to isRead false', () => {
      const record: BookRecord = {
        charge_id: '1',
        isbn: '123',
        title: 'Book',
        author: 'Author',
        publisher: 'Pub',
        cover_url: null,
        description: null,
        charge_date: '2023-01-01',
        due_date: '2023-01-14',
        renew_count: 0,
        is_read: 0,
      };

      const viewModel = deriveBookViewModel(record);
      expect(viewModel.isRead).toBe(false);
    });
  });
});
