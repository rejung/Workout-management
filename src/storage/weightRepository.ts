/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from './storage';
import { WeightLog, generateUUID } from '../utils/workoutEngine';
import { isMockWeightLogId } from '../constants/mockData';

const WEIGHT_LOGS_KEY = 'wms_weight_logs';

export const weightRepository = {
  /**
   * Initializes the repository by running data migrations, verifying data integrity
   * against the canonical weight logs dataset, and filtering out mock records.
   * Keeps getters and readers completely pure.
   */
  initialize(): void {
    let logs = storage.getItem<WeightLog[]>(WEIGHT_LOGS_KEY);
    if (!logs || !Array.isArray(logs)) {
      logs = [];
      storage.setItem(WEIGHT_LOGS_KEY, logs);
    }

    let logsChanged = false;

    // 1. Correct and restore weight logs timezone-safely from their IDs (the absolute source of truth)
    const weightRestoredKeyV5 = 'wms_weight_logs_restored_v5';
    
    const subtractOneDay = (dateStr: string): string => {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10);
        const d = parseInt(parts[2], 10);
        const dateObj = new Date(y, m - 1, d);
        dateObj.setDate(dateObj.getDate() - 1);
        
        const ny = dateObj.getFullYear();
        const nm = String(dateObj.getMonth() + 1).padStart(2, '0');
        const nd = String(dateObj.getDate()).padStart(2, '0');
        return `${ny}-${nm}-${nd}`;
      }
      return dateStr;
    };

    if (localStorage.getItem(weightRestoredKeyV5) !== 'true') {
      logs = logs.map(wLog => {
        if (wLog && wLog.id && typeof wLog.id === 'string') {
          if (wLog.id.startsWith('wlog-v1-')) {
            const match = wLog.id.match(/wlog-v1-(\d{4}-\d{2}-\d{2})/);
            if (match && match[1]) {
              const originalDate = match[1];
              if (wLog.date !== originalDate) {
                logsChanged = true;
                return {
                  ...wLog,
                  date: originalDate
                };
              }
            }
          } else {
            // For manual/quick-input weight logs that were shifted by previous timezone hacks, shift them back by -1 day
            if (localStorage.getItem('wms_weight_logs_timezone_fixed_v4') === 'true') {
              logsChanged = true;
              const originalDate = wLog.date;
              const restoredDate = subtractOneDay(originalDate);
              
              let newId = wLog.id;
              if (wLog.id.includes(originalDate)) {
                newId = wLog.id.replace(originalDate, restoredDate);
              }
              return {
                ...wLog,
                id: newId,
                date: restoredDate
              };
            }
          }
        }
        return wLog;
      });
      localStorage.setItem(weightRestoredKeyV5, 'true');
    }

    // 2. Ensuring pure initialization for public release without pre-populated canonical datasets.
    // (Removed canonicalWeights auto-injection)

    // 3. Filter out default mock weights (preserving migrated + user created weight logs)
    const filteredWeightLogs = logs.filter(wLog => !isMockWeightLogId(wLog.id));
    if (filteredWeightLogs.length !== logs.length) {
      logs = filteredWeightLogs;
      logsChanged = true;
    }

    if (logsChanged) {
      logs.sort((a, b) => b.date.localeCompare(a.date));
      this.saveWeightLogs(logs);
    }
  },

  /**
   * Fetches all weight logs. Seeds empty logs if empty.
   * Pure reader with no side-effects or inline database updates.
   */
  getWeightLogs(): WeightLog[] {
    const logs = storage.getItem<WeightLog[]>(WEIGHT_LOGS_KEY);
    if (logs && Array.isArray(logs)) {
      return logs;
    }
    return [];
  },

  /**
   * Saves/overwrites all weight logs.
   */
  saveWeightLogs(logs: WeightLog[]): void {
    storage.setItem(WEIGHT_LOGS_KEY, logs);
  },

  /**
   * Adds or updates a single weight log for a specific date, maintaining chronological descending sort.
   */
  saveWeightLog(date: string, weight: number): WeightLog[] {
    const logs = this.getWeightLogs();
    const cleanDate = date.trim();
    
    // Prevent duplicate logs for the same day (overwrite if exists, otherwise append)
    const filtered = logs.filter(w => w.date !== cleanDate);
    
    const newLog: WeightLog = {
      id: generateUUID(),
      date: cleanDate,
      weight: Number(weight.toFixed(1))
    };

    const updated = [newLog, ...filtered].sort((a, b) => b.date.localeCompare(a.date));
    this.saveWeightLogs(updated);
    return updated;
  },

  /**
   * Deletes a weight log by id.
   */
  deleteWeightLog(id: string): WeightLog[] {
    const logs = this.getWeightLogs();
    const updated = logs.filter(w => w.id !== id);
    this.saveWeightLogs(updated);
    return updated;
  },

  /**
   * Clears weight logs from storage.
   */
  clearAll(): void {
    storage.removeItem(WEIGHT_LOGS_KEY);
  }
};
