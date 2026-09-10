import { segmentedRing } from "../../../lib/segmented-ring";

const ring = segmentedRing((x, y) => [16 + x * 12, 16 + y * 12]);

export function DrawGuideIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      aria-hidden="true"
    >
      <path d={ring} strokeLinecap="round" />
    </svg>
  );
}
