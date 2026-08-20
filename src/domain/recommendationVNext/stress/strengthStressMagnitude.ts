/**
 * Strength Stress Magnitude Derivation (VNext Recommendation Engine - CU3.10)
 *
 * Pure function pipeline to derive session-level empirical stress magnitude
 * representations from CU3.9 factor exposure bundles and historical context.
 *
 * Strict Invariants:
 * 1. Factor Independence: Volume, Intensity, and Repeated-Work profiles are isolated.
 * 2. NO Integrated Scores or Tiers: No 0-100 score, no composite empirical tier.
 * 3. NO Intensity Zones or Thresholds: Deltas are pure physical kg differences.
 * 4. Preserves CU3.9 Coupling Contract (additiveCombinationAllowed === false).
 * 5. Uses frozen CU3.1 dimension vocabulary without magnitude weighting/splitting.
 * 6. NO Global Confidence: Provenance and quality are preserved on each profile.
 * 7. Zero-Coercion: Missing values remain undefined.
 * 8. NO Fatigue / Decay / Residual Stress / Readiness / Recommendations.
 */

import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext
} from '../types/historicalExerciseContext.types';
import {
  StressDimension
} from '../types/stressModel.types';
import {
  VolumeMagnitudeProfile,
  IntensityMagnitudeProfile,
  RepeatedWorkMagnitudeProfile,
  StrengthStressMagnitude
} from '../types/strengthStressMagnitude.types';
import {
  evaluateStrengthStressFactorExposure
} from './strengthStressExposure';

/**
 * Pure projection of Volume Magnitude Profile from Exposure bundle.
 */
export function deriveVolumeMagnitudeProfile(
  volumeExposure: ReturnType<typeof evaluateStrengthStressFactorExposure>['volumeExposure']
): VolumeMagnitudeProfile {
  return Object.freeze({
    absoluteKgReps: volumeExposure.absoluteVolumeKgReps,
    distributionRelation: volumeExposure.historicalRangeExposure.relation,
    recencyDeltaKgReps: volumeExposure.recencyExposure.deltaKgReps,
    medianDeltaKgReps: volumeExposure.historicalRangeExposure.deltaToMedianKgReps,
    currentQuality: volumeExposure.provenance.currentQuality,
    referenceQuality: volumeExposure.provenance.referenceQuality,
    referenceStatus: volumeExposure.provenance.status
  });
}

/**
 * Pure projection of Intensity Magnitude Profile from Exposure bundle.
 */
export function deriveIntensityMagnitudeProfile(
  intensityExposure: ReturnType<typeof evaluateStrengthStressFactorExposure>['intensityExposure']
): IntensityMagnitudeProfile {
  const workingLoads = intensityExposure.workingLoadExposures.map(w =>
    Object.freeze({
      observedLoadKg: w.observedLoadKg,
      setCount: w.setCount,
      totalRepsAtLoad: w.totalRepsAtLoad,
      repsSeries: Object.freeze([...w.repsSeries]),
      deltaToMaxCapacityKg: w.deltaToMaxCapacityKg,
      deltaToLastCapacityKg: w.deltaToLastCapacityKg,
      currentEvidenceQuality: w.currentEvidenceQuality
    })
  );

  let capacityAnchorFacts: IntensityMagnitudeProfile['capacityAnchorFacts'];
  if (intensityExposure.capacityAnchorFacts) {
    capacityAnchorFacts = Object.freeze({
      maxObservedCapacityKg: intensityExposure.capacityAnchorFacts.maxObservedCapacityKg,
      maxObservedQuality: intensityExposure.capacityAnchorFacts.maxObservedQuality,
      lastSessionCapacityKg: intensityExposure.capacityAnchorFacts.lastSessionCapacityKg,
      lastSessionQuality: intensityExposure.capacityAnchorFacts.lastSessionQuality
    });
  }

  return Object.freeze({
    peakWorkingLoadKg: intensityExposure.peakWorkingLoadExposure?.observedLoadKg,
    deltaToMaxCapacityKg: intensityExposure.peakWorkingLoadExposure?.deltaToMaxCapacityKg,
    deltaToLastCapacityKg: intensityExposure.peakWorkingLoadExposure?.deltaToLastCapacityKg,
    peakEvidenceQuality: intensityExposure.peakWorkingLoadExposure?.currentEvidenceQuality,
    workingLoads: Object.freeze(workingLoads),
    capacityAnchorFacts,
    referenceStatus: intensityExposure.provenance.status
  });
}

/**
 * Pure projection of Repeated-Work Magnitude Profile from Exposure bundle.
 */
export function deriveRepeatedWorkMagnitudeProfile(
  repeatedWorkExposure: ReturnType<typeof evaluateStrengthStressFactorExposure>['repeatedWorkExposure']
): RepeatedWorkMagnitudeProfile {
  const loadGroupStructure = repeatedWorkExposure.loadGroupStructure.map(lg =>
    Object.freeze({
      observedLoadKg: lg.observedLoadKg,
      setCount: lg.setCount,
      totalRepsAtLoad: lg.totalRepsAtLoad,
      repsSeries: Object.freeze([...lg.repsSeries])
    })
  );

  return Object.freeze({
    totalWorkingSets: repeatedWorkExposure.structuralExposure.totalWorkingSets,
    totalReps: repeatedWorkExposure.structuralExposure.totalReps,
    setCountRelation: repeatedWorkExposure.structuralExposure.setCountRelation,
    repCountRelation: repeatedWorkExposure.structuralExposure.repCountRelation,
    deltaSetsToLast: repeatedWorkExposure.recencyStructuralDelta.deltaSets,
    deltaRepsToLast: repeatedWorkExposure.recencyStructuralDelta.deltaReps,
    loadGroupStructure: Object.freeze(loadGroupStructure),
    referenceStatus: repeatedWorkExposure.provenance.status
  });
}

/**
 * Pure master function to evaluate complete Strength Stress Magnitude representation.
 */
export function evaluateStrengthStressMagnitude(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): StrengthStressMagnitude {
  const exposureBundle = evaluateStrengthStressFactorExposure(currentInput, context);

  const volumeProfile = deriveVolumeMagnitudeProfile(exposureBundle.volumeExposure);
  const intensityProfile = deriveIntensityMagnitudeProfile(exposureBundle.intensityExposure);
  const repeatedWorkProfile = deriveRepeatedWorkMagnitudeProfile(exposureBundle.repeatedWorkExposure);

  const targetDimensions: readonly StressDimension[] = Object.freeze(
    [...(currentInput.dimensions || [])] as StressDimension[]
  );

  return Object.freeze({
    kind: 'strength-stress-magnitude',
    sourceLogId: currentInput.sourceLogId,
    exerciseId: currentInput.exerciseId,
    exerciseName: currentInput.exerciseName,
    date: currentInput.date,
    startTime: currentInput.startTime,
    targetDimensions,
    historyState: context.historyState,
    totalHistoricalSessionCount: context.totalHistoricalSessionCount,
    factorProfiles: Object.freeze({
      volume: volumeProfile,
      intensity: intensityProfile,
      repeatedWork: repeatedWorkProfile
    }),
    couplingContract: exposureBundle.couplingContract
  });
}
