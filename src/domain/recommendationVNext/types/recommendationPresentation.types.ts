/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Recommendation Presentation Types (VNext Sole Production Engine - CU7.0)
 *
 * Single Responsibility:
 * Defines presentation interfaces consumed by the Dashboard and Recommendation UI components.
 * Contains ZERO legacy scoring, factor weights, or fake pending fields.
 */

import { FinalTodayDecision } from './finalTodayDecision.types';
import { NextProjectedSession } from './projectedSession.types';

export type MainLift = '벤치프레스' | 'OHP' | '데드리프트' | '바벨 로우' | '스쿼트' | '러닝' | '휴식' | (string & {});

export type CandidateStatusType = 'preferred' | 'viable' | 'caution' | 'recent' | 'deferred' | 'unsupported';

export interface TopCandidatePresentation {
  readonly lift: MainLift;
  readonly isCurrent: boolean;
  readonly rejectionReason?: string;
  readonly statusLabel?: string;
  readonly statusType?: CandidateStatusType;
}

export interface RecommendationExecutionInfo {
  readonly expectedDuration: string;
  readonly workoutType: string;
  readonly nextUp: string;
  readonly nextTiming: string;
  readonly recoveryDays?: number;
  readonly lastWorkoutDate?: string;
}

export interface RecommendationResult {
  readonly mainLift: MainLift;
  readonly reasons: readonly string[];
  readonly representativeExercises: readonly string[];
  readonly date: string;
  readonly friendlyDate?: string;
  readonly actionChecklist?: readonly string[];
  readonly executionInfo?: RecommendationExecutionInfo;
  readonly oneLineReason?: string;
  readonly topCandidates?: readonly TopCandidatePresentation[];
  readonly vnextDecision?: FinalTodayDecision;
  readonly nextProjectedSession?: NextProjectedSession;
}
