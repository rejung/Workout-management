/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { Routine, Exercise, MuscleCategory } from '../types';
import { Plus, Trash2, Dumbbell, Star, ClipboardList, Info, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { generateUUID } from '../utils/workoutEngine';

interface RoutineManagerProps {
  routines: Routine[];
  exercises: Exercise[];
  onAddRoutine: (routine: Routine) => void;
  onDeleteRoutine: (id: string) => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

export default function RoutineManager({
  routines,
  exercises,
  onAddRoutine,
  onDeleteRoutine,
  onShowAlert,
  onShowConfirm
}: RoutineManagerProps) {
  const showAlert = (message: string, title?: string) => {
    if (onShowAlert) {
      onShowAlert(message, title);
    } else {
      alert(message);
    }
  };
  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<{ exerciseId: string; targetSetsCount: number }[]>([]);

  const handleToggleExerciseSelection = (exerciseId: string) => {
    const exists = selectedExerciseIds.some(se => se.exerciseId === exerciseId);
    if (exists) {
      setSelectedExerciseIds(selectedExerciseIds.filter(se => se.exerciseId !== exerciseId));
    } else {
      const exercise = exercises.find(e => e.id === exerciseId);
      if (!exercise) return;
      setSelectedExerciseIds([...selectedExerciseIds, { exerciseId, targetSetsCount: 3 }]);
    }
  };

  const handleUpdateSetsCount = (exerciseId: string, count: number) => {
    setSelectedExerciseIds(selectedExerciseIds.map(se => {
      if (se.exerciseId === exerciseId) {
        return { ...se, targetSetsCount: Math.max(1, count) };
      }
      return se;
    }));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showAlert('루틴 이름을 입력해 주세요.', '루틴 등록 오류');
      return;
    }

    if (selectedExerciseIds.length === 0) {
      showAlert('최소 하나 이상의 운동을 추가해 주세요.', '루틴 등록 오류');
      return;
    }

    const newRoutine: Routine = {
      id: generateUUID(),
      name: name.trim(),
      description: description.trim(),
      exercises: selectedExerciseIds.map(se => {
        const fullEx = exercises.find(ex => ex.id === se.exerciseId)!;
        return {
          exerciseId: se.exerciseId,
          exerciseName: fullEx.name,
          category: fullEx.category,
          targetSetsCount: se.targetSetsCount
        };
      })
    };

    onAddRoutine(newRoutine);
    
    // Reset form
    setName('');
    setDescription('');
    setSelectedExerciseIds([]);
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-100 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">루틴</h1>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            루틴 추가
          </button>
        )}
      </div>

      {/* Adding Mode Form */}
      {isAdding && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs space-y-5"
        >
          <div className="border-b border-zinc-100 pb-3 flex justify-between items-center">
            <h3 className="text-base font-bold text-zinc-900">루틴 추가</h3>
            <button
              onClick={() => setIsAdding(false)}
              className="text-xs text-zinc-400 hover:text-zinc-800 cursor-pointer"
            >
              닫기
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">루틴 이름</label>
                <input
                  type="text"
                  required
                  placeholder="예: 3분할 - 하체 및 복근"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-700">루틴 요약 설명</label>
                <input
                  type="text"
                  placeholder="예: 스쿼트를 선행하여 대퇴사두를 조진 후 햄스트링을 격파합니다."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
                />
              </div>
            </div>

            {/* Selection of Exercises */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-700 block">운동 및 목표 세트수 지정</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-72 overflow-y-auto p-2 border border-zinc-250 bg-zinc-50/50 rounded-xl">
                {exercises.map(ex => {
                  const selection = selectedExerciseIds.find(se => se.exerciseId === ex.id);
                  const isSelected = !!selection;

                  return (
                    <div
                      key={ex.id}
                      onClick={() => handleToggleExerciseSelection(ex.id)}
                      className={`p-3 rounded-lg border transition-all cursor-pointer flex justify-between items-center ${
                        isSelected
                          ? 'bg-zinc-950 border-zinc-950 text-white'
                          : 'bg-white border-zinc-200 text-zinc-800 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Dumbbell className={`w-4 h-4 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`} />
                        <div>
                          <p className="text-xs font-bold">{ex.name}</p>
                          <span className={`text-[10px] uppercase font-mono ${isSelected ? 'text-zinc-400' : 'text-zinc-400'}`}>
                            {ex.category}
                          </span>
                        </div>
                      </div>

                      {/* Number of target sets */}
                      {isSelected && (
                        <div
                          onClick={(e) => e.stopPropagation()} // prevent toggle
                          className="flex items-center gap-1.5 bg-zinc-800 text-white px-2 py-1 rounded-md"
                        >
                          <span className="text-[10px] text-zinc-400">목표:</span>
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={selection.targetSetsCount}
                            onChange={(e) => handleUpdateSetsCount(ex.id, Number(e.target.value))}
                            className="w-8 bg-zinc-900 text-center font-bold text-xs rounded border border-zinc-700 text-white focus:outline-none"
                          />
                          <span className="text-[10px] text-zinc-400">세트</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="px-4 py-2 border border-zinc-200 rounded-lg text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer"
              >
                취소
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-zinc-950 hover:bg-zinc-800 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                루틴 등록 완료
              </button>
            </div>
          </form>
        </motion.div>
      )}

      {/* Routine Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {routines.map(r => (
          <div
            key={r.id}
            className="bg-white border border-zinc-200 rounded-xl overflow-hidden flex flex-col justify-between hover:border-zinc-300 transition-all shadow-xs"
          >
            <div className="p-5 space-y-4">
              {/* Routine Header */}
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900">{r.name}</h3>
                  <p className="text-zinc-500 text-xs line-clamp-2 leading-relaxed">{r.description || '작성된 요약이 없습니다.'}</p>
                </div>
                {/* Delete button (only allow deleting custom, or all) */}
                <button
                  onClick={() => onDeleteRoutine(r.id)}
                  className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="루틴 템플릿 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* Exercises in Routine list */}
              <div className="space-y-2 border-t border-zinc-100 pt-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">프로그램 운동 목록</span>
                <div className="space-y-1.5">
                  {r.exercises.map((re, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-950" />
                        <span className="truncate max-w-[150px] sm:max-w-[200px]">{re.exerciseName}</span>
                      </div>
                      <span className="font-mono text-zinc-400 font-medium text-[10px] uppercase bg-zinc-50 border border-zinc-150 px-1.5 py-0.5 rounded-md">
                        {re.category} · {re.targetSetsCount}세트
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom info banner */}
            <div className="bg-zinc-50/50 px-5 py-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" />
                총 {r.exercises.length}개 운동 종목
              </span>
              <span>
                목표 {r.exercises.reduce((sum, e) => sum + e.targetSetsCount, 0)}세트 세팅됨
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
