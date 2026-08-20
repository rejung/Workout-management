/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Dimension Residual State Types (VNext Recommendation Engine - CU3.16)
 *
 * Defines the structural contract summarizing all ResidualStressTraces belonging to
 * a specific StressDimension, strictly preserving multi-trace coexistence, modality,
 * uncertainty, and ordinal persistence without scalar summation or false fatigue scoring.
 *
 * Strict Invariants:
 * 1. Structural Summary Only: NOT a "dimension fatigue score" or "recovery %".
 * 2. Multi-Trace Coexistence: Preserves all historical, residual, immediate, and bracket traces without max-culling or loss.
 * 3. Zero Scalar Summation / Conversion: Strength and Running are preserved losslessly without common-unit conversion.
 * 4. Bracket & Uncertainty Preservation: Bracket intervals and uncomputed same-day traces are not artificially promoted.
 * 5. Strongest Persistence Separation: Definite (exact-only) vs Potential (bracket-aware) clearly distinguished.
 * 6. Partition Invariance: immediate + residual + historical + bracket + uncertain + ineligible === relevantTraces.
 * 7. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { StressDimension } from './stressModel.types';
import {
  EvaluationContext,
  PersistenceState,
  ResidualStressTrace,
} from './residualStressTrace.types';

// =========================================================================
// 1. Modality Presence Types
// =========================================================================

export type DimensionModalityPresence =
  | 'none'
  | 'strength-only'
  | 'running-only'
  | 'both';

export interface ModalityPresenceSummary {
  /** High-level modality presence classification */
  readonly presence: DimensionModalityPresence;

  /** True if at least one strength projection trace is present */
  readonly hasStrength: boolean;

  /** True if at least one running projection trace is present */
  readonly hasRunning: boolean;

  /** Count of strength projection traces */
  readonly strengthTraceCount: number;

  /** Count of running projection traces */
  readonly runningTraceCount: number;
}

// =========================================================================
// 2. Strongest Observed Persistence Summary
// =========================================================================

export interface StrongestPersistenceSummary {
  /**
   * Definite strongest persistence state derived strictly from exact-ordinal traces.
   * Total order: 'immediate' > 'residual' > 'historical' > 'none'.
   */
  readonly definite: PersistenceState | 'none';

  /**
   * Potential strongest persistence state considering upper bounds of bracket-ordinal traces.
   * Total order: 'immediate' > 'residual' > 'historical' > 'none'.
   */
  readonly potential: PersistenceState | 'none';

  /**
   * True if bracket upper bounds indicate a potentially stronger persistence state than definite.
   */
  readonly hasPotentialPromotion: boolean;
}

// =========================================================================
// 3. Chronology & Uncertainty Metadata
// =========================================================================

export interface DimensionResidualUncertaintyMetadata {
  /** True if there is at least one uncertain (uncomputed same-day missing time) trace */
  readonly hasUncertainTraces: boolean;

  /** True if there is at least one bracket-ordinal (threshold-crossing) trace */
  readonly hasBracketTraces: boolean;

  /** Count of uncertain traces */
  readonly uncertainTraceCount: number;

  /** Count of bracket-ordinal traces */
  readonly bracketTraceCount: number;

  /** Total trace count associated with this dimension */
  readonly totalTraceCount: number;

  /** Total count of eligible residual traces (immediate + residual + historical + bracket) */
  readonly eligibleResidualTraceCount: number;
}

// =========================================================================
// 4. Dimension Residual State Contract
// =========================================================================

export interface DimensionResidualState {
  /** The specific stress dimension this state summarizes */
  readonly dimension: StressDimension;

  /** Canonical evaluation context SSOT */
  readonly evaluationContext: EvaluationContext;

  /** All relevant traces linked to this dimension (canonical dimension trace collection) */
  readonly relevantTraces: readonly ResidualStressTrace[];

  /** Partition of traces with exact-ordinal 'immediate' persistence state (<24h) */
  readonly immediateTraces: readonly ResidualStressTrace[];

  /** Partition of traces with exact-ordinal 'residual' persistence state (24h-72h) */
  readonly residualTraces: readonly ResidualStressTrace[];

  /** Partition of traces with exact-ordinal 'historical' persistence state (>=72h) */
  readonly historicalTraces: readonly ResidualStressTrace[];

  /** Partition of traces with 'bracket-ordinal' persistence state (crossing 24h or 72h thresholds) */
  readonly bracketTraces: readonly ResidualStressTrace[];

  /** Partition of traces with 'uncomputed' temporal attenuation (same-day missing time) */
  readonly uncertainTraces: readonly ResidualStressTrace[];

  /** Partition of traces with 'ineligible' temporal attenuation (future evidence) */
  readonly ineligibleTraces: readonly ResidualStressTrace[];

  /** Modality presence summary (Strength / Running / Both / None) */
  readonly modalitySummary: ModalityPresenceSummary;

  /** Strongest observed persistence summary (Definite vs Potential) */
  readonly strongestPersistence: StrongestPersistenceSummary;

  /** Chronology and uncertainty metadata */
  readonly uncertaintyMetadata: DimensionResidualUncertaintyMetadata;
}

// =========================================================================
// 5. All Dimension Residual States Container
// =========================================================================

export type AllDimensionResidualStates = {
  readonly [D in StressDimension]: DimensionResidualState;
};

// =========================================================================
// 6. Audit Result Contract
// =========================================================================

export interface DimensionResidualStateAuditResult {
  readonly auditName: string;
  readonly passed: boolean;
  readonly details: string;
}
