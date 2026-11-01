/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Candidate Readiness Evaluation Framework (VNext Recommendation Engine - CU4.0)
 *
 * Implements pure, deterministic domain evaluation comparing candidate-required StressDimensions
 * against current DimensionResidualStates without numerical scores, arbitrary recovery %,
 * or global readiness collapse.
 *
 * Strict Invariants:
 * 1. Candidate-Specific Scope: Readiness is evaluated strictly per candidate exercise.
 * 2. Structural Evidence Mapping: Uses CU3.1 Frozen Stress Vocabulary memberships directly.
 * 3. Zero Scalar Scoring: No 0-100 scores, fatigue points, or arbitrary interaction penalties.
 * 4. Ordered Categorical Taxonomy: 'constrained' > 'caution' > 'clear' (and 'unmapped').
 * 5. Uncertainty & Bracket Preservation: Uncertainty is never treated as clear/ready;
 *    potential promotions are flagged as caution without false confirmation.
 * 6. Historical Non-Overstatement: Historical-only evidence (>=72h) evaluates to clear readiness.
 * 7. Hard Constraint Minimization: Future evidence, uncertainty, or residual evidence alone
 *    do not trigger arbitrary hard blocks.
 * 8. Pure Immutability: Deeply frozen return structures with zero input mutation.
 */

import { ExerciseStressProfile, StressDimension } from '../types/stressModel.types';
import {
  EvaluationContext,
  PersistenceState,
  ResidualStressTrace,
} from '../types/residualStressTrace.types';
import {
  AllDimensionResidualStates,
  DimensionModalityPresence,
  DimensionResidualState,
} from '../types/dimensionResidualState.types';
import {
  CandidateDimensionReadinessAssessment,
  CandidateHardConstraintBoundary,
  CandidateModalityContext,
  CandidateReadinessClass,
  CandidateReadinessEvaluationSet,
  CandidateReadinessEvidence,
  CandidateReadinessExplainabilitySummary,
  DimensionReadinessStatus,
  StructuralOverlapRelation,
  StructuralReadinessOverlap,
} from '../types/candidateReadiness.types';
import {
  CANONICAL_EXERCISE_STRESS_PROFILES,
  getCanonicalExerciseStressProfile,
} from '../stress/stressVocabulary';
import { getExerciseMusculoskeletalProfile } from '../musculoskeletal/exerciseMusculoskeletalProfiles';

/**
 * Default foundation candidate exercise identifiers for comprehensive evaluation sweeps.
 */
export const DEFAULT_FOUNDATION_CANDIDATE_IDS: readonly string[] = Object.freeze([
  'squat',
  'deadlift',
  'bench_press',
  'overhead_press',
  'barbell_row',
  'running',
]);

/**
 * Verifies whether the canonical relationship contract for torso support demand overlap
 * is fulfilled between the source exercise and candidate exercise.
 *
 * Strict Architectural Invariants:
 * 1. Only the two explicit directions are supported:
 *    - Conventional Deadlift -> Barbell Row candidate
 *    - Barbell Row -> Conventional Deadlift candidate
 * 2. Contract Verification:
 *    - Both profiles must have 'erector-spinae' as 'stabilizer'.
 *    - Both profiles must require 'high-isometric-stabilization'.
 *    - Both profiles must have supportType 'unsupported-free-weight'.
 *    - Lookups must return 'supported' (no unconfirmed variations or unsupported exercises).
 *    - Source ID and Name must not contradict each other.
 */
function isEligibleTorsoSupportDemandOverlapPair(
  sourceExerciseId: string,
  sourceExerciseName: string,
  candidateExerciseId: string
): { eligible: boolean; sourceCanonicalName?: string; rejectionReason?: string } {
  // Only the two explicit bidirectional pairs are supported
  const isDeadliftToRow = sourceExerciseId === 'deadlift' && candidateExerciseId === 'barbell_row';
  const isRowToDeadlift = sourceExerciseId === 'barbell_row' && candidateExerciseId === 'deadlift';

  if (!isDeadliftToRow && !isRowToDeadlift) {
    return { eligible: false };
  }

  // 1. Verify candidate profile in musculoskeletal relation table
  const candidateLookup = getExerciseMusculoskeletalProfile(candidateExerciseId);
  if (candidateLookup.status !== 'supported') {
    return {
      eligible: false,
      rejectionReason: `Candidate exercise '${candidateExerciseId}' is not a supported baseline profile (status: ${candidateLookup.status}).`,
    };
  }

  // 2. Verify source exercise ID and source exercise name in musculoskeletal relation table
  const sourceIdLookup = getExerciseMusculoskeletalProfile(sourceExerciseId);
  const sourceNameLookup = getExerciseMusculoskeletalProfile(sourceExerciseName);

  // If source ID or name indicates an unconfirmed variation (e.g. RDL, chest-supported row)
  if (
    sourceIdLookup.status === 'unconfirmed-variation' ||
    sourceNameLookup.status === 'unconfirmed-variation'
  ) {
    return {
      eligible: false,
      rejectionReason: `Source exercise (${sourceExerciseId} / ${sourceExerciseName}) is an unconfirmed variation and cannot be assumed as baseline.`,
    };
  }

  if (sourceIdLookup.status !== 'supported' || sourceNameLookup.status !== 'supported') {
    return {
      eligible: false,
      rejectionReason: `Source exercise (${sourceExerciseId} / ${sourceExerciseName}) is not a supported canonical exercise.`,
    };
  }

  // Check for contradiction between ID and Name
  if (sourceIdLookup.profile.exerciseId !== sourceNameLookup.profile.exerciseId) {
    return {
      eligible: false,
      rejectionReason: `Source exercise ID '${sourceExerciseId}' conflicts with exercise name '${sourceExerciseName}'.`,
    };
  }

  const sProf = sourceIdLookup.profile;
  const cProf = candidateLookup.profile;

  // Confirm kinesiological torso support contract
  const sHasErectorStabilizer = sProf.muscleInvolvements.some(
    (m) => m.regionId === 'erector-spinae' && m.role === 'stabilizer'
  );
  const cHasErectorStabilizer = cProf.muscleInvolvements.some(
    (m) => m.regionId === 'erector-spinae' && m.role === 'stabilizer'
  );

  const sHighTorsoSupport = sProf.torsoSupportDemand.demandLevel === 'high-isometric-stabilization';
  const cHighTorsoSupport = cProf.torsoSupportDemand.demandLevel === 'high-isometric-stabilization';

  const sUnsupportedWeight = sProf.externalSupportOrVariation.supportType === 'unsupported-free-weight';
  const cUnsupportedWeight = cProf.externalSupportOrVariation.supportType === 'unsupported-free-weight';

  if (
    !sHasErectorStabilizer ||
    !cHasErectorStabilizer ||
    !sHighTorsoSupport ||
    !cHighTorsoSupport ||
    !sUnsupportedWeight ||
    !cUnsupportedWeight
  ) {
    return {
      eligible: false,
      rejectionReason: 'Musculoskeletal profile requirements for torso support demand overlap are not fully satisfied.',
    };
  }

  return {
    eligible: true,
    sourceCanonicalName: sProf.canonicalName,
  };
}

/**
 * Derives non-numeric structural readiness overlaps across related dimensions and movement requirements (CU4.0A / Phase 2).
 * Evaluates minimal kinesiological relationships:
 * 1. 'press-pattern-overlap' (horizontal-push <-> vertical-push)
 * 2. 'torso-support-demand-overlap' (deadlift <-> barbell_row)
 * without arbitrary interference matrices or numerical penalty scores.
 */
function deriveStructuralReadinessOverlaps(
  candidateExerciseId: string,
  candidateExerciseName: string,
  requiredDimensions: readonly StressDimension[],
  allDimensionResidualStates: AllDimensionResidualStates
): readonly StructuralReadinessOverlap[] {
  const overlaps: StructuralReadinessOverlap[] = [];

  // -------------------------------------------------------------------------
  // Check 1: 'press-pattern-overlap' between horizontal-push and vertical-push
  // -------------------------------------------------------------------------
  const hasHorizontalPush = requiredDimensions.includes('horizontal-push');
  const hasVerticalPush = requiredDimensions.includes('vertical-push');

  if (hasHorizontalPush && !hasVerticalPush) {
    // Candidate requires horizontal-push (e.g. bench_press); check vertical-push residual state (e.g. overhead_press)
    const verticalState = allDimensionResidualStates['vertical-push'];
    if (verticalState && verticalState.relevantTraces.length > 0) {
      const tracesByExercise = new Map<string, { name: string; traces: ResidualStressTrace[] }>();
      for (const trace of verticalState.relevantTraces) {
        let exId = 'unknown';
        let exName = '미분류 운동';
        if (trace.sourceEvidence.kind === 'dimension-projected-strength-stress') {
          exId = trace.sourceEvidence.sourceSessionMagnitude.exerciseId;
          exName = trace.sourceEvidence.sourceSessionMagnitude.exerciseName;
        } else if (trace.sourceEvidence.kind === 'dimension-projected-running-stress') {
          exId = 'running';
          exName = '러닝';
        }
        if (!tracesByExercise.has(exId)) {
          tracesByExercise.set(exId, { name: exName, traces: [] });
        }
        tracesByExercise.get(exId)!.traces.push(trace);
      }

      for (const [sourceExId, { name: sourceExName, traces }] of tracesByExercise.entries()) {
        let persistence: PersistenceState | 'bracket' | 'uncertain' = 'historical';
        if (
          traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'immediate'
          )
        ) {
          persistence = 'immediate';
        } else if (
          traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'residual'
          )
        ) {
          persistence = 'residual';
        } else if (
          traces.some((t) => t.temporalAttenuation.kind === 'bracket-ordinal')
        ) {
          persistence = 'bracket';
        } else if (
          traces.some((t) => t.temporalAttenuation.kind === 'uncomputed')
        ) {
          persistence = 'uncertain';
        }

        overlaps.push(
          Object.freeze({
            relation: 'press-pattern-overlap',
            sourceExerciseId: sourceExId,
            sourceExerciseName: sourceExName,
            sourceDimension: 'vertical-push',
            targetDimension: 'horizontal-push',
            persistence,
            sourceTraceRefs: Object.freeze([...traces]),
            rationale:
              'Shares anterior deltoid, clavicular pectoralis, and triceps pressing mechanics across movement planes.',
          })
        );
      }
    }
  } else if (hasVerticalPush && !hasHorizontalPush) {
    // Candidate requires vertical-push (e.g. overhead_press); check horizontal-push residual state (e.g. bench_press)
    const horizontalState = allDimensionResidualStates['horizontal-push'];
    if (horizontalState && horizontalState.relevantTraces.length > 0) {
      const tracesByExercise = new Map<string, { name: string; traces: ResidualStressTrace[] }>();
      for (const trace of horizontalState.relevantTraces) {
        let exId = 'unknown';
        let exName = '미분류 운동';
        if (trace.sourceEvidence.kind === 'dimension-projected-strength-stress') {
          exId = trace.sourceEvidence.sourceSessionMagnitude.exerciseId;
          exName = trace.sourceEvidence.sourceSessionMagnitude.exerciseName;
        } else if (trace.sourceEvidence.kind === 'dimension-projected-running-stress') {
          exId = 'running';
          exName = '러닝';
        }
        if (!tracesByExercise.has(exId)) {
          tracesByExercise.set(exId, { name: exName, traces: [] });
        }
        tracesByExercise.get(exId)!.traces.push(trace);
      }

      for (const [sourceExId, { name: sourceExName, traces }] of tracesByExercise.entries()) {
        let persistence: PersistenceState | 'bracket' | 'uncertain' = 'historical';
        if (
          traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'immediate'
          )
        ) {
          persistence = 'immediate';
        } else if (
          traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'residual'
          )
        ) {
          persistence = 'residual';
        } else if (
          traces.some((t) => t.temporalAttenuation.kind === 'bracket-ordinal')
        ) {
          persistence = 'bracket';
        } else if (
          traces.some((t) => t.temporalAttenuation.kind === 'uncomputed')
        ) {
          persistence = 'uncertain';
        }

        overlaps.push(
          Object.freeze({
            relation: 'press-pattern-overlap',
            sourceExerciseId: sourceExId,
            sourceExerciseName: sourceExName,
            sourceDimension: 'horizontal-push',
            targetDimension: 'vertical-push',
            persistence,
            sourceTraceRefs: Object.freeze([...traces]),
            rationale:
              'Shares anterior deltoid, clavicular pectoralis, and triceps pressing mechanics across movement planes.',
          })
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Check 2: 'torso-support-demand-overlap' between deadlift and barbell_row (Phase 2)
  // -------------------------------------------------------------------------
  const isDeadliftOrRowCandidate =
    candidateExerciseId === 'barbell_row' || candidateExerciseId === 'deadlift';

  if (isDeadliftOrRowCandidate) {
    const targetSourceExerciseId =
      candidateExerciseId === 'barbell_row' ? 'deadlift' : 'barbell_row';

    // Collect distinct source workout sessions across all dimension states
    // Group by unique session key to prevent duplicate overlaps from multi-dimension projections
    const sessionMap = new Map<
      string,
      {
        sourceLogId?: string;
        exerciseId: string;
        exerciseName: string;
        date: string;
        startTime?: string;
        traces: ResidualStressTrace[];
      }
    >();

    for (const dimState of Object.values(allDimensionResidualStates)) {
      for (const trace of dimState.relevantTraces) {
        if (trace.sourceEvidence.kind === 'dimension-projected-strength-stress') {
          const mag = trace.sourceEvidence.sourceSessionMagnitude;
          const normExId = mag.exerciseId.toLowerCase().trim();
          const normExName = mag.exerciseName.toLowerCase().trim();

          const isPotentialSource =
            normExId === targetSourceExerciseId ||
            normExName.includes('deadlift') ||
            normExName.includes('데드리프트') ||
            normExName.includes('row') ||
            normExName.includes('로우');

          if (isPotentialSource) {
            const logId =
              mag.sourceLogId ||
              `${mag.date}_${mag.startTime || 'notime'}_${mag.exerciseId}`;
            const sessionKey = `${logId}::${mag.exerciseId}`;

            if (!sessionMap.has(sessionKey)) {
              sessionMap.set(sessionKey, {
                sourceLogId: mag.sourceLogId,
                exerciseId: mag.exerciseId,
                exerciseName: mag.exerciseName,
                date: mag.date,
                startTime: mag.startTime,
                traces: [],
              });
            }

            const traceKey = `${trace.sourceEvidence.dimension}::${trace.sourceEvidence.kind}`;
            const existingTraces = sessionMap.get(sessionKey)!.traces;
            if (
              !existingTraces.some((t) => {
                const tKey = `${t.sourceEvidence.dimension}::${t.sourceEvidence.kind}`;
                return tKey === traceKey;
              })
            ) {
              existingTraces.push(trace);
            }
          }
        }
      }
    }

    // Evaluate each candidate source session against the contract
    for (const session of sessionMap.values()) {
      const eligibility = isEligibleTorsoSupportDemandOverlapPair(
        session.exerciseId,
        session.exerciseName,
        candidateExerciseId
      );

      if (eligibility.eligible && eligibility.sourceCanonicalName) {
        let persistence: PersistenceState | 'bracket' | 'uncertain' =
          'historical';
        if (
          session.traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'immediate'
          )
        ) {
          persistence = 'immediate';
        } else if (
          session.traces.some(
            (t) =>
              t.temporalAttenuation.kind === 'exact-ordinal' &&
              t.temporalAttenuation.state === 'residual'
          )
        ) {
          persistence = 'residual';
        } else if (
          session.traces.some(
            (t) => t.temporalAttenuation.kind === 'bracket-ordinal'
          )
        ) {
          persistence = 'bracket';
        } else if (
          session.traces.some(
            (t) => t.temporalAttenuation.kind === 'uncomputed'
          )
        ) {
          persistence = 'uncertain';
        }

        const rationale =
          candidateExerciseId === 'barbell_row'
            ? '최근 데드리프트 기록과 몸통 지지 요구가 겹칩니다.'
            : '최근 바벨 로우 기록과 몸통 지지 요구가 겹칩니다.';

        overlaps.push(
          Object.freeze({
            relation: 'torso-support-demand-overlap',
            sourceExerciseId: session.exerciseId,
            sourceExerciseName: eligibility.sourceCanonicalName,
            sourceLogId: session.sourceLogId,
            persistence,
            sourceTraceRefs: Object.freeze([...session.traces]),
            rationale,
          })
        );
      }
    }
  }

  return Object.freeze(overlaps);
}

/**
 * Derives a structured readiness assessment for a single required stress dimension.
 *
 * @param dimensionState The current DimensionResidualState for this stress dimension.
 */
export function deriveCandidateDimensionReadinessAssessment(
  dimensionState: DimensionResidualState
): CandidateDimensionReadinessAssessment {
  const {
    dimension,
    immediateTraces,
    residualTraces,
    historicalTraces,
    bracketTraces,
    uncertainTraces,
    modalitySummary,
    strongestPersistence,
    uncertaintyMetadata,
  } = dimensionState;

  const hasImmediate = immediateTraces.length > 0;
  const hasResidual = residualTraces.length > 0;
  const hasHistorical = historicalTraces.length > 0;
  const hasBracket = bracketTraces.length > 0;
  const hasUncertain = uncertainTraces.length > 0;

  const isHistoricalOnly =
    hasHistorical && !hasImmediate && !hasResidual && !hasBracket && !hasUncertain;

  // Derive dimension-level readiness status:
  // - 'constrained': definite immediate evidence (<24h)
  // - 'caution': definite residual evidence (24h-72h), potential bracket promotion, or same-day uncertainty
  // - 'clear': no acute/residual trace overlap (empty state or strictly historical >=72h)
  let dimensionReadinessStatus: DimensionReadinessStatus = 'clear';

  if (hasImmediate || strongestPersistence.definite === 'immediate') {
    dimensionReadinessStatus = 'constrained';
  } else if (
    hasResidual ||
    strongestPersistence.definite === 'residual' ||
    strongestPersistence.hasPotentialPromotion ||
    hasUncertain
  ) {
    dimensionReadinessStatus = 'caution';
  } else {
    dimensionReadinessStatus = 'clear';
  }

  // Factual, non-scoring structural observations
  const structuralNotes: string[] = [];

  if (hasImmediate) {
    structuralNotes.push(
      `Definite immediate evidence present (${immediateTraces.length} trace${immediateTraces.length > 1 ? 's' : ''}, <24h).`
    );
  }
  if (hasResidual) {
    structuralNotes.push(
      `Definite residual evidence present (${residualTraces.length} trace${residualTraces.length > 1 ? 's' : ''}, 24h-72h).`
    );
  }
  if (isHistoricalOnly) {
    structuralNotes.push(
      `Historical-only evidence present (${historicalTraces.length} trace${historicalTraces.length > 1 ? 's' : ''}, >=72h); does not constrain acute readiness.`
    );
  }
  if (strongestPersistence.hasPotentialPromotion) {
    structuralNotes.push(
      `Bracket-ordinal trace present (${bracketTraces.length} trace${bracketTraces.length > 1 ? 's' : ''}) with potential promotion to '${strongestPersistence.potential}'.`
    );
  }
  if (hasUncertain) {
    structuralNotes.push(
      `Uncomputed same-day trace present (${uncertainTraces.length} trace${uncertainTraces.length > 1 ? 's' : ''}) due to missing timestamp.`
    );
  }
  if (dimensionState.relevantTraces.length === 0) {
    structuralNotes.push('No residual stress traces recorded for this dimension.');
  }

  return Object.freeze({
    dimension,
    dimensionReadinessStatus,
    residualState: dimensionState,
    hasImmediateEvidence: hasImmediate,
    hasResidualEvidence: hasResidual,
    isHistoricalOnly,
    hasPotentialPromotion: strongestPersistence.hasPotentialPromotion,
    potentialPersistenceState: strongestPersistence.potential,
    hasUncertainty: hasUncertain,
    modalityPresence: modalitySummary.presence,
    hasStrengthEvidence: modalitySummary.hasStrength,
    hasRunningEvidence: modalitySummary.hasRunning,
    totalRelevantTraceCount: dimensionState.relevantTraces.length,
    immediateTraces: dimensionState.immediateTraces,
    residualTraces: dimensionState.residualTraces,
    historicalTraces: dimensionState.historicalTraces,
    bracketTraces: dimensionState.bracketTraces,
    uncertainTraces: dimensionState.uncertainTraces,
    structuralNotes: Object.freeze(structuralNotes),
  });
}

/**
 * Builds factual explainability summary for a candidate readiness evidence.
 */
function buildExplainabilitySummary(
  exerciseName: string,
  overallClass: CandidateReadinessClass,
  requiredDimensions: readonly StressDimension[],
  definiteImmediate: readonly StressDimension[],
  definiteResidual: readonly StressDimension[],
  uncertainDims: readonly StressDimension[],
  historicalOnly: readonly StressDimension[],
  clearDims: readonly StressDimension[],
  activeStructuralOverlaps: readonly StructuralReadinessOverlap[]
): CandidateReadinessExplainabilitySummary {
  if (overallClass === 'unmapped' || requiredDimensions.length === 0) {
    return Object.freeze({
      headline: `Unmapped candidate '${exerciseName}' has no defined stress dimensions.`,
      factualObservations: Object.freeze([
        `The exercise '${exerciseName}' requires domain profile classification before stress overlap can be evaluated.`,
      ]),
    });
  }

  let headline = '';
  const observations: string[] = [];

  switch (overallClass) {
    case 'constrained':
      headline = `Constrained readiness for ${exerciseName}: active immediate evidence on ${definiteImmediate.join(', ')}.`;
      break;
    case 'caution': {
      const activeReasons: string[] = [];
      if (definiteResidual.length > 0) {
        activeReasons.push(`residual evidence on ${definiteResidual.join(', ')}`);
      }
      if (uncertainDims.length > 0) {
        activeReasons.push(`uncertain/bracket evidence on ${uncertainDims.join(', ')}`);
      }
      if (activeStructuralOverlaps.length > 0) {
        const overlapDescriptions = activeStructuralOverlaps.map((o) => {
          if (o.relation === 'torso-support-demand-overlap') {
            return `몸통 지지 요구 중복 (${o.sourceExerciseName} → ${exerciseName})`;
          }
          return `${o.relation} from ${o.sourceExerciseName} (${o.sourceDimension} → ${o.targetDimension})`;
        });
        activeReasons.push(`structural overlap (${overlapDescriptions.join(', ')})`);
      }
      headline = `Caution readiness for ${exerciseName}: ${activeReasons.join(' and ')}.`;
      break;
    }
    case 'clear':
      if (historicalOnly.length > 0) {
        headline = `Clear readiness for ${exerciseName}: prior evidence is strictly historical on ${historicalOnly.join(', ')}.`;
      } else {
        headline = `Clear readiness for ${exerciseName}: no acute or residual evidence across required dimensions.`;
      }
      break;
  }

  for (const dim of requiredDimensions) {
    if (definiteImmediate.includes(dim)) {
      observations.push(`Dimension '${dim}' has definite immediate (<24h) stress traces.`);
    } else if (definiteResidual.includes(dim)) {
      observations.push(`Dimension '${dim}' has definite residual (24h-72h) stress traces.`);
    } else if (uncertainDims.includes(dim)) {
      observations.push(`Dimension '${dim}' contains timestamp uncertainty or bracket bounds.`);
    } else if (historicalOnly.includes(dim)) {
      observations.push(`Dimension '${dim}' has historical-only (>=72h) traces, not constraining acute performance.`);
    } else {
      observations.push(`Dimension '${dim}' has no active residual traces.`);
    }
  }

  for (const overlap of activeStructuralOverlaps) {
    if (overlap.relation === 'torso-support-demand-overlap') {
      observations.push(
        `Structural overlap: 'torso-support-demand-overlap' from ${overlap.sourceExerciseName} (${overlap.persistence} persistence). ${overlap.rationale}`
      );
    } else {
      observations.push(
        `Structural overlap: '${overlap.relation}' from ${overlap.sourceExerciseName} on ${overlap.sourceDimension} (${overlap.persistence} persistence). ${overlap.rationale}`
      );
    }
  }

  return Object.freeze({
    headline,
    factualObservations: Object.freeze(observations),
  });
}

/**
 * Derives the complete, candidate-specific CandidateReadinessEvidence for a given candidate exercise.
 *
 * @param candidate Exercise identifier string or explicit ExerciseStressProfile.
 * @param allDimensionResidualStates Current AllDimensionResidualStates container.
 * @param evaluationContext The canonical evaluation context SSOT.
 */
export function deriveCandidateReadinessEvidence(
  candidate: string | ExerciseStressProfile,
  allDimensionResidualStates: AllDimensionResidualStates,
  evaluationContext: EvaluationContext
): CandidateReadinessEvidence {
  const profile: ExerciseStressProfile =
    typeof candidate === 'string'
      ? getCanonicalExerciseStressProfile(candidate)
      : candidate;

  const candidateExerciseId = profile.exerciseId;
  const candidateExerciseName = profile.exerciseName;
  const requiredDimensions = profile.dimensions;

  // 1. Handle unmapped or empty profile
  if (profile.mappingStatus === 'unmapped' || requiredDimensions.length === 0) {
    const explainabilitySummary = buildExplainabilitySummary(
      candidateExerciseName,
      'unmapped',
      [],
      [],
      [],
      [],
      [],
      [],
      []
    );

    const emptyModalityContext: CandidateModalityContext = Object.freeze({
      presence: 'none',
      hasStrength: false,
      hasRunning: false,
      totalStrengthTraces: 0,
      totalRunningTraces: 0,
    });

    const hardConstraintBoundary: CandidateHardConstraintBoundary = Object.freeze({
      isHardBlocked: false,
      infeasibilityReason: undefined,
    });

    return Object.freeze({
      kind: 'candidate-readiness-evidence',
      candidateExerciseId,
      candidateExerciseName,
      exerciseProfile: profile,
      requiredDimensions: Object.freeze([]),
      dimensionAssessments: Object.freeze([]),
      dimensionAssessmentMap: Object.freeze({}),
      definiteImmediateDimensions: Object.freeze([]),
      definiteResidualDimensions: Object.freeze([]),
      historicalOnlyDimensions: Object.freeze([]),
      uncertainDimensions: Object.freeze([]),
      clearDimensions: Object.freeze([]),
      structuralOverlaps: Object.freeze([]),
      hasStructuralOverlap: false,
      modalityContext: emptyModalityContext,
      overallReadinessClass: 'unmapped',
      evaluationContext,
      explainabilitySummary,
      hardConstraintBoundary,
    });
  }

  // 2. Perform dimension assessment for each required dimension
  const dimensionAssessments: CandidateDimensionReadinessAssessment[] = [];
  const dimensionAssessmentMap: Partial<
    Record<StressDimension, CandidateDimensionReadinessAssessment>
  > = {};

  const definiteImmediateDimensions: StressDimension[] = [];
  const definiteResidualDimensions: StressDimension[] = [];
  const historicalOnlyDimensions: StressDimension[] = [];
  const uncertainDimensions: StressDimension[] = [];
  const clearDimensions: StressDimension[] = [];

  let totalStrengthTraces = 0;
  let totalRunningTraces = 0;

  for (const dim of requiredDimensions) {
    const dimState = allDimensionResidualStates[dim];
    const assessment = deriveCandidateDimensionReadinessAssessment(dimState);

    dimensionAssessments.push(assessment);
    dimensionAssessmentMap[dim] = assessment;

    totalStrengthTraces += assessment.residualState.modalitySummary.strengthTraceCount;
    totalRunningTraces += assessment.residualState.modalitySummary.runningTraceCount;

    if (assessment.hasImmediateEvidence) {
      definiteImmediateDimensions.push(dim);
    } else if (assessment.hasResidualEvidence) {
      definiteResidualDimensions.push(dim);
    }

    if (assessment.isHistoricalOnly) {
      historicalOnlyDimensions.push(dim);
    }

    if (
      !assessment.hasImmediateEvidence &&
      (assessment.hasUncertainty || assessment.hasPotentialPromotion)
    ) {
      uncertainDimensions.push(dim);
    }

    if (assessment.dimensionReadinessStatus === 'clear') {
      clearDimensions.push(dim);
    }
  }

  // 3. Derive Structural Readiness Overlaps (CU4.0A)
  const structuralOverlaps = deriveStructuralReadinessOverlaps(
    candidateExerciseId,
    candidateExerciseName,
    requiredDimensions,
    allDimensionResidualStates
  );
  const activeStructuralOverlaps = structuralOverlaps.filter(
    (o) => o.persistence !== 'historical'
  );
  const hasStructuralOverlap = activeStructuralOverlaps.length > 0;

  // 4. Derive Modality Context across required dimensions
  const hasStrength = totalStrengthTraces > 0;
  const hasRunning = totalRunningTraces > 0;
  let modalityPresence: DimensionModalityPresence = 'none';
  if (hasStrength && hasRunning) {
    modalityPresence = 'both';
  } else if (hasStrength) {
    modalityPresence = 'strength-only';
  } else if (hasRunning) {
    modalityPresence = 'running-only';
  }

  const modalityContext: CandidateModalityContext = Object.freeze({
    presence: modalityPresence,
    hasStrength,
    hasRunning,
    totalStrengthTraces,
    totalRunningTraces,
  });

  // 5. Derive overall readiness classification
  // Supremum order: 'constrained' > 'caution' > 'clear'
  // - Direct immediate dominates -> 'constrained'
  // - Direct residual, uncertainty, OR active structural overlap -> 'caution'
  // - Clear / historical-only -> 'clear'
  let overallReadinessClass: CandidateReadinessClass = 'clear';

  if (definiteImmediateDimensions.length > 0) {
    overallReadinessClass = 'constrained';
  } else if (
    definiteResidualDimensions.length > 0 ||
    uncertainDimensions.length > 0 ||
    activeStructuralOverlaps.length > 0
  ) {
    overallReadinessClass = 'caution';
  } else {
    overallReadinessClass = 'clear';
  }

  // 6. Explainability summary
  const explainabilitySummary = buildExplainabilitySummary(
    candidateExerciseName,
    overallReadinessClass,
    requiredDimensions,
    definiteImmediateDimensions,
    definiteResidualDimensions,
    uncertainDimensions,
    historicalOnlyDimensions,
    clearDimensions,
    activeStructuralOverlaps
  );

  // 7. Hard constraint boundary (In CU4.0, zero arbitrary hard-blocking)
  const hardConstraintBoundary: CandidateHardConstraintBoundary = Object.freeze({
    isHardBlocked: false,
    infeasibilityReason: undefined,
  });

  return Object.freeze({
    kind: 'candidate-readiness-evidence',
    candidateExerciseId,
    candidateExerciseName,
    exerciseProfile: profile,
    requiredDimensions: Object.freeze([...requiredDimensions]),
    dimensionAssessments: Object.freeze(dimensionAssessments),
    dimensionAssessmentMap: Object.freeze(dimensionAssessmentMap),
    definiteImmediateDimensions: Object.freeze(definiteImmediateDimensions),
    definiteResidualDimensions: Object.freeze(definiteResidualDimensions),
    historicalOnlyDimensions: Object.freeze(historicalOnlyDimensions),
    uncertainDimensions: Object.freeze(uncertainDimensions),
    clearDimensions: Object.freeze(clearDimensions),
    structuralOverlaps,
    hasStructuralOverlap,
    modalityContext,
    overallReadinessClass,
    evaluationContext,
    explainabilitySummary,
    hardConstraintBoundary,
  });
}

/**
 * Evaluates a set of candidate exercises against the current AllDimensionResidualStates.
 *
 * @param candidates List of exercise IDs or profiles to evaluate.
 * @param allDimensionResidualStates Current AllDimensionResidualStates container.
 * @param evaluationContext The canonical evaluation context SSOT.
 */
export function evaluateCandidateReadinessSet(
  candidates: readonly (string | ExerciseStressProfile)[],
  allDimensionResidualStates: AllDimensionResidualStates,
  evaluationContext: EvaluationContext
): CandidateReadinessEvaluationSet {
  const candidateEvidences: CandidateReadinessEvidence[] = [];
  const candidateMap: Record<string, CandidateReadinessEvidence> = {};

  for (const c of candidates) {
    const evidence = deriveCandidateReadinessEvidence(
      c,
      allDimensionResidualStates,
      evaluationContext
    );
    candidateEvidences.push(evidence);
    candidateMap[evidence.candidateExerciseId] = evidence;
  }

  return Object.freeze({
    evaluationContext,
    candidates: Object.freeze(candidateEvidences),
    candidateMap: Object.freeze(candidateMap),
    totalCandidatesCount: candidateEvidences.length,
  });
}
