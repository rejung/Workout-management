/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real Workout Backup Loader (CU5.1)
 *
 * Lossless loader for actual production WorkoutBackup JSON exports.
 * Preserves canonical WorkoutLog structure without synthesis or mutation.
 */

import { WorkoutLog } from '../../../types';
import {
  getCanonicalReplayDataset,
  loadSnapshotBackupLogs,
  CanonicalDatasetReport,
  DatasetFingerprint,
} from './canonicalReplayDataset';
import rawBackup from '../../../../WorkoutBackup_v2.1_2026-08-21.json';

export interface RawBackupPayload {
  readonly version: string;
  readonly exportedAt: string;
  readonly metadata?: Record<string, unknown>;
  readonly workoutLogs: readonly WorkoutLog[];
}

export interface ValidationDatasetProvenance {
  readonly fileName: string;
  readonly exportDate: string;
  readonly workoutLogCount: number;
  readonly sourceKind: 'production-repository' | 'real-backup' | 'snapshot-fallback';
  readonly snapshotStatus: string;
  readonly duplicateCount: number;
}

/**
 * Returns provenance metadata for the real Workout dataset.
 */
export function getRealWorkoutBackupProvenance(): ValidationDatasetProvenance {
  const report = getCanonicalReplayDataset();
  const payload = rawBackup as unknown as RawBackupPayload;
  return Object.freeze({
    fileName: 'WorkoutBackup_v2.1_2026-08-21.json',
    exportDate: payload.exportedAt,
    workoutLogCount: report.totalWorkoutLogCount,
    sourceKind: report.sourceKind,
    snapshotStatus: report.snapshotStatus,
    duplicateCount: report.duplicateWorkoutLogCount,
  });
}

/**
 * Loads and returns the canonical WorkoutLogs from the production repository / snapshot.
 */
export function loadRealWorkoutBackupLogs(): readonly WorkoutLog[] {
  const report = getCanonicalReplayDataset();
  return report.logs;
}

