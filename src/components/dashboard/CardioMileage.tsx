/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Flame, Compass, ChevronRight, BarChart2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { RecommendationResult } from '../../utils/workoutEngine';
import { formatNextRecommendationDate } from '../../utils/dateUtils';
import { motion, AnimatePresence } from 'motion/react';

interface CardioMileageRow {
  label: string;
  value: string;
}

interface RecommendedWorkoutCardProps {
  nextRecommendation?: RecommendationResult;
  onStartWorkout?: (routineId: string) => void;
}

export function RecommendedWorkoutCard({ 
  nextRecommendation: propNextRecommendation,
  onStartWorkout 
}: RecommendedWorkoutCardProps) {
  const defaultRecommendation: RecommendationResult = {
    mainLift: '휴식',
    reasons: ['✓ 마지막 훈련 완료', '✓ 피로도 보통'],
    representativeExercises: ['산책', '스트레칭'],
    date: '2026. 07. 04'
  };

  const recommendation = propNextRecommendation || defaultRecommendation;
  const isRest = recommendation.mainLift === '휴식' || !recommendation.mainLift;

  // Accordion state
  const [showScores, setShowScores] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [showTopCandidates, setShowTopCandidates] = useState(false);

  const handleStart = () => {
    if (isRest) return;

    if (onStartWorkout) {
      let routineId = '';
      if (recommendation.mainLift === '벤치프레스') routineId = 'routine-bench-press';
      else if (recommendation.mainLift === 'OHP') routineId = 'routine-ohp';
      else if (recommendation.mainLift === '데드리프트') routineId = 'routine-deadlift';
      else if (recommendation.mainLift === '스쿼트') routineId = 'routine-squat';
      else if ((recommendation.mainLift as string) === '바벨로우' || recommendation.mainLift === '바벨 로우') routineId = 'routine-barbell-row';
      else if (recommendation.mainLift === '러닝' || (recommendation.mainLift as string) === '유산소') routineId = 'routine-cardio';
      
      onStartWorkout(routineId);
    }
  };

  // Core execution details (실행 정보)
  const nextUp = recommendation.executionInfo?.nextUp;
  const rawNextTiming = recommendation.executionInfo?.nextTiming;

  const nextRecommendationDisplay = (() => {
    if (!recommendation.executionInfo) return undefined;
    if (rawNextTiming) {
      return rawNextTiming;
    }
    if (typeof recommendation.executionInfo.recoveryDays === 'number') {
      return formatNextRecommendationDate(
        recommendation.executionInfo.lastWorkoutDate || recommendation.date,
        recommendation.executionInfo.recoveryDays
      );
    }
    return undefined;
  })();

  const hasExecutionDetails = Boolean(nextUp && nextRecommendationDisplay);

  const actionTags = recommendation.representativeExercises || (isRest ? ['충분한 수면', '가벼운 산책', '동적 스트레칭', '수분 섭취'] : ['주동근', '코어']);

  // Accordion Renderers
  const renderReasonsAccordion = () => {
    if (!recommendation.reasons || recommendation.reasons.length === 0) return null;
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowReasons(!showReasons)}
          className="w-full flex items-center justify-between py-2.5 px-3.5 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 hover:text-white transition-all cursor-pointer font-bold"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>추천 이유</span>
          </div>
          {showReasons ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {showReasons && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                  {isRest ? '휴식 결정 사유' : '분석 기반 추천 사유'}
                </span>
                <div className="space-y-1.5">
                  {recommendation.reasons.map((reason, idx) => (
                    <div key={idx} className="text-xs text-slate-300 flex items-start gap-2 font-medium">
                      <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
                      <span>{reason.replace(/^✓\s*/, '')}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderScoresAccordion = () => {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowScores(!showScores)}
          className="w-full flex items-center justify-between py-2.5 px-3.5 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 hover:text-white transition-all cursor-pointer font-bold"
        >
          <div className="flex items-center gap-2">
            <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>평가 기준</span>
          </div>
          {showScores ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {showScores && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden space-y-4 pt-1"
            >
              <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-3">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  VNext 다차원 추천 평가 체계
                </span>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="bg-slate-900/60 border border-slate-800/60 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      <span className="text-xs font-bold text-slate-200">훈련 준비도</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed pl-3">
                      최근 부하와 필요한 움직임 영역의 중첩
                    </p>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      <span className="text-xs font-bold text-slate-200">훈련 필요도</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed pl-3">
                      최근 수행 간격과 훈련 이력
                    </p>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
                      <span className="text-xs font-bold text-slate-200">발전 기회</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed pl-3">
                      최근 기록에서 다음 훈련 자극 기회
                    </p>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800/60 p-3 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
                      <span className="text-xs font-bold text-slate-200">훈련 맥락</span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium leading-relaxed pl-3">
                      최근 빈도와 복합 부하
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const renderCandidatesAccordion = () => {
    if (!recommendation.topCandidates || recommendation.topCandidates.length === 0) return null;
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowTopCandidates(!showTopCandidates)}
          className="w-full flex items-center justify-between py-2.5 px-3.5 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 hover:text-white transition-all cursor-pointer font-bold"
        >
          <div className="flex items-center gap-2">
            <Compass className="w-3.5 h-3.5 text-emerald-400" />
            <span>후보 운동</span>
          </div>
          {showTopCandidates ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        <AnimatePresence>
          {showTopCandidates && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden space-y-2 pt-1"
            >
              {recommendation.topCandidates.map((candidate) => {
                const isSelected = !isRest && (candidate.isCurrent || candidate.lift === recommendation.mainLift || recommendation.mainLift.includes(candidate.lift));
                const statusLabel = candidate.statusLabel || (isSelected ? '최적 추천' : '수행 가능');
                const statusType = candidate.statusType || (isSelected ? 'preferred' : 'viable');

                let badgeClass = 'bg-slate-800/80 text-slate-400 border-slate-700/50';
                if (statusType === 'preferred' || isSelected) {
                  badgeClass = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35';
                } else if (statusType === 'viable') {
                  badgeClass = 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
                } else if (statusType === 'caution') {
                  badgeClass = 'bg-amber-500/15 text-amber-400 border-amber-500/30';
                } else if (statusType === 'recent') {
                  badgeClass = 'bg-slate-800/80 text-slate-400 border-slate-700/50';
                } else if (statusType === 'deferred') {
                  badgeClass = 'bg-slate-800/60 text-slate-500 border-slate-700/40';
                }

                return (
                  <div 
                    key={candidate.lift} 
                    className={`p-3 rounded-xl border transition-all duration-200 ${
                      isSelected 
                        ? 'bg-emerald-950/15 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' 
                        : 'bg-slate-950/40 border-slate-850/60 hover:border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-black ${isSelected ? 'text-emerald-400' : 'text-slate-200'}`}>
                          {candidate.lift}
                        </span>
                        <span className={`text-[9px] border px-1.5 py-0.5 rounded-md font-bold tracking-tight ${badgeClass}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* 선택되지 않은 사유 한 줄 추가 */}
                    {!isSelected && candidate.rejectionReason && (
                      <div className="text-[10px] text-slate-400 font-medium mt-1.5 pl-2.5 border-l-2 border-slate-800 flex items-start gap-1">
                        <span>{candidate.rejectionReason}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <motion.div 
      id="next-workout-card" 
      whileHover={{ y: -3, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)' }}
      transition={{ duration: 0.15 }}
      className="relative bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-lg flex flex-col justify-between transition-all duration-300 hover:border-emerald-500/10"
    >
      <div className="space-y-6">
        {/* Top Header Label */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">🏋️ 오늘의 추천</span>
          </div>
        </div>

        {/* ① 오늘 추천 운동 / 휴식 */}
        <div>
          <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight font-sans block leading-none">
            {recommendation.mainLift}
          </span>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800/40 my-1" />

        {/* ④ 실행 정보 (예상 다음 세션, 예상 시점) */}
        {hasExecutionDetails && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs py-1">
            <div className="flex flex-col justify-center">
              <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">예상 다음 세션</span>
              <span className="font-extrabold text-slate-100 text-sm sm:text-base leading-tight mt-0.5">{nextUp}</span>
            </div>
            <div className="flex flex-col justify-center">
              <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">예상 시점</span>
              <span className="font-extrabold text-slate-100 text-sm sm:text-base leading-tight mt-0.5">{nextRecommendationDisplay}</span>
            </div>
          </div>
        )}

        {/* 회복 가이드 (Rest 상태) vs 대표 동작 태그 (Train 상태) */}
        {isRest ? (
          actionTags.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block">
                회복 가이드
              </span>
              <div className="flex flex-wrap gap-1.5">
                {actionTags.slice(0, 4).map((tag, idx) => (
                  <span 
                    key={idx} 
                    className="text-[10px] bg-slate-950/60 border border-slate-850/80 px-2.5 py-1 rounded-lg text-slate-400 font-medium tracking-tight"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )
        ) : (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {actionTags.slice(0, 4).map((tag, idx) => (
              <span key={idx} className="text-[10px] bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-lg text-slate-400 font-bold tracking-tight">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Accordion Ordering: Rest: [추천 이유 -> 평가 기준 -> 후보 운동] / Train: [후보 운동 -> 추천 이유 -> 평가 기준] */}
        {isRest ? (
          <>
            {renderReasonsAccordion()}
            {renderScoresAccordion()}
            {renderCandidatesAccordion()}
          </>
        ) : (
          <>
            {renderCandidatesAccordion()}
            {renderReasonsAccordion()}
            {renderScoresAccordion()}
          </>
        )}
      </div>

      {/* 6. CTA Button (Aligned to bottom right for Train state only) */}
      {!isRest && (
        <div className="mt-6 flex justify-end">
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStart}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25"
          >
            <span>운동 시작</span>
            <ChevronRight className="w-3.5 h-3.5 font-bold" />
          </motion.button>
        </div>
      )}
    </motion.div>
  );
}

interface CardioMileageCardProps {
  mileageRows?: CardioMileageRow[];
  runningPBs?: { best3km: string; best5km: string };
}

export function CardioMileageCard({ 
  mileageRows: propMileageRows, 
  runningPBs 
}: CardioMileageCardProps) {
  const defaultMileageRows = [
    { label: '최근 4주', value: '17.0 km' },
    { label: '최근 8주', value: '46.0 km' },
    { label: '누적 거리', value: '130.0 km' },
  ];

  const mileageRows = propMileageRows || defaultMileageRows;

  // Extract values cleanly
  const totalRow = mileageRows.find(row => row.label.includes('누적 거리')) || { label: '누적 거리', value: '130.0 km' };
  const recent4WRow = mileageRows.find(row => row.label.includes('최근 4주')) || { label: '최근 4주', value: '17.0 km' };
  const recent8WRow = mileageRows.find(row => row.label.includes('최근 8주')) || { label: '최근 8주', value: '46.0 km' };

  return (
    <div id="cardio-mileage-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-lg flex flex-col justify-between transition-all duration-300 hover:border-emerald-500/10">
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <Flame className="w-4 h-4" />
          </div>
          <h2 className="text-xs font-bold text-slate-400 tracking-wider uppercase">러닝 마일리지</h2>
        </div>

        {/* Top Achievement Highlights Grid */}
        <div className="grid grid-cols-3 gap-3">
          {/* 누적 거리 */}
          <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[9px] text-slate-500 font-bold block">누적 거리</span>
            <span className="text-lg font-black text-emerald-400 font-mono tracking-tight block leading-none">
              {totalRow.value}
            </span>
          </div>
          {/* 3K PB */}
          <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[9px] text-slate-500 font-bold block leading-normal">3K PB</span>
            <span className="text-base font-black text-white font-mono tracking-tight block leading-none pt-0.5">
              {runningPBs?.best3km || '—'}
            </span>
          </div>
          {/* 5K PB */}
          <div className="bg-slate-950/40 border border-slate-850 p-3.5 rounded-xl space-y-1">
            <span className="text-[9px] text-slate-500 font-bold block leading-normal">5K PB</span>
            <span className="text-base font-black text-white font-mono tracking-tight block leading-none pt-0.5">
              {runningPBs?.best5km || '—'}
            </span>
          </div>
        </div>

        {/* Subtle Divider */}
        <div className="border-t border-slate-800/40 my-1" />

        {/* Periodic Statistics Trend */}
        <div>
          <span className="text-[10px] font-bold text-slate-400 block mb-2.5 uppercase tracking-wider">최근 거리</span>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-950/20 rounded-xl border border-slate-850 flex justify-between items-center">
              <span className="font-bold text-slate-300 text-xs">최근 4주</span>
              <span className="font-extrabold text-emerald-400 font-mono text-xs">{recent4WRow.value}</span>
            </div>
            <div className="p-3 bg-slate-950/20 rounded-xl border border-slate-850 flex justify-between items-center">
              <span className="font-bold text-slate-300 text-xs">최근 8주</span>
              <span className="font-extrabold text-emerald-400 font-mono text-xs">{recent8WRow.value}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardioMileageProps {
  mileageRows?: CardioMileageRow[];
  nextRecommendation?: RecommendationResult;
  onStartWorkout?: (routineId: string) => void;
  runningPBs?: { best3km: string; best5km: string };
}

export default function CardioMileage({ 
  mileageRows, 
  nextRecommendation,
  onStartWorkout,
  runningPBs
}: CardioMileageProps) {
  return (
    <div id="cardio-recommendation-group" className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <CardioMileageCard mileageRows={mileageRows} runningPBs={runningPBs} />
      <RecommendedWorkoutCard nextRecommendation={nextRecommendation} onStartWorkout={onStartWorkout} />
    </div>
  );
}
