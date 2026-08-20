/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dimension Residual State Derivation (VNext Recommendation Engine - CU3.16)
 *
 * Pure domain implementation to derive a structured DimensionResidualState for each
 * StressDimension from a collection of ResidualStressTraces without scalar summation,
 * artificial magnitude reduction, or fake biological fatigue scoring.
 *
 * Strict Invariants:
 * 1. Structural Summary Only: Summarizes evidence partitions; NOT a fatigue score or recovery %.
 * 2. Multi-Trace Coexistence: Preserves multiple traces per state without max-culling or loss.
 * 3. Zero Scalar Summation / Conversion: Strength and Running are preserved losslessly.
 * 4. Bracket & Uncertainty Preservation: Bracket intervals and uncomputed traces are not artificially promoted.
 * 5. Strongest Persistence Separation: Definite (exact-only) vs Potential (bracket-aware) clearly distinguished.
 * 6. Partition Invariance: immediate + residual + historical + bracket + uncertain + ineligible === relevantTraces.
 * 7. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { StressDimension } from '../types/stressModel.types';
import {
  EvaluationContext,
  PersistenceState,
  ResidualStressTrace,
} from '../types/residualStressTrace.types';
import {
  AllDimensionResidualStates,
  DimensionModalityPresence,
  DimensionResidualState,
  DimensionResidualUncertaintyMetadata,
  ModalityPresenceSummary,
  StrongestPersistenceSummary,
} from '../types/dimensionResidualState.types';
import { FROZEN_STRESS_DIMENSIONS } from './strengthStressDimensionProjection';

/**
 * Ordinal persistence state rank helper.
 * Total order: 'immediate' (3) > 'residual' (2) > 'historical' (1) > 'none' (0).
 */
function getPersistenceRank(state: PersistenceState | 'none'): number {
  switch (state) {
    case 'immediate':
      return 3;
    case 'residual':
      return 2;
    case 'historical':
      return 1;
    case 'none':
      return 0;
  }
}

/**
 * Maps an ordinal rank back to its PersistenceState or 'none'.
 */
function getRankState(rank: number): PersistenceState | 'none' {
  switch (rank) {
    case 3:
      return 'immediate';
    case 2:
      return 'residual';
    case 1:
      return 'historical';
    default:
      return 'none';
  }
}

/**
 * Pure function to derive a structural DimensionResidualState for a single StressDimension.
 *
 * @param dimension The specific stress dimension to summarize.
 * @param traces All available ResidualStressTraces across the evaluation context.
 * @param evaluationContext The canonical evaluation context SSOT.
 */
export function deriveDimensionResidualState(
  dimension: StressDimension,
  traces: readonly ResidualStressTrace[],
  evaluationContext: EvaluationContext
): DimensionResidualState {
  const safeTraces = traces || [];
  const matchingTraces = safeTraces.filter((t) => t.sourceEvidence.dimension === dimension);

  const immediateTraces: ResidualStressTrace[] = [];
  const residualTraces: ResidualStressTrace[] = [];
  const historicalTraces: ResidualStressTrace[] = [];
  const bracketTraces: ResidualStressTrace[] = [];
  const uncertainTraces: ResidualStressTrace[] = [];
  const ineligibleTraces: ResidualStressTrace[] = [];

  let strengthTraceCount = 0;
  let runningTraceCount = 0;

  for (const trace of matchingTraces) {
    // 1. Modality tracking
    if (trace.sourceEvidence.kind === 'dimension-projected-strength-stress') {
      strengthTraceCount++;
    } else if (trace.sourceEvidence.kind === 'dimension-projected-running-stress') {
      runningTraceCount++;
    }

    // 2. Partition tracking based on temporal attenuation
    const att = trace.temporalAttenuation;
    if (att.kind === 'exact-ordinal') {
      if (att.state === 'immediate') {
        immediateTraces.push(trace);
      } else if (att.state === 'residual') {
        residualTraces.push(trace);
      } else if (att.state === 'historical') {
        historicalTraces.push(trace);
      }
    } else if (att.kind === 'bracket-ordinal') {
      bracketTraces.push(trace);
    } else if (att.kind === 'uncomputed') {
      uncertainTraces.push(trace);
    } else if (att.kind === 'ineligible') {
      ineligibleTraces.push(trace);
    }
  }

  // 3. Modality presence summary
  const hasStrength = strengthTraceCount > 0;
  const hasRunning = runningTraceCount > 0;
  let presence: DimensionModalityPresence = 'none';
  if (hasStrength && hasRunning) {
    presence = 'both';
  } else if (hasStrength) {
    presence = 'strength-only';
  } else if (hasRunning) {
    presence = 'running-only';
  }

  const modalitySummary: ModalityPresenceSummary = Object.freeze({
    presence,
    hasStrength,
    hasRunning,
    strengthTraceCount,
    runningTraceCount,
  });

  // 4. Strongest observed persistence (Definite vs Potential)
  let definiteRank = 0;
  if (immediateTraces.length > 0) {
    definiteRank = 3;
  } else if (residualTraces.length > 0) {
    definiteRank = 2;
  } else if (historicalTraces.length > 0) {
    definiteRank = 1;
  }
  const definite = getRankState(definiteRank);

  let potentialRank = definiteRank;
  for (const b of bracketTraces) {
    if (b.temporalAttenuation.kind === 'bracket-ordinal') {
      const upperRank = getPersistenceRank(b.temporalAttenuation.upperBoundState);
      if (upperRank > potentialRank) {
        potentialRank = upperRank;
      }
    }
  }
  const potential = getRankState(potentialRank);
  const hasPotentialPromotion = potentialRank > definiteRank;

  const strongestPersistence: StrongestPersistenceSummary = Object.freeze({
    definite,
    potential,
    hasPotentialPromotion,
  });

  // 5. Uncertainty metadata
  const uncertaintyMetadata: DimensionResidualUncertaintyMetadata = Object.freeze({
    hasUncertainTraces: uncertainTraces.length > 0,
    hasBracketTraces: bracketTraces.length > 0,
    uncertainTraceCount: uncertainTraces.length,
    bracketTraceCount: bracketTraces.length,
    totalTraceCount: matchingTraces.length,
    eligibleResidualTraceCount:
      immediateTraces.length +
      residualTraces.length +
      historicalTraces.length +
      bracketTraces.length,
  });

  return Object.freeze({
    dimension,
    evaluationContext,
    relevantTraces: Object.freeze(matchingTraces),
    immediateTraces: Object.freeze(immediateTraces),
    residualTraces: Object.freeze(residualTraces),
    historicalTraces: Object.freeze(historicalTraces),
    bracketTraces: Object.freeze(bracketTraces),
    uncertainTraces: Object.freeze(uncertainTraces),
    ineligibleTraces: Object.freeze(ineligibleTraces),
    modalitySummary,
    strongestPersistence,
    uncertaintyMetadata,
  });
}

/**
 * Pure function to derive all 7 DimensionResidualStates across all canonical frozen stress dimensions.
 *
 * @param traces All available ResidualStressTraces across the evaluation context.
 * @param evaluationContext The canonical evaluation context SSOT.
 */
export function deriveAllDimensionResidualStates(
  traces: readonly ResidualStressTrace[],
  evaluationContext: EvaluationContext
): AllDimensionResidualStates {
  const result: Partial<Record<StressDimension, DimensionResidualState>> = {};

  for (const dim of FROZEN_STRESS_DIMENSIONS) {
    result[dim] = deriveDimensionResidualState(dim, traces, evaluationContext);
  }

  return Object.freeze(result as AllDimensionResidualStates);
}
