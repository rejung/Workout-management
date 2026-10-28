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
import { AlertCircle, Activity, Info } from 'lucide-react';

export interface BodyLoadMapProps {
  bodyLoad?: BodyLoadPresentation;
  idPrefix?: string;
}

export interface DimensionConfig {
  readonly id: StressDimension;
  readonly regionName: string;
  readonly movementName: string;
  readonly view: 'front' | 'back' | 'side';
  readonly description: string;
}

export const CANONICAL_DIMENSION_CONFIGS: readonly DimensionConfig[] = Object.freeze([
  {
    id: 'knee-dominant-lower-body',
    regionName: '앞 허벅지',
    movementName: '무릎 중심 하체',
    view: 'front',
    description: '스쿼트, 레그 프레스 등 대퇴사두 중심 부하',
  },
  {
    id: 'hip-posterior-chain',
    regionName: '둔부·뒤 허벅지',
    movementName: '후면사슬',
    view: 'back',
    description: '데드리프트, 힙힌지, 햄스트링 등 후면사슬 부하',
  },
  {
    id: 'horizontal-push',
    regionName: '가슴',
    movementName: '수평 밀기',
    view: 'front',
    description: '벤치프레스, 푸시업 등 대흉근 및 삼두 부하',
  },
  {
    id: 'vertical-push',
    regionName: '어깨',
    movementName: '수직 밀기',
    view: 'front',
    description: '오버헤드 프레스, 숄더 프레스 등 삼각근 부하',
  },
  {
    id: 'horizontal-pull',
    regionName: '등 중앙',
    movementName: '수평 당기기',
    view: 'back',
    description: '바벨 로우, 시티드 로우 등 능형근·승모근 부하',
  },
  {
    id: 'vertical-pull',
    regionName: '등 바깥쪽',
    movementName: '수직 당기기',
    view: 'back',
    description: '풀업, 랫풀다운 등 광배근 중심 부하',
  },
  {
    id: 'axial-systemic-loading',
    regionName: '척추 및 전신',
    movementName: '전신·축성 부하',
    view: 'side',
    description: '고중량 축성 압축 및 중추 신경계 복합 부하',
  },
]);

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
 * Pure presentational component that renders Front/Back silhouettes and an axial item.
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
      displayName: fallbackConfig ? `${fallbackConfig.movementName} (${fallbackConfig.regionName})` : dimId,
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

  return (
    <div className="space-y-4">
      {/* 1. Header with Disclaimer and Summary */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-bold text-slate-400">신체 부하 추정 맵</span>
          </div>
          <span className="text-[10px] text-slate-400 tracking-tight">
            기록 기반 추정 · 실제 근육 피로 측정값 아님
          </span>
        </div>

        {/* Existing Summary text from bodyLoad SSOT */}
        {bodyLoad?.summary && (
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-medium leading-relaxed">
            {bodyLoad.summary}
          </div>
        )}

        {/* Overall Excluded Same-day Sessions Notice */}
        {safeExcludedCount > 0 && (
          <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <div className="space-y-0.5">
              <span className="font-bold block">시간 불확실 기록 제외 안내</span>
              <p className="text-[11px] text-amber-200/90 leading-tight">
                당일 시간 미지정 기록 {safeExcludedCount}건은 특정 신체 부위에 임의 배정하지 않고 제외했습니다.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Visual Silhouettes & Axial Side Item */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-3.5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center">
          {/* Silhouettes Area: Front and Back Views */}
          <div className="sm:col-span-8 flex items-center justify-center gap-4 sm:gap-8 py-2">
            {/* Front View */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">정면 (Front)</span>
              <svg
                viewBox="0 0 120 180"
                className="w-28 h-40 sm:w-32 sm:h-44 drop-shadow-sm select-none"
                role="img"
                aria-label="신체 정면 부하 시각화 (어깨, 가슴, 앞 허벅지)"
              >
                <title id={`${idPrefix}-front-title`}>신체 정면 부하 실루엣</title>
                <desc id={`${idPrefix}-front-desc`}>
                  어깨: {vPushData.status}, 가슴: {hPushData.status}, 앞 허벅지: {kneeData.status}
                </desc>

                {/* Base Body Contour (Neutral outline) */}
                {/* Head */}
                <circle cx="60" cy="18" r="10" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neck */}
                <path d="M 56 28 L 64 28 L 65 34 L 55 34 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Arms */}
                <path d="M 26 50 L 22 82 L 28 82 L 32 52 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <path d="M 94 50 L 98 82 L 92 82 L 88 52 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Torso Center / Abs */}
                <path d="M 40 58 L 80 58 L 74 90 L 46 90 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Lower Legs */}
                <path d="M 42 130 L 43 166 L 51 166 L 54 130 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <path d="M 78 130 L 77 166 L 69 166 L 66 130 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />

                {/* Active Compartment: Shoulders (vertical-push) */}
                <g data-dimension="vertical-push">
                  {/* Left Shoulder */}
                  <path
                    d="M 38 35 C 30 36 26 42 26 50 C 30 50 36 46 40 42 Z"
                    fill={vPushColor.fill}
                    stroke={vPushColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                  {/* Right Shoulder */}
                  <path
                    d="M 82 35 C 90 36 94 42 94 50 C 90 50 84 46 80 42 Z"
                    fill={vPushColor.fill}
                    stroke={vPushColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>

                {/* Active Compartment: Chest (horizontal-push) */}
                <g data-dimension="horizontal-push">
                  {/* Left Chest */}
                  <path
                    d="M 40 42 C 48 42 58 44 58 58 C 50 59 40 56 38 48 Z"
                    fill={hPushColor.fill}
                    stroke={hPushColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                  {/* Right Chest */}
                  <path
                    d="M 80 42 C 72 42 62 44 62 58 C 70 59 80 56 82 48 Z"
                    fill={hPushColor.fill}
                    stroke={hPushColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>

                {/* Active Compartment: Front Thighs (knee-dominant-lower-body) */}
                <g data-dimension="knee-dominant-lower-body">
                  {/* Left Front Thigh */}
                  <path
                    d="M 44 90 C 40 102 41 122 43 130 C 50 130 54 125 56 90 Z"
                    fill={kneeColor.fill}
                    stroke={kneeColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                  {/* Right Front Thigh */}
                  <path
                    d="M 76 90 C 80 102 79 122 77 130 C 70 130 66 125 64 90 Z"
                    fill={kneeColor.fill}
                    stroke={kneeColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>
              </svg>
            </div>

            {/* Back View */}
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">후면 (Back)</span>
              <svg
                viewBox="0 0 120 180"
                className="w-28 h-40 sm:w-32 sm:h-44 drop-shadow-sm select-none"
                role="img"
                aria-label="신체 후면 부하 시각화 (등 중앙, 등 바깥쪽, 둔부 및 뒤 허벅지)"
              >
                <title id={`${idPrefix}-back-title`}>신체 후면 부하 실루엣</title>
                <desc id={`${idPrefix}-back-desc`}>
                  등 중앙: {hPullData.status}, 등 바깥쪽: {vPullData.status}, 둔부 및 뒤 허벅지: {hipData.status}
                </desc>

                {/* Base Body Contour */}
                {/* Head */}
                <circle cx="60" cy="18" r="10" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neck */}
                <path d="M 56 28 L 64 28 L 66 34 L 54 34 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Arms */}
                <path d="M 26 50 L 22 82 L 28 82 L 32 52 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <path d="M 94 50 L 98 82 L 92 82 L 88 52 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Lower Back */}
                <path d="M 50 64 L 70 64 L 72 82 L 48 82 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                {/* Neutral Calves */}
                <path d="M 42 130 L 43 166 L 51 166 L 54 130 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />
                <path d="M 78 130 L 77 166 L 69 166 L 66 130 Z" fill="#1e293b" stroke="#334155" strokeWidth="1.5" />

                {/* Active Compartment: Mid Back (horizontal-pull) */}
                <g data-dimension="horizontal-pull">
                  <path
                    d="M 48 34 L 72 34 L 68 64 L 52 64 Z"
                    fill={hPullColor.fill}
                    stroke={hPullColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>

                {/* Active Compartment: Outer Back / Lats (vertical-pull) */}
                <g data-dimension="vertical-pull">
                  {/* Left Lat */}
                  <path
                    d="M 38 44 C 44 48 48 56 48 68 C 40 68 36 60 34 52 Z"
                    fill={vPullColor.fill}
                    stroke={vPullColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                  {/* Right Lat */}
                  <path
                    d="M 82 44 C 76 48 72 56 72 68 C 80 68 84 60 86 52 Z"
                    fill={vPullColor.fill}
                    stroke={vPullColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>

                {/* Active Compartment: Glutes & Posterior Thighs (hip-posterior-chain) */}
                <g data-dimension="hip-posterior-chain">
                  {/* Left Glute / Hamstring */}
                  <path
                    d="M 44 84 C 40 98 41 120 43 130 C 50 130 55 125 56 84 Z"
                    fill={hipColor.fill}
                    stroke={hipColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                  {/* Right Glute / Hamstring */}
                  <path
                    d="M 76 84 C 80 98 79 120 77 130 C 70 130 65 125 64 84 Z"
                    fill={hipColor.fill}
                    stroke={hipColor.stroke}
                    strokeWidth="1.5"
                    className="transition-colors duration-200"
                  />
                </g>
              </svg>
            </div>
          </div>

          {/* Side Item: Axial & Systemic Loading (전신·축성 부하) */}
          <div className="sm:col-span-4 flex flex-col justify-center">
            <div
              data-dimension="axial-systemic-loading"
              className={`p-3 rounded-xl border ${axialColor.bg} ${axialColor.border} transition-colors`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-black text-slate-200">
                  전신 및 축성 부하
                </span>
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${axialColor.text} ${axialColor.border}`}>
                  {axialColor.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 font-medium leading-tight">
                척추 축성 압축 및 전신 중추신경계 부담
              </p>
              {axialData.uncertainty.hasUncertainty && (
                <div className="mt-1.5 pt-1 border-t border-slate-700/50 flex items-center gap-1 text-[9px] text-amber-300">
                  <Info className="w-3 h-3 shrink-0" />
                  <span>{axialData.uncertainty.note || '시간 추정 불확실성 포함'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 3. Legend (범례) */}
        <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[10px]">
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

      {/* 4. 7 Canonical Dimensions Breakdown List */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
          움직임 영역별 상세 부하
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {CANONICAL_DIMENSION_CONFIGS.map((config) => {
            const data = getDimensionData(config.id);
            const style = getStatusColor(data.status);
            const hasUncertainty = data.uncertainty.hasUncertainty;

            return (
              <div
                key={config.id}
                data-dimension-card={config.id}
                className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800/60 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-200">{config.movementName}</span>
                      <span className="text-[10px] text-slate-400">({config.regionName})</span>
                    </div>
                    <span className="text-[10px] text-slate-400 block mt-0.5 leading-tight">
                      {config.description}
                    </span>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md border ${style.bg} ${style.border} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </div>

                {/* Coexisting Uncertainty Guidance */}
                {hasUncertainty && (
                  <div className="mt-2 pt-1 border-t border-slate-800/40 flex items-center gap-1 text-[10px] text-amber-300/90 font-medium">
                    <Info className="w-3 h-3 shrink-0 text-amber-400" />
                    <span>{data.uncertainty.note || '시간 추정 불확실성 포함'}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
