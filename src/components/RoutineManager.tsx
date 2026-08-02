/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent, useEffect, useRef } from 'react';
import { Routine, Exercise, MuscleCategory } from '../types';
import { 
  Plus, 
  Trash2, 
  Dumbbell, 
  ClipboardList, 
  MoreVertical, 
  Edit3, 
  Copy, 
  ArrowUp, 
  ArrowDown, 
  X, 
  Check, 
  Search,
  ChevronDown,
  Minus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { generateUUID } from '../utils/workoutEngine';
import { filterExercises, EXERCISE_CATEGORIES, KOREAN_CATEGORY_MAP } from '../domain/exerciseSearch';

interface RoutineManagerProps {
  routines: Routine[];
  exercises: Exercise[];
  onAddRoutine: (routine: Routine) => void;
  onUpdateRoutine?: (routine: Routine) => void;
  onDeleteRoutine: (id: string) => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
}

export default function RoutineManager({
  routines,
  exercises,
  onAddRoutine,
  onUpdateRoutine,
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

  const triggerConfirm = (message: string, onConfirm: () => void, title?: string) => {
    if (onShowConfirm) {
      onShowConfirm(message, onConfirm, title);
    } else if (window.confirm(message)) {
      onConfirm();
    }
  };

  // Form Mode State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRoutineId, setEditingRoutineId] = useState<string | null>(null);
  
  // Form Values
  const [name, setName] = useState('');
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<{ exerciseId: string; targetSetsCount: number }[]>([]);

  // Exercise Picker Collapsed / Expanded state inside form
  const [isExercisePickerOpen, setIsExercisePickerOpen] = useState(false);

  // Initial Form Snapshot for Unsaved Changes detection
  const [initialFormState, setInitialFormState] = useState<{
    name: string;
    selectedExerciseIds: { exerciseId: string; targetSetsCount: number }[];
  } | null>(null);

  // Card Dropdown Menu State
  const [openMenuRoutineId, setOpenMenuRoutineId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Exercise Picker Filter inside Form
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Close card action menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuRoutineId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Compute Auto-Summary & Metadata based on selected exercises
  const computeAutoSummary = () => {
    if (selectedExerciseIds.length === 0) {
      return {
        summaryText: '운동을 추가하면 요약이 자동 생성됩니다.',
        totalExercises: 0,
        totalSets: 0,
        primaryTarget: '미정'
      };
    }

    const catCounts: Record<string, number> = {};
    selectedExerciseIds.forEach(se => {
      const ex = exercises.find(e => e.id === se.exerciseId);
      const rawCat = ex?.category || '기타';
      const cat = KOREAN_CATEGORY_MAP[rawCat] || rawCat;
      catCounts[cat] = (catCounts[cat] || 0) + 1;
    });

    let maxCat = '기타';
    let maxCount = 0;
    Object.entries(catCounts).forEach(([cat, count]) => {
      if (count > maxCount) {
        maxCount = count;
        maxCat = cat;
      }
    });

    const primaryTarget = `${maxCat} 중심`;
    const totalExercises = selectedExerciseIds.length;
    const totalSets = selectedExerciseIds.reduce((sum, se) => sum + se.targetSetsCount, 0);

    return {
      summaryText: `${primaryTarget} · ${totalExercises}종목 · 목표 ${totalSets}세트`,
      totalExercises,
      totalSets,
      primaryTarget
    };
  };

  const autoSummary = computeAutoSummary();

  // Check if form has unsaved modifications
  const hasUnsavedChanges = (() => {
    if (!initialFormState || !isFormOpen) return false;
    return (
      name !== initialFormState.name ||
      JSON.stringify(selectedExerciseIds) !== JSON.stringify(initialFormState.selectedExerciseIds)
    );
  })();

  // Handlers for Form Lifecycle
  const handleStartCreate = () => {
    setEditingRoutineId(null);
    setName('');
    setSelectedExerciseIds([]);
    setInitialFormState({ name: '', selectedExerciseIds: [] });
    setIsExercisePickerOpen(false);
    setExerciseSearch('');
    setSelectedCategory('ALL');
    setIsFormOpen(true);
  };

  const handleStartEdit = (routine: Routine) => {
    setOpenMenuRoutineId(null);
    setEditingRoutineId(routine.id);
    setName(routine.name);
    
    const mappedList = routine.exercises.map(e => ({
      exerciseId: e.exerciseId,
      targetSetsCount: e.targetSetsCount || 3
    }));

    setSelectedExerciseIds(mappedList);
    setInitialFormState({
      name: routine.name,
      selectedExerciseIds: mappedList
    });
    setIsExercisePickerOpen(false);
    setExerciseSearch('');
    setSelectedCategory('ALL');
    setIsFormOpen(true);
  };

  const handleDuplicateRoutine = (routine: Routine) => {
    setOpenMenuRoutineId(null);
    const duplicated: Routine = {
      id: generateUUID(),
      name: `${routine.name} (복사본)`,
      description: routine.description,
      exercises: JSON.parse(JSON.stringify(routine.exercises))
    };
    onAddRoutine(duplicated);
    showAlert(`'${duplicated.name}' 루틴이 복제되었습니다.`, '루틴 복제 완료');
  };

  const handleCloseForm = () => {
    if (hasUnsavedChanges) {
      triggerConfirm(
        '저장하지 않은 변경사항이 있습니다. 정말 취소하시겠습니까?',
        () => forceResetForm(),
        '저장 안 함 확인'
      );
    } else {
      forceResetForm();
    }
  };

  const forceResetForm = () => {
    setIsFormOpen(false);
    setEditingRoutineId(null);
    setName('');
    setSelectedExerciseIds([]);
    setInitialFormState(null);
    setIsExercisePickerOpen(false);
    setExerciseSearch('');
  };

  // Reorder exercises in routine
  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= selectedExerciseIds.length) return;
    const updated = [...selectedExerciseIds];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);
    setSelectedExerciseIds(updated);
  };

  const handleRemoveExercise = (exerciseId: string) => {
    setSelectedExerciseIds(prev => prev.filter(se => se.exerciseId !== exerciseId));
  };

  const handleToggleExercise = (exerciseId: string) => {
    const exists = selectedExerciseIds.some(se => se.exerciseId === exerciseId);
    if (exists) {
      handleRemoveExercise(exerciseId);
    } else {
      setSelectedExerciseIds(prev => [...prev, { exerciseId, targetSetsCount: 3 }]);
    }
  };

  const handleUpdateSetsCount = (exerciseId: string, count: number) => {
    const validCount = Math.max(1, Math.min(20, count));
    setSelectedExerciseIds(prev => prev.map(se => {
      if (se.exerciseId === exerciseId) {
        return { ...se, targetSetsCount: validCount };
      }
      return se;
    }));
  };

  // Form Submit Handler
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      showAlert('루틴 이름을 입력해 주세요.', '입력 오류');
      return;
    }

    if (selectedExerciseIds.length === 0) {
      showAlert('최소 하나 이상의 운동을 추가해 주세요.', '입력 오류');
      return;
    }

    const formattedExercises = selectedExerciseIds.map(se => {
      const fullEx = exercises.find(ex => ex.id === se.exerciseId);
      return {
        exerciseId: se.exerciseId,
        exerciseName: fullEx?.name || '운동',
        category: (fullEx?.category || '기타') as MuscleCategory,
        targetSetsCount: se.targetSetsCount
      };
    });

    const generatedDescription = autoSummary.summaryText;

    if (editingRoutineId) {
      const updatedRoutine: Routine = {
        id: editingRoutineId,
        name: name.trim(),
        description: generatedDescription,
        exercises: formattedExercises
      };

      if (onUpdateRoutine) {
        onUpdateRoutine(updatedRoutine);
      } else {
        onAddRoutine(updatedRoutine);
      }
      showAlert('루틴이 성공적으로 수정되었습니다.', '루틴 수정 완료');
    } else {
      const newRoutine: Routine = {
        id: generateUUID(),
        name: name.trim(),
        description: generatedDescription,
        exercises: formattedExercises
      };

      onAddRoutine(newRoutine);
      showAlert('새 루틴이 성공적으로 추가되었습니다.', '루틴 생성 완료');
    }

    forceResetForm();
  };

  // Categories list for exercise selection
  const categories = EXERCISE_CATEGORIES;
  const filteredExercises = filterExercises(exercises, selectedCategory, exerciseSearch);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-200/80 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">루틴</h1>
          <p className="text-xs text-zinc-500 mt-0.5">자주 수행하는 훈련 분할 및 세트 구성을 자유롭게 관리하세요.</p>
        </div>
        {!isFormOpen && (
          <button
            onClick={handleStartCreate}
            className="bg-zinc-950 text-white hover:bg-zinc-800 text-xs font-bold px-4 py-2.5 rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            루틴 추가
          </button>
        )}
      </div>

      {/* Routine Create / Edit Form Modal/Container */}
      <AnimatePresence>
        {isFormOpen && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-white border border-zinc-250 rounded-2xl p-4 sm:p-5 shadow-md space-y-3.5"
          >
            {/* Form Title & Close Button */}
            <div className="border-b border-zinc-150 pb-2.5 flex justify-between items-center">
              <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
                <span>✏️</span>
                <span>{editingRoutineId ? '루틴 수정' : '새 루틴 생성'}</span>
              </h2>
              <button
                type="button"
                onClick={handleCloseForm}
                className="text-zinc-400 hover:text-zinc-800 p-1 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                title="닫기"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              {/* Primary Input: Routine Name with Compact Secondary Auto-Summary Badge */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-800 block">
                  루틴 이름 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="예: 3분할 - 하체 Focus"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-zinc-50/80 border border-zinc-250 rounded-xl px-3.5 py-2 text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:bg-white transition-all"
                />
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-zinc-100/90 border border-zinc-200/90 rounded-lg text-[11px] font-semibold text-zinc-600 select-none">
                    🏷️ {autoSummary.summaryText}
                  </span>
                </div>
              </div>

              {/* Section 1: Selected Exercises List */}
              <div className="space-y-2">
                <div className="flex justify-between items-center px-0.5">
                  <label className="text-xs font-bold text-zinc-900">
                    선택된 운동 ({selectedExerciseIds.length}개)
                  </label>
                </div>

                {selectedExerciseIds.length === 0 ? (
                  <div className="p-3.5 text-center bg-zinc-50 border border-dashed border-zinc-250 rounded-xl text-zinc-400 text-xs">
                    아래 '+ 운동 추가' 버튼을 눌러 루틴 종목을 선택하세요.
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {selectedExerciseIds.map((se, idx) => {
                      const fullEx = exercises.find(ex => ex.id === se.exerciseId);
                      return (
                        <div
                          key={se.exerciseId}
                          className="bg-zinc-900 text-white py-1.5 px-2.5 rounded-xl flex items-center justify-between gap-2 shadow-xs hover:bg-zinc-850 hover:ring-1 hover:ring-zinc-700 transition-all cursor-default"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {/* Reorder controls (Up/Down) */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => handleMoveExercise(idx, 'up')}
                                className={`p-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                                  idx === 0 ? 'opacity-20 cursor-not-allowed' : 'text-zinc-300'
                                }`}
                                title="위로 이동"
                              >
                                <ArrowUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === selectedExerciseIds.length - 1}
                                onClick={() => handleMoveExercise(idx, 'down')}
                                className={`p-0.5 rounded hover:bg-zinc-800 transition-colors cursor-pointer ${
                                  idx === selectedExerciseIds.length - 1 ? 'opacity-20 cursor-not-allowed' : 'text-zinc-300'
                                }`}
                                title="아래로 이동"
                              >
                                <ArrowDown className="w-3 h-3" />
                              </button>
                            </div>

                            <span className="w-3.5 text-center text-xs font-mono font-bold text-zinc-500 shrink-0">
                              {idx + 1}.
                            </span>

                            <div className="truncate min-w-0 space-y-0">
                              <p className="text-xs font-bold text-white truncate leading-snug">{fullEx?.name || '운동'}</p>
                              <span className="text-[9px] font-mono text-zinc-400 uppercase tracking-tight block -mt-0.5">
                                {fullEx?.category || '기타'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {/* Compact Stepper UI for Target Sets Count */}
                            <div className="flex items-center gap-0.5 bg-zinc-950 border border-zinc-700/90 rounded-md px-1 py-0.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateSetsCount(se.exerciseId, se.targetSetsCount - 1)}
                                disabled={se.targetSetsCount <= 1}
                                className="w-3.5 h-3.5 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
                              >
                                <Minus className="w-2.5 h-2.5" />
                              </button>
                              <span className="w-4 text-center font-mono font-bold text-xs text-white">
                                {se.targetSetsCount}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateSetsCount(se.exerciseId, se.targetSetsCount + 1)}
                                disabled={se.targetSetsCount >= 20}
                                className="w-3.5 h-3.5 flex items-center justify-center text-zinc-400 hover:text-white disabled:opacity-20 transition-colors cursor-pointer"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            {/* Remove button (Trash Icon with Tooltip) */}
                            <button
                              type="button"
                              onClick={() => handleRemoveExercise(se.exerciseId)}
                              className="p-1 text-zinc-400 hover:text-rose-400 hover:bg-zinc-800 rounded-md transition-colors cursor-pointer"
                              title="운동 제거"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Footer Summary - Clean Badges Group */}
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 border border-zinc-200/80 rounded-lg text-[11px] font-semibold text-zinc-700">
                    🏋️ {autoSummary.totalExercises}종목
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 border border-zinc-200/80 rounded-lg text-[11px] font-semibold text-zinc-700">
                    🎯 {autoSummary.totalSets}세트
                  </span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-100 border border-zinc-200/80 rounded-lg text-[11px] font-semibold text-zinc-700">
                    💪 {autoSummary.primaryTarget}
                  </span>
                </div>
              </div>

              {/* Section 2: Primary Outlined Button for Adding Exercises */}
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setIsExercisePickerOpen(!isExercisePickerOpen)}
                  className="w-full py-2.5 px-4 bg-white hover:bg-zinc-50 border-2 border-zinc-900 text-zinc-900 rounded-xl text-xs font-bold flex items-center justify-between transition-all shadow-xs cursor-pointer"
                >
                  <div className="flex items-center gap-1.5">
                    <Plus className="w-4 h-4 text-zinc-900 stroke-[2.5]" />
                    <span>운동 추가</span>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-zinc-900 transition-transform duration-200 ${isExercisePickerOpen ? 'rotate-180' : ''}`} />
                </button>

                {isExercisePickerOpen && (
                  <div className="space-y-2 pt-2.5 animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                      <span className="text-[11px] font-bold text-zinc-600">종목 선택</span>
                      
                      {/* Category Pills */}
                      <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                        {categories.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(cat)}
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                              selectedCategory === cat
                                ? 'bg-zinc-900 text-white'
                                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        placeholder="운동명 검색..."
                        value={exerciseSearch}
                        onChange={(e) => setExerciseSearch(e.target.value)}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white"
                      />
                    </div>

                    {/* Exercise Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                      {filteredExercises.map(ex => {
                        const isSelected = selectedExerciseIds.some(se => se.exerciseId === ex.id);

                        return (
                          <div
                            key={ex.id}
                            onClick={() => handleToggleExercise(ex.id)}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                              isSelected
                                ? 'bg-zinc-900 border-zinc-900 text-white'
                                : 'bg-zinc-50/80 border-zinc-200 text-zinc-800 hover:border-zinc-300 hover:bg-white'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Dumbbell className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-zinc-300' : 'text-zinc-400'}`} />
                              <div className="truncate">
                                <p className="text-xs font-bold truncate">{ex.name}</p>
                                <span className="text-[9px] uppercase font-mono text-zinc-400">
                                  {ex.category}
                                </span>
                              </div>
                            </div>

                            <div className="shrink-0">
                              {isSelected ? (
                                <span className="w-4 h-4 bg-emerald-500 text-white rounded-full flex items-center justify-center text-[10px]">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </span>
                              ) : (
                                <span className="w-4 h-4 border border-zinc-300 rounded-full flex items-center justify-center text-zinc-400 text-[10px]">
                                  <Plus className="w-2.5 h-2.5" />
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions - Save Primary Button & Text-Style Cancel Button */}
              <div className="flex justify-end items-center gap-3 pt-3 border-t border-zinc-200/80">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer px-3 py-2"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-zinc-950 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  {editingRoutineId ? '루틴 수정 저장' : '루틴 생성 완료'}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Routine Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {routines.map(r => (
          <div
            key={r.id}
            className="bg-white border border-zinc-200 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-zinc-300 transition-all shadow-xs relative"
          >
            <div className="p-5 space-y-4">
              {/* Routine Card Header */}
              <div className="flex justify-between items-start gap-2">
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900">{r.name}</h3>
                  <p className="text-zinc-500 text-xs line-clamp-2 leading-relaxed">{r.description || '작성된 요약이 없습니다.'}</p>
                </div>

                {/* More Action Menu (⋮) */}
                <div className="relative">
                  <button
                    onClick={() => setOpenMenuRoutineId(openMenuRoutineId === r.id ? null : r.id)}
                    className="p-1.5 text-zinc-400 hover:text-zinc-800 hover:bg-zinc-100 rounded-lg transition-colors cursor-pointer"
                    title="더보기"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu */}
                  {openMenuRoutineId === r.id && (
                    <div
                      ref={menuRef}
                      className="absolute right-0 top-8 w-36 bg-white border border-zinc-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        onClick={() => handleStartEdit(r)}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-zinc-500" />
                        루틴 수정
                      </button>

                      <button
                        onClick={() => handleDuplicateRoutine(r)}
                        className="w-full px-3 py-2 text-left text-xs text-zinc-700 hover:bg-zinc-50 flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <Copy className="w-3.5 h-3.5 text-zinc-500" />
                        루틴 복제
                      </button>

                      <div className="border-t border-zinc-100 my-0.5" />

                      <button
                        onClick={() => {
                          setOpenMenuRoutineId(null);
                          onDeleteRoutine(r.id);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-medium"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                        루틴 삭제
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Exercises in Routine list */}
              <div className="space-y-2 border-t border-zinc-100 pt-3">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">프로그램 운동 목록</span>
                <div className="space-y-1.5">
                  {r.exercises.map((re, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-1.5 text-zinc-700 font-medium">
                        <span className="w-1.5 h-1.5 rounded-full bg-zinc-950" />
                        <span className="truncate max-w-[150px] sm:max-w-[180px]">{re.exerciseName}</span>
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
            <div className="bg-zinc-50/60 px-5 py-3 border-t border-zinc-100 flex items-center justify-between text-[11px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                <ClipboardList className="w-3.5 h-3.5" />
                총 {r.exercises.length}개 운동 종목
              </span>
              <span>
                목표 {r.exercises.reduce((sum, e) => sum + e.targetSetsCount, 0)}세트
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
