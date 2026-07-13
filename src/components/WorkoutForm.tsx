/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, FormEvent } from 'react';
import { WorkoutLog, ExerciseSession, SetRecord, Exercise, Routine, MuscleCategory } from '../types';
import { Plus, Trash2, Dumbbell, Calendar, Clock, Sparkles, PlusCircle, Check, ArrowLeft } from 'lucide-react';
import { formatWorkoutDateShort, getLocalDateString } from '../utils/dateUtils';
import { formatSetRecordsList } from '../utils/formatter';
import { getSortedExercises } from '../utils/sorting';
import { motion } from 'motion/react';
import { generateUUID } from '../utils/workoutEngine';

interface WorkoutFormProps {
  exercises: Exercise[];
  routines: Routine[];
  history: WorkoutLog[];
  onSave: (log: WorkoutLog) => void;
  onCancel: () => void;
  editingLog?: WorkoutLog | null;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

export default function WorkoutForm({
  exercises,
  routines,
  history,
  onSave,
  onCancel,
  editingLog,
  onShowAlert,
  onShowConfirm
}: WorkoutFormProps) {
  const showAlert = (message: string, title?: string) => {
    if (onShowAlert) {
      onShowAlert(message, title);
    } else {
      alert(message);
    }
  };
  const [date, setDate] = useState<string>(() => getLocalDateString());
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  });
  const [duration, setDuration] = useState<number>(60);
  const [selectedRoutineId, setSelectedRoutineId] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [activeExercises, setActiveExercises] = useState<ExerciseSession[]>([]);

  const sortedExercises = useMemo(() => {
    const activeIds = activeExercises.map(e => e.exerciseId);
    return getSortedExercises(exercises, history, activeIds);
  }, [exercises, history, activeExercises]);

  // Load editing log if provided
  useEffect(() => {
    if (editingLog) {
      setDate(editingLog.date);
      setStartTime(editingLog.startTime || '12:00');
      setDuration(editingLog.duration);
      setSelectedRoutineId(editingLog.routineId || '');
      setNotes(editingLog.notes);
      // deep copy
      setActiveExercises(JSON.parse(JSON.stringify(editingLog.exercises)));
    }
  }, [editingLog]);

  // Handle routine selection -> load template exercises
  const handleRoutineSelect = (routineId: string) => {
    setSelectedRoutineId(routineId);
    if (!routineId) return;

    const routine = routines.find(r => r.id === routineId);
    if (!routine) return;

    // Build template sessions
    const templateSessions: ExerciseSession[] = routine.exercises.map(re => {
      // Find previous performance of this exercise to aid progressive overload!
      const prevSession = getPreviousSessionData(re.exerciseId);
      const ex = exercises.find(e => e.id === re.exerciseId || e.name === re.exerciseName);
      const logType = ex?.logType || 'STANDARD';
      
      const defaultSets: SetRecord[] = [];
      if (prevSession && prevSession.sets.length > 0) {
        // Carry forward previous weights and reps to help overload, or create empty ones
        prevSession.sets.forEach((prevSet) => {
          defaultSets.push({
            id: generateUUID(),
            weight: prevSet.weight,
            reps: prevSet.reps,
            rpe: prevSet.rpe,
            isWarmup: prevSet.isWarmup,
            timeSeconds: prevSet.timeSeconds,
            distanceKm: prevSet.distanceKm
          });
        });
      } else {
        // Create standard sets based on target
        const count = logType === 'CARDIO' ? 1 : re.targetSetsCount;
        for (let i = 0; i < count; i++) {
          defaultSets.push({
            id: generateUUID(),
            weight: 0,
            reps: logType === 'TIME_BASED' ? 0 : 10,
            rpe: 8,
            isWarmup: i === 0 && count > 3 ? true : false,
            timeSeconds: logType === 'TIME_BASED' ? 60 : logType === 'CARDIO' ? 0 : undefined,
            distanceKm: logType === 'CARDIO' ? 0 : undefined
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

    setActiveExercises(templateSessions);
  };

  // Find previous session for progressive overload helper
  const getPreviousSessionData = (exerciseId: string): { date: string; sets: SetRecord[] } | null => {
    // Search history backward by date
    const targetEx = exercises.find(e => e.id === exerciseId);
    const sortedHistory = [...history].sort((a, b) => b.date.localeCompare(a.date));
    for (const log of sortedHistory) {
      // Skip the current log being edited to avoid referencing itself
      if (editingLog && log.id === editingLog.id) continue;

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

  // Add individual exercise to session
  const handleAddExercise = (exerciseId: string) => {
    if (!exerciseId) return;
    const exercise = exercises.find(e => e.id === exerciseId);
    if (!exercise) return;

    // Check if already added
    if (activeExercises.some(ae => ae.exerciseId === exerciseId)) {
      showAlert('이미 추가된 운동입니다.', '운동 추가 오류');
      return;
    }

    const prevSession = getPreviousSessionData(exerciseId);
    const exLogType = exercise.logType || 'STANDARD';
    const defaultSets: SetRecord[] = [];

    if (prevSession && prevSession.sets.length > 0) {
      prevSession.sets.forEach((prevSet) => {
        defaultSets.push({
          id: generateUUID(),
          weight: prevSet.weight,
          reps: prevSet.reps,
          rpe: prevSet.rpe,
          isWarmup: prevSet.isWarmup,
          timeSeconds: prevSet.timeSeconds,
          distanceKm: prevSet.distanceKm
        });
      });
    } else {
      defaultSets.push({
        id: generateUUID(),
        weight: 0,
        reps: exLogType === 'TIME_BASED' ? 0 : 10,
        rpe: 8,
        isWarmup: false,
        timeSeconds: exLogType === 'TIME_BASED' ? 60 : exLogType === 'CARDIO' ? 0 : undefined,
        distanceKm: exLogType === 'CARDIO' ? 0 : undefined
      });
    }

    const newSession: ExerciseSession = {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      category: exercise.category,
      sets: defaultSets
    };

    setActiveExercises([...activeExercises, newSession]);
  };

  // Remove exercise from session
  const handleRemoveExercise = (exerciseId: string) => {
    setActiveExercises(activeExercises.filter(ae => ae.exerciseId !== exerciseId));
  };

  // Add a set to an exercise
  const handleAddSet = (exerciseId: string) => {
    const aeEx = activeExercises.find(ae => ae.exerciseId === exerciseId);
    const exercise = exercises.find(e => e.id === exerciseId || (aeEx && e.name === aeEx.exerciseName));
    const exLogType = exercise?.logType || 'STANDARD';
    if (exLogType === 'CARDIO') return; // Cardio does not add multiple sets

    setActiveExercises(activeExercises.map(ae => {
      if (ae.exerciseId === exerciseId) {
        // Pre-fill with the last set's weight/reps/rpe to make input easier!
        const lastSet = ae.sets[ae.sets.length - 1];
        const newSet: SetRecord = {
          id: generateUUID(),
          weight: lastSet ? lastSet.weight : 0,
          reps: lastSet ? lastSet.reps : (exLogType === 'TIME_BASED' ? 0 : 10),
          rpe: lastSet ? lastSet.rpe : 8,
          isWarmup: false,
          timeSeconds: lastSet ? lastSet.timeSeconds : (exLogType === 'TIME_BASED' ? 60 : undefined),
          distanceKm: lastSet ? lastSet.distanceKm : undefined
        };
        return {
          ...ae,
          sets: [...ae.sets, newSet]
        };
      }
      return ae;
    }));
  };

  // Remove last set from an exercise
  const handleRemoveSet = (exerciseId: string, setId: string) => {
    setActiveExercises(activeExercises.map(ae => {
      if (ae.exerciseId === exerciseId) {
        // Prevent deleting last set completely
        if (ae.sets.length <= 1) return ae;
        return {
          ...ae,
          sets: ae.sets.filter(s => s.id !== setId)
        };
      }
      return ae;
    }));
  };

  // Update field of a set
  const handleUpdateSet = (exerciseId: string, setId: string, key: keyof SetRecord, value: any) => {
    setActiveExercises(activeExercises.map(ae => {
      if (ae.exerciseId === exerciseId) {
        const updatedSets = ae.sets.map(s => {
          if (s.id === setId) {
            return { ...s, [key]: value };
          }
          return s;
        });
        return { ...ae, sets: updatedSets };
      }
      return ae;
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (activeExercises.length === 0) {
      showAlert('최소 하나 이상의 운동을 등록해 주세요.', '일지 저장 오류');
      return;
    }

    // Validate that sets have positive weights/reps (warn if 0, but allow bodyweight)
    const log: WorkoutLog = {
      id: editingLog ? editingLog.id : generateUUID(),
      date,
      startTime,
      duration: Number(duration) || 60,
      routineId: selectedRoutineId || undefined,
      routineName: selectedRoutineId ? routines.find(r => r.id === selectedRoutineId)?.name : undefined,
      notes,
      exercises: activeExercises
    };

    onSave(log);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-zinc-100 pb-5">
        <button
          onClick={onCancel}
          className="p-2 hover:bg-zinc-100 rounded-lg text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900">
            {editingLog ? '기록 수정' : '기록'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Core Info Panel */}
        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-zinc-400" />
              훈련 날짜
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-400" />
              시작 시간 / 소요 시간 (분)
            </label>
            <div className="flex gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
                className="w-1/2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
              />
              <input
                type="number"
                min="1"
                max="300"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                required
                placeholder="분"
                className="w-1/2 bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-700 flex items-center gap-1.5">
              <Dumbbell className="w-4 h-4 text-zinc-400" />
              불러올 루틴 템플릿
            </label>
            <select
              value={selectedRoutineId}
              onChange={(e) => handleRoutineSelect(e.target.value)}
              disabled={!!editingLog}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white disabled:opacity-50 cursor-pointer"
            >
              <option value="">-- 루틴 선택 없음 (직접 입력) --</option>
              {routines.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Exercises Sessions Block */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-zinc-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-zinc-700" />
              수행 운동 리스트 ({activeExercises.length})
            </h2>
            
            {/* Quick add exercise dropdown */}
            <select
              onChange={(e) => {
                handleAddExercise(e.target.value);
                e.target.value = ''; // Reset
              }}
              className="bg-zinc-950 text-white text-xs px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors focus:outline-none cursor-pointer"
            >
              <option value="">+ 개별 운동 추가하기</option>
              {sortedExercises.map(ex => (
                <option key={ex.id} value={ex.id}>{ex.name} [{ex.category}]</option>
              ))}
            </select>
          </div>

          {activeExercises.length === 0 ? (
            <div className="border border-dashed border-zinc-200 rounded-xl p-8 bg-zinc-50/50 text-center">
              <Dumbbell className="w-8 h-8 text-zinc-300 mx-auto mb-2 animate-pulse" />
              <p className="text-zinc-600 text-sm font-medium">수행할 운동이 등록되지 않았습니다.</p>
              <p className="text-zinc-400 text-xs mt-1">상단의 루틴을 불러오거나 우측의 운동 추가 메뉴를 선택해 주세요.</p>
            </div>
          ) : (
            <div className="space-y-5">
              {activeExercises.map((ae, exIdx) => {
                const prevSession = getPreviousSessionData(ae.exerciseId);
                const dbExercise = exercises.find(e => e.id === ae.exerciseId || e.name === ae.exerciseName);
                const logType = dbExercise?.logType || 'STANDARD';

                return (
                  <motion.div
                    key={ae.exerciseId}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-xs"
                  >
                    {/* Exercise Title Banner */}
                    <div className="bg-zinc-50 px-4 py-3 border-b border-zinc-100 flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="text-xs bg-zinc-900 text-white font-semibold font-mono px-2 py-0.5 rounded-sm">
                          {ae.category}
                        </span>
                        <h3 className="text-sm font-bold text-zinc-900">{ae.exerciseName}</h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveExercise(ae.exerciseId)}
                        className="p-1 text-zinc-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                        title="운동 전체 삭제"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Sets Management Panel */}
                    <div className="p-4 space-y-3">
                      {/* Progressive Overload Info Hint */}
                      {prevSession && (
                        <div className="bg-emerald-50/70 border border-emerald-100 rounded-lg px-3 py-2 text-xs text-emerald-800 flex items-center justify-between">
                          <span>
                            🔄 <strong>이전 기록 ({formatWorkoutDateShort(prevSession.date)}):</strong>{' '}
                            {formatSetRecordsList(prevSession.sets, logType)}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                            점진적 과부하 목표!
                          </span>
                        </div>
                      )}

                      {/* Sets Table Header */}
                      <div className="grid grid-cols-12 gap-2 pb-1 border-b border-zinc-100 text-[11px] font-bold text-zinc-400 uppercase tracking-wider text-center">
                        <span className="col-span-1">세트</span>
                        {logType === 'CARDIO' ? (
                          <>
                            <span className="col-span-5">수행 거리 (Distance)</span>
                            <span className="col-span-5">수행 시간 (Duration)</span>
                            <span className="col-span-1">제거</span>
                          </>
                        ) : logType === 'TIME_BASED' ? (
                          <>
                            <span className="col-span-2">구분</span>
                            <span className="col-span-5">수행 시간 (Duration)</span>
                            <span className="col-span-3">피로도 (RPE)</span>
                            <span className="col-span-1">제거</span>
                          </>
                        ) : logType === 'BODYWEIGHT_REPS' ? (
                          <>
                            <span className="col-span-2">구분</span>
                            <span className="col-span-5">반복 횟수 (Reps)</span>
                            <span className="col-span-3">피로도 (RPE)</span>
                            <span className="col-span-1">제거</span>
                          </>
                        ) : (
                          <>
                            <span className="col-span-2">구분</span>
                            <span className="col-span-3">중량 (kg)</span>
                            <span className="col-span-3">반복 횟수 (Reps)</span>
                            <span className="col-span-2">피로도 (RPE)</span>
                            <span className="col-span-1">제거</span>
                          </>
                        )}
                      </div>

                      {/* Sets Records Row */}
                      <div className="space-y-2">
                        {ae.sets.map((set, setIdx) => {
                          if (logType === 'CARDIO') {
                            return (
                              <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-center">
                                {/* Record Label */}
                                <span className="col-span-1 font-mono text-xs font-semibold text-zinc-500">
                                  기록
                                </span>

                                {/* Distance */}
                                <div className="col-span-5 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1">
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={set.distanceKm !== undefined && set.distanceKm !== null ? set.distanceKm : ''}
                                    onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'distanceKm', Number(e.target.value))}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">km</span>
                                </div>

                                {/* Duration */}
                                <div className="col-span-5 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="분"
                                    value={Math.floor((set.timeSeconds || 0) / 60) || ''}
                                    onChange={(e) => {
                                      const m = Number(e.target.value);
                                      const s = (set.timeSeconds || 0) % 60;
                                      handleUpdateSet(ae.exerciseId, set.id, 'timeSeconds', m * 60 + s);
                                    }}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">분</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    placeholder="초"
                                    value={(set.timeSeconds || 0) % 60 || ''}
                                    onChange={(e) => {
                                      const m = Math.floor((set.timeSeconds || 0) / 60);
                                      const s = Number(e.target.value);
                                      handleUpdateSet(ae.exerciseId, set.id, 'timeSeconds', m * 60 + s);
                                    }}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">초</span>
                                </div>

                                {/* Delete Button */}
                                <div className="col-span-1 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSet(ae.exerciseId, set.id)}
                                    disabled={ae.sets.length <= 1}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 disabled:opacity-30 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (logType === 'TIME_BASED') {
                            return (
                              <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-center">
                                {/* Set Number */}
                                <span className="col-span-1 font-mono text-xs font-semibold text-zinc-500">
                                  {setIdx + 1}
                                </span>

                                {/* Warmup Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSet(ae.exerciseId, set.id, 'isWarmup', !set.isWarmup)}
                                  className={`col-span-2 text-xs py-1 px-1 rounded-md font-medium border transition-colors cursor-pointer ${
                                    set.isWarmup
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                                  }`}
                                >
                                  {set.isWarmup ? '웜업' : '본세트'}
                                </button>

                                {/* Duration */}
                                <div className="col-span-5 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1 gap-1">
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="분"
                                    value={Math.floor((set.timeSeconds || 0) / 60) || ''}
                                    onChange={(e) => {
                                      const m = Number(e.target.value);
                                      const s = (set.timeSeconds || 0) % 60;
                                      handleUpdateSet(ae.exerciseId, set.id, 'timeSeconds', m * 60 + s);
                                    }}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">분</span>
                                  <input
                                    type="number"
                                    min="0"
                                    max="59"
                                    placeholder="초"
                                    value={(set.timeSeconds || 0) % 60 || ''}
                                    onChange={(e) => {
                                      const m = Math.floor((set.timeSeconds || 0) / 60);
                                      const s = Number(e.target.value);
                                      handleUpdateSet(ae.exerciseId, set.id, 'timeSeconds', m * 60 + s);
                                    }}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">초</span>
                                </div>

                                {/* RPE Selector */}
                                <select
                                  value={set.rpe || 8}
                                  onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'rpe', Number(e.target.value))}
                                  className="col-span-3 bg-zinc-50 border border-zinc-200 rounded-lg py-1.5 text-xs text-center font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                                >
                                  <option value="10">10 (한계)</option>
                                  <option value="9">9 (1회 더)</option>
                                  <option value="8">8 (2회 더)</option>
                                  <option value="7">7 (3회 더)</option>
                                  <option value="6">6 (가벼움)</option>
                                </select>

                                {/* Delete Button */}
                                <div className="col-span-1 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSet(ae.exerciseId, set.id)}
                                    disabled={ae.sets.length <= 1}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 disabled:opacity-30 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (logType === 'BODYWEIGHT_REPS') {
                            return (
                              <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-center">
                                {/* Set Number */}
                                <span className="col-span-1 font-mono text-xs font-semibold text-zinc-500">
                                  {setIdx + 1}
                                </span>

                                {/* Warmup Checkbox */}
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSet(ae.exerciseId, set.id, 'isWarmup', !set.isWarmup)}
                                  className={`col-span-2 text-xs py-1 px-1 rounded-md font-medium border transition-colors cursor-pointer ${
                                    set.isWarmup
                                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                                      : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                                  }`}
                                >
                                  {set.isWarmup ? '웜업' : '본세트'}
                                </button>

                                {/* Reps */}
                                <div className="col-span-5 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1">
                                  <input
                                    type="number"
                                    min="0"
                                    value={set.reps || ''}
                                    onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'reps', Number(e.target.value))}
                                    className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                  />
                                  <span className="text-[10px] text-zinc-400 font-medium">회</span>
                                </div>

                                {/* RPE Selector */}
                                <select
                                  value={set.rpe || 8}
                                  onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'rpe', Number(e.target.value))}
                                  className="col-span-3 bg-zinc-50 border border-zinc-200 rounded-lg py-1.5 text-xs text-center font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                                >
                                  <option value="10">10 (한계)</option>
                                  <option value="9">9 (1회 더)</option>
                                  <option value="8">8 (2회 더)</option>
                                  <option value="7">7 (3회 더)</option>
                                  <option value="6">6 (가벼움)</option>
                                </select>

                                {/* Delete Button */}
                                <div className="col-span-1 flex justify-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSet(ae.exerciseId, set.id)}
                                    disabled={ae.sets.length <= 1}
                                    className="p-1.5 text-zinc-400 hover:text-rose-600 disabled:opacity-30 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={set.id} className="grid grid-cols-12 gap-2 items-center text-center">
                              {/* Set Number */}
                              <span className="col-span-1 font-mono text-xs font-semibold text-zinc-500">
                                {setIdx + 1}
                              </span>

                              {/* Warmup Checkbox as Custom Button */}
                              <button
                                type="button"
                                onClick={() => handleUpdateSet(ae.exerciseId, set.id, 'isWarmup', !set.isWarmup)}
                                className={`col-span-2 text-xs py-1 px-1 rounded-md font-medium border transition-colors cursor-pointer ${
                                  set.isWarmup
                                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                                    : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                                }`}
                              >
                                {set.isWarmup ? '웜업' : '본세트'}
                              </button>

                              {/* Weight */}
                              <div className="col-span-3 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  value={set.weight || ''}
                                  onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'weight', Number(e.target.value))}
                                  className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                />
                                <span className="text-[10px] text-zinc-400 font-medium">kg</span>
                              </div>

                              {/* Reps */}
                              <div className="col-span-3 flex items-center bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1">
                                <input
                                  type="number"
                                  min="0"
                                  value={set.reps || ''}
                                  onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'reps', Number(e.target.value))}
                                  className="w-full bg-transparent text-sm font-semibold font-mono text-center text-zinc-800 focus:outline-none"
                                />
                                <span className="text-[10px] text-zinc-400 font-medium">회</span>
                              </div>

                              {/* RPE Selector */}
                              <select
                                value={set.rpe || 8}
                                onChange={(e) => handleUpdateSet(ae.exerciseId, set.id, 'rpe', Number(e.target.value))}
                                className="col-span-2 bg-zinc-50 border border-zinc-200 rounded-lg py-1.5 text-xs text-center font-semibold text-zinc-800 focus:outline-none cursor-pointer"
                              >
                                <option value="10">10 (한계)</option>
                                <option value="9">9 (1회 더)</option>
                                <option value="8">8 (2회 더)</option>
                                <option value="7">7 (3회 더)</option>
                                <option value="6">6 (가벼움)</option>
                              </select>

                              {/* Delete Button */}
                              <div className="col-span-1 flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveSet(ae.exerciseId, set.id)}
                                  disabled={ae.sets.length <= 1}
                                  className="p-1.5 text-zinc-400 hover:text-rose-600 disabled:opacity-30 rounded-md hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Add Set Button */}
                      {logType !== 'CARDIO' && (
                        <button
                          type="button"
                          onClick={() => handleAddSet(ae.exerciseId)}
                          className="mt-2 w-full border border-dashed border-zinc-200 rounded-lg py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <PlusCircle className="w-4 h-4" />
                          세트 추가
                        </button>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Notes & Recovery Input */}
        <div className="bg-white p-5 rounded-xl border border-zinc-200 shadow-xs space-y-2">
          <label className="text-xs font-semibold text-zinc-700">종합 피드백 및 당일 컨디션 일지</label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="예: '스쿼트 시 무릎 통증 없음. 마지막 세트 증량 성공. 단백질 섭취 완료!'"
            className="w-full bg-zinc-50 border border-zinc-200 rounded-xl p-3 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
          />
        </div>

        {/* Action Controls */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
          >
            기록 취소
          </button>
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white text-sm font-bold flex items-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <Check className="w-4 h-4" />
            운동 기록 저장
          </button>
        </div>
      </form>
    </div>
  );
}
