/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExerciseSession, SetRecord, WorkoutLog } from '../../../types';
import {
  CanonicalRunningMetrics,
  CanonicalRunningSession,
  MetricProvenance,
  RunningMetricProvenance,
  RunningSourceConfidence,
  RunningSourceFormat,
} from '../types/running.types';

// Distinct known running identifiers and keywords
const RUNNING_POSITIVE_KEYWORDS = [
  '러닝',
  '달리기',
  '조깅',
  '트레드밀',
  'running',
  'jogging',
  'treadmill',
  'trail-running',
  'treadmill-running',
  'outdoor-running',
  'indoor-running',
];

// Known canonical/custom IDs for running from WMS migrations and standard DB
const KNOWN_RUNNING_EXERCISE_IDS = new Set([
  'running',
  'treadmill',
  'jogging',
  'v1-custom----11', // Migrated custom running ID in WMS v1/v2
]);

// Non-running cardio keywords that must strictly NOT be classified as running
const NON_RUNNING_CARDIO_KEYWORDS = [
  'cycling',
  'cycle',
  'bike',
  '사이클',
  '자전거',
  'biking',
  'spin',
  'rowing',
  'row',
  '로잉',
  'ergometer',
  'swimming',
  'swim',
  '수영',
  'elliptical',
  'stairmaster',
  'stair-climber',
  '스텝퍼',
  '천국의계단',
];

/**
 * Pure predicate to determine if a string (exerciseName, exerciseId, or routineName) denotes a running activity.
 * Strict rules:
 * 1. Non-running cardio keywords are strictly rejected.
 * 2. Positive running keywords or known IDs are accepted.
 * 3. Token-boundary matching prevents false positives (e.g. "drunk", "prune").
 * 4. Category alone (e.g. 'Cardio') is NEVER sufficient evidence on its own.
 */
export function isRunningIdentifier(identifier?: string): boolean {
  if (!identifier || typeof identifier !== 'string') return false;
  const lower = identifier.toLowerCase().trim();

  // 1. Strict exclusion of other cardio modalities
  if (NON_RUNNING_CARDIO_KEYWORDS.some((nonRun) => lower.includes(nonRun))) {
    return false;
  }

  // 2. Direct match on known running IDs
  if (KNOWN_RUNNING_EXERCISE_IDS.has(lower)) {
    return true;
  }

  // 3. Positive keyword search
  if (RUNNING_POSITIVE_KEYWORDS.some((kw) => lower.includes(kw))) {
    return true;
  }

  // 4. Token boundary check for 'run' (e.g., "5k run", "run-session", but not "prune")
  const tokens = lower.split(/[^a-z0-9가-힣]+/);
  if (tokens.includes('run')) {
    return true;
  }

  return false;
}

/**
 * Validates whether a value is a finite, strictly positive number suitable for physical metrics.
 */
function isValidMetricNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && !Number.isNaN(val) && val > 0;
}

/**
 * Normalizes raw metrics from a set record into CanonicalRunningMetrics according to Source Precedence.
 * 
 * Source Precedence:
 * Priority 1: Explicit Cardio Fields (distanceKm / timeSeconds)
 * Priority 2: Legacy Fallback (weight -> distanceKm, reps -> durationSeconds)
 * Priority 3: Missing / Invalid
 * 
 * Pure function: Does not mutate the input set.
 */
export function normalizeRunningSetMetrics(
  set?: Partial<SetRecord> | null
): CanonicalRunningMetrics {
  if (!set) {
    return {
      distanceKm: undefined,
      durationSeconds: undefined,
      paceSecondsPerKm: undefined,
      sourceFormat: 'unknown',
      provenance: {
        distance: 'missing',
        duration: 'missing',
        distanceLegacyConflict: false,
        durationLegacyConflict: false,
        hasLegacyConflict: false,
      },
      sourceConfidence: 'low',
      runIntent: 'unknown',
    };
  }

  // 1. Distance extraction with Precedence
  let distanceKm: number | undefined = undefined;
  let distanceProvenance: MetricProvenance = 'missing';
  let distanceConflict = false;

  const hasExplicitDistance = isValidMetricNumber(set.distanceKm);
  const hasLegacyDistance = isValidMetricNumber(set.weight);

  if (hasExplicitDistance) {
    distanceKm = set.distanceKm;
    distanceProvenance = 'explicit';
    if (hasLegacyDistance && set.weight !== set.distanceKm) {
      distanceConflict = true;
    }
  } else if (hasLegacyDistance) {
    distanceKm = set.weight;
    distanceProvenance = 'legacy';
  }

  // 2. Duration extraction with Precedence
  let durationSeconds: number | undefined = undefined;
  let durationProvenance: MetricProvenance = 'missing';
  let durationConflict = false;

  const hasExplicitDuration = isValidMetricNumber(set.timeSeconds);
  const hasLegacyDuration = isValidMetricNumber(set.reps);

  if (hasExplicitDuration) {
    durationSeconds = set.timeSeconds;
    durationProvenance = 'explicit';
    if (hasLegacyDuration && set.reps !== set.timeSeconds) {
      durationConflict = true;
    }
  } else if (hasLegacyDuration) {
    durationSeconds = set.reps;
    durationProvenance = 'legacy';
  }

  // 3. Composite Provenance and Source Format
  const provenance: RunningMetricProvenance = {
    distance: distanceProvenance,
    duration: durationProvenance,
    distanceLegacyConflict: distanceConflict,
    durationLegacyConflict: durationConflict,
    hasLegacyConflict: distanceConflict || durationConflict,
  };

  let sourceFormat: RunningSourceFormat = 'unknown';
  const hasExplicit = distanceProvenance === 'explicit' || durationProvenance === 'explicit';
  const hasLegacy = distanceProvenance === 'legacy' || durationProvenance === 'legacy';

  if (hasExplicit && hasLegacy) {
    sourceFormat = 'hybrid';
  } else if (hasExplicit) {
    sourceFormat = 'explicit-cardio-fields';
  } else if (hasLegacy) {
    sourceFormat = 'legacy-weight-reps';
  } else {
    sourceFormat = 'unknown';
  }

  // 4. Pace computation (only from canonical chosen facts)
  let paceSecondsPerKm: number | undefined = undefined;
  if (distanceKm !== undefined && durationSeconds !== undefined && distanceKm > 0) {
    paceSecondsPerKm = durationSeconds / distanceKm;
  }

  // 5. Source Confidence
  let sourceConfidence: RunningSourceConfidence = 'low';
  if (distanceKm !== undefined && durationSeconds !== undefined) {
    sourceConfidence = 'high';
  } else if (distanceKm !== undefined || durationSeconds !== undefined) {
    sourceConfidence = 'medium';
  }

  return {
    distanceKm,
    durationSeconds,
    paceSecondsPerKm,
    sourceFormat,
    provenance,
    sourceConfidence,
    runIntent: 'unknown',
  };
}

/**
 * Extracts canonical running metrics from a WorkoutLog or ExerciseSession.
 * Returns null if the provided session does not represent a running activity.
 * Category alone ('Cardio') is NOT sufficient evidence to classify as Running.
 * Pure function: Does not mutate the input log.
 */
export function extractCanonicalRunningMetrics(
  logOrSession: WorkoutLog | ExerciseSession
): CanonicalRunningMetrics | null {
  // Case 1: ExerciseSession
  if ('exerciseName' in logOrSession && 'sets' in logOrSession && !('exercises' in logOrSession)) {
    const isRun =
      isRunningIdentifier(logOrSession.exerciseName) ||
      isRunningIdentifier(logOrSession.exerciseId);

    if (!isRun) return null;

    const primarySet = logOrSession.sets?.[0];
    return normalizeRunningSetMetrics(primarySet);
  }

  // Case 2: WorkoutLog
  const log = logOrSession as WorkoutLog;
  const isRoutineRunning = isRunningIdentifier(log.routineName);

  const runningExercise = log.exercises?.find(
    (ex) =>
      isRunningIdentifier(ex.exerciseName) ||
      isRunningIdentifier(ex.exerciseId)
  );

  if (!isRoutineRunning && !runningExercise) {
    return null; // Explicit non-running WorkoutLog
  }

  const primarySet = runningExercise?.sets?.[0];
  return normalizeRunningSetMetrics(primarySet);
}

/**
 * Extracts a complete CanonicalRunningSession fact from a WorkoutLog.
 * Returns null if the log is not a running workout.
 */
export function extractCanonicalRunningSession(
  log: WorkoutLog
): CanonicalRunningSession | null {
  const metrics = extractCanonicalRunningMetrics(log);
  if (!metrics) return null;

  const runningExercise = log.exercises?.find(
    (ex) =>
      isRunningIdentifier(ex.exerciseName) ||
      isRunningIdentifier(ex.exerciseId)
  );

  const exerciseName = runningExercise?.exerciseName || log.routineName || '러닝';

  return {
    logId: log.id,
    date: log.date,
    startTime: log.startTime,
    exerciseName,
    metrics,
  };
}

/**
 * Helper to format pace in seconds/km into human-readable "MM:SS/km" string.
 * This is a pure utility helper and not the domain SSOT representation.
 */
export function formatPace(paceSecondsPerKm?: number): string | undefined {
  if (paceSecondsPerKm === undefined || !Number.isFinite(paceSecondsPerKm) || paceSecondsPerKm <= 0) {
    return undefined;
  }
  const totalSeconds = Math.round(paceSecondsPerKm);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}/km`;
}

