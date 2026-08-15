import React, { MutableRefObject } from "react";
import { useT, useLang, setLang, getLang, Lang } from "../i18n";
import type { Volumes } from "../game/audio";
import type { StatsData } from "../game/game";

/* ---------------- shared bits ---------------- */

function GameButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "red" | "amber";
  small?: boolean;
  autoFocus?: boolean;
}) {
  const cls =
    "clip-btn " +
    (props.variant === "red" ? "btn-red " : props.variant === "amber" ? "btn-amber " : "") +
    (props.small ? "btn-small px-5 py-2 text-[11px] " : "px-8 py-3 text-sm ");
  return (
    <button className={cls} onClick={props.onClick} autoFocus={props.autoFocus}>
      {props.children}
    </button>
  );
}

/* ---------------- main menu ---------------- */

export function MainMenu(props: {
  best: number;
  onPlay: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onDebug: () => void;
}) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div className="anim-fade-up text-center">
        <div className="mb-2 text-[10px] tracking-[0.5em] text-[#6f86a8] sm:text-xs">
          {t("app.subtitle")}
        </div>
        <h1 className="font-display anim-title text-6xl leading-none text-[#eaffff] sm:text-8xl">
          {t("app.title")}
        </h1>
        <div className="mx-auto mt-3 h-[2px] w-44 bg-gradient-to-r from-transparent via-[#5ef2ff] to-transparent sm:w-72" />
        {props.best > 0 && (
          <div className="mt-3 text-[11px] tracking-[0.3em] text-[#ffb84d]">
            {t("hud.best", { v: props.best })}
          </div>
        )}
      </div>

      <div
        className="anim-fade-up mt-10 flex w-[min(300px,80vw)] flex-col gap-3"
        style={{ animationDelay: "0.12s" }}
      >
        <GameButton onClick={props.onPlay} autoFocus>
          {t("menu.play")}
        </GameButton>
        <GameButton onClick={props.onSettings}>{t("menu.settings")}</GameButton>
        <GameButton onClick={props.onHelp}>{t("menu.help")}</GameButton>
      </div>

      <button
        onClick={props.onDebug}
        className="anim-fade-up mt-6 cursor-pointer border border-dashed border-[#7dff9e]/30 bg-transparent px-4 py-1 font-mono text-[10px] tracking-[0.3em] text-[#7dff9e]/60 transition-colors hover:border-[#7dff9e]/70 hover:text-[#7dff9e]"
        style={{ animationDelay: "0.2s" }}
      >
        &gt; {t("menu.debug")}
      </button>

      <div className="absolute bottom-5 text-center text-[9px] tracking-[0.3em] text-[#4d5f7d]">
        {t("menu.hint")}
      </div>
    </div>
  );
}

/* ---------------- settings ---------------- */

function SliderRow(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="hud-label">{props.label}</span>
        <span className="text-[11px] text-[#9db4d6]">{Math.round(props.value * 100)}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(props.value * 100)}
        onChange={(e) => props.onChange(Number(e.target.value) / 100)}
        className="vol w-full"
        style={{ ["--fill" as string]: `${props.value * 100}%` }}
      />
    </div>
  );
}

function LangButton(props: { code: Lang; label: string; active: boolean }) {
  return (
    <button
      onClick={() => setLang(props.code)}
      className={
        "cursor-pointer border px-4 py-1.5 font-mono text-[12px] tracking-[0.2em] transition-colors " +
        (props.active
          ? "border-[#5ef2ff] bg-[#5ef2ff]/15 text-[#eaffff]"
          : "border-[#6f86a8]/40 text-[#6f86a8] hover:border-[#5ef2ff]/60 hover:text-[#9db4d6]")
      }
    >
      {props.label}
    </button>
  );
}

export function SettingsScreen(props: {
  vols: Volumes;
  onChange: (v: Volumes) => void;
  onTest: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="anim-fade-up w-[min(400px,94vw)]">
        <div className="hud-panel p-6 sm:p-8">
          <div className="hud-label mb-4 text-center">{t("settings.title")}</div>
          <div className="flex flex-col gap-5">
            <SliderRow
              label={t("settings.volume")}
              value={props.vols.master}
              onChange={(v) => props.onChange({ ...props.vols, master: v })}
            />
            <SliderRow
              label={t("settings.sfx")}
              value={props.vols.sfx}
              onChange={(v) => props.onChange({ ...props.vols, sfx: v })}
            />
            <SliderRow
              label={t("settings.music")}
              value={props.vols.music}
              onChange={(v) => props.onChange({ ...props.vols, music: v })}
            />

            <div>
              <div className="hud-label mb-2">{t("settings.language")}</div>
              <div className="flex gap-2">
                <LangButton code="ru" label="РУС" active={lang === "ru"} />
                <LangButton code="en" label="ENG" active={lang === "en"} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <GameButton onClick={props.onTest} variant="amber" small>
                {t("settings.test")}
              </GameButton>
              <GameButton onClick={props.onBack} small>
                {t("settings.back")}
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- help ---------------- */

function EnemyIcon(props: { kind: "drone" | "hunter" | "fighter" | "cruiser" | "carrier" }) {
  const col =
    props.kind === "drone"
      ? "#ff5d7e"
      : props.kind === "hunter"
        ? "#d8ff3e"
        : props.kind === "fighter"
          ? "#ff8c42"
          : props.kind === "cruiser"
            ? "#b06bff"
            : "#ff5da2";
  const pts =
    props.kind === "drone"
      ? "12,2 22,12 12,22 2,12"
      : props.kind === "hunter"
        ? "2,12 22,6 16,12 22,18"
        : props.kind === "fighter"
          ? "2,12 22,4 15,12 22,20"
          : props.kind === "cruiser"
            ? "2,12 8,4 20,4 22,12 20,20 8,20"
            : "2,12 7,3 21,3 23,12 21,21 7,21";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
      <polygon points={pts} fill="none" stroke={col} strokeWidth="1.6" />
    </svg>
  );
}

function PickupIcon(props: { kind: "heal" | "rate" | "gun" | "drone" }) {
  const col =
    props.kind === "heal"
      ? "#7dffb8"
      : props.kind === "rate"
        ? "#ff8c42"
        : props.kind === "gun"
          ? "#5ef2ff"
          : "#9dffe8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" fill="none" stroke={col} strokeWidth="1.6">
      {props.kind === "heal" && (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </>
      )}
      {props.kind === "rate" && (
        <polyline points="13,3 7,13 12,13 11,21 17,11 12,11" />
      )}
      {props.kind === "gun" && (
        <>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="4" y1="9" x2="4" y2="15" />
        </>
      )}
      {props.kind === "drone" && (
        <>
          <polygon points="12,4 20,16 12,13 4,16" />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </>
      )}
    </svg>
  );
}

export function HelpScreen(props: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="anim-fade-up max-h-[92vh] w-[min(560px,96vw)] overflow-y-auto">
        <div className="hud-panel p-5 sm:p-7">
          <div className="hud-label mb-5 text-center">{t("help.title")}</div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.controls")}
          </div>
          <div className="mb-5 space-y-2 text-[13px] text-[#9db4d6]">
            <div className="flex items-center gap-2">
              <span className="kbd">W</span>
              <span className="kbd">A</span>
              <span className="kbd">S</span>
              <span className="kbd">D</span>
              <span className="text-[#6f86a8]">/</span>
              <span className="kbd">←</span>
              <span className="kbd">↑</span>
              <span className="kbd">↓</span>
              <span className="kbd">→</span>
              <span>— {t("help.move")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="kbd">P</span>
              <span className="kbd">Esc</span>
              <span>— {t("help.pause")}</span>
            </div>
            <div className="text-[12px] text-[#6f86a8]">{t("help.touch")}</div>
          </div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.objective")}
          </div>
          <p className="mb-5 text-[13px] leading-5 text-[#9db4d6]">{t("help.item")}</p>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.enemies")}
          </div>
          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="drone" />
              <span>{t("help.drone")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="hunter" />
              <span>{t("help.hunter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="fighter" />
              <span>{t("help.fighter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="cruiser" />
              <span>{t("help.cruiser")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="carrier" />
              <span>{t("help.carrier")}</span>
            </div>
          </div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.bonuses")}
          </div>
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="heal" />
              <span>{t("help.heal")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="rate" />
              <span>{t("help.rate")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="gun" />
              <span>{t("help.gun")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="drone" />
              <span>{t("help.allyDrone")}</span>
            </div>
          </div>

          <div className="flex justify-center">
            <GameButton onClick={props.onBack}>{t("help.back")}</GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- dev console ---------------- */

function DevToggle(props: {
  label: string;
  desc: string;
  on: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
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

export function DebugScreen(props: {
  fpsOn: boolean;
  godOn: boolean;
  startWave: number;
  onToggleFps: () => void;
  onToggleGod: () => void;
  onChangeWave: (n: number) => void;
  onBack: () => void;
}) {
  const t = useT();
  const pct = ((props.startWave - 1) / 49) * 100;
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="anim-fade-up w-[min(420px,94vw)]">
        <div className="flex items-center gap-2 border border-b-0 border-[#7dff9e]/30 bg-[#07130c] px-4 py-2">
          <span className="h-2 w-2 bg-[#ff5c54]" />
          <span className="h-2 w-2 bg-[#ffb84d]" />
          <span className="h-2 w-2 bg-[#7dff9e]" />
          <span className="ml-2 font-mono text-[10px] tracking-[0.3em] text-[#7dff9e]/80">
            rift9 — {t("debug.title")}
          </span>
        </div>
        <div className="border border-[#7dff9e]/30 bg-[#050d08]/95 p-4 shadow-[0_0_30px_rgba(125,255,158,0.08)]">
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

          <div className="mt-4 flex justify-end">
            <GameButton onClick={props.onBack} variant="amber" small>
              {t("debug.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- pause ---------------- */

export function PauseOverlay(props: {
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-30 flex items-center justify-center bg-[#04070d]/70 p-4 backdrop-blur-[2px]">
      <div className="anim-fade-up w-[min(360px,92vw)]">
        <div className="hud-panel p-7 text-center">
          <div className="font-display mb-6 text-2xl tracking-[0.3em] text-[#eaffff] text-glow-cyan">
            {t("pause.title")}
          </div>
          <div className="flex flex-col gap-3">
            <GameButton onClick={props.onResume} autoFocus>
              {t("pause.resume")}
            </GameButton>
            <GameButton onClick={props.onSettings} variant="amber">
              {t("pause.settings")}
            </GameButton>
            <GameButton onClick={props.onMenu} variant="red">
              {t("pause.menu")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- game over ---------------- */

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

export function GameOverScreen(props: {
  stats: StatsData;
  onRetry: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  const s = props.stats;
  return (
    <div className="anim-overlay absolute inset-0 z-30 flex items-center justify-center bg-[#0a0408]/70 p-4 backdrop-blur-[2px]">
      <div className="anim-fade-up w-[min(460px,94vw)]">
        <div className="hud-panel panel-red p-5 text-center sm:p-8">
          <div className="hud-label anim-red-pulse mb-1 !text-[#ff5c54]">
            {t("over.sub")}
          </div>
          <h2 className="font-display text-[26px] tracking-[0.1em] text-[#ff3b52] text-glow-red sm:text-4xl sm:tracking-[0.18em]">
            {t("over.title")}
          </h2>
          {s.isBest && (
            <div className="font-display mt-2 text-xs tracking-[0.24em] text-[#ffb84d] sm:text-sm sm:tracking-[0.3em]">
              ★ {t("game.newRecord")} ★
            </div>
          )}
          <div className="mx-auto mt-4 grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left sm:mt-6 sm:gap-x-6 sm:gap-y-3">
            <div>
              <div className="hud-label">{t("over.score")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.score}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.best")}</div>
              <div className="font-display text-lg text-[#5ef2ff] sm:text-2xl">{s.best}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.wave")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.wave}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.kills")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.kills}</div>
            </div>
            <div className="col-span-2">
              <div className="hud-label">{t("over.time")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">
                {formatTime(s.time)}
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col justify-center gap-2.5 sm:mt-7 sm:flex-row sm:gap-3">
            <GameButton onClick={props.onRetry} autoFocus>
              {t("over.retry")}
            </GameButton>
            <GameButton onClick={props.onMenu} variant="amber">
              {t("over.menu")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- HUD ---------------- */

export interface HudRefs {
  wave: MutableRefObject<HTMLDivElement | null>;
  progress: MutableRefObject<HTMLDivElement | null>;
  status: MutableRefObject<HTMLDivElement | null>;
  hullPanel: MutableRefObject<HTMLDivElement | null>;
  hpFill: MutableRefObject<HTMLDivElement | null>;
  time: MutableRefObject<HTMLDivElement | null>;
  score: MutableRefObject<HTMLDivElement | null>;
  best: MutableRefObject<HTMLDivElement | null>;
  combo: MutableRefObject<HTMLDivElement | null>;
  minerals: MutableRefObject<HTMLDivElement | null>;
}

export function HudLayer(props: { r: HudRefs; godOn: boolean }) {
  const t = useT();
  const r = props.r;
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* top row: wave | hull | score */}
      <div
        className="absolute left-2 right-2 top-0 flex items-start justify-between gap-2 sm:left-4 sm:right-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        {/* wave — top left */}
        <div className="hud-panel w-[96px] px-3 py-2 sm:w-[136px]">
          <div className="hud-label !text-[8px] sm:!text-[10px]">{t("hud.wave")}</div>
          <div className="flex items-baseline gap-1.5">
            <div ref={r.wave} className="font-display text-lg leading-none text-[#eaffff] sm:text-[22px]">
              01
            </div>
            <div ref={r.kills} className="text-[8px] tracking-[0.04em] text-[#9db4d6] sm:text-[9px]">
              0/0
            </div>
          </div>
          <div className="mt-1 h-[3px] w-full bg-[#5ef2ff]/10">
            <div ref={r.progress} className="h-full w-0 bg-[#5ef2ff] shadow-[0_0_5px_#5ef2ff]" />
          </div>
          <div ref={r.status} className="mt-1 text-[7px] tracking-[0.03em] text-[#6f86a8] sm:text-[8px]">
            {t("hud.status", { g: 1, d: 0 })}
          </div>
        </div>

        {/* hull — top center, always in view */}
        <div ref={r.hullPanel} className="hud-panel w-[min(240px,38vw)] px-3 py-2 sm:px-4">
          <div className="hud-label !text-[8px] sm:!text-[10px]">{t("hud.hull")}</div>
          <div className="mt-1 h-[6px] w-full bg-[#ff3b52]/15">
            <div
              ref={r.hpFill}
              className="h-full w-full bg-[#5ef2ff] shadow-[0_0_7px_#5ef2ff] transition-[width] duration-200"
            />
          </div>
          <div ref={r.time} className="mt-1 text-center text-[8px] tracking-[0.16em] text-[#6f86a8] sm:text-[10px]">
            T+0:00
          </div>
        </div>

        {/* score — top right */}
        <div className="hud-panel w-[96px] px-3 py-2 text-right sm:w-[136px]">
          <div className="hud-label !text-[8px] sm:!text-[10px]">{t("hud.scoreLabel")}</div>
          <div ref={r.score} className="font-display text-lg leading-none text-[#eaffff] sm:text-[22px]">
            000000
          </div>
          <div ref={r.best} className="mt-0.5 hidden text-[7px] tracking-[0.08em] text-[#ffb84d] sm:block sm:text-[8px]">
            {t("hud.best", { v: 0 })}
          </div>
          <div
            ref={r.combo}
            className="font-display h-[13px] text-[11px] leading-[13px] text-[#ffb84d] opacity-0 sm:h-[15px] sm:text-xs"
          >
            ×1.0
          </div>
        </div>
      </div>

      {/* fire-rate boost — slides out from below the wave panel */}
      <div
        className="absolute left-2 sm:left-4"
        style={{ top: "calc(env(safe-area-inset-top) + 96px)" }}
      >
        <div ref={r.boostPanel} className="boost-panel hud-panel w-[110px] border-[#ff8c42]/40 px-3 py-1.5 sm:w-[150px]">
          <div ref={r.boostText} className="font-mono text-[9px] font-bold tracking-[0.08em] text-[#ff8c42] sm:text-[10px]">
            {t("hud.statusBoost", { p: 0, s: 20 })}
          </div>
          <div className="mt-1 h-[3px] w-full bg-[#ff8c42]/15">
            <div ref={r.boostBar} className="h-full w-0 bg-[#ff8c42] shadow-[0_0_6px_#ff8c42]" />
          </div>
        </div>
      </div>

      {/* god-mode chip */}
      {props.godOn && (
        <div
          className="absolute left-1/2 -translate-x-1/2 border border-[#ffb84d]/50 bg-[#ffb84d]/10 px-3 py-0.5 font-mono text-[9px] tracking-[0.25em] text-[#ffb84d]"
          style={{ top: "calc(env(safe-area-inset-top) + 92px)" }}
        >
          ◈ {t("hud.godChip")}
        </div>
      )}
    </div>
  );
}

export { getLang };
