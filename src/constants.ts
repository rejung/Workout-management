/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise, Routine, WorkoutLog } from './types';

// Application Snapshot Constants (Requirement 14 & Final Stabilization)
export const APP_NAME = "Workout Management System";
export const SNAPSHOT_APP_NAME = APP_NAME;
export const SNAPSHOT_TYPE = "application";
export const CURRENT_SCHEMA_VERSION = 1;
export const SCHEMA_VERSION = CURRENT_SCHEMA_VERSION;
export const CURRENT_SNAPSHOT_VERSION = "2.1";
export const SNAPSHOT_VERSION = CURRENT_SNAPSHOT_VERSION;
export const EXPORT_FILENAME_PREFIX = "WMS_Backup";

export const DEFAULT_EXERCISES: Exercise[] = [
  // Chest
  { id: 'bench-press', name: '벤치프레스 (Bench Press)', category: 'Chest', logType: 'STANDARD', canonicalName: '벤치프레스' },
  { id: 'incline-dumbbell-press', name: '인클라인 덤벨 프레스 (Incline Dumbbell Press)', category: 'Chest', logType: 'STANDARD' },
  { id: 'chest-fly', name: '펙덱 플라이 (Chest Fly)', category: 'Chest', logType: 'STANDARD' },
  { id: 'dips', name: '딥스 (Dips)', category: 'Chest', logType: 'BODYWEIGHT_REPS' },
  { id: 'band-dips', name: '밴드 딥스 (Band Dips)', category: 'Chest', logType: 'BODYWEIGHT_REPS' },
  
  // Back
  { id: 'deadlift', name: '데드리프트 (Deadlift)', category: 'Back', logType: 'STANDARD', canonicalName: '데드리프트' },
  { id: 'pull-up', name: '풀업 (Pull-Up)', category: 'Back', logType: 'BODYWEIGHT_REPS' },
  { id: 'band-pull-up', name: '밴드 풀업 (Band Pull-Up)', category: 'Back', logType: 'BODYWEIGHT_REPS' },
  { id: 'barbell-row', name: '바벨 로우 (Barbell Row)', category: 'Back', logType: 'STANDARD', canonicalName: '바벨 로우' },
  { id: 'lat-pulldown', name: '랫 풀 다운 (Lat Pulldown)', category: 'Back', logType: 'STANDARD' },
  { id: 'seated-row', name: '시티드 케이블 로우 (Seated Cable Row)', category: 'Back', logType: 'STANDARD', canonicalName: '시티드 케이블 로우' },
  
  // Legs
  { id: 'squat', name: '스쿼트 (Squat)', category: 'Legs', logType: 'STANDARD', canonicalName: '스쿼트' },
  { id: 'leg-press', name: '레그프레스 (Leg Press)', category: 'Legs', logType: 'STANDARD' },
  { id: 'leg-extension', name: '레그 익스텐션 (Leg Extension)', category: 'Legs', logType: 'STANDARD' },
  { id: 'leg-curl', name: '레그 컬 (Leg Curl)', category: 'Legs', logType: 'STANDARD' },
  { id: 'romanian-deadlift', name: '로마니안 데드리프트 (Romanian Deadlift)', category: 'Legs', logType: 'STANDARD' },
  
  // Shoulders
  { id: 'overhead-press', name: '오버헤드 프레스 (Overhead Press)', category: 'Shoulders', logType: 'STANDARD', canonicalName: 'OHP' },
  { id: 'dumbbell-shoulder-press', name: '덤벨 숄더 프레스 (Dumbbell Shoulder Press)', category: 'Shoulders', logType: 'STANDARD' },
  { id: 'dumbbell-shrug', name: '덤벨 슈러그 (Dumbbell Shrug)', category: 'Shoulders', logType: 'STANDARD' },
  { id: 'lateral-raise', name: '사이드 레터럴 레이즈 (Side Lateral Raise)', category: 'Shoulders', logType: 'STANDARD' },
  { id: 'face-pull', name: '페이스 풀 (Face Pull)', category: 'Shoulders', logType: 'STANDARD' },
  
  // Arms
  { id: 'biceps-curl', name: '바벨 컬 (Biceps Curl)', category: 'Arms', logType: 'STANDARD' },
  { id: 'dumbbell-hammer-curl', name: '해머 컬 (Hammer Curl)', category: 'Arms', logType: 'STANDARD' },
  { id: 'triceps-pushdown', name: '트라이셉스 푸쉬다운 (Triceps Pushdown)', category: 'Arms', logType: 'STANDARD' },
  { id: 'overhead-triceps-extension', name: '오버헤드 트라이셉스 익스텐션 (Overhead Triceps Ext)', category: 'Arms', logType: 'STANDARD' },
  
  // Core
  { id: 'plank', name: '플랭크 (Plank)', category: 'Core', logType: 'TIME_BASED' },
  { id: 'hanging-leg-raise', name: '행잉 레그 레이즈 (Hanging Leg Raise)', category: 'Core', logType: 'BODYWEIGHT_REPS' },
  { id: 'crunch', name: '크런치 (Crunch)', category: 'Core', logType: 'BODYWEIGHT_REPS' },

  // Cardio
  { id: 'treadmill', name: '트레드밀 (Treadmill)', category: 'Cardio', logType: 'CARDIO' },
  { id: 'stationary-bike', name: '실내 자전거 (Stationary Bike)', category: 'Cardio', logType: 'CARDIO' },

  // Custom additions for user routines from image
  { id: 'band-pull-up-simple', name: '밴드 풀업', category: 'Back', logType: 'BODYWEIGHT_REPS' },
  { id: 'face-pull-rule', name: '페이스 룰 (Face Pull)', category: 'Shoulders', logType: 'STANDARD' },
  { id: 'overhead-extension', name: '오버헤드 익스텐션', category: 'Arms', logType: 'STANDARD' },
  { id: 'cable-fly', name: '케이블 플라이', category: 'Chest', logType: 'STANDARD' },
  { id: 'calf-raise-simple', name: '카프 레이즈', category: 'Legs', logType: 'STANDARD' },
];

export const DEFAULT_ROUTINES: Routine[] = [
  {
    id: 'routine-barbell-row',
    name: '바벨 로우',
    description: '',
    exercises: [
      { exerciseId: 'barbell-row', exerciseName: '바벨 로우 (Barbell Row)', category: 'Back', targetSetsCount: 7 },
      { exerciseId: 'seated-row', exerciseName: '시티드 케이블 로우 (Seated Cable Row)', category: 'Back', targetSetsCount: 4 },
      { exerciseId: 'band-pull-up-simple', exerciseName: '밴드 풀업', category: 'Back', targetSetsCount: 4 },
      { exerciseId: 'face-pull', exerciseName: '페이스 풀 (Face Pull)', category: 'Shoulders', targetSetsCount: 4 }
    ]
  },
  {
    id: 'routine-ohp',
    name: 'OHP',
    description: '',
    exercises: [
      { exerciseId: 'overhead-press', exerciseName: '오버헤드 프레스 (Overhead Press)', category: 'Shoulders', targetSetsCount: 8 },
      { exerciseId: 'face-pull-rule', exerciseName: '페이스 룰 (Face Pull)', category: 'Shoulders', targetSetsCount: 4 },
      { exerciseId: 'plank', exerciseName: '플랭크 (Plank)', category: 'Core', targetSetsCount: 2 },
      { exerciseId: 'lateral-raise', exerciseName: '사이드 레터럴 레이즈 (Side Lateral Raise)', category: 'Shoulders', targetSetsCount: 4 }
    ]
  },
  {
    id: 'routine-bench-press',
    name: '벤치프레스',
    description: '',
    exercises: [
      { exerciseId: 'bench-press', exerciseName: '벤치프레스 (Bench Press)', category: 'Chest', targetSetsCount: 8 },
      { exerciseId: 'dips', exerciseName: '딥스 (Dips)', category: 'Chest', targetSetsCount: 4 },
      { exerciseId: 'overhead-extension', exerciseName: '오버헤드 익스텐션', category: 'Arms', targetSetsCount: 4 },
      { exerciseId: 'cable-fly', exerciseName: '케이블 플라이', category: 'Chest', targetSetsCount: 4 }
    ]
  },
  {
    id: 'routine-deadlift',
    name: '데드리프트',
    description: '',
    exercises: [
      { exerciseId: 'deadlift', exerciseName: '데드리프트 (Deadlift)', category: 'Back', targetSetsCount: 8 },
      { exerciseId: 'plank', exerciseName: '플랭크 (Plank)', category: 'Core', targetSetsCount: 2 },
      { exerciseId: 'band-pull-up-simple', exerciseName: '밴드 풀업', category: 'Back', targetSetsCount: 4 }
    ]
  },
  {
    id: 'routine-squat',
    name: '스쿼트',
    description: '',
    exercises: [
      { exerciseId: 'squat', exerciseName: '스쿼트 (Squat)', category: 'Legs', targetSetsCount: 8 },
      { exerciseId: 'calf-raise-simple', exerciseName: '카프 레이즈', category: 'Legs', targetSetsCount: 4 },
      { exerciseId: 'plank', exerciseName: '플랭크 (Plank)', category: 'Core', targetSetsCount: 2 }
    ]
  }
];


