/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId } from 'react';
import {
  BodyLoadPresentation,
  DimensionLoadPresentation,
  BodyLoadDisplayStatus,
} from '../../domain/recommendationVNext/types/recommendationPresentation.types';
import { StressDimension } from '../../domain/recommendationVNext/types/stressModel.types';
import { AlertCircle, Activity } from 'lucide-react';

import {
  BODY_FRONT_VIEW_BOX,
  BODY_BACK_VIEW_BOX,
  BODY_OUTLINE_PATHS,
  FRONT_BODY_PATHS,
  BACK_BODY_PATHS,
  NECK_FINISH_PATHS,
} from './bodyModelPaths';

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
export function BodyLoadMap({ bodyLoad, idPrefix }: BodyLoadMapProps) {
  const autoId = useId();
  const safeAutoId = autoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const effectiveIdPrefix = idPrefix ?? `body-load-${safeAutoId}`;

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

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 1. Header with Disclaimer and Single Summary */}
      <div className="space-y-1.5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-[11px] text-slate-500 font-medium">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="font-bold text-slate-400">신체 부하 추정 맵</span>
          </div>
          <span className="text-[10px] text-slate-400 tracking-tight break-words">
            기록 기반 추정 · 실제 근육 피로 측정값 아님
          </span>
        </div>

        {/* Existing Summary text displayed once */}
        {bodyLoad?.summary && (
          <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs text-slate-300 font-medium leading-relaxed break-words">
            {bodyLoad.summary}
          </div>
        )}

        {/* Overall Excluded Same-day Sessions Notice */}
        {safeExcludedCount > 0 && (
          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs break-words">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" />
            <span className="text-[11px] text-amber-200/90 leading-tight break-words">
              당일 시간 미지정 기록 {safeExcludedCount}건 제외 (신체 부위 미배정)
            </span>
          </div>
        )}
      </div>

      {/* 2. Visual Section: Connected Silhouettes & Single Axial Side Item */}
      <div className="bg-slate-950/40 border border-slate-800/80 rounded-xl p-2.5 sm:p-4 space-y-3">
        {/* Silhouettes: Prominently sized Front & Back */}
        <div className="flex items-center justify-around gap-2 sm:gap-6 py-2">
          {/* Front View */}
          <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[150px]">
            <span className="text-xs font-bold text-slate-300">정면</span>
            <svg
              viewBox={BODY_FRONT_VIEW_BOX}
              className="w-full h-auto drop-shadow-sm select-none"
              role="img"
              aria-labelledby={`${effectiveIdPrefix}-front-title ${effectiveIdPrefix}-front-desc`}
            >
              <title id={`${effectiveIdPrefix}-front-title`}>신체 정면 부하 실루엣</title>
              <desc id={`${effectiveIdPrefix}-front-desc`}>
                어깨: {vPushData.status}, 가슴: {hPushData.status}, 앞 허벅지: {kneeData.status}
              </desc>

              {/* Unique ClipPath for clean headless neck cutoff */}
              <defs>
                <clipPath id={`${effectiveIdPrefix}-neck-clip-front`}>
                  <path d={NECK_FINISH_PATHS.frontClip} />
                </clipPath>
              </defs>

              {/* Headless Body Silhouette Group */}
              <g clipPath={`url(#${effectiveIdPrefix}-neck-clip-front)`}>
                {/* Continuous Base Body Silhouette */}
                <path
                  d={BODY_OUTLINE_PATHS.front}
                  fill="#1e293b"
                  stroke="#334155"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Neutral Non-Targeted Muscles (Calves, Arms, Core, etc.) */}
                <g fill="#1e293b" stroke="#334155" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
                  {FRONT_BODY_PATHS.neutral.map((d, idx) => (
                    <path key={`front-neutral-${idx}`} d={d} />
                  ))}
                </g>

                {/* Active Zone: Shoulders (vertical-push) */}
                <g data-dimension="vertical-push" fill={vPushColor.fill} stroke={vPushColor.stroke}>
                  {FRONT_BODY_PATHS.verticalPush.map((d, idx) => (
                    <path
                      key={`v-push-${idx}`}
                      fill={vPushColor.fill}
                      stroke={vPushColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Active Zone: Chest (horizontal-push) */}
                <g data-dimension="horizontal-push" fill={hPushColor.fill} stroke={hPushColor.stroke}>
                  {FRONT_BODY_PATHS.horizontalPush.map((d, idx) => (
                    <path
                      key={`h-push-${idx}`}
                      fill={hPushColor.fill}
                      stroke={hPushColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Active Zone: Front Thighs (knee-dominant-lower-body) */}
                <g data-dimension="knee-dominant-lower-body" fill={kneeColor.fill} stroke={kneeColor.stroke}>
                  {FRONT_BODY_PATHS.kneeDominant.map((d, idx) => (
                    <path
                      key={`knee-${idx}`}
                      fill={kneeColor.fill}
                      stroke={kneeColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Outer boundary stroke for crisp silhouette finish */}
                <path
                  d={BODY_OUTLINE_PATHS.front}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>

              {/* Smooth curved collar cap at the top of the neck */}
              <path
                data-testid="neck-finish-front"
                d={NECK_FINISH_PATHS.frontCap}
                fill="none"
                stroke="#475569"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>

          {/* Back View */}
          <div className="flex flex-col items-center gap-1.5 flex-1 max-w-[150px]">
            <span className="text-xs font-bold text-slate-300">후면</span>
            <svg
              viewBox={BODY_BACK_VIEW_BOX}
              className="w-full h-auto drop-shadow-sm select-none"
              role="img"
              aria-labelledby={`${effectiveIdPrefix}-back-title ${effectiveIdPrefix}-back-desc`}
            >
              <title id={`${effectiveIdPrefix}-back-title`}>신체 후면 부하 실루엣</title>
              <desc id={`${effectiveIdPrefix}-back-desc`}>
                등 중앙: {hPullData.status}, 등 바깥쪽: {vPullData.status}, 둔부 및 뒤 허벅지: {hipData.status}
              </desc>

              {/* Unique ClipPath for clean headless neck cutoff */}
              <defs>
                <clipPath id={`${effectiveIdPrefix}-neck-clip-back`}>
                  <path d={NECK_FINISH_PATHS.backClip} />
                </clipPath>
              </defs>

              {/* Headless Body Silhouette Group */}
              <g clipPath={`url(#${effectiveIdPrefix}-neck-clip-back)`}>
                {/* Continuous Base Body Silhouette */}
                <path
                  d={BODY_OUTLINE_PATHS.back}
                  fill="#1e293b"
                  stroke="#334155"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {/* Neutral Non-Targeted Muscles (Spine, Neck, Arms, Calves, etc.) */}
                <g fill="#1e293b" stroke="#334155" strokeWidth="1" strokeLinejoin="round" strokeLinecap="round">
                  {BACK_BODY_PATHS.neutral.map((d, idx) => (
                    <path key={`back-neutral-${idx}`} d={d} />
                  ))}
                </g>

                {/* Active Zone: Mid Back (horizontal-pull: trapezius + upper-back mid) */}
                <g data-dimension="horizontal-pull" fill={hPullColor.fill} stroke={hPullColor.stroke}>
                  {BACK_BODY_PATHS.horizontalPull.map((d, idx) => (
                    <path
                      key={`h-pull-${idx}`}
                      fill={hPullColor.fill}
                      stroke={hPullColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Active Zone: Outer Back / Lats (vertical-pull: lats) */}
                <g data-dimension="vertical-pull" fill={vPullColor.fill} stroke={vPullColor.stroke}>
                  {BACK_BODY_PATHS.verticalPull.map((d, idx) => (
                    <path
                      key={`v-pull-${idx}`}
                      fill={vPullColor.fill}
                      stroke={vPullColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Active Zone: Glutes & Posterior Thighs (hip-posterior-chain: gluteal + hamstring) */}
                <g data-dimension="hip-posterior-chain" fill={hipColor.fill} stroke={hipColor.stroke}>
                  {BACK_BODY_PATHS.hipPosteriorChain.map((d, idx) => (
                    <path
                      key={`hip-${idx}`}
                      fill={hipColor.fill}
                      stroke={hipColor.stroke}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      className="transition-colors duration-200"
                      d={d}
                    />
                  ))}
                </g>

                {/* Outer boundary stroke for crisp silhouette finish */}
                <path
                  d={BODY_OUTLINE_PATHS.back}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </g>

              {/* Smooth curved collar cap at the top of the neck */}
              <path
                data-testid="neck-finish-back"
                d={NECK_FINISH_PATHS.backCap}
                fill="none"
                stroke="#475569"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </div>

        {/* Separate Single Item: Axial & Systemic Loading (Displayed once only) */}
        <div
          data-dimension="axial-systemic-loading"
          className={`p-2.5 rounded-lg border ${axialColor.bg} ${axialColor.border} flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 transition-colors`}
        >
          <div className="space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
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
            <span className="text-[10px] text-amber-300 font-medium break-words leading-tight">
              ({axialData.uncertainty.note || '불확실성 포함'})
            </span>
          )}
        </div>

        {/* Legend (범례) */}
        <div className="pt-2 border-t border-slate-800/60 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px]">
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
                className="flex flex-col gap-1 py-1.5 px-2.5 rounded-lg bg-slate-900/60 border border-slate-800/60"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-200">{config.movementName}</span>
                  <span
                    className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded border ${style.bg} ${style.border} ${style.text}`}
                  >
                    {style.label}
                  </span>
                </div>
                {hasUncertainty && (
                  <span className="text-[10px] text-amber-300 font-medium break-words leading-tight">
                    ({data.uncertainty.note || '불확실성 포함'})
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
