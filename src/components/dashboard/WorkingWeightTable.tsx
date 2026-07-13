/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrendingUp, ArrowUpRight, ArrowRight, Minus } from 'lucide-react';

interface RowData {
  name: string;
  current: number;
  fourWeeksAgo: number;
  goal: number;
}

interface WorkingWeightTableProps {
  rows?: RowData[];
}

export default function WorkingWeightTable({ rows: propRows }: WorkingWeightTableProps) {
  const defaultRows: RowData[] = [
    { name: '스쿼트', current: 110, fourWeeksAgo: 100, goal: 110 },
    { name: '벤치프레스', current: 70, fourWeeksAgo: 70, goal: 70 },
    { name: '데드리프트', current: 130, fourWeeksAgo: 120, goal: 140 },
    { name: 'OHP', current: 50, fourWeeksAgo: 50, goal: 60 },
  ];

  const rows = propRows || defaultRows;

  return (
    <div id="working-weight-table-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
            <TrendingUp className="w-4 h-4" />
          </div>
          <h2 className="text-sm font-bold text-white">대표 작업중량 변화</h2>
        </div>
        <span className="text-[10px] font-mono text-slate-400">단위: kg</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-2">종목</th>
              <th className="pb-3 text-right">현재</th>
              <th className="pb-3 text-right">4주 전</th>
              <th className="pb-3 text-right">변화</th>
              <th className="pb-3 text-right">변화율</th>
              <th className="pb-3 text-right">목표</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-xs font-mono font-bold">
            {rows.map((row) => {
              const diff = row.current - row.fourWeeksAgo;
              const diffPct = row.fourWeeksAgo > 0 ? (diff / row.fourWeeksAgo) * 100 : 0;
              const isPositive = diff > 0;
              const isZero = diff === 0;

              return (
                <tr key={row.name} className="group hover:bg-slate-800/20 transition-colors">
                  <td className="py-4 pr-2 font-sans text-sm font-extrabold text-slate-100">
                    {row.name}
                  </td>
                  <td className="py-4 text-right text-slate-200">
                    {row.current}
                  </td>
                  <td className="py-4 text-right text-slate-400">
                    {row.fourWeeksAgo}
                  </td>
                  <td className={`py-4 text-right ${isPositive ? 'text-emerald-400' : isZero ? 'text-slate-500' : 'text-rose-400'}`}>
                    <span className="flex items-center justify-end gap-1">
                      {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : isZero ? <Minus className="w-3 h-3" /> : null}
                      {isPositive ? `+${diff}` : diff}
                    </span>
                  </td>
                  <td className={`py-4 text-right ${isPositive ? 'text-emerald-400' : isZero ? 'text-slate-500' : 'text-rose-400'}`}>
                    {isPositive ? `+${diffPct.toFixed(1)}%` : `${diffPct.toFixed(1)}%`}
                  </td>
                  <td className="py-4 text-right text-slate-400">
                    {row.goal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
