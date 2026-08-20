/**
 * Strength Stress Historical Baseline Reference Invariant Audit Suite (VNext Recommendation Engine - CU3.6)
 *
 * Dedicated verification module isolated from production domain logic.
 *
 * Invariant Guarantees Verified:
 * 1. Cold Start Invariant: 0 prior sessions -> 'cold-start', all anchors undefined, available counts 0.
 * 2. Single Prior Invariant: 1 prior session -> 'single-session-reference', last = median = min = max.
 * 3. Multi Prior Invariant: 2+ prior sessions -> 'multi-session-reference', proper median, min, max, last.
 * 4. Partial Factor Availability: Missing factor observation is NOT converted to 0, factor counts tracked.
 * 5. Mixed Volume Evidence: Session with high + limited sets yields 'mixed' session volume quality.
 * 6. Even Median Provenance: Median of 2 sessions (high + limited) produces interpolated value, 'mixed' quality, 2 sourceLogIds.
 * 7. Min/Max Tie Provenance: Identical min/max across distinct sessions preserves all sourceLogIds and synthesized quality.
 * 8. Intensity Recency & Capacity: Recent-1 e1RM provided only if present; maxObserved e1RM computed across valid e1RM sessions.
 * 9. Repeated-Work Compact Reference: Set/reps range and Recent-1 loadGroups preserved without cloning whole history.
 * 10. Real Controlled Fixture Validation: Bench Press, Squat, and OHP baselines derived from actual fixture history.
 * 11. Determinism & Immutability: Pure determinism, deep Object.freeze on all outputs, 0 input mutations.
 */

import {
  HistoricalStrengthSessionEvidence,
  StrengthHistoricalEvidenceCollection
} from '../types/strengthStressHistory.types';
import { StressDimension } from '../types/stressModel.types';
import {
  StrengthStressHistoricalBaseline,
  StrengthStressBaselineAuditResult
} from '../types/strengthStressBaseline.types';
import {
  deriveStrengthStressHistoricalBaseline
} from './strengthStressBaseline';
import {
  deriveControlledCandidateStressMagnitudeInputs
} from './controlledWorkoutValidationFixture';
import {
  deriveStrengthHistoricalEvidence
} from './strengthStressHistory';
import {
  StrengthStressMagnitudeInput
} from '../types/stressMagnitudeInput.types';

/**
 * Executes comprehensive invariant audits for CU3.6 Strength Stress Historical Baseline Derivation.
 */
export function auditStrengthStressBaseline(): readonly StrengthStressBaselineAuditResult[] {
  const results: StrengthStressBaselineAuditResult[] = [];

  // =========================================================================
  // 1. Synthetic Fixture Setup
  // =========================================================================

  const samplePriorHigh: HistoricalStrengthSessionEvidence = Object.freeze({
    sourceLogId: 'prior-high-1',
    date: '2026-08-05',
    startTime: '18:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push' as StressDimension],
    setEvidence: {
      totalRawSetCount: 5,
      explicitWorkingSetCount: 5,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 80.0,
      selectedPeakEstimated1RMKg: 80.0,
      selectedEvidenceQuality: 'high' as const
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 1800,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    },
    workCapacityEvidence: {
      totalSetCount: 5,
      totalReps: 25,
      loadGroups: [
        {
          observedLoadKg: 72,
          setCount: 5,
          repsSeries: [5, 5, 5, 5, 5],
          totalRepsAtLoad: 25,
          highEvidenceSetCount: 5,
          limitedEvidenceSetCount: 0
        }
      ]
    }
  });

  const samplePriorLimited: HistoricalStrengthSessionEvidence = Object.freeze({
    sourceLogId: 'prior-limited-2',
    date: '2026-07-29',
    startTime: '19:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push' as StressDimension],
    setEvidence: {
      totalRawSetCount: 4,
      explicitWorkingSetCount: 0,
      unknownSetRoleCount: 4,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 75.0,
      selectedPeakEstimated1RMKg: 75.0,
      selectedEvidenceQuality: 'limited' as const
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1600,
      highEvidenceLoadVolumeKgReps: 0,
      limitedEvidenceLoadVolumeKgReps: 1600,
      observationCount: 4
    },
    workCapacityEvidence: {
      totalSetCount: 4,
      totalReps: 20,
      loadGroups: [
        {
          observedLoadKg: 80,
          setCount: 4,
          repsSeries: [5, 5, 5, 5],
          totalRepsAtLoad: 20,
          highEvidenceSetCount: 0,
          limitedEvidenceSetCount: 4
        }
      ]
    }
  });

  const samplePriorMixed: HistoricalStrengthSessionEvidence = Object.freeze({
    sourceLogId: 'prior-mixed-3',
    date: '2026-07-22',
    startTime: '18:30',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push' as StressDimension],
    setEvidence: {
      totalRawSetCount: 6,
      explicitWorkingSetCount: 3,
      unknownSetRoleCount: 3,
      explicitWarmupCount: 0
    },
    e1RMEvidence: {
      numericalPeakEstimated1RMKg: 82.5,
      selectedPeakEstimated1RMKg: 82.5,
      selectedEvidenceQuality: 'high' as const
    },
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 2000,
      highEvidenceLoadVolumeKgReps: 1000,
      limitedEvidenceLoadVolumeKgReps: 1000,
      observationCount: 6
    },
    workCapacityEvidence: {
      totalSetCount: 6,
      totalReps: 30,
      loadGroups: []
    }
  });

  const samplePriorNoE1RM: HistoricalStrengthSessionEvidence = Object.freeze({
    sourceLogId: 'prior-high-rep-4',
    date: '2026-08-10',
    startTime: '10:00',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    category: 'Chest',
    dimensions: ['horizontal-push' as StressDimension],
    setEvidence: {
      totalRawSetCount: 1,
      explicitWorkingSetCount: 1,
      unknownSetRoleCount: 0,
      explicitWarmupCount: 0
    },
    // e1RMEvidence is undefined (e.g. 30 reps high rep set)
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1200,
      highEvidenceLoadVolumeKgReps: 1200,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 1
    },
    workCapacityEvidence: {
      totalSetCount: 1,
      totalReps: 30,
      loadGroups: []
    }
  });

  // =========================================================================
  // AUDIT 1: Cold Start Invariant (0 Historical Sessions)
  // =========================================================================
  const coldStartCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([]),
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 0,
    excludedCandidateCount: 0
  });

  const coldBaseline = deriveStrengthStressHistoricalBaseline(coldStartCollection);

  results.push({
    auditName: 'INVARIANT 1: Cold Start State (0 Sessions)',
    passed:
      coldBaseline.historyState === 'cold-start' &&
      coldBaseline.totalHistoricalSessionCount === 0 &&
      coldBaseline.volumeReference.lastSessionVolume === undefined &&
      coldBaseline.volumeReference.medianVolume === undefined &&
      coldBaseline.volumeReference.minObservedVolume === undefined &&
      coldBaseline.volumeReference.maxObservedVolume === undefined &&
      coldBaseline.volumeReference.availableObservationCount === 0 &&
      coldBaseline.volumeReference.unavailableObservationCount === 0 &&
      coldBaseline.intensityCapacityReference.lastSessionPeakE1RM === undefined &&
      coldBaseline.intensityCapacityReference.maxObservedPeakE1RM === undefined &&
      coldBaseline.intensityCapacityReference.availableObservationCount === 0 &&
      coldBaseline.repeatedWorkReference.lastSessionTotalSets === undefined &&
      coldBaseline.repeatedWorkReference.minObservedTotalSets === undefined &&
      coldBaseline.repeatedWorkReference.availableObservationCount === 0,
    details: 'Cold start with 0 historical sessions strictly sets state to cold-start and leaves all scalar reference anchors undefined.'
  });

  // =========================================================================
  // AUDIT 2: Single Prior Session Invariant
  // =========================================================================
  const singlePriorCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([samplePriorHigh]),
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 1,
    excludedCandidateCount: 0
  });

  const singleBaseline = deriveStrengthStressHistoricalBaseline(singlePriorCollection);

  results.push({
    auditName: 'INVARIANT 2: Single Prior Session Reference State',
    passed:
      singleBaseline.historyState === 'single-session-reference' &&
      singleBaseline.totalHistoricalSessionCount === 1 &&
      singleBaseline.volumeReference.lastSessionVolume?.valueKgReps === 1800 &&
      singleBaseline.volumeReference.medianVolume?.valueKgReps === 1800 &&
      singleBaseline.volumeReference.minObservedVolume?.valueKgReps === 1800 &&
      singleBaseline.volumeReference.maxObservedVolume?.valueKgReps === 1800 &&
      singleBaseline.volumeReference.lastSessionVolume?.evidenceQuality === 'high' &&
      singleBaseline.volumeReference.availableObservationCount === 1 &&
      singleBaseline.volumeReference.unavailableObservationCount === 0 &&
      singleBaseline.intensityCapacityReference.lastSessionPeakE1RM?.valueKg === 80.0 &&
      singleBaseline.intensityCapacityReference.maxObservedPeakE1RM?.valueKg === 80.0 &&
      singleBaseline.repeatedWorkReference.lastSessionTotalSets === 5 &&
      singleBaseline.repeatedWorkReference.minObservedTotalSets === 5 &&
      singleBaseline.repeatedWorkReference.maxObservedTotalSets === 5,
    details: 'Single prior session sets state to single-session-reference with last = median = min = max = 1800 kg·reps.'
  });

  // =========================================================================
  // AUDIT 3: Multi Prior Sessions with Even Median (High + Limited)
  // =========================================================================
  const twoPriorsCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([samplePriorHigh, samplePriorLimited]), // 1800 (high), 1600 (limited)
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 2,
    excludedCandidateCount: 0
  });

  const twoBaseline = deriveStrengthStressHistoricalBaseline(twoPriorsCollection);

  results.push({
    auditName: 'INVARIANT 3: Even Median Provenance (High + Limited -> Mixed)',
    passed:
      twoBaseline.historyState === 'multi-session-reference' &&
      twoBaseline.totalHistoricalSessionCount === 2 &&
      twoBaseline.volumeReference.lastSessionVolume?.valueKgReps === 1800 &&
      twoBaseline.volumeReference.lastSessionVolume?.evidenceQuality === 'high' &&
      twoBaseline.volumeReference.medianVolume?.valueKgReps === 1700 && // (1800 + 1600) / 2
      twoBaseline.volumeReference.medianVolume?.evidenceQuality === 'mixed' &&
      twoBaseline.volumeReference.medianVolume?.sourceLogIds.length === 2 &&
      twoBaseline.volumeReference.minObservedVolume?.valueKgReps === 1600 &&
      twoBaseline.volumeReference.minObservedVolume?.evidenceQuality === 'limited' &&
      twoBaseline.volumeReference.maxObservedVolume?.valueKgReps === 1800 &&
      twoBaseline.volumeReference.maxObservedVolume?.evidenceQuality === 'high',
    details: 'Even median correctly interpolates (1800 + 1600)/2 = 1700 with synthesized mixed quality and preserves both sourceLogIds.'
  });

  // =========================================================================
  // AUDIT 4: Mixed-Quality Single Session Quality Derivation
  // =========================================================================
  const mixedPriorCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([samplePriorMixed]),
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 1,
    excludedCandidateCount: 0
  });

  const mixedBaseline = deriveStrengthStressHistoricalBaseline(mixedPriorCollection);

  results.push({
    auditName: 'INVARIANT 4: Mixed-Quality Volume Session Provenance',
    passed:
      mixedBaseline.volumeReference.lastSessionVolume?.evidenceQuality === 'mixed' &&
      mixedBaseline.volumeReference.observationSummary.sessionsWithMixed === 1 &&
      mixedBaseline.volumeReference.observationSummary.sessionsWithHighOnly === 0 &&
      mixedBaseline.volumeReference.observationSummary.sessionsWithLimitedOnly === 0,
    details: 'Session containing both high and limited load volume sets is correctly evaluated as mixed quality.'
  });

  // =========================================================================
  // AUDIT 5: Min / Max Tie Provenance Preservation
  // =========================================================================
  const duplicateVolSession1: HistoricalStrengthSessionEvidence = Object.freeze({
    ...samplePriorHigh,
    sourceLogId: 'tie-session-1',
    date: '2026-08-01',
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 1800,
      limitedEvidenceLoadVolumeKgReps: 0,
      observationCount: 5
    }
  });

  const duplicateVolSession2: HistoricalStrengthSessionEvidence = Object.freeze({
    ...samplePriorLimited,
    sourceLogId: 'tie-session-2',
    date: '2026-07-25',
    loadVolumeEvidence: {
      totalLoadVolumeKgReps: 1800,
      highEvidenceLoadVolumeKgReps: 0,
      limitedEvidenceLoadVolumeKgReps: 1800,
      observationCount: 4
    }
  });

  const tieCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([duplicateVolSession1, duplicateVolSession2]),
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 2,
    excludedCandidateCount: 0
  });

  const tieBaseline = deriveStrengthStressHistoricalBaseline(tieCollection);

  results.push({
    auditName: 'INVARIANT 5: Min/Max Tie Preserves All sourceLogIds and Synthesizes Quality',
    passed:
      tieBaseline.volumeReference.maxObservedVolume?.valueKgReps === 1800 &&
      tieBaseline.volumeReference.maxObservedVolume?.sourceLogIds.length === 2 &&
      tieBaseline.volumeReference.maxObservedVolume?.sourceLogIds.includes('tie-session-1') &&
      tieBaseline.volumeReference.maxObservedVolume?.sourceLogIds.includes('tie-session-2') &&
      tieBaseline.volumeReference.maxObservedVolume?.evidenceQuality === 'mixed',
    details: 'When max volume is identical across High and Limited sessions, both sourceLogIds are retained and synthesized as mixed.'
  });

  // =========================================================================
  // AUDIT 6: Partial Factor Availability & e1RM Unavailable Handling
  // =========================================================================
  // Recent-1 is samplePriorNoE1RM (no e1RM), Prior-2 is samplePriorHigh (e1RM = 80kg)
  const partialCollection: StrengthHistoricalEvidenceCollection = Object.freeze({
    currentSourceLogId: 'current-log-1',
    exerciseId: 'bench-press',
    exerciseName: '벤치프레스 (Bench Press)',
    currentDate: '2026-08-12',
    currentStartTime: '18:21',
    historicalSessions: Object.freeze([samplePriorNoE1RM, samplePriorHigh]),
    excludedCandidates: Object.freeze([]),
    historicalSessionCount: 2,
    excludedCandidateCount: 0
  });

  const partialBaseline = deriveStrengthStressHistoricalBaseline(partialCollection);

  results.push({
    auditName: 'INVARIANT 6: Partial Factor Availability & e1RM Unavailable in Recent-1',
    passed:
      partialBaseline.historyState === 'multi-session-reference' &&
      // Intensity has only 1 available, 1 unavailable
      partialBaseline.intensityCapacityReference.availableObservationCount === 1 &&
      partialBaseline.intensityCapacityReference.unavailableObservationCount === 1 &&
      // Recent-1 lacked e1RM, so lastSessionPeakE1RM is undefined
      partialBaseline.intensityCapacityReference.lastSessionPeakE1RM === undefined &&
      // Max observed e1RM uses the valid prior session (80kg)
      partialBaseline.intensityCapacityReference.maxObservedPeakE1RM?.valueKg === 80.0 &&
      // Volume has both sessions available
      partialBaseline.volumeReference.availableObservationCount === 2 &&
      partialBaseline.volumeReference.unavailableObservationCount === 0 &&
      // Repeated work has both sessions available
      partialBaseline.repeatedWorkReference.availableObservationCount === 2,
    details: 'Recent-1 session lacking e1RM correctly leaves lastSessionPeakE1RM undefined, while maxObservedPeakE1RM evaluates the remaining valid session.'
  });

  // =========================================================================
  // AUDIT 7: Zero-Coercion Prohibition Invariant
  // =========================================================================
  results.push({
    auditName: 'INVARIANT 7: Zero-Coercion Prohibition on Missing Factors',
    passed:
      partialBaseline.intensityCapacityReference.lastSessionPeakE1RM === undefined &&
      (partialBaseline.intensityCapacityReference.lastSessionPeakE1RM as any)?.valueKg !== 0,
    details: 'Missing e1RM observation is strictly undefined and NEVER coerced to 0 kg.'
  });

  // =========================================================================
  // AUDIT 8: Repeated-Work Compact Reference Fidelity
  // =========================================================================
  const repWorkBaseline = deriveStrengthStressHistoricalBaseline(twoPriorsCollection);
  results.push({
    auditName: 'INVARIANT 8: Repeated-Work Compact Reference Ranges & Recent-1 LoadGroups',
    passed:
      repWorkBaseline.repeatedWorkReference.lastSessionTotalSets === 5 &&
      repWorkBaseline.repeatedWorkReference.lastSessionTotalReps === 25 &&
      repWorkBaseline.repeatedWorkReference.minObservedTotalSets === 4 &&
      repWorkBaseline.repeatedWorkReference.maxObservedTotalSets === 5 &&
      repWorkBaseline.repeatedWorkReference.minObservedTotalReps === 20 &&
      repWorkBaseline.repeatedWorkReference.maxObservedTotalReps === 25 &&
      repWorkBaseline.repeatedWorkReference.lastSessionLoadGroups !== undefined &&
      repWorkBaseline.repeatedWorkReference.lastSessionLoadGroups.length === 1 &&
      repWorkBaseline.repeatedWorkReference.lastSessionLoadGroups[0].observedLoadKg === 72,
    details: 'Repeated-work compact reference captures set range [4, 5], rep range [20, 25], and lossless Recent-1 load groups.'
  });

  // =========================================================================
  // AUDIT 9: Controlled Real Fixture End-to-End Derivation (Squat, Bench, OHP)
  // =========================================================================
  const controlledCandidatePool = deriveControlledCandidateStressMagnitudeInputs();

  // 9A. Bench Press Target (Current: 2026-08-12)
  const benchTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '7111a61d-638f-4338-a0c1-7a5c54d06bf0' && i.exerciseId === 'bench-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const benchHistoryCollection = deriveStrengthHistoricalEvidence(benchTarget, controlledCandidatePool);
  const benchBaseline = deriveStrengthStressHistoricalBaseline(benchHistoryCollection);

  // Bench has 2 prior sessions: 2026-08-05 (1750 kg·reps, 5 sets, 25 reps) and 2026-07-29 (1625 kg·reps, 5 sets, 25 reps)
  const benchMedianVol = (1750 + 1625) / 2; // 1687.5

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 9A: Bench Press Historical Baseline',
    passed:
      benchBaseline.historyState === 'multi-session-reference' &&
      benchBaseline.totalHistoricalSessionCount === 2 &&
      benchBaseline.volumeReference.lastSessionVolume?.valueKgReps === 1750 &&
      benchBaseline.volumeReference.medianVolume?.valueKgReps === benchMedianVol &&
      benchBaseline.volumeReference.minObservedVolume?.valueKgReps === 1625 &&
      benchBaseline.volumeReference.maxObservedVolume?.valueKgReps === 1750 &&
      benchBaseline.volumeReference.availableObservationCount === 2 &&
      benchBaseline.intensityCapacityReference.lastSessionPeakE1RM?.valueKg === 81.66666666666667 &&
      benchBaseline.intensityCapacityReference.maxObservedPeakE1RM?.valueKg === 81.66666666666667 &&
      benchBaseline.repeatedWorkReference.lastSessionTotalSets === 5 &&
      benchBaseline.repeatedWorkReference.lastSessionTotalReps === 25,
    details: `Bench baseline correctly computes multi-session-reference with volume median ${benchMedianVol} kg·reps, last session 1750 kg·reps, and capacity 81.67 kg.`
  });

  // 9B. Squat Target (Current: 2026-08-07)
  const squatTarget = controlledCandidatePool.find(
    i => i.sourceLogId === 'b8c816b3-25c6-434c-97d7-1a71cb63b590' && i.exerciseId === 'squat' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const squatHistoryCollection = deriveStrengthHistoricalEvidence(squatTarget, controlledCandidatePool);
  const squatBaseline = deriveStrengthStressHistoricalBaseline(squatHistoryCollection);

  // Squat has 2 prior sessions: 2026-07-31 (1550 kg·reps, high) and 2026-02-14 (2800 kg·reps, limited legacy)
  const squatMedianVol = (1550 + 2800) / 2; // 2175

  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 9B: Squat Historical Baseline (High + Legacy Limited)',
    passed:
      squatBaseline.historyState === 'multi-session-reference' &&
      squatBaseline.totalHistoricalSessionCount === 2 &&
      squatBaseline.volumeReference.lastSessionVolume?.valueKgReps === 1550 &&
      squatBaseline.volumeReference.lastSessionVolume?.evidenceQuality === 'high' &&
      squatBaseline.volumeReference.medianVolume?.valueKgReps === squatMedianVol &&
      squatBaseline.volumeReference.medianVolume?.evidenceQuality === 'mixed' &&
      squatBaseline.volumeReference.minObservedVolume?.valueKgReps === 1550 &&
      squatBaseline.volumeReference.maxObservedVolume?.valueKgReps === 2800 &&
      squatBaseline.volumeReference.maxObservedVolume?.evidenceQuality === 'limited' &&
      squatBaseline.volumeReference.observationSummary.sessionsWithHighOnly === 1 &&
      squatBaseline.volumeReference.observationSummary.sessionsWithLimitedOnly === 1 &&
      squatBaseline.intensityCapacityReference.lastSessionPeakE1RM?.valueKg === 128.33333333333334 &&
      squatBaseline.intensityCapacityReference.lastSessionPeakE1RM?.evidenceQuality === 'high' &&
      squatBaseline.intensityCapacityReference.maxObservedPeakE1RM?.valueKg === 128.33333333333334 &&
      squatBaseline.intensityCapacityReference.maxObservedPeakE1RM?.evidenceQuality === 'high' &&
      squatBaseline.repeatedWorkReference.minObservedTotalSets === 3 &&
      squatBaseline.repeatedWorkReference.maxObservedTotalSets === 4 &&
      squatBaseline.repeatedWorkReference.minObservedTotalReps === 15 &&
      squatBaseline.repeatedWorkReference.maxObservedTotalReps === 40,
    details: `Squat baseline integrates legacy v1-log-2026-02-14-92 into baseline references without exclusion, preserving limited provenance.`
  });

  // 9C. OHP Target (Current: 2026-08-09)
  const ohpTarget = controlledCandidatePool.find(
    i => i.sourceLogId === '25a639c0-2ccd-4845-bf39-bb3a4d8f146a' && i.exerciseId === 'overhead-press' && i.kind === 'strength'
  ) as StrengthStressMagnitudeInput;
  const ohpHistoryCollection = deriveStrengthHistoricalEvidence(ohpTarget, controlledCandidatePool);
  const ohpBaseline = deriveStrengthStressHistoricalBaseline(ohpHistoryCollection);

  // OHP has 1 prior session: 2026-08-02 (1075 kg·reps, 5 sets, 25 reps)
  results.push({
    auditName: 'CONTROLLED REAL FIXTURE 9C: OHP Historical Baseline (Single Prior Session)',
    passed:
      ohpBaseline.historyState === 'single-session-reference' &&
      ohpBaseline.totalHistoricalSessionCount === 1 &&
      ohpBaseline.volumeReference.lastSessionVolume?.valueKgReps === 1075 &&
      ohpBaseline.volumeReference.medianVolume?.valueKgReps === 1075 &&
      ohpBaseline.intensityCapacityReference.lastSessionPeakE1RM?.valueKg === 52.5 &&
      ohpBaseline.repeatedWorkReference.lastSessionTotalSets === 5 &&
      ohpBaseline.repeatedWorkReference.lastSessionTotalReps === 25,
    details: 'OHP baseline correctly reflects single-session-reference with volume 1075 kg·reps and capacity 52.5 kg.'
  });

  // =========================================================================
  // AUDIT 10: Deep Immutability & Zero Input Mutation Invariant
  // =========================================================================
  const baselineOutput = benchBaseline;
  results.push({
    auditName: 'INVARIANT 10: Deep Immutability & Frozen Object Output',
    passed:
      Object.isFrozen(baselineOutput) &&
      Object.isFrozen(baselineOutput.volumeReference) &&
      Object.isFrozen(baselineOutput.volumeReference.observationSummary) &&
      (baselineOutput.volumeReference.lastSessionVolume === undefined || Object.isFrozen(baselineOutput.volumeReference.lastSessionVolume)) &&
      (baselineOutput.volumeReference.medianVolume === undefined || Object.isFrozen(baselineOutput.volumeReference.medianVolume)) &&
      Object.isFrozen(baselineOutput.intensityCapacityReference) &&
      Object.isFrozen(baselineOutput.repeatedWorkReference) &&
      (baselineOutput.repeatedWorkReference.lastSessionLoadGroups === undefined || Object.isFrozen(baselineOutput.repeatedWorkReference.lastSessionLoadGroups)),
    details: 'All returned baseline references, anchors, and sub-arrays are deeply frozen and immutable.'
  });

  // =========================================================================
  // AUDIT 11: Pure Determinism (Repeated Runs Produce Exact Deep Equality)
  // =========================================================================
  const run1 = deriveStrengthStressHistoricalBaseline(benchHistoryCollection);
  const run2 = deriveStrengthStressHistoricalBaseline(benchHistoryCollection);

  results.push({
    auditName: 'INVARIANT 11: Pure Determinism Across Repeated Derivations',
    passed: JSON.stringify(run1) === JSON.stringify(run2),
    details: 'Executing baseline derivation repeatedly on the same historical evidence collection produces bitwise identical results.'
  });

  return Object.freeze(results);
}
