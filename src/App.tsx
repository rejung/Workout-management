/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { WorkoutLog, Routine, Exercise } from './types';
import { WeightLog, generateUUID } from './utils/workoutEngine';
import { DEFAULT_EXERCISES, DEFAULT_ROUTINES } from './constants';
import { getLocalDateString } from './utils/dateUtils';
import { workoutRepository } from './storage/workoutRepository';
import { weightRepository } from './storage/weightRepository';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import WorkoutForm from './components/WorkoutForm';
import QuickInputView from './components/QuickInputView';
import RoutineManager from './components/RoutineManager';
import ExerciseDatabase from './components/ExerciseDatabase';
import SettingsView from './components/settings/SettingsView';
import WorkoutHistory from './components/WorkoutHistory';
import { goalRepository } from './storage/goalRepository';
import { 
  BarChart4, 
  Plus, 
  ClipboardList, 
  Dumbbell, 
  Settings, 
  History, 
  Calendar, 
  Clock, 
  MessageSquare,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit2,
  Sparkles,
  AlertCircle,
  HelpCircle,
  Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Tab = 'dashboard' | 'history' | 'log' | 'routines' | 'settings';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [editingLog, setEditingLog] = useState<WorkoutLog | null>(null);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [useDetailedForm, setUseDetailedForm] = useState<boolean>(false);
  const [preselectedRoutineId, setPreselectedRoutineId] = useState<string>('');
  const [appLoading, setAppLoading] = useState<boolean>(true);
  const [settingsSubTab, setSettingsSubTab] = useState<'goals' | 'exercises' | 'data'>('goals');

  // Custom modals state configs
  const [alertConfig, setAlertConfig] = useState<{ message: string; title?: string } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{
    message: string;
    title?: string;
    onConfirm: () => void;
    onCancel?: () => void;
  } | null>(null);

  const triggerAlert = (message: string, title?: string) => {
    setAlertConfig({ message, title });
  };

  const triggerConfirm = (message: string, onConfirm: () => void, title?: string) => {
    setConfirmConfig({ message, onConfirm, title });
  };

  // Initialize and load data from repositories
  useEffect(() => {
    // Run one-time database initializations and migrations safely on app startup
    workoutRepository.initialize();
    weightRepository.initialize();
    goalRepository.initializeGoalSettings();

    const initialExercises = workoutRepository.getExercises();
    const initialRoutines = workoutRepository.getRoutines();
    const initialLogs = workoutRepository.getLogs();
    const initialWeightLogs = weightRepository.getWeightLogs();

    setExercises(initialExercises);
    setRoutines(initialRoutines);
    setLogs(initialLogs);
    setWeightLogs(initialWeightLogs);

    // Simulate load state to satisfy premium feel and WCAG layout requirements
    const timer = setTimeout(() => {
      setAppLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, []);

  // Sync state helpers
  const saveLogsToStorage = (updatedLogs: WorkoutLog[]) => {
    workoutRepository.saveLogs(updatedLogs);
    setLogs(updatedLogs);
  };

  const saveRoutinesToStorage = (updatedRoutines: Routine[]) => {
    workoutRepository.saveRoutines(updatedRoutines);
    setRoutines(updatedRoutines);
  };

  const saveExercisesToStorage = (updatedExercises: Exercise[]) => {
    workoutRepository.saveExercises(updatedExercises);
    setExercises(updatedExercises);
  };

  const saveWeightLogsToStorage = (updatedWeightLogs: WeightLog[]) => {
    weightRepository.saveWeightLogs(updatedWeightLogs);
    setWeightLogs(updatedWeightLogs);
  };

  // Log Actions
  const handleSaveWorkout = (newLog: WorkoutLog) => {
    let updated: WorkoutLog[];
    const exists = logs.some(l => l.id === newLog.id);
    if (exists) {
      // Edit existing
      updated = logs.map(l => l.id === newLog.id ? newLog : l);
    } else {
      // Add new
      updated = [newLog, ...logs];
    }
    setEditingLog(null);
    setUseDetailedForm(false);
    // Sort chronological descending
    updated.sort((a, b) => b.date.localeCompare(a.date));
    saveLogsToStorage(updated);
    setActiveTab('dashboard');
  };

  const handleDeleteWorkout = (id: string) => {
    triggerConfirm('이 훈련 일지 기록을 완전히 삭제하시겠습니까?', () => {
      const updated = logs.filter(l => l.id !== id);
      saveLogsToStorage(updated);
    }, '훈련 일지 삭제');
  };

  const handleEditWorkout = (log: WorkoutLog) => {
    setEditingLog(log);
    setUseDetailedForm(true);
    setActiveTab('log');
  };

  const handleCloneWorkout = (log: WorkoutLog) => {
    // Deep copy exercises
    const clonedExercises = JSON.parse(JSON.stringify(log.exercises));
    
    const clonedLog: WorkoutLog = {
      id: generateUUID(),
      date: getLocalDateString(),
      startTime: (() => {
        const now = new Date();
        return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      })(),
      duration: log.duration,
      routineId: log.routineId,
      routineName: log.routineName,
      notes: log.notes || '',
      exercises: clonedExercises,
    };
    
    setEditingLog(clonedLog);
    setUseDetailedForm(true);
    setActiveTab('log');
    triggerAlert('선택한 지난 운동 기록을 오늘 훈련의 시작점으로 복사하였습니다. 오늘 세트를 완료한 후 저장하세요!', '기록 복사 완료');
  };

  // Routine Actions
  const handleAddRoutine = (r: Routine) => {
    const updated = [r, ...routines];
    saveRoutinesToStorage(updated);
  };

  const handleDeleteRoutine = (id: string) => {
    triggerConfirm('이 루틴 분할 템플릿을 삭제하시겠습니까?', () => {
      const updated = routines.filter(r => r.id !== id);
      saveRoutinesToStorage(updated);
    }, '루틴 템플릿 삭제');
  };

  // Exercise Actions
  const handleAddExercise = (ex: Exercise) => {
    const updated = [ex, ...exercises];
    saveExercisesToStorage(updated);
  };

  const handleDeleteExercise = (id: string) => {
    // Check if exercise is used in any log or routine
    const isUsedInLog = logs.some(log => log.exercises.some(e => e.exerciseId === id));
    const isUsedInRoutine = routines.some(r => r.exercises.some(e => e.exerciseId === id));

    if (isUsedInLog || isUsedInRoutine) {
      triggerAlert('이미 생성된 훈련 기록이나 분할 루틴 템플릿에서 해당 운동을 사용하고 있으므로 삭제할 수 없습니다.', '삭제 불가');
      return;
    }

    triggerConfirm('이 커스텀 운동 종목을 데이터베이스에서 지우시겠습니까?', () => {
      const updated = exercises.filter(ex => ex.id !== id);
      saveExercisesToStorage(updated);
    }, '운동 종목 삭제');
  };

  // Backup Admin Actions
  const handleImportBackup = (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs?: WeightLog[]; goalSettings?: any }) => {
    // ① Workout Logs (and routines/exercises)
    saveLogsToStorage(data.logs || []);
    if (data.routines) saveRoutinesToStorage(data.routines);
    if (data.exercises) saveExercisesToStorage(data.exercises);

    // ② Weight Logs
    if (data.weightLogs) {
      saveWeightLogsToStorage(data.weightLogs);
    }

    // ③ Goal Settings
    if (data.goalSettings && typeof data.goalSettings === 'object') {
      const currentOrDefaults = goalRepository.getGoalSettings();
      const mergedGoals = {
        ...currentOrDefaults,
        ...data.goalSettings
      };
      goalRepository.saveGoalSettings(mergedGoals);
      window.dispatchEvent(new Event('wms-goals-updated'));
    }
  };

  const handleClearAllData = () => {
    workoutRepository.clearAll();
    weightRepository.clearAll();
    setLogs([]);
    setRoutines([]);
    setExercises([]);
    setWeightLogs([]);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col font-sans text-zinc-900 antialiased selection:bg-zinc-950 selection:text-white">
      {/* Dynamic Top Announcement Panel */}
      <div className="bg-zinc-950 text-white text-xs py-2 px-4 text-center font-medium flex items-center justify-center gap-1.5">
        <Sparkles className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        <span>모든 운동 데이터는 브라우저 로컬 저장소에 안전하게 기록됩니다.</span>
      </div>

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-200 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex justify-between items-center">
          {/* Brand logo acts as Home (Dashboard) click target */}
          <button
            onClick={() => {
              setActiveTab('dashboard');
              setEditingLog(null);
              setUseDetailedForm(false);
            }}
            className="flex items-center gap-3 hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer text-left focus:outline-none"
          >
            <div className="p-2.5 bg-zinc-950 text-white rounded-xl shadow-md">
              <Dumbbell className="w-5 h-5 animate-spin-slow" />
            </div>
            <div>
              <h1 className="text-sm font-black text-zinc-900 tracking-tight">운동 기록</h1>
            </div>
          </button>

          {/* Nav Tabs for Desktop */}
          <nav className="hidden md:flex items-center gap-3">
            {[
              { id: 'dashboard', label: '분석', icon: BarChart4 },
              { id: 'log', label: editingLog ? '일지 수정 중' : '기록', icon: Plus },
              { id: 'history', label: '일지', icon: History },
              { id: 'routines', label: '루틴', icon: ClipboardList },
              { id: 'settings', label: '관리', icon: Settings },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as Tab);
                    if (tab.id !== 'log') {
                      setEditingLog(null);
                      setUseDetailedForm(false);
                    }
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-zinc-950 text-white shadow-xs' 
                      : 'text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100/90 active:bg-zinc-200/50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Interactive Screen Segment */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {appLoading ? (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div className="space-y-2">
                <div className="w-48 h-6 bg-zinc-200 rounded animate-pulse" />
                <div className="w-64 h-3 bg-zinc-100 rounded animate-pulse" />
              </div>
              <div className="w-28 h-8 bg-zinc-200 rounded-xl animate-pulse" />
            </div>

            {/* Grid layout for Dashboard Skeleton */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 animate-pulse">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white border border-zinc-200 rounded-2xl p-5 h-32 space-y-4">
                  <div className="flex justify-between">
                    <div className="w-12 h-3 bg-zinc-100 rounded" />
                    <div className="w-4 h-4 bg-zinc-100 rounded" />
                  </div>
                  <div className="w-20 h-6 bg-zinc-200 rounded" />
                  <div className="w-16 h-3 bg-zinc-100 rounded" />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 h-64 animate-pulse space-y-4">
                <div className="w-32 h-4 bg-zinc-200 rounded" />
                <div className="space-y-3">
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                </div>
              </div>
              <div className="bg-white border border-zinc-200 rounded-2xl p-6 h-64 animate-pulse space-y-4">
                <div className="w-32 h-4 bg-zinc-200 rounded" />
                <div className="space-y-3">
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                  <div className="w-full h-8 bg-zinc-100 rounded" />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
            >
              {activeTab === 'dashboard' && (
                <AnalyticsDashboard
                  logs={logs}
                  exercises={exercises}
                  weightLogs={weightLogs}
                  onStartWorkout={(routineId) => {
                    setPreselectedRoutineId(routineId);
                    setUseDetailedForm(false);
                    setEditingLog(null);
                    setActiveTab('log');
                  }}
                  onEditGoalClick={() => {
                    setSettingsSubTab('goals');
                    setActiveTab('settings');
                  }}
                  onRecordWeightClick={() => {
                    setEditingLog(null);
                    setUseDetailedForm(false);
                    setActiveTab('log');
                  }}
                  onViewAllLogs={() => {
                    setActiveTab('history');
                  }}
                />
              )}

              {activeTab === 'log' && (
                editingLog || useDetailedForm ? (
                  <WorkoutForm
                    exercises={exercises}
                    routines={routines}
                    history={logs}
                    editingLog={editingLog}
                    onSave={handleSaveWorkout}
                    onCancel={() => {
                      setEditingLog(null);
                      setUseDetailedForm(false);
                      setActiveTab('dashboard');
                    }}
                    onShowAlert={triggerAlert}
                    onShowConfirm={triggerConfirm}
                  />
                ) : (
                  <div className="space-y-4">
                    {/* Mode switcher header */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => setUseDetailedForm(true)}
                        className="inline-flex items-center gap-1.5 bg-zinc-100 hover:bg-zinc-250 text-zinc-700 text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer border border-zinc-200"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-zinc-500" />
                        <span>상세 기록 모드로 전환</span>
                      </button>
                    </div>
                    <QuickInputView
                      exercises={exercises}
                      routines={routines}
                      history={logs}
                      weightLogs={weightLogs}
                      onSaveWeight={saveWeightLogsToStorage}
                      onSave={handleSaveWorkout}
                      initialRoutineId={preselectedRoutineId}
                      onClearInitialRoutine={() => setPreselectedRoutineId('')}
                      onCancel={() => {
                        setEditingLog(null);
                        setUseDetailedForm(false);
                        setActiveTab('dashboard');
                      }}
                      onShowAlert={triggerAlert}
                      onShowConfirm={triggerConfirm}
                    />
                  </div>
                )
              )}

              {activeTab === 'routines' && (
                <RoutineManager
                  routines={routines}
                  exercises={exercises}
                  onAddRoutine={handleAddRoutine}
                  onDeleteRoutine={handleDeleteRoutine}
                  onShowAlert={triggerAlert}
                  onShowConfirm={triggerConfirm}
                />
              )}

              {activeTab === 'settings' && (
                <SettingsView
                  logs={logs}
                  routines={routines}
                  exercises={exercises}
                  weightLogs={weightLogs}
                  onImportData={handleImportBackup}
                  onClearData={handleClearAllData}
                  onShowAlert={triggerAlert}
                  onShowConfirm={triggerConfirm}
                  activeSubTab={settingsSubTab}
                  onSubTabChange={setSettingsSubTab}
                  onAddExercise={handleAddExercise}
                  onDeleteExercise={handleDeleteExercise}
                  onUpdateExercises={saveExercisesToStorage}
                  onUpdateLogs={saveLogsToStorage}
                  onUpdateRoutines={saveRoutinesToStorage}
                />
              )}

            {activeTab === 'history' && (
              <WorkoutHistory
                logs={logs}
                exercises={exercises}
                onEditLog={handleEditWorkout}
                onDeleteLog={handleDeleteWorkout}
                onCloneLog={handleCloneWorkout}
                onShowAlert={triggerAlert}
                onShowConfirm={triggerConfirm}
                onAddWorkoutClick={() => {
                  setEditingLog(null);
                  setUseDetailedForm(false);
                  setActiveTab('log');
                }}
              />
            )}
          </motion.div>
        </AnimatePresence>
        )}
      </main>

      {/* Interactive Mobile Tab Bar */}
      <footer className="md:hidden sticky bottom-0 bg-white border-t border-zinc-200 z-40">
        <div className="grid grid-cols-5 h-14">
          {[
            { id: 'dashboard', label: '분석', icon: BarChart4 },
            { id: 'log', label: '기록', icon: Plus },
            { id: 'history', label: '일지', icon: History },
            { id: 'routines', label: '루틴', icon: ClipboardList },
            { id: 'settings', label: '관리', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as Tab);
                  if (tab.id !== 'log') {
                    setEditingLog(null);
                    setUseDetailedForm(false);
                  }
                }}
                className={`flex flex-col items-center justify-center gap-1 cursor-pointer ${
                  isActive ? 'text-zinc-950 font-bold' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* Custom Alert Modal */}
      <AnimatePresence>
        {alertConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 border border-zinc-200 shadow-xl space-y-4"
            >
              <div className="flex items-start gap-3 text-amber-600">
                <AlertCircle className="w-6 h-6 shrink-0" />
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 text-sm">{alertConfig.title || '안내'}</h3>
                  <p className="text-zinc-600 text-xs leading-relaxed">{alertConfig.message}</p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setAlertConfig(null)}
                  className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer min-h-[44px] min-w-[80px]"
                >
                  확인
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Custom Confirm Modal */}
      <AnimatePresence>
        {confirmConfig && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl max-w-sm w-full p-6 border border-zinc-200 shadow-xl space-y-4"
            >
              <div className="flex items-start gap-3 text-zinc-900">
                <HelpCircle className="w-6 h-6 text-zinc-600 shrink-0" />
                <div className="space-y-1">
                  <h3 className="font-bold text-zinc-900 text-sm">{confirmConfig.title || '확인'}</h3>
                  <p className="text-zinc-600 text-xs leading-relaxed">{confirmConfig.message}</p>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => {
                    if (confirmConfig.onCancel) confirmConfig.onCancel();
                    setConfirmConfig(null);
                  }}
                  className="px-4 py-2.5 border border-zinc-200 rounded-xl text-xs text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors cursor-pointer min-h-[44px] min-w-[80px]"
                >
                  취소
                </button>
                <button
                  onClick={() => {
                    confirmConfig.onConfirm();
                    setConfirmConfig(null);
                  }}
                  className="bg-zinc-950 hover:bg-zinc-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-colors cursor-pointer min-h-[44px] min-w-[80px]"
                >
                  진행
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
