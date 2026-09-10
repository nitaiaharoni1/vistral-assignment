import { useEffect } from "react";
import { useState } from "react";
import { CircleNotch } from "@phosphor-icons/react";

// Delays showing or hiding the analysis spinner.
export function useAnalysisBusy(active: boolean): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timeout = window.setTimeout(() => setVisible(active), active ? 120 : 450);
    return () => window.clearTimeout(timeout);
  }, [active]);
  return visible;
}

// Shows a board spinner or pulsing cell dots.
export function AnalysisIndicator({ kind }: { kind: "board" | "cell" }) {
  if (kind === "board") return <CircleNotch size={18} weight="bold" className="animate-spin motion-reduce:animate-none" aria-hidden="true" />;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((dot) => (
        <span key={dot} className="size-[3px] rounded-full bg-current animate-pulse motion-reduce:animate-none" style={{ animationDelay: `${dot * 160}ms` }} />
      ))}
    </span>
  );
}
