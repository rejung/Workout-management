/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Target, Database, Dumbbell } from 'lucide-react';
import GoalSettings from './GoalSettings';
import BackupManager from '../BackupManager';
import ExerciseDatabase from '../ExerciseDatabase';
import { WorkoutLog, Routine, Exercise } from '../../types';
import { WeightLog } from '../../utils/workoutEngine';

export type SubTab = 'goals' | 'exercises' | 'data';

interface SettingsViewProps {
  logs: WorkoutLog[];
  routines: Routine[];
  exercises: Exercise[];
  weightLogs: WeightLog[];
  onImportData: (data: { logs: WorkoutLog[]; routines: Routine[]; exercises: Exercise[]; weightLogs: WeightLog[]; goalSettings?: any }) => void;
  onClearData: () => void;
  onShowAlert?: (message: string, title?: string) => void;
  onShowConfirm?: (message: string, onConfirm: () => void, title?: string) => void;
  activeSubTab?: SubTab;
  onSubTabChange?: (tab: SubTab) => void;
  onAddExercise: (ex: Exercise) => void;
  onDeleteExercise: (id: string) => void;
  onUpdateExercises: (updatedExercises: Exercise[]) => void;
  onUpdateLogs: (updatedLogs: WorkoutLog[]) => void;
  onUpdateRoutines: (updatedRoutines: Routine[]) => void;
}

export default function SettingsView({
  logs,
  routines,
  exercises,
  weightLogs,
  onImportData,
  onClearData,
  onShowAlert,
  onShowConfirm,
  activeSubTab: propActiveSubTab,
  onSubTabChange,
  onAddExercise,
  onDeleteExercise,
  onUpdateExercises,
  onUpdateLogs,
  onUpdateRoutines
}: SettingsViewProps) {
  const [localActiveSubTab, setLocalActiveSubTab] = useState<SubTab>('goals');
  const activeSubTab = propActiveSubTab !== undefined ? propActiveSubTab : localActiveSubTab;
  
  const handleVersionClick = () => {
    if (onShowAlert) {
      onShowAlert('Workout Management System v1.0.0 입니다.', 'App Version');
    }
  };

  const setActiveSubTab = (tab: SubTab) => {
    if (onSubTabChange) {
      onSubTabChange(tab);
    } else {
      setLocalActiveSubTab(tab);
    }
  };

  return (
    <div id="settings-view-container" className="bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 rounded-3xl border border-slate-800/40 shadow-xl">
      
      {/* Settings Navigation Tabs (Unified Dark Theme) */}
      <div className="flex border-b border-slate-800 overflow-x-auto scrollbar-none gap-2 pb-1">
        <button
          onClick={() => setActiveSubTab('goals')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeSubTab === 'goals'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>목표 관리</span>
        </button>

        <button
          onClick={() => setActiveSubTab('exercises')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeSubTab === 'exercises'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          <Dumbbell className="w-4 h-4" />
          <span>운동 사전</span>
        </button>

        <button
          onClick={() => setActiveSubTab('data')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-all shrink-0 cursor-pointer ${
            activeSubTab === 'data'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-white hover:border-slate-700'
          }`}
        >
          <Database className="w-4 h-4" />
          <span>데이터 관리</span>
        </button>
      </div>

      {/* Sub Tab Content */}
      <div className="animate-fade-in">
        {activeSubTab === 'goals' && (
          <GoalSettings logs={logs} weightLogs={weightLogs} />
        )}

        {activeSubTab === 'exercises' && (
          <div className="bg-zinc-50 text-zinc-900 p-6 rounded-2xl border border-zinc-200">
            <ExerciseDatabase
              exercises={exercises}
              logs={logs}
              routines={routines}
              onAddExercise={onAddExercise}
              onDeleteExercise={onDeleteExercise}
              onShowAlert={onShowAlert}
              onShowConfirm={onShowConfirm}
              onUpdateExercises={onUpdateExercises}
              onUpdateLogs={onUpdateLogs}
              onUpdateRoutines={onUpdateRoutines}
            />
          </div>
        )}

        {activeSubTab === 'data' && (
          <BackupManager
            logs={logs}
            routines={routines}
            exercises={exercises}
            weightLogs={weightLogs}
            onImportData={onImportData}
            onClearData={onClearData}
            onShowAlert={onShowAlert}
            onShowConfirm={onShowConfirm}
          />
        )}
      </div>
    </div>
  );
}
