import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CELL_NAMES } from "../../../../types";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import { cn } from "../../../shared/cn/cn";
import { AnalysisIndicator } from "../../../shared/analysis-indicator/AnalysisIndicator.component";
import { useAnalysisBusy } from "../../../shared/analysis-indicator/AnalysisIndicator.component";
import { buildOverlayView } from "./detection-overlay-cell-state";
import { overlayAriaLabel } from "./detection-overlay-cell-state";
import type { OverlayCell } from "./detection-overlay-cell-state";
import type { OverlayCellState } from "./detection-overlay-cell-state";
import type { OverlayView } from "./detection-overlay-cell-state";
import { buildOverlayGeometry } from "./detection-overlay-geometry";
import type { OverlayCellGeometry } from "./detection-overlay-geometry";
import type { OverlayGeometry } from "./detection-overlay-geometry";

const stroke = "fill-none stroke-current [vector-effect:non-scaling-stroke]";

// Picks the color class for a mark and cell state.
function markTone(mark: string | null | undefined, state?: OverlayCellState) {
  if (state === "pending") return "text-draw-guide";
  if (mark === "X") return "text-player-x [--mark-wash:var(--color-player-x-wash)]";
  if (mark === "O") return "text-player-o [--mark-wash:var(--color-player-o-wash)]";
  return "text-accent";
}

// Builds the outline class for one overlay cell.
function cellBoundaryClass(state: string) {
  const dashed = state === "pending" || state === "candidate" || state === "rejected";
  return cn(stroke, "stroke-[1.5]", (state === "confirmed" || state === "detected") && "[fill:var(--mark-wash)]", state === "empty" && "stroke-none", dashed && "[stroke-dasharray:5_4]");
}

// Builds the X or O stroke class for one cell.
function cellMarkClass(state: string) {
  return cn(stroke, "stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]", state === "candidate" && "[stroke-dasharray:5_4]");
}

// Builds the floating label class for one cell.
function cellLabelClass(mark: string | null, state: OverlayCellState) {
  return cn("absolute inline-flex items-center gap-[3px] rounded-[3px] bg-paper px-1 py-px text-sm leading-tight font-[750]", markTone(mark, state), state === "pending" && "-translate-y-full");
}

// Shows Checking or Draw next to a cell label.
function OverlayLabelBadge({ state, checking }: { state: OverlayCellState; checking: boolean }) {
  if (checking)
    return (
      <>
        <AnalysisIndicator kind="cell" />
        <span className="text-[10px] font-[550]">Checking</span>
      </>
    );
  if (state === "pending") return <span className="text-[10px] font-[550]">Draw</span>;
  return null;
}

// Draws one cell's outline and X or O mark.
function OverlayCellMarks({ cell, geometry }: { cell: OverlayCell; geometry: OverlayCellGeometry }) {
  return (
    <g className={markTone(cell.mark, cell.state)}>
      <polygon className={cellBoundaryClass(cell.state)} points={geometry.outline} />
      {cell.mark === "X" && geometry.cross.map(([start, end]) => <line key={`cross-${start.x}-${start.y}`} className={cellMarkClass(cell.state)} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />)}
      {cell.mark === "O" && (cell.state === "pending" ? <path className={cellMarkClass(cell.state)} d={geometry.ringGuide} /> : <polygon className={cellMarkClass(cell.state)} points={geometry.ring} />)}
    </g>
  );
}

// Draws the board outline and inner grid lines.
function OverlayGridLines({ verified, geometry }: { verified: boolean; geometry: OverlayGeometry }) {
  return (
    <>
      <polygon className={cn(stroke, "stroke-2 text-board-outline", !verified && "[stroke-dasharray:7_5]")} points={geometry.outline} />
      {geometry.lines.map(({ start, end }) => (
        <line key={`line-${start.x}-${start.y}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className={cn(stroke, "stroke-1 text-board-outline [stroke-dasharray:5_5]")} />
      ))}
    </>
  );
}

// Draws the winning line across three cells.
function OverlayStrike({ first, last, tone }: { first: { x: number; y: number }; last: { x: number; y: number }; tone: string | null | undefined }) {
  return <line className={cn(stroke, "stroke-[5] [stroke-linecap:round]", markTone(tone))} x1={first.x} y1={first.y} x2={last.x} y2={last.y} />;
}

// Composes grid lines, cell marks, and a winning strike.
function OverlayGrid({ view, geometry }: { view: OverlayView; geometry: OverlayGeometry }) {
  const { cells, verified, first, last, outcome } = view;
  return (
    <>
      <OverlayGridLines verified={verified} geometry={geometry} />
      {cells.map((cell, index) => (
        <OverlayCellMarks key={CELL_NAMES[index]} cell={cell} geometry={geometry.cells[index]} />
      ))}
      {first && last && <OverlayStrike first={first} last={last} tone={outcome?.outcome} />}
    </>
  );
}

// Places a label over every overlay cell.
function OverlayLabels({ cells, geometry }: { cells: OverlayCell[]; geometry: OverlayGeometry }) {
  return cells.map((cell, index) => <OverlayCellLabel key={CELL_NAMES[index]} cell={cell} geometry={geometry.cells[index]} />);
}

// Shows a Draw or Checking badge on one cell.
function OverlayCellLabel({ cell, geometry }: { cell: OverlayCell; geometry: OverlayCellGeometry }) {
  const busy = useAnalysisBusy(cell.checking);
  if (cell.state === "confirmed" || cell.state === "detected" || cell.state === "rejected") return null;
  const checking = busy;
  if (!checking && cell.state !== "pending") return null;
  return (
    <span
      className={cellLabelClass(cell.mark, cell.state)}
      aria-hidden="true"
      style={{
        left: `${geometry.label.x / 10}%`,
        top: `${geometry.label.y / 10}%`,
      }}
      title={cell.status}
    >
      {cell.mark}
      <OverlayLabelBadge state={cell.state} checking={checking} />
    </span>
  );
}

// Draws the live board overlay on the camera frame.
export const DetectionOverlay = observer(function DetectionOverlay() {
  const game = useGameStore();
  const geometry = useMemo(() => buildOverlayGeometry(game.corners), [game.corners]);
  if (!geometry) return null;
  const view = buildOverlayView(game, geometry);
  return (
    <div className="pointer-events-none absolute inset-0 size-full text-board-outline">
      <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="img" aria-label={overlayAriaLabel(view.label, view.cells, view.targetHint)}>
        <OverlayGrid view={view} geometry={geometry} />
      </svg>
      <OverlayLabels cells={view.cells} geometry={geometry} />
    </div>
  );
});
