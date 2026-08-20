/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Today Decision & Candidate Evaluation Set Reasoner (VNext Recommendation Engine - CU4.2)
 *
 * Evaluates the complete set of candidate exercises for the canonical EvaluationContext
 * and derives the top-level session decision (TodayDecision: train vs rest) and
 * CandidateDecisionEvaluationSet container.
 *
 * Strict Invariants:
 * 1. Rest is NOT a WorkoutLog: Rest is a top-level session recommendation, never a fake exercise entity.
 * 2. Lossless Multi-Axis Container: Preserves readiness, need, and opportunity evidence across all candidates.
 * 3. Zero Arithmetic Collapse: Grouping and primary selection follow deterministic rule hierarchies.
 * 4. Pure Immutability: Deeply frozen return structures.
 */

import { AllDimensionResidualStates } from '../types/dimensionResidualState.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import { EvaluationContext } from '../types/residualStressTrace.types';
import {
  CandidateDecisionEvaluationSet,
  CandidateDecisionEvidence,
  TodayDecision,
} from '../types/candidateDecision.types';
import { deriveCandidateReadinessEvidence } from '../readiness/candidateReadiness';
import { deriveCandidateTrainingNeedEvidence } from '../need/candidateTrainingNeed';
import { deriveCandidateProgressOpportunityEvidence } from '../opportunity/candidateProgressOpportunity';
import {
  deriveCandidateDecisionEvidence,
  sortCandidatesByPreference,
} from './candidateSynthesis';
import { DEFAULT_FOUNDATION_CANDIDATE_IDS } from '../readiness/candidateReadiness';

/**
 * Evaluates full CandidateDecisionEvaluationSet and derives TodayDecision (train vs rest).
 *
 * @param candidateIds Array of candidate exercise IDs (e.g. ['squat', 'bench_press', 'deadlift', 'barbell_row', 'overhead_press', 'running'])
 * @param allDimensionResidualStates Current AllDimensionResidualStates container
 * @param allHistoricalSessions All recorded strength workout sessions
 * @param runningSessions Optional canonical running sessions
 * @param evaluationContext Canonical evaluation context SSOT
 */
export function evaluateCandidateDecisionSet(
  candidateIds: readonly string[] = DEFAULT_FOUNDATION_CANDIDATE_IDS,
  allDimensionResidualStates: AllDimensionResidualStates,
  allHistoricalSessions: readonly StressMagnitudeInput[],
  evaluationContext: EvaluationContext,
  runningSessions?: readonly CanonicalRunningSession[]
): CandidateDecisionEvaluationSet {
  const candidateDecisions: CandidateDecisionEvidence[] = [];
  const candidateMap: Record<string, CandidateDecisionEvidence> = {};

  for (const candidateId of candidateIds) {
    // 1. Derive Readiness Evidence (CU4.0 / CU4.0A)
    const readiness = deriveCandidateReadinessEvidence(
      candidateId,
      allDimensionResidualStates,
      evaluationContext
    );

    // 2. Derive Training Need Evidence (CU4.1)
    const need = deriveCandidateTrainingNeedEvidence(
      candidateId,
      allHistoricalSessions,
      evaluationContext
    );

    // 3. Derive Progress Opportunity Evidence (CU4.1)
    const historyInputs = candidateId.toLowerCase().includes('run')
      ? runningSessions ?? []
      : allHistoricalSessions;

    const opportunity = deriveCandidateProgressOpportunityEvidence(
      candidateId,
      historyInputs,
      evaluationContext
    );

    // 4. Synthesize Candidate Decision (CU4.2)
    const decision = deriveCandidateDecisionEvidence(readiness, need, opportunity);
    candidateDecisions.push(decision);
    candidateMap[candidateId] = decision;
  }

  // Sort candidates deterministically into preference order
  const sortedCandidates = sortCandidatesByPreference(candidateDecisions);

  // Group by categorical decision classes
  const preferredCandidates = Object.freeze(
    sortedCandidates.filter((c) => c.decisionClass === 'preferred')
  );
  const viableAlternatives = Object.freeze(
    sortedCandidates.filter((c) => c.decisionClass === 'viable')
  );
  const deferredCandidates = Object.freeze(
    sortedCandidates.filter((c) => c.decisionClass === 'deferred')
  );
  const unsupportedCandidates = Object.freeze(
    sortedCandidates.filter((c) => c.decisionClass === 'unsupported')
  );

  // -------------------------------------------------------------------------
  // Derivation of TodayDecision (Rest vs Train)
  // -------------------------------------------------------------------------
  const auditTrail: string[] = [];
  let todayDecision: TodayDecision;

  // 1. Check if a workout session was already completed on the current evaluation calendar date
  const completedTodaySessions: (StressMagnitudeInput | CanonicalRunningSession)[] = [];
  for (const s of allHistoricalSessions) {
    if (s.date === evaluationContext.evaluationCalendarDate) {
      completedTodaySessions.push(s);
    }
  }
  if (runningSessions) {
    for (const r of runningSessions) {
      if (r.date === evaluationContext.evaluationCalendarDate) {
        completedTodaySessions.push(r);
      }
    }
  }

  const hasCompletedSessionToday = completedTodaySessions.length > 0;

  if (hasCompletedSessionToday) {
    const completedNames = completedTodaySessions
      .map((s) => ('exerciseName' in s ? s.exerciseName : 'Running'))
      .join(', ');

    auditTrail.push(
      `Workout session (${completedNames}) already completed on ${evaluationContext.evaluationCalendarDate}. Deriving REST recommendation under 'completed-session-boundary'.`
    );

    todayDecision = Object.freeze({
      kind: 'rest',
      evaluationContext,
      summaryHeadline: `Completed Session: Rest / Recovery active (${completedNames} completed today).`,
      restCategory: 'completed-session-boundary',
      restRationale: `Workout session (${completedNames}) was already completed on ${evaluationContext.evaluationCalendarDate}. Post-session recovery is active for the remainder of today.`,
      preferredCandidates,
      viableAlternatives,
      deferredCandidates,
      allCandidates: sortedCandidates,
      synthesisAuditTrail: Object.freeze(auditTrail),
    });
  } else if (preferredCandidates.length > 0) {
    const primary = preferredCandidates[0];
    auditTrail.push(
      `Found ${preferredCandidates.length} PREFERRED candidate(s). Primary recommendation selected: ${primary.candidateExerciseName}.`
    );

    todayDecision = Object.freeze({
      kind: 'train',
      evaluationContext,
      summaryHeadline: `Recommended Session: Focus on ${primary.candidateExerciseName} (${primary.decisionReasons[0] || 'Ready & Due'}).`,
      primaryCandidate: primary,
      preferredCandidates,
      viableAlternatives,
      deferredCandidates,
      allCandidates: sortedCandidates,
      synthesisAuditTrail: Object.freeze(auditTrail),
    });
  } else if (viableAlternatives.length > 0) {
    const primary = viableAlternatives[0];
    auditTrail.push(
      `No preferred candidates found. Found ${viableAlternatives.length} VIABLE alternative(s). Primary recommendation selected: ${primary.candidateExerciseName}.`
    );

    todayDecision = Object.freeze({
      kind: 'train',
      evaluationContext,
      summaryHeadline: `Viable Session: Consider ${primary.candidateExerciseName} as a viable alternative.`,
      primaryCandidate: primary,
      preferredCandidates,
      viableAlternatives,
      deferredCandidates,
      allCandidates: sortedCandidates,
      synthesisAuditTrail: Object.freeze(auditTrail),
    });
  } else {
    // All candidates deferred or unsupported with NO session completed today
    const allHardBlocked =
      unsupportedCandidates.length === sortedCandidates.length &&
      sortedCandidates.length > 0 &&
      sortedCandidates.every((c) => c.hardConstraintStatus.isHardBlocked);

    if (allHardBlocked) {
      auditTrail.push(
        `All ${candidateIds.length} candidate exercises are blocked by hard safety constraints. Deriving REST under 'hardblocked-boundary'.`
      );

      todayDecision = Object.freeze({
        kind: 'rest',
        evaluationContext,
        summaryHeadline: 'Recommended Session: Rest / Safety Boundary.',
        restCategory: 'hardblocked-boundary',
        restRationale: 'All candidate exercises are contraindicated by active hard constraints or injury boundaries.',
        preferredCandidates,
        viableAlternatives,
        deferredCandidates,
        allCandidates: sortedCandidates,
        synthesisAuditTrail: Object.freeze(auditTrail),
      });
    } else {
      const deferredReasons = deferredCandidates
        .map((c) => `${c.candidateExerciseName}: ${c.decisionReasons[0] || 'Deferred'}`)
        .join('; ');

      auditTrail.push(
        `All ${candidateIds.length} candidate exercises are deferred or unsupported with no session completed today. Deriving REST under 'no-viable-candidates'.`
      );

      todayDecision = Object.freeze({
        kind: 'rest',
        evaluationContext,
        summaryHeadline: 'Recommended Session: Rest / Recovery Day.',
        restCategory: 'no-viable-candidates',
        restRationale: `All evaluated candidate exercises are currently constrained by acute residual stress or were recently addressed (${deferredReasons}). No viable exercise stimulus is available.`,
        preferredCandidates,
        viableAlternatives,
        deferredCandidates,
        allCandidates: sortedCandidates,
        synthesisAuditTrail: Object.freeze(auditTrail),
      });
    }
  }

  return Object.freeze({
    evaluationContext,
    candidates: sortedCandidates,
    candidateMap: Object.freeze(candidateMap),
    preferredCount: preferredCandidates.length,
    viableCount: viableAlternatives.length,
    deferredCount: deferredCandidates.length,
    unsupportedCount: unsupportedCandidates.length,
    todayDecision,
  });
}
