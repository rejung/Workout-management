/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// In-memory fallback for Node/CLI environment
const memoryStorage = new Map<string, string>();

function getStore(): { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void; removeItem: (k: string) => void; clear: () => void } {
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    return window.localStorage;
  }
  return {
    getItem: (key: string) => memoryStorage.get(key) || null,
    setItem: (key: string, val: string) => { memoryStorage.set(key, val); },
    removeItem: (key: string) => { memoryStorage.delete(key); },
    clear: () => { memoryStorage.clear(); }
  };
}

/**
 * Storage Engine to interact with localStorage in a type-safe and safe manner.
 */
export const storage = {
  getItem<T>(key: string): T | null {
    try {
      const store = getStore();
      const item = store.getItem(key);
      return item ? (JSON.parse(item) as T) : null;
    } catch (error) {
      console.error(`Error reading key "${key}" from localStorage:`, error);
      return null;
    }
  },

  setItem<T>(key: string, value: T): void {
    try {
      const store = getStore();
      store.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing key "${key}" to localStorage:`, error);
    }
  },

  removeItem(key: string): void {
    try {
      const store = getStore();
      store.removeItem(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error);
    }
  },

  clear(): void {
    try {
      const store = getStore();
      store.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
  }
};
