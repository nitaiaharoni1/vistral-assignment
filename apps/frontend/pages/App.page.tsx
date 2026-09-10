import { useEffect } from "react";
import { useLayoutEffect } from "react";
import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { CameraWorkspace } from "../components/camera-workspace/CameraWorkspace.component";
import { GameSidebar } from "../components/game-sidebar/GameSidebar.component";
import { BoardCorrection } from "../components/board-correction/BoardCorrection.component";
import { ResetDialog } from "../components/reset-dialog/ResetDialog.component";
import { SaveNotice } from "../components/save-notice/SaveNotice.component";
import { SiteHeader } from "../components/site-header/SiteHeader.component";
import { GameStoreProvider } from "../stores/game/helpers/game.helpers";
import { useCreateGameStore } from "../stores/game/helpers/game.helpers";
import { useGameStore } from "../stores/game/helpers/game.helpers";
import { Tutorial } from "../components/tutorial/Tutorial.component";
import { AppStore } from "../stores/app.store";
import { saveFile } from "../stores/app.store";
import type { SaveSessionFile } from "../stores/app.store";
import { cn } from "../components/shared/cn/cn";

const skipLinkClass = "fixed top-2 left-2 z-50 min-h-11 bg-paper px-5 py-3 -translate-y-[160%] hover:bg-accent-wash hover:text-accent focus:translate-y-0";

const welcomeViewportClass = "max-[600px]:flex max-[600px]:h-[calc(100svh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] max-[600px]:flex-col";

const gameViewportClass = "game-viewport relative flex h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] flex-col overflow-hidden";

const appShellClass = cn(
  "mx-auto max-w-[1376px] px-12 pt-[22px] pb-8",
  "min-[1600px]:pt-9 max-[1150px]:px-8 max-[800px]:px-6 max-[800px]:pt-[18px] max-[800px]:pb-7",
  "max-[600px]:min-h-0 max-[600px]:w-full max-[600px]:flex-1 max-[600px]:px-5 max-[600px]:pt-2 max-[600px]:pb-4",
  "short-landscape:pt-2",
);

const gameMainClass = cn("mx-auto flex min-h-0 w-full max-w-[1376px] flex-1 flex-col gap-2 px-4 pt-2 pb-2", "max-[600px]:px-2");

const welcomeWorkspaceClass = "min-h-0 min-w-0 max-[600px]:h-full";
const gameWorkspaceClass = "min-h-0 flex-1";

// Lays out the skip link, header, workspace, sidebar, and dialogs.
const AppChrome = observer(function AppChrome({ app }: { app: AppStore }) {
  const game = useGameStore();
  return (
    <>
      <div className={game.welcome ? welcomeViewportClass : gameViewportClass}>
        <a href="#main" className={skipLinkClass}>
          Skip to game
        </a>
        <SiteHeader compact={!game.welcome} onOpenTutorial={app.openTutorial} voiceOn={app.voiceOn} onToggleVoice={app.toggleVoice} />
        <main id="main" className={game.welcome ? appShellClass : gameMainClass}>
          <div className={game.welcome ? welcomeWorkspaceClass : gameWorkspaceClass}>
            <CameraWorkspace onNewGame={app.requestNewGame} />
          </div>
          <div hidden={!game.inGame}>
            <GameSidebar onExport={app.exportSession} />
          </div>
          <SaveNotice notice={app.notice} onDismiss={app.dismissNotice} />
        </main>
      </div>
      <Tutorial open={app.tutorialOpen} onClose={app.closeTutorial} onFinish={app.finishTutorial} paperVideoSrc="/tutorial-game-detected.mp4" />
      <BoardCorrection />
      <ResetDialog open={app.resetOpen} onKeepPlaying={app.keepPlaying} onRestart={app.restart} />
    </>
  );
});

// Creates the app store and mounts the chrome.
const App = observer(function App({ saveSessionFile = saveFile }: { saveSessionFile?: SaveSessionFile }) {
  const game = useCreateGameStore();
  const app = useMemo(() => new AppStore(game, saveSessionFile), [game, saveSessionFile]);

  useEffect(() => app.startVoice(), [app]);

  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [game.stage]);

  useEffect(() => {
    if (!game.hasUnsavedGame) return;
    // Blocks the tab from closing while a game is unsaved.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [game.hasUnsavedGame]);

  return (
    <GameStoreProvider store={game}>
      <AppChrome app={app} />
    </GameStoreProvider>
  );
});

export default App;
