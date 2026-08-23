import React from "react";
import { useLang, setLang, type Lang } from "../../i18n";

interface LangButtonProps {
  code: Lang;
  label: string;
  active: boolean;
}

export default function LangButton(props: LangButtonProps) {
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
