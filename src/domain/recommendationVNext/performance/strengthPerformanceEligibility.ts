/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LogType, SetRecord } from '../../../types';
import {
  CanonicalNormalizedExerciseSession,
  CanonicalNormalizedSet,
  CanonicalSetRoleEvidence
} from '../types/setRole.types';
import {
  EligibilityDecision,
  StrengthEligibilityReason,
  StrengthEvidenceQuality,
  StrengthExerciseContext,
  StrengthSetPerformanceEligibility
} from '../types/performanceEligibility.types';

/**
 * Maximum repetition count eligible for standard 1RM estimation formulas.
 * 
 * Rationale:
 * Submaximal 1RM estimation equations (Epley, Brzycki, Wathan) are validated for 1-10 reps.
 * Beyond 10 repetitions, physiological determinants shift toward local muscular endurance
 * and metabolic fatigue, causing substantial over- or under-estimation errors.
 * 5-rep main compound progression tracking operates strictly within this boundary.
 */
export const MAX_E1RM_CANDIDATE_REPS = 10;

/**
 * Minimum repetition count eligible for standard 1RM estimation formulas.
 * Single repetition maxes (1 rep) are valid observations.
 */
export const MIN_E1RM_CANDIDATE_REPS = 1;

/**
 * Creates an ineligible decision with reason and insufficient quality.
 */
function createIneligibleDecision(
  reason: StrengthEligibilityReason
): EligibilityDecision {
  return {
    eligible: false,
    evidenceQuality: 'insufficient',
    reasons: Object.freeze([reason]),
  };
}

/**
 * Creates an eligible decision with specified evidence quality and reason.
 */
function createEligibleDecision(
  quality: StrengthEvidenceQuality,
  reason: StrengthEligibilityReason
): EligibilityDecision {
  return {
    eligible: true,
    evidenceQuality: quality,
    reasons: Object.freeze([reason]),
  };
}

/**
 * Creates a uniform decision for all performance purposes.
 */
function createUniformEligibility(
  decision: EligibilityDecision
): StrengthSetPerformanceEligibility {
  return Object.freeze({
    estimated1RM: decision,
    loadVolume: decision,
    workCapacity: decision,
  });
}

/**
 * Evaluates the purpose-specific performance eligibility of a single strength set.
 * 
 * Pure function: Does NOT mutate inputs, does NOT calculate e1RM or volume,
 * and preserves uncertainty (legacy unknown set roles are accepted as limited evidence candidates
 * without falsely promoting them to explicit working sets).
 * 
 * @param set Numeric weight and reps of the set
 * @param evidence Canonical role evidence from CU1 normalization
 * @param context Exercise modality and category metadata
 */
export function evaluateStrengthSetEligibility(
  set: Pick<SetRecord, 'weight' | 'reps'>,
  evidence: CanonicalSetRoleEvidence,
  context?: StrengthExerciseContext
): StrengthSetPerformanceEligibility {
  // 1. Strength Applicability Gate
  const isExplicitCardio =
    context?.category === 'Cardio' ||
    context?.logType === 'CARDIO' ||
    evidence.source === 'not-applicable-cardio';

  if (!evidence.applicableToStrength || isExplicitCardio) {
    const reason: StrengthEligibilityReason = isExplicitCardio
      ? 'excluded-cardio'
      : 'excluded-not-strength-applicable';
    return createUniformEligibility(createIneligibleDecision(reason));
  }

  // 2. Explicit Warm-up Gate
  if (evidence.role === 'explicit-warmup') {
    return createUniformEligibility(createIneligibleDecision('excluded-warmup'));
  }

  // 3. Reps Validity Check
  const reps = set.reps;
  const isValidReps =
    typeof reps === 'number' &&
    Number.isFinite(reps) &&
    reps > 0;

  if (!isValidReps) {
    return createUniformEligibility(createIneligibleDecision('excluded-invalid-reps'));
  }

  // 4. Modality / LogType Check
  const effectiveLogType: LogType = context?.logType || 'STANDARD';

  // 4A. TIME_BASED Modality
  if (effectiveLogType === 'TIME_BASED') {
    return createUniformEligibility(createIneligibleDecision('excluded-time-based'));
  }

  // 4B. BODYWEIGHT_REPS Modality
  if (effectiveLogType === 'BODYWEIGHT_REPS') {
    const weight = set.weight;
    const isFiniteWeight =
      typeof weight === 'number' &&
      Number.isFinite(weight) &&
      weight >= 0;

    if (!isFiniteWeight) {
      return createUniformEligibility(createIneligibleDecision('excluded-invalid-load'));
    }

    const baseQuality: StrengthEvidenceQuality =
      evidence.role === 'explicit-working-set' ? 'high' : 'limited';
    const baseReason: StrengthEligibilityReason =
      evidence.role === 'explicit-working-set'
        ? 'eligible-explicit-working-set'
        : 'eligible-legacy-role-unknown';

    return Object.freeze({
      estimated1RM: createIneligibleDecision('excluded-bodyweight-for-external-load-metric'),
      loadVolume: createIneligibleDecision('excluded-bodyweight-for-external-load-metric'),
      workCapacity: createEligibleDecision(baseQuality, baseReason),
    });
  }

  // 4D. STANDARD Modality (External Load + Reps)
  const weight = set.weight;
  const isValidStandardLoad =
    typeof weight === 'number' &&
    Number.isFinite(weight) &&
    weight > 0;

  if (!isValidStandardLoad) {
    return createUniformEligibility(createIneligibleDecision('excluded-invalid-load'));
  }

  // Determine base evidence quality & reason from set role evidence
  const isExplicit = evidence.role === 'explicit-working-set';
  const baseQuality: StrengthEvidenceQuality = isExplicit ? 'high' : 'limited';
  const baseReason: StrengthEligibilityReason = isExplicit
    ? 'eligible-explicit-working-set'
    : 'eligible-legacy-role-unknown';

  // Load Volume Eligibility: STANDARD valid load + reps > 0
  const loadVolumeDecision = createEligibleDecision(baseQuality, baseReason);

  // Work Capacity Eligibility: STANDARD valid load + reps > 0
  const workCapacityDecision = createEligibleDecision(baseQuality, baseReason);

  // Estimated 1RM Eligibility: STANDARD valid load + reps within [MIN_E1RM, MAX_E1RM]
  const isE1RMRepRange = reps >= MIN_E1RM_CANDIDATE_REPS && reps <= MAX_E1RM_CANDIDATE_REPS;
  const estimated1RMDecision = isE1RMRepRange
    ? createEligibleDecision(baseQuality, baseReason)
    : createIneligibleDecision('excluded-e1rm-rep-range');

  return Object.freeze({
    estimated1RM: estimated1RMDecision,
    loadVolume: loadVolumeDecision,
    workCapacity: workCapacityDecision,
  });
}

/**
 * Evaluates performance eligibility for a contextual canonical normalized set.
 */
export function evaluateNormalizedSetEligibility(
  normalizedSet: CanonicalNormalizedSet,
  context?: StrengthExerciseContext
): StrengthSetPerformanceEligibility {
  return evaluateStrengthSetEligibility(
    { weight: normalizedSet.weight, reps: normalizedSet.reps },
    normalizedSet.evidence,
    context
  );
}

/**
 * Evaluates performance eligibility for all sets in a normalized exercise session.
 */
export function evaluateNormalizedExerciseSessionEligibility(
  exerciseSession: CanonicalNormalizedExerciseSession,
  contextOverride?: Partial<StrengthExerciseContext>
): readonly { set: CanonicalNormalizedSet; eligibility: StrengthSetPerformanceEligibility }[] {
  const context: StrengthExerciseContext = {
    exerciseId: exerciseSession.exerciseId,
    exerciseName: exerciseSession.exerciseName,
    category: exerciseSession.category,
    ...contextOverride,
  };

  return Object.freeze(
    exerciseSession.sets.map((set) => ({
      set,
      eligibility: evaluateNormalizedSetEligibility(set, context),
    }))
  );
}
