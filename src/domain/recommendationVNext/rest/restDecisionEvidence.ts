/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Session-Level Rest Decision Evidence Reasoner (VNext Recommendation Engine - CU4.3)
 *
 * Derives the independent Session-Level Rest Decision Evidence strictly from
 * recorded Strength and Cardio logs and deterministically derived facts.
 *
 * Strict Invariants:
 * 1. Evidence Boundary: Only actual recorded Strength and Cardio data and deterministically
 *    derived facts.
 * 2. Zero Biological / CNS Guessing: Forbidden to estimate CNS fatigue, recovery %,
 *    muscle recovery %, sleep, HRV, motivation, or unrecorded RPE.
 * 3. Zero Scalar Collapse: No scalar rest scores, fatigue numbers, or hidden multipliers.
 * 4. Distinct Metrics: Session count and unique workout days are strictly separated.
 * 5. Multi-Directional Preservation: Both supporting reasons and counter reasons are preserved.
 * 6. Rest Taxonomy: 'rest-supported' | 'rest-reasonable' | 'rest-not-indicated'.
 * 7. Completed Session Boundary: A session completed on the evaluation date yields 'rest-supported'.
 * 8. Pure Immutability: Deeply frozen return structures with zero mutation.
 */

import { StressDimension } from '../types/stressModel.types';
import {
  StressMagnitudeInput,
  StrengthStressMagnitudeInput,
  RunningStressMagnitudeInput,
} from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import { EvaluationContext } from '../types/residualStressTrace.types';
import { AllDimensionResidualStates } from '../types/dimensionResidualState.types';
import { CandidateDecisionEvidence } from '../types/candidateDecision.types';
import {
  CardioExposureContext,
  DailyTrainingBreakdown,
  MultiModalityExposureContext,
  RecentAxialExposure,
  RecentHighLoadExposure,
  RecentTrainingContext,
  RecentTrainingDensity,
  RepeatedCompoundExposure,
  RestCandidateLandscape,
  RestDecisionEvidence,
  RestResidualLandscape,
  RestSupportClass,
  RestUncertaintyContext,
  SystemicTrainingDemandContext,
  SystemicTrainingDemandEvidenceState,
  TrainingModalityPresence,
} from '../types/restDecision.types';
import {
  evaluateSessionTemporalEligibility,
  TemporalEligibilityResult,
} from '../temporal/temporalEligibility';
import { computeCalendarDayDelta } from '../need/candidateTrainingNeed';

export const DEFAULT_RECENT_TRAINING_WINDOW_DAYS = 7;

const ALL_CANONICAL_DIMENSIONS: readonly StressDimension[] = Object.freeze([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
  'horizontal-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'axial-systemic-loading',
]);

const COMPOUND_EXERCISE_IDS = new Set([
  'squat',
  'deadlift',
  'bench_press',
  'barbell_row',
  'overhead_press',
  'leg_press',
  'front_squat',
  'romanian_deadlift',
]);

// =========================================================================
// 1. Recent Training Context Derivation
// =========================================================================
// Helper Types & Deduplication for Unified Sessions
// =========================================================================

interface UnifiedRunningFact {
  readonly logId?: string;
  readonly date: string;
  readonly startTime?: string;
  readonly exerciseName: string;
  readonly distanceKm?: number;
  readonly durationSeconds?: number;
  readonly paceSecondsPerKm?: number;
  readonly temporalResult: TemporalEligibilityResult;
}

interface UnifiedWorkoutSession {
  readonly sessionKey: string;
  readonly date: string;
  readonly startTime?: string;
  readonly temporalResult: TemporalEligibilityResult;
  readonly strengthItems: readonly StrengthStressMagnitudeInput[];
  readonly runningItems: readonly UnifiedRunningFact[];
  readonly exerciseNames: readonly string[];
  readonly hasStrength: boolean;
  readonly hasCardio: boolean;
  readonly hasAxialLoading: boolean;
  readonly hasCompoundLoading: boolean;
  readonly hasHighWorkingLoad: boolean;
  readonly highLoadExerciseDescriptions: readonly string[];
  readonly axialExerciseNames: readonly string[];
  readonly compoundExerciseNames: readonly string[];
}

/**
 * Builds discrete WorkoutLog session aggregates, deduplicating running representations
 * between allHistoricalSessions and runningSessions, and preserving all exercise evidence.
 */
function buildUnifiedWorkoutSessions(
  allHistoricalSessions: readonly StressMagnitudeInput[],
  evaluationContext: EvaluationContext,
  runningSessions?: readonly CanonicalRunningSession[]
): readonly UnifiedWorkoutSession[] {
  // 1. Deduplicate running facts across allHistoricalSessions and runningSessions
  const runningInputs = allHistoricalSessions.filter(
    (s): s is RunningStressMagnitudeInput => s.kind === 'running'
  );
  const canonRuns = runningSessions ?? [];
  const claimedCanonIndices = new Set<number>();
  const unifiedRuns: UnifiedRunningFact[] = [];

  for (const s of runningInputs) {
    const tempResult = evaluateSessionTemporalEligibility(s, evaluationContext);

    // Look for matching canonical run in runningSessions
    let matchedIndex = -1;
    for (let i = 0; i < canonRuns.length; i++) {
      if (claimedCanonIndices.has(i)) continue;
      const r = canonRuns[i];
      // If both have non-empty IDs, they must match
      if (r.logId && s.sourceLogId && r.logId !== s.sourceLogId) continue;
      if (r.date !== s.date) continue;
      if ((r.startTime ?? '') !== (s.startTime ?? '')) continue;
      if (
        r.metrics.distanceKm !== undefined &&
        s.distanceKm !== undefined &&
        Math.abs(r.metrics.distanceKm - s.distanceKm) > 1e-4
      ) {
        continue;
      }
      if (
        r.metrics.durationSeconds !== undefined &&
        s.durationSeconds !== undefined &&
        Math.abs(r.metrics.durationSeconds - s.durationSeconds) > 1e-4
      ) {
        continue;
      }
      matchedIndex = i;
      break;
    }

    if (matchedIndex !== -1) {
      claimedCanonIndices.add(matchedIndex);
    }

    unifiedRuns.push({
      logId: s.sourceLogId,
      date: s.date,
      startTime: s.startTime,
      exerciseName: s.exerciseName || 'Running',
      distanceKm: s.distanceKm,
      durationSeconds: s.durationSeconds,
      paceSecondsPerKm: s.paceSecondsPerKm,
      temporalResult: tempResult,
    });
  }

  // Any canonical running sessions from runningSessions that weren't claimed
  for (let i = 0; i < canonRuns.length; i++) {
    if (claimedCanonIndices.has(i)) continue;
    const r = canonRuns[i];
    const tempResult = evaluateSessionTemporalEligibility(r, evaluationContext);
    unifiedRuns.push({
      logId: r.logId,
      date: r.date,
      startTime: r.startTime,
      exerciseName: r.exerciseName || 'Running',
      distanceKm: r.metrics.distanceKm,
      durationSeconds: r.metrics.durationSeconds,
      paceSecondsPerKm: r.metrics.paceSecondsPerKm,
      temporalResult: tempResult,
    });
  }

  // 2. Group into discrete WorkoutLog sessions
  interface MutableSessionAggregate {
    sessionKey: string;
    date: string;
    startTime?: string;
    temporalResult: TemporalEligibilityResult;
    strengthItems: StrengthStressMagnitudeInput[];
    runningItems: UnifiedRunningFact[];
    exerciseNamesSet: Set<string>;
    axialExerciseNamesSet: Set<string>;
    compoundExerciseNamesSet: Set<string>;
    highLoadDescriptions: string[];
  }

  const sessionMap = new Map<string, MutableSessionAggregate>();
  let anonIndex = 0;

  // Add strength items
  for (const s of allHistoricalSessions) {
    if (s.kind !== 'strength') continue;
    const tempResult = evaluateSessionTemporalEligibility(s, evaluationContext);
    const key = s.sourceLogId ? `log_${s.sourceLogId}` : `anon_str_${++anonIndex}`;

    let sess = sessionMap.get(key);
    if (!sess) {
      sess = {
        sessionKey: key,
        date: s.date,
        startTime: s.startTime,
        temporalResult: tempResult,
        strengthItems: [],
        runningItems: [],
        exerciseNamesSet: new Set(),
        axialExerciseNamesSet: new Set(),
        compoundExerciseNamesSet: new Set(),
        highLoadDescriptions: [],
      };
      sessionMap.set(key, sess);
    }

    sess.strengthItems.push(s);
    const exName = s.exerciseName || s.exerciseId || 'Strength Exercise';
    sess.exerciseNamesSet.add(exName);

    if (s.dimensions.includes('axial-systemic-loading')) {
      sess.axialExerciseNamesSet.add(exName);
    }

    const isCompound =
      COMPOUND_EXERCISE_IDS.has(s.exerciseId.toLowerCase()) ||
      s.dimensions.length >= 2 ||
      s.dimensions.includes('axial-systemic-loading');
    if (isCompound) {
      sess.compoundExerciseNamesSet.add(exName);
    }

    // High working load condition: explicitWorkingSetCount >= 3 OR totalLoadVolumeKgReps > 2000
    // (numericalPeakEstimated1RMKg > 0 condition is REMOVED)
    const isHighLoad =
      (s.setEvidence && s.setEvidence.explicitWorkingSetCount >= 3) ||
      (s.loadVolumeEvidence && s.loadVolumeEvidence.totalLoadVolumeKgReps > 2000);
    if (isHighLoad) {
      sess.highLoadDescriptions.push(`${exName} (${s.date})`);
    }
  }

  // Add running items
  for (const run of unifiedRuns) {
    const key = run.logId ? `log_${run.logId}` : `anon_run_${++anonIndex}`;

    let sess = sessionMap.get(key);
    if (!sess) {
      sess = {
        sessionKey: key,
        date: run.date,
        startTime: run.startTime,
        temporalResult: run.temporalResult,
        strengthItems: [],
        runningItems: [],
        exerciseNamesSet: new Set(),
        axialExerciseNamesSet: new Set(),
        compoundExerciseNamesSet: new Set(),
        highLoadDescriptions: [],
      };
      sessionMap.set(key, sess);
    }

    sess.runningItems.push(run);
    sess.exerciseNamesSet.add(run.exerciseName || 'Running');
  }

  // Convert to frozen immutable structure
  const result: UnifiedWorkoutSession[] = [];
  for (const sess of sessionMap.values()) {
    result.push(
      Object.freeze({
        sessionKey: sess.sessionKey,
        date: sess.date,
        startTime: sess.startTime,
        temporalResult: sess.temporalResult,
        strengthItems: Object.freeze(sess.strengthItems),
        runningItems: Object.freeze(sess.runningItems),
        exerciseNames: Object.freeze(Array.from(sess.exerciseNamesSet)),
        hasStrength: sess.strengthItems.length > 0,
        hasCardio: sess.runningItems.length > 0,
        hasAxialLoading: sess.axialExerciseNamesSet.size > 0,
        hasCompoundLoading: sess.compoundExerciseNamesSet.size > 0,
        hasHighWorkingLoad: sess.highLoadDescriptions.length > 0,
        highLoadExerciseDescriptions: Object.freeze(sess.highLoadDescriptions),
        axialExerciseNames: Object.freeze(Array.from(sess.axialExerciseNamesSet)),
        compoundExerciseNames: Object.freeze(Array.from(sess.compoundExerciseNamesSet)),
      })
    );
  }

  return Object.freeze(result);
}

// =========================================================================
// 1. Recent Training Context Derivation
// =========================================================================

/**
 * Derives RecentTrainingContext from actual recorded strength and cardio sessions.
 */
export function deriveRecentTrainingContext(
  allHistoricalSessions: readonly StressMagnitudeInput[],
  evaluationContext: EvaluationContext,
  runningSessions?: readonly CanonicalRunningSession[],
  policyWindowDays: number = DEFAULT_RECENT_TRAINING_WINDOW_DAYS
): RecentTrainingContext {
  const allSessions = buildUnifiedWorkoutSessions(
    allHistoricalSessions,
    evaluationContext,
    runningSessions
  );

  // 1. Filter sessions by temporal eligibility
  const eligibleSessions = allSessions.filter((s) => s.temporalResult.isEligible);

  // 2. Identify latest training date and days since last training
  let lastTrainingDate: string | undefined = undefined;
  let minDaysAgo: number | undefined = undefined;

  for (const s of eligibleSessions) {
    const delta = computeCalendarDayDelta(evaluationContext.evaluationCalendarDate, s.date);
    if (delta >= 0) {
      if (minDaysAgo === undefined || delta < minDaysAgo) {
        minDaysAgo = delta;
        lastTrainingDate = s.date;
      }
    }
  }

  // 3. Group eligible sessions by calendar date within policy window
  const sessionsByDateMap = new Map<string, UnifiedWorkoutSession[]>();
  for (const s of eligibleSessions) {
    const delta = computeCalendarDayDelta(evaluationContext.evaluationCalendarDate, s.date);
    // Include sessions on evaluation date (delta === 0) or within policy window (0 <= delta < policyWindowDays)
    if (delta >= 0 && delta < policyWindowDays) {
      const list = sessionsByDateMap.get(s.date) ?? [];
      list.push(s);
      sessionsByDateMap.set(s.date, list);
    }
  }

  // Build sorted daily breakdowns
  const dailyBreakdowns: DailyTrainingBreakdown[] = [];
  const uniqueDatesSorted = Array.from(sessionsByDateMap.keys()).sort((a, b) => b.localeCompare(a));

  let totalWindowSessions = 0;
  let multiSessionDayCount = 0;
  let hasWindowStrength = false;
  let hasWindowCardio = false;

  for (const date of uniqueDatesSorted) {
    const daySessions = sessionsByDateMap.get(date) ?? [];
    const delta = computeCalendarDayDelta(evaluationContext.evaluationCalendarDate, date);
    const strengthCount = daySessions.filter((s) => s.hasStrength).length;
    const cardioCount = daySessions.filter((s) => s.hasCardio).length;
    const isMulti = daySessions.length > 1;

    if (isMulti) multiSessionDayCount++;
    if (strengthCount > 0) hasWindowStrength = true;
    if (cardioCount > 0) hasWindowCardio = true;
    totalWindowSessions += daySessions.length;

    const names = Array.from(new Set(daySessions.flatMap((s) => s.exerciseNames)));

    dailyBreakdowns.push(
      Object.freeze({
        calendarDate: date,
        calendarDaysAgo: delta,
        sessionCount: daySessions.length,
        strengthSessionCount: strengthCount,
        cardioSessionCount: cardioCount,
        isMultiSessionDay: isMulti,
        exerciseOrActivityNames: Object.freeze(names),
      })
    );
  }

  // 4. Compute consecutive training days strictly prior to evaluation date
  // (Check yesterday (delta=1), 2 days ago (delta=2), etc.)
  let consecutiveDays = 0;
  let checkDelta = 1;
  while (checkDelta < policyWindowDays) {
    const foundDay = dailyBreakdowns.find((b) => b.calendarDaysAgo === checkDelta);
    if (foundDay && foundDay.sessionCount > 0) {
      consecutiveDays++;
      checkDelta++;
    } else {
      break;
    }
  }

  // 5. Check same-day completed sessions
  const sameDayBreakdown = dailyBreakdowns.find((b) => b.calendarDaysAgo === 0);
  const isSameDaySessionCompleted = (sameDayBreakdown?.sessionCount ?? 0) > 0;
  const sameDaySessionCount = sameDayBreakdown?.sessionCount ?? 0;

  // 6. Modality Presence
  let modalityPresence: TrainingModalityPresence = 'none';
  if (hasWindowStrength && hasWindowCardio) {
    modalityPresence = 'both';
  } else if (hasWindowStrength) {
    modalityPresence = 'strength-only';
  } else if (hasWindowCardio) {
    modalityPresence = 'cardio-only';
  }

  const recentTrainingDensity: RecentTrainingDensity = Object.freeze({
    sessionsByCalendarDay: Object.freeze(dailyBreakdowns),
    uniqueTrainingDays: uniqueDatesSorted.length,
    totalSessions: totalWindowSessions,
    consecutiveTrainingDays: consecutiveDays,
    multiSessionDays: multiSessionDayCount,
    policyWindowDays,
  });

  return Object.freeze({
    lastTrainingDate,
    calendarDaysSinceLastTraining: minDaysAgo,
    recentSessionCount: totalWindowSessions,
    recentUniqueTrainingDays: uniqueDatesSorted.length,
    consecutiveTrainingDayContext: Object.freeze({
      consecutiveDaysLeadingUpToEval: consecutiveDays,
      isSameDaySessionCompleted,
      sameDaySessionCount,
    }),
    modalityPresence,
    recentTrainingDensity,
  });
}

// =========================================================================
// 2. Residual Landscape Summary Derivation
// =========================================================================

/**
 * Summarizes AllDimensionResidualStates from a session-level perspective without loss.
 */
export function deriveRestResidualLandscape(
  allDimensionResidualStates: AllDimensionResidualStates
): RestResidualLandscape {
  const immediateDimensions: StressDimension[] = [];
  const residualDimensions: StressDimension[] = [];
  const historicalOnlyDimensions: StressDimension[] = [];
  const uncertainDimensions: StressDimension[] = [];
  const dimensionsWithStrengthEvidence: StressDimension[] = [];
  const dimensionsWithRunningEvidence: StressDimension[] = [];
  const dimensionsWithBoth: StressDimension[] = [];

  for (const dim of ALL_CANONICAL_DIMENSIONS) {
    const state = allDimensionResidualStates[dim];
    if (!state) continue;

    const definite = state.strongestPersistence.definite;
    if (definite === 'immediate') {
      immediateDimensions.push(dim);
    } else if (definite === 'residual') {
      residualDimensions.push(dim);
    } else if (definite === 'historical') {
      historicalOnlyDimensions.push(dim);
    }

    if (state.uncertainTraces.length > 0) {
      uncertainDimensions.push(dim);
    }

    if (state.modalitySummary.hasStrength) {
      dimensionsWithStrengthEvidence.push(dim);
    }
    if (state.modalitySummary.hasRunning) {
      dimensionsWithRunningEvidence.push(dim);
    }
    if (state.modalitySummary.hasStrength && state.modalitySummary.hasRunning) {
      dimensionsWithBoth.push(dim);
    }
  }

  const hasImmediateLowerBodyResidual =
    immediateDimensions.includes('knee-dominant-lower-body') ||
    immediateDimensions.includes('hip-posterior-chain');

  const hasImmediateUpperBodyResidual =
    immediateDimensions.includes('horizontal-push') ||
    immediateDimensions.includes('vertical-push') ||
    immediateDimensions.includes('horizontal-pull') ||
    immediateDimensions.includes('vertical-pull');

  const hasImmediateAxialResidual = immediateDimensions.includes('axial-systemic-loading');

  const hasMultipleActiveDimensions =
    immediateDimensions.length + residualDimensions.length >= 2;

  return Object.freeze({
    immediateDimensions: Object.freeze(immediateDimensions),
    residualDimensions: Object.freeze(residualDimensions),
    historicalOnlyDimensions: Object.freeze(historicalOnlyDimensions),
    uncertainDimensions: Object.freeze(uncertainDimensions),
    dimensionsWithStrengthEvidence: Object.freeze(dimensionsWithStrengthEvidence),
    dimensionsWithRunningEvidence: Object.freeze(dimensionsWithRunningEvidence),
    dimensionsWithBoth: Object.freeze(dimensionsWithBoth),
    hasImmediateLowerBodyResidual,
    hasImmediateUpperBodyResidual,
    hasImmediateAxialResidual,
    hasMultipleActiveDimensions,
  });
}

// =========================================================================
// 3. Systemic Training Demand Context Derivation
// =========================================================================

/**
 * Derives SystemicTrainingDemandContext capturing whole-body movement demand.
 * (NOT CNS fatigue; structural observed demand facts only).
 */
export function deriveSystemicTrainingDemandContext(
  allHistoricalSessions: readonly StressMagnitudeInput[],
  evaluationContext: EvaluationContext,
  recentTrainingContext: RecentTrainingContext,
  runningSessions?: readonly CanonicalRunningSession[],
  policyWindowDays: number = DEFAULT_RECENT_TRAINING_WINDOW_DAYS
): SystemicTrainingDemandContext {
  const demandFactors: string[] = [];

  const allSessions = buildUnifiedWorkoutSessions(
    allHistoricalSessions,
    evaluationContext,
    runningSessions
  );

  // Eligible sessions within policy window
  const windowSessions: UnifiedWorkoutSession[] = [];
  for (const s of allSessions) {
    if (s.temporalResult.isEligible) {
      const delta = computeCalendarDayDelta(evaluationContext.evaluationCalendarDate, s.date);
      if (delta >= 0 && delta < policyWindowDays) {
        windowSessions.push(s);
      }
    }
  }

  // 1. Axial Loading Exposure
  const axialSessions = windowSessions.filter((s) => s.hasAxialLoading);
  const axialExercisesSet = new Set<string>(
    axialSessions.flatMap((s) => s.axialExerciseNames)
  );
  let lastAxialDate: string | undefined = undefined;
  for (const s of axialSessions) {
    if (!lastAxialDate || s.date > lastAxialDate) {
      lastAxialDate = s.date;
    }
  }

  const hasRecentAxialLoading = axialSessions.length > 0;
  if (hasRecentAxialLoading) {
    demandFactors.push(
      `Axial systemic loading observed in ${axialSessions.length} session(s) ([${Array.from(axialExercisesSet).join(', ')}]).`
    );
  }

  const recentAxialExposure: RecentAxialExposure = Object.freeze({
    hasRecentAxialLoading,
    axialSessionCount: axialSessions.length,
    lastAxialDate,
    axialExercises: Object.freeze(Array.from(axialExercisesSet)),
  });

  // 2. Repeated Compound Loading Exposure
  const compoundSessions = windowSessions.filter((s) => s.hasCompoundLoading);
  const compoundExercisesSet = new Set<string>(
    compoundSessions.flatMap((s) => s.compoundExerciseNames)
  );
  const compoundSessionCount = compoundSessions.length;
  const hasRepeatedCompoundLoading = compoundSessionCount >= 2;

  if (hasRepeatedCompoundLoading) {
    demandFactors.push(
      `Repeated multi-joint compound loading observed in ${compoundSessionCount} session(s) ([${Array.from(compoundExercisesSet).join(', ')}]).`
    );
  }

  const repeatedCompoundExposure: RepeatedCompoundExposure = Object.freeze({
    hasRepeatedCompoundLoading,
    compoundSessionCount,
    compoundExercises: Object.freeze(Array.from(compoundExercisesSet)),
  });

  // 3. Recent High Working-Load Exposure
  const highLoadSessions = windowSessions.filter((s) => s.hasHighWorkingLoad);
  const observedHighLoadDescriptions = highLoadSessions.flatMap(
    (s) => s.highLoadExerciseDescriptions
  );
  const hasHighWorkingLoad = highLoadSessions.length > 0;

  if (hasHighWorkingLoad) {
    demandFactors.push(
      `High working-set load exposure observed in ${highLoadSessions.length} session(s).`
    );
  }

  const recentHighLoadExposure: RecentHighLoadExposure = Object.freeze({
    hasHighWorkingLoad,
    highLoadSessionCount: highLoadSessions.length,
    observedSessions: Object.freeze(observedHighLoadDescriptions),
  });

  // 4. Cardio Exposure Context
  const cardioSessions = windowSessions.filter((s) => s.hasCardio);
  const cardioCount = cardioSessions.length;
  let totalDurationSec = 0;
  let totalDistanceKm = 0;

  for (const s of cardioSessions) {
    for (const r of s.runningItems) {
      if (r.durationSeconds) totalDurationSec += r.durationSeconds;
      if (r.distanceKm) totalDistanceKm += r.distanceKm;
    }
  }

  const hasCardioExposure = cardioCount > 0;
  const lowerBodyOverlapDimensions: StressDimension[] = hasCardioExposure
    ? ['knee-dominant-lower-body', 'hip-posterior-chain']
    : [];

  if (hasCardioExposure) {
    demandFactors.push(
      `Cardio running exposure in ${cardioCount} session(s) (${totalDistanceKm.toFixed(1)}km, ${Math.round(totalDurationSec / 60)}min) with lower-body overlap.`
    );
  }

  const cardioExposure: CardioExposureContext = Object.freeze({
    hasCardioExposure,
    cardioSessionCount: cardioCount,
    totalDurationSeconds: totalDurationSec,
    totalDistanceKm: totalDistanceKm,
    lowerBodyOverlapDimensions: Object.freeze(lowerBodyOverlapDimensions),
  });

  // 5. Multi-Modality Exposure
  const strengthSessions = windowSessions.filter((s) => s.hasStrength);
  const strengthCount = strengthSessions.length;
  const hasMultiModality = strengthCount > 0 && cardioCount > 0;
  const sameDayMultiModality = recentTrainingContext.recentTrainingDensity.sessionsByCalendarDay.some(
    (b) => b.strengthSessionCount > 0 && b.cardioSessionCount > 0
  );

  if (hasMultiModality) {
    demandFactors.push(
      sameDayMultiModality
        ? 'Same-day multi-modality (Strength + Cardio) observed in training window.'
        : 'Multi-modality (Strength + Cardio) observed across training window.'
    );
  }

  const multiModalityExposure: MultiModalityExposureContext = Object.freeze({
    hasMultiModality,
    sameDayMultiModality,
    strengthCount,
    cardioCount,
  });

  // 6. Categorical Demand Evidence State
  let evidenceState: SystemicTrainingDemandEvidenceState;

  if (recentTrainingContext.recentSessionCount === 0) {
    evidenceState = 'insufficient-evidence';
  } else if (
    recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval >= 3 ||
    (compoundSessionCount >= 3 && axialSessions.length >= 2) ||
    sameDayMultiModality ||
    (highLoadSessions.length >= 2 && axialSessions.length >= 2 && recentTrainingContext.recentUniqueTrainingDays >= 2)
  ) {
    evidenceState = 'elevated-context';
  } else if (compoundSessionCount >= 1 || cardioCount >= 1 || hasRecentAxialLoading) {
    evidenceState = 'present-context';
  } else {
    evidenceState = 'minimal-context';
  }

  return Object.freeze({
    evidenceState,
    recentAxialExposure,
    repeatedCompoundExposure,
    recentHighLoadExposure,
    cardioExposure,
    multiModalityExposure,
    factualDemandFactors: Object.freeze(demandFactors),
  });
}

// =========================================================================
// 4. Candidate Landscape Summary Derivation
// =========================================================================

/**
 * Summarizes the candidate evaluation set at session level.
 */
export function deriveRestCandidateLandscape(
  candidateDecisions: readonly CandidateDecisionEvidence[]
): RestCandidateLandscape {
  const preferredCandidates: string[] = [];
  const viableCandidates: string[] = [];
  const deferredCandidates: string[] = [];
  const unsupportedCandidates: string[] = [];

  let dueCandidateCount = 0;
  let progressionSupportedCandidateCount = 0;
  let clearCandidateCount = 0;
  let cautionCandidateCount = 0;
  let constrainedCandidateCount = 0;

  for (const c of candidateDecisions) {
    const id = c.candidateExerciseId;
    if (c.decisionClass === 'preferred') {
      preferredCandidates.push(id);
    } else if (c.decisionClass === 'viable') {
      viableCandidates.push(id);
    } else if (c.decisionClass === 'deferred') {
      deferredCandidates.push(id);
    } else if (c.decisionClass === 'unsupported') {
      unsupportedCandidates.push(id);
    }

    if (c.comparisonFacts.needClass === 'due') {
      dueCandidateCount++;
    }
    if (c.comparisonFacts.isProgressionSupported) {
      progressionSupportedCandidateCount++;
    }
    if (c.comparisonFacts.readinessClass === 'clear') {
      clearCandidateCount++;
    } else if (c.comparisonFacts.readinessClass === 'caution') {
      cautionCandidateCount++;
    } else if (c.comparisonFacts.readinessClass === 'constrained') {
      constrainedCandidateCount++;
    }
  }

  const hasClearDueCandidate = candidateDecisions.some(
    (c) => c.comparisonFacts.readinessClass === 'clear' && c.comparisonFacts.needClass === 'due'
  );

  const hasProgressionSupportedCandidate = progressionSupportedCandidateCount > 0;

  const allCandidatesDeferredOrUnsupported =
    preferredCandidates.length === 0 && viableCandidates.length === 0;

  return Object.freeze({
    preferredCandidates: Object.freeze(preferredCandidates),
    viableCandidates: Object.freeze(viableCandidates),
    deferredCandidates: Object.freeze(deferredCandidates),
    unsupportedCandidates: Object.freeze(unsupportedCandidates),
    dueCandidateCount,
    progressionSupportedCandidateCount,
    clearCandidateCount,
    cautionCandidateCount,
    constrainedCandidateCount,
    hasClearDueCandidate,
    hasProgressionSupportedCandidate,
    allCandidatesDeferredOrUnsupported,
  });
}

// =========================================================================
// 5. Rest Decision Evidence Synthesis
// =========================================================================

/**
 * Derives comprehensive Session-Level RestDecisionEvidence.
 */
export function deriveRestDecisionEvidence(
  evaluationContext: EvaluationContext,
  allHistoricalSessions: readonly StressMagnitudeInput[],
  allDimensionResidualStates: AllDimensionResidualStates,
  candidateDecisions: readonly CandidateDecisionEvidence[],
  runningSessions?: readonly CanonicalRunningSession[],
  policyWindowDays: number = DEFAULT_RECENT_TRAINING_WINDOW_DAYS
): RestDecisionEvidence {
  // 1. Derive sub-contexts
  const recentTrainingContext = deriveRecentTrainingContext(
    allHistoricalSessions,
    evaluationContext,
    runningSessions,
    policyWindowDays
  );

  const residualLandscape = deriveRestResidualLandscape(allDimensionResidualStates);

  const systemicTrainingDemandContext = deriveSystemicTrainingDemandContext(
    allHistoricalSessions,
    evaluationContext,
    recentTrainingContext,
    runningSessions,
    policyWindowDays
  );

  const candidateLandscape = deriveRestCandidateLandscape(candidateDecisions);

  // 2. Identify Uncertainty Facts
  const allSessions = buildUnifiedWorkoutSessions(
    allHistoricalSessions,
    evaluationContext,
    runningSessions
  );
  const uncertainSessionCount = allSessions.filter((s) => s.temporalResult.isUncertain).length;

  let bracketTraceCount = 0;
  for (const dim of ALL_CANONICAL_DIMENSIONS) {
    const state = allDimensionResidualStates[dim];
    if (state) {
      bracketTraceCount += state.uncertaintyMetadata.bracketTraceCount;
    }
  }

  const uncertaintyNotes: string[] = [];
  if (uncertainSessionCount > 0) {
    uncertaintyNotes.push(
      `${uncertainSessionCount} same-day session(s) lack exact start times and were treated as uncertain.`
    );
  }
  if (bracketTraceCount > 0) {
    uncertaintyNotes.push(
      `${bracketTraceCount} trace(s) cross time attenuation thresholds in bracket-ordinal states.`
    );
  }
  if (recentTrainingContext.recentSessionCount === 0) {
    uncertaintyNotes.push(
      'Sparse training history / cold start: no recent sessions recorded within policy window.'
    );
  }

  const uncertaintyContext: RestUncertaintyContext = Object.freeze({
    hasUncertainSameDaySessions: uncertainSessionCount > 0,
    uncertainSessionCount,
    hasBracketPersistenceTraces: bracketTraceCount > 0,
    bracketTraceCount,
    hasSparseHistory: recentTrainingContext.recentSessionCount === 0,
    factualUncertaintyNotes: Object.freeze(uncertaintyNotes),
  });

  // 3. Compile Supporting & Counter Reasons
  const supportingReasons: string[] = [];
  const counterReasons: string[] = [];

  // --- Supporting Reasons (in favor of Rest) ---
  if (recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted) {
    supportingReasons.push(
      `Workout session already completed on evaluation date (${evaluationContext.evaluationCalendarDate}) [completed-session-boundary].`
    );
  }

  if (recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval >= 3) {
    supportingReasons.push(
      `${recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval} consecutive training days recorded immediately prior to evaluation date.`
    );
  }

  if (recentTrainingContext.recentUniqueTrainingDays >= 4) {
    supportingReasons.push(
      `High training frequency with ${recentTrainingContext.recentUniqueTrainingDays} unique training days in the past ${policyWindowDays} days.`
    );
  }

  if (residualLandscape.immediateDimensions.length >= 2) {
    supportingReasons.push(
      `Active immediate residual stress (<24h) across multiple dimensions: [${residualLandscape.immediateDimensions.join(', ')}].`
    );
  }

  if (residualLandscape.residualDimensions.length >= 3) {
    supportingReasons.push(
      `Broad residual stress (24h-72h) across dimensions: [${residualLandscape.residualDimensions.join(', ')}].`
    );
  }

  if (systemicTrainingDemandContext.evidenceState === 'elevated-context') {
    supportingReasons.push(
      'Elevated systemic training demand from repeated compound loading, high working loads, and/or multi-modality sessions.'
    );
  }

  if (candidateLandscape.allCandidatesDeferredOrUnsupported) {
    supportingReasons.push(
      'All evaluated candidate exercises are currently deferred (acutely constrained / recently addressed) or unsupported.'
    );
  } else if (candidateLandscape.preferredCandidates.length === 0 && candidateLandscape.dueCandidateCount === 0) {
    supportingReasons.push(
      'No candidate exercises currently have preferred recommendation standing or urgent due training need.'
    );
  }

  // --- Counter Reasons (in favor of Training / against Rest) ---
  for (const c of candidateDecisions) {
    if (c.decisionClass === 'preferred' || c.decisionClass === 'viable') {
      const name = c.candidateExerciseName;
      if (c.comparisonFacts.readinessClass === 'clear') {
        counterReasons.push(
          `${name} has clear readiness on all required stress dimensions.`
        );
      }
      if (c.comparisonFacts.needClass === 'due') {
        counterReasons.push(
          `${name} training cadence is due (${c.trainingNeedEvidence.recency.calendarDaysSinceLastPerformed ?? 0}d unperformed).`
        );
      }
      if (c.comparisonFacts.isProgressionSupported) {
        counterReasons.push(
          `${name} has historical performance evidence supporting progressive overload / advancement.`
        );
      }
      if (c.comparisonFacts.needClass === 'available' && c.comparisonFacts.readinessClass === 'clear') {
        counterReasons.push(
          `${name} is clear and available in standard rotational cadence.`
        );
      }
    }
  }

  if (
    recentTrainingContext.recentUniqueTrainingDays <= 1 &&
    !recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted
  ) {
    counterReasons.push(
      `Recent training density is low (${recentTrainingContext.recentUniqueTrainingDays} training day(s) in past ${policyWindowDays} days).`
    );
  }

  if (residualLandscape.immediateDimensions.length === 0) {
    counterReasons.push(
      'No immediate acute residual stress (<24h) active on any stress dimension.'
    );
  }

  // 4. Derive RestSupportClass
  let restSupportClass: RestSupportClass;

  const isSameDayCompleted =
    recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted;
  const consecutiveDaysPrior =
    recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval;
  const uniqueDays = recentTrainingContext.recentUniqueTrainingDays;
  const totalActiveDimensions =
    residualLandscape.immediateDimensions.length + residualLandscape.residualDimensions.length;

  // Rule 1: Completed Session Boundary -> rest-supported
  if (isSameDayCompleted) {
    restSupportClass = 'rest-supported';
  }
  // Rule 2: All candidates deferred / unsupported (0 viable alternatives) -> rest-supported
  else if (candidateLandscape.allCandidatesDeferredOrUnsupported) {
    restSupportClass = 'rest-supported';
  }
  // Rule 3: High density & broad residual & no strong due/preferred candidate -> rest-supported
  else if (
    (uniqueDays >= 4 || consecutiveDaysPrior >= 3) &&
    totalActiveDimensions >= 3 &&
    candidateLandscape.preferredCandidates.length === 0 &&
    candidateLandscape.dueCandidateCount === 0
  ) {
    restSupportClass = 'rest-supported';
  }
  // Rule 4: Cold start / sparse history (insufficient evidence does not create false rest) -> rest-not-indicated
  else if (recentTrainingContext.recentSessionCount === 0 && !isSameDayCompleted) {
    restSupportClass = 'rest-not-indicated';
  }
  // Rule 5: Clear Due Candidate with Low/Normal Density -> rest-not-indicated
  else if (
    candidateLandscape.hasClearDueCandidate &&
    !isSameDayCompleted &&
    consecutiveDaysPrior < 3
  ) {
    restSupportClass = 'rest-not-indicated';
  }
  // Rule 6: Preferred candidate exists, low/moderate density, clear readiness, non-elevated demand -> rest-not-indicated
  else if (
    candidateLandscape.preferredCandidates.length > 0 &&
    consecutiveDaysPrior < 3 &&
    !isSameDayCompleted &&
    residualLandscape.immediateDimensions.length <= 1 &&
    systemicTrainingDemandContext.evidenceState !== 'elevated-context'
  ) {
    restSupportClass = 'rest-not-indicated';
  }
  // Rule 7: Balanced Context / Viable candidate with present/elevated systemic demand -> rest-reasonable
  else {
    restSupportClass = 'rest-reasonable';
  }

  return Object.freeze({
    kind: 'rest-decision-evidence',
    evaluationContext,
    recentTrainingContext,
    residualLandscape,
    systemicTrainingDemandContext,
    candidateLandscape,
    restSupportClass,
    supportingReasons: Object.freeze(supportingReasons),
    counterReasons: Object.freeze(counterReasons),
    uncertaintyContext,
  });
}
