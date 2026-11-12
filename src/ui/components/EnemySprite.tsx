import React from "react";
import { EnemyKind } from "../../game/balance";
import { ENEMY_HULLS, enemyColor } from "../../game/systems/Renderers/EnemyHulls";

/**
 * EnemySprite — силуэт врага для таблиц справки.
 *
 * Использует те же полигоны, что и рендер боя (EnemyHulls), поэтому
 * значок цели совпадает с кораблём на арене. Враги без полигонального
 * корпуса (мина, глушилка, вихрь) рисуются окружностью, как в бою.
 */
export function EnemySprite(props: { kind: EnemyKind; size?: number }) {
  const size = props.size ?? 28;
  const color = enemyColor(props.kind);
  const hull = ENEMY_HULLS[props.kind];

  if (!hull) {
    return (
      <svg width={size} height={size} viewBox="-14 -14 28 28" aria-hidden="true">
        <circle cx="0" cy="0" r="8" fill={color} fillOpacity="0.22" stroke={color} strokeWidth="1.6" />
        {props.kind === EnemyKind.Mine && (
          <g stroke={color} strokeWidth="1.6">
            <line x1="-11" y1="0" x2="11" y2="0" />
            <line x1="0" y1="-11" x2="0" y2="11" />
            <circle cx="0" cy="0" r="2" fill={color} />
          </g>
        )}
        {props.kind === EnemyKind.Jammer && (
          <g stroke={color} strokeWidth="1.6">
            <line x1="-10" y1="0" x2="10" y2="0" />
            <line x1="0" y1="-10" x2="0" y2="10" />
          </g>
        )}
        {props.kind === EnemyKind.Vortex && (
          <g stroke={color} strokeWidth="1.6">
            <line x1="0" y1="0" x2="12" y2="0" />
            <circle cx="0" cy="0" r="2.5" fill="#eaffff" />
          </g>
        )}
      </svg>
    );
  }

  const extent = Math.max(
    ...hull.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))),
  ) + 5;

  return (
    <svg width={size} height={size} viewBox={`${-extent} ${-extent} ${extent * 2} ${extent * 2}`} aria-hidden="true">
      <polygon
        points={hull.map(([x, y]) => `${x},${y}`).join(" ")}
        fill={color}
        fillOpacity="0.2"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {props.kind === EnemyKind.Miner && (
        <line x1="16" y1="0" x2="23" y2="0" stroke="#ff6b3d" strokeWidth="2" />
      )}
      {props.kind === EnemyKind.Needle && (
        <line x1="15" y1="0" x2="26" y2="0" stroke={color} strokeWidth="1.6" />
      )}
      {props.kind === EnemyKind.Cruiser && (
        <g stroke={color} strokeWidth="1.6">
          <line x1="4" y1="-8" x2="22" y2="-8" />
          <line x1="4" y1="8" x2="22" y2="8" />
        </g>
      )}
      {props.kind === EnemyKind.Shieldbearer && (
        <circle cx="0" cy="0" r="6" fill={color} fillOpacity="0.5" />
      )}
      {props.kind === EnemyKind.Splitter && <circle cx="0" cy="0" r="4" fill={color} />}
      {props.kind === EnemyKind.HiveMother && (
        <circle cx="0" cy="0" r="10" fill={color} fillOpacity="0.5" />
      )}
      {props.kind === EnemyKind.Boss && (
        <>
          <circle cx="0" cy="0" r="17" fill={color} fillOpacity="0.4" />
          <circle cx="0" cy="0" r="5" fill="#eaffff" fillOpacity="0.8" />
        </>
      )}
    </svg>
  );
}
