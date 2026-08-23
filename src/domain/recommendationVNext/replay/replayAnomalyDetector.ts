/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replay Anomaly Detector (VNext Recommendation Engine - CU5.0)
 *
 * Detects and structures behavioral anomalies observed during historical replay.
 *
 * Strict Invariants:
 * 1. Observation Boundary: Detects, classifies, and reports anomalies without modifying policy code.
 * 2. Reproducible Audit Evidence: Every anomaly includes evaluation instant, relevant log IDs, and evidence snapshots.
 * 3. Zero Guessing: Root causes are stated as testable structural hypotheses based on recorded facts.
 */

import {
  HistoricalReplayResult,
  ReplayAnomaly,
  ReplayAnomalyCategory,
} from '../types/historicalReplay.types';

let anomalyCounter = 0;

/**
 * Evaluates a HistoricalReplayResult against anomaly detection heuristics.
 */
export function detectReplayAnomalies(
  result: HistoricalReplayResult,
  recentHistoryResults: readonly HistoricalReplayResult[] = []
): readonly ReplayAnomaly[] {
  const anomalies: ReplayAnomaly[] = [];
  const evalInstant = result.evaluationContext.evaluationInstant;
  const decision = result.todayDecision;
  const candidateSet = result.candidateDecisionSet;
  const restEv = result.restDecisionEvidence;

  // Helper to construct ReplayAnomaly
  const createAnomaly = (
    category: ReplayAnomalyCategory,
    suspectedCause: string
  ): ReplayAnomaly => {
    anomalyCounter += 1;
    const relevantLogs: string[] = [];
    if (result.evaluationPoint.associatedWorkoutLogId) {
      relevantLogs.push(result.evaluationPoint.associatedWorkoutLogId);
    }
    if (result.actualSessionAfterEvaluation?.workoutLogId) {
      relevantLogs.push(result.actualSessionAfterEvaluation.workoutLogId);
    }

    const preferredCandidates = candidateSet.candidates.filter(
      (c) => c.decisionClass === 'preferred'
    );

    const readinessSummary = preferredCandidates
      .map((c) => `${c.candidateExerciseName}: ${c.readinessEvidence.overallReadinessClass}`)
      .join('; ') || 'None preferred';

    const needSummary = preferredCandidates
      .map((c) => `${c.candidateExerciseName}: ${c.trainingNeedEvidence.needClass}`)
      .join('; ') || 'None preferred';

    const opportunitySummary = preferredCandidates
      .map((c) => `${c.candidateExerciseName}: ${c.progressOpportunityEvidence.opportunityClass}`)
      .join('; ') || 'None preferred';

    return Object.freeze({
      anomalyId: `anomaly-${category}-${result.evaluationPoint.pointId}-${anomalies.length + 1}`,
      evaluationInstant: evalInstant,
      category,
      relevantWorkoutLogIds: Object.freeze(relevantLogs),
      vNextDecision: decision,
      actualNextSession: result.actualSessionAfterEvaluation?.routineName || result.actualSessionAfterEvaluation?.mainLift,
      evidenceSnapshot: Object.freeze({
        readinessSummary,
        needSummary,
        opportunitySummary,
        restSupportClass: restEv?.restSupportClass,
      }),
      suspectedCause,
    });
  };

  // 1. Chronology Uncertainty
  if (result.evaluationPoint.hasChronologyUncertainty) {
    anomalies.push(
      createAnomaly(
        'chronology-uncertainty',
        result.evaluationPoint.uncertaintyReason || 'WorkoutLog missing explicit startTime'
      )
    );
  }

  const preferredCandidates = candidateSet.candidates.filter(
    (c) => c.decisionClass === 'preferred'
  );

  // 2. Excessive Rest: Rest derived when preferred candidate exists with clear readiness + due need + low recent density
  if (
    decision.kind === 'rest' &&
    decision.restCategory !== 'completed-session-boundary' &&
    restEv.restSupportClass === 'rest-not-indicated' &&
    preferredCandidates.length > 0
  ) {
    anomalies.push(
      createAnomaly(
        'excessive-rest',
        'Rest was derived despite rest-not-indicated and presence of clear, due preferred candidate(s).'
      )
    );
  }

  // 3. Suspicious Train: Train derived despite high consecutive training days (>=4) and rest-supported indication
  if (
    decision.kind === 'train' &&
    restEv.restSupportClass === 'rest-supported' &&
    restEv.recentTrainingContext.consecutiveTrainingDayContext.consecutiveDaysLeadingUpToEval >= 4
  ) {
    anomalies.push(
      createAnomaly(
        'suspicious-train',
        `Train was recommended (${decision.primaryCandidate?.candidateExerciseName}) despite 4+ consecutive training days and rest-supported evidence.`
      )
    );
  }

  // 4. Running Overconstraint: Upper body candidate (bench, ohp, row) affected by running residual
  // Exclude completed-session-boundary from being flagged as a running overconstraint anomaly,
  // and verify that the constraint was actually caused by a running dimension rather than the candidate's own upper-body training.
  const runningOverlap = result.dimensionBehaviorSnapshot.hasRunningLowerBodyOverlap;
  if (runningOverlap && decision.restCategory !== 'completed-session-boundary') {
    const bench = candidateSet.candidateMap['bench_press'];
    const ohp = candidateSet.candidateMap['overhead_press'];
    const row = candidateSet.candidateMap['barbell_row'];

    // Check if an upper-body candidate was constrained due to lower-body/running stress projection
    const isBenchOverconstrained =
      bench &&
      bench.readinessEvidence.overallReadinessClass === 'constrained' &&
      bench.readinessEvidence.dimensionAssessments.some(
        (da) =>
          (da.dimension === 'knee-dominant-lower-body' || da.dimension === 'hip-posterior-chain') &&
          da.dimensionReadinessStatus === 'constrained'
      );

    const isOhpOverconstrained =
      ohp &&
      ohp.readinessEvidence.overallReadinessClass === 'constrained' &&
      ohp.readinessEvidence.dimensionAssessments.some(
        (da) =>
          (da.dimension === 'knee-dominant-lower-body' || da.dimension === 'hip-posterior-chain') &&
          da.dimensionReadinessStatus === 'constrained'
      );

    const isRowOverconstrained =
      row &&
      row.readinessEvidence.overallReadinessClass === 'constrained' &&
      row.readinessEvidence.dimensionAssessments.some(
        (da) =>
          da.dimension === 'knee-dominant-lower-body' &&
          da.dimensionReadinessStatus === 'constrained'
      );

    if (isBenchOverconstrained || isOhpOverconstrained || isRowOverconstrained) {
      anomalies.push(
        createAnomaly(
          'running-overconstraint',
          'Running lower-body residual appears to have constrained an upper-body push/pull candidate.'
        )
      );
    }
  }

  // 5. Repeated Candidate: Same candidate recommended 3+ times consecutively in recent results
  if (decision.kind === 'train' && decision.primaryCandidate && recentHistoryResults.length >= 2) {
    const pId = decision.primaryCandidate.candidateExerciseId;
    const last1 = recentHistoryResults[recentHistoryResults.length - 1]?.todayDecision.primaryCandidate?.candidateExerciseId;
    const last2 = recentHistoryResults[recentHistoryResults.length - 2]?.todayDecision.primaryCandidate?.candidateExerciseId;
    if (last1 === pId && last2 === pId) {
      anomalies.push(
        createAnomaly(
          'repeated-candidate',
          `Candidate ${decision.primaryCandidate.candidateExerciseName} recommended for 3 consecutive evaluation points.`
        )
      );
    }
  }

  // 6. Unexpected Tie
  if (decision.uncertaintyContext.isTiePreserved && preferredCandidates.length > 2) {
    anomalies.push(
      createAnomaly(
        'unexpected-tie',
        `Unexpected 3+ candidate tie in preferred group: [${preferredCandidates.map((c) => c.candidateExerciseName).join(', ')}].`
      )
    );
  }

  return Object.freeze(anomalies);
}
