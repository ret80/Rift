import { useEffect, useState } from "react";

/**
 * Persisted state hook — synchronises React state with localStorage.
 * Replaces inline localStorage boilerplate across the codebase.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? (JSON.parse(saved) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota exceeded or private browsing — silently ignore */
    }
  }, [key, state]);

  return [state, setState];
}
