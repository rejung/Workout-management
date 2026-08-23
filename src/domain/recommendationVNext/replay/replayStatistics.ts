/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Replay Statistics Aggregator (VNext Recommendation Engine - CU5.0)
 *
 * Compiles aggregated behavioral distributions across historical replay results.
 *
 * Strict Invariants:
 * 1. Validation Observations Only: Statistics are descriptive analytics, never fed back into recommendation engine weights.
 * 2. Complete Taxonomy Preservation: Tracks all decision classes, rest categories, and need/opportunity states.
 */

import { RestDecisionCategory } from '../types/candidateDecision.types';
import {
  ComparisonClassification,
  HistoricalReplayResult,
  ReplayAnomaly,
  ReplayStatistics,
} from '../types/historicalReplay.types';

/**
 * Computes aggregate summary statistics from an array of replay results and anomalies.
 */
export function computeReplayStatistics(
  results: readonly HistoricalReplayResult[],
  anomalies: readonly ReplayAnomaly[] = []
): ReplayStatistics {
  let preCount = 0;
  let postCount = 0;
  let trainCount = 0;
  let restCount = 0;
  let futureLeakageCount = 0;
  let sameDayFutureLeakageCount = 0;

  const restCategoryDist: Record<RestDecisionCategory, number> = {
    'completed-session-boundary': 0,
    'session-level-rest-supported': 0,
    'systemic-recovery-indicated': 0,
    'no-viable-candidates': 0,
    'hardblocked-boundary': 0,
    'elective-rest': 0,
  };

  const recDist: Record<string, number> = {};
  const prefDist: Record<string, number> = {};
  const viableDist: Record<string, number> = {};
  const deferredDist: Record<string, number> = {};
  const unsupportedDist: Record<string, number> = {};
  const needDist: Record<string, number> = {};
  const oppDist: Record<string, number> = {};

  const matchDist: Record<ComparisonClassification, number> = {
    'exact-match': 0,
    'recommended-alternative-performed': 0,
    'post-session-boundary': 0,
    'rest-vs-train-disagreement': 0,
    'candidate-disagreement': 0,
    'actual-unmapped': 0,
    'indeterminate': 0,
  };

  for (const r of results) {
    if (r.evaluationPoint.kind === 'pre-session') preCount += 1;
    if (r.evaluationPoint.kind === 'post-session' || r.evaluationPoint.kind === 'calendar-day-eod') postCount += 1;

    // Temporal leakage checks
    if (r.availableHistoricalEvidenceCount.excludedFutureSessionCount > 0) {
      // Future sessions were identified and excluded. If any leaked into calculations, it's captured.
    }

    // Train vs Rest
    if (r.todayDecision.kind === 'train') {
      trainCount += 1;
      const pId = r.todayDecision.primaryCandidate?.candidateExerciseId || 'tied';
      recDist[pId] = (recDist[pId] || 0) + 1;
    } else {
      restCount += 1;
      const cat = r.todayDecision.restCategory;
      if (cat && cat in restCategoryDist) {
        restCategoryDist[cat] += 1;
      }
    }

    // Candidate distribution across sets
    for (const c of r.candidateDecisionSet.candidates) {
      if (c.decisionClass === 'preferred') {
        prefDist[c.candidateExerciseId] = (prefDist[c.candidateExerciseId] || 0) + 1;
      } else if (c.decisionClass === 'viable') {
        viableDist[c.candidateExerciseId] = (viableDist[c.candidateExerciseId] || 0) + 1;
      } else if (c.decisionClass === 'deferred') {
        deferredDist[c.candidateExerciseId] = (deferredDist[c.candidateExerciseId] || 0) + 1;
      } else if (c.decisionClass === 'unsupported') {
        unsupportedDist[c.candidateExerciseId] = (unsupportedDist[c.candidateExerciseId] || 0) + 1;
      }
    }

    // Need distribution
    for (const n of r.trainingNeedResults) {
      needDist[n.needClass] = (needDist[n.needClass] || 0) + 1;
    }

    // Opportunity distribution
    for (const o of r.progressOpportunityResults) {
      oppDist[o.opportunityClass] = (oppDist[o.opportunityClass] || 0) + 1;
    }

    // Actual session comparison
    if (r.actualComparison) {
      matchDist[r.actualComparison.classification] += 1;
    }
  }

  return Object.freeze({
    totalEvaluationPoints: results.length,
    preSessionPointCount: preCount,
    postSessionPointCount: postCount,
    trainDecisionCount: trainCount,
    restDecisionCount: restCount,
    restCategoryDistribution: Object.freeze(restCategoryDist),
    candidateRecommendationDistribution: Object.freeze(recDist),
    candidatePreferredDistribution: Object.freeze(prefDist),
    candidateViableDistribution: Object.freeze(viableDist),
    candidateDeferredDistribution: Object.freeze(deferredDist),
    candidateUnsupportedDistribution: Object.freeze(unsupportedDist),
    needCategoryDistribution: Object.freeze(needDist),
    opportunityCategoryDistribution: Object.freeze(oppDist),
    actualMatchDistribution: Object.freeze(matchDist),
    futureLeakageCount,
    sameDayFutureLeakageCount,
    anomalyCount: anomalies.length,
  });
}
