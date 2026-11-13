/**
 * Wallet — кошелёк одного ресурса: единственный источник правды о балансе.
 *
 * Все проверки и операции идут через кошелёк, поэтому неважно, откуда
 * пришла покупка: HUD, ангар, тестовый профиль или отладочная панель.
 *
 * Флаг `infinite` включает отладочный режим: `canAfford` всегда отвечает
 * «да», `spend` не меняет баланс, а `add` игнорируется — после выключения
 * флага остаётся последняя реальная сумма, а не накопленный «миллиард».
 */

export class Wallet {
  private _amount: number;
  private _infinite = false;

  constructor(amount = 0) {
    this._amount = Wallet.normalize(amount);
  }

  /** Текущий баланс. */
  get amount(): number {
    return this._amount;
  }

  /** Бесконечный ресурс: тратить можно всегда, баланс не меняется. */
  get infinite(): boolean {
    return this._infinite;
  }

  setInfinite(on: boolean): void {
    this._infinite = on;
  }

  /** Задать баланс (загрузка из хранилища, старт забега). */
  set(amount: number): void {
    this._amount = Wallet.normalize(amount);
  }

  /** Хватает ли средств на покупку. Бесконечный кошелёк подтверждает всегда. */
  canAfford(cost: number): boolean {
    if (this._infinite) return true;
    return this._amount >= Wallet.normalizeCost(cost);
  }

  /**
   * Списать средства. Возвращает false, если денег не хватило.
   * В бесконечном режиме списание всегда успешно и не меняет баланс.
   */
  spend(cost: number): boolean {
    const amount = Wallet.normalizeCost(cost);
    if (amount === 0) return true;
    if (this._infinite) return true;
    if (this._amount < amount) return false;
    this._amount -= amount;
    return true;
  }

  /** Начислить средства. В бесконечном режиме баланс не растёт. */
  add(amount: number): void {
    if (this._infinite) return;
    this._amount += Wallet.normalizeCost(amount);
  }

  private static normalize(value: number): number {
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  private static normalizeCost(cost: number): number {
    return Number.isFinite(cost) ? Math.max(0, Math.ceil(cost)) : 0;
  }
}
