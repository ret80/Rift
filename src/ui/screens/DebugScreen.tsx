import React, { useState } from "react";
import GameButton from "../components/GameButton";
import ScreenHeader from "../components/ScreenHeader";
import { useT, type TKey } from "../../i18n";
import { ALL_ENEMY_KINDS, EnemyKind } from "../../game/balance/enemies";
import { PICKUP_CATALOG, estimateRunParts } from "../../game/balance";
import type { PickupKind } from "../../game/balance";
import type { PhysicsEngineId } from "../../game/physics";
import { PHYSICS_ENGINE_IDS } from "../../game/physics";
import { PARAM_PROFILE_IDS, type ParamProfileId } from "../../game/balance/params/profiles";
import { DEBUG_SLIDERS, type DebugTuning } from "../debugTuning";
import type { DebugTab } from "../appState";

const DEBUG_TABS: ReadonlyArray<{ id: DebugTab; labelKey: TKey }> = [
  { id: "general", labelKey: "debug.tabGeneral" },
  { id: "test", labelKey: "debug.tabTest" },
];

/** Подписи профилей параметров. */
const PROFILE_LABEL: Record<ParamProfileId, TKey> = {
  default: "debug.profileDefault",
  relaxed: "debug.profileRelaxed",
  stress: "debug.profileStress",
};

/** Отображаемые имена физических движков (не переводятся). */
const PHYSICS_ENGINE_LABELS: Record<PhysicsEngineId, string> = {
  planck: "Planck.js",
  custom: "Custom",
  p2: "p2-es",
};

/* Статические маппинги: типизированные ключи вместо шаблонных строк. */
const ENEMY_LABEL: Record<EnemyKind, TKey> = {
  [EnemyKind.Drone]: "debug.drone",
  [EnemyKind.Hunter]: "debug.hunter",
  [EnemyKind.Fighter]: "debug.fighter",
  [EnemyKind.Cruiser]: "debug.cruiser",
  [EnemyKind.Carrier]: "debug.carrier",
  [EnemyKind.Miner]: "debug.miner",
  [EnemyKind.Boss]: "debug.boss",
  [EnemyKind.Mine]: "debug.mine",
  [EnemyKind.Needle]: "debug.needle",
  [EnemyKind.Shieldbearer]: "debug.shieldbearer",
  [EnemyKind.Harpooner]: "debug.harpooner",
  [EnemyKind.Splitter]: "debug.splitter",
  [EnemyKind.Jammer]: "debug.jammer",
  [EnemyKind.Vortex]: "debug.vortex",
  [EnemyKind.HiveMother]: "debug.hivemother",
  [EnemyKind.Tractor]: "debug.tractor",
};

/**
 * Подписи пикапов по виду: скорость подбора разных ступеней различается.
 *
 * `Record<PickupKind, …>` гарантирует, что новый вид в каталоге без подписи
 * не соберётся — список в отладке обновляется вместе с каталогом.
 */
const PICKUP_KIND_LABEL: Record<PickupKind, TKey> = {
  heal: "debug.heal",
  rate20: "debug.rate20",
  rate40: "debug.rate40",
  rate60: "debug.rate60",
  rate: "debug.rate",
  gun: "debug.gun",
  shield: "debug.shield",
  drone: "debug.drone",
  missile: "debug.missile",
  laser: "debug.laser",
  quantum_swap: "debug.quantum_swap",
};

/** Все виды пикапов: источник — каталог, а не ручной список в UI. */
const ALL_DEBUG_PICKUPS = Object.keys(PICKUP_CATALOG) as PickupKind[];

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
      className={
        "group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/10 " +
        "bg-[#07130c]/50 px-4 py-2.5 text-left transition-colors " +
        "hover:border-[#7dff9e]/40 hover:bg-[#0a1c11]/60"
      }
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
  // Список берётся из enum: новый вид врага появляется в отладке сам.
  const allKinds = ALL_ENEMY_KINDS;
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
  const label = t(PICKUP_KIND_LABEL[props.kind]);
  return (
    <button
      type="button"
      aria-pressed={props.enabled}
      onClick={() => props.onToggle(props.kind)}
      className={
        "group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/10 " +
        "bg-[#07130c]/50 px-4 py-2.5 text-left transition-colors " +
        "hover:border-[#7dff9e]/40 hover:bg-[#0a1c11]/60"
      }
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
  const enabledCount = ALL_DEBUG_PICKUPS.filter((k) => props.enabledPickups.includes(k)).length;

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
            {enabledCount}/{ALL_DEBUG_PICKUPS.length}
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
          {ALL_DEBUG_PICKUPS.map((kind) => (
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
      className={
        "group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/15 " +
        "bg-[#07130c]/70 px-4 py-3 text-left transition-colors " +
        "hover:border-[#7dff9e]/50 hover:bg-[#0a1c11]/80"
      }
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

/** Вертикальный выбор физического движка. */
function PhysicsSelector(props: {
  value: PhysicsEngineId;
  onChange: (id: PhysicsEngineId) => void;
}) {
  const t = useT();
  return (
    <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
      <div className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
        {t("debug.physicsEngine")}
      </div>
      <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
        {t("debug.physicsEngineDesc")}
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {PHYSICS_ENGINE_IDS.map((id) => {
          const selected = id === props.value;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => props.onChange(id)}
              className={
                "flex w-full items-center justify-between border px-3 py-2 text-left " +
                "font-mono text-[11px] tracking-[0.1em] transition-colors " +
                (selected
                  ? "border-[#7dff9e]/60 bg-[#0a1c11] text-[#d9ffe4]"
                  : "border-[#7dff9e]/10 bg-[#07130c]/50 text-[#b0d8c0] hover:border-[#7dff9e]/40")
              }
            >
              <span>{PHYSICS_ENGINE_LABELS[id]}</span>
              {selected && <span className="text-[#7dff9e]">●</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function DebugScreen(props: {
  fpsOn: boolean;
  godOn: boolean;
  startWave: number;
  /** Отладочные сдвиги: профиль и ползунки. */
  tuning: DebugTuning;
  onChangeTuning: (next: DebugTuning) => void;
  onToggleFps: () => void;
  onToggleGod: () => void;
  onChangeWave: (n: number) => void;
  /** Отладочный режим бесконечных деталей. */
  infiniteParts: boolean;
  onToggleInfiniteParts: () => void;
  /** Отладочный режим бесконечных кредитов. */
  infiniteCredits: boolean;
  onToggleInfiniteCredits: () => void;
  /** Ангар тестового профиля: собрать набор покупок для теста. */
  onOpenTestHangar: () => void;
  /** Сброс тестового профиля к базовому кораблю. */
  onResetTestProfile: () => void;
  physicsEngine: PhysicsEngineId;
  onPhysicsEngineChange: (v: PhysicsEngineId) => void;
  enabledEnemies: EnemyKind[];
  onToggleEnemy: (kind: EnemyKind) => void;
  enabledPickups: PickupKind[];
  onTogglePickup: (kind: PickupKind) => void;
  /** Запустить выбранную волну с текущим отладочным списком врагов. */
  onTestLevel: () => void;
  /** Взведена ли запись следующего тестового уровня. */
  recordingArmed: boolean;
  /** Есть ли готовая запись теста для выгрузки. */
  recordingReady: boolean;
  /** Включить запись следующего теста. */
  onArmRecording: () => void;
  /** Скачать готовую запись теста. */
  onDownloadRecording: () => void;
  onBack: () => void;
  /** Вкладка при открытии: возрат из теста ведёт сразу в «ТЕСТ». */
  initialTab?: DebugTab;
}) {
  const t = useT();
  const pct = ((props.startWave - 1) / 49) * 100;
  // Оценка заработка за путь до выбранной волны — с разбиением разрядов.
  const partsLabel = String(estimateRunParts(props.startWave)).replace(
    /\B(?=(\d{3})+(?!\d))/g,
    " ",
  );
  const [tab, setTab] = useState<DebugTab>(props.initialTab ?? "general");
  const [recordArmed, setRecordArmed] = useState(props.recordingArmed);

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={
          "flex h-[min(90vh,560px)] w-[min(420px,94vw)] flex-col overflow-hidden " +
          "border border-[#7dff9e]/30 bg-[#050d08]/95 " +
          "shadow-[0_0_30px_rgba(125,255,158,0.08)]"
        }
      >
        <ScreenHeader title={t("debug.title")} tone="debug" />

        {/* Вкладки: общие настройки и всё для теста волны. */}
        <div className="flex shrink-0 gap-1 border-b border-[#7dff9e]/15 px-3 pt-2">
          {DEBUG_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={tab === entry.id}
              onClick={() => setTab(entry.id)}
              className={
                "border-b-2 px-3 py-2 font-mono text-[10px] tracking-[0.18em] transition-colors " +
                (tab === entry.id
                  ? "border-[#7dff9e] text-[#d9ffe4]"
                  : "border-transparent text-[#5f8f70] hover:text-[#b0d8c0]")
              }
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 pt-3">
          <div className="mb-3 font-mono text-[9px] tracking-[0.25em] text-[#5f8f70]">
            {"// "}{t("debug.note")}
          </div>
          {tab === "general" && (
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
              label={t("debug.infiniteParts")}
              desc={t("debug.infinitePartsDesc")}
              on={props.infiniteParts}
              onClick={props.onToggleInfiniteParts}
            />
            <DevToggle
              label={t("debug.infiniteCredits")}
              desc={t("debug.infiniteCreditsDesc")}
              on={props.infiniteCredits}
              onClick={props.onToggleInfiniteCredits}
            />
          </div>
          )}

          {tab === "test" && (
          <>
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

          {/* Запись тестового уровня для симулятора. */}
          <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
                {t("debug.record")}
              </span>
              {recordArmed && (
                <span className="font-mono text-[9px] tracking-[0.15em] text-[#ffd166]">
                  {t("debug.recordArmed")}
                </span>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
              {t("debug.recordDesc")}
            </div>
            <div className="mt-3 flex gap-2">
              <GameButton
                onClick={() => {
                  props.onArmRecording();
                  setRecordArmed(true);
                }}
                variant={recordArmed ? "amber" : "cyan"}
                small
                className="flex-1"
              >
                {t("debug.record")}
              </GameButton>
              {props.recordingReady && (
                <GameButton
                  onClick={props.onDownloadRecording}
                  variant="cyan"
                  small
                  className="flex-1"
                >
                  {t("debug.download")}
                </GameButton>
              )}
            </div>
          </div>

          <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
            <div className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
              {t("debug.profile")}
            </div>
            <div className="mt-2 flex gap-2">
              {PARAM_PROFILE_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={props.tuning.profile === id}
                  onClick={() => props.onChangeTuning({ ...props.tuning, profile: id })}
                  className={
                    "flex-1 border px-2 py-1.5 font-mono text-[10px] tracking-[0.12em] transition-colors " +
                    (props.tuning.profile === id
                      ? "border-[#7dff9e] bg-[#7dff9e]/15 text-[#d9ffe4]"
                      : "border-[#7dff9e]/20 text-[#5f8f70] hover:border-[#7dff9e]/50")
                  }
                >
                  {t(PROFILE_LABEL[id])}
                </button>
              ))}
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
              {t("debug.profileDesc")}
            </div>
          </div>

          {/* Тестовый профиль: покупки сохраняются для тестовой волны. */}
          <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
                {t("debug.testProfile")}
              </span>
              {/* Детали, которые игрок заработал бы сам к выбранной волне. */}
              <span className="font-mono text-[13px] font-bold text-[#7dff9e]">
                {t("debug.testProfileParts", { n: partsLabel })}
              </span>
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
              {t("debug.testProfileDesc")}
            </div>
            <div className="mt-3 flex gap-2">
              <GameButton onClick={props.onOpenTestHangar} variant="cyan" small className=" flex-1">
                {t("debug.testHangar")}
              </GameButton>
              <GameButton onClick={props.onResetTestProfile} variant="amber" small className=" flex-1">
                {t("debug.testProfileReset")}
              </GameButton>
            </div>
          </div>

          {DEBUG_SLIDERS.map((slider) => {
            const value = props.tuning[slider.key];
            const label = `${value > 0 ? "+" : ""}${value}%`;
            const fill = ((value - slider.min) / (slider.max - slider.min)) * 100;
            return (
              <div
                key={slider.key}
                className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
                    {t(slider.labelKey)}
                  </span>
                  <span className="font-mono text-lg font-bold text-[#7dff9e]">{label}</span>
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={value}
                  onChange={(e) =>
                    props.onChangeTuning({ ...props.tuning, [slider.key]: Number(e.target.value) })
                  }
                  className="vol-dev mt-2 w-full"
                  style={{ ["--fill" as string]: `${fill}%` }}
                />
                <div className="flex justify-between font-mono text-[9px] tracking-[0.2em] text-[#5f8f70]">
                  <span>{slider.min}%</span>
                  <span>0</span>
                  <span>+{slider.max}%</span>
                </div>
                <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
                  {t(slider.descKey)}
                </div>
              </div>
            );
          })}

          <EnemyDropdown
            enabledEnemies={props.enabledEnemies}
            onToggleEnemy={props.onToggleEnemy}
          />

          <PickupDropdown
            enabledPickups={props.enabledPickups}
            onTogglePickup={props.onTogglePickup}
          />
          </>
          )}

          {tab === "general" && (
          <PhysicsSelector
            value={props.physicsEngine}
            onChange={props.onPhysicsEngineChange}
          />
          )}
        </div>

        {/* Footer — fixed */}
        <div className="shrink-0 border-t border-[#7dff9e]/15 bg-[#07130c] px-4 py-3">
          <div className={`flex items-center gap-2 ${tab === "test" ? "justify-between" : "justify-end"}`}>
            {tab === "test" && (
              <GameButton onClick={props.onTestLevel} variant="cyan" small>
                {t("debug.testLevel")}
              </GameButton>
            )}
            <GameButton onClick={props.onBack} variant="amber">
              {t("debug.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
