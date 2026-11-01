/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Muscle Regions & Display Groups Registry (VNext Recommendation Engine - Phase 1)
 *
 * Defines the 13 anatomical muscle regions and 11 UI display groups as the
 * single source of truth (SSOT) for musculoskeletal representation.
 *
 * Strict Invariants:
 * 1. 13 Regions:
 *    - pectoralis-major (대흉근)
 *    - anterior-deltoid (전면삼각근)
 *    - lateral-deltoid (측면삼각근)
 *    - posterior-deltoid (후면삼각근)
 *    - biceps-elbow-flexors (이두근 중심 팔꿈치 굽힘 영역)
 *    - triceps-brachii (삼두근)
 *    - upper-back-scapular (등 상부·견갑대)
 *    - latissimus-dorsi (광배근)
 *    - erector-spinae (척추기립근 영역)
 *    - quadriceps (대퇴사두근)
 *    - hamstrings (햄스트링)
 *    - gluteals (둔근)
 *    - calves (종아리)
 * 2. 11 Display Groups:
 *    - 'shoulders' groups anterior, lateral, and posterior deltoids.
 *    - The remaining 10 regions each form their own 1:1 group.
 *    - Invariant: Each region belongs to exactly one display group.
 * 3. NO Mean/Max Aggregation Functions:
 *    - This registry defines descriptive classification only.
 *    - Does NOT compute fatigue averages, maximums, or scalar scores.
 * 4. Pure Immutability: Deeply frozen registry structures.
 */

import {
  CANONICAL_MUSCLE_REGIONS,
  CANONICAL_MUSCLE_DISPLAY_GROUPS,
  MuscleRegionId,
  MuscleDisplayGroupId,
  MuscleRegionMetadata,
  MuscleDisplayGroupMetadata,
} from '../types/exerciseMusculoskeletalProfile.types';

// =========================================================================
// 1. Muscle Region Registry (13 Regions)
// =========================================================================

export const MUSCLE_REGION_REGISTRY: Readonly<
  Record<MuscleRegionId, MuscleRegionMetadata>
> = Object.freeze({
  'pectoralis-major': Object.freeze({
    regionId: 'pectoralis-major',
    koreanName: '대흉근',
    anatomicalDescription: '흉골지 및 쇄골지를 포함한 가슴 전면 주요 굴곡·내전 근육',
    displayGroupId: 'chest',
  }),
  'anterior-deltoid': Object.freeze({
    regionId: 'anterior-deltoid',
    koreanName: '전면삼각근',
    anatomicalDescription: '상완 전방 굴곡 및 내회전에 관여하는 어깨 앞쪽 근육',
    displayGroupId: 'shoulders',
  }),
  'lateral-deltoid': Object.freeze({
    regionId: 'lateral-deltoid',
    koreanName: '측면삼각근',
    anatomicalDescription: '상완 외전에 관여하는 어깨 중간 근육',
    displayGroupId: 'shoulders',
  }),
  'posterior-deltoid': Object.freeze({
    regionId: 'posterior-deltoid',
    koreanName: '후면삼각근',
    anatomicalDescription: '상완 수평 외전 및 신전에 관여하는 어깨 뒤쪽 근육',
    displayGroupId: 'shoulders',
  }),
  'biceps-elbow-flexors': Object.freeze({
    regionId: 'biceps-elbow-flexors',
    koreanName: '이두근 중심 팔꿈치 굽힘 영역',
    anatomicalDescription: '상완이두근, 상완근, 완요골근을 포함한 주관절 굴곡 복합 영역',
    displayGroupId: 'biceps-elbow-flexors',
  }),
  'triceps-brachii': Object.freeze({
    regionId: 'triceps-brachii',
    koreanName: '삼두근',
    anatomicalDescription: '장두, 외측두, 내측두로 구성된 주관절 신전 근육',
    displayGroupId: 'triceps-brachii',
  }),
  'upper-back-scapular': Object.freeze({
    regionId: 'upper-back-scapular',
    koreanName: '등 상부·견갑대',
    anatomicalDescription: '승모근(중·하부), 능형근, 견갑거근 및 회전근개를 포함한 견갑대 제어 복합',
    displayGroupId: 'upper-back-scapular',
  }),
  'latissimus-dorsi': Object.freeze({
    regionId: 'latissimus-dorsi',
    koreanName: '광배근',
    anatomicalDescription: '상완 신전, 내전 및 내회전에 관여하는 등 중·하부 대근육',
    displayGroupId: 'latissimus-dorsi',
  }),
  'erector-spinae': Object.freeze({
    regionId: 'erector-spinae',
    koreanName: '척추기립근 영역',
    anatomicalDescription: '장늑근, 최장근, 극근을 포함한 척추 신전 및 항중력 등척성 지지 근육 복합체',
    displayGroupId: 'erector-spinae',
  }),
  'quadriceps': Object.freeze({
    regionId: 'quadriceps',
    koreanName: '대퇴사두근',
    anatomicalDescription: '대퇴직근, 외측광근, 내측광근, 중간광근으로 구성된 슬관절 신전 주동근',
    displayGroupId: 'quadriceps',
  }),
  'hamstrings': Object.freeze({
    regionId: 'hamstrings',
    koreanName: '햄스트링',
    anatomicalDescription: '대퇴이두근, 반건양근, 반막양근으로 구성된 고관절 신전 및 슬관절 굴곡 근육',
    displayGroupId: 'hamstrings',
  }),
  'gluteals': Object.freeze({
    regionId: 'gluteals',
    koreanName: '둔근',
    anatomicalDescription: '대둔근, 중둔근, 소둔근으로 구성된 고관절 신전 및 골반 안정화 근육',
    displayGroupId: 'gluteals',
  }),
  'calves': Object.freeze({
    regionId: 'calves',
    koreanName: '종아리',
    anatomicalDescription: '비복근(내측두/외측두) 및 가자미근으로 구성된 족관절 족저굴곡 근육군',
    displayGroupId: 'calves',
  }),
});

// =========================================================================
// 2. Display Group Registry (11 Groups)
// =========================================================================

export const MUSCLE_DISPLAY_GROUP_REGISTRY: Readonly<
  Record<MuscleDisplayGroupId, MuscleDisplayGroupMetadata>
> = Object.freeze({
  chest: Object.freeze({
    groupId: 'chest',
    koreanName: '대흉근',
    description: '가슴 전면 근육군',
    memberRegionIds: Object.freeze(['pectoralis-major'] as const),
  }),
  shoulders: Object.freeze({
    groupId: 'shoulders',
    koreanName: '어깨',
    description: '전면·측면·후면 삼각근을 통합 표시하는 어깨 복합 그룹',
    memberRegionIds: Object.freeze([
      'anterior-deltoid',
      'lateral-deltoid',
      'posterior-deltoid',
    ] as const),
  }),
  'biceps-elbow-flexors': Object.freeze({
    groupId: 'biceps-elbow-flexors',
    koreanName: '이두근 중심 팔꿈치 굽힘 영역',
    description: '팔 앞쪽 굴곡 근육군',
    memberRegionIds: Object.freeze(['biceps-elbow-flexors'] as const),
  }),
  'triceps-brachii': Object.freeze({
    groupId: 'triceps-brachii',
    koreanName: '삼두근',
    description: '팔 뒤쪽 신전 근육군',
    memberRegionIds: Object.freeze(['triceps-brachii'] as const),
  }),
  'upper-back-scapular': Object.freeze({
    groupId: 'upper-back-scapular',
    koreanName: '등 상부·견갑대',
    description: '승모근 및 견갑골 안정화 근육군',
    memberRegionIds: Object.freeze(['upper-back-scapular'] as const),
  }),
  'latissimus-dorsi': Object.freeze({
    groupId: 'latissimus-dorsi',
    koreanName: '광배근',
    description: '등 중·하부 견인 근육군',
    memberRegionIds: Object.freeze(['latissimus-dorsi'] as const),
  }),
  'erector-spinae': Object.freeze({
    groupId: 'erector-spinae',
    koreanName: '척추기립근 영역',
    description: '척추 신전 및 체간 정적 지지 근육군',
    memberRegionIds: Object.freeze(['erector-spinae'] as const),
  }),
  quadriceps: Object.freeze({
    groupId: 'quadriceps',
    koreanName: '대퇴사두근',
    description: '허벅지 앞쪽 신전 근육군',
    memberRegionIds: Object.freeze(['quadriceps'] as const),
  }),
  hamstrings: Object.freeze({
    groupId: 'hamstrings',
    koreanName: '햄스트링',
    description: '허벅지 뒤쪽 굴곡·신전 근육군',
    memberRegionIds: Object.freeze(['hamstrings'] as const),
  }),
  gluteals: Object.freeze({
    groupId: 'gluteals',
    koreanName: '둔근',
    description: '엉덩이 고관절 신전 및 골반 제어 근육군',
    memberRegionIds: Object.freeze(['gluteals'] as const),
  }),
  calves: Object.freeze({
    groupId: 'calves',
    koreanName: '종아리',
    description: '하퇴 후면 족저굴곡 근육군',
    memberRegionIds: Object.freeze(['calves'] as const),
  }),
});

// =========================================================================
// 3. Helper Functions (No mean/max state aggregation)
// =========================================================================

/**
 * Returns metadata for a specific muscle region.
 */
export function getMuscleRegionMetadata(regionId: MuscleRegionId): MuscleRegionMetadata {
  return MUSCLE_REGION_REGISTRY[regionId];
}

/**
 * Returns metadata for a specific display group.
 */
export function getMuscleDisplayGroupMetadata(
  groupId: MuscleDisplayGroupId
): MuscleDisplayGroupMetadata {
  return MUSCLE_DISPLAY_GROUP_REGISTRY[groupId];
}

/**
 * Returns all regions belonging to the given display group.
 */
export function getRegionsInDisplayGroup(
  groupId: MuscleDisplayGroupId
): readonly MuscleRegionId[] {
  return MUSCLE_DISPLAY_GROUP_REGISTRY[groupId].memberRegionIds;
}

/**
 * Type guard for MuscleRegionId.
 */
export function isMuscleRegionId(value: unknown): value is MuscleRegionId {
  return typeof value === 'string' && CANONICAL_MUSCLE_REGIONS.includes(value as MuscleRegionId);
}

/**
 * Type guard for MuscleDisplayGroupId.
 */
export function isMuscleDisplayGroupId(value: unknown): value is MuscleDisplayGroupId {
  return (
    typeof value === 'string' &&
    CANONICAL_MUSCLE_DISPLAY_GROUPS.includes(value as MuscleDisplayGroupId)
  );
}
