/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StressDimension } from './stressModel.types';
import { PeakEvidenceTier } from './sessionPeakE1RM.types';
import { ChronologyInterpretability, ContextCompleteness } from './performanceInterpretability.types';
import { MetricProvenance, RunningSourceConfidence } from './running.types';

/**
 * ============================================================================
 * Recommendation Engine VNext — Stress Magnitude Input Contract & Semantics
 * Change Unit 3.3: Stress Magnitude Input Contract & Modality Evidence Semantics
 * ============================================================================
 * 
 * CORE RESPONSIBILITY:
 * Define explicit, typed domain contracts for observable facts and provenance from
 * Recorded Stress Evidence (CU3.2) and Performance Observations (CU2) that can be
 * consumed by downstream Stress Magnitude Policies.
 * 
 * STRICT INVARIANTS:
 * 1. Input Contract Only: Conveys WHAT observable facts exist and their provenance.
 *    Does NOT compute stress magnitude, stress scores (0-100), fatigue, or decay.
 * 2. Discriminated Modality: Strength and Running inputs are strictly discriminated unions.
 *    No artificial cross-modality scaling, unit normalization, or common denominator.
 * 3. No Weightings or Formulas: Zero volume weights, e1RM weights, pace weights,
 *    intensity multipliers, or arbitrary weighted sums.
 * 4. No Readiness / Recommendation: Zero readiness states, recovery percentages,
 *    or exercise suggestions.
 * 5. Full Provenance Preservation: Role quality (explicit working vs limited legacy),
 *    metric source (explicit vs legacy fallback), and interpretability facts are preserved.
 * 6. Pure Derived Runtime State: Never persisted to storage.
 * ============================================================================
 */

/**
 * Status of the magnitude input projection.
 */
export type StressMagnitudeInputStatus =
  | 'input-ready'
  | 'input-insufficient'
  | 'unmapped';

/**
 * Observed set role evidence counts for strength inputs.
 * 
 * Note: Preserves factual set counts. Warmup counts are factual metadata and
 * do NOT imply any specific stress magnitude contribution.
 */
export interface StrengthSetEvidenceInput {
  readonly totalRawSetCount: number;
  readonly explicitWorkingSetCount: number;
  readonly unknownSetRoleCount: number;
  readonly explicitWarmupCount: number;
}

/**
 * Observed e1RM facts from CU2 SessionPeakE1RMObservation.
 * 
 * Invariant: Preserves numerical peak, policy-selected peak, and evidence tier
 * without collapsing them into a single unadorned number.
 */
export interface StrengthE1RMEvidenceInput {
  readonly numericalPeakEstimated1RMKg: number;
  readonly selectedPeakEstimated1RMKg: number;
  readonly selectedEvidenceQuality: PeakEvidenceTier;
}

/**
 * Observed load-volume facts from CU2 SessionLoadVolumeObservation.
 * 
 * Invariant: Preserves total alongside high and limited evidence contributions.
 */
export interface StrengthLoadVolumeEvidenceInput {
  readonly totalLoadVolumeKgReps: number;
  readonly highEvidenceLoadVolumeKgReps: number;
  readonly limitedEvidenceLoadVolumeKgReps: number;
  readonly observationCount: number;
}

/**
 * Observed work-capacity group representing sets completed at a specific load.
 * 
 * Invariant: Preserves reps series structure without collapsing to total reps alone.
 */
export interface StrengthWorkCapacityLoadGroupInput {
  readonly observedLoadKg: number;
  readonly setCount: number;
  readonly repsSeries: readonly number[];
  readonly totalRepsAtLoad: number;
  readonly highEvidenceSetCount: number;
  readonly limitedEvidenceSetCount: number;
}

/**
 * Aggregated work-capacity facts from CU2 SessionWorkCapacityObservation.
 */
export interface StrengthWorkCapacityEvidenceInput {
  readonly totalSetCount: number;
  readonly totalReps: number;
  readonly loadGroups: readonly StrengthWorkCapacityLoadGroupInput[];
}

/**
 * Context interpretability facts from CU2 PerformanceObservationInterpretability.
 */
export interface StrengthInterpretabilityContextInput {
  readonly chronologyInterpretability: ChronologyInterpretability;
  readonly contextCompleteness: ContextCompleteness;
  readonly hasOtherSameDayWorkoutLogs: boolean;
  readonly hasOtherExercisesInWorkoutLog: boolean;
}

/**
 * Dispassionate, immutable strength magnitude input contract.
 */
export interface StrengthStressMagnitudeInput {
  readonly kind: 'strength';

  /** Source workout log identifier */
  readonly sourceLogId: string;

  /** Session date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm), if recorded */
  readonly startTime?: string;

  /** Canonical exercise identifier */
  readonly exerciseId: string;

  /** Exercise display name */
  readonly exerciseName: string;

  /** Exercise category (e.g. Legs, Chest, Shoulders, Back) */
  readonly category?: string;

  /**
   * Stress dimensions from CU3.2 RecordedStressEvidence.
   * Membership only; carries NO magnitude.
   */
  readonly dimensions: readonly StressDimension[];

  /** Set counts and role evidence */
  readonly setEvidence: StrengthSetEvidenceInput;

  /** Peak estimated 1RM evidence, if observed in CU2 */
  readonly e1RMEvidence?: StrengthE1RMEvidenceInput;

  /** Load-volume evidence, if observed in CU2 */
  readonly loadVolumeEvidence?: StrengthLoadVolumeEvidenceInput;

  /** Work-capacity evidence, if observed in CU2 */
  readonly workCapacityEvidence?: StrengthWorkCapacityEvidenceInput;

  /** Context interpretability metadata, if observed in CU2 */
  readonly interpretability?: StrengthInterpretabilityContextInput;
}

/**
 * Provenance facts for canonical running metrics.
 */
export interface RunningMetricProvenanceInput {
  readonly distanceProvenance: MetricProvenance;
  readonly durationProvenance: MetricProvenance;
  readonly distanceLegacyConflict: boolean;
  readonly durationLegacyConflict: boolean;
  readonly hasLegacyConflict: boolean;
  readonly sourceConfidence: RunningSourceConfidence;
}

/**
 * Dispassionate, immutable running magnitude input contract.
 */
export interface RunningStressMagnitudeInput {
  readonly kind: 'running';

  /** Source workout log identifier */
  readonly sourceLogId: string;

  /** Session date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm), if recorded */
  readonly startTime?: string;

  /** Canonical exercise identifier */
  readonly exerciseId: string;

  /** Exercise display name */
  readonly exerciseName: string;

  /**
   * Stress dimensions from CU3.2 RecordedStressEvidence.
   * (e.g. knee-dominant-lower-body, hip-posterior-chain)
   */
  readonly dimensions: readonly StressDimension[];

  /** Canonical observed distance in kilometers (if recorded and valid) */
  readonly distanceKm?: number;

  /** Canonical observed duration in seconds (if recorded and valid) */
  readonly durationSeconds?: number;

  /** Canonical observed pace in seconds per kilometer (if computable) */
  readonly paceSecondsPerKm?: number;

  /** Provenance and source confidence of running metrics */
  readonly metricProvenance: RunningMetricProvenanceInput;
}

/**
 * Discriminated union of valid stress magnitude inputs.
 */
export type StressMagnitudeInput =
  | StrengthStressMagnitudeInput
  | RunningStressMagnitudeInput;

/**
 * Result of projecting a RecordedExerciseStressEvidence into a magnitude input contract.
 */
export type StressMagnitudeInputResult =
  | {
      readonly status: 'input-ready';
      readonly input: StressMagnitudeInput;
    }
  | {
      readonly status: 'input-insufficient';
      readonly sourceLogId: string;
      readonly exerciseId: string;
      readonly exerciseName: string;
      readonly reason: string;
    }
  | {
      readonly status: 'unmapped';
      readonly sourceLogId: string;
      readonly exerciseId: string;
      readonly exerciseName: string;
      readonly reason: string;
    };
