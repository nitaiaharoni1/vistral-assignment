import { cn } from "../../../shared/cn/cn";

const tutorialVisualClass = cn(
  "my-2.5 mb-[26px] flex h-[180px] items-center justify-center rounded-2xl bg-accent-wash text-accent",
  "[&_svg]:h-40 [&_svg]:w-[250px] [&_svg]:max-w-full",
  "max-[600px]:mb-[22px] max-[600px]:h-[150px] max-[600px]:[&_svg]:h-[130px]",
  "short-landscape:mb-4 short-landscape:h-[104px] short-landscape:[&_svg]:h-24",
);

const inkMarkClass = "motion-settle origin-center animate-ink-confirmed [transform-box:fill-box]";

const EMPTY_GRID_CORNERS = [
  { x: 68, y: 18, delay: "" },
  { x: 212, y: 18, delay: "delay-[60ms]" },
  { x: 212, y: 162, delay: "delay-[150ms]" },
  { x: 68, y: 162, delay: "delay-[240ms]" },
];

type TutorialVisualProps = {
  step: number;
};

// Returns the spoken description for the current visual.
function visualLabel(step: number): string {
  if (step === 0) {
    return "An empty three by three grid without row letters or column numbers.";
  }
  return "A solid X has been seen in the top-left square. The dashed O in the center is suggested, not yet seen.";
}

// Draws the four corner dots on an empty grid.
function EmptyGridCorners() {
  return EMPTY_GRID_CORNERS.map((corner) => (
    <g key={`${corner.x}-${corner.y}`} className={cn(inkMarkClass, corner.delay)}>
      <circle cx={corner.x} cy={corner.y} r="6" fill="currentColor" />
    </g>
  ));
}

// Draws the sample X and suggested O on the grid.
function SeenMarks() {
  return (
    <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
      <g className={cn(inkMarkClass, "text-player-x")}>
        <path d="M82 32l20 20 M102 32L82 52" />
      </g>
      <g className={cn(inkMarkClass, "delay-[330ms] text-player-o")}>
        <circle cx="140" cy="90" r="13" strokeDasharray="3 5" />
      </g>
    </g>
  );
}

// Shows the step illustration, or nothing after step 1.
export function TutorialVisual({ step }: TutorialVisualProps) {
  if (step >= 2) return null;
  return (
    <div className={tutorialVisualClass}>
      <svg width="280" height="180" viewBox="0 0 280 180" role="img" aria-label={visualLabel(step)}>
        <g fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="68" y="18" width="144" height="144" />
          <path d="M116 18v144 M164 18v144 M68 66h144 M68 114h144" />
        </g>
        {step === 0 && <EmptyGridCorners />}
        {step === 1 && <SeenMarks />}
      </svg>
    </div>
  );
}
