/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { storage } from './storage';
import { GoalSettings } from '../types/goal';
import { DEFAULT_GOAL_SETTINGS } from '../constants/goalDefaults';

const GOAL_SETTINGS_KEY = 'wms_goal_settings';

export const goalRepository = {
  /**
   * Initializes goal settings if not already present in storage.
   */
  initializeGoalSettings(): GoalSettings {
    const existing = storage.getItem<GoalSettings>(GOAL_SETTINGS_KEY);
    if (!existing) {
      storage.setItem(GOAL_SETTINGS_KEY, DEFAULT_GOAL_SETTINGS);
      return DEFAULT_GOAL_SETTINGS;
    }
    return existing;
  },

  /**
   * Retrieves the current goal settings.
   */
  getGoalSettings(): GoalSettings {
    const existing = storage.getItem<GoalSettings>(GOAL_SETTINGS_KEY);
    if (!existing) {
      return this.initializeGoalSettings();
    }
    return existing;
  },

  /**
   * Saves and overwrites the current goal settings.
   */
  saveGoalSettings(settings: GoalSettings): void {
    storage.setItem(GOAL_SETTINGS_KEY, settings);
  },

  /**
   * Resets the goal settings back to default.
   */
  resetGoalSettings(): GoalSettings {
    storage.setItem(GOAL_SETTINGS_KEY, DEFAULT_GOAL_SETTINGS);
    return DEFAULT_GOAL_SETTINGS;
  }
};
