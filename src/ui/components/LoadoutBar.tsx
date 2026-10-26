import React, { forwardRef, useCallback, useImperativeHandle, useRef, useState } from "react";
import type { LoadoutSlotData, LoadoutSlotKind } from "../../game/loadout/LoadoutTypes";
import { useT } from "../../i18n";
import { Icon } from "./Icon";

/* ============================================================
   LoadoutBar — row of weapon / bonus icons under the top HUD bar.

   Each slot is an icon wrapped in a ring:
     • weapon  → the ring fills up as the weapon recharges
     • bonus   → the ring drains as the bonus lifetime runs out
     • instant → no timer, the icon flashes briefly and disappears

   The appearance of a slot (icon, colour, tooltip) comes from the
   game module — the bar only draws what it is given.

   The row is updated imperatively (once per frame) so the HUD never
   re-renders React state at 60 fps.
   ============================================================ */

/** Ring radius — must match `.loadout-ring` in index.css. */
const RING_R = 12;
/** Ring circumference, used for the stroke-dasharray trick. */
const RING_C = 2 * Math.PI * RING_R;

export interface LoadoutBarHandle {
  /** Push the current slots. Called once per frame by the HUD updater. */
  update(slots: LoadoutSlotData[]): void;
}

export const LoadoutBar = forwardRef<LoadoutBarHandle>(function LoadoutBar(_props, ref) {
  const t = useT();
  const [slots, setSlots] = useState<LoadoutSlotData[]>([]);
  const arcs = useRef(new Map<LoadoutSlotKind, SVGCircleElement>());
  const signature = useRef("");

  useImperativeHandle(
    ref,
    () => ({
      update(next: LoadoutSlotData[]) {
        // React only re-renders when the set of visible slots changes.
        const sig = next.map((s) => s.kind).join("|");
        if (sig !== signature.current) {
          signature.current = sig;
          setSlots(next);
        }
        // Ring fill is written straight to the DOM every frame.
        for (const s of next) {
          const arc = arcs.current.get(s.kind);
          if (!arc) continue;
          arc.style.strokeDashoffset = String(RING_C * (1 - s.progress));
        }
      },
    }),
    [],
  );

  const registerArc = useCallback((kind: LoadoutSlotKind, el: SVGCircleElement | null) => {
    if (el) arcs.current.set(kind, el);
    else arcs.current.delete(kind);
  }, []);

  return (
    <div className="loadout-bar">
      {slots.map((slot) => (
        <div
          key={slot.kind}
          className="loadout-slot"
          style={{ color: slot.meta.color }}
          title={t(slot.meta.labelKey)}
        >
          <svg className="loadout-ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <circle className="loadout-track" cx="15" cy="15" r={RING_R} />
            <circle
              ref={(el) => registerArc(slot.kind, el)}
              className="loadout-arc"
              cx="15"
              cy="15"
              r={RING_R}
              transform="rotate(-90 15 15)"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - slot.progress)}
            />
          </svg>
          <Icon
            kind={slot.meta.icon}
            size={17}
            color={slot.meta.color}
            className="loadout-icon"
          />
        </div>
      ))}
    </div>
  );
});
