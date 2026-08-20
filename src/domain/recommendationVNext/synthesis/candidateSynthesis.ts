/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Synthesis & Pairwise Reasoner (VNext Recommendation Engine - CU4.2)
 *
 * Implements pure, deterministic synthesis of CandidateReadinessEvidence,
 * CandidateTrainingNeedEvidence, and CandidateProgressOpportunityEvidence into
 * structured decision evidence and pairwise arbitration without numeric scoring,
 * normalized multipliers, or arithmetic collapse (Readiness + Need != 90).
 *
 * Strict Invariants:
 * 1. Independent Triad Preservation: All three source evidence structures are preserved
 *    losslessly in the final CandidateDecisionEvidence.
 * 2. Non-Dominant Readiness: A 'caution' candidate with a strong 'due' need and progression
 *    support is not mechanically suppressed by a 'clear' candidate whose need was already met.
 * 3. Categorical Taxonomy: 'preferred' | 'viable' | 'deferred' | 'unsupported'.
 * 4. Factual Pairwise Arbitration: Pairwise comparisons produce a structured breakdown
 *    identifying the exact deciding axis and rule without arbitrary weights.
 * 5. True Tie Preservation: True ties are recognized explicitly; no semantic ID prioritization.
 * 6. Pure Immutability: Deeply frozen return objects.
 */

import { CandidateReadinessEvidence } from '../types/candidateReadiness.types';
import { CandidateTrainingNeedEvidence } from '../types/candidateTrainingNeed.types';
import { CandidateProgressOpportunityEvidence } from '../types/candidateProgressOpportunity.types';
import {
  AxisComparisonDetail,
  CandidateComparisonFacts,
  CandidateDecisionClass,
  CandidateDecisionEvidence,
  CandidateDecisionExplainabilitySummary,
  DecisionComparisonAxis,
  PairwiseComparisonResult,
} from '../types/candidateDecision.types';

// =========================================================================
// Helper Rank Tables for Categorical Comparisons
// =========================================================================

const NEED_RANK: Record<string, number> = {
  due: 4,
  available: 3,
  'recently-addressed': 2,
  'insufficient-history': 1,
  unmapped: 0,
};

const OPPORTUNITY_RANK: Record<string, number> = {
  'progression-supported': 4,
  'exploratory-supported': 3,
  'maintenance-supported': 2,
  'insufficient-evidence': 1,
  unmapped: 0,
};

const READINESS_RANK: Record<string, number> = {
  clear: 3,
  caution: 2,
  constrained: 1,
  unmapped: 0,
};

// =========================================================================
// 1. Single Candidate Decision Derivation
// =========================================================================

/**
 * Derives CandidateDecisionEvidence by synthesizing readiness, need, and opportunity evidence.
 */
export function deriveCandidateDecisionEvidence(
  readiness: CandidateReadinessEvidence,
  need: CandidateTrainingNeedEvidence,
  opportunity: CandidateProgressOpportunityEvidence
): CandidateDecisionEvidence {
  const candidateExerciseId = readiness.candidateExerciseId;
  const candidateExerciseName = readiness.candidateExerciseName;

  // 1. Hard constraint or unmapped check
  const isHardBlocked = readiness.hardConstraintBoundary.isHardBlocked;
  const isUnmapped =
    readiness.overallReadinessClass === 'unmapped' ||
    need.needClass === 'unmapped' ||
    opportunity.opportunityClass === 'unmapped';

  if (isHardBlocked || isUnmapped) {
    const comparisonFacts: CandidateComparisonFacts = Object.freeze({
      readinessClass: readiness.overallReadinessClass,
      needClass: need.needClass,
      opportunityClass: opportunity.opportunityClass,
      calendarDaysSinceLastPerformed: need.recency.calendarDaysSinceLastPerformed,
      hasAcuteStressConflict: readiness.overallReadinessClass === 'constrained',
      hasStructuralOverlap: readiness.hasStructuralOverlap,
      isProgressionSupported: opportunity.opportunityClass === 'progression-supported',
      isIntensityShift: opportunity.strengthContext?.isIntensityShift ?? false,
    });

    const explainabilitySummary: CandidateDecisionExplainabilitySummary = Object.freeze({
      headline: `${candidateExerciseName} is unsupported for recommendation.`,
      synthesisRationale: isHardBlocked
        ? `Hard constraint boundary triggered: ${readiness.hardConstraintBoundary.infeasibilityReason ?? 'Execution infeasible'}.`
        : `Exercise profile is unmapped in the stress model vocabulary.`,
      readinessSummary: readiness.explainabilitySummary.headline,
      needSummary: need.explainabilitySummary.headline,
      opportunitySummary: opportunity.explainabilitySummary.headline,
      keyFactualFactors: Object.freeze([
        isHardBlocked ? 'Hard constraint blocked' : 'Unmapped exercise profile',
      ]),
    });

    return Object.freeze({
      kind: 'candidate-decision-evidence',
      candidateExerciseId,
      candidateExerciseName,
      readinessEvidence: readiness,
      trainingNeedEvidence: need,
      progressOpportunityEvidence: opportunity,
      decisionClass: 'unsupported',
      decisionReasons: Object.freeze([
        isHardBlocked ? 'Hard constraint active' : 'Unmapped in stress vocabulary',
      ]),
      comparisonFacts,
      hardConstraintStatus: readiness.hardConstraintBoundary,
      explainabilitySummary,
    });
  }

  // 2. Evaluate suitability dimensions
  const reasons: string[] = [];
  const keyFactors: string[] = [];

  const rClass = readiness.overallReadinessClass;
  const nClass = need.needClass;
  const oClass = opportunity.opportunityClass;

  let decisionClass: CandidateDecisionClass;

  // Case A: Constrained Readiness (Acute active residual stress on required dimension)
  if (rClass === 'constrained') {
    decisionClass = 'deferred';
    reasons.push(
      `Direct immediate acute residual stress (<24h) active on required dimensions [${readiness.definiteImmediateDimensions.join(', ')}].`
    );
    keyFactors.push('Acute residual stress conflict');
  }
  // Case B: Recently Addressed Need (Candidate was performed within 1 day or high recent saturation)
  else if (nClass === 'recently-addressed') {
    decisionClass = 'deferred';
    reasons.push(
      `Candidate was recently addressed (${need.recency.calendarDaysSinceLastPerformed ?? 0}d ago) with satisfied recent frequency.`
    );
    keyFactors.push('Recently addressed training cadence');
  }
  // Case C: Clear Readiness with Due Need or Progression Support
  else if (rClass === 'clear' && (nClass === 'due' || oClass === 'progression-supported')) {
    decisionClass = 'preferred';
    reasons.push('Readiness is completely clear on all required stress dimensions.');
    if (nClass === 'due') {
      reasons.push(
        `Training cadence is due (${need.recency.calendarDaysSinceLastPerformed}d since last session; dimensions unaddressed).`
      );
      keyFactors.push('Due training cadence');
    }
    if (oClass === 'progression-supported') {
      reasons.push('Historical performance records support progression / stimulus advancement.');
      keyFactors.push('Progression opportunity supported');
    }
  }
  // Case D: Caution Readiness with Strong Due Need and Progression Support (Non-dominant readiness rule)
  else if (rClass === 'caution' && nClass === 'due' && oClass === 'progression-supported') {
    decisionClass = 'preferred';
    reasons.push(
      'Readiness has manageable residual/overlap caution, but strong training need (due) and progression support make this a high-priority stimulus.'
    );
    keyFactors.push('Manageable caution + due cadence + progression opportunity');
  }
  // Case E: Clear Readiness in Normal Available Rotation
  else if (rClass === 'clear' && nClass === 'available') {
    decisionClass = 'preferred';
    reasons.push('Readiness is clear and candidate is available in regular training rotation.');
    keyFactors.push('Clear readiness + available cadence');
  }
  // Case F: Caution Readiness in Available Rotation
  else if (rClass === 'caution' && (nClass === 'available' || nClass === 'due')) {
    decisionClass = 'viable';
    reasons.push(
      `Manageable residual stress (24h-72h) or mild structural overlap exists on [${readiness.definiteResidualDimensions.join(', ')}], but exercise is viable.`
    );
    keyFactors.push('Manageable residual caution');
  }
  // Case G: Insufficient History / Exploratory Baseline
  else if (nClass === 'insufficient-history' || oClass === 'exploratory-supported') {
    decisionClass = 'viable';
    reasons.push(
      rClass === 'caution'
        ? 'Initial exploratory baseline candidate with manageable residual/overlap caution.'
        : 'Initial exploratory baseline candidate without established multi-session cadence.'
    );
    keyFactors.push('Exploratory baseline');
  }
  // Case H: Fallback viable
  else {
    decisionClass = 'viable';
    reasons.push('Candidate satisfies general training feasibility criteria.');
    keyFactors.push('Standard viability');
  }

  const comparisonFacts: CandidateComparisonFacts = Object.freeze({
    readinessClass: rClass,
    needClass: nClass,
    opportunityClass: oClass,
    calendarDaysSinceLastPerformed: need.recency.calendarDaysSinceLastPerformed,
    hasAcuteStressConflict: rClass === 'constrained',
    hasStructuralOverlap: readiness.hasStructuralOverlap,
    isProgressionSupported: oClass === 'progression-supported',
    isIntensityShift: opportunity.strengthContext?.isIntensityShift ?? false,
  });

  const explainabilitySummary: CandidateDecisionExplainabilitySummary = Object.freeze({
    headline: `${candidateExerciseName}: classified as ${decisionClass.toUpperCase()}.`,
    synthesisRationale: reasons.join(' '),
    readinessSummary: readiness.explainabilitySummary.headline,
    needSummary: need.explainabilitySummary.headline,
    opportunitySummary: opportunity.explainabilitySummary.headline,
    keyFactualFactors: Object.freeze(keyFactors),
  });

  return Object.freeze({
    kind: 'candidate-decision-evidence',
    candidateExerciseId,
    candidateExerciseName,
    readinessEvidence: readiness,
    trainingNeedEvidence: need,
    progressOpportunityEvidence: opportunity,
    decisionClass,
    decisionReasons: Object.freeze(reasons),
    comparisonFacts,
    hardConstraintStatus: readiness.hardConstraintBoundary,
    explainabilitySummary,
  });
}

// =========================================================================
// 2. Deterministic Pairwise Comparison Engine
// =========================================================================

/**
 * Performs a deterministic pairwise comparison between two CandidateDecisionEvidence instances.
 * Identifies the exact deciding axis and rule without numeric weighting.
 */
export function compareCandidatePairwise(
  candidateA: CandidateDecisionEvidence,
  candidateB: CandidateDecisionEvidence
): PairwiseComparisonResult {
  const aId = candidateA.candidateExerciseId;
  const bId = candidateB.candidateExerciseId;
  const aName = candidateA.candidateExerciseName;
  const bName = candidateB.candidateExerciseName;

  // Breakdown across individual axes
  const rRankA = READINESS_RANK[candidateA.comparisonFacts.readinessClass] ?? 0;
  const rRankB = READINESS_RANK[candidateB.comparisonFacts.readinessClass] ?? 0;
  const readinessDetail: AxisComparisonDetail = Object.freeze({
    axis: 'readiness',
    candidateAState: candidateA.comparisonFacts.readinessClass,
    candidateBState: candidateB.comparisonFacts.readinessClass,
    favoredCandidate: rRankA > rRankB ? 'candidateA' : rRankA < rRankB ? 'candidateB' : 'tied',
    contrastDescription: `${aName} is ${candidateA.comparisonFacts.readinessClass} vs ${bName} is ${candidateB.comparisonFacts.readinessClass}.`,
  });

  const nRankA = NEED_RANK[candidateA.comparisonFacts.needClass] ?? 0;
  const nRankB = NEED_RANK[candidateB.comparisonFacts.needClass] ?? 0;
  const needDetail: AxisComparisonDetail = Object.freeze({
    axis: 'training-need',
    candidateAState: candidateA.comparisonFacts.needClass,
    candidateBState: candidateB.comparisonFacts.needClass,
    favoredCandidate: nRankA > nRankB ? 'candidateA' : nRankA < nRankB ? 'candidateB' : 'tied',
    contrastDescription: `${aName} need is ${candidateA.comparisonFacts.needClass} vs ${bName} need is ${candidateB.comparisonFacts.needClass}.`,
  });

  const oRankA = OPPORTUNITY_RANK[candidateA.comparisonFacts.opportunityClass] ?? 0;
  const oRankB = OPPORTUNITY_RANK[candidateB.comparisonFacts.opportunityClass] ?? 0;
  const oppDetail: AxisComparisonDetail = Object.freeze({
    axis: 'progress-opportunity',
    candidateAState: candidateA.comparisonFacts.opportunityClass,
    candidateBState: candidateB.comparisonFacts.opportunityClass,
    favoredCandidate: oRankA > oRankB ? 'candidateA' : oRankA < oRankB ? 'candidateB' : 'tied',
    contrastDescription: `${aName} opportunity is ${candidateA.comparisonFacts.opportunityClass} vs ${bName} opportunity is ${candidateB.comparisonFacts.opportunityClass}.`,
  });

  const tiedAxes: DecisionComparisonAxis[] = [];
  if (rRankA === rRankB) tiedAxes.push('readiness');
  if (nRankA === nRankB) tiedAxes.push('training-need');
  if (oRankA === oRankB) tiedAxes.push('progress-opportunity');

  // -----------------------------------------------------------------------
  // Precedence Rule Evaluation
  // -----------------------------------------------------------------------

  // Rule 1: Hard Constraint Boundary
  const aBlocked = candidateA.hardConstraintStatus.isHardBlocked;
  const bBlocked = candidateB.hardConstraintStatus.isHardBlocked;
  if (aBlocked !== bBlocked) {
    const winnerId = aBlocked ? bId : aId;
    const winnerName = aBlocked ? bName : aName;
    const loserName = aBlocked ? aName : bName;
    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis: 'hard-constraint',
      decidingRule: 'Rule 1: Hard constraint boundary excludes blocked candidate.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winnerName} is favored because ${loserName} is blocked by a hard constraint boundary.`,
    });
  }

  // Rule 2: Unsupported / Unmapped Profile
  const aUnsupported = candidateA.decisionClass === 'unsupported';
  const bUnsupported = candidateB.decisionClass === 'unsupported';
  if (aUnsupported !== bUnsupported) {
    const winnerId = aUnsupported ? bId : aId;
    const winnerName = aUnsupported ? bName : aName;
    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis: 'hard-constraint',
      decidingRule: 'Rule 2: Mapped stress profile favored over unsupported/unmapped candidate.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winnerName} is supported in stress model while the other candidate is unsupported.`,
    });
  }

  // Rule 3: Acute Residual Conflict (Constrained vs Clear/Caution)
  // An acutely constrained candidate (<24h active stress) is deferred against a non-constrained candidate
  // UNLESS the non-constrained candidate was already recently addressed today and has no need.
  const aConstrained = candidateA.comparisonFacts.readinessClass === 'constrained';
  const bConstrained = candidateB.comparisonFacts.readinessClass === 'constrained';
  if (aConstrained !== bConstrained) {
    const nonConstrainedCandidate = aConstrained ? candidateB : candidateA;
    const constrainedCandidate = aConstrained ? candidateA : candidateB;

    // If non-constrained candidate is viable/preferred (not recently addressed today)
    if (nonConstrainedCandidate.comparisonFacts.needClass !== 'recently-addressed') {
      const winnerId = nonConstrainedCandidate.candidateExerciseId;
      const winnerName = nonConstrainedCandidate.candidateExerciseName;
      const loserName = constrainedCandidate.candidateExerciseName;
      return Object.freeze({
        candidateAId: aId,
        candidateBId: bId,
        candidateAName: aName,
        candidateBName: bName,
        winnerId,
        isTie: false,
        decidingAxis: 'readiness',
        decidingRule: 'Rule 3: Acute immediate residual stress (<24h) defers candidate in favor of unconstrained alternative.',
        axisComparisons: Object.freeze({
          readiness: readinessDetail,
          trainingNeed: needDetail,
          progressOpportunity: oppDetail,
        }),
        tiedAxes: Object.freeze(tiedAxes),
        narrativeRationale: `${winnerName} is preferred because ${loserName} has acute active residual stress on required dimensions.`,
      });
    }
  }

  // Rule 4: Non-Dominant Readiness (Caution + Due Need vs Clear + Recently-Addressed)
  // If Candidate A has caution readiness but DUE need and progression support,
  // while Candidate B is clear but was RECENTLY-ADDRESSED, Candidate A wins on Training Need.
  const aIsCautionDue =
    candidateA.comparisonFacts.readinessClass === 'caution' &&
    candidateA.comparisonFacts.needClass === 'due';
  const bIsClearRecentlyAddressed =
    candidateB.comparisonFacts.readinessClass === 'clear' &&
    candidateB.comparisonFacts.needClass === 'recently-addressed';

  if (aIsCautionDue && bIsClearRecentlyAddressed) {
    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId: aId,
      isTie: false,
      decidingAxis: 'training-need',
      decidingRule: 'Rule 4: Due training cadence with manageable caution favored over recently addressed clear candidate.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${aName} is due for training and has manageable caution, whereas ${bName} was already addressed recently.`,
    });
  }

  const bIsCautionDue =
    candidateB.comparisonFacts.readinessClass === 'caution' &&
    candidateB.comparisonFacts.needClass === 'due';
  const aIsClearRecentlyAddressed =
    candidateA.comparisonFacts.readinessClass === 'clear' &&
    candidateA.comparisonFacts.needClass === 'recently-addressed';

  if (bIsCautionDue && aIsClearRecentlyAddressed) {
    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId: bId,
      isTie: false,
      decidingAxis: 'training-need',
      decidingRule: 'Rule 4: Due training cadence with manageable caution favored over recently addressed clear candidate.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${bName} is due for training and has manageable caution, whereas ${aName} was already addressed recently.`,
    });
  }

  // Rule 5: Categorical Decision Class Comparison (preferred > viable > deferred > unsupported)
  const DECISION_CLASS_PRECEDENCE: Record<CandidateDecisionClass, number> = {
    preferred: 1,
    viable: 2,
    deferred: 3,
    unsupported: 4,
  };
  const dRankA = DECISION_CLASS_PRECEDENCE[candidateA.decisionClass];
  const dRankB = DECISION_CLASS_PRECEDENCE[candidateB.decisionClass];

  if (dRankA !== dRankB) {
    const winnerId = dRankA < dRankB ? aId : bId;
    const winner = dRankA < dRankB ? candidateA : candidateB;
    const loser = dRankA < dRankB ? candidateB : candidateA;

    // Determine primary deciding axis for class difference
    let decidingAxis: DecisionComparisonAxis = 'training-need';
    if (rRankA !== rRankB && nRankA === nRankB) {
      decidingAxis = 'readiness';
    } else if (nRankA !== nRankB) {
      decidingAxis = 'training-need';
    } else if (oRankA !== oRankB) {
      decidingAxis = 'progress-opportunity';
    }

    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis,
      decidingRule: `Rule 5: Categorical decision class differentiation (${winner.decisionClass} favored over ${loser.decisionClass}).`,
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winner.candidateExerciseName} is classified as ${winner.decisionClass} compared to ${loser.candidateExerciseName} (${loser.decisionClass}).`,
    });
  }

  // Rule 6: Training Need Cadence (Within identical preference tier)
  if (nRankA !== nRankB) {
    const winnerId = nRankA > nRankB ? aId : bId;
    const winnerName = nRankA > nRankB ? aName : bName;
    const loserName = nRankA > nRankB ? bName : aName;
    const winnerNeed = nRankA > nRankB ? candidateA.comparisonFacts.needClass : candidateB.comparisonFacts.needClass;
    const loserNeed = nRankA > nRankB ? candidateB.comparisonFacts.needClass : candidateA.comparisonFacts.needClass;

    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis: 'training-need',
      decidingRule: 'Rule 6: Higher training cadence necessity (due > available > recently-addressed).',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winnerName} has higher training cadence priority (${winnerNeed}) than ${loserName} (${loserNeed}).`,
    });
  }

  // Rule 7: Readiness Clarity (When Need is equal)
  if (rRankA !== rRankB) {
    const winnerId = rRankA > rRankB ? aId : bId;
    const winnerName = rRankA > rRankB ? aName : bName;
    const loserName = rRankA > rRankB ? bName : aName;

    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis: 'readiness',
      decidingRule: 'Rule 7: Clear readiness favored over caution when training need is equivalent.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winnerName} has clearer readiness on required dimensions compared to ${loserName}.`,
    });
  }

  // Rule 8: Progress Opportunity Stimulus (When Need & Readiness are equal)
  if (oRankA !== oRankB) {
    const winnerId = oRankA > oRankB ? aId : bId;
    const winnerName = oRankA > oRankB ? aName : bName;
    const loserName = oRankA > oRankB ? bName : aName;
    const winnerOpp = oRankA > oRankB ? candidateA.comparisonFacts.opportunityClass : candidateB.comparisonFacts.opportunityClass;

    return Object.freeze({
      candidateAId: aId,
      candidateBId: bId,
      candidateAName: aName,
      candidateBName: bName,
      winnerId,
      isTie: false,
      decidingAxis: 'progress-opportunity',
      decidingRule: 'Rule 8: Progression-supported opportunity favored when need and readiness are equivalent.',
      axisComparisons: Object.freeze({
        readiness: readinessDetail,
        trainingNeed: needDetail,
        progressOpportunity: oppDetail,
      }),
      tiedAxes: Object.freeze(tiedAxes),
      narrativeRationale: `${winnerName} possesses stronger progression opportunity evidence (${winnerOpp}) than ${loserName}.`,
    });
  }

  // Rule 9: True Tie
  return Object.freeze({
    candidateAId: aId,
    candidateBId: bId,
    candidateAName: aName,
    candidateBName: bName,
    winnerId: 'tie',
    isTie: true,
    decidingAxis: 'none-tie',
    decidingRule: 'Rule 9: True equivalence across readiness, need, and opportunity axes.',
    axisComparisons: Object.freeze({
      readiness: readinessDetail,
      trainingNeed: needDetail,
      progressOpportunity: oppDetail,
    }),
    tiedAxes: Object.freeze(['readiness', 'training-need', 'progress-opportunity'] as const),
    narrativeRationale: `${aName} and ${bName} have equivalent readiness (${candidateA.comparisonFacts.readinessClass}), training need (${candidateA.comparisonFacts.needClass}), and progress opportunity (${candidateA.comparisonFacts.opportunityClass}).`,
  });
}

// =========================================================================
// 3. Multi-Candidate Deterministic Sorting
// =========================================================================

/**
 * Sorts a list of CandidateDecisionEvidence into deterministic preference order.
 * True ties are preserved and ordered alphabetically by exerciseId purely for display stability.
 */
export function sortCandidatesByPreference(
  candidates: readonly CandidateDecisionEvidence[]
): readonly CandidateDecisionEvidence[] {
  const sorted = [...candidates].sort((a, b) => {
    // 1. Compare pairwise
    const comparison = compareCandidatePairwise(a, b);
    if (!comparison.isTie) {
      return comparison.winnerId === a.candidateExerciseId ? -1 : 1;
    }
    // 2. Secondary deterministic tie-breaker for display stability (never semantic priority)
    return a.candidateExerciseId.localeCompare(b.candidateExerciseId);
  });

  return Object.freeze(sorted);
}
