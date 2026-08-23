/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Actual Session Comparer (VNext Recommendation Engine - CU5.0)
 *
 * Compares VNext recommendations against the next actual workout session performed by the athlete.
 *
 * Strict Invariants:
 * 1. Actual Session is NOT Ground Truth: Athletes may deviate for subjective, social, or equipment reasons.
 * 2. Multi-Candidate Awareness: Distinguishes between exact primary match vs alternative viable candidate execution.
 * 3. Zero Accuracy Scoring: Generates structured behavioral classifications rather than simplistic % accuracy scores.
 */

import { WorkoutLog } from '../../../types';
import { FinalTodayDecision } from '../types/finalTodayDecision.types';
import {
  ActualSessionComparison,
  ComparisonClassification,
} from '../types/historicalReplay.types';
import { getMainLiftOfLog } from '../../../utils/workoutEngine';

/**
 * Maps Korean lift names / exercise names to canonical candidate exercise IDs.
 */
export function mapExerciseNameToCandidateId(name: string): string | null {
  const n = name.toLowerCase();
  if (n.includes('스쿼트') || n.includes('squat')) return 'squat';
  if (n.includes('데드리프트') || n.includes('deadlift')) return 'deadlift';
  if (n.includes('벤치프레스') || n.includes('bench')) return 'bench_press';
  if (n.includes('ohp') || n.includes('오버헤드') || n.includes('overhead')) return 'overhead_press';
  if (n.includes('바벨 로우') || n.includes('바벨로우') || n.includes('barbell row') || n.includes('row')) return 'barbell_row';
  if (n.includes('러닝') || n.includes('달리기') || n.includes('run') || n.includes('treadmill') || n.includes('트레드밀')) return 'running';
  return null;
}

/**
 * Compares a FinalTodayDecision with the actual next workout session.
 */
export function compareWithActualSession(
  vNextDecision: FinalTodayDecision,
  actualNextLog?: WorkoutLog
): ActualSessionComparison {
  const vNextKind = vNextDecision.kind;
  const primaryId = vNextDecision.primaryCandidate?.candidateExerciseId;
  const primaryName = vNextDecision.primaryCandidate?.candidateExerciseName;
  const altIds = Object.freeze(
    vNextDecision.alternativeCandidates.map((c) => c.candidateExerciseId)
  );

  if (!actualNextLog) {
    return Object.freeze({
      classification: 'indeterminate' as ComparisonClassification,
      vNextKind,
      vNextPrimaryCandidateId: primaryId,
      vNextPrimaryCandidateName: primaryName,
      vNextAlternativeCandidateIds: altIds,
      actualExerciseNames: [],
      explanation: 'No subsequent workout session found in evaluation window.',
    });
  }

  const actualMainLift = getMainLiftOfLog(actualNextLog) || undefined;
  const actualExNames = Object.freeze(
    actualNextLog.exercises.map((e) => e.exerciseName)
  );

  // Identify all candidate IDs present in the actual workout
  const performedCandidateIds = new Set<string>();
  if (actualMainLift) {
    const cid = mapExerciseNameToCandidateId(actualMainLift);
    if (cid) performedCandidateIds.add(cid);
  }
  for (const ex of actualNextLog.exercises) {
    const cid = mapExerciseNameToCandidateId(ex.exerciseName);
    if (cid) performedCandidateIds.add(cid);
  }

  // Case 1: VNext recommended Rest
  if (vNextKind === 'rest') {
    if (vNextDecision.restCategory === 'completed-session-boundary') {
      return Object.freeze({
        classification: 'post-session-boundary' as ComparisonClassification,
        actualWorkoutLogId: actualNextLog.id,
        actualDate: actualNextLog.date,
        actualStartTime: actualNextLog.startTime,
        actualRoutineName: actualNextLog.routineName,
        actualMainLift,
        actualExerciseNames: actualExNames,
        vNextKind,
        vNextPrimaryCandidateId: primaryId,
        vNextPrimaryCandidateName: primaryName,
        vNextAlternativeCandidateIds: altIds,
        explanation: `Post-session completed boundary: Training completed for evaluation date; Rest preserves boundary prior to next workout session (${actualNextLog.routineName || actualMainLift || actualNextLog.date}).`,
      });
    }

    return Object.freeze({
      classification: 'rest-vs-train-disagreement' as ComparisonClassification,
      actualWorkoutLogId: actualNextLog.id,
      actualDate: actualNextLog.date,
      actualStartTime: actualNextLog.startTime,
      actualRoutineName: actualNextLog.routineName,
      actualMainLift,
      actualExerciseNames: actualExNames,
      vNextKind,
      vNextPrimaryCandidateId: primaryId,
      vNextPrimaryCandidateName: primaryName,
      vNextAlternativeCandidateIds: altIds,
      explanation: `VNext recommended Rest (${vNextDecision.restCategory ?? 'rest-supported'}) due to recent density/recovery, but user executed workout session (${actualNextLog.routineName || actualMainLift || 'unnamed'}).`,
    });
  }

  // Case 2: VNext recommended Train, but performed exercises are unmapped to foundation candidates
  if (performedCandidateIds.size === 0) {
    return Object.freeze({
      classification: 'actual-unmapped' as ComparisonClassification,
      actualWorkoutLogId: actualNextLog.id,
      actualDate: actualNextLog.date,
      actualStartTime: actualNextLog.startTime,
      actualRoutineName: actualNextLog.routineName,
      actualMainLift,
      actualExerciseNames: actualExNames,
      vNextKind,
      vNextPrimaryCandidateId: primaryId,
      vNextPrimaryCandidateName: primaryName,
      vNextAlternativeCandidateIds: altIds,
      explanation: `Actual session contained exercises [${actualExNames.join(', ')}] that do not map to foundation candidates.`,
    });
  }

  // Case 3: Exact primary match
  if (primaryId && performedCandidateIds.has(primaryId)) {
    return Object.freeze({
      classification: 'exact-match' as ComparisonClassification,
      actualWorkoutLogId: actualNextLog.id,
      actualDate: actualNextLog.date,
      actualStartTime: actualNextLog.startTime,
      actualRoutineName: actualNextLog.routineName,
      actualMainLift,
      actualExerciseNames: actualExNames,
      vNextKind,
      vNextPrimaryCandidateId: primaryId,
      vNextPrimaryCandidateName: primaryName,
      vNextAlternativeCandidateIds: altIds,
      explanation: `Exact match: User performed recommended primary candidate (${primaryName || primaryId}).`,
    });
  }

  // Case 4: Recommended alternative candidate performed
  const matchedAltId = [...performedCandidateIds].find((id) => altIds.includes(id));
  if (matchedAltId) {
    return Object.freeze({
      classification: 'recommended-alternative-performed' as ComparisonClassification,
      actualWorkoutLogId: actualNextLog.id,
      actualDate: actualNextLog.date,
      actualStartTime: actualNextLog.startTime,
      actualRoutineName: actualNextLog.routineName,
      actualMainLift,
      actualExerciseNames: actualExNames,
      vNextKind,
      vNextPrimaryCandidateId: primaryId,
      vNextPrimaryCandidateName: primaryName,
      vNextAlternativeCandidateIds: altIds,
      explanation: `Alternative match: User performed viable alternative candidate (${matchedAltId}) instead of primary (${primaryName || primaryId}).`,
    });
  }

  // Case 5: Candidate disagreement (user trained a non-recommended / deferred candidate)
  return Object.freeze({
    classification: 'candidate-disagreement' as ComparisonClassification,
    actualWorkoutLogId: actualNextLog.id,
    actualDate: actualNextLog.date,
    actualStartTime: actualNextLog.startTime,
    actualRoutineName: actualNextLog.routineName,
    actualMainLift,
    actualExerciseNames: actualExNames,
    vNextKind,
    vNextPrimaryCandidateId: primaryId,
    vNextPrimaryCandidateName: primaryName,
    vNextAlternativeCandidateIds: altIds,
    explanation: `Candidate disagreement: VNext recommended primary ${primaryName || primaryId}, but user performed [${[...performedCandidateIds].join(', ')}].`,
  });
}
