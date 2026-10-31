/**
 * ScreenRouter — единственное место выбора активного экрана.
 *
 * Вместо цепочки `screen === ...` в `App.tsx` роутер получает состояние и
 * набор действий и рендерит ровно один экран. Игровой экран (`game`) здесь
 * отсутствует: HUD и оверлеи живут отдельно и рисуются поверх канваса.
 */

import type { MutableRefObject } from "react";
import type { Game } from "../game/game";
import type { PersistentSettings } from "../hooks/usePersistentSettings";
import type { GameActions } from "../hooks/useGameActions";
import type { Screen } from "./appState";
import MainMenu from "./screens/MainMenu";
import SettingsScreen from "./screens/SettingsScreen";
import HelpScreen from "./screens/HelpScreen";
import DebugScreen from "./screens/DebugScreen";
import { UpgradeScreen } from "./upgrade/UpgradeScreen";

export interface ScreenRouterProps {
  screen: Screen;
  best: number;
  urlDebug: boolean;
  gameRef: MutableRefObject<Game | null>;
  settings: PersistentSettings;
  actions: GameActions;
}

export function ScreenRouter(props: ScreenRouterProps) {
  const { screen, best, urlDebug, gameRef, settings, actions } = props;

  switch (screen) {
    case "menu":
      return (
        <MainMenu
          best={best}
          onPlay={actions.startGame}
          onSettings={() => actions.openSettings("menu")}
          onHelp={actions.openHelp}
          onDebug={actions.openDebug}
          onUpgrade={() => actions.openUpgrade("menu")}
          showDebug={urlDebug}
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
          physicsEngine={settings.physicsEngine}
          onPhysicsEngineChange={actions.changePhysicsEngine}
          onTest={actions.testSound}
          onReset={actions.resetProgress}
          onBack={actions.closeSettings}
        />
      );

    case "help":
      return <HelpScreen onBack={actions.openMenu} />;

    case "debug":
      return (
        <DebugScreen
          fpsOn={settings.debugFps}
          godOn={settings.debugGod}
          startWave={settings.debugWave}
          detailsOn={settings.debugDetails}
          enabledEnemies={settings.enabledEnemies}
          onToggleEnemy={actions.toggleEnemy}
          enabledPickups={settings.enabledPickups}
          onTogglePickup={actions.togglePickup}
          onToggleFps={actions.toggleDebugFps}
          onToggleGod={actions.toggleDebugGod}
          onChangeWave={actions.changeDebugWave}
          onToggleDetails={actions.toggleDebugDetails}
          onBack={actions.openMenu}
        />
      );

    case "upgrade":
      return (
        <UpgradeScreen
          game={gameRef.current}
          detailsOn={settings.debugDetails}
          onBack={actions.closeUpgrade}
        />
      );

    default:
      return null;
  }
}
