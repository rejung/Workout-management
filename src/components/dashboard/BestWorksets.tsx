/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Trophy } from 'lucide-react';

interface Workset {
  name: string;
  scheme: string;
  date: string;
  note?: string;
  weight?: number;
  goal?: number;
}

interface BestWorksetsProps {
  sets?: Workset[];
}

/**
 * Parses legacy reps value or scheme format to highlight numbers.
 * Separates numeric values from units (kg, 회, 세트) with high visual hierarchy.
 * Prominent bright numbers are coupled with very quiet, small unit labels.
 */
function renderScheme(scheme: string) {
  const normalized = scheme.replace(/\s+/g, ' ').trim();
  const regex = /^([\d.]+)\s*(kg)?\s*([x×*])\s*([\d.]+)\s*(회)?(?:\s*[x×*]\s*([\d.]+)\s*(세트)?)?$/i;
  const match = normalized.match(regex);

  if (!match) {
    return <span className="text-white font-sans text-sm font-extrabold">{scheme}</span>;
  }

  const [_, weight, kg, op1, reps, times, sets, setsUnit] = match;

  return (
    <span className="font-sans flex items-baseline text-sm tracking-tight">
      <span className="font-black text-white text-[15px] leading-none">{weight}</span>
      <span className="text-slate-600 text-[9px] font-semibold ml-0.5 mr-1.5">{kg || 'kg'}</span>
      
      <span className="text-slate-700 text-xs font-normal mx-1">×</span>
      
      <span className="font-black text-white text-[15px] leading-none">{reps}</span>
      <span className="text-slate-600 text-[9px] font-semibold ml-0.5 mr-1.5">{times || '회'}</span>
      
      {sets && (
        <>
          <span className="text-slate-700 text-xs font-normal mx-1">×</span>
          <span className="font-black text-white text-[15px] leading-none">{sets}</span>
          <span className="text-slate-600 text-[9px] font-semibold ml-0.5">{setsUnit || '세트'}</span>
        </>
      )}
    </span>
  );
}

/**
 * Formats a date string (YYYY-MM-DD or YYYY.MM.DD) into a short MM.DD format.
 */
function formatShortDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const parts = dateStr.split(/[-.]/);
  if (parts.length >= 3) {
    return `${parts[1]}.${parts[2]}`;
  }
  return dateStr;
}

export default function BestWorksets({ sets: propSets }: BestWorksetsProps) {
  const defaultSets: Workset[] = [
    { name: '스쿼트', scheme: '100 kg × 5회 × 5세트', date: '2026-06-09', weight: 100, goal: 110 },
    { name: '벤치프레스', scheme: '70 kg × 3회 × 3세트', date: '2026-06-25', weight: 70, goal: 75 },
    { name: '데드리프트', scheme: '130 kg × 5회 × 1세트', date: '2026-06-23', weight: 130, goal: 150 },
    { name: 'OHP', scheme: '50 kg × 5회 × 5세트', date: '2026-06-21', weight: 50, goal: 60 },
  ];

  const sets = propSets || defaultSets;

  return (
    <div id="best-worksets-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3.5">
      {/* Title block matching other Dashboard widgets */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-500" />
          <h2 className="text-sm font-bold text-white">대표 기록</h2>
        </div>
      </div>

      {/* Structured, clean list representation instead of heavy table */}
      <div className="space-y-1">
        {/* Header line with smaller columns for tighter gap & better grouping */}
        <div className="grid grid-cols-[75px_1fr_40px] sm:grid-cols-[90px_1fr_40px] items-center px-2.5 pb-1 text-[10px] font-sans font-extrabold text-slate-500 uppercase tracking-wider">
          <div>운동</div>
          <div>대표 기록</div>
          <div className="text-right">날짜</div>
        </div>

        {/* List items with optimized padding & subdued hover */}
        <div className="space-y-0.5">
          {sets.map((set) => {
            const displayDate = formatShortDate(set.date);

            return (
              <div
                key={set.name}
                className="grid grid-cols-[75px_1fr_40px] sm:grid-cols-[90px_1fr_40px] items-center py-1.5 px-2.5 bg-slate-950/10 hover:bg-slate-950/20 rounded-lg transition-colors duration-150 cursor-default"
              >
                {/* 운동명 (Unified aesthetic styles, subordinate to stats) */}
                <div className="font-sans font-medium text-slate-400 text-xs sm:text-sm truncate pr-2">
                  {set.name}
                </div>

                {/* 대표 작업세트 (Highly prominent primary focal point) */}
                <div className="text-left flex items-center overflow-hidden">
                  {renderScheme(set.scheme)}
                </div>

                {/* 날짜 (Very quiet, light weight tertiary support information) */}
                <div className="text-right font-sans font-normal text-slate-600 text-[10px] whitespace-nowrap">
                  {displayDate}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

