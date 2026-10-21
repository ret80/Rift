import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import type { LoadoutKind, LoadoutSlotData } from "../../game/balance/loadout";
import { useT, type TKey } from "../../i18n";
import { Icon, type IconKind } from "./Icon";

/* ============================================================
   LoadoutBar — row of weapon / bonus icons under the top HUD bar.

   Each slot is an icon wrapped in a ring:
     • weapon  → the ring fills up as the weapon recharges
     • bonus   → the ring drains as the bonus lifetime runs out
     • instant → no timer, the icon flashes briefly and disappears

   The row is updated imperatively (once per frame) so the HUD never
   re-renders React state at 60 fps.
   ============================================================ */

/** Ring radius — must match `.loadout-ring` in index.css. */
const RING_R = 12;
/** Ring circumference, used for the stroke-dasharray trick. */
const RING_C = 2 * Math.PI * RING_R;

const SLOT_ICON: Record<LoadoutKind, IconKind> = {
  cannon: "weapon-cannon",
  missile: "weapon-missile",
  drone: "pickup-drone",
  rate: "pickup-rate",
  guns: "pickup-gun",
  dash: "bonus-dash",
  mine: "bonus-mine",
  heal: "pickup-heal",
  mineral: "pickup-mineral",
};

/** Slot colours — match the in-world pickup palette. */
const SLOT_COLOR: Record<LoadoutKind, string> = {
  cannon: "#5ef2ff",
  missile: "#9dffe8",
  drone: "#ff9de0",
  rate: "#ff8c42",
  guns: "#5ef2ff",
  dash: "#ffd23e",
  mine: "#ff7a45",
  heal: "#7dffb8",
  mineral: "#7dffb8",
};

const SLOT_LABEL: Record<LoadoutKind, TKey> = {
  cannon: "hud.loadout.cannon",
  missile: "hud.loadout.missile",
  drone: "hud.loadout.drone",
  rate: "hud.loadout.rate",
  guns: "hud.loadout.guns",
  dash: "hud.loadout.dash",
  mine: "hud.loadout.mine",
  heal: "hud.loadout.heal",
  mineral: "hud.loadout.mineral",
};

export interface LoadoutBarHandle {
  /** Push the current slots. Called once per frame by the HUD updater. */
  update(slots: LoadoutSlotData[]): void;
}

export const LoadoutBar = forwardRef<LoadoutBarHandle>(function LoadoutBar(_props, ref) {
  const t = useT();
  const [kinds, setKinds] = useState<LoadoutKind[]>([]);
  const arcs = useRef(new Map<LoadoutKind, SVGCircleElement>());
  const signature = useRef("");

  useImperativeHandle(
    ref,
    () => ({
      update(slots: LoadoutSlotData[]) {
        // React only re-renders when the set of visible slots changes.
        const sig = slots.map((s) => s.kind).join("|");
        if (sig !== signature.current) {
          signature.current = sig;
          setKinds(slots.map((s) => s.kind));
        }
        // Ring fill is written straight to the DOM every frame.
        for (const s of slots) {
          const arc = arcs.current.get(s.kind);
          if (!arc) continue;
          arc.style.strokeDashoffset = String(RING_C * (1 - s.progress));
        }
      },
    }),
    [],
  );

  const registerArc = useCallback((kind: LoadoutKind, el: SVGCircleElement | null) => {
    if (el) arcs.current.set(kind, el);
    else arcs.current.delete(kind);
  }, []);

  return (
    <div className="loadout-bar">
      {kinds.map((kind) => (
        <div key={kind} className="loadout-slot" style={{ color: SLOT_COLOR[kind] }} title={t(SLOT_LABEL[kind])}>
          <svg className="loadout-ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <circle className="loadout-track" cx="15" cy="15" r={RING_R} />
            <circle
              ref={(el) => registerArc(kind, el)}
              className="loadout-arc"
              cx="15"
              cy="15"
              r={RING_R}
              transform="rotate(-90 15 15)"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C}
            />
          </svg>
          <Icon
            kind={SLOT_ICON[kind]}
            size={17}
            color={SLOT_COLOR[kind]}
            className="loadout-icon"
          />
        </div>
      ))}
    </div>
  );
});
