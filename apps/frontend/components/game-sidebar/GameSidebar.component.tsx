import { observer } from "mobx-react-lite";
import {
  CaretDown,
  Circle,
  DownloadSimple,
  Eye,
  X,
} from "@phosphor-icons/react";
import { CELL_IDS, type SessionEvent } from "../../types";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import { Action } from "../shared/action/Action.component";
import { cn } from "../shared/cn";

const detailsClass = cn(
  "mt-0 max-h-[30dvh] overflow-auto overscroll-contain border-t border-line",
  "open:[&>div]:animate-motion-fade",
  "[&>summary>svg]:ml-auto [&>summary>svg]:transition-transform [&>summary>svg]:duration-[180ms]",
  "open:[&>summary>svg]:rotate-180",
);

const summaryClass = cn(
  "flex min-h-9 cursor-pointer list-none items-center gap-5 py-1.5 text-sm [&::-webkit-details-marker]:hidden",
  "max-[600px]:gap-3.5",
);

const sessionContentClass = cn(
  "grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-16 gap-y-6 py-2.5 pb-[22px]",
  "max-[800px]:gap-x-7 max-[600px]:grid-cols-1 max-[600px]:gap-6",
);

type GameSidebarProps = {
  onExport: () => void;
};

function isLoggedMove(event: SessionEvent): boolean {
  return (
    event.kind === "human-move" ||
    event.kind === "ai-confirmed" ||
    event.kind === "observed-move" ||
    event.kind === "board-sync"
  );
}

function moveActor(event: SessionEvent, mode: "play" | "replay"): string {
  if (event.kind === "board-sync") return "Board observed";
  if (mode === "replay") return `${event.mark} player`;
  return event.mark === "O" ? "Paperplay" : "You";
}

function MoveMark({ event }: { event: SessionEvent }) {
  if (event.kind === "board-sync") {
    return <Eye size={13} weight="bold" aria-hidden="true" />;
  }
  if (event.mark === "O") {
    return <Circle size={13} weight="bold" aria-hidden="true" />;
  }
  return <X size={13} weight="bold" aria-hidden="true" />;
}

const MoveList = observer(function MoveList({
  onExport,
}: {
  onExport: () => void;
}) {
  const game = useGameStore();
  const { session } = game;
  const moves = session.events.filter(isLoggedMove);
  return (
    <section className="max-w-[500px]">
      <div className="flex items-center justify-between gap-3.5">
        <h2 className="text-sm leading-[1.4] font-[650] max-[600px]:text-[13px]">
          {session.mode === "replay"
            ? "Confirmed observations"
            : "Confirmed moves"}
        </h2>
        <Action tone="text" onClick={onExport}>
          <DownloadSimple size={15} aria-hidden="true" /> Save session log
        </Action>
      </div>
      {game.agent.enabled && (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Action
            tone="text"
            disabled={!game.agent.reply?.analysis || game.agent.busy}
            onClick={game.agent.openCorrection}
          >
            Correct a reading
          </Action>
          {game.agent.reply && (
            <span className="text-xs text-muted">
              {game.agent.reply.learnedExamples} saved examples ·{" "}
              {game.agent.reply.latencyMs} ms · $
              {game.agent.reply.costUsd.toFixed(4)}
            </span>
          )}
        </div>
      )}
      {moves.length === 0 ? (
        <p className="mt-[18px] text-sm text-muted">No confirmed moves yet.</p>
      ) : (
        <ol className="mt-3.5 mb-0 list-none p-0">
          {moves.map((event) => (
            <li
              key={event.id}
              className="flex items-center gap-3 py-2 text-[13px]"
            >
              <span
                className={cn(
                  "grid size-7 place-items-center rounded-lg",
                  event.mark === "O"
                    ? "bg-player-o-wash text-player-o"
                    : "bg-player-x-wash text-player-x",
                )}
              >
                <MoveMark event={event} />
              </span>
              <span className="min-w-0 flex-1 font-[550] wrap-anywhere">
                {moveActor(event, session.mode)}
                <small className="mt-[3px] block text-xs font-normal text-muted">
                  {event.message}
                </small>
              </span>
              <span className="font-mono text-xs text-muted">
                {event.cell !== undefined ? CELL_IDS[event.cell] : ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
});

export const GameSidebar = observer(function GameSidebar({
  onExport,
}: GameSidebarProps) {
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
              {readingRate.toFixed(1)} board checks/sec ·{" "}
              {Math.round(observation.processingMs)} ms per check.
            </span>
          )}
          <p>
            {source === "sample"
              ? "This sample uses generated images, not a physical game. Both players are drawn automatically."
              : "The session log contains observed moves and decisions."}
          </p>
          <p>Camera frames are processed on this device.</p>
        </div>
      </div>
    </details>
  );
});
