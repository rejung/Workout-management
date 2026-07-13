/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Exercise, WorkoutLog, Routine } from '../types';
import { storage } from '../storage/storage';
import { DEFAULT_ROUTINES } from '../constants';

export interface ExerciseWithMetadata extends Exercise {
  pinned: boolean;
  pinOrder: number;
  usageCount: number;
  lastUsed: string;
}

/**
 * Sorts an array of Exercises based on the specified policies:
 * 1. Priority 1: Recommended auxiliary exercises from routines matching the currently active exercises.
 * 2. Regular unadded exercises (sorted by Pinned first, usage frequency, recency, then alphabetical).
 * 3. Priority 2: Already added exercises moved to the absolute bottom (to prevent duplicates).
 */
export function getSortedExercises(
  exercises: Exercise[],
  logs: WorkoutLog[],
  activeExerciseIds: string[] = []
): Exercise[] {
  // 1. Calculate dynamic usageCount and lastUsed from logs
  const usageCountMap: Record<string, number> = {};
  const lastUsedMap: Record<string, string> = {};

  if (Array.isArray(logs)) {
    logs.forEach(log => {
      if (log && Array.isArray(log.exercises)) {
        log.exercises.forEach(session => {
          if (session && session.exerciseId) {
            usageCountMap[session.exerciseId] = (usageCountMap[session.exerciseId] || 0) + 1;
            if (log.date) {
              if (!lastUsedMap[session.exerciseId] || log.date > lastUsedMap[session.exerciseId]) {
                lastUsedMap[session.exerciseId] = log.date;
              }
            }
          }
        });
      }
    });
  }

  // Define Pinned Exercises and their specific relative ordering
  const PINNED_IDS: Record<string, number> = {
    'bench-press': 0,
    'overhead-press': 1,
    'deadlift': 2,
    'squat': 3,
  };

  // 2. Load current routines to check for exercise associations
  const ROUTINES_KEY = 'wms_routines';
  const routines = storage.getItem<Routine[]>(ROUTINES_KEY) || DEFAULT_ROUTINES;

  // Extract recommended auxiliary exercise IDs
  const recommendedIds: string[] = [];
  routines.forEach(r => {
    if (r && Array.isArray(r.exercises) && r.exercises.length > 0) {
      const mainId = r.exercises[0].exerciseId;
      if (activeExerciseIds.includes(mainId)) {
        r.exercises.slice(1).forEach(e => {
          if (e && e.exerciseId && !recommendedIds.includes(e.exerciseId)) {
            recommendedIds.push(e.exerciseId);
          }
        });
      }
    }
  });

  // Helper to determine the priority tier of an exercise ID
  const getTier = (id: string): number => {
    if (activeExerciseIds.includes(id)) {
      return 3; // Priority 2: Already added goes to the absolute bottom
    }
    if (recommendedIds.includes(id)) {
      return 1; // Priority 1: Recommended next exercise
    }
    return 2; // Priority 3: Regular exercise
  };

  // 3. Enrich exercises with metadata for sorting
  const enriched: ExerciseWithMetadata[] = exercises.map(ex => {
    // Determine pinOrder
    let pinOrder = 9999;
    let pinned = false;
    
    if (ex.id in PINNED_IDS) {
      pinned = true;
      pinOrder = PINNED_IDS[ex.id];
    } else {
      // Name fallback just in case IDs differ or user renamed them, or custom exercises are pinned
      const nameLower = ex.name.toLowerCase();
      if (nameLower.includes('벤치프레스') || nameLower.includes('bench press')) {
        pinned = true;
        pinOrder = 0;
      } else if (nameLower.includes('오버헤드') || nameLower.includes('ohp') || nameLower.includes('overhead press')) {
        pinned = true;
        pinOrder = 1;
      } else if (nameLower.includes('데드리프트') || nameLower.includes('deadlift')) {
        pinned = true;
        pinOrder = 2;
      } else if (nameLower.includes('스쿼트') || nameLower.includes('squat')) {
        pinned = true;
        pinOrder = 3;
      }
    }

    return {
      ...ex,
      pinned,
      pinOrder,
      usageCount: usageCountMap[ex.id] || 0,
      lastUsed: lastUsedMap[ex.id] || '',
    };
  });

  // 4. Sort according to the tiered policies
  enriched.sort((a, b) => {
    const tierA = getTier(a.id);
    const tierB = getTier(b.id);

    if (tierA !== tierB) {
      return tierA - tierB;
    }

    // Within Tier 1: Sort by recommendation index sequence
    if (tierA === 1) {
      return recommendedIds.indexOf(a.id) - recommendedIds.indexOf(b.id);
    }

    // Within Tier 2 or Tier 3: Apply standard sorting policies
    // Policy 1: Pinned status
    if (a.pinned !== b.pinned) {
      return a.pinned ? -1 : 1;
    }
    
    // If both are pinned, sort by their defined pinOrder
    if (a.pinned && b.pinned) {
      return a.pinOrder - b.pinOrder;
    }

    // Policy 2: Usage Count (descending)
    if (b.usageCount !== a.usageCount) {
      return b.usageCount - a.usageCount;
    }

    // Secondary Policy: Recency (lastUsed descending)
    if (a.lastUsed !== b.lastUsed) {
      return b.lastUsed.localeCompare(a.lastUsed);
    }

    // Policy 3: Alphabetical order (Korean)
    return a.name.localeCompare(b.name, 'ko');
  });

  // Return sorted plain exercises
  return enriched.map(({ pinned, pinOrder, usageCount, lastUsed, ...ex }) => ex as Exercise);
}

