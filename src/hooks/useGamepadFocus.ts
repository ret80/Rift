/**
 * useGamepadFocus — управление фокусом для навигации геймпадом.
 *
 * Поддерживает список интерактивных элементов. D-pad up/down + левый стик y
 * → перемещение фокуса вверх/вниз. D-pad left/right + левый стик x →
 * перемещение фокуса влево/вправо (для вкладок/страниц).
 *
 * Хук не знает о конкретном экране: экран сам решает, что делать при
 * подтверждении, и регистрирует обработчики в общем `gamepadNavRef`.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type GamepadDirection = "up" | "down" | "left" | "right";

export interface UseGamepadFocusOptions {
  /** Начальный индекс фокуса. */
  initialIndex?: number;
  /** Количество элементов в списке. */
  count: number;
  /** Глубина списка (для multi-column навигации). По умолчанию 1. */
  depth?: number;
  /** Зацикливать навигацию. По умолчанию true. */
  wrap?: boolean;
}

export interface UseGamepadFocusReturn {
  /** Текущий индекс фокуса. */
  focusIndex: number;
  /** Установить индекс фокуса. */
  setFocusIndex: (index: number) => void;
  /** Направление навигации: "up" | "down" | "left" | "right" | null. */
  focusDir: GamepadDirection | null;
  /** Обработчик навигации вверх. */
  onNavUp: () => void;
  /** Обработчик навигации вниз. */
  onNavDown: () => void;
  /** Обработчик навигации влево. */
  onNavLeft: () => void;
  /** Обработчик навигации вправо. */
  onNavRight: () => void;
  /** Есть ли элементы для навигации. */
  focused: boolean;
}

export function useGamepadFocus(
  options: UseGamepadFocusOptions,
): UseGamepadFocusReturn {
  const { initialIndex = 0, count, depth = 1, wrap = true } = options;
  const [focusIndex, setFocusIndex] = useState(initialIndex);
  const [focusDir, setFocusDir] = useState<GamepadDirection | null>(null);
  const dirTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Если список изменился (например, после покупки), не выходим за границы.
  useEffect(() => {
    setFocusIndex((prev) => {
      if (count <= 0) return 0;
      return Math.max(0, Math.min(prev, count - 1));
    });
  }, [count]);

  // Сбрасываем таймер визуальной обратной связи при размонтировании.
  useEffect(() => {
    return () => {
      if (dirTimeoutRef.current) clearTimeout(dirTimeoutRef.current);
    };
  }, []);

  /** Сбросить направление через 300мс (визуальная обратная связь). */
  const clearFocusDir = useCallback(() => {
    if (dirTimeoutRef.current) {
      clearTimeout(dirTimeoutRef.current);
    }
    dirTimeoutRef.current = setTimeout(() => {
      setFocusDir(null);
    }, 300);
  }, []);

  /** Переместить фокус на N позиций. */
  const moveFocus = useCallback(
    (delta: number) => {
      setFocusIndex((prev) => {
        if (count <= 0) return 0;
        const raw = prev + delta;
        if (wrap) return ((raw % count) + count) % count;
        return Math.max(0, Math.min(raw, count - 1));
      });
    },
    [count, wrap],
  );

  const onNavUp = useCallback(() => {
    moveFocus(-1);
    setFocusDir("up");
    clearFocusDir();
  }, [moveFocus, clearFocusDir]);

  const onNavDown = useCallback(() => {
    moveFocus(1);
    setFocusDir("down");
    clearFocusDir();
  }, [moveFocus, clearFocusDir]);

  const onNavLeft = useCallback(() => {
    if (depth > 1) moveFocus(-depth);
    setFocusDir("left");
    clearFocusDir();
  }, [moveFocus, clearFocusDir, depth]);

  const onNavRight = useCallback(() => {
    if (depth > 1) moveFocus(depth);
    setFocusDir("right");
    clearFocusDir();
  }, [moveFocus, clearFocusDir, depth]);

  return {
    focusIndex,
    setFocusIndex,
    focusDir,
    onNavUp,
    onNavDown,
    onNavLeft,
    onNavRight,
    focused: count > 0,
  };
}
