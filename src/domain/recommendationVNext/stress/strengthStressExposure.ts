/**
 * Strength Stress Factor Exposure Derivation (VNext Recommendation Engine - CU3.9)
 *
 * Pure function pipeline to project CU3.8 StrengthStressInterpretation facts into
 * structured Factor Exposure Evidence bundles with explicit Coupling Contracts.
 *
 * Strict Invariants:
 * 1. Factor Independence: Volume, Intensity, and Repeated-Work are structured as independent facts.
 * 2. Coupling Contract: Formal declaration that additive combination of factors is forbidden (additiveCombinationAllowed === false).
 * 3. Zero-Coercion: Missing facts remain undefined.
 * 4. Structural Preservation: Load-group structures are preserved as structural facts without similarity scoring.
 * 5. NO Normalization / 100-point scores / Factor Weights / Decay / Readiness / Recommendations.
 */

import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext
} from '../types/historicalExerciseContext.types';
import {
  StrengthStressInterpretation,
  CurrentEvidenceTier
} from '../types/strengthStressInterpretation.types';
import {
  VolumeExposureEvidence,
  IntensityExposureEvidence,
  WorkingLoadExposureFact,
  RepeatedWorkExposureEvidence,
  StrengthStressFactorCouplingContract,
  StrengthStressFactorExposureBundle
} from '../types/strengthStressExposure.types';
import {
  interpretStrengthStressExposure
} from './strengthStressInterpretation';

/**
 * Derives current session overall volume evidence quality tier.
 */
export function deriveVolumeCurrentQuality(
  currentInput: StrengthStressMagnitudeInput
): CurrentEvidenceTier {
  const volEv = currentInput.loadVolumeEvidence;
  if (!volEv) {
    return 'limited';
  }

  const highVol = volEv.highEvidenceLoadVolumeKgReps;
  const limVol = volEv.limitedEvidenceLoadVolumeKgReps;

  if (highVol > 0 && limVol === 0) {
    return 'high';
  }
  if (highVol === 0 && limVol > 0) {
    return 'limited';
  }
  if (highVol > 0 && limVol > 0) {
    return 'mixed';
  }
  return 'limited';
}

/**
 * Pure projection of Volume Exposure Evidence.
 */
export function deriveVolumeExposureEvidence(
  currentInput: StrengthStressMagnitudeInput,
  interpretation: StrengthStressInterpretation
): VolumeExposureEvidence {
  const volInterp = interpretation.volume;
  const currentQuality = deriveVolumeCurrentQuality(currentInput);

  let direction: 'increased' | 'maintained' | 'decreased' | undefined;
  if (volInterp.lastSessionDelta) {
    if (volInterp.lastSessionDelta.deltaKgReps > 0) {
      direction = 'increased';
    } else if (volInterp.lastSessionDelta.deltaKgReps < 0) {
      direction = 'decreased';
    } else {
      direction = 'maintained';
    }
  }

  const status: VolumeExposureEvidence['provenance']['status'] =
    volInterp.referenceStatus === 'cold-start'
      ? 'cold-start'
      : volInterp.referenceStatus === 'no-volume-data'
      ? 'insufficient-reference'
      : 'sufficient-reference';

  return Object.freeze({
    kind: 'volume-exposure',
    absoluteVolumeKgReps: volInterp.currentVolumeKgReps,
    recencyExposure: Object.freeze({
      deltaKgReps: volInterp.lastSessionDelta?.deltaKgReps,
      direction,
      referenceVolumeKgReps: volInterp.lastSessionDelta?.referenceValueKgReps
    }),
    historicalRangeExposure: Object.freeze({
      relation: volInterp.distributionRelation,
      deltaToMedianKgReps: volInterp.medianDelta?.deltaKgReps,
      referenceMedianKgReps: volInterp.medianDelta?.referenceValueKgReps
    }),
    provenance: Object.freeze({
      currentQuality,
      referenceQuality: volInterp.medianDelta?.referenceEvidenceQuality ?? volInterp.lastSessionDelta?.referenceEvidenceQuality,
      status
    })
  });
}

/**
 * Pure projection of Intensity Exposure Evidence.
 */
export function deriveIntensityExposureEvidence(
  interpretation: StrengthStressInterpretation
): IntensityExposureEvidence {
  const intInterp = interpretation.intensity;

  let peakWorkingLoadExposure: IntensityExposureEvidence['peakWorkingLoadExposure'];
  if (intInterp.currentPeakWorkingLoad) {
    const peakLoad = intInterp.currentPeakWorkingLoad.observedLoadKg;
    const maxCap = intInterp.capacityReferenceAnchor?.maxObservedCapacityKg;
    const lastCap = intInterp.capacityReferenceAnchor?.lastSessionCapacityKg;

    peakWorkingLoadExposure = Object.freeze({
      observedLoadKg: peakLoad,
      deltaToMaxCapacityKg: maxCap !== undefined ? peakLoad - maxCap : undefined,
      deltaToLastCapacityKg: lastCap !== undefined ? peakLoad - lastCap : undefined,
      currentEvidenceQuality: intInterp.currentPeakWorkingLoad.currentEvidence.evidenceQuality
    });
  }

  const workingLoadExposures: WorkingLoadExposureFact[] = intInterp.loadGroupRelations.map(rel =>
    Object.freeze({
      observedLoadKg: rel.observedLoadKg,
      setCount: rel.setCount,
      totalRepsAtLoad: rel.totalRepsAtLoad,
      repsSeries: Object.freeze([...rel.repsSeries]),
      deltaToMaxCapacityKg: rel.deltaToMaxCapacityKg,
      deltaToLastCapacityKg: rel.deltaToLastSessionCapacityKg,
      currentEvidenceQuality: rel.currentEvidence.evidenceQuality
    })
  );

  let capacityAnchorFacts: IntensityExposureEvidence['capacityAnchorFacts'];
  if (intInterp.capacityReferenceAnchor) {
    capacityAnchorFacts = Object.freeze({
      maxObservedCapacityKg: intInterp.capacityReferenceAnchor.maxObservedCapacityKg,
      maxObservedQuality: intInterp.capacityReferenceAnchor.maxObservedQuality,
      lastSessionCapacityKg: intInterp.capacityReferenceAnchor.lastSessionCapacityKg,
      lastSessionQuality: intInterp.capacityReferenceAnchor.lastSessionQuality
    });
  }

  const status: IntensityExposureEvidence['provenance']['status'] =
    intInterp.referenceStatus === 'available'
      ? 'sufficient-reference'
      : intInterp.referenceStatus;

  return Object.freeze({
    kind: 'intensity-exposure',
    peakWorkingLoadExposure,
    workingLoadExposures: Object.freeze(workingLoadExposures),
    capacityAnchorFacts,
    provenance: Object.freeze({
      status
    })
  });
}

/**
 * Pure projection of Repeated-Work Exposure Evidence.
 */
export function deriveRepeatedWorkExposureEvidence(
  currentInput: StrengthStressMagnitudeInput,
  interpretation: StrengthStressInterpretation
): RepeatedWorkExposureEvidence {
  const rwInterp = interpretation.repeatedWork;

  let setDirection: 'increased' | 'maintained' | 'decreased' | undefined;
  let repDirection: 'increased' | 'maintained' | 'decreased' | undefined;

  if (rwInterp.lastSessionDelta) {
    if (rwInterp.lastSessionDelta.deltaSets > 0) {
      setDirection = 'increased';
    } else if (rwInterp.lastSessionDelta.deltaSets < 0) {
      setDirection = 'decreased';
    } else {
      setDirection = 'maintained';
    }

    if (rwInterp.lastSessionDelta.deltaReps > 0) {
      repDirection = 'increased';
    } else if (rwInterp.lastSessionDelta.deltaReps < 0) {
      repDirection = 'decreased';
    } else {
      repDirection = 'maintained';
    }
  }

  const loadGroupStructure = (currentInput.workCapacityEvidence?.loadGroups || []).map(lg =>
    Object.freeze({
      observedLoadKg: lg.observedLoadKg,
      setCount: lg.setCount,
      totalRepsAtLoad: lg.totalRepsAtLoad,
      repsSeries: Object.freeze([...lg.repsSeries])
    })
  );

  const status: RepeatedWorkExposureEvidence['provenance']['status'] =
    rwInterp.referenceStatus === 'available'
      ? 'sufficient-reference'
      : rwInterp.referenceStatus;

  return Object.freeze({
    kind: 'repeated-work-exposure',
    structuralExposure: Object.freeze({
      totalWorkingSets: rwInterp.currentTotalSets,
      totalReps: rwInterp.currentTotalReps,
      setCountRelation: rwInterp.setCountRelation,
      repCountRelation: rwInterp.repCountRelation
    }),
    recencyStructuralDelta: Object.freeze({
      deltaSets: rwInterp.lastSessionDelta?.deltaSets,
      deltaReps: rwInterp.lastSessionDelta?.deltaReps,
      setDirection,
      repDirection,
      referenceTotalSets: rwInterp.lastSessionDelta?.referenceTotalSets,
      referenceTotalReps: rwInterp.lastSessionDelta?.referenceTotalReps
    }),
    loadGroupStructure: Object.freeze(loadGroupStructure),
    provenance: Object.freeze({
      status
    })
  });
}

/**
 * Pure construction of the formal Factor Coupling & Non-Orthogonality Contract.
 */
export function buildStrengthStressFactorCouplingContract(
  currentInput: StrengthStressMagnitudeInput
): StrengthStressFactorCouplingContract {
  const loadGroups = currentInput.workCapacityEvidence?.loadGroups || [];
  const totalSets =
    currentInput.workCapacityEvidence?.totalSetCount ??
    currentInput.setEvidence.explicitWorkingSetCount + currentInput.setEvidence.unknownSetRoleCount;
  const totalReps = currentInput.workCapacityEvidence?.totalReps ?? 0;

  return Object.freeze({
    sharedDerivationBasis: 'working-sets',
    factorDependencies: Object.freeze([
      Object.freeze({
        factorKind: 'volume-exposure',
        derivesFrom: Object.freeze(['load', 'reps'] as const)
      }),
      Object.freeze({
        factorKind: 'intensity-exposure',
        derivesFrom: Object.freeze(['load', 'capacity-reference'] as const)
      }),
      Object.freeze({
        factorKind: 'repeated-work-exposure',
        derivesFrom: Object.freeze(['sets', 'reps'] as const)
      })
    ]),
    additiveCombinationAllowed: false,
    underlyingMetrics: Object.freeze({
      totalWorkingSets: totalSets,
      totalReps,
      distinctLoadCount: loadGroups.length
    })
  });
}

/**
 * Pure master function to evaluate complete Strength Stress Factor Exposure Bundle.
 */
export function evaluateStrengthStressFactorExposure(
  currentInput: StrengthStressMagnitudeInput,
  context: HistoricalExerciseContext
): StrengthStressFactorExposureBundle {
  const interpretation = interpretStrengthStressExposure(currentInput, context);

  const volumeExposure = deriveVolumeExposureEvidence(currentInput, interpretation);
  const intensityExposure = deriveIntensityExposureEvidence(interpretation);
  const repeatedWorkExposure = deriveRepeatedWorkExposureEvidence(currentInput, interpretation);
  const couplingContract = buildStrengthStressFactorCouplingContract(currentInput);

  return Object.freeze({
    currentSourceLogId: currentInput.sourceLogId,
    exerciseId: currentInput.exerciseId,
    exerciseName: currentInput.exerciseName,
    currentDate: currentInput.date,
    currentStartTime: currentInput.startTime,
    volumeExposure,
    intensityExposure,
    repeatedWorkExposure,
    couplingContract
  });
}
