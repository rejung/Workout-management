/**
 * Historical Exercise Context Derivation (VNext Recommendation Engine - CU3.7)
 *
 * Pure function pipeline to derive a compact runtime HistoricalExerciseContext
 * from a CU3.5 Historical Evidence Collection and CU3.6 Baseline Reference.
 *
 * Strict Invariants:
 * 1. Compact Context: Does NOT include the raw historical collection or session arrays.
 * 2. Single-Source Projection: historyState, totalHistoricalSessionCount, and factorAvailability
 *    are projected directly from the CU3.6 baseline without independent recomputation.
 * 3. Recency Fidelity: Recency is extracted strictly from historicalSessions[0] (Recent-1).
 *    daysSinceLastPerformed is a deterministic calendar-day delta (UTC-based).
 * 4. Zero Mutation: 0 input modifications, all returned structures deeply frozen.
 * 5. NO Normalization / Ratios / Magnitude / Weights / Decay / Readiness / Recommendations.
 */

import {
  StrengthHistoricalEvidenceCollection
} from '../types/strengthStressHistory.types';
import {
  StrengthStressMagnitudeInput,
  StressMagnitudeInput
} from '../types/stressMagnitudeInput.types';
import {
  HistoricalExerciseContext,
  ExerciseRecencyMetadata,
  FactorAvailabilitySummary
} from '../types/historicalExerciseContext.types';
import {
  deriveStrengthHistoricalEvidence
} from '../stress/strengthStressHistory';
import {
  deriveStrengthStressHistoricalBaseline
} from '../stress/strengthStressBaseline';

/**
 * Calculates the exact calendar day delta between two ISO date strings (YYYY-MM-DD) in UTC.
 * Returns 0 if both dates are identical.
 */
function computeCalendarDayDelta(currentDate: string, priorDate: string): number {
  const [cy, cm, cd] = currentDate.split('-').map(Number);
  const [py, pm, pd] = priorDate.split('-').map(Number);
  const currentUtc = Date.UTC(cy, cm - 1, cd);
  const priorUtc = Date.UTC(py, pm - 1, pd);
  return Math.round((currentUtc - priorUtc) / (1000 * 60 * 60 * 24));
}

/**
 * Pure function to derive a compact HistoricalExerciseContext from an upstream CU3.5 Historical Collection.
 *
 * @param historyCollection Immutable CU3.5 collection of strictly-earlier same-exercise sessions.
 * @returns Deeply frozen, compact HistoricalExerciseContext.
 */
export function deriveHistoricalExerciseContext(
  historyCollection: StrengthHistoricalEvidenceCollection
): HistoricalExerciseContext {
  if (!historyCollection) {
    throw new Error('Contract Violation: historyCollection must be provided.');
  }

  const historicalSessions = historyCollection.historicalSessions;
  const recent1Session = historicalSessions[0];

  // 1. Recency Metadata Derivation (Strictly from Recent-1 if present)
  let recency: ExerciseRecencyMetadata;
  if (!recent1Session) {
    recency = Object.freeze({
      lastPerformedDate: undefined,
      lastPerformedStartTime: undefined,
      lastPerformedSourceLogId: undefined,
      daysSinceLastPerformed: undefined
    });
  } else {
    const daysSince = computeCalendarDayDelta(historyCollection.currentDate, recent1Session.date);
    recency = Object.freeze({
      lastPerformedDate: recent1Session.date,
      lastPerformedStartTime: recent1Session.startTime,
      lastPerformedSourceLogId: recent1Session.sourceLogId,
      daysSinceLastPerformed: daysSince
    });
  }

  // 2. Baseline Reference Derivation (CU3.6)
  const baseline = deriveStrengthStressHistoricalBaseline(historyCollection);

  // 3. Metadata Projection (Projected directly from baseline for single-source invariant)
  const factorAvailability: FactorAvailabilitySummary = Object.freeze({
    volume: Object.freeze({
      availableObservationCount: baseline.volumeReference.availableObservationCount,
      unavailableObservationCount: baseline.volumeReference.unavailableObservationCount
    }),
    intensityCapacity: Object.freeze({
      availableObservationCount: baseline.intensityCapacityReference.availableObservationCount,
      unavailableObservationCount: baseline.intensityCapacityReference.unavailableObservationCount
    }),
    repeatedWork: Object.freeze({
      availableObservationCount: baseline.repeatedWorkReference.availableObservationCount,
      unavailableObservationCount: baseline.repeatedWorkReference.unavailableObservationCount
    })
  });

  // 4. Compact Context Assembly
  return Object.freeze({
    currentSourceLogId: historyCollection.currentSourceLogId,
    exerciseId: historyCollection.exerciseId,
    exerciseName: historyCollection.exerciseName,
    currentDate: historyCollection.currentDate,
    currentStartTime: historyCollection.currentStartTime,
    recency,
    historyState: baseline.historyState,
    totalHistoricalSessionCount: baseline.totalHistoricalSessionCount,
    factorAvailability,
    baseline
  });
}

/**
 * Convenience helper to derive a HistoricalExerciseContext directly from a current input and candidate pool.
 */
export function deriveHistoricalExerciseContextFromCandidates(
  currentInput: StrengthStressMagnitudeInput,
  candidateInputs: readonly StressMagnitudeInput[]
): HistoricalExerciseContext {
  const historyCollection = deriveStrengthHistoricalEvidence(currentInput, candidateInputs);
  return deriveHistoricalExerciseContext(historyCollection);
}
