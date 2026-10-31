/**
 * Доменные словари локализации.
 *
 * Каждый модуль отдаёт вложенный объект для RU и EN. Ключи локализации
 * собираются из пути по объекту (`upgrade.weapon.reload`), поэтому
 * добавление текста не требует ручного дублирования плоских ключей.
 */

import * as app from "./app.ts";
import * as menu from "./menu.ts";
import * as settings from "./settings.ts";
import * as music from "./music.ts";
import * as help from "./help.ts";
import * as debug from "./debug.ts";
import * as upgrade from "./upgrade.ts";
import * as hud from "./hud.ts";
import * as game from "./game.ts";
import * as over from "./over.ts";
import * as pause from "./pause.ts";
import * as toast from "./toast.ts";
import * as common from "./common.ts";

export const ruNested = {
  app: app.ru,
  menu: menu.ru,
  settings: settings.ru,
  music: music.ru,
  help: help.ru,
  debug: debug.ru,
  upgrade: upgrade.ru,
  hud: hud.ru,
  game: game.ru,
  over: over.ru,
  pause: pause.ru,
  toast: toast.ru,
  common: common.ru,
};

export const enNested: typeof ruNested = {
  app: app.en,
  menu: menu.en,
  settings: settings.en,
  music: music.en,
  help: help.en,
  debug: debug.en,
  upgrade: upgrade.en,
  hud: hud.en,
  game: game.en,
  over: over.en,
  pause: pause.en,
  toast: toast.en,
  common: common.en,
};
