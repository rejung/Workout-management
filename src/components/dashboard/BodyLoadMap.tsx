/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  BodyLoadPresentation,
  DimensionLoadPresentation,
  BodyLoadDisplayStatus,
} from '../../domain/recommendationVNext/types/recommendationPresentation.types';
import { StressDimension } from '../../domain/recommendationVNext/types/stressModel.types';
import { AlertCircle, Activity } from 'lucide-react';

export interface BodyLoadMapProps {
  bodyLoad?: BodyLoadPresentation;
  idPrefix?: string;
}

export interface DimensionConfig {
  readonly id: StressDimension;
  readonly movementName: string;
  readonly view: 'front' | 'back' | 'side';
}

export const CANONICAL_DIMENSION_CONFIGS: readonly DimensionConfig[] = Object.freeze([
  {
    id: 'knee-dominant-lower-body',
    movementName: '무릎 중심 하체',
    view: 'front',
  },
  {
    id: 'hip-posterior-chain',
    movementName: '후면사슬',
    view: 'back',
  },
  {
    id: 'horizontal-push',
    movementName: '수평 밀기',
    view: 'front',
  },
  {
    id: 'vertical-push',
    movementName: '수직 밀기',
    view: 'front',
  },
  {
    id: 'horizontal-pull',
    movementName: '수평 당기기',
    view: 'back',
  },
  {
    id: 'vertical-pull',
    movementName: '수직 당기기',
    view: 'back',
  },
  {
    id: 'axial-systemic-loading',
    movementName: '전신 및 축성 부하',
    view: 'side',
  },
]);

/**
 * 6 silhouette-based movement dimensions (excluding separate axial-systemic item to avoid duplication).
 */
const SILHOUETTE_DIMENSIONS: readonly DimensionConfig[] = Object.freeze(
  CANONICAL_DIMENSION_CONFIGS.filter((c) => c.view !== 'side')
);

/**
 * Maps BodyLoadDisplayStatus to theme colors.
 * - 최근 부하: 주황 (Orange)
 * - 잔여 부하: 노랑 (Yellow)
 * - 최근 부하 근거 없음: 청록 (Teal)
 * - 판단 정보 부족: 회색 (Slate)
 */
export function getStatusColor(status: BodyLoadDisplayStatus): {
  fill: string;
  stroke: string;
  bg: string;
  border: string;
  text: string;
  label: string;
} {
  switch (status) {
    case '최근 부하':
      return {
        fill: '#f97316',
        stroke: '#ea580c',
        bg: 'bg-orange-500/15',
        border: 'border-orange-500/40',
        text: 'text-orange-400',
        label: '최근 부하',
      };
    case '잔여 부하':
      return {
        fill: '#eab308',
        stroke: '#ca8a04',
        bg: 'bg-yellow-500/15',
        border: 'border-yellow-500/40',
        text: 'text-yellow-400',
        label: '잔여 부하',
      };
    case '최근 부하 근거 없음':
      return {
        fill: '#14b8a6',
        stroke: '#0d9488',
        bg: 'bg-teal-500/15',
        border: 'border-teal-500/40',
        text: 'text-teal-400',
        label: '최근 부하 근거 없음',
      };
    case '판단 정보 부족':
    default:
      return {
        fill: '#64748b',
        stroke: '#475569',
        bg: 'bg-slate-800/40',
        border: 'border-slate-700/50',
        text: 'text-slate-400',
        label: '판단 정보 부족',
      };
  }
}

/**
 * Pure presentational component that renders connected Front/Back 2D silhouettes
 * and a compact list of movement dimensions.
 * Does NOT access database, logs, date arithmetic, or recommendation logic.
 */
export function BodyLoadMap({ bodyLoad, idPrefix = 'body-load' }: BodyLoadMapProps) {
  // Safe lookup strictly by canonical dimension ID
  const getDimensionData = (dimId: StressDimension): DimensionLoadPresentation => {
    const found = bodyLoad?.dimensions?.find((d) => d.dimension === dimId);
    if (found) return found;

    const fallbackConfig = CANONICAL_DIMENSION_CONFIGS.find((c) => c.id === dimId);
    return {
      dimension: dimId,
      displayName: fallbackConfig ? fallbackConfig.movementName : dimId,
      status: '판단 정보 부족',
      uncertainty: {
        hasUncertainty: false,
        hasBracketTraces: false,
        hasUncertainTraces: false,
        bracketTraceCount: 0,
        uncertainTraceCount: 0,
        potentialPersistence: 'none',
      },
      isImmediate: false,
      isResidual: false,
      isHistorical: false,
      isInsufficient: true,
    };
  };

  const safeExcludedCount = Math.max(0, bodyLoad?.uncertainSameDaySessionCount ?? 0);

  // Dimension records
  const kneeData = getDimensionData('knee-dominant-lower-body');
  const hipData = getDimensionData('hip-posterior-chain');
  const hPushData = getDimensionData('horizontal-push');
  const vPushData = getDimensionData('vertical-push');
  const hPullData = getDimensionData('horizontal-pull');
  const vPullData = getDimensionData('vertical-pull');
  const axialData = getDimensionData('axial-systemic-loading');

  // Dimension color styles
  const kneeColor = getStatusColor(kneeData.status);
  const hipColor = getStatusColor(hipData.status);
  const hPushColor = getStatusColor(hPushData.status);
  const vPushColor = getStatusColor(vPushData.status);
  const hPullColor = getStatusColor(hPullData.status);
  const vPullColor = getStatusColor(vPullData.status);
  const axialColor = getStatusColor(axialData.status);

  /**
   * Continuous connected 2D neutral body silhouette path.
   * Proportioned symmetrically with arms slightly away from torso and legs naturally apart.
   */
  const renderConnectedBaseSilhouette = () => (
    <path
      d="M 60 10
         C 52 10 46 16 46 24
         C 46 31 50 36 55 38
         L 55 42
         C 46 44 38 48 30 52
         C 26 55 24 64 24 74
         L 22 100
         L 18 126
         C 17 132 18 136 21 136
         C 24 136 26 130 27 124
         L 31 100
         L 32 78
         L 38 70
         L 40 90
         C 40 100 38 108 38 114
         L 37 150
         C 36 166 36 186 39 204
         L 35 212
         C 34 214 36 216 40 216
         L 47 216
         C 49 216 49 212 48 206
         L 48 180
         L 47 150
         L 58 124
         L 62 124
         L 73 150
         L 72 180
         L 72 206
         C 71 212 71 216 73 216
         L 80 216
         C 84 216 86 214 85 212
         L 81 204
         C 84 186 84 166 83 150
         L 82 114
         C 82 108 80 100 80 90
         L 82 70
         L 88 78
         L 89 100
         L 93 124
         C 94 130 96 136 99 136
         C 102 136 103 132 102 126
         L 98 100
         L 96 74
         C 96 64 94 55 90 52
         C 82 48 74 44 65 42
         L 65 38
         C 70 36 74 31 74 24
         C 74 16 68 10 60 10 Z"
      fill="#1e293b"
      stroke="#334155"
      strokeWidth="1.5"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Header with Disclaimer and Single Summary */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-bold text-slate-400">신체 부하 추정 맵</span>
          </div>
          <span className="text-[10px] text-slate-400 tracking-tight">
            기록 기반 추정 · 실제 근육 피로 측정값 아님
          </span>
        </div>

        {/* Existing Summary text displayed once */}
        {bodyLoad?.summary && (
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-medium leading-relaxed">
            {bodyLoad.summary}
          </div>
        )}

        {/* Overall Excluded Same-day Sessions Notice */}
        {safeExcludedCount > 0 && (
          <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
            <span className="text-[11px] text-amber-200/90 leading-tight">
              당일 시간 미지정 기록 {safeExcludedCount}건 제외 (신체 부위 미배정)
            </span>
          </div>
        )}
      </div>

      {/* 2. Visual Section: Connected Silhouettes & Single Axial Side Item */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3 sm:p-4 space-y-3">
        {/* Silhouettes: Prominently sized Front & Back */}
        <div className="flex items-center justify-around gap-4 sm:gap-8 py-2">
          {/* Front View */}
          <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[150px]">
            <span className="text-xs font-bold text-slate-300">정면</span>
            <svg
              viewBox="0 0 120 220"
              className="w-full h-auto drop-shadow-sm select-none"
              role="img"
              aria-labelledby={`${idPrefix}-front-title ${idPrefix}-front-desc`}
            >
              <title id={`${idPrefix}-front-title`}>신체 정면 부하 실루엣</title>
              <desc id={`${idPrefix}-front-desc`}>
                어깨: {vPushData.status}, 가슴: {hPushData.status}, 앞 허벅지: {kneeData.status}
              </desc>

              {/* Continuous Base Body Silhouette */}
              {renderConnectedBaseSilhouette()}

              {/* Active Zone: Shoulders (vertical-push) */}
              <g data-dimension="vertical-push">
                {/* Left Shoulder */}
                <path
                  d="M 55 42 C 45 44 38 48 30 52 C 26 55 24 64 24 70 L 32 76 C 36 72 38 64 42 56 Z"
                  fill={vPushColor.fill}
                  stroke={vPushColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
                {/* Right Shoulder */}
                <path
                  d="M 65 42 C 75 44 82 48 90 52 C 94 55 96 64 96 70 L 88 76 C 84 72 82 64 78 56 Z"
                  fill={vPushColor.fill}
                  stroke={vPushColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>

              {/* Active Zone: Chest (horizontal-push) */}
              <g data-dimension="horizontal-push">
                {/* Left Chest */}
                <path
                  d="M 42 56 L 58 56 L 58 74 C 52 75 44 73 40 68 Z"
                  fill={hPushColor.fill}
                  stroke={hPushColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
                {/* Right Chest */}
                <path
                  d="M 62 56 L 78 56 L 80 68 C 76 73 68 75 62 74 Z"
                  fill={hPushColor.fill}
                  stroke={hPushColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>

              {/* Active Zone: Front Thighs (knee-dominant-lower-body) */}
              <g data-dimension="knee-dominant-lower-body">
                {/* Left Front Thigh */}
                <path
                  d="M 38 114 L 37 150 L 47 150 L 58 124 C 50 120 44 116 38 114 Z"
                  fill={kneeColor.fill}
                  stroke={kneeColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
                {/* Right Front Thigh */}
                <path
                  d="M 82 114 L 83 150 L 73 150 L 62 124 C 70 120 76 116 82 114 Z"
                  fill={kneeColor.fill}
                  stroke={kneeColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>
            </svg>
          </div>

          {/* Back View */}
          <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[150px]">
            <span className="text-xs font-bold text-slate-300">후면</span>
            <svg
              viewBox="0 0 120 220"
              className="w-full h-auto drop-shadow-sm select-none"
              role="img"
              aria-labelledby={`${idPrefix}-back-title ${idPrefix}-back-desc`}
            >
              <title id={`${idPrefix}-back-title`}>신체 후면 부하 실루엣</title>
              <desc id={`${idPrefix}-back-desc`}>
                등 중앙: {hPullData.status}, 등 바깥쪽: {vPullData.status}, 둔부 및 뒤 허벅지: {hipData.status}
              </desc>

              {/* Continuous Base Body Silhouette (Identical pose & proportions) */}
              {renderConnectedBaseSilhouette()}

              {/* Active Zone: Mid Back (horizontal-pull) */}
              <g data-dimension="horizontal-pull">
                <path
                  d="M 52 44 L 68 44 L 66 76 L 54 76 Z"
                  fill={hPullColor.fill}
                  stroke={hPullColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>

              {/* Active Zone: Outer Back / Lats (vertical-pull) */}
              <g data-dimension="vertical-pull">
                {/* Left Lat */}
                <path
                  d="M 38 70 L 52 74 L 51 92 L 40 88 Z"
                  fill={vPullColor.fill}
                  stroke={vPullColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
                {/* Right Lat */}
                <path
                  d="M 82 70 L 68 74 L 69 92 L 80 88 Z"
                  fill={vPullColor.fill}
                  stroke={vPullColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>

              {/* Active Zone: Glutes & Posterior Thighs (hip-posterior-chain) */}
              <g data-dimension="hip-posterior-chain">
                {/* Left Glute / Hamstring */}
                <path
                  d="M 39 104 C 44 102 54 102 58 106 L 58 124 L 47 150 L 37 150 Z"
                  fill={hipColor.fill}
                  stroke={hipColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
                {/* Right Glute / Hamstring */}
                <path
                  d="M 81 104 C 76 102 66 102 62 106 L 62 124 L 73 150 L 83 150 Z"
                  fill={hipColor.fill}
                  stroke={hipColor.stroke}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                  className="transition-colors duration-200"
                />
              </g>
            </svg>
          </div>
        </div>

        {/* Separate Single Item: Axial & Systemic Loading (Displayed once only) */}
        <div
          data-dimension="axial-systemic-loading"
          className={`p-2.5 rounded-lg border ${axialColor.bg} ${axialColor.border} flex items-center justify-between gap-3 transition-colors`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-200">전신 및 축성 부하</span>
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${axialColor.bg} ${axialColor.border} ${axialColor.text}`}>
                {axialColor.label}
              </span>
            </div>
            <span className="text-[10px] text-slate-400 block leading-tight">
              척추 축성 및 복합 전신 부하
            </span>
          </div>
          {axialData.uncertainty.hasUncertainty && (
            <span className="text-[10px] text-amber-300 font-medium shrink-0">
              ({axialData.uncertainty.note || '불확실성 포함'})
            </span>
          )}
        </div>

        {/* Legend (범례) */}
        <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />
            <span className="text-slate-300 font-medium">최근 부하 (&lt;24h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
            <span className="text-slate-300 font-medium">잔여 부하 (24~72h)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-teal-400 shrink-0" />
            <span className="text-slate-300 font-medium">최근 부하 근거 없음</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0" />
            <span className="text-slate-400 font-medium">판단 정보 부족</span>
          </div>
        </div>
      </div>

      {/* 3. Concise Movement Dimensions Breakdown List */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          움직임 영역별 상태
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
          {SILHOUETTE_DIMENSIONS.map((config) => {
            const data = getDimensionData(config.id);
            const style = getStatusColor(data.status);
            const hasUncertainty = data.uncertainty.hasUncertainty;

            return (
              <div
                key={config.id}
                data-dimension-row={config.id}
                className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60"
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-medium text-slate-200 truncate">{config.movementName}</span>
                  {hasUncertainty && (
                    <span className="text-[10px] text-amber-300 font-medium shrink-0">
                      ({data.uncertainty.note || '불확실성 포함'})
                    </span>
                  )}
                </div>
                <span
                  className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.border} ${style.text}`}
                >
                  {style.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
