/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Formats a duration in seconds into a race-style time string (e.g. 11'50").
 * Returns '—' if the value is invalid or 0.
 */
export function formatRaceTime(timeSeconds: number): string {
  if (!timeSeconds || timeSeconds <= 0) {
    return '—';
  }
  const totalSeconds = Math.round(timeSeconds);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  const secondsStr = seconds.toString().padStart(2, '0');
  return `${minutes}'${secondsStr}"`;
}
