/**
 * Strength Stress Historical Baseline Reference Derivation (VNext Recommendation Engine - CU3.6)
 *
 * Pure function pipeline to derive empirical baseline anchors and capacity references
 * from CU3.5 Historical Evidence Collections.
 *
 * Strict Guarantees:
 * - ZERO Normalization, Ratios, or Z-Scores.
 * - ZERO Stress Magnitude or Fatigue Scoring.
 * - ZERO Weighting, Decay, Readiness, or Recommendations.
 * - ZERO Zero-Coercion of missing factor observations.
 * - Factor-Specific Observation Pool isolation.
 * - Lossless Anchor Provenance and Tie Synthesis.
 * - Complete Deep Immutability & Pure Determinism.
 */

import {
  HistoricalStrengthSessionEvidence,
  StrengthHistoricalEvidenceCollection
} from '../types/strengthStressHistory.types';
import {
  BaselineEvidenceQuality,
  StrengthHistoryState,
  VolumeReferenceAnchor,
  VolumeHistoricalReference,
  IntensityCapacityAnchor,
  IntensityCapacityHistoricalReference,
  RepeatedWorkCompactReference,
  StrengthStressHistoricalBaseline
} from '../types/strengthStressBaseline.types';

/**
 * Determines the baseline evidence quality of a single historical session's volume observation.
 */
function getSessionVolumeQuality(session: HistoricalStrengthSessionEvidence): BaselineEvidenceQuality {
  if (!session.loadVolumeEvidence) {
    return 'limited';
  }
  const high = session.loadVolumeEvidence.highEvidenceLoadVolumeKgReps ?? 0;
  const limited = session.loadVolumeEvidence.limitedEvidenceLoadVolumeKgReps ?? 0;

  if (high > 0 && limited === 0) {
    return 'high';
  }
  if (limited > 0 && high === 0) {
    return 'limited';
  }
  if (high > 0 && limited > 0) {
    return 'mixed';
  }

  // Edge case: 0 volume recorded
  return session.setEvidence.unknownSetRoleCount > 0 ? 'limited' : 'high';
}

/**
 * Combines multiple evidence quality tags into a synthesized quality.
 * - All 'high' -> 'high'
 * - All 'limited' -> 'limited'
 * - Any mix or presence of 'mixed' -> 'mixed'
 */
function combineEvidenceQualities(qualities: readonly BaselineEvidenceQuality[]): BaselineEvidenceQuality {
  if (qualities.length === 0) {
    return 'limited';
  }
  if (qualities.every(q => q === 'high')) {
    return 'high';
  }
  if (qualities.every(q => q === 'limited')) {
    return 'limited';
  }
  return 'mixed';
}

/**
 * Pure function to derive the Strength Stress Historical Baseline Reference.
 *
 * @param historyCollection Immutable CU3.5 collection of strictly-earlier same-exercise sessions.
 * @returns Fully frozen StrengthStressHistoricalBaseline.
 */
export function deriveStrengthStressHistoricalBaseline(
  historyCollection: StrengthHistoricalEvidenceCollection
): StrengthStressHistoricalBaseline {
  if (!historyCollection) {
    throw new Error('Contract Violation: historyCollection must be provided.');
  }

  const historicalSessions = historyCollection.historicalSessions;
  const totalCount = historicalSessions.length;

  // 1. History State (determined solely by total historical session count)
  let historyState: StrengthHistoryState;
  if (totalCount === 0) {
    historyState = 'cold-start';
  } else if (totalCount === 1) {
    historyState = 'single-session-reference';
  } else {
    historyState = 'multi-session-reference';
  }

  const recent1Session: HistoricalStrengthSessionEvidence | undefined = historicalSessions[0];

  // 2. Volume Historical Reference
  const validVolumeSessions = historicalSessions.filter(
    s => s.loadVolumeEvidence !== undefined && typeof s.loadVolumeEvidence.totalLoadVolumeKgReps === 'number'
  );
  const volumeAvailableCount = validVolumeSessions.length;
  const volumeUnavailableCount = totalCount - volumeAvailableCount;

  let highCount = 0;
  let limitedCount = 0;
  let mixedCount = 0;

  for (const s of validVolumeSessions) {
    const q = getSessionVolumeQuality(s);
    if (q === 'high') highCount++;
    else if (q === 'limited') limitedCount++;
    else mixedCount++;
  }

  let lastSessionVolume: VolumeReferenceAnchor | undefined;
  if (recent1Session?.loadVolumeEvidence) {
    lastSessionVolume = Object.freeze({
      valueKgReps: recent1Session.loadVolumeEvidence.totalLoadVolumeKgReps,
      evidenceQuality: getSessionVolumeQuality(recent1Session),
      sourceLogIds: Object.freeze([recent1Session.sourceLogId])
    });
  }

  let medianVolume: VolumeReferenceAnchor | undefined;
  let minObservedVolume: VolumeReferenceAnchor | undefined;
  let maxObservedVolume: VolumeReferenceAnchor | undefined;

  if (volumeAvailableCount > 0) {
    // Sort ascending by volume
    const sortedByVol = [...validVolumeSessions].sort(
      (a, b) => a.loadVolumeEvidence!.totalLoadVolumeKgReps - b.loadVolumeEvidence!.totalLoadVolumeKgReps
    );

    // Min Volume (with tie preservation)
    const minVolVal = sortedByVol[0].loadVolumeEvidence!.totalLoadVolumeKgReps;
    const minSessions = validVolumeSessions.filter(
      s => s.loadVolumeEvidence!.totalLoadVolumeKgReps === minVolVal
    );
    minObservedVolume = Object.freeze({
      valueKgReps: minVolVal,
      evidenceQuality: combineEvidenceQualities(minSessions.map(getSessionVolumeQuality)),
      sourceLogIds: Object.freeze(minSessions.map(s => s.sourceLogId))
    });

    // Max Volume (with tie preservation)
    const maxVolVal = sortedByVol[sortedByVol.length - 1].loadVolumeEvidence!.totalLoadVolumeKgReps;
    const maxSessions = validVolumeSessions.filter(
      s => s.loadVolumeEvidence!.totalLoadVolumeKgReps === maxVolVal
    );
    maxObservedVolume = Object.freeze({
      valueKgReps: maxVolVal,
      evidenceQuality: combineEvidenceQualities(maxSessions.map(getSessionVolumeQuality)),
      sourceLogIds: Object.freeze(maxSessions.map(s => s.sourceLogId))
    });

    // Median Volume
    if (sortedByVol.length % 2 === 1) {
      const midIndex = Math.floor(sortedByVol.length / 2);
      const midSession = sortedByVol[midIndex];
      medianVolume = Object.freeze({
        valueKgReps: midSession.loadVolumeEvidence!.totalLoadVolumeKgReps,
        evidenceQuality: getSessionVolumeQuality(midSession),
        sourceLogIds: Object.freeze([midSession.sourceLogId])
      });
    } else {
      const midIndex1 = sortedByVol.length / 2 - 1;
      const midIndex2 = sortedByVol.length / 2;
      const s1 = sortedByVol[midIndex1];
      const s2 = sortedByVol[midIndex2];
      const avgVal = (s1.loadVolumeEvidence!.totalLoadVolumeKgReps + s2.loadVolumeEvidence!.totalLoadVolumeKgReps) / 2;
      const qualities = [getSessionVolumeQuality(s1), getSessionVolumeQuality(s2)];
      const sourceLogIds = s1.sourceLogId === s2.sourceLogId
        ? [s1.sourceLogId]
        : [s1.sourceLogId, s2.sourceLogId];

      medianVolume = Object.freeze({
        valueKgReps: avgVal,
        evidenceQuality: combineEvidenceQualities(qualities),
        sourceLogIds: Object.freeze(sourceLogIds)
      });
    }
  }

  const volumeReference: VolumeHistoricalReference = Object.freeze({
    lastSessionVolume,
    medianVolume,
    minObservedVolume,
    maxObservedVolume,
    availableObservationCount: volumeAvailableCount,
    unavailableObservationCount: volumeUnavailableCount,
    observationSummary: Object.freeze({
      sessionsWithHighOnly: highCount,
      sessionsWithLimitedOnly: limitedCount,
      sessionsWithMixed: mixedCount
    })
  });

  // 3. Intensity Capacity Historical Reference
  const validE1RMSessions = historicalSessions.filter(
    s => s.e1RMEvidence !== undefined && typeof s.e1RMEvidence.selectedPeakEstimated1RMKg === 'number'
  );
  const e1RMAvailableCount = validE1RMSessions.length;
  const e1RMUnavailableCount = totalCount - e1RMAvailableCount;

  let lastSessionPeakE1RM: {
    readonly valueKg: number;
    readonly evidenceQuality: 'high' | 'limited';
    readonly sourceLogId: string;
    readonly date: string;
  } | undefined;

  if (recent1Session?.e1RMEvidence?.selectedPeakEstimated1RMKg !== undefined) {
    lastSessionPeakE1RM = Object.freeze({
      valueKg: recent1Session.e1RMEvidence.selectedPeakEstimated1RMKg,
      evidenceQuality: recent1Session.e1RMEvidence.selectedEvidenceQuality,
      sourceLogId: recent1Session.sourceLogId,
      date: recent1Session.date
    });
  }

  let maxObservedPeakE1RM: IntensityCapacityAnchor | undefined;
  if (e1RMAvailableCount > 0) {
    const maxVal = Math.max(...validE1RMSessions.map(s => s.e1RMEvidence!.selectedPeakEstimated1RMKg));
    const maxSessions = validE1RMSessions.filter(
      s => Math.abs(s.e1RMEvidence!.selectedPeakEstimated1RMKg - maxVal) < 1e-6
    );
    const qualities = maxSessions.map(s => s.e1RMEvidence!.selectedEvidenceQuality as BaselineEvidenceQuality);
    maxObservedPeakE1RM = Object.freeze({
      valueKg: maxVal,
      evidenceQuality: combineEvidenceQualities(qualities),
      sourceLogIds: Object.freeze(maxSessions.map(s => s.sourceLogId)),
      dates: Object.freeze(maxSessions.map(s => s.date))
    });
  }

  const intensityCapacityReference: IntensityCapacityHistoricalReference = Object.freeze({
    lastSessionPeakE1RM,
    maxObservedPeakE1RM,
    availableObservationCount: e1RMAvailableCount,
    unavailableObservationCount: e1RMUnavailableCount
  });

  // 4. Repeated-Work Compact Reference
  const validWorkCapSessions = historicalSessions.filter(
    s => s.workCapacityEvidence !== undefined && typeof s.workCapacityEvidence.totalSetCount === 'number'
  );
  const workCapAvailableCount = validWorkCapSessions.length;
  const workCapUnavailableCount = totalCount - workCapAvailableCount;

  let lastSessionTotalSets: number | undefined;
  let lastSessionTotalReps: number | undefined;
  let lastSessionLoadGroups: RepeatedWorkCompactReference['lastSessionLoadGroups'] | undefined;

  if (recent1Session?.workCapacityEvidence) {
    lastSessionTotalSets = recent1Session.workCapacityEvidence.totalSetCount;
    lastSessionTotalReps = recent1Session.workCapacityEvidence.totalReps;
    lastSessionLoadGroups = Object.freeze(
      recent1Session.workCapacityEvidence.loadGroups.map(lg =>
        Object.freeze({
          observedLoadKg: lg.observedLoadKg,
          setCount: lg.setCount,
          repsSeries: Object.freeze([...lg.repsSeries]),
          totalRepsAtLoad: lg.totalRepsAtLoad,
          highEvidenceSetCount: lg.highEvidenceSetCount,
          limitedEvidenceSetCount: lg.limitedEvidenceSetCount
        })
      )
    );
  }

  let minObservedTotalSets: number | undefined;
  let maxObservedTotalSets: number | undefined;
  let minObservedTotalReps: number | undefined;
  let maxObservedTotalReps: number | undefined;

  if (workCapAvailableCount > 0) {
    const setCounts = validWorkCapSessions.map(s => s.workCapacityEvidence!.totalSetCount);
    const repsCounts = validWorkCapSessions.map(s => s.workCapacityEvidence!.totalReps);
    minObservedTotalSets = Math.min(...setCounts);
    maxObservedTotalSets = Math.max(...setCounts);
    minObservedTotalReps = Math.min(...repsCounts);
    maxObservedTotalReps = Math.max(...repsCounts);
  }

  const repeatedWorkReference: RepeatedWorkCompactReference = Object.freeze({
    lastSessionTotalSets,
    lastSessionTotalReps,
    lastSessionLoadGroups,
    minObservedTotalSets,
    maxObservedTotalSets,
    minObservedTotalReps,
    maxObservedTotalReps,
    availableObservationCount: workCapAvailableCount,
    unavailableObservationCount: workCapUnavailableCount
  });

  // 5. Final Root Baseline Assembly
  return Object.freeze({
    currentSourceLogId: historyCollection.currentSourceLogId,
    exerciseId: historyCollection.exerciseId,
    exerciseName: historyCollection.exerciseName,
    currentDate: historyCollection.currentDate,
    currentStartTime: historyCollection.currentStartTime,
    historyState,
    totalHistoricalSessionCount: totalCount,
    volumeReference,
    intensityCapacityReference,
    repeatedWorkReference
  });
}
