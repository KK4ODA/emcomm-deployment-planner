import { useCallback, useState } from 'react';

/** useState persisted to localStorage (JSON). Falls back to memory when storage is unavailable. */
export function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? initialValue : JSON.parse(raw);
    } catch {
      return initialValue;
    }
  });
  const set = useCallback((next) => {
    setValue((prev) => {
      const resolved = typeof next === 'function' ? next(prev) : next;
      try { localStorage.setItem(key, JSON.stringify(resolved)); } catch { /* ignore */ }
      return resolved;
    });
  }, [key]);
  return [value, set];
}
