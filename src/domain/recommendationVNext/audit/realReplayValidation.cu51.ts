/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Real Workout History Replay & Behavioral Validation (CU5.1)
 *
 * Executes historical replay against real WorkoutBackup data across the primary
 * modern validation window (2026-08-07 ~ 2026-08-17) and secondary legacy stress dataset.
 *
 * STRICT INVARIANT: ZERO POLICY MODIFICATIONS.
 * Pure observation, classification, and statistical reporting.
 */

import { WorkoutLog } from '../../../types';
import {
  runHistoricalReplay,
  evaluateSingleHistoricalPoint,
} from '../replay/historicalReplayEngine';
import { computeReplayStatistics } from '../replay/replayStatistics';
import {
  FullReplayReport,
  HistoricalEvaluationPoint,
  HistoricalReplayResult,
} from '../types/historicalReplay.types';
import {
  loadRealWorkoutBackupLogs,
  getRealWorkoutBackupProvenance,
  ValidationDatasetProvenance,
} from '../replay/realWorkoutBackupLoader';
import { runGoldenScenariosReplay } from '../replay/goldenScenariosReplay';

export interface CU51RealReplayOutput {
  readonly validationDataset: ValidationDatasetProvenance;
  readonly real01: HistoricalReplayResult;
  readonly real02: HistoricalReplayResult;
  readonly real03: HistoricalReplayResult;
  readonly real03FullTrace: {
    readonly evaluationInstant: string;
    readonly eligibleWorkoutLogCount: number;
    readonly excludedFutureWorkoutLogCount: number;
    readonly eligibleExerciseEvidenceCount: number;
    readonly eligibleLogsCount: number;
    readonly excludedFutureCount: number;
    readonly dimensionStressCount: number;
    readonly residualDimensionKeys: readonly string[];
    readonly candidateReadiness: Record<string, { readinessClass: string; hardBlocked: boolean; dimensionStatus: string }>;
    readonly trainingNeed: Record<string, { needClass: string; daysSinceLastTrained: number | null; lifetimeSessions: number }>;
    readonly progressOpportunity: Record<string, { opportunityClass: string; e1RMTrend: string; workCapacityTrend: string }>;
    readonly candidateSynthesis: {
      readonly viableCandidateIds: readonly string[];
      readonly preferredCandidateIds: readonly string[];
      readonly candidateRanks: Record<string, { decisionClass: string; decisionReasons: readonly string[] }>;
    };
    readonly restEvidence: {
      readonly supportClass: string;
      readonly recentSessionCount: number;
      readonly recentUniqueTrainingDays: number;
      readonly consecutiveTrainingDays: number;
      readonly isSameDaySessionCompleted: boolean;
      readonly supportingReasons: readonly string[];
      readonly counterReasons: readonly string[];
      readonly systemicDemandState: string;
      readonly immediateDimensions: readonly string[];
      readonly residualDimensions: readonly string[];
    };
    readonly finalDecision: {
      readonly kind: 'train' | 'rest';
      readonly primaryCandidateId?: string;
      readonly primaryCandidateName?: string;
      readonly restCategory?: string;
      readonly explanation: string;
    };
  };
  readonly real04: HistoricalReplayResult;
  readonly real05: HistoricalReplayResult;
  readonly real06: HistoricalReplayResult;
  readonly real07: HistoricalReplayResult;
  readonly modernReport: FullReplayReport;
  readonly legacyStressReport: FullReplayReport;
  readonly goldenScenariosPassed: boolean;
  readonly gsFailedDetails: readonly string[];
}

/**
 * Runs a single point evaluation with deep uncompressed trace.
 */
export function evaluateExplicitTimePoint(
  allLogs: readonly WorkoutLog[],
  evalInstant: string,
  calendarDate: string,
  timezone: string = 'Asia/Seoul'
): HistoricalReplayResult {
  const localTime = evalInstant.split('T')[1]?.substring(0, 8) ?? '00:00:00';
  const point: HistoricalEvaluationPoint = Object.freeze({
    pointId: `custom-point-${evalInstant}`,
    kind: 'pre-session',
    evaluationInstant: evalInstant,
    evaluationCalendarDate: calendarDate,
    evaluationLocalTime: localTime,
    evaluationTimezone: timezone,
    hasChronologyUncertainty: false,
  });

  return evaluateSingleHistoricalPoint(allLogs, point);
}

/**
 * Executes the complete CU5.1 validation pipeline.
 */
export function runCU51Validation(): CU51RealReplayOutput {
  const realLogs = loadRealWorkoutBackupLogs();

  // 1. REAL-01: 2026-08-09 13:30 (Asia/Seoul)
  const real01 = evaluateExplicitTimePoint(realLogs, '2026-08-09T13:30:00+09:00', '2026-08-09');

  // 2. REAL-02: 2026-08-10 18:30 (Asia/Seoul)
  const real02 = evaluateExplicitTimePoint(realLogs, '2026-08-10T18:30:00+09:00', '2026-08-10');

  // 3. REAL-03: 2026-08-11 19:00 (Asia/Seoul)
  const real03 = evaluateExplicitTimePoint(realLogs, '2026-08-11T19:00:00+09:00', '2026-08-11');

  // Build uncompressed REAL-03 trace
  const cSet03 = real03.candidateDecisionSet;
  const rest03 = real03.restDecisionEvidence;
  const fin03 = real03.todayDecision;

  const candidateReadinessMap: Record<string, { readinessClass: string; hardBlocked: boolean; dimensionStatus: string }> = {};
  const candidateNeedMap: Record<string, { needClass: string; daysSinceLastTrained: number | null; lifetimeSessions: number }> = {};
  const candidateOppMap: Record<string, { opportunityClass: string; e1RMTrend: string; workCapacityTrend: string }> = {};
  const candidateRankMap: Record<string, { decisionClass: string; decisionReasons: readonly string[] }> = {};

  for (const cand of cSet03.candidates) {
    const cid = cand.candidateExerciseId;
    candidateReadinessMap[cid] = {
      readinessClass: cand.readinessEvidence.overallReadinessClass,
      hardBlocked: cand.readinessEvidence.hardConstraintBoundary.isHardBlocked,
      dimensionStatus: cand.readinessEvidence.dimensionAssessments.map((d) => `${d.dimension}:${d.dimensionReadinessStatus}`).join(', '),
    };
    candidateNeedMap[cid] = {
      needClass: cand.trainingNeedEvidence.needClass,
      daysSinceLastTrained: cand.trainingNeedEvidence.recency.calendarDaysSinceLastPerformed ?? null,
      lifetimeSessions: cand.trainingNeedEvidence.frequencyContext.lifetimeSessionCount,
    };
    candidateOppMap[cid] = {
      opportunityClass: cand.progressOpportunityEvidence.opportunityClass,
      e1RMTrend: cand.progressOpportunityEvidence.strengthContext?.e1RMTrend ?? 'n/a',
      workCapacityTrend: cand.progressOpportunityEvidence.strengthContext?.workCapacityTrend ?? 'n/a',
    };
    candidateRankMap[cid] = {
      decisionClass: cand.decisionClass,
      decisionReasons: cand.decisionReasons,
    };
  }

  const real03FullTrace = {
    evaluationInstant: real03.evaluationPoint.evaluationInstant,
    eligibleWorkoutLogCount: real03.availableHistoricalEvidenceCount.eligibleWorkoutLogCount,
    excludedFutureWorkoutLogCount: real03.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount,
    eligibleExerciseEvidenceCount: real03.availableHistoricalEvidenceCount.eligibleExerciseEvidenceCount,
    eligibleLogsCount: real03.availableHistoricalEvidenceCount.eligibleWorkoutLogCount,
    excludedFutureCount: real03.availableHistoricalEvidenceCount.excludedFutureWorkoutLogCount,
    dimensionStressCount: Object.keys(real03.dimensionBehaviorSnapshot.activeImmediateDimensions).length + Object.keys(real03.dimensionBehaviorSnapshot.activeResidualDimensions).length,
    residualDimensionKeys: [...real03.dimensionBehaviorSnapshot.activeImmediateDimensions, ...real03.dimensionBehaviorSnapshot.activeResidualDimensions],
    candidateReadiness: candidateReadinessMap,
    trainingNeed: candidateNeedMap,
    progressOpportunity: candidateOppMap,
    candidateSynthesis: {
      viableCandidateIds: cSet03.candidates.filter(c => c.decisionClass === 'viable').map((c) => c.candidateExerciseId),
      preferredCandidateIds: cSet03.candidates.filter(c => c.decisionClass === 'preferred').map((c) => c.candidateExerciseId),
      candidateRanks: candidateRankMap,
    },
    restEvidence: {
      supportClass: rest03.restSupportClass,
      recentSessionCount: rest03.recentTrainingContext.recentSessionCount,
      recentUniqueTrainingDays: rest03.recentTrainingContext.recentUniqueTrainingDays,
      consecutiveTrainingDays: rest03.recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval,
      isSameDaySessionCompleted: rest03.recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted,
      supportingReasons: rest03.supportingReasons,
      counterReasons: rest03.counterReasons,
      systemicDemandState: rest03.systemicTrainingDemandContext.evidenceState,
      immediateDimensions: rest03.residualLandscape.immediateDimensions,
      residualDimensions: rest03.residualLandscape.residualDimensions,
    },
    finalDecision: {
      kind: fin03.kind,
      primaryCandidateId: fin03.primaryCandidate?.candidateExerciseId,
      primaryCandidateName: fin03.primaryCandidate?.candidateExerciseName,
      restCategory: fin03.restCategory,
      explanation: fin03.explainability?.headline ?? fin03.decisionRationale,
    },
  };

  // 4. REAL-04: 2026-08-12 18:00 (Asia/Seoul)
  const real04 = evaluateExplicitTimePoint(realLogs, '2026-08-12T18:00:00+09:00', '2026-08-12');

  // 5. REAL-05: 2026-08-18 18:00 (Asia/Seoul)
  const real05 = evaluateExplicitTimePoint(realLogs, '2026-08-18T18:00:00+09:00', '2026-08-18');

  // 6. REAL-06: 2026-08-19 12:00 (Asia/Seoul)
  const real06 = evaluateExplicitTimePoint(realLogs, '2026-08-19T12:00:00+09:00', '2026-08-19');

  // 7. REAL-07: 2026-08-21 20:00 (Asia/Seoul)
  const real07 = evaluateExplicitTimePoint(realLogs, '2026-08-21T20:00:00+09:00', '2026-08-21');

  // 8. Full Modern Window Replay (2026-08-07 ~ 2026-08-21 evaluation points, all real history as evidence)
  const modernReport = runHistoricalReplay(realLogs, {
    timezone: 'Asia/Seoul',
    includePreSession: true,
    includePostSession: true,
    startEvaluationDate: '2026-08-07',
    endEvaluationDate: '2026-08-21',
  });

  // 9. Secondary Legacy Stress Replay (skipped if no legacy dataset in backup)
  const legacyLogs = realLogs.filter((l) => l.date < '2026-06-01');
  const legacyStressReport: FullReplayReport = legacyLogs.length > 0
    ? runHistoricalReplay(legacyLogs, {
        timezone: 'Asia/Seoul',
        includePreSession: true,
        includePostSession: true,
      })
    : Object.freeze({
        summary: 'Skipped legacy stress replay (no legacy historical logs in current backup).',
        statistics: computeReplayStatistics([], []),
        results: Object.freeze([]),
        anomalies: Object.freeze([]),
        goldenScenariosResults: Object.freeze([]),
      });

  // 10. Golden Scenarios Regression
  const gsOutcomes = runGoldenScenariosReplay();
  const gsPassed = gsOutcomes.every((g) => g.passed);
  const gsFailedDetails = gsOutcomes.filter((g) => !g.passed).map((g) => `${g.scenarioId} (${g.title}): ${g.details}`);

  return {
    validationDataset: getRealWorkoutBackupProvenance(),
    real01,
    real02,
    real03,
    real03FullTrace,
    real04,
    real05,
    real06,
    real07,
    modernReport,
    legacyStressReport,
    goldenScenariosPassed: gsPassed,
    gsFailedDetails,
  };
}
