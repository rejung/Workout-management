/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Muscle Display Evidence Types (VNext Recommendation Engine - Phase 3)
 *
 * Defines the pure domain contract for generating per-muscle display evidence
 * directly from pre-dimension-projection exercise records using the Phase 1
 * Musculoskeletal Relation Table and existing temporal persistence SSOT.
 *
 * Strict Architectural Invariants:
 * 1. Direct Exercise-to-Muscle Grounding:
 *    - Derived from pre-dimension exercise evidence, NEVER copied from the 7 StressDimensions.
 *    - Example: Deadlift -> erector-spinae comes from profile 'stabilizer' role,
 *      NOT from copying 'axial-systemic-loading' status or color.
 * 2. Exact Registry Reuse:
 *    - 13 anatomical muscle regions (CANONICAL_MUSCLE_REGIONS).
 *    - 11 display groups (CANONICAL_MUSCLE_DISPLAY_GROUPS) for UI layout grouping only.
 *    - ZERO group-level status collapse (anterior, lateral, posterior deltoid keep independent states).
 * 3. Zero Scoring / Weights / Recovery Formulas:
 *    - No fatigue scores, no per-muscle recovery hours, no numeric role weights or percentages.
 * 4. Honest Uncertainty & Scope Preservation:
 *    - Uncertain/bracket evidence alone NEVER promotes to confirmed '최근 부하' or '잔여 부하'.
 *    - Coexisting confirmed + uncertain preserves confirmed status while retaining uncertainty metadata.
 *    - Uninterpreted records (unsupported, unconfirmed-variation, id-name-conflict) are never
 *      arbitrarily assigned to muscles and are preserved explicitly in the output.
 *    - Future records are strictly excluded.
 * 5. Lossless Multi-Session Provenance without Recounting:
 *    - One exercise mapping to multiple muscles does NOT recount sets, sessions, or volume.
 *    - Distinct same-day records remain separately traceable via sourceLogId.
 * 6. Pure Immutability: Deeply frozen output structures with zero input mutation.
 */

import {
  MuscleDisplayGroupId,
  MuscleInvolvementRole,
  MuscleRegionId,
} from './exerciseMusculoskeletalProfile.types';
import {
  ElapsedTime,
  EvaluationContext,
  OccurrenceState,
  PersistenceState,
  TemporalAttenuation,
} from './residualStressTrace.types';
import { BodyLoadDisplayStatus } from './recommendationPresentation.types';

// =========================================================================
// 1. Pre-Dimension Exercise Evidence Input Contract
// =========================================================================

/**
 * Structural input contract for pre-dimension-projection exercise evidence.
 * Structurally compatible with both RecordedExerciseStressEvidence (CU3.2)
 * and StressMagnitudeInput (CU3.3) without requiring dimension projections.
 */
export interface MuscleDisplaySourceExerciseEvidence {
  /** Source WorkoutLog identifier preserving discrete session identity */
  readonly sourceLogId: string;

  /** Session calendar date (YYYY-MM-DD) */
  readonly date: string;

  /** Session local start time (HH:mm or HH:mm:ss), if recorded */
  readonly startTime?: string;

  /** Original recorded exercise identifier (e.g. 'barbell-row', 'deadlift', 'treadmill') */
  readonly exerciseId: string;

  /** Original recorded exercise display name (e.g. '바벨 로우 (Barbell Row)') */
  readonly exerciseName: string;
}

// =========================================================================
// 2. Per-Muscle Evidence Item & Temporal Classification
// =========================================================================

/**
 * Compact temporal persistence category derived strictly from the existing 24h/72h SSOT.
 */
export type MuscleEvidenceTemporalState =
  | 'immediate'
  | 'residual'
  | 'historical'
  | 'bracket'
  | 'uncertain';

/**
 * Non-future temporal attenuation contract for muscle display evidence.
 */
export type EligibleMuscleTemporalAttenuation = Exclude<
  TemporalAttenuation,
  { readonly kind: 'ineligible' }
>;

/**
 * Single traceable link from an interpretable source exercise record to a muscle region.
 */
export interface MuscleRegionEvidenceItem {
  /** Source WorkoutLog ID (same-day distinct logs are never merged) */
  readonly sourceLogId: string;

  /** Session calendar date (YYYY-MM-DD) */
  readonly date: string;

  /** Session start time (HH:mm or HH:mm:ss), if recorded */
  readonly startTime?: string;

  /** Original recorded exercise ID preserved verbatim */
  readonly sourceExerciseId: string;

  /** Original recorded exercise name preserved verbatim */
  readonly sourceExerciseName: string;

  /** Resolved canonical profile ID from Musculoskeletal SSOT */
  readonly canonicalExerciseId: string;

  /** Resolved canonical profile Korean name from Musculoskeletal SSOT */
  readonly canonicalExerciseName: string;

  /** Target muscle region ID */
  readonly regionId: MuscleRegionId;

  /** Anatomical involvement role from Musculoskeletal SSOT */
  readonly role: MuscleInvolvementRole;

  /** Optional factual anatomical role description from profile */
  readonly functionalRoleDescription?: string;

  /** Temporal occurrence classification (never future-evidence) */
  readonly occurrenceState: Exclude<OccurrenceState, 'future-evidence'>;

  /** Elapsed time representation from residualStressTrace SSOT */
  readonly elapsedTime: ElapsedTime;

  /** Full temporal attenuation classification from residualStressTrace SSOT */
  readonly temporalAttenuation: EligibleMuscleTemporalAttenuation;

  /** Compact temporal state label */
  readonly temporalState: MuscleEvidenceTemporalState;

  /** For bracket-ordinal evidence, preserves lower/upper bounds without speculative promotion */
  readonly potentialPersistenceBounds?: {
    readonly lowerBoundState: PersistenceState;
    readonly upperBoundState: PersistenceState;
  };
}

// =========================================================================
// 3. Per-Muscle Uncertainty & Display State
// =========================================================================

export interface MuscleRegionUncertaintyInfo {
  readonly hasUncertainty: boolean;
  readonly hasBracketTraces: boolean;
  readonly hasUncertainTraces: boolean;
  readonly bracketTraceCount: number;
  readonly uncertainTraceCount: number;
  readonly potentialPersistence: PersistenceState | 'none';
  readonly note?: string;
}

export interface MuscleRegionDisplayEvidence {
  readonly regionId: MuscleRegionId;
  readonly koreanName: string;
  readonly displayGroupId: MuscleDisplayGroupId;

  /**
   * User-facing display status aligned with existing Korean presentation vocabulary:
   * - '최근 부하': Confirmed immediate (<24h) evidence present
   * - '잔여 부하': No immediate, confirmed residual (24h-72h) evidence present
   * - '최근 부하 근거 없음': Confirmed historical (>=72h) evidence present without active/uncertain overlap
   *   (explicitly scoped to interpretable records only)
   * - '판단 정보 부족': No interpretable evidence, OR uncertain/bracket evidence without confirmed active load
   */
  readonly status: BodyLoadDisplayStatus;

  /** Strongest confirmed (exact-ordinal) persistence state on this region */
  readonly confirmedPersistence: PersistenceState | 'none';

  readonly isImmediate: boolean;
  readonly isResidual: boolean;
  readonly isHistorical: boolean;
  readonly isInsufficient: boolean;

  /** Temporal uncertainty metadata preserved separately from confirmed status */
  readonly uncertainty: MuscleRegionUncertaintyInfo;

  /** All non-future evidence items linked to this muscle region */
  readonly evidence: readonly MuscleRegionEvidenceItem[];

  /** Partitioned views of evidence by temporal state */
  readonly immediateEvidence: readonly MuscleRegionEvidenceItem[];
  readonly residualEvidence: readonly MuscleRegionEvidenceItem[];
  readonly historicalEvidence: readonly MuscleRegionEvidenceItem[];
  readonly bracketEvidence: readonly MuscleRegionEvidenceItem[];
  readonly uncertainEvidence: readonly MuscleRegionEvidenceItem[];

  /** Distinct involvement roles observed across all evidence on this region */
  readonly rolesPresent: readonly MuscleInvolvementRole[];

  /** Distinct involvement roles observed specifically in confirmed active (immediate/residual) evidence */
  readonly activeConfirmedRoles: readonly MuscleInvolvementRole[];
}

// =========================================================================
// 4. Display Group Presentation (Layout Grouping Only — NO Status Collapse)
// =========================================================================

/**
 * Groups muscle regions according to the 11 canonical display groups for layout organization.
 *
 * Strict Invariant:
 * Contains NO aggregated/averaged/max group status.
 * For 'shoulders', anterior, lateral, and posterior deltoid states remain strictly separate.
 */
export interface MuscleDisplayGroupPresentation {
  readonly groupId: MuscleDisplayGroupId;
  readonly koreanName: string;
  readonly description: string;
  readonly memberRegionIds: readonly MuscleRegionId[];
  readonly regions: readonly MuscleRegionDisplayEvidence[];
}

// =========================================================================
// 5. Quarantined / Excluded Source Records & Provenance Summary
// =========================================================================

export type MuscleDisplayUninterpretedReasonCategory =
  | 'unconfirmed-variation'
  | 'id-name-conflict'
  | 'unsupported'
  | 'empty-input';

export interface MuscleDisplayUninterpretedExercise {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly sourceExerciseId: string;
  readonly sourceExerciseName: string;
  readonly category: MuscleDisplayUninterpretedReasonCategory;
  readonly reason: string;
  readonly occurrenceState: Exclude<OccurrenceState, 'future-evidence'>;
  readonly temporalState: MuscleEvidenceTemporalState;
}

export interface MuscleDisplayExcludedFutureExercise {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly sourceExerciseId: string;
  readonly sourceExerciseName: string;
  readonly reason: string;
}

export interface MuscleDisplayInvalidDateTimeExercise {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly sourceExerciseId: string;
  readonly sourceExerciseName: string;
  readonly category: 'invalid-datetime';
  readonly reason: string;
}

export interface MuscleDisplayProvenanceSummary {
  /** Total pre-dimension exercise records received as input */
  readonly totalInputExerciseCount: number;
  /** Non-future exercise records that matched a supported canonical musculoskeletal profile */
  readonly interpretableExerciseCount: number;
  /** Distinct WorkoutLog IDs among interpretable exercise records (never recounts per muscle) */
  readonly distinctInterpretableLogCount: number;
  /** Valid future exercise records excluded strictly */
  readonly excludedFutureExerciseCount: number;
  /** Records quarantined due to invalid calendar date or malformed explicit startTime */
  readonly invalidDateTimeExerciseCount: number;
  /** Non-future exercise records with valid date/time that could not be mapped to any muscle */
  readonly uninterpretedExerciseCount: number;
  readonly unconfirmedVariationCount: number;
  readonly idNameConflictCount: number;
  readonly unsupportedExerciseCount: number;
  readonly emptyInputCount: number;
  /** Count of interpretable exercise records with same-day missing startTime */
  readonly sameDayUncertainExerciseCount: number;
  /** Count of interpretable exercise records crossing 24h/72h calendar bounds */
  readonly calendarBoundedBracketExerciseCount: number;
}

// =========================================================================
// 6. Top-Level Muscle Display Evidence Result Container
// =========================================================================

export interface MuscleDisplayEvidenceResult {
  readonly kind: 'muscle-display-evidence';
  readonly evaluationContext: EvaluationContext;

  /** All 13 canonical muscle regions in CANONICAL_MUSCLE_REGIONS order */
  readonly regions: readonly MuscleRegionDisplayEvidence[];

  /** Direct lookup map for all 13 canonical muscle regions */
  readonly regionMap: Readonly<Record<MuscleRegionId, MuscleRegionDisplayEvidence>>;

  /** All 11 display groups in CANONICAL_MUSCLE_DISPLAY_GROUPS order (layout organization only) */
  readonly displayGroups: readonly MuscleDisplayGroupPresentation[];

  /** Direct lookup map for all 11 display groups */
  readonly displayGroupMap: Readonly<
    Record<MuscleDisplayGroupId, MuscleDisplayGroupPresentation>
  >;

  /** Non-future records with valid date/time that were NOT assigned to any muscle due to variation/conflict/unsupported status */
  readonly uninterpretedExercises: readonly MuscleDisplayUninterpretedExercise[];

  /** Valid future records strictly excluded from muscle display evidence */
  readonly excludedFutureExercises: readonly MuscleDisplayExcludedFutureExercise[];

  /** Records quarantined due to invalid date or malformed explicit startTime (never auto-rolled or counted as future/uncertain) */
  readonly invalidDateTimeExercises: readonly MuscleDisplayInvalidDateTimeExercise[];

  /** Factual record-level provenance summary (never double-counts across connected muscles) */
  readonly provenanceSummary: MuscleDisplayProvenanceSummary;

  /** Explicit scope statement clarifying interpretation boundaries */
  readonly interpretationScopeNotice: string;

  /** True if any muscle region carries temporal uncertainty */
  readonly hasTemporalUncertainty: boolean;

  /** True if any non-future uninterpreted exercises exist in the input */
  readonly hasUninterpretedExercises: boolean;

  /** True if any input exercises were quarantined due to invalid date/time */
  readonly hasInvalidDateTimeExercises: boolean;
}
