/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

interface DashboardHeaderProps {
  summaryText?: string;
}

export default function DashboardHeader({ summaryText }: DashboardHeaderProps) {
  return (
    <div id="dashboard-header">
      <h1 className="text-3xl font-black text-white tracking-tight sm:text-4xl">
        분석
      </h1>
    </div>
  );
}
