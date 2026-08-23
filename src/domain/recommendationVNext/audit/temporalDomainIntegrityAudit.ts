/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Temporal Boundary & Domain Integrity Audit Suite (CU4.x)
 *
 * Audits all 13 required domain integrity, temporal eligibility, intensity shift,
 * work capacity, tie preservation, and evidence boundary constraints.
 *
 * Invariants Audited:
 * 1. Future-Date Leakage Exclusion (Need, Opportunity, TodayDecision)
 * 2. Same-Day Future-Time Leakage Exclusion
 * 3. Same-Day Prior-Time Inclusion
 * 4. Same-Day Missing-Time Uncertainty (No False Certainty)
 * 5. Gregorian Day Delta Non-Negative Constraints
 * 6. Maintenance Semantics Integrity (No False Maintenance on Decline)
 * 7. Intensity Shift Truthfulness (Actual Higher Load Advancement Required)
 * 8. Work Capacity Load-Context Preservation
 * 9. True Tie Deterministic Preservation (No ID Dominance)
 * 10. Evidence Boundary Enforcement (No CNS/HRV/Pain/Recovery/RPE estimation)
 * 11. Today Rest Decision vs Next Session Ranking Isolation (GS1)
 * 12. Caution + Due Candidate Viability (Not Auto-Rest)
 * 13. Recently Addressed + Clear Candidate Viability (Not Auto-Rest)
 */

import { EvaluationContext } from '../types/residualStressTrace.types';
import { deriveEvaluationContext, deriveResidualStressTraces } from '../stress/residualStressTrace';
import { deriveAllDimensionResidualStates } from '../stress/dimensionResidualState';
import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import {
  evaluateSessionTemporalEligibility,
  filterTemporallyEligibleSessions,
} from '../temporal/temporalEligibility';
import {
  computeCalendarDayDelta,
  deriveCandidateTrainingNeedEvidence,
} from '../need/candidateTrainingNeed';
import { deriveCandidateProgressOpportunityEvidence } from '../opportunity/candidateProgressOpportunity';
import {
  compareCandidatePairwise,
  deriveCandidateDecisionEvidence,
  sortCandidatesByPreference,
} from '../synthesis/candidateSynthesis';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { deriveCandidateReadinessEvidence } from '../readiness/candidateReadiness';

export interface TemporalIntegrityAuditResult {
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly details: string;
  readonly invariantsChecked: number;
}

export function runTemporalDomainIntegrityAudit(): readonly TemporalIntegrityAuditResult[] {
  const results: TemporalIntegrityAuditResult[] = [];

  const evalContext: EvaluationContext = deriveEvaluationContext({
    evaluationInstant: '2026-08-16T12:00:00Z',
    evaluationTimezone: 'UTC',
  });

  // Helper to build AllDimensionResidualStates
  function buildResidualStates(
    sessions: readonly StressMagnitudeInput[],
    context: EvaluationContext
  ) {
    const projections: UnifiedDimensionProjectedStress[] = [];
    for (const session of sessions) {
      if (session.kind === 'strength') {
        for (const dim of session.dimensions) {
          projections.push({
            kind: 'dimension-projected-strength-stress',
            sourceLogId: session.sourceLogId,
            dimension: dim,
            date: session.date,
            startTime: session.startTime,
            exerciseId: session.exerciseId,
            exerciseName: session.exerciseName,
            associatedDimensions: session.dimensions,
            sourceSessionMagnitude: session as any,
          });
        }
      }
    }
    const traceCollection = deriveResidualStressTraces(projections, context);
    return deriveAllDimensionResidualStates(traceCollection.traces, context);
  }

  // -------------------------------------------------------------------------
  // Scenario 1: Future-Date Leakage Exclusion
  // -------------------------------------------------------------------------
  {
    const futureSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-future-1',
      date: '2026-08-17',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 200, selectedPeakEstimated1RMKg: 200, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 5000, highEvidenceLoadVolumeKgReps: 5000, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
      workCapacityEvidence: { totalSetCount: 4, totalReps: 25, loadGroups: [] },
    };

    const pastSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-past-1',
      date: '2026-08-10',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 150, selectedPeakEstimated1RMKg: 150, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 3500, highEvidenceLoadVolumeKgReps: 3500, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
      workCapacityEvidence: { totalSetCount: 4, totalReps: 24, loadGroups: [] },
    };

    const allSessions = [futureSession, pastSession];
    const eligible = filterTemporallyEligibleSessions(allSessions, evalContext);

    const need = deriveCandidateTrainingNeedEvidence('squat', allSessions, evalContext);
    const opp = deriveCandidateProgressOpportunityEvidence('squat', allSessions, evalContext);

    const passed =
      eligible.length === 1 &&
      eligible[0].sourceLogId === 'log-past-1' &&
      need.recency.lastPerformedDate === '2026-08-10' &&
      need.recency.calendarDaysSinceLastPerformed === 6 &&
      opp.strengthContext?.latestPeakE1RMKg === 150; // Future 200kg NOT leaked

    results.push({
      scenarioName: 'Audit 1: Future-Date Leakage Exclusion (Need, Opportunity, SSOT filter)',
      passed,
      details: `Filtered count: ${eligible.length}, Need LastPerformed: ${need.recency.lastPerformedDate}, Latest e1RM: ${opp.strengthContext?.latestPeakE1RMKg}kg.`,
      invariantsChecked: 5,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Same-Day Future-Time Leakage Exclusion
  // -------------------------------------------------------------------------
  {
    const sameDayFutureSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sameday-future',
      date: '2026-08-16',
      startTime: '18:00', // After 12:00 evalInstant
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 120, selectedPeakEstimated1RMKg: 120, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 2400, highEvidenceLoadVolumeKgReps: 2400, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
      workCapacityEvidence: { totalSetCount: 3, totalReps: 20, loadGroups: [] },
    };

    const tempCheck = evaluateSessionTemporalEligibility(sameDayFutureSession, evalContext);
    const eligible = filterTemporallyEligibleSessions([sameDayFutureSession], evalContext);

    const passed =
      tempCheck.eligibility === 'ineligible-same-day-future' &&
      tempCheck.isEligible === false &&
      tempCheck.isFuture === true &&
      eligible.length === 0;

    results.push({
      scenarioName: 'Audit 2: Same-Day Future-Time Leakage Exclusion (18:00 > 12:00)',
      passed,
      details: `Eligibility: ${tempCheck.eligibility}, isEligible: ${tempCheck.isEligible}, Filtered: ${eligible.length}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 3: Same-Day Prior-Time Inclusion
  // -------------------------------------------------------------------------
  {
    const sameDayPriorSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sameday-prior',
      date: '2026-08-16',
      startTime: '08:30', // Before 12:00 evalInstant
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 180, selectedPeakEstimated1RMKg: 180, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 3600, highEvidenceLoadVolumeKgReps: 3600, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
      workCapacityEvidence: { totalSetCount: 3, totalReps: 15, loadGroups: [] },
    };

    const tempCheck = evaluateSessionTemporalEligibility(sameDayPriorSession, evalContext);
    const eligible = filterTemporallyEligibleSessions([sameDayPriorSession], evalContext);

    const passed =
      tempCheck.eligibility === 'eligible-same-day-exact' &&
      tempCheck.isEligible === true &&
      tempCheck.isFuture === false &&
      eligible.length === 1;

    results.push({
      scenarioName: 'Audit 3: Same-Day Prior-Time Inclusion (08:30 <= 12:00)',
      passed,
      details: `Eligibility: ${tempCheck.eligibility}, isEligible: ${tempCheck.isEligible}, Filtered: ${eligible.length}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Same-Day Missing-Time Uncertainty (No False Certainty)
  // -------------------------------------------------------------------------
  {
    const missingTimeSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-missing-time',
      date: '2026-08-16',
      startTime: undefined, // Missing time
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      dimensions: ['vertical-push'],
      setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 65, selectedPeakEstimated1RMKg: 65, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 1500, highEvidenceLoadVolumeKgReps: 1500, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
      workCapacityEvidence: { totalSetCount: 3, totalReps: 18, loadGroups: [] },
    };

    const tempCheck = evaluateSessionTemporalEligibility(missingTimeSession, evalContext);
    const eligible = filterTemporallyEligibleSessions([missingTimeSession], evalContext);

    const passed =
      tempCheck.eligibility === 'uncertain-same-day-missing-time' &&
      tempCheck.isEligible === false &&
      tempCheck.isUncertain === true &&
      eligible.length === 0;

    results.push({
      scenarioName: 'Audit 4: Same-Day Missing-Time Uncertainty (No False Certainty)',
      passed,
      details: `Eligibility: ${tempCheck.eligibility}, isUncertain: ${tempCheck.isUncertain}, Filtered: ${eligible.length}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 5: Gregorian Day Delta Non-Negative Constraints
  // -------------------------------------------------------------------------
  {
    const pastDelta = computeCalendarDayDelta('2026-08-16', '2026-08-10'); // +6
    const sameDelta = computeCalendarDayDelta('2026-08-16', '2026-08-16'); // 0
    const futureDelta = computeCalendarDayDelta('2026-08-16', '2026-08-20'); // -4

    const passed = pastDelta === 6 && sameDelta === 0 && futureDelta === -4;

    results.push({
      scenarioName: 'Audit 5: Gregorian Calendar Day Delta Exact Math',
      passed,
      details: `Past (+6): ${pastDelta}, Same (0): ${sameDelta}, Future (-4): ${futureDelta}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 6: Maintenance Semantics Integrity
  // -------------------------------------------------------------------------
  {
    // Candidate with multiple sessions where latest is below baseline (120kg vs median 140kg)
    const decliningSessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-dec-latest',
        date: '2026-08-12',
        startTime: '10:00',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        dimensions: ['knee-dominant-lower-body'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 120, selectedPeakEstimated1RMKg: 120, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2400, highEvidenceLoadVolumeKgReps: 2400, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 18, loadGroups: [] },
      },
      {
        kind: 'strength',
        sourceLogId: 'log-dec-prior1',
        date: '2026-08-05',
        startTime: '10:00',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        dimensions: ['knee-dominant-lower-body'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 140, selectedPeakEstimated1RMKg: 140, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2800, highEvidenceLoadVolumeKgReps: 2800, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 21, loadGroups: [] },
      },
      {
        kind: 'strength',
        sourceLogId: 'log-dec-prior2',
        date: '2026-07-28',
        startTime: '10:00',
        exerciseId: 'squat',
        exerciseName: 'Squat',
        dimensions: ['knee-dominant-lower-body'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 140, selectedPeakEstimated1RMKg: 140, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2800, highEvidenceLoadVolumeKgReps: 2800, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 21, loadGroups: [] },
      },
    ];

    const opp = deriveCandidateProgressOpportunityEvidence('squat', decliningSessions, evalContext);

    // Below baseline must NOT falsely claim 'maintenance-supported'
    const passed =
      opp.opportunityClass === 'regression-uncertain' &&
      opp.strengthContext?.e1RMTrend === 'below-baseline';

    results.push({
      scenarioName: 'Audit 6: Maintenance Semantics Integrity (Decline is regression-uncertain, not maintenance)',
      passed,
      details: `OpportunityClass: ${opp.opportunityClass}, e1RMTrend: ${opp.strengthContext?.e1RMTrend}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 7: Intensity Shift Truthfulness (Actual Higher Load Required)
  // -------------------------------------------------------------------------
  {
    // Case A: Real Intensity Shift (Volume down, e1RM up from 140 to 150kg)
    const validShiftSessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-shift-latest',
        date: '2026-08-12',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: { totalRawSetCount: 2, explicitWorkingSetCount: 2, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 150, selectedPeakEstimated1RMKg: 150, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 1800, highEvidenceLoadVolumeKgReps: 1800, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 2 },
        workCapacityEvidence: { totalSetCount: 2, totalReps: 10, loadGroups: [] },
      },
      {
        kind: 'strength',
        sourceLogId: 'log-shift-prior',
        date: '2026-08-04',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 140, selectedPeakEstimated1RMKg: 140, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 3200, highEvidenceLoadVolumeKgReps: 3200, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
        workCapacityEvidence: { totalSetCount: 4, totalReps: 24, loadGroups: [] },
      },
    ];

    const validOpp = deriveCandidateProgressOpportunityEvidence('deadlift', validShiftSessions, evalContext);

    // Case B: False Shift (Volume down, e1RM UNCHANGED at 140kg)
    const falseShiftSessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-false-latest',
        date: '2026-08-12',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: { totalRawSetCount: 2, explicitWorkingSetCount: 2, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 140, selectedPeakEstimated1RMKg: 140, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 1800, highEvidenceLoadVolumeKgReps: 1800, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 2 },
        workCapacityEvidence: { totalSetCount: 2, totalReps: 10, loadGroups: [] },
      },
      {
        kind: 'strength',
        sourceLogId: 'log-false-prior',
        date: '2026-08-04',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 140, selectedPeakEstimated1RMKg: 140, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 3200, highEvidenceLoadVolumeKgReps: 3200, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
        workCapacityEvidence: { totalSetCount: 4, totalReps: 24, loadGroups: [] },
      },
    ];

    const falseOpp = deriveCandidateProgressOpportunityEvidence('deadlift', falseShiftSessions, evalContext);

    const passed =
      validOpp.strengthContext?.isIntensityShift === true &&
      validOpp.opportunityClass === 'progression-supported' &&
      falseOpp.strengthContext?.isIntensityShift === false;

    results.push({
      scenarioName: 'Audit 7: Intensity Shift Truthfulness (Requires actual higher-load advancement)',
      passed,
      details: `Valid Shift: isIntensityShift=${validOpp.strengthContext?.isIntensityShift}, False Shift: isIntensityShift=${falseOpp.strengthContext?.isIntensityShift}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 8: Work Capacity Load-Context Preservation
  // -------------------------------------------------------------------------
  {
    // Working sets and reps expanded while keeping load stable
    const workCapacitySessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-wc-latest',
        date: '2026-08-11',
        startTime: '10:00',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 100, selectedPeakEstimated1RMKg: 100, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 3200, highEvidenceLoadVolumeKgReps: 3200, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
        workCapacityEvidence: { totalSetCount: 4, totalReps: 32, loadGroups: [] },
      },
      {
        kind: 'strength',
        sourceLogId: 'log-wc-prior',
        date: '2026-08-04',
        startTime: '10:00',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 100, selectedPeakEstimated1RMKg: 100, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2400, highEvidenceLoadVolumeKgReps: 2400, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 24, loadGroups: [] },
      },
    ];

    const opp = deriveCandidateProgressOpportunityEvidence('bench_press', workCapacitySessions, evalContext);

    const passed =
      opp.opportunityClass === 'progression-supported' &&
      opp.strengthContext?.workCapacityTrend === 'increasing' &&
      opp.strengthContext?.latestWorkingSets === 4;

    results.push({
      scenarioName: 'Audit 8: Work Capacity Load-Context Preservation (Working sets/reps expansion supported)',
      passed,
      details: `OpportunityClass: ${opp.opportunityClass}, WorkCapacityTrend: ${opp.strengthContext?.workCapacityTrend}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 9: True Tie Deterministic Preservation (No ID Dominance)
  // -------------------------------------------------------------------------
  {
    // Two candidate decisions with identical readiness, need, and opportunity classes
    const dummyReadiness = deriveCandidateReadinessEvidence('bench_press', buildResidualStates([], evalContext), evalContext);
    const dummyNeed = deriveCandidateTrainingNeedEvidence('bench_press', [], evalContext);
    const dummyOpp = deriveCandidateProgressOpportunityEvidence('bench_press', [], evalContext);

    const decisionA = deriveCandidateDecisionEvidence(
      dummyReadiness,
      dummyNeed,
      dummyOpp
    );

    const dummyReadinessB = deriveCandidateReadinessEvidence('overhead_press', buildResidualStates([], evalContext), evalContext);
    const dummyNeedB = deriveCandidateTrainingNeedEvidence('overhead_press', [], evalContext);
    const dummyOppB = deriveCandidateProgressOpportunityEvidence('overhead_press', [], evalContext);

    const decisionB = deriveCandidateDecisionEvidence(
      dummyReadinessB,
      dummyNeedB,
      dummyOppB
    );

    const pairComparison = compareCandidatePairwise(decisionA, decisionB);

    const passed =
      pairComparison.isTie === true &&
      pairComparison.winnerId === 'tie' &&
      pairComparison.decidingAxis === 'none-tie';

    results.push({
      scenarioName: 'Audit 9: True Tie Deterministic Preservation (No Semantic ID Priority)',
      passed,
      details: `isTie: ${pairComparison.isTie}, winnerId: ${pairComparison.winnerId}, decidingAxis: ${pairComparison.decidingAxis}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 10: Evidence Boundary Enforcement (No CNS/HRV/Pain/Recovery/RPE estimation)
  // -------------------------------------------------------------------------
  {
    const squatNeed = deriveCandidateTrainingNeedEvidence('squat', [], evalContext);
    const squatOpp = deriveCandidateProgressOpportunityEvidence('squat', [], evalContext);

    // Verify properties contain no CNS/HRV/Pain/RPE fields
    const needKeys = Object.keys(squatNeed);
    const oppKeys = Object.keys(squatOpp);
    const forbiddenSubstrings = ['cns', 'hrv', 'pain', 'soreness', 'recoverypercentage', 'rpe'];

    const hasForbiddenNeed = needKeys.some((k) =>
      forbiddenSubstrings.some((f) => k.toLowerCase().includes(f))
    );
    const hasForbiddenOpp = oppKeys.some((k) =>
      forbiddenSubstrings.some((f) => k.toLowerCase().includes(f))
    );

    const passed = !hasForbiddenNeed && !hasForbiddenOpp;

    results.push({
      scenarioName: 'Audit 10: Evidence Boundary Enforcement (Pure Strength/Cardio inputs only)',
      passed,
      details: `Forbidden keys in Need: ${hasForbiddenNeed}, Forbidden keys in Opp: ${hasForbiddenOpp}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 11: GS1 Isolation (Today Rest vs Next Projected Session)
  // -------------------------------------------------------------------------
  {
    // User completed Deadlift at 09:00 on 2026-08-10.
    // Eval instant is 2026-08-10 at 12:00.
    const gs1Context = deriveEvaluationContext({
      evaluationInstant: '2026-08-10T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const deadliftSessionToday: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-gs1-dl-today',
      date: '2026-08-10',
      startTime: '09:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: { totalRawSetCount: 4, explicitWorkingSetCount: 4, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
      e1RMEvidence: { numericalPeakEstimated1RMKg: 180, selectedPeakEstimated1RMKg: 180, selectedEvidenceQuality: 'high' },
      loadVolumeEvidence: { totalLoadVolumeKgReps: 4000, highEvidenceLoadVolumeKgReps: 4000, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 4 },
      workCapacityEvidence: { totalSetCount: 4, totalReps: 20, loadGroups: [] },
    };

    const priorSessions: StressMagnitudeInput[] = [
      deadliftSessionToday,
      // Bench press done 7 days ago
      {
        kind: 'strength',
        sourceLogId: 'log-gs1-bench-prior',
        date: '2026-08-03',
        startTime: '10:00',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 100, selectedPeakEstimated1RMKg: 100, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2400, highEvidenceLoadVolumeKgReps: 2400, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 24, loadGroups: [] },
      },
    ];

    const residualStates = buildResidualStates(priorSessions, gs1Context);
    const decisionSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'deadlift'],
      residualStates,
      priorSessions,
      gs1Context
    );

    const todayIsRest =
      decisionSet.todayDecision.kind === 'rest' &&
      decisionSet.todayDecision.restCategory === 'completed-session-boundary';

    // In the candidate ranking: Bench Press (clear, due) > Squat (constrained by today's Deadlift axial stress)
    const benchDecision = decisionSet.candidateMap['bench_press'];
    const squatDecision = decisionSet.candidateMap['squat'];
    const benchOverSquat = benchDecision.decisionClass === 'preferred' && squatDecision.decisionClass === 'deferred';

    const passed = todayIsRest && benchOverSquat;

    results.push({
      scenarioName: 'Audit 11: GS1 Isolation (TodayDecision = Rest due to completed session; Next session ranks Bench > Squat)',
      passed,
      details: `TodayDecision: ${decisionSet.todayDecision.kind} (${decisionSet.todayDecision.restCategory}), Bench: ${benchDecision.decisionClass}, Squat: ${squatDecision.decisionClass}.`,
      invariantsChecked: 6,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 12: Caution + Due Candidate Viability (Not Auto-Rest)
  // -------------------------------------------------------------------------
  {
    // A scenario with only caution + due candidates (no clear candidates)
    // Residual caution exists, but no workout completed today -> should recommend training (preferred/viable)
    const cautionSessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-caution-leg',
        date: '2026-08-14',
        startTime: '10:00', // 48h ago (residual caution on legs)
        exerciseId: 'leg_press',
        exerciseName: 'Leg Press',
        dimensions: ['knee-dominant-lower-body'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 200, selectedPeakEstimated1RMKg: 200, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 3000, highEvidenceLoadVolumeKgReps: 3000, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 24, loadGroups: [] },
      },
    ];

    const residualStates = buildResidualStates(cautionSessions, evalContext);
    const decisionSet = evaluateCandidateDecisionSet(
      ['squat'],
      residualStates,
      cautionSessions,
      evalContext
    );

    const passed =
      decisionSet.todayDecision.kind === 'train' &&
      (decisionSet.todayDecision.primaryCandidate?.decisionClass === 'viable' ||
        decisionSet.todayDecision.primaryCandidate?.decisionClass === 'preferred');

    results.push({
      scenarioName: 'Audit 12: Caution + Due Candidate Viability (Not Auto-Rest)',
      passed,
      details: `TodayDecision: ${decisionSet.todayDecision.kind}, CandidateClass: ${decisionSet.todayDecision.primaryCandidate?.decisionClass}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 13: Recently Addressed + Clear Candidate Viability (Not Auto-Rest)
  // -------------------------------------------------------------------------
  {
    // Candidate A was recently addressed (yesterday), Candidate B is exploratory/available
    // Overall decision should be train with Candidate B, NOT auto-Rest
    const mixedSessions: StressMagnitudeInput[] = [
      {
        kind: 'strength',
        sourceLogId: 'log-mixed-bench-yesterday',
        date: '2026-08-15',
        startTime: '10:00', // 26h ago (clear readiness today, but recently addressed)
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: { totalRawSetCount: 3, explicitWorkingSetCount: 3, unknownSetRoleCount: 0, explicitWarmupCount: 0 },
        e1RMEvidence: { numericalPeakEstimated1RMKg: 100, selectedPeakEstimated1RMKg: 100, selectedEvidenceQuality: 'high' },
        loadVolumeEvidence: { totalLoadVolumeKgReps: 2400, highEvidenceLoadVolumeKgReps: 2400, limitedEvidenceLoadVolumeKgReps: 0, observationCount: 3 },
        workCapacityEvidence: { totalSetCount: 3, totalReps: 24, loadGroups: [] },
      },
    ];

    const residualStates = buildResidualStates(mixedSessions, evalContext);
    const decisionSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat'],
      residualStates,
      mixedSessions,
      evalContext
    );

    const passed =
      decisionSet.todayDecision.kind === 'train' &&
      decisionSet.todayDecision.primaryCandidate?.candidateExerciseId === 'squat';

    results.push({
      scenarioName: 'Audit 13: Recently Addressed Candidate does not block viable alternative (Squat recommended)',
      passed,
      details: `TodayDecision: ${decisionSet.todayDecision.kind}, Primary: ${decisionSet.todayDecision.primaryCandidate?.candidateExerciseName}.`,
      invariantsChecked: 4,
    });
  }

  return Object.freeze(results);
}
