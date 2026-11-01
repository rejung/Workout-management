/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Canonical Exercise Musculoskeletal Relation Table (VNext Recommendation Engine - Phase 1)
 *
 * Defines the shared kinesiological relation table for muscle involvement,
 * torso stabilization demands, and movement plane profiles for foundation exercises.
 *
 * Strict Architectural Invariants:
 * 1. 6 Foundation Candidates (Phase 1):
 *    - bench_press
 *    - overhead_press
 *    - squat
 *    - deadlift
 *    - barbell_row
 *    - running
 * 2. Distinct Musculoskeletal Profiles:
 *    - Bench Press vs OHP: Share anterior deltoid & triceps, but distinct primary target, plane,
 *      and torso support (bench vs free standing overhead).
 *    - Barbell Row: Pulling prime movers (latissimus dorsi, upper back) vs bent-over posture
 *      stabilizers (erector spinae, hamstrings, gluteals) preserved separately.
 *    - Squat vs Deadlift: Squat (knee-dominant, quadriceps & gluteals primary, compressive axial load);
 *      Deadlift (hip hinge posterior chain, gluteals & hamstrings primary, lumbar flexion moment resistance).
 *    - Conventional Deadlift ≠ Romanian Deadlift: RDL is not assumed to be the same variant.
 *    - Running: Explicitly includes calves (종아리) as primary locomotive target.
 *    - Erector Spinae ≠ Axial / Systemic Load: Local erector spinae demand is explicitly separated
 *      from systemic central fatigue or whole-body compressive load.
 * 3. Pure Qualitative Roles:
 *    - Strictly 'primary-target' | 'synergist' | 'stabilizer'.
 *    - ZERO arbitrary numeric percentages, fatigue weights, or recovery formulas.
 * 4. Explicit Lookup Results:
 *    - Unsupported exercises, unconfirmed variations, and empty inputs return explicit
 *      discriminated statuses. NEVER return empty muscle sets or zero burden.
 * 5. Pure Immutability: Deeply frozen relation table and lookup returns.
 */

import {
  ExerciseMusculoskeletalProfile,
  ExerciseMusculoskeletalLookupResult,
} from '../types/exerciseMusculoskeletalProfile.types';

// =========================================================================
// 1. Foundation Candidate Relation Table (Frozen SSOT)
// =========================================================================

export const CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES: Readonly<
  Record<string, ExerciseMusculoskeletalProfile>
> = Object.freeze({
  // -----------------------------------------------------------------------
  // Bench Press (벤치프레스)
  // -----------------------------------------------------------------------
  bench_press: Object.freeze({
    exerciseId: 'bench_press',
    canonicalName: '벤치프레스',
    movementPlane: '수평 밀기 (Horizontal Pressing)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'pectoralis-major',
        role: 'primary-target',
        functionalRoleDescription: '상완골 수평 내전 및 굴곡을 주도하는 흉근 주동',
      }),
      Object.freeze({
        regionId: 'anterior-deltoid',
        role: 'synergist',
        functionalRoleDescription: '수평 프레싱 프론트 모션 협력 동원',
      }),
      Object.freeze({
        regionId: 'triceps-brachii',
        role: 'synergist',
        functionalRoleDescription: '주관절 신전 및 최종 락아웃 협력',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'minimal-external-support',
      description:
        '평평한 벤치가 등과 척추 후면을 지지하여 척추에 대한 직접적 축성 압축이나 전단 모멘트가 외부 구조물로 분산됨. 흉곽 아치 유지 및 견갑골 후인·하강을 위한 체간 장력만 요구됨.',
      erectorSpinaeContext:
        '척추기립근은 벤치 위에서 가벼운 흉요추 아치 자세를 지지하는 보조적 역할에 그치며, 스탠딩 리프트와 같은 고부하 축성 지탱 스트레스와 구별됨.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'bench-supported',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '플랫 바벨 벤치프레스 기준. 인클라인/덤벨 프레스와는 관여 각도와 자유도 안정화 요구가 상이함.',
    }),
    interpretationNotes:
      'OHP와 전면삼각근 및 삼두근 관여를 공유하나, 수평 프레싱 궤적과 벤치 지지로 인해 몸통 지지 요구 및 주동근이 뚜렷이 구별됨. 피로 가중치나 회복 시간 수치 산출에 사용되지 않음.',
  }),

  // -----------------------------------------------------------------------
  // Overhead Press (오버헤드 프레스)
  // -----------------------------------------------------------------------
  overhead_press: Object.freeze({
    exerciseId: 'overhead_press',
    canonicalName: '오버헤드 프레스',
    movementPlane: '수직 밀기 (Vertical Pressing)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'anterior-deltoid',
        role: 'primary-target',
        functionalRoleDescription: '상완 수직 거상 및 굴곡을 주도하는 어깨 전면 주동',
      }),
      Object.freeze({
        regionId: 'lateral-deltoid',
        role: 'synergist',
        functionalRoleDescription: '상완 외전 및 상방 궤적 보조 협력',
      }),
      Object.freeze({
        regionId: 'triceps-brachii',
        role: 'synergist',
        functionalRoleDescription: '주관절 신전 및 두상(overhead) 락아웃 협력',
      }),
      Object.freeze({
        regionId: 'upper-back-scapular',
        role: 'synergist',
        functionalRoleDescription: '견갑골 상방 회전 및 흉곽 밀착 안정화 (승모근/전거근)',
      }),
      Object.freeze({
        regionId: 'erector-spinae',
        role: 'stabilizer',
        functionalRoleDescription: '직립 상태에서 요추 과신전을 방지하고 척추 중립을 유지하는 자세 유지',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'high-isometric-stabilization',
      description:
        '외부 등받이나 지지대 없이 서 있는 상태에서 머리 위로 바벨을 밀어 올리므로, 요추 과신전을 억제하고 척추 중립을 유지하기 위한 상당한 복강내압과 체간 등척성 브레이싱이 요구됨.',
      erectorSpinaeContext:
        '척추기립근이 체간 중립 유지를 위해 정적 안정근으로 동원되나, 이 국소 근육 관여를 전신 신경계 축성 피로(axial-systemic-loading) 전체와 동일시하지 않음.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'unsupported-free-weight',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '스탠딩 바벨 OHP 기준. 시티드 OHP나 머신 숄더 프레스와 같은 등받이 지지 변형과 구분됨.',
    }),
    interpretationNotes:
      '벤치프레스와 전면 어깨·삼두 관여를 공유하지만 수직 궤적 및 서 있는 몸통 지지 요구에서 명확히 분리됨. 정밀한 피로 점수로 환산되지 않음.',
  }),

  // -----------------------------------------------------------------------
  // Squat (스쿼트)
  // -----------------------------------------------------------------------
  squat: Object.freeze({
    exerciseId: 'squat',
    canonicalName: '스쿼트',
    movementPlane: '무릎 중심 하체 복합 (Knee-Dominant Lower Body Compound)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'quadriceps',
        role: 'primary-target',
        functionalRoleDescription: '슬관절 신전 모멘트를 주도하는 대퇴사두근 주동',
      }),
      Object.freeze({
        regionId: 'gluteals',
        role: 'primary-target',
        functionalRoleDescription: '고관절 신전 및 골반 안정화를 담당하는 대둔근 주동',
      }),
      Object.freeze({
        regionId: 'hamstrings',
        role: 'synergist',
        functionalRoleDescription: '고관절 신전 보조 및 슬관절 동적 안정화 협력',
      }),
      Object.freeze({
        regionId: 'calves',
        role: 'stabilizer',
        functionalRoleDescription: '발목 관절 족저굴곡 및 지면 지지 기저면 안정화',
      }),
      Object.freeze({
        regionId: 'erector-spinae',
        role: 'stabilizer',
        functionalRoleDescription: '상체 전경 토크에 대항하여 척추 중립 신전을 수호하는 등척성 안정화',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'high-isometric-stabilization',
      description:
        '상체 상부에 얹힌 바벨로 인해 척추 전반에 강한 축성 압축력과 전방 굴곡 토크가 작용하여, 척추기립근과 복벽의 강력한 등척성 브레이싱이 필수적임.',
      erectorSpinaeContext:
        '척추기립근의 높은 정적 지지 요구가 존재하나, 이는 척추 신전 토크 저항이며 전신 축성 부하(axial systemic loading)를 척추기립근 단독 피로로 환원하지 않음.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'unsupported-free-weight',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '바벨 백스쿼트 기준. 레그프레스나 핵스쿼트 등 머신 지지 하체 운동과 구분됨.',
    }),
    interpretationNotes:
      '데드리프트와 후면사슬 및 몸통 지지를 공유하지만, 슬관절 굴곡 각도와 대퇴사두근의 주된 동원에서 뚜렷이 구분됨.',
  }),

  // -----------------------------------------------------------------------
  // Deadlift (데드리프트)
  // -----------------------------------------------------------------------
  deadlift: Object.freeze({
    exerciseId: 'deadlift',
    canonicalName: '데드리프트',
    movementPlane: '고관절 힌지 후면사슬 (Hip Hinge Posterior Chain)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'gluteals',
        role: 'primary-target',
        functionalRoleDescription: '강력한 고관절 신전 종말 락아웃을 주도하는 둔근 주동',
      }),
      Object.freeze({
        regionId: 'hamstrings',
        role: 'primary-target',
        functionalRoleDescription: '고관절 신전 토크를 생성하는 햄스트링 복합 주동',
      }),
      Object.freeze({
        regionId: 'erector-spinae',
        role: 'stabilizer',
        functionalRoleDescription: '바닥에서 당기는 극심한 전방 굴곡 모멘트에 저항하는 핵심 등척성 척추 지지',
      }),
      Object.freeze({
        regionId: 'quadriceps',
        role: 'synergist',
        functionalRoleDescription: '바닥에서 바벨을 띄우는 초기 퍼스트 풀 슬관절 신전 협력',
      }),
      Object.freeze({
        regionId: 'upper-back-scapular',
        role: 'stabilizer',
        functionalRoleDescription: '바벨이 몸에서 멀어지지 않도록 견갑 하강 및 흉추 붕괴 방지',
      }),
      Object.freeze({
        regionId: 'latissimus-dorsi',
        role: 'stabilizer',
        functionalRoleDescription: '바벨을 다리에 밀착 유지하기 위한 상완 신전 등척성 안정화',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'high-isometric-stabilization',
      description:
        '바닥의 정지된 중량을 들어 올릴 때 척추 전 영역에 매우 큰 전단 및 굴곡 모멘트가 발생하여 척추기립근 및 전신 코어의 최대 등척성 지지력이 요구됨.',
      erectorSpinaeContext:
        '척추기립근은 척추 중립을 수호하는 핵심 자세 유지 근육이나, 데드리프트의 고부하 스트레스는 신경계 및 전신 축성 맥락을 동반하므로 기립근 단일 피로로 동일시하지 않음.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'unsupported-free-weight',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '컨벤셔널 바벨 데드리프트 기준. RDL(로마니안 데드리프트)은 바닥 리셋 없이 햄스트링 신장성 자극에 집중하는 별도 힌지 변형으로, 컨벤셔널 데드리프트와 동일시하지 않음.',
    }),
    interpretationNotes:
      '스쿼트와의 주된 자극 차이(슬관절 중심 vs 고관절 중심)를 구별하며, 등 상부/광배근은 능동적 당기기가 아니라 바벨 제어 안정화 역할로 분류됨.',
  }),

  // -----------------------------------------------------------------------
  // Barbell Row (바벨 로우)
  // -----------------------------------------------------------------------
  barbell_row: Object.freeze({
    exerciseId: 'barbell_row',
    canonicalName: '바벨 로우',
    movementPlane: '수평 당기기 복합 (Horizontal Pulling Compound)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'latissimus-dorsi',
        role: 'primary-target',
        functionalRoleDescription: '상완 신전 및 체간 방향 견인을 담당하는 광배근 주동',
      }),
      Object.freeze({
        regionId: 'upper-back-scapular',
        role: 'primary-target',
        functionalRoleDescription: '견갑골 후인 및 흉곽 수축을 담당하는 능형근·승모근 주동',
      }),
      Object.freeze({
        regionId: 'posterior-deltoid',
        role: 'synergist',
        functionalRoleDescription: '상완 수평 외전 협력',
      }),
      Object.freeze({
        regionId: 'biceps-elbow-flexors',
        role: 'synergist',
        functionalRoleDescription: '주관절 굴곡 견인 협력',
      }),
      Object.freeze({
        regionId: 'erector-spinae',
        role: 'stabilizer',
        functionalRoleDescription: '상체를 숙인 벤트오버 자세를 버티기 위한 척추기립근의 지속적 등척성 지지',
      }),
      Object.freeze({
        regionId: 'hamstrings',
        role: 'stabilizer',
        functionalRoleDescription: '고관절 힌지 자세를 지탱하는 햄스트링의 등척성 버팀',
      }),
      Object.freeze({
        regionId: 'gluteals',
        role: 'stabilizer',
        functionalRoleDescription: '골반 경사 유지 및 기저 안정성 확보',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'high-isometric-stabilization',
      description:
        '상체를 앞으로 숙인 채 중력에 대항하여 중량을 당기므로 척추기립근, 햄스트링, 둔근이 몸통 자세를 버텨야 하는 상당한 등척성 지지 요구가 수반됨.',
      erectorSpinaeContext:
        '벤트오버 로우에서는 상체 지지대가 없어 척추기립근이 강력한 자세 유지근으로 동원되나, 이는 상체 당기기 주동근(광배/등상부)과 기능적으로 명확히 분리 기록됨.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'unsupported-free-weight',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '체스트 서포티드 로우(Chest-Supported Row)나 인클라인 벤치 로우는 벤치가 상체를 지지하여 척추기립근 및 몸통 지지 요구가 최소화되지만, 본 프로필은 외부 지지대가 없는 자유 중량 바벨 벤트오버 로우 기준임. 기존 사전에 지지형 로우가 별도 정의되어 있지 않으므로 임의 변형으로 통합하지 않음.',
    }),
    interpretationNotes:
      '상체 당기기 근육(광배/등상부/이두)과 하체-체간 지지 근육(기립근/햄스트링/둔근)을 명확히 구분하여 기록함.',
  }),

  // -----------------------------------------------------------------------
  // Running (러닝)
  // -----------------------------------------------------------------------
  running: Object.freeze({
    exerciseId: 'running',
    canonicalName: '러닝',
    movementPlane: '심폐 보행 이동성 (Cardiovascular Locomotion)',
    muscleInvolvements: Object.freeze([
      Object.freeze({
        regionId: 'calves',
        role: 'primary-target',
        functionalRoleDescription: '비복근 및 가자미근의 지속적 족저굴곡 및 지면 반력 추진',
      }),
      Object.freeze({
        regionId: 'quadriceps',
        role: 'synergist',
        functionalRoleDescription: '착지 충격 흡수 및 무릎 신전 지지',
      }),
      Object.freeze({
        regionId: 'hamstrings',
        role: 'synergist',
        functionalRoleDescription: '스윙 페이즈 무릎 굴곡 및 고관절 신전 보조',
      }),
      Object.freeze({
        regionId: 'gluteals',
        role: 'synergist',
        functionalRoleDescription: '보행 추진 및 골반 수평 안정화',
      }),
    ]),
    torsoSupportDemand: Object.freeze({
      demandLevel: 'moderate-dynamic-stabilization',
      description:
        '동적 직립 이동 중 골반과 척추의 회전 및 착지 충격을 완충하기 위한 전신 코어의 동적 자세 제어.',
      erectorSpinaeContext:
        '바벨 축성 하중과 같은 척추 압축 부하가 없으며, 보행 균형을 위한 동적 체간 안정화로 작용함.',
    }),
    externalSupportOrVariation: Object.freeze({
      supportType: 'bodyweight-locomotion',
      isChestSupported: false,
      isVariationExplicitlyVerified: true,
      variationDistinctionNotes:
        '체중 부하 유산소 이동성 활동. 웨이트 트레이닝 세트 메커니즘을 갖지 않음.',
    }),
    interpretationNotes:
      '하지 추진과 착지 완충에서 종아리(비복근/가자미근)의 핵심 관여를 명시적으로 포함함. 근력 운동 성격이 아니며 심폐/충격 스트레스 맥락에서 하지 근육군이 동원됨.',
  }),
});

// =========================================================================
// 2. Normalization & Lookup Helpers
// =========================================================================

/**
 * Normalizes input keys for case-insensitive, punctuation-tolerant lookup.
 */
function normalizeLookupKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s\-_]+/g, '_')
    .replace(/[^a-z0-9_가-힣]/g, '');
}

/**
 * Known distinct variants that must NOT be silently collapsed into foundation lifts.
 */
interface UnconfirmedVariationRule {
  readonly patterns: readonly string[];
  readonly matchedBaseCandidate: string;
  readonly reason: string;
}

const UNCONFIRMED_VARIATION_RULES: readonly UnconfirmedVariationRule[] = Object.freeze([
  Object.freeze({
    patterns: ['chest_supported_row', '체스트서포티드로우', '체스트서포티드', 'chest_support'],
    matchedBaseCandidate: 'barbell_row',
    reason:
      '체스트 서포티드 로우는 상체 지지대로 인해 척추기립근 및 몸통 지지 요구가 현저히 감소하는 별도 변형입니다. 외부 지지가 없는 바벨 로우와 동일시할 수 없습니다.',
  }),
  Object.freeze({
    patterns: ['rdl', 'romanian_deadlift', 'romaniandeadlift', '로마니안데드리프트', '로마니안'],
    matchedBaseCandidate: 'deadlift',
    reason:
      '로마니안 데드리프트는 바닥 리셋과 초기 슬관절 신전이 없는 순수 힌지 신장성 변형입니다. 컨벤셔널 데드리프트와 동일시할 수 없습니다.',
  }),
  Object.freeze({
    patterns: ['incline_bench_press', 'incline_bench', '인클라인벤치프레스', '인클라인덤벨프레스'],
    matchedBaseCandidate: 'bench_press',
    reason:
      '인클라인 프레스는 상완 거상 각도 변화로 쇄골지(상부 흉근) 및 전면 삼각근 관여 비중이 변하는 변형으로, 플랫 벤치프레스와 동일시할 수 없습니다.',
  }),
  Object.freeze({
    patterns: ['seated_overhead_press', 'seated_ohp', '시티드오버헤드프레스', '시티드ohp'],
    matchedBaseCandidate: 'overhead_press',
    reason:
      '시티드 OHP는 시트 지지로 인해 입식 직립 체간 안정화 요구가 감소하는 변형으로, 스탠딩 바벨 OHP와 동일시할 수 없습니다.',
  }),
]);

/**
 * Supported alias mappings to the 6 canonical profiles.
 */
const ALIAS_TO_CANONICAL_ID: Readonly<Record<string, string>> = Object.freeze({
  // Bench Press
  bench_press: 'bench_press',
  bench: 'bench_press',
  flat_bench_press: 'bench_press',
  benchpress: 'bench_press',
  벤치프레스: 'bench_press',
  벤치: 'bench_press',

  // Overhead Press
  overhead_press: 'overhead_press',
  overheadpress: 'overhead_press',
  ohp: 'overhead_press',
  standing_overhead_press: 'overhead_press',
  오버헤드프레스: 'overhead_press',
  오버헤드_프레스: 'overhead_press',

  // Squat
  squat: 'squat',
  back_squat: 'squat',
  barbell_squat: 'squat',
  스쿼트: 'squat',
  백스쿼트: 'squat',

  // Deadlift (Conventional)
  deadlift: 'deadlift',
  conventional_deadlift: 'deadlift',
  barbell_deadlift: 'deadlift',
  데드리프트: 'deadlift',
  컨벤셔널데드리프트: 'deadlift',
  컨벤셔널_데드리프트: 'deadlift',

  // Barbell Row
  barbell_row: 'barbell_row',
  barbellrow: 'barbell_row',
  bent_over_row: 'barbell_row',
  bentoverrow: 'barbell_row',
  row: 'barbell_row',
  바벨로우: 'barbell_row',
  바벨_로우: 'barbell_row',
  벤트오버로우: 'barbell_row',
  벤트오버_로우: 'barbell_row',

  // Running
  running: 'running',
  run: 'running',
  jogging: 'running',
  outdoor_run: 'running',
  treadmill: 'running',
  러닝: 'running',
  달리기: 'running',
  조깅: 'running',
  트레드밀: 'running',
});

// =========================================================================
// 3. Pure Lookup Function
// =========================================================================

/**
 * Retrieves the ExerciseMusculoskeletalProfile for a given exercise ID or name.
 *
 * Strict Taxonomy:
 * - 'supported': Matched one of the 6 canonical foundation exercises.
 * - 'unconfirmed-variation': Known distinct variant (e.g. chest-supported row, RDL)
 *   that must not be collapsed into foundation lifts.
 * - 'unsupported': Unrecognized exercise or outside the 6 foundation exercises.
 *   (NEVER returns empty muscle sets or zero burden).
 * - 'empty-input': Query string is empty or whitespace.
 */
export function getExerciseMusculoskeletalProfile(
  exerciseIdOrName: string
): ExerciseMusculoskeletalLookupResult {
  if (!exerciseIdOrName || !exerciseIdOrName.trim()) {
    return Object.freeze({
      status: 'empty-input',
      reason: '운동 식별자 또는 이름이 비어 있습니다.',
    });
  }

  const rawKey = exerciseIdOrName.trim();
  const normalized = normalizeLookupKey(rawKey);
  const stripped = normalized.replace(/_/g, '');

  // 1. Guard against unconfirmed variations first
  for (const rule of UNCONFIRMED_VARIATION_RULES) {
    if (
      rule.patterns.some((pat) => {
        const cleanPat = pat.replace(/_/g, '');
        return stripped === cleanPat || stripped.includes(cleanPat);
      })
    ) {
      return Object.freeze({
        status: 'unconfirmed-variation',
        queriedKey: rawKey,
        matchedBaseCandidate: rule.matchedBaseCandidate,
        reason: rule.reason,
      });
    }
  }

  // 2. Match supported canonical ID or aliases
  const canonicalId = ALIAS_TO_CANONICAL_ID[normalized];
  if (canonicalId && CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES[canonicalId]) {
    return Object.freeze({
      status: 'supported',
      profile: CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES[canonicalId],
    });
  }

  // 3. Fallback to explicit unsupported status
  return Object.freeze({
    status: 'unsupported',
    queriedKey: rawKey,
    reason: `운동 '${rawKey}'은(는) 1단계 관계표 대상 6대 기본 종목(벤치프레스, OHP, 스쿼트, 데드리프트, 바벨 로우, 러닝)에 포함되지 않은 미지원 운동입니다. 부담 제로(부하 없음)로 해석할 수 없습니다.`,
  });
}
