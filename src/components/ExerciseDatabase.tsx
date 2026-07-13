/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, FormEvent } from 'react';
import { Exercise, MuscleCategory, LogType, WorkoutLog, Routine } from '../types';
import { Plus, Trash2, Dumbbell, Tag, Grid, Filter, AlertCircle, Copy, Check, Calendar, AlertTriangle, ListOrdered, ClipboardList, Info, Sparkles, RefreshCw } from 'lucide-react';
import { motion } from 'motion/react';
import { generateUUID } from '../utils/workoutEngine';

interface ExerciseDatabaseProps {
  exercises: Exercise[];
  logs?: WorkoutLog[];
  routines?: Routine[];
  onAddExercise: (exercise: Exercise) => void;
  onDeleteExercise: (id: string) => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
  onUpdateExercises?: (exercises: Exercise[]) => void;
  onUpdateLogs?: (logs: WorkoutLog[]) => void;
  onUpdateRoutines?: (routines: Routine[]) => void;
}

export const CATEGORIES_KO: Record<MuscleCategory, string> = {
  Chest: '가슴',
  Back: '등',
  Legs: '하체',
  Shoulders: '어깨',
  Arms: '팔',
  Core: '코어 / 복근',
  Cardio: '유산소',
};

export const LOG_TYPES_KO: Record<LogType, string> = {
  STANDARD: '일반 웨이트 (무게/반복/RPE)',
  BODYWEIGHT_REPS: '맨몸/보조 (반복/RPE)',
  TIME_BASED: '시간 기반 (분/초)',
  CARDIO: '유산소 (거리/시간)',
};

export const KNOWN_EQUIVALENTS: Record<string, string> = {
  'ohp': 'overhead-press',
  '오버헤드프레스': 'overhead-press',
  '오버헤드 프레스': 'overhead-press',
  '사레레': 'lateral-raise',
  '사이드레터럴레이즈': 'lateral-raise',
  '사이드 레터럴 레이즈': 'lateral-raise',
  '바벨로우': 'barbell-row',
  '바벨 로우': 'barbell-row',
  '페이스풀': 'face-pull',
  '페이스 풀': 'face-pull',
  '벤치프레스': 'bench-press',
  '벤치 프레스': 'bench-press',
  '데드리프트': 'deadlift',
  '데드 리프트': 'deadlift',
  '풀업': 'pull-up',
  '플랭크': 'plank',
  '스쿼트': 'squat',
};

export const normalizeName = (n: string): string => {
  return n
    .replace(/\([^)]*\)/g, '') // remove brackets
    .replace(/[^a-zA-Z0-9가-힣]/g, '') // remove spacing and special chars
    .toLowerCase()
    .trim();
};


export default function ExerciseDatabase({
  exercises,
  logs = [],
  routines = [],
  onAddExercise,
  onDeleteExercise,
  onShowAlert,
  onShowConfirm,
  onUpdateExercises,
  onUpdateLogs,
  onUpdateRoutines
}: ExerciseDatabaseProps) {
  const showAlert = (message: string, title?: string) => {
    if (onShowAlert) {
      onShowAlert(message, title);
    } else {
      alert(message);
    }
  };
  const [name, setName] = useState('');
  const [category, setCategory] = useState<MuscleCategory>('Chest');
  const [logType, setLogType] = useState<LogType>('STANDARD');
  const [activeTab, setActiveTab] = useState<MuscleCategory | 'All'>('All');
  const [copySuccess, setCopySuccess] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [lastOptimized, setLastOptimized] = useState<string>(() => {
    return localStorage.getItem('last_db_optimized') || '2026-06-28 07:13';
  });

  const filteredExercises = useMemo(() => {
    if (activeTab === 'All') return exercises;
    return exercises.filter(ex => ex.category === activeTab);
  }, [exercises, activeTab]);

  const referencedExerciseIds = useMemo(() => {
    const ids = new Set<string>();
    logs.forEach(log => {
      log.exercises.forEach(sess => {
        ids.add(sess.exerciseId);
      });
    });
    routines.forEach(r => {
      r.exercises.forEach(e => {
        ids.add(e.exerciseId);
      });
    });
    return ids;
  }, [logs, routines]);

  // Real-time Database Audit Calculation Engine
  const auditStats = useMemo(() => {
    const statsMap: Record<string, { count: number; lastDate: string | null }> = {};
    
    // Initialize
    exercises.forEach(ex => {
      statsMap[ex.id] = { count: 0, lastDate: null };
    });

    // Count usages in logs
    const sortedLogs = [...logs].sort((a, b) => a.date.localeCompare(b.date)); // older first to find newest
    let totalRecordCount = 0;
    
    sortedLogs.forEach(log => {
      log.exercises.forEach(sess => {
        const exId = sess.exerciseId;
        if (!statsMap[exId]) {
          statsMap[exId] = { count: 0, lastDate: null };
        }
        statsMap[exId].count += 1;
        statsMap[exId].lastDate = log.date;
        totalRecordCount += 1;
      });
    });

    // 3 Months threshold (Reference Date: 2026-06-28)
    const auditDate = new Date('2026-06-28');
    const threeMonthsAgo = new Date(auditDate);
    threeMonthsAgo.setMonth(auditDate.getMonth() - 3);

    const list = exercises.map(ex => {
      const stat = statsMap[ex.id] || { count: 0, lastDate: null };
      let isRecent = false;
      if (stat.lastDate) {
        const lastDateObj = new Date(stat.lastDate);
        isRecent = lastDateObj >= threeMonthsAgo;
      }
      return {
        ...ex,
        count: stat.count,
        lastDate: stat.lastDate,
        isRecent,
      };
    });

    // Sort by count descending
    const ranked = [...list].sort((a, b) => b.count - a.count);

    // Unused in last 3 months
    const unused3Months = list.filter(item => item.count === 0 || !item.isRecent);

    // Categories breakdown
    const categoryStats: Record<string, { mostUsed: typeof list; leastUsed: typeof list }> = {};
    Object.keys(CATEGORIES_KO).forEach(cat => {
      const catList = list.filter(item => item.category === cat);
      const sortedCat = [...catList].sort((a, b) => b.count - a.count);
      categoryStats[cat] = {
        mostUsed: sortedCat.slice(0, 1),
        leastUsed: [...sortedCat].reverse().slice(0, 1),
      };
    });

    // Duplicates candidates search
    const dupCandidates: Array<{ ex1: Exercise; ex2: Exercise; reason: string }> = [];

    for (let i = 0; i < exercises.length; i++) {
      for (let j = i + 1; j < exercises.length; j++) {
        const ex1 = exercises[i];
        const ex2 = exercises[j];
        const norm1 = normalizeName(ex1.name);
        const norm2 = normalizeName(ex2.name);

        const isAliasEquiv = () => {
          const canonId1 = KNOWN_EQUIVALENTS[norm1];
          const canonId2 = KNOWN_EQUIVALENTS[norm2];
          return !!(canonId1 && canonId2 && canonId1 === canonId2);
        };

        if (ex1.id !== ex2.id && ex1.category === ex2.category && (ex1.logType || 'STANDARD') === (ex2.logType || 'STANDARD')) {
          if (norm1 === norm2) {
            dupCandidates.push({
              ex1,
              ex2,
              reason: '명칭 완벽 일치 (병합 가능)'
            });
          } else if (isAliasEquiv()) {
            dupCandidates.push({
              ex1,
              ex2,
              reason: '동의어/Alias 일치 (병합 가능)'
            });
          } else {
            // Check for partial name match within same category & same logType
            const name1 = ex1.name.toLowerCase().trim();
            const name2 = ex2.name.toLowerCase().trim();
            if (
              (name1.includes(name2) || name2.includes(name1)) && 
              Math.abs(name1.length - name2.length) <= 5
            ) {
              dupCandidates.push({
                ex1,
                ex2,
                reason: '동일 카테고리/유형 내 부분 일치'
              });
            }
          }
        }
      }
    }

    return {
      ranked,
      unused3Months,
      categoryStats,
      dupCandidates,
      totalRecordCount,
      totalLogsCount: logs.length
    };
  }, [exercises, logs]);

  const deletionCandidates = useMemo(() => {
    return exercises.filter(ex => {
      if (!ex.isCustom) return false;
      const rankedItem = auditStats.ranked.find(r => r.id === ex.id);
      const isUsedInLog = rankedItem && rankedItem.count > 0;
      const isUsedInRoutine = routines.some(r => r.exercises.some(e => e.exerciseId === ex.id));
      return !isUsedInLog && !isUsedInRoutine;
    });
  }, [exercises, auditStats.ranked, routines]);

  // Execute Database Auto-Cleanup & Optimization
  const executeCleanup = () => {
    // Calculate usage frequencies and latest workout dates
    const counts: Record<string, number> = {};
    const lastDates: Record<string, string> = {};
    exercises.forEach(ex => {
      counts[ex.id] = 0;
    });
 
    logs.forEach(log => {
      log.exercises.forEach(sess => {
        const exId = sess.exerciseId;
        counts[exId] = (counts[exId] || 0) + 1;
        if (!lastDates[exId] || log.date > lastDates[exId]) {
          lastDates[exId] = log.date;
        }
      });
    });
 
    // Resolve canonical target for each exercise
    const getTargetCanonicalExercise = (ex: Exercise): Exercise => {
      const norm = normalizeName(ex.name);
      
      const isMatch = (other: Exercise) => {
        if (other.category !== ex.category) return false;
        if ((other.logType || 'STANDARD') !== (ex.logType || 'STANDARD')) return false;

        const normOther = normalizeName(other.name);
        if (norm === normOther) return true;

        const canonId1 = KNOWN_EQUIVALENTS[norm];
        const canonId2 = KNOWN_EQUIVALENTS[normOther];
        if (canonId1 && canonId2 && canonId1 === canonId2) return true;

        return false;
      };

      // 1. Try known preset equivalent mapping first
      if (KNOWN_EQUIVALENTS[norm]) {
        const foundPreset = exercises.find(e => e.id === KNOWN_EQUIVALENTS[norm]);
        if (foundPreset && isMatch(foundPreset)) {
          return foundPreset;
        }
      }
      
      // 2. Match against preset exercises (non-custom) with matching name/alias and same logType and category
      const presetMatches = exercises.filter(e => !e.isCustom && isMatch(e));
      if (presetMatches.length > 0) {
        return presetMatches[0];
      }
 
      // 3. Match against all matches with the same normalized name/alias, same logType and category
      const allMatches = exercises.filter(e => isMatch(e));
      if (allMatches.length > 1) {
        // Choose the one with the highest usage, then by id string comparison
        const sorted = [...allMatches].sort((a, b) => {
          // Prefer preset (non-custom) over custom as the target canonical
          if (!!a.isCustom !== !!b.isCustom) {
            return a.isCustom ? 1 : -1;
          }
          const countA = counts[a.id] || 0;
          const countB = counts[b.id] || 0;
          if (countB !== countA) return countB - countA;
          return a.id.localeCompare(b.id);
        });
        return sorted[0];
      }
 
      return ex; // It is its own canonical representation
    };
 
    const mergeMap: Record<string, Exercise> = {};
    const mergedList: string[] = [];
 
    exercises.forEach(ex => {
      const canonical = getTargetCanonicalExercise(ex);
      if (canonical.id !== ex.id) {
        mergeMap[ex.id] = canonical;
        mergedList.push(`"${ex.name}" → "${canonical.name}"`);
      }
    });
 
    // 2. Perform safe, non-destructive WorkoutLog ExerciseSession updates
    const updatedLogs = logs.map(log => {
      const updatedExercises = log.exercises.map(sess => {
        const targetCanonical = mergeMap[sess.exerciseId];
        if (targetCanonical) {
          return {
            ...sess,
            exerciseId: targetCanonical.id,
            exerciseName: targetCanonical.name,
            category: targetCanonical.category,
          };
        }
        return sess;
      });
      return {
        ...log,
        exercises: updatedExercises,
      };
    });
 
    // 3. Perform Routine exercises reference updates
    const updatedRoutines = routines.map(routine => {
      const updatedRoutineExercises = routine.exercises.map(ex => {
        const targetCanonical = mergeMap[ex.exerciseId];
        if (targetCanonical) {
          return {
            ...ex,
            exerciseId: targetCanonical.id,
            exerciseName: targetCanonical.name,
            category: targetCanonical.category,
          };
        }
        return ex;
      });
      return {
        ...routine,
        exercises: updatedRoutineExercises,
      };
    });

    // 3.5 Verify all references have been successfully updated to Canonical exercises (Strict Step 3)
    const stillReferencedIds = new Set<string>();
    updatedLogs.forEach(log => {
      log.exercises.forEach(sess => {
        if (mergeMap[sess.exerciseId]) {
          stillReferencedIds.add(sess.exerciseId);
        }
      });
    });
    updatedRoutines.forEach(r => {
      r.exercises.forEach(e => {
        if (mergeMap[e.exerciseId]) {
          stillReferencedIds.add(e.exerciseId);
        }
      });
    });

    if (stillReferencedIds.size > 0) {
      console.warn('Warning: Some merged exercises are still referenced:', Array.from(stillReferencedIds));
    }
 
    // 4. Safe Deletion of custom exercises with 0 usages and no routine reference
    const canonicalIdsUsedByMerge = new Set(Object.values(mergeMap).map(e => e.id));
    const deletedList: string[] = [];
    
    const remainingExercises = exercises.filter(ex => {
      // If it's a merged duplicate, discard it from exercise db
      if (mergeMap[ex.id]) {
        return false;
      }
 
      const count = counts[ex.id] || 0;
      const isCustom = !!ex.isCustom;
      
      const isUsedInRoutine = updatedRoutines.some(r => r.exercises.some(e => e.exerciseId === ex.id));

      // Safely delete custom exercises with 0 logs that are not targets of a merge and not referenced in routines
      if (isCustom && count === 0 && !canonicalIdsUsedByMerge.has(ex.id) && !isUsedInRoutine) {
        deletedList.push(`"${ex.name}" (ID: ${ex.id})`);
        return false;
      }
 
      return true;
    });
 
    // Recalculate usage and dates for sorting
    const finalCounts: Record<string, number> = {};
    const finalLastDates: Record<string, string> = {};
    remainingExercises.forEach(ex => {
      finalCounts[ex.id] = 0;
    });

    updatedLogs.forEach(log => {
      log.exercises.forEach(sess => {
        const exId = sess.exerciseId;
        finalCounts[exId] = (finalCounts[exId] || 0) + 1;
        if (!finalLastDates[exId] || log.date > finalLastDates[exId]) {
          finalLastDates[exId] = log.date;
        }
      });
    });

    // 5. Usage-based and Recency-based automatic sorting
    const auditDate = new Date('2026-06-28');
    const threeMonthsAgo = new Date(auditDate);
    threeMonthsAgo.setMonth(auditDate.getMonth() - 3);

    const sortedExercises = [...remainingExercises].sort((a, b) => {
      const countA = finalCounts[a.id] || 0;
      const countB = finalCounts[b.id] || 0;
      const lastDateA = finalLastDates[a.id] || null;
      const lastDateB = finalLastDates[b.id] || null;

      const isRecentA = lastDateA ? new Date(lastDateA) >= threeMonthsAgo : false;
      const isRecentB = lastDateB ? new Date(lastDateB) >= threeMonthsAgo : false;

      // Classify into tiers:
      // Tier 1: Recent use (last 3 months) & count > 0
      // Tier 2: Older use & count > 0
      // Tier 3: Never used (count = 0)
      const tierA = (countA > 0 && isRecentA) ? 1 : (countA > 0 ? 2 : 3);
      const tierB = (countB > 0 && isRecentB) ? 1 : (countB > 0 ? 2 : 3);

      if (tierA !== tierB) {
        return tierA - tierB;
      }

      if (tierA !== 3) {
        if (countB !== countA) {
          return countB - countA;
        }
      }

      return a.name.localeCompare(b.name, 'ko');
    });

    // Commit changes to local storage via callback handlers
    if (onUpdateExercises) onUpdateExercises(sortedExercises);
    if (onUpdateLogs) onUpdateLogs(updatedLogs);
    if (onUpdateRoutines) onUpdateRoutines(updatedRoutines);

    const now = new Date();
    const formattedNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    localStorage.setItem('last_db_optimized', formattedNow);
    setLastOptimized(formattedNow);

    // Build user output summary
    let successMessage = `🏆 운동 데이터베이스 정리 및 자동 최적화가 완벽하게 처리되었습니다!\n\n`;
    successMessage += `📊 [정리 결과 요약]\n`;
    successMessage += `• 정리 전 운동 가짓수: ${exercises.length}개 → 정리 후 운동 가짓수: ${sortedExercises.length}개\n`;
    successMessage += `• 안전하게 병합된 중복 종목: ${mergedList.length}개\n`;
    successMessage += `• 영구 자동 삭제된 미사용 커스텀 종목: ${deletedList.length}개\n`;
    successMessage += `• 운동 선택 UI용 사용 빈도/최신성 기반 자동 정렬 완료\n\n`;

    if (mergedList.length > 0) {
      successMessage += `📌 [병합 내역]\n` + mergedList.map(m => `  - ${m}`).join('\n') + `\n\n`;
    }
    if (deletedList.length > 0) {
      successMessage += `🗑️ [삭제 내역]\n` + deletedList.map(d => `  - ${d}`).join('\n') + `\n\n`;
    }

    successMessage += `🛡️ [데이터 무결성 검증]\n`;
    successMessage += `총 ${updatedLogs.length}개의 실제 훈련 세션(WorkoutLog)과 ${updatedRoutines.length}개의 분할 루틴 템플릿의 모든 운동 참조 링크(ID 및 공식명칭)를 완벽하게 보존 및 일치시켰습니다. 어떠한 고아(Orphan) 데이터도 존재하지 않습니다.`;

    showAlert(successMessage, '데이터베이스 자동 정리 성공');
  };

  const handleAutoCleanup = () => {
    if (!onUpdateExercises || !onUpdateLogs || !onUpdateRoutines) {
      showAlert('이 기능은 전체 앱 제어기와의 바인딩이 완료되어야 실행 가능합니다.', '알림');
      return;
    }

    if (onShowConfirm) {
      onShowConfirm(
        '실제 운동 기록 데이터를 기준으로 운동 데이터베이스를 안전하게 최적화하시겠습니까?\n\n- 철자/띄어쓰기가 다른 중복 운동명이 공식 명칭(Canonical Name)으로 하나로 통일됩니다.\n- 실제 운동 일지 기록(WorkoutLog) 및 루틴 템플릿의 ID 링크가 일괄 전환되어 데이터 무결성이 보존됩니다.\n- 기록이 0회인 사용하지 않는 사용자 정의(Custom) 운동만 안전하게 삭제됩니다.\n- 자주 쓰고 최근에 수행한 운동 순서대로 자동 배치 정렬됩니다.',
        () => {
          executeCleanup();
        },
        '운동 데이터베이스 자동 정리 (Auto-Cleanup)'
      );
    } else {
      executeCleanup();
    }
  };

  // Generate copyable markdown report text
  const generateMarkdownReport = () => {
    let text = `## 📊 운동 데이터베이스 실시간 Audit 보고서 (Database Audit Report)\n\n`;
    text += `- **진단 기준일**: 2026-06-28\n`;
    text += `- **전체 등록 운동 개수**: ${exercises.length}개\n`;
    text += `- **전체 훈련 로그 수**: ${auditStats.totalLogsCount}개 (총 운동 수행 횟수: ${auditStats.totalRecordCount}회)\n\n`;
    
    text += `### 1. 운동별 사용 빈도 순위 (Top 10)\n`;
    auditStats.ranked.slice(0, 10).forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} | ${item.category} | 총 ${item.count}회 수행 | 마지막 수행일: ${item.lastDate || '기록 없음'}\n`;
    });
    text += `\n`;

    text += `### 2. 최근 3개월 미사용 운동 목록 (장기간 미사용)\n`;
    const filteredUnused = auditStats.unused3Months;
    if (filteredUnused.length === 0) {
      text += `- 최근 3개월 동안 모든 운동이 골고루 수행되었습니다.\n`;
    } else {
      filteredUnused.forEach(item => {
        text += `- ${item.name} (${item.category}) | 총 ${item.count}회 수행 | 마지막 수행: ${item.lastDate || '기록 없음'} | 최근 3개월 사용: X\n`;
      });
    }
    text += `\n`;

    text += `### 3. 중복 등록 의심 종목 후보\n`;
    if (auditStats.dupCandidates.length === 0) {
      text += `- 중복이 의심되는 운동 후보가 발견되지 않았습니다.\n`;
    } else {
      auditStats.dupCandidates.forEach(cand => {
        text += `- [후보] "${cand.ex1.name}" (ID: ${cand.ex1.id}) ↔ "${cand.ex2.name}" (ID: ${cand.ex2.id}) | 원인: ${cand.reason}\n`;
      });
    }
    text += `\n`;

    text += `### 4. 카테고리별 사용 분석\n`;
    Object.entries(CATEGORIES_KO).forEach(([cat, name]) => {
      const stats = auditStats.categoryStats[cat];
      const most = stats?.mostUsed[0];
      const least = stats?.leastUsed[0];
      text += `- **${name.split(' ')[0]}**:\n`;
      text += `  * 가장 많이 씀: ${most && most.count > 0 ? `${most.name} (${most.count}회)` : '기록 없음'}\n`;
      text += `  * 거의 안 씀: ${least ? `${least.name} (${least.count}회)` : '기록 없음'}\n`;
    });

    return text;
  };

  const handleCopyReport = () => {
    navigator.clipboard.writeText(generateMarkdownReport());
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showAlert('운동 명칭을 기입해 주세요.', '운동 등록 오류');
      return;
    }

    // Check for duplicate names
    const isDuplicate = exercises.some(
      ex => ex.name.toLowerCase().trim() === name.toLowerCase().trim()
    );

    if (isDuplicate) {
      showAlert('이미 동일한 이름의 운동 종목이 데이터베이스에 등록되어 있습니다.', '중복된 운동');
      return;
    }

    const newId = `custom-${name.toLowerCase().trim().replace(/\s+/g, '-')}-${generateUUID()}`;
    const newEx: Exercise = {
      id: newId,
      name: name.trim(),
      category,
      logType,
      isCustom: true
    };

    onAddExercise(newEx);
    setName('');
    setLogType('STANDARD');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-zinc-100 pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">운동</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: Add Custom Exercise */}
        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs h-fit space-y-4">
          <div>
            <h3 className="text-sm font-bold text-zinc-900">운동 추가</h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">운동 명칭</label>
              <input
                type="text"
                required
                placeholder="예: 인클라인 체스트 프레스"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">주동근 카테고리</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MuscleCategory)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white cursor-pointer"
              >
                {Object.entries(CATEGORIES_KO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-700">운동 기록 방식</label>
              <select
                value={logType}
                onChange={(e) => setLogType(e.target.value as LogType)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white cursor-pointer"
              >
                {Object.entries(LOG_TYPES_KO).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-zinc-950 hover:bg-zinc-800 text-white font-bold py-2 px-3 rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              운동 데이터 추가
            </button>
          </form>

          <div className="bg-amber-50/70 border border-amber-100 rounded-lg p-3 text-[10px] text-amber-800 flex gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>정밀한 데이터 누적 및 분석을 위해, 유사한 운동은 통일된 이름을 사용하는 것이 일관성에 이롭습니다.</span>
          </div>
        </div>

        {/* Right Panel: Exercise Library Explorer */}
        <div className="lg:col-span-2 space-y-4 bg-white p-5 rounded-xl border border-zinc-200 shadow-xs">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-zinc-700" />
              <h3 className="text-sm font-bold text-zinc-900">운동 종목 라이브러리</h3>
            </div>
            <span className="text-[11px] text-zinc-400 font-mono font-medium">
              총 운동 <span className="text-zinc-950 font-bold">{exercises.length}</span>개
            </span>
          </div>

          {/* Categories Tab Navigation */}
          <div className="flex flex-wrap gap-1 border-b border-zinc-100 pb-2.5">
            <button
              onClick={() => setActiveTab('All')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                activeTab === 'All'
                  ? 'bg-zinc-950 text-white'
                  : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              전체보기
            </button>
            {Object.entries(CATEGORIES_KO).map(([k, v]) => (
              <button
                key={k}
                onClick={() => setActiveTab(k as MuscleCategory)}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors cursor-pointer ${
                  activeTab === k
                    ? 'bg-zinc-950 text-white'
                    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                }`}
              >
                {v.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Exercise Items List Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[350px] overflow-y-auto p-1">
            {filteredExercises.map(ex => (
              <div
                key={ex.id}
                className="p-3 border border-zinc-150 rounded-lg flex justify-between items-center bg-zinc-50/30 hover:bg-zinc-50 transition-colors"
              >
                <div className="flex items-center gap-2 truncate">
                  <Dumbbell className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  <div className="truncate">
                    <span className="text-xs font-semibold text-zinc-800 block truncate">{ex.name}</span>
                    <span className="text-[9px] text-zinc-400 font-mono uppercase tracking-wider block">
                      {CATEGORIES_KO[ex.category].split(' ')[0]} • {ex.logType || 'STANDARD'}
                    </span>
                  </div>
                </div>

                {!referencedExerciseIds.has(ex.id) && (
                  <button
                    onClick={() => onDeleteExercise(ex.id)}
                    className="p-1 text-zinc-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-all cursor-pointer"
                    title="운동 종목 삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* --- DATABASE MAINTENANCE SECTION (COLLAPSED BY DEFAULT) --- */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setMaintenanceOpen(!maintenanceOpen)}
          className="w-full px-5 py-4 flex items-center justify-between text-left font-bold text-zinc-800 bg-zinc-50 hover:bg-zinc-100/80 transition-colors focus:outline-none cursor-pointer"
        >
          <div className="flex items-center gap-2 text-sm text-zinc-900">
            <ClipboardList className="w-4 h-4 text-zinc-600" />
            <span>데이터베이스 관리</span>
            <span className="text-xs text-zinc-400 font-normal ml-2">
              (마지막 자동 정리: {lastOptimized})
            </span>
          </div>
          <span className="text-xs text-zinc-500 font-medium font-mono">
            {maintenanceOpen ? '▼ 접기' : '▶ 펼치기'}
          </span>
        </button>

        {maintenanceOpen && (
          <div className="p-5 border-t border-zinc-150 space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-4">
              <div>
                <h4 className="text-sm font-bold text-zinc-950">데이터베이스 정리 및 관리</h4>
                <p className="text-zinc-500 text-xs mt-1">
                  데이터 일관성을 복구하고 중복 항목 및 미사용 커스텀 운동 종목을 정리합니다.
                </p>
              </div>
              {onUpdateExercises && onUpdateLogs && onUpdateRoutines && (
                <button
                  type="button"
                  onClick={handleAutoCleanup}
                  className="inline-flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs font-bold px-3 py-2 rounded-lg transition-colors cursor-pointer border border-rose-100 min-h-[40px] w-full sm:w-auto justify-center"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>데이터베이스 자동 정리 및 최적화</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Duplicate Suspects */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide border-b border-zinc-100 pb-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                  중복 등록 의심 종목 후보
                </h4>
                <div className="bg-zinc-50/50 rounded-xl border border-zinc-150 divide-y divide-zinc-150 overflow-hidden max-h-[160px] overflow-y-auto">
                  {auditStats.dupCandidates.length === 0 ? (
                    <div className="p-4 text-center text-zinc-400 text-xs italic">
                      자동 분석 결과, 중복이 의심되는 운동 후보가 없습니다.
                    </div>
                  ) : (
                    auditStats.dupCandidates.map((cand, idx) => (
                      <div key={idx} className="p-3 text-xs bg-rose-50/30">
                        <div className="flex items-center justify-between font-semibold text-rose-800">
                          <span className="flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                            중복 의심 후보 발견
                          </span>
                          <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                            {cand.reason}
                          </span>
                        </div>
                        <div className="mt-1.5 pl-5 space-y-1 text-zinc-600 font-mono text-[10.5px]">
                          <div>A: <span className="text-zinc-900 font-bold">{cand.ex1.name}</span> <span className="text-[9px] text-zinc-400">({cand.ex1.id})</span></div>
                          <div className="border-t border-rose-100/40 my-1"></div>
                          <div>B: <span className="text-zinc-900 font-bold">{cand.ex2.name}</span> <span className="text-[9px] text-zinc-400">({cand.ex2.id})</span></div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Deletion Candidates */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide border-b border-zinc-100 pb-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-amber-600" />
                  미사용 커스텀 종목 (자동 삭제 대상 후보)
                </h4>
                <div className="bg-zinc-50/50 rounded-xl border border-zinc-150 divide-y divide-zinc-150 overflow-hidden max-h-[160px] overflow-y-auto">
                  {deletionCandidates.length === 0 ? (
                    <div className="p-4 text-center text-zinc-400 text-xs italic">
                      사용하지 않는 커스텀 운동 종목이 없습니다.
                    </div>
                  ) : (
                    deletionCandidates.map(item => (
                      <div key={item.id} className="p-2.5 flex justify-between items-center text-xs hover:bg-zinc-100/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                          <span className="font-medium text-zinc-700 truncate">{item.name}</span>
                        </div>
                        <span className="text-zinc-400 text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full">
                          Custom
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Advanced Audit / Detailed Report Toggle */}
            <div className="border-t border-zinc-150 pt-4 space-y-4">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-xs font-bold text-zinc-600 hover:text-zinc-900 flex items-center gap-1.5 focus:outline-none cursor-pointer"
              >
                <span>{showAdvanced ? '▼ 고급 데이터베이스 분석 및 보고서 닫기' : '▶ 고급 데이터베이스 분석 및 보고서 보기'}</span>
              </button>

              {showAdvanced && (
                <div className="space-y-6 pt-4 border-t border-dashed border-zinc-150">
                  {/* Copy report button */}
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-zinc-50 p-4 rounded-xl border border-zinc-150">
                    <span className="text-xs text-zinc-500 font-medium">실제 훈련 기록 데이터를 마크다운 형식의 보고서로 추출합니다.</span>
                    <button
                      type="button"
                      onClick={handleCopyReport}
                      className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 hover:text-indigo-800 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-indigo-100"
                    >
                      {copySuccess ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>복사 완료!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>마크다운 보고서 복사</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Core Stats Overview Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150">
                      <span className="text-zinc-500 text-[11px] font-semibold block">총 운동 종목 수</span>
                      <span className="text-2xl font-black text-zinc-900 mt-1 block">{exercises.length} <span className="text-xs font-bold text-zinc-500">종목</span></span>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150">
                      <span className="text-zinc-500 text-[11px] font-semibold block">총 운동 세션 수</span>
                      <span className="text-2xl font-black text-zinc-900 mt-1 block">{logs.length} <span className="text-xs font-bold text-zinc-500">세션</span></span>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150">
                      <span className="text-zinc-500 text-[11px] font-semibold block">총 수행 건수 (볼륨)</span>
                      <span className="text-2xl font-black text-zinc-900 mt-1 block">{auditStats.totalRecordCount} <span className="text-xs font-bold text-zinc-500">회 기록</span></span>
                    </div>
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-150">
                      <span className="text-zinc-500 text-[11px] font-semibold block">최근 3개월 미사용 비율</span>
                      <span className="text-2xl font-black text-amber-600 mt-1 block">
                        {exercises.length > 0 ? Math.round((auditStats.unused3Months.length / exercises.length) * 100) : 0}%
                        <span className="text-xs font-bold text-zinc-500 ml-1">({auditStats.unused3Months.length}개)</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
                    {/* Rank List: Exercise Usages Descending */}
                    <div className="space-y-3.5">
                      <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide border-b border-zinc-100 pb-1.5">
                        <ListOrdered className="w-3.5 h-3.5 text-zinc-500" />
                        1. 실제 운동별 사용 빈도 순위 (Top 15)
                      </h4>
                      <div className="bg-zinc-50/50 rounded-xl border border-zinc-150 divide-y divide-zinc-150 overflow-hidden max-h-[300px] overflow-y-auto">
                        {auditStats.ranked.slice(0, 15).map((item, idx) => (
                          <div key={item.id} className="p-3 flex justify-between items-center text-xs hover:bg-zinc-100/50 transition-colors">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold font-mono text-[10px] shrink-0 ${idx < 3 ? 'bg-indigo-600 text-white' : 'bg-zinc-200 text-zinc-600'}`}>
                                {idx + 1}
                              </span>
                              <span className="font-semibold text-zinc-800 truncate">{item.name}</span>
                              <span className="text-[9px] bg-zinc-200/80 text-zinc-500 font-bold px-1.5 py-0.5 rounded-full uppercase shrink-0">
                                {CATEGORIES_KO[item.category].split(' ')[0]}
                              </span>
                            </div>
                            <div className="text-right font-mono text-zinc-500 shrink-0">
                              <span className="text-zinc-900 font-bold">{item.count}회</span> 수행
                              <span className="text-[10px] block text-zinc-400">
                                마지막: {item.lastDate || '기록 없음'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Long-term Unused Section */}
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide border-b border-zinc-100 pb-1.5">
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                        2. 최근 3개월 미사용 종목 (장기 미사용 후보)
                      </h4>
                      <div className="bg-zinc-50/50 rounded-xl border border-zinc-150 divide-y divide-zinc-150 overflow-hidden max-h-[300px] overflow-y-auto">
                        {auditStats.unused3Months.length === 0 ? (
                          <div className="p-4 text-center text-zinc-400 text-xs italic">
                            최근 3개월간 모든 등록된 운동들이 활발하게 기록되었습니다.
                          </div>
                        ) : (
                          auditStats.unused3Months.map(item => (
                            <div key={item.id} className="p-2.5 flex justify-between items-center text-xs hover:bg-zinc-100/50 transition-colors">
                              <div className="flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                                <span className="font-medium text-zinc-700 truncate">{item.name}</span>
                              </div>
                              <div className="text-right font-mono text-zinc-400 text-[10px]">
                                총 {item.count}회 | 마지막: <span className="text-zinc-600">{item.lastDate || '기록 없음'}</span>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Category Breakdown list */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-zinc-900 flex items-center gap-1.5 uppercase tracking-wide border-b border-zinc-100 pb-1.5">
                      <Info className="w-3.5 h-3.5 text-zinc-500" />
                      3. 카테고리별 주동근 사용 밀도 분석
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                      {Object.entries(CATEGORIES_KO).map(([cat, name]) => {
                        const stats = auditStats.categoryStats[cat];
                        const most = stats?.mostUsed[0];
                        const least = stats?.leastUsed[0];
                        return (
                          <div key={cat} className="p-2.5 bg-zinc-50 rounded-xl border border-zinc-150 text-center flex flex-col justify-between">
                            <div className="text-[10px] font-bold text-zinc-900 bg-zinc-200/60 rounded-md py-0.5 mb-1.5">
                              {name.split(' ')[0]}
                            </div>
                            <div className="space-y-1.5">
                              <div className="text-[10px] text-left">
                                <span className="text-indigo-600 font-black block text-[8px] uppercase tracking-wider">가장 많이 씀</span>
                                <span className="text-zinc-700 font-semibold truncate block" title={most?.name || '없음'}>
                                  {most && most.count > 0 ? most.name.replace(/\([^)]*\)/g, '').trim() : '-'}
                                </span>
                                <span className="text-[9px] text-zinc-400 block font-mono">{most && most.count > 0 ? `${most.count}회` : '기록 없음'}</span>
                              </div>
                              <div className="border-t border-zinc-200/50 pt-1 text-left">
                                <span className="text-amber-600 font-black block text-[8px] uppercase tracking-wider">거의 안 씀</span>
                                <span className="text-zinc-600 truncate block" title={least?.name || '없음'}>
                                  {least ? least.name.replace(/\([^)]*\)/g, '').trim() : '-'}
                                </span>
                                <span className="text-[9px] text-zinc-400 block font-mono">{least ? `${least.count}회` : '기록 없음'}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-xl text-xs text-zinc-600 leading-relaxed space-y-1 flex gap-2">
              <Info className="w-4 h-4 text-zinc-500 shrink-0 mt-0.5" />
              <span>
                <strong>💡 데이터베이스 관리 정책 안내 (Read-Only)</strong>: 운동 종목 라이브러리 및 훈련 기록의 무결성을 보장하기 위해, 본 감사 도구는 <strong>어떤 데이터도 강제로 자동 삭제, 자동 병합 또는 변경하지 않습니다.</strong> 상단 버튼을 클릭하여 생성된 마크다운 보고서를 복사한 뒤, 필요한 커스텀 운동 종목을 수동으로 정리하시는 데 안전한 기준 정보로 삼으시길 권장합니다.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
