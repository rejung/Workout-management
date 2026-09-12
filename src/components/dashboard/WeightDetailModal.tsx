/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Plus } from 'lucide-react';
import { WeightLog } from '../../utils/workoutEngine';
import { getLastNDaysRange } from '../../utils/dateUtils';

type Period = '7d' | '4w' | '3m' | '1y' | 'all';

const formatXAxisDate = (dateStr: string, period: Period) => {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    if (period === '7d' || period === '4w') {
      return `${month}/${day}`;
    }
    return `${month}월`;
  }
  return dateStr;
};

const formatCompactDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parseInt(parts[1], 10)}/${parseInt(parts[2], 10)}`;
  }
  return dateStr;
};

interface WeightDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  weightLogs: WeightLog[];
  goalWeight: number;
  onRecordWeightClick: () => void;
}

export default function WeightDetailModal({
  isOpen,
  onClose,
  weightLogs,
  goalWeight,
  onRecordWeightClick
}: WeightDetailModalProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<Period>('4w');
  const [hoveredPointIndex, setHoveredPointIndex] = useState<number | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Keyboard accessibility: ESC to close, Focus Trap
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // Focus trap
    const focusableElementsString = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = modalRef.current?.querySelectorAll(focusableElementsString);
    if (focusableElements && focusableElements.length > 0) {
      const firstFocusableElement = focusableElements[0] as HTMLElement;
      const lastFocusableElement = focusableElements[focusableElements.length - 1] as HTMLElement;
      firstFocusableElement.focus();

      const handleTabKey = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstFocusableElement) {
              lastFocusableElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastFocusableElement) {
              firstFocusableElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      modalRef.current?.addEventListener('keydown', handleTabKey);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        modalRef.current?.removeEventListener('keydown', handleTabKey);
      };
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Chronologically sorted logs (oldest to newest for graphing)
  const sortedLogs = useMemo(() => {
    return [...weightLogs].sort((a, b) => a.date.localeCompare(b.date));
  }, [weightLogs]);

  const latestLog = useMemo(() => {
    if (weightLogs.length === 0) return null;
    return [...weightLogs].sort((a, b) => b.date.localeCompare(a.date))[0];
  }, [weightLogs]);

  // Filter logs by selected period
  const filteredLogs = useMemo(() => {
    if (sortedLogs.length === 0) return [];
    
    let cutoffStr = '';

    switch (selectedPeriod) {
      case '7d':
        cutoffStr = getLastNDaysRange(7).startDateStr;
        break;
      case '4w':
        cutoffStr = getLastNDaysRange(28).startDateStr;
        break;
      case '3m':
        cutoffStr = getLastNDaysRange(90).startDateStr;
        break;
      case '1y':
        cutoffStr = getLastNDaysRange(365).startDateStr;
        break;
      case 'all':
        return sortedLogs;
    }

    return sortedLogs.filter(log => log.date >= cutoffStr);
  }, [sortedLogs, selectedPeriod]);

  // Derived period label
  const periodLabel = useMemo(() => {
    switch (selectedPeriod) {
      case '7d': return '7일';
      case '4w': return '4주';
      case '3m': return '3개월';
      case '1y': return '1년';
      case 'all': return '전체';
    }
  }, [selectedPeriod]);

  // Dynamic change label based on period selection (Section 4)
  const recentChangeLabel = useMemo(() => {
    if (selectedPeriod === 'all') return '전체 변화';
    return `최근 ${periodLabel}`;
  }, [selectedPeriod, periodLabel]);

  // Calculations for stats
  const stats = useMemo(() => {
    if (filteredLogs.length === 0) {
      return {
        highest: { weight: 0, date: '' },
        lowest: { weight: 0, date: '' },
        average: 0,
        change: 0
      };
    }

    const weights = filteredLogs.map(l => l.weight);
    
    // Highest
    let highest = filteredLogs[0];
    for (let i = 1; i < filteredLogs.length; i++) {
      if (filteredLogs[i].weight > highest.weight) {
        highest = filteredLogs[i];
      }
    }

    // Lowest
    let lowest = filteredLogs[0];
    for (let i = 1; i < filteredLogs.length; i++) {
      if (filteredLogs[i].weight < lowest.weight) {
        lowest = filteredLogs[i];
      }
    }

    // Period Average
    const sum = weights.reduce((a, b) => a + b, 0);
    const average = sum / filteredLogs.length;

    // Change (latest in period minus first in period)
    const change = filteredLogs.length > 1
      ? filteredLogs[filteredLogs.length - 1].weight - filteredLogs[0].weight
      : 0;

    return {
      highest,
      lowest,
      average,
      change
    };
  }, [filteredLogs]);

  // Goal state assessment
  const currentWeight = latestLog ? latestLog.weight : 0;
  const diffToGoal = goalWeight > 0 ? currentWeight - goalWeight : 0;
  const absDiffToGoal = Math.abs(diffToGoal);
  const isGoalReached = goalWeight > 0 && absDiffToGoal <= 0.2;
  const isGoalNear = goalWeight > 0 && absDiffToGoal <= 0.5 && !isGoalReached;

  // Prioritized One-line Insight without numeric redundancy (Section 12, 13)
  const weightInsight = useMemo(() => {
    if (weightLogs.length === 0) return '체중 기록이 없습니다.';
    if (!latestLog) return '';

    // 1. Goal reached (within 0.2kg)
    if (goalWeight > 0 && isGoalReached) {
      return '목표 체중에 도달했습니다.';
    }

    // 2. Goal near (within 0.5kg)
    if (goalWeight > 0 && isGoalNear) {
      return '현재 체중은 목표 범위에 근접해 있습니다.';
    }

    // 3. Goal relation with recent trend
    if (goalWeight > 0 && filteredLogs.length >= 2) {
      const diff = filteredLogs[filteredLogs.length - 1].weight - filteredLogs[0].weight;
      const isStable = Math.abs(diff) <= 0.2;

      if (isStable) {
        return '최근 체중은 안정적인 범위에서 유지되고 있습니다.';
      }

      // Current < Goal: increasing is moving toward goal
      if (latestLog.weight < goalWeight && diff > 0.2) {
        return '현재 흐름은 목표 방향과 일치합니다.';
      }
      // Current > Goal: decreasing is moving toward goal
      if (latestLog.weight > goalWeight && diff < -0.2) {
        return '현재 흐름은 목표 방향과 일치합니다.';
      }
      // Moving away from goal
      if (latestLog.weight < goalWeight && diff < -0.2) {
        return '최근 체중이 완만하게 감소하고 있습니다.';
      }
      if (latestLog.weight > goalWeight && diff > 0.2) {
        return '최근 체중이 완만하게 증가하고 있습니다.';
      }
    }

    // 4. Stable trend without goal or fallback
    if (filteredLogs.length >= 2) {
      const diff = filteredLogs[filteredLogs.length - 1].weight - filteredLogs[0].weight;
      if (Math.abs(diff) <= 0.2) {
        return '최근 체중은 안정적인 범위에서 유지되고 있습니다.';
      }
      if (diff > 0.2) {
        return '최근 체중이 완만하게 증가하고 있습니다.';
      }
      return '최근 체중이 완만하게 감소하고 있습니다.';
    }

    return '체중을 꾸준히 기록하여 장기적인 추세를 확인해 보세요.';
  }, [weightLogs, latestLog, goalWeight, filteredLogs, isGoalReached, isGoalNear]);

  // Render Line Chart elements manually for absolute compatibility and precision
  const chartData = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const weights = filteredLogs.map(l => l.weight);
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);

    // Include goal weight in chart boundary if set
    if (goalWeight > 0) {
      minWeight = Math.min(minWeight, goalWeight);
      maxWeight = Math.max(maxWeight, goalWeight);
    }

    // Add padding so lines are never clipped
    const range = maxWeight - minWeight;
    const padding = range === 0 ? 1.5 : range * 0.18;
    const allMin = Math.max(0, minWeight - padding);
    const allMax = maxWeight + padding;

    // Dimensions (optimized for compact viewport and high readability)
    const width = 600;
    const height = 200;
    const paddingLeft = 38;
    const paddingRight = 72; // Padding for goal weight label
    const paddingTop = 14;
    const paddingBottom = 22;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    // Plot coordinates
    const points = filteredLogs.map((log, index) => {
      const x = filteredLogs.length > 1
        ? paddingLeft + (index / (filteredLogs.length - 1)) * chartWidth
        : paddingLeft + chartWidth / 2;
      const y = allMax !== allMin
        ? paddingTop + (1 - (log.weight - allMin) / (allMax - allMin)) * chartHeight
        : paddingTop + chartHeight / 2;

      return { x, y, log };
    });

    // Grid lines values (horizontal lines)
    const gridCount = 3;
    const gridLines = [];
    for (let i = 0; i <= gridCount; i++) {
      const value = allMin + (i / gridCount) * (allMax - allMin);
      const y = paddingTop + (1 - (value - allMin) / (allMax - allMin)) * chartHeight;
      gridLines.push({ value, y });
    }

    // Goal line coordinates
    const goalY = goalWeight > 0 && allMax !== allMin
      ? paddingTop + (1 - (goalWeight - allMin) / (allMax - allMin)) * chartHeight
      : null;

    // SVG Line paths
    let linePath = '';
    let areaPath = '';

    if (points.length > 0) {
      linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      
      areaPath = `M ${points[0].x} ${height - paddingBottom} L ${points[0].x} ${points[0].y} ` +
        points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ') +
        ` L ${points[points.length - 1].x} ${height - paddingBottom} Z`;
    }

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      points,
      gridLines,
      goalY,
      linePath,
      areaPath,
      allMin,
      allMax
    };
  }, [filteredLogs, goalWeight]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
          {/* Backdrop Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs cursor-pointer"
          />

          {/* Modal Container: Compact Decision Analysis Modal */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ type: 'spring', damping: 26, stiffness: 360 }}
            className="relative w-full sm:max-w-xl md:max-w-[620px] bg-slate-900 border border-slate-800/80 rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[95vh]"
            role="dialog"
            aria-modal="true"
            aria-label="체중 추이 분석"
          >
            {/* Header: Clean, direct, minimal */}
            <div className="px-5 py-2.5 sm:py-3 border-b border-slate-800/50 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base font-bold font-sans text-white tracking-tight">
                  체중 추이 분석
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5 font-sans">
                  목표 대비 현재 흐름
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="w-7 h-7 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/40 flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body: Compact Hierarchy, Zero Unneeded Scroll */}
            <div className="p-4 sm:p-5 space-y-2.5 overflow-y-auto">
              
              {/* Primary Summary Strip: 3 Core Metrics (Section 4 & 5) */}
              {latestLog ? (
                <div className="bg-slate-950/40 border border-slate-800/40 rounded-xl p-2.5 grid grid-cols-3 divide-x divide-slate-800/40">
                  {/* 1. 현재 체중 */}
                  <div className="px-2 first:pl-1">
                    <span className="text-[11px] font-medium text-slate-400 block font-sans">현재 체중</span>
                    <div className="flex items-baseline gap-0.5 mt-0.5">
                      <span className="text-xl sm:text-2xl font-black font-sans text-white tabular-nums tracking-tight">
                        {latestLog.weight.toFixed(1)}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 font-sans">kg</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                      {formatCompactDate(latestLog.date)} 기준
                    </span>
                  </div>

                  {/* 2. 목표까지 남은 차이 */}
                  <div className="px-2">
                    <span className="text-[11px] font-medium text-slate-400 block font-sans">
                      {isGoalReached ? '목표 상태' : '목표까지'}
                    </span>
                    <div className="flex items-baseline gap-0.5 mt-0.5">
                      {isGoalReached ? (
                        <span className="text-xl sm:text-2xl font-black font-sans text-emerald-400 tracking-tight">
                          도달
                        </span>
                      ) : goalWeight > 0 ? (
                        <>
                          <span className="text-xl sm:text-2xl font-black font-sans text-white tabular-nums tracking-tight">
                            {absDiffToGoal.toFixed(1)}
                          </span>
                          <span className="text-xs font-semibold text-slate-400 font-sans">kg</span>
                        </>
                      ) : (
                        <span className="text-sm font-bold text-slate-400">미설정</span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block truncate font-sans">
                      {goalWeight > 0 ? (
                        isGoalReached 
                          ? `목표 ${goalWeight.toFixed(1)}kg 달성` 
                          : isGoalNear 
                          ? `목표 근접 (${goalWeight.toFixed(1)}kg)` 
                          : `목표 ${goalWeight.toFixed(1)}kg`
                      ) : (
                        '목표 미설정'
                      )}
                    </span>
                  </div>

                  {/* 3. 최근 변화 */}
                  <div className="px-2 last:pr-1">
                    <span className="text-[11px] font-medium text-slate-400 block truncate font-sans">
                      {recentChangeLabel}
                    </span>
                    <div className="flex items-baseline gap-0.5 mt-0.5">
                      <span className="text-xl sm:text-2xl font-black font-sans text-white tabular-nums tracking-tight">
                        {stats.change > 0 ? `+${stats.change.toFixed(1)}` : stats.change.toFixed(1)}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 font-sans">kg</span>
                    </div>
                    <span className="text-[10px] text-slate-500 mt-0.5 block font-sans">
                      {stats.change === 0 ? '변화 없음' : stats.change > 0 ? '증가' : '감소'}
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Chart Header with Integrated Period Selector (Section 6 & 7) */}
              <div className="flex items-center justify-between gap-2 pt-0.5">
                <span className="text-xs font-semibold text-slate-400 font-sans tracking-tight">
                  체중 추이
                </span>
                <div className="inline-flex p-0.5 bg-slate-950/60 border border-slate-800/50 rounded-lg">
                  {(['7d', '4w', '3m', '1y', 'all'] as Period[]).map((period) => {
                    const labelMap: Record<Period, string> = {
                      '7d': '7일',
                      '4w': '4주',
                      '3m': '3개월',
                      '1y': '1년',
                      'all': '전체'
                    };
                    const isActive = selectedPeriod === period;
                    return (
                      <button
                        key={period}
                        type="button"
                        onClick={() => {
                          setSelectedPeriod(period);
                          setHoveredPointIndex(null);
                        }}
                        className={`text-xs px-2.5 py-0.5 rounded-md transition-all cursor-pointer font-sans ${
                          isActive
                            ? 'bg-slate-800 text-white font-semibold shadow-xs'
                            : 'text-slate-400 hover:text-slate-200 font-medium'
                        }`}
                      >
                        {labelMap[period]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main Interactive Chart: Hero Element */}
              <div className="bg-slate-950/40 border border-slate-800/40 p-2 sm:p-2.5 rounded-xl relative overflow-visible flex flex-col justify-center">
                {filteredLogs.length === 0 ? (
                  <div className="py-12 text-center space-y-1 select-none">
                    <p className="text-sm font-semibold text-slate-300 font-sans">체중 기록이 없습니다.</p>
                    <p className="text-xs text-slate-500 font-sans">체중을 기록하면 변화 추이를 분석할 수 있습니다.</p>
                  </div>
                ) : chartData ? (
                  <div className="relative w-full h-[200px] overflow-visible">
                    <svg
                      viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                      className="w-full h-full overflow-visible"
                      preserveAspectRatio="none"
                    >
                      {/* Gradient */}
                      <defs>
                        <linearGradient id="weightChartGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.22" />
                          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
                        </linearGradient>
                      </defs>

                      {/* Horizontal Grid lines (Minimal & Dashed) */}
                      {chartData.gridLines.map((line, idx) => (
                        <g key={idx} className="opacity-15">
                          <line
                            x1={chartData.paddingLeft}
                            y1={line.y}
                            x2={chartData.width - chartData.paddingRight}
                            y2={line.y}
                            stroke="#475569"
                            strokeWidth="1"
                            strokeDasharray="2 3"
                          />
                          <text
                            x={chartData.paddingLeft - 6}
                            y={line.y + 3.5}
                            fill="#64748b"
                            fontSize="9"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="500"
                            textAnchor="end"
                          >
                            {line.value.toFixed(1)}
                          </text>
                        </g>
                      ))}

                      {/* Goal Weight Dashed Line (Clean, low opacity, text on right) */}
                      {chartData.goalY !== null && (
                        <g className="opacity-35">
                          <line
                            x1={chartData.paddingLeft}
                            y1={chartData.goalY}
                            x2={chartData.width - chartData.paddingRight}
                            y2={chartData.goalY}
                            stroke="#10b981"
                            strokeWidth="1.2"
                            strokeDasharray="3 3"
                          />
                          <text
                            x={chartData.width - chartData.paddingRight + 6}
                            y={chartData.goalY + 3}
                            fill="#10b981"
                            fontSize="9"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="600"
                            opacity="0.8"
                          >
                            목표 {goalWeight.toFixed(1)}kg
                          </text>
                        </g>
                      )}

                      {/* Area Gradient Under Trend Line */}
                      {chartData.points.length > 1 && (
                        <path
                          d={chartData.areaPath}
                          fill="url(#weightChartGradient)"
                          className="transition-all duration-300"
                        />
                      )}

                      {/* Main Trend Line */}
                      {chartData.points.length > 1 && (
                        <path
                          d={chartData.linePath}
                          fill="none"
                          stroke="#6366f1"
                          strokeWidth="2.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="transition-all duration-300"
                        />
                      )}

                      {/* Hover Indicator Vertical Line */}
                      {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                        <line
                          x1={chartData.points[hoveredPointIndex].x}
                          y1={chartData.paddingTop}
                          x2={chartData.points[hoveredPointIndex].x}
                          y2={chartData.height - chartData.paddingBottom}
                          stroke="#6366f1"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                          className="opacity-50"
                        />
                      )}

                      {/* Points with Highlight for the Latest Point */}
                      {chartData.points.map((p, idx) => {
                        const isHovered = hoveredPointIndex === idx;
                        const isLatest = idx === chartData.points.length - 1;

                        return (
                          <g key={idx}>
                            {/* Hover Halo */}
                            {isHovered && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="7.5"
                                fill="#6366f1"
                                fillOpacity="0.25"
                              />
                            )}
                            
                            {/* Latest Point Subtle Ring (Current Position Focus) */}
                            {isLatest && !isHovered && (
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="5.5"
                                fill="#6366f1"
                                fillOpacity="0.2"
                              />
                            )}

                            {/* Point Core */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r={isHovered ? "4" : isLatest ? "3.6" : "2.5"}
                              fill={isHovered || isLatest ? "#6366f1" : "#1e1b4b"}
                              stroke={isHovered || isLatest ? "#ffffff" : "#6366f1"}
                              strokeWidth={isHovered || isLatest ? "1.5" : "1"}
                              className="transition-all duration-200"
                            />

                            {/* Generous Hitbox */}
                            <circle
                              cx={p.x}
                              cy={p.y}
                              r="16"
                              fill="transparent"
                              className="cursor-pointer"
                              onMouseEnter={() => setHoveredPointIndex(idx)}
                              onMouseLeave={() => setHoveredPointIndex(null)}
                            />
                          </g>
                        );
                      })}

                      {/* X-axis date labels */}
                      {chartData.points.length > 0 && (
                        <g>
                          {[
                            0,
                            Math.floor(chartData.points.length / 2),
                            chartData.points.length - 1
                          ].filter((val, index, self) => self.indexOf(val) === index && chartData.points[val]).map((val) => {
                            const p = chartData.points[val];
                            const isHovered = hoveredPointIndex === val;
                            return (
                              <text
                                key={val}
                                x={p.x}
                                y={chartData.height - 6}
                                fill={isHovered ? "#ffffff" : "#64748b"}
                                fontSize="9"
                                fontFamily="JetBrains Mono, monospace"
                                fontWeight={isHovered ? "bold" : "500"}
                                textAnchor="middle"
                                className="transition-colors duration-150 select-none"
                              >
                                {formatXAxisDate(p.log.date, selectedPeriod)}
                              </text>
                            );
                          })}
                        </g>
                      )}
                    </svg>

                    {/* Tooltip: Compact & Decision-Oriented (Section 8) */}
                    {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                      (() => {
                        const p = chartData.points[hoveredPointIndex];
                        const widthPct = (p.x / chartData.width) * 100;
                        const heightPct = (p.y / chartData.height) * 100;
                        const diffFromGoal = goalWeight > 0 ? p.log.weight - goalWeight : null;
                        const isFarRight = widthPct > 75;
                        const isFarLeft = widthPct < 25;
                        const transformX = isFarRight ? '-85%' : isFarLeft ? '-15%' : '-50%';

                        return (
                          <div
                            className="absolute z-20 pointer-events-none bg-slate-950/95 border border-slate-800 rounded-lg px-2.5 py-1.5 shadow-xl flex flex-col gap-0.5 min-w-[105px] font-mono text-[10px] text-slate-300 transition-all duration-75"
                            style={{
                              left: `${widthPct}%`,
                              top: `${heightPct}%`,
                              transform: `translate(${transformX}, -120%)`
                            }}
                          >
                            <div className="text-slate-400 font-medium border-b border-slate-800/80 pb-0.5 flex items-center justify-between">
                              <span>{p.log.date.replace(/-/g, '.')}</span>
                            </div>
                            <div className="flex justify-between items-baseline pt-0.5">
                              <span className="font-sans text-slate-400">체중</span>
                              <span className="text-xs font-bold text-white">{p.log.weight.toFixed(1)} kg</span>
                            </div>
                            {goalWeight > 0 && diffFromGoal !== null && (
                              <div className="flex justify-between items-center text-[9px] text-slate-400 pt-0.5 border-t border-slate-900">
                                <span>목표 대비</span>
                                <span className="font-semibold text-slate-300">
                                  {diffFromGoal > 0 ? `+${diffFromGoal.toFixed(1)}` : diffFromGoal.toFixed(1)}kg
                                </span>
                              </div>
                            )}
                          </div>
                        );
                      })()
                    )}
                  </div>
                ) : null}
              </div>

              {/* Secondary Statistics: Compact, low-contrast row without heavy card borders (Section 10, 11) */}
              {latestLog && filteredLogs.length > 0 ? (
                <div className="bg-slate-950/20 rounded-lg px-3 py-1.5 grid grid-cols-3 divide-x divide-slate-800/30">
                  {/* 최고 */}
                  <div className="px-2 first:pl-0 flex items-baseline justify-between sm:justify-start sm:gap-2">
                    <span className="text-[10px] font-medium text-slate-500 font-sans">최고</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-300 tabular-nums font-sans">
                        {stats.highest.weight.toFixed(1)}kg
                      </span>
                      {stats.highest.date && (
                        <span className="text-[10px] font-mono text-slate-500">
                          · {formatCompactDate(stats.highest.date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 최저 */}
                  <div className="px-2 flex items-baseline justify-between sm:justify-start sm:gap-2">
                    <span className="text-[10px] font-medium text-slate-500 font-sans">최저</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-300 tabular-nums font-sans">
                        {stats.lowest.weight.toFixed(1)}kg
                      </span>
                      {stats.lowest.date && (
                        <span className="text-[10px] font-mono text-slate-500">
                          · {formatCompactDate(stats.lowest.date)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 기간 평균 */}
                  <div className="px-2 last:pr-0 flex items-baseline justify-between sm:justify-start sm:gap-2">
                    <span className="text-[10px] font-medium text-slate-500 font-sans">평균</span>
                    <div className="flex items-baseline gap-1">
                      <span className="text-xs font-semibold text-slate-300 tabular-nums font-sans">
                        {stats.average.toFixed(1)}kg
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* One-line Inline Insight: Non-card, judgment-focused status (Section 12 & 13) */}
              {weightInsight && (
                <div className="flex items-center gap-1.5 px-1 py-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/80 shrink-0" />
                  <p className="text-xs text-slate-400 font-medium font-sans">
                    {weightInsight}
                  </p>
                </div>
              )}

            </div>

            {/* Compact CTA Footer: Simplified, duplicate Close removed (Section 14 Option A, 15) */}
            <div className="px-5 py-2.5 bg-slate-950/30 border-t border-slate-800/50 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordWeightClick();
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2.5px]" />
                <span>체중 기록하기</span>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

