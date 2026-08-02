/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useGoalSettings } from '../../hooks/useGoalSettings';
import { GoalSettings as IGoalSettings } from '../../types/goal';
import { WorkoutLog } from '../../types';
import { 
  calculateWeightMetrics, 
  getE1RMChange, 
  isSquat, 
  isBenchPress, 
  isDeadlift, 
  isOHP, 
  WeightLog 
} from '../../utils/workoutEngine';
import { getLocalDateString, getLastNDaysRange } from '../../utils/dateUtils';
import { 
  getThreeLiftCurrent, 
  getGoalRemaining, 
  getGoalProgressPercent 
} from '../../utils/goalSelectors';
import { Scale, Flame, RefreshCw, Save, Trophy, Plus, Minus, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface GoalSettingsProps {
  logs: WorkoutLog[];
  weightLogs: WeightLog[];
}

export default function GoalSettings({ logs, weightLogs }: GoalSettingsProps) {
  const {
    goalSettings,
    threeLiftGoal,
    updateGoal,
    saveGoals,
    resetGoals,
    isDirty,
    validationErrors,
    hasErrors
  } = useGoalSettings();

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2000); // 2 seconds auto dismiss as requested
  };

  const handleInputChange = (key: keyof IGoalSettings, valueStr: string) => {
    if (key === 'weightGoal') {
      const val = parseFloat(valueStr);
      updateGoal(key, isNaN(val) ? NaN : val);
    } else {
      const val = parseInt(valueStr, 10);
      updateGoal(key, isNaN(val) ? NaN : val);
    }
  };

  const handleStep = (key: keyof IGoalSettings, delta: number) => {
    const currentVal = goalSettings[key];
    const base = isNaN(currentVal) ? 0 : currentVal;
    if (key === 'weightGoal') {
      const newVal = Math.round((base + delta) * 10) / 10;
      updateGoal(key, Math.max(30, Math.min(300, newVal)));
    } else {
      const newVal = Math.round(base + delta);
      updateGoal(key, Math.max(0, Math.min(1000, newVal)));
    }
  };

  const handleSave = () => {
    if (hasErrors) return;
    const success = saveGoals();
    if (success) {
      showToast('목표를 저장했습니다.');
    }
  };

  const handleReset = () => {
    resetGoals();
    showToast('기본 목표로 초기화했습니다.');
  };

  const getDisplayVal = (val: number): string => {
    if (isNaN(val) || val === null || val === undefined) return '';
    return val.toString();
  };

  // 1. Core measurements for "Current Status" to compare against goals
  const p1Start = getLastNDaysRange(28).startDateStr;
  const p2Start = getLastNDaysRange(56).startDateStr;
  const p3Start = getLastNDaysRange(84).startDateStr;

  const weightMetrics = calculateWeightMetrics(weightLogs);
  const squatChange = getE1RMChange(logs, isSquat, p1Start, p2Start, p3Start);
  const benchChange = getE1RMChange(logs, isBenchPress, p1Start, p2Start, p3Start);
  const deadliftChange = getE1RMChange(logs, isDeadlift, p1Start, p2Start, p3Start);
  const ohpChange = getE1RMChange(logs, isOHP, p1Start, p2Start, p3Start);

  // Compute stats using selectors to respect SSOT
  const weightCurrent = weightMetrics.current;
  const weightGoal = goalSettings.weightGoal || 0;
  const weightRemaining = getGoalRemaining(weightCurrent, weightGoal);
  const weightProgress = getGoalProgressPercent(weightCurrent, weightGoal);

  const squatCurrent = squatChange.current;
  const squatGoal = goalSettings.squatGoal || 0;
  const squatRemaining = getGoalRemaining(squatCurrent, squatGoal);
  const squatProgress = getGoalProgressPercent(squatCurrent, squatGoal);

  const benchCurrent = benchChange.current;
  const benchGoal = goalSettings.benchGoal || 0;
  const benchRemaining = getGoalRemaining(benchCurrent, benchGoal);
  const benchProgress = getGoalProgressPercent(benchCurrent, benchGoal);

  const deadliftCurrent = deadliftChange.current;
  const deadliftGoal = goalSettings.deadliftGoal || 0;
  const deadliftRemaining = getGoalRemaining(deadliftCurrent, deadliftGoal);
  const deadliftProgress = getGoalProgressPercent(deadliftCurrent, deadliftGoal);

  const ohpCurrent = ohpChange.current;
  const ohpGoal = goalSettings.ohpGoal || 0;
  const ohpRemaining = getGoalRemaining(ohpCurrent, ohpGoal);
  const ohpProgress = getGoalProgressPercent(ohpCurrent, ohpGoal);

  const totalCurrentVal = getThreeLiftCurrent(squatCurrent, benchCurrent, deadliftCurrent);
  const totalRemaining = getGoalRemaining(totalCurrentVal, threeLiftGoal);
  const totalProgress = getGoalProgressPercent(totalCurrentVal, threeLiftGoal);

  return (
    <div className="space-y-5">
      {/* Header Block with Zero-waste Spacing */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span>목표 설정 & 관리</span>
        </h1>
        <p className="text-slate-400 text-xs mt-1 leading-normal">
          체중과 운동 목표를 설정합니다. 변경한 목표는 분석 대시보드에 자동으로 반영되어 현재 기록과 비교하며 진행 상황을 한눈에 추적할 수 있습니다.
        </p>
      </div>

      {/* Success/Toast Notification (2 seconds duration) */}
      {toastMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl p-3 flex items-center gap-3 text-xs animate-fade-in font-semibold">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 3 independent Cards: Weight Goal, Main Lifts Goal, Goal Summary (3-Lift Total) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Card 1: 체중 목표 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-sky-400" />
                <span>체중 목표</span>
              </h3>
              <span className="text-[10px] font-mono font-bold bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                신체 관리
              </span>
            </div>

            {/* Stepper Input UI */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 block">목표 체중 (Goal Weight)</label>
              <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl overflow-hidden focus-within:border-indigo-500/80 focus-within:ring-1 focus-within:ring-indigo-500/30 transition-all">
                <button
                  type="button"
                  onClick={() => handleStep('weightGoal', -0.5)}
                  className="px-3.5 py-2.5 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer text-xs font-black border-r border-slate-850/60 h-full flex items-center justify-center min-w-[38px]"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <div className="relative flex-1">
                  <input
                    type="number"
                    step="0.1"
                    value={getDisplayVal(goalSettings.weightGoal)}
                    onChange={(e) => handleInputChange('weightGoal', e.target.value)}
                    className={`w-full bg-transparent border-none text-center focus:outline-none focus:ring-0 text-sm text-white font-mono font-bold py-2.5 px-3 ${
                      validationErrors.weightGoal ? 'border-b-2 border-rose-500' : ''
                    }`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 font-mono">
                    kg
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleStep('weightGoal', 0.5)}
                  className="px-3.5 py-2.5 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer text-xs font-black border-l border-slate-850/60 h-full flex items-center justify-center min-w-[38px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
              {validationErrors.weightGoal && (
                <p className="text-rose-400 text-[11px] font-semibold animate-fade-in flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{validationErrors.weightGoal}</span>
                </p>
              )}
            </div>
          </div>

          {/* Sub-stats Block with Neutral Color Scheme */}
          <div className="space-y-4 pt-3 border-t border-slate-800/60">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">현재 체중</span>
                <span className="text-xs font-black text-white font-mono">{weightCurrent.toFixed(1)}kg</span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">목표 체중</span>
                <span className="text-xs font-black text-sky-400 font-mono">{isNaN(weightGoal) ? '-' : `${weightGoal.toFixed(1)}kg`}</span>
              </div>
              <div className="bg-slate-950/40 p-2 rounded-xl border border-slate-800/40">
                <span className="text-[10px] font-bold text-slate-400 block mb-0.5">남은 목표</span>
                <span className="text-xs font-black text-slate-200 font-mono">
                  {isNaN(weightGoal) ? '-' : `${weightRemaining >= 0 ? '+' : ''}${weightRemaining.toFixed(1)}kg`}
                </span>
              </div>
            </div>

            {/* Progress Bar (Neutral Blue/Slate Theme) */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                <span>체중 목표 달성률</span>
                <span className="text-sky-400 font-mono">
                  {isNaN(weightProgress) ? '0' : Math.min(weightProgress, 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-950 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${isNaN(weightProgress) ? 0 : Math.min(weightProgress, 100)}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full rounded-full bg-sky-500"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: 메인 리프트 목표 */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Flame className="w-4 h-4 text-emerald-400" />
                <span>메인 리프트 목표</span>
              </h3>
              <span className="text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                점진적 과부하
              </span>
            </div>

            {/* Grid of 4 Lifts */}
            <div className="space-y-3">
              {[
                { key: 'benchGoal', label: '벤치프레스', current: benchCurrent, goal: benchGoal, remaining: benchRemaining, progress: benchProgress, color: 'text-indigo-400' },
                { key: 'ohpGoal', label: 'OHP', current: ohpCurrent, goal: ohpGoal, remaining: ohpRemaining, progress: ohpProgress, color: 'text-purple-400' },
                { key: 'squatGoal', label: '스쿼트', current: squatCurrent, goal: squatGoal, remaining: squatRemaining, progress: squatProgress, color: 'text-emerald-400' },
                { key: 'deadliftGoal', label: '데드리프트', current: deadliftCurrent, goal: deadliftGoal, remaining: deadliftRemaining, progress: deadliftProgress, color: 'text-amber-400' }
              ].map((lift) => {
                const key = lift.key as keyof IGoalSettings;
                return (
                  <div key={lift.key} className="bg-slate-950/35 p-3 rounded-xl border border-slate-850/60 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-300">{lift.label}</span>
                      <span className="text-[10px] font-bold text-slate-400 font-mono">
                        현재: {lift.current}kg
                      </span>
                    </div>

                    {/* Input with Stepper UI */}
                    <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-0">
                      <button
                        type="button"
                        onClick={() => handleStep(key, -5)}
                        className="px-2.5 py-1.5 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer text-[10px] font-bold border-r border-slate-850"
                      >
                        -5
                      </button>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          value={getDisplayVal(goalSettings[key])}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          className={`w-full bg-transparent border-none text-center focus:outline-none focus:ring-0 text-xs text-white font-mono font-extrabold py-1.5 ${
                            validationErrors[key] ? 'border-b-2 border-rose-500' : ''
                          }`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-500 font-mono">
                          kg
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleStep(key, 5)}
                        className="px-2.5 py-1.5 text-slate-400 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer text-[10px] font-bold border-l border-slate-850"
                      >
                        +5
                      </button>
                    </div>

                    {validationErrors[key] && (
                      <p className="text-rose-400 text-[10px] font-semibold animate-fade-in flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 shrink-0" />
                        <span>{validationErrors[key]}</span>
                      </p>
                    )}

                    {/* Progress Bar & Stats */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-bold text-slate-500 font-mono">
                        <span>진행률: {isNaN(lift.progress) ? '0.0' : Math.min(lift.progress, 100).toFixed(1)}%</span>
                        <span>남은 목표: {isNaN(lift.remaining) ? '-' : lift.remaining <= 0 ? '달성!' : `+${lift.remaining}kg`}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${isNaN(lift.progress) ? 0 : Math.min(lift.progress, 100)}%` }}
                          transition={{ duration: 0.8, ease: 'easeOut' }}
                          className="h-full bg-emerald-400 rounded-full"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Card 3: 목표 요약 (3대 합계) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>목표 요약</span>
              </h3>
              <span className="text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                3대 합계
              </span>
            </div>

            <div className="space-y-4 bg-slate-950/45 p-4 rounded-xl border border-slate-850/60">
              <div className="space-y-0.5">
                <span className="text-[10px] font-bold text-slate-400 block uppercase">목표 3대 합계</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-black text-amber-400 tracking-tight font-mono">
                    {isNaN(threeLiftGoal) ? '-' : threeLiftGoal}
                  </span>
                  <span className="text-xs font-extrabold text-slate-500 font-mono">kg</span>
                </div>
              </div>
              
              <div className="border-t border-slate-800/80 pt-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">현재 3대 합계</span>
                  <span className="font-extrabold text-white font-mono">{totalCurrentVal} kg</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">남은 합계 목표</span>
                  <span className="font-extrabold text-amber-400 font-mono">
                    {totalRemaining <= 0 ? '목표 완료!' : `+${totalRemaining} kg`}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-slate-500 leading-normal pl-1">
              * 벤치프레스, 스쿼트, 데드리프트 목표의 합산 중량입니다. 메인 리프트를 유기적으로 성장시켜 3대 목표를 완수하세요.
            </p>
          </div>

          {/* Progress Bar (Gold Theme) */}
          <div className="space-y-2.5 pt-4 border-t border-slate-800/60">
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                <span>합계 목표 달성률</span>
                <span className="text-amber-400 font-mono">
                  {isNaN(totalProgress) ? '0.0' : Math.min(totalProgress, 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${isNaN(totalProgress) ? 0 : Math.min(totalProgress, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className="h-full rounded-full bg-amber-500"
                />
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Actions Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-md">
        <div className="flex items-center gap-2">
          {isDirty ? (
            <div className="flex items-center gap-2 text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>변경사항 있음</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-slate-500 bg-slate-950/40 border border-slate-850 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-700" />
              <span>변경사항 없음</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-slate-400 hover:text-white text-xs font-bold rounded-xl border border-slate-800 hover:border-slate-700 transition-all cursor-pointer min-h-[44px]"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>기본 목표 복원</span>
          </button>
          
          <button
            type="button"
            disabled={!isDirty || hasErrors}
            onClick={handleSave}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-6 py-2.5 text-xs font-bold rounded-xl transition-all border cursor-pointer min-h-[44px] ${
              isDirty && !hasErrors
                ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-600 text-white shadow-lg shadow-indigo-600/15'
                : 'bg-slate-800 border-slate-700/50 text-slate-500 cursor-not-allowed'
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            <span>목표 저장</span>
          </button>
        </div>
      </div>
    </div>
  );
}
