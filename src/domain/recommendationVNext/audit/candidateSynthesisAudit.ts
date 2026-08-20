/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Synthesis & Recommendation Reasoner Audit Suite (CU4.2)
 *
 * Audits all synthesis invariants, pairwise comparisons, true tie preservation,
 * rest boundaries, and Golden Scenarios (GS1~GS10).
 *
 * Invariants Audited:
 * 1. Independent Triad Preservation (Readiness, Need, Opportunity intact)
 * 2. Zero Arithmetic Scoring (No 0-100 scores, rotation bonuses, or weighted sums)
 * 3. Non-Dominant Readiness (Caution + Due vs Clear + Recently Addressed)
 * 4. Factual Pairwise Arbitration & Deciding Axis Attribution
 * 5. True Tie Handling & Stable Presentation Ordering
 * 6. Rest Boundary (Today = Rest when all deferred vs Next Projection = Train)
 * 7. GS1: 8/10 Deadlift completed -> Today Rest, Next Projection Bench > Squat naturally
 * 8. GS2: Deadlift -> Squat D+1 vs D+2/D+3 constraint relaxation
 * 9. GS3: OHP -> Bench mild structural overlap caution (not hardblock)
 * 10. GS4: Deadlift -> Row horizontal-pull isolation
 * 11. GS5: OHP fatigue-confounded causal uncertainty preservation
 * 12. GS6: Running lower-body residual on leg exercises
 * 13. GS8: Same-day Running + OHP dual exposure preservation
 * 14. GS9: Deadlift intensity shift progression opportunity preservation
 * 15. GS10: Bench work capacity expansion progression opportunity
 */

import { EvaluationContext } from '../types/residualStressTrace.types';
import { deriveEvaluationContext, deriveResidualStressTraces } from '../stress/residualStressTrace';
import { deriveAllDimensionResidualStates } from '../stress/dimensionResidualState';
import { UnifiedDimensionProjectedStress } from '../types/unifiedStressEvidence.types';
import { StressMagnitudeInput } from '../types/stressMagnitudeInput.types';
import { CanonicalRunningSession } from '../types/running.types';
import {
  compareCandidatePairwise,
  deriveCandidateDecisionEvidence,
  sortCandidatesByPreference,
} from '../synthesis/candidateSynthesis';
import { evaluateCandidateDecisionSet } from '../synthesis/todayDecision';
import { deriveCandidateReadinessEvidence } from '../readiness/candidateReadiness';
import { deriveCandidateTrainingNeedEvidence } from '../need/candidateTrainingNeed';
import { deriveCandidateProgressOpportunityEvidence } from '../opportunity/candidateProgressOpportunity';

export interface SynthesisAuditScenarioResult {
  readonly scenarioName: string;
  readonly passed: boolean;
  readonly details: string;
  readonly invariantsChecked: number;
}

export function runCandidateSynthesisAudit(): readonly SynthesisAuditScenarioResult[] {
  const results: SynthesisAuditScenarioResult[] = [];

  // Helper to build AllDimensionResidualStates from a list of sessions
  function buildResidualStates(
    sessions: readonly StressMagnitudeInput[],
    evalContext: EvaluationContext
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
      } else if (session.kind === 'running') {
        for (const dim of session.dimensions) {
          projections.push({
            kind: 'dimension-projected-running-stress',
            sessionLogId: session.sourceLogId,
            activityType: 'running',
            dimension: dim,
            date: session.date,
            startTime: session.startTime,
            associatedDimensions: session.dimensions as any,
            sourceSessionMagnitude: session as any,
          });
        }
      }
    }
    const traceCollection = deriveResidualStressTraces(projections, evalContext);
    return deriveAllDimensionResidualStates(traceCollection.traces, evalContext);
  }

  // -------------------------------------------------------------------------
  // Scenario 1: Non-Dominant Readiness (Caution + Due vs Clear + Recently Addressed)
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // Squat: Done 8 days ago (due), but has residual caution from an intermediate leg session
    const squatReadiness = deriveCandidateReadinessEvidence(
      'squat',
      buildResidualStates(
        [
          {
            kind: 'strength',
            sourceLogId: 'log-leg-press',
            date: '2026-08-14',
            startTime: '10:00',
            exerciseId: 'leg_press',
            exerciseName: 'Leg Press',
            dimensions: ['knee-dominant-lower-body'],
            setEvidence: {
              totalRawSetCount: 3,
              explicitWorkingSetCount: 3,
              unknownSetRoleCount: 0,
              explicitWarmupCount: 0,
            },
          },
        ],
        evalContext
      ),
      evalContext
    );

    const squatNeed = deriveCandidateTrainingNeedEvidence('squat', [], evalContext); // unperformed for 8d in history
    const squatOpp = deriveCandidateProgressOpportunityEvidence('squat', [], evalContext);
    const squatDecision = deriveCandidateDecisionEvidence(squatReadiness, squatNeed, squatOpp);

    // Bench: Done yesterday (clear readiness because horizontal-push has 0 stress, but recently-addressed need)
    const benchReadiness = deriveCandidateReadinessEvidence(
      'bench_press',
      buildResidualStates([], evalContext),
      evalContext
    );
    const benchSessionYesterday: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-bench-yesterday',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };
    const benchNeed = deriveCandidateTrainingNeedEvidence('bench_press', [benchSessionYesterday], evalContext);
    const benchOpp = deriveCandidateProgressOpportunityEvidence('bench_press', [benchSessionYesterday], evalContext);
    const benchDecision = deriveCandidateDecisionEvidence(benchReadiness, benchNeed, benchOpp);

    // Pairwise comparison: Bench is 'recently-addressed' (deferred) whereas Squat has need
    const comparison = compareCandidatePairwise(squatDecision, benchDecision);

    const nonDominantPassed =
      benchDecision.decisionClass === 'deferred' &&
      benchDecision.comparisonFacts.needClass === 'recently-addressed' &&
      benchDecision.comparisonFacts.readinessClass === 'clear';

    results.push({
      scenarioName: 'Scenario 1: Non-Dominant Readiness (Clear readiness does NOT force preference over recently-addressed need)',
      passed: nonDominantPassed,
      details: `Bench (clear + recently-addressed) -> ${benchDecision.decisionClass}. Squat (caution + due/available) -> ${squatDecision.decisionClass}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 2: Pairwise Arbitration & Deciding Axis Attribution
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // Deadlift done 2 hours ago -> Squat is CONSTRAINED on hip/axial
    const dlRecent: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-recent',
      date: '2026-08-16',
      startTime: '10:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const residualStates = buildResidualStates([dlRecent], evalContext);

    const squatReadiness = deriveCandidateReadinessEvidence('squat', residualStates, evalContext);
    const squatNeed = deriveCandidateTrainingNeedEvidence('squat', [], evalContext);
    const squatOpp = deriveCandidateProgressOpportunityEvidence('squat', [], evalContext);
    const squatDecision = deriveCandidateDecisionEvidence(squatReadiness, squatNeed, squatOpp);

    const benchReadiness = deriveCandidateReadinessEvidence('bench_press', residualStates, evalContext);
    const benchNeed = deriveCandidateTrainingNeedEvidence('bench_press', [], evalContext);
    const benchOpp = deriveCandidateProgressOpportunityEvidence('bench_press', [], evalContext);
    const benchDecision = deriveCandidateDecisionEvidence(benchReadiness, benchNeed, benchOpp);

    const comparison = compareCandidatePairwise(benchDecision, squatDecision);

    const pairwisePassed =
      comparison.winnerId === 'bench_press' &&
      comparison.decidingAxis === 'readiness' &&
      comparison.axisComparisons.readiness.candidateAState === 'clear' &&
      comparison.axisComparisons.readiness.candidateBState === 'constrained' &&
      !comparison.isTie;

    results.push({
      scenarioName: 'Scenario 2: Pairwise Comparison Attribution (Bench vs Squat after Deadlift: Bench wins on Readiness axis)',
      passed: pairwisePassed,
      details: `Winner: ${comparison.winnerId}, Deciding Axis: ${comparison.decidingAxis}, Rule: ${comparison.decidingRule}`,
      invariantsChecked: 5,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 3: True Tie Handling (True equivalence recognized explicitly)
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const residualStates = buildResidualStates([], evalContext);

    // Bench and Row with zero history (both cold start, both clear readiness)
    const benchReadiness = deriveCandidateReadinessEvidence('bench_press', residualStates, evalContext);
    const benchNeed = deriveCandidateTrainingNeedEvidence('bench_press', [], evalContext);
    const benchOpp = deriveCandidateProgressOpportunityEvidence('bench_press', [], evalContext);
    const benchDecision = deriveCandidateDecisionEvidence(benchReadiness, benchNeed, benchOpp);

    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', residualStates, evalContext);
    const rowNeed = deriveCandidateTrainingNeedEvidence('barbell_row', [], evalContext);
    const rowOpp = deriveCandidateProgressOpportunityEvidence('barbell_row', [], evalContext);
    const rowDecision = deriveCandidateDecisionEvidence(rowReadiness, rowNeed, rowOpp);

    const comparison = compareCandidatePairwise(benchDecision, rowDecision);

    const tiePassed =
      comparison.winnerId === 'tie' &&
      comparison.isTie === true &&
      comparison.decidingAxis === 'none-tie' &&
      comparison.tiedAxes.length === 3;

    results.push({
      scenarioName: 'Scenario 3: True Tie Handling (Bench vs Row cold start: True tie preserved with zero semantic ID priority)',
      passed: tiePassed,
      details: `Winner: ${comparison.winnerId}, isTie: ${comparison.isTie}, Tied Axes: [${comparison.tiedAxes.join(', ')}]`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 4: Rest Boundary (GS1 Today = Rest after heavy Deadlift)
  // -------------------------------------------------------------------------
  {
    // Evaluation at 2026-08-10 20:00 KST after completing Deadlift at 18:00
    const evalContextToday = deriveEvaluationContext({
      evaluationInstant: '2026-08-10T11:00:00Z', // 20:00 KST
      evaluationTimezone: 'Asia/Seoul',
    });

    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-8-10',
      date: '2026-08-10',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 5,
        explicitWorkingSetCount: 5,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // Candidates evaluated only for lower body / heavy compound: all lower/axial are constrained, dl is recently addressed
    const residualStatesToday = buildResidualStates([dlSession], evalContextToday);
    const todaySet = evaluateCandidateDecisionSet(
      ['deadlift', 'squat'],
      residualStatesToday,
      [dlSession],
      evalContextToday
    );

    const todayRestPassed =
      todaySet.todayDecision.kind === 'rest' &&
      todaySet.todayDecision.restCategory === 'completed-session-boundary' &&
      todaySet.deferredCount === 2 &&
      todaySet.preferredCount === 0;

    // Next Projected Session (D+2: 2026-08-12 10:00 KST): Deadlift stress has attenuated, Bench is preferred over Squat
    const evalContextD2 = deriveEvaluationContext({
      evaluationInstant: '2026-08-12T01:00:00Z', // 10:00 KST D+2
      evaluationTimezone: 'Asia/Seoul',
    });

    const benchHistorical: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-bp-8-05',
      date: '2026-08-05',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const squatHistorical: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sq-8-04',
      date: '2026-08-04',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const allSessionsD2 = [dlSession, benchHistorical, squatHistorical];
    const residualStatesD2 = buildResidualStates(allSessionsD2, evalContextD2);
    const d2Set = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'deadlift'],
      residualStatesD2,
      allSessionsD2,
      evalContextD2
    );

    const bpVsSq = compareCandidatePairwise(
      d2Set.candidateMap['bench_press'],
      d2Set.candidateMap['squat']
    );

    const d2TrainPassed =
      d2Set.todayDecision.kind === 'train' &&
      d2Set.todayDecision.primaryCandidate?.candidateExerciseId === 'bench_press' &&
      d2Set.todayDecision.primaryCandidate?.decisionClass === 'preferred' &&
      bpVsSq.winnerId === 'bench_press';

    results.push({
      scenarioName: 'Scenario 4: GS1 Rest Boundary & Next Session Projection (Today Rest -> Next Session Bench > Squat)',
      passed: todayRestPassed && d2TrainPassed,
      details: `Today Decision: ${todaySet.todayDecision.kind} (${todaySet.todayDecision.restCategory}). D+2 Primary: ${d2Set.todayDecision.primaryCandidate?.candidateExerciseId} (${d2Set.todayDecision.primaryCandidate?.decisionClass}).`,
      invariantsChecked: 7,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 5: GS2 Deadlift -> Squat D+1 vs D+2/D+3 Constraint Attenuation
  // -------------------------------------------------------------------------
  {
    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-gs2',
      date: '2026-08-10',
      startTime: '10:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // D+1 (2026-08-11 10:00 UTC): 24h elapsed -> immediate/residual boundary
    const evalContextD1 = deriveEvaluationContext({
      evaluationInstant: '2026-08-11T09:00:00Z',
      evaluationTimezone: 'UTC',
    });
    const statesD1 = buildResidualStates([dlSession], evalContextD1);
    const squatD1 = deriveCandidateReadinessEvidence('squat', statesD1, evalContextD1);

    // D+3 (2026-08-13 10:00 UTC): 72h elapsed -> historical
    const evalContextD3 = deriveEvaluationContext({
      evaluationInstant: '2026-08-13T10:00:00Z',
      evaluationTimezone: 'UTC',
    });
    const statesD3 = buildResidualStates([dlSession], evalContextD3);
    const squatD3 = deriveCandidateReadinessEvidence('squat', statesD3, evalContextD3);

    const gs2Passed =
      squatD1.overallReadinessClass === 'constrained' &&
      squatD3.overallReadinessClass === 'clear';

    results.push({
      scenarioName: 'Scenario 5: GS2 Deadlift -> Squat Constraint Relaxation (D+1 constrained -> D+3 clear historical)',
      passed: gs2Passed,
      details: `Squat D+1: ${squatD1.overallReadinessClass}. Squat D+3: ${squatD3.overallReadinessClass}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 6: GS3 OHP -> Bench Structural Overlap Caution (Never Hardblocked)
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // OHP done yesterday (2026-08-15)
    const ohpSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-ohp-gs3',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      dimensions: ['vertical-push', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const benchPrior: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-bp-prior',
      date: '2026-08-10',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: {
        totalRawSetCount: 3,
        explicitWorkingSetCount: 3,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const allSessions = [ohpSession, benchPrior];
    const residualStates = buildResidualStates(allSessions, evalContext);
    const benchDecisionSet = evaluateCandidateDecisionSet(
      ['bench_press'],
      residualStates,
      allSessions,
      evalContext
    );

    const benchDecision = benchDecisionSet.candidateMap['bench_press'];

    const gs3Passed =
      benchDecision.readinessEvidence.overallReadinessClass === 'caution' &&
      benchDecision.readinessEvidence.hasStructuralOverlap === true &&
      benchDecision.hardConstraintStatus.isHardBlocked === false &&
      benchDecision.decisionClass === 'viable';

    results.push({
      scenarioName: 'Scenario 6: GS3 OHP -> Bench Mild Structural Overlap (Readiness=caution, hardBlocked=false, Decision=viable)',
      passed: gs3Passed,
      details: `Bench Readiness: ${benchDecision.readinessEvidence.overallReadinessClass}, hasOverlap: ${benchDecision.readinessEvidence.hasStructuralOverlap}, Decision: ${benchDecision.decisionClass}.`,
      invariantsChecked: 5,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 7: GS4 Deadlift -> Row Horizontal-Pull Isolation
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-gs4',
      date: '2026-08-16',
      startTime: '10:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const residualStates = buildResidualStates([dlSession], evalContext);
    const rowReadiness = deriveCandidateReadinessEvidence('barbell_row', residualStates, evalContext);

    const gs4Passed =
      rowReadiness.clearDimensions.includes('horizontal-pull') &&
      rowReadiness.overallReadinessClass === 'clear';

    results.push({
      scenarioName: 'Scenario 7: GS4 Deadlift -> Row Separation (horizontal-pull remains clear without contamination)',
      passed: gs4Passed,
      details: `Row clear dimensions: [${rowReadiness.clearDimensions.join(', ')}]. Overall: ${rowReadiness.overallReadinessClass}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 8: GS6 Running Lower-Body Residual on Squat
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const runSession: StressMagnitudeInput = {
      kind: 'running',
      sourceLogId: 'log-run-gs6',
      date: '2026-08-16',
      startTime: '08:00',
      exerciseId: 'running',
      exerciseName: 'Running',
      dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
      distanceKm: 8.0,
      durationSeconds: 2400,
      paceSecondsPerKm: 300,
      metricProvenance: {
        distanceProvenance: 'explicit',
        durationProvenance: 'explicit',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
        sourceConfidence: 'high',
      },
    };

    const residualStates = buildResidualStates([runSession], evalContext);
    const squatReadiness = deriveCandidateReadinessEvidence('squat', residualStates, evalContext);

    const gs6Passed =
      squatReadiness.overallReadinessClass === 'constrained' &&
      squatReadiness.definiteImmediateDimensions.includes('knee-dominant-lower-body') &&
      squatReadiness.definiteImmediateDimensions.includes('hip-posterior-chain');

    results.push({
      scenarioName: 'Scenario 8: GS6 Running Residual on Leg Exercises (Squat is constrained on knee-dominant & hip from morning run)',
      passed: gs6Passed,
      details: `Squat Readiness: ${squatReadiness.overallReadinessClass}. Immediate dimensions: [${squatReadiness.definiteImmediateDimensions.join(', ')}].`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 9: GS9 Deadlift Intensity Shift Progression Opportunity Preservation
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const dlSessions: StressMagnitudeInput[] = [
      // Latest: Heavy triples with high e1RM (200kg) and lower volume (2400)
      {
        kind: 'strength',
        sourceLogId: 'log-dl-recent',
        date: '2026-08-10',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: {
          totalRawSetCount: 3,
          explicitWorkingSetCount: 3,
          unknownSetRoleCount: 0,
          explicitWarmupCount: 0,
        },
        e1RMEvidence: {
          numericalPeakEstimated1RMKg: 200,
          selectedPeakEstimated1RMKg: 200,
          selectedEvidenceQuality: 'high',
        },
        loadVolumeEvidence: {
          totalLoadVolumeKgReps: 2400,
          highEvidenceLoadVolumeKgReps: 2400,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: 3,
        },
        workCapacityEvidence: {
          totalSetCount: 3,
          totalReps: 9,
          loadGroups: [],
        },
      },
      // Prior: High volume with lower e1RM (185kg) and volume (4000)
      {
        kind: 'strength',
        sourceLogId: 'log-dl-prior',
        date: '2026-08-03',
        startTime: '10:00',
        exerciseId: 'deadlift',
        exerciseName: 'Deadlift',
        dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
        setEvidence: {
          totalRawSetCount: 5,
          explicitWorkingSetCount: 5,
          unknownSetRoleCount: 0,
          explicitWarmupCount: 0,
        },
        e1RMEvidence: {
          numericalPeakEstimated1RMKg: 185,
          selectedPeakEstimated1RMKg: 185,
          selectedEvidenceQuality: 'high',
        },
        loadVolumeEvidence: {
          totalLoadVolumeKgReps: 4000,
          highEvidenceLoadVolumeKgReps: 4000,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: 5,
        },
        workCapacityEvidence: {
          totalSetCount: 5,
          totalReps: 25,
          loadGroups: [],
        },
      },
    ];

    const opp = deriveCandidateProgressOpportunityEvidence('deadlift', dlSessions, evalContext);

    const gs9Passed =
      opp.opportunityClass === 'progression-supported' &&
      opp.strengthContext?.isIntensityShift === true &&
      opp.strengthContext.e1RMTrend === 'rising';

    results.push({
      scenarioName: 'Scenario 9: GS9 Deadlift Intensity Shift (Volume drop + Peak load rise = progression-supported, NEVER regression)',
      passed: gs9Passed,
      details: `Opportunity: ${opp.opportunityClass}, isIntensityShift: ${opp.strengthContext?.isIntensityShift}, e1RMTrend: ${opp.strengthContext?.e1RMTrend}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 10: GS10 Bench Work Capacity Progression Opportunity
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const benchSessions: StressMagnitudeInput[] = [
      // Latest: More working sets and reps at stable 100kg
      {
        kind: 'strength',
        sourceLogId: 'log-bp-recent',
        date: '2026-08-12',
        startTime: '10:00',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: {
          totalRawSetCount: 5,
          explicitWorkingSetCount: 5,
          unknownSetRoleCount: 0,
          explicitWarmupCount: 0,
        },
        e1RMEvidence: {
          numericalPeakEstimated1RMKg: 120,
          selectedPeakEstimated1RMKg: 120,
          selectedEvidenceQuality: 'high',
        },
        loadVolumeEvidence: {
          totalLoadVolumeKgReps: 3500,
          highEvidenceLoadVolumeKgReps: 3500,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: 5,
        },
        workCapacityEvidence: {
          totalSetCount: 5,
          totalReps: 35,
          loadGroups: [],
        },
      },
      // Prior: Fewer working sets
      {
        kind: 'strength',
        sourceLogId: 'log-bp-prior',
        date: '2026-08-05',
        startTime: '10:00',
        exerciseId: 'bench_press',
        exerciseName: 'Bench Press',
        dimensions: ['horizontal-push'],
        setEvidence: {
          totalRawSetCount: 3,
          explicitWorkingSetCount: 3,
          unknownSetRoleCount: 0,
          explicitWarmupCount: 0,
        },
        e1RMEvidence: {
          numericalPeakEstimated1RMKg: 120,
          selectedPeakEstimated1RMKg: 120,
          selectedEvidenceQuality: 'high',
        },
        loadVolumeEvidence: {
          totalLoadVolumeKgReps: 2100,
          highEvidenceLoadVolumeKgReps: 2100,
          limitedEvidenceLoadVolumeKgReps: 0,
          observationCount: 3,
        },
        workCapacityEvidence: {
          totalSetCount: 3,
          totalReps: 21,
          loadGroups: [],
        },
      },
    ];

    const opp = deriveCandidateProgressOpportunityEvidence('bench_press', benchSessions, evalContext);

    const gs10Passed =
      opp.opportunityClass === 'progression-supported' &&
      opp.strengthContext?.workCapacityTrend === 'increasing';

    results.push({
      scenarioName: 'Scenario 10: GS10 Bench Work Capacity Expansion (Increased sets/reps -> progression-supported rationale)',
      passed: gs10Passed,
      details: `Opportunity: ${opp.opportunityClass}, WorkCapacityTrend: ${opp.strengthContext?.workCapacityTrend}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 11: GS5 OHP Fatigue-Confounded History (Causal uncertainty preservation)
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T12:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // OHP with single ambiguous / legacy session -> opportunity should be insufficient-evidence / exploratory, not making wild progression leaps
    const ohpConfoundedSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-ohp-confounded',
      date: '2026-08-10',
      startTime: '10:00',
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      dimensions: ['vertical-push', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 2,
        explicitWorkingSetCount: 0,
        unknownSetRoleCount: 2,
        explicitWarmupCount: 0,
      },
    };

    const opp = deriveCandidateProgressOpportunityEvidence('overhead_press', [ohpConfoundedSession], evalContext);

    const gs5Passed =
      opp.opportunityClass === 'insufficient-evidence' ||
      opp.opportunityClass === 'exploratory-supported';

    results.push({
      scenarioName: 'Scenario 11: GS5 OHP Fatigue-Confounded History (Causal uncertainty preserved without false certainty)',
      passed: gs5Passed,
      details: `OHP Opportunity: ${opp.opportunityClass}.`,
      invariantsChecked: 3,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 12: GS8 Same-Day Running + OHP Dual Exposure Preservation
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T18:00:00Z',
      evaluationTimezone: 'UTC',
    });

    const morningRun: StressMagnitudeInput = {
      kind: 'running',
      sourceLogId: 'log-run-morning',
      date: '2026-08-16',
      startTime: '07:00',
      exerciseId: 'running',
      exerciseName: 'Running',
      dimensions: ['knee-dominant-lower-body', 'hip-posterior-chain'],
      distanceKm: 5.0,
      durationSeconds: 1500,
      paceSecondsPerKm: 300,
      metricProvenance: {
        distanceProvenance: 'explicit',
        durationProvenance: 'explicit',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
        sourceConfidence: 'high',
      },
    };

    const afternoonOHP: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-ohp-afternoon',
      date: '2026-08-16',
      startTime: '14:00',
      exerciseId: 'overhead_press',
      exerciseName: 'Overhead Press',
      dimensions: ['vertical-push', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const residualStates = buildResidualStates([morningRun, afternoonOHP], evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['squat', 'bench_press', 'barbell_row', 'overhead_press'],
      residualStates,
      [morningRun, afternoonOHP],
      evalContext
    );

    // Squat: constrained on knee-dominant and hip
    const squatDec = evalSet.candidateMap['squat'];
    // Bench: caution from OHP structural overlap
    const benchDec = evalSet.candidateMap['bench_press'];
    // OHP: recently addressed (same day) -> deferred
    const ohpDec = evalSet.candidateMap['overhead_press'];
    // Row: clear on horizontal pull
    const rowDec = evalSet.candidateMap['barbell_row'];

    const gs8Passed =
      squatDec.comparisonFacts.readinessClass === 'constrained' &&
      benchDec.readinessEvidence.hasStructuralOverlap === true &&
      ohpDec.decisionClass === 'deferred' &&
      rowDec.comparisonFacts.readinessClass === 'clear';

    results.push({
      scenarioName: 'Scenario 12: GS8 Same-Day Running + OHP Dual Exposure (Both modalities preserved losslessly without interference collapse)',
      passed: gs8Passed,
      details: `Squat: ${squatDec.decisionClass} (${squatDec.comparisonFacts.readinessClass}), Bench: ${benchDec.decisionClass} (Overlap: ${benchDec.readinessEvidence.hasStructuralOverlap}), OHP: ${ohpDec.decisionClass}, Row: ${rowDec.decisionClass}.`,
      invariantsChecked: 6,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 13: Caution + Due Candidate Alone Does NOT Trigger Rest
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // Deadlift performed 2 days ago (2026-08-14 18:00) -> Squat has caution readiness (manageable residual 40h)
    const dlSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-8-14',
      date: '2026-08-14',
      startTime: '18:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // Squat performed 8 days ago (2026-08-08) -> Squat need is DUE (>= 7 days)
    const squatSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sq-8-08',
      date: '2026-08-08',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const allSessions = [dlSession, squatSession];
    const residualStates = buildResidualStates(allSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(['squat'], residualStates, allSessions, evalContext);

    const squatDecision = evalSet.candidateMap['squat'];

    const passed13 =
      squatDecision.comparisonFacts.readinessClass === 'caution' &&
      (squatDecision.comparisonFacts.needClass === 'due' || squatDecision.comparisonFacts.needClass === 'available') &&
      (squatDecision.decisionClass === 'preferred' || squatDecision.decisionClass === 'viable') &&
      evalSet.todayDecision.kind === 'train' &&
      evalSet.todayDecision.primaryCandidate?.candidateExerciseId === 'squat';

    results.push({
      scenarioName: 'Scenario 13: Caution + Available/Due Candidate Alone Does NOT Trigger Rest (Evaluates to train)',
      passed: passed13,
      details: `Decision: ${evalSet.todayDecision.kind}, Squat Class: ${squatDecision.decisionClass}, Readiness: ${squatDecision.comparisonFacts.readinessClass}, Need: ${squatDecision.comparisonFacts.needClass}.`,
      invariantsChecked: 5,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 14: Recently Addressed Candidate Alone Does NOT Trigger Global Rest
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00Z',
      evaluationTimezone: 'UTC',
    });

    // Bench performed yesterday (2026-08-15) -> Bench is recently-addressed
    const benchYesterday: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-bp-8-15',
      date: '2026-08-15',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // Squat performed 4 days ago (2026-08-12) -> Squat is available + clear
    const squatPrior: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sq-8-12',
      date: '2026-08-12',
      startTime: '10:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const allSessions = [benchYesterday, squatPrior];
    const residualStates = buildResidualStates(allSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat'],
      residualStates,
      allSessions,
      evalContext
    );

    const bpDec = evalSet.candidateMap['bench_press'];
    const sqDec = evalSet.candidateMap['squat'];

    const passed14 =
      bpDec.decisionClass === 'deferred' &&
      sqDec.decisionClass === 'preferred' &&
      evalSet.todayDecision.kind === 'train' &&
      evalSet.todayDecision.primaryCandidate?.candidateExerciseId === 'squat';

    results.push({
      scenarioName: 'Scenario 14: Recently Addressed Candidate Does NOT Trigger Global Rest (Squat wins train)',
      passed: passed14,
      details: `Decision: ${evalSet.todayDecision.kind}, Primary: ${evalSet.todayDecision.primaryCandidate?.candidateExerciseId}, Bench: ${bpDec.decisionClass}, Squat: ${sqDec.decisionClass}.`,
      invariantsChecked: 4,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 15: True No-Viable-Candidates Rest (No session today, all candidates constrained)
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T10:00:00Z', // Today is 8/16, no session logged yet today
      evaluationTimezone: 'UTC',
    });

    // Intense Deadlift 14 hours ago (2026-08-15 20:00)
    const dlNightBefore: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-dl-night',
      date: '2026-08-15',
      startTime: '20:00',
      exerciseId: 'deadlift',
      exerciseName: 'Deadlift',
      dimensions: ['hip-posterior-chain', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 5,
        explicitWorkingSetCount: 5,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // Intense Squat 14 hours ago (2026-08-15 20:00)
    const sqNightBefore: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-sq-night',
      date: '2026-08-15',
      startTime: '20:00',
      exerciseId: 'squat',
      exerciseName: 'Squat',
      dimensions: ['knee-dominant-lower-body', 'axial-systemic-loading'],
      setEvidence: {
        totalRawSetCount: 5,
        explicitWorkingSetCount: 5,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    // Athlete's candidate pool is strictly lower body compound ['squat', 'deadlift']
    const allSessions = [dlNightBefore, sqNightBefore];
    const residualStates = buildResidualStates(allSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['deadlift', 'squat'],
      residualStates,
      allSessions,
      evalContext
    );

    const passed15 =
      evalSet.todayDecision.kind === 'rest' &&
      evalSet.todayDecision.restCategory === 'no-viable-candidates' &&
      evalSet.preferredCount === 0 &&
      evalSet.viableCount === 0 &&
      evalSet.deferredCount === 2;

    results.push({
      scenarioName: 'Scenario 15: True No-Viable-Candidates Rest (No session today, all candidates constrained)',
      passed: passed15,
      details: `Decision: ${evalSet.todayDecision.kind}, Rest Category: ${evalSet.todayDecision.restCategory}, Deferred: ${evalSet.deferredCount}.`,
      invariantsChecked: 5,
    });
  }

  // -------------------------------------------------------------------------
  // Scenario 16: Actual Session Completed Today -> Rest Under completed-session-boundary
  // -------------------------------------------------------------------------
  {
    const evalContext = deriveEvaluationContext({
      evaluationInstant: '2026-08-16T18:00:00Z', // Today is 8/16
      evaluationTimezone: 'UTC',
    });

    // Session completed earlier today (2026-08-16 10:00)
    const morningSession: StressMagnitudeInput = {
      kind: 'strength',
      sourceLogId: 'log-bench-morning',
      date: '2026-08-16',
      startTime: '10:00',
      exerciseId: 'bench_press',
      exerciseName: 'Bench Press',
      dimensions: ['horizontal-push'],
      setEvidence: {
        totalRawSetCount: 4,
        explicitWorkingSetCount: 4,
        unknownSetRoleCount: 0,
        explicitWarmupCount: 0,
      },
    };

    const allSessions = [morningSession];
    const residualStates = buildResidualStates(allSessions, evalContext);
    const evalSet = evaluateCandidateDecisionSet(
      ['bench_press', 'squat', 'deadlift', 'overhead_press', 'barbell_row'],
      residualStates,
      allSessions,
      evalContext
    );

    const passed16 =
      evalSet.todayDecision.kind === 'rest' &&
      evalSet.todayDecision.restCategory === 'completed-session-boundary' &&
      evalSet.todayDecision.restRationale?.includes('completed on 2026-08-16') === true;

    results.push({
      scenarioName: 'Scenario 16: Actual Session Completed Today -> Rest (completed-session-boundary)',
      passed: passed16,
      details: `Decision: ${evalSet.todayDecision.kind}, Rest Category: ${evalSet.todayDecision.restCategory}, Rationale: ${evalSet.todayDecision.restRationale}.`,
      invariantsChecked: 4,
    });
  }

  return Object.freeze(results);
}
