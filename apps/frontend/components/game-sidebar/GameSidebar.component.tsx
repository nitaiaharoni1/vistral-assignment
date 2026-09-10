import { observer } from "mobx-react-lite";
import { CaretDown } from "@phosphor-icons/react";
import { Circle } from "@phosphor-icons/react";
import { DownloadSimple } from "@phosphor-icons/react";
import { Eye } from "@phosphor-icons/react";
import { X } from "@phosphor-icons/react";
import { CELL_IDS } from "../../types";
import type { SessionEvent } from "../../types";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import { Action } from "../shared/action/Action.component";
import { cn } from "../shared/cn/cn";

const detailsClass = cn(
  "max-h-[30dvh] overflow-auto overscroll-contain border-t border-line",
  "open:[&>div]:animate-motion-fade",
  "[&>summary>svg]:ml-auto [&>summary>svg]:transition-transform [&>summary>svg]:duration-[180ms]",
  "open:[&>summary>svg]:rotate-180",
);

const summaryClass = cn("flex min-h-9 cursor-pointer list-none items-center gap-5 py-1.5 text-sm [&::-webkit-details-marker]:hidden", "hover:text-ink hover:[&_.text-muted]:text-[#4a5160]", "max-[600px]:gap-3.5");

const sessionContentClass = cn("grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-16 gap-y-6 py-2.5 pb-[22px]", "max-[800px]:gap-x-7 max-[600px]:grid-cols-1 max-[600px]:gap-6");

type GameSidebarProps = {
  onExport: () => void;
};

// True when the event should appear in the move list.
function isLoggedMove(event: SessionEvent): boolean {
  return event.kind === "human-move" || event.kind === "ai-confirmed" || event.kind === "observed-move" || event.kind === "board-sync";
}

// Names who made a logged move for play or replay.
function moveActor(event: SessionEvent, mode: "play" | "replay"): string {
  if (event.kind === "board-sync") return "Board observed";
  if (mode === "replay") return `${event.mark} player`;
  return event.mark === "O" ? "Paperplay" : "You";
}

// Shows the eye, O, or X icon for a logged event.
function MoveMark({ event }: { event: SessionEvent }) {
  if (event.kind === "board-sync") {
    return <Eye size={13} weight="bold" aria-hidden="true" />;
  }
  if (event.mark === "O") {
    return <Circle size={13} weight="bold" aria-hidden="true" />;
  }
  return <X size={13} weight="bold" aria-hidden="true" />;
}

// Offers a reading correction once the agent has a reply.
const CorrectionTools = observer(function CorrectionTools() {
  const game = useGameStore();
  if (!game.gameAgent.enabled) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Action tone="text" disabled={!game.gameAgent.reply?.analysis || game.gameAgent.busy} onClick={game.gameAgent.openCorrection}>
        Correct a reading
      </Action>
      {game.gameAgent.reply && (
        <span className="text-xs text-muted">
          {game.gameAgent.reply.learnedExamples} saved examples · {game.gameAgent.reply.latencyMs} ms · ${game.gameAgent.reply.costUsd.toFixed(4)}
        </span>
      )}
    </div>
  );
});

// Renders one confirmed move with actor, message, and square.
function MoveRow({ event, mode }: { event: SessionEvent; mode: "play" | "replay" }) {
  return (
    <li className="flex items-center gap-3 py-2 text-[13px]">
      <span className={cn("grid size-7 place-items-center rounded-lg", event.mark === "O" ? "bg-player-o-wash text-player-o" : "bg-player-x-wash text-player-x")}>
        <MoveMark event={event} />
      </span>
      <span className="min-w-0 flex-1 font-[550] wrap-anywhere">
        {moveActor(event, mode)}
        <small className="mt-[3px] block text-xs font-normal text-muted">{event.message}</small>
      </span>
      <span className="font-mono text-xs text-muted">{event.cell !== undefined ? CELL_IDS[event.cell] : ""}</span>
    </li>
  );
}

// Lists confirmed moves and the session export action.
const MoveList = observer(function MoveList({ onExport }: { onExport: () => void }) {
  const game = useGameStore();
  const { session } = game;
  const moves = session.events.filter(isLoggedMove);
  return (
    <section className="max-w-[500px]">
      <div className="flex items-center justify-between gap-3.5">
        <h2 className="text-sm leading-[1.4] font-[650] max-[600px]:text-[13px]">{session.mode === "replay" ? "Confirmed observations" : "Confirmed moves"}</h2>
        <Action tone="text" onClick={onExport}>
          <DownloadSimple size={15} aria-hidden="true" /> Save session log
        </Action>
      </div>
      <CorrectionTools />
      {moves.length === 0 ? (
        <p className="mt-[18px] text-sm text-muted">No confirmed moves yet.</p>
      ) : (
        <ol className="mt-3.5 mb-0 list-none p-0">
          {moves.map((event) => (
            <MoveRow key={event.id} event={event} mode={session.mode} />
          ))}
        </ol>
      )}
    </section>
  );
});

// Shows the collapsible session summary and move log.
export const GameSidebar = observer(function GameSidebar({ onExport }: GameSidebarProps) {
  const game = useGameStore();
  const { source, observation } = game;
  const moveCount = game.session.board.filter(Boolean).length;
  const readingRate = game.readingRate;
  return (
    <details className={detailsClass}>
      <summary className={summaryClass}>
        <span>Session</span>
        <span className="flex min-w-0 flex-wrap gap-4 text-xs text-muted max-[600px]:gap-2.5">
          {moveCount} {moveCount === 1 ? "move" : "moves"}
        </span>
        <CaretDown size={16} aria-hidden="true" />
      </summary>

      <div className={sessionContentClass}>
        <MoveList onExport={onExport} />
        <div className="col-span-full text-xs text-muted [&>p]:mt-1.5">
          {observation && (
            <span>
              {readingRate.toFixed(1)} board checks/sec · {Math.round(observation.processingMs)} ms per check.
            </span>
          )}
          <p>{source === "sample" ? "This sample uses generated images, not a physical game. Both players are drawn automatically." : "The session log contains observed moves and decisions."}</p>
          <p>Raw video stays on this device. In camera mode, cropped board snapshots are sent to the board-reading model.</p>
        </div>
      </div>
    </details>
  );
});
