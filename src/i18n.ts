import { useSyncExternalStore } from "react";

export type Lang = "ru" | "en";

const LS_KEY = "rift9_lang";

const ru: Dict = {
  "app.title": "РАЗЛОМ // СЕКТОР-9",
  "menu.subtitle": "ОБОРОНА СЕКТОРА-9",
  "menu.play": "ИГРАТЬ",
  "menu.settings": "НАСТРОЙКИ",
  "menu.help": "ПОМОЩЬ",
  "menu.debug": "ОТЛАДКА",
  "settings.title": "НАСТРОЙКИ",
  "settings.master": "ОБЩАЯ ГРОМКОСТЬ",
  "settings.sfx": "ЗВУКОВЫЕ ЭФФЕКТЫ",
  "settings.music": "МУЗЫКА",
  "settings.test": "ТЕСТ ЗВУКА",
  "settings.lang": "ЯЗЫК",
  "settings.back": "НАЗАД",
  "help.title": "ПОМОЩЬ",
  "help.controls": "УПРАВЛЕНИЕ",
  "help.move": "движение корабля",
  "help.pause": "пауза",
  "help.touch": "На сенсорных экранах: удерживай и веди палец по экрану — корабль летит за вектором.",
  "help.objective": "ЗАДАЧА",
  "help.item": "После отсчёта вокруг корабля развернётся красная зона волны. Из разломов появятся враги — уничтожь их всех. Турель целится сама, тебе остаётся маневрировать.",
  "help.enemies": "ПРОТИВНИКИ",
  "help.drone": "дрон — рой, идущий на таран",
  "help.hunter": "ищейка — рассчитывает точку перехвата; уворачивайся рывком",
  "help.fighter": "истребитель — держит дистанцию и ведёт огонь очередями",
  "help.cruiser": "крейсер — тяжёлый, окружает и прикрывает дрононосцев",
  "help.carrier": "дрононосец — держится в тылу и выпускает дроны",
  "help.asteroid": "астероиды — расстреливай скалы: крупные раскалываются на мелкие, из них выпадают минералы",
  "help.bonuses": "БОНУСЫ",
  "help.heal": "крест — ремонт корпуса: +25 / +50 / +100%",
  "help.rate": "молния — временный темп огня +20 / +40 / +60% (20 секунд)",
  "help.gun": "стволы — дополнительное орудие (до 5)",
  "help.allyDrone": "дрон — помощник со своим корпусом, сам выбирает цели (до 8). Его могут сбить!",
  "help.dash": "стрела — рывок: ускорение и таран врагов на 3 секунды",
  "help.miner": "мина — сбрасывается автоматически и взрывается, когда ты покидаешь радиус",
  "help.back": "НАЗАД",
  "pause.title": "ПАУЗА",
  "pause.resume": "ПРОДОЛЖИТЬ",
  "pause.settings": "НАСТРОЙКИ",
  "pause.menu": "В МЕНЮ",
  "over.sub": "ПЕРЕДАЧА ПРЕРВАНА",
  "over.title": "СИГНАЛ ПОТЕРЯН",
  "over.score": "СЧЁТ",
  "over.best": "РЕКОРД",
  "over.wave": "ВОЛНА",
  "over.kills": "ЦЕЛЕЙ УНИЧТОЖЕНО",
  "over.time": "ВРЕМЯ В СЕКТОРЕ",
  "over.retry": "ЕЩЁ РАЗ",
  "over.menu": "В МЕНЮ",
  "hud.wave": "ВОЛНА",
  "hud.scoreLabel": "СЧЁТ",
  "hud.best": "РЕКОРД {v}",
  "hud.hull": "КОРПУС",
  "hud.status": "ОРУДИЯ {g} · ДРОНЫ {d}/8",
  "hud.statusBoost": "ТЕМП ОГНЯ +{p}% · {s}С",
  "hud.godChip": "БЕССМЕРТИЕ",
  "hud.minerals": "МИНЕРАЛЫ",
  "game.waveN": "ВОЛНА: {n}",
  "game.countdown": "СТАРТ ЧЕРЕЗ",
  "game.waveCleared": "ВОЛНА ЗАЧИЩЕНА",
  "game.signalLost": "СИГНАЛ ПОТЕРЯН",
  "game.newRecord": "НОВЫЙ РЕКОРД",
  "game.hull": "КОРПУСА",
  "game.riftOpen": "РАЗЛОМ ОТКРЫТ",
  "game.rate": "ТЕМП ОГНЯ +{p}% · {s}С",
  "game.gun": "НОВОЕ ОРУДИЕ",
  "game.gunMax": "АРСЕНАЛ ПОЛОН +300",
  "game.drone": "ДРОН {i}/8",
  "game.droneMax": "РОЙ ПОЛОН +400",
  "game.droneLost": "ДРОН ПОТЕРЯН",
  "game.dash": "РЫВОК!",
  "game.mineReady": "МИНЕР ЗАРЯЖЕН",
  "game.minePlaced": "МИНА УСТАНОВЛЕНА",
  "game.mineral": "МИНЕРАЛ",
  "game.zoneEdge": "НЕ ПОКИДАЙ ЗОНУ ВОЛНЫ",
  "toast.drone": "НОВАЯ ЦЕЛЬ: ДРОН",
  "toast.hunter": "НОВАЯ ЦЕЛЬ: ИЩЕЙКА",
  "toast.fighter": "НОВАЯ ЦЕЛЬ: ИСТРЕБИТЕЛЬ",
  "toast.cruiser": "НОВАЯ ЦЕЛЬ: КРЕЙСЕР",
  "toast.carrier": "НОВАЯ ЦЕЛЬ: ДРОНОНОСЕЦ",
  "debug.title": "ПАНЕЛЬ РАЗРАБОТЧИКА",
  "debug.note": "инструменты отладки",
  "debug.fps": "СЧЁТЧИК FPS",
  "debug.fpsDesc": "показывать частоту кадров поверх игры",
  "debug.god": "БЕССМЕРТИЕ",
  "debug.godDesc": "игрок не получает урон",
  "debug.wave": "СТАРТОВАЯ ВОЛНА",
  "debug.waveDesc": "игра начнётся с этой волны",
  "debug.back": "НАЗАД",
  "debug.on": "ВКЛ",
  "debug.off": "ВЫКЛ",
  "debug.godOn": "БЕССМЕРТИЕ ВКЛЮЧЕНО",
  "debug.godOff": "БЕССМЕРТИЕ ВЫКЛЮЧЕНО",
  "touch.hint": "УДЕРЖИВАЙ И ВЕДИ ПАЛЕЦ — ДВИЖЕНИЕ",
};

const en: Dict = {
  "app.title": "RIFT // SECTOR-9",
  "menu.subtitle": "SECTOR-9 DEFENSE",
  "menu.play": "PLAY",
  "menu.settings": "SETTINGS",
  "menu.help": "HELP",
  "menu.debug": "DEBUG",
  "settings.title": "SETTINGS",
  "settings.master": "MASTER VOLUME",
  "settings.sfx": "SOUND EFFECTS",
  "settings.music": "MUSIC",
  "settings.test": "TEST SOUND",
  "settings.lang": "LANGUAGE",
  "settings.back": "BACK",
  "help.title": "HELP",
  "help.controls": "CONTROLS",
  "help.move": "ship movement",
  "help.pause": "pause",
  "help.touch": "On touch screens: hold and drag a finger — the ship follows the vector.",
  "help.objective": "OBJECTIVE",
  "help.item": "After the countdown a red wave zone deploys around your ship. Rifts will open and release enemies — destroy them all. The turret aims on its own; you just maneuver.",
  "help.enemies": "HOSTILES",
  "help.drone": "drone — a ramming swarm",
  "help.hunter": "hunter — predicts an intercept point; dodge with a sharp jink",
  "help.fighter": "fighter — keeps range and fires in bursts",
  "help.cruiser": "cruiser — heavy, surrounds you and escorts carriers",
  "help.carrier": "carrier — stays in the rear and releases drones",
  "help.asteroid": "asteroids — shoot the rocks: big ones split into smaller, dropping minerals",
  "help.bonuses": "BONUSES",
  "help.heal": "cross — hull repair: +25 / +50 / +100%",
  "help.rate": "bolt — temporary fire rate +20 / +40 / +60% (20 seconds)",
  "help.gun": "barrels — extra gun (up to 5)",
  "help.allyDrone": "drone — an ally with its own hull, picks targets itself (up to 8). It can be shot down!",
  "help.dash": "arrow — dash: speed burst and ramming for 3 seconds",
  "help.miner": "mine — drops automatically and detonates once you leave its radius",
  "help.back": "BACK",
  "pause.title": "PAUSED",
  "pause.resume": "RESUME",
  "pause.settings": "SETTINGS",
  "pause.menu": "MAIN MENU",
  "over.sub": "TRANSMISSION ENDED",
  "over.title": "SIGNAL LOST",
  "over.score": "SCORE",
  "over.best": "BEST",
  "over.wave": "WAVE",
  "over.kills": "TARGETS DESTROYED",
  "over.time": "TIME IN SECTOR",
  "over.retry": "RETRY",
  "over.menu": "MAIN MENU",
  "hud.wave": "WAVE",
  "hud.scoreLabel": "SCORE",
  "hud.best": "BEST {v}",
  "hud.hull": "HULL",
  "hud.status": "GUNS {g} · DRONES {d}/8",
  "hud.statusBoost": "FIRE RATE +{p}% · {s}S",
  "hud.godChip": "GOD MODE",
  "hud.minerals": "MINERALS",
  "game.waveN": "WAVE: {n}",
  "game.countdown": "LAUNCH IN",
  "game.waveCleared": "WAVE CLEARED",
  "game.signalLost": "SIGNAL LOST",
  "game.newRecord": "NEW RECORD",
  "game.hull": "HULL",
  "game.riftOpen": "RIFT OPENED",
  "game.rate": "FIRE RATE +{p}% · {s}S",
  "game.gun": "NEW GUN",
  "game.gunMax": "ARSENAL FULL +300",
  "game.drone": "DRONE {i}/8",
  "game.droneMax": "SWARM FULL +400",
  "game.droneLost": "DRONE LOST",
  "game.dash": "DASH!",
  "game.mineReady": "MINER ARMED",
  "game.minePlaced": "MINE PLACED",
  "game.mineral": "MINERAL",
  "game.zoneEdge": "STAY INSIDE THE WAVE ZONE",
  "toast.drone": "NEW TARGET: DRONE",
  "toast.hunter": "NEW TARGET: HUNTER",
  "toast.fighter": "NEW TARGET: FIGHTER",
  "toast.cruiser": "NEW TARGET: CRUISER",
  "toast.carrier": "NEW TARGET: CARRIER",
  "debug.title": "DEV CONSOLE",
  "debug.note": "debugging tools",
  "debug.fps": "FPS COUNTER",
  "debug.fpsDesc": "show frame rate overlay",
  "debug.god": "GOD MODE",
  "debug.godDesc": "player takes no damage",
  "debug.wave": "START WAVE",
  "debug.waveDesc": "the run begins at this wave",
  "debug.back": "BACK",
  "debug.on": "ON",
  "debug.off": "OFF",
  "debug.godOn": "GOD MODE ON",
  "debug.godOff": "GOD MODE OFF",
  "touch.hint": "HOLD AND DRAG TO FLY",
};

interface Dict {
  [key: string]: string;
}

export type TKey = keyof Dict;

const dicts: Record<Lang, Dict> = { ru, en };

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(LS_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    /* ignore */
  }
  return (navigator.language || "ru").toLowerCase().startsWith("ru") ? "ru" : "en";
}

let lang: Lang = detectLang();
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
  listeners.forEach((fn) => fn());
  document.title = t("app.title");
}

export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split(`{${k}}`).join(String(params[k]));
    }
  }
  return s;
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

export function useT() {
  useLang();
  return t;
}

// set initial document title
if (typeof document !== "undefined") document.title = ru["app.title"];
