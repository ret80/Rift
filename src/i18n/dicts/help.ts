/**
 * Экран помощи: управление, задача волны, форсаж, враги, бонусы, ангар.
 *
 * Тексты описывают текущую реализацию, а не план: при изменении механик
 * (форсаж, якоря, ангар) правки обязаны попадать и сюда.
 */

export const ru = {
  title: "ПОМОЩЬ",
  controls: "УПРАВЛЕНИЕ",
  move: "тяга корабля",
  fire: "левая кнопка — ручной огонь, правая — альтернативный огонь оружия",
  boost: "форсаж: разгон при полном кольце (Shift или кнопка)",
  ability: "активная способность из бонуса (телепорт-подмена)",
  tactical: "тактический режим: мир замирает, приказ дронам можно сменить",
  pause: "пауза",
  touch: "веди пальцем — движение; кнопка с молнией — форсаж",
  gamepad: "геймпад: стик — движение, Start — пауза, A / B — выбор, LB / RB — вкладки",
  objective: "ЗАДАЧА",
  objectiveWaves:
    "Волны идут одна за другой: отсчёт, бой, зачистка. Зона волны расширяется от точки старта. " +
    "За её кромкой корпус теряет 10% запаса в секунду, поэтому бой идёт внутри кольца.",
  objectiveAnchors:
    "Каждая 3-я волна — с якорями-разломами. Пока жив хотя бы один якорь, волна не закончится, " +
    "а из него каждые 6 секунд выходит подкрепление. Сними все якоря — получишь +40% деталей за волну.",
  objectiveStorm:
    "С 3-й волны кромка зоны бьёт бурей: после короткого телеграфа вспыхивают одна-три зоны " +
    "секторов. Щит гасит урон бури.",
  objectiveHangar:
    "Во время отсчёта перед волной внизу появляется кнопка «АНГАР»: только она открывает прокачку " +
    "между волнами. Корпус восстанавливается сам за время отсчёта.",
  boostTitle: "ФОРСАЖ",
  boostBody:
    "Кнопка серая и не работает, пока не набран заряд. Каждое убийство врага добавляет энергию — " +
    "кольцо вокруг иконки заполняется. Когда кольцо полное, кнопка становится активной: нажми — " +
    "и корабль разгоняется. Во время разгона энергия тратится и кольцо убывает. Когда энергия " +
    "закончилась, форсаж выключается, и кнопка снова копит заряд убийствами.",
  boostNumbers:
    "12 убийств — полное кольцо. Полного заряда хватает на 3 секунды разгона (+45% скорости). " +
    "Форсаж не даёт неуязвимости: уходить от огня всё равно нужно манёвром.",
  shieldLine: "активный щит (удержание, если куплен)",
  lockLine: "взять следующую цель в лок",
  shieldTitle: "АКТИВНЫЙ ЩИТ",
  shieldBody:
    "Купленный щит работает пассивно и гасит часть урона. Если удерживать Q, перед кораблём " +
    "разворачивается сектор 120°: удары, пришедшие из него, не снимают корпус вовсе. Сектор " +
    "смотрит по курсу корабля — поворачивайся к опасности носом.",
  shieldNumbers:
    "Пока сектор развёрнут, энергия тратится постоянно: 30 единиц в секунду, полного запаса " +
    "хватает на три секунды. Разряженный щит уходит в перезагрузку на 3 секунды.",
  dronesTitle: "ДРОНЫ",
  dronesBody:
    "Дроны-помощники покупаются в ангаре и занимают слоты «ДРОНЫ». Пока у корабля есть хотя бы один " +
    "дрон, справа в бою видны три кнопки приказа: ЭСКОРТ — держаться у корабля, ШТУРМ — сами идут " +
    "к ближайшим врагам, ФОКУС — бьют цель под прицелом. Приказ меняется и в тактическом режиме (T).",
  enemies: "ЦЕЛИ",
  drone: "дрон — рой, идёт на таран; основа каждой волны",
  hunter: "ищейка — считает точку перехвата и таранит рывком",
  fighter: "истребитель — облетает и бьёт очередями, срезая круг",
  cruiser: "крейсер — тяжёлый, две турели, идёт на таран",
  carrier: "дрононосец — держит тыл и выпускает дронов роем",
  miner: "минёр — ныряет к кораблю и ставит мины",
  mine: "мина — 3 единицы прочности, живёт 18 секунд; расстреляй или обойди",
  needle: "игла — заряжает прицельный выстрел; не стой на линии",
  shieldbearer: "щитоносец — гасит 40% урона союзникам в ауре; убивай первым",
  harpooner: "гарпунёр — тянет корабль к себе тросом; рви дистанцию",
  splitter: "делитель — при смерти распадается на двух осколков",
  jammer: "глушитель — в его зоне отключается автонаведение",
  vortex: "вихрь — вращающийся луч; ищи безопасный сектор",
  hiveMother: "мать-улей — выпускает дронов волнами и делится на фазе",
  tractor: "тягач — тянет астероид к краю зоны и запускает его в корабль; не стой на линии",
  boss: "босс — каждая 10-я волна, три фазы и своя атака",
  bonuses: "БОНУСЫ",
  heal: "крест — временное восстановление корпуса",
  rate: "молния — темп огня +20 / +40 / +60% на время",
  gun: "стволы — временный дополнительный орудийный слот",
  allyDrone: "дрон — помощник со своим корпусом; его могут сбить",
  shield: "щит — +40 энергии щита; щит гасит часть урона, пока есть заряд",
  weapon: "оружие — ракеты, лазер или другое орудие сразу в арсенал",
  swap: "подмена — способность телепорта к ближайшему врагу со взрывом",
  asteroid: "астероиды — расстреливай скалы: крупные раскалываются на мелкие",
  hangarTitle: "АНГАР",
  hangarBody:
    "Ангар тратит детали и живёт между волнами. Вкладки: «КОРАБЛЬ» — корпус, скорость, слоты орудий " +
    "и дронов; «АРСЕНАЛ» — покупка оружия и линии перезарядки, урона, точности; «ДРОНЫ» — роли " +
    "помощников и их пушки; «БОНУСЫ» — щит, темп огня, лечение. «ПРОДОЛЖИТЬ ЗАБЕГ» закрывает ангар " +
    "и запускает отсчёт следующей волны.",
  back: "НАЗАД",
};

export const en: typeof ru = {
  title: "HELP",
  controls: "CONTROLS",
  move: "ship thrust",
  fire: "left button — manual fire, right button — weapon alt-fire",
  boost: "boost: acceleration at a full ring (Shift or button)",
  ability: "active ability from a bonus (quantum swap)",
  tactical: "tactical mode: the world freezes, drone orders can be changed",
  pause: "pause",
  touch: "drag a finger — movement; the bolt button — boost",
  gamepad: "gamepad: stick — move, Start — pause, A / B — select, LB / RB — tabs",
  objective: "OBJECTIVE",
  objectiveWaves:
    "Waves follow each other: countdown, fight, clear. The wave zone expands from the start point. " +
    "Beyond its rim the hull loses 10% per second, so the fight stays inside the ring.",
  objectiveAnchors:
    "Every 3rd wave carries rift anchors. While at least one anchor is alive the wave cannot end, " +
    "and every 6 seconds it sends reinforcements. Clear every anchor for +40% wave parts.",
  objectiveStorm:
    "From wave 3 the zone rim carries a storm: after a short telegraph one to three zones of " +
    "sectors flare up. The shield absorbs storm damage.",
  objectiveHangar:
    "During the countdown before a wave a HANGAR button appears at the bottom: only it opens " +
    "upgrades between waves. The hull restores itself during the countdown.",
  boostTitle: "BOOST",
  boostBody:
    "The button is grey and does nothing until the charge is full. Every enemy kill adds energy — " +
    "the ring around the icon fills up. Once the ring is full the button becomes active: press it and " +
    "the ship accelerates. While boosting the energy drains and the ring shrinks. When the energy runs " +
    "out, boost switches off and the button starts collecting charge again.",
  boostNumbers:
    "12 kills fill the ring. A full ring gives 3 seconds of acceleration (+45% speed). " +
    "Boost grants no invulnerability: you still dodge by moving.",
  shieldLine: "active shield (hold, if bought)",
  lockLine: "lock the next target",
  shieldTitle: "ACTIVE SHIELD",
  shieldBody:
    "A bought shield works passively and absorbs part of the damage. Holding Q projects a 120° " +
    "sector in front of the ship: hits coming from it do not reach the hull at all. The sector " +
    "follows the ship's heading, so turn your nose towards the danger.",
  shieldNumbers:
    "While the sector is up, energy drains constantly: 30 units per second, so a full charge " +
    "lasts three seconds. A fully drained shield overloads for 3 seconds.",
  dronesTitle: "DRONES",
  dronesBody:
    "Ally drones are bought in the hangar and take DRONE slots. While the ship has at least one drone, " +
    "three order buttons appear on the right in combat: ESCORT — stay near the ship, ASSAULT — push to " +
    "the nearest enemies, FOCUS — hit the target under your aim. Orders can also change in tactical " +
    "mode (T).",
  enemies: "TARGETS",
  drone: "drone — a ramming swarm; the core of every wave",
  hunter: "hunter — predicts an intercept point and rams in a dash",
  fighter: "fighter — circles you and fires bursts, cutting the orbit",
  cruiser: "cruiser — heavy, two turrets, rams when close",
  carrier: "carrier — sits in the back and releases drone swarms",
  miner: "miner — dives at the ship and drops mines",
  mine: "mine — 3 HP, lives 18 seconds; shoot it or go around",
  needle: "needle — charges an aimed shot; do not stand on the line",
  shieldbearer: "shieldbearer — cuts 40% of damage to allies in its aura; kill it first",
  harpooner: "harpooner — pulls the ship in with a tether; break the distance",
  splitter: "splitter — breaks into two shards on death",
  jammer: "jammer — auto-aim shuts down inside its zone",
  vortex: "vortex — a spinning beam; find the safe sector",
  hiveMother: "hive mother — releases drones in waves and splits in later phases",
  tractor: "tractor — drags an asteroid to the zone edge and launches it at the ship; keep moving",
  boss: "boss — every 10th wave, three phases and its own attack",
  bonuses: "BONUSES",
  heal: "cross — temporary hull repair",
  rate: "bolt — fire rate +20 / +40 / +60% for a while",
  gun: "barrels — a temporary extra gun slot",
  allyDrone: "drone — an ally with its own hull; it can be shot down",
  shield: "shield — +40 shield energy; the shield absorbs part of the damage while charged",
  weapon: "weapon — missiles, a laser or another gun straight into the armory",
  swap: "swap — an ability that teleports you to the nearest enemy with a blast",
  asteroid: "asteroids — shoot the rocks: large ones split into smaller",
  hangarTitle: "HANGAR",
  hangarBody:
    "The hangar spends parts and lives between waves. Tabs: SHIP — hull, speed, gun and drone slots; " +
    "ARMORY — weapon purchases and reload, damage, accuracy lines; DRONES — ally roles and their guns; " +
    "BONUSES — shield, fire rate, repair. CONTINUE RUN closes the hangar and starts the next countdown.",
  back: "BACK",
};
