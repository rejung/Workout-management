/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Flame, TrendingUp } from 'lucide-react';

interface ChangeRow {
  name: string;
  change4W: string;
  change8W: string;
}

interface Estimated1RMChangeProps {
  rows?: ChangeRow[];
}

export default function Estimated1RMChange({ rows: propRows }: Estimated1RMChangeProps) {
  const defaultRows: ChangeRow[] = [
    { name: '스쿼트', change4W: '0 kg', change8W: '+5 kg' },
    { name: '벤치프레스', change4W: '0 kg', change8W: '0 kg' },
    { name: '데드리프트', change4W: '+10 kg', change8W: '+35 kg' },
    { name: 'OHP', change4W: '+5 kg', change8W: '+5 kg' },
  ];

  const rows = propRows || defaultRows;

  return (
    <div id="estimated-1rm-change-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
          <TrendingUp className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-bold text-white">추정 1RM 변화</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-2">종목</th>
              <th className="pb-3 text-right">4주 변화</th>
              <th className="pb-3 text-right">8주 변화</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-xs font-mono font-bold">
            {rows.map((row) => {
              const is4WPositive = row.change4W.startsWith('+');
              const is4WZero = row.change4W === '0 kg';
              const is8WPositive = row.change8W.startsWith('+');
              const is8WZero = row.change8W === '0 kg';

              return (
                <tr key={row.name} className="group hover:bg-slate-800/20 transition-colors">
                  <td className="py-4 pr-2 font-sans text-sm font-extrabold text-slate-100">
                    {row.name}
                  </td>
                  <td className={`py-4 text-right ${is4WPositive ? 'text-emerald-400' : is4WZero ? 'text-slate-500' : 'text-rose-400'}`}>
                    {row.change4W}
                  </td>
                  <td className={`py-4 text-right ${is8WPositive ? 'text-emerald-400' : is8WZero ? 'text-slate-500' : 'text-rose-400'}`}>
                    {row.change8W}
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
