/**
 * Planned Loans Handler Tests
 *
 * Trace: spec_id: SPEC-loan-plan-001
 *        task_id: TASK-043, TASK-047
 */

import { describe, expect, it } from 'vitest';
import type { Env, PlannedLoanRecord } from '../../types';
import {
  handleCreatePlannedLoan,
  handleDeletePlannedLoan,
  handleGetPlannedLoans,
} from '../planned-loans-handler';

class FakePlannedRepo {
  items: PlannedLoanRecord[] = [];

  async findAll(): Promise<PlannedLoanRecord[]> {
    return this.items;
  }

  async findByLibraryBiblioId(
    libraryBiblioId: number,
  ): Promise<PlannedLoanRecord | null> {
    return (
      this.items.find((i) => i.library_biblio_id === libraryBiblioId) || null
    );
  }

  async create(
    record: Omit<PlannedLoanRecord, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<PlannedLoanRecord> {
    const now = new Date().toISOString();
    const created: PlannedLoanRecord = {
      ...record,
      id: this.items.length + 1,
      created_at: now,
      updated_at: now,
    };
    this.items.push(created);
    return created;
  }

  async deleteById(id: number): Promise<boolean> {
    const before = this.items.length;
    this.items = this.items.filter((i) => i.id !== id);
    return this.items.length !== before;
  }
}

function makeEnv(): Env {
  return {
    DB: null as unknown as D1Database,
    ASSETS: { fetch: async () => new Response('') } as unknown as Fetcher,
    LIBRARY_USER_ID: '',
    LIBRARY_PASSWORD: '',
    ALADIN_API_KEY: '',
    TELEGRAM_BOT_TOKEN: '',
    TELEGRAM_CHAT_ID: '',
    ENVIRONMENT: 'test',
  };
}

describe('handleCreatePlannedLoan', () => {
  it('stores a planned loan and returns view model (TEST-loan-plan-001)', async () => {
    const repo = new FakePlannedRepo();
    const payload = {
      libraryId: 123,
      source: 'search',
      title: '테스트 책',
      author: '저자 A',
      publisher: '출판사',
      year: '2024',
      isbn: '9781234567890',
      coverUrl: 'https://example.com/cover.jpg',
      materialType: '단행본',
      branchVolumes: [
        { branchId: 1, branchName: '본관', volumes: 2 },
        { branchId: 2, branchName: '분관', volumes: 1 },
      ],
    };

    const request = new Request('http://localhost/api/planned-loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const response = await handleCreatePlannedLoan(makeEnv(), request, repo);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { item: Record<string, unknown> };

    expect(body.item).toMatchObject({
      libraryId: 123,
      source: 'search',
      title: '테스트 책',
      branchVolumes: payload.branchVolumes,
    });
    expect(repo.items).toHaveLength(1);
    expect(repo.items[0].library_biblio_id).toBe(123);
  });

  it('rejects duplicate libraryId with 409 (TEST-loan-plan-001)', async () => {
    const repo = new FakePlannedRepo();
    await repo.create({
      library_biblio_id: 123,
      source: 'new_books',
      title: 'Already',
      author: 'Author',
      publisher: null,
      year: null,
      isbn: null,
      cover_url: null,
      material_type: null,
      branch_volumes: '[]',
    });

    const request = new Request('http://localhost/api/planned-loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        libraryId: 123,
        source: 'search',
        title: 'Dup',
        author: 'A',
      }),
    });

    const response = await handleCreatePlannedLoan(makeEnv(), request, repo);
    expect(response.status).toBe(409);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/already exists/i);
  });

  it('validates required fields (TEST-loan-plan-001)', async () => {
    const repo = new FakePlannedRepo();
    const request = new Request('http://localhost/api/planned-loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'search' }),
    });

    const response = await handleCreatePlannedLoan(makeEnv(), request, repo);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/libraryId/);
  });

  it('accepts branch volumes that use id/name/volume shape (TEST-loan-plan-007)', async () => {
    const repo = new FakePlannedRepo();
    const request = new Request('http://localhost/api/planned-loans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        libraryId: 321,
        source: 'new_books',
        title: '식탐 해방',
        author: 'Brewer, Judson',
        branchVolumes: [
          {
            id: 1,
            name: '한국교원대학교도서관',
            volume: '616.8526 B847ㅅㄱ',
            cState: '대출가능',
            cStateCode: 'READY',
            hasItem: true,
          },
        ],
      }),
    });

    const response = await handleCreatePlannedLoan(makeEnv(), request, repo);

    expect(response.status).toBe(201);
    const body = (await response.json()) as { item: Record<string, unknown> };
    expect(body.item.branchVolumes).toEqual([
      { branchId: 1, branchName: '한국교원대학교도서관', volumes: 1 },
    ]);
    expect(JSON.parse(repo.items[0].branch_volumes)).toEqual([
      { branchId: 1, branchName: '한국교원대학교도서관', volumes: 1 },
    ]);
  });
});

describe('handleGetPlannedLoans', () => {
  it('returns sorted planned loans with parsed branches (TEST-loan-plan-002)', async () => {
    const repo = new FakePlannedRepo();
    repo.items = [
      {
        id: 1,
        library_biblio_id: 100,
        source: 'search',
        title: 'Old',
        author: 'A',
        publisher: null,
        year: '2023',
        isbn: null,
        cover_url: null,
        material_type: null,
        branch_volumes: '[{"branchId":1,"branchName":"본관","volumes":1}]',
        created_at: '2025-01-01T00:00:00.000Z',
        updated_at: '2025-01-01T00:00:00.000Z',
      },
      {
        id: 2,
        library_biblio_id: 200,
        source: 'new_books',
        title: 'New',
        author: 'B',
        publisher: 'Pub',
        year: '2024',
        isbn: '978...',
        cover_url: 'http://example.com',
        material_type: '단행본',
        branch_volumes:
          '[{"branchId":2,"branchName":"분관","volumes":3},{"branchId":1,"branchName":"본관","volumes":1}]',
        created_at: '2025-02-01T00:00:00.000Z',
        updated_at: '2025-02-01T00:00:00.000Z',
      },
    ];

    const response = await handleGetPlannedLoans(makeEnv(), repo);
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      items: Record<string, unknown>[];
    };
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ title: 'New', libraryId: 200 });
    expect(body.items[0].branchVolumes).toEqual([
      { branchId: 2, branchName: '분관', volumes: 3 },
      { branchId: 1, branchName: '본관', volumes: 1 },
    ]);
  });
});

describe('handleDeletePlannedLoan', () => {
  it('deletes and returns success flag (TEST-loan-plan-003)', async () => {
    const repo = new FakePlannedRepo();
    await repo.create({
      library_biblio_id: 10,
      source: 'search',
      title: 'Delete me',
      author: 'A',
      publisher: null,
      year: null,
      isbn: null,
      cover_url: null,
      material_type: null,
      branch_volumes: '[]',
    });

    const response = await handleDeletePlannedLoan(makeEnv(), 1, repo);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { success: boolean };
    expect(body.success).toBe(true);
    expect(repo.items).toHaveLength(0);

    const second = await handleDeletePlannedLoan(makeEnv(), 99, repo);
    const secondBody = (await second.json()) as { success: boolean };
    expect(secondBody.success).toBe(false);
  });
});
