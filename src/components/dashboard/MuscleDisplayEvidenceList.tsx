/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  MuscleInvolvementRole,
  MuscleRegionId,
} from '../../domain/recommendationVNext/types/exerciseMusculoskeletalProfile.types';
import {
  MuscleDisplayEvidenceResult,
  MuscleRegionDisplayEvidence,
  MuscleRegionEvidenceItem,
} from '../../domain/recommendationVNext/types/muscleDisplayEvidence.types';
import { getStatusColor } from './BodyLoadMap';

export interface MuscleDisplayEvidenceListProps {
  readonly muscleDisplayEvidence?: MuscleDisplayEvidenceResult;
  readonly idPrefix?: string;
  /** Optional initial expanded region IDs (only applies to regions that have non-empty evidence) */
  readonly defaultExpandedRegionIds?: readonly MuscleRegionId[];
}

/**
 * Translates anatomical involvement role to natural Korean label.
 */
export function formatMuscleInvolvementRole(role: MuscleInvolvementRole): string {
  switch (role) {
    case 'primary-target':
      return '주된 대상';
    case 'synergist':
      return '협력';
    case 'stabilizer':
      return '자세 유지';
  }
}

function formatConfirmedWindowLabel(item: MuscleRegionEvidenceItem): string {
  switch (item.temporalState) {
    case 'immediate':
      return '24시간 이내';
    case 'residual':
      return '24~72시간';
    case 'historical':
      return '72시간 이상 경과';
    default:
      return '';
  }
}

function formatUncertaintyTypeLabel(item: MuscleRegionEvidenceItem): string {
  if (item.temporalState === 'uncertain') {
    return '당일 시간 미지정';
  }
  if (item.temporalState === 'bracket') {
    return '24h/72h 경계 불확실';
  }
  return '시점 불확실';
}

function formatRecordDateLabel(item: MuscleRegionEvidenceItem): string {
  const trimmedTime = item.startTime?.trim();
  return trimmedTime ? `${item.date} ${trimmedTime}` : item.date;
}

interface EvidenceEntryRowProps {
  readonly key?: React.Key;
  readonly item: MuscleRegionEvidenceItem;
  readonly variant: 'confirmed' | 'uncertain';
}

function EvidenceEntryRow({ item, variant }: EvidenceEntryRowProps) {
  const exerciseLabel = item.sourceExerciseName || item.canonicalExerciseName;
  const dateLabel = formatRecordDateLabel(item);
  const roleLabel = formatMuscleInvolvementRole(item.role);
  const temporalLabel =
    variant === 'confirmed'
      ? formatConfirmedWindowLabel(item)
      : formatUncertaintyTypeLabel(item);

  return (
    <li className="min-w-0 space-y-0.5 py-1 first:pt-0 last:pb-0">
      <div className="min-w-0 text-xs font-medium text-slate-200 break-words [overflow-wrap:anywhere] leading-snug">
        {exerciseLabel}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-400 tabular-nums leading-tight min-w-0 break-words">
        <span>{dateLabel}</span>
        <span aria-hidden="true" className="text-slate-600">
          ·
        </span>
        <span className="text-slate-300">{roleLabel}</span>
        {temporalLabel && (
          <>
            <span aria-hidden="true" className="text-slate-600">
              ·
            </span>
            <span className={variant === 'uncertain' ? 'text-amber-300/90' : 'text-slate-400'}>
              {temporalLabel}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

interface MuscleRegionRowProps {
  readonly key?: React.Key;
  readonly region: MuscleRegionDisplayEvidence;
  readonly isExpanded: boolean;
  readonly onToggle: (regionId: MuscleRegionId) => void;
  readonly idPrefix: string;
  readonly isSubItem?: boolean;
}

function MuscleRegionRow({
  region,
  isExpanded,
  onToggle,
  idPrefix,
  isSubItem = false,
}: MuscleRegionRowProps) {
  const statusStyle = getStatusColor(region.status);
  const hasEvidence = region.evidence.length > 0;
  const buttonId = `${idPrefix}-${region.regionId}-btn`;
  const panelId = `${idPrefix}-${region.regionId}-panel`;

  const confirmedItems: MuscleRegionEvidenceItem[] = [
    ...region.immediateEvidence,
    ...region.residualEvidence,
    ...region.historicalEvidence,
  ];
  const uncertainItems: MuscleRegionEvidenceItem[] = [
    ...region.uncertainEvidence,
    ...region.bracketEvidence,
  ];

  const rowPaddingClass = isSubItem ? 'pl-5 pr-3 py-2.5' : 'px-3 py-2.5';

  if (!hasEvidence) {
    return (
      <div
        data-muscle-region={region.regionId}
        className={`flex items-center justify-between gap-2 min-w-0 min-h-[40px] ${rowPaddingClass}`}
      >
        <span className="min-w-0 flex-1 text-xs font-medium text-slate-200 break-words leading-snug">
          {region.koreanName}
        </span>
        <span className={`shrink-0 text-[11px] font-semibold whitespace-nowrap ${statusStyle.text}`}>
          {region.status}
        </span>
      </div>
    );
  }

  return (
    <div data-muscle-region={region.regionId} className="min-w-0">
      <button
        id={buttonId}
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        onClick={() => onToggle(region.regionId)}
        className={`w-full min-h-[40px] flex items-center justify-between gap-2 min-w-0 text-left hover:bg-slate-800/35 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 ${rowPaddingClass}`}
      >
        <span className="min-w-0 flex-1 text-xs font-medium text-slate-200 break-words leading-snug">
          {region.koreanName}
        </span>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className={`text-[11px] font-semibold whitespace-nowrap ${statusStyle.text}`}>
            {region.status}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
          )}
        </span>
      </button>

      {isExpanded && (
        <div
          id={panelId}
          role="region"
          aria-labelledby={buttonId}
          data-muscle-detail={region.regionId}
          className={`min-w-0 bg-slate-950/60 border-t border-slate-800/60 space-y-2.5 ${
            isSubItem ? 'pl-5 pr-3 py-2.5' : 'px-3 py-2.5'
          }`}
        >
          {confirmedItems.length > 0 && (
            <div data-evidence-section="confirmed" className="min-w-0 space-y-1">
              <div className="text-[11px] font-semibold text-slate-300">확정 근거</div>
              <ul className="min-w-0 divide-y divide-slate-800/50">
                {confirmedItems.map((item, idx) => (
                  <EvidenceEntryRow
                    key={`${item.sourceLogId}-${item.sourceExerciseId}-${idx}`}
                    item={item}
                    variant="confirmed"
                  />
                ))}
              </ul>
            </div>
          )}

          {uncertainItems.length > 0 && (
            <div
              data-evidence-section="uncertain"
              className={`min-w-0 space-y-1 ${
                confirmedItems.length > 0 ? 'pt-2 border-t border-slate-800/60' : ''
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 min-w-0">
                <span className="text-[11px] font-semibold text-amber-300">불확실 근거</span>
                {region.uncertainty.note && (
                  <span className="text-[11px] text-amber-200/80 break-words leading-snug">
                    · {region.uncertainty.note}
                  </span>
                )}
              </div>
              <ul className="min-w-0 divide-y divide-slate-800/50">
                {uncertainItems.map((item, idx) => (
                  <EvidenceEntryRow
                    key={`${item.sourceLogId}-${item.sourceExerciseId}-unc-${idx}`}
                    item={item}
                    variant="uncertain"
                  />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Pure presentational text-list view for per-muscle display evidence.
 * Reads RecommendationResult.muscleDisplayEvidence verbatim without
 * querying storage or recalculating timestamps, states, or recommendations.
 */
export function MuscleDisplayEvidenceList({
  muscleDisplayEvidence,
  idPrefix,
  defaultExpandedRegionIds,
}: MuscleDisplayEvidenceListProps) {
  const autoId = useId();
  const safeAutoId = autoId.replace(/[^a-zA-Z0-9_-]/g, '');
  const effectiveIdPrefix = idPrefix ?? `muscle-evidence-${safeAutoId}`;

  const [expandedRegions, setExpandedRegions] = useState<ReadonlySet<MuscleRegionId>>(
    () => new Set(defaultExpandedRegionIds ?? [])
  );

  if (
    !muscleDisplayEvidence ||
    !Array.isArray(muscleDisplayEvidence.displayGroups) ||
    muscleDisplayEvidence.displayGroups.length === 0
  ) {
    return null;
  }

  const handleToggleRegion = (regionId: MuscleRegionId) => {
    setExpandedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  };

  return (
    <section
      data-testid="muscle-display-evidence-list"
      aria-labelledby={`${effectiveIdPrefix}-heading`}
      className="min-w-0 space-y-2"
    >
      <div className="min-w-0 space-y-1">
        <h4
          id={`${effectiveIdPrefix}-heading`}
          className="text-xs font-bold text-slate-300 tracking-tight"
        >
          근육별 기록 근거
        </h4>
        {muscleDisplayEvidence.interpretationScopeNotice && (
          <p
            data-testid="muscle-evidence-scope-notice"
            className="text-[11px] text-slate-400 leading-relaxed break-words"
          >
            {muscleDisplayEvidence.interpretationScopeNotice}
          </p>
        )}
      </div>

      <div className="min-w-0 rounded-lg border border-slate-800/70 bg-slate-900/40 divide-y divide-slate-800/60 overflow-hidden">
        {muscleDisplayEvidence.displayGroups.map((group) => {
          const isMultiRegionGroup = group.regions.length > 1;

          if (!isMultiRegionGroup) {
            const onlyRegion = group.regions[0];
            if (!onlyRegion) return null;
            return (
              <div key={group.groupId} data-muscle-group={group.groupId} className="min-w-0">
                <MuscleRegionRow
                  region={onlyRegion}
                  isExpanded={expandedRegions.has(onlyRegion.regionId)}
                  onToggle={handleToggleRegion}
                  idPrefix={effectiveIdPrefix}
                />
              </div>
            );
          }

          return (
            <div key={group.groupId} data-muscle-group={group.groupId} className="min-w-0">
              <div
                data-muscle-group-header={group.groupId}
                className="px-3 pt-2.5 pb-1 text-[11px] font-semibold text-slate-400 break-words"
              >
                {group.koreanName}
              </div>
              <div className="min-w-0 divide-y divide-slate-800/40">
                {group.regions.map((region) => (
                  <MuscleRegionRow
                    key={region.regionId}
                    region={region}
                    isExpanded={expandedRegions.has(region.regionId)}
                    onToggle={handleToggleRegion}
                    idPrefix={effectiveIdPrefix}
                    isSubItem
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
