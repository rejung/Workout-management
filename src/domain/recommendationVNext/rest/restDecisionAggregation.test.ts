/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { deriveEvaluationContext } from '../stress/residualStressTrace';
import {
  deriveRecentTrainingContext,
  deriveSystemicTrainingDemandContext,
  deriveRestDecisionEvidence,
} from './restDecisionEvidence';
import { StressDimension } from '../types/stressModel.types';
import {
  StrengthStressMagnitudeInput,
  RunningStressMagnitudeInput,
} from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import { AllDimensionResidualStates } from '../types/dimensionResidualState.types';
import { CandidateDecisionEvidence } from '../types/candidateDecision.types';

export interface AggregationTestResult {
  readonly id: string;
  readonly description: string;
  readonly passed: boolean;
  readonly details: string;
}

function makeRunningSession(opts: {
  readonly sourceLogId: string;
  readonly date: string;
  readonly startTime?: string;
  readonly distanceKm?: number;
  readonly durationSeconds?: number;
  readonly exerciseName?: string;
  readonly dimensions?: readonly StressDimension[];
}): RunningStressMagnitudeInput {
  const dims = opts.dimensions ?? (['knee-dominant-lower-body', 'hip-posterior-chain'] as const);
  return Object.freeze({
    kind: 'running',
    sourceLogId: opts.sourceLogId,
    exerciseId: 'running',
    exerciseName: opts.exerciseName ?? 'Running',
    date: opts.date,
    startTime: opts.startTime,
    dimensions: dims,
    distanceKm: opts.distanceKm,
    durationSeconds: opts.durationSeconds,
    paceSecondsPerKm:
      opts.distanceKm && opts.durationSeconds
        ? opts.durationSeconds / opts.distanceKm
        : undefined,
    metricProvenance: {
      distanceProvenance: 'explicit' as const,
      durationProvenance: 'explicit' as const,
      distanceLegacyConflict: false,
      durationLegacyConflict: false,
      hasLegacyConflict: false,
      sourceConfidence: 'high' as const,
    },
  });
}

const emptyResidualStates: AllDimensionResidualStates = Object.freeze({
  'knee-dominant-lower-body': {
    dimension: 'knee-dominant-lower-body',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'hip-posterior-chain': {
    dimension: 'hip-posterior-chain',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'horizontal-push': {
    dimension: 'horizontal-push',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'vertical-push': {
    dimension: 'vertical-push',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'horizontal-pull': {
    dimension: 'horizontal-pull',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'vertical-pull': {
    dimension: 'vertical-pull',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
  'axial-systemic-loading': {
    dimension: 'axial-systemic-loading',
    strongestPersistence: { definite: 'none', bracketPersistence: undefined },
    modalitySummary: { hasStrength: false, hasRunning: false },
    uncertainTraces: [],
    uncertaintyMetadata: { bracketTraceCount: 0, hasTemporalUncertainty: false },
  },
} as any);

const dummyCandidateDecisions: readonly CandidateDecisionEvidence[] = Object.freeze([]);

export function runAggregationTestSuite(): readonly AggregationTestResult[] {
  const results: AggregationTestResult[] = [];

  const evalContext = deriveEvaluationContext({
    evaluationInstant: '2026-08-16T12:00:00+09:00',
    evaluationTimezone: 'Asia/Seoul',
  });

  // -------------------------------------------------------------------------
  // Test A: Running 1x 1km·600s present in both input paths is aggregated as 1x·1km·600s
  // -------------------------------------------------------------------------
  {
    const runInput = makeRunningSession({
      sourceLogId: 'run-log-1',
      date: '2026-08-15',
      startTime: '08:00',
      distanceKm: 1.0,
      durationSeconds: 600,
    });

    const canonicalRun: CanonicalRunningSession = Object.freeze({
      logId: 'run-log-1',
      date: '2026-08-15',
      startTime: '08:00',
      exerciseName: 'Running',
      metrics: Object.freeze({
        distanceKm: 1.0,
        durationSeconds: 600,
        paceSecondsPerKm: 600,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const recent = deriveRecentTrainingContext([runInput], evalContext, [canonicalRun]);
    const demand = deriveSystemicTrainingDemandContext([runInput], evalContext, recent, [canonicalRun]);
    const evidence = deriveRestDecisionEvidence(
      evalContext,
      [runInput],
      emptyResidualStates,
      dummyCandidateDecisions,
      [canonicalRun]
    );

    const passed =
      demand.cardioExposure.cardioSessionCount === 1 &&
      demand.cardioExposure.totalDistanceKm === 1.0 &&
      demand.cardioExposure.totalDurationSeconds === 600 &&
      recent.recentSessionCount === 1 &&
      recent.recentTrainingDensity.sessionsByCalendarDay[0]?.cardioSessionCount === 1 &&
      evidence.kind === 'rest-decision-evidence';

    results.push({
      id: 'VERIFY_A',
      description: 'Single run in dual inputs aggregated as 1 session, 1.0 km, 600 seconds',
      passed,
      details: passed
        ? 'Deduplication succeeded: 1 session, 1.0 km, 600s.'
        : `Duplicate detected: cardioSessionCount=${demand.cardioExposure.cardioSessionCount}, distanceKm=${demand.cardioExposure.totalDistanceKm}, durationSec=${demand.cardioExposure.totalDurationSeconds}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test B: Two distinct runs on the same date are both preserved
  // -------------------------------------------------------------------------
  {
    const runInput1 = makeRunningSession({
      sourceLogId: 'run-morning',
      date: '2026-08-15',
      startTime: '07:00',
      exerciseName: 'Morning Run',
      distanceKm: 5.0,
      durationSeconds: 1500,
    });

    const runInput2 = makeRunningSession({
      sourceLogId: 'run-evening',
      date: '2026-08-15',
      startTime: '18:00',
      exerciseName: 'Evening Run',
      distanceKm: 3.0,
      durationSeconds: 900,
    });

    const canonical1: CanonicalRunningSession = Object.freeze({
      logId: 'run-morning',
      date: '2026-08-15',
      startTime: '07:00',
      exerciseName: 'Morning Run',
      metrics: Object.freeze({
        distanceKm: 5.0,
        durationSeconds: 1500,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const canonical2: CanonicalRunningSession = Object.freeze({
      logId: 'run-evening',
      date: '2026-08-15',
      startTime: '18:00',
      exerciseName: 'Evening Run',
      metrics: Object.freeze({
        distanceKm: 3.0,
        durationSeconds: 900,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const recent = deriveRecentTrainingContext(
      [runInput1, runInput2],
      evalContext,
      [canonical1, canonical2]
    );
    const demand = deriveSystemicTrainingDemandContext(
      [runInput1, runInput2],
      evalContext,
      recent,
      [canonical1, canonical2]
    );

    const passed =
      recent.recentSessionCount === 2 &&
      recent.recentUniqueTrainingDays === 1 &&
      recent.recentTrainingDensity.multiSessionDays === 1 &&
      demand.cardioExposure.cardioSessionCount === 2 &&
      Math.abs(demand.cardioExposure.totalDistanceKm - 8.0) < 1e-4 &&
      demand.cardioExposure.totalDurationSeconds === 2400;

    results.push({
      id: 'VERIFY_B',
      description: 'Two separate running logs on same date are preserved as 2 sessions (8km, 2400s)',
      passed,
      details: passed
        ? 'Both separate runs preserved correctly: sessions=2, km=8.0, sec=2400.'
        : `Unexpected values: sessions=${recent.recentSessionCount}, cardioCount=${demand.cardioExposure.cardioSessionCount}, km=${demand.cardioExposure.totalDistanceKm}, sec=${demand.cardioExposure.totalDurationSeconds}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test C: Multiple running items within the same WorkoutLog are preserved
  // -------------------------------------------------------------------------
  {
    const runInterval1 = makeRunningSession({
      sourceLogId: 'multi-run-log',
      date: '2026-08-15',
      startTime: '08:00',
      exerciseName: 'Interval 1',
      distanceKm: 2.0,
      durationSeconds: 600,
    });

    const runInterval2 = makeRunningSession({
      sourceLogId: 'multi-run-log',
      date: '2026-08-15',
      startTime: '08:00',
      exerciseName: 'Interval 2',
      distanceKm: 3.0,
      durationSeconds: 900,
    });

    const canInterval1: CanonicalRunningSession = Object.freeze({
      logId: 'multi-run-log',
      date: '2026-08-15',
      startTime: '08:00',
      exerciseName: 'Interval 1',
      metrics: Object.freeze({
        distanceKm: 2.0,
        durationSeconds: 600,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const canInterval2: CanonicalRunningSession = Object.freeze({
      logId: 'multi-run-log',
      date: '2026-08-15',
      startTime: '08:00',
      exerciseName: 'Interval 2',
      metrics: Object.freeze({
        distanceKm: 3.0,
        durationSeconds: 900,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const recent = deriveRecentTrainingContext(
      [runInterval1, runInterval2],
      evalContext,
      [canInterval1, canInterval2]
    );
    const demand = deriveSystemicTrainingDemandContext(
      [runInterval1, runInterval2],
      evalContext,
      recent,
      [canInterval1, canInterval2]
    );

    const passed =
      recent.recentSessionCount === 1 &&
      demand.cardioExposure.cardioSessionCount === 1 &&
      Math.abs(demand.cardioExposure.totalDistanceKm - 5.0) < 1e-4 &&
      demand.cardioExposure.totalDurationSeconds === 1500;

    results.push({
      id: 'VERIFY_C',
      description: 'Multiple running entries within same WorkoutLog: 1 session, sum of km=5.0 and sec=1500',
      passed,
      details: passed
        ? 'Both intervals preserved in single session: session=1, km=5.0, sec=1500.'
        : `Unexpected values: sessionCount=${recent.recentSessionCount}, cardioSessionCount=${demand.cardioExposure.cardioSessionCount}, km=${demand.cardioExposure.totalDistanceKm}, sec=${demand.cardioExposure.totalDurationSeconds}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test D: Single WorkoutLog with 3 strength exercises -> 1 session, all load facts preserved
  // -------------------------------------------------------------------------
  {
    const squatInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-strength-trio',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 1,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 2400,
        highEvidenceLoadVolumeKgReps: 2400,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 3,
      },
    });

    const ohpInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-strength-trio',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      dimensions: ['vertical-push'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 1200,
        highEvidenceLoadVolumeKgReps: 1200,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 3,
      },
    });

    const deadliftInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-strength-trio',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 2800,
        highEvidenceLoadVolumeKgReps: 2800,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 3,
      },
    });

    const recent = deriveRecentTrainingContext([squatInput, ohpInput, deadliftInput], evalContext);
    const demand = deriveSystemicTrainingDemandContext(
      [squatInput, ohpInput, deadliftInput],
      evalContext,
      recent
    );

    const dayBreakdown = recent.recentTrainingDensity.sessionsByCalendarDay[0];

    const passed =
      recent.recentSessionCount === 1 &&
      recent.recentUniqueTrainingDays === 1 &&
      dayBreakdown?.sessionCount === 1 &&
      dayBreakdown?.strengthSessionCount === 1 &&
      dayBreakdown?.isMultiSessionDay === false &&
      dayBreakdown?.exerciseOrActivityNames.length === 3 &&
      demand.recentAxialExposure.axialSessionCount === 1 &&
      demand.recentAxialExposure.axialExercises.includes('Squat') &&
      demand.recentAxialExposure.axialExercises.includes('Deadlift') &&
      demand.repeatedCompoundExposure.compoundSessionCount === 1;

    results.push({
      id: 'VERIFY_D',
      description: 'Single WorkoutLog with 3 strength exercises -> 1 session, all 3 exercises preserved',
      passed,
      details: passed
        ? 'Single session confirmed with 3 exercises preserved: sessionCount=1, strengthSessionCount=1, axialSessionCount=1, exercises=3.'
        : `Failure: recentSessionCount=${recent.recentSessionCount}, daySessionCount=${dayBreakdown?.sessionCount}, isMulti=${dayBreakdown?.isMultiSessionDay}, axialSessionCount=${demand.recentAxialExposure.axialSessionCount}, compoundSessionCount=${demand.repeatedCompoundExposure.compoundSessionCount}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test E: Two distinct WorkoutLogs on the same date -> 2 sessions
  // -------------------------------------------------------------------------
  {
    const benchLogInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-bench-morning',
      date: '2026-08-15',
      startTime: '09:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    });

    const squatLogInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-squat-evening',
      date: '2026-08-15',
      startTime: '18:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    });

    const recent = deriveRecentTrainingContext([benchLogInput, squatLogInput], evalContext);
    const dayBreakdown = recent.recentTrainingDensity.sessionsByCalendarDay[0];

    const passed =
      recent.recentSessionCount === 2 &&
      recent.recentUniqueTrainingDays === 1 &&
      dayBreakdown?.sessionCount === 2 &&
      dayBreakdown?.isMultiSessionDay === true &&
      recent.recentTrainingDensity.multiSessionDays === 1;

    results.push({
      id: 'VERIFY_E',
      description: 'Two different WorkoutLogs on same date -> 2 sessions, isMultiSessionDay=true',
      passed,
      details: passed
        ? 'Distinct sessions on same date confirmed: sessionCount=2, isMulti=true.'
        : `Failure: recentSessionCount=${recent.recentSessionCount}, daySessionCount=${dayBreakdown?.sessionCount}, isMulti=${dayBreakdown?.isMultiSessionDay}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test F: Mixed session (Strength + Running) in one WorkoutLog
  // -------------------------------------------------------------------------
  {
    const squatInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-combo',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    });

    const runInput = makeRunningSession({
      sourceLogId: 'log-combo',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseName: 'Running',
      distanceKm: 3.0,
      durationSeconds: 1200,
    });

    const canonicalRun: CanonicalRunningSession = Object.freeze({
      logId: 'log-combo',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseName: 'Running',
      metrics: Object.freeze({
        distanceKm: 3.0,
        durationSeconds: 1200,
        sourceFormat: 'explicit-cardio-fields',
        provenance: Object.freeze({
          distance: 'explicit',
          duration: 'explicit',
          distanceLegacyConflict: false,
          durationLegacyConflict: false,
          hasLegacyConflict: false,
        }),
        sourceConfidence: 'high',
        runIntent: 'unknown' as const,
      }),
    });

    const recent = deriveRecentTrainingContext([squatInput, runInput], evalContext, [canonicalRun]);
    const demand = deriveSystemicTrainingDemandContext(
      [squatInput, runInput],
      evalContext,
      recent,
      [canonicalRun]
    );

    const dayBreakdown = recent.recentTrainingDensity.sessionsByCalendarDay[0];

    const passed =
      recent.recentSessionCount === 1 &&
      recent.modalityPresence === 'both' &&
      dayBreakdown?.sessionCount === 1 &&
      dayBreakdown?.strengthSessionCount === 1 &&
      dayBreakdown?.cardioSessionCount === 1 &&
      dayBreakdown?.isMultiSessionDay === false &&
      demand.multiModalityExposure.hasMultiModality === true &&
      demand.multiModalityExposure.sameDayMultiModality === true &&
      demand.multiModalityExposure.strengthCount === 1 &&
      demand.multiModalityExposure.cardioCount === 1;

    results.push({
      id: 'VERIFY_F',
      description: 'Mixed session: total sessions=1, both activities present, strengthCount=1, cardioCount=1',
      passed,
      details: passed
        ? 'Mixed session consistency confirmed: sessions=1, strengthCount=1, cardioCount=1, multiModality=true.'
        : `Failure: recentSessionCount=${recent.recentSessionCount}, strengthCount=${demand.multiModalityExposure.strengthCount}, cardioCount=${demand.multiModalityExposure.cardioCount}, strengthSessionCount=${dayBreakdown?.strengthSessionCount}, cardioSessionCount=${dayBreakdown?.cardioSessionCount}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test G: Light set (20kg x 5 x 1 set) is NOT high load merely because e1RM > 0
  // -------------------------------------------------------------------------
  {
    const lightInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-light-bench',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'] as const,
      setEvidence: {
        totalRawSetCount: 1,
        explicitWorkingSetCount: 1,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 100, // 20kg * 5 = 100 (< 2000)
        highEvidenceLoadVolumeKgReps: 100,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 1,
      },
      e1RMEvidence: {
        numericalPeakEstimated1RMKg: 23.3, // Positive e1RM
        selectedPeakEstimated1RMKg: 23.3,
        selectedEvidenceQuality: 'high' as const,
      },
    });

    const recent = deriveRecentTrainingContext([lightInput], evalContext);
    const demand = deriveSystemicTrainingDemandContext([lightInput], evalContext, recent);

    const passed =
      demand.recentHighLoadExposure.hasHighWorkingLoad === false &&
      demand.recentHighLoadExposure.highLoadSessionCount === 0;

    results.push({
      id: 'VERIFY_G',
      description: 'Single light set (20kg x 5 x 1 set) is NOT classified as high load due to e1RM > 0',
      passed,
      details: passed
        ? 'Light set correctly not flagged as high load.'
        : `False high load triggered: hasHighWorkingLoad=${demand.recentHighLoadExposure.hasHighWorkingLoad}, highLoadSessionCount=${demand.recentHighLoadExposure.highLoadSessionCount}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test H: Legitimate high load conditions (working sets >= 3 or volume > 2000) are classified as high load
  // -------------------------------------------------------------------------
  {
    const heavySetsInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-heavy-sets',
      date: '2026-08-14',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3, // Meets working set count >= 3
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 900,
        highEvidenceLoadVolumeKgReps: 900,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 3,
      },
    });

    const heavyVolumeInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-heavy-vol',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'leg_press',
      exerciseName: 'Leg Press',
      dimensions: ['knee-dominant-lower-body'] as const,
      setEvidence: {
        totalRawSetCount: 2,
        explicitWorkingSetCount: 2, // < 3
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
      loadVolumeEvidence: {
        totalLoadVolumeKgReps: 2500, // Meets volume > 2000
        highEvidenceLoadVolumeKgReps: 2500,
        limitedEvidenceLoadVolumeKgReps: 0,
        observationCount: 2,
      },
    });

    const recent = deriveRecentTrainingContext([heavySetsInput, heavyVolumeInput], evalContext);
    const demand = deriveSystemicTrainingDemandContext([heavySetsInput, heavyVolumeInput], evalContext, recent);

    const passed =
      demand.recentHighLoadExposure.hasHighWorkingLoad === true &&
      demand.recentHighLoadExposure.highLoadSessionCount === 2;

    results.push({
      id: 'VERIFY_H',
      description: 'Standard high working set count and tonnage volume conditions classified as high load',
      passed,
      details: passed
        ? 'High load correctly recognized under valid working set and volume criteria.'
        : `Failed high load recognition: hasHighWorkingLoad=${demand.recentHighLoadExposure.hasHighWorkingLoad}, count=${demand.recentHighLoadExposure.highLoadSessionCount}`,
    });
  }

  // -------------------------------------------------------------------------
  // Test I: Future records exclusion and evaluation instant / timezone adherence
  // -------------------------------------------------------------------------
  {
    const pastInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-past',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    });

    const futureInput: StrengthStressMagnitudeInput = Object.freeze({
      kind: 'strength',
      sourceLogId: 'log-future',
      date: '2026-08-17', // Strictly after eval date 2026-08-16
      startTime: '10:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'] as const,
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    });

    const recent = deriveRecentTrainingContext([pastInput, futureInput], evalContext);
    const demand = deriveSystemicTrainingDemandContext([pastInput, futureInput], evalContext, recent);

    const passed =
      recent.recentSessionCount === 1 &&
      recent.lastTrainingDate === '2026-08-15' &&
      !demand.recentAxialExposure.axialExercises.includes('Deadlift');

    results.push({
      id: 'VERIFY_I',
      description: 'Future records strictly excluded and temporal evaluation instant respected',
      passed,
      details: passed
        ? 'Future session correctly excluded from recent training context.'
        : `Future leakage detected: recentSessionCount=${recent.recentSessionCount}, lastDate=${recent.lastTrainingDate}`,
    });
  }

  return Object.freeze(results);
}
