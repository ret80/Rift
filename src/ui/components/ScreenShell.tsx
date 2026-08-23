import React from "react";

interface ScreenShellProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * Wraps screen content with the standard anim-fade-up wrapper
 * and the appropriate panel class (default: hud-panel).
 */
export default function ScreenShell({ children, className = "hud-panel" }: ScreenShellProps) {
  return (
    <div className="anim-fade-up">
      <div className={className}>
        {children}
      </div>
    </div>
  );
}
