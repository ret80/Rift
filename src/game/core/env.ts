/**
 * env — единственная точка доступа к окружению браузера.
 *
 * URL-параметры, размеры вьюпорта и плотность пикселей читаются здесь,
 * чтобы UI, хуки и игровое ядро не дублировали `window`/`URLSearchParams`.
 * В средах без `window` возвращаются безопасные значения по умолчанию.
 */

/** Прочитать параметр URL (`?name=value`); null — параметра нет. */
export function readUrlParam(name: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** Размеры вьюпорта в CSS-пикселях. */
export function getViewport(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/** Плотность пикселей экрана (без ограничения сверху). */
export function getDevicePixelRatio(): number {
  if (typeof window === "undefined") return 1;
  return window.devicePixelRatio || 1;
}
