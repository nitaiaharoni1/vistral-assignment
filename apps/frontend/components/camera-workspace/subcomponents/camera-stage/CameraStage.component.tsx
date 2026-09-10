import { useEffect, useRef, type CSSProperties, type RefObject } from "react";
import { observer } from "mobx-react-lite";
import { ArrowClockwise, X, Pause, Play, Check } from "@phosphor-icons/react";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import { DetectionOverlay } from "../detection-overlay/DetectionOverlay.component";
import { AnalysisIndicator } from "../../../shared/analysis-indicator/AnalysisIndicator.component";
import { boardAnalysisLabel } from "../detection-overlay/detection-overlay-cell-state";
import { NextAction } from "../../../next-action/NextAction.component";
import { Action } from "../../../shared/action/Action.component";
import { cn } from "../../../shared/cn";
import {
  cameraBlockerClass,
  cameraStageBase,
  cameraStageBlocked,
  cameraImagePlaneLiveClass,
  cameraImagePlaneWelcomeClass,
  cameraNextActionClass,
  cameraStageLive,
  cameraStageWelcome,
  frameStatusClass,
  sourceVideoHidden,
  sourceVideoPreview,
  welcomeArtClass,
} from "../../camera-workspace.classes";

type CameraStageProps = {
  resumeRef: RefObject<HTMLButtonElement | null>;
  pauseRef: RefObject<HTMLButtonElement | null>;
  onNewGame: () => void;
};

const DetectAgainControl = observer(function DetectAgainControl() {
  const game = useGameStore();
  const label =
    game.agent.enabled && game.agent.busy
      ? "Analyzing the board…"
      : boardAnalysisLabel(game, game.corners.length === 4);
  const busy = label !== null;
  return (
    <span
      className={cn(
        "rounded-xl bg-paper",
        busy && "[&_button:disabled]:opacity-100",
      )}
      title={label ?? "Detect again"}
    >
      <Action
        tone="icon"
        label={label ?? "Detect again"}
        disabled={busy || !game.canDetectAgain}
        onClick={game.detectAgain}
      >
        {busy ? (
          <span className="text-accent">
            <AnalysisIndicator kind="board" />
          </span>
        ) : (
          <ArrowClockwise size={20} aria-hidden="true" />
        )}
      </Action>
      <span className="sr-only" role="status">
        {label ?? ""}
      </span>
    </span>
  );
});

const FrameStatus = observer(function FrameStatus({
  pauseRef,
  onNewGame,
}: {
  onNewGame: () => void;
  pauseRef: RefObject<HTMLButtonElement | null>;
}) {
  const game = useGameStore();
  const finished = game.session.phase === "finished";
  return (
    <div className={frameStatusClass}>
      <div className="pointer-events-auto flex gap-2">
        {game.agent.enabled && !finished && (
          <span
            className="rounded-xl bg-paper"
            title="Done drawing. Check board"
          >
            <Action
              tone="icon"
              label="Done drawing. Check board"
              disabled={!game.agent.canCheck}
              onClick={() => void game.agent.checkNow()}
            >
              <Check size={20} aria-hidden="true" />
            </Action>
          </span>
        )}
        <DetectAgainControl />
        {game.inGame && !finished && (
          <span className="rounded-xl bg-paper" title="Pause">
            <Action
              tone="icon"
              label="Pause"
              ref={pauseRef}
              onClick={game.togglePause}
            >
              <Pause size={20} aria-hidden="true" />
            </Action>
          </span>
        )}
        <span className="rounded-xl bg-paper" title="New game">
          <Action tone="icon" label="New game" onClick={onNewGame}>
            <X size={20} aria-hidden="true" />
          </Action>
        </span>
      </div>
    </div>
  );
});

const BlockerActions = observer(function BlockerActions({
  resumeRef,
  onNewGame,
}: {
  resumeRef: RefObject<HTMLButtonElement | null>;
  onNewGame: () => void;
}) {
  const game = useGameStore();
  if (game.needsRestart) {
    return (
      <Action
        size="board"
        wide
        ref={resumeRef}
        onClick={game.canDetectAgain ? game.detectAgain : onNewGame}
      >
        <ArrowClockwise size={18} aria-hidden="true" />{" "}
        {game.canDetectAgain ? "Detect again" : "New session"}
      </Action>
    );
  }
  return (
    <Action
      size="board"
      wide
      ref={resumeRef}
      disabled={!game.canResume}
      onClick={game.togglePause}
    >
      <Play size={18} weight="fill" aria-hidden="true" /> Resume
    </Action>
  );
});

const CameraBlocker = observer(function CameraBlocker({
  resumeRef,
  onNewGame,
}: {
  resumeRef: RefObject<HTMLButtonElement | null>;
  onNewGame: () => void;
}) {
  const game = useGameStore();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node =
      game.canResume || game.needsRestart
        ? resumeRef.current
        : headingRef.current;
    node?.focus({ preventScroll: true });
  }, [game.canResume, game.needsRestart, resumeRef]);
  return (
    <div
      className={cameraBlockerClass}
      role="group"
      aria-label={game.needsRestart ? "Reconnect camera" : "Camera paused"}
    >
      <Pause size={32} aria-hidden="true" />
      <h1 className="text-[25px] leading-[1.2]" ref={headingRef} tabIndex={-1}>
        {game.needsRestart ? "Let’s reconnect." : "Camera paused."}
      </h1>
      <p className="max-w-[34ch] text-sm text-muted">
        {game.error ||
          "Your moves are saved. Hold the page still, then resume."}
      </p>
      <BlockerActions resumeRef={resumeRef} onNewGame={onNewGame} />
      {!game.canResume && !game.needsRestart && (
        <p className="max-w-[34ch] text-sm text-muted" role="status">
          Waiting for the camera picture to return…
        </p>
      )}
    </div>
  );
});

export const CameraStage = observer(function CameraStage({
  resumeRef,
  pauseRef,
  onNewGame,
}: CameraStageProps) {
  const game = useGameStore();
  const { blocked, welcome, showVideo } = game;
  return (
    <div
      className={cn(
        cameraStageBase,
        welcome ? cameraStageWelcome : cameraStageLive,
        blocked && cameraStageBlocked,
      )}
      style={{ "--frame-ratio": game.frameRatio } as CSSProperties}
    >
      <div
        className={
          welcome ? cameraImagePlaneWelcomeClass : cameraImagePlaneLiveClass
        }
      >
        <canvas
          ref={game.attachCanvas}
          className="block h-auto w-full rounded-2xl"
          aria-label="Current camera or sample frame"
          aria-hidden={blocked}
          hidden={welcome || showVideo}
        />
        <video
          ref={game.attachVideo}
          muted
          playsInline
          className={showVideo ? sourceVideoPreview : sourceVideoHidden}
          aria-label="Live camera or loaded video"
          aria-hidden={!showVideo || blocked}
        />
        {!welcome && !blocked && <DetectionOverlay />}
        <img
          className={welcomeArtClass}
          src="/paperplay-sculpture.webp"
          width="1024"
          height="1024"
          alt="Sculptural paper X and O with a pen on cobalt blue"
          hidden={!welcome}
          fetchPriority="high"
        />
      </div>
      {!welcome && !blocked && (
        <>
          <FrameStatus pauseRef={pauseRef} onNewGame={onNewGame} />
          <div className={cameraNextActionClass}>
            <NextAction onNewGame={onNewGame} />
          </div>
        </>
      )}
      {blocked && <CameraBlocker resumeRef={resumeRef} onNewGame={onNewGame} />}
    </div>
  );
});
