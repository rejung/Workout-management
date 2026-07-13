/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { GoalSettings } from '../types/goal';
import { goalRepository } from '../storage/goalRepository';
import { getThreeLiftGoal } from '../utils/goalSelectors';

export function useGoalSettings() {
  // Initialize from storage safely
  const [savedSettings, setSavedSettings] = useState<GoalSettings>(() => {
    return goalRepository.getGoalSettings();
  });

  const [draftSettings, setDraftSettings] = useState<GoalSettings>(() => {
    return goalRepository.getGoalSettings();
  });

  // Listen for storage changes from other component instances using custom events
  useEffect(() => {
    const handleUpdate = () => {
      const current = goalRepository.getGoalSettings();
      setSavedSettings(current);
      setDraftSettings(current);
    };

    window.addEventListener('wms-goals-updated', handleUpdate);
    return () => {
      window.removeEventListener('wms-goals-updated', handleUpdate);
    };
  }, []);

  // Compute 3-lift goal dynamically from the current draft settings
  const threeLiftGoal = useMemo(() => {
    return getThreeLiftGoal(draftSettings);
  }, [draftSettings]);

  // Simple dirty check
  const isDirty = useMemo(() => {
    return (
      draftSettings.weightGoal !== savedSettings.weightGoal ||
      draftSettings.benchGoal !== savedSettings.benchGoal ||
      draftSettings.ohpGoal !== savedSettings.ohpGoal ||
      draftSettings.squatGoal !== savedSettings.squatGoal ||
      draftSettings.deadliftGoal !== savedSettings.deadliftGoal
    );
  }, [draftSettings, savedSettings]);

  // Validate the inputs based on user's specific rules:
  // - weightGoal: 30 ~ 300, float/decimals allowed
  // - exercises: 0 ~ 1000, integers only, no negative, no empty, no NaN
  const validationErrors = useMemo(() => {
    const errors: Partial<Record<keyof GoalSettings, string>> = {};

    // Validate weightGoal
    const wVal = draftSettings.weightGoal;
    if (wVal === undefined || wVal === null || isNaN(wVal)) {
      errors.weightGoal = '체중 목표를 입력하세요.';
    } else if (wVal < 30 || wVal > 300) {
      errors.weightGoal = '30~300kg 사이로 입력하세요.';
    }

    // Validate exercise goals
    const validateExercise = (key: keyof GoalSettings, label: string) => {
      const val = draftSettings[key];
      if (val === undefined || val === null || isNaN(val)) {
        errors[key] = `${label} 목표를 입력하세요.`;
      } else if (val < 0 || val > 1000) {
        errors[key] = '0~1000kg 사이의 정수를 입력하세요.';
      } else if (!Number.isInteger(val)) {
        errors[key] = '소수점 없는 정수를 입력하세요.';
      }
    };

    validateExercise('benchGoal', '벤치프레스');
    validateExercise('ohpGoal', 'OHP');
    validateExercise('squatGoal', '스쿼트');
    validateExercise('deadliftGoal', '데드리프트');

    return errors;
  }, [draftSettings]);

  const hasErrors = Object.keys(validationErrors).length > 0;

  const updateGoal = (key: keyof GoalSettings, value: number) => {
    setDraftSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const saveGoals = (): boolean => {
    if (hasErrors) return false;
    goalRepository.saveGoalSettings(draftSettings);
    window.dispatchEvent(new Event('wms-goals-updated'));
    return true;
  };

  const resetGoals = (): void => {
    const defaults = goalRepository.resetGoalSettings();
    setSavedSettings(defaults);
    setDraftSettings(defaults);
    window.dispatchEvent(new Event('wms-goals-updated'));
  };

  return {
    goalSettings: draftSettings, // Current draft / editable values
    savedSettings,               // Persisted goal settings
    threeLiftGoal,
    updateGoal,
    saveGoals,
    resetGoals,
    isDirty: isDirty && !hasErrors, // True if modified and passing validations
    validationErrors,
    hasErrors
  };
}
