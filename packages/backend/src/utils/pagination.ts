/**
 * Pagination parsing utilities
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-077
 */

import { jsonResponse } from './response';

type RangeOption = {
  default: number;
  min: number;
  max?: number;
  errorMessage: string;
};

type PaginationOptions = {
  max?: RangeOption;
  offset?: RangeOption;
  days?: RangeOption;
};

export type PaginationValues = {
  max?: number;
  offset?: number;
  days?: number;
};

export type PaginationParseResult =
  | { values: PaginationValues }
  | { response: Response };

function parseIntParam(value: string | null, fallback: number): number {
  if (!value) {
    return fallback;
  }
  return parseInt(value, 10);
}

function isValidRange(value: number, option: RangeOption): boolean {
  if (Number.isNaN(value)) {
    return false;
  }
  if (value < option.min) {
    return false;
  }
  if (option.max !== undefined && value > option.max) {
    return false;
  }
  return true;
}

export function parsePaginationParams(
  params: URLSearchParams,
  options: PaginationOptions,
): PaginationParseResult {
  const values: PaginationValues = {};

  if (options.max) {
    const value = parseIntParam(params.get('max'), options.max.default);
    if (!isValidRange(value, options.max)) {
      return {
        response: jsonResponse(
          { error: options.max.errorMessage },
          { status: 400 },
        ),
      };
    }
    values.max = value;
  }

  if (options.offset) {
    const value = parseIntParam(params.get('offset'), options.offset.default);
    if (!isValidRange(value, options.offset)) {
      return {
        response: jsonResponse(
          { error: options.offset.errorMessage },
          { status: 400 },
        ),
      };
    }
    values.offset = value;
  }

  if (options.days) {
    const value = parseIntParam(params.get('days'), options.days.default);
    if (!isValidRange(value, options.days)) {
      return {
        response: jsonResponse(
          { error: options.days.errorMessage },
          { status: 400 },
        ),
      };
    }
    values.days = value;
  }

  return { values };
}
