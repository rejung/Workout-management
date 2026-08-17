/**
 * Strength Stress Factor Vocabulary Registry & Invariant Auditing (VNext Recommendation Engine - CU3.4)
 *
 * Provides:
 * 1. Read-only registry of Strength Stress Factor Definitions.
 * 2. Pure inspection function to determine Factor Availability for a StrengthStressMagnitudeInput.
 * 3. Invariant auditing functions ensuring double-counting prevention, domain separation,
 *    and non-numeric factor vocabulary compliance.
 *
 * Strict Guarantees:
 * - ZERO numerical calculations (no scores, weights, sums, multipliers, decay, or readiness).
 * - ZERO dimension magnitude allocations.
 * - ZERO running factors or cross-modality contamination.
 * - Deeply immutable / frozen structures.
 */

import { StrengthStressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import {
  StrengthStressFactor,
  StrengthStressFactorDefinition,
  StrengthStressInputChannel,
  StrengthSessionFactorProfile,
  FactorAvailabilityAssessment,
  StrengthFactorInvariantCheck
} from '../types/strengthStressFactors.types';

/**
 * Frozen registry of analytical Strength Stress Factors.
 */
export const STRENGTH_STRESS_FACTOR_REGISTRY: readonly StrengthStressFactorDefinition[] = Object.freeze([
  Object.freeze({
    factor: 'volume-exposure',
    name: 'Volume Exposure',
    description:
      'Quantitative context of repeated external-load mechanical work performed during the session.',
    primarySourceChannels: ['load-volume-evidence'] as const,
    contextSourceChannels: ['set-evidence', 'work-capacity-evidence'] as const,
    physicalFacet:
      'Total accumulated load-volume (kg·reps) and number of completed working sets under load.',
    nonOrthogonalityNote:
      'Shares raw set observations with Repeated-Work Exposure. Must NOT be arithmetically summed or double-counted in subsequent magnitude policies.'
  }),
  Object.freeze({
    factor: 'intensity-exposure',
    name: 'Intensity Exposure',
    description:
      'Peak and working load magnitude relative to exercise-specific performance capability context.',
    primarySourceChannels: ['e1rm-evidence'] as const,
    contextSourceChannels: ['set-evidence', 'work-capacity-evidence'] as const,
    physicalFacet:
      'Top-end load and peak estimated 1RM achieved during the session (when within 1-10 rep valid bounds).',
    nonOrthogonalityNote:
      'Represents performance boundary context rather than cumulative volume. Independent of total repetition count.'
  }),
  Object.freeze({
    factor: 'repeated-work-exposure',
    name: 'Repeated-Work Exposure',
    description:
      'Structural repetition and cluster pattern of sets executed at identical or contiguous load brackets.',
    primarySourceChannels: ['work-capacity-evidence'] as const,
    contextSourceChannels: ['set-evidence', 'load-volume-evidence'] as const,
    physicalFacet:
      'Distribution of repetition series across distinct load groups (e.g. 5x5 backoffs, drop sets, clustered volume).',
    nonOrthogonalityNote:
      'Derived from the same underlying sets as Volume Exposure, but focuses on clustered work density rather than gross tonnage. Must not be treated as an additive independent stressor.'
  })
]);

/**
 * Assesses factor availability for a given StrengthStressMagnitudeInput without calculating any scores.
 */
export function assessStrengthSessionFactorProfile(
  input: StrengthStressMagnitudeInput
): StrengthSessionFactorProfile {
  const factorAssessments: FactorAvailabilityAssessment[] = [];

  // 1. Volume Exposure Assessment
  if (input.loadVolumeEvidence && input.loadVolumeEvidence.totalLoadVolumeKgReps > 0) {
    factorAssessments.push(
      Object.freeze({
        factor: 'volume-exposure',
        status: 'available',
        sourceEvidenceDescription: `Accumulated ${input.loadVolumeEvidence.totalLoadVolumeKgReps} kg·reps across ${input.loadVolumeEvidence.observationCount} working observations (${input.loadVolumeEvidence.highEvidenceLoadVolumeKgReps} high-evidence kg·reps).`
      })
    );
  } else if (input.setEvidence.explicitWorkingSetCount > 0) {
    factorAssessments.push(
      Object.freeze({
        factor: 'volume-exposure',
        status: 'available',
        sourceEvidenceDescription: `Executed ${input.setEvidence.explicitWorkingSetCount} working sets (unweighted or non-tonnage).`
      })
    );
  } else {
    factorAssessments.push(
      Object.freeze({
        factor: 'volume-exposure',
        status: 'insufficient-evidence',
        sourceEvidenceDescription: 'No positive load-volume or working sets observed.'
      })
    );
  }

  // 2. Intensity Exposure Assessment
  if (
    input.e1RMEvidence &&
    typeof input.e1RMEvidence.selectedPeakEstimated1RMKg === 'number' &&
    input.e1RMEvidence.selectedPeakEstimated1RMKg > 0
  ) {
    factorAssessments.push(
      Object.freeze({
        factor: 'intensity-exposure',
        status: 'available',
        sourceEvidenceDescription: `Peak estimated 1RM observed at ${input.e1RMEvidence.selectedPeakEstimated1RMKg} kg (${input.e1RMEvidence.selectedEvidenceQuality} quality).`
      })
    );
  } else {
    factorAssessments.push(
      Object.freeze({
        factor: 'intensity-exposure',
        status: 'insufficient-evidence',
        sourceEvidenceDescription:
          'No valid 1-10 rep working sets observed for peak estimated 1RM derivation (e.g. high-rep only or unweighted).'
      })
    );
  }

  // 3. Repeated-Work Exposure Assessment
  if (
    input.workCapacityEvidence &&
    input.workCapacityEvidence.loadGroups.length > 0 &&
    input.workCapacityEvidence.totalReps > 0
  ) {
    const groupSummary = input.workCapacityEvidence.loadGroups
      .map(g => `${g.observedLoadKg}kg [${g.repsSeries.join(',')}]`)
      .join(', ');
    factorAssessments.push(
      Object.freeze({
        factor: 'repeated-work-exposure',
        status: 'available',
        sourceEvidenceDescription: `Structured across ${input.workCapacityEvidence.loadGroups.length} load groups totaling ${input.workCapacityEvidence.totalReps} reps (${groupSummary}).`
      })
    );
  } else {
    factorAssessments.push(
      Object.freeze({
        factor: 'repeated-work-exposure',
        status: 'insufficient-evidence',
        sourceEvidenceDescription: 'No work capacity load groups or repetitions recorded.'
      })
    );
  }

  const availableCount = factorAssessments.filter(a => a.status === 'available').length;

  return Object.freeze({
    sourceLogId: input.sourceLogId,
    exerciseId: input.exerciseId,
    exerciseName: input.exerciseName,
    factorAssessments: Object.freeze(factorAssessments),
    availableFactorCount: availableCount
  });
}

/**
 * Runs invariant verification audit on Strength Stress Factors across scenarios.
 */
export function auditStrengthStressFactorInvariants(): readonly StrengthFactorInvariantCheck[] {
  const checks: StrengthFactorInvariantCheck[] = [];

  // Check 1: Registry completeness & factor uniqueness
  const factors = STRENGTH_STRESS_FACTOR_REGISTRY.map(f => f.factor);
  const uniqueFactors = new Set(factors);
  checks.push({
    invariantName: 'Factor Vocabulary Registry Uniqueness & Completeness',
    satisfied:
      uniqueFactors.size === 3 &&
      uniqueFactors.has('volume-exposure') &&
      uniqueFactors.has('intensity-exposure') &&
      uniqueFactors.has('repeated-work-exposure'),
    details: 'Registry cleanly defines exactly 3 distinct analytical factors without duplicates.'
  });

  // Check 2: Non-Orthogonality & Double-Counting Invariant Declaration
  const volumeDef = STRENGTH_STRESS_FACTOR_REGISTRY.find(f => f.factor === 'volume-exposure');
  const repeatedDef = STRENGTH_STRESS_FACTOR_REGISTRY.find(f => f.factor === 'repeated-work-exposure');
  checks.push({
    invariantName: 'Double-Counting Invariant Explicit Declaration',
    satisfied:
      Boolean(volumeDef?.nonOrthogonalityNote.includes('Must NOT be arithmetically summed')) &&
      Boolean(repeatedDef?.nonOrthogonalityNote.includes('Derived from the same underlying sets')),
    details: 'Factors explicitly document shared source observations to forbid default additive combinations.'
  });

  // Check 3: Dimension vs Factor Invariant (Vocabulary separation)
  const stressDimensionKeywords = [
    'knee-dominant-lower-body',
    'hip-posterior-chain',
    'horizontal-push',
    'horizontal-pull',
    'vertical-push',
    'vertical-pull',
    'axial-systemic-loading',
    'core-stability-lumbar'
  ];
  const factorNames = STRENGTH_STRESS_FACTOR_REGISTRY.map(f => f.factor.toLowerCase());
  const dimensionOverlap = factorNames.some(fn => stressDimensionKeywords.includes(fn));
  checks.push({
    invariantName: 'Dimension vs Factor Separation Invariant',
    satisfied: !dimensionOverlap,
    details: 'Stress Dimensions (anatomical/movement routing) and Stress Factors (analytical exposure lenses) are completely separated.'
  });

  // Check 4: Evidence Quality vs Factor Separation
  const evidenceQualityKeywords = ['high', 'limited', 'unverified', 'explicit', 'inferred'];
  const qualityOverlap = factorNames.some(fn => evidenceQualityKeywords.includes(fn));
  checks.push({
    invariantName: 'Evidence Quality vs Factor Separation Invariant',
    satisfied: !qualityOverlap,
    details: 'Data provenance quality is strictly separated from training stress factors.'
  });

  // Check 5: Golden Scenario A (Heavy Single + Backoffs) - REAL Bench (80x1 + 70x5x5)
  const benchInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: '7111a61d-638f-4338-a0c1-7a5c54d06bf0',
    date: '2026-08-12',
    startTime: '18:21',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push'],
    setEvidence: {
      totalRawSetCount: 10,
      explicitWorkingSetCount: 6,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 4
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 81.667,
      selectedPeakEstimated1RMKg: 81.667,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1830,
      highEvidenceLoadVolumeKgReps: 1830,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 6
    },
    workCapacityEvidence: {
      totalSetCount: 6,
      totalReps: 26,
      loadGroups: [
        {
          observedLoadKg: 80,
          setCount: 1,
          repsSeries: [1],
          totalRepsAtLoad: 1,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 70,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const benchProfile = assessStrengthSessionFactorProfile(benchInput);
  checks.push({
    invariantName: 'Scenario A: Heavy Single + Backoffs (Bench Press) Multi-Factor Profile',
    satisfied:
      benchProfile.availableFactorCount === 3 &&
      benchProfile.factorAssessments.every(a => a.status === 'available'),
    details: 'Heavy single + 5x5 backoff cleanly yields Volume, Intensity, and Repeated-Work factor availability.'
  });

  // Check 6: Golden Scenario B (Moderate Repeated Sets) - REAL Squat (2026-08-07)
  const squatInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'b8c816b3-25c6-434c-97d7-1a71cb63b590',
    date: '2026-08-07',
    startTime: '18:21',
    exerciseId: 'squat',
    exerciseName: '스쿼트 (Squat)',
    category: 'Legs',
    dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain', 'axial-systemic-loading'],
    setEvidence: {
      totalRawSetCount: 7,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 2
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 128.333,
      selectedPeakEstimated1RMKg: 128.333,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 2395,
      highEvidenceLoadVolumeKgReps: 2395,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 23,
      loadGroups: [
        {
          observedLoadKg: 115,
          setCount: 1,
          repsSeries: [3],
          totalRepsAtLoad: 3,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 110,
          setCount: 1,
          repsSeries: [5],
          totalRepsAtLoad: 5,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 100,
          setCount: 3,
          repsSeries: [5, 5, 5],
          totalRepsAtLoad: 15,
          highEvidenceSetCount: 3,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const squatProfile = assessStrengthSessionFactorProfile(squatInput);
  checks.push({
    invariantName: 'Scenario B: Moderate Repeated Sets (Squat) Multi-Factor Profile',
    satisfied:
      squatProfile.availableFactorCount === 3 &&
      squatProfile.factorAssessments.every(a => a.status === 'available'),
    details: 'Squat session preserves all 3 factor channels without assuming single tonnage identity.'
  });

  // Check 7: Golden Scenario C (High-Rep 50x30 without e1RM)
  const highRepInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'synth-high-rep-1',
    date: '2026-08-15',
    startTime: '10:00',
    exerciseId: 'leg-press',
    exerciseName: '레그 프레스 (Leg Press)',
    category: 'Legs',
    dimensions: ['knee-dominant-lower-body'],
    setEvidence: {
      totalRawSetCount: 1,
      explicitWorkingSetCount: 1,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    // e1RM absent for rep count > 10
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1500,
      highEvidenceLoadVolumeKgReps: 1500,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 1
    },
    workCapacityEvidence: {
      totalSetCount: 1,
      totalReps: 30,
      loadGroups: [
        {
          observedLoadKg: 50,
          setCount: 1,
          repsSeries: [30],
          totalRepsAtLoad: 30,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const highRepProfile = assessStrengthSessionFactorProfile(highRepInput);
  const highRepIntensity = highRepProfile.factorAssessments.find(a => a.factor === 'intensity-exposure');
  const highRepVolume = highRepProfile.factorAssessments.find(a => a.factor === 'volume-exposure');
  checks.push({
    invariantName: 'Scenario C: High-Rep Set Factor Availability (Missing e1RM != Zero Stress)',
    satisfied:
      highRepIntensity?.status === 'insufficient-evidence' &&
      highRepVolume?.status === 'available' &&
      highRepProfile.availableFactorCount === 2,
    details: 'High-rep set lacks intensity factor but retains volume and repeated-work factors without being zeroed.'
  });

  // Check 8: Golden Scenario D (Single-Only 100x1)
  const singleInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'synth-single-1',
    date: '2026-08-15',
    startTime: '11:00',
    exerciseId: 'deadlift',
    exerciseName: '데드리프트 (Deadlift)',
    category: 'Back',
    dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
    setEvidence: {
      totalRawSetCount: 1,
      explicitWorkingSetCount: 1,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 100,
      selectedPeakEstimated1RMKg: 100,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 100,
      highEvidenceLoadVolumeKgReps: 100,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 1
    },
    workCapacityEvidence: {
      totalSetCount: 1,
      totalReps: 1,
      loadGroups: [
        {
          observedLoadKg: 100,
          setCount: 1,
          repsSeries: [1],
          totalRepsAtLoad: 1,
          highEvidenceSetCount: 1,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const singleProfile = assessStrengthSessionFactorProfile(singleInput);
  checks.push({
    invariantName: 'Scenario D: Single-Only Set Factor Profile',
    satisfied:
      singleProfile.availableFactorCount === 3 &&
      singleProfile.factorAssessments.find(a => a.factor === 'intensity-exposure')?.status === 'available',
    details: 'Single repetition provides full intensity evidence alongside nominal volume.'
  });

  // Check 9: Golden Scenario E (Legacy Unknown-Role Sets)
  const legacyInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: 'synth-legacy-1',
    date: '2026-08-15',
    startTime: '12:00',
    exerciseId: 'lat-pulldown',
    exerciseName: '랫 풀다운 (Lat Pulldown)',
    category: 'Back',
    dimensions: ['vertical-pull'],
    setEvidence: {
      totalRawSetCount: 3,
      explicitWorkingSetCount: 0,
      unknownSetRoleCount: 3,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 70,
      selectedPeakEstimated1RMKg: 70,
      selectedEvidenceQuality: 'limited'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 0,
      limitedEvidenceLoadVolumeKgReps: 1800,
      observationCount: 3
    },
    workCapacityEvidence: {
      totalSetCount: 3,
      totalReps: 30,
      loadGroups: [
        {
          observedLoadKg: 60,
          setCount: 3,
          repsSeries: [10, 10, 10],
          totalRepsAtLoad: 30,
          highEvidenceSetCount: 0,
          limitedEvidenceSetCount: 3
        }
      ]
    }
  };
  const legacyProfile = assessStrengthSessionFactorProfile(legacyInput);
  checks.push({
    invariantName: 'Scenario E: Legacy Limited Set Role Factor Availability',
    satisfied:
      legacyProfile.availableFactorCount === 3 &&
      legacyProfile.factorAssessments.every(a => a.status === 'available'),
    details: 'Legacy unknown set roles provide available factor evidence while preserving limited quality metadata.'
  });

  // Check 10: REAL OHP Audit (2026-08-09 7 working sets)
  const ohpInput: StrengthStressMagnitudeInput = {
    kind: 'strength',
    sourceLogId: '25a639c0-2ccd-4845-bf39-bb3a4d8f146a',
    date: '2026-08-09',
    startTime: '15:56',
    exerciseId: 'overhead-press',
    exerciseName: '오버헤드 프레스 (Overhead Press)',
    category: 'Shoulders',
    dimensions: ['vertical-push', 'axial-systemic-loading'],
    setEvidence: {
      totalRawSetCount: 9,
      explicitWorkingSetCount: 7,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 2
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 58.333,
      selectedPeakEstimated1RMKg: 58.333,
      selectedEvidenceQuality: 'high'
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1575,
      highEvidenceLoadVolumeKgReps: 1575,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 7
    },
    workCapacityEvidence: {
      totalSetCount: 7,
      totalReps: 35,
      loadGroups: [
        {
          observedLoadKg: 50,
          setCount: 2,
          repsSeries: [5, 5],
          totalRepsAtLoad: 10,
          highEvidenceSetCount: 2,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 45,
          setCount: 3,
          repsSeries: [5, 5, 5],
          totalRepsAtLoad: 15,
          highEvidenceSetCount: 3,
          limitedEvidenceSetCount: 0
        },
        {
          observedLoadKg: 40,
          setCount: 2,
          repsSeries: [5, 5],
          totalRepsAtLoad: 10,
          highEvidenceSetCount: 2,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  };
  const ohpProfile = assessStrengthSessionFactorProfile(ohpInput);
  checks.push({
    invariantName: 'REAL OHP Audit (7 working sets, 3 load brackets)',
    satisfied:
      ohpProfile.availableFactorCount === 3 &&
      ohpProfile.factorAssessments.every(a => a.status === 'available'),
    details: 'OHP session with descending load brackets cleanly yields 3 available analytical factor channels.'
  });

  return Object.freeze(checks);
}
