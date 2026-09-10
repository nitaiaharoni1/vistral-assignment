import { useEffect, useRef } from "react";
import { observer } from "mobx-react-lite";
import { useGameStore } from "../../stores/game/helpers/game.helpers";
import {
  cameraFrameSlotClass,
  cameraPanelLive,
  cameraPanelWelcome,
  welcomeArtSlotClass,
} from "./camera-workspace.classes";
import { CameraFooter } from "./subcomponents/camera-footer/CameraFooter.component";
import { CameraStage } from "./subcomponents/camera-stage/CameraStage.component";
import { WelcomePanel } from "./subcomponents/welcome-panel/WelcomePanel.component";

type CameraWorkspaceProps = {
  onNewGame: () => void;
};

export const CameraWorkspace = observer(function CameraWorkspace({
  onNewGame,
}: CameraWorkspaceProps) {
  const game = useGameStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const pauseRef = useRef<HTMLButtonElement>(null);
  const wasBlocked = useRef(false);
  useEffect(() => {
    if (!game.blocked && wasBlocked.current)
      pauseRef.current?.focus({ preventScroll: true });
    wasBlocked.current = game.blocked;
  }, [game.blocked]);
  return (
    <section
      className={game.welcome ? cameraPanelWelcome : cameraPanelLive}
      aria-label="Camera workspace"
    >
      <WelcomePanel fileRef={fileRef} />
      <div
        className={game.welcome ? welcomeArtSlotClass : cameraFrameSlotClass}
      >
        <CameraStage
          resumeRef={resumeRef}
          pauseRef={pauseRef}
          onNewGame={onNewGame}
        />
      </div>
      <input
        ref={fileRef}
        hidden
        disabled={!game.canLoadVideo}
        type="file"
        accept="video/*"
        aria-label="Load a video file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file && game.canLoadVideo) void game.openVideo(file);
          event.target.value = "";
        }}
      />
      <CameraFooter />
    </section>
  );
});
