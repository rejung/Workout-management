/**
 * Strength Stress Historical Baseline Reference Types (VNext Recommendation Engine - CU3.6)
 *
 * Defines the types and contracts for deriving empirical factor baseline references
 * (Volume, Intensity Capacity, and Repeated-Work) from CU3.5 Historical Evidence Collections.
 *
 * Strict Invariants:
 * 1. Factor-Specific Observation Pool: Each factor computes baseline anchors ONLY from valid observations of that factor.
 * 2. Orthogonal Availability: Overall HistoryState is decoupled from factor-specific available/unavailable counts.
 * 3. NO zero-coercion: Missing factor observations are NEVER converted to 0 (e.g. 0 kg·reps or 0 sets).
 * 4. Provenance Preservation: Anchors preserve their source evidence quality ('high' | 'limited' | 'mixed') and sourceLogIds.
 * 5. Tie Preservation: Min/Max ties retain all sourceLogIds with synthesized quality.
 * 6. NO Normalization / Ratios / Magnitude / Weights / Decay / Readiness / Recommendations.
 * 7. Complete Immutability: All returned reference structures and arrays are deeply frozen.
 */

export type BaselineEvidenceQuality = 'high' | 'limited' | 'mixed';

/**
 * Historical baseline reference state determined solely by total historical session count.
 */
export type StrengthHistoryState =
  | 'cold-start'              // 0 historical sessions
  | 'single-session-reference' // 1 historical session
  | 'multi-session-reference'; // 2+ historical sessions

/**
 * Provenance anchor for a scalar baseline volume metric.
 */
export interface VolumeReferenceAnchor {
  readonly valueKgReps: number;
  readonly evidenceQuality: BaselineEvidenceQuality;
  /** All sourceLogIds that contributed to or produced this anchor value */
  readonly sourceLogIds: readonly string[];
}

/**
 * Historical reference for the Volume Exposure factor.
 */
export interface VolumeHistoricalReference {
  /** Recency Anchor: Volume from the most recent prior session (Recent-1), if volume is present */
  readonly lastSessionVolume?: VolumeReferenceAnchor;

  /** Central Tendency: Median volume across valid volume observations */
  readonly medianVolume?: VolumeReferenceAnchor;

  /** Observed Lower Boundary: Minimum volume observed in historical sessions */
  readonly minObservedVolume?: VolumeReferenceAnchor;

  /** Observed Upper Boundary: Maximum volume observed in historical sessions */
  readonly maxObservedVolume?: VolumeReferenceAnchor;

  /** Factor-specific observation availability */
  readonly availableObservationCount: number;
  readonly unavailableObservationCount: number;

  /** Observation quality breakdown for participating sessions */
  readonly observationSummary: {
    readonly sessionsWithHighOnly: number;
    readonly sessionsWithLimitedOnly: number;
    readonly sessionsWithMixed: number;
  };
}

/**
 * Provenance anchor for an intensity/capacity metric.
 */
export interface IntensityCapacityAnchor {
  readonly valueKg: number;
  readonly evidenceQuality: BaselineEvidenceQuality;
  /** All sourceLogIds that achieved this capacity value */
  readonly sourceLogIds: readonly string[];
  /** Dates corresponding to the sourceLogIds */
  readonly dates: readonly string[];
}

/**
 * Historical reference for the Intensity / Strength Capacity factor.
 * Note: Peak e1RM is a capacity reference, NOT an intensity exposure score.
 */
export interface IntensityCapacityHistoricalReference {
  /** Recency Anchor: Peak e1RM from Recent-1 session ONLY if Recent-1 contains valid e1RM */
  readonly lastSessionPeakE1RM?: {
    readonly valueKg: number;
    readonly evidenceQuality: 'high' | 'limited';
    readonly sourceLogId: string;
    readonly date: string;
  };

  /** Upper Capacity Bound: Maximum peak e1RM observed across historical sessions */
  readonly maxObservedPeakE1RM?: IntensityCapacityAnchor;

  /** Factor-specific observation availability */
  readonly availableObservationCount: number;
  readonly unavailableObservationCount: number;
}

/**
 * Compact historical reference for Repeated-Work Exposure factor.
 * SSOT for complete historical structures remains in CU3.5 Historical Collection.
 */
export interface RepeatedWorkCompactReference {
  /** Recency Anchor: Total working sets from Recent-1 session, if work capacity is present */
  readonly lastSessionTotalSets?: number;

  /** Recency Anchor: Total reps from Recent-1 session, if work capacity is present */
  readonly lastSessionTotalReps?: number;

  /** Recency Structure: Lossless load groups structure from Recent-1 session */
  readonly lastSessionLoadGroups?: readonly Readonly<{
    observedLoadKg: number;
    setCount: number;
    repsSeries: readonly number[];
    totalRepsAtLoad: number;
    highEvidenceSetCount: number;
    limitedEvidenceSetCount: number;
  }>[];

  /** Observed range of total working sets across valid work capacity observations */
  readonly minObservedTotalSets?: number;
  readonly maxObservedTotalSets?: number;

  /** Observed range of total reps across valid work capacity observations */
  readonly minObservedTotalReps?: number;
  readonly maxObservedTotalReps?: number;

  /** Factor-specific observation availability */
  readonly availableObservationCount: number;
  readonly unavailableObservationCount: number;
}

/**
 * Comprehensive historical baseline reference for a strength exercise.
 */
export interface StrengthStressHistoricalBaseline {
  readonly currentSourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentDate: string;
  readonly currentStartTime?: string;

  /** Overall historical state based on total historical session count */
  readonly historyState: StrengthHistoryState;
  readonly totalHistoricalSessionCount: number;

  /** Factor-specific baseline references */
  readonly volumeReference: VolumeHistoricalReference;
  readonly intensityCapacityReference: IntensityCapacityHistoricalReference;
  readonly repeatedWorkReference: RepeatedWorkCompactReference;
}

/**
 * Result of an invariant audit check for CU3.6.
 */
export interface StrengthStressBaselineAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
