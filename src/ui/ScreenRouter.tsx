/**
 * ScreenRouter — единственное место выбора активного экрана.
 *
 * Вместо цепочки `screen === ...` в `App.tsx` роутер получает состояние и
 * набор действий и рендерит ровно один экран. Игровой экран (`game`) здесь
 * отсутствует: HUD и оверлеи живут отдельно и рисуются поверх канваса.
 */

import type { MutableRefObject } from "react";
import type { Game } from "../game/game";
import type { GameActions } from "../hooks/useGameActions";
import type { PersistentSettings } from "../hooks/usePersistentSettings";
import type { Screen } from "./appState";
import DebugScreen from "./screens/DebugScreen";
import HelpScreen from "./screens/HelpScreen";
import MainMenu from "./screens/MainMenu";
import MetaScreen from "./screens/MetaScreen";
import SettingsScreen from "./screens/SettingsScreen";
import { UpgradeScreen } from "./screens/upgrade/UpgradeScreen";

/**
 * Набор навигационных обработчиков, которые активный экран
 * регистрирует в общем ref для получения событий геймпада.
 */
export interface GamepadNavHandlers {
  up: () => void;
  down: () => void;
  left: () => void;
  right: () => void;
  /** Переключение вкладок L (LB/L1). */
  tabLeft?: () => void;
  /** Переключение вкладок R (RB/R1). */
  tabRight?: () => void;
  /** Подтверждение (A). Если null — App использует fallback-логику. */
  confirm: (() => void) | null;
  /**
   * Отмена (B). Если задано — экран перехватывает B (например, чтобы
   * закрыть выпадающий список вместо выхода с экрана).
   */
  cancel?: (() => void) | null;
}

export interface ScreenRouterProps {
  screen: Screen;
  best: number;
  urlDebug: boolean;
  gameRef: MutableRefObject<Game | null>;
  settings: PersistentSettings;
  actions: GameActions;
  /** Подключён ли геймпад. */
  isGamepad: boolean;
  /** Ref для регистрации навигационных обработчиков активного экрана. */
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}

export function ScreenRouter(props: ScreenRouterProps) {
  const {
    screen,
    best,
    urlDebug,
    gameRef,
    settings,
    actions,
    isGamepad,
    gamepadNavRef,
  } = props;

  switch (screen) {
    case "menu":
      return (
        <MainMenu
          best={best}
          onPlay={actions.startGame}
          onSettings={() => actions.openSettings("menu")}
          onHelp={actions.openHelp}
          onDebug={actions.openDebug}
          onMeta={() => actions.openMeta()}
          showDebug={urlDebug}
          isGamepad={isGamepad}
          gamepadNavRef={gamepadNavRef}
        />
      );

    case "settings":
      return (
        <SettingsScreen
          vols={settings.vols}
          onChange={actions.changeVols}
          menuTrack={settings.menuTrack}
          combatTrack={settings.combatTrack}
          onMenuTrackChange={actions.changeMenuTrack}
          onCombatTrackChange={actions.changeCombatTrack}
          onPreviewTrack={actions.previewTrack}
          onTest={actions.testSound}
          onReset={actions.resetProgress}
          onBack={actions.closeSettings}
          isGamepad={isGamepad}
          gamepadNavRef={gamepadNavRef}
        />
      );

    case "help":
      return (
        <HelpScreen
          onBack={actions.openMenu}
          isGamepad={isGamepad}
          gamepadNavRef={gamepadNavRef}
        />
      );

    case "debug":
      return (
        <DebugScreen
          fpsOn={settings.debugFps}
          godOn={settings.debugGod}
          startWave={settings.debugWave}
          detailsOn={settings.debugDetails}
          physicsEngine={settings.physicsEngine}
          onPhysicsEngineChange={actions.changePhysicsEngine}
          enabledEnemies={settings.enabledEnemies}
          onToggleEnemy={actions.toggleEnemy}
          enabledPickups={settings.enabledPickups}
          onTogglePickup={actions.togglePickup}
          onToggleFps={actions.toggleDebugFps}
          onToggleGod={actions.toggleDebugGod}
          onChangeWave={actions.changeDebugWave}
          onToggleDetails={actions.toggleDebugDetails}
          onTestLevel={actions.startTestLevel}
          onBack={actions.openMenu}
        />
      );

    case "hangar":
      return (
        <UpgradeScreen
          game={gameRef.current}
          detailsOn={settings.debugDetails}
          onBack={actions.closeHangar}
          isGamepad={isGamepad}
          gamepadNavRef={gamepadNavRef}
          variant="hangar"
        />
      );

    case "meta":
      return (
        <MetaScreen onBack={actions.closeMeta} gamepadNavRef={gamepadNavRef} />
      );

    default:
      return null;
  }
}
