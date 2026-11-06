/* ============================================================
   Enemy definitions — kinds, base speeds, per-weapon tuning.
   ============================================================ */

import {
    CARRIER_BASE_SPEED,
    CRUISER_BASE_SPEED,
    DRONE_BASE_SPEED,
    FIGHTER_BASE_SPEED,
    HUNTER_SPEED,
    MINER_BASE_SPEED,
} from "./player";

/* ----------------------- поведение у края зоны ----------------------- */

/**
 * Полоса у края зоны, в которой ИИ начинает отворачивать, px.
 *
 * Было 160: враги не заходили в широкий коридор вдоль кромки, и игрок на
 * краю оказывался в зоне, куда никто не приходит. 70 px — это уже манёвр
 * корпуса, а не отдельная безопасная полоса.
 */
export const ZONE_EDGE_AVOID_RADIUS = 70;
/** Ближе этого расстояния до края движение уходит полностью по касательной, px. */
export const ZONE_EDGE_AVOID_HARD = 30;
/** Отступ хантера от стены, px (было 90). */
export const HUNTER_WALL_MARGIN = 40;
/** Отступ точки перехвата хантера от края зоны, px (было 60). */
export const HUNTER_ZONE_KEEP_MARGIN = 30;
/**
 * Множитель отворачивания, когда игрок сам находится у кромки.
 *
 * ИИ отворачивает от края только чтобы не вылететь из арены. Если игрок
 * прячется в внешней трети, врагам нечего охранять: они идут за ним почти
 * без отступа.
 */
export const ZONE_EDGE_RIM_AVOID_SCALE = 0.25;
/** С какой доли радиуса зоны игрок считается «на кромке». */
export const ZONE_EDGE_RIM_FRACTION = 0.62;

/* --------------------------- директор угроз --------------------------- */

/** Период пересборки жетонов атаки, секунды. */
export const THREAT_DIRECTOR_INTERVAL = 1.5;
/** Общий потолок одновременно атакующих угроз. */
export const THREAT_MAX_ACTIVE = 8;
/** Лимиты активных угроз по видам: не больше одной дуэли каждого класса. */
export const THREAT_CLASS_LIMITS = {
  hunter: 1,
  fighter: 2,
  cruiser: 1,
  drone: 4,
} as const;
/** Дистанция удержания для врага без жетона (хантер), px. */
export const THREAT_HUNTER_STANDOFF = 520;

/* ------------------------------- enemies ------------------------------- */

export enum EnemyKind {
  Drone = "drone",
  Hunter = "hunter",
  Fighter = "fighter",
  Cruiser = "cruiser",
  Carrier = "carrier",
  Miner = "miner",
  /** Босс: арена-событие каждые 10 волн, не входит в случайные веса. */
  Boss = "boss",
  /** Мина минёра: не входит в состав волны, спавнится только стратегией. */
  Mine = "mine",
}

export const ENEMY_KIND_COUNT = Object.keys(EnemyKind).length;

/** Проверить, что строка — известный вид врага (для сценариев/URL). */
export function isEnemyKind(value: unknown): value is EnemyKind {
  return typeof value === "string" && (Object.values(EnemyKind) as string[]).includes(value);
}

/* Cruiser tuning */
export const CRUISER_BULLET_SPEED = 436.8; // 260 × 1.68 — тяжёлые болты на 20% быстрее прежних 364

/**
 * Точка упреждения крейсера: расстояние, отложенное от игрока вдоль его
 * вектора движения. Крейсер летит в эту точку и ведёт огонь из неё.
 */
export const CRUISER_LEAD_DISTANCE = 300;
/**
 * Дальше этой дистанции до игрока крейсер не перестраивается в точку
 * упреждения — только держит позицию и ведёт прицельный огонь.
 */
export const CRUISER_MANEUVER_RANGE = 520;
/** Доля радиуса зоны для линии огня крейсера: min(520, 1.1R). */
export const CRUISER_FIRE_RANGE_R = 1.1;
/** Carrier считается «рядом» (эскорт), если не дальше этой дистанции. */
export const CRUISER_ESCORT_RANGE = 520;
/** Доля радиуса зоны, на которой носитель удерживает дистанцию. */
export const CARRIER_HOLD_R = 0.7;
/** Доля радиуса зоны: если игрок дальше — носитель медленно сближается. */
export const CARRIER_ADVANCE_R = 1.1;
/** Доля радиуса зоны: если игрок ближе — носитель отходит. */
export const CARRIER_RETREAT_R = 0.5;
/** Угловой сдвиг крейсера от линии «носитель—игрок», радианы: два эскорта не слипаются в точку. */
export const CRUISER_ESCORT_ARC_OFFSET = 0.3;
/** Отступ точки манёвра от края зоны, в радиусах крейсера (0.8 корпуса). */
export const CRUISER_ZONE_EDGE_MARGIN_RADII = 0.8;

/* ------------------------------- boss ------------------------------- */

/** Каждая N-я волна — волна босса. */
export const BOSS_WAVE_INTERVAL = 10;
/** Доля радиуса зоны, на которой босс держит дистанцию. */
export const BOSS_HOLD_R = 0.58;
/** Дальше этой доли игрок — босс сближается. */
export const BOSS_ADVANCE_R = 0.9;
/** Скорость бокового стрейфа босса, доля от базовой. */
export const BOSS_STRAFE_SPEED_MULT = 0.55;
/** Порог HP для второй и третьей фаз. */
export const BOSS_PHASE2_RATIO = 0.66;
export const BOSS_PHASE3_RATIO = 0.33;
/** Период смены направления стрейфа, секунды. */
export const BOSS_STRAFE_CHANGE_INTERVAL = 3.2;
/** Скорость доворота корпуса/турели босса, рад/с. */
export const BOSS_TURN_RATE = 2.4;

/* --------------------------- enemy bolts --------------------------- */

/** Скорость болта дрононосца (зенитный огонь по кругу). */
export const ENEMY_BOLT_SPEED = 300;
/**
 * Скорость болта истребителя.
 *
 * Болт быстрее скорости игрока (1.2 × PLAYER_MAX_SPEED): при болте 300
 * уравнение встречи вообще не имеет решения, пока игрок не летит навстречу
 * (он втрое быстрее болла), поэтому кружить вокруг файтера было безопасно.
 * На 720 прогноз дуги ошибается меньше, а окно выстрела открывается в 2-3 раза
 * чаще (см. scripts/fighter-circle-sim.mjs).
 */
export const FIGHTER_BOLT_SPEED = 720;
/**
 * Горизонт упреждения прицела болтов файтера и дрононосца, секунды.
 * Это НЕ время жизни: болт летит без запаса и обрывается о край зоны.
 */
export const ENEMY_BOLT_LEAD_TIME = 1.35;
/** Горизонт упреждения прицела тяжёлого болта крейсера, секунды. */
export const CRUISER_BOLT_LEAD_TIME = 1.8;

/** Высота орбиты дронов над корпусом Carrier — общая для носителя, дронов и эскорта. */
export const CARRIER_DRONE_ORBIT_GAP = 80;

/**
 * EnemyDef — static base stats for each enemy kind.
 * Dynamic stats (HP, contact dmg, bolt) are computed at runtime
 * using wave-dependent scaling from waves.ts.
 */
export interface EnemyDef {
  r: number;       // visual radius
  hp: number;      // wave-scaled HP
  speed: number;   // wave-scaled speed
  contact: number; // wave-scaled contact damage
  score: number;
  bolt: number;    // wave-scaled bolt damage (0 if no weapon)
  mass: number;
}

/**
 * Base definition — provides the template for wave-scaled values.
 * HP, contact, and bolt are scaled via hpScale()/dmgScale().
 */
export interface EnemyBaseDef {
  r: number;
  hpBase: number;
  speed: number;
  contactBase: number;
  score: number;
  boltBase: number;
  mass: number;
}

/**
 * Base templates for each enemy kind.
 * These are NOT used directly — enemyDefFor() scales them per wave.
 */
export const ENEMY_BASES: Record<EnemyKind, EnemyBaseDef> = {
  [EnemyKind.Drone]: {
    r: 10, hpBase: 10, speed: DRONE_BASE_SPEED,
    contactBase: 12, score: 10, boltBase: 0, mass: 0,
  },
  [EnemyKind.Hunter]: {
    r: 9, hpBase: 30, speed: HUNTER_SPEED,
    contactBase: 32, score: 40, boltBase: 0, mass: 0,
  },
  [EnemyKind.Fighter]: {
    r: 13, hpBase: 34, speed: FIGHTER_BASE_SPEED,
    contactBase: 9.1, score: 25, boltBase: 4.55, mass: 0,
  },
  [EnemyKind.Cruiser]: {
    r: 26, hpBase: 155, speed: CRUISER_BASE_SPEED,
    contactBase: 22, score: 60, boltBase: 12, mass: 0,
  },
  [EnemyKind.Carrier]: {
    r: 41, hpBase: 350, speed: CARRIER_BASE_SPEED,
    contactBase: 26, score: 100, boltBase: 0, mass: 0,
  },
  [EnemyKind.Miner]: {
    r: 15, hpBase: 52, speed: MINER_BASE_SPEED,
    contactBase: 14, score: 55, boltBase: 0, mass: 0,
  },
  [EnemyKind.Boss]: {
    r: 54, hpBase: 900, speed: CARRIER_BASE_SPEED * 0.9,
    contactBase: 42, score: 1200, boltBase: 9, mass: 0,
  },
  [EnemyKind.Mine]: {
    r: 7, hpBase: 3, speed: 0,
    contactBase: 22, score: 0, boltBase: 0, mass: 0,
  },
};

/* ------------------------------ miner ------------------------------ */

/** Доля радиуса зоны: внешняя орбита, на которой минёр ждёт. */
export const MINER_HOLD_R = 0.78;
/** Радиус орбиты вокруг игрока, на которой ставится мина. */
export const MINER_DIVE_RADIUS = 150;
/** Угловая скорость облёта, рад/с. */
export const MINER_ORBIT_SPEED = 0.45;
/** Пауза между заходами на игрока, секунды. */
export const MINER_DIVE_COOLDOWN = 7;
/** Сколько секунд минёр отходит после постановки мины. */
export const MINER_RETREAT_TIME = 3;
/** Сколько живёт мина до самоподрыва, секунды. */
export const MINE_LIFETIME = 18;
/** Предел одновременных мин в мире: защита от заполнения арены. */
export const MINE_MAX_ALIVE = 6;

/* ------------------------------ mass ------------------------------ */

export function massForRadius(r: number): number {
  return Math.max(1, Math.PI * r * r * 0.02);
}

/** Дальность стрельбы врагов */
export const ENEMY_SHOOT_RANGE = 500;

/** Максимальное количество дронов у одного Carrier */
export const ENEMY_MAX_DRONES = 7;

/* ------------------------------ Fighter AI ------------------------------ */

/**
 * Тактика истребителя: патруль → поиск → заход → выстрел → вираж → пауза.
 * Числа намеренно живут здесь, а не в стратегии: именно ими настраивается
 * «характер» файтера при балансировке волн.
 */

/** Радиус обнаружения игрока: дальше истребитель просто патрулирует зону. */
export const FIGHTER_DETECT_RANGE = 900;
/** Доля радиуса зоны, по которой идёт патрульный облёт. */
export const FIGHTER_PATROL_RING = 0.6;
/** Опережение вдоль патрульного кольца, радианы: цель облёта на дуге. */
export const FIGHTER_PATROL_STEP = 0.5;
/** Дистанция, с которой истребитель решается на заход. */
export const FIGHTER_COMMIT_RANGE = 400;
/**
 * Предельное время перехвата при решении на заход, секунды.
 * Дольше — значит игрок уходит, и заход превращается в погоню за кормой.
 */
export const FIGHTER_COMMIT_TIME = 2.5;
/** Дистанция удержания при поиске цели, доля от радиуса зоны. */
export const FIGHTER_STANDOFF_R = 0.7;
/** Полоса удержания дистанции: внутри неё истребитель облетает игрока. */
export const FIGHTER_STANDOFF_BAND = 80;
/** Таймаут захода на цель, секунды: не довернул — уходим на вираж. */
export const FIGHTER_ATTACK_TIMEOUT = 1.5;
/**
 * Окно выстрела по времени полёта болта, секунды.
 * Ближе минимума — выстрел в упор без смысла, дальше максимума — прогноз
 * курса игрока уже врёт. 0.9 с при скорости болта 720 даёт ~650 px, но
 * реально окно ограничено угловым размером цели (~560 px).
 */
export const FIGHTER_FIRE_MIN_TIME = 0.2;
export const FIGHTER_FIRE_MAX_TIME = 0.9;
/**
 * Минимальный угловой радиус цели для выстрела, радианы.
 * Цель размером с точку не простреливается «наверняка».
 */
export const FIGHTER_FIRE_MIN_ANGULAR = 0.05;
/** Отступ точки встречи от края зоны, px: ближе болт гаснет о барьер. */
export const FIGHTER_ZONE_MARGIN = 100;
/** Критическая близость к игроку — вираж без выстрела, px. */
export const FIGHTER_BREAK_DIST = 130;
/** Длительность виража после выстрела, секунды. */
export const FIGHTER_EVADE_TIME = 0.65;
/** Дистанция, после которой вираж считается завершённым, px. */
export const FIGHTER_EVADE_DIST = 300;
/** Минимальная доля виража, которую нужно довернуть, прежде чем уход по дистанции, с. */
export const FIGHTER_EVADE_MIN_TIME = 0.35;
/** Пауза свободного полёта после виража, секунды. */
export const FIGHTER_COOLDOWN_TIME = 1.2;
/** Угол свободного дрейфа в паузе, радианы (знак задаёт strafeDir). */
export const FIGHTER_FREE_DRIFT = 0.35;
/**
 * После выстрела истребитель остаётся в строю, пока игрок не подошёл ближе
 * этой дистанции, px. Ближе — вираж (столкновение опаснее выстрела).
 */
export const FIGHTER_FIRE_KEEP_DIST = 220;

/* ----------------------- Fighter: срез орбиты (CUT) ----------------------- */

/**
 * Порог угловой скорости курса игрока, рад/с, при котором его полёт
 * считается облётом. При 600 px/s это круг радиусом до 600 px.
 * Истребитель в этом режиме не догоняет цель снаружи, а заходит внутрь
 * орбиты: снаружи он физически не может обогнать игрока по углу.
 */
export const FIGHTER_CIRCLE_OMEGA = 1.0;
/**
 * Радиус внутреннего кольца, доля от радиуса зоны: истребитель
 * занимает позицию внутри круга и вращается вместе с игроком, оставаясь
 * впереди по направлению обхода.
 */
export const FIGHTER_CUT_RADIUS = 0.55;
/** Угловое опережение по орбите, радианы: насколько впереди держаться. */
export const FIGHTER_CUT_LEAD = 0.45;
/**
 * Минимальная дистанция до игрока на срезе, px.
 * Внутреннее кольцо на тугой орбите (радиус ~240 px) проходит вплотную к
 * игроку — истребитель либо таранит его, либо бесконечно уходит на вираж.
 * Поэтому опережение по дуге увеличивается, пока точка среза не отойдёт
 * на эту дистанцию: он встаёт дальше впереди, но не в упор.
 */
export const FIGHTER_CUT_DIST = 240;
/** Отступ внутренней точки от края зоны, px. */
export const FIGHTER_CUT_ZONE_MARGIN = 60;

/* ----------------------- Fighter: очередь (burst) ----------------------- */

/** Минимальное количество болтов в очереди истребителя. */
export const FIGHTER_BURST_MIN = 2;
/** Максимальное количество болтов в очереди истребителя. */
export const FIGHTER_BURST_MAX = 3;
/** Интервал между болтами в очереди, с. */
export const FIGHTER_BURST_INTERVAL = 0.15;
/** Рассеивание болтов в очереди, рад. */
export const FIGHTER_BURST_DISPERSION = 0.015;
/**
 * Пауза между очередями истребителя, с. Игрок получает почти две секунды,
 * чтобы выйти из линии огня; сами болты внутри очереди идут с интервалом.
 */
export const FIGHTER_BURST_COOLDOWN = 2.0;