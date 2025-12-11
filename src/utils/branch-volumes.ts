/**
 * Branch volume normalization helpers
 * Trace: spec_id: SPEC-loan-plan-001, task_id: TASK-047
 */

import type { BranchAvailability } from '../types';

export interface RawBranchVolume {
  branchId?: number | string | null;
  id?: number | string | null;
  branchName?: string | null;
  name?: string | null;
  volumes?: number | string | null;
  volume?: number | string | null;
  hasItem?: boolean | null;
}

function toNumber(value: number | string | null | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[-]?\d+$/.test(trimmed)) return null;
    const parsed = Number.parseInt(trimmed, 10);
    return parsed;
  }
  return null;
}

export function normalizeBranchVolume(
  value: unknown,
): BranchAvailability | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as RawBranchVolume;
  const branchId = toNumber(raw.branchId ?? raw.id);
  const branchName = (raw.branchName ?? raw.name ?? '').trim();

  if (!branchId || !branchName) return null;

  const volumesRaw = raw.volumes ?? raw.volume;
  const volumes = toNumber(volumesRaw);

  return {
    branchId,
    branchName,
    volumes: volumes !== null ? Math.max(0, volumes) : raw.hasItem ? 1 : 0,
  };
}

export function normalizeBranchVolumes(values: unknown): BranchAvailability[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((v) => normalizeBranchVolume(v))
    .filter((v): v is BranchAvailability => Boolean(v));
}
