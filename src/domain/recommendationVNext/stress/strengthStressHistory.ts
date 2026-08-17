/**
 * Strength Stress Historical Baseline Evidence Derivation (VNext Recommendation Engine - CU3.5 / CU3.5.2.1)
 *
 * Provides:
 * 1. Chronological evaluation helper to determine strictly-earlier vs future/uncertain temporal precedence.
 * 2. Pure function `deriveStrengthHistoricalEvidence` to collect actual historical observation facts for the same canonical exercise.
 * 3. Chronological sorting helper (descending newest strictly-earlier first).
 *
 * Strict Guarantees:
 * - ZERO baseline representative calculations (no mean, median, max, percentile, or rolling average).
 * - ZERO normalization formulas or percentage-of-baseline scores.
 * - ZERO stress magnitudes, scores, fatigue, readiness, or recommendations.
 * - ZERO Running modality cross-wiring.
 * - ZERO silent drop of candidates (conservation invariant strictly holds).
 * - Deeply immutable / frozen return structures.
 */

import { StressMagnitudeInput, StrengthStressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import {
  HistoricalStrengthSessionEvidence,
  HistoricalEvidenceExclusion,
  HistoricalEvidenceExclusionReason,
  StrengthHistoricalEvidenceCollection
} from '../types/strengthStressHistory.types';

/**
 * Chronological relation of a candidate session relative to the current evaluation session.
 */
export type ChronologyRelation =
  | 'same-session'
  | 'strictly-earlier'
  | 'strictly-future'
  | 'ordering-uncertain';

/**
 * Evaluates the strict chronological relationship between the current session and a candidate session.
 *
 * Rules:
 * 1. If sourceLogId matches -> 'same-session'
 * 2. Primary: Date comparison (YYYY-MM-DD string comparison).
 * 3. Secondary (when dates are identical):
 *    - If both have `startTime`: Compare startTime lexicographically.
 *      candidate < current -> 'strictly-earlier'
 *      candidate > current -> 'strictly-future'
 *      candidate === current -> 'ordering-uncertain' (cannot establish order between different logs at exact same minute)
 *    - If one or both lack `startTime`: Return 'ordering-uncertain' (no temporal order fabricated).
 */
export function evaluateChronologyRelation(
  current: { readonly date: string; readonly startTime?: string; readonly sourceLogId: string },
  candidate: { readonly date: string; readonly startTime?: string; readonly sourceLogId: string }
): ChronologyRelation {
  if (candidate.sourceLogId === current.sourceLogId) {
    return 'same-session';
  }

  if (candidate.date < current.date) {
    return 'strictly-earlier';
  }

  if (candidate.date > current.date) {
    return 'strictly-future';
  }

  // Same date comparison
  if (candidate.startTime && current.startTime) {
    if (candidate.startTime < current.startTime) {
      return 'strictly-earlier';
    }
    if (candidate.startTime > current.startTime) {
      return 'strictly-future';
    }
    return 'ordering-uncertain';
  }

  // Same date with missing startTime on either side
  return 'ordering-uncertain';
}

/**
 * Chronological comparator for HistoricalStrengthSessionEvidence in descending order (newest first).
 */
export function compareHistoricalStrengthSessionsChronologicalDesc(
  a: Readonly<HistoricalStrengthSessionEvidence>,
  b: Readonly<HistoricalStrengthSessionEvidence>
): number {
  if (a.date !== b.date) {
    return b.date.localeCompare(a.date);
  }

  if (a.startTime && b.startTime) {
    if (a.startTime !== b.startTime) {
      return b.startTime.localeCompare(a.startTime);
    }
    return 0;
  }

  return 0;
}

/**
 * Pure function to derive historical strength session evidence for a given strength session.
 *
 * @param currentInput The current strength magnitude input being evaluated.
 * @param candidateHistoricalInputs Pool of actual historical magnitude inputs (from actual workout logs).
 * @returns An immutable StrengthHistoricalEvidenceCollection containing strictly-earlier same-exercise sessions.
 */
export function deriveStrengthHistoricalEvidence(
  currentInput: StrengthStressMagnitudeInput,
  candidateHistoricalInputs: readonly StressMagnitudeInput[]
): StrengthHistoricalEvidenceCollection {
  if (!currentInput || currentInput.kind !== 'strength') {
    throw new Error('Contract Violation: currentInput must be a valid StrengthStressMagnitudeInput (kind: "strength").');
  }

  // Validate no duplicate candidates (same sourceLogId & exerciseId) in candidate pool
  const seenKeys = new Set<string>();
  for (const candidate of candidateHistoricalInputs) {
    const key = `${candidate.sourceLogId}::${candidate.exerciseId}`;
    if (seenKeys.has(key)) {
      throw new Error(`Contract Violation: Duplicate sourceLogId detected in candidate historical inputs: "${candidate.sourceLogId}".`);
    }
    seenKeys.add(key);
  }

  const historicalSessions: HistoricalStrengthSessionEvidence[] = [];
  const excludedCandidates: HistoricalEvidenceExclusion[] = [];

  for (const candidate of candidateHistoricalInputs) {
    // 1. Modality check
    if (candidate.kind !== 'strength') {
      excludedCandidates.push(
        Object.freeze({
          sourceLogId: candidate.sourceLogId,
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          date: candidate.date,
          startTime: candidate.startTime,
          reason: 'invalid-modality' as HistoricalEvidenceExclusionReason,
          details: `Candidate modality "${candidate.kind}" cannot provide strength performance history.`
        })
      );
      continue;
    }

    // 2. Current session check
    if (candidate.sourceLogId === currentInput.sourceLogId) {
      excludedCandidates.push(
        Object.freeze({
          sourceLogId: candidate.sourceLogId,
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          date: candidate.date,
          startTime: candidate.startTime,
          reason: 'current-session' as HistoricalEvidenceExclusionReason,
          details: 'Evaluation target session is excluded from its own historical baseline evidence.'
        })
      );
      continue;
    }

    // 3. Same Canonical Exercise check
    if (candidate.exerciseId !== currentInput.exerciseId) {
      excludedCandidates.push(
        Object.freeze({
          sourceLogId: candidate.sourceLogId,
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          date: candidate.date,
          startTime: candidate.startTime,
          reason: 'not-same-exercise' as HistoricalEvidenceExclusionReason,
          details: `Exercise "${candidate.exerciseId}" does not match target exercise "${currentInput.exerciseId}".`
        })
      );
      continue;
    }

    // 4. Chronology check
    const chronology = evaluateChronologyRelation(currentInput, candidate);

    if (chronology === 'strictly-future') {
      excludedCandidates.push(
        Object.freeze({
          sourceLogId: candidate.sourceLogId,
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          date: candidate.date,
          startTime: candidate.startTime,
          reason: 'future-session' as HistoricalEvidenceExclusionReason,
          details: `Session on ${candidate.date} ${candidate.startTime ?? ''} occurred after current session on ${currentInput.date} ${currentInput.startTime ?? ''}.`
        })
      );
      continue;
    }

    if (chronology === 'ordering-uncertain') {
      excludedCandidates.push(
        Object.freeze({
          sourceLogId: candidate.sourceLogId,
          exerciseId: candidate.exerciseId,
          exerciseName: candidate.exerciseName,
          date: candidate.date,
          startTime: candidate.startTime,
          reason: 'ordering-uncertain' as HistoricalEvidenceExclusionReason,
          details: `Session on ${candidate.date} lacks strict temporal precedence relative to current session on ${currentInput.date} ${currentInput.startTime ?? ''}.`
        })
      );
      continue;
    }

    // 5. Included strictly-earlier candidate -> project to HistoricalStrengthSessionEvidence
    const historicalSession: HistoricalStrengthSessionEvidence = Object.freeze({
      sourceLogId: candidate.sourceLogId,
      date: candidate.date,
      startTime: candidate.startTime,
      exerciseId: candidate.exerciseId,
      exerciseName: candidate.exerciseName,
      category: candidate.category,
      dimensions: Object.freeze([...candidate.dimensions]),
      setEvidence: Object.freeze({ ...candidate.setEvidence }),
      e1RMEvidence: candidate.e1RMEvidence ? Object.freeze({ ...candidate.e1RMEvidence }) : undefined,
      loadVolumeEvidence: candidate.loadVolumeEvidence ? Object.freeze({ ...candidate.loadVolumeEvidence }) : undefined,
      workCapacityEvidence: candidate.workCapacityEvidence
        ? Object.freeze({
            totalSetCount: candidate.workCapacityEvidence.totalSetCount,
            totalReps: candidate.workCapacityEvidence.totalReps,
            loadGroups: Object.freeze(
              candidate.workCapacityEvidence.loadGroups.map(g =>
                Object.freeze({
                  ...g,
                  repsSeries: Object.freeze([...g.repsSeries])
                })
              )
            )
          })
        : undefined,
      interpretability: candidate.interpretability ? Object.freeze({ ...candidate.interpretability }) : undefined
    });

    historicalSessions.push(historicalSession);
  }

  // Sort descending by chronology (newest first)
  historicalSessions.sort(compareHistoricalStrengthSessionsChronologicalDesc);

  return Object.freeze({
    currentSourceLogId: currentInput.sourceLogId,
    exerciseId: currentInput.exerciseId,
    exerciseName: currentInput.exerciseName,
    currentDate: currentInput.date,
    currentStartTime: currentInput.startTime,
    historicalSessions: Object.freeze(historicalSessions),
    excludedCandidates: Object.freeze(excludedCandidates),
    historicalSessionCount: historicalSessions.length,
    excludedCandidateCount: excludedCandidates.length
  });
}

