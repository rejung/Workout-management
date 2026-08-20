/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Training Need Framework (VNext Recommendation Engine - CU4.1)
 *
 * Implements pure, deterministic domain evaluation of candidate training need,
 * frequency context, and dimension-level exposure facts without numerical scores,
 * arbitrary rotation bonuses, or recovery kinetics conflation.
 *
 * Strict Invariants:
 * 1. Independent from Readiness: Readiness evaluates "is it appropriate right now".
 *    Need evaluates "is there structural training need / cadence opportunity".
 * 2. Zero Numeric Scoring: No 0-100 scores, rotation bonus points, or frequency penalties.
 * 3. Categorical Need Taxonomy: 'due' | 'available' | 'recently-addressed' | 'insufficient-history' | 'unmapped'.
 * 4. Exercise Need vs Dimension Need: Direct exercise history and StressDimension exposures
 *    are distinct and tracked separately (e.g. Deadlift does not fulfill horizontal-pull need).
 * 5. Frequency Context: Session counts and unique training days are cleanly distinguished.
 * 6. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile, StressDimension } from '../types/stressModel.types';
import { EvaluationContext } from '../types/residualStressTrace.types';
import { StrengthHistoryState } from '../types/strengthStressBaseline.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import {
  CandidateFrequencyContext,
  CandidateLongTermHistoryContext,
  CandidateNeedExplainabilitySummary,
  CandidateTrainingNeedClass,
  CandidateTrainingNeedEvaluationSet,
  CandidateTrainingNeedEvidence,
  DimensionExposureSummary,
  ExerciseRecencyContext,
} from '../types/candidateTrainingNeed.types';
import {
  CANONICAL_EXERCISE_STRESS_PROFILES,
  getCanonicalExerciseStressProfile,
} from '../stress/stressVocabulary';
import { DEFAULT_FOUNDATION_CANDIDATE_IDS } from '../readiness/candidateReadiness';

/**
 * Calculates the exact calendar day delta between two local calendar date strings (YYYY-MM-DD).
 * Evaluates pure Gregorian day distance in the local calendar frame.
 * Returns 0 if both dates are identical. Positive if currentDate > priorDate.
 */
export function computeCalendarDayDelta(currentDate: string, priorDate: string): number {
  const [cy, cm, cd] = currentDate.split('-').map(Number);
  const [py, pm, pd] = priorDate.split('-').map(Number);
  const currentUtc = Date.UTC(cy, cm - 1, cd);
  const priorUtc = Date.UTC(py, pm - 1, pd);
  return Math.round((currentUtc - priorUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Normalizes an exercise ID or name for matching across history.
 */
function normalizeExerciseKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Generic minimal session log reference for historical analysis.
 */
export interface GenericHistoricalSessionFact {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly exerciseId: string;
  readonly exerciseName?: string;
  readonly dimensions?: readonly StressDimension[];
}

/**
 * Derives the dimension exposure summary for a specific StressDimension from historical sessions.
 */
function deriveDimensionExposureSummary(
  dimension: StressDimension,
  allHistoricalSessions: readonly GenericHistoricalSessionFact[],
  evalDate: string,
  recentWindowDays: number = 14
): DimensionExposureSummary {
  // Find all sessions stimulating this dimension
  const matchingSessions: GenericHistoricalSessionFact[] = [];

  for (const session of allHistoricalSessions) {
    let sessionDimensions: readonly StressDimension[] = session.dimensions || [];
    if (!sessionDimensions || sessionDimensions.length === 0) {
      const profile = getCanonicalExerciseStressProfile(session.exerciseId);
      sessionDimensions = profile.dimensions;
    }
    if (sessionDimensions.includes(dimension)) {
      matchingSessions.push(session);
    }
  }

  // Sort reverse chronologically
  matchingSessions.sort((a, b) => {
    const delta = computeCalendarDayDelta(b.date, a.date);
    if (delta !== 0) return delta;
    const timeA = a.startTime || '00:00';
    const timeB = b.startTime || '00:00';
    return timeB.localeCompare(timeA);
  });

  const recent1 = matchingSessions[0];
  const lastDimensionTrainedDate = recent1 ? recent1.date : undefined;
  const calendarDaysSinceLastTrained = lastDimensionTrainedDate
    ? computeCalendarDayDelta(evalDate, lastDimensionTrainedDate)
    : undefined;

  // Filter to recent window
  const recentSessions = matchingSessions.filter(
    (s) => computeCalendarDayDelta(evalDate, s.date) <= recentWindowDays
  );

  const contributingExerciseIds = Object.freeze([
    ...new Set(recentSessions.map((s) => s.exerciseId)),
  ]);

  // A dimension is recently addressed if trained within last 3 days OR trained 2+ times in recent window
  const isRecentlyAddressed =
    (calendarDaysSinceLastTrained !== undefined && calendarDaysSinceLastTrained <= 3) ||
    recentSessions.length >= 2;

  return Object.freeze({
    dimension,
    lastDimensionTrainedDate,
    calendarDaysSinceLastTrained,
    recentSessionCount: recentSessions.length,
    contributingExerciseIds,
    isRecentlyAddressed,
  });
}

/**
 * Builds factual explainability summary for candidate training need.
 */
function buildNeedExplainabilitySummary(
  candidateExerciseName: string,
  needClass: CandidateTrainingNeedClass,
  recency: ExerciseRecencyContext,
  frequency: CandidateFrequencyContext,
  history: CandidateLongTermHistoryContext,
  requiredDimensions: readonly StressDimension[]
): CandidateNeedExplainabilitySummary {
  const observations: string[] = [];

  if (history.isColdStart || history.historyState === 'cold-start') {
    observations.push(
      `No prior execution records found for ${candidateExerciseName} (cold-start baseline).`
    );
    return Object.freeze({
      headline: `${candidateExerciseName} training need is unestablished (insufficient history).`,
      factualObservations: Object.freeze(observations),
    });
  }

  if (recency.calendarDaysSinceLastPerformed !== undefined) {
    if (recency.calendarDaysSinceLastPerformed === 0) {
      observations.push(`Performed earlier today (${recency.lastPerformedDate}).`);
    } else {
      observations.push(
        `Last performed ${recency.calendarDaysSinceLastPerformed} day(s) ago (${recency.lastPerformedDate}).`
      );
    }
  }

  observations.push(
    `Lifetime history: ${frequency.lifetimeSessionCount} session(s) across ${frequency.lifetimeUniqueDaysCount} unique day(s).`
  );

  observations.push(
    `Recent 14-day window: ${frequency.recentSessionCount} session(s) across ${frequency.recentUniqueDaysCount} unique day(s).`
  );

  // Dimension exposure notes
  for (const dimExp of frequency.dimensionExposures) {
    if (dimExp.calendarDaysSinceLastTrained !== undefined) {
      const sourceList =
        dimExp.contributingExerciseIds.length > 0
          ? ` via [${dimExp.contributingExerciseIds.join(', ')}]`
          : '';
      observations.push(
        `Dimension [${dimExp.dimension}]: trained ${dimExp.calendarDaysSinceLastTrained} day(s) ago (${dimExp.recentSessionCount} session(s) in window${sourceList}).`
      );
    } else {
      observations.push(`Dimension [${dimExp.dimension}]: no recorded training exposure.`);
    }
  }

  let headline = '';
  switch (needClass) {
    case 'due':
      headline = `${candidateExerciseName} is due for training (${recency.calendarDaysSinceLastPerformed} days since last session; required dimensions unaddressed).`;
      break;
    case 'recently-addressed':
      headline = `${candidateExerciseName} was recently addressed (${recency.calendarDaysSinceLastPerformed !== undefined ? `${recency.calendarDaysSinceLastPerformed}d ago` : 'recent window exposure'}).`;
      break;
    case 'available':
      headline = `${candidateExerciseName} is available in normal training rotation.`;
      break;
    case 'insufficient-history':
      headline = `${candidateExerciseName} has insufficient historical records.`;
      break;
    case 'unmapped':
      headline = `${candidateExerciseName} is unmapped in stress vocabulary.`;
      break;
  }

  return Object.freeze({
    headline,
    factualObservations: Object.freeze(observations),
  });
}

/**
 * Derives CandidateTrainingNeedEvidence for a single candidate exercise.
 *
 * @param candidateExerciseId Candidate exercise identifier (e.g. 'squat', 'bench_press')
 * @param allHistoricalSessions All recorded historical workout sessions across all exercises
 * @param evaluationContext Canonical evaluation context SSOT
 */
export function deriveCandidateTrainingNeedEvidence(
  candidateExerciseId: string,
  allHistoricalSessions: readonly (StressMagnitudeInput | GenericHistoricalSessionFact)[],
  evaluationContext: EvaluationContext
): CandidateTrainingNeedEvidence {
  const profile: ExerciseStressProfile = getCanonicalExerciseStressProfile(candidateExerciseId);
  const candidateExerciseName = profile.exerciseName;
  // SSOT: evaluationCalendarDate is derived strictly from evaluationInstant + evaluationTimezone
  const evalDate = evaluationContext.evaluationCalendarDate;

  // Handle unmapped
  if (profile.mappingStatus === 'unmapped') {
    const unmappedHistory: CandidateLongTermHistoryContext = Object.freeze({
      historyState: 'cold-start',
      totalHistoricalSessionCount: 0,
      firstRecordedDate: undefined,
      lastRecordedDate: undefined,
      isColdStart: true,
    });
    const unmappedRecency: ExerciseRecencyContext = Object.freeze({
      lastPerformedDate: undefined,
      lastPerformedStartTime: undefined,
      lastPerformedSourceLogId: undefined,
      calendarDaysSinceLastPerformed: undefined,
    });
    const unmappedFrequency: CandidateFrequencyContext = Object.freeze({
      lifetimeSessionCount: 0,
      lifetimeUniqueDaysCount: 0,
      recentSessionCount: 0,
      recentUniqueDaysCount: 0,
      dimensionExposures: Object.freeze([]),
    });
    return Object.freeze({
      kind: 'candidate-training-need-evidence',
      candidateExerciseId,
      candidateExerciseName,
      exerciseProfile: profile,
      requiredDimensions: Object.freeze([]),
      historicalContext: unmappedHistory,
      recency: unmappedRecency,
      frequencyContext: unmappedFrequency,
      needClass: 'unmapped',
      explainabilitySummary: Object.freeze({
        headline: `${candidateExerciseName} is unmapped.`,
        factualObservations: Object.freeze(['No mapped stress dimensions found.']),
      }),
      evaluationContext,
    });
  }

  const requiredDimensions = profile.dimensions;

  // Filter strictly earlier sessions for candidate
  const normalizedCandidateKey = normalizeExerciseKey(candidateExerciseId);
  const matchingCandidateSessions: GenericHistoricalSessionFact[] = [];
  const normalizedAllSessions: GenericHistoricalSessionFact[] = [];

  for (const s of allHistoricalSessions) {
    const normalizedKey = normalizeExerciseKey(s.exerciseId);
    const sessionFact: GenericHistoricalSessionFact = {
      sourceLogId: s.sourceLogId,
      date: s.date,
      startTime: s.startTime,
      exerciseId: s.exerciseId,
      exerciseName: s.exerciseName,
      dimensions: s.dimensions,
    };
    normalizedAllSessions.push(sessionFact);

    if (
      normalizedKey === normalizedCandidateKey ||
      normalizeExerciseKey(s.exerciseName || '') === normalizedCandidateKey
    ) {
      matchingCandidateSessions.push(sessionFact);
    }
  }

  // Sort candidate sessions reverse-chronologically
  matchingCandidateSessions.sort((a, b) => {
    const delta = computeCalendarDayDelta(b.date, a.date);
    if (delta !== 0) return delta;
    const timeA = a.startTime || '00:00';
    const timeB = b.startTime || '00:00';
    return timeB.localeCompare(timeA);
  });

  const lifetimeSessionCount = matchingCandidateSessions.length;
  const lifetimeUniqueDaysCount = new Set(matchingCandidateSessions.map((s) => s.date)).size;
  const recent1 = matchingCandidateSessions[0];

  // 1. Long-term history context
  let historyState: StrengthHistoryState = 'cold-start';
  if (lifetimeSessionCount === 1) {
    historyState = 'single-session-reference';
  } else if (lifetimeSessionCount >= 2) {
    historyState = 'multi-session-reference';
  }

  const oldestSession = matchingCandidateSessions[matchingCandidateSessions.length - 1];
  const historicalContext: CandidateLongTermHistoryContext = Object.freeze({
    historyState,
    totalHistoricalSessionCount: lifetimeSessionCount,
    firstRecordedDate: oldestSession ? oldestSession.date : undefined,
    lastRecordedDate: recent1 ? recent1.date : undefined,
    isColdStart: lifetimeSessionCount === 0,
  });

  // 2. Recency metadata
  const daysSinceLast = recent1 ? computeCalendarDayDelta(evalDate, recent1.date) : undefined;
  const recency: ExerciseRecencyContext = Object.freeze({
    lastPerformedDate: recent1 ? recent1.date : undefined,
    lastPerformedStartTime: recent1 ? recent1.startTime : undefined,
    lastPerformedSourceLogId: recent1 ? recent1.sourceLogId : undefined,
    calendarDaysSinceLastPerformed: daysSinceLast,
  });

  // 3. Recent window sessions (14 days)
  const recentWindowSessions = matchingCandidateSessions.filter(
    (s) => computeCalendarDayDelta(evalDate, s.date) <= 14
  );
  const recentSessionCount = recentWindowSessions.length;
  const recentUniqueDaysCount = new Set(recentWindowSessions.map((s) => s.date)).size;

  // 4. Dimension-level exposures (Exercise Need vs Dimension Need separation)
  const dimensionExposures: DimensionExposureSummary[] = requiredDimensions.map((dim) =>
    deriveDimensionExposureSummary(dim, normalizedAllSessions, evalDate, 14)
  );

  const frequencyContext: CandidateFrequencyContext = Object.freeze({
    lifetimeSessionCount,
    lifetimeUniqueDaysCount,
    recentSessionCount,
    recentUniqueDaysCount,
    dimensionExposures: Object.freeze(dimensionExposures),
  });

  // 5. Categorical Need Taxonomy Derivation
  let needClass: CandidateTrainingNeedClass = 'available';

  if (lifetimeSessionCount === 0) {
    needClass = 'insufficient-history';
  } else if (daysSinceLast !== undefined && daysSinceLast <= 1) {
    // Performed same day or yesterday
    needClass = 'recently-addressed';
  } else if (recentSessionCount >= 3) {
    // Performed 3+ times in recent 14-day window
    needClass = 'recently-addressed';
  } else {
    // Check if all required dimensions were recently addressed by other exercises
    const allDimensionsRecentlyAddressed =
      dimensionExposures.length > 0 &&
      dimensionExposures.every((d) => d.isRecentlyAddressed);

    if (allDimensionsRecentlyAddressed && daysSinceLast !== undefined && daysSinceLast <= 3) {
      needClass = 'recently-addressed';
    } else if (daysSinceLast !== undefined && daysSinceLast >= 7) {
      // Not performed for a week or more
      const anyDimensionRecentlyAddressed = dimensionExposures.some(
        (d) => d.isRecentlyAddressed
      );
      if (!anyDimensionRecentlyAddressed) {
        needClass = 'due';
      } else {
        needClass = 'available';
      }
    } else {
      needClass = 'available';
    }
  }

  // 6. Explainability Summary
  const explainabilitySummary = buildNeedExplainabilitySummary(
    candidateExerciseName,
    needClass,
    recency,
    frequencyContext,
    historicalContext,
    requiredDimensions
  );

  return Object.freeze({
    kind: 'candidate-training-need-evidence',
    candidateExerciseId,
    candidateExerciseName,
    exerciseProfile: profile,
    requiredDimensions,
    historicalContext,
    recency,
    frequencyContext,
    needClass,
    explainabilitySummary,
    evaluationContext,
  });
}

/**
 * Evaluates Training Need evidence across a set of candidate exercises in deterministic order.
 */
export function evaluateCandidateTrainingNeedSet(
  candidateExerciseIds: readonly string[],
  allHistoricalSessions: readonly (StressMagnitudeInput | GenericHistoricalSessionFact)[],
  evaluationContext: EvaluationContext
): CandidateTrainingNeedEvaluationSet {
  const candidates: CandidateTrainingNeedEvidence[] = candidateExerciseIds.map((id) =>
    deriveCandidateTrainingNeedEvidence(id, allHistoricalSessions, evaluationContext)
  );

  const candidateMap: Record<string, CandidateTrainingNeedEvidence> = {};
  for (const c of candidates) {
    candidateMap[c.candidateExerciseId] = c;
  }

  return Object.freeze({
    evaluationContext,
    candidates: Object.freeze(candidates),
    candidateMap: Object.freeze(candidateMap),
    totalCandidatesCount: candidates.length,
  });
}
