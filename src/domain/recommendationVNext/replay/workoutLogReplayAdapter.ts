/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * WorkoutLog to VNext Replay Adapter (VNext Recommendation Engine - CU5.0)
 *
 * Deterministically converts raw WorkoutLog records into frozen StressMagnitudeInput
 * instances (StrengthStressMagnitudeInput / RunningStressMagnitudeInput) and
 * CanonicalRunningSession records using the established CU2/CU3 pipelines.
 *
 * Strict Invariants:
 * 1. Zero Input Mutation: Raw WorkoutLogs are read immutably.
 * 2. Complete Evidence Preservation: Peak e1RM, load volume, work capacity, and set roles are mapped faithfully.
 * 3. Deterministic Derivation: Produces identical outputs for identical log arrays.
 */

import { WorkoutLog } from '../../../types';
import { StressMagnitudeInput, StrengthStressMagnitudeInput, RunningStressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import { normalizeWorkoutLogSetRoles } from '../normalization/setRoleNormalization';
import { extractStandardStrengthObservationsFromWorkoutLog } from '../performance/strengthPerformanceObservation';
import { deriveEstimated1RMObservation } from '../performance/estimated1RMDerivation';
import { selectSessionPeakE1RMObservation } from '../performance/sessionPeakE1RMSelection';
import { deriveSetLoadVolumeObservation } from '../performance/loadVolumeDerivation';
import { aggregateSessionLoadVolume } from '../performance/sessionLoadVolumeAggregation';
import { deriveSessionWorkCapacityObservation } from '../performance/workCapacityObservation';
import { deriveRecordedSessionStressEvidence } from '../stress/recordedStressEvidence';
import { deriveStressMagnitudeInput } from '../stress/stressMagnitudeInputs';

export interface AdaptedReplayEvidence {
  readonly allStressMagnitudeInputs: readonly StressMagnitudeInput[];
  readonly strengthInputs: readonly StrengthStressMagnitudeInput[];
  readonly runningInputs: readonly RunningStressMagnitudeInput[];
  readonly runningSessions: readonly CanonicalRunningSession[];
}

/**
 * Converts an array of WorkoutLogs into standard VNext domain stress and running inputs.
 */
export function adaptWorkoutLogsToReplayEvidence(
  logs: readonly WorkoutLog[]
): AdaptedReplayEvidence {
  const allInputs: StressMagnitudeInput[] = [];
  const runningSessions: CanonicalRunningSession[] = [];

  for (const log of logs) {
    const evBundle = deriveRecordedSessionStressEvidence(log);
    const norm = normalizeWorkoutLogSetRoles(log);
    const allObs = extractStandardStrengthObservationsFromWorkoutLog(log, norm);

    for (const exEv of evBundle.exercises) {
      if (exEv.kind === 'running') {
        const res = deriveStressMagnitudeInput(exEv);
        if (res.status === 'input-ready') {
          allInputs.push(res.input);

          // Also construct CanonicalRunningSession representation
          const rInput = res.input as RunningStressMagnitudeInput;
          const canonicalRun: CanonicalRunningSession = Object.freeze({
            logId: log.id,
            date: log.date,
            startTime: log.startTime,
            exerciseName: 'Running',
            metrics: Object.freeze({
              distanceKm: rInput.distanceKm,
              durationSeconds: rInput.durationSeconds,
              paceSecondsPerKm: rInput.paceSecondsPerKm,
              sourceFormat: 'explicit-cardio-fields',
              provenance: Object.freeze({
                distance: rInput.metricProvenance.distanceProvenance,
                duration: rInput.metricProvenance.durationProvenance,
                distanceLegacyConflict: rInput.metricProvenance.distanceLegacyConflict,
                durationLegacyConflict: rInput.metricProvenance.durationLegacyConflict,
                hasLegacyConflict: rInput.metricProvenance.hasLegacyConflict,
              }),
              sourceConfidence: rInput.metricProvenance.sourceConfidence,
              runIntent: 'unknown' as const,
            }),
          });
          runningSessions.push(canonicalRun);
        }
      } else {
        const exObs = allObs.filter((o) => o.exerciseId === exEv.exerciseId);
        const peakE1RM = selectSessionPeakE1RMObservation(
          exObs.map(deriveEstimated1RMObservation).filter(Boolean)
        );
        const loadVolume = aggregateSessionLoadVolume(
          exObs.map(deriveSetLoadVolumeObservation).filter(Boolean)
        );
        const workCapacity = deriveSessionWorkCapacityObservation(exObs);
        const res = deriveStressMagnitudeInput(exEv, { peakE1RM, loadVolume, workCapacity });
        if (res.status === 'input-ready') {
          allInputs.push(res.input);
        }
      }
    }
  }

  const strengthInputs = Object.freeze(
    allInputs.filter((i): i is StrengthStressMagnitudeInput => i.kind === 'strength')
  );
  const runningInputs = Object.freeze(
    allInputs.filter((i): i is RunningStressMagnitudeInput => i.kind === 'running')
  );

  return Object.freeze({
    allStressMagnitudeInputs: Object.freeze(allInputs),
    strengthInputs,
    runningInputs,
    runningSessions: Object.freeze(runningSessions),
  });
}
