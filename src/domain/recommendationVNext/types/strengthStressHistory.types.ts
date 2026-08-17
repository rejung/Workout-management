/**
 * Strength Stress Historical Baseline Evidence Types (VNext Recommendation Engine - CU3.5)
 *
 * Defines the types and contracts for collecting actual historical observation evidence
 * for a specific strength exercise, strictly prior to relative normalization or magnitude derivation.
 *
 * Strict Invariants:
 * 1. Historical Observation Evidence Only: Collects WHAT was observed in prior actual sessions.
 * 2. NO baseline aggregation (no mean, median, max, rolling average, or typical volume/e1RM).
 * 3. NO normalization (no percentage of baseline, ratio, z-score).
 * 4. NO stress magnitude or fatigue scoring.
 * 5. NO Running modality mixing or cross-exercise baseline borrowing.
 * 6. NO mutation or non-deterministic state.
 */

import { StressDimension } from './stressModel.types';
import {
  StrengthSetEvidenceInput,
  StrengthE1RMEvidenceInput,
  StrengthLoadVolumeEvidenceInput,
  StrengthWorkCapacityEvidenceInput,
  StrengthInterpretabilityContextInput
} from './stressMagnitudeInput.types';

/**
 * Pure projection of a historical strength session's empirical evidence.
 */
export interface HistoricalStrengthSessionEvidence {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly category?: string;
  readonly dimensions: readonly StressDimension[];

  readonly setEvidence: StrengthSetEvidenceInput;
  readonly e1RMEvidence?: StrengthE1RMEvidenceInput;
  readonly loadVolumeEvidence?: StrengthLoadVolumeEvidenceInput;
  readonly workCapacityEvidence?: StrengthWorkCapacityEvidenceInput;
  readonly interpretability?: StrengthInterpretabilityContextInput;
}

/**
 * Reason a candidate session was excluded from the strict historical evidence collection.
 */
export type HistoricalEvidenceExclusionReason =
  | 'not-same-exercise'
  | 'current-session'
  | 'future-session'
  | 'ordering-uncertain'
  | 'not-strictly-earlier'
  | 'invalid-modality'
  | 'input-insufficient';

/**
 * Audit record of an excluded candidate session.
 */
export interface HistoricalEvidenceExclusion {
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName?: string;
  readonly date: string;
  readonly startTime?: string;
  readonly reason: HistoricalEvidenceExclusionReason;
  readonly details: string;
}

/**
 * Immutable collection of historical observation evidence for a specific strength exercise.
 */
export interface StrengthHistoricalEvidenceCollection {
  readonly currentSourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentDate: string;
  readonly currentStartTime?: string;

  /** Chronologically ordered historical sessions (newest strictly-earlier first) */
  readonly historicalSessions: readonly HistoricalStrengthSessionEvidence[];

  /** Excluded candidate sessions with explicit audit reasons */
  readonly excludedCandidates: readonly HistoricalEvidenceExclusion[];

  readonly historicalSessionCount: number;
  readonly excludedCandidateCount: number;
}

/**
 * Invariant audit rule result for CU3.5.
 */
export interface StrengthHistoryAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
