/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Historical Replay Engine (VNext Recommendation Engine - CU5.0)
 *
 * Runs historical replay across time-traveling evaluation points.
 *
 * Strict Invariants:
 * 1. Zero Future Data Leakage: Evaluates candidate recommendations strictly against past eligible evidence.
 * 2. Immutable Replay Results: Deeply frozen output structures across all evaluation points.
 * 3. Complete Domain Synthesis: Executes full pipeline from residual stress traces to FinalTodayDecision.
 * 4. Temporal Projection Invalidation: Prior projections are never reused as actual history.
 */

import { WorkoutLog } from '../../../types';
import {
  HistoricalEvaluationPoint,
  HistoricalReplayResult,
  FullReplayReport,
  ReplayAnomaly,
  DimensionBehaviorSnapshot,
} from '../types/historicalReplay.types';
import { EvaluationContext } from '../types/residualStressTrace.types';
import { deriveEvaluationContext, deriveResidualStressTraces } from '../stress/residualStressTrace';
import { deriveAllDimensionResidualStates } from '../stress/dimensionResidualState';
import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { deriveFinalTodayDecision } from '../synthesis/finalTodayDecision';
import { evaluateSessionTemporalEligibility } from '../temporal/temporalEligibility';
import { buildHistoricalEvaluationPoints } from './evaluationPointBuilder';
import { adaptWorkoutLogsToReplayEvidence } from './workoutLogReplayAdapter';
import { compareWithActualSession } from './actualSessionComparer';
import { detectReplayAnomalies } from './replayAnomalyDetector';
import { computeReplayStatistics } from './replayStatistics';

export interface HistoricalReplayEngineOptions {
  readonly candidateIds?: readonly string[];
  readonly timezone?: string;
  readonly includePreSession?: boolean;
  readonly includePostSession?: boolean;
  readonly evaluationPoints?: readonly HistoricalEvaluationPoint[];
  readonly startEvaluationDate?: string;
  readonly endEvaluationDate?: string;
}

/**
 * Derives UnifiedDimensionProjectedStress array from eligible StressMagnitudeInputs.
 */
export function buildProjectedStressFromInputs(
  eligibleInputs: readonly StressMagnitudeInput[]
): UnifiedDimensionProjectedStress[] {
  const projections: UnifiedDimensionProjectedStress[] = [];

  for (const input of eligibleInputs) {
    if (input.kind === 'strength') {
      for (const dim of input.dimensions) {
        projections.push({
          kind: 'dimension-projected-strength-stress',
          sourceLogId: input.sourceLogId,
          dimension: dim,
          date: input.date,
          startTime: input.startTime,
          exerciseId: input.exerciseId,
          exerciseName: input.exerciseName,
          associatedDimensions: input.dimensions,
          sourceSessionMagnitude: input as any,
        });
      }
    } else if (input.kind === 'running') {
      for (const dim of input.dimensions) {
        projections.push({
          kind: 'dimension-projected-running-stress',
          sessionLogId: input.sourceLogId,
          activityType: 'running',
          dimension: dim,
          date: input.date,
          startTime: input.startTime,
          associatedDimensions: input.dimensions as any,
          sourceSessionMagnitude: input as any,
        });
      }
    }
  }

  return projections;
}

/**
 * Evaluates a single historical evaluation point with full pipeline execution.
 */
export function evaluateSingleHistoricalPoint(
  allLogs: readonly WorkoutLog[],
  point: HistoricalEvaluationPoint,
  candidateIds?: readonly string[]
): HistoricalReplayResult {
  const evalContext: EvaluationContext = deriveEvaluationContext({
    evaluationInstant: point.evaluationInstant,
    evaluationTimezone: point.evaluationTimezone,
  });

  const adapted = adaptWorkoutLogsToReplayEvidence(allLogs);
  const allInputs = adapted.allStressMagnitudeInputs;
  const runningSessions = adapted.runningSessions;

  // 1. Filter eligible inputs strictly using Temporal Occurrence Eligibility SSOT
  let excludedFutureCount = 0;
  let uncertainCount = 0;
  const eligibleInputs: StressMagnitudeInput[] = [];

  for (const input of allInputs) {
    const eligibility = evaluateSessionTemporalEligibility(
      { date: input.date, startTime: input.startTime },
      evalContext
    );

    if (eligibility.isFuture) {
      excludedFutureCount += 1;
    } else if (eligibility.isUncertain) {
      uncertainCount += 1;
    } else if (eligibility.isEligible) {
      eligibleInputs.push(input);
    }
  }

  const sortedLogs = [...allLogs].sort((a, b) => {
    const dDiff = a.date.localeCompare(b.date);
    if (dDiff !== 0) return dDiff;
    const tA = a.startTime || '';
    const tB = b.startTime || '';
    return tA.localeCompare(tB);
  });

  let excludedFutureLogCount = 0;
  let uncertainLogCount = 0;
  const eligibleLogs: WorkoutLog[] = [];

  for (const log of sortedLogs) {
    const eligibility = evaluateSessionTemporalEligibility(
      { date: log.date, startTime: log.startTime },
      evalContext
    );
    if (eligibility.isFuture) {
      excludedFutureLogCount += 1;
    } else if (eligibility.isUncertain) {
      uncertainLogCount += 1;
    } else if (eligibility.isEligible) {
      eligibleLogs.push(log);
    }
  }

  const eligibleRuns = runningSessions.filter((run) => {
    const eligibility = evaluateSessionTemporalEligibility(
      { date: run.date, startTime: run.startTime },
      evalContext
    );
    return eligibility.isEligible;
  });

  // 2. Build Residual States from eligible evidence
  const projections = buildProjectedStressFromInputs(eligibleInputs);
  const traceCollection = deriveResidualStressTraces(projections, evalContext);
  const residualStates = deriveAllDimensionResidualStates(traceCollection.traces, evalContext);

  // 3. Evaluate Candidate Set & Today Decision
  const candidateSet = evaluateCandidateDecisionSet(
    candidateIds,
    residualStates,
    eligibleInputs,
    evalContext,
    eligibleRuns
  );

  const todayDecision = deriveFinalTodayDecision(candidateSet);

  // 4. Capture Dimension Behavior Snapshot
  const activeImmediate: string[] = [];
  const activeResidual: string[] = [];
  let hasAxial = false;
  let hasRunningLowerBody = false;

  for (const [dim, state] of Object.entries(residualStates)) {
    if (state.strongestPersistence.definite === 'immediate') activeImmediate.push(dim);
    if (state.strongestPersistence.definite === 'residual') activeResidual.push(dim);
    if (dim === 'axial-systemic-loading' && state.strongestPersistence.definite !== 'none' && state.strongestPersistence.definite !== 'historical') {
      hasAxial = true;
    }
    if (
      (dim === 'knee-dominant-lower-body' || dim === 'hip-posterior-chain') &&
      state.strongestPersistence.definite !== 'none' &&
      state.strongestPersistence.definite !== 'historical' &&
      state.modalitySummary.hasRunning
    ) {
      hasRunningLowerBody = true;
    }
  }

  const dimensionSnapshot: DimensionBehaviorSnapshot = Object.freeze({
    activeImmediateDimensions: Object.freeze(activeImmediate),
    activeResidualDimensions: Object.freeze(activeResidual),
    hasAxialSystemicResidual: hasAxial,
    hasRunningLowerBodyOverlap: hasRunningLowerBody,
    systemicExposureSummary: `Immediate=[${activeImmediate.join(', ')}], Residual=[${activeResidual.join(', ')}], Axial=${hasAxial}, RunningLowerBody=${hasRunningLowerBody}`,
  });

  let nextActualLog: WorkoutLog | undefined;
  if (point.kind === 'pre-session' && point.associatedWorkoutLog) {
    nextActualLog = point.associatedWorkoutLog;
  } else {
    nextActualLog = sortedLogs.find((l) => {
      const el = evaluateSessionTemporalEligibility(
        { date: l.date, startTime: l.startTime },
        evalContext
      );
      return el.isFuture;
    });
  }

  const actualSessionAfter = nextActualLog
    ? Object.freeze({
        workoutLogId: nextActualLog.id,
        date: nextActualLog.date,
        startTime: nextActualLog.startTime,
        routineName: nextActualLog.routineName,
        mainLift: undefined,
        exercises: Object.freeze(nextActualLog.exercises.map((e) => e.exerciseName)),
      })
    : undefined;

  const actualComparison = compareWithActualSession(todayDecision, nextActualLog);

  const warnings: string[] = [];
  if (point.hasChronologyUncertainty) {
    warnings.push(point.uncertaintyReason || 'Chronology uncertainty flagged.');
  }
  if (uncertainCount > 0) {
    warnings.push(`${uncertainCount} same-day sessions excluded due to missing startTime uncertainty.`);
  }

  const readinessResults = Object.freeze(
    candidateSet.candidates.map((c) => c.readinessEvidence)
  );
  const trainingNeedResults = Object.freeze(
    candidateSet.candidates.map((c) => c.trainingNeedEvidence)
  );
  const progressOpportunityResults = Object.freeze(
    candidateSet.candidates.map((c) => c.progressOpportunityEvidence)
  );

  return Object.freeze({
    evaluationPoint: point,
    evaluationContext: evalContext,
    availableHistoricalEvidenceCount: Object.freeze({
      eligibleWorkoutLogCount: eligibleLogs.length,
      excludedFutureWorkoutLogCount: excludedFutureLogCount,
      eligibleExerciseEvidenceCount: eligibleInputs.length,
      strengthEvidenceCount: eligibleInputs.filter((i) => i.kind === 'strength').length,
      runningEvidenceCount: eligibleRuns.length,
      excludedFutureExerciseEvidenceCount: excludedFutureCount,
      uncertainSameDaySessionCount: uncertainCount,
      totalEligibleSessionCount: eligibleLogs.length,
      excludedFutureSessionCount: excludedFutureLogCount,
    }),
    readinessResults,
    trainingNeedResults,
    progressOpportunityResults,
    candidateDecisionSet: candidateSet,
    restDecisionEvidence: candidateSet.restDecisionEvidence,
    todayDecision,
    actualSessionAfterEvaluation: actualSessionAfter,
    actualComparison,
    dimensionBehaviorSnapshot: dimensionSnapshot,
    warnings: Object.freeze(warnings),
  });
}

/**
 * Runs the historical replay pipeline on a collection of WorkoutLogs.
 */
export function runHistoricalReplay(
  logs: readonly WorkoutLog[],
  options: HistoricalReplayEngineOptions = {}
): FullReplayReport {
  const timezone = options.timezone ?? 'Asia/Seoul';
  let evalPoints = options.evaluationPoints ?? buildHistoricalEvaluationPoints(logs, {
    timezone,
    includePreSession: options.includePreSession ?? true,
    includePostSession: options.includePostSession ?? true,
  });

  if (options.startEvaluationDate || options.endEvaluationDate) {
    evalPoints = evalPoints.filter((p) => {
      if (options.startEvaluationDate && p.evaluationCalendarDate < options.startEvaluationDate) return false;
      if (options.endEvaluationDate && p.evaluationCalendarDate > options.endEvaluationDate) return false;
      return true;
    });
  }

  const adapted = adaptWorkoutLogsToReplayEvidence(logs);
  const allInputs = adapted.allStressMagnitudeInputs;
  const runningSessions = adapted.runningSessions;

  const replayResults: HistoricalReplayResult[] = [];
  const allAnomalies: ReplayAnomaly[] = [];

  // Sort logs chronologically for finding next actual session
  const sortedLogs = [...logs].sort((a, b) => {
    const dDiff = a.date.localeCompare(b.date);
    if (dDiff !== 0) return dDiff;
    const tA = a.startTime || '';
    const tB = b.startTime || '';
    return tA.localeCompare(tB);
  });

  for (const point of evalPoints) {
    const evalContext: EvaluationContext = deriveEvaluationContext({
      evaluationInstant: point.evaluationInstant,
      evaluationTimezone: point.evaluationTimezone,
    });

    // 1. Filter eligible inputs strictly using Temporal Occurrence Eligibility SSOT
    let excludedFutureCount = 0;
    let uncertainCount = 0;
    const eligibleInputs: StressMagnitudeInput[] = [];

    for (const input of allInputs) {
      const eligibility = evaluateSessionTemporalEligibility(
        { date: input.date, startTime: input.startTime },
        evalContext
      );

      if (eligibility.isFuture) {
        excludedFutureCount += 1;
      } else if (eligibility.isUncertain) {
        uncertainCount += 1;
      } else if (eligibility.isEligible) {
        eligibleInputs.push(input);
      }
    }

    let excludedFutureLogCount = 0;
    let uncertainLogCount = 0;
    const eligibleLogs: WorkoutLog[] = [];

    for (const log of sortedLogs) {
      const eligibility = evaluateSessionTemporalEligibility(
        { date: log.date, startTime: log.startTime },
        evalContext
      );
      if (eligibility.isFuture) {
        excludedFutureLogCount += 1;
      } else if (eligibility.isUncertain) {
        uncertainLogCount += 1;
      } else if (eligibility.isEligible) {
        eligibleLogs.push(log);
      }
    }

    // Filter eligible running sessions
    const eligibleRuns = runningSessions.filter((run) => {
      const eligibility = evaluateSessionTemporalEligibility(
        { date: run.date, startTime: run.startTime },
        evalContext
      );
      return eligibility.isEligible;
    });

    // 2. Build Residual States from eligible evidence
    const projections = buildProjectedStressFromInputs(eligibleInputs);
    const traceCollection = deriveResidualStressTraces(projections, evalContext);
    const residualStates = deriveAllDimensionResidualStates(traceCollection.traces, evalContext);

    // 3. Evaluate Candidate Set & Today Decision
    const candidateSet = evaluateCandidateDecisionSet(
      options.candidateIds,
      residualStates,
      eligibleInputs,
      evalContext,
      eligibleRuns
    );

    const todayDecision = deriveFinalTodayDecision(candidateSet);

    // 4. Capture Dimension Behavior Snapshot
    const activeImmediate: string[] = [];
    const activeResidual: string[] = [];
    let hasAxial = false;
    let hasRunningLowerBody = false;

    for (const [dim, state] of Object.entries(residualStates)) {
      if (state.strongestPersistence.definite === 'immediate') activeImmediate.push(dim);
      if (state.strongestPersistence.definite === 'residual') activeResidual.push(dim);
      if (dim === 'axial-systemic-loading' && state.strongestPersistence.definite !== 'none' && state.strongestPersistence.definite !== 'historical') {
        hasAxial = true;
      }
      if (
        (dim === 'knee-dominant-lower-body' || dim === 'hip-posterior-chain') &&
        state.strongestPersistence.definite !== 'none' &&
        state.strongestPersistence.definite !== 'historical' &&
        state.modalitySummary.hasRunning
      ) {
        hasRunningLowerBody = true;
      }
    }

    const dimensionSnapshot: DimensionBehaviorSnapshot = Object.freeze({
      activeImmediateDimensions: Object.freeze(activeImmediate),
      activeResidualDimensions: Object.freeze(activeResidual),
      hasAxialSystemicResidual: hasAxial,
      hasRunningLowerBodyOverlap: hasRunningLowerBody,
      systemicExposureSummary: `Immediate=[${activeImmediate.join(', ')}], Residual=[${activeResidual.join(', ')}], Axial=${hasAxial}, RunningLowerBody=${hasRunningLowerBody}`,
    });

    // 5. Find next actual session after this evaluation instant
    let nextActualLog: WorkoutLog | undefined;
    if (point.kind === 'pre-session' && point.associatedWorkoutLog) {
      nextActualLog = point.associatedWorkoutLog;
    } else {
      // Find first workout log strictly after this evaluation instant
      nextActualLog = sortedLogs.find((l) => {
        const el = evaluateSessionTemporalEligibility(
          { date: l.date, startTime: l.startTime },
          evalContext
        );
        return el.isFuture;
      });
    }

    const actualSessionAfter = nextActualLog
      ? Object.freeze({
          workoutLogId: nextActualLog.id,
          date: nextActualLog.date,
          startTime: nextActualLog.startTime,
          routineName: nextActualLog.routineName,
          mainLift: undefined,
          exercises: Object.freeze(nextActualLog.exercises.map((e) => e.exerciseName)),
        })
      : undefined;

    // 6. Actual Session Comparison
    const actualComparison = compareWithActualSession(todayDecision, nextActualLog);

    // 7. Warnings collection
    const warnings: string[] = [];
    if (point.hasChronologyUncertainty) {
      warnings.push(point.uncertaintyReason || 'Chronology uncertainty flagged.');
    }
    if (uncertainCount > 0) {
      warnings.push(`${uncertainCount} same-day sessions excluded due to missing startTime uncertainty.`);
    }

    // 8. Extract multi-axis individual results
    const readinessResults = Object.freeze(
      candidateSet.candidates.map((c) => c.readinessEvidence)
    );
    const trainingNeedResults = Object.freeze(
      candidateSet.candidates.map((c) => c.trainingNeedEvidence)
    );
    const progressOpportunityResults = Object.freeze(
      candidateSet.candidates.map((c) => c.progressOpportunityEvidence)
    );

    const replayResult: HistoricalReplayResult = Object.freeze({
      evaluationPoint: point,
      evaluationContext: evalContext,
      availableHistoricalEvidenceCount: Object.freeze({
        eligibleWorkoutLogCount: eligibleLogs.length,
        excludedFutureWorkoutLogCount: excludedFutureLogCount,
        eligibleExerciseEvidenceCount: eligibleInputs.length,
        strengthEvidenceCount: eligibleInputs.filter((i) => i.kind === 'strength').length,
        runningEvidenceCount: eligibleRuns.length,
        excludedFutureExerciseEvidenceCount: excludedFutureCount,
        uncertainSameDaySessionCount: uncertainCount,
        totalEligibleSessionCount: eligibleLogs.length,
        excludedFutureSessionCount: excludedFutureLogCount,
      }),
      readinessResults,
      trainingNeedResults,
      progressOpportunityResults,
      candidateDecisionSet: candidateSet,
      restDecisionEvidence: candidateSet.restDecisionEvidence,
      todayDecision,
      actualSessionAfterEvaluation: actualSessionAfter,
      actualComparison,
      dimensionBehaviorSnapshot: dimensionSnapshot,
      warnings: Object.freeze(warnings),
    });

    replayResults.push(replayResult);

    // 10. Detect Anomalies
    const pointAnomalies = detectReplayAnomalies(replayResult, replayResults);
    for (const an of pointAnomalies) {
      allAnomalies.push(an);
    }
  }

  const stats = computeReplayStatistics(replayResults, allAnomalies);

  const summary = `Replay completed: ${replayResults.length} evaluation points evaluated (${stats.trainDecisionCount} Train, ${stats.restDecisionCount} Rest). Detected ${allAnomalies.length} anomaly observations.`;

  return Object.freeze({
    summary,
    statistics: stats,
    results: Object.freeze(replayResults),
    anomalies: Object.freeze(allAnomalies),
    goldenScenariosResults: Object.freeze([]),
  });
}
