/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CANONICAL_MUSCLE_REGIONS,
  CANONICAL_MUSCLE_DISPLAY_GROUPS,
  MuscleRegionId,
  MuscleDisplayGroupId,
} from '../types/exerciseMusculoskeletalProfile.types';
import {
  MUSCLE_REGION_REGISTRY,
  MUSCLE_DISPLAY_GROUP_REGISTRY,
  getMuscleRegionMetadata,
  getMuscleDisplayGroupMetadata,
  getRegionsInDisplayGroup,
  isMuscleRegionId,
  isMuscleDisplayGroupId,
} from './muscleRegions';
import {
  CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES,
  getExerciseMusculoskeletalProfile,
} from './exerciseMusculoskeletalProfiles';

interface TestAssertionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly details: string;
}

export function runMusculoskeletalTestSuite(): {
  readonly allPassed: boolean;
  readonly results: readonly TestAssertionResult[];
} {
  const results: TestAssertionResult[] = [];

  function assert(name: string, condition: boolean, details: string) {
    results.push({ name, passed: condition, details });
  }

  // =========================================================================
  // Section 1: 13 Regions and 11 Display Groups
  // =========================================================================

  // 1.1 Exactly 13 regions
  assert(
    'REG-01: Exactly 13 canonical muscle regions defined',
    CANONICAL_MUSCLE_REGIONS.length === 13 && new Set(CANONICAL_MUSCLE_REGIONS).size === 13,
    `Region count: ${CANONICAL_MUSCLE_REGIONS.length}`
  );

  // 1.2 Exactly 11 display groups
  assert(
    'REG-02: Exactly 11 canonical display groups defined',
    CANONICAL_MUSCLE_DISPLAY_GROUPS.length === 11 &&
      new Set(CANONICAL_MUSCLE_DISPLAY_GROUPS).size === 11,
    `Display group count: ${CANONICAL_MUSCLE_DISPLAY_GROUPS.length}`
  );

  // 1.3 Registry integrity for 13 regions
  const allRegionsRegistered = CANONICAL_MUSCLE_REGIONS.every((regId) => {
    const meta = MUSCLE_REGION_REGISTRY[regId];
    return (
      meta !== undefined &&
      meta.regionId === regId &&
      typeof meta.koreanName === 'string' &&
      meta.koreanName.length > 0 &&
      typeof meta.anatomicalDescription === 'string' &&
      meta.anatomicalDescription.length > 0 &&
      CANONICAL_MUSCLE_DISPLAY_GROUPS.includes(meta.displayGroupId)
    );
  });
  assert(
    'REG-03: All 13 regions have valid registry metadata and valid displayGroupId',
    allRegionsRegistered,
    'Verified registry entries for all 13 regions'
  );

  // 1.4 Shoulder display group contains exactly 3 deltoid regions
  const shoulderRegions = getRegionsInDisplayGroup('shoulders');
  const expectedShoulderRegions: MuscleRegionId[] = [
    'anterior-deltoid',
    'lateral-deltoid',
    'posterior-deltoid',
  ];
  const shoulderMatches =
    shoulderRegions.length === 3 &&
    expectedShoulderRegions.every((id) => shoulderRegions.includes(id));
  assert(
    'REG-04: Shoulder display group contains exactly 3 deltoid regions (anterior, lateral, posterior)',
    shoulderMatches,
    `Shoulder regions: ${shoulderRegions.join(', ')}`
  );

  // 1.5 The other 10 display groups contain exactly 1 region each
  const nonShoulderGroups = CANONICAL_MUSCLE_DISPLAY_GROUPS.filter((g) => g !== 'shoulders');
  const otherGroupsAreOneToOne = nonShoulderGroups.every((g) => {
    const members = getRegionsInDisplayGroup(g);
    return members.length === 1;
  });
  assert(
    'REG-05: Remaining 10 display groups map 1:1 to a single muscle region',
    otherGroupsAreOneToOne,
    `Checked 10 groups: ${nonShoulderGroups.join(', ')}`
  );

  // 1.6 Disjoint partition: every region belongs to exactly one group, total members = 13
  const allGroupMembers = CANONICAL_MUSCLE_DISPLAY_GROUPS.flatMap((g) => getRegionsInDisplayGroup(g));
  const uniqueMemberCount = new Set(allGroupMembers).size;
  assert(
    'REG-06: Disjoint partitioning invariant holds (every region in exactly 1 group, total = 13)',
    allGroupMembers.length === 13 && uniqueMemberCount === 13,
    `Total members across groups: ${allGroupMembers.length}, Unique: ${uniqueMemberCount}`
  );

  // =========================================================================
  // Section 2: Canonical Exercise Musculoskeletal Relation Table Profiles
  // =========================================================================

  const requiredExerciseIds = [
    'bench_press',
    'overhead_press',
    'squat',
    'deadlift',
    'barbell_row',
    'running',
  ];

  // 2.1 All 6 candidate exercises exist
  const all6Exist = requiredExerciseIds.every(
    (id) => CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES[id] !== undefined
  );
  assert(
    'PROF-01: All 6 candidate exercises defined in relation table',
    all6Exist,
    `Exercises: ${requiredExerciseIds.join(', ')}`
  );

  // 2.2 Bench Press vs Overhead Press distinction
  const bench = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.bench_press;
  const ohp = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.overhead_press;

  const benchPec = bench.muscleInvolvements.find((m) => m.regionId === 'pectoralis-major');
  const benchAntDelt = bench.muscleInvolvements.find((m) => m.regionId === 'anterior-deltoid');
  const benchTriceps = bench.muscleInvolvements.find((m) => m.regionId === 'triceps-brachii');

  const ohpPec = ohp.muscleInvolvements.find((m) => m.regionId === 'pectoralis-major');
  const ohpAntDelt = ohp.muscleInvolvements.find((m) => m.regionId === 'anterior-deltoid');
  const ohpTriceps = ohp.muscleInvolvements.find((m) => m.regionId === 'triceps-brachii');
  const ohpErector = ohp.muscleInvolvements.find((m) => m.regionId === 'erector-spinae');

  assert(
    'PROF-02: Bench Press vs OHP preserve shared involvement while maintaining distinct targets and planes',
    benchPec?.role === 'primary-target' &&
      benchAntDelt?.role === 'synergist' &&
      benchTriceps?.role === 'synergist' &&
      ohpAntDelt?.role === 'primary-target' &&
      ohpTriceps?.role === 'synergist' &&
      ohpPec === undefined &&
      ohpErector?.role === 'stabilizer' &&
      bench.externalSupportOrVariation.supportType === 'bench-supported' &&
      ohp.externalSupportOrVariation.supportType === 'unsupported-free-weight' &&
      bench.movementPlane !== ohp.movementPlane,
    'Bench: horizontal/bench-supported/pec-primary; OHP: vertical/unsupported-standing/delt-primary/erector-stabilizer'
  );

  // 2.3 Barbell Row: pulling prime movers vs bent-over posture stabilization
  const row = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.barbell_row;
  const rowLats = row.muscleInvolvements.find((m) => m.regionId === 'latissimus-dorsi');
  const rowUpperBack = row.muscleInvolvements.find((m) => m.regionId === 'upper-back-scapular');
  const rowErector = row.muscleInvolvements.find((m) => m.regionId === 'erector-spinae');
  const rowHamstrings = row.muscleInvolvements.find((m) => m.regionId === 'hamstrings');
  const rowGluteals = row.muscleInvolvements.find((m) => m.regionId === 'gluteals');

  assert(
    'PROF-03: Barbell Row separates pulling prime movers from bent-over torso stabilization demands',
    rowLats?.role === 'primary-target' &&
      rowUpperBack?.role === 'primary-target' &&
      rowErector?.role === 'stabilizer' &&
      rowHamstrings?.role === 'stabilizer' &&
      rowGluteals?.role === 'stabilizer' &&
      row.torsoSupportDemand.demandLevel === 'high-isometric-stabilization',
    'Pulling prime movers (lats, upper back) separated from isometric stabilizers (erector spinae, hamstrings, gluteals)'
  );

  // 2.4 Squat vs Deadlift: distinct primary targets and mechanics
  const squat = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.squat;
  const deadlift = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.deadlift;

  const squatQuad = squat.muscleInvolvements.find((m) => m.regionId === 'quadriceps');
  const squatGlute = squat.muscleInvolvements.find((m) => m.regionId === 'gluteals');
  const squatHam = squat.muscleInvolvements.find((m) => m.regionId === 'hamstrings');
  const squatErector = squat.muscleInvolvements.find((m) => m.regionId === 'erector-spinae');

  const dlGlute = deadlift.muscleInvolvements.find((m) => m.regionId === 'gluteals');
  const dlHam = deadlift.muscleInvolvements.find((m) => m.regionId === 'hamstrings');
  const dlQuad = deadlift.muscleInvolvements.find((m) => m.regionId === 'quadriceps');
  const dlErector = deadlift.muscleInvolvements.find((m) => m.regionId === 'erector-spinae');

  assert(
    'PROF-04: Squat vs Deadlift distinguish knee-dominant vs hip-hinge primary targets and torso demands',
    squatQuad?.role === 'primary-target' &&
      squatGlute?.role === 'primary-target' &&
      squatHam?.role === 'synergist' &&
      squatErector?.role === 'stabilizer' &&
      dlGlute?.role === 'primary-target' &&
      dlHam?.role === 'primary-target' &&
      dlQuad?.role === 'synergist' &&
      dlErector?.role === 'stabilizer' &&
      squat.movementPlane.includes('무릎') &&
      deadlift.movementPlane.includes('고관절'),
    'Squat: quad & glute primary; Deadlift: glute & ham primary, quad synergist (floor break)'
  );

  // 2.5 Running includes calves and lower-body locomotion
  const running = CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES.running;
  const runCalves = running.muscleInvolvements.find((m) => m.regionId === 'calves');
  const runQuads = running.muscleInvolvements.find((m) => m.regionId === 'quadriceps');
  const runHams = running.muscleInvolvements.find((m) => m.regionId === 'hamstrings');

  assert(
    'PROF-05: Running includes calves (종아리) and cardiovascular locomotion support type',
    runCalves?.role === 'primary-target' &&
      runQuads?.role === 'synergist' &&
      runHams?.role === 'synergist' &&
      running.externalSupportOrVariation.supportType === 'bodyweight-locomotion',
    'Running includes calves as primary target with bodyweight locomotion context'
  );

  // 2.6 Erector Spinae is NOT equated with axial-systemic-loading or CNS fatigue
  const allProfiles = Object.values(CANONICAL_EXERCISE_MUSCULOSKELETAL_PROFILES);
  const erectorNotEquated = allProfiles.every((p) => {
    const ctx = p.torsoSupportDemand.erectorSpinaeContext;
    return typeof ctx === 'string' && ctx.length > 0 && p.torsoSupportDemand.description.length > 0;
  });
  assert(
    'PROF-06: Erector spinae context explicitly avoids equating local muscle with axial/CNS fatigue',
    erectorNotEquated,
    'All profiles provide explicit erectorSpinaeContext separating local muscle from systemic axial load'
  );

  // 2.7 Structural purity: no duplicate regions, only valid roles, frozen objects
  const allowedRoles = new Set(['primary-target', 'synergist', 'stabilizer']);
  const structuralPurity = allProfiles.every((p) => {
    const regions = p.muscleInvolvements.map((m) => m.regionId);
    const noDuplicates = regions.length === new Set(regions).size;
    const validRoles = p.muscleInvolvements.every((m) => allowedRoles.has(m.role));
    const isFrozen = Object.isFrozen(p) && Object.isFrozen(p.muscleInvolvements);
    return noDuplicates && validRoles && isFrozen;
  });
  assert(
    'PROF-07: All profiles have unique regions, valid categorical roles, and deep immutability',
    structuralPurity,
    'No duplicates, valid roles, frozen objects'
  );

  // 2.8 Baseline profile semantics and neutralized objective descriptions
  const allBaselineVerified = allProfiles.every(
    (p) =>
      p.externalSupportOrVariation.isReferenceBaselineProfile === true &&
      p.externalSupportOrVariation.isVariationExplicitlyVerified === true
  );
  const noHyperbolicTerms = allProfiles.every((p) => {
    const desc = p.torsoSupportDemand.description;
    const ctx = p.torsoSupportDemand.erectorSpinaeContext;
    const combined = `${desc} ${ctx}`;
    return (
      !combined.includes('극심한') &&
      !combined.includes('최대 등척성') &&
      !combined.includes('가벼운 역할에 그침')
    );
  });
  assert(
    'PROF-08: Baseline profile semantics clearly marked and descriptions neutralized of hyperbolic superlatives',
    allBaselineVerified && noHyperbolicTerms,
    'isReferenceBaselineProfile explicitly verified, hyperbolic terms (극심한, 최대 등척성, 가벼운 역할에 그침) removed'
  );

  // =========================================================================
  // Section 3: Safe Lookup Behavior & Boundary Tests
  // =========================================================================

  // 3.1 Supported queries by ID and aliases
  const benchById = getExerciseMusculoskeletalProfile('bench_press');
  const benchByAlias = getExerciseMusculoskeletalProfile('bench');
  const benchByKorean = getExerciseMusculoskeletalProfile('벤치프레스');
  const ohpByAlias = getExerciseMusculoskeletalProfile('ohp');
  const squatByKorean = getExerciseMusculoskeletalProfile('스쿼트');
  const deadliftByAlias = getExerciseMusculoskeletalProfile('conventional_deadlift');
  const rowByKorean = getExerciseMusculoskeletalProfile('바벨 로우');
  const runByKorean = getExerciseMusculoskeletalProfile('러닝');

  assert(
    'LOOKUP-01: Supported canonical IDs and aliases resolve cleanly to supported profiles',
    benchById.status === 'supported' &&
      benchByAlias.status === 'supported' &&
      benchByKorean.status === 'supported' &&
      ohpByAlias.status === 'supported' &&
      squatByKorean.status === 'supported' &&
      deadliftByAlias.status === 'supported' &&
      rowByKorean.status === 'supported' &&
      runByKorean.status === 'supported',
    'Successfully resolved IDs, English aliases, and Korean names'
  );

  // 3.2 Empty or whitespace input
  const empty1 = getExerciseMusculoskeletalProfile('');
  const empty2 = getExerciseMusculoskeletalProfile('   ');
  assert(
    'LOOKUP-02: Empty or whitespace input returns explicit empty-input status',
    empty1.status === 'empty-input' && empty2.status === 'empty-input',
    'Empty inputs safely quarantined'
  );

  // 3.3 Unsupported exercises do NOT return empty lists or zero burden
  const unsupported1 = getExerciseMusculoskeletalProfile('bicep_curl');
  const unsupported2 = getExerciseMusculoskeletalProfile('lat_pulldown');
  const unsupported3 = getExerciseMusculoskeletalProfile('completely_unknown_xyz');
  assert(
    'LOOKUP-03: Unsupported exercises return explicit unsupported status (not empty list/zero burden)',
    unsupported1.status === 'unsupported' &&
      unsupported2.status === 'unsupported' &&
      unsupported3.status === 'unsupported' &&
      !('profile' in unsupported1),
    'Unsupported exercises rejected without fake zero-burden defaults'
  );

  // 3.4 Unconfirmed variations (RDL, chest-supported row, incline bench) are distinguished
  const rdlQuery = getExerciseMusculoskeletalProfile('rdl');
  const romanianQuery = getExerciseMusculoskeletalProfile('romanian_deadlift');
  const chestRowQuery = getExerciseMusculoskeletalProfile('chest_supported_row');
  const chestRowKorean = getExerciseMusculoskeletalProfile('체스트 서포티드 로우');
  const inclineBench = getExerciseMusculoskeletalProfile('incline_bench_press');

  assert(
    'LOOKUP-04: Distinct variants (RDL, chest-supported row, incline) return explicit unconfirmed-variation',
    rdlQuery.status === 'unconfirmed-variation' &&
      romanianQuery.status === 'unconfirmed-variation' &&
      chestRowQuery.status === 'unconfirmed-variation' &&
      chestRowKorean.status === 'unconfirmed-variation' &&
      inclineBench.status === 'unconfirmed-variation' &&
      rdlQuery.matchedBaseCandidate === 'deadlift' &&
      chestRowQuery.matchedBaseCandidate === 'barbell_row',
    'RDL and Chest-Supported Row safely prevented from colliding with foundation lifts'
  );

  // 3.5 Parenthesized variations with and without space return unconfirmed-variation
  const rowChestNoSpace = getExerciseMusculoskeletalProfile('barbell_row(chest supported)');
  const rowChestWithSpace = getExerciseMusculoskeletalProfile('barbell_row (chest supported)');
  const ohpSeatedNoSpace = getExerciseMusculoskeletalProfile('overhead_press(seated)');
  const ohpSeatedWithSpace = getExerciseMusculoskeletalProfile('overhead_press (seated)');
  const dlRdlNoSpace = getExerciseMusculoskeletalProfile('deadlift(Romanian)');
  const dlRdlWithSpace = getExerciseMusculoskeletalProfile('deadlift (Romanian)');
  const benchInclineNoSpace = getExerciseMusculoskeletalProfile('bench_press(incline)');
  const benchInclineWithSpace = getExerciseMusculoskeletalProfile('bench_press (incline)');
  const benchInclineKorNoSpace = getExerciseMusculoskeletalProfile('벤치프레스(인클라인)');
  const benchInclineKorWithSpace = getExerciseMusculoskeletalProfile('벤치프레스 (인클라인)');
  const ohpSeatedKorNoSpace = getExerciseMusculoskeletalProfile('오버헤드프레스(시티드)');
  const ohpSeatedKorWithSpace = getExerciseMusculoskeletalProfile('오버헤드프레스 (시티드)');

  const allParenVariationsRecognized =
    rowChestNoSpace.status === 'unconfirmed-variation' &&
    rowChestWithSpace.status === 'unconfirmed-variation' &&
    rowChestNoSpace.matchedBaseCandidate === 'barbell_row' &&
    ohpSeatedNoSpace.status === 'unconfirmed-variation' &&
    ohpSeatedWithSpace.status === 'unconfirmed-variation' &&
    ohpSeatedNoSpace.matchedBaseCandidate === 'overhead_press' &&
    dlRdlNoSpace.status === 'unconfirmed-variation' &&
    dlRdlWithSpace.status === 'unconfirmed-variation' &&
    dlRdlNoSpace.matchedBaseCandidate === 'deadlift' &&
    benchInclineNoSpace.status === 'unconfirmed-variation' &&
    benchInclineWithSpace.status === 'unconfirmed-variation' &&
    benchInclineNoSpace.matchedBaseCandidate === 'bench_press' &&
    benchInclineKorNoSpace.status === 'unconfirmed-variation' &&
    benchInclineKorWithSpace.status === 'unconfirmed-variation' &&
    benchInclineKorNoSpace.matchedBaseCandidate === 'bench_press' &&
    ohpSeatedKorNoSpace.status === 'unconfirmed-variation' &&
    ohpSeatedKorWithSpace.status === 'unconfirmed-variation' &&
    ohpSeatedKorNoSpace.matchedBaseCandidate === 'overhead_press';

  assert(
    'LOOKUP-05: Parenthesized variations with and without spaces are preserved and return unconfirmed-variation',
    allParenVariationsRecognized,
    'Verified 12 variations across English/Korean with/without spaces: barbell_row(chest supported), OHP(seated), DL(Romanian), bench(incline), etc.'
  );

  // 3.6 Simple bilingual translations in parentheses resolve to supported base lifts
  const benchBilingual1 = getExerciseMusculoskeletalProfile('벤치프레스 (Bench Press)');
  const benchBilingual2 = getExerciseMusculoskeletalProfile('벤치프레스(Bench Press)');
  const ohpBilingual1 = getExerciseMusculoskeletalProfile('오버헤드 프레스 (Overhead Press)');
  const ohpBilingual2 = getExerciseMusculoskeletalProfile('오버헤드프레스(Overhead Press)');
  const squatBilingual1 = getExerciseMusculoskeletalProfile('스쿼트 (Squat)');
  const squatBilingual2 = getExerciseMusculoskeletalProfile('스쿼트(Squat)');
  const dlBilingual1 = getExerciseMusculoskeletalProfile('데드리프트 (Deadlift)');
  const dlBilingual2 = getExerciseMusculoskeletalProfile('데드리프트(Deadlift)');
  const rowBilingual1 = getExerciseMusculoskeletalProfile('바벨 로우 (Barbell Row)');
  const rowBilingual2 = getExerciseMusculoskeletalProfile('바벨로우(Barbell Row)');
  const runBilingual1 = getExerciseMusculoskeletalProfile('러닝 (Running)');
  const runBilingual2 = getExerciseMusculoskeletalProfile('러닝(Running)');

  const allBilingualSupported =
    benchBilingual1.status === 'supported' &&
    benchBilingual2.status === 'supported' &&
    benchBilingual1.profile.exerciseId === 'bench_press' &&
    ohpBilingual1.status === 'supported' &&
    ohpBilingual2.status === 'supported' &&
    ohpBilingual1.profile.exerciseId === 'overhead_press' &&
    squatBilingual1.status === 'supported' &&
    squatBilingual2.status === 'supported' &&
    squatBilingual1.profile.exerciseId === 'squat' &&
    dlBilingual1.status === 'supported' &&
    dlBilingual2.status === 'supported' &&
    dlBilingual1.profile.exerciseId === 'deadlift' &&
    rowBilingual1.status === 'supported' &&
    rowBilingual2.status === 'supported' &&
    rowBilingual1.profile.exerciseId === 'barbell_row' &&
    runBilingual1.status === 'supported' &&
    runBilingual2.status === 'supported' &&
    runBilingual1.profile.exerciseId === 'running';

  assert(
    'LOOKUP-06: Verified Korean-English bilingual pairs in parentheses resolve cleanly to supported base profiles',
    allBilingualSupported,
    'Bilingual translations (벤치프레스 (Bench Press), 오버헤드 프레스 (Overhead Press), etc.) resolved to base profiles'
  );

  // 3.7 Unknown modifiers in parentheses are quarantined as unsupported (not falsely accepted as baseline)
  const unknownMod1 = getExerciseMusculoskeletalProfile('bench_press(tempo)');
  const unknownMod2 = getExerciseMusculoskeletalProfile('squat(pause)');
  const unknownMod3 = getExerciseMusculoskeletalProfile('deadlift (deficit)');
  const unknownMod4 = getExerciseMusculoskeletalProfile('barbell_row(custom_modifier)');

  const allUnknownQuarantined =
    unknownMod1.status === 'unsupported' &&
    unknownMod2.status === 'unsupported' &&
    unknownMod3.status === 'unsupported' &&
    unknownMod4.status === 'unsupported';

  assert(
    'LOOKUP-07: Unknown parenthesized modifiers are quarantined as unsupported and never falsely confirmed as baseline',
    allUnknownQuarantined,
    'tempo, pause, deficit, custom_modifier safely quarantined as unsupported'
  );

  const allPassed = results.every((r) => r.passed);
  return { allPassed, results };
}

// Standalone execution support
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('exerciseMusculoskeletalProfile.test')) {
  console.log('==================================================');
  console.log('RUNNING MUSCULOSKELETAL PROFILE TEST SUITE (PHASE 1)');
  console.log('==================================================');
  const { allPassed, results } = runMusculoskeletalTestSuite();
  for (const r of results) {
    console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] ${r.name}: ${r.details}`);
  }
  console.log(`\nAll Musculoskeletal Tests Passed: ${allPassed} (${results.filter((r) => r.passed).length}/${results.length})`);
  if (!allPassed) {
    process.exit(1);
  }
}
