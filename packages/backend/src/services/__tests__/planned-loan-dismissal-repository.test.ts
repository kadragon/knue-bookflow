import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPlannedLoanDismissalRepository,
  PlannedLoanDismissalRepository,
} from '../planned-loan-dismissal-repository';

const USER_ID = 7;

function createMockD1(): D1Database {
  const mockPrepare = vi.fn();
  const mockBind = vi.fn();
  const mockRun = vi.fn();
  const mockAll = vi.fn();

  mockPrepare.mockReturnValue({
    bind: mockBind,
  });

  mockBind.mockReturnValue({
    run: mockRun,
    all: mockAll,
  });

  return {
    prepare: mockPrepare,
    dump: vi.fn(),
    batch: vi.fn(),
    exec: vi.fn(),
  } as unknown as D1Database;
}

describe('PlannedLoanDismissalRepository', () => {
  let mockDb: D1Database;
  let repository: PlannedLoanDismissalRepository;

  beforeEach(() => {
    mockDb = createMockD1();
    repository = new PlannedLoanDismissalRepository(mockDb);
  });

  it('marks library biblio id as dismissed via INSERT OR IGNORE', async () => {
    const mockBind = vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    });
    (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
      bind: mockBind,
    });

    await repository.markDismissed(USER_ID, 123);

    expect(mockDb.prepare).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR IGNORE INTO planned_loan_dismissals'),
    );
    expect(mockBind).toHaveBeenCalledWith(USER_ID, 123);
  });

  it('returns all dismissed library biblio ids', async () => {
    const mockBind = vi.fn().mockReturnValue({
      all: vi.fn().mockResolvedValue({
        results: [{ library_biblio_id: 123 }, { library_biblio_id: 456 }],
      }),
    });
    (mockDb.prepare as ReturnType<typeof vi.fn>).mockReturnValue({
      bind: mockBind,
    });

    const ids = await repository.findAllLibraryBiblioIds(USER_ID);

    expect(ids).toEqual([123, 456]);
    expect(mockDb.prepare).toHaveBeenCalledWith(
      'SELECT library_biblio_id FROM planned_loan_dismissals WHERE user_id = ?',
    );
    expect(mockBind).toHaveBeenCalledWith(USER_ID);
  });
});

describe('createPlannedLoanDismissalRepository', () => {
  it('creates repository instance', () => {
    const mockDb = createMockD1();
    const repository = createPlannedLoanDismissalRepository(mockDb);
    expect(repository).toBeInstanceOf(PlannedLoanDismissalRepository);
  });
});
