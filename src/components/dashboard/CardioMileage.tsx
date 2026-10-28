/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useId } from 'react';
import { Compass, ChevronRight, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { RecommendationResult } from '../../utils/workoutEngine';
import { formatNextRecommendationDate } from '../../utils/dateUtils';
import { motion, AnimatePresence } from 'motion/react';
import { BodyLoadMap } from './BodyLoadMap';

interface RecommendedWorkoutCardProps {
  nextRecommendation?: RecommendationResult;
  onStartWorkout?: (routineId: string) => void;
  defaultExpanded?: boolean;
}

export function RecommendedWorkoutCard({ 
  nextRecommendation: propNextRecommendation,
  onStartWorkout,
  defaultExpanded = false,
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
  const [showReasons, setShowReasons] = useState(defaultExpanded);

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

  // Unique id for accessibility linking
  const accordionContentId = useId();

  // Reasons are only visible for workout recommendations (Train state), hidden for Rest
  const hasVisibleReasons = !isRest && Boolean(recommendation.reasons && recommendation.reasons.length > 0);
  const hasBodyLoad = Boolean(recommendation.bodyLoad);

  // Accordion should only render if there is actually visible content (visible reasons or bodyLoad)
  const shouldShowAccordion = hasVisibleReasons || hasBodyLoad;

  // Accordion Renderers
  const renderReasonsAccordion = () => {
    if (!shouldShowAccordion) return null;

    return (
      <div className="space-y-3">
        <button
          type="button"
          aria-expanded={showReasons}
          aria-controls={accordionContentId}
          onClick={() => setShowReasons(!showReasons)}
          className="w-full flex items-center justify-between py-2.5 px-3.5 bg-slate-950/40 hover:bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs text-slate-400 hover:text-white transition-all cursor-pointer font-bold focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span>추천 근거 · 신체 부하 보기</span>
          </div>
          {showReasons ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        <AnimatePresence>
          {showReasons && (
            <motion.div
              id={accordionContentId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3.5 space-y-4">
                {/* ① 신체 부하 맵 시각화 */}
                {hasBodyLoad && (
                  <BodyLoadMap bodyLoad={recommendation.bodyLoad} idPrefix={accordionContentId} />
                )}

                {/* ② 분석 기반 추천 사유: 운동 추천일 때만 표시 (!isRest) */}
                {hasVisibleReasons && (
                  <div className={`space-y-2 ${hasBodyLoad ? 'pt-3 border-t border-slate-800/60' : ''}`}>
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                      분석 기반 추천 사유
                    </span>
                    <div className="space-y-1.5">
                      {recommendation.reasons?.map((reason, idx) => (
                        <div key={idx} className="text-xs text-slate-300 flex items-start gap-2 font-medium">
                          <span className="text-emerald-400 font-bold shrink-0 mt-0.5">•</span>
                          <span>{reason.replace(/^✓\s*/, '')}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Top candidates filtering: Only preferred or viable statusType, never defaulting missing statusType
  const rawCandidates = recommendation.topCandidates;
  const viableCandidates = Array.isArray(rawCandidates)
    ? rawCandidates.filter(
        (candidate) => candidate.statusType === 'preferred' || candidate.statusType === 'viable'
      )
    : undefined;

  const renderViableCandidatesSection = () => {
    return (
      <div className="space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400">
          <Compass className="w-3.5 h-3.5 text-emerald-400" />
          <span>수행 가능한 훈련</span>
        </div>

        {!Array.isArray(rawCandidates) ? (
          <div className="bg-slate-950/40 border border-slate-850/60 rounded-xl p-3 text-xs text-slate-400 font-medium">
            후보 정보를 확인할 수 없습니다
          </div>
        ) : viableCandidates && viableCandidates.length === 0 ? (
          <div className="bg-slate-950/40 border border-slate-850/60 rounded-xl p-3 text-xs text-slate-400 font-medium">
            현재 수행 가능한 후보가 없습니다
          </div>
        ) : (
          <div className="space-y-1.5">
            {viableCandidates?.map((candidate) => {
              const isOptimal = Boolean(candidate.isCurrent);
              return (
                <div 
                  key={candidate.lift} 
                  className={`p-3 rounded-xl border transition-all duration-200 ${
                    isOptimal 
                      ? 'bg-emerald-950/15 border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.06)]' 
                      : 'bg-slate-950/40 border-slate-850/60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-black ${isOptimal ? 'text-emerald-400' : 'text-slate-200'}`}>
                        {candidate.lift}
                      </span>
                      {isOptimal ? (
                        <span className="text-[9px] border px-1.5 py-0.5 rounded-md font-bold tracking-tight bg-emerald-500/15 text-emerald-400 border-emerald-500/35">
                          최적 추천
                        </span>
                      ) : (
                        <span className="text-[9px] border px-1.5 py-0.5 rounded-md font-bold tracking-tight bg-indigo-500/15 text-indigo-300 border-indigo-500/30">
                          {candidate.statusLabel || '수행 가능'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
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

        {/* Section Ordering: Unified [수행 가능한 훈련 -> 추천 근거 · 신체 부하 보기] */}
        {renderViableCandidatesSection()}
        {renderReasonsAccordion()}
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

