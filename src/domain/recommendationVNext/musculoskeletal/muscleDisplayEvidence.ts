/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Muscle Display Evidence Generator (VNext Recommendation Engine - Phase 3)
 *
 * Pure transformation function that converts pre-dimension-projection exercise evidence
 * and a canonical evaluation instant/timezone into per-muscle display evidence using
 * the Phase 1 Musculoskeletal Relation Table and existing 24h/72h temporal persistence SSOT.
 *
 * Strict Architectural Invariants:
 * 1. Zero StressDimension Copying:
 *    - Muscle regions are derived strictly from ExerciseMusculoskeletalProfile involvements,
 *      NEVER copied from the 7 StressDimensions or their statuses/colors.
 * 2. Exact Profile Verification:
 *    - Only maps when BOTH source exerciseId and source exerciseName resolve to 'supported'
 *      and point to the exact same canonical musculoskeletal profile.
 *    - Quarantines unconfirmed variations (RDL, chest-supported/seated row, incline, etc.),
 *      ID/name conflicts, unsupported exercises, and empty inputs without guessing muscles.
 * 3. Existing Temporal Policy Reuse:
 *    - Reuses deriveEvaluationContext, parseWallClockInTimezone, and deriveTemporalAttenuation
 *      with the frozen 24h/72h thresholds.
 *    - Excludes future records strictly.
 *    - Preserves same-day missing-time ('uncertain') and boundary-straddling ('bracket') records
 *      without promoting them to confirmed '최근 부하' / '잔여 부하'.
 * 4. Group Layout Only:
 *    - Reuses the 13 regions and 11 display groups from muscleRegions.ts.
 *    - Does NOT collapse or aggregate anterior/lateral/posterior deltoid into a single shoulder status.
 * 5. Zero Recounting / Zero Scoring:
 *    - Does NOT recount sets, sessions, or volume when one exercise links to multiple muscles.
 *    - Preserves distinct same-day records separately via sourceLogId.
 *    - Zero fatigue scores, recovery hours, or role weights.
 * 6. Pure Immutability: Deeply frozen output with zero mutation of inputs.
 */

import { WorkoutLog } from '../../../types';
import {
  CANONICAL_MUSCLE_DISPLAY_GROUPS,
  CANONICAL_MUSCLE_REGIONS,
  ExerciseMusculoskeletalProfile,
  MuscleDisplayGroupId,
  MuscleInvolvementRole,
  MuscleRegionId,
} from '../types/exerciseMusculoskeletalProfile.types';
import {
  ElapsedTime,
  EvaluationContext,
  EvaluationContextInput,
  OccurrenceState,
  PersistenceState,
} from '../types/residualStressTrace.types';
import { BodyLoadDisplayStatus } from '../types/recommendationPresentation.types';
import {
  EligibleMuscleTemporalAttenuation,
  MuscleDisplayEvidenceResult,
  MuscleDisplayExcludedFutureExercise,
  MuscleDisplayGroupPresentation,
  MuscleDisplayInvalidDateTimeExercise,
  MuscleDisplayProvenanceSummary,
  MuscleDisplaySourceExerciseEvidence,
  MuscleDisplayUninterpretedExercise,
  MuscleDisplayUninterpretedReasonCategory,
  MuscleEvidenceTemporalState,
  MuscleRegionDisplayEvidence,
  MuscleRegionEvidenceItem,
  MuscleRegionUncertaintyInfo,
} from '../types/muscleDisplayEvidence.types';
import {
  MUSCLE_DISPLAY_GROUP_REGISTRY,
  MUSCLE_REGION_REGISTRY,
} from './muscleRegions';
import { getExerciseMusculoskeletalProfile } from './exerciseMusculoskeletalProfiles';
import {
  deriveEvaluationContext,
  deriveTemporalAttenuation,
  parseWallClockInTimezone,
} from '../stress/residualStressTrace';

const ROLE_DISPLAY_ORDER: readonly MuscleInvolvementRole[] = Object.freeze([
  'primary-target',
  'synergist',
  'stabilizer',
]);

// =========================================================================
// 0. Display-Only WorkoutLog Input Extraction (Preserves Mixed Sessions)
// =========================================================================

/**
 * Extracts display-only pre-dimension exercise inputs directly from a raw WorkoutLog.
 *
 * Invariants:
 * - Iterates `log.exercises` verbatim so mixed strength + running/treadmill sessions
 *   preserve EVERY recorded exercise (unlike deriveRecordedSessionStressEvidence's running branch).
 * - Preserves original sourceLogId, date, startTime, exerciseId, and exerciseName verbatim.
 * - Includes unsupported/variation exercises so downstream transformation preserves uninterpreted reasons.
 * - Does NOT fabricate or infer exercises or running logs from routineName when `exercises` is empty.
 * - Pure function: zero mutation of `log`, deeply frozen output.
 */
export function extractMuscleDisplaySourceExercisesFromLog(
  log: Readonly<WorkoutLog>
): readonly MuscleDisplaySourceExerciseEvidence[] {
  if (!log || !Array.isArray(log.exercises) || log.exercises.length === 0) {
    return Object.freeze([]);
  }

  const items: MuscleDisplaySourceExerciseEvidence[] = [];
  for (const ex of log.exercises) {
    if (!ex) {
      continue;
    }
    items.push(
      Object.freeze({
        sourceLogId: log.id,
        date: log.date,
        startTime: log.startTime,
        exerciseId: ex.exerciseId ?? '',
        exerciseName: ex.exerciseName ?? '',
      })
    );
  }

  return Object.freeze(items);
}

/**
 * Extracts display-only pre-dimension exercise inputs across multiple raw WorkoutLogs.
 * Preserves all individual exercises across mixed sessions and distinct same-day logs without merging.
 */
export function extractMuscleDisplaySourceExercisesFromLogs(
  logs: readonly Readonly<WorkoutLog>[]
): readonly MuscleDisplaySourceExerciseEvidence[] {
  if (!Array.isArray(logs) || logs.length === 0) {
    return Object.freeze([]);
  }

  const items: MuscleDisplaySourceExerciseEvidence[] = [];
  for (const log of logs) {
    if (!log) {
      continue;
    }
    const extracted = extractMuscleDisplaySourceExercisesFromLog(log);
    for (const item of extracted) {
      items.push(item);
    }
  }

  return Object.freeze(items);
}

// =========================================================================
// 1. Temporal Validation & Helpers (Reusing residualStressTrace SSOT)
// =========================================================================

const CALENDAR_DATE_PATTERN = /^(\d{4})([-.])(\d{1,2})\2(\d{1,2})$/;
const WALL_CLOCK_TIME_PATTERN = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?$/;

type ValidatedDateTimeResult =
  | {
      readonly kind: 'valid';
      readonly canonicalDate: string;
      readonly normalizedStartTime?: string;
    }
  | {
      readonly kind: 'invalid';
      readonly reason: string;
    };

/**
 * Validates a source record's calendar date and optional explicit startTime strictly
 * before invoking the shared wall-clock parser.
 *
 * - Supports existing valid formats: YYYY-MM-DD, YYYY.MM.DD (and single-digit M/D),
 *   and H:mm / HH:mm / H:mm:ss / HH:mm:ss / HH:mm:ss.SSS.
 * - Rejects non-existent calendar dates (e.g. 2026-02-30, 2026-04-31), malformed dates (e.g. 'n/a'),
 *   and out-of-range or malformed explicit times (e.g. '25:00', '12:60', 'n/a')
 *   without rolling over, throwing, or misclassifying as missing-time or future.
 */
function validateSourceDateAndTime(
  rawDate: unknown,
  rawStartTime: unknown
): ValidatedDateTimeResult {
  if (typeof rawDate !== 'string' || rawDate.trim().length === 0) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 날짜 값('${String(rawDate ?? '')}')이 비어 있거나 유효하지 않아 격리했습니다.`,
    };
  }

  const trimmedDate = rawDate.trim();
  const dateMatch = CALENDAR_DATE_PATTERN.exec(trimmedDate);
  if (!dateMatch) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 날짜 형식('${rawDate}')이 올바르지 않아 격리했습니다.`,
    };
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[3]);
  const day = Number(dateMatch[4]);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 달력에 존재하지 않는 날짜('${rawDate}')로 인해 격리했습니다.`,
    };
  }

  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarCheck.getUTCFullYear() !== year ||
    calendarCheck.getUTCMonth() !== month - 1 ||
    calendarCheck.getUTCDate() !== day
  ) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 달력에 존재하지 않는 날짜('${rawDate}')로 인해 격리했습니다.`,
    };
  }

  const canonicalDate = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Omitted / blank startTime -> valid missing time (preserves calendar-bounded / same-day uncertain semantics)
  if (rawStartTime === undefined || rawStartTime === null) {
    return {
      kind: 'valid',
      canonicalDate,
      normalizedStartTime: undefined,
    };
  }

  if (typeof rawStartTime !== 'string') {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 시각 값('${String(rawStartTime)}')이 올바른 문자열 형식이 아니어 격리했습니다.`,
    };
  }

  const trimmedTime = rawStartTime.trim();
  if (trimmedTime.length === 0) {
    return {
      kind: 'valid',
      canonicalDate,
      normalizedStartTime: undefined,
    };
  }

  const timeMatch = WALL_CLOCK_TIME_PATTERN.exec(trimmedTime);
  if (!timeMatch) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 명시된 시각('${rawStartTime}')이 유효한 시각 형식이 아니어 격리했습니다.`,
    };
  }

  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  const second = timeMatch[3] !== undefined ? Number(timeMatch[3]) : 0;

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
    return {
      kind: 'invalid',
      reason: `잘못된 날짜·시각: 허용 범위를 벗어난 시각('${rawStartTime}')으로 인해 격리했습니다.`,
    };
  }

  return {
    kind: 'valid',
    canonicalDate,
    normalizedStartTime: trimmedTime,
  };
}

function getPersistenceRank(state: PersistenceState | 'none'): number {
  switch (state) {
    case 'immediate':
      return 3;
    case 'residual':
      return 2;
    case 'historical':
      return 1;
    case 'none':
      return 0;
  }
}

function getRankState(rank: number): PersistenceState | 'none' {
  switch (rank) {
    case 3:
      return 'immediate';
    case 2:
      return 'residual';
    case 1:
      return 'historical';
    default:
      return 'none';
  }
}

function normalizeEvaluationContext(
  contextInput: Readonly<EvaluationContextInput | EvaluationContext>
): EvaluationContext {
  return deriveEvaluationContext({
    evaluationInstant: contextInput.evaluationInstant,
    evaluationTimezone: contextInput.evaluationTimezone,
  });
}

type EvaluatedExerciseTemporalInfo =
  | {
      readonly kind: 'invalid-datetime';
      readonly reason: string;
    }
  | {
      readonly kind: 'future';
      readonly occurrenceState: 'future-evidence';
      readonly elapsedTime: ElapsedTime;
      readonly reason: string;
    }
  | {
      readonly kind: 'eligible';
      readonly occurrenceState: Exclude<OccurrenceState, 'future-evidence'>;
      readonly elapsedTime: ElapsedTime;
      readonly temporalAttenuation: EligibleMuscleTemporalAttenuation;
      readonly temporalState: MuscleEvidenceTemporalState;
      readonly potentialPersistenceBounds?: {
        readonly lowerBoundState: PersistenceState;
        readonly upperBoundState: PersistenceState;
      };
    };

/**
 * Evaluates the temporal occurrence and persistence state of a source exercise record
 * relative to the canonical EvaluationContext, strictly validating date/time per item
 * before delegating to the residualStressTrace SSOT.
 */
function evaluateExerciseTemporalState(
  date: string,
  startTime: string | undefined,
  evalContext: EvaluationContext
): EvaluatedExerciseTemporalInfo {
  const validation = validateSourceDateAndTime(date, startTime);
  if (validation.kind === 'invalid') {
    return {
      kind: 'invalid-datetime',
      reason: validation.reason,
    };
  }

  const evalInstantMs = new Date(evalContext.evaluationInstant).getTime();
  const canonicalDate = validation.canonicalDate;
  const normalizedStartTime = validation.normalizedStartTime;
  const hasStartTime = normalizedStartTime !== undefined;

  let occurrenceState: OccurrenceState;
  let elapsedTime: ElapsedTime;

  if (hasStartTime) {
    const { instantMs: evidenceInstantMs } = parseWallClockInTimezone(
      canonicalDate,
      normalizedStartTime,
      evalContext.evaluationTimezone
    );

    if (!Number.isFinite(evidenceInstantMs)) {
      return {
        kind: 'invalid-datetime',
        reason: `잘못된 날짜·시각: 기록 일시('${date}' '${startTime}')를 유효한 시점으로 해석할 수 없어 격리했습니다.`,
      };
    }

    if (evidenceInstantMs <= evalInstantMs) {
      const elapsedSeconds = Math.max(0, Math.floor((evalInstantMs - evidenceInstantMs) / 1000));
      occurrenceState = 'occurred-exact';
      elapsedTime = Object.freeze({
        kind: 'exact',
        elapsedSeconds,
      });
    } else {
      return {
        kind: 'future',
        occurrenceState: 'future-evidence',
        elapsedTime: Object.freeze({
          kind: 'unavailable',
          reason: 'future-evidence',
        }),
        reason: `기록 시각(${date} ${startTime})이 평가 시점(${evalContext.evaluationCalendarDate} ${evalContext.evaluationLocalTime}) 이후의 미래 기록이므로 제외했습니다.`,
      };
    }
  } else {
    const evidenceDate = canonicalDate;
    const evalDate = evalContext.evaluationCalendarDate;

    if (evidenceDate < evalDate) {
      const dayStart = parseWallClockInTimezone(
        evidenceDate,
        '00:00:00.000',
        evalContext.evaluationTimezone
      );
      const dayEnd = parseWallClockInTimezone(
        evidenceDate,
        '23:59:59.999',
        evalContext.evaluationTimezone
      );

      const elapsedLowerBoundSeconds = Math.max(
        0,
        Math.floor((evalInstantMs - dayEnd.instantMs) / 1000)
      );
      const elapsedUpperBoundSeconds = Math.max(
        0,
        Math.floor((evalInstantMs - dayStart.instantMs) / 1000)
      );

      occurrenceState = 'occurred-calendar-bounded';
      elapsedTime = Object.freeze({
        kind: 'bounded',
        elapsedLowerBoundSeconds,
        elapsedUpperBoundSeconds,
        evidenceCalendarDate: evidenceDate,
        dayStartInstant: dayStart.isoString,
        dayEndInstant: dayEnd.isoString,
      });
    } else if (evidenceDate === evalDate) {
      occurrenceState = 'occurrence-uncertain';
      elapsedTime = Object.freeze({
        kind: 'unavailable',
        reason: 'missing-same-day-time',
      });
    } else {
      return {
        kind: 'future',
        occurrenceState: 'future-evidence',
        elapsedTime: Object.freeze({
          kind: 'unavailable',
          reason: 'future-evidence',
        }),
        reason: `기록 날짜(${evidenceDate})가 평가 날짜(${evalDate}) 이후의 미래 기록이므로 제외했습니다.`,
      };
    }
  }

  const attenuation = deriveTemporalAttenuation(elapsedTime);
  if (attenuation.kind === 'ineligible') {
    return {
      kind: 'future',
      occurrenceState: 'future-evidence',
      elapsedTime,
      reason: '평가 시점 이후의 미래 기록이므로 제외했습니다.',
    };
  }

  let temporalState: MuscleEvidenceTemporalState;
  let potentialPersistenceBounds:
    | {
        readonly lowerBoundState: PersistenceState;
        readonly upperBoundState: PersistenceState;
      }
    | undefined;

  if (attenuation.kind === 'exact-ordinal') {
    temporalState = attenuation.state;
  } else if (attenuation.kind === 'bracket-ordinal') {
    temporalState = 'bracket';
    potentialPersistenceBounds = Object.freeze({
      lowerBoundState: attenuation.lowerBoundState,
      upperBoundState: attenuation.upperBoundState,
    });
  } else {
    temporalState = 'uncertain';
  }

  return {
    kind: 'eligible',
    occurrenceState,
    elapsedTime,
    temporalAttenuation: attenuation,
    temporalState,
    potentialPersistenceBounds,
  };
}

// =========================================================================
// 2. Profile Resolution & Strict Quarantine Helper
// =========================================================================

type ProfileResolutionOutcome =
  | {
      readonly kind: 'matched';
      readonly profile: ExerciseMusculoskeletalProfile;
    }
  | {
      readonly kind: 'uninterpreted';
      readonly category: MuscleDisplayUninterpretedReasonCategory;
      readonly reason: string;
    };

/**
 * Resolves a source exercise's ID and display name strictly against the Musculoskeletal SSOT.
 *
 * Rules:
 * - Maps ONLY when BOTH sourceExerciseId and sourceExerciseName resolve to 'supported'
 *   AND point to the exact same canonical profile.
 * - Unconfirmed variations (RDL, chest-supported/seated row, incline, etc.) are explicitly quarantined.
 * - ID/name mismatches (different canonical profiles, or unsupported ID with supported name, or
 *   supported ID with unverified modifier name) are explicitly classified as 'id-name-conflict'.
 */
function resolveStrictMusculoskeletalProfile(
  sourceExerciseId: string,
  sourceExerciseName: string
): ProfileResolutionOutcome {
  const idLookup = getExerciseMusculoskeletalProfile(sourceExerciseId);
  const nameLookup = getExerciseMusculoskeletalProfile(sourceExerciseName);

  // 1. Both empty
  if (idLookup.status === 'empty-input' && nameLookup.status === 'empty-input') {
    return {
      kind: 'uninterpreted',
      category: 'empty-input',
      reason: '운동 식별자와 운동 명칭이 모두 비어 있어 근육 관여를 해석할 수 없습니다.',
    };
  }

  // 2. Known unconfirmed variation on either ID or Name
  if (
    idLookup.status === 'unconfirmed-variation' ||
    nameLookup.status === 'unconfirmed-variation'
  ) {
    const variationReason =
      idLookup.status === 'unconfirmed-variation'
        ? idLookup.reason
        : nameLookup.status === 'unconfirmed-variation'
        ? nameLookup.reason
        : '미확인 변형 종목은 기본 프로필로 임의 매핑하지 않습니다.';
    return {
      kind: 'uninterpreted',
      category: 'unconfirmed-variation',
      reason: variationReason,
    };
  }

  // 3. Both supported -> must resolve to the exact same canonical exerciseId
  if (idLookup.status === 'supported' && nameLookup.status === 'supported') {
    if (idLookup.profile.exerciseId !== nameLookup.profile.exerciseId) {
      return {
        kind: 'uninterpreted',
        category: 'id-name-conflict',
        reason: `운동 ID('${sourceExerciseId}' → ${idLookup.profile.exerciseId})와 운동명('${sourceExerciseName}' → ${nameLookup.profile.exerciseId})이 서로 다른 기준 종목을 가리켜 격리했습니다.`,
      };
    }

    return {
      kind: 'matched',
      profile: idLookup.profile,
    };
  }

  // 4. Asymmetric match (one supported, the other unsupported or empty) -> ID/name conflict
  if (idLookup.status === 'supported' || nameLookup.status === 'supported') {
    return {
      kind: 'uninterpreted',
      category: 'id-name-conflict',
      reason: `운동 ID('${sourceExerciseId}', ${idLookup.status})와 운동명('${sourceExerciseName}', ${nameLookup.status})이 동일한 지원 기준 프로필로 일치하지 않아 격리했습니다.`,
    };
  }

  // 5. Unsupported exercise
  const unsupportedReason =
    idLookup.status === 'unsupported'
      ? idLookup.reason
      : nameLookup.status === 'unsupported'
      ? nameLookup.reason
      : `미지원 운동('${sourceExerciseId}' / '${sourceExerciseName}')은 특정 근육에 임의 배정하지 않습니다.`;

  return {
    kind: 'uninterpreted',
    category: 'unsupported',
    reason: unsupportedReason,
  };
}

// =========================================================================
// 3. Per-Muscle Region Summary Derivation
// =========================================================================

function extractOrderedRoles(
  items: readonly MuscleRegionEvidenceItem[]
): readonly MuscleInvolvementRole[] {
  const present = new Set<MuscleInvolvementRole>();
  for (const item of items) {
    present.add(item.role);
  }
  return Object.freeze(ROLE_DISPLAY_ORDER.filter((role) => present.has(role)));
}

function buildMuscleRegionDisplayEvidence(
  regionId: MuscleRegionId,
  items: readonly MuscleRegionEvidenceItem[]
): MuscleRegionDisplayEvidence {
  const meta = MUSCLE_REGION_REGISTRY[regionId];

  const immediateEvidence: MuscleRegionEvidenceItem[] = [];
  const residualEvidence: MuscleRegionEvidenceItem[] = [];
  const historicalEvidence: MuscleRegionEvidenceItem[] = [];
  const bracketEvidence: MuscleRegionEvidenceItem[] = [];
  const uncertainEvidence: MuscleRegionEvidenceItem[] = [];

  for (const item of items) {
    switch (item.temporalState) {
      case 'immediate':
        immediateEvidence.push(item);
        break;
      case 'residual':
        residualEvidence.push(item);
        break;
      case 'historical':
        historicalEvidence.push(item);
        break;
      case 'bracket':
        bracketEvidence.push(item);
        break;
      case 'uncertain':
        uncertainEvidence.push(item);
        break;
    }
  }

  // Confirmed persistence rank (exact-ordinal only)
  let confirmedRank = 0;
  if (immediateEvidence.length > 0) {
    confirmedRank = 3;
  } else if (residualEvidence.length > 0) {
    confirmedRank = 2;
  } else if (historicalEvidence.length > 0) {
    confirmedRank = 1;
  }
  const confirmedPersistence = getRankState(confirmedRank);

  // Potential persistence rank (considers bracket upperBoundState without promoting confirmed status)
  let potentialRank = confirmedRank;
  for (const b of bracketEvidence) {
    if (b.potentialPersistenceBounds) {
      const upperRank = getPersistenceRank(b.potentialPersistenceBounds.upperBoundState);
      if (upperRank > potentialRank) {
        potentialRank = upperRank;
      }
    }
  }
  const potentialPersistence = getRankState(potentialRank);

  const hasBracketTraces = bracketEvidence.length > 0;
  const hasUncertainTraces = uncertainEvidence.length > 0;
  const hasUncertainty = hasBracketTraces || hasUncertainTraces;

  let note: string | undefined;
  if (hasUncertainTraces && hasBracketTraces) {
    note = '당일 시간 미지정 및 24h/72h 경계 시점 불확실 근거 포함';
  } else if (hasUncertainTraces) {
    note = '당일 시간 미지정 기록으로 인한 불확실 근거 포함';
  } else if (hasBracketTraces) {
    note = '24h/72h 경계 시점에 걸친 불확실 근거 포함';
  }

  const uncertainty: MuscleRegionUncertaintyInfo = Object.freeze({
    hasUncertainty,
    hasBracketTraces,
    hasUncertainTraces,
    bracketTraceCount: bracketEvidence.length,
    uncertainTraceCount: uncertainEvidence.length,
    potentialPersistence,
    note,
  });

  // Display status rules:
  // 1. Confirmed immediate (<24h) -> '최근 부하' (uncertainty kept separately)
  // 2. Confirmed residual (24h-72h) -> '잔여 부하' (uncertainty kept separately)
  // 3. Confirmed historical (>=72h) ONLY:
  //    - If uncertain same-day or bracket-potential immediate/residual exists -> '판단 정보 부족'
  //      (never claim '최근 부하 근거 없음' while recent/residual uncertainty exists)
  //    - Otherwise -> '최근 부하 근거 없음' (scoped to interpretable records only)
  // 4. Zero confirmed evidence (empty or uncertain/bracket only) -> '판단 정보 부족'
  let status: BodyLoadDisplayStatus;
  if (immediateEvidence.length > 0) {
    status = '최근 부하';
  } else if (residualEvidence.length > 0) {
    status = '잔여 부하';
  } else if (historicalEvidence.length > 0) {
    if (
      hasUncertainTraces ||
      (hasBracketTraces &&
        (potentialPersistence === 'immediate' || potentialPersistence === 'residual'))
    ) {
      status = '판단 정보 부족';
    } else {
      status = '최근 부하 근거 없음';
    }
  } else {
    status = '판단 정보 부족';
  }

  const rolesPresent = extractOrderedRoles(items);
  const activeConfirmedRoles = extractOrderedRoles([
    ...immediateEvidence,
    ...residualEvidence,
  ]);

  return Object.freeze({
    regionId,
    koreanName: meta.koreanName,
    displayGroupId: meta.displayGroupId,
    status,
    confirmedPersistence,
    isImmediate: status === '최근 부하',
    isResidual: status === '잔여 부하',
    isHistorical: status === '최근 부하 근거 없음',
    isInsufficient: status === '판단 정보 부족',
    uncertainty,
    evidence: Object.freeze([...items]),
    immediateEvidence: Object.freeze(immediateEvidence),
    residualEvidence: Object.freeze(residualEvidence),
    historicalEvidence: Object.freeze(historicalEvidence),
    bracketEvidence: Object.freeze(bracketEvidence),
    uncertainEvidence: Object.freeze(uncertainEvidence),
    rolesPresent,
    activeConfirmedRoles,
  });
}

// =========================================================================
// 4. Main Pure Transformation Function
// =========================================================================

/**
 * Derives per-muscle display evidence directly from pre-dimension-projection
 * exercise records using the Musculoskeletal SSOT and canonical evaluation instant/timezone.
 *
 * Pure function: zero input mutation, deeply frozen deterministic output.
 */
export function deriveMuscleDisplayEvidence(
  sourceExercises: readonly MuscleDisplaySourceExerciseEvidence[],
  evaluationContextInput: Readonly<EvaluationContextInput | EvaluationContext>
): MuscleDisplayEvidenceResult {
  const evalContext = normalizeEvaluationContext(evaluationContextInput);
  const safeInputs = sourceExercises ?? [];

  const regionBuckets: Record<MuscleRegionId, MuscleRegionEvidenceItem[]> = {
    'pectoralis-major': [],
    'anterior-deltoid': [],
    'lateral-deltoid': [],
    'posterior-deltoid': [],
    'biceps-elbow-flexors': [],
    'triceps-brachii': [],
    'upper-back-scapular': [],
    'latissimus-dorsi': [],
    'erector-spinae': [],
    quadriceps: [],
    hamstrings: [],
    gluteals: [],
    calves: [],
  };

  const uninterpretedExercises: MuscleDisplayUninterpretedExercise[] = [];
  const excludedFutureExercises: MuscleDisplayExcludedFutureExercise[] = [];
  const invalidDateTimeExercises: MuscleDisplayInvalidDateTimeExercise[] = [];

  const interpretableLogIds = new Set<string>();
  let interpretableExerciseCount = 0;
  let sameDayUncertainExerciseCount = 0;
  let calendarBoundedBracketExerciseCount = 0;
  let unconfirmedVariationCount = 0;
  let idNameConflictCount = 0;
  let unsupportedExerciseCount = 0;
  let emptyInputCount = 0;

  for (const item of safeInputs) {
    // 1. Validate date/time per item and evaluate temporal state; quarantine invalid or future records
    const temporal = evaluateExerciseTemporalState(item.date, item.startTime, evalContext);

    if (temporal.kind === 'invalid-datetime') {
      invalidDateTimeExercises.push(
        Object.freeze({
          sourceLogId: item.sourceLogId,
          date: item.date,
          startTime: item.startTime,
          sourceExerciseId: item.exerciseId,
          sourceExerciseName: item.exerciseName,
          category: 'invalid-datetime',
          reason: temporal.reason,
        })
      );
      continue;
    }

    if (temporal.kind === 'future') {
      excludedFutureExercises.push(
        Object.freeze({
          sourceLogId: item.sourceLogId,
          date: item.date,
          startTime: item.startTime,
          sourceExerciseId: item.exerciseId,
          sourceExerciseName: item.exerciseName,
          reason: temporal.reason,
        })
      );
      continue;
    }

    // 2. Strictly verify both source ID and source name against Musculoskeletal SSOT
    const resolution = resolveStrictMusculoskeletalProfile(
      item.exerciseId,
      item.exerciseName
    );

    if (resolution.kind === 'uninterpreted') {
      uninterpretedExercises.push(
        Object.freeze({
          sourceLogId: item.sourceLogId,
          date: item.date,
          startTime: item.startTime,
          sourceExerciseId: item.exerciseId,
          sourceExerciseName: item.exerciseName,
          category: resolution.category,
          reason: resolution.reason,
          occurrenceState: temporal.occurrenceState,
          temporalState: temporal.temporalState,
        })
      );

      switch (resolution.category) {
        case 'unconfirmed-variation':
          unconfirmedVariationCount += 1;
          break;
        case 'id-name-conflict':
          idNameConflictCount += 1;
          break;
        case 'unsupported':
          unsupportedExerciseCount += 1;
          break;
        case 'empty-input':
          emptyInputCount += 1;
          break;
      }
      continue;
    }

    // 3. Record interpretable provenance once per source exercise (NEVER recounted per muscle)
    interpretableExerciseCount += 1;
    if (item.sourceLogId && item.sourceLogId.trim().length > 0) {
      interpretableLogIds.add(item.sourceLogId.trim());
    }
    if (temporal.temporalState === 'uncertain') {
      sameDayUncertainExerciseCount += 1;
    } else if (temporal.temporalState === 'bracket') {
      calendarBoundedBracketExerciseCount += 1;
    }

    const profile = resolution.profile;

    // 4. Project to each muscle region defined by the exercise's musculoskeletal profile
    for (const involvement of profile.muscleInvolvements) {
      const evidenceItem: MuscleRegionEvidenceItem = Object.freeze({
        sourceLogId: item.sourceLogId,
        date: item.date,
        startTime: item.startTime,
        sourceExerciseId: item.exerciseId,
        sourceExerciseName: item.exerciseName,
        canonicalExerciseId: profile.exerciseId,
        canonicalExerciseName: profile.canonicalName,
        regionId: involvement.regionId,
        role: involvement.role,
        functionalRoleDescription: involvement.functionalRoleDescription,
        occurrenceState: temporal.occurrenceState,
        elapsedTime: temporal.elapsedTime,
        temporalAttenuation: temporal.temporalAttenuation,
        temporalState: temporal.temporalState,
        potentialPersistenceBounds: temporal.potentialPersistenceBounds,
      });

      regionBuckets[involvement.regionId].push(evidenceItem);
    }
  }

  // 5. Build all 13 canonical muscle region display evidence items
  const regions: MuscleRegionDisplayEvidence[] = [];
  const regionMapMutable: Partial<Record<MuscleRegionId, MuscleRegionDisplayEvidence>> = {};

  for (const regionId of CANONICAL_MUSCLE_REGIONS) {
    const regionEvidence = buildMuscleRegionDisplayEvidence(regionId, regionBuckets[regionId]);
    regions.push(regionEvidence);
    regionMapMutable[regionId] = regionEvidence;
  }

  const regionMap = Object.freeze(
    regionMapMutable as Record<MuscleRegionId, MuscleRegionDisplayEvidence>
  );

  // 6. Build all 11 display groups strictly for layout grouping (NO status merging/collapsing)
  const displayGroups: MuscleDisplayGroupPresentation[] = [];
  const displayGroupMapMutable: Partial<
    Record<MuscleDisplayGroupId, MuscleDisplayGroupPresentation>
  > = {};

  for (const groupId of CANONICAL_MUSCLE_DISPLAY_GROUPS) {
    const groupMeta = MUSCLE_DISPLAY_GROUP_REGISTRY[groupId];
    const memberRegions = Object.freeze(
      groupMeta.memberRegionIds.map((rid) => regionMap[rid])
    );

    const groupPresentation: MuscleDisplayGroupPresentation = Object.freeze({
      groupId: groupMeta.groupId,
      koreanName: groupMeta.koreanName,
      description: groupMeta.description,
      memberRegionIds: groupMeta.memberRegionIds,
      regions: memberRegions,
    });

    displayGroups.push(groupPresentation);
    displayGroupMapMutable[groupId] = groupPresentation;
  }

  const displayGroupMap = Object.freeze(
    displayGroupMapMutable as Record<MuscleDisplayGroupId, MuscleDisplayGroupPresentation>
  );

  const hasTemporalUncertainty = regions.some((r) => r.uncertainty.hasUncertainty);
  const hasUninterpretedExercises = uninterpretedExercises.length > 0;
  const hasInvalidDateTimeExercises = invalidDateTimeExercises.length > 0;

  const provenanceSummary: MuscleDisplayProvenanceSummary = Object.freeze({
    totalInputExerciseCount: safeInputs.length,
    interpretableExerciseCount,
    distinctInterpretableLogCount: interpretableLogIds.size,
    excludedFutureExerciseCount: excludedFutureExercises.length,
    invalidDateTimeExerciseCount: invalidDateTimeExercises.length,
    uninterpretedExerciseCount: uninterpretedExercises.length,
    unconfirmedVariationCount,
    idNameConflictCount,
    unsupportedExerciseCount,
    emptyInputCount,
    sameDayUncertainExerciseCount,
    calendarBoundedBracketExerciseCount,
  });

  // 7. Build factual interpretation scope notice
  let interpretationScopeNotice: string;
  if (interpretableExerciseCount === 0 && hasUninterpretedExercises) {
    interpretationScopeNotice = `해석 가능한 기준 종목 기록이 없으며, 미해석 기록 ${uninterpretedExercises.length}건(미확인 변형 ${unconfirmedVariationCount}, ID·명칭 충돌 ${idNameConflictCount}, 미지원 ${unsupportedExerciseCount})은 특정 근육에 임의 배정하지 않았습니다.`;
  } else if (interpretableExerciseCount === 0) {
    interpretationScopeNotice = '해석 가능한 운동 기록이 없어 모든 근육 영역이 판단 정보 부족 상태입니다.';
  } else if (hasUninterpretedExercises) {
    interpretationScopeNotice = `근육별 상태는 해석 가능한 기준 종목 기록 ${interpretableExerciseCount}건의 범위에 한정되며, 미해석 기록 ${uninterpretedExercises.length}건(미확인 변형 ${unconfirmedVariationCount}, ID·명칭 충돌 ${idNameConflictCount}, 미지원 ${unsupportedExerciseCount})은 특정 근육에 임의 배정하지 않고 별도 보존했습니다.`;
  } else {
    interpretationScopeNotice = `근육별 상태는 해석 가능한 기준 종목 기록 ${interpretableExerciseCount}건의 범위에 한정됩니다.`;
  }

  if (hasInvalidDateTimeExercises) {
    interpretationScopeNotice += ` 잘못된 날짜·시각 기록 ${invalidDateTimeExercises.length}건은 별도 격리했습니다.`;
  }

  return Object.freeze({
    kind: 'muscle-display-evidence',
    evaluationContext: evalContext,
    regions: Object.freeze(regions),
    regionMap,
    displayGroups: Object.freeze(displayGroups),
    displayGroupMap,
    uninterpretedExercises: Object.freeze(uninterpretedExercises),
    excludedFutureExercises: Object.freeze(excludedFutureExercises),
    invalidDateTimeExercises: Object.freeze(invalidDateTimeExercises),
    provenanceSummary,
    interpretationScopeNotice,
    hasTemporalUncertainty,
    hasUninterpretedExercises,
    hasInvalidDateTimeExercises,
  });
}
