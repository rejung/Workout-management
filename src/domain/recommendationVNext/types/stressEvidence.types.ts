/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StressDimension, ExerciseMappingStatus } from './stressModel.types';
import { CanonicalRunningMetrics } from './running.types';

/**
 * ============================================================================
 * Recommendation Engine VNext — Recorded Session Stress Evidence Types
 * Change Unit 3.2: Recorded Session Stress Evidence Extraction
 * ============================================================================
 * 
 * CORE DEFINITION:
 * Recorded Session Stress Evidence is a structured, immutable representation
 * connecting an actual recorded workout session or exercise with its associated
 * Stress Dimensions based on CU3.1 Exercise Stress Profiles and CU1/CU2 facts.
 * 
 * STRICT INVARIANTS:
 * 1. Evidence ≠ Residual Stress: Evidence captures WHAT training occurred and WHICH
 *    dimensions are implicated. It does NOT compute stress magnitude, decay, or scores.
 * 2. Actual-Only: Only actual, historical WorkoutLogs are processed. Synthetic, projected,
 *    or recommended sessions are strictly forbidden.
 * 3. Discriminated Union: Strength, Running, and Unmapped evidence are cleanly separated
 *    to prevent gigantic nullable objects.
 * 4. No Magnitude / Scores / Decay: Zero 0-100 scores, decay curves, half-lives, recovery
 *    percentages, or fatigue weights.
 * 5. No Readiness / Recommendation: No candidate scoring, readiness gates, or hard blocks.
 * 6. Non-Destructive to Unmapped: Exercises without a known stress profile are preserved
 *    with `mappingStatus: 'unmapped'` and `dimensions: []` rather than silently dropped or guessed.
 * 7. Canonical Metrics Only: Running evidence relies strictly on CU1 canonical metrics,
 *    never legacy raw weight/reps fields.
 * ============================================================================
 */

/**
 * Discriminator indicating the modality origin of the exercise stress evidence.
 */
export type StressEvidenceKind = 'strength' | 'running' | 'unmapped';

/**
 * Availability summary of underlying CU2 Performance Observations for a strength exercise.
 * 
 * Strict Invariant:
 * Indicates existence of evidence, NOT performance strength, fatigue amount, or score.
 */
export interface StrengthPerformanceEvidenceAvailability {
  /**
   * Whether at least one eligible observation exists for 1RM estimation.
   */
  readonly hasEstimated1RM: boolean;

  /**
   * Whether at least one eligible observation exists for load-volume derivation.
   */
  readonly hasLoadVolume: boolean;

  /**
   * Whether at least one eligible observation exists for work-capacity analysis.
   */
  readonly hasWorkCapacity: boolean;

  /**
   * Total count of eligible strength performance observations extracted from this exercise.
   */
  readonly eligibleObservationCount: number;

  /**
   * Total raw set count in the exercise.
   */
  readonly totalRawSetCount: number;

  /**
   * Number of explicit working sets (`isWarmup === false`).
   */
  readonly explicitWorkingSetCount: number;

  /**
   * Number of sets with unknown role (legacy records without explicit `isWarmup`).
   */
  readonly unknownSetRoleCount: number;

  /**
   * Number of explicit warmup sets (`isWarmup === true`).
   */
  readonly explicitWarmupCount: number;
}

/**
 * Dispassionate, immutable stress evidence extracted from a STANDARD strength exercise session.
 */
export interface RecordedStrengthStressEvidence {
  readonly kind: 'strength';

  /** Source workout log ID for complete traceability */
  readonly sourceLogId: string;

  /** Session date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm), if recorded */
  readonly startTime?: string;

  /** Canonical exercise identifier */
  readonly exerciseId: string;

  /** Exercise display name */
  readonly exerciseName: string;

  /** Exercise category (e.g. Chest, Legs, Shoulders, Back) */
  readonly category?: string;

  /** Profile mapping status (always 'mapped' for known strength profile) */
  readonly mappingStatus: 'mapped';

  /**
   * List of stress dimensions associated with this strength exercise.
   * Membership only; conveys NO magnitude or priority.
   */
  readonly dimensions: readonly StressDimension[];

  /**
   * Availability of CU2 analytical performance observation evidence.
   */
  readonly performanceEvidenceAvailable: StrengthPerformanceEvidenceAvailability;

  /** Optional domain notes from the underlying stress profile */
  readonly domainNotes?: string;
}

/**
 * Dispassionate, immutable stress evidence extracted from a canonical running session.
 */
export interface RecordedRunningStressEvidence {
  readonly kind: 'running';

  /** Source workout log ID for complete traceability */
  readonly sourceLogId: string;

  /** Session date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm), if recorded */
  readonly startTime?: string;

  /** Canonical exercise identifier (e.g. 'running') */
  readonly exerciseId: string;

  /** Exercise display name */
  readonly exerciseName: string;

  /** Profile mapping status (always 'mapped' for running) */
  readonly mappingStatus: 'mapped';

  /**
   * List of stress dimensions associated with running (e.g. knee-dominant-lower-body, hip-posterior-chain).
   * Membership only; conveys NO magnitude.
   */
  readonly dimensions: readonly StressDimension[];

  /**
   * Observed canonical running metrics extracted via CU1 normalization.
   */
  readonly runningMetrics: CanonicalRunningMetrics;

  /** Optional domain notes from the underlying stress profile */
  readonly domainNotes?: string;
}

/**
 * Explicit stress evidence representation for an unmapped or unknown exercise.
 * 
 * Strict Invariant:
 * Unmapped exercises are NEVER assigned guessed dimensions. Dimensions is strictly empty.
 */
export interface RecordedUnmappedStressEvidence {
  readonly kind: 'unmapped';

  /** Source workout log ID for complete traceability */
  readonly sourceLogId: string;

  /** Session date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm), if recorded */
  readonly startTime?: string;

  /** Exercise identifier as recorded */
  readonly exerciseId: string;

  /** Exercise display name as recorded */
  readonly exerciseName: string;

  /** Exercise category as recorded */
  readonly category?: string;

  /** Profile mapping status (always 'unmapped') */
  readonly mappingStatus: 'unmapped';

  /** Strictly empty list of dimensions */
  readonly dimensions: readonly [];

  /** Reason why this exercise is unmapped */
  readonly unmappedReason: string;

  /** Optional domain notes */
  readonly domainNotes?: string;
}

/**
 * Discriminated union of all possible exercise-level stress evidence items.
 */
export type RecordedExerciseStressEvidence =
  | RecordedStrengthStressEvidence
  | RecordedRunningStressEvidence
  | RecordedUnmappedStressEvidence;

/**
 * Complete, immutable session-level stress evidence container extracted from an actual WorkoutLog.
 * 
 * Invariants:
 * - One WorkoutLog produces exactly one RecordedSessionStressEvidence.
 * - Same-day WorkoutLogs are NOT merged into a single session container.
 * - Multiple exercises within a session are preserved as distinct items in `exercises`.
 * - Purely a derived, in-memory domain artifact (NOT persisted to storage).
 */
export interface RecordedSessionStressEvidence {
  /** Source workout log identifier */
  readonly sourceLogId: string;

  /** Session date in YYYY-MM-DD format */
  readonly date: string;

  /** Session start time in HH:mm format, if recorded */
  readonly startTime?: string;

  /** True if this session was classified as a running/cardio workout */
  readonly isRunningSession: boolean;

  /** Disaggregated list of evidence items for each exercise in this session */
  readonly exercises: readonly RecordedExerciseStressEvidence[];

  /**
   * Distinct, deduplicated list of all stress dimensions implicated across
   * all mapped exercises in this session.
   */
  readonly sessionDimensions: readonly StressDimension[];

  /** Total count of exercises in this session */
  readonly totalExerciseCount: number;

  /** Count of mapped exercises */
  readonly mappedExerciseCount: number;

  /** Count of unmapped exercises */
  readonly unmappedExerciseCount: number;
}
