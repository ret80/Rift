import React, { useState } from "react";
import GameButton from "../components/GameButton";
import { useT, type TKey } from "../../i18n";
import { EnemyKind } from "../../game/balance/enemies";
import { ALL_PICKUP_KINDS, pickupDisplayKey } from "../../game/balance";
import type { PickupKind } from "../../game/balance";
import type { PickupDisplay } from "../../game/balance/pickupCatalog";

/* Статические маппинги: типизированные ключи вместо шаблонных строк. */
const ENEMY_LABEL: Record<EnemyKind, TKey> = {
  [EnemyKind.Drone]: "debug.drone",
  [EnemyKind.Hunter]: "debug.hunter",
  [EnemyKind.Fighter]: "debug.fighter",
  [EnemyKind.Cruiser]: "debug.cruiser",
  [EnemyKind.Carrier]: "debug.carrier",
};

const PICKUP_LABEL: Record<PickupDisplay, TKey> = {
  heal: "debug.heal",
  rate: "debug.rate",
  gun: "debug.gun",
  shield: "debug.shield",
  drone: "debug.drone",
  missile: "debug.missile",
  laser: "debug.laser",
  quantum_swap: "debug.quantum_swap",
};

interface EnemyToggleProps {
  kind: EnemyKind;
  enabled: boolean;
  onToggle: (kind: EnemyKind) => void;
}

function EnemyToggle(props: EnemyToggleProps) {
  const t = useT();
  const label = t(ENEMY_LABEL[props.kind]);
  return (
    <button
      type="button"
      aria-pressed={props.enabled}
      onClick={() => props.onToggle(props.kind)}
      className="group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/10 bg-[#07130c]/50 px-4 py-2.5 text-left transition-colors hover:border-[#7dff9e]/40 hover:bg-[#0a1c11]/60"
    >
      <span
        className="h-3 w-3 shrink-0 rounded-sm transition-all"
        style={{
          background: props.enabled ? "#7dff9e" : "rgba(125,255,158,0.08)",
          boxShadow: props.enabled ? "0 0 8px rgba(125,255,158,0.6)" : "none",
          opacity: props.enabled ? 1 : 0.5,
        }}
      />
      <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#b0d8c0]">
        {label}
      </span>
      <span
        className="ml-auto font-mono text-[9px] tracking-[0.15em]"
        style={{
          color: props.enabled ? "#7dff9e" : "#3d5c4a",
        }}
      >
        {props.enabled ? t("debug.on") : t("debug.off")}
      </span>
    </button>
  );
}

function EnemyDropdown(props: {
  enabledEnemies: EnemyKind[];
  onToggleEnemy: (kind: EnemyKind) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const allKinds: EnemyKind[] = [
    EnemyKind.Drone,
    EnemyKind.Hunter,
    EnemyKind.Fighter,
    EnemyKind.Cruiser,
    EnemyKind.Carrier,
  ];
  const enabledCount = allKinds.filter((k) => props.enabledEnemies.includes(k)).length;

  return (
    <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1"
      >
        <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
          {t("debug.enemies")}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.1em] text-[#5f8f70]">
            {enabledCount}/{allKinds.length}
          </span>
          <span
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▼
          </span>
        </div>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-1">
          {allKinds.map((kind) => (
            <EnemyToggle
              key={kind}
              kind={kind}
              enabled={props.enabledEnemies.includes(kind)}
              onToggle={props.onToggleEnemy}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface PickupToggleProps {
  kind: PickupKind;
  enabled: boolean;
  onToggle: (kind: PickupKind) => void;
}

function PickupToggle(props: PickupToggleProps) {
  const t = useT();
  const label = t(PICKUP_LABEL[pickupDisplayKey(props.kind)]);
  return (
    <button
      type="button"
      aria-pressed={props.enabled}
      onClick={() => props.onToggle(props.kind)}
      className="group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/10 bg-[#07130c]/50 px-4 py-2.5 text-left transition-colors hover:border-[#7dff9e]/40 hover:bg-[#0a1c11]/60"
    >
      <span
        className="h-3 w-3 shrink-0 rounded-sm transition-all"
        style={{
          background: props.enabled ? "#7dff9e" : "rgba(125,255,158,0.08)",
          boxShadow: props.enabled ? "0 0 8px rgba(125,255,158,0.6)" : "none",
          opacity: props.enabled ? 1 : 0.5,
        }}
      />
      <span className="font-mono text-[11px] font-bold tracking-[0.1em] text-[#b0d8c0]">
        {label}
      </span>
      <span
        className="ml-auto font-mono text-[9px] tracking-[0.15em]"
        style={{
          color: props.enabled ? "#7dff9e" : "#3d5c4a",
        }}
      >
        {props.enabled ? t("debug.on") : t("debug.off")}
      </span>
    </button>
  );
}

function PickupDropdown(props: {
  enabledPickups: PickupKind[];
  onTogglePickup: (kind: PickupKind) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const enabledCount = ALL_PICKUP_KINDS.filter((k) => props.enabledPickups.includes(k)).length;

  return (
    <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-1"
      >
        <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
          {t("debug.pickups")}
        </span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] tracking-[0.1em] text-[#5f8f70]">
            {enabledCount}/{ALL_PICKUP_KINDS.length}
          </span>
          <span
            className="transition-transform"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            ▼
          </span>
        </div>
      </button>
      {open && (
        <div className="mt-3 flex flex-col gap-1">
          {ALL_PICKUP_KINDS.map((kind) => (
            <PickupToggle
              key={kind}
              kind={kind}
              enabled={props.enabledPickups.includes(kind)}
              onToggle={props.onTogglePickup}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DevToggle(props: {
  label: string;
  desc: string;
  on: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className="group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3 text-left transition-colors hover:border-[#7dff9e]/50 hover:bg-[#0a1c11]/80"
    >
      <span
        className="h-3 w-3 shrink-0 transition-all"
        style={{
          background: props.on ? "#7dff9e" : "rgba(125,255,158,0.12)",
          boxShadow: props.on ? "0 0 10px rgba(125,255,158,0.8)" : "none",
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
          {props.label}
        </span>
        <span className="block font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
          {props.desc}
        </span>
      </span>
      <span
        className={
          "shrink-0 border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] " +
          (props.on
            ? "border-[#7dff9e]/60 text-[#7dff9e]"
            : "border-[#5f8f70]/40 text-[#5f8f70]")
        }
      >
        {props.on ? t("debug.on") : t("debug.off")}
      </span>
    </button>
  );
}

export default function DebugScreen(props: {
  fpsOn: boolean;
  godOn: boolean;
  startWave: number;
  onToggleFps: () => void;
  onToggleGod: () => void;
  onChangeWave: (n: number) => void;
  onToggleDetails: () => void;
  detailsOn: boolean;
  enabledEnemies: EnemyKind[];
  onToggleEnemy: (kind: EnemyKind) => void;
  enabledPickups: PickupKind[];
  onTogglePickup: (kind: PickupKind) => void;
  onBack: () => void;
}) {
  const t = useT();
  const pct = ((props.startWave - 1) / 49) * 100;
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="flex h-[min(90vh,560px)] w-[min(420px,94vw)] flex-col overflow-hidden border border-[#7dff9e]/30 bg-[#050d08]/95 shadow-[0_0_30px_rgba(125,255,158,0.08)]">
        {/* Header — fixed */}
        <div className="flex shrink-0 items-center gap-2 border-b border-[#7dff9e]/30 bg-[#07130c] px-4 py-2">
          <span className="h-2 w-2 bg-[#ff5c54]" />
          <span className="h-2 w-2 bg-[#ffb84d]" />
          <span className="h-2 w-2 bg-[#7dff9e]" />
          <span className="ml-2 font-mono text-[10px] tracking-[0.3em] text-[#7dff9e]/80">
            rift9 — {t("debug.title")}
          </span>
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">
          <div className="mb-3 font-mono text-[9px] tracking-[0.25em] text-[#5f8f70]">
            {"// "}{t("debug.note")}
          </div>
          <div className="flex flex-col gap-2">
            <DevToggle
              label={t("debug.fps")}
              desc={t("debug.fpsDesc")}
              on={props.fpsOn}
              onClick={props.onToggleFps}
            />
            <DevToggle
              label={t("debug.god")}
              desc={t("debug.godDesc")}
              on={props.godOn}
              onClick={props.onToggleGod}
            />
            <DevToggle
              label={t("debug.details")}
              desc={t("debug.detailsDesc")}
              on={props.detailsOn}
              onClick={props.onToggleDetails}
            />
          </div>

          <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
                {t("debug.wave")}
              </span>
              <span className="font-mono text-lg font-bold text-[#7dff9e]">
                {String(props.startWave).padStart(2, "0")}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={props.startWave}
              onChange={(e) => props.onChangeWave(Number(e.target.value))}
              className="vol-dev mt-2 w-full"
              style={{ ["--fill" as string]: `${pct}%` }}
            />
            <div className="flex justify-between font-mono text-[9px] tracking-[0.2em] text-[#5f8f70]">
              <span>01</span>
              <span>25</span>
              <span>50</span>
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
              {t("debug.waveDesc")}
            </div>
          </div>

          <EnemyDropdown
            enabledEnemies={props.enabledEnemies}
            onToggleEnemy={props.onToggleEnemy}
          />

          <PickupDropdown
            enabledPickups={props.enabledPickups}
            onTogglePickup={props.onTogglePickup}
          />
        </div>

        {/* Footer — fixed */}
        <div className="shrink-0 border-t border-[#7dff9e]/15 bg-[#07130c] px-4 py-3">
          <div className="flex justify-end">
            <GameButton onClick={props.onBack} variant="amber" small>
              {t("debug.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
