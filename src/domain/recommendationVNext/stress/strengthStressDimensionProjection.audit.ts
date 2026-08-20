/**
 * Strength Stress Dimension Projection Invariant Audit Suite (VNext Recommendation Engine - CU3.11)
 *
 * Dedicated verification module isolated from production domain logic.
 *
 * Invariant Guarantees Verified:
 * 1. Squat Canonical Mapping: 3 projections (knee-dominant-lower-body, hip-posterior-chain, axial-systemic-loading).
 * 2. Deadlift Canonical Mapping: 2 projections (hip-posterior-chain, axial-systemic-loading), strictly NO horizontal-pull.
 * 3. OHP Canonical Mapping: 2 projections (vertical-push, axial-systemic-loading).
 * 4. Bench Press Canonical Mapping: 1 projection (horizontal-push).
 * 5. Unmapped Exercise Quarantine: targetDimensions.length === 0 -> quarantined in unmappedExercises with 0 fake assignments.
 * 6. Source Session Magnitude Reference Fidelity: sourceSessionMagnitude is preserved losslessly without mutation or dimension-level splitting.
 * 7. Associated Dimensions Fidelity: associatedDimensions across each projected instance reflects full targetDimensions list.
 * 8. NO Dimension-Specific Magnitude Fields: Projections do NOT have individual kg·reps or magnitude score fields.
 * 9. Controlled Real Fixtures Session Bundle Projection.
 * 10. Deep Immutability & Pure Determinism: 0 input mutations, deeply frozen objects.
 */

import {
  StrengthStressMagnitude
} from '../types/strengthStressMagnitude.types';
import {
  StrengthStressDimensionProjectionAuditResult
} from '../types/strengthStressDimensionProjection.types';
import {
  projectStrengthStressToDimensions,
  buildSessionDimensionProjectionBundle,
  FROZEN_STRESS_DIMENSIONS
} from './strengthStressDimensionProjection';
import {
  evaluateStrengthStressMagnitude
} from './strengthStressMagnitude';
import {
  deriveControlledCandidateStressMagnitudeInputs
} from './controlledWorkoutValidationFixture';
import {
  deriveHistoricalExerciseContextFromCandidates
} from '../context/historicalExerciseContext';

/**
 * Runs the complete invariant audit suite for CU3.11 Strength Stress Dimension Projection.
 */
export function auditStrengthStressDimensionProjection(): readonly StrengthStressDimensionProjectionAuditResult[] {
  const results: StrengthStressDimensionProjectionAuditResult[] = [];

  // =========================================================================
  // Synthetic Fixtures for Canonical Lifts
  // =========================================================================

  const baseMagnitude = (
    exerciseId: string,
    exerciseName: string,
    targetDimensions: readonly any[]
  ): StrengthStressMagnitude =>
    Object.freeze({
      kind: 'strength-stress-magnitude',
      sourceLogId: 'session-canonical-1',
      exerciseId,
      exerciseName,
      date: '2026-08-15',
      startTime: '10:00',
      targetDimensions: Object.freeze([...targetDimensions]),
      historyState: 'single-session-reference',
      totalHistoricalSessionCount: 1,
      factorProfiles: Object.freeze({
        volume: Object.freeze({
          absoluteKgReps: 2000,
          distributionRelation: 'within-range-above-median',
          recencyDeltaKgReps: 100,
          currentQuality: 'high',
          referenceStatus: 'sufficient-reference'
        }),
        intensity: Object.freeze({
          peakWorkingLoadKg: 100,
          workingLoads: Object.freeze([]),
          referenceStatus: 'sufficient-reference'
        }),
        repeatedWork: Object.freeze({
          totalWorkingSets: 5,
          totalReps: 25,
          setCountRelation: 'within-range',
          repCountRelation: 'within-range',
          loadGroupStructure: Object.freeze([]),
          referenceStatus: 'sufficient-reference'
        })
      }),
      couplingContract: Object.freeze({
        sharedDerivationBasis: 'working-sets',
        factorDependencies: Object.freeze([]),
        additiveCombinationAllowed: false,
        underlyingMetrics: Object.freeze({
          totalWorkingSets: 5,
          totalReps: 25,
          distinctLoadCount: 1
        })
      })
    });

  const squatMag = baseMagnitude('squat', '스쿼트 (Squat)', [
    'knee-dominant-lower-body',
    'hip-posterior-chain',
    'axial-systemic-loading'
  ]);

  const deadliftMag = baseMagnitude('deadlift', '데드리프트 (Deadlift)', [
    'hip-posterior-chain',
    'axial-systemic-loading'
  ]);

  const ohpMag = baseMagnitude('overhead-press', '오버헤드 프레스 (Overhead Press)', [
    'vertical-push',
    'axial-systemic-loading'
  ]);

  const benchMag = baseMagnitude('bench-press', '벤치프레스 (Bench Press)', [
    'horizontal-push'
  ]);

  const unmappedMag = baseMagnitude('unregistered-lift', '알수없는 운동 (Unmapped)', []);

  // =========================================================================
  // AUDIT 1: Squat Canonical Mapping (3 Dimensions)
  // =========================================================================
  const squatProj = projectStrengthStressToDimensions(squatMag);
  const squatDims = squatProj.projections.map(p => p.dimension);

  results.push({
    auditName: 'INVARIANT 1: Squat Canonical 3 Dimensions Mapping',
    passed:
      squatProj.projections.length === 3 &&
      squatDims.includes('knee-dominant-lower-body') &&
      squatDims.includes('hip-posterior-chain') &&
      squatDims.includes('axial-systemic-loading') &&
      squatProj.unmappedRecord === undefined,
    details: 'Squat correctly projects into knee-dominant-lower-body, hip-posterior-chain, and axial-systemic-loading.'
  });

  // =========================================================================
  // AUDIT 2: Deadlift Canonical Mapping (2 Dimensions, NO horizontal-pull)
  // =========================================================================
  const dlProj = projectStrengthStressToDimensions(deadliftMag);
  const dlDims = dlProj.projections.map(p => p.dimension);

  results.push({
    auditName: 'INVARIANT 2: Deadlift Canonical Mapping (NO horizontal-pull)',
    passed:
      dlProj.projections.length === 2 &&
      dlDims.includes('hip-posterior-chain') &&
      dlDims.includes('axial-systemic-loading') &&
      !dlDims.includes('horizontal-pull' as any),
    details: 'Deadlift projects strictly to hip-posterior-chain and axial-systemic-loading, never horizontal-pull.'
  });

  // =========================================================================
  // AUDIT 3: OHP Canonical Mapping (2 Dimensions)
  // =========================================================================
  const ohpProj = projectStrengthStressToDimensions(ohpMag);
  const ohpDims = ohpProj.projections.map(p => p.dimension);

  results.push({
    auditName: 'INVARIANT 3: OHP Canonical 2 Dimensions Mapping',
    passed:
      ohpProj.projections.length === 2 &&
      ohpDims.includes('vertical-push') &&
      ohpDims.includes('axial-systemic-loading'),
    details: 'OHP projects into vertical-push and axial-systemic-loading.'
  });

  // =========================================================================
  // AUDIT 4: Bench Press Canonical Mapping (1 Dimension)
  // =========================================================================
  const benchProj = projectStrengthStressToDimensions(benchMag);

  results.push({
    auditName: 'INVARIANT 4: Bench Press Canonical 1 Dimension Mapping',
    passed:
      benchProj.projections.length === 1 &&
      benchProj.projections[0].dimension === 'horizontal-push',
    details: 'Bench press projects strictly into horizontal-push.'
  });

  // =========================================================================
  // AUDIT 5: Unmapped Exercise Quarantine Invariant
  // =========================================================================
  const unmappedProj = projectStrengthStressToDimensions(unmappedMag);

  results.push({
    auditName: 'INVARIANT 5: Unmapped Exercise Quarantine',
    passed:
      unmappedProj.projections.length === 0 &&
      unmappedProj.unmappedRecord !== undefined &&
      unmappedProj.unmappedRecord.exerciseId === 'unregistered-lift' &&
      unmappedProj.unmappedRecord.reason === 'unmapped-dimension-tag',
    details: 'Unmapped exercise with 0 valid target dimensions is quarantined without fake dimension assignment.'
  });

  // =========================================================================
  // AUDIT 6: Multi-Dimension Associated Dimensions Fidelity
  // =========================================================================
  const squatAssocFidelity = squatProj.projections.every(
    p =>
      p.associatedDimensions.length === 3 &&
      p.associatedDimensions.includes('knee-dominant-lower-body') &&
      p.associatedDimensions.includes('hip-posterior-chain') &&
      p.associatedDimensions.includes('axial-systemic-loading')
  );

  results.push({
    auditName: 'INVARIANT 6: Multi-Dimension Associated Dimensions Fidelity',
    passed: squatAssocFidelity,
    details: 'Every projected instance retains complete awareness of all sibling associatedDimensions.'
  });

  // =========================================================================
  // AUDIT 7: Source Session Magnitude Fidelity & NO Dimension-Specific Magnitudes
  // =========================================================================
  const noDimensionSpecificFields = squatProj.projections.every(p => {
    const keys = Object.keys(p);
    return (
      !keys.includes('dimensionVolumeKgReps') &&
      !keys.includes('fractionalWeight') &&
      !keys.includes('dimensionScore') &&
      !keys.includes('fatigue') &&
      !keys.includes('readiness')
    );
  });

  const sourceMagRefExact = squatProj.projections.every(
    p => p.sourceSessionMagnitude === squatMag
  );

  results.push({
    auditName: 'INVARIANT 7: Source Magnitude Fidelity & NO Dimension-Specific Magnitude Fields',
    passed: noDimensionSpecificFields && sourceMagRefExact,
    details: 'Projections strictly link sourceSessionMagnitude by reference and do not create split/weighted dimension magnitudes.'
  });

  // =========================================================================
  // AUDIT 8: Controlled Real Fixture End-to-End Session Bundle Projection
  // =========================================================================
  const pool = deriveControlledCandidateStressMagnitudeInputs();

  // Bench Target
  const benchTarget = pool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as any;
  const benchContext = deriveHistoricalExerciseContextFromCandidates(benchTarget, pool);
  const benchSessionMag = evaluateStrengthStressMagnitude(benchTarget, benchContext);

  // Squat Target
  const squatTarget = pool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as any;
  const squatContext = deriveHistoricalExerciseContextFromCandidates(squatTarget, pool);
  const squatSessionMag = evaluateStrengthStressMagnitude(squatTarget, squatContext);

  const bundle = buildSessionDimensionProjectionBundle([benchSessionMag, squatSessionMag]);

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 8: Multi-Exercise Session Dimension Bundle',
    passed:
      bundle.projections.length === 1 + (squatSessionMag.targetDimensions.length || 0) &&
      bundle.unmappedExercises.length === 0 &&
      bundle.sourceLogId === benchSessionMag.sourceLogId,
    details: 'Session bundle correctly collects projections across multiple exercises in a workout.'
  });

  // =========================================================================
  // AUDIT 9: Deep Immutability Invariant
  // =========================================================================
  results.push({
    auditName: 'INVARIANT 9: Deep Immutability & Object.isFrozen',
    passed:
      Object.isFrozen(squatProj) &&
      Object.isFrozen(squatProj.projections) &&
      Object.isFrozen(squatProj.projections[0]) &&
      Object.isFrozen(squatProj.projections[0].associatedDimensions) &&
      Object.isFrozen(bundle) &&
      Object.isFrozen(bundle.projections),
    details: 'All projection objects, associatedDimensions arrays, and session bundles are deeply frozen.'
  });

  // =========================================================================
  // AUDIT 10: Pure Determinism Across Repeated Invocations
  // =========================================================================
  const runA = projectStrengthStressToDimensions(squatMag);
  const runB = projectStrengthStressToDimensions(squatMag);

  results.push({
    auditName: 'INVARIANT 10: Pure Determinism Across Invocations',
    passed: JSON.stringify(runA) === JSON.stringify(runB),
    details: 'Projecting identical magnitude repeatedly produces bitwise identical projection results.'
  });

  return Object.freeze(results);
}
