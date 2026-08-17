/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StressDimension,
  StressDimensionMetadata,
  StressDimensionRelationship,
  StressDimensionRelationshipType,
  ExerciseStressProfile
} from '../types/stressModel.types';

/**
 * The frozen, canonical list of all supported Stress Dimensions.
 * 
 * Minimal sufficient dimensionality:
 * 1. knee-dominant-lower-body (Squat, Quad-dominant movements, Running locomotion)
 * 2. hip-posterior-chain (Deadlift, Hinge movements, Glute/Hamstring/Posterior loading)
 * 3. horizontal-push (Bench Press, Chest Press, Push-ups)
 * 4. vertical-push (Overhead Press, Arnold Press, Pike/Handstand)
 * 5. horizontal-pull (Barbell Row, Cable Row, Face Pull)
 * 6. vertical-pull (Lat Pulldown, Pull-up, Chin-up)
 * 7. axial-systemic-loading (Weighted compressive spinal loading and whole-body core bracing context)
 */
export const CANONICAL_STRESS_DIMENSIONS: readonly StressDimension[] = Object.freeze([
  'knee-dominant-lower-body',
  'hip-posterior-chain',
  'horizontal-push',
  'vertical-push',
  'horizontal-pull',
  'vertical-pull',
  'axial-systemic-loading'
]);

/**
 * Type guard verifying whether an unknown string is a recognized StressDimension.
 */
export function isStressDimension(value: unknown): value is StressDimension {
  return (
    typeof value === 'string' &&
    CANONICAL_STRESS_DIMENSIONS.includes(value as StressDimension)
  );
}

/**
 * Detailed descriptive metadata for each canonical stress dimension.
 */
export const STRESS_DIMENSION_METADATA_REGISTRY: Readonly<
  Record<StressDimension, StressDimensionMetadata>
> = Object.freeze({
  'knee-dominant-lower-body': Object.freeze({
    dimension: 'knee-dominant-lower-body',
    displayName: 'Knee-Dominant Lower Body',
    description: 'Quadriceps and anterior lower-body compound locomotion and squatting loading context.',
    functionalContext: 'Knee extension mechanics, patellar tendon loading, and quad motor recruitment.'
  }),
  'hip-posterior-chain': Object.freeze({
    dimension: 'hip-posterior-chain',
    displayName: 'Hip / Posterior Chain',
    description: 'Gluteal, hamstring, and erector spinae hip hinge and posterior pelvic stabilization context.',
    functionalContext: 'Hip extension mechanics, hamstring/glute recruitment, and posterior kinetic chain loading.'
  }),
  'horizontal-push': Object.freeze({
    dimension: 'horizontal-push',
    displayName: 'Horizontal Push',
    description: 'Pectoralis, anterior deltoid, and triceps horizontal pressing mechanics.',
    functionalContext: 'Transverse flexion and elbow extension in anterior horizontal plane.'
  }),
  'vertical-push': Object.freeze({
    dimension: 'vertical-push',
    displayName: 'Vertical Push',
    description: 'Deltoids, upper pectoralis, triceps, and upward scapular rotator overhead mechanics.',
    functionalContext: 'Sagittal/frontal plane upward pressing, acromial clearance, and overhead lockout.'
  }),
  'horizontal-pull': Object.freeze({
    dimension: 'horizontal-pull',
    displayName: 'Horizontal Pull',
    description: 'Rhomboids, middle/lower trapezius, rear deltoids, and latissimus rowing mechanics.',
    functionalContext: 'Scapular retraction, glenohumeral extension/abduction in horizontal plane.'
  }),
  'vertical-pull': Object.freeze({
    dimension: 'vertical-pull',
    displayName: 'Vertical Pull',
    description: 'Latissimus dorsi, teres major, lower trapezius, and elbow flexor downward pulling.',
    functionalContext: 'Scapular depression/downward rotation and shoulder adduction/extension from overhead.'
  }),
  'axial-systemic-loading': Object.freeze({
    dimension: 'axial-systemic-loading',
    displayName: 'Axial / Systemic Loading Context',
    description: 'Weighted spinal axial loading, intra-abdominal bracing demand, and systemic structural context from heavy compound lifts.',
    functionalContext: 'Spinal column axial load and upright compound core stabilization context (without asserting clinical CNS diagnosis).'
  })
});

/**
 * Cross-dimension pairwise relationship matrix.
 * Establishes kinesiological and structural overlap between dimensions
 * without collapsing them into monolithic macro-categories.
 */
export const STRESS_DIMENSION_RELATIONSHIPS: readonly StressDimensionRelationship[] = Object.freeze([
  // Push relationships
  {
    sourceDimension: 'horizontal-push',
    targetDimension: 'vertical-push',
    relationship: 'partial-overlap',
    rationale: 'Shares anterior deltoid, clavicular pec, and triceps involvement while maintaining distinct movement planes.'
  },
  // Pull relationships
  {
    sourceDimension: 'horizontal-pull',
    targetDimension: 'vertical-pull',
    relationship: 'partial-overlap',
    rationale: 'Shares latissimus dorsi, elbow flexors, and scapular stabilizers while maintaining distinct pulling planes.'
  },
  // Lower body relationships
  {
    sourceDimension: 'knee-dominant-lower-body',
    targetDimension: 'hip-posterior-chain',
    relationship: 'partial-overlap',
    rationale: 'Compound lower-body movements recruit both knee and hip musculature with varying joint dominance.'
  },
  // Axial compound relationships
  {
    sourceDimension: 'axial-systemic-loading',
    targetDimension: 'hip-posterior-chain',
    relationship: 'partial-overlap',
    rationale: 'Heavy axial loads frequently coincide with hip hinge and posterior chain bracing (Deadlift/RDL/Squat).'
  },
  {
    sourceDimension: 'axial-systemic-loading',
    targetDimension: 'knee-dominant-lower-body',
    relationship: 'partial-overlap',
    rationale: 'Heavy axial loads frequently coincide with back squatting and knee extension bracing.'
  },
  {
    sourceDimension: 'axial-systemic-loading',
    targetDimension: 'vertical-push',
    relationship: 'partial-overlap',
    rationale: 'Standing overhead pressing creates spinal axial load and upright whole-body core stabilization.'
  },
  // Distinct relations (Push vs Pull, Upper vs Lower without axial bridge)
  {
    sourceDimension: 'horizontal-push',
    targetDimension: 'horizontal-pull',
    relationship: 'distinct',
    rationale: 'Antagonistic movement patterns in horizontal plane.'
  },
  {
    sourceDimension: 'vertical-push',
    targetDimension: 'vertical-pull',
    relationship: 'distinct',
    rationale: 'Antagonistic movement patterns in vertical plane.'
  },
  {
    sourceDimension: 'horizontal-push',
    targetDimension: 'knee-dominant-lower-body',
    relationship: 'distinct',
    rationale: 'Upper body anterior press is structurally distinct from lower body knee extension.'
  },
  {
    sourceDimension: 'horizontal-pull',
    targetDimension: 'knee-dominant-lower-body',
    relationship: 'distinct',
    rationale: 'Upper body row is structurally distinct from lower body knee extension.'
  }
]);

/**
 * Resolves the pairwise relationship between two stress dimensions.
 */
export function getDimensionRelationship(
  source: StressDimension,
  target: StressDimension
): StressDimensionRelationshipType {
  if (source === target) {
    return 'same-dimension';
  }

  const match = STRESS_DIMENSION_RELATIONSHIPS.find(
    (rel) =>
      (rel.sourceDimension === source && rel.targetDimension === target) ||
      (rel.sourceDimension === target && rel.targetDimension === source)
  );

  return match ? match.relationship : 'distinct';
}

/**
 * Creates a fully validated, magnitude-free, immutable ExerciseStressProfile.
 */
function defineProfile(
  exerciseId: string,
  exerciseName: string,
  dimensions: readonly StressDimension[],
  domainNotes?: string
): ExerciseStressProfile {
  return Object.freeze({
    exerciseId,
    exerciseName,
    mappingStatus: 'mapped',
    dimensions: Object.freeze([...dimensions]),
    domainNotes
  });
}

/**
 * Factory for creating an explicit unmapped profile for unknown or unclassified exercises.
 * 
 * Strict Invariant:
 * Unmapped exercises are NEVER silently assigned to a default category (e.g. Legs or Push).
 * They remain explicitly unmapped with an empty dimension list until categorized.
 */
export function createUnmappedExerciseStressProfile(
  exerciseId: string,
  exerciseName: string
): ExerciseStressProfile {
  return Object.freeze({
    exerciseId,
    exerciseName,
    mappingStatus: 'unmapped',
    dimensions: Object.freeze([]),
    domainNotes: 'Unmapped exercise. Requires explicit domain profile classification before stress contribution can be inferred.'
  });
}

/**
 * Canonical Exercise Stress Profiles for standard foundation movements.
 * 
 * Strict Invariants:
 * - Expresses dimension membership ONLY (no primary/secondary, no numeric weights).
 * - Squat: knee-dominant-lower-body, hip-posterior-chain, axial-systemic-loading.
 * - Deadlift: hip-posterior-chain, axial-systemic-loading. Strictly NO horizontal-pull.
 * - Bench Press: horizontal-push. Strictly NO vertical-push.
 * - Overhead Press: vertical-push, axial-systemic-loading. Strictly NO horizontal-push.
 * - Barbell Row: horizontal-pull. Distinct from Deadlift and Vertical Pull.
 * - Running: knee-dominant-lower-body, hip-posterior-chain. NO strength performance identity.
 */
export const CANONICAL_EXERCISE_STRESS_PROFILES: Readonly<
  Record<string, ExerciseStressProfile>
> = Object.freeze({
  // Squat
  squat: defineProfile(
    'squat',
    'Squat',
    [
      'knee-dominant-lower-body',
      'hip-posterior-chain',
      'axial-systemic-loading'
    ],
    'Compound lower-body squat pattern with knee-dominant, hip/posterior, and axial loading dimensions. Relative magnitudes are not decided in CU3.1.'
  ),

  // Deadlift
  deadlift: defineProfile(
    'deadlift',
    'Deadlift',
    [
      'hip-posterior-chain',
      'axial-systemic-loading'
    ],
    'Hip hinge and posterior chain movement with weighted axial loading context. Strictly contains no horizontal-pull dimension. Relative magnitudes are not decided in CU3.1.'
  ),

  // Bench Press
  bench_press: defineProfile(
    'bench_press',
    'Bench Press',
    [
      'horizontal-push'
    ],
    'Upper-body horizontal pressing movement. Distinct from Vertical Push.'
  ),

  // Overhead Press
  overhead_press: defineProfile(
    'overhead_press',
    'Overhead Press',
    [
      'vertical-push',
      'axial-systemic-loading'
    ],
    'Upper-body vertical pressing movement with standing axial loading context. Distinct from Horizontal Push. Relative magnitudes are not decided in CU3.1.'
  ),

  // Barbell Row
  barbell_row: defineProfile(
    'barbell_row',
    'Barbell Row',
    [
      'horizontal-pull'
    ],
    'Upper-body horizontal pulling movement. Distinct from Deadlift and Vertical Pull. Additional torso bracing or posterior loading is not decided in CU3.1.'
  ),

  // Running
  running: defineProfile(
    'running',
    'Running',
    [
      'knee-dominant-lower-body',
      'hip-posterior-chain'
    ],
    'Cardiovascular locomotion contributing to lower-body stress dimensions without constituting a Strength Performance Observation. Relative contribution between knee and hip dimensions is not decided in CU3.1.'
  ),

  // Lat Pulldown (Accessory / Vertical Pull)
  lat_pulldown: defineProfile(
    'lat_pulldown',
    'Lat Pulldown',
    [
      'vertical-pull'
    ],
    'Vertical pull accessory movement.'
  ),

  // Pull-up (Vertical Pull)
  pull_up: defineProfile(
    'pull_up',
    'Pull-up',
    [
      'vertical-pull'
    ],
    'Vertical pull bodyweight/weighted compound movement.'
  ),

  // Face Pull (Horizontal Pull Accessory)
  face_pull: defineProfile(
    'face_pull',
    'Face Pull',
    [
      'horizontal-pull'
    ],
    'Horizontal pull rear deltoid and scapular accessory.'
  ),

  // Romanian Deadlift (Hip / Posterior Chain)
  romanian_deadlift: defineProfile(
    'romanian_deadlift',
    'Romanian Deadlift',
    [
      'hip-posterior-chain',
      'axial-systemic-loading'
    ],
    'Targeted posterior chain hinge variation with weighted axial loading context.'
  ),

  // Leg Press (Knee-dominant lower body)
  leg_press: defineProfile(
    'leg_press',
    'Leg Press',
    [
      'knee-dominant-lower-body'
    ],
    'Knee-dominant lower-body movement without axial spinal loading.'
  )
});

/**
 * Normalizes an exercise name or ID to match canonical registry keys.
 */
function normalizeLookupKey(key: string): string {
  return key
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/**
 * Retrieves the ExerciseStressProfile for a given exercise ID or name.
 * 
 * If the exercise is recognized, returns its canonical profile.
 * If unknown, returns an explicit `unmapped` profile (never a false default guess).
 */
export function getCanonicalExerciseStressProfile(
  exerciseIdOrName: string
): ExerciseStressProfile {
  if (!exerciseIdOrName || !exerciseIdOrName.trim()) {
    return createUnmappedExerciseStressProfile('unknown', 'Unknown Exercise');
  }

  const normalized = normalizeLookupKey(exerciseIdOrName);

  // Direct key lookup
  if (CANONICAL_EXERCISE_STRESS_PROFILES[normalized]) {
    return CANONICAL_EXERCISE_STRESS_PROFILES[normalized];
  }

  // Alias lookup patterns
  if (normalized === 'ohp' || normalized === 'standing_overhead_press') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.overhead_press;
  }
  if (normalized === 'bench' || normalized === 'flat_bench_press') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.bench_press;
  }
  if (normalized === 'row' || normalized === 'barbell_row' || normalized === 'bent_over_row') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.barbell_row;
  }
  if (normalized === 'back_squat' || normalized === 'barbell_squat') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.squat;
  }
  if (normalized === 'conventional_deadlift' || normalized === 'barbell_deadlift') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.deadlift;
  }
  if (normalized === 'run' || normalized === 'jogging' || normalized === 'outdoor_run') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.running;
  }
  if (normalized === 'rdl') {
    return CANONICAL_EXERCISE_STRESS_PROFILES.romanian_deadlift;
  }

  // Fallback to explicit unmapped profile
  return createUnmappedExerciseStressProfile(exerciseIdOrName, exerciseIdOrName);
}

/**
 * Audit result verifying a single Golden Relation invariant.
 */
export interface GoldenRelationAuditResult {
  readonly relationName: string;
  readonly satisfied: boolean;
  readonly details: string;
}

/**
 * Verifies that the Stress Model Vocabulary satisfies all Golden Relations
 * and architectural invariants at the structural and semantic level.
 * 
 * Strict Invariants audited:
 * 1. Deadlift ↔ Squat: Share posterior/axial dimensions, but Squat includes knee-dominant
 *    while Deadlift does not. Profiles are distinct.
 * 2. Running ↔ Squat: Running contributes to lower-body dimensions (knee-dominant, hip-posterior)
 *    without possessing strength set mechanics or axial loading.
 * 3. Running ↔ Deadlift: Running contributes to lower-body posterior context, but is distinct
 *    from heavy hinge axial pull.
 * 4. OHP ↔ Bench: Both involve upper-body pressing musculature, but vertical-push is distinct
 *    from horizontal-push.
 * 5. Deadlift ≠ Horizontal Pull: Deadlift has NO horizontal-pull dimension.
 * 6. Row ≠ Deadlift: Row is horizontal-pull; Deadlift is hip-posterior + axial.
 * 7. Horizontal Push ≠ Vertical Push: Horizontal-push and vertical-push are distinct dimensions.
 * 8. Unknown Exercise: Generates explicit unmapped profile with 0 dimensions.
 */
export function auditGoldenRelations(): readonly GoldenRelationAuditResult[] {
  const squat = CANONICAL_EXERCISE_STRESS_PROFILES.squat;
  const deadlift = CANONICAL_EXERCISE_STRESS_PROFILES.deadlift;
  const bench = CANONICAL_EXERCISE_STRESS_PROFILES.bench_press;
  const ohp = CANONICAL_EXERCISE_STRESS_PROFILES.overhead_press;
  const row = CANONICAL_EXERCISE_STRESS_PROFILES.barbell_row;
  const running = CANONICAL_EXERCISE_STRESS_PROFILES.running;
  const unknown = getCanonicalExerciseStressProfile('Unlisted_Mystery_Movement');

  const results: GoldenRelationAuditResult[] = [
    {
      relationName: 'Deadlift ↔ Squat (Shared lower-body/axial with distinct joint-dominance profile)',
      satisfied:
        squat.dimensions.includes('knee-dominant-lower-body') &&
        !deadlift.dimensions.includes('knee-dominant-lower-body') &&
        squat.dimensions.includes('hip-posterior-chain') &&
        deadlift.dimensions.includes('hip-posterior-chain') &&
        squat.dimensions.includes('axial-systemic-loading') &&
        deadlift.dimensions.includes('axial-systemic-loading'),
      details: 'Squat and Deadlift share hip-posterior and axial dimensions, while Squat is uniquely knee-dominant.'
    },
    {
      relationName: 'Running ↔ Squat (Running provides lower-body stress contribution without strength identity)',
      satisfied:
        running.dimensions.includes('knee-dominant-lower-body') &&
        running.dimensions.includes('hip-posterior-chain') &&
        !running.dimensions.includes('axial-systemic-loading'),
      details: 'Running contributes to knee-dominant and hip-posterior stress without spinal axial loading.'
    },
    {
      relationName: 'Running ↔ Deadlift (Running contributes to posterior chain locomotion without being Deadlift)',
      satisfied:
        running.dimensions.includes('hip-posterior-chain') &&
        !running.dimensions.includes('axial-systemic-loading') &&
        deadlift.dimensions.includes('axial-systemic-loading'),
      details: 'Running shares hip-posterior context with Deadlift but lacks axial loading and has distinct locomotion profile.'
    },
    {
      relationName: 'OHP ↔ Bench (Upper pressing distinct dimensions)',
      satisfied:
        bench.dimensions.includes('horizontal-push') &&
        !bench.dimensions.includes('vertical-push') &&
        ohp.dimensions.includes('vertical-push') &&
        !ohp.dimensions.includes('horizontal-push'),
      details: 'Bench is horizontal-push only; OHP is vertical-push with standing axial context.'
    },
    {
      relationName: 'Deadlift ≠ Horizontal Pull (Deadlift does not satisfy or replace Horizontal Pull)',
      satisfied:
        !deadlift.dimensions.includes('horizontal-pull') &&
        !deadlift.dimensions.includes('vertical-pull'),
      details: 'Deadlift contains zero horizontal-pull or vertical-pull dimensions. It cannot replace rowing.'
    },
    {
      relationName: 'Row ≠ Deadlift (Row contributes to Horizontal Pull, not Deadlift hinge)',
      satisfied:
        row.dimensions.includes('horizontal-pull') &&
        !row.dimensions.includes('axial-systemic-loading') &&
        !row.dimensions.includes('hip-posterior-chain'),
      details: 'Barbell Row is horizontal-pull. It does not replace Deadlift hinge and has distinct profile.'
    },
    {
      relationName: 'Horizontal Push ≠ Vertical Push (Dimensions are strictly distinct)',
      satisfied:
        getDimensionRelationship('horizontal-push', 'vertical-push') === 'partial-overlap' &&
        !bench.dimensions.includes('vertical-push') &&
        !ohp.dimensions.includes('horizontal-push'),
      details: 'Horizontal Push and Vertical Push are separate dimensions with a partial-overlap kinesiological relationship.'
    },
    {
      relationName: 'Unknown Exercise Handling (Explicit unmapped fallback, never silent default)',
      satisfied:
        unknown.mappingStatus === 'unmapped' &&
        unknown.dimensions.length === 0,
      details: 'Unrecognized exercise produces an unmapped profile with empty dimensions, avoiding false categorization.'
    }
  ];

  return Object.freeze(results);
}
