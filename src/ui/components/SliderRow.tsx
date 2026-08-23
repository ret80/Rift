import React from "react";

export default function SliderRow(props: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  id?: string;
}) {
  const inputId = props.id || `slider-${Math.random().toString(36).slice(2)}`;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <label className="hud-label" htmlFor={inputId}>{props.label}</label>
        <span className="text-[11px] text-[#9db4d6]">{Math.round(props.value * 100)}%</span>
      </div>
      <input
        id={inputId}
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
