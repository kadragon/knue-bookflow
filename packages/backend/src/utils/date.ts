/**
 * Date utility functions
 * Trace: spec_id: SPEC-renewal-001, SPEC-backend-refactor-001, task_id: TASK-004, TASK-015, TASK-079
 */

import { DAY_MS, KST_OFFSET_MINUTES } from './constants';

function zoneDayNumber(ms: number, offsetMinutes: number): number {
  return Math.floor((ms + offsetMinutes * 60 * 1000) / DAY_MS);
}

/**
 * Calculate the number of days between two dates
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days difference
 */
export function daysBetween(date1: Date, date2: Date): number {
  const diffMs = date2.getTime() - date1.getTime();
  return Math.round(diffMs / DAY_MS);
}

/**
 * Check if a date is within N days from today
 * @param dateString - Date string in YYYY-MM-DD format
 * @param days - Number of days threshold
 * @param offsetMinutes - Timezone offset in minutes (default KST +540)
 * @returns true if date is within N days from today
 */
export function isWithinDays(
  dateString: string,
  days: number,
  offsetMinutes = KST_OFFSET_MINUTES,
): boolean {
  const targetMs = new Date(`${dateString}T00:00:00Z`).getTime();
  const target = zoneDayNumber(targetMs, offsetMinutes);
  const today = zoneDayNumber(Date.now(), offsetMinutes);

  const diff = target - today;
  return diff >= 0 && diff <= days;
}

/**
 * Check if a date is today
 * @param dateString - Date string in YYYY-MM-DD format
 * @param offsetMinutes - Timezone offset in minutes (default KST +540)
 * @returns true if date is today
 */
export function isToday(
  dateString: string,
  offsetMinutes = KST_OFFSET_MINUTES,
): boolean {
  const targetMs = new Date(`${dateString}T00:00:00Z`).getTime();
  const target = zoneDayNumber(targetMs, offsetMinutes);
  const today = zoneDayNumber(Date.now(), offsetMinutes);

  return target === today;
}

/**
 * Format date to YYYY-MM-DD string
 * @param date - Date object
 * @returns Formatted date string
 */
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Get today's date as YYYY-MM-DD string
 * @param offsetMinutes - Timezone offset in minutes (default KST +540)
 * @returns Today's date string
 */
export function getTodayString(offsetMinutes = KST_OFFSET_MINUTES): string {
  const shifted = new Date(Date.now() + offsetMinutes * 60 * 1000);
  return formatDate(shifted);
}
