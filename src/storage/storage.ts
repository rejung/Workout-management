/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// In-memory fallback for Node/CLI environment
const memoryStorage = new Map<string, string>();

export interface StorageBackend {
  getItem: (k: string) => string | null;
  setItem: (k: string, v: string) => void;
  removeItem: (k: string) => void;
  clear: () => void;
}

let customStoreProvider: (() => StorageBackend) | null = null;

function getStore(): StorageBackend {
  if (customStoreProvider) {
    return customStoreProvider();
  }
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
  setStoreProvider(provider: (() => StorageBackend) | null): void {
    customStoreProvider = provider;
  },

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

  getRawItem(key: string): string | null {
    try {
      const store = getStore();
      return store.getItem(key);
    } catch (error) {
      console.error(`Error reading raw key "${key}" from storage:`, error);
      throw error;
    }
  },

  setRawItem(key: string, value: string): void {
    try {
      const store = getStore();
      store.setItem(key, value);
    } catch (error) {
      console.error(`Error writing raw key "${key}" to storage:`, error);
      throw error;
    }
  },

  setItem<T>(key: string, value: T): void {
    try {
      const store = getStore();
      store.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Error writing key "${key}" to localStorage:`, error);
      throw error;
    }
  },

  removeItem(key: string): void {
    try {
      const store = getStore();
      store.removeItem(key);
    } catch (error) {
      console.error(`Error removing key "${key}" from localStorage:`, error);
      throw error;
    }
  },

  clear(): void {
    try {
      const store = getStore();
      store.clear();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
      throw error;
    }
  }
};
