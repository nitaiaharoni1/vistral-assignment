import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CELL_NAMES } from "../../../../types";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import { cn } from "../../../shared/cn";
import {
  AnalysisIndicator,
  useAnalysisBusy,
} from "../../../shared/analysis-indicator/AnalysisIndicator.component";
import {
  buildOverlayView,
  overlayAriaLabel,
  type OverlayCell,
  type OverlayCellState,
  type OverlayView,
} from "./detection-overlay-cell-state";
import {
  buildOverlayGeometry,
  type OverlayCellGeometry,
  type OverlayGeometry,
} from "./detection-overlay-geometry";

const stroke = "fill-none stroke-current [vector-effect:non-scaling-stroke]";

function markTone(mark: string | null | undefined, state?: OverlayCellState) {
  if (state === "pending") return "text-draw-guide";
  if (mark === "X")
    return "text-player-x [--mark-wash:var(--color-player-x-wash)]";
  if (mark === "O")
    return "text-player-o [--mark-wash:var(--color-player-o-wash)]";
  return "text-accent";
}

function cellBoundaryClass(state: string) {
  const dashed =
    state === "pending" || state === "candidate" || state === "rejected";
  return cn(
    stroke,
    "stroke-[1.5]",
    (state === "confirmed" || state === "detected") &&
      "[fill:var(--mark-wash)]",
    state === "empty" && "stroke-none",
    dashed && "[stroke-dasharray:5_4]",
  );
}

function cellMarkClass(state: string) {
  return cn(
    stroke,
    "stroke-[3] [stroke-linecap:round] [stroke-linejoin:round]",
    state === "candidate" && "[stroke-dasharray:5_4]",
  );
}

function cellLabelClass(mark: string | null, state: OverlayCellState) {
  return cn(
    "absolute inline-flex items-center gap-[3px] rounded-[3px] bg-paper px-1 py-px text-sm leading-tight font-[750]",
    markTone(mark, state),
    state === "pending" && "-translate-y-full",
  );
}

function OverlayLabelBadge({
  state,
  checking,
}: {
  state: OverlayCellState;
  checking: boolean;
}) {
  if (checking)
    return (
      <>
        <AnalysisIndicator kind="cell" />
        <span className="text-[10px] font-[550]">Checking</span>
      </>
    );
  if (state === "pending")
    return <span className="text-[10px] font-[550]">Draw</span>;
  return null;
}

function OverlayCellMarks({
  cell,
  geometry,
}: {
  cell: OverlayCell;
  geometry: OverlayCellGeometry;
}) {
  return (
    <g className={markTone(cell.mark, cell.state)}>
      <polygon
        className={cellBoundaryClass(cell.state)}
        points={geometry.outline}
      />
      {cell.mark === "X" &&
        geometry.cross.map(([start, end]) => (
          <line
            key={`cross-${start.x}-${start.y}`}
            className={cellMarkClass(cell.state)}
            x1={start.x}
            y1={start.y}
            x2={end.x}
            y2={end.y}
          />
        ))}
      {cell.mark === "O" &&
        (cell.state === "pending" ? (
          <path className={cellMarkClass(cell.state)} d={geometry.ringGuide} />
        ) : (
          <polygon
            className={cellMarkClass(cell.state)}
            points={geometry.ring}
          />
        ))}
    </g>
  );
}

function OverlayGrid({
  view,
  geometry,
}: {
  view: OverlayView;
  geometry: OverlayGeometry;
}) {
  const { cells, verified, first, last, outcome } = view;
  return (
    <>
      <polygon
        className={cn(
          stroke,
          "stroke-2 text-board-outline",
          !verified && "[stroke-dasharray:7_5]",
        )}
        points={geometry.outline}
      />
      {geometry.lines.map(({ start, end }) => (
        <line
          key={`line-${start.x}-${start.y}`}
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          className={cn(
            stroke,
            "stroke-1 text-board-outline [stroke-dasharray:5_5]",
          )}
        />
      ))}
      {cells.map((cell, index) => (
        <OverlayCellMarks
          key={CELL_NAMES[index]}
          cell={cell}
          geometry={geometry.cells[index]}
        />
      ))}
      {first && last && (
        <line
          className={cn(
            stroke,
            "stroke-[5] [stroke-linecap:round]",
            markTone(outcome?.outcome),
          )}
          x1={first.x}
          y1={first.y}
          x2={last.x}
          y2={last.y}
        />
      )}
    </>
  );
}

function OverlayLabels({
  cells,
  geometry,
}: {
  cells: OverlayCell[];
  geometry: OverlayGeometry;
}) {
  return cells.map((cell, index) => (
    <OverlayCellLabel
      key={CELL_NAMES[index]}
      cell={cell}
      geometry={geometry.cells[index]}
    />
  ));
}

function OverlayCellLabel({
  cell,
  geometry,
}: {
  cell: OverlayCell;
  geometry: OverlayCellGeometry;
}) {
  const busy = useAnalysisBusy(cell.checking);
  if (
    cell.state === "confirmed" ||
    cell.state === "detected" ||
    cell.state === "rejected"
  )
    return null;
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

export const DetectionOverlay = observer(function DetectionOverlay() {
  const game = useGameStore();
  const geometry = useMemo(
    () => buildOverlayGeometry(game.corners),
    [game.corners],
  );
  if (!geometry) return null;
  const view = buildOverlayView(game, geometry);
  return (
    <div className="pointer-events-none absolute inset-0 size-full text-board-outline">
      <svg
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 1000 1000"
        preserveAspectRatio="none"
        role="img"
        aria-label={overlayAriaLabel(view.label, view.cells, view.targetHint)}
      >
        <OverlayGrid view={view} geometry={geometry} />
      </svg>
      <OverlayLabels cells={view.cells} geometry={geometry} />
    </div>
  );
});
