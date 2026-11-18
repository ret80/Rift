/**
 * CustomCurrentPhysics — текущая (самописная) физика игры.
 *
 * Повторяет механику скорости Planck.js: позиция интегрируется самим
 * бэкендом. Контакты считаются по пересечению окружностей; мягкие
 * импульсы при контактах по-прежнему выполняет CollisionSystem.
 */

import type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyState,
  PhysicsContact,
} from "./IPhysics.ts";

/** Состояние для отсутствующего тела: общий неизменяемый объект. */
const ZERO_STATE: PhysicsBodyState = { x: 0, y: 0, angle: 0, vx: 0, vy: 0, spin: 0 };

/** Внутреннее представление тела: хранит форму и последнее состояние. */
interface BodyEntry {
  userData: unknown;
  def: PhysicsBodyDef;
  lastState: PhysicsBodyState;
}

export class CustomCurrentPhysics implements IPhysics {
  readonly resolvesVelocity = false;
  readonly integratesPosition = true;

  private entries = new Map<unknown, BodyEntry>();
  private _contacts: PhysicsContact[] = [];
  /** Переиспользуемый список тел: попарный проход не аллоцирует массив. */
  private entryList: BodyEntry[] = [];

  get contacts(): PhysicsContact[] {
    return this._contacts;
  }

  get bodyCount(): number {
    return this.entries.size;
  }

  addBody(userData: unknown, def: PhysicsBodyDef): void {
    this.removeBody(userData);
    this.entries.set(userData, {
      userData,
      def,
      lastState: {
        x: def.x,
        y: def.y,
        angle: def.angle ?? 0,
        vx: 0,
        vy: 0,
        spin: 0,
      },
    });
  }

  removeBody(userData: unknown): void {
    this.entries.delete(userData);
  }

  clear(): void {
    this.entries.clear();
    this._contacts = [];
    this.entryList.length = 0;
  }

  syncBody(userData: unknown, state: PhysicsBodyState): void {
    const e = this.entries.get(userData);
    if (!e) return;
    e.lastState = state;
  }

  beginFrame(): void {
    this._contacts.length = 0;
  }

  step(dt: number): void {
    if (dt <= 0) return;
    for (const e of this.entries.values()) {
      const s = e.lastState;
      // Интеграция позиции самим бэкендом (как Planck делает в step).
      // Внешние системы в режиме integratesPosition=true позицию не двигают.
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }
  }

  endFrame(): void {
    const list = this.entryList;
    list.length = 0;
    for (const entry of this.entries.values()) list.push(entry);

    const found = this._contacts;
    found.length = 0;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const as = a.lastState;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const bs = b.lastState;
        const dx = bs.x - as.x;
        const dy = bs.y - as.y;
        const minDist = a.def.radius + b.def.radius;
        // Квадрат дистанции с запасом 0.1 % отсекает заведомо далёкие пары:
        // точное расстояние всё равно считается через hypot, поэтому
        // результат контакта остаётся бит-в-бит прежним.
        const reach = minDist * 1.001;
        if (dx * dx + dy * dy >= reach * reach) continue;
        const dist = Math.hypot(dx, dy);
        if (dist < minDist && dist > 0.01) {
          found.push({ a: a.userData, b: b.userData });
        }
      }
    }
  }

  /**
   * Состояние тела. Возвращается живой объект бэкенда: вызывающий код
   * только читает его, поэтому копия на каждый запрос не нужна.
   */
  getState(userData: unknown): PhysicsBodyState {
    const e = this.entries.get(userData);
    if (!e) return ZERO_STATE;
    return e.lastState;
  }
}