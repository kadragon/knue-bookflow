/**
 * Date utility functions
 * Trace: spec_id: SPEC-renewal-001, task_id: TASK-004
 */

/**
 * Calculate the number of days between two dates
 * @param date1 - First date
 * @param date2 - Second date
 * @returns Number of days difference
 */
export function daysBetween(date1: Date, date2: Date): number {
  const oneDay = 24 * 60 * 60 * 1000; // milliseconds in a day
  const diffMs = date2.getTime() - date1.getTime();
  return Math.round(diffMs / oneDay);
}

/**
 * Check if a date is within N days from today
 * @param dateString - Date string in YYYY-MM-DD format
 * @param days - Number of days threshold
 * @returns true if date is within N days from today
 */
export function isWithinDays(dateString: string, days: number): boolean {
  const targetDate = new Date(dateString);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  targetDate.setHours(0, 0, 0, 0);

  const diff = daysBetween(today, targetDate);
  return diff >= 0 && diff <= days;
}

/**
 * Check if a date is today
 * @param dateString - Date string in YYYY-MM-DD format
 * @returns true if date is today
 */
export function isToday(dateString: string): boolean {
  const targetDate = new Date(dateString);
  const today = new Date();

  return (
    targetDate.getFullYear() === today.getFullYear() &&
    targetDate.getMonth() === today.getMonth() &&
    targetDate.getDate() === today.getDate()
  );
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
 * @returns Today's date string
 */
export function getTodayString(): string {
  return formatDate(new Date());
}
