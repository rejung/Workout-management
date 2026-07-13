/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Mock identification configuration for clean architecture.
 * Centralizes keys, prefixes, and filters for developer seeds / mock templates,
 * ensuring absolute safety for migrated and user-created data.
 */

export const MOCK_PREFIX = 'mock-';
export const DEFAULT_WEIGHT_IDS = ['w1', 'w2', 'w3', 'w4', 'w5'];

/**
 * Determines if a workout log is a mock / development seed.
 * ONLY logs whose IDs start with 'mock-' are deleted.
 * 
 * Preserves with 100% safety:
 * - Migration data (starts with 'v1-log-')
 * - UUID/user-created data (starts with 'uuid-' or general UUIDs)
 * - Cloned workout logs (which use UUIDs)
 * - Quick Input logs (which use UUIDs)
 * - Backup/Restore data (preserves user-imported IDs)
 */
export const isMockWorkoutLogId = (id: string): boolean => {
  return !!(id && typeof id === 'string' && id.startsWith(MOCK_PREFIX));
};

/**
 * Determines if a weight log is a mock / development seed.
 * ONLY logs with IDs in DEFAULT_WEIGHT_IDS are deleted.
 * 
 * Preserves with 100% safety:
 * - Migration weight data (starts with 'wlog-v1-')
 * - UUID/user-created weight logs
 * - Manual/Quick Input weight logs
 */
export const isMockWeightLogId = (id: string): boolean => {
  return !!(id && DEFAULT_WEIGHT_IDS.includes(id));
};
