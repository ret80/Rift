/**
 * SimulationClock — фиксированный шаг симуляции.
 *
 * Мир тикает только с `FIXED_DT = 1/60`. Браузерный кадр с переменным `dt`
 * копит время в accumulator и запускает целое число тиков; headless-прогон
 * вызывает `runTicks` напрямую. Благодаря этому результат не зависит от
 * частоты кадров и загрузки.
 */

/** Единственный разрешённый шаг мира, секунды. */
export const FIXED_DT = 1 / 60;

/** Максимум догоняющих тиков за кадр: защита от «спирали смерти». */
export const MAX_CATCH_UP = 5;

/** Допуск сравнения накопителя с шагом (погрешность float). */
const EPSILON = 1e-9;

export class SimulationClock {
  private accumulator = 0;

  /** Сколько времени накоплено, но ещё не превращено в тики. */
  get pending(): number {
    return this.accumulator;
  }

  /**
   * Продвинуть время на `realDt` и выполнить столько тиков, сколько накопилось.
   * Возвращает число выполненных тиков.
   */
  advance(realDt: number, tick: (dt: number) => void): number {
    if (!Number.isFinite(realDt) || realDt <= 0) return 0;
    this.accumulator += realDt;

    let steps = 0;
    while (this.accumulator + EPSILON >= FIXED_DT && steps < MAX_CATCH_UP) {
      this.accumulator -= FIXED_DT;
      steps++;
      tick(FIXED_DT);
    }

    // Отставание сверх maxCatchUp не накапливаем: иначе после долгой паузы
    // мир «телепортируется» вперёд серией тиков.
    if (this.accumulator > FIXED_DT) this.accumulator = 0;

    return steps;
  }

  /** Headless: выполнить ровно `count` тиков фиксированного шага. */
  runTicks(count: number, tick: (dt: number) => void): void {
    for (let i = 0; i < count; i++) tick(FIXED_DT);
  }

  /** Сбросить накопитель (старт забега, пауза, возврат в меню). */
  reset(): void {
    this.accumulator = 0;
  }
}
