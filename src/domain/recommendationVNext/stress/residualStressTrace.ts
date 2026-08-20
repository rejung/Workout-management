/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Residual Stress Trace Derivation (VNext Recommendation Engine - CU3.14 / CU3.14A / CU3.14B)
 *
 * Implements pure, deterministic temporal anchoring and occurrence state derivation
 * for UnifiedDimensionProjectedStress evidence relative to a canonical evaluation instant.
 *
 * Strict Invariants:
 * 1. Single Evaluation Temporal Frame SSOT:
 *    - `evaluationInstant` + `evaluationTimezone` is the sole truth source.
 *    - `evaluationCalendarDate` and `evaluationLocalTime` are strictly derived via pure functions.
 * 2. Wall-Clock Timezone Interpretation:
 *    - Source evidence `date` and `startTime` are parsed strictly as local wall-clock in `evaluationTimezone`.
 * 3. 4-State Occurrence Classification:
 *    - `occurred-exact`: startTime present AND evidenceInstant <= evaluationInstant (elapsed >= 0; 0 when exact same instant).
 *    - `occurred-calendar-bounded`: startTime missing AND evidenceCalendarDate < evaluationCalendarDate.
 *    - `occurrence-uncertain`: startTime missing AND evidenceCalendarDate === evaluationCalendarDate (no time fabrication).
 *    - `future-evidence`: startTime present & evidenceInstant > evaluationInstant, OR startTime missing & evidenceDate > evalDate.
 * 4. Derived Candidate Rule:
 *    - `isValidResidualCandidate` is NOT stored; derived dynamically via `isResidualCandidateOccurrence`.
 * 5. Timezone-Aware Calendar Bounds:
 *    - `dayStart` (00:00:00.000) and `dayEnd` (23:59:59.999) calculated in `evaluationTimezone` (no fixed 86400s assumption; DST-aware).
 * 6. Temporal Attenuation:
 *    - Fixed `{ readonly status: 'uncomputed' }` placeholder.
 * 7. Canonical Traces Collection & Partition Fidelity:
 *    - `traces` is the canonical collection in deterministic storage order.
 *    - `validTraces`, `uncertainTraces`, `futureTraces` are derived views preserving union, zero duplicates, and zero omissions.
 * 8. Lossless Source Evidence Reference:
 *    - sourceEvidence is linked directly without magnitude modification, scaling, or splitting.
 * 9. Zero Cross-Trace Aggregation / Scalar Summation / Scoring / Decay / Readiness / Recommendation.
 */

import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import {
  ElapsedTime,
  EvaluationContext,
  EvaluationContextInput,
  OccurrenceState,
  PersistenceState,
  PersistenceThresholdPolicy,
  ResidualStressTrace,
  ResidualStressTraceCollection,
  TemporalAttenuation,
} from '../types/residualStressTrace.types';
import { compareUnifiedEvidenceChronologicalDesc } from './unifiedStressEvidence';

// =========================================================================
// Ordinal Persistence Policy & Threshold Constants (CU3.15 / CU3.15B / CU3.15C)
// =========================================================================

/** Threshold 1: 24 hours (86,400 seconds) - separates immediate from residual */
export const THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS = 86400;

/** Threshold 2: 72 hours (259,200 seconds) - separates residual from historical */
export const THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS = 259200;

/** Declared Product Policy identifier for temporal persistence thresholds */
export const PERSISTENCE_THRESHOLD_POLICY: PersistenceThresholdPolicy = 'product-policy-24h-72h';

/**
 * Maps a single non-negative elapsed seconds value to its exact PersistenceState.
 *
 * [INVARIANT]:
 * - elapsedSeconds < 86,400s (24h) -> 'immediate'
 * - 86,400s <= elapsedSeconds < 259,200s (72h) -> 'residual'
 * - elapsedSeconds >= 259,200s (72h) -> 'historical'
 */
export function mapElapsedSecondsToOrdinalState(elapsedSeconds: number): PersistenceState {
  if (elapsedSeconds < THRESHOLD_T1_IMMEDIATE_TO_RESIDUAL_SECONDS) {
    return 'immediate';
  }
  if (elapsedSeconds < THRESHOLD_T2_RESIDUAL_TO_HISTORICAL_SECONDS) {
    return 'residual';
  }
  return 'historical';
}

/**
 * Derives the temporal attenuation representation from a calculated ElapsedTime.
 *
 * [INVARIANTS]:
 * - ExactElapsedTime -> exact-ordinal state with declared product policy.
 * - BoundedElapsedTime -> if interval bounds map to the same state -> exact-ordinal;
 *                         if interval crosses thresholds -> bracket-ordinal { lowerBoundState, upperBoundState }.
 *                         (No speculative midpoint interpolation).
 * - UnavailableElapsedTime (missing-same-day-time) -> uncomputed.
 * - UnavailableElapsedTime (future-evidence) -> ineligible.
 */
export function deriveTemporalAttenuation(elapsedTime: ElapsedTime): TemporalAttenuation {
  if (elapsedTime.kind === 'exact') {
    return Object.freeze({
      kind: 'exact-ordinal',
      state: mapElapsedSecondsToOrdinalState(elapsedTime.elapsedSeconds),
      thresholdPolicy: PERSISTENCE_THRESHOLD_POLICY,
    });
  }

  if (elapsedTime.kind === 'bounded') {
    // elapsedUpperBoundSeconds represents the oldest point in interval (start of day) -> lower persistence state
    const lowerBoundState = mapElapsedSecondsToOrdinalState(elapsedTime.elapsedUpperBoundSeconds);
    // elapsedLowerBoundSeconds represents the most recent point in interval (end of day) -> higher persistence state
    const upperBoundState = mapElapsedSecondsToOrdinalState(elapsedTime.elapsedLowerBoundSeconds);

    if (lowerBoundState === upperBoundState) {
      return Object.freeze({
        kind: 'exact-ordinal',
        state: lowerBoundState,
        thresholdPolicy: PERSISTENCE_THRESHOLD_POLICY,
      });
    }

    return Object.freeze({
      kind: 'bracket-ordinal',
      lowerBoundState,
      upperBoundState,
      thresholdPolicy: PERSISTENCE_THRESHOLD_POLICY,
    });
  }

  if (elapsedTime.reason === 'missing-same-day-time') {
    return Object.freeze({
      kind: 'uncomputed',
      reason: 'missing-same-day-time',
    });
  }

  return Object.freeze({
    kind: 'ineligible',
    reason: 'future-evidence',
  });
}

// =========================================================================
// Timezone & Wall-Clock Utility Functions
// =========================================================================

/**
 * Extracts wall-clock date & time parts of a UTC instant in a target IANA timezone.
 */
function getPartsInTimezone(
  date: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });

  const parts = formatter.formatToParts(date);
  let year = 0;
  let month = 0;
  let day = 0;
  let hour = 0;
  let minute = 0;
  let second = 0;

  for (const part of parts) {
    if (part.type === 'year') year = parseInt(part.value, 10);
    else if (part.type === 'month') month = parseInt(part.value, 10);
    else if (part.type === 'day') day = parseInt(part.value, 10);
    else if (part.type === 'hour') hour = parseInt(part.value, 10);
    else if (part.type === 'minute') minute = parseInt(part.value, 10);
    else if (part.type === 'second') second = parseInt(part.value, 10);
  }

  const millisecond = date.getUTCMilliseconds();
  return { year, month, day, hour, minute, second, millisecond };
}

/**
 * Converts a local wall-clock date and time string in a specific IANA timezone into an exact UTC epoch millisecond.
 *
 * Uses iterative offset refinement to handle daylight saving time (DST) shifts and standard offsets cleanly.
 */
export function parseWallClockInTimezone(
  dateStr: string,
  timeStr: string,
  timeZone: string
): { instantMs: number; isoString: string } {
  const cleanDate = dateStr.trim().replace(/\./g, '-');
  const [yStr, mStr, dStr] = cleanDate.split('-');
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);

  const cleanTime = timeStr.trim();
  const [hStr, minStr, secRaw] = cleanTime.split(':');
  const hour = parseInt(hStr || '0', 10);
  const minute = parseInt(minStr || '0', 10);

  let second = 0;
  let millisecond = 0;
  if (secRaw) {
    if (secRaw.includes('.')) {
      const [sPart, msPart] = secRaw.split('.');
      second = parseInt(sPart, 10);
      millisecond = parseInt(msPart.padEnd(3, '0').slice(0, 3), 10);
    } else {
      second = parseInt(secRaw, 10);
    }
  }

  // Target local wall-clock in pseudo-UTC epoch ms
  const targetWallClockUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  // Iteration 0: Initial guess as UTC
  let estimatedUtcMs = targetWallClockUtcMs;

  for (let iteration = 0; iteration < 3; iteration++) {
    const parts = getPartsInTimezone(new Date(estimatedUtcMs), timeZone);
    const renderedWallClockUtcMs = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond
    );

    const diff = targetWallClockUtcMs - renderedWallClockUtcMs;
    if (diff === 0) {
      break;
    }
    estimatedUtcMs += diff;
  }

  const finalDate = new Date(estimatedUtcMs);
  return {
    instantMs: estimatedUtcMs,
    isoString: finalDate.toISOString(),
  };
}

/**
 * Derives canonical EvaluationContext from EvaluationContextInput.
 *
 * `evaluationCalendarDate` and `evaluationLocalTime` are strictly derived from `evaluationInstant` and `evaluationTimezone`.
 */
export function deriveEvaluationContext(input: Readonly<EvaluationContextInput>): EvaluationContext {
  const dateObj = new Date(input.evaluationInstant);
  if (isNaN(dateObj.getTime())) {
    throw new Error(`Invalid evaluationInstant: "${input.evaluationInstant}"`);
  }

  const parts = getPartsInTimezone(dateObj, input.evaluationTimezone);
  const yStr = String(parts.year).padStart(4, '0');
  const mStr = String(parts.month).padStart(2, '0');
  const dStr = String(parts.day).padStart(2, '0');
  const hStr = String(parts.hour).padStart(2, '0');
  const minStr = String(parts.minute).padStart(2, '0');
  const sStr = String(parts.second).padStart(2, '0');

  const evaluationCalendarDate = `${yStr}-${mStr}-${dStr}`;
  const evaluationLocalTime = `${hStr}:${minStr}:${sStr}`;

  return Object.freeze({
    evaluationInstant: input.evaluationInstant,
    evaluationTimezone: input.evaluationTimezone,
    evaluationCalendarDate,
    evaluationLocalTime,
  });
}

/**
 * Pure derivation rule determining if an OccurrenceState qualifies as a valid candidate for residual evaluation.
 *
 * [INVARIANT]:
 * - occurred-exact -> true
 * - occurred-calendar-bounded -> true
 * - occurrence-uncertain -> false
 * - future-evidence -> false
 */
export function isResidualCandidateOccurrence(state: OccurrenceState): boolean {
  return state === 'occurred-exact' || state === 'occurred-calendar-bounded';
}

/**
 * Derives a single ResidualStressTrace from a UnifiedDimensionProjectedStress item and EvaluationContext.
 */
export function deriveSingleResidualStressTrace(
  evidence: Readonly<UnifiedDimensionProjectedStress>,
  evalContext: Readonly<EvaluationContext>
): ResidualStressTrace {
  const evalInstantMs = new Date(evalContext.evaluationInstant).getTime();
  const hasStartTime = typeof evidence.startTime === 'string' && evidence.startTime.trim().length > 0;

  let occurrenceState: OccurrenceState;
  let elapsedTime: ElapsedTime;

  if (hasStartTime) {
    // Exact wall-clock time is available
    const { instantMs: evidenceInstantMs } = parseWallClockInTimezone(
      evidence.date,
      evidence.startTime!,
      evalContext.evaluationTimezone
    );

    if (evidenceInstantMs <= evalInstantMs) {
      // Occurred at or before evaluation instant
      const elapsedSeconds = Math.max(0, Math.floor((evalInstantMs - evidenceInstantMs) / 1000));
      occurrenceState = 'occurred-exact';
      elapsedTime = Object.freeze({
        kind: 'exact',
        elapsedSeconds,
      });
    } else {
      // Future evidence
      occurrenceState = 'future-evidence';
      elapsedTime = Object.freeze({
        kind: 'unavailable',
        reason: 'future-evidence',
      });
    }
  } else {
    // Missing startTime: evaluate by calendar date relation
    const evidenceDate = evidence.date.trim().replace(/\./g, '-');
    const evalDate = evalContext.evaluationCalendarDate;

    if (evidenceDate < evalDate) {
      // Past calendar day: occurred-calendar-bounded
      const dayStart = parseWallClockInTimezone(
        evidenceDate,
        '00:00:00.000',
        evalContext.evaluationTimezone
      );
      const dayEnd = parseWallClockInTimezone(
        evidenceDate,
        '23:59:59.999',
        evalContext.evaluationTimezone
      );

      const elapsedLowerBoundSeconds = Math.max(0, Math.floor((evalInstantMs - dayEnd.instantMs) / 1000));
      const elapsedUpperBoundSeconds = Math.max(0, Math.floor((evalInstantMs - dayStart.instantMs) / 1000));

      occurrenceState = 'occurred-calendar-bounded';
      elapsedTime = Object.freeze({
        kind: 'bounded',
        elapsedLowerBoundSeconds,
        elapsedUpperBoundSeconds,
        evidenceCalendarDate: evidenceDate,
        dayStartInstant: dayStart.isoString,
        dayEndInstant: dayEnd.isoString,
      });
    } else if (evidenceDate === evalDate) {
      // Same day missing time: occurrence-uncertain
      occurrenceState = 'occurrence-uncertain';
      elapsedTime = Object.freeze({
        kind: 'unavailable',
        reason: 'missing-same-day-time',
      });
    } else {
      // Future calendar day: future-evidence
      occurrenceState = 'future-evidence';
      elapsedTime = Object.freeze({
        kind: 'unavailable',
        reason: 'future-evidence',
      });
    }
  }

  const temporalAttenuation = deriveTemporalAttenuation(elapsedTime);

  return Object.freeze({
    sourceEvidence: evidence,
    occurrenceState,
    elapsedTime,
    temporalAttenuation,
  });
}

/**
 * Derives the canonical ResidualStressTraceCollection from an evidence list and evaluation context input.
 *
 * Invariants Enforced:
 * 1. Zero Mutation: `evidenceList` is unmutated.
 * 2. Deterministic Storage Ordering: Traces are sorted deterministically descending by date and valid startTime.
 * 3. Partition Identity: `traces` is the canonical collection.
 *    `validTraces`, `uncertainTraces`, and `futureTraces` are derived views strictly partitioning `traces`.
 * 4. Partition Completeness: validCount + uncertainCount + futureCount === totalCount.
 * 5. Deep Immutability: Deeply frozen return structures.
 */
export function deriveResidualStressTraces(
  evidenceList: readonly UnifiedDimensionProjectedStress[],
  evalContextInput: Readonly<EvaluationContextInput>
): ResidualStressTraceCollection {
  const evalContext = deriveEvaluationContext(evalContextInput);

  // Deterministic storage sort (pure copy, descending chronology comparator)
  const sortedEvidence = [...evidenceList].sort(compareUnifiedEvidenceChronologicalDesc);

  const traces: ResidualStressTrace[] = sortedEvidence.map((ev) =>
    deriveSingleResidualStressTrace(ev, evalContext)
  );

  const validTraces: ResidualStressTrace[] = [];
  const uncertainTraces: ResidualStressTrace[] = [];
  const futureTraces: ResidualStressTrace[] = [];

  for (const trace of traces) {
    if (isResidualCandidateOccurrence(trace.occurrenceState)) {
      validTraces.push(trace);
    } else if (trace.occurrenceState === 'occurrence-uncertain') {
      uncertainTraces.push(trace);
    } else if (trace.occurrenceState === 'future-evidence') {
      futureTraces.push(trace);
    }
  }

  // Sanity check partition invariant
  if (validTraces.length + uncertainTraces.length + futureTraces.length !== traces.length) {
    throw new Error('Partition invariant violated in deriveResidualStressTraces');
  }

  return Object.freeze({
    evaluationContext: evalContext,
    traces: Object.freeze(traces),
    validTraces: Object.freeze(validTraces),
    uncertainTraces: Object.freeze(uncertainTraces),
    futureTraces: Object.freeze(futureTraces),
    totalCount: traces.length,
    validCount: validTraces.length,
    uncertainCount: uncertainTraces.length,
    futureCount: futureTraces.length,
  });
}
