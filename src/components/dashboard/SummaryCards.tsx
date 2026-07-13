/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Trophy, Scale, Flame } from 'lucide-react';

interface MetricCardProps {
  key?: string | number;
  id: string;
  title: string;
  value: string;
  subValue: string;
  progress?: number; // 0 to 100
  goal?: string;
  isTotal?: boolean;
  onEditGoalClick?: () => void;
  onWeightCardClick?: () => void;
}

function MetricCard({ id, title, value, subValue, progress, goal, isTotal, onEditGoalClick, onWeightCardClick }: MetricCardProps) {
  const isWeight = id === 'weight' || title.includes('체중');
  const isPositive = subValue.includes('+') || subValue.includes('증가') || subValue.includes('▲');
  const isNegative = subValue.includes('-') || subValue.includes('감소') || subValue.includes('▼');
  
  // Weights use neutral color, exercise performance uses success/danger
  let deltaColor = 'text-slate-400';
  if (!isWeight) {
    if (isPositive) {
      deltaColor = 'text-emerald-400/80';
    } else if (isNegative) {
      deltaColor = 'text-rose-400/80';
    }
  }

  // Parse weight subValue to prevent wrapping and look incredibly clean
  let displaySubValue = subValue;
  if (isWeight) {
    const match = subValue.match(/([+-]?\d+(?:\.\d+)?)\s*kg/);
    if (match) {
      const num = parseFloat(match[1]);
      const prefix = num > 0 ? '▲ 최근 4주 +' : num < 0 ? '▼ 최근 4주 ' : '- 최근 4주 ';
      displaySubValue = `${prefix}${Math.abs(num).toFixed(1)}kg`;
    } else {
      displaySubValue = subValue.replace('(4주 전 대비)', '').trim();
    }
  }

  const handleCardClick = () => {
    if (isWeight && onWeightCardClick) {
      onWeightCardClick();
    }
  };

  const getProgressBarColor = (prog: number) => {
    if (prog < 80) return 'bg-slate-600';
    if (prog < 95) return 'bg-blue-500';
    if (prog < 100) return 'bg-emerald-500';
    return 'bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 shadow-[0_0_8px_rgba(245,158,11,0.2)]';
  };

  const getProgressTextColor = (prog: number) => {
    if (prog < 80) return 'text-slate-400';
    if (prog < 95) return 'text-blue-400';
    if (prog < 100) return 'text-emerald-400';
    return 'text-amber-400 font-extrabold';
  };

  return (
    <motion.div
      id={`metric-card-${id}`}
      whileHover={isWeight && onWeightCardClick ? { scale: 1.01, y: -2 } : { y: -2 }}
      transition={{ duration: 0.15 }}
      onClick={handleCardClick}
      className={`relative overflow-hidden p-5 rounded-2xl border flex flex-col justify-between shadow-lg h-full min-h-[196px] ${
        isTotal
          ? 'bg-emerald-950/15 border-emerald-500/30'
          : isWeight && onWeightCardClick
          ? 'bg-slate-900 hover:bg-slate-900/90 border-slate-800 hover:border-slate-700/80 cursor-pointer select-none transition-colors duration-150'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* 1. Header & Title */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400/90 tracking-wider uppercase font-sans block">
            {title}
          </span>
          {isTotal ? (
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
          ) : isWeight ? (
            <Scale className="w-3.5 h-3.5 text-slate-400" />
          ) : (
            <Flame className="w-3.5 h-3.5 text-indigo-500" />
          )}
        </div>

        {/* 2. Largest Number (대표 KPI) */}
        <div className="pt-1.5">
          <span className="text-3xl sm:text-4xl font-black text-white tracking-tight font-sans block leading-none">
            {value}
          </span>
        </div>
      </div>

      {/* 3. Goal 대비 진행률 (Progress Bar, 달성률 %, 목표값) - Grouped Area */}
      <div className="mt-4 space-y-2">
        {goal && (
          <>
            <div className="flex justify-between items-baseline text-[10px] font-sans font-bold">
              <span className="text-slate-400 flex items-center gap-1">
                <span>{goal}</span>
              </span>
              {progress !== undefined && (
                <span className={`${getProgressTextColor(progress)}`}>
                  {progress.toFixed(1)}%
                </span>
              )}
            </div>
            
            {progress !== undefined && (
              <div className="h-2.5 w-full bg-slate-800/80 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(progress, 100)}%` }}
                  transition={{ duration: 1, ease: 'easeOut' }}
                  className={`h-full rounded-full ${getProgressBarColor(progress)}`}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 4. Secondary Information (PR/최근변화) at the absolute bottom */}
      <div className="mt-4 pt-3 border-t border-slate-800/40 flex items-center justify-between">
        <span className={`text-[10px] font-bold tracking-tight block truncate text-slate-500 leading-none max-w-[80%] ${deltaColor}`}>
          {displaySubValue}
        </span>
        {onEditGoalClick && goal && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditGoalClick();
            }}
            className="text-[9px] text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 px-1.5 py-0.5 rounded transition-all cursor-pointer font-sans leading-none font-semibold shrink-0"
          >
            수정
          </button>
        )}
      </div>
    </motion.div>
  );
}

interface SummaryCardMetric {
  id: string;
  title: string;
  value: string;
  subValue: string;
  goal?: string;
  progress?: number;
  isTotal?: boolean;
}

interface SummaryCardsProps {
  metrics?: SummaryCardMetric[];
  onEditGoalClick?: () => void;
  onWeightCardClick?: () => void;
}

export default function SummaryCards({ metrics: propMetrics, onEditGoalClick, onWeightCardClick }: SummaryCardsProps) {
  const defaultMetrics = [
    {
      id: 'weight',
      title: '체중',
      value: '72.6kg',
      subValue: '+0.3kg (4주 전 대비)',
      goal: '목표: 75.0kg',
      progress: 96.8,
    },
    {
      id: 'squat',
      title: '스쿼트 추정 1RM',
      value: '115 kg',
      subValue: '최고 PR: 100x5x5',
      goal: '목표: 120 kg',
      progress: 95.8,
    },
    {
      id: 'bench',
      title: '벤치프레스 추정 1RM',
      value: '75 kg',
      subValue: '최고 PR: 65x5x2',
      goal: '목표: 80 kg',
      progress: 93.8,
    },
    {
      id: 'deadlift',
      title: '데드리프트 추정 1RM',
      value: '150 kg',
      subValue: '최고 PR: 125x5',
      goal: '목표: 150 kg',
      progress: 100.0,
    },
    {
      id: 'ohp',
      title: 'OHP 추정 1RM',
      value: '60 kg',
      subValue: '최고 PR: 50x5x3',
      goal: '목표: 70 kg',
      progress: 85.7,
    },
    {
      id: 'total',
      title: '🏆 3대 합계',
      value: '340 kg',
      subValue: '스쿼트+벤치+데드 합산',
      goal: '목표: 350 kg',
      progress: 97.1,
      isTotal: true,
    },
  ];

  const metrics = propMetrics || defaultMetrics;

  return (
    <div id="summary-cards" className="grid grid-cols-2 lg:grid-cols-6 gap-5">
      {metrics.map((metric) => (
        <MetricCard
          key={metric.id}
          id={metric.id}
          title={metric.title}
          value={metric.value}
          subValue={metric.subValue}
          progress={metric.progress}
          goal={metric.goal}
          isTotal={metric.isTotal}
          onEditGoalClick={onEditGoalClick}
          onWeightCardClick={onWeightCardClick}
        />
      ))}
    </div>
  );
}
