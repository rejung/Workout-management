/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface DashboardHeaderProps {
  summaryText?: string;
}

export default function DashboardHeader({ summaryText }: DashboardHeaderProps) {
  return (
    <div id="dashboard-header" className="space-y-1">
      {/* Visual Title */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <span className="text-xs font-bold text-indigo-400 font-mono tracking-widest uppercase block mb-1">
            지표 요약
          </span>
          <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
            분석
          </h1>
        </div>
      </div>
    </div>
  );
}
