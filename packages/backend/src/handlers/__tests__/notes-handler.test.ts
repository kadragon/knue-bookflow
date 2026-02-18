import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env, NoteViewModel } from '../../types';
import {
  handleCreateNote,
  handleDeleteNote,
  handleGetNotes,
  handleUpdateNote,
} from '../notes-handler';

// Mock repositories
const mockBookRepo = {
  findById: vi.fn(),
};
const mockNoteRepo = {
  findByBookId: vi.fn(),
  create: vi.fn(),
  findById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

vi.mock('../../services', () => ({
  createBookRepository: () => mockBookRepo,
  createNoteRepository: () => mockNoteRepo,
}));

describe('Notes Handler', () => {
  const env = {
    DB: {},
  } as unknown as Env;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleGetNotes', () => {
    it('should return notes for existing book', async () => {
      mockBookRepo.findById.mockResolvedValue({ id: 1, title: 'Book' });
      mockNoteRepo.findByBookId.mockResolvedValue([
        {
          id: 1,
          book_id: 1,
          page_number: 10,
          content: 'Note 1',
          created_at: '2023-01-01',
          updated_at: '2023-01-01',
        },
      ]);

      const response = await handleGetNotes(env, 1);
      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=15');

      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.notes).toHaveLength(1);
      expect(body.notes[0].content).toBe('Note 1');
    });

    it('should return 404 if book not found', async () => {
      mockBookRepo.findById.mockResolvedValue(null);

      const response = await handleGetNotes(env, 999);
      expect(response.status).toBe(404);
    });
  });

  describe('handleCreateNote', () => {
    const validBody = { page_number: 10, content: 'Test Note' };

    it('should create note for existing book', async () => {
      mockBookRepo.findById.mockResolvedValue({ id: 1 });
      mockNoteRepo.create.mockResolvedValue({
        id: 100,
        book_id: 1,
        ...validBody,
        created_at: '2023-01-01',
        updated_at: '2023-01-01',
      });

      const response = await handleCreateNote(env, 1, validBody);
      expect(response.status).toBe(201);

      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.note?.id).toBe(100);
      expect(body.note?.content).toBe('Test Note');
    });

    it('should return 404 if book not found', async () => {
      mockBookRepo.findById.mockResolvedValue(null);

      const response = await handleCreateNote(env, 999, validBody);
      expect(response.status).toBe(404);
    });

    it('should validate page_number', async () => {
      const response = await handleCreateNote(env, 1, {
        ...validBody,
        page_number: -1,
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.error).toContain('positive number');
    });

    it('should validate content', async () => {
      const response = await handleCreateNote(env, 1, {
        ...validBody,
        content: '',
      });
      expect(response.status).toBe(400);
      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.error).toContain('page_number and content are required');
    });
  });

  describe('handleUpdateNote', () => {
    it('should update existing note', async () => {
      mockNoteRepo.findById.mockResolvedValue({ id: 100 });
      mockNoteRepo.update.mockResolvedValue({
        id: 100,
        page_number: 20,
        content: 'Updated',
        created_at: '2023-01-01',
        updated_at: '2023-01-02',
      });

      const response = await handleUpdateNote(env, 100, {
        page_number: 20,
        content: 'Updated',
      });
      expect(response.status).toBe(200);

      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.note?.pageNumber).toBe(20);
      expect(body.note?.content).toBe('Updated');
    });

    it('should return 404 if note not found', async () => {
      mockNoteRepo.findById.mockResolvedValue(null);

      const response = await handleUpdateNote(env, 999, { content: 'Update' });
      expect(response.status).toBe(404);
    });

    it('should validate partial updates', async () => {
      const response = await handleUpdateNote(env, 100, { page_number: -5 });
      expect(response.status).toBe(400);
    });

    it('should require at least one field', async () => {
      const response = await handleUpdateNote(env, 100, {});
      expect(response.status).toBe(400);
    });
  });

  describe('handleDeleteNote', () => {
    it('should delete existing note', async () => {
      mockNoteRepo.findById.mockResolvedValue({ id: 100 });
      mockNoteRepo.delete.mockResolvedValue(true);

      const response = await handleDeleteNote(env, 100);
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        notes: NoteViewModel[];
        note?: NoteViewModel;
        error?: string;
        success?: boolean;
      };
      expect(body.success).toBe(true);
    });

    it('should return 404 if note not found', async () => {
      mockNoteRepo.findById.mockResolvedValue(null);

      const response = await handleDeleteNote(env, 999);
      expect(response.status).toBe(404);
    });
  });
});
