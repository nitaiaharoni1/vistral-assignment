import { observer } from "mobx-react-lite";
import { GridFour, Circle, X } from "@phosphor-icons/react";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import { DrawGuideIcon } from "../../../shared/draw-guide-icon/DrawGuideIcon.component";
import { overlayLegendClass } from "../../camera-workspace.classes";

export const CameraFooter = observer(function CameraFooter() {
  const game = useGameStore();
  if (!game.inGame || game.blocked) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
      <div className={overlayLegendClass} aria-label="Board overlay legend">
        <span className="text-player-x">
          <X size={15} weight="bold" aria-hidden="true" /> You
        </span>
        <span className="text-player-o">
          <Circle size={15} weight="bold" aria-hidden="true" /> Paperplay
        </span>
        <span className="text-board-outline">
          <GridFour size={15} aria-hidden="true" /> Board
        </span>
        <span className="text-draw-guide">
          <DrawGuideIcon /> Draw next
        </span>
      </div>
    </div>
  );
});
