/** Кнопка вкладки: активная отличается рамкой, заливкой и линией снизу. */
export function TabButton(props: {
  label: string;
  active: boolean;
  activeClass: string;
  lineClass: string;
  onClick: () => void;
}) {
  const { label, active, activeClass, lineClass, onClick } = props;
  return (
    <div className="relative shrink-0">
      <button
        onClick={onClick}
        className={`clip-btn px-5 py-2 text-xs font-mono tracking-[0.2em] transition-all ${
          active
            ? `border ${activeClass} text-[#eaffff]`
            : "border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#6f86a8] hover:text-[#eaffff]"
        }`}
      >
        {label}
      </button>
      {active && (
        <span
          className={`absolute inset-x-2 -bottom-1 h-[2px] ${lineClass}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
