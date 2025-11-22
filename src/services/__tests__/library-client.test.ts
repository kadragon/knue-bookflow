/**
 * Library client tests
 * Trace: spec_id: SPEC-auth-001, SPEC-charges-001, task_id: TASK-009
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryApiError, LibraryClient } from '../library-client';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('LibraryClient', () => {
  let client: LibraryClient;

  beforeEach(() => {
    client = new LibraryClient();
    mockFetch.mockReset();
  });

  describe('login', () => {
    it('should authenticate successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          code: 'success',
          message: 'Login successful',
          data: {
            accessToken: 'test-token-123',
            id: 'user1',
            name: 'Test User',
          },
        }),
        headers: new Headers({
          'set-cookie': 'session=abc123; Path=/',
        }),
      });

      const session = await client.login({
        loginId: 'testuser',
        password: 'testpass',
      });

      expect(session.accessToken).toBe('test-token-123');
      expect(client.isAuthenticated()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lib.knue.ac.kr/pyxis-api/api/login',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ loginId: 'testuser', password: 'testpass' }),
        }),
      );
    });

    it('should throw error on invalid credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid username or password',
          data: null,
        }),
        headers: new Headers(),
      });

      await expect(
        client.login({ loginId: 'wrong', password: 'wrong' }),
      ).rejects.toThrow(LibraryApiError);
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });
      // retry attempt
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await expect(
        client.login({ loginId: 'user', password: 'pass' }),
      ).rejects.toThrow('Login failed with status 500');
    });
  });

  describe('getCharges', () => {
    beforeEach(async () => {
      // Login first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: 'token', id: '1', name: 'User' },
        }),
        headers: new Headers({ 'set-cookie': 'session=abc' }),
      });
      await client.login({ loginId: 'user', password: 'pass' });
      mockFetch.mockReset();
    });

    it('should fetch charges successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            list: [
              {
                id: 1,
                renewCnt: 0,
                chargeDate: '2025-01-01',
                dueDate: '2025-01-15',
                volume: {
                  id: 1,
                  barcode: '123',
                  shelfLocCode: 'A1',
                  callNo: '000',
                  bib: {
                    id: 1,
                    title: 'Test Book',
                    author: 'Author',
                    isbn: '1234567890',
                  },
                },
              },
            ],
            totalCount: 1,
          },
        }),
      });

      const charges = await client.getCharges();

      expect(charges).toHaveLength(1);
      expect(charges[0].volume.bib.title).toBe('Test Book');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lib.knue.ac.kr/pyxis-api/8/api/charges?max=20&offset=0',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'pyxis-auth-token': 'token',
          }),
        }),
      );
    });

    it('should throw error when not authenticated', async () => {
      client.clearSession();

      await expect(client.getCharges()).rejects.toThrow('Not authenticated');
    });

    it('should paginate when more than one page of charges', async () => {
      // first login response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: 'token', id: '1', name: 'User' },
        }),
        headers: new Headers({ 'set-cookie': 'session=abc' }),
      });
      await client.login({ loginId: 'user', password: 'pass' });
      mockFetch.mockReset();

      // first page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            list: [
              {
                id: 1,
                renewCnt: 0,
                chargeDate: '2025-01-01',
                dueDate: '2025-01-15',
                volume: {
                  id: 1,
                  barcode: '123',
                  shelfLocCode: 'A1',
                  callNo: '000',
                  bib: { id: 1, title: 'Book 1', author: 'A', isbn: '111' },
                },
              },
            ],
            totalCount: 2,
          },
        }),
      });

      // second page
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            list: [
              {
                id: 2,
                renewCnt: 0,
                chargeDate: '2025-01-02',
                dueDate: '2025-01-16',
                volume: {
                  id: 2,
                  barcode: '124',
                  shelfLocCode: 'A1',
                  callNo: '000',
                  bib: { id: 2, title: 'Book 2', author: 'B', isbn: '222' },
                },
              },
            ],
            totalCount: 2,
          },
        }),
      });

      const charges = await client.getCharges();

      expect(charges).toHaveLength(2);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('renewCharge', () => {
    beforeEach(async () => {
      // Login first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: 'token', id: '1', name: 'User' },
        }),
        headers: new Headers({ 'set-cookie': 'session=abc' }),
      });
      await client.login({ loginId: 'user', password: 'pass' });
      mockFetch.mockReset();
    });

    it('should renew charge successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 123,
            renewCnt: 1,
            dueDate: '2025-01-29',
          },
        }),
      });

      const result = await client.renewCharge(123);

      expect(result.data.dueDate).toBe('2025-01-29');
      expect(result.data.renewCnt).toBe(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://lib.knue.ac.kr/pyxis-api/8/api/renew-charges/123',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ circulationMethodCode: 'PYXIS' }),
        }),
      );
    });

    it('should handle renewal failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: false,
          code: 'RESERVED',
          message: 'Book is reserved by another user',
        }),
      });

      await expect(client.renewCharge(123)).rejects.toThrow('Book is reserved');
    });

    it('should retry on transient error and succeed', async () => {
      // login first
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: 'token', id: '1', name: 'User' },
        }),
        headers: new Headers({ 'set-cookie': 'session=abc' }),
      });
      await client.login({ loginId: 'user', password: 'pass' });
      mockFetch.mockReset();

      // first attempt: 500
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      // second attempt: success
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { id: 123, renewCnt: 1, dueDate: '2025-01-29' },
        }),
      });

      const result = await client.renewCharge(123);
      expect(result.data.renewCnt).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
