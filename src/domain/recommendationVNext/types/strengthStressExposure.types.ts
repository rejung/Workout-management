/**
 * Strength Stress Factor Exposure Types (VNext Recommendation Engine - CU3.9)
 *
 * Defines the contract for structuring evaluated stress factor exposures
 * (Volume, Intensity, Repeated-Work) derived from CU3.8 interpretations,
 * alongside formal Factor Coupling Contracts to prevent double-counting.
 *
 * Strict Invariants:
 * 1. Factor Independence: Factor exposures are preserved as independent physical facts without additive scoring.
 * 2. Structural Coupling Declaration: Explicit declaration that Volume, Intensity, and Repeated-Work
 *    share underlying raw working-set variables (load, reps, sets).
 * 3. additiveCombinationAllowed is strictly FALSE.
 * 4. Capacity Reference Anchor: Historical e1RM serves strictly as a physical capacity reference anchor.
 * 5. Zero-Coercion: Missing facts remain undefined; zero-substitution is strictly forbidden.
 * 6. NO Normalization / 100-point scores / Factor Weights / Decay / Readiness / Recommendations.
 */

import {
  BaselineEvidenceQuality
} from './strengthStressBaseline.types';
import {
  VolumeRelativeRelation,
  CurrentEvidenceTier,
  SetCountRelation,
  RepCountRelation
} from './strengthStressInterpretation.types';

// =========================================================================
// 1. Volume Exposure Evidence
// =========================================================================

export interface VolumeExposureEvidence {
  readonly kind: 'volume-exposure';

  /** Physical load volume (kg·reps) */
  readonly absoluteVolumeKgReps: number;

  /** Recency exposure facts relative to Recent-1 */
  readonly recencyExposure: {
    readonly deltaKgReps?: number;
    readonly direction?: 'increased' | 'maintained' | 'decreased';
    readonly referenceVolumeKgReps?: number;
  };

  /** Distribution exposure facts relative to historical median and ranges */
  readonly historicalRangeExposure: {
    readonly relation: VolumeRelativeRelation;
    readonly deltaToMedianKgReps?: number;
    readonly referenceMedianKgReps?: number;
  };

  /** Provenance and reference availability */
  readonly provenance: {
    readonly currentQuality: CurrentEvidenceTier;
    readonly referenceQuality?: BaselineEvidenceQuality;
    readonly status: 'sufficient-reference' | 'cold-start' | 'insufficient-reference';
  };
}

// =========================================================================
// 2. Intensity Exposure Evidence
// =========================================================================

export interface WorkingLoadExposureFact {
  readonly observedLoadKg: number;
  readonly setCount: number;
  readonly totalRepsAtLoad: number;
  readonly repsSeries: readonly number[];
  readonly deltaToMaxCapacityKg?: number;
  readonly deltaToLastCapacityKg?: number;
  readonly currentEvidenceQuality: CurrentEvidenceTier;
}

export interface IntensityExposureEvidence {
  readonly kind: 'intensity-exposure';

  /** Peak working load observed and its relation to capacity reference anchors */
  readonly peakWorkingLoadExposure?: {
    readonly observedLoadKg: number;
    readonly deltaToMaxCapacityKg?: number;
    readonly deltaToLastCapacityKg?: number;
    readonly currentEvidenceQuality: CurrentEvidenceTier;
  };

  /** Working load groups preserved as structural physical exposure facts */
  readonly workingLoadExposures: readonly WorkingLoadExposureFact[];

  /** Capacity reference anchor facts */
  readonly capacityAnchorFacts?: {
    readonly maxObservedCapacityKg?: number;
    readonly maxObservedQuality?: BaselineEvidenceQuality;
    readonly lastSessionCapacityKg?: number;
    readonly lastSessionQuality?: 'high' | 'limited';
  };

  /** Provenance and reference availability */
  readonly provenance: {
    readonly status: 'sufficient-reference' | 'no-working-loads' | 'no-capacity-reference' | 'cold-start';
  };
}

// =========================================================================
// 3. Repeated-Work Exposure Evidence
// =========================================================================

export interface RepeatedWorkExposureEvidence {
  readonly kind: 'repeated-work-exposure';

  /** Total sets and reps structural scale facts */
  readonly structuralExposure: {
    readonly totalWorkingSets: number;
    readonly totalReps: number;
    readonly setCountRelation: SetCountRelation;
    readonly repCountRelation: RepCountRelation;
  };

  /** Recency structural change facts relative to Recent-1 */
  readonly recencyStructuralDelta: {
    readonly deltaSets?: number;
    readonly deltaReps?: number;
    readonly setDirection?: 'increased' | 'maintained' | 'decreased';
    readonly repDirection?: 'increased' | 'maintained' | 'decreased';
    readonly referenceTotalSets?: number;
    readonly referenceTotalReps?: number;
  };

  /** Structural load-group facts preserved without similarity scoring */
  readonly loadGroupStructure: readonly {
    readonly observedLoadKg: number;
    readonly setCount: number;
    readonly totalRepsAtLoad: number;
    readonly repsSeries: readonly number[];
  }[];

  /** Provenance and reference availability */
  readonly provenance: {
    readonly status: 'sufficient-reference' | 'cold-start' | 'history-unavailable';
  };
}

// =========================================================================
// 4. Factor Coupling & Dependency Contract
// =========================================================================

export type PhysicalFactorPrimitive = 'load' | 'reps' | 'sets' | 'capacity-reference';

export interface FactorDependencyDeclaration {
  readonly factorKind: 'volume-exposure' | 'intensity-exposure' | 'repeated-work-exposure';
  readonly derivesFrom: readonly PhysicalFactorPrimitive[];
}

export interface StrengthStressFactorCouplingContract {
  readonly sharedDerivationBasis: 'working-sets';
  readonly factorDependencies: readonly FactorDependencyDeclaration[];
  readonly additiveCombinationAllowed: false;
  readonly underlyingMetrics: {
    readonly totalWorkingSets: number;
    readonly totalReps: number;
    readonly distinctLoadCount: number;
  };
}

// =========================================================================
// 5. Complete Factor Exposure Evaluation Bundle
// =========================================================================

export interface StrengthStressFactorExposureBundle {
  readonly currentSourceLogId: string;
  readonly exerciseId: string;
  readonly exerciseName: string;
  readonly currentDate: string;
  readonly currentStartTime?: string;

  /** Physical Factor Exposures */
  readonly volumeExposure: VolumeExposureEvidence;
  readonly intensityExposure: IntensityExposureEvidence;
  readonly repeatedWorkExposure: RepeatedWorkExposureEvidence;

  /** Formal Factor Coupling & Double-Counting Prevention Contract */
  readonly couplingContract: StrengthStressFactorCouplingContract;
}

export interface StrengthStressExposureAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
