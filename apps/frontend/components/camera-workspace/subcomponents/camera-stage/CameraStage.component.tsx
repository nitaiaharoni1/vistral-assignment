import { useEffect } from "react";
import { useRef } from "react";
import type { CSSProperties } from "react";
import type { RefObject } from "react";
import { observer } from "mobx-react-lite";
import { ArrowClockwise } from "@phosphor-icons/react";
import { X } from "@phosphor-icons/react";
import { Pause } from "@phosphor-icons/react";
import { Play } from "@phosphor-icons/react";
import { Check } from "@phosphor-icons/react";
import { useGameStore } from "../../../../stores/game/helpers/game.helpers";
import { DetectionOverlay } from "../detection-overlay/DetectionOverlay.component";
import { AnalysisIndicator } from "../../../shared/analysis-indicator/AnalysisIndicator.component";
import { boardAnalysisLabel } from "../detection-overlay/detection-overlay-cell-state";
import { NextAction } from "../../../next-action/NextAction.component";
import { Action } from "../../../shared/action/Action.component";
import { cn } from "../../../shared/cn/cn";
import { cameraBlockerClass } from "../../camera-workspace.classes";
import { cameraStageBase } from "../../camera-workspace.classes";
import { cameraStageBlocked } from "../../camera-workspace.classes";
import { cameraImagePlaneLiveClass } from "../../camera-workspace.classes";
import { cameraImagePlaneWelcomeClass } from "../../camera-workspace.classes";
import { cameraNextActionClass } from "../../camera-workspace.classes";
import { cameraStageLive } from "../../camera-workspace.classes";
import { cameraStageWelcome } from "../../camera-workspace.classes";
import { frameStatusClass } from "../../camera-workspace.classes";
import { sourceVideoHidden } from "../../camera-workspace.classes";
import { sourceVideoPreview } from "../../camera-workspace.classes";
import { welcomeArtClass } from "../../camera-workspace.classes";

type CameraStageProps = {
  resumeRef: RefObject<HTMLButtonElement | null>;
  pauseRef: RefObject<HTMLButtonElement | null>;
  onNewGame: () => void;
};

// Shows detect-again or a busy analysis indicator.
const DetectAgainControl = observer(function DetectAgainControl() {
  const game = useGameStore();
  const label = game.gameAgent.enabled && game.gameAgent.busy ? "Analyzing the board…" : boardAnalysisLabel(game, game.corners.length === 4);
  const busy = label !== null;
  return (
    <span className={cn("rounded-xl bg-paper", busy && "[&_button:disabled]:opacity-100")} title={label ?? "Detect again"}>
      <Action tone="icon" label={label ?? "Detect again"} disabled={busy || !game.canDetectAgain} onClick={game.detectAgain}>
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

// Shows check, detect, pause, and new-game controls on the frame.
const FrameStatus = observer(function FrameStatus({ pauseRef, onNewGame }: { onNewGame: () => void; pauseRef: RefObject<HTMLButtonElement | null> }) {
  const game = useGameStore();
  const finished = game.session.phase === "finished";
  return (
    <div className={frameStatusClass}>
      <div className="pointer-events-auto flex gap-2">
        {game.gameAgent.enabled && !finished && (
          <span className="rounded-xl bg-paper" title="Done drawing. Check board">
            <Action tone="icon" label="Done drawing. Check board" disabled={!game.gameAgent.canCheck} onClick={() => void game.gameAgent.checkNow()}>
              <Check size={20} aria-hidden="true" />
            </Action>
          </span>
        )}
        <DetectAgainControl />
        {game.inGame && !finished && (
          <span className="rounded-xl bg-paper" title="Pause">
            <Action tone="icon" label="Pause" ref={pauseRef} onClick={game.togglePause}>
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

// Shows resume or reconnect on the pause overlay.
const BlockerActions = observer(function BlockerActions({ resumeRef, onNewGame }: { resumeRef: RefObject<HTMLButtonElement | null>; onNewGame: () => void }) {
  const game = useGameStore();
  if (game.needsRestart) {
    return (
      <Action size="board" wide ref={resumeRef} onClick={game.canDetectAgain ? game.detectAgain : onNewGame}>
        <ArrowClockwise size={18} aria-hidden="true" /> {game.canDetectAgain ? "Detect again" : "New session"}
      </Action>
    );
  }
  return (
    <Action size="board" wide ref={resumeRef} disabled={!game.canResume} onClick={game.togglePause}>
      <Play size={18} weight="fill" aria-hidden="true" /> Resume
    </Action>
  );
});

// Covers the frame when the camera is paused or lost.
const CameraBlocker = observer(function CameraBlocker({ resumeRef, onNewGame }: { resumeRef: RefObject<HTMLButtonElement | null>; onNewGame: () => void }) {
  const game = useGameStore();
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const node = game.canResume || game.needsRestart ? resumeRef.current : headingRef.current;
    node?.focus({ preventScroll: true });
  }, [game.canResume, game.needsRestart, resumeRef]);
  return (
    <div className={cameraBlockerClass} role="group" aria-label={game.needsRestart ? "Reconnect camera" : "Camera paused"}>
      <Pause size={32} aria-hidden="true" />
      <h1 className="text-[25px] leading-[1.2]" ref={headingRef} tabIndex={-1}>
        {game.needsRestart ? "Let’s reconnect." : "Camera paused."}
      </h1>
      <p className="max-w-[34ch] text-sm text-muted">{game.error || "Your moves are saved. Hold the page still, then resume."}</p>
      <BlockerActions resumeRef={resumeRef} onNewGame={onNewGame} />
      {!game.canResume && !game.needsRestart && (
        <p className="max-w-[34ch] text-sm text-muted" role="status">
          Waiting for the camera picture to return…
        </p>
      )}
    </div>
  );
});

// Shows canvas, video, overlay, or welcome art.
const CameraImagePlane = observer(function CameraImagePlane() {
  const game = useGameStore();
  const { welcome, showVideo, blocked } = game;
  return (
    <div className={welcome ? cameraImagePlaneWelcomeClass : cameraImagePlaneLiveClass}>
      <canvas ref={game.attachCanvas} className="block h-auto w-full rounded-2xl" aria-label="Current camera or sample frame" aria-hidden={blocked} hidden={welcome || showVideo} />
      <video ref={game.attachVideo} muted playsInline className={showVideo ? sourceVideoPreview : sourceVideoHidden} aria-label="Live camera or loaded video" aria-hidden={!showVideo || blocked} />
      {!welcome && !blocked && <DetectionOverlay />}
      <img className={welcomeArtClass} src="/paperplay-sculpture.webp" width="1024" height="1024" alt="Sculptural paper X and O with a pen on cobalt blue" hidden={!welcome} fetchPriority="high" />
    </div>
  );
});

// Composes the camera frame, controls, and pause blocker.
export const CameraStage = observer(function CameraStage({ resumeRef, pauseRef, onNewGame }: CameraStageProps) {
  const game = useGameStore();
  const { blocked, welcome } = game;
  return (
    <div className={cn(cameraStageBase, welcome ? cameraStageWelcome : cameraStageLive, blocked && cameraStageBlocked)} style={{ "--frame-ratio": game.frameRatio } as CSSProperties}>
      <CameraImagePlane />
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
