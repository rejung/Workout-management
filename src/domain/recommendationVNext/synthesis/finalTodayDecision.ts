/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Final TodayDecision Integration Derivation (VNext Recommendation Engine - CU4.4)
 *
 * Synthesizes Frozen Candidate Decision Landscape and Frozen RestDecisionEvidence
 * into the final authoritative session recommendation (FinalTodayDecision).
 *
 * Strict Invariants:
 * 1. Rest is NOT a WorkoutLog: Rest is a top-level session decision ('train' vs 'rest'),
 *    never an exercise entity, fake log, or entry in the workout history.
 * 2. Completed Session Boundary First: An already-completed session on the evaluation calendar date
 *    strictly commands a Rest decision ('completed-session-boundary') to preserve the session boundary.
 * 3. Pure Rule-Based Hierarchy: Arbitration follows deterministic, explicit priority tiers.
 *    No numeric scoring, weighted sums, or hidden arithmetic multipliers.
 * 4. Viable-Only Discipline: No arbitrary auto-Train or auto-Rest for viable-only candidate landscapes.
 *    Arbitrates using training need urgency, progression support, and systemic demand facts.
 * 5. True Tie Preservation: If top preferred candidates are strictly equal across all axes,
 *    tiedPrimaryCandidates is returned without semantic ID prioritization.
 * 6. Zero Biological Guessing: No CNS fatigue, recovery %, muscle damage, or unrecorded sleep/HRV.
 * 7. Pure Immutability: Deeply frozen return objects.
 */

import { EvaluationContext } from '../types/residualStressTrace.types';
import {
  CandidateDecisionEvaluationSet,
  CandidateDecisionEvidence,
  RestDecisionCategory,
} from '../types/candidateDecision.types';
import { RestDecisionEvidence } from '../types/restDecision.types';
import {
  FinalDecisionExplainability,
  FinalDecisionKind,
  FinalDecisionUncertaintyContext,
  FinalTodayDecision,
} from '../types/finalTodayDecision.types';
import { compareCandidatePairwise } from './candidateSynthesis';

/**
 * Derives FinalTodayDecision by synthesizing candidate decision landscape and rest evidence.
 *
 * @param candidateDecisionSet Complete evaluated candidate decision set
 * @param restEvidence Session-level rest decision evidence (optional, defaults to set's evidence)
 * @param evaluationContext Canonical evaluation context (optional, defaults to set's context)
 */
export function deriveFinalTodayDecision(
  candidateDecisionSet: CandidateDecisionEvaluationSet,
  restEvidence?: RestDecisionEvidence,
  evaluationContext?: EvaluationContext
): FinalTodayDecision {
  const context = evaluationContext ?? candidateDecisionSet.evaluationContext;
  const rest = restEvidence ?? candidateDecisionSet.restDecisionEvidence;
  const auditTrail: string[] = [];

  const preferredCandidates = candidateDecisionSet.candidates.filter(
    (c) => c.decisionClass === 'preferred'
  );
  const viableAlternatives = candidateDecisionSet.candidates.filter(
    (c) => c.decisionClass === 'viable'
  );
  const deferredCandidates = candidateDecisionSet.candidates.filter(
    (c) => c.decisionClass === 'deferred'
  );
  const unsupportedCandidates = candidateDecisionSet.candidates.filter(
    (c) => c.decisionClass === 'unsupported'
  );

  const isSameDayCompleted =
    rest.recentTrainingContext.consecutiveTrainingDayContext.isSameDaySessionCompleted;

  let kind: FinalDecisionKind;
  let primaryCandidate: CandidateDecisionEvidence | undefined;
  let tiedPrimaryCandidates: readonly CandidateDecisionEvidence[] | undefined;
  let alternativeCandidates: readonly CandidateDecisionEvidence[] = [];
  let restCategory: RestDecisionCategory | undefined;
  let decisionRationale: string;
  let headline: string;
  let whyTrainOrRest: string;
  let primaryAttribution: string | undefined;
  let restCounterEvidence: string | undefined;
  let isTiePreserved = false;

  // -------------------------------------------------------------------------
  // Rule 1: Completed Session Boundary (Highest Priority)
  // -------------------------------------------------------------------------
  if (isSameDayCompleted) {
    kind = 'rest';
    restCategory = 'completed-session-boundary';
    auditTrail.push(
      `Rule 1 (Completed Session Boundary): Workout session was already completed today on ${context.evaluationCalendarDate}. Enforcing Rest.`
    );

    const completedBreakdown = rest.recentTrainingContext.recentTrainingDensity.sessionsByCalendarDay.find(
      (d) => d.calendarDate === context.evaluationCalendarDate
    );
    const completedNames = completedBreakdown?.exerciseOrActivityNames.join(', ') || 'Workout Session';

    headline = `Completed Session: Rest / Recovery active (${completedNames} completed today).`;
    whyTrainOrRest = `A workout session (${completedNames}) was already performed and completed on ${context.evaluationCalendarDate} prior to the evaluation time. Daily session boundary enforces post-session recovery for the remainder of today.`;
    decisionRationale = `Workout session (${completedNames}) was already completed on ${context.evaluationCalendarDate}. Post-session recovery is active for the remainder of today.`;
    restCounterEvidence = `Candidate exercise alternatives (${candidateDecisionSet.candidates.map((c) => c.candidateExerciseName).join(', ')}) are preserved for subsequent session planning but not executed today.`;
    alternativeCandidates = Object.freeze([...preferredCandidates, ...viableAlternatives]);
  }
  // -------------------------------------------------------------------------
  // Rule 2: Hard-Blocked / No-Viable-Candidates Boundary
  // -------------------------------------------------------------------------
  else if (
    unsupportedCandidates.length === candidateDecisionSet.candidates.length &&
    candidateDecisionSet.candidates.length > 0 &&
    candidateDecisionSet.candidates.every((c) => c.hardConstraintStatus.isHardBlocked)
  ) {
    kind = 'rest';
    restCategory = 'hardblocked-boundary';
    auditTrail.push(
      'Rule 2A (Hardblocked Boundary): All candidate exercises are contraindicated by active hard constraints or injury boundaries.'
    );

    headline = 'Recommended Session: Rest / Safety Boundary.';
    whyTrainOrRest = 'All candidate exercises are contraindicated by active hard constraints or injury boundaries.';
    decisionRationale = 'All candidate exercises are contraindicated by active hard constraints or injury boundaries.';
    alternativeCandidates = Object.freeze([]);
  } else if (
    preferredCandidates.length === 0 &&
    viableAlternatives.length === 0
  ) {
    kind = 'rest';
    restCategory = 'no-viable-candidates';
    auditTrail.push(
      'Rule 2B (No Viable Candidates): All candidate exercises are deferred or unsupported with zero sessions completed today.'
    );

    const deferredDetails = deferredCandidates
      .map((c) => `${c.candidateExerciseName}: ${c.decisionReasons[0] || 'Deferred'}`)
      .join('; ');

    headline = 'Recommended Session: Rest / Recovery Day.';
    whyTrainOrRest = `All evaluated candidate exercises are currently constrained by acute residual stress or were recently addressed (${deferredDetails}). No viable stimulus is available today.`;
    decisionRationale = `All evaluated candidate exercises are currently constrained by acute residual stress or were recently addressed (${deferredDetails}). No viable exercise stimulus is available.`;
    alternativeCandidates = Object.freeze([]);
  }
  // -------------------------------------------------------------------------
  // Rule 3: rest-not-indicated
  // -------------------------------------------------------------------------
  else if (rest.restSupportClass === 'rest-not-indicated') {
    kind = 'train';
    auditTrail.push(
      'Rule 3 (Rest Not Indicated): Low recent training density and minimal residual stress support training.'
    );

    const candidatePool = preferredCandidates.length > 0 ? preferredCandidates : viableAlternatives;
    const selection = arbitrateCandidatePool(candidatePool);

    if (selection.isTie) {
      isTiePreserved = true;
      tiedPrimaryCandidates = selection.tiedCandidates;
      alternativeCandidates = Object.freeze(
        candidateDecisionSet.candidates.filter(
          (c) => !selection.tiedCandidates.some((t) => t.candidateExerciseId === c.candidateExerciseId)
        )
      );
      const names = selection.tiedCandidates.map((c) => c.candidateExerciseName).join(' and ');
      headline = `Recommended Session: Train (Tie between ${names}).`;
      whyTrainOrRest = `Rest is not indicated and multiple candidates (${names}) share equivalent priority across readiness, training need, and progression opportunity.`;
      decisionRationale = `True tie between ${names} across readiness, training need, and progress opportunity axes. Training is indicated with equal recommendation standing.`;
    } else {
      primaryCandidate = selection.winner;
      alternativeCandidates = Object.freeze(
        candidateDecisionSet.candidates.filter(
          (c) => c.candidateExerciseId !== primaryCandidate!.candidateExerciseId
        )
      );
      headline = `Recommended Session: Focus on ${primaryCandidate.candidateExerciseName} (${primaryCandidate.decisionReasons[0] || 'Ready & Due'}).`;
      whyTrainOrRest = `Rest is not indicated and ${primaryCandidate.candidateExerciseName} is the leading recommendation based on clear readiness and active training need.`;
      decisionRationale = `Train ${primaryCandidate.candidateExerciseName}. Rest is not indicated and ${primaryCandidate.candidateExerciseName} is ${primaryCandidate.decisionClass} (${primaryCandidate.decisionReasons.join(' ')}).`;
      primaryAttribution = `Readiness: ${primaryCandidate.comparisonFacts.readinessClass}, Need: ${primaryCandidate.comparisonFacts.needClass}, Opportunity: ${primaryCandidate.comparisonFacts.opportunityClass}.`;
    }

    restCounterEvidence = rest.counterReasons.join('; ') || 'Recent training density is low and recovery capacity is unburdened.';
  }
  // -------------------------------------------------------------------------
  // Rule 4: rest-supported
  // -------------------------------------------------------------------------
  else if (rest.restSupportClass === 'rest-supported') {
    // Check if there is an unconstrained, clear, due candidate without active residual overlap (e.g. GS-E upper body clear while lower body running residual)
    const clearDuePreferred = preferredCandidates.find(
      (c) =>
        c.comparisonFacts.readinessClass === 'clear' &&
        c.comparisonFacts.needClass === 'due' &&
        c.readinessEvidence.definiteResidualDimensions.length === 0
    );

    if (clearDuePreferred && rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays < 3) {
      kind = 'train';
      primaryCandidate = clearDuePreferred;
      alternativeCandidates = Object.freeze(
        candidateDecisionSet.candidates.filter(
          (c) => c.candidateExerciseId !== primaryCandidate!.candidateExerciseId
        )
      );
      auditTrail.push(
        `Rule 4A (Unconstrained Clear-Due Override under Rest-Supported): ${primaryCandidate.candidateExerciseName} has completely clear readiness and due need despite modality residual on other dimensions.`
      );

      headline = `Recommended Session: Focus on ${primaryCandidate.candidateExerciseName} (Clear Upper Body stimulus).`;
      whyTrainOrRest = `Although residual stress exists on lower body or other dimensions, ${primaryCandidate.candidateExerciseName} is completely clear on all required stress dimensions and has an unaddressed training need.`;
      decisionRationale = `Train ${primaryCandidate.candidateExerciseName}. Although rest is supported for affected movement dimensions, ${primaryCandidate.candidateExerciseName} has clear readiness and due training need without structural conflict.`;
      primaryAttribution = `Readiness: ${primaryCandidate.comparisonFacts.readinessClass}, Need: ${primaryCandidate.comparisonFacts.needClass}.`;
      restCounterEvidence = rest.supportingReasons.join('; ');
    } else {
      kind = 'rest';
      restCategory = 'session-level-rest-supported';
      auditTrail.push(
        'Rule 4B (Session-Level Rest Supported): High recent training density / broad systemic residual with no unconstrained due candidate.'
      );

      headline = 'Recommended Session: Systemic Recovery / Rest Day.';
      whyTrainOrRest = `Recent training density (${rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays} consecutive days, ${rest.recentTrainingContext.recentSessionCount} sessions) and broad residual stress support a recovery day.`;
      decisionRationale = `Rest is supported due to elevated recent training density (${rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays} consecutive training days) and broad residual stress across movement dimensions with no unaddressed due candidate.`;
      alternativeCandidates = Object.freeze([...preferredCandidates, ...viableAlternatives]);
      restCounterEvidence = rest.counterReasons.join('; ') || 'No due candidate overrides systemic recovery need.';
    }
  }
  // -------------------------------------------------------------------------
  // Rule 5: rest-reasonable with Preferred Candidates
  // -------------------------------------------------------------------------
  else if (preferredCandidates.length > 0) {
    const systemicDemand = rest.systemicTrainingDemandContext;
    const hasElevatedAxial =
      systemicDemand.recentAxialExposure.hasRecentAxialLoading &&
      systemicDemand.recentAxialExposure.axialSessionCount >= 2;
    const hasElevatedContext = systemicDemand.evidenceState === 'elevated-context';

    const hasDueOrProgressionPreferred = preferredCandidates.some(
      (c) =>
        c.comparisonFacts.needClass === 'due' ||
        c.comparisonFacts.opportunityClass === 'progression-supported'
    );

    if ((hasElevatedAxial || hasElevatedContext) && !hasDueOrProgressionPreferred) {
      kind = 'rest';
      restCategory = 'session-level-rest-supported';
      auditTrail.push(
        'Rule 5B (Repeated Axial / Elevated Systemic Demand with Non-Due Preferred Candidates): Repeated heavy axial compound sessions favor recovery when remaining preferred candidates are merely available.'
      );

      const candidateNames = preferredCandidates.map((c) => c.candidateExerciseName).join(', ');
      headline = 'Recommended Session: Active Recovery / Rest Day (Elevated Axial Demand).';
      whyTrainOrRest = `Recent training includes repeated heavy axial compound sessions (${systemicDemand.recentAxialExposure.axialExercises.join(', ')}). Available candidate(s) (${candidateNames}) are in normal rotation without urgent due cadence, making rest well justified.`;
      decisionRationale = `Rest is recommended. Recent training includes repeated heavy axial/compound sessions (${systemicDemand.recentAxialExposure.axialExercises.join(', ')}), and remaining preferred candidates (${candidateNames}) have normal available rotation without urgent due cadence.`;
      alternativeCandidates = Object.freeze([...preferredCandidates, ...viableAlternatives]);
      restCounterEvidence = `Preferred candidate(s) (${candidateNames}) are clear if user electively chooses to train.`;
    } else {
      kind = 'train';
      auditTrail.push(
        'Rule 5A (Rest Reasonable with Preferred Candidates): Preferred candidate addresses active need and maintains sound readiness.'
      );

      const selection = arbitrateCandidatePool(preferredCandidates);
      if (selection.isTie) {
        isTiePreserved = true;
        tiedPrimaryCandidates = selection.tiedCandidates;
        alternativeCandidates = Object.freeze(
          candidateDecisionSet.candidates.filter(
            (c) => !selection.tiedCandidates.some((t) => t.candidateExerciseId === c.candidateExerciseId)
          )
        );
        const names = selection.tiedCandidates.map((c) => c.candidateExerciseName).join(' and ');
        headline = `Recommended Session: Train (Tie between ${names}).`;
        whyTrainOrRest = `Rest is reasonable, but multiple preferred candidates (${names}) present strong training opportunities.`;
        decisionRationale = `True tie between ${names} under rest-reasonable context. Training is indicated with equal recommendation standing.`;
      } else {
        primaryCandidate = selection.winner;
        alternativeCandidates = Object.freeze(
          candidateDecisionSet.candidates.filter(
            (c) => c.candidateExerciseId !== primaryCandidate!.candidateExerciseId
          )
        );
        headline = `Recommended Session: Focus on ${primaryCandidate.candidateExerciseName} (${primaryCandidate.decisionReasons[0] || 'Preferred'}).`;
        whyTrainOrRest = `Rest is reasonable due to recent training facts, but ${primaryCandidate.candidateExerciseName} represents a sound, preferred training stimulus.`;
        decisionRationale = `Train ${primaryCandidate.candidateExerciseName}. Rest is reasonable, but ${primaryCandidate.candidateExerciseName} is preferred (${primaryCandidate.decisionReasons.join(' ')}).`;
        primaryAttribution = `Readiness: ${primaryCandidate.comparisonFacts.readinessClass}, Need: ${primaryCandidate.comparisonFacts.needClass}, Opportunity: ${primaryCandidate.comparisonFacts.opportunityClass}.`;
      }
      restCounterEvidence = rest.supportingReasons.join('; ');
    }
  }
  // -------------------------------------------------------------------------
  // Rule 6: rest-reasonable + Viable-Only Landscape (Key Arbitration Point)
  // -------------------------------------------------------------------------
  else {
    auditTrail.push(
      'Rule 6 (Rest Reasonable + Viable-Only Arbitration): Arbitrating between viable candidates and rest context based on training need and systemic demand.'
    );

    const systemicDemand = rest.systemicTrainingDemandContext;
    const hasElevatedAxial =
      systemicDemand.recentAxialExposure.hasRecentAxialLoading &&
      systemicDemand.recentAxialExposure.axialSessionCount >= 2;
    const hasElevatedContext = systemicDemand.evidenceState === 'elevated-context';

    const dueViableCandidate = viableAlternatives.find(
      (c) =>
        c.comparisonFacts.needClass === 'due' ||
        c.comparisonFacts.opportunityClass === 'progression-supported'
    );

    // Sub-case 6A: Viable candidate has due need or progression opportunity under manageable caution & non-extreme density (GS-C)
    if (
      dueViableCandidate &&
      dueViableCandidate.comparisonFacts.readinessClass !== 'constrained' &&
      rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays < 3
    ) {
      kind = 'train';
      primaryCandidate = dueViableCandidate;
      alternativeCandidates = Object.freeze(
        candidateDecisionSet.candidates.filter(
          (c) => c.candidateExerciseId !== primaryCandidate!.candidateExerciseId
        )
      );
      auditTrail.push(
        `Rule 6A (Due Need / Progression Viable): ${primaryCandidate.candidateExerciseName} has active due need / progression support justifying training despite rest-reasonable context.`
      );

      headline = `Recommended Session: ${primaryCandidate.candidateExerciseName} (Viable with Due Cadence).`;
      whyTrainOrRest = `Although rest is reasonable and caution exists, ${primaryCandidate.candidateExerciseName} has an unaddressed training need (${primaryCandidate.trainingNeedEvidence.recency.calendarDaysSinceLastPerformed ?? 'N/A'}d unaddressed) justifying training under manageable caution.`;
      decisionRationale = `Train ${primaryCandidate.candidateExerciseName}. Rest is reasonable, but ${primaryCandidate.candidateExerciseName} is viable and due for training (${primaryCandidate.decisionReasons.join(' ')}).`;
      primaryAttribution = `Readiness: ${primaryCandidate.comparisonFacts.readinessClass}, Need: ${primaryCandidate.comparisonFacts.needClass}, Opportunity: ${primaryCandidate.comparisonFacts.opportunityClass}.`;
      restCounterEvidence = rest.supportingReasons.join('; ');
    }
    // Sub-case 6B: Repeated heavy axial / elevated compound demand with only 'available' / non-due need (GS-F)
    else if (
      (hasElevatedAxial || hasElevatedContext) &&
      !viableAlternatives.some((c) => c.comparisonFacts.needClass === 'due')
    ) {
      kind = 'rest';
      restCategory = 'session-level-rest-supported';
      auditTrail.push(
        'Rule 6B (Repeated Axial / Elevated Systemic Demand with Non-Due Cadence): Repeated axial loading across recent sessions favors recovery when remaining candidates are merely available.'
      );

      const candidateNames = viableAlternatives.map((c) => c.candidateExerciseName).join(', ');
      headline = 'Recommended Session: Active Recovery / Rest Day (Elevated Axial Demand).';
      whyTrainOrRest = `Recent training includes repeated heavy axial compound sessions (${systemicDemand.recentAxialExposure.axialExercises.join(', ')}). Available candidate(s) (${candidateNames}) are in normal rotation without urgent due cadence, making rest well justified.`;
      decisionRationale = `Rest is recommended. Recent training includes repeated heavy axial/compound sessions (${systemicDemand.recentAxialExposure.axialExercises.join(', ')}), and remaining viable candidates (${candidateNames}) have normal available rotation without urgent due cadence.`;
      alternativeCandidates = Object.freeze([...viableAlternatives]);
      restCounterEvidence = `Viable candidate(s) (${candidateNames}) are available if user electively chooses to train.`;
    }
    // Sub-case 6C: General Viable Fallback based on consecutive days
    else if (rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays >= 3) {
      kind = 'rest';
      restCategory = 'session-level-rest-supported';
      auditTrail.push(
        'Rule 6C (Consecutive Days Density): 3 or more consecutive training days with no due candidate supports rest.'
      );

      headline = 'Recommended Session: Recovery Day.';
      whyTrainOrRest = `Consecutive training days (${rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays} days) support recovery when no candidates are overdue.`;
      decisionRationale = `Rest is supported due to ${rest.recentTrainingContext.recentTrainingDensity.consecutiveTrainingDays} consecutive training days and absence of overdue candidate need.`;
      alternativeCandidates = Object.freeze([...viableAlternatives]);
    } else {
      kind = 'train';
      const selection = arbitrateCandidatePool(viableAlternatives);
      if (selection.isTie) {
        isTiePreserved = true;
        tiedPrimaryCandidates = selection.tiedCandidates;
        alternativeCandidates = Object.freeze(
          candidateDecisionSet.candidates.filter(
            (c) => !selection.tiedCandidates.some((t) => t.candidateExerciseId === c.candidateExerciseId)
          )
        );
        const names = selection.tiedCandidates.map((c) => c.candidateExerciseName).join(' and ');
        headline = `Recommended Session: Train (Viable Tie between ${names}).`;
        whyTrainOrRest = `Rest is reasonable and viable candidates (${names}) present equal viability without distinct priority.`;
        decisionRationale = `True tie between viable candidates ${names}. Training is feasible with equal recommendation standing.`;
      } else {
        primaryCandidate = selection.winner;
        alternativeCandidates = Object.freeze(
          candidateDecisionSet.candidates.filter(
            (c) => c.candidateExerciseId !== primaryCandidate!.candidateExerciseId
          )
        );
        headline = `Recommended Session: Consider ${primaryCandidate.candidateExerciseName} (Viable Option).`;
        whyTrainOrRest = `Rest is reasonable, but ${primaryCandidate.candidateExerciseName} is a sound viable training option.`;
        decisionRationale = `Train ${primaryCandidate.candidateExerciseName} as a viable alternative under rest-reasonable context.`;
        primaryAttribution = `Readiness: ${primaryCandidate.comparisonFacts.readinessClass}, Need: ${primaryCandidate.comparisonFacts.needClass}.`;
      }
      restCounterEvidence = rest.supportingReasons.join('; ');
    }
  }

  // Build Uncertainty Context
  const factualNotes: string[] = [];
  if (rest.uncertaintyContext.hasSparseHistory) {
    factualNotes.push('Sparse training history observed; baseline exploratory criteria applied without false rest.');
  }
  if (rest.uncertaintyContext.hasUncertainSameDaySessions) {
    factualNotes.push(`${rest.uncertaintyContext.uncertainSessionCount} same-day session(s) have uncertain temporal eligibility due to missing start timestamps.`);
  }
  if (isTiePreserved) {
    factualNotes.push('True tie between top candidates was preserved deterministically without semantic ID bias.');
  }

  const uncertaintyContext: FinalDecisionUncertaintyContext = Object.freeze({
    hasUncertainSameDaySessions: rest.uncertaintyContext.hasUncertainSameDaySessions,
    uncertainSessionCount: rest.uncertaintyContext.uncertainSessionCount,
    hasSparseHistory: rest.uncertaintyContext.hasSparseHistory,
    isTiePreserved,
    factualNotes: Object.freeze(factualNotes),
  });

  const explainability: FinalDecisionExplainability = Object.freeze({
    headline,
    whyTrainOrRest,
    primaryAttribution,
    restCounterEvidence,
    candidateLandscapeSummary: `Preferred: ${preferredCandidates.length}, Viable: ${viableAlternatives.length}, Deferred: ${deferredCandidates.length}, Unsupported: ${unsupportedCandidates.length}`,
    systemicDemandSummary: rest.systemicTrainingDemandContext.factualDemandFactors.join('; ') || undefined,
    decisionReasons: Object.freeze([
      whyTrainOrRest,
      ...(primaryCandidate ? primaryCandidate.decisionReasons : []),
    ]),
  });

  return Object.freeze({
    kind,
    evaluationContext: context,
    primaryCandidate,
    tiedPrimaryCandidates,
    alternativeCandidates,
    restCategory,
    restEvidence: rest,
    candidateDecisionSet,
    decisionRationale,
    explainability,
    uncertaintyContext,
    arbitrationAuditTrail: Object.freeze(auditTrail),
  });
}

/**
 * Arbitrates among a pool of candidate exercises using pure pairwise comparisons.
 * Returns either a single winner or a deterministic tie set.
 */
function arbitrateCandidatePool(
  candidates: readonly CandidateDecisionEvidence[]
): {
  winner?: CandidateDecisionEvidence;
  tiedCandidates: readonly CandidateDecisionEvidence[];
  isTie: boolean;
} {
  if (candidates.length === 0) {
    return { tiedCandidates: [], isTie: false };
  }
  if (candidates.length === 1) {
    return { winner: candidates[0], tiedCandidates: [candidates[0]], isTie: false };
  }

  // Compare first candidate with second
  const topCandidate = candidates[0];
  const tiedGroup: CandidateDecisionEvidence[] = [topCandidate];

  for (let i = 1; i < candidates.length; i++) {
    const comparison = compareCandidatePairwise(topCandidate, candidates[i]);
    if (comparison.isTie) {
      tiedGroup.push(candidates[i]);
    } else {
      // Since candidates are already sorted by preference, if topCandidate beats candidate[i],
      // all remaining are strictly lower rank
      break;
    }
  }

  if (tiedGroup.length > 1) {
    return {
      tiedCandidates: Object.freeze(tiedGroup),
      isTie: true,
    };
  }

  return {
    winner: topCandidate,
    tiedCandidates: Object.freeze([topCandidate]),
    isTie: false,
  };
}
