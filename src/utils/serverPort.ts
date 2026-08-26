/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const DEFAULT_SERVER_PORT = 3000;

/**
 * Validates and parses the server port from an environment variable or raw input.
 * Accepts only positive integers in the range [1, 65535].
 * Falls back to defaultPort (3000) on absent or invalid inputs.
 */
export function parseServerPort(rawPort: string | undefined | null, defaultPort = DEFAULT_SERVER_PORT): number {
  if (rawPort === undefined || rawPort === null) {
    return defaultPort;
  }

  const trimmed = typeof rawPort === 'string' ? rawPort.trim() : String(rawPort);
  if (trimmed === '') {
    return defaultPort;
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || isNaN(parsed)) {
    console.warn(`[Server Config] Non-integer PORT "${rawPort}" specified. Falling back to default port ${defaultPort}.`);
    return defaultPort;
  }

  if (parsed <= 0 || parsed > 65535) {
    console.warn(`[Server Config] Out-of-range PORT "${rawPort}" (valid: 1-65535). Falling back to default port ${defaultPort}.`);
    return defaultPort;
  }

  return parsed;
}
