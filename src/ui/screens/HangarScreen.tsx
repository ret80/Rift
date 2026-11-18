/**
 * HangarScreen — ангар: выбор корабля перед забегом.
 *
 * Корабль задаёт постоянные характеристики всего забега: корпус, скорость,
 * потолок слотов оружия/дронов и стартовый арсенал. Выбор сохраняется сразу,
 * поэтому следующий забег начинается именно на нём.
 */

import { useCallback, useEffect, useMemo, useState, type MutableRefObject } from "react";
import type { Game } from "../../game/game";
import { DEFAULT_PARAMS } from "../../game/balance/params/GameParams";
import { PLAYER_MAX_SPEED } from "../../game/balance/player";
import { createLocalStoragePort } from "../../game/core/PersistencePort";
import { noMetaBonuses } from "../../game/meta/types";
import { SHIP_IDS, shipDef, type ShipId } from "../../game/ships/ShipCatalog";
import { loadSelectedShip, saveSelectedShip } from "../../game/ships/ShipStorage";
import { applyUpgrades, defaultUpgrades } from "../../game/upgrades";
import { useGamepadFocus } from "../../hooks/useGamepadFocus";
import { useT, type TKey } from "../../i18n";
import GameButton from "../components/GameButton";
import ScreenHeader from "../components/ScreenHeader";
import type { GamepadNavHandlers } from "../ScreenRouter";
import { gamepadFocusStyle } from "./upgrade/model";

/** Строка характеристики корабля. */
function StatRow(props: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[9px] tracking-[0.12em] text-[#6f86a8]">{props.label}</span>
      <span className={props.accent ? "text-[#7dff9e]" : "text-[#eaffff]"}>{props.value}</span>
    </div>
  );
}

export default function HangarScreen(props: {
  game: Game | null;
  onBack: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const storage = useMemo(() => createLocalStoragePort(), []);
  const [selected, setSelected] = useState<ShipId>(
    () => props.game?.getSelectedShip().id ?? loadSelectedShip(storage),
  );

  /** Выбрать корабль: игра применяет и сохраняет выбор, без игры — только сохранение. */
  const choose = useCallback((id: ShipId) => {
    setSelected(id);
    if (props.game) props.game.selectShip(id);
    else saveSelectedShip(storage, id);
  }, [props.game, storage]);

  const { focusIndex, onNavUp, onNavDown } = useGamepadFocus({
    count: SHIP_IDS.length,
    initialIndex: Math.max(0, SHIP_IDS.indexOf(selected)),
  });

  useEffect(() => {
    props.gamepadNavRef.current = {
      up: onNavUp,
      down: onNavDown,
      left: () => {},
      right: () => {},
      confirm: () => choose(SHIP_IDS[focusIndex]),
      cancel: props.onBack,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [onNavUp, onNavDown, choose, focusIndex, props.onBack, props.gamepadNavRef]);

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("ships.title")}
    >
      <div className="flex max-h-[92vh] w-[min(680px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          <ScreenHeader title={t("ships.title")} />

          <p className="px-5 pt-4 text-[11px] leading-5 text-[#9db4d6] sm:px-7">
            {t("ships.hint")}
          </p>

          <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto px-5 py-4 sm:grid-cols-2 sm:px-7">
            {SHIP_IDS.map((id, index) => {
              const ship = shipDef(id);
              const applied = applyUpgrades(
                defaultUpgrades(),
                noMetaBonuses(),
                DEFAULT_PARAMS.player,
                ship,
              );
              const isSelected = id === selected;
              const focused = props.isGamepad && focusIndex === index;
              return (
                <div
                  key={id}
                  className={
                    "flex flex-col rounded border p-3 transition-colors " +
                    (isSelected
                      ? "border-[#5ef2ff]/60 bg-[#5ef2ff]/8"
                      : "border-[#3d4f6d]/40 bg-[#04070d]/40")
                  }
                  data-gamepad-focused={focused ? "true" : undefined}
                  style={gamepadFocusStyle(focused)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-display text-sm text-[#eaffff]">
                      {t(`ships.ships.${id}.name` as TKey)}
                    </div>
                    {isSelected && (
                      <span className="shrink-0 font-mono text-[9px] tracking-[0.15em] text-[#7dff9e]">
                        {t("ships.selected")}
                      </span>
                    )}
                  </div>

                  {/* Предпросмотр силуэта: тот же корпус, что рисуется в бою. */}
                  <svg
                    viewBox="-22 -16 44 32"
                    className="mx-auto mt-2 h-16 w-24"
                    aria-hidden="true"
                  >
                    <polygon
                      points={ship.hull.map(([x, y]) => `${x},${-y}`).join(" ")}
                      fill="rgba(94,242,255,0.12)"
                      stroke="#5ef2ff"
                      strokeWidth={1}
                    />
                  </svg>

                  <p className="mt-1 text-[10px] leading-4 text-[#6f86a8]">
                    {t(`ships.ships.${id}.desc` as TKey)}
                  </p>

                  <div className="mt-2 flex flex-col gap-1 font-mono text-[10px]">
                    <StatRow label={t("ships.hull")} value={`${applied.baseHp}`} />
                    <StatRow
                      label={t("ships.speed")}
                      value={`${Math.round(PLAYER_MAX_SPEED * ship.speedMult)}`}
                    />
                    <StatRow
                      label={t("ships.weaponSlots")}
                      value={`${ship.weaponSlotsMax}`}
                      accent={ship.weaponSlotsMax > 5}
                    />
                    <StatRow
                      label={t("ships.droneSlots")}
                      value={`${ship.droneSlotsMax}`}
                      accent={ship.droneSlotsMax > 4}
                    />
                    <StatRow
                      label={t("ships.startingWeapons")}
                      value={ship.startingWeapons
                        .map((weapon) => t(`upgrade.weapon.${weapon}` as TKey))
                        .join(" + ")}
                    />
                  </div>

                  <GameButton
                    onClick={() => choose(id)}
                    variant={isSelected ? "amber" : "cyan"}
                    disabled={isSelected}
                    className="mt-3 w-full px-3 py-1 text-[11px]"
                  >
                    {isSelected ? t("ships.selected") : t("ships.select")}
                  </GameButton>
                </div>
              );
            })}
          </div>

          <div className="border-t border-[#5ef2ff]/15 px-5 py-3 sm:px-7">
            <div className="flex justify-center">
              <GameButton onClick={props.onBack} variant="amber">
                {t("ships.back")}
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
