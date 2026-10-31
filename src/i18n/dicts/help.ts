/**
 * Экран помощи: управление, цели, бонусы.
 */

export const ru = {
  title: "ПОМОЩЬ",
  controls: "УПРАВЛЕНИЕ",
  move: "движение корабля",
  pause: "пауза",
  touch: "удерживай и веди палец — движение",
  objective: "ЗАДАЧА",
  item:
    "Добейся отсчёта — зона волны якорится в твоей позиции. Из разломов выходят враги. " +
    "Уничтожь всех — и зона схлопнется. Каждая 4-я волна добавляет орудие (до 5).",
  enemies: "ЦЕЛИ",
  drone: "дрон — рой, идущий на таран",
  hunter: "ищейка — рассчитывает точку перехвата; уворачивайся рывком",
  fighter: "истребитель — стрейфит и ведёт огонь очередями",
  cruiser: "крейсер — тяжёлый, держит дистанцию и прикрывает дрононосцев",
  carrier: "дрононосец — сидит в тылу и выпускает дронов",
  bonuses: "БОНУСЫ",
  heal: "крест — временное восстановление корпуса",
  rate: "молния — временный темп огня +20 / +40 / +60% (20 секунд)",
  gun: "стволы — дополнительное орудие (до 5)",
  asteroid: "астероиды — расстреливай скалы: крупные раскалываются на мелкие",
  allyDrone: "дрон — помощник со своим корпусом, сам выбирает цели (до 8). Его могут сбить!",
  shield:
    "щит — гасит часть урона в процентах, пока есть энергия; при нуле " +
    "перезагружается 3 секунды и восстанавливается полностью",
  back: "НАЗАД",
};

export const en: typeof ru = {
  title: "HELP",
  controls: "CONTROLS",
  move: "move the ship",
  pause: "pause",
  touch: "hold & drag a finger — movement",
  objective: "OBJECTIVE",
  item:
    "Survive the countdown — the wave zone anchors at your position. Enemies pour out of rifts. " +
    "Wipe them out and the zone collapses. Every 4th wave adds a gun (up to 5).",
  enemies: "TARGETS",
  drone: "drone — a ramming swarm",
  hunter: "hunter — predicts an intercept point; dodge with a sharp jink",
  fighter: "fighter — strafes and fires bursts",
  cruiser: "cruiser — heavy, keeps range and screens carriers",
  carrier: "carrier — sits in the back and spawns drones",
  bonuses: "BONUSES",
  heal: "cross — temporary hull regeneration",
  rate: "bolt — temporary fire rate +20 / +40 / +60% (20 seconds)",
  gun: "barrels — extra gun (up to 5)",
  asteroid: "asteroids — shoot the rocks: big ones split into smaller",
  allyDrone: "drone — an ally with its own hull, picks targets itself (up to 8). It can be shot down!",
  shield:
    "shield — absorbs a percentage of incoming damage while energy lasts; at zero " +
    "it reboots for 3 seconds and comes back full",
  back: "BACK",
};
