/**
 * useGamepadFocus — управление фокусом для навигации геймпадом.
 *
 * Поддерживает список интерактивных элементов. D-pad up/down + левый стик y
 * → перемещение фокуса вверх/вниз. D-pad left/right + левый стик x →
 * перемещение фокуса влево/вправо (для вкладок/страниц).
 *
 * Подключает внешние обработчики навигации (из App.tsx через ScreenRouter)
 * к внутреннему перемещению фокуса через connectNav().
 */

import { useState, useCallback, useRef } from "react";

export interface UseGamepadFocusOptions {
  /** Начальный индекс фокуса. */
  initialIndex?: number;
  /** Количество элементов в списке. */
  count: number;
  /** Глубина списка (для multi-column навигации). По умолчанию 1. */
  depth?: number;
}

export interface UseGamepadFocusReturn {
  /** Текущий индекс фокуса. */
  focusIndex: number;
  /** Установить индекс фокуса. */
  setFocusIndex: (index: number) => void;
  /** Направление навигации: "up" | "down" | "left" | "right" | null. */
  focusDir: "up" | "down" | "left" | "right" | null;
  /** Обработчик навигации вверх. */
  onNavUp: () => void;
  /** Обработчик навигации вниз. */
  onNavDown: () => void;
  /** Обработчик навигации влево. */
  onNavLeft: () => void;
  /** Обработчик навигации вправо. */
  onNavRight: () => void;
  /** Есть ли фокус (true когда геймпад подключён и экран активен). */
  focused: boolean;
  /**
   * Подключить внешние обработчики навигации из App.tsx.
   * После вызова внешние обработчики будут двигать фокус.
   */
  connectNav: (
    onUp: (() => void) | undefined,
    onDown: (() => void) | undefined,
    onLeft: (() => void) | undefined,
    onRight: (() => void) | undefined,
  ) => void;
}

export function useGamepadFocus(
  options: UseGamepadFocusOptions,
): UseGamepadFocusReturn {
  const { initialIndex = 0, count, depth = 1 } = options;
  const [focusIndex, setFocusIndex] = useState(initialIndex);
  const [focusDir, setFocusDir] = useState<"up" | "down" | "left" | "right" | null>(null);
  const dirTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs для внешних обработчиков навигации.
  // connectNav сохраняет внешние функции сюда, а onNavUp/Down/Left/Right
  // вызывают их через эти refs.
  const externalNavRef = useRef({
    up: undefined as (() => void) | undefined,
    down: undefined as (() => void) | undefined,
    left: undefined as (() => void) | undefined,
    right: undefined as (() => void) | undefined,
  });

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
        const next = ((prev + delta) % count + count) % count;
        return next;
      });
    },
    [count],
  );

  // Внутренний обработчик навигации вверх.
  // Сначала проверяет externalNavRef.up, если есть — вызывает его,
  // иначе двигает фокус напрямую.
  const onNavUp = useCallback(() => {
    const ext = externalNavRef.current.up;
    if (ext) {
      ext();
    } else {
      moveFocus(-1);
      setFocusDir("up");
      clearFocusDir();
    }
  }, [moveFocus, clearFocusDir]);

  // Внутренний обработчик навигации вниз.
  const onNavDown = useCallback(() => {
    const ext = externalNavRef.current.down;
    if (ext) {
      ext();
    } else {
      moveFocus(1);
      setFocusDir("down");
      clearFocusDir();
    }
  }, [moveFocus, clearFocusDir]);

  // Внутренний обработчик навигации влево.
  const onNavLeft = useCallback(() => {
    const ext = externalNavRef.current.left;
    if (ext) {
      ext();
    } else {
      if (depth > 1) {
        moveFocus(-depth);
      }
      setFocusDir("left");
      clearFocusDir();
    }
  }, [moveFocus, clearFocusDir, depth]);

  // Внутренний обработчик навигации вправо.
  const onNavRight = useCallback(() => {
    const ext = externalNavRef.current.right;
    if (ext) {
      ext();
    } else {
      if (depth > 1) {
        moveFocus(depth);
      }
      setFocusDir("right");
      clearFocusDir();
    }
  }, [moveFocus, clearFocusDir, depth]);

  // Подключаем внешние обработчики навигации.
  // Сохраняем внешние функции в ref, чтобы onNavUp/Down/Left/Right
  // могли их вызывать.
  const connectNav = useCallback(
    (
      onUp: (() => void) | undefined,
      onDown: (() => void) | undefined,
      onLeft: (() => void) | undefined,
      onRight: (() => void) | undefined,
    ) => {
      externalNavRef.current.up = onUp;
      externalNavRef.current.down = onDown;
      externalNavRef.current.left = onLeft;
      externalNavRef.current.right = onRight;
    },
    [],
  );

  return {
    focusIndex,
    setFocusIndex,
    focusDir,
    onNavUp,
    onNavDown,
    onNavLeft,
    onNavRight,
    focused: count > 0,
    connectNav,
  };
}
