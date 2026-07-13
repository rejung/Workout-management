/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Calendar, Sparkles, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { WorkoutLog, Exercise } from '../types';
import DashboardHeader from './dashboard/DashboardHeader';
import SummaryCards from './dashboard/SummaryCards';
import CardioMileage, { RecommendedWorkoutCard, CardioMileageCard } from './dashboard/CardioMileage';
import BestWorksets from './dashboard/BestWorksets';
import WeightDetailModal from './dashboard/WeightDetailModal';
import { getMainLiftOfLog } from '../utils/recommendationEngine';
import {
  calculateWeightMetrics,
  getE1RMChange,
  getCardioMileage,
  getBestWorkset,
  getNextRecommendation,
  getBestPR,
  isSquat,
  isBenchPress,
  isDeadlift,
  isOHP,
  WeightLog,
  selectRunningPB
} from '../utils/workoutEngine';
import { weightRepository } from '../storage/weightRepository';
import { getLocalDateString } from '../utils/dateUtils';
import { useGoalSettings } from '../hooks/useGoalSettings';
import { extractCardioRecord } from '../domain/cardio';

const formatDateKorean = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return `${month}월 ${day}일`;
  }
  return dateStr;
};

const formatToMMDD = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const day = parts[2]; // keep leading zero if present, e.g. '03'
    return `${month}/${day}`;
  }
  return dateStr;
};

function getLogMainLiftAndSet(log: WorkoutLog) {
  if (!log.exercises || log.exercises.length === 0) {
    return {
      mainLift: log.routineName || '기타 운동',
      worksetStr: '기록 없음',
      auxCount: 0
    };
  }

  // First exercise is the representative main lift
  const mainEx = log.exercises[0];
  const mainLiftName = mainEx.exerciseName;
  
  // Find work sets (non-warmup)
  const workSets = mainEx.sets.filter(s => !s.isWarmup);
  const activeSets = workSets.length > 0 ? workSets : mainEx.sets;

  let worksetStr = '';
  if (activeSets.length > 0) {
    const weights = activeSets.map(s => s.weight);
    const maxWeight = Math.max(...weights);
    const setsAtMax = activeSets.filter(s => s.weight === maxWeight);
    const repsAtMax = setsAtMax[0]?.reps || 0;
    
    // Check if it's cardio
    const isCardio = mainEx.category === 'Cardio';
    if (isCardio) {
      const cardioRecords = activeSets.map(s => extractCardioRecord(s));
      const totalDist = cardioRecords.reduce((sum, r) => sum + r.distanceKm, 0);
      if (totalDist > 0) {
        worksetStr = `${totalDist.toFixed(1)} km`;
      } else {
        const totalTime = cardioRecords.reduce((sum, r) => sum + r.timeSeconds, 0);
        const mins = Math.floor(totalTime / 60);
        worksetStr = `${mins > 0 ? `${mins}분` : '수행 완료'}`;
      }
    } else {
      // Weight training
      if (setsAtMax.length === activeSets.length) {
        worksetStr = `${maxWeight}kg × ${repsAtMax} × ${activeSets.length}`;
      } else {
        worksetStr = `${maxWeight}kg × ${repsAtMax} (${activeSets.length}S)`;
      }
    }
  } else {
    worksetStr = '작업세트 없음';
  }

  const auxCount = Math.max(0, log.exercises.length - 1);

  return {
    mainLift: mainLiftName,
    worksetStr,
    auxCount
  };
}

interface AnalyticsDashboardProps {
  logs: WorkoutLog[];
  exercises: Exercise[];
  weightLogs?: WeightLog[];
  onStartWorkout?: (routineId: string) => void;
  onEditGoalClick?: () => void;
  onRecordWeightClick?: () => void;
  onViewAllLogs?: () => void;
}

export default function AnalyticsDashboard({ 
  logs, 
  exercises, 
  weightLogs: propWeightLogs, 
  onStartWorkout, 
  onEditGoalClick, 
  onRecordWeightClick,
  onViewAllLogs
}: AnalyticsDashboardProps) {
  const [weightLogs, setWeightLogs] = useState<WeightLog[]>([]);
  const [isWeightModalOpen, setIsWeightModalOpen] = useState<boolean>(false);
  const [showDetailedReasons, setShowDetailedReasons] = useState<boolean>(false);
  const { goalSettings, threeLiftGoal } = useGoalSettings();

  useEffect(() => {
    if (propWeightLogs) {
      setWeightLogs(propWeightLogs);
    } else {
      setWeightLogs(weightRepository.getWeightLogs());
    }
  }, [propWeightLogs]);

  const now = new Date();
  const p1Start = getLocalDateString(new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000)); // 4 weeks ago
  const p2Start = getLocalDateString(new Date(now.getTime() - 56 * 24 * 60 * 60 * 1000)); // 8 weeks ago
  const p3Start = getLocalDateString(new Date(now.getTime() - 84 * 24 * 60 * 60 * 1000)); // 12 weeks ago

  // 1. Calculations
  const weightMetrics = calculateWeightMetrics(weightLogs);
  const squatChange = getE1RMChange(logs, isSquat, p1Start, p2Start, p3Start);
  const benchChange = getE1RMChange(logs, isBenchPress, p1Start, p2Start, p3Start);
  const deadliftChange = getE1RMChange(logs, isDeadlift, p1Start, p2Start, p3Start);
  const ohpChange = getE1RMChange(logs, isOHP, p1Start, p2Start, p3Start);

  // Dynamic header summary string
  const headerSummaryText = `체중 ${weightMetrics.diff >= 0 ? '+' : ''}${weightMetrics.diff.toFixed(1)}kg, ` +
    `스쿼트 ${squatChange.diff4W >= 0 ? '+' : ''}${squatChange.diff4W}kg, ` +
    `벤치프레스 ${benchChange.diff4W >= 0 ? '+' : ''}${benchChange.diff4W}kg, ` +
    `데드리프트 ${deadliftChange.diff4W >= 0 ? '+' : ''}${deadliftChange.diff4W}kg, ` +
    `OHP ${ohpChange.diff4W >= 0 ? '+' : ''}${ohpChange.diff4W}kg`;

  // 2. SummaryCards Props
  const squatPR = getBestPR(logs, isSquat);
  const benchPR = getBestPR(logs, isBenchPress);
  const deadliftPR = getBestPR(logs, isDeadlift);
  const ohpPR = getBestPR(logs, isOHP);

  const totalCurrentVal = squatChange.current + benchChange.current + deadliftChange.current;
  const totalGoalVal = threeLiftGoal;
  const totalProgress = (totalCurrentVal / totalGoalVal) * 100;

  const weightProgress = (weightMetrics.current / goalSettings.weightGoal) * 100;

  const summaryMetrics = [
    {
      id: 'weight',
      title: '체중',
      value: `${weightMetrics.current.toFixed(1)}kg`,
      subValue: `${weightMetrics.diff >= 0 ? '+' : ''}${weightMetrics.diff.toFixed(1)}kg (4주 전 대비)`,
      goal: `목표: ${goalSettings.weightGoal.toFixed(1)}kg`,
      progress: weightProgress,
    },
    {
      id: 'squat',
      title: '스쿼트 추정 1RM',
      value: `${squatChange.current} kg`,
      subValue: `최고 PR: ${squatPR}`,
      goal: `목표: ${goalSettings.squatGoal} kg`,
      progress: (squatChange.current / goalSettings.squatGoal) * 100,
    },
    {
      id: 'bench',
      title: '벤치프레스 추정 1RM',
      value: `${benchChange.current} kg`,
      subValue: `최고 PR: ${benchPR}`,
      goal: `목표: ${goalSettings.benchGoal} kg`,
      progress: (benchChange.current / goalSettings.benchGoal) * 100,
    },
    {
      id: 'deadlift',
      title: '데드리프트 추정 1RM',
      value: `${deadliftChange.current} kg`,
      subValue: `최고 PR: ${deadliftPR}`,
      goal: `목표: ${goalSettings.deadliftGoal} kg`,
      progress: (deadliftChange.current / goalSettings.deadliftGoal) * 100,
    },
    {
      id: 'ohp',
      title: 'OHP 추정 1RM',
      value: `${ohpChange.current} kg`,
      subValue: `최고 PR: ${ohpPR}`,
      goal: `목표: ${goalSettings.ohpGoal} kg`,
      progress: (ohpChange.current / goalSettings.ohpGoal) * 100,
    },
    {
      id: 'total',
      title: '3대 합계',
      value: `${totalCurrentVal} kg`,
      subValue: '스쿼트+벤치+데드 합산',
      goal: `목표: ${totalGoalVal} kg`,
      progress: totalProgress,
      isTotal: true,
    },
  ];

  // 3. CardioMileage Props
  const cardioMetrics = getCardioMileage(logs, p1Start, p2Start);
  const mileageRows = [
    { label: '최근 4주', value: `${cardioMetrics.recent4Weeks.toFixed(1)} km` },
    { label: '최근 8주', value: `${cardioMetrics.recent8Weeks.toFixed(1)} km` },
    { label: '전체 누적 거리', value: `${cardioMetrics.total.toFixed(1)} km` },
  ];
  const nextRecommendation = getNextRecommendation(logs, goalSettings);
  const runningPBs = selectRunningPB(logs);

  // 4. BestWorksets Props
  const squatBest = {
    ...getBestWorkset(logs, isSquat, '스쿼트', '100 kg × 5회 × 5세트', '2026-06-09', '볼륨 점진적 과부하 달성', 100),
    goal: goalSettings.squatGoal
  };
  const benchBest = {
    ...getBestWorkset(logs, isBenchPress, '벤치프레스', '70 kg × 3회 × 3세트', '2026-06-25', '안정적인 정점 수축 통제', 70),
    goal: goalSettings.benchGoal
  };
  const deadliftBest = {
    ...getBestWorkset(logs, isDeadlift, '데드리프트', '130 kg × 5회 × 1세트', '2026-06-23', '완벽한 락아웃 전신 고정', 130),
    goal: goalSettings.deadliftGoal
  };
  const ohpBest = {
    ...getBestWorkset(logs, isOHP, 'OHP', '50 kg × 5회 × 5세트', '2026-06-21', '코어 텐션 유지 견착 완수', 50),
    goal: goalSettings.ohpGoal
  };

  const bestWorksets = [
    squatBest,
    benchBest,
    deadliftBest,
    ohpBest
  ];

  return (
    <div id="analytics-dashboard-view" className="bg-slate-950 text-slate-100 p-4 sm:p-5 lg:p-6 space-y-5 sm:space-y-6 rounded-3xl border border-slate-800/40">
      
      {/* Dashboard Title Header */}
      <DashboardHeader summaryText={headerSummaryText} />

      {/* 핵심 KPI 카드 (오늘의 판단) */}
      <SummaryCards
        metrics={summaryMetrics}
        onEditGoalClick={onEditGoalClick}
        onWeightCardClick={() => setIsWeightModalOpen(true)}
      />

      {/* 오늘 추천 훈련 & 최근 운동 기록 (오늘의 행동) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <RecommendedWorkoutCard 
          nextRecommendation={nextRecommendation} 
          onStartWorkout={onStartWorkout} 
        />
        
        {/* 최근 훈련 현황 - 최근 훈련 현황(Training Activity) 위젯 */}
        <div id="recent-workouts-dashboard-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-lg flex flex-col justify-between h-full transition-all duration-300 hover:border-indigo-500/10">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800/60 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20">
                  <Calendar className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-slate-100 tracking-tight font-sans">최근 운동</h2>
              </div>
            </div>

            {logs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs font-medium font-sans">
                아직 등록된 운동 기록이 없습니다. 새로운 운동을 기록해 보세요!
              </div>
            ) : (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                <div className="space-y-6">
                  {/* (1) 최근 운동 */}
                  <div className="space-y-3">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">최근 운동</h3>
                    <div className="relative pl-4 border-l border-slate-800/80 space-y-3.5 my-2">
                      {logs.slice(0, 5).map((log) => {
                        const { mainLift, worksetStr } = getLogMainLiftAndSet(log);
                        return (
                          <div key={log.id} className="relative group flex items-center justify-between gap-4">
                            {/* Timeline dot */}
                            <div className="absolute -left-[20.5px] top-[50%] -translate-y-[50%] w-2 h-2 rounded-full bg-indigo-500 border border-slate-900 group-hover:scale-125 transition-transform duration-200" />
                            
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <span className="text-xs font-mono font-bold text-slate-400 shrink-0">
                                {formatToMMDD(log.date)}
                              </span>
                              <span className="text-sm font-extrabold text-slate-100 truncate">
                                {mainLift}
                              </span>
                            </div>
                            
                            <div className="text-right shrink-0">
                              <span className="inline-block text-xs font-mono font-bold text-indigo-400 bg-indigo-950/20 border border-indigo-500/10 px-2.5 py-0.5 rounded-lg">
                                {worksetStr}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* (2) 최근 운동 간격 */}
                  {(() => {
                    const lastLog = logs[0];
                    let lastActiveText = '기록 없음';
                    if (lastLog) {
                      const today = new Date();
                      const diffTime = Math.abs(today.getTime() - new Date(lastLog.date).getTime());
                      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                      lastActiveText = diffDays === 0 ? '오늘 수행함' : `${diffDays}일 전`;
                    }

                    const today = new Date();
                    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    sevenDaysAgo.setHours(0, 0, 0, 0);
                    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
                    const recent7DaysCount = logs.filter(log => log.date >= sevenDaysAgoStr).length;

                    return (
                      <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3.5 rounded-xl border border-slate-850/60">
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 block">마지막 운동 간격</span>
                          <span className="text-xs font-mono font-black text-slate-200">
                            {lastActiveText}
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-[10px] font-bold text-slate-500 block">최근 7일 빈도</span>
                          <span className="text-xs font-mono font-black text-slate-200">
                            {recent7DaysCount}회 수행
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* (3) 이번 주 완료율 */}
                  {(() => {
                    const today = new Date();
                    const currentDay = today.getDay();
                    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
                    const mondayOfThisWeek = new Date(today.getTime());
                    mondayOfThisWeek.setDate(today.getDate() - distanceToMonday);
                    mondayOfThisWeek.setHours(0, 0, 0, 0);

                    const mondayStr = mondayOfThisWeek.toISOString().split('T')[0];
                    const completedThisWeek = logs.filter(log => log.date >= mondayStr).length;
                    const targetWeeklyWorkouts = 4;
                    const progressPct = Math.min((completedThisWeek / targetWeeklyWorkouts) * 100, 100);

                    return (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">이번 주 완료율</h3>
                          <span className="text-[11px] font-mono font-bold text-indigo-400">
                            {completedThisWeek} / {targetWeeklyWorkouts}회 완료
                          </span>
                        </div>
                        <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-slate-800/40">
                          <div 
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 rounded-full transition-all duration-500"
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })()}

                  {/* (4) 훈련 그룹 분포 (Push, Pull, Lower. Cardio 분리) */}
                  {(() => {
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    thirtyDaysAgo.setHours(0, 0, 0, 0);
                    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

                    const last30DaysLogs = logs.filter(log => log.date >= thirtyDaysAgoStr);

                    let pushCount = 0;
                    let pullCount = 0;
                    let lowerCount = 0;
                    let cardioCount = 0;

                    last30DaysLogs.forEach(log => {
                      const mainLift = getMainLiftOfLog(log);
                      if (mainLift) {
                        if (mainLift === '벤치프레스' || mainLift === 'OHP') {
                          pushCount++;
                        } else if (mainLift === '데드리프트' || mainLift === '바벨 로우') {
                          pullCount++;
                        } else if (mainLift === '스쿼트') {
                          lowerCount++;
                        } else if (mainLift === '러닝') {
                          cardioCount++;
                        }
                      }
                    });

                    const strengthCount = pushCount + pullCount + lowerCount;
                    const maxStrength = Math.max(pushCount, pullCount, lowerCount, 1);

                    const groups = [
                      { name: 'Push (밀기)', count: pushCount, color: 'bg-indigo-500', subtext: '벤치프레스, OHP' },
                      { name: 'Pull (당기기)', count: pullCount, color: 'bg-amber-500', subtext: '데드리프트, 로우' },
                      { name: 'Lower (하체)', count: lowerCount, color: 'bg-emerald-500', subtext: '스쿼트' },
                    ];

                    let balanceStatus = '훈련 데이터 축적 중입니다.';
                    if (strengthCount > 0) {
                      const maxVal = Math.max(pushCount, pullCount, lowerCount);
                      const minVal = Math.min(pushCount, pullCount, lowerCount);
                      const diff = maxVal - minVal;

                      if (lowerCount === 0) {
                        balanceStatus = '하체(Lower) 훈련이 비어있습니다. 하체 보완이 꼭 필요합니다.';
                      } else if (pushCount > pullCount + 2) {
                        balanceStatus = '상체 밀기(Push) 비중이 다소 높습니다. 당기기(Pull) 비중을 보완하세요.';
                      } else if (pullCount > pushCount + 2) {
                        balanceStatus = '상체 당기기(Pull) 비중이 높습니다. 밀기(Push) 세션 분배를 권장합니다.';
                      } else if (diff <= 1) {
                        balanceStatus = '상·하체의 근력 균형 분포가 대단히 조화롭고 이상적입니다!';
                      } else {
                        balanceStatus = '전반적으로 무난한 균형의 훈련 그룹 분배를 유지하고 있습니다.';
                      }
                    }

                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">최근 30일 훈련 그룹 분포</h3>
                          <span className="text-[10px] font-mono text-slate-500 font-bold">웨이트 총 {strengthCount}회</span>
                        </div>

                        <div className="bg-slate-950/45 border border-slate-850/60 p-3.5 rounded-xl space-y-3.5">
                          {/* Strength Groups Row */}
                          <div className="grid grid-cols-3 gap-3">
                            {groups.map((g) => {
                              const pct = (g.count / maxStrength) * 100;
                              return (
                                <div key={g.name} className="space-y-1">
                                  <div className="flex justify-between items-baseline">
                                    <span className="text-[11px] font-bold text-slate-300">{g.name.split(' ')[0]}</span>
                                    <span className="text-xs font-mono font-black text-slate-200">{g.count}회</span>
                                  </div>
                                  <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                    <div 
                                      className={`h-full ${g.color} rounded-full`}
                                      style={{ width: `${g.count > 0 ? Math.max(pct, 12) : 0}%` }}
                                    />
                                  </div>
                                  <span className="text-[9px] text-slate-500 block leading-tight">{g.subtext}</span>
                                </div>
                              );
                            })}
                          </div>

                          {/* Cardio Section - Separated from Strength */}
                          <div className="border-t border-slate-800/40 pt-2.5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                              <span className="text-[10px] font-bold text-slate-400">Cardio (심폐/유산소)</span>
                            </div>
                            <span className="text-xs font-mono font-black text-sky-400 bg-sky-950/25 border border-sky-500/10 px-2.5 py-0.5 rounded">
                              {cardioCount}회 수행
                            </span>
                          </div>

                          {/* 훈련 균형 요약 상태 */}
                          <div className="bg-indigo-950/10 border border-indigo-500/10 p-2.5 rounded-lg text-[11px] text-indigo-200/90 flex items-start gap-1.5">
                            <span className="text-indigo-400">●</span>
                            <span>{balanceStatus}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* (5) 오늘 추천 근거 (Explanation Layer) */}
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowDetailedReasons(!showDetailedReasons)}
                      className="w-full flex items-center justify-between py-2.5 px-3.5 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 hover:text-white transition-all cursor-pointer font-bold"
                    >
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        <span>오늘 추천 근거 {showDetailedReasons ? '접기 ▲' : '보기 ▼'}</span>
                      </div>
                      {showDetailedReasons ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>

                    {showDetailedReasons && (
                      <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-3.5 space-y-2.5">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase tracking-wider">
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          <span>오늘의 추천 근거 (SSOT 분석)</span>
                        </div>
                        
                        <p className="text-xs font-bold text-slate-200 leading-relaxed bg-slate-950/40 px-2.5 py-2 rounded-lg border border-indigo-500/10">
                          {nextRecommendation.oneLineReason || '최근 훈련 간격과 근육군별 피로 누적 간섭을 고려한 최적 설계입니다.'}
                        </p>

                        {nextRecommendation.reasons && nextRecommendation.reasons.length > 0 && (
                          <ul className="space-y-1.5">
                            {nextRecommendation.reasons.map((reason, idx) => (
                              <li key={idx} className="text-xs text-slate-300 leading-relaxed flex items-start gap-1.5">
                                <span className="text-indigo-400 shrink-0 font-bold">✓</span>
                                <span>{reason.replace(/^✓\s*/, '')}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* 카드 하단 전체 보기 링크 */}
                {onViewAllLogs && (
                  <div className="pt-4 border-t border-slate-800/40 flex justify-end mt-auto">
                    <button 
                      onClick={onViewAllLogs}
                      className="group inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-400 hover:text-indigo-400 transition-colors cursor-pointer"
                    >
                      <span>전체 운동 기록 보기</span>
                      <ArrowRight className="w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-transform" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 러닝 마일리지 & 대표 작업세트 (하단 분석) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <CardioMileageCard 
          mileageRows={mileageRows} 
          runningPBs={runningPBs} 
        />
        <BestWorksets sets={bestWorksets} />
      </div>

      {/* Weight Trend Analysis Detailed Modal */}
      <WeightDetailModal
        isOpen={isWeightModalOpen}
        onClose={() => setIsWeightModalOpen(false)}
        weightLogs={weightLogs}
        goalWeight={goalSettings.weightGoal}
        onRecordWeightClick={onRecordWeightClick || (() => {})}
      />
    </div>
  );
}
