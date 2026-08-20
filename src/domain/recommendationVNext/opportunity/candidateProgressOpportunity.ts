/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Progress Opportunity Framework (VNext Recommendation Engine - CU4.1)
 *
 * Implements pure, deterministic domain evaluation of candidate progression opportunities,
 * performance signals, and intensity shift contexts without numerical scores, arbitrary weights,
 * or false regression penalties.
 *
 * Strict Invariants:
 * 1. Independent from Need & Readiness: Progress opportunity captures whether current historical
 *    records structurally support progression or stimulus advancement.
 * 2. Zero Numeric Scoring: No 0-100 scores, progression %, or arbitrary multipliers.
 * 3. Categorical Opportunity Taxonomy: 'progression-supported' | 'maintenance-supported' | 'exploratory-supported' | 'insufficient-evidence' | 'unmapped'.
 * 4. GS9 / GS-F Intensity Shift Preservation: Lower volume accompanied by higher load/intensity is an
 *    intensity shift, NEVER an automated regression.
 * 5. Running Triad Isolation: Distance, duration, and pace are preserved independently without scalar summation.
 * 6. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile } from '../types/stressModel.types';
import { EvaluationContext } from '../types/residualStressTrace.types';
import {
  StrengthStressMagnitudeInput,
  StressMagnitudeInput,
} from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import {
  CandidateProgressOpportunityEvaluationSet,
  CandidateProgressOpportunityEvidence,
  E1RMTrend,
  ProgressOpportunityClass,
  ProgressOpportunityExplainabilitySummary,
  RunningProgressOpportunityContext,
  StrengthProgressOpportunityContext,
  WorkCapacityTrend,
} from '../types/candidateProgressOpportunity.types';
import { getCanonicalExerciseStressProfile } from '../stress/stressVocabulary';
import { deriveRunningHistoricalReference } from '../context/runningHistoricalReference';
import { interpretRunningSessionVsHistory } from '../context/runningInterpretation';

/**
 * Calculates median from an array of numbers. Returns undefined if empty.
 */
function calculateMedian(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Evaluates Strength Progress Opportunity for a candidate exercise from historical strength inputs.
 */
function evaluateStrengthOpportunity(
  candidateExerciseId: string,
  candidateExerciseName: string,
  matchingInputs: readonly StrengthStressMagnitudeInput[]
): {
  readonly opportunityClass: ProgressOpportunityClass;
  readonly strengthContext: StrengthProgressOpportunityContext;
  readonly notes: readonly string[];
} {
  const notes: string[] = [];

  if (matchingInputs.length === 0) {
    notes.push(`No prior strength performance logs recorded for ${candidateExerciseName}.`);
    return {
      opportunityClass: 'insufficient-evidence',
      strengthContext: Object.freeze({
        latestPeakE1RMKg: undefined,
        baselineMedianE1RMKg: undefined,
        historicalMaxE1RMKg: undefined,
        e1RMTrend: 'insufficient-history',
        latestVolumeKgReps: undefined,
        baselineMedianVolumeKgReps: undefined,
        latestWorkingSets: undefined,
        latestTotalReps: undefined,
        workCapacityTrend: 'insufficient-history',
        isIntensityShift: false,
        intensityShiftRationale: undefined,
      }),
      notes: Object.freeze(notes),
    };
  }

  // Sort matching inputs reverse chronologically
  const sorted = [...matchingInputs].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const tA = a.startTime || '00:00';
    const tB = b.startTime || '00:00';
    return tB.localeCompare(tA);
  });

  const latest = sorted[0];

  if (sorted.length === 1) {
    const latestE1RM = latest.e1RMEvidence?.selectedPeakEstimated1RMKg;
    const latestVol = latest.loadVolumeEvidence?.totalLoadVolumeKgReps;
    const latestSets = latest.setEvidence.explicitWorkingSetCount;
    const latestReps = latest.workCapacityEvidence?.totalReps;

    notes.push(
      `Single session recorded (${latest.date}): establishing initial baseline anchors.`
    );
    if (latestE1RM !== undefined) notes.push(`Peak e1RM: ${latestE1RM}kg.`);
    if (latestVol !== undefined) notes.push(`Total load volume: ${latestVol}kg*reps.`);

    return {
      opportunityClass: 'exploratory-supported',
      strengthContext: Object.freeze({
        latestPeakE1RMKg: latestE1RM,
        baselineMedianE1RMKg: latestE1RM,
        historicalMaxE1RMKg: latestE1RM,
        e1RMTrend: 'stable',
        latestVolumeKgReps: latestVol,
        baselineMedianVolumeKgReps: latestVol,
        latestWorkingSets: latestSets,
        latestTotalReps: latestReps,
        workCapacityTrend: 'stable',
        isIntensityShift: false,
        intensityShiftRationale: undefined,
      }),
      notes: Object.freeze(notes),
    };
  }

  // Multi-session analysis (sorted.length >= 2)
  const priorSessions = sorted.slice(1);

  // e1RM Extraction
  const latestE1RM = latest.e1RMEvidence?.selectedPeakEstimated1RMKg;
  const priorE1RMs = priorSessions
    .map((s) => s.e1RMEvidence?.selectedPeakEstimated1RMKg)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const baselineMedianE1RM = calculateMedian(priorE1RMs);
  const historicalMaxE1RM = priorE1RMs.length > 0 ? Math.max(...priorE1RMs) : undefined;

  let e1RMTrend: E1RMTrend = 'stable';
  if (latestE1RM !== undefined && baselineMedianE1RM !== undefined) {
    if (latestE1RM >= baselineMedianE1RM * 1.02 || (historicalMaxE1RM && latestE1RM >= historicalMaxE1RM)) {
      e1RMTrend = 'rising';
      notes.push(
        `e1RM progression observed: latest peak ${latestE1RM}kg vs baseline median ${baselineMedianE1RM}kg.`
      );
    } else if (latestE1RM < baselineMedianE1RM * 0.95) {
      e1RMTrend = 'below-baseline';
      notes.push(
        `Latest peak e1RM (${latestE1RM}kg) is below baseline median (${baselineMedianE1RM}kg).`
      );
    } else {
      e1RMTrend = 'stable';
      notes.push(
        `Peak e1RM remains stable within baseline range (${latestE1RM}kg vs median ${baselineMedianE1RM}kg).`
      );
    }
  }

  // Load Volume Extraction
  const latestVol = latest.loadVolumeEvidence?.totalLoadVolumeKgReps;
  const priorVolumes = priorSessions
    .map((s) => s.loadVolumeEvidence?.totalLoadVolumeKgReps)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const baselineMedianVolume = calculateMedian(priorVolumes);

  // Work Capacity Extraction
  const latestSets = latest.setEvidence.explicitWorkingSetCount;
  const latestReps = latest.workCapacityEvidence?.totalReps;
  const priorSets = priorSessions.map((s) => s.setEvidence.explicitWorkingSetCount);
  const priorReps = priorSessions
    .map((s) => s.workCapacityEvidence?.totalReps)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);

  const medianPriorSets = calculateMedian(priorSets);
  const medianPriorReps = calculateMedian(priorReps);

  let workCapacityTrend: WorkCapacityTrend = 'stable';
  if (
    (latestSets !== undefined && medianPriorSets !== undefined && latestSets > medianPriorSets) ||
    (latestReps !== undefined && medianPriorReps !== undefined && latestReps > medianPriorReps * 1.05)
  ) {
    workCapacityTrend = 'increasing';
    notes.push(
      `Work capacity expansion: working sets (${latestSets} vs median ${medianPriorSets}) or reps (${latestReps} vs median ${medianPriorReps}).`
    );
  } else if (
    latestReps !== undefined &&
    medianPriorReps !== undefined &&
    latestReps < medianPriorReps * 0.9
  ) {
    workCapacityTrend = 'decreasing';
  } else {
    workCapacityTrend = 'stable';
  }

  // GS9 / GS-F Intensity Shift Detection
  let isIntensityShift = false;
  let intensityShiftRationale: string | undefined = undefined;

  if (
    latestVol !== undefined &&
    baselineMedianVolume !== undefined &&
    latestVol < baselineMedianVolume &&
    latestE1RM !== undefined &&
    baselineMedianE1RM !== undefined &&
    latestE1RM >= baselineMedianE1RM
  ) {
    isIntensityShift = true;
    intensityShiftRationale =
      'Volume decreased while peak load/intensity increased; represents intensity shift rather than capacity regression.';
    notes.push(
      `Intensity Shift identified: session volume (${latestVol}kg*reps) was lower, but peak working load/e1RM (${latestE1RM}kg) advanced.`
    );
  }

  // Classify Opportunity
  let opportunityClass: ProgressOpportunityClass = 'maintenance-supported';
  if (e1RMTrend === 'rising' || workCapacityTrend === 'increasing' || isIntensityShift) {
    opportunityClass = 'progression-supported';
  } else {
    opportunityClass = 'maintenance-supported';
  }

  return {
    opportunityClass,
    strengthContext: Object.freeze({
      latestPeakE1RMKg: latestE1RM,
      baselineMedianE1RMKg: baselineMedianE1RM,
      historicalMaxE1RMKg: historicalMaxE1RM,
      e1RMTrend,
      latestVolumeKgReps: latestVol,
      baselineMedianVolumeKgReps: baselineMedianVolume,
      latestWorkingSets: latestSets,
      latestTotalReps: latestReps,
      workCapacityTrend,
      isIntensityShift,
      intensityShiftRationale,
    }),
    notes: Object.freeze(notes),
  };
}

/**
 * Evaluates Running Progress Opportunity for running from historical running sessions.
 */
function evaluateRunningOpportunity(
  candidateExerciseName: string,
  runningSessions: readonly CanonicalRunningSession[]
): {
  readonly opportunityClass: ProgressOpportunityClass;
  readonly runningContext: RunningProgressOpportunityContext;
  readonly notes: readonly string[];
} {
  const notes: string[] = [];

  if (runningSessions.length === 0) {
    notes.push(`No prior running logs recorded.`);
    return {
      opportunityClass: 'insufficient-evidence',
      runningContext: Object.freeze({
        distanceInterpretation: undefined,
        durationInterpretation: undefined,
        paceInterpretation: undefined,
        hasPaceProgression: false,
        hasDistanceProgression: false,
        runningProgressionNotes: Object.freeze(notes),
      }),
      notes: Object.freeze(notes),
    };
  }

  // Sort running sessions reverse chronologically
  const sorted = [...runningSessions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const tA = a.startTime || '00:00';
    const tB = b.startTime || '00:00';
    return tB.localeCompare(tA);
  });

  const latest = sorted[0];

  if (sorted.length === 1) {
    notes.push(
      `Single running session recorded (${latest.date}): establishing cardio baseline anchors.`
    );
    if (latest.metrics.distanceKm !== undefined)
      notes.push(`Distance: ${latest.metrics.distanceKm}km.`);
    if (latest.metrics.durationSeconds !== undefined)
      notes.push(`Duration: ${Math.round(latest.metrics.durationSeconds / 60)}min.`);
    if (latest.metrics.paceSecondsPerKm !== undefined)
      notes.push(`Pace: ${Math.round(latest.metrics.paceSecondsPerKm)}s/km.`);

    return {
      opportunityClass: 'exploratory-supported',
      runningContext: Object.freeze({
        distanceInterpretation: undefined,
        durationInterpretation: undefined,
        paceInterpretation: undefined,
        hasPaceProgression: false,
        hasDistanceProgression: false,
        runningProgressionNotes: Object.freeze(notes),
      }),
      notes: Object.freeze(notes),
    };
  }

  // Multi-session running interpretation
  const priorSessions = sorted.slice(1);
  const historicalRef = deriveRunningHistoricalReference(latest, priorSessions);
  const interpretation = interpretRunningSessionVsHistory(latest, historicalRef);

  let hasPaceProgression = false;
  let hasDistanceProgression = false;

  // Pace evaluation
  if (
    interpretation.pace.rangePosition === 'fastest-on-record' ||
    interpretation.pace.vsRecent1?.direction === 'faster' ||
    interpretation.pace.vsMedian?.direction === 'faster'
  ) {
    hasPaceProgression = true;
    notes.push(
      `Pace progression: observed pace (${interpretation.pace.currentValue}s/km) is faster than historical baseline.`
    );
  }

  // Distance evaluation
  if (
    interpretation.distance.rangePosition === 'above-max' ||
    interpretation.distance.vsRecent1?.direction === 'greater' ||
    interpretation.distance.vsMedian?.direction === 'greater'
  ) {
    hasDistanceProgression = true;
    notes.push(
      `Distance milestone: observed distance (${interpretation.distance.currentValue}km) expands aerobic exposure.`
    );
  }

  let opportunityClass: ProgressOpportunityClass = 'maintenance-supported';
  if (hasPaceProgression || hasDistanceProgression) {
    opportunityClass = 'progression-supported';
  }

  return {
    opportunityClass,
    runningContext: Object.freeze({
      distanceInterpretation: interpretation.distance,
      durationInterpretation: interpretation.duration,
      paceInterpretation: interpretation.pace,
      hasPaceProgression,
      hasDistanceProgression,
      runningProgressionNotes: Object.freeze(notes),
    }),
    notes: Object.freeze(notes),
  };
}

/**
 * Derives CandidateProgressOpportunityEvidence for a single candidate exercise.
 */
export function deriveCandidateProgressOpportunityEvidence(
  candidateExerciseId: string,
  allSessions: readonly (StressMagnitudeInput | CanonicalRunningSession)[],
  evaluationContext: EvaluationContext
): CandidateProgressOpportunityEvidence {
  const profile: ExerciseStressProfile = getCanonicalExerciseStressProfile(candidateExerciseId);
  const candidateExerciseName = profile.exerciseName;

  // Handle unmapped
  if (profile.mappingStatus === 'unmapped') {
    return Object.freeze({
      kind: 'candidate-progress-opportunity-evidence',
      candidateExerciseId,
      candidateExerciseName,
      exerciseProfile: profile,
      modality: 'unmapped',
      opportunityClass: 'unmapped',
      explainabilitySummary: Object.freeze({
        headline: `${candidateExerciseName} is unmapped in stress vocabulary.`,
        factualObservations: Object.freeze(['No mapped performance dimensions available.']),
      }),
      evaluationContext,
    });
  }

  // Running Modality
  if (candidateExerciseId === 'running') {
    const runningSessions: CanonicalRunningSession[] = [];
    for (const s of allSessions) {
      if ('metrics' in s) {
        runningSessions.push(s as CanonicalRunningSession);
      } else if (s.kind === 'running') {
        const rInput = s as StressMagnitudeInput & { kind: 'running' };
        runningSessions.push({
          logId: rInput.sourceLogId,
          date: rInput.date,
          startTime: rInput.startTime,
          exerciseName: rInput.exerciseName,
          metrics: {
            distanceKm: rInput.distanceKm,
            durationSeconds: rInput.durationSeconds,
            paceSecondsPerKm: rInput.paceSecondsPerKm,
            sourceFormat: 'explicit-cardio-fields',
            provenance: {
              distance: rInput.metricProvenance.distanceProvenance,
              duration: rInput.metricProvenance.durationProvenance,
              distanceLegacyConflict: rInput.metricProvenance.distanceLegacyConflict,
              durationLegacyConflict: rInput.metricProvenance.durationLegacyConflict,
              hasLegacyConflict: rInput.metricProvenance.hasLegacyConflict,
            },
            sourceConfidence: rInput.metricProvenance.sourceConfidence,
            runIntent: 'unknown',
          },
        });
      }
    }

    const { opportunityClass, runningContext, notes } = evaluateRunningOpportunity(
      candidateExerciseName,
      runningSessions
    );

    let headline = '';
    switch (opportunityClass) {
      case 'progression-supported':
        headline = `Running progression opportunity supported by recent pace/distance milestones.`;
        break;
      case 'maintenance-supported':
        headline = `Running maintenance supported by stable historical distance and duration reference.`;
        break;
      case 'exploratory-supported':
        headline = `Running baseline anchors established from initial session.`;
        break;
      case 'insufficient-evidence':
        headline = `Running progression opportunity is unestablished (insufficient history).`;
        break;
      case 'unmapped':
        headline = `Running is unmapped.`;
        break;
    }

    return Object.freeze({
      kind: 'candidate-progress-opportunity-evidence',
      candidateExerciseId,
      candidateExerciseName,
      exerciseProfile: profile,
      modality: 'running',
      opportunityClass,
      runningContext,
      explainabilitySummary: Object.freeze({
        headline,
        factualObservations: Object.freeze(notes),
      }),
      evaluationContext,
    });
  }

  // Strength Modality
  const matchingStrengthInputs: StrengthStressMagnitudeInput[] = [];
  for (const s of allSessions) {
    if ('kind' in s && s.kind === 'strength') {
      const st = s as StrengthStressMagnitudeInput;
      if (
        st.exerciseId.toLowerCase() === candidateExerciseId.toLowerCase() ||
        st.exerciseName.toLowerCase() === candidateExerciseName.toLowerCase()
      ) {
        matchingStrengthInputs.push(st);
      }
    }
  }

  const { opportunityClass, strengthContext, notes } = evaluateStrengthOpportunity(
    candidateExerciseId,
    candidateExerciseName,
    matchingStrengthInputs
  );

  let headline = '';
  switch (opportunityClass) {
    case 'progression-supported':
      if (strengthContext.isIntensityShift) {
        headline = `${candidateExerciseName} supports higher-load progression via observed intensity shift.`;
      } else {
        headline = `${candidateExerciseName} progression opportunity supported by rising e1RM and work capacity.`;
      }
      break;
    case 'maintenance-supported':
      headline = `${candidateExerciseName} maintenance supported by established historical baseline.`;
      break;
    case 'exploratory-supported':
      headline = `${candidateExerciseName} exploratory baseline established from initial session.`;
      break;
    case 'insufficient-evidence':
      headline = `${candidateExerciseName} progression opportunity is unestablished (insufficient history).`;
      break;
    case 'unmapped':
      headline = `${candidateExerciseName} is unmapped.`;
      break;
  }

  return Object.freeze({
    kind: 'candidate-progress-opportunity-evidence',
    candidateExerciseId,
    candidateExerciseName,
    exerciseProfile: profile,
    modality: 'strength',
    opportunityClass,
    strengthContext,
    explainabilitySummary: Object.freeze({
      headline,
      factualObservations: Object.freeze(notes),
    }),
    evaluationContext,
  });
}

/**
 * Evaluates Progress Opportunity across a set of candidate exercises in deterministic order.
 */
export function evaluateCandidateProgressOpportunitySet(
  candidateExerciseIds: readonly string[],
  allSessions: readonly (StressMagnitudeInput | CanonicalRunningSession)[],
  evaluationContext: EvaluationContext
): CandidateProgressOpportunityEvaluationSet {
  const candidates: CandidateProgressOpportunityEvidence[] = candidateExerciseIds.map((id) =>
    deriveCandidateProgressOpportunityEvidence(id, allSessions, evaluationContext)
  );

  const candidateMap: Record<string, CandidateProgressOpportunityEvidence> = {};
  for (const c of candidates) {
    candidateMap[c.candidateExerciseId] = c;
  }

  return Object.freeze({
    evaluationContext,
    candidates: Object.freeze(candidates),
    candidateMap: Object.freeze(candidateMap),
    totalCandidatesCount: candidates.length,
  });
}
