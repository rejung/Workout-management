/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getLocalDateString } from './dateUtils';

/**
 * Utility module for consistent date range calculations across the application.
 * Formats dates strictly as 'YYYY-MM-DD' strings.
 */

export interface DateRange {
  startDateStr: string;
  endDateStr: string;
}

/**
 * Parse a 'YYYY-MM-DD' string into a local Date object.
 */
export function parseISODate(dateStr: string): Date {
  const cleanStr = dateStr.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const [y, m, d] = cleanStr.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/**
 * Returns rolling N-days range including today (or given base date).
 * For example, last 7 days from 2026-08-02 is 2026-07-27 to 2026-08-02 (inclusive, exactly 7 days).
 */
export function getLastNDaysRange(days: number = 7, baseDateStr?: string): DateRange {
  const endDate = baseDateStr ? parseISODate(baseDateStr) : new Date();
  const endDateStr = baseDateStr ? baseDateStr : getLocalDateString(endDate);

  const startDate = baseDateStr ? parseISODate(baseDateStr) : new Date();
  startDate.setDate(startDate.getDate() - (days - 1));
  const startDateStr = getLocalDateString(startDate);

  return {
    startDateStr,
    endDateStr
  };
}

/**
 * Alias helper for rolling 7 days range (today + 6 days prior = 7 days total).
 */
export function getLast7DaysRange(baseDateStr?: string): DateRange {
  return getLastNDaysRange(7, baseDateStr);
}

/**
 * Alias helper for rolling 28 days (4 weeks) range.
 */
export function getLast28DaysRange(baseDateStr?: string): DateRange {
  return getLastNDaysRange(28, baseDateStr);
}

/**
 * Returns calendar week range (Monday to Sunday) containing baseDateStr.
 */
export function getCurrentWeekRange(baseDateStr?: string): DateRange {
  const current = baseDateStr ? parseISODate(baseDateStr) : new Date();
  const day = current.getDay(); // 0 is Sunday, 1 is Monday, ...

  // Calculate offset to Monday (if Sunday (0), offset is -6; if Monday (1), offset is 0)
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(current);
  monday.setDate(current.getDate() + diffToMonday);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDateStr: getLocalDateString(monday),
    endDateStr: getLocalDateString(sunday)
  };
}

/**
 * Returns calendar month range (1st day to last day of month) containing baseDateStr.
 */
export function getCurrentMonthRange(baseDateStr?: string): DateRange {
  const current = baseDateStr ? parseISODate(baseDateStr) : new Date();
  const year = current.getFullYear();
  const month = current.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  return {
    startDateStr: getLocalDateString(firstDay),
    endDateStr: getLocalDateString(lastDay)
  };
}
