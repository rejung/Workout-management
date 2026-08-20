/**
 * Strength Stress Magnitude Types (VNext Recommendation Engine - CU3.10)
 *
 * Defines the contract for structuring session-level empirical stress magnitude
 * representations from CU3.9 factor exposure bundles and CU3.7 historical contexts.
 *
 * Strict Invariants:
 * 1. Factor Independence: Volume, Intensity, and Repeated-Work are structured as independent factor profiles.
 * 2. NO Integrated Tiers / Scores: Single 0-100 scores or composite empirical load tiers are strictly forbidden.
 * 3. NO Intensity Zones / Thresholds: Load deltas are preserved as pure physical kg deltas without %1RM classification.
 * 4. Factor Coupling Fidelity: Preserves CU3.9 coupling contract (additiveCombinationAllowed: false).
 * 5. Dimension Target: Connects exclusively to frozen CU3.1 dimension vocabulary without magnitude weighting/splitting.
 * 6. Uncertainty Fidelity: Preserves factor-specific provenance without synthesizing global confidence scores.
 * 7. Zero-Coercion: Missing facts remain undefined.
 * 8. NO Fatigue / Decay / Residual Stress / Readiness / Recommendations.
 */

import {
  BaselineEvidenceQuality,
  StrengthHistoryState
} from './strengthStressBaseline.types';
import {
  VolumeRelativeRelation,
  CurrentEvidenceTier,
  SetCountRelation,
  RepCountRelation
} from './strengthStressInterpretation.types';
import {
  StrengthStressFactorCouplingContract
} from './strengthStressExposure.types';
import {
  StressDimension
} from './stressModel.types';

// =========================================================================
// 1. Factor Specific Magnitude Profiles
// =========================================================================

export interface VolumeMagnitudeProfile {
  readonly absoluteKgReps: number;
  readonly distributionRelation: VolumeRelativeRelation;
  readonly recencyDeltaKgReps?: number;
  readonly medianDeltaKgReps?: number;
  readonly currentQuality: CurrentEvidenceTier;
  readonly referenceQuality?: BaselineEvidenceQuality;
  readonly referenceStatus: 'sufficient-reference' | 'cold-start' | 'insufficient-reference';
}

export interface IntensityMagnitudeWorkingLoadFact {
  readonly observedLoadKg: number;
  readonly setCount: number;
  readonly totalRepsAtLoad: number;
  readonly repsSeries: readonly number[];
  readonly deltaToMaxCapacityKg?: number;
  readonly deltaToLastCapacityKg?: number;
  readonly currentEvidenceQuality: CurrentEvidenceTier;
}

export interface IntensityMagnitudeProfile {
  readonly peakWorkingLoadKg?: number;
  readonly deltaToMaxCapacityKg?: number;
  readonly deltaToLastCapacityKg?: number;
  readonly peakEvidenceQuality?: CurrentEvidenceTier;
  readonly workingLoads: readonly IntensityMagnitudeWorkingLoadFact[];
  readonly capacityAnchorFacts?: {
    readonly maxObservedCapacityKg?: number;
    readonly maxObservedQuality?: BaselineEvidenceQuality;
    readonly lastSessionCapacityKg?: number;
    readonly lastSessionQuality?: 'high' | 'limited';
  };
  readonly referenceStatus: 'sufficient-reference' | 'no-working-loads' | 'no-capacity-reference' | 'cold-start';
}

export interface RepeatedWorkMagnitudeProfile {
  readonly totalWorkingSets: number;
  readonly totalReps: number;
  readonly setCountRelation: SetCountRelation;
  readonly repCountRelation: RepCountRelation;
  readonly deltaSetsToLast?: number;
  readonly deltaRepsToLast?: number;
  readonly loadGroupStructure: readonly {
    readonly observedLoadKg: number;
    readonly setCount: number;
    readonly totalRepsAtLoad: number;
    readonly repsSeries: readonly number[];
  }[];
  readonly referenceStatus: 'sufficient-reference' | 'cold-start' | 'history-unavailable';
}

// =========================================================================
// 2. Complete Strength Stress Magnitude Container
// =========================================================================

export interface StrengthStressMagnitude {
  readonly kind: 'strength-stress-magnitude';
  readonly sourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly date: string;
  readonly startTime?: string;

  /** Target dimensions defined in frozen CU3.1 vocabulary */
  readonly targetDimensions: readonly StressDimension[];

  /** Historical session state from CU3.6/CU3.7 */
  readonly historyState: StrengthHistoryState;
  readonly totalHistoricalSessionCount: number;

  /** Factor-specific empirical magnitude profiles */
  readonly factorProfiles: {
    readonly volume: VolumeMagnitudeProfile;
    readonly intensity: IntensityMagnitudeProfile;
    readonly repeatedWork: RepeatedWorkMagnitudeProfile;
  };

  /** Formal coupling contract preventing additive combination */
  readonly couplingContract: StrengthStressFactorCouplingContract;
}

export interface StrengthStressMagnitudeAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
