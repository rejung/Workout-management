/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, TrendingUp, TrendingDown, Target, Calendar, Award, Plus, BarChart2 } from 'lucide-react';
import { WeightLog } from '../../utils/workoutEngine';
import { formatWorkoutDateShort } from '../../utils/dateUtils';

const formatXAxisMonth = (dateStr: string) => {
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    const month = parseInt(parts[1], 10);
    return `${month}월`;
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

type Period = '7d' | '4w' | '3m' | '1y' | 'all';

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
    
    const now = new Date();
    let cutoffDate = new Date();

    switch (selectedPeriod) {
      case '7d':
        cutoffDate.setDate(now.getDate() - 7);
        break;
      case '4w':
        cutoffDate.setDate(now.getDate() - 28);
        break;
      case '3m':
        cutoffDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        cutoffDate.setDate(now.getDate() - 365);
        break;
      case 'all':
        return sortedLogs;
    }

    const cutoffStr = cutoffDate.toISOString().split('T')[0];
    return sortedLogs.filter(log => log.date >= cutoffStr);
  }, [sortedLogs, selectedPeriod]);

  // Calculations for stats
  const stats = useMemo(() => {
    if (filteredLogs.length === 0) {
      return {
        highest: { weight: 0, date: '' },
        lowest: { weight: 0, date: '' },
        average: 0,
        change: 0,
        avgPast7Days: 0,
        remainingToGoal: 0
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

    // Average
    const sum = weights.reduce((a, b) => a + b, 0);
    const average = sum / filteredLogs.length;

    // Change (latest in period minus first in period)
    const change = filteredLogs[filteredLogs.length - 1].weight - filteredLogs[0].weight;

    // Past 7 days average
    const now = new Date();
    const past7DaysCutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const past7DaysLogs = sortedLogs.filter(l => l.date >= past7DaysCutoff);
    const avgPast7Days = past7DaysLogs.length > 0
      ? past7DaysLogs.reduce((acc, curr) => acc + curr.weight, 0) / past7DaysLogs.length
      : 0;

    // Remaining to goal weight
    const currentWeight = latestLog ? latestLog.weight : 0;
    const remainingToGoal = goalWeight - currentWeight;

    return {
      highest,
      lowest,
      average,
      change,
      avgPast7Days,
      remainingToGoal
    };
  }, [filteredLogs, sortedLogs, latestLog, goalWeight]);

  // Dynamic Selector-based Insight Generation
  const weightInsight = useMemo(() => {
    if (weightLogs.length === 0) return '';
    
    const currentWeight = latestLog ? latestLog.weight : 0;
    const remaining = goalWeight - currentWeight;
    
    if (filteredLogs.length >= 2) {
      const firstLog = filteredLogs[0];
      const lastLog = filteredLogs[filteredLogs.length - 1];
      const diff = lastLog.weight - firstLog.weight;
      const periodText = selectedPeriod === '7d' ? '7일' : selectedPeriod === '4w' ? '4주' : selectedPeriod === '3m' ? '3개월' : selectedPeriod === '1y' ? '1년' : '조회 기간';

      if (Math.abs(remaining) <= 0.2) {
        return `목표 체중(${goalWeight.toFixed(1)}kg)에 거의 도달했습니다! 정말 훌륭한 성과입니다.`;
      }

      if (Math.abs(diff) <= 0.3) {
        return `최근 2주간 체중이 안정적으로 유지되고 있습니다. 현재 ${currentWeight.toFixed(1)}kg 선을 안정되게 기록하고 있습니다.`;
      }

      if (diff < 0) {
        return `최근 ${periodText} 동안 체중이 ${Math.abs(diff).toFixed(1)}kg 감소했습니다. 목표 체중까지 ${Math.abs(remaining).toFixed(1)}kg 남았습니다.`;
      }

      return `최근 ${periodText} 동안 체중이 ${diff.toFixed(1)}kg 증가했습니다. 목표 체중까지 ${Math.abs(remaining).toFixed(1)}kg 남았습니다.`;
    }

    return `목표 체중까지 ${Math.abs(remaining).toFixed(1)}kg 남았습니다. 지속적인 기록으로 추이를 분석해 보세요.`;
  }, [filteredLogs, latestLog, goalWeight, selectedPeriod, weightLogs]);

  // Render Line Chart elements manually for absolute compatibility and precision
  const chartData = useMemo(() => {
    if (filteredLogs.length === 0) return null;

    const weights = filteredLogs.map(l => l.weight);
    let minWeight = Math.min(...weights);
    let maxWeight = Math.max(...weights);

    // Include goal weight in the chart boundary
    minWeight = Math.min(minWeight, goalWeight);
    maxWeight = Math.max(maxWeight, goalWeight);

    // Add padding so lines are never clipped
    const range = maxWeight - minWeight;
    const padding = range === 0 ? 2 : range * 0.15;
    const allMin = Math.max(0, minWeight - padding);
    const allMax = maxWeight + padding;

    // Dimensions
    const width = 600;
    const height = 280;
    const paddingLeft = 45;
    const paddingRight = 85; // Extra padding for goal weight label
    const paddingTop = 20;
    const paddingBottom = 30;

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
      
      // Calculate diff from the previous point
      let prevDiff = 0;
      if (index > 0) {
        prevDiff = log.weight - filteredLogs[index - 1].weight;
      } else {
        // find index in main sortedLogs
        const mainIndex = sortedLogs.findIndex(l => l.id === log.id);
        if (mainIndex > 0) {
          prevDiff = log.weight - sortedLogs[mainIndex - 1].weight;
        }
      }

      return { x, y, log, prevDiff };
    });

    // Grid lines values (horizontal lines)
    const gridCount = 4;
    const gridLines = [];
    for (let i = 0; i <= gridCount; i++) {
      const value = allMin + (i / gridCount) * (allMax - allMin);
      const y = paddingTop + (1 - (value - allMin) / (allMax - allMin)) * chartHeight;
      gridLines.push({ value, y });
    }

    // Goal line coordinates
    const goalY = allMax !== allMin
      ? paddingTop + (1 - (goalWeight - allMin) / (allMax - allMin)) * chartHeight
      : paddingTop + chartHeight / 2;

    // SVG Line paths
    let linePath = '';
    let areaPath = '';

    if (points.length > 0) {
      linePath = `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
      
      // Area path closed at bottom of the chart area
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
  }, [filteredLogs, sortedLogs, goalWeight]);

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
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-md cursor-pointer"
          />

          {/* Modal Container */}
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="relative w-full h-full sm:h-auto sm:max-w-3xl bg-slate-900 border border-slate-800/80 rounded-none sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden max-h-full"
            role="dialog"
            aria-modal="true"
            aria-label="체중 변화 분석 모달"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-800/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black font-sans text-white tracking-tight flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-400" />
                  <span>체중 추이 분석</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  최근 체중 변화와 목표 진행 상황입니다.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                className="w-9 h-9 rounded-xl bg-slate-800/50 hover:bg-slate-800 border border-slate-700/40 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              
              {/* Top Summary Row */}
              {latestLog ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">현재 체중</span>
                    <span className="text-2xl font-black font-sans text-white tracking-tight mt-0.5">
                      {latestLog.weight.toFixed(1)}<span className="text-xs font-bold text-slate-400 ml-0.5">kg</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-600" />
                      {latestLog.date.replace(/-/g, '.')}
                    </span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">
                      최근 변화 ({selectedPeriod === '7d' ? '7일' : selectedPeriod === '4w' ? '4주' : selectedPeriod === '3m' ? '3개월' : selectedPeriod === '1y' ? '1년' : '전체'})
                    </span>
                    <span className="text-lg font-bold font-sans text-white tracking-tight mt-0.5 flex items-baseline gap-1">
                      <span className={stats.change > 0 ? 'text-rose-400' : stats.change < 0 ? 'text-emerald-400' : 'text-slate-300'}>
                        {stats.change > 0 ? '+' : ''}{stats.change.toFixed(1)}
                      </span>
                      <span className="text-xs font-bold text-slate-400">kg</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                      {stats.change > 0 ? (
                        <TrendingUp className="w-3 h-3 text-rose-500" />
                      ) : stats.change < 0 ? (
                        <TrendingDown className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1" />
                      )}
                      <span>이전 대비</span>
                    </span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">목표 체중</span>
                    <span className="text-lg font-bold font-sans text-white tracking-tight mt-0.5">
                      {goalWeight.toFixed(1)}<span className="text-xs font-bold text-slate-400 ml-0.5">kg</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold text-indigo-400 mt-0.5 flex items-center gap-1">
                      <Target className="w-3 h-3 text-indigo-500" />
                      <span className="truncate">
                        {stats.remainingToGoal > 0 
                          ? `${stats.remainingToGoal.toFixed(1)}kg 증가 필요` 
                          : stats.remainingToGoal < 0 
                          ? `${Math.abs(stats.remainingToGoal).toFixed(1)}kg 감량 완료` 
                          : '목표 달성'}
                      </span>
                    </span>
                  </div>

                  <div className="bg-slate-950/40 border border-slate-800/60 p-3 rounded-2xl flex flex-col justify-between">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider block">목표 달성률</span>
                    <span className="text-lg font-bold font-sans text-emerald-400 tracking-tight mt-0.5">
                      {((latestLog.weight / goalWeight) * 100).toFixed(1)}%
                    </span>
                    <span className="text-[9px] font-mono font-bold text-emerald-500 mt-0.5 flex items-center gap-1">
                      <Award className="w-3 h-3 text-emerald-500" />
                      <span>체력 단련 수치</span>
                    </span>
                  </div>
                </div>
              ) : null}

              {/* Period Segmented Control */}
              <div className="flex justify-between items-center bg-slate-950/30 p-1.5 rounded-2xl border border-slate-800/50">
                <span className="text-[11px] font-bold text-slate-400 pl-2.5 font-sans">조회 기간</span>
                <div className="flex gap-1">
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
                        className={`text-xs font-bold font-sans px-3.5 py-1.5 rounded-xl transition-all cursor-pointer ${
                          isActive
                            ? 'bg-slate-800 text-white shadow-sm border border-slate-700/50'
                            : 'text-slate-400 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        {labelMap[period]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Interactive Line Chart */}
              <div className="bg-slate-950/40 border border-slate-800/60 p-4 rounded-3xl relative overflow-visible min-h-[310px] flex flex-col justify-center">
                {filteredLogs.length === 0 ? (
                  <div className="py-12 text-center space-y-2 select-none">
                    <p className="text-sm font-bold text-slate-400">아직 체중 기록이 없습니다.</p>
                    <p className="text-xs text-slate-500">체중을 기록하면 변화 추이를 확인할 수 있습니다.</p>
                  </div>
                ) : chartData ? (
                  <>
                    <div className="relative w-full h-[280px] overflow-visible">
                      <svg
                        viewBox={`0 0 ${chartData.width} ${chartData.height}`}
                        className="w-full h-full overflow-visible"
                        preserveAspectRatio="none"
                      >
                        {/* Define gradients */}
                        <defs>
                          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.32" />
                            <stop offset="100%" stopColor="#6366f1" stopOpacity="0.00" />
                          </linearGradient>
                        </defs>

                        {/* Horizontal Grid lines */}
                        {chartData.gridLines.map((line, idx) => (
                          <g key={idx} className="opacity-40">
                            <line
                              x1={chartData.paddingLeft}
                              y1={line.y}
                              x2={chartData.width - chartData.paddingRight}
                              y2={line.y}
                              stroke="#334155"
                              strokeWidth="1"
                              strokeDasharray="2 3"
                            />
                            <text
                              x={chartData.paddingLeft - 8}
                              y={line.y + 4}
                              fill="#94a3b8"
                              fontSize="10"
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight="bold"
                              textAnchor="end"
                            >
                              {line.value.toFixed(1)}
                            </text>
                          </g>
                        ))}

                        {/* Goal Weight Line */}
                        <g className="opacity-35">
                          <line
                            x1={chartData.paddingLeft}
                            y1={chartData.goalY}
                            x2={chartData.width - chartData.paddingRight}
                            y2={chartData.goalY}
                            stroke="#10b981"
                            strokeWidth="1.2"
                            strokeDasharray="6 6"
                          />
                          {/* Goal Line Label Pin */}
                          <text
                            x={chartData.width - chartData.paddingRight + 8}
                            y={chartData.goalY + 3}
                            fill="#10b981"
                            fontSize="10"
                            fontFamily="JetBrains Mono, monospace"
                            fontWeight="medium"
                          >
                            목표 {goalWeight.toFixed(1)}kg
                          </text>
                        </g>

                        {/* Area Gradient Under the line */}
                        {chartData.points.length > 1 && (
                          <path
                            d={chartData.areaPath}
                            fill="url(#chartGradient)"
                            className="transition-all duration-300"
                          />
                        )}

                        {/* Main Trend Line */}
                        {chartData.points.length > 1 && (
                          <path
                            d={chartData.linePath}
                            fill="none"
                            stroke="#6366f1"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="transition-all duration-300"
                          />
                        )}

                        {/* Hover Cursor Vertical Line Indicator */}
                        {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                          <line
                            x1={chartData.points[hoveredPointIndex].x}
                            y1={chartData.paddingTop}
                            x2={chartData.points[hoveredPointIndex].x}
                            y2={chartData.height - chartData.paddingBottom}
                            stroke="#6366f1"
                            strokeWidth="1.2"
                            strokeDasharray="3 3"
                            className="opacity-60"
                          />
                        )}

                        {/* Point Circles & Hotspots */}
                        {chartData.points.map((p, idx) => {
                          const isHovered = hoveredPointIndex === idx;
                          return (
                            <g key={idx}>
                              {/* Glowing background ring if hovered */}
                              {isHovered && (
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r="9"
                                  fill="#6366f1"
                                  fillOpacity="0.25"
                                />
                              )}
                              {/* Main Point */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r={isHovered ? "5" : "3.5"}
                                fill={isHovered ? "#6366f1" : "#1e1b4b"}
                                stroke={isHovered ? "#ffffff" : "#6366f1"}
                                strokeWidth={isHovered ? "1.5" : "1.8"}
                                className="transition-all duration-700"
                              />
                              {/* Large Transparent Hotspot Overlay for easier mouse-over */}
                              <circle
                                cx={p.x}
                                cy={p.y}
                                r="18"
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
                            {/* Always render first and last label, and middle if there are enough items */}
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
                                  y={chartData.height - 8}
                                  fill={isHovered ? "#ffffff" : "#64748b"}
                                  fontSize="9"
                                  fontFamily="JetBrains Mono, monospace"
                                  fontWeight={isHovered ? "bold" : "medium"}
                                  textAnchor="middle"
                                  className="transition-colors duration-150 select-none"
                                >
                                  {formatXAxisMonth(p.log.date)}
                                </text>
                              );
                            })}
                          </g>
                        )}
                      </svg>

                      {/* Floating HTML Chart Tooltip */}
                      {hoveredPointIndex !== null && chartData.points[hoveredPointIndex] && (
                        (() => {
                          const p = chartData.points[hoveredPointIndex];
                          const widthPct = (p.x / chartData.width) * 100;
                          const heightPct = (p.y / chartData.height) * 100;

                          return (
                            <div
                              className="absolute z-20 pointer-events-none bg-slate-950/95 border border-slate-800 rounded-xl p-3 shadow-xl flex flex-col gap-1 min-w-[130px] font-mono text-[10px] text-slate-300 transition-all duration-75"
                              style={{
                                left: `${widthPct}%`,
                                top: `${heightPct - 35}%`,
                                transform: 'translate(-50%, -100%)'
                              }}
                            >
                              <div className="text-slate-500 font-bold border-b border-slate-800/80 pb-1 mb-1 flex items-center justify-between">
                                <span>RECORD</span>
                                <span className="text-slate-400">{p.log.date.replace(/-/g, '.')}</span>
                              </div>
                              <div className="flex justify-between items-baseline">
                                <span className="font-sans font-bold text-slate-400">체중</span>
                                <span className="text-xs font-black text-white">{p.log.weight.toFixed(1)} kg</span>
                              </div>
                              {hoveredPointIndex > 0 && (
                                <div className="flex justify-between items-center mt-0.5">
                                  <span className="text-slate-500">직전 대비</span>
                                  <span className={`font-bold flex items-center gap-0.5 ${p.prevDiff > 0 ? 'text-rose-400' : p.prevDiff < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                    {p.prevDiff > 0 ? '+' : ''}{p.prevDiff.toFixed(1)}kg
                                    {p.prevDiff > 0 ? (
                                      <TrendingUp className="w-2.5 h-2.5 inline" />
                                    ) : p.prevDiff < 0 ? (
                                      <TrendingDown className="w-2.5 h-2.5 inline" />
                                    ) : null}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                    </div>
                  </>
                ) : null}
              </div>

              {/* Bottom Details Grid Cards & Insights */}
              {latestLog ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-slate-950/20 border border-slate-800/20 p-2.5 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-slate-500 font-bold block uppercase">최고 체중</span>
                      <span className="text-base font-black font-sans text-white tracking-tight mt-0.5">
                        {stats.highest.weight.toFixed(1)}<span className="text-[11px] font-bold text-slate-400 ml-0.5">kg</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5 block truncate">
                        {stats.highest.date.replace(/-/g, '.')}
                      </span>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-800/20 p-2.5 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-slate-500 font-bold block uppercase">최저 체중</span>
                      <span className="text-base font-black font-sans text-white tracking-tight mt-0.5">
                        {stats.lowest.weight.toFixed(1)}<span className="text-[11px] font-bold text-slate-400 ml-0.5">kg</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5 block truncate">
                        {stats.lowest.date.replace(/-/g, '.')}
                      </span>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-800/20 p-2.5 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-slate-500 font-bold block uppercase">평균 체중</span>
                      <span className="text-base font-black font-sans text-white tracking-tight mt-0.5">
                        {stats.average.toFixed(1)}<span className="text-[11px] font-bold text-slate-400 ml-0.5">kg</span>
                      </span>
                      <span className="text-[9px] font-mono text-indigo-400 mt-0.5 block truncate">
                        {stats.avgPast7Days > 0 ? `7일 평균: ${stats.avgPast7Days.toFixed(1)}kg` : '현재 구간 평균'}
                      </span>
                    </div>

                    <div className="bg-slate-950/20 border border-slate-800/20 p-2.5 rounded-2xl flex flex-col justify-between">
                      <span className="text-[10px] font-mono text-slate-500 font-bold block uppercase">최근 변화량</span>
                      <span className="text-base font-black font-sans text-white tracking-tight mt-0.5">
                        <span className={stats.change > 0 ? 'text-rose-400' : stats.change < 0 ? 'text-emerald-400' : 'text-slate-300'}>
                          {stats.change > 0 ? '+' : ''}{stats.change.toFixed(1)}
                        </span>
                        <span className="text-[11px] font-bold text-slate-400 ml-0.5">kg</span>
                      </span>
                      <span className="text-[9px] font-mono text-slate-500 mt-0.5 block">
                        구간 시점 대비 종점
                      </span>
                    </div>
                  </div>

                  {/* Auto-generated Insight Row */}
                  {weightInsight && (
                    <div className="bg-indigo-950/20 border border-indigo-500/10 rounded-xl p-3 flex items-start gap-2.5">
                      <div className="p-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20 mt-0.5 shrink-0">
                        <BarChart2 className="w-3.5 h-3.5" />
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans font-medium">
                        {weightInsight}
                      </p>
                    </div>
                  )}
                </div>
              ) : null}

            </div>

            {/* Footer buttons */}
            <div className="px-5 py-3 bg-slate-950/40 border-t border-slate-800/60 flex items-center justify-between gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onRecordWeightClick();
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-black tracking-wider rounded-xl shadow-md transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              >
                <Plus className="w-3.5 h-3.5 stroke-[3px]" />
                <span>체중 기록하러 가기</span>
              </button>
              
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 text-slate-200 hover:text-white text-xs font-bold rounded-xl border border-slate-700/50 transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2 focus:ring-slate-500/20"
              >
                닫기
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
