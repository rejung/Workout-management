/**
 * Strength Stress Interpretation Derivation (VNext Recommendation Engine - CU3.8)
 *
 * Pure function pipeline to derive factor-specific physical interpretations
 * by comparing a current StrengthStressMagnitudeInput against a HistoricalExerciseContext.
 *
 * Strict Invariants:
 * 1. Zero-Coercion: Missing facts remain undefined; zero-substitution is strictly forbidden.
 * 2. Capacity Reference Role: e1RM serves strictly as a capacity reference anchor (NO %1RM ratios or e1RM progression).
 * 3. Provenance Fidelity: Current evidence provenance and historical reference provenance are preserved independently.
 * 4. Structural Preservation: Load-group structures are preserved as structural facts without similarity scoring.
 * 5. 0/0 Evidence Count is a Contract Violation.
 * 6. NO Normalization / Ratios / Magnitude / Weights / Decay / Readiness / Recommendations.
 */

import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext
} from '../types/historicalExerciseContext.types';
import {
  VolumeExposureInterpretation,
  VolumeRelativeRelation,
  IntensityExposureInterpretation,
  CurrentLoadGroupEvidence,
  CurrentEvidenceTier,
  WorkingLoadCapacityRelation,
  RepeatedWorkInterpretation,
  SetCountRelation,
  RepCountRelation,
  StrengthStressInterpretation
} from '../types/strengthStressInterpretation.types';

/**
 * Derives current load group evidence quality strictly from set counts.
 * Throws a Contract Violation if both counts are 0, preventing provenance fabrication.
 */
export function deriveLoadGroupEvidenceQuality(
  highCount: number,
  limitedCount: number
): CurrentLoadGroupEvidence {
  if (highCount === 0 && limitedCount === 0) {
    throw new Error(
      'Contract Violation: Load group must contain at least one working set. Empty set counts cannot be evaluated for evidence quality.'
    );
  }

  let evidenceQuality: CurrentEvidenceTier;
  if (highCount > 0 && limitedCount === 0) {
    evidenceQuality = 'high';
  } else if (highCount === 0 && limitedCount > 0) {
    evidenceQuality = 'limited';
  } else {
    evidenceQuality = 'mixed';
  }

  return Object.freeze({
    highEvidenceSetCount: highCount,
    limitedEvidenceSetCount: limitedCount,
    evidenceQuality
  });
}

/**
 * Pure derivation of Volume Exposure Interpretation.
 */
export function interpretVolumeExposure(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): VolumeExposureInterpretation {
  const currentVolume = currentInput.loadVolumeEvidence?.totalLoadVolumeKgReps ?? 0;
  const volRef = context.baseline.volumeReference;

  if (context.historyState === 'cold-start' || volRef.availableObservationCount === 0) {
    return Object.freeze({
      currentVolumeKgReps: currentVolume,
      lastSessionDelta: undefined,
      distributionRelation: 'insufficient-reference',
      medianDelta: undefined,
      referenceStatus: context.historyState === 'cold-start' ? 'cold-start' : 'no-volume-data'
    });
  }

  // 1. Recency-relative delta (Recent-1)
  let lastSessionDelta: VolumeExposureInterpretation['lastSessionDelta'];
  if (volRef.lastSessionVolume) {
    const delta = currentVolume - volRef.lastSessionVolume.valueKgReps;
    let relationToLast: 'lower' | 'equal' | 'higher';
    if (delta > 0) {
      relationToLast = 'higher';
    } else if (delta < 0) {
      relationToLast = 'lower';
    } else {
      relationToLast = 'equal';
    }

    lastSessionDelta = Object.freeze({
      deltaKgReps: delta,
      relationToLast,
      referenceValueKgReps: volRef.lastSessionVolume.valueKgReps,
      referenceEvidenceQuality: volRef.lastSessionVolume.evidenceQuality
    });
  }

  // 2. Median-relative delta
  let medianDelta: VolumeExposureInterpretation['medianDelta'];
  if (volRef.medianVolume) {
    medianDelta = Object.freeze({
      deltaKgReps: currentVolume - volRef.medianVolume.valueKgReps,
      referenceValueKgReps: volRef.medianVolume.valueKgReps,
      referenceEvidenceQuality: volRef.medianVolume.evidenceQuality
    });
  }

  // 3. Distribution-relative relation
  let distributionRelation: VolumeRelativeRelation = 'insufficient-reference';
  if (volRef.minObservedVolume && volRef.maxObservedVolume && volRef.medianVolume) {
    const minVal = volRef.minObservedVolume.valueKgReps;
    const maxVal = volRef.maxObservedVolume.valueKgReps;
    const medVal = volRef.medianVolume.valueKgReps;

    if (currentVolume < minVal) {
      distributionRelation = 'below-min';
    } else if (currentVolume === minVal && minVal < medVal) {
      distributionRelation = 'at-min';
    } else if (currentVolume > minVal && currentVolume < medVal) {
      distributionRelation = 'within-range-below-median';
    } else if (currentVolume === medVal) {
      distributionRelation = 'at-median';
    } else if (currentVolume > medVal && currentVolume < maxVal) {
      distributionRelation = 'within-range-above-median';
    } else if (currentVolume === maxVal && maxVal > medVal) {
      distributionRelation = 'at-max';
    } else if (currentVolume > maxVal) {
      distributionRelation = 'above-max';
    } else {
      // Degenerate single-value distribution where min === med === max
      distributionRelation = 'at-median';
    }
  }

  const referenceStatus =
    context.historyState === 'single-session-reference' ? 'single-reference' : 'multi-reference';

  return Object.freeze({
    currentVolumeKgReps: currentVolume,
    lastSessionDelta,
    distributionRelation,
    medianDelta,
    referenceStatus
  });
}

/**
 * Pure derivation of Intensity Exposure Interpretation.
 */
export function interpretIntensityExposure(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): IntensityExposureInterpretation {
  const currentLoadGroups = currentInput.workCapacityEvidence?.loadGroups || [];

  if (currentLoadGroups.length === 0) {
    return Object.freeze({
      currentPeakWorkingLoad: undefined,
      loadGroupRelations: Object.freeze([]),
      capacityReferenceAnchor: undefined,
      referenceStatus: 'no-working-loads'
    });
  }

  const capRef = context.baseline.intensityCapacityReference;
  const maxObsCap = capRef.maxObservedPeakE1RM?.valueKg;
  const lastSesCap = capRef.lastSessionPeakE1RM?.valueKg;

  const hasCapacityReference = maxObsCap !== undefined || lastSesCap !== undefined;
  const referenceStatus: IntensityExposureInterpretation['referenceStatus'] =
    context.historyState === 'cold-start'
      ? 'cold-start'
      : hasCapacityReference
      ? 'available'
      : 'no-capacity-reference';

  let capacityReferenceAnchor: IntensityExposureInterpretation['capacityReferenceAnchor'];
  if (hasCapacityReference) {
    capacityReferenceAnchor = Object.freeze({
      maxObservedCapacityKg: capRef.maxObservedPeakE1RM?.valueKg,
      maxObservedQuality: capRef.maxObservedPeakE1RM?.evidenceQuality,
      lastSessionCapacityKg: capRef.lastSessionPeakE1RM?.valueKg,
      lastSessionQuality: capRef.lastSessionPeakE1RM?.evidenceQuality
    });
  }

  // Find peak working load and its provenance
  let peakLoadGroup = currentLoadGroups[0];
  for (const lg of currentLoadGroups) {
    if (lg.observedLoadKg > peakLoadGroup.observedLoadKg) {
      peakLoadGroup = lg;
    }
  }

  const peakEvidence = deriveLoadGroupEvidenceQuality(
    peakLoadGroup.highEvidenceSetCount,
    peakLoadGroup.limitedEvidenceSetCount
  );

  const currentPeakWorkingLoad = Object.freeze({
    observedLoadKg: peakLoadGroup.observedLoadKg,
    currentEvidence: peakEvidence
  });

  // Evaluate relations for all load groups
  const loadGroupRelations: WorkingLoadCapacityRelation[] = currentLoadGroups.map(lg => {
    const currentEvidence = deriveLoadGroupEvidenceQuality(
      lg.highEvidenceSetCount,
      lg.limitedEvidenceSetCount
    );

    const deltaToMaxCapacityKg =
      maxObsCap !== undefined ? lg.observedLoadKg - maxObsCap : undefined;
    const deltaToLastSessionCapacityKg =
      lastSesCap !== undefined ? lg.observedLoadKg - lastSesCap : undefined;

    return Object.freeze({
      observedLoadKg: lg.observedLoadKg,
      setCount: lg.setCount,
      totalRepsAtLoad: lg.totalRepsAtLoad,
      repsSeries: Object.freeze([...lg.repsSeries]),
      currentEvidence,
      deltaToMaxCapacityKg,
      deltaToLastSessionCapacityKg
    });
  });

  return Object.freeze({
    currentPeakWorkingLoad,
    loadGroupRelations: Object.freeze(loadGroupRelations),
    capacityReferenceAnchor,
    referenceStatus
  });
}

/**
 * Pure derivation of Repeated-Work Exposure Interpretation.
 */
export function interpretRepeatedWorkExposure(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): RepeatedWorkInterpretation {
  const currentSets = currentInput.workCapacityEvidence?.totalSetCount ?? currentInput.setEvidence.explicitWorkingSetCount + currentInput.setEvidence.unknownSetRoleCount;
  const currentReps = currentInput.workCapacityEvidence?.totalReps ?? 0;
  const rwRef = context.baseline.repeatedWorkReference;

  if (context.historyState === 'cold-start' || rwRef.availableObservationCount === 0) {
    return Object.freeze({
      currentTotalSets: currentSets,
      currentTotalReps: currentReps,
      lastSessionDelta: undefined,
      setCountRelation: 'insufficient-reference',
      repCountRelation: 'insufficient-reference',
      referenceStatus: context.historyState === 'cold-start' ? 'cold-start' : 'history-unavailable'
    });
  }

  // 1. Recency-relative delta (Recent-1)
  let lastSessionDelta: RepeatedWorkInterpretation['lastSessionDelta'];
  if (rwRef.lastSessionTotalSets !== undefined && rwRef.lastSessionTotalReps !== undefined) {
    const deltaSets = currentSets - rwRef.lastSessionTotalSets;
    const deltaReps = currentReps - rwRef.lastSessionTotalReps;

    const relationToLastSets = deltaSets > 0 ? 'higher' : deltaSets < 0 ? 'lower' : 'equal';
    const relationToLastReps = deltaReps > 0 ? 'higher' : deltaReps < 0 ? 'lower' : 'equal';

    lastSessionDelta = Object.freeze({
      deltaSets,
      deltaReps,
      relationToLastSets,
      relationToLastReps,
      referenceTotalSets: rwRef.lastSessionTotalSets,
      referenceTotalReps: rwRef.lastSessionTotalReps
    });
  }

  // 2. Set count relation
  let setCountRelation: SetCountRelation = 'insufficient-reference';
  if (rwRef.minObservedTotalSets !== undefined && rwRef.maxObservedTotalSets !== undefined) {
    if (currentSets < rwRef.minObservedTotalSets) {
      setCountRelation = 'below-min';
    } else if (currentSets === rwRef.minObservedTotalSets && rwRef.minObservedTotalSets < rwRef.maxObservedTotalSets) {
      setCountRelation = 'at-min';
    } else if (currentSets > rwRef.minObservedTotalSets && currentSets < rwRef.maxObservedTotalSets) {
      setCountRelation = 'within-range';
    } else if (currentSets === rwRef.maxObservedTotalSets && rwRef.minObservedTotalSets < rwRef.maxObservedTotalSets) {
      setCountRelation = 'at-max';
    } else if (currentSets > rwRef.maxObservedTotalSets) {
      setCountRelation = 'above-max';
    } else {
      // min === max
      setCountRelation = currentSets === rwRef.minObservedTotalSets ? 'at-min' : currentSets > rwRef.maxObservedTotalSets ? 'above-max' : 'below-min';
    }
  }

  // 3. Rep count relation
  let repCountRelation: RepCountRelation = 'insufficient-reference';
  if (rwRef.minObservedTotalReps !== undefined && rwRef.maxObservedTotalReps !== undefined) {
    if (currentReps < rwRef.minObservedTotalReps) {
      repCountRelation = 'below-min';
    } else if (currentReps === rwRef.minObservedTotalReps && rwRef.minObservedTotalReps < rwRef.maxObservedTotalReps) {
      repCountRelation = 'at-min';
    } else if (currentReps > rwRef.minObservedTotalReps && currentReps < rwRef.maxObservedTotalReps) {
      repCountRelation = 'within-range';
    } else if (currentReps === rwRef.maxObservedTotalReps && rwRef.minObservedTotalReps < rwRef.maxObservedTotalReps) {
      repCountRelation = 'at-max';
    } else if (currentReps > rwRef.maxObservedTotalReps) {
      repCountRelation = 'above-max';
    } else {
      // min === max
      repCountRelation = currentReps === rwRef.minObservedTotalReps ? 'at-min' : currentReps > rwRef.maxObservedTotalReps ? 'above-max' : 'below-min';
    }
  }

  return Object.freeze({
    currentTotalSets: currentSets,
    currentTotalReps: currentReps,
    lastSessionDelta,
    setCountRelation,
    repCountRelation,
    referenceStatus: 'available'
  });
}

/**
 * Pure master function to derive the complete StrengthStressInterpretation.
 */
export function interpretStrengthStressExposure(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): StrengthStressInterpretation {
  if (!currentInput || !context) {
    throw new Error('Contract Violation: currentInput and context must be provided.');
  }

  if (currentInput.exerciseId !== context.exerciseId) {
    throw new Error(
      `Contract Violation: exerciseId mismatch (${currentInput.exerciseId} vs ${context.exerciseId}).`
    );
  }

  const volume = interpretVolumeExposure(currentInput, context);
  const intensity = interpretIntensityExposure(currentInput, context);
  const repeatedWork = interpretRepeatedWorkExposure(currentInput, context);

  return Object.freeze({
    currentSourceLogId: currentInput.sourceLogId,
    exerciseId: currentInput.exerciseId,
    exerciseName: currentInput.exerciseName,
    currentDate: currentInput.date,
    currentStartTime: currentInput.startTime,
    volume,
    intensity,
    repeatedWork
  });
}
