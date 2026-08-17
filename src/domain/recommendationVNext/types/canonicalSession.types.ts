/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog } from '../../../types';

/**
 * Canonical representation of a workout session reference for VNext.
 * 
 * This is a derived, immutable representation of an actual WorkoutLog that captures
 * its canonical identity and chronological temporal facts without mutating the source
 * or fabricating any missing timestamps.
 */
export interface CanonicalSessionRef {
  /**
   * The original, immutable WorkoutLog ID.
   */
  readonly sourceLogId: string;

  /**
   * The session date in YYYY-MM-DD format (mandatory).
   */
  readonly date: string;

  /**
   * The optional session start time in HH:MM format.
   * If not provided in the original log, remains undefined without fabrication.
   */
  readonly startTime?: string;

  /**
   * The original position of the session in the input array.
   * Used strictly for deterministic tie-breaking and input order preservation.
   */
  readonly originalIndex: number;

  /**
   * Flag indicating whether this session's sourceLogId appears more than once in the dataset.
   * Duplicate candidates are tagged for observation/reporting, NEVER automatically deleted.
   */
  readonly isDuplicateIdCandidate: boolean;

  /**
   * Readonly reference to the source WorkoutLog (SSOT).
   */
  readonly rawLog: Readonly<WorkoutLog>;
}
