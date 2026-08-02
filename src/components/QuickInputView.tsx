/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef, KeyboardEvent } from 'react';
import { WorkoutLog, ExerciseSession, SetRecord, Exercise, Routine, LogType } from '../types';
import { formatWorkoutDateShort, getLocalDateString } from '../utils/dateUtils';
import { formatSetRecordsList, formatSetRecord } from '../utils/formatter';
import { getSortedExercises } from '../utils/sorting';
import { 
  Dumbbell, 
  Scale, 
  Plus, 
  Minus, 
  Check, 
  Flame, 
  Sparkles, 
  PlusCircle, 
  Trash2, 
  ChevronRight, 
  TrendingDown, 
  TrendingUp, 
  RotateCcw,
  Clock,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { weightRepository } from '../storage/weightRepository';
import { generateUUID } from '../utils/workoutEngine';

interface QuickInputViewProps {
  exercises: Exercise[];
  routines: Routine[];
  history: WorkoutLog[];
  onSave: (log: WorkoutLog) => void;
  onCancel: () => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
  weightLogs?: LocalWeightLog[];
  onSaveWeight?: (logs: LocalWeightLog[]) => void;
  initialRoutineId?: string;
  onClearInitialRoutine?: () => void;
}

interface LocalWeightLog {
  id: string;
  date: string;
  weight: number;
}

export default function QuickInputView({
  exercises,
  routines,
  history,
  onSave,
  onCancel,
  onShowAlert,
  onShowConfirm,
  weightLogs: propWeightLogs,
  onSaveWeight,
  initialRoutineId,
  onClearInitialRoutine
}: QuickInputViewProps) {
  const showAlert = (message: string, title?: string) => {
    if (onShowAlert) {
      onShowAlert(message, title);
    } else {
      alert(message);
    }
  };
  const [activeSubTab, setActiveSubTab] = useState<'workout' | 'weight'>('workout');
  
  // --- Weight Quick Input State ---
  const [currentWeightInput, setCurrentWeightInput] = useState<number>(72.6);
  const [weightLogs, setWeightLogs] = useState<LocalWeightLog[]>([]);
  const sortedWeightLogs = useMemo(() => {
    return [...weightLogs].sort((a, b) => b.date.localeCompare(a.date));
  }, [weightLogs]);
  const [weightFeedbackMessage, setWeightFeedbackMessage] = useState<string | null>(null);
  const [weightLogToDelete, setWeightLogToDelete] = useState<LocalWeightLog | null>(null);
  const [deleteToastMessage, setDeleteToastMessage] = useState<string | null>(null);
  const todayStr = useMemo(() => getLocalDateString(), []);

  // --- Weight Slider Range Calculations ---
  const recentWeight = useMemo(() => {
    if (sortedWeightLogs.length > 0) {
      return sortedWeightLogs[0].weight;
    }
    return 72.6; // default fallback
  }, [sortedWeightLogs]);

  const sliderMin = useMemo(() => {
    const base = recentWeight - 5;
    return Math.max(0, Number(Math.min(currentWeightInput, base).toFixed(1)));
  }, [recentWeight, currentWeightInput]);

  const sliderMax = useMemo(() => {
    const base = recentWeight + 5;
    return Number(Math.max(currentWeightInput, base).toFixed(1));
  }, [recentWeight, currentWeightInput]);

  const percentage = useMemo(() => {
    const range = sliderMax - sliderMin;
    if (range === 0) return 0;
    return ((currentWeightInput - sliderMin) / range) * 100;
  }, [currentWeightInput, sliderMin, sliderMax]);

  const ticks = useMemo(() => {
    const t = [];
    const start = Math.ceil(sliderMin);
    const end = Math.floor(sliderMax);
    for (let v = start; v <= end; v++) {
      t.push(v);
    }
    return t;
  }, [sliderMin, sliderMax]);

  const hasTodayLog = useMemo(() => {
    return sortedWeightLogs.some(log => log.date === todayStr);
  }, [sortedWeightLogs, todayStr]);

  // --- Workout Quick Input State ---
  const [workoutDate, setWorkoutDate] = useState<string>(() => getLocalDateString());
  const [workoutStartTime, setWorkoutStartTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>('');
  const [workoutNotes, setWorkoutNotes] = useState<string>('');
  const [activeSessions, setActiveSessions] = useState<ExerciseSession[]>([]);
  const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({}); // setId -> isCompleted
  const [workoutFeedbackMessage, setWorkoutFeedbackMessage] = useState<string | null>(null);

  const sortedExercises = useMemo(() => {
    const activeIds = activeSessions.map(s => s.exerciseId);
    return getSortedExercises(exercises, history, activeIds);
  }, [exercises, history, activeSessions]);

  // Timer Refs for Cleanup
  const weightTimerRef = useRef<any>(null);
  const workoutTimerRef = useRef<any>(null);

  // Cleanup on Unmount
  useEffect(() => {
    return () => {
      if (weightTimerRef.current) clearTimeout(weightTimerRef.current);
      if (workoutTimerRef.current) clearTimeout(workoutTimerRef.current);
    };
  }, []);

  // Initialize Weight Logs from weightRepository or props
  useEffect(() => {
    if (propWeightLogs) {
      setWeightLogs(propWeightLogs);
    } else {
      setWeightLogs(weightRepository.getWeightLogs());
    }
  }, [propWeightLogs]);

  // Sync latest logged weight as default
  useEffect(() => {
    if (sortedWeightLogs.length > 0) {
      setCurrentWeightInput(sortedWeightLogs[0].weight);
    }
  }, [sortedWeightLogs]);

  // Handle Weight Log Submit
  const handleSaveWeight = () => {
    const isUpdate = sortedWeightLogs.some(log => log.date === todayStr);
    const updated = weightRepository.saveWeightLog(todayStr, currentWeightInput);
    setWeightLogs(updated);
    if (onSaveWeight) {
      onSaveWeight(updated);
    }

    // Calculate delta for live feedback
    const filtered = updated.filter(w => w.date !== todayStr);
    const previousLog = filtered[0];
    let deltaText = '';
    if (previousLog) {
      const diff = currentWeightInput - previousLog.weight;
      if (diff > 0) deltaText = `(이전 대비 +${diff.toFixed(1)}kg 증가)`;
      else if (diff < 0) deltaText = `(이전 대비 ${diff.toFixed(1)}kg 감소)`;
      else deltaText = `(이전 기록과 동일)`;
    }

    setWeightFeedbackMessage(`⚖️ 오늘 체중 ${currentWeightInput.toFixed(1)}kg ${isUpdate ? '수정' : '입력'} 완료! ${deltaText}`);
    if (weightTimerRef.current) clearTimeout(weightTimerRef.current);
    weightTimerRef.current = setTimeout(() => setWeightFeedbackMessage(null), 4000);

    // Dynamic toast message according to requirement 10
    setDeleteToastMessage(isUpdate ? '체중을 수정했습니다.' : '체중을 기록했습니다.');
  };

  // Keyboard navigation support for range slider
  const handleSliderKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const stepValue = e.shiftKey ? 1.0 : 0.1;
      const direction = e.key === 'ArrowLeft' ? -1 : 1;
      e.preventDefault();
      setCurrentWeightInput(prev => {
        const nextVal = Math.max(sliderMin, Math.min(sliderMax, prev + direction * stepValue));
        return Number(nextVal.toFixed(1));
      });
    }
  };

  const confirmDeleteWeight = (log: LocalWeightLog) => {
    setWeightLogToDelete(log);
  };

  const handleDeleteWeightConfirm = () => {
    if (!weightLogToDelete) return;
    const updated = weightRepository.deleteWeightLog(weightLogToDelete.id);
    setWeightLogs(updated);
    if (onSaveWeight) {
      onSaveWeight(updated);
    }
    setWeightLogToDelete(null);
    setDeleteToastMessage('체중 기록을 삭제했습니다.');
  };

  // Auto dismiss delete toast after 2 seconds
  useEffect(() => {
    if (deleteToastMessage) {
      const timer = setTimeout(() => {
        setDeleteToastMessage(null);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [deleteToastMessage]);

  // Helper: Find previous session for an exercise to auto-populate weights & reps
  const getPreviousSessionData = (exerciseId: string): { date: string; sets: SetRecord[] } | null => {
    const targetEx = exercises.find(e => e.id === exerciseId);
    const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
    for (const log of sortedHistory) {
      const foundEx = log.exercises.find(e => e.exerciseId === exerciseId || (targetEx && e.exerciseName === targetEx.name));
      if (foundEx && foundEx.sets.length > 0) {
        return {
          date: log.date,
          sets: foundEx.sets
        };
      }
    }
    return null;
  };

  const getExerciseLogType = (exerciseId: string, exerciseName?: string): LogType => {
    const ex = exercises.find(e => e.id === exerciseId || (exerciseName && e.name === exerciseName));
    return ex?.logType || 'STANDARD';
  };

  // Routine selection helper
  const handleSelectRoutine = (routineId: string) => {
    setSelectedRoutineId(routineId);
    if (!routineId) {
      setActiveSessions([]);
      setCompletedSets({});
      return;
    }

    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    const templateSessions: ExerciseSession[] = routine.exercises.map(re => {
      const prevSession = getPreviousSessionData(re.exerciseId);
      const defaultSets: SetRecord[] = [];
      const exLogType = getExerciseLogType(re.exerciseId, re.exerciseName);
      
      if (prevSession && prevSession.sets.length > 0) {
        prevSession.sets.forEach((prevSet) => {
          defaultSets.push({
            id: generateUUID(),
            weight: prevSet.weight,
            reps: prevSet.reps,
            isWarmup: prevSet.isWarmup,
            timeSeconds: prevSet.timeSeconds,
            distanceKm: prevSet.distanceKm
          });
        });
      } else {
        const count = exLogType === 'CARDIO' ? 1 : re.targetSetsCount;
        for (let i = 0; i < count; i++) {
          defaultSets.push({
            id: generateUUID(),
            weight: 0,
            reps: exLogType === 'TIME_BASED' ? 0 : 10,
            isWarmup: i === 0 && count > 3 ? true : false,
            timeSeconds: exLogType === 'TIME_BASED' ? 60 : exLogType === 'CARDIO' ? 0 : undefined,
            distanceKm: exLogType === 'CARDIO' ? 0 : undefined
          });
        }
      }

      return {
        exerciseId: re.exerciseId,
        exerciseName: re.exerciseName,
        category: re.category,
        sets: defaultSets
      };
    });

    // Auto-mark completed sets as false initially
    const initialCompleted: Record<string, boolean> = {};
    templateSessions.forEach(session => {
      session.sets.forEach(set => {
        initialCompleted[set.id] = false;
      });
    });

    setActiveSessions(templateSessions);
    setCompletedSets(initialCompleted);
    
    setWorkoutFeedbackMessage(`⚡ '${routine.name}' 루틴 로드 완료!`);
    if (workoutTimerRef.current) clearTimeout(workoutTimerRef.current);
    workoutTimerRef.current = setTimeout(() => setWorkoutFeedbackMessage(null), 3000);
  };

  // Pre-select initial routine if passed as prop
  useEffect(() => {
    if (initialRoutineId) {
      handleSelectRoutine(initialRoutineId);
      if (onClearInitialRoutine) {
        onClearInitialRoutine();
      }
    }
  }, [initialRoutineId]);

  // Add individual exercise to active list
  const handleAddExercise = (exerciseId: string) => {
    if (!exerciseId) return;
    const exercise = exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    if (activeSessions.some(as => as.exerciseId === exerciseId)) {
      showAlert('이미 추가된 운동입니다.', '운동 추가 오류');
      return;
    }

    const prevSession = getPreviousSessionData(exerciseId);
    const defaultSets: SetRecord[] = [];
    const exLogType = exercise.logType || 'STANDARD';

    if (prevSession && prevSession.sets.length > 0) {
      prevSession.sets.forEach((prevSet) => {
        defaultSets.push({
          id: generateUUID(),
          weight: prevSet.weight,
          reps: prevSet.reps,
          isWarmup: prevSet.isWarmup,
          timeSeconds: prevSet.timeSeconds,
          distanceKm: prevSet.distanceKm
        });
      });
    } else {
      const count = exLogType === 'CARDIO' ? 1 : 1;
      for (let i = 0; i < count; i++) {
        defaultSets.push({
          id: generateUUID(),
          weight: 0,
          reps: exLogType === 'TIME_BASED' ? 0 : 10,
          isWarmup: false,
          timeSeconds: exLogType === 'TIME_BASED' ? 60 : exLogType === 'CARDIO' ? 0 : undefined,
          distanceKm: exLogType === 'CARDIO' ? 0 : undefined
        });
      }
    }

    const newSession: ExerciseSession = {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      category: exercise.category,
      sets: defaultSets
    };

    const updatedCompleted = { ...completedSets };
    defaultSets.forEach(s => {
      updatedCompleted[s.id] = false;
    });

    setActiveSessions([...activeSessions, newSession]);
    setCompletedSets(updatedCompleted);
  };

  // Remove individual exercise
  const handleRemoveExercise = (exerciseId: string) => {
    setActiveSessions(activeSessions.filter(as => as.exerciseId !== exerciseId));
  };

  // Add a set to an exercise
  const handleAddSet = (exerciseId: string) => {
    const asEx = activeSessions.find(as => as.exerciseId === exerciseId);
    const exLogType = getExerciseLogType(exerciseId, asEx?.exerciseName);
    if (exLogType === 'CARDIO') return; // Cardio does not support multiple sets

    setActiveSessions(activeSessions.map(as => {
      if (as.exerciseId === exerciseId) {
        const lastSet = as.sets[as.sets.length - 1];
        const newSetId = generateUUID();
        const newSet: SetRecord = {
          id: newSetId,
          weight: lastSet ? lastSet.weight : 0,
          reps: lastSet ? lastSet.reps : (exLogType === 'TIME_BASED' ? 0 : 10),
          isWarmup: false,
          timeSeconds: lastSet ? lastSet.timeSeconds : (exLogType === 'TIME_BASED' ? 60 : undefined),
          distanceKm: lastSet ? lastSet.distanceKm : undefined
        };

        setCompletedSets(prev => ({ ...prev, [newSetId]: false }));

        return {
          ...as,
          sets: [...as.sets, newSet]
        };
      }
      return as;
    }));
  };

  // Remove last set from an exercise
  const handleRemoveSet = (exerciseId: string, setId: string) => {
    setActiveSessions(activeSessions.map(as => {
      if (as.exerciseId === exerciseId) {
        if (as.sets.length <= 1) return as;
        
        // Clean up completed sets map
        const updatedCompleted = { ...completedSets };
        delete updatedCompleted[setId];
        setCompletedSets(updatedCompleted);

        return {
          ...as,
          sets: as.sets.filter(s => s.id !== setId)
        };
      }
      return as;
    }));
  };

  // Update set weight, reps, rpe, warmup
  const handleUpdateSet = (exerciseId: string, setId: string, key: keyof SetRecord, value: any) => {
    setActiveSessions(activeSessions.map(as => {
      if (as.exerciseId === exerciseId) {
        const updatedSets = as.sets.map(s => {
          if (s.id === setId) {
            return { ...s, [key]: value };
          }
          return s;
        });
        return { ...as, sets: updatedSets };
      }
      return as;
    }));
  };

  // Toggle set completion (done) status for quick-tap tactile experience
  const handleToggleSetComplete = (setId: string, exName: string, setIdx: number, weight: number, reps: number, logType: LogType, timeSec?: number) => {
    const isNowCompleted = !completedSets[setId];
    setCompletedSets(prev => ({
      ...prev,
      [setId]: isNowCompleted
    }));

    if (isNowCompleted) {
      const tempSet = { weight, reps, timeSeconds: timeSec };
      const formatted = formatSetRecord(tempSet, logType);
      const icon = logType === 'TIME_BASED' ? '⏱️' : '🔥';
      setWorkoutFeedbackMessage(`${icon} [${exName}] ${setIdx + 1}세트 완료! (${formatted})`);
      if (workoutTimerRef.current) clearTimeout(workoutTimerRef.current);
      workoutTimerRef.current = setTimeout(() => setWorkoutFeedbackMessage(null), 3000);
    }
  };

  // Compile active workout logs and trigger save
  const handleSaveWorkout = () => {
    if (activeSessions.length === 0) {
      showAlert('등록된 운동이 없습니다. 루틴을 로드하거나 운동을 추가하세요!', '운동 없음');
      return;
    }

    // Include only sets that the user marked as completed OR if none are explicitly completed, include all of them as fallback
    const hasAnyCompleted = Object.values(completedSets).some(v => v === true);
    
    const processedSessions: ExerciseSession[] = activeSessions.map(as => {
      const filteredSets = as.sets.filter(s => {
        if (hasAnyCompleted) {
          return completedSets[s.id] === true;
        }
        return true; // if they didn't tap any, save everything as a fallback
      });

      return {
        ...as,
        sets: filteredSets
      };
    }).filter(as => as.sets.length > 0);

    if (processedSessions.length === 0) {
      showAlert('완료 처리된 세트가 없습니다! 세트 오른쪽의 완료 체크 버튼을 터치해 기록해 주세요.', '완료 세트 없음');
      return;
    }

    const log: WorkoutLog = {
      id: generateUUID(),
      date: workoutDate,
      startTime: workoutStartTime,
      routineId: selectedRoutineId || undefined,
      routineName: selectedRoutineId ? routines.find(r => r.id === selectedRoutineId)?.name : undefined,
      notes: workoutNotes,
      exercises: processedSessions
    };

    onSave(log);
  };

  // Live Statistics Calculations for active workout
  const totalExercises = activeSessions.length;
  const activeSetsArray = activeSessions.flatMap(as => {
    const exLogType = getExerciseLogType(as.exerciseId, as.exerciseName);
    return exLogType === 'CARDIO' ? [] : as.sets;
  });
  const totalSets = activeSetsArray.length;
  const completedSetsCount = activeSetsArray.filter(s => completedSets[s.id] === true).length;
  
  const estimatedWorkoutVolume = activeSetsArray.reduce((sum, s) => {
    if (completedSets[s.id] === true) {
      return sum + (s.weight * s.reps);
    }
    return sum;
  }, 0);

  return (
    <div id="quick-input-panel" className="max-w-2xl mx-auto space-y-6">
      {/* 1. View Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight sm:text-3xl">
            기록
          </h1>
        </div>
      </div>

      {/* Segmented Controller (Tabs) */}
      <div className="bg-zinc-100 p-1 rounded-xl grid grid-cols-2 gap-1 border border-zinc-200 shadow-inner">
        <button
          onClick={() => setActiveSubTab('workout')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'workout'
              ? 'bg-zinc-950 text-white shadow-md'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50/50'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          <span>오늘 운동 기록</span>
        </button>
        <button
          onClick={() => setActiveSubTab('weight')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'weight'
              ? 'bg-zinc-950 text-white shadow-md'
              : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50/50'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>오늘 체중 측정</span>
        </button>
      </div>

      {/* Dynamic Action Feed Toast Panel (최근 입력 피드백 - Live Feedback) */}
      <AnimatePresence mode="wait">
        {(weightFeedbackMessage || workoutFeedbackMessage) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded-xl flex items-center gap-2.5 shadow-lg text-xs font-bold font-mono"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
            <span>{weightFeedbackMessage || workoutFeedbackMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TABS CONTAINER */}
      <div>
        {/* Tab 1: Workout Quick Input */}
        {activeSubTab === 'workout' && (
          <div className="space-y-6">
            {/* A. Fast Routine Selector Grid */}
            <div className="space-y-2.5">
              <label className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest block">
                루틴 선택
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {routines.map((r) => {
                  const isSelected = selectedRoutineId === r.id;
                  return (
                    <button
                      key={r.id}
                      onClick={() => handleSelectRoutine(r.id)}
                      className={`text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer flex flex-col justify-between space-y-2 group ${
                        isSelected
                          ? 'bg-zinc-950 border-zinc-950 text-white shadow-lg'
                          : 'bg-white border-zinc-200 hover:border-zinc-400 hover:bg-zinc-50/50 text-zinc-800'
                      }`}
                    >
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider block ${isSelected ? 'text-amber-400' : 'text-zinc-400'}`}>
                          {r.exercises.length}개 운동
                        </span>
                        <h3 className="text-sm font-black tracking-tight mt-0.5">{r.name}</h3>
                      </div>
                      <span className={`text-[11px] font-medium leading-normal truncate w-full block ${isSelected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                        {r.description}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* B. Core Session Metadata Input */}
            <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-xs grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">훈련 날짜</span>
                <input
                  type="date"
                  value={workoutDate}
                  onChange={(e) => setWorkoutDate(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">시작 시간</span>
                <input
                  type="time"
                  value={workoutStartTime}
                  onChange={(e) => setWorkoutStartTime(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-zinc-800 focus:outline-none"
                />
              </div>
            </div>

            {/* C. Quick Add Dropdown */}
            <div className="flex items-center gap-3">
              <div className="h-px bg-zinc-200 flex-1" />
              <div className="relative shrink-0">
                <select
                  onChange={(e) => {
                    handleAddExercise(e.target.value);
                    e.target.value = '';
                  }}
                  className="bg-zinc-900 hover:bg-zinc-800 text-white text-[11px] font-bold px-3 py-2 rounded-xl border border-zinc-800 shadow-sm transition-colors cursor-pointer focus:outline-none"
                >
                  <option value="">+ 개별 운동 추가</option>
                  {sortedExercises.map(ex => (
                    <option key={ex.id} value={ex.id}>{ex.name}</option>
                  ))}
                </select>
              </div>
              <div className="h-px bg-zinc-200 flex-1" />
            </div>

            {/* D. Live Session Analytics Overview Banner */}
            {activeSessions.length > 0 && (
              <div className="bg-gradient-to-r from-zinc-900 to-zinc-850 text-white rounded-xl p-4 border border-zinc-800 shadow-lg flex items-center justify-between">
                <div className="grid grid-cols-3 gap-4 w-full divide-x divide-zinc-800 text-center">
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">활성 종목</span>
                    <span className="text-sm font-black text-white block mt-0.5">{totalExercises}개</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">완료/총 세트</span>
                    <span className="text-sm font-black text-amber-400 block mt-0.5">{completedSetsCount} / {totalSets}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">실시간 볼륨</span>
                    <span className="text-sm font-black text-emerald-400 block mt-0.5">{estimatedWorkoutVolume.toLocaleString()}kg</span>
                  </div>
                </div>
              </div>
            )}

            {/* E. Active Sessions List */}
            {activeSessions.length === 0 ? (
              <div className="border border-dashed border-zinc-200 rounded-2xl p-10 bg-zinc-50/50 text-center space-y-3">
                <Dumbbell className="w-8 h-8 text-zinc-300 mx-auto animate-pulse" />
                <div className="space-y-1">
                  <p className="text-zinc-600 text-xs font-extrabold">불러온 훈련 프로그램이 없습니다.</p>
                  <p className="text-zinc-400 text-[10px] leading-relaxed">
                    상단의 푸시, 풀, 레그 루틴 카드를 누르거나 [개별 운동 추가] 버튼을 사용해 기록을 시작하세요.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {activeSessions.map((as) => {
                  const prevData = getPreviousSessionData(as.exerciseId);
                  const logType = getExerciseLogType(as.exerciseId, as.exerciseName);
                  return (
                    <div key={as.exerciseId} className="bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                      {/* Exercise Name header */}
                      <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-150 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] bg-zinc-900 text-white px-2 py-0.5 rounded font-bold font-mono uppercase tracking-wider">
                            {as.category}
                          </span>
                          <h3 className="text-xs font-black text-zinc-800">{as.exerciseName}</h3>
                        </div>
                        <button
                          onClick={() => handleRemoveExercise(as.exerciseId)}
                          className="p-1 text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Sets list */}
                      <div className="p-4 space-y-3">
                        {/* Progressive Overload Guide Indicator */}
                        {prevData && (
                          <div className="bg-amber-50/60 border border-amber-100 rounded-lg px-2.5 py-1.5 text-[10px] text-amber-800 flex items-center justify-between font-medium">
                            <span className="truncate">
                              🎯 <strong>이전 성공 ({formatWorkoutDateShort(prevData.date)}):</strong>{' '}
                              {formatSetRecordsList(prevData.sets, logType)}
                            </span>
                            <span className="shrink-0 text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full font-bold">
                              점진적 과부하 목표
                            </span>
                          </div>
                        )}

                        {logType === 'CARDIO' ? (
                          (() => {
                            const firstSet = as.sets[0] || { id: generateUUID(), distanceKm: 0, timeSeconds: 0 };
                            const isCompleted = completedSets[firstSet.id] === true;
                            const cardioMinutes = Math.floor((firstSet.timeSeconds || 0) / 60);
                            const cardioSeconds = (firstSet.timeSeconds || 0) % 60;
                            return (
                              <div className="space-y-3.5">
                                <div className="grid grid-cols-2 gap-3">
                                  {/* Distance Card */}
                                  <div className="flex items-center justify-between bg-zinc-50/50 border border-zinc-150 rounded-xl p-2 px-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = firstSet.distanceKm || 0;
                                        handleUpdateSet(as.exerciseId, firstSet.id, 'distanceKm', Math.max(0, parseFloat((current - 0.5).toFixed(2))));
                                      }}
                                      className="p-1 hover:bg-zinc-150 text-zinc-600 rounded cursor-pointer text-xs font-bold"
                                    >
                                      -0.5
                                    </button>
                                    <div className="text-center">
                                      <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">거리</span>
                                      <div className="flex items-center justify-center gap-0.5">
                                        <input
                                          type="number"
                                          step="0.1"
                                          min="0"
                                          placeholder="0.0"
                                          value={firstSet.distanceKm ?? ''}
                                          onChange={(e) => {
                                            const val = Math.max(0, parseFloat(e.target.value) || 0);
                                            handleUpdateSet(as.exerciseId, firstSet.id, 'distanceKm', val);
                                          }}
                                          className="w-12 bg-white border border-zinc-200 rounded text-center text-xs font-black font-mono focus:outline-none py-1"
                                        />
                                        <span className="text-[10px] text-zinc-500 font-bold">km</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = firstSet.distanceKm || 0;
                                        handleUpdateSet(as.exerciseId, firstSet.id, 'distanceKm', parseFloat((current + 0.5).toFixed(2)));
                                      }}
                                      className="p-1 hover:bg-zinc-150 text-zinc-600 rounded cursor-pointer text-xs font-bold"
                                    >
                                      +0.5
                                    </button>
                                  </div>

                                  {/* Duration Card */}
                                  <div className="flex items-center justify-between bg-zinc-50/50 border border-zinc-150 rounded-xl p-2 px-3">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = firstSet.timeSeconds || 0;
                                        handleUpdateSet(as.exerciseId, firstSet.id, 'timeSeconds', Math.max(0, current - 60));
                                      }}
                                      className="p-1 hover:bg-zinc-150 text-zinc-600 rounded cursor-pointer text-xs font-bold"
                                    >
                                      -1m
                                    </button>
                                    <div className="text-center">
                                      <span className="text-[10px] font-bold text-zinc-400 block mb-0.5">시간</span>
                                      <div className="flex items-center gap-0.5 justify-center">
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="0"
                                          value={cardioMinutes || ''}
                                          onChange={(e) => {
                                            const m = Math.max(0, parseInt(e.target.value) || 0);
                                            handleUpdateSet(as.exerciseId, firstSet.id, 'timeSeconds', m * 60 + cardioSeconds);
                                          }}
                                          className="w-8 bg-white border border-zinc-200 rounded text-center text-xs font-black font-mono focus:outline-none py-1"
                                        />
                                        <span className="text-[10px] text-zinc-500 font-bold">분</span>
                                        <input
                                          type="number"
                                          min="0"
                                          max="59"
                                          placeholder="0"
                                          value={cardioSeconds || ''}
                                          onChange={(e) => {
                                            const s = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                            handleUpdateSet(as.exerciseId, firstSet.id, 'timeSeconds', cardioMinutes * 60 + s);
                                          }}
                                          className="w-8 bg-white border border-zinc-200 rounded text-center text-xs font-black font-mono focus:outline-none py-1"
                                        />
                                        <span className="text-[10px] text-zinc-500 font-bold">초</span>
                                      </div>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const current = firstSet.timeSeconds || 0;
                                        handleUpdateSet(as.exerciseId, firstSet.id, 'timeSeconds', current + 60);
                                      }}
                                      className="p-1 hover:bg-zinc-150 text-zinc-600 rounded cursor-pointer text-xs font-bold"
                                    >
                                      +1m
                                    </button>
                                  </div>
                                </div>

                                {/* Complete Toggle */}
                                <button
                                  type="button"
                                  onClick={() => {
                                    const isNowCompleted = !isCompleted;
                                    setCompletedSets(prev => ({ ...prev, [firstSet.id]: isNowCompleted }));
                                    if (isNowCompleted) {
                                      setWorkoutFeedbackMessage(`🏃 [${as.exerciseName}] 유산소 기록 완료! (${formatSetRecord(firstSet, 'CARDIO')})`);
                                      if (workoutTimerRef.current) clearTimeout(workoutTimerRef.current);
                                      workoutTimerRef.current = setTimeout(() => setWorkoutFeedbackMessage(null), 3000);
                                    }
                                  }}
                                  className={`w-full py-2.5 rounded-xl border flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer transition-all ${
                                    isCompleted
                                      ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                      : 'bg-zinc-100 border-zinc-200 hover:border-zinc-300 text-zinc-700'
                                  }`}
                                >
                                  <Check className="w-4 h-4 stroke-[3px]" />
                                  <span>{isCompleted ? '유산소 기록 완료됨' : '유산소 기록 완료하기'}</span>
                                </button>
                              </div>
                            );
                          })()
                        ) : (
                          <>
                            {/* Set Rows */}
                            <div className="space-y-2">
                              {as.sets.map((set, setIdx) => {
                                const isCompleted = completedSets[set.id] === true;
                                if (logType === 'BODYWEIGHT_REPS') {
                                  return (
                                    <div
                                      key={set.id}
                                      className={`grid grid-cols-12 gap-2 items-center p-1.5 rounded-xl border transition-all ${
                                        isCompleted
                                          ? 'bg-emerald-50/30 border-emerald-500/20'
                                          : 'bg-zinc-50/30 border-zinc-150'
                                      }`}
                                    >
                                      {/* Set number badge */}
                                      <div className="col-span-1 text-center">
                                        <span className="text-[11px] font-black font-mono text-zinc-500">
                                          S{setIdx + 1}
                                        </span>
                                      </div>

                                      {/* Warmup badge toggle */}
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSet(as.exerciseId, set.id, 'isWarmup', !set.isWarmup)}
                                        className={`col-span-2 text-[10px] py-1.5 rounded-lg font-extrabold border transition-colors cursor-pointer ${
                                          set.isWarmup
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                        }`}
                                      >
                                        {set.isWarmup ? 'W' : 'W/O'}
                                      </button>

                                      {/* Reps Control */}
                                      <div className="col-span-6 flex items-center justify-between bg-white border border-zinc-200 rounded-lg p-1">
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'reps', Math.max(0, set.reps - 1))}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <div className="text-center">
                                          <span className="text-xs font-black font-mono text-zinc-800">{set.reps}</span>
                                          <span className="text-[9px] text-zinc-400 font-bold ml-0.5">회</span>
                                        </div>
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'reps', set.reps + 1)}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {/* Checkmark */}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSetComplete(set.id, as.exerciseName, setIdx, 0, set.reps, logType)}
                                        className={`col-span-3 py-1.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                                          isCompleted
                                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                            : 'bg-white border-zinc-200 hover:border-zinc-400 text-zinc-400'
                                        }`}
                                      >
                                        <Check className="w-4 h-4 stroke-[3px]" />
                                      </button>
                                    </div>
                                  );
                                } else if (logType === 'TIME_BASED') {
                                  const minutes = Math.floor((set.timeSeconds || 0) / 60);
                                  const seconds = (set.timeSeconds || 0) % 60;
                                  return (
                                    <div
                                      key={set.id}
                                      className={`grid grid-cols-12 gap-2 items-center p-1.5 rounded-xl border transition-all ${
                                        isCompleted
                                          ? 'bg-emerald-50/30 border-emerald-500/20'
                                          : 'bg-zinc-50/30 border-zinc-150'
                                      }`}
                                    >
                                      {/* Set number badge */}
                                      <div className="col-span-1 text-center">
                                        <span className="text-[11px] font-black font-mono text-zinc-500">
                                          S{setIdx + 1}
                                        </span>
                                      </div>

                                      {/* Time Control */}
                                      <div className="col-span-8 flex items-center justify-between bg-white border border-zinc-200 rounded-lg p-1 px-2">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = set.timeSeconds || 0;
                                            handleUpdateSet(as.exerciseId, set.id, 'timeSeconds', Math.max(0, current - 10));
                                          }}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          -10초
                                        </button>
                                        <div className="flex items-center gap-1">
                                          <input
                                            type="number"
                                            min="0"
                                            placeholder="0"
                                            value={minutes || ''}
                                            onChange={(e) => {
                                              const m = Math.max(0, parseInt(e.target.value) || 0);
                                              handleUpdateSet(as.exerciseId, set.id, 'timeSeconds', m * 60 + seconds);
                                            }}
                                            className="w-8 bg-zinc-50 border border-zinc-150 rounded text-center text-xs font-black font-mono focus:outline-none"
                                          />
                                          <span className="text-[9px] text-zinc-400 font-bold">분</span>
                                          <input
                                            type="number"
                                            min="0"
                                            max="59"
                                            placeholder="0"
                                            value={seconds || ''}
                                            onChange={(e) => {
                                              const s = Math.max(0, Math.min(59, parseInt(e.target.value) || 0));
                                              handleUpdateSet(as.exerciseId, set.id, 'timeSeconds', minutes * 60 + s);
                                            }}
                                            className="w-8 bg-zinc-50 border border-zinc-150 rounded text-center text-xs font-black font-mono focus:outline-none"
                                          />
                                          <span className="text-[9px] text-zinc-400 font-bold">초</span>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const current = set.timeSeconds || 0;
                                            handleUpdateSet(as.exerciseId, set.id, 'timeSeconds', current + 10);
                                          }}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          +10초
                                        </button>
                                      </div>

                                      {/* Checkmark */}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSetComplete(set.id, as.exerciseName, setIdx, 0, 0, logType, set.timeSeconds)}
                                        className={`col-span-3 py-1.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                                          isCompleted
                                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                            : 'bg-white border-zinc-200 hover:border-zinc-400 text-zinc-400'
                                        }`}
                                      >
                                        <Check className="w-4 h-4 stroke-[3px]" />
                                      </button>
                                    </div>
                                  );
                                } else {
                                  // STANDARD
                                  return (
                                    <div
                                      key={set.id}
                                      className={`grid grid-cols-12 gap-2 items-center p-1.5 rounded-xl border transition-all ${
                                        isCompleted
                                          ? 'bg-emerald-50/30 border-emerald-500/20'
                                          : 'bg-zinc-50/30 border-zinc-150'
                                      }`}
                                    >
                                      {/* Set number badge */}
                                      <div className="col-span-1 text-center">
                                        <span className="text-[11px] font-black font-mono text-zinc-500">
                                          S{setIdx + 1}
                                        </span>
                                      </div>

                                      {/* Warmup badge toggle */}
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateSet(as.exerciseId, set.id, 'isWarmup', !set.isWarmup)}
                                        className={`col-span-2 text-[10px] py-1.5 rounded-lg font-extrabold border transition-colors cursor-pointer ${
                                          set.isWarmup
                                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                                            : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                                        }`}
                                      >
                                        {set.isWarmup ? 'W' : 'W/O'}
                                      </button>

                                      {/* Weight Control */}
                                      <div className="col-span-4 flex items-center justify-between bg-white border border-zinc-200 rounded-lg p-1">
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'weight', Math.max(0, set.weight - 2.5))}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <div className="text-center">
                                          <span className="text-xs font-black font-mono text-zinc-800">{set.weight}</span>
                                          <span className="text-[9px] text-zinc-400 font-bold ml-0.5">kg</span>
                                        </div>
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'weight', set.weight + 2.5)}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {/* Reps Control */}
                                      <div className="col-span-3 flex items-center justify-between bg-white border border-zinc-200 rounded-lg p-1">
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'reps', Math.max(0, set.reps - 1))}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Minus className="w-3 h-3" />
                                        </button>
                                        <div className="text-center">
                                          <span className="text-xs font-black font-mono text-zinc-800">{set.reps}</span>
                                          <span className="text-[9px] text-zinc-400 font-bold ml-0.5">R</span>
                                        </div>
                                        <button
                                          onClick={() => handleUpdateSet(as.exerciseId, set.id, 'reps', set.reps + 1)}
                                          className="p-1 hover:bg-zinc-100 text-zinc-500 rounded cursor-pointer"
                                        >
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </div>

                                      {/* Single Check Action Target for super fast Done tracking */}
                                      <button
                                        type="button"
                                        onClick={() => handleToggleSetComplete(set.id, as.exerciseName, setIdx, set.weight, set.reps, logType)}
                                        className={`col-span-2 py-1.5 rounded-lg border flex items-center justify-center cursor-pointer transition-all ${
                                          isCompleted
                                            ? 'bg-emerald-500 border-emerald-500 text-white shadow-sm'
                                            : 'bg-white border-zinc-200 hover:border-zinc-400 text-zinc-400'
                                        }`}
                                      >
                                        <Check className="w-4 h-4 stroke-[3px]" />
                                      </button>
                                    </div>
                                  );
                                }
                              })}
                            </div>

                            {/* Add set button row */}
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleAddSet(as.exerciseId)}
                                className="flex-1 py-1.5 border border-dashed border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition-colors cursor-pointer flex items-center justify-center gap-1"
                              >
                                <PlusCircle className="w-3.5 h-3.5" />
                                <span>세트 추가</span>
                              </button>
                              <button
                                onClick={() => {
                                  const lastSet = as.sets[as.sets.length - 1];
                                  if (lastSet) handleRemoveSet(as.exerciseId, lastSet.id);
                                }}
                                className="px-3 py-1.5 border border-zinc-200 rounded-xl text-[10px] font-bold text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                              >
                                마지막 세트 삭제
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* F. Memo Feed and Save Button */}
            <div className="space-y-4 pt-2">
              <div className="bg-white p-4 rounded-xl border border-zinc-200 space-y-1.5">
                <span className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-wider block">훈련 당일 메모 (선택)</span>
                <textarea
                  rows={2}
                  value={workoutNotes}
                  onChange={(e) => setWorkoutNotes(e.target.value)}
                  placeholder="당일 컨디션, 부상 유무, 특이사항 입력"
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg p-2.5 text-xs text-zinc-800 placeholder-zinc-400 focus:outline-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={onCancel}
                  className="px-4 py-3 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-500 hover:bg-zinc-50 transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  onClick={handleSaveWorkout}
                  className="flex-1 bg-zinc-950 hover:bg-zinc-800 text-white py-3 rounded-xl text-xs font-black tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-colors cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>오늘 운동 저장</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Weight Quick Input */}
        {activeSubTab === 'weight' && (
          <div className="space-y-6">
            <div className="bg-white border border-zinc-200 rounded-2xl p-6 shadow-sm space-y-6 text-center">
              <div className="space-y-1">
                <div className="p-2 bg-zinc-100 text-zinc-800 rounded-2xl w-11 h-11 mx-auto flex items-center justify-center">
                  <Scale className="w-5 h-5" />
                </div>
                <h2 className="text-base font-black tracking-tight text-zinc-900 mt-2">체중 기록</h2>
              </div>

              {/* Digital Big Value Display */}
              <div className="space-y-4">
                <div className="text-4xl sm:text-5xl font-black font-sans tracking-tight text-zinc-950 flex items-baseline justify-center gap-1.5 select-none">
                  <span>{currentWeightInput.toFixed(1)}</span>
                  <span className="text-lg font-bold text-zinc-400">kg</span>
                </div>

                {/* Tactical Segmented Dial Increments Buttons */}
                <div className="flex justify-center gap-3 max-w-sm mx-auto">
                  {[-1.0, -0.1, +0.1, +1.0].map((step) => (
                    <button
                      key={step}
                      type="button"
                      onClick={() => setCurrentWeightInput(prev => {
                        const nextVal = Math.max(0, prev + step);
                        return Number(nextVal.toFixed(1));
                      })}
                      className="px-3 py-2 bg-zinc-50 hover:bg-zinc-100 active:bg-zinc-200 text-zinc-800 text-xs font-mono font-bold rounded-xl border border-zinc-200/80 shadow-xs transition-all duration-150 cursor-pointer flex-1 min-h-[44px] flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-zinc-950/20"
                    >
                      {step > 0 ? `+${step.toFixed(1)}` : step.toFixed(1)}
                    </button>
                  ))}
                </div>

                {/* Fine slider for drag-based weight selection */}
                <div className="px-4 max-w-sm mx-auto pt-4 relative">
                  {/* Tooltip Wrapper */}
                  <div className="relative h-10 w-full overflow-visible">
                    <div
                      className="absolute bottom-1 -translate-x-1/2 bg-zinc-950 text-white text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg shadow-sm flex flex-col items-center transition-all duration-75 select-none"
                      style={{ left: `${percentage}%` }}
                    >
                      <span className="whitespace-nowrap">{currentWeightInput.toFixed(1)} kg</span>
                      {/* arrow */}
                      <div className="w-1.5 h-1.5 bg-zinc-950 rotate-45 absolute -bottom-0.5 left-1/2 -translate-x-1/2" />
                    </div>
                  </div>

                  {/* Range Slider */}
                  <input
                    type="range"
                    min={sliderMin}
                    max={sliderMax}
                    step="0.1"
                    value={currentWeightInput}
                    onChange={(e) => setCurrentWeightInput(Number(Number(e.target.value).toFixed(1)))}
                    onKeyDown={handleSliderKeyDown}
                    className="w-full premium-slider accent-zinc-950 cursor-ew-resize h-2 bg-zinc-200 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-zinc-950/20"
                    style={{
                      background: `linear-gradient(to right, #09090b 0%, #09090b ${percentage}%, #e4e4e7 ${percentage}%, #e4e4e7 100%)`
                    }}
                  />

                  {/* Ticks */}
                  <div className="relative h-6 mt-1.5 select-none overflow-visible">
                    {ticks.map((tickVal) => {
                      const leftPct = ((tickVal - sliderMin) / (sliderMax - sliderMin)) * 100;
                      return (
                        <div
                          key={tickVal}
                          className="absolute -translate-x-1/2 flex flex-col items-center"
                          style={{ left: `${leftPct}%` }}
                        >
                          <div className="w-[1.5px] h-1.5 bg-zinc-300" />
                          <span className="text-[10px] font-mono font-bold text-zinc-400 mt-0.5">{tickVal}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Direct Save Weight CTA */}
              <div className="max-w-sm mx-auto pt-2 space-y-2">
                <button
                  type="button"
                  onClick={handleSaveWeight}
                  className="w-full bg-zinc-950 hover:bg-zinc-800 active:bg-black text-white py-3.5 rounded-xl text-xs font-black tracking-wider flex items-center justify-center gap-1.5 shadow-md transition-all duration-150 cursor-pointer min-h-[44px] focus:outline-none focus:ring-2 focus:ring-zinc-950/20"
                >
                  <Check className="w-4 h-4 stroke-[3px]" />
                  <span>{hasTodayLog ? '체중 기록 수정' : '체중 기록 완료'}</span>
                </button>
                {hasTodayLog && (
                  <p className="text-[11px] font-bold text-indigo-600 animate-pulse bg-indigo-50/50 py-1 px-3 rounded-lg border border-indigo-100/40 inline-block">
                    오늘 기록을 수정합니다.
                  </p>
                )}
              </div>
            </div>

            {/* Live Feedback Feed (최근 입력 피드백) */}
            <div className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm space-y-4">
              <div className="flex items-center gap-2 border-b border-zinc-100 pb-3">
                <Calendar className="w-4 h-4 text-zinc-400" />
                <h3 className="text-xs font-black text-zinc-800 uppercase tracking-widest">
                  최근 기록 이력
                </h3>
              </div>

              {weightLogs.length === 0 ? (
                <div className="py-8 text-center space-y-1.5">
                  <p className="text-xs font-bold text-zinc-600">아직 체중 기록이 없습니다.</p>
                  <p className="text-[11px] text-zinc-400">오늘 체중을 입력해 보세요.</p>
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 font-mono text-xs font-bold">
                  {sortedWeightLogs.slice(0, 5).map((log, index) => {
                    const prevLog = sortedWeightLogs[index + 1];
                    const diff = prevLog ? log.weight - prevLog.weight : 0;
                    const diffColor = diff > 0 ? 'text-rose-500' : diff < 0 ? 'text-emerald-500' : 'text-zinc-400';
                    const diffIcon = diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <RotateCcw className="w-2.5 h-2.5" />;
                    const isToday = log.date === todayStr;

                    return (
                      <div key={log.id} className="py-3 flex justify-between items-center group">
                        <div className="flex items-center gap-2.5">
                          <span className="text-zinc-400">{formatWorkoutDateShort(log.date)}</span>
                          <span className="font-sans text-sm font-black text-zinc-800">{log.weight.toFixed(1)} kg</span>
                          
                          {/* Badges */}
                          <div className="flex items-center gap-1">
                            {isToday && (
                              <span className="text-[9px] bg-emerald-50 text-emerald-600 border border-emerald-150 px-1.5 py-0.5 rounded-full font-bold">
                                오늘
                              </span>
                            )}
                            {index === 0 && (
                              <span className="text-[9px] bg-indigo-50 text-indigo-600 border border-indigo-150 px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">
                                Latest
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          {/* Relative diff feedback badge */}
                          {prevLog ? (
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${diffColor} bg-zinc-50 border border-zinc-100`}>
                              {diffIcon}
                              <span>{diff > 0 ? `+${diff.toFixed(1)}` : diff === 0 ? '0.0' : diff.toFixed(1)}kg</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-zinc-400 font-medium font-sans">최초 시작</span>
                          )}

                          {/* Delete button (trash icon) */}
                          <button
                            type="button"
                            onClick={() => confirmDeleteWeight(log)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-300 hover:text-rose-600 hover:bg-rose-50 transition-all duration-150 cursor-pointer border border-transparent focus:outline-none shrink-0"
                            title="삭제"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Deletion Toast Notification (2 seconds) */}
      <AnimatePresence>
        {deleteToastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            transition={{ duration: 0.15 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/95 text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border border-zinc-800 flex items-center gap-2"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            <span>{deleteToastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Weight Deletion Confirmation Modal */}
      <AnimatePresence>
        {weightLogToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-xs w-full p-6 border border-zinc-200 shadow-xl space-y-5 text-center font-sans"
            >
              <div className="space-y-2">
                <h3 className="font-bold text-zinc-900 text-sm">체중 기록을 삭제하시겠습니까?</h3>
                <div className="bg-zinc-50 border border-zinc-150/80 rounded-xl py-3 px-4 font-mono">
                  <p className="text-zinc-500 text-xs font-semibold">{weightLogToDelete.date.replace(/-/g, '.')}</p>
                  <p className="text-zinc-900 text-lg font-black mt-0.5">{weightLogToDelete.weight.toFixed(1)}kg</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setWeightLogToDelete(null)}
                  className="flex-1 py-2.5 border border-zinc-200 rounded-xl text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer font-bold min-h-[44px]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleDeleteWeightConfirm}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold py-2.5 rounded-xl transition-colors cursor-pointer min-h-[44px] shadow-sm shadow-rose-600/10"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
