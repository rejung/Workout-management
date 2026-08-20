/**
 * Strength Stress Interpretation Types (VNext Recommendation Engine - CU3.8)
 *
 * Defines the contract for interpreting current strength session stress factors
 * relative to empirical historical context and baseline reference anchors.
 *
 * Strict Invariants:
 * 1. Factor Independence: Volume, Intensity, and Repeated-Work are evaluated independently without additive scoring.
 * 2. Capacity Reference Role: e1RM serves strictly as a static capacity reference anchor (NO %1RM ratios or e1RM progression).
 * 3. Provenance Fidelity: Current evidence provenance and historical reference provenance are preserved independently without confidence synthesis.
 * 4. Structural Preservation: Load-group structures are preserved as structural facts without similarity scoring or dominant group selection.
 * 5. Zero-Coercion: Missing facts remain undefined; zero-substitution is strictly forbidden.
 * 6. NO Normalization / Ratios / Magnitude / Weights / Decay / Readiness / Recommendations.
 */

import {
  BaselineEvidenceQuality
} from './strengthStressBaseline.types';

// =========================================================================
// 1. Volume Exposure Interpretation
// =========================================================================

export type VolumeRelativeRelation =
  | 'below-min'
  | 'at-min'
  | 'within-range-below-median'
  | 'at-median'
  | 'within-range-above-median'
  | 'at-max'
  | 'above-max'
  | 'insufficient-reference';

export interface VolumeExposureInterpretation {
  readonly currentVolumeKgReps: number;

  /** Recency-relative delta compared to Recent-1 */
  readonly lastSessionDelta?: {
    readonly deltaKgReps: number; // current - last
    readonly relationToLast: 'lower' | 'equal' | 'higher';
    readonly referenceValueKgReps: number;
    readonly referenceEvidenceQuality: BaselineEvidenceQuality;
  };

  /** Distribution-relative position compared to historical median and range */
  readonly distributionRelation: VolumeRelativeRelation;

  /** Median-relative delta compared to historical median */
  readonly medianDelta?: {
    readonly deltaKgReps: number; // current - median
    readonly referenceValueKgReps: number;
    readonly referenceEvidenceQuality: BaselineEvidenceQuality;
  };

  /** Historical volume reference availability status */
  readonly referenceStatus: 'cold-start' | 'single-reference' | 'multi-reference' | 'no-volume-data';
}

// =========================================================================
// 2. Intensity Exposure Interpretation
// =========================================================================

export type CurrentEvidenceTier = 'high' | 'limited' | 'mixed';

export interface CurrentLoadGroupEvidence {
  readonly highEvidenceSetCount: number;
  readonly limitedEvidenceSetCount: number;
  readonly evidenceQuality: CurrentEvidenceTier;
}

export interface WorkingLoadCapacityRelation {
  readonly observedLoadKg: number;
  readonly setCount: number;
  readonly totalRepsAtLoad: number;
  readonly repsSeries: readonly number[];

  /** Current session provenance for this working load group */
  readonly currentEvidence: CurrentLoadGroupEvidence;

  /** Physical load delta relative to historical max capacity anchor (observedLoadKg - maxObservedPeakE1RM) */
  readonly deltaToMaxCapacityKg?: number;

  /** Physical load delta relative to historical last-session capacity anchor (observedLoadKg - lastSessionPeakE1RM) */
  readonly deltaToLastSessionCapacityKg?: number;
}

export interface IntensityExposureInterpretation {
  /** Peak working load observed in the current session and its evidence quality */
  readonly currentPeakWorkingLoad?: {
    readonly observedLoadKg: number;
    readonly currentEvidence: CurrentLoadGroupEvidence;
  };

  /** Physical load relations for all working load groups */
  readonly loadGroupRelations: readonly WorkingLoadCapacityRelation[];

  /** Historical capacity reference anchors used for physical comparison */
  readonly capacityReferenceAnchor?: {
    readonly maxObservedCapacityKg?: number;
    readonly maxObservedQuality?: BaselineEvidenceQuality;
    readonly lastSessionCapacityKg?: number;
    readonly lastSessionQuality?: 'high' | 'limited';
  };

  /** Intensity reference availability status */
  readonly referenceStatus: 'available' | 'no-working-loads' | 'no-capacity-reference' | 'cold-start';
}

// =========================================================================
// 3. Repeated-Work Exposure Interpretation
// =========================================================================

export type SetCountRelation =
  | 'below-min'
  | 'at-min'
  | 'within-range'
  | 'at-max'
  | 'above-max'
  | 'insufficient-reference';

export type RepCountRelation =
  | 'below-min'
  | 'at-min'
  | 'within-range'
  | 'at-max'
  | 'above-max'
  | 'insufficient-reference';

export interface RepeatedWorkInterpretation {
  readonly currentTotalSets: number;
  readonly currentTotalReps: number;

  /** Recency-relative delta compared to Recent-1 total sets/reps */
  readonly lastSessionDelta?: {
    readonly deltaSets: number; // current - last
    readonly deltaReps: number; // current - last
    readonly relationToLastSets: 'lower' | 'equal' | 'higher';
    readonly relationToLastReps: 'lower' | 'equal' | 'higher';
    readonly referenceTotalSets: number;
    readonly referenceTotalReps: number;
  };

  /** Distribution-relative position compared to historical observed ranges */
  readonly setCountRelation: SetCountRelation;
  readonly repCountRelation: RepCountRelation;

  /** Repeated-work reference availability status */
  readonly referenceStatus: 'available' | 'cold-start' | 'history-unavailable';
}

// =========================================================================
// 4. Combined Factor Interpretation Container
// =========================================================================

export interface StrengthStressInterpretation {
  readonly currentSourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentDate: string;
  readonly currentStartTime?: string;

  /** Factor-specific physical interpretations */
  readonly volume: VolumeExposureInterpretation;
  readonly intensity: IntensityExposureInterpretation;
  readonly repeatedWork: RepeatedWorkInterpretation;
}

export interface StrengthStressInterpretationAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
