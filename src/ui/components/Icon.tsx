import React from "react";
import type { LoadoutIcon } from "../../game/loadout/LoadoutTypes";

/* ======================== Icon ========================
 * Unified icon component replacing duplicated EnemyIcon,
 * PickupIcon, and UpgradeIcon patterns across the codebase.
 */

export type IconKind =
  /* help screen enemies */
  | "enemy-drone"
  | "enemy-hunter"
  | "enemy-fighter"
  | "enemy-cruiser"
  | "enemy-carrier"
  /* help screen pickups */
  | "pickup-heal"
  | "pickup-rate"
  | "pickup-gun"
  | "pickup-drone"
  | "pickup-mineral"
  /* upgrade screen */
  | "upgrade-hull"
  | "upgrade-speed"
  | "upgrade-guns"
  | "upgrade-drones"
  | "upgrade-shieldPercent"
  | "upgrade-shieldRegen"
  /* drones */
  | "drone-scout"
  | "drone-striker"
  | "drone-sentry"
  /* HUD loadout row */
  | LoadoutIcon;

/* ======================== Icon ======================== */

const ENEMY_COLORS: Record<string, string> = {
  "enemy-drone": "#ff5d7e",
  "enemy-hunter": "#d8ff3e",
  "enemy-fighter": "#ff8c42",
  "enemy-cruiser": "#b06bff",
  "enemy-carrier": "#ff5da2",
};

const PICKUP_COLORS: Record<string, string> = {
  "pickup-heal": "#7dffb8",
  "pickup-rate": "#ff8c42",
  "pickup-gun": "#5ef2ff",
  "pickup-drone": "#9dffe8",
  "pickup-mineral": "#7dffb8",
  "pickup-shield": "#66e0ff",
  "ability-quantum-swap": "#7cf3ff",
};

const UPGRADE_COLORS: Record<string, string> = {
  "upgrade-hull": "#5ef2ff",
  "upgrade-speed": "#7dff9e",
  "upgrade-guns": "#5ef2ff",
  "upgrade-drones": "#c06bff",
  "upgrade-shieldPercent": "#66e0ff",
  "upgrade-shieldRegen": "#7cf3ff",
};

const DRONE_COLORS: Record<string, string> = {
  "drone-scout": "#ff9de0",
  "drone-striker": "#ff5c54",
  "drone-sentry": "#7dff9e",
};

function getIconColor(kind: IconKind): string {
  return (
    ENEMY_COLORS[kind] ??
    PICKUP_COLORS[kind] ??
    UPGRADE_COLORS[kind] ??
    DRONE_COLORS[kind] ??
    "#ffffff"
  );
}

function getIconPaths(kind: IconKind): React.ReactNode {
  switch (kind) {
    /* Enemies */
    case "enemy-drone":
      return <polygon points="12,2 22,12 12,22 2,12" />;
    case "enemy-hunter":
      return <polyline points="2,12 22,6 16,12 22,18" />;
    case "enemy-fighter":
      return <polyline points="2,12 22,4 15,12 22,20" />;
    case "enemy-cruiser":
      return <polygon points="2,12 8,4 20,4 22,12 20,20 8,20" />;
    case "enemy-carrier":
      return <polygon points="2,12 7,3 21,3 23,12 21,21 7,21" />;

    /* Pickups */
    case "pickup-heal":
      return (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </>
      );
    case "pickup-rate":
      return <polyline points="13,3 7,13 12,13 11,21 17,11 12,11" />;
    case "pickup-gun":
      return (
        <>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="4" y1="9" x2="4" y2="15" />
        </>
      );
    case "pickup-drone":
      return (
        <>
          <polygon points="12,4 20,16 12,13 4,16" />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </>
      );
    case "pickup-mineral":
      return (
        <>
          <polygon points="12,3 19,8 16,20 8,20 5,8" />
          <line x1="12" y1="3" x2="12" y2="20" strokeOpacity="0.4" />
        </>
      );

    /* Upgrades */
    case "upgrade-hull":
      return (
        <>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <line x1="12" y1="6" x2="12" y2="18" strokeOpacity="0.4" />
          <line x1="8" y1="12" x2="16" y2="12" strokeOpacity="0.4" />
        </>
      );
    case "upgrade-speed":
      return <path d="M3 12 L12 3 L12 8 L21 3 L21 21 L12 16 L12 21 Z" />;
    case "upgrade-guns":
      return (
        <>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="4" y1="9" x2="4" y2="15" />
        </>
      );
    case "upgrade-drones":
      return (
        <>
          <polygon points="12,4 20,16 12,13 4,16" />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </>
      );
    case "upgrade-shieldPercent":
      return (
        <>
          <path d="M12 3 L20 7 V13 C20 17 16 20 12 21 C8 20 4 17 4 13 V7 Z" />
          <path d="M12 8 V16" strokeOpacity="0.5" />
        </>
      );
    case "upgrade-shieldRegen":
      return (
        <>
          <path d="M12 3 L20 7 V13 C20 17 16 20 12 21 C8 20 4 17 4 13 V7 Z" />
          <polyline points="9,12 11,15 15,9" />
        </>
      );

    /* Drones */
    case "drone-scout":
      return (
        <>
          <polygon points="12,4 20,16 12,13 4,16" />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </>
      );
    case "drone-striker":
      return (
        <>
          <polygon points="6,4 18,4 20,12 12,20 4,12" />
          <line x1="12" y1="4" x2="12" y2="20" strokeOpacity="0.4" />
        </>
      );
    case "drone-sentry":
      return (
        <>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2.4" />
          <line x1="12" y1="3" x2="12" y2="7" />
          <line x1="12" y1="17" x2="12" y2="21" />
          <line x1="3" y1="12" x2="7" y2="12" />
          <line x1="17" y1="12" x2="21" y2="12" />
        </>
      );

    /* Loadout row */
    case "weapon-cannon":
      return (
        <>
          <circle cx="7" cy="12" r="4.5" />
          <line x1="11" y1="12" x2="21" y2="12" />
          <line x1="4" y1="18" x2="10" y2="18" strokeOpacity="0.55" />
        </>
      );
    case "weapon-missile":
      return (
        <>
          <path d="M12 2 L16 8 L16 16 L12 18 L8 16 L8 8 Z" />
          <line x1="8" y1="12" x2="4" y2="17" />
          <line x1="16" y1="12" x2="20" y2="17" />
          <circle cx="12" cy="8" r="1.4" strokeOpacity="0.7" />
        </>
      );
    case "weapon-laser":
      return (
        <>
          <line x1="3" y1="12" x2="16" y2="12" />
          <line x1="16" y1="12" x2="21" y2="8" strokeOpacity="0.75" />
          <line x1="16" y1="12" x2="21" y2="16" strokeOpacity="0.75" />
          <circle cx="3" cy="12" r="1.6" />
        </>
      );
    case "pickup-shield":
      return (
        <>
          <path d="M12 3 L20 7 V13 C20 17 16 20 12 21 C8 20 4 17 4 13 V7 Z" />
          <path d="M12 7 V17" strokeOpacity="0.45" />
        </>
      );
    case "ability-quantum-swap":
      return (
        <>
          <polyline points="4,8 9,8 4,13 9,13" />
          <polyline points="20,16 15,16 20,11 15,11" />
          <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.4" />
        </>
      );
    default:
      return <circle cx="12" cy="12" r="8" />;
  }
}

export interface IconProps {
  kind: IconKind;
  size?: number;
  className?: string;
  /** Overrides the default colour of the kind. */
  color?: string;
}

export function Icon({ kind, size = 24, className, color }: IconProps) {
  const stroke = color ?? getIconColor(kind);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      fill="none"
      stroke={stroke}
      strokeWidth="1.6"
    >
      {getIconPaths(kind)}
    </svg>
  );
}
