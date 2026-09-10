import type { RefObject } from "react";
import { observer } from "mobx-react-lite";
import { ArrowLeft } from "@phosphor-icons/react";
import { ArrowRight } from "@phosphor-icons/react";
import { ArrowUpRight } from "@phosphor-icons/react";
import { Camera } from "@phosphor-icons/react";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import type { Source } from "../../../../stores/game/game.store";
import type { Stage } from "../../../../stores/game/game.store";
import { Action } from "../../../shared/action/Action.component";
import { ErrorNotice } from "../../../shared/error-notice/ErrorNotice.component";
import { welcomeActionsClass } from "../../camera-workspace.classes";
import { welcomeCopyClass } from "../../camera-workspace.classes";
import { welcomeLeadClass } from "../../camera-workspace.classes";
import { welcomeTitleClass } from "../../camera-workspace.classes";
import { welcomeUtilitiesClass } from "../../camera-workspace.classes";

type WelcomePanelProps = {
  fileRef: RefObject<HTMLInputElement | null>;
};

// Returns the welcome title for idle or starting.
function welcomeHeading(stage: Stage) {
  if (stage === "starting") {
    return (
      <>
        One moment.
        <br />
        <span className="text-accent">Getting ready.</span>
      </>
    );
  }
  return (
    <>
      Your pen.
      <br />
      <span className="text-accent">My next move.</span>
    </>
  );
}

// Returns the welcome lead sentence for the current source.
function welcomeLead(stage: Stage, source: Source) {
  if (stage !== "starting") {
    return "A paper game of tic-tac-toe, with an opponent that watches through your camera.";
  }
  if (source === "video") return "Opening the first frame of your recording.";
  if (source === "sample") return "Drawing a sample game through the same reader.";
  return "Allow camera access in your browser to bring your board into view.";
}

// Shows Let's Play or Back, depending on stage.
const WelcomeActions = observer(function WelcomeActions() {
  const game = useGameStore();
  if (game.stage === "starting") {
    return (
      <Action tone="quiet" size="welcome" onClick={game.reset}>
        <ArrowLeft size={18} aria-hidden="true" /> Back
      </Action>
    );
  }
  return (
    <Action size="welcome" onClick={() => void game.startCamera()}>
      <Camera size={19} aria-hidden="true" /> Let's Play <ArrowRight size={19} aria-hidden="true" />
    </Action>
  );
});

// Shows the welcome copy, start actions, and errors.
export const WelcomePanel = observer(function WelcomePanel({ fileRef }: WelcomePanelProps) {
  const game = useGameStore();
  const { stage, source } = game;
  return (
    <div className={welcomeCopyClass} hidden={!game.welcome}>
      <h1 className={welcomeTitleClass}>{welcomeHeading(stage)}</h1>
      <p className={welcomeLeadClass}>{welcomeLead(stage, source)}</p>
      <div className={welcomeActionsClass}>
        <WelcomeActions />
      </div>
      <div className={welcomeUtilitiesClass} hidden={!game.canLoadVideo}>
        <Action tone="text" onClick={game.startSample}>
          See it play
        </Action>
        <span aria-hidden="true">/</span>
        <Action tone="text" onClick={() => fileRef.current?.click()} disabled={!game.canLoadVideo}>
          Load a video
        </Action>
        <span aria-hidden="true">/</span>
        <Action tone="text" href="/board.svg" target="_blank" rel="noreferrer">
          Print a board <ArrowUpRight size={14} aria-hidden="true" />
        </Action>
      </div>
      {game.error && <ErrorNotice>{game.error}</ErrorNotice>}
    </div>
  );
});
