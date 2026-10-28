/**
 * IPhysics — абстрактный интерфейс системы физики.
 *
 * Игровой код общается с физикой (регистрация тел, синхронизация
 * скоростей, шаг, контакты) только через этот контракт. Конкретные
 * бэкенды (текущая самописная физика / Planck.js) инкапсулируются в
 * реализациях, поэтому физические вызовы не размазаны по коду игры.
 *
 * Контракт повторяет устройство рендер-слоя: IRenderer и реализации
 * (BaseRenderer / PicoGLRenderer), где игровой код знает только
 * интерфейс, а выбор бэкенда происходит в композиционном корне.
 */

/** Тип игровой сущности, которой принадлежит тело (для правил геймплея). */
export type PhysicsBodyKind = "player" | "enemy" | "asteroid" | "pickup";

/**
 * Максимальное перемещение тела за один шаг (world-units).
 *
 * Аналог Box2D/Planck `Settings.maxTranslation`: скорость за шаг
 * ограничивается так, чтобы |v·dt| не превышало этого значения.
 * При dt = 1/60 предел скорости = MAX * 60. Значение 12 даёт
 * предел 720 px/s — покрывает PLAYER_MAX_SPEED (450) и максимально
 * прокачанную скорость (450 × 1.4 = 630) с запасом, поэтому движок
 * не зажимает корабль. Единый источник для обоих бэкендов.
 */
export const PHYSICS_MAX_TRANSLATION_PER_STEP = 12;

/** Параметры создания тела. Радиус задаёт форму (окружность). */
export interface PhysicsBodyDef {
  x: number;
  y: number;
  angle?: number;
  radius: number;
  /** Плотность: вместе с площадью круга даёт массу тела. */
  density: number;
  /** Коэффициент упругости контакта (0..1). */
  restitution?: number;
  /** Коэффициент трения контакта. */
  friction?: number;
  kind: PhysicsBodyKind;
  /** Запретить вращение кораблей (текущая физика вращение не симулирует). */
  fixedRotation?: boolean;
  /** Кинематическое тело: позицию задаёт внешний код, повлиять на него нельзя. */
  kinematic?: boolean;
  /**
   * Сенсор: тело не порождает физического отклика (не толкает и не
   * отталкивает), только регистрируется в контактах датчика.
   * Используется для бонусов: игрок подбирает их, но они не влияют на
   * его движение. В CustomCurrentPhysics отклика нет по определению,
   * поэтому флаг там игнорируется (семантика совпадает с обычным телом).
   */
  sensor?: boolean;
}

/** Состояние тела: позиция, угол и скорости (мировые единицы). */
export interface PhysicsBodyState {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  spin: number;
}

/** Живая сущность физики: мост между игровым объектом и телом бэкенда. */
export interface PhysicsEntity {
  /** Игровой объект (live-ссылка) — используется как ключ и в контактах. */
  userData: unknown;
  kind: PhysicsBodyKind;
  radius: number;
  density: number;
  /** Коэффициент упругости контакта (0..1), по умолчанию 0.15. */
  restitution?: number;
  /** Коэффициент трения контакта, по умолчанию 0.05. */
  friction?: number;
  fixedRotation?: boolean;
  /** Кинематическое тело: позицию задаёт внешний код, повлиять на него нельзя. */
  kinematic?: boolean;
  /** Сенсор: тело реагирует на контакты, но не оказывает отклика (бонусы). */
  sensor?: boolean;
  /** Прочитать текущее состояние сущности (до шага физики). */
  getState(): PhysicsBodyState;
  /**
   * Принять результат шага авторитарного бэкенда (Planck): позиция и
   * скорости из тела записываются обратно в игровой объект.
   */
  applyResult(state: PhysicsBodyState): void;
}

/** Пара контактирующих тел: игровые сущности (live-ссылки). */
export interface PhysicsContact {
  a: unknown;
  b: unknown;
  /** Роли тел — заполняет координатор PhysicsSystem из реестра сущностей. */
  kindA?: PhysicsBodyKind;
  kindB?: PhysicsBodyKind;
}

export interface IPhysics {
  /** Контакты, собранные на текущем шаге (действительны до beginFrame). */
  readonly contacts: PhysicsContact[];
  /** Количество зарегистрированных тел. */
  readonly bodyCount: number;
  /**
   * Бэкенд сам решает импульсы контактов (Planck) — в этом случае игровые
   * «мягкие» толчки не применяются, чтобы не дублировать реакцию.
   * CustomCurrentPhysics: false — контактные импульсы даёт CollisionSystem.
   */
  readonly resolvesVelocity: boolean;

  /**
   * Бэкенд сам интегрирует позицию тела из скорости (Planck и новый
   * CustomCurrentPhysics). При true внешние системы позицию НЕ двигают,
   * а PhysicsSystem возвращает результат шага в игровые сущности.
   */
  readonly integratesPosition: boolean;

  /** Зарегистрировать тело игровой сущности в мире физики. */
  addBody(userData: unknown, def: PhysicsBodyDef): void;

  /** Удалить тело сущности. */
  removeBody(userData: unknown): void;

  /** Удалить все тела (сброс забега/возврат в меню). */
  clear(): void;

  /** Синхронизировать тело с игровым состоянием (позиция + скорости). */
  syncBody(userData: unknown, state: PhysicsBodyState): void;

  /** Начать кадр: сбросить контакты прошлого шага. */
  beginFrame(): void;

  /** Шаг физики (решение контактов/импульсов). */
  step(dt: number): void;

  /** Завершить кадр: собрать контакты и применить реакции бэкенда. */
  endFrame(): void;

  /** Прочитать полное состояние тела (позиция + скорости). */
  getState(userData: unknown): PhysicsBodyState;
}