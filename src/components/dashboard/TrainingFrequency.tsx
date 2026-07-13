/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Calendar } from 'lucide-react';

interface FrequencyData {
  name: string;
  recent4Weeks: number;
  recent8Weeks: number;
}

interface TrainingFrequencyProps {
  frequencies?: FrequencyData[];
}

export default function TrainingFrequency({ frequencies: propFrequencies }: TrainingFrequencyProps) {
  const defaultFrequencies: FrequencyData[] = [
    { name: '스쿼트', recent4Weeks: 3, recent8Weeks: 5 },
    { name: '벤치프레스', recent4Weeks: 5, recent8Weeks: 10 },
    { name: '데드리프트', recent4Weeks: 3, recent8Weeks: 4 },
    { name: 'OHP', recent4Weeks: 3, recent8Weeks: 6 },
  ];

  const frequencies = propFrequencies || defaultFrequencies;

  return (
    <div id="training-frequency-card" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-4">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20">
          <Calendar className="w-4 h-4" />
        </div>
        <h2 className="text-sm font-bold text-white">종목별 훈련 빈도</h2>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
              <th className="pb-3 pr-2">종목</th>
              <th className="pb-3 text-right">최근 4주</th>
              <th className="pb-3 text-right">최근 8주</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40 text-xs font-mono font-bold">
            {frequencies.map((freq) => (
              <tr key={freq.name} className="group hover:bg-slate-800/20 transition-colors">
                <td className="py-4 pr-2 font-sans text-sm font-extrabold text-slate-100">
                  {freq.name}
                </td>
                <td className="py-4 text-right text-emerald-400">
                  {freq.recent4Weeks}회
                </td>
                <td className="py-4 text-right text-slate-300">
                  {freq.recent8Weeks}회
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
