/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { WorkoutLog, Exercise } from '../types';
import { getLocalDateString, getFriendlyRecommendationDate } from './dateUtils';
import { getLast28DaysRange } from './dateRange';
import { getNextRecommendation as getNextRecFromEngine } from './recommendationEngine';
import { calculateMileage, calculateRunningPB, isRunningExercise } from '../domain/cardio';

export interface WeightLog {
  id: string;
  date: string;
  weight: number;
}

// 1. e1RM (Epley formula: 1RM = weight * (1 + reps / 30))
export function calculateSetE1RM(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return weight * (1 + reps / 30);
}

let uuidCounter = 0;

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(4);
    crypto.getRandomValues(buf);
    let str = '';
    for (let i = 0; i < buf.length; i++) {
      str += buf[i].toString(16).padStart(8, '0');
    }
    return `${str.substring(0, 8)}-${str.substring(8, 12)}-4${str.substring(13, 16)}-8${str.substring(17, 20)}-${str.substring(20, 32)}`;
  }
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 1000000);
  const staticCounter = ++uuidCounter;
  return `uuid-${ts}-${staticCounter}-${rand}`;
}

export interface MatcherDiagnostic {
  exerciseId: string;
  exerciseName: string;
  normalizedId: string;
  normalizedName: string;
  matcherName: string;
  includeRules: { rule: string; matched: boolean }[];
  excludeRules: { keyword: string; matched: boolean }[];
  finalResult: boolean;
}

export function getMatcherDiagnostics(
  exerciseId: string,
  name: string,
  matcher: (id: string, name: string) => boolean
): MatcherDiagnostic {
  const id = exerciseId.toLowerCase();
  const n = name.toLowerCase();
  const finalResult = matcher(exerciseId, name);

  let matcherName = '';
  let includeRules: { rule: string; matched: boolean }[] = [];
  let excludes: string[] = [];

  if (matcher === isSquat) {
    matcherName = 'isSquat()';
    includeRules = [
      { rule: `id === "squat"`, matched: id === 'squat' },
      { rule: `name.includes("스쿼트")`, matched: n.includes('스쿼트') },
      { rule: `name.includes("squat")`, matched: n.includes('squat') }
    ];
    excludes = [
      '스미스', 'smith', '덤벨', 'dumbbell', '핵', 'hack', '점프', 'jump',
      '와이드', 'wide', '스플릿', 'split', '불가리안', 'bulgarian',
      '피스톨', 'pistol', '런지', 'lunge', '고블렛', 'goblet', '하프', 'half',
      '프론트', 'front', '오버헤드', 'overhead', '싱글', 'single', '레그', 'leg',
      'v스쿼트', 'v 스쿼트', 'v-squat', 'vsquat', '카프레이즈', 'calf raise', 'calf', 'raise'
    ];
  } else if (matcher === isBenchPress) {
    matcherName = 'isBenchPress()';
    includeRules = [
      { rule: `id === "bench-press"`, matched: id === 'bench-press' },
      { rule: `name.includes("벤치프레스")`, matched: n.includes('벤치프레스') },
      { rule: `name.includes("bench press")`, matched: n.includes('bench press') },
      { rule: `name.includes("benchpress")`, matched: n.includes('benchpress') }
    ];
    excludes = [
      '인클라인', 'incline', '디클라인', 'decline', '덤벨', 'dumbbell',
      '스미스', 'smith', '머신', 'machine', '체스트', 'chest', '플라이', 'fly',
      '클로즈', 'close', 'chest press machine', 'pec deck', 'fly machine'
    ];
  } else if (matcher === isDeadlift) {
    matcherName = 'isDeadlift()';
    includeRules = [
      { rule: `id === "deadlift"`, matched: id === 'deadlift' },
      { rule: `name.includes("데드리프트")`, matched: n.includes('데드리프트') },
      { rule: `name.includes("deadlift")`, matched: n.includes('deadlift') }
    ];
    excludes = [
      '로마니안', '루마니안', 'romanian', '덤벨', 'dumbbell', '스모', 'sumo',
      '스티프', 'stiff', '싱글', 'single', '레그', 'leg', 'trap bar', 'hex bar'
    ];
  } else if (matcher === isOHP) {
    matcherName = 'isOHP()';
    includeRules = [
      { rule: `id === "overhead-press" || id === "ohp"`, matched: id === 'overhead-press' || id === 'ohp' },
      { rule: `name.includes("오버헤드 프레스")`, matched: n.includes('오버헤드 프레스') || n.includes('오버헤드프레스') },
      { rule: `name.includes("overhead press")`, matched: n.includes('overhead press') || n.includes('overheadpress') },
      { rule: `name.includes("ohp")`, matched: n.includes('ohp') },
      { rule: `name.includes("밀리터리 프레스")`, matched: n.includes('밀리터리 프레스') || n.includes('밀리터리프레스') },
      { rule: `name.includes("military press")`, matched: n.includes('military press') || n.includes('militarypress') },
      { rule: `name.includes("밀프")`, matched: n.includes('밀프') }
    ];
    excludes = [
      '덤벨', 'dumbbell', '머신', 'machine', '비하인드', 'behind',
      '아놀드', 'arnold', '레이즈', 'raise', '시티드', 'seated',
      'shoulder press machine', 'dumbbell shoulder press'
    ];
  }

  const excludeRules = excludes.map(word => ({
    keyword: word,
    matched: n.includes(word)
  }));

  return {
    exerciseId,
    exerciseName: name,
    normalizedId: id,
    normalizedName: n,
    matcherName,
    includeRules,
    excludeRules,
    finalResult
  };
}

// Helpers to identify exercises
export function isSquat(exerciseId: string, name: string): boolean {
  const id = exerciseId.toLowerCase();
  const n = name.toLowerCase();
  const nClean = n.replace(/\s+/g, '');
  
  const isBaseSquat = id === 'squat' || id === 'barbell-squat' || id === 'back-squat' || nClean.includes('스쿼트') || nClean.includes('squat');
  if (!isBaseSquat) return false;

  // Exclude variation lifts to strictly match the main compound barbell back squat
  const excludes = [
    '스미스', 'smith', '덤벨', 'dumbbell', '핵', 'hack', '점프', 'jump',
    '와이드', 'wide', '스플릿', 'split', '불가리안', 'bulgarian',
    '피스톨', 'pistol', '런지', 'lunge', '고블렛', 'goblet', '하프', 'half',
    '프론트', 'front', '오버헤드', 'overhead', '싱글', 'single',
    'v스쿼트', 'v 스쿼트', 'v-squat', 'vsquat', '카프레이즈', 'calf raise', 'calf', 'raise'
  ];
  return !excludes.some(ex => nClean.includes(ex.replace(/\s+/g, '')));
}

export function isBenchPress(exerciseId: string, name: string): boolean {
  const id = exerciseId.toLowerCase();
  const n = name.toLowerCase();
  const nClean = n.replace(/\s+/g, '');
  
  const isBaseBp = id === 'bench-press' || id === 'benchpress' || id === 'barbell-bench-press' ||
    nClean.includes('벤치프레스') || nClean.includes('benchpress') || nClean.includes('bench-press');
  if (!isBaseBp) return false;

  // Exclude variation lifts to strictly match flat barbell bench press
  const excludes = [
    '인클라인', 'incline', '디클라인', 'decline', '덤벨', 'dumbbell',
    '스미스', 'smith', '머신', 'machine', '체스트', 'chest', '플라이', 'fly',
    '클로즈', 'close', 'chest press machine', 'pec deck', 'fly machine'
  ];
  return !excludes.some(ex => nClean.includes(ex.replace(/\s+/g, '')));
}

export function isDeadlift(exerciseId: string, name: string): boolean {
  const id = exerciseId.toLowerCase();
  const n = name.toLowerCase();
  const nClean = n.replace(/\s+/g, '');
  
  const isBaseDl = id === 'deadlift' || id === 'barbell-deadlift' || id === 'conventional-deadlift' ||
    nClean.includes('데드리프트') || nClean.includes('deadlift');
  if (!isBaseDl) return false;

  // Exclude variation lifts to strictly match conventional barbell deadlift
  const excludes = [
    '로마니안', '루마니안', 'romanian', '덤벨', 'dumbbell', '스모', 'sumo',
    '스티프', 'stiff', '싱글', 'single', 'trap bar', 'hex bar'
  ];
  return !excludes.some(ex => nClean.includes(ex.replace(/\s+/g, '')));
}

export function isOHP(exerciseId: string, name: string): boolean {
  const id = exerciseId.toLowerCase();
  const n = name.toLowerCase();
  const nClean = n.replace(/\s+/g, '');
  
  const isBaseOhp = id === 'overhead-press' || id === 'ohp' || id === 'overheadpress' ||
    nClean.includes('오버헤드프레스') || nClean.includes('overheadpress') ||
    nClean.includes('ohp') || nClean.includes('밀리터리프레스') ||
    nClean.includes('militarypress') || nClean.includes('밀프');
  if (!isBaseOhp) return false;

  // Exclude variation lifts to strictly match overhead press / military press
  const excludes = [
    '덤벨', 'dumbbell', '머신', 'machine', '비하인드', 'behind',
    '아놀드', 'arnold', '레이즈', 'raise', '시티드', 'seated',
    'shoulder press machine', 'dumbbell shoulder press'
  ];
  return !excludes.some(ex => nClean.includes(ex.replace(/\s+/g, '')));
}

// Deduce MuscleCategory from exercise name
export function deduceCategory(name: string): any {
  const n = name.toLowerCase();

  // 1. Exception / Specific multi-word mappings
  if (n.includes('레그 컬') || n.includes('레그컬') || n.includes('leg curl')) {
    return 'Legs';
  }
  if (n.includes('레그 익스텐션') || n.includes('레그익스텐션') || n.includes('leg extension')) {
    return 'Legs';
  }
  if (n.includes('카프레이즈') || n.includes('카프 레이즈') || n.includes('calf raise') || n.includes('카프') || n.includes('calf')) {
    return 'Legs';
  }
  if (n.includes('케틀벨 스윙') || n.includes('케틀벨스윙') || n.includes('kettlebell swing') || n.includes('스윙') || n.includes('swing')) {
    return 'Legs';
  }
  if (n.includes('오버헤드 익스텐션') || n.includes('트라이셉스 익스텐션') || n.includes('오버헤드 트라이셉스') || n.includes('삼두 익스텐션') || n.includes('overhead extension') || n.includes('triceps extension')) {
    return 'Arms';
  }
  if (n.includes('페이스풀') || n.includes('페이스 풀') || n.includes('face pull') || n.includes('facepull')) {
    return 'Shoulders';
  }
  if (n.includes('랫풀다운') || n.includes('랫 풀 다운') || n.includes('랫풀') || n.includes('렛풀다운') || n.includes('렛 풀 다운') || n.includes('렛풀') || n.includes('lat pulldown') || n.includes('pulldown') || n.includes('풀다운')) {
    return 'Back';
  }

  // 2. Class/Category-level rules
  if (n.includes('스쿼트') || n.includes('레그') || n.includes('하체') || n.includes('squat') || n.includes('leg') || n.includes('lunge') || n.includes('런지')) {
    return 'Legs';
  }
  if (n.includes('벤치') || n.includes('가슴') || n.includes('체스트') || n.includes('플라이') || n.includes('bench') || n.includes('chest') || n.includes('fly') || n.includes('dips') || n.includes('딥스') || n.includes('푸쉬업') || n.includes('pushup') || n.includes('push-up')) {
    return 'Chest';
  }
  if (n.includes('데드') || n.includes('풀업') || n.includes('로우') || n.includes('렛풀') || n.includes('등') || n.includes('deadlift') || n.includes('pull') || n.includes('row') || n.includes('lat') || n.includes('친업') || n.includes('chinup') || n.includes('chin-up') || n.includes('풀다운') || n.includes('pulldown')) {
    return 'Back';
  }
  if (n.includes('프레스') || n.includes('레이즈') || n.includes('숄더') || n.includes('어깨') || n.includes('overhead') || n.includes('press') || n.includes('lateral') || n.includes('shoulder') || n.includes('ohp') || n.includes('사레레') || n.includes('밀리터리')) {
    return 'Shoulders';
  }
  if (n.includes('컬') || n.includes('트라이셉스') || n.includes('이두') || n.includes('삼두') || n.includes('팔') || n.includes('biceps') || n.includes('triceps') || n.includes('curl') || n.includes('해머')) {
    return 'Arms';
  }
  if (n.includes('플랭크') || n.includes('크런치') || n.includes('복근') || n.includes('코어') || n.includes('plank') || n.includes('crunch') || n.includes('core') || n.includes('행잉')) {
    return 'Core';
  }
  if (n.includes('러닝') || n.includes('달리기') || n.includes('자전거') || n.includes('트레드밀') || n.includes('유산소') || n.includes('run') || n.includes('treadmill') || n.includes('bike') || n.includes('cardio') || n.includes('사이클')) {
    return 'Cardio';
  }

  return 'Chest'; // Fallback
}

export function getBestPR(logs: WorkoutLog[], exerciseMatcher: (id: string, name: string) => boolean): string {
  let bestWeight = 0;
  let bestReps = 0;
  let bestSetsCount = 0;

  for (const log of logs) {
    for (const ex of log.exercises) {
      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        const workSets = ex.sets.filter(s => !s.isWarmup);
        if (workSets.length === 0) continue;

        const maxWeight = Math.max(...workSets.map(s => s.weight));
        const setsWithMaxWeight = workSets.filter(s => s.weight === maxWeight);
        if (setsWithMaxWeight.length === 0) continue;
        const maxReps = Math.max(...setsWithMaxWeight.map(s => s.reps));
        const setsCount = setsWithMaxWeight.filter(s => s.reps === maxReps).length;

        if (maxWeight > bestWeight || (maxWeight === bestWeight && maxReps > bestReps)) {
          bestWeight = maxWeight;
          bestReps = maxReps;
          bestSetsCount = setsCount;
        }
      }
    }
  }

  if (bestWeight === 0) return '기록 없음';
  return bestSetsCount > 1 ? `${bestWeight}x${bestReps}x${bestSetsCount}` : `${bestWeight}x${bestReps}`;
}

// 2. Weight metrics calculation
export function calculateWeightMetrics(weightLogs: WeightLog[]) {
  if (weightLogs.length === 0) {
    return {
      current: 72.6,
      fourWeeksAgo: 72.3,
      diff: 0.3,
      progress: 96.8
    };
  }

  // Sort by date descending
  const sorted = [...weightLogs].sort((a, b) => b.date.localeCompare(a.date));
  const current = sorted[0].weight;

  // Find a log from around 4 weeks ago (28 days ago)
  const { startDateStr: fourWeeksAgoStr } = getLast28DaysRange();

  // Find closest log before or equal to 28 days ago, or oldest
  let fourWeeksAgoLog = sorted.find(w => w.date <= fourWeeksAgoStr);
  if (!fourWeeksAgoLog) {
    fourWeeksAgoLog = sorted[sorted.length - 1]; // oldest
  }
  const fourWeeksAgo = fourWeeksAgoLog ? fourWeeksAgoLog.weight : current;
  const diff = current - fourWeeksAgo;

  const goal = 75.0;
  const progress = (current / goal) * 100;

  return {
    current,
    fourWeeksAgo,
    diff,
    progress
  };
}

// Get maximum e1RM for an exercise over a specified period
export function getMaxE1RMForExercise(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  startDateStr?: string,
  endDateStr?: string,
  debugLogs?: string[]
): { 
  maxE1RM: number; 
  maxSet: { weight: number; reps: number } | null; 
  date: string;
  candidates?: any[];
} {
  let maxE1RM = 0;
  let maxSet: { weight: number; reps: number } | null = null;
  let maxDate = '';

  const matcherName = exerciseMatcher === isSquat ? 'Squat' :
                      exerciseMatcher === isBenchPress ? 'Bench Press' :
                      exerciseMatcher === isDeadlift ? 'Deadlift' :
                      exerciseMatcher === isOHP ? 'OHP' : '';

  const logMsg = (msg: string) => {
    if (debugLogs) {
      debugLogs.push(msg);
    }
  };

  if (matcherName) {
    logMsg(`\n======================================================================`);
    logMsg(`[e1RM Diagnostics] STARTING REPRESENTATIVE SET SELECTION FOR: ${matcherName}`);
    logMsg(`======================================================================`);
    logMsg(`1. FUNCTION CALL PATH / FLOW:`);
    logMsg(`   parseV1Excel() / Dashboard Rendering -> getMaxE1RMForExercise()`);
    logMsg(`   - parseV1Excel() orchestrates migration and extracts mappedWorkoutLogs.`);
    logMsg(`   - getMaxE1RMForExercise() scans all sessions, filtering exercises using a matcher.`);
    logMsg(`   - calculateSetE1RM() applies the Epley Formula: e1RM = Weight * (1 + Reps/30).`);
    logMsg(`   - getBestPR() and getE1RMChange() use a similar traversal to present progress.`);
    logMsg(`\n2. RELEVANT SET RECORDS & CANDIDATE EVALUATION:`);
  }

  const candidates: {
    date: string;
    exerciseName: string;
    exerciseId: string;
    weight: number;
    reps: number;
    calculatedE1RM: number;
    included: boolean;
    reason: string;
    rawSetRecord: any;
    selected?: boolean;
  }[] = [];

  for (const log of logs) {
    if (startDateStr && log.date < startDateStr) continue;
    if (endDateStr && log.date > endDateStr) continue;

    for (const ex of log.exercises) {
      const nameLower = ex.exerciseName.toLowerCase();
      // Match candidate names containing keywords to print out tracing
      const isCandidateBase = nameLower.includes('스쿼트') || nameLower.includes('squat') ||
                              nameLower.includes('벤치') || nameLower.includes('bench') ||
                              nameLower.includes('데드') || nameLower.includes('dead') ||
                              nameLower.includes('오버헤드') || nameLower.includes('overhead') ||
                              nameLower.includes('밀리터리') || nameLower.includes('military') ||
                              nameLower.includes('ohp') || nameLower.includes('밀프');

      if (matcherName && isCandidateBase) {
        const isMatched = exerciseMatcher(ex.exerciseId, ex.exerciseName);
        for (let sIdx = 0; sIdx < ex.sets.length; sIdx++) {
          const set = ex.sets[sIdx];
          const calculatedVal = calculateSetE1RM(set.weight, set.reps);
          
          let included = isMatched && !set.isWarmup;
          let reason = '';
          if (!isMatched) {
            const excludesList = exerciseMatcher === isSquat ? [
              '스미스', 'smith', '덤벨', 'dumbbell', '핵', 'hack', '점프', 'jump',
              '와이드', 'wide', '스플릿', 'split', '불가리안', 'bulgarian',
              '피스톨', 'pistol', '런지', 'lunge', '고블렛', 'goblet', '하프', 'half',
              '프론트', 'front', '오버헤드', 'overhead', '싱글', 'single', '레그', 'leg'
            ] : exerciseMatcher === isBenchPress ? [
              '인클라인', 'incline', '디클라인', 'decline', '덤벨', 'dumbbell',
              '스미스', 'smith', '머신', 'machine', '체스트', 'chest', '플라이', 'fly',
              '클로즈', 'close'
            ] : exerciseMatcher === isDeadlift ? [
              '로마니안', '루마니안', 'romanian', '덤벨', 'dumbbell', '스모', 'sumo',
              '스티프', 'stiff', '싱글', 'single', '레그', 'leg'
            ] : exerciseMatcher === isOHP ? [
              '덤벨', 'dumbbell', '머신', 'machine', '비하인드', 'behind',
              '아놀드', 'arnold', '레이즈', 'raise', '시티드', 'seated'
            ] : [];
            const matchedExcludes = excludesList.filter(exWord => nameLower.includes(exWord));
            if (matchedExcludes.length > 0) {
              reason = `Excluded: Contains variation keyword(s) [${matchedExcludes.join(', ')}]`;
            } else {
              reason = `Excluded: Name filter exclusion (Not a main compound lift)`;
            }
          } else if (set.isWarmup) {
            reason = 'Excluded: Warmup set';
          } else {
            reason = 'Matches main compound exercise and is not a warmup set';
          }

          candidates.push({
            date: log.date,
            exerciseName: ex.exerciseName,
            exerciseId: ex.exerciseId,
            weight: set.weight,
            reps: set.reps,
            calculatedE1RM: calculatedVal,
            included,
            reason,
            rawSetRecord: set
          });
        }
      }

      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        for (const set of ex.sets) {
          if (set.isWarmup) continue;
          const e1RM = calculateSetE1RM(set.weight, set.reps);
          if (e1RM > maxE1RM) {
            maxE1RM = e1RM;
            maxSet = { weight: set.weight, reps: set.reps };
            maxDate = log.date;
          }
        }
      }
    }
  }

  // Mark selected set inside candidates
  let markedSelected = false;
  candidates.forEach(cand => {
    if (
      cand.included &&
      !markedSelected &&
      maxSet &&
      cand.date === maxDate &&
      cand.weight === maxSet.weight &&
      cand.reps === maxSet.reps &&
      Math.abs(cand.calculatedE1RM - maxE1RM) < 0.0001
    ) {
      cand.selected = true;
      markedSelected = true;
    } else {
      cand.selected = false;
    }
  });

  return { maxE1RM, maxSet, date: maxDate, candidates };
}

// Get the 1RM changes (4W change, 8W change) for an exercise
export function getE1RMChange(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  p1Start: string,
  p2Start: string,
  p3Start: string
) {
  const currentRes = getMaxE1RMForExercise(logs, exerciseMatcher, p1Start);
  let currentVal = currentRes.maxE1RM;

  // Fallback to overall max if current period has no logs
  if (currentVal === 0) {
    const overall = getMaxE1RMForExercise(logs, exerciseMatcher);
    currentVal = overall.maxE1RM;
  }

  const p2Res = getMaxE1RMForExercise(logs, exerciseMatcher, p2Start, p1Start);
  let p2Val = p2Res.maxE1RM;
  if (p2Val === 0) {
    const beforeP1 = logs.filter(l => l.date < p1Start);
    if (beforeP1.length > 0) {
      const res = getMaxE1RMForExercise(beforeP1, exerciseMatcher);
      p2Val = res.maxE1RM;
    }
  }

  const p3Res = getMaxE1RMForExercise(logs, exerciseMatcher, p3Start, p2Start);
  let p3Val = p3Res.maxE1RM;
  if (p3Val === 0) {
    const sortedOldest = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    const oldestRes = getMaxE1RMForExercise(sortedOldest, exerciseMatcher);
    p3Val = oldestRes.maxE1RM;
  }

  const diff4W = currentVal > 0 && p2Val > 0 ? currentVal - p2Val : 0;
  const baseFor8W = p3Val > 0 ? p3Val : (p2Val > 0 ? p2Val : currentVal);
  const diff8W = currentVal > 0 && baseFor8W > 0 ? currentVal - baseFor8W : 0;

  return {
    current: Math.round(currentVal),
    diff4W: Math.round(diff4W),
    diff8W: Math.round(diff8W)
  };
}

// 3. Working Weight calculation
export function getMaxWeightForExercise(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  startDateStr?: string,
  endDateStr?: string
): number {
  let maxWeight = 0;
  for (const log of logs) {
    if (startDateStr && log.date < startDateStr) continue;
    if (endDateStr && log.date > endDateStr) continue;

    for (const ex of log.exercises) {
      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        for (const set of ex.sets) {
          if (set.isWarmup) continue;
          if (set.weight > maxWeight) {
            maxWeight = set.weight;
          }
        }
      }
    }
  }
  return maxWeight;
}

export function getWorkingWeightData(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  p1Start: string,
  p2Start: string,
  goal: number
) {
  let current = getMaxWeightForExercise(logs, exerciseMatcher, p1Start);
  if (current === 0) {
    current = getMaxWeightForExercise(logs, exerciseMatcher);
  }

  let fourWeeksAgo = getMaxWeightForExercise(logs, exerciseMatcher, p2Start, p1Start);
  if (fourWeeksAgo === 0) {
    const beforeP1 = logs.filter(l => l.date < p1Start);
    if (beforeP1.length > 0) {
      fourWeeksAgo = getMaxWeightForExercise(beforeP1, exerciseMatcher);
    }
  }

  if (fourWeeksAgo === 0) {
    fourWeeksAgo = current;
  }

  return {
    current,
    fourWeeksAgo,
    goal
  };
}

// 4. Training Frequency calculation
export function getTrainingFrequency(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  p1Start: string,
  p2Start: string
): { recent4Weeks: number; recent8Weeks: number } {
  let recent4Weeks = 0;
  let recent8Weeks = 0;

  for (const log of logs) {
    const hasExercise = log.exercises.some(ex => exerciseMatcher(ex.exerciseId, ex.exerciseName));
    if (hasExercise) {
      if (log.date >= p1Start) {
        recent4Weeks++;
        recent8Weeks++;
      } else if (log.date >= p2Start) {
        recent8Weeks++;
      }
    }
  }

  return { recent4Weeks, recent8Weeks };
}

// 5. Cardio Mileage calculation
export function getCardioMileage(
  logs: WorkoutLog[],
  p1Start: string,
  p2Start: string
): { recent4Weeks: number; recent8Weeks: number; total: number } {
  return calculateMileage(logs, isRunningExercise, p1Start, p2Start);
}

/**
 * Computes Personal Best (PB) times for 3 km and 5 km runs using the unified Cardio Domain.
 */
export function selectRunningPB(logs: WorkoutLog[]): { best3km: string; best5km: string } {
  return calculateRunningPB(logs, isRunningExercise);
}

// 6. Best Quality Workset calculation
export function getBestWorkset(
  logs: WorkoutLog[],
  exerciseMatcher: (id: string, name: string) => boolean,
  defaultName: string,
  defaultScheme: string,
  defaultDate: string,
  defaultNote: string,
  defaultWeight: number = 0
) {
  let bestWeight = 0;
  let bestReps = 0;
  let bestCount = 0;
  let bestDate = '';
  let bestVolume = 0;

  for (const log of logs) {
    for (const ex of log.exercises) {
      if (exerciseMatcher(ex.exerciseId, ex.exerciseName)) {
        const workSets = ex.sets.filter(s => !s.isWarmup);
        if (workSets.length === 0) continue;

        const maxWeightInSession = Math.max(...workSets.map(s => s.weight));
        const setsWithMaxWeight = workSets.filter(s => s.weight === maxWeightInSession);
        const maxReps = Math.max(...setsWithMaxWeight.map(s => s.reps));
        const count = setsWithMaxWeight.filter(s => s.reps === maxReps).length;

        const sessionVolume = workSets.reduce((sum, s) => sum + s.weight * s.reps, 0);

        if (
          maxWeightInSession > bestWeight ||
          (maxWeightInSession === bestWeight && sessionVolume > bestVolume)
        ) {
          bestWeight = maxWeightInSession;
          bestReps = maxReps;
          bestCount = count;
          bestDate = log.date;
          bestVolume = sessionVolume;
        }
      }
    }
  }

  if (bestWeight === 0) {
    return {
      name: defaultName,
      scheme: defaultScheme,
      date: defaultDate,
      note: defaultNote,
      weight: defaultWeight
    };
  }

  let note = defaultNote;
  if (bestReps >= 5 && bestCount >= 5) {
    note = '볼륨 점진적 과부하 완벽 달성';
  } else if (bestReps <= 3) {
    note = '최대 수축 및 저항성 통제 완수';
  } else {
    note = '안정적인 궤적 및 코어 자극 완수';
  }

  return {
    name: defaultName,
    scheme: `${bestWeight} kg × ${bestReps}회 × ${bestCount}세트`,
    date: bestDate,
    note,
    weight: bestWeight
  };
}

export type { RecommendationResult, MainLift as RecommendationMainLift } from './recommendationEngine';

// 7. Next Recommended Workout calculation
export function getNextRecommendation(logs: WorkoutLog[], goalSettings?: any): any {
  return getNextRecFromEngine(logs, goalSettings);
}

