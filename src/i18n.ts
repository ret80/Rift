/* Lightweight i18n: RU/EN dictionaries, {param} interpolation,
   localStorage persistence and a React subscription for instant
   re-render on language switch. The game engine reads the active
   dictionary at string-generation time, so in-game text follows too. */

export type Lang = "ru" | "en";

const LS_KEY = "rift9_lang";

interface Dict {
  [key: string]: string;
}

const ru: Dict = {
  "app.title": "РАЗЛОМ",
  "app.subtitle": "// СЕКТОР-9",

  "menu.play": "ИГРАТЬ",
  "menu.settings": "НАСТРОЙКИ",
  "menu.help": "ПОМОЩЬ",
  "menu.debug": "ОТЛАДКА",
  "menu.upgrade": "ПРОКАЧКА",
  "menu.hint": "WASD / СТРЕЛКИ — ДВИЖЕНИЕ · АВТОПУШКА ВЕДЁТ ОГОНЬ САМА",

  "settings.title": "НАСТРОЙКИ",
  "settings.volume": "ОБЩАЯ ГРОМКОСТЬ",
  "settings.sfx": "ЭФФЕКТЫ",
  "settings.music": "МУЗЫКА",
  "settings.test": "ТЕСТ ЗВУКА",
  "settings.language": "ЯЗЫК",
  "settings.back": "НАЗАД",
  "settings.resetProgress": "СБРОСИТЬ ПРОГРЕСС",
  "settings.resetConfirm": "Сбросить весь прогресс прокачки? Все детали и улучшения будут удалены.",

  "help.title": "ПОМОЩЬ",
  "help.controls": "УПРАВЛЕНИЕ",
  "help.move": "движение корабля",
  "help.pause": "пауза",
  "help.touch": "удерживай и веди палец — движение",
  "help.objective": "ЗАДАЧА",
  "help.item": "Добейся отсчёта — зона волны якорится в твоей позиции. Из разломов выходят враги. Уничтожь всех — и зона схлопнется. Каждая 4-я волна добавляет орудие (до 5).",
  "help.enemies": "ЦЕЛИ",
  "help.drone": "дрон — рой, идущий на таран",
  "help.hunter": "ищейка — рассчитывает точку перехвата; уворачивайся рывком",
  "help.fighter": "истребитель — стрейфит и ведёт огонь очередями",
  "help.cruiser": "крейсер — тяжёлый, держит дистанцию и прикрывает дрононосцев",
  "help.carrier": "дрононосец — сидит в тылу и выпускает дронов",
  "help.bonuses": "БОНУСЫ",
  "help.heal": "крест — ремонт корпуса +25 / +50 / +100%",
  "help.rate": "молния — временный темп огня +20 / +40 / +60% (20 секунд)",
  "help.gun": "стволы — дополнительное орудие (до 5)",
  "help.asteroid": "астероиды — расстреливай скалы: крупные раскалываются на мелкие, из них выпадают минералы",
  "help.allyDrone": "дрон — помощник со своим корпусом, сам выбирает цели (до 8). Его могут сбить!",
  "help.dash": "рывок — мгновенный разгон и таран врагов корпусом (без урона себе)",
  "help.miner": "минер — через пару секунд сбросит мину; отлети из её радиуса — и она рванёт",
  "help.back": "НАЗАД",

  "debug.title": "ПАНЕЛЬ РАЗРАБОТЧИКА",
  "debug.note": "инструменты отладки · изменения сохраняются",
  "debug.fps": "СЧЁТЧИК FPS",
  "debug.fpsDesc": "частота кадров поверх игрового экрана",
  "debug.god": "БЕССМЕРТИЕ",
  "debug.godDesc": "игрок не получает урона",
  "debug.godOn": "БЕССМЕРТИЕ ВКЛЮЧЕНО",
  "debug.godOff": "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
  "debug.wave": "СТАРТОВАЯ ВОЛНА",
  "debug.waveDesc": "игра начнётся с этой волны",
  "debug.on": "ВКЛ",
  "debug.off": "ВЫКЛ",
  "debug.back": "НАЗАД",

  "upgrade.title": "ПРОКАЧКА",
  "upgrade.back": "НАЗАД",
  "upgrade.partsLabel": "ДЕТАЛИ",
  "upgrade.hull": "КОРПУС",
  "upgrade.hullDesc": "Постоянно увеличивает макс. здоровье",
  "upgrade.damage": "УРОН",
  "upgrade.damageDesc": "Постоянно увеличивает урон пуль",
  "upgrade.fireRate": "ТЕМП ОГНЯ",
  "upgrade.fireRateDesc": "Постоянно увеличивает скорострельность",
  "upgrade.speed": "СКОРОСТЬ",
  "upgrade.speedDesc": "Постоянно увеличивает скорость движения",
  "upgrade.guns": "ОРУДИЯ",
  "upgrade.gunsDesc": "Добавляет постоянные дополнительные орудия",
  "upgrade.drones": "ДРОНЫ",
  "upgrade.dronesDesc": "Добавляет постоянных союзных дронов",
  "upgrade.dashCooldown": "РЫВОК",
  "upgrade.dashCooldownDesc": "Увеличивает длительность рывка",

  "hud.wave": "ВОЛНА",
  "hud.scoreLabel": "СЧЁТ",
  "hud.best": "РЕКОРД {v}",
  "hud.cleared": "ЗАЧИЩЕНО {k} / {t}",
  "hud.clearedShort": "{k}/{t}",
  "hud.hull": "КОРПУС",
  "hud.time": "T+{t}",
  "hud.status": "ОРУДИЯ {g} · ДРОНЫ {d}/8",
  "hud.statusBoost": "ТЕМП ОГНЯ +{p}% · {s}С",
  "hud.godChip": "БЕССМЕРТИЕ",

  "game.waveN": "ВОЛНА: {n}",
  "game.countdown": "СТАРТ ЧЕРЕЗ",
  "game.waveCleared": "ВОЛНА ЗАЧИЩЕНА",
  "game.signalLost": "СИГНАЛ ПОТЕРЯН",
  "game.transmissionLost": "ПЕРЕДАЧА ПРЕРВАНА",
  "game.newRecord": "НОВЫЙ РЕКОРД",
  "game.hull": "КОРПУСА",
  "game.hullMax": "КОРПУС ПОЛОН",
  "game.rate": "ТЕМП ОГНЯ +{p}% · {s}С",
  "game.drone": "ДРОН {i}/8",
  "game.droneMax": "РОЙ ПОЛОН +400",
  "game.droneLost": "ДРОН ПОТЕРЯН",
  "game.dash": "РЫВОК!",
  "game.mineReady": "МИНЕР ЗАРЯЖЕН",
  "game.minePlaced": "МИНА УСТАНОВЛЕНА",
  "game.mineral": "МИНЕРАЛ",
  "game.gun": "ОРУДИЕ {g}/5",
  "game.gunMax": "АРСЕНАЛ ПОЛОН +300",
  "game.arsenal": "АРСЕНАЛ РАСШИРЕН",
  "game.points": "+{v}",
  "game.zoneEdge": "НЕ ПОКИДАЙ ЗОНУ ВОЛНЫ",

  "over.title": "СИГНАЛ ПОТЕРЯН",
  "over.sub": "ПЕРЕДАЧА ПРЕРВАНА",
  "over.score": "СЧЁТ",
  "over.best": "РЕКОРД",
  "over.wave": "ВОЛНА",
  "over.kills": "ЦЕЛЕЙ УНИЧТОЖЕНО",
  "over.time": "ВРЕМЯ В СЕКТОРЕ",
  "over.retry": "ЕЩЁ РАЗ",
  "over.menu": "В МЕНЮ",

  "pause.title": "ПАУЗА",
  "pause.resume": "ПРОДОЛЖИТЬ",
  "pause.settings": "НАСТРОЙКИ",
  "pause.menu": "ВЫЙТИ В МЕНЮ",

  "toast.drone": "НОВАЯ ЦЕЛЬ: ДРОН",
  "toast.hunter": "НОВАЯ ЦЕЛЬ: ИЩЕЙКА",
  "toast.fighter": "НОВАЯ ЦЕЛЬ: ИСТРЕБИТЕЛЬ",
  "toast.cruiser": "НОВАЯ ЦЕЛЬ: КРЕЙСЕР",
  "toast.carrier": "НОВАЯ ЦЕЛЬ: ДРОНОНОСЕЦ",
};

const en: Dict = {
  "app.title": "RIFT",
  "app.subtitle": "// SECTOR-9",

  "menu.play": "PLAY",
  "menu.settings": "SETTINGS",
  "menu.help": "HELP",
  "menu.debug": "DEBUG",
  "menu.upgrade": "UPGRADES",
  "menu.hint": "WASD / ARROWS — MOVE · AUTO-TURRET FIRES ON ITS OWN",

  "settings.title": "SETTINGS",
  "settings.volume": "MASTER VOLUME",
  "settings.sfx": "SFX",
  "settings.music": "MUSIC",
  "settings.test": "TEST SOUND",
  "settings.language": "LANGUAGE",
  "settings.back": "BACK",
  "settings.resetProgress": "RESET PROGRESS",
  "settings.resetConfirm": "Reset all upgrade progress? All parts and improvements will be lost.",

  "help.title": "HELP",
  "help.controls": "CONTROLS",
  "help.move": "move the ship",
  "help.pause": "pause",
  "help.touch": "hold & drag a finger — movement",
  "help.objective": "OBJECTIVE",
  "help.item": "Survive the countdown — the wave zone anchors at your position. Enemies pour out of rifts. Wipe them out and the zone collapses. Every 4th wave adds a gun (up to 5).",
  "help.enemies": "TARGETS",
  "help.drone": "drone — a ramming swarm",
  "help.hunter": "hunter — predicts an intercept point; dodge with a sharp jink",
  "help.fighter": "fighter — strafes and fires bursts",
  "help.cruiser": "cruiser — heavy, keeps range and screens carriers",
  "help.carrier": "carrier — sits in the back and spawns drones",
  "help.bonuses": "BONUSES",
  "help.heal": "cross — hull repair +25 / +50 / +100%",
  "help.rate": "bolt — temporary fire rate +20 / +40 / +60% (20 seconds)",
  "help.gun": "barrels — extra gun (up to 5)",
  "help.asteroid": "asteroids — shoot the rocks: big ones split into smaller, dropping minerals",
  "help.allyDrone": "drone — an ally with its own hull, picks targets itself (up to 8). It can be shot down!",
  "help.dash": "dash — instant burst of speed; ram enemies with the hull (you take no damage)",
  "help.miner": "miner — drops a mine after a couple of seconds; fly out of its radius to detonate it",
  "help.back": "BACK",

  "debug.title": "DEVELOPER CONSOLE",
  "debug.note": "debug tools · changes persist",
  "debug.fps": "FPS COUNTER",
  "debug.fpsDesc": "frame rate readout over the game",
  "debug.details": "+1000 DETAILS",
  "debug.detailsDesc": "show extra debug info",
  "debug.god": "GOD MODE",
  "debug.godDesc": "player takes no damage",
  "debug.godOn": "GOD MODE ON",
  "debug.godOff": "GOD MODE OFF",
  "debug.wave": "START WAVE",
  "debug.waveDesc": "the run will begin on this wave",
  "debug.on": "ON",
  "debug.off": "OFF",
  "debug.back": "BACK",

  "upgrade.title": "UPGRADES",
  "upgrade.back": "BACK",
  "upgrade.partsLabel": "PARTS",
  "upgrade.hull": "HULL",
  "upgrade.hullDesc": "Permanently increases max HP",
  "upgrade.damage": "DAMAGE",
  "upgrade.damageDesc": "Permanently increases bullet damage",
  "upgrade.fireRate": "FIRE RATE",
  "upgrade.fireRateDesc": "Permanently increases fire rate",
  "upgrade.speed": "SPEED",
  "upgrade.speedDesc": "Permanently increases movement speed",
  "upgrade.guns": "GUNS",
  "upgrade.gunsDesc": "Adds permanent extra guns",
  "upgrade.drones": "DRONES",
  "upgrade.dronesDesc": "Adds permanent ally drones",
  "upgrade.dashCooldown": "DASH",
  "upgrade.dashCooldownDesc": "Increases dash duration",

  "hud.wave": "WAVE",
  "hud.scoreLabel": "SCORE",
  "hud.best": "BEST {v}",
  "hud.cleared": "CLEARED {k} / {t}",
  "hud.clearedShort": "{k}/{t}",
  "hud.hull": "HULL",
  "hud.time": "T+{t}",
  "hud.status": "GUNS {g} · DRONES {d}/8",
  "hud.statusBoost": "FIRE RATE +{p}% · {s}S",
  "hud.godChip": "GOD MODE",

  "game.waveN": "WAVE: {n}",
  "game.countdown": "LAUNCH IN",
  "game.waveCleared": "WAVE CLEARED",
  "game.signalLost": "SIGNAL LOST",
  "game.transmissionLost": "TRANSMISSION ENDED",
  "game.newRecord": "NEW RECORD",
  "game.hull": "HULL",
  "game.hullMax": "HULL FULL",
  "game.rate": "FIRE RATE +{p}% · {s}S",
  "game.drone": "DRONE {i}/8",
  "game.droneMax": "SWARM FULL +400",
  "game.droneLost": "DRONE LOST",
  "game.dash": "DASH!",
  "game.mineReady": "MINER ARMED",
  "game.minePlaced": "MINE PLACED",
  "game.mineral": "MINERAL",
  "game.gun": "GUN {g}/5",
  "game.gunMax": "ARSENAL FULL +300",
  "game.arsenal": "ARSENAL EXPANDED",
  "game.points": "+{v}",
  "game.zoneEdge": "STAY INSIDE THE WAVE ZONE",

  "over.title": "SIGNAL LOST",
  "over.sub": "TRANSMISSION ENDED",
  "over.score": "SCORE",
  "over.best": "BEST",
  "over.wave": "WAVE",
  "over.kills": "TARGETS DESTROYED",
  "over.time": "TIME IN SECTOR",
  "over.retry": "RETRY",
  "over.menu": "MENU",

  "pause.title": "PAUSED",
  "pause.resume": "RESUME",
  "pause.settings": "SETTINGS",
  "pause.menu": "EXIT TO MENU",

  "toast.drone": "NEW TARGET: DRONE",
  "toast.hunter": "NEW TARGET: HUNTER",
  "toast.fighter": "NEW TARGET: FIGHTER",
  "toast.cruiser": "NEW TARGET: CRUISER",
  "toast.carrier": "NEW TARGET: CARRIER",
};

export type TKey = keyof Dict;

const dicts: Record<Lang, Dict> = { ru, en };

let lang: Lang = "ru";
try {
  const saved = localStorage.getItem(LS_KEY);
  if (saved === "ru" || saved === "en") lang = saved;
} catch {
  /* ignore */
}

const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  if (lang === l) return;
  lang = l;
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {
    /* ignore */
  }
  listeners.forEach((f) => f());
}

export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? dicts.ru[key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split(`{${k}}`).join(String(params[k]));
    }
  }
  return s;
}

/* ---- React binding ---- */

import { useSyncExternalStore } from "react";

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang
  );
}

/** Re-renders the component on language change and returns t(). */
export function useT() {
  useLang();
  return t;
}
