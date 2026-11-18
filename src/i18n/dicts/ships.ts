/**
 * Ангар: выбор корабля и его постоянные характеристики.
 */

export const ru = {
  title: "АНГАР",
  hint:
    "Корабль выбирается до забега и не меняется внутри него. Характеристики постоянные: " +
    "корпус и скорость — база для прокачки мастерской, слоты — потолок арсенала и дронов.",
  hull: "КОРПУС",
  speed: "СКОРОСТЬ",
  weaponSlots: "СЛОТЫ ОРУЖИЯ",
  droneSlots: "СЛОТЫ ДРОНОВ",
  startingWeapons: "НА СТАРТЕ",
  selected: "ВЫБРАН",
  select: "ВЫБРАТЬ",
  back: "НАЗАД",
  ships: {
    vanguard: {
      name: "АВАНГАРД",
      desc:
        "Базовый истребитель: ровные корпус и скорость, до 5 слотов оружия и 4 слотов дронов. " +
        "Стартует с пушкой.",
    },
    frigate: {
      name: "ФРЕГАТ",
      desc:
        "Носитель оружия: на 20% меньше корпуса и на 15% медленнее, зато до 6 слотов оружия, " +
        "5 слотов дронов и лазер уже на старте.",
    },
  },
};

export const en: typeof ru = {
  title: "HANGAR",
  hint:
    "The ship is chosen before a run and stays fixed during it. Its stats are permanent: hull " +
    "and speed are the base for workshop upgrades, slots cap the armory and drones.",
  hull: "HULL",
  speed: "SPEED",
  weaponSlots: "WEAPON SLOTS",
  droneSlots: "DRONE SLOTS",
  startingWeapons: "STARTING",
  selected: "SELECTED",
  select: "SELECT",
  back: "BACK",
  ships: {
    vanguard: {
      name: "VANGUARD",
      desc:
        "The baseline interceptor: balanced hull and speed, up to 5 weapon slots and 4 drone slots. " +
        "Starts with the cannon.",
    },
    frigate: {
      name: "FRIGATE",
      desc:
        "Weapon carrier: 20% less hull and 15% slower, but up to 6 weapon slots, 5 drone slots " +
        "and a laser from the start.",
    },
  },
};
