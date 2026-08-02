/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Flame, Compass, ChevronRight, Check, BarChart2, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { RecommendationResult } from '../../utils/workoutEngine';
import { formatNextRecommendationDate } from '../../utils/recommendationEngine';
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

  // State for rest day check and UI controls
  const [isRestCompleted, setIsRestCompleted] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [showScores, setShowScores] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [showTopCandidates, setShowTopCandidates] = useState(false);

  // Handle toast timeout
  useEffect(() => {
    if (showToast) {
      const timer = setTimeout(() => setShowToast(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showToast]);

  const handleStart = () => {
    if (isRest) {
      setIsRestCompleted(prev => !prev);
      setShowToast(true);
      return;
    }

    if (onStartWorkout) {
      let routineId = '';
      if (recommendation.mainLift === '벤치프레스') routineId = 'routine-bench-press';
      else if (recommendation.mainLift === 'OHP') routineId = 'routine-ohp';
      else if (recommendation.mainLift === '데드리프트') routineId = 'routine-deadlift';
      else if (recommendation.mainLift === '스쿼트') routineId = 'routine-squat';
      
      onStartWorkout(routineId);
    }
  };

  // Get dynamic emoji & title
  const getWorkoutTitle = () => {
    const lift = recommendation.mainLift;
    if (!lift || lift === '휴식') return '🌙 휴식';
    return `🏋️ ${lift}`;
  };

  // 1-line beautiful reason depending on the lift (max 2 lines)
  const getWorkoutReason = () => {
    if (recommendation.oneLineReason) return recommendation.oneLineReason;
    const lift = recommendation.mainLift;
    if (!lift || lift === '휴식') {
      return '최근 훈련 빈도를 고려하면 오늘은 회복을 우선하는 것이 다음 세션의 수행 능력 향상에 도움이 됩니다.';
    }
    if (lift.includes('스쿼트')) {
      return '하체 및 코어 부위의 피로가 충분히 해소되어 강력한 스쿼트 스트렝스 훈련을 수행하기 가장 적합한 날입니다.';
    }
    if (lift.includes('벤치프레스')) {
      return '가슴과 삼두근의 초과회복이 극대화된 시점으로, 벤치프레스 점진적 과부하에 최적의 날입니다.';
    }
    if (lift.includes('데드리프트')) {
      return '후면 사슬의 근력이 완벽히 충전되어 고중량 전신 스트렝스 훈련을 강력하게 소화할 준비가 되었습니다.';
    }
    if (lift.includes('OHP')) {
      return '견갑대 주변 소근육과 삼각근이 말끔하게 회복되어 가볍고 탄력 있는 프레스 밀기 훈련이 가능한 상태입니다.';
    }
    return '현재 신체 회복 상태와 누적 피로 지표에 완벽히 매칭된 오늘의 커스텀 권장 훈련 세션입니다.';
  };

  // Core execution details (실행 정보)
  let nextUp = recommendation.executionInfo?.nextUp || '스쿼트';
  if (!recommendation.executionInfo) {
    if (recommendation.mainLift === '스쿼트') nextUp = '벤치프레스';
    else if (recommendation.mainLift === '벤치프레스') nextUp = '데드리프트';
    else if (recommendation.mainLift === '데드리프트') nextUp = 'OHP';
    else if (recommendation.mainLift === 'OHP') nextUp = '휴식';
    else nextUp = '스쿼트';
  }

  const rawNextTiming = recommendation.executionInfo?.nextTiming;
  const nextRecommendationDisplay = (() => {
    if (rawNextTiming && (rawNextTiming === '오늘' || rawNextTiming === '내일' || rawNextTiming.endsWith('요일'))) {
      return rawNextTiming;
    }
    return formatNextRecommendationDate(
      recommendation.executionInfo?.lastWorkoutDate || recommendation.date,
      recommendation.executionInfo?.recoveryDays ?? 2
    );
  })();

  const actionTags = recommendation.representativeExercises || (isRest ? ['회복', '이완'] : ['주동근', '코어']);

  return (
    <motion.div 
      id="next-workout-card" 
      whileHover={{ y: -3, boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.2), 0 8px 10px -6px rgb(0 0 0 / 0.2)' }}
      transition={{ duration: 0.15 }}
      className="relative bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-7 shadow-lg flex flex-col justify-between transition-all duration-300 hover:border-emerald-500/10"
    >
      
      {/* Toast Overlay notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-4 left-4 right-4 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-xs font-bold py-2.5 px-3.5 rounded-xl flex items-center gap-2 shadow-xl z-20 justify-center"
          >
            <Check className="w-3.5 h-3.5 stroke-[3]" />
            <span>오늘의 회복 계획을 완료했습니다.</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-6">
        {/* Top Header Label & Completed Badge */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">🏋️ 오늘의 추천</span>
          </div>
          {isRest && isRestCompleted && (
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 tracking-wider uppercase">
              ✓ 오늘 계획 완료
            </span>
          )}
        </div>

        {/* ① 오늘 추천 운동 & ② 한 줄 추천 이유 */}
        <div className="space-y-2">
          <span className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight font-sans block leading-none">
            {recommendation.mainLift}
          </span>
          <p className="text-sm text-slate-200 leading-relaxed font-sans font-medium">
            {getWorkoutReason()}
          </p>
        </div>

        {/* Divider */}
        <div className="border-t border-slate-800/40 my-1" />

        {/* ④ 실행 정보 (다음 운동, 추천 시점) */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs py-1">
          <div className="flex flex-col justify-center">
            <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">다음 운동</span>
            <span className="font-extrabold text-slate-100 text-sm sm:text-base leading-tight mt-0.5">{nextUp}</span>
          </div>
          <div className="flex flex-col justify-center">
            <span className="text-slate-500 font-bold text-[9px] uppercase tracking-wider">추천 시점</span>
            <span className="font-extrabold text-slate-100 text-sm sm:text-base leading-tight mt-0.5">{nextRecommendationDisplay}</span>
          </div>
        </div>

        {/* 대표 동작 태그 */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {actionTags.slice(0, 4).map((tag, idx) => (
            <span key={idx} className="text-[10px] bg-slate-950 border border-slate-850 px-2.5 py-1 rounded-lg text-slate-400 font-bold tracking-tight">
              {tag}
            </span>
          ))}
        </div>

        {/* ⑥ 추천 후보 (Accordion) */}
        {recommendation.topCandidates && recommendation.topCandidates.length > 0 && (
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
                  {recommendation.topCandidates.map((candidate, idx) => {
                    const isSelected = candidate.lift === recommendation.mainLift;
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
                            <span className={`text-xs font-extrabold font-mono ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`}>
                              {idx === 0 ? '①' : idx === 1 ? '②' : '③'}
                            </span>
                            <span className={`text-xs font-black ${isSelected ? 'text-emerald-400' : 'text-slate-300'}`}>
                              {candidate.lift}
                            </span>
                            {isSelected && (
                              <span className="text-[8px] bg-emerald-500/15 text-emerald-400 border border-emerald-500/35 px-1.5 py-0.5 rounded-md font-bold tracking-tight">
                                최적 추천
                              </span>
                            )}
                          </div>
                        </div>

                        {/* 선택되지 않은 사유 한 줄 추가 (2, 3위만 해당) */}
                        {!isSelected && candidate.rejectionReason && (
                          <div className="text-[10px] text-slate-400 font-semibold mt-1.5 pl-3 border-l border-slate-800 flex items-start gap-1">
                            <span className="text-indigo-400 shrink-0">→</span>
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
        )}

        {/* ⑦ 오늘 추천 이유 (Accordion) */}
        {recommendation.reasons && recommendation.reasons.length > 0 && (
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
                    <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">분석 기반 추천 사유</span>
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
        )}

        {/* ⑧ 평가 기준 (Accordion) */}
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
                <div className="bg-slate-950/80 border border-slate-850 rounded-xl p-4 space-y-4">
                  {/* 평가 지표 가중치 요약 */}
                  <div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5 justify-between mb-2">
                      <span>평가 가중치</span>
                      <span className="text-indigo-400 font-medium">합계 100점 만점</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1 text-[9px] text-center text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800/40 font-semibold font-sans">
                      <div>
                        <div className="text-slate-200">회복도</div>
                        <div className="text-indigo-400 font-extrabold mt-0.5">35%</div>
                      </div>
                      <div>
                        <div className="text-slate-200">우선순위</div>
                        <div className="text-indigo-400 font-extrabold mt-0.5">20%</div>
                      </div>
                      <div>
                        <div className="text-slate-200">목표간극</div>
                        <div className="text-indigo-400 font-extrabold mt-0.5">15%</div>
                      </div>
                      <div>
                        <div className="text-slate-200">빈도균형</div>
                        <div className="text-indigo-400 font-extrabold mt-0.5">15%</div>
                      </div>
                      <div>
                        <div className="text-slate-200">피로도</div>
                        <div className="text-indigo-400 font-extrabold mt-0.5">10%</div>
                      </div>
                    </div>
                  </div>

                  {/* [6. 점수 시각화 단순화] - 선택된 종목(1위)만 5개 점수를 시각화 */}
                  {recommendation.allScores?.[recommendation.mainLift] && (
                    <div className="space-y-3">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                        🏆 {recommendation.mainLift} 5대 핵심 지표 분석
                      </span>
                      {(() => {
                        const item = recommendation.allScores[recommendation.mainLift];
                        return (
                          <div className="bg-slate-900/40 border border-slate-850/60 p-3 rounded-xl space-y-3">
                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">회복도 및 수행 간격 (35점 만점)</span>
                                <span className="text-emerald-400 font-mono font-bold">{item.recovery}점 <span className="text-slate-600 font-normal">/ 35</span></span>
                              </div>
                              <div className="bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${(item.recovery / 35) * 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">미수행 일자 우선순위 (20점 만점)</span>
                                <span className="text-emerald-400 font-mono font-bold">{item.priority}점 <span className="text-slate-600 font-normal">/ 20</span></span>
                              </div>
                              <div className="bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${(item.priority / 20) * 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">목표 중량 대비 간극 (15점 만점)</span>
                                <span className="text-emerald-400 font-mono font-bold">{item.goalGap}점 <span className="text-slate-600 font-normal">/ 15</span></span>
                              </div>
                              <div className="bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${(item.goalGap / 15) * 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">4주 부위별 훈련 빈도 균형 (15점 만점)</span>
                                <span className="text-emerald-400 font-mono font-bold">{item.frequency}점 <span className="text-slate-600 font-normal">/ 15</span></span>
                              </div>
                              <div className="bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${(item.frequency / 15) * 100}%` }}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <div className="flex justify-between items-center text-[10px]">
                                <span className="text-slate-400 font-bold">피로 저해 방지 적합도 (10점 만점)</span>
                                <span className="text-emerald-400 font-mono font-bold">{item.fatigue}점 <span className="text-slate-600 font-normal">/ 10</span></span>
                              </div>
                              <div className="bg-slate-950 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className="h-full rounded-full bg-emerald-500" 
                                  style={{ width: `${(item.fatigue / 10) * 100}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 6. CTA Button (Aligned beautifully to bottom right) */}
      <div className="mt-6 flex justify-end">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleStart}
          className={`flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl transition-all cursor-pointer ${
            isRest 
              ? isRestCompleted
                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-[0_0_12px_rgba(16,185,129,0.05)]'
                : 'bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/50'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/15 hover:shadow-indigo-600/25'
          }`}
        >
          {isRest ? (
            <>
              {isRestCompleted ? (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                  <span>오늘 회복 완료</span>
                </>
              ) : (
                <span>회복 완료하기</span>
              )}
            </>
          ) : (
            <>
              <span>운동 시작</span>
              <ChevronRight className="w-3.5 h-3.5 font-bold" />
            </>
          )}
        </motion.button>
      </div>
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
