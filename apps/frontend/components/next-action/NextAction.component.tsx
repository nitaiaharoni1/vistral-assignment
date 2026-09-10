import type { GameStore } from "../../stores/game/game.store";
import { observer } from "mobx-react-lite";
import { Circle, Eye, Pause, WarningCircle, X } from "@phosphor-icons/react";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import { hasPendingMove } from "@shared/session.helpers";
import { DrawGuideIcon } from "../shared/draw-guide-icon/DrawGuideIcon.component";
import { Action } from "../shared/action/Action.component";
import { cn } from "../shared/cn";
import {
  nextActionCopy,
  nextActionNeedsAttention,
  nextActionNewGameLabel,
  nextActionShowsNewGame,
  type NextActionSymbol,
} from "./next-action-copy";

const nextActionClass =
  "grid h-[72px] grid-cols-[32px_minmax(0,1fr)] items-center gap-3 rounded-xl bg-paper px-3 py-2 text-ink shadow-[0_3px_16px_rgb(23_33_58/12%)]";

const actionSymbolClass =
  "grid size-8 shrink-0 place-items-center rounded-lg bg-accent-wash text-accent [&_svg]:size-6";

const headingClass =
  "text-base font-[650] leading-5 tracking-[-0.02em] text-pretty";

const guidanceClass = "mt-1 text-[11px] leading-4 text-muted";

type NextActionProps = {
  onNewGame: () => void;
  headingAs?: "h1" | "h3";
};

function ActionSymbol({ name }: { name: NextActionSymbol }) {
  switch (name) {
    case "x":
      return <X size={36} weight="bold" />;
    case "o":
      return <Circle size={36} weight="bold" />;
    case "eye":
      return <Eye size={32} />;
    case "pause":
      return <Pause size={32} />;
    case "warning":
      return <WarningCircle size={32} />;
    default: {
      const exhaustive: never = name;
      return exhaustive;
    }
  }
}

export function actionCopy(game: GameStore) {
  if (game.preparingBoard && !game.blocked) {
    return {
      title:
        game.corners.length === 4 ? "Reading your board…" : "Draw a 3×3 grid.",
      guidance:
        game.agent.message ||
        game.error ||
        (game.corners.length === 4
          ? "Keep the whole grid visible."
          : "Two vertical lines, two horizontal lines."),
      symbol: "eye" as const,
    };
  }
  const copy = nextActionCopy(game);
  const connecting = game.agent.enabled && !game.agent.reply?.analysis;
  const title = connecting ? "Reading your board…" : copy.title;
  const guidance =
    game.agent.enabled && (game.agent.message || game.agent.busy)
      ? game.agent.message || "Reading your board…"
      : copy.guidance;
  const symbol: NextActionSymbol = connecting ? "eye" : copy.symbol;
  return { title, guidance, symbol };
}

export const NextAction = observer(function NextAction({
  onNewGame,
  headingAs: Heading = "h1",
}: NextActionProps) {
  const game = useGameStore();
  const { title, guidance, symbol } = actionCopy(game);
  const { session, stage } = game;
  const showNewGame = nextActionShowsNewGame(game);
  const drawing =
    symbol === "o" &&
    hasPendingMove(session) &&
    session.recognizedBoard[session.pendingMove!] !== "O";
  const actionKey = `${stage}:${session.phase}:${session.pendingMove}:${session.paused}:${game.corners.length}`;
  return (
    <section
      className={cn(
        nextActionClass,
        showNewGame && "grid-cols-[minmax(0,1fr)_auto]",
      )}
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className={cn(
          actionSymbolClass,
          showNewGame && "hidden",
          !drawing &&
            nextActionNeedsAttention(game) &&
            "bg-attention-wash text-attention",
          drawing && "bg-draw-guide-wash text-draw-guide",
        )}
        aria-hidden="true"
      >
        <span
          className="motion-settle grid place-items-center animate-turn-change"
          key={actionKey}
        >
          {drawing ? (
            <DrawGuideIcon size={36} />
          ) : (
            <ActionSymbol name={symbol} />
          )}
        </span>
      </span>
      <div className="min-h-0 min-w-0 max-h-full overflow-y-auto overscroll-contain">
        <Heading className={headingClass}>{title}</Heading>
        <p className={guidanceClass}>{guidance}</p>
      </div>
      {showNewGame && (
        <div className="justify-self-end">
          <Action onClick={onNewGame}>{nextActionNewGameLabel(game)}</Action>
        </div>
      )}
    </section>
  );
});
