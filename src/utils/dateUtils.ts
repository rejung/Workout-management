/**
 * Centralized Date Utility for Workout Date Formatting & Parsing
 * Exclusive for Korea Standard Time (KST) / Asia/Seoul (UTC+09:00) presentation.
 */

export function parseWorkoutDate(dateString: string): Date {
  if (!dateString) return new Date();
  // Safe date parsing without UTC conversion shifts
  const cleanStr = dateString.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const [y, m, d] = cleanStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return new Date();
  }
  return new Date(y, m - 1, d);
}

export function formatWorkoutDate(dateString: string): string {
  if (!dateString) return '';
  const cleanStr = dateString.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const parts = cleanStr.split('-');
  if (parts.length >= 3) {
    const y = parts[0].padStart(4, '0');
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    const dayOfWeek = getWorkoutWeekday(dateString);
    return `${y}.${m}.${d} (${dayOfWeek})`;
  }
  return dateString;
}

export function formatWorkoutDateShort(dateString: string): string {
  if (!dateString) return '';
  const cleanStr = dateString.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const parts = cleanStr.split('-');
  if (parts.length >= 3) {
    const y = parts[0].padStart(4, '0');
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}.${m}.${d}`;
  }
  return dateString;
}

export function getWorkoutWeekday(dateString: string): string {
  if (!dateString) return '';
  const cleanStr = dateString.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const [y, m, d] = cleanStr.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) {
    return '';
  }
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[utcDate.getUTCDay()];
}

export function getLocalDateString(date: Date = new Date()): string {
  // Add 9 hours (KST) to the UTC time to shift it to KST, then use UTC methods to format
  const kstTime = date.getTime() + (9 * 60 * 60 * 1000);
  const kstDate = new Date(kstTime);
  const y = kstDate.getUTCFullYear();
  const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(kstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format helper for any case that requires explicit Intl.DateTimeFormat in Asia/Seoul
 */
export function formatInSeoul(date: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    ...options
  }).format(date);
}

export function getFriendlyRecommendationDate(dateStr: string): string {
  if (!dateStr) return '';
  const cleanStr = dateStr.trim().replace(/\./g, '-').replace(/\s+/g, '');
  const parts = cleanStr.split('-');
  if (parts.length < 3) return dateStr;
  
  const [y, m, d] = parts.map(Number);
  const weekday = getWorkoutWeekday(cleanStr);
  
  const todayStr = getLocalDateString();
  const today = new Date();
  const tomorrowObj = new Date(today);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = getLocalDateString(tomorrowObj);
  
  if (cleanStr === todayStr) {
    return `오늘 (${m}월 ${d}일 ${weekday})`;
  } else if (cleanStr === tomorrowStr) {
    return `내일 (${m}월 ${d}일 ${weekday})`;
  } else {
    return `${m}월 ${d}일 (${weekday})`;
  }
}

